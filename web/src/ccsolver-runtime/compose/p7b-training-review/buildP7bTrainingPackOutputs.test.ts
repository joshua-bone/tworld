import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type BlobReferenceV1 } from "@tworld/ccsolver/domain";
import { TIME_NIL } from "@content/api/score";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseP7bBrowserReplayAsset,
  parseP7bReplayBrowserManifest,
} from "@player-web/impl/p7b-training-replays/p7bReplayBrowserRuntime";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import type { P7GeneratedEvidenceBundleV1 } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
} from "../p7b-training/portableReplayProfile";
import {
  P7B_SHARED_PLAYER_DIST_ENTRY,
  P7B_SHARED_PLAYER_LEVEL_HREF,
  buildP7bTrainingPackOutputs,
  type P7bTrainingPackBuildInput,
} from "./buildP7bTrainingPackOutputs";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  buildP7SharedPlayerGraphAttestation,
} from "./p7SharedPlayerGraphAttestation";
import {
  canonicalizeP7TrainingPackProofIndex,
  parseP7TrainingPackProofIndex,
} from "./p7TrainingPackProofIndex";
import { attestP7bTrainingPackOutputs } from "./p7bTrainingPackIo";

const sha256 = new WebCryptoSha256();
const encoder = new TextEncoder();

async function ref(bytes: Uint8Array): Promise<BlobReferenceV1> {
  return referenceSourceBytes(bytes, sha256);
}

const evidence = (character: string): BlobReferenceV1 => ({
  digest: `sha256:${character.repeat(64)}`,
  byteLength: 100,
});

const segmentSelection = (character: string) => ({
  policyRevision: "semantic-route-chapters-max-24-v1" as const,
  selectionMode: "viewable-route-chapters" as const,
  candidateCount: 1,
  selectedCandidateOrdinals: [0],
  omittedCandidateCount: 0,
  targetTranscript: {
    algorithm: "sha256" as const,
    canonicalization: "tworld-canonical-json-v1" as const,
    digest: `sha256:${character.repeat(64)}` as const,
    byteLength: 100,
  },
  semanticTranscript: {
    algorithm: "sha256" as const,
    canonicalization: "tworld-canonical-json-v1" as const,
    digest: `sha256:${character.repeat(64)}` as const,
    byteLength: 100,
  },
});

function evidenceBundle(scopeId: string): P7GeneratedEvidenceBundleV1 {
  return {
    artifact: "ccsolver-p7-generated-evidence-bundle",
    version: 1,
    scopeId,
    limits: {
      maximumBlobCount: 20_000,
      maximumBlobBytes: 16 * 1024 * 1024,
      maximumTotalBytes: 512 * 1024 * 1024,
    },
    totals: { blobCount: 0, byteLength: 0 },
    blobs: [],
  };
}

async function addJsonEvidence(
  bundle: P7GeneratedEvidenceBundleV1,
  label: string,
): Promise<BlobReferenceV1> {
  const bytes = encoder.encode(canonicalizeJson({ artifact: "fixture-evidence", label }));
  const content = await ref(bytes);
  (bundle.blobs as { content: BlobReferenceV1; mediaType: "application/json"; bytes: Uint8Array }[])
    .push({ content, mediaType: "application/json", bytes });
  (bundle.totals as { blobCount: number; byteLength: number }).blobCount += 1;
  (bundle.totals as { blobCount: number; byteLength: number }).byteLength += bytes.byteLength;
  return content;
}

async function addExistingEvidence(
  bundle: P7GeneratedEvidenceBundleV1,
  bytes: Uint8Array,
  mediaType: "application/json" | "application/octet-stream",
): Promise<BlobReferenceV1> {
  const content = await ref(bytes);
  (bundle.blobs as { content: BlobReferenceV1; mediaType: typeof mediaType; bytes: Uint8Array }[])
    .push({ content, mediaType, bytes: new Uint8Array(bytes) });
  (bundle.totals as { blobCount: number; byteLength: number }).blobCount += 1;
  (bundle.totals as { blobCount: number; byteLength: number }).byteLength += bytes.byteLength;
  return content;
}

function displayLevel(levelNumber: number, name: string) {
  return {
    index: levelNumber - 1,
    number: levelNumber,
    name,
    author: "Fixture author",
    password: "QWER",
    timeLimitSeconds: 100,
    chipsRequired: 0,
    bestTimeTicks: 1,
    levelSize: 3,
    solutionSize: 4,
    levelHash: "fixture-level-hash",
    gameplayHash: "fixture-gameplay-hash",
    hasSolution: true,
    sgflags: 0,
    unsolvable: null,
  };
}

async function sharedPlayerFixture(
  source = "export const player = true;\n",
): Promise<P7bTrainingPackBuildInput["sharedPlayer"]> {
  const sourceBytes = encoder.encode(source);
  const graphAttestation = await buildP7SharedPlayerGraphAttestation({
    sourceEntryBytes: sourceBytes,
    sourceClosureRevision: "git-tree:fixture-player-source-v1",
    toolchainRevision: "vite@fixture|typescript@fixture",
    viteManifestBytes: encoder.encode(canonicalizeJson({
      "src/bootstrap/browser/p7bReplayPlayer.tsx": {
        file: P7B_SHARED_PLAYER_DIST_ENTRY,
        isEntry: true,
        src: "src/bootstrap/browser/p7bReplayPlayer.tsx",
      },
    })),
    builtFiles: [{
      path: P7B_SHARED_PLAYER_DIST_ENTRY,
      bytes: sourceBytes,
    }],
    sha256,
  });
  return {
    graphAttestationPath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    graphAttestation,
  };
}

function proofSourceFixture() {
  return {
    externalFiles: [{
      path: "sets/fixture.dat",
      bytes: Uint8Array.of(10, 11, 12, 20, 21, 22),
    }, {
      path: "solutions/fixture.tws",
      bytes: Uint8Array.of(99, 1, 2, 3, 4, 100),
    }],
    extractEntryOrdinal: ({ sourceBytes }: { readonly sourceBytes: Uint8Array }) => (
      sourceBytes.slice(1, 5)
    ),
  };
}

async function fixture(): Promise<P7bTrainingPackBuildInput> {
  const packEvidence = evidenceBundle("fixture-pack/shared");
  const levelOneEvidence = evidenceBundle("fixture-pack/001");
  const levelTwoEvidence = evidenceBundle("fixture-pack/002");
  const rawReplayBytes = Uint8Array.of(1, 2, 3, 4);
  const sourceOne = Uint8Array.of(10, 11, 12);
  const sourceTwo = Uint8Array.of(20, 21, 22);
  const mapContainerBytes = Uint8Array.of(...sourceOne, ...sourceTwo);
  const replayContainerBytes = Uint8Array.of(99, ...rawReplayBytes, 100);
  const [rawReplayContent, sourceOneContent, sourceTwoContent, mapContainerContent,
    replayContainerContent] = await Promise.all([
    ref(rawReplayBytes),
    ref(sourceOne),
    ref(sourceTwo),
    ref(mapContainerBytes),
    ref(replayContainerBytes),
  ]);
  const [eligibilityOne, certificationEvidence, parityEvidence, startBoundaryEvidence,
    endBoundaryEvidence, eligibilityTwo] = await Promise.all([
    addJsonEvidence(levelOneEvidence, "level-1-eligibility"),
    addJsonEvidence(levelOneEvidence, "raw-ms-certification"),
    addJsonEvidence(levelOneEvidence, "raw-ms-browser-parity"),
    addJsonEvidence(levelOneEvidence, "raw-ms-start-boundary"),
    addJsonEvidence(levelOneEvidence, "raw-ms-end-boundary"),
    addJsonEvidence(levelTwoEvidence, "level-2-eligibility"),
  ]);
  await addExistingEvidence(levelOneEvidence, rawReplayBytes, "application/octet-stream");
  const rawBrowserReplay = {
    artifact: "ccsolver-p7b-browser-replay" as const,
    version: 1 as const,
    transport: "native-replay-pulses" as const,
    variantId: "raw-ms",
    target: "ms" as const,
    sourceReplayContent: rawReplayContent,
    nativeTickRateHz: 20,
    terminalNativeTick: 1,
    initialization: {
      flags: 0,
      randomSeed: 0,
      randomSlideDirection: 1,
      stepping: 0,
      bestTimeTicks: 1,
    },
    decisions: [{ ordinal: 0, nativeTick: 0, encodedWhen: 0, inputCode: 1, modifierMask: 0 }],
  };
  const rawBrowserContent = await ref(new TextEncoder().encode(canonicalizeJson(rawBrowserReplay)));
  await addExistingEvidence(
    levelOneEvidence,
    encoder.encode(canonicalizeJson(rawBrowserReplay)),
    "application/json",
  );
  const complete = buildP7bTrainingReplayLevel({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "fixture-pack",
      levelNumber: 1,
      title: "Replay ready",
      normalizedGameplaySha256: "1".repeat(64),
      levelContent: sourceOneContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: "fixture-standard-only-v1",
        evidence: eligibilityOne,
      },
    },
    donorCoverage: {
      ms: { status: "bound", rawDonorId: "official-ms", detail: "official replay" },
      lynx: { status: "missing", rawDonorId: null, detail: "no donor" },
    },
    rawDonors: [{
      donorId: "official-ms",
      target: "ms",
      origin: "official-pack",
      sourcePackId: "fixture-pack",
      sourceLevelNumber: 1,
      sourceNormalizedGameplaySha256: "1".repeat(64),
      sourceLevelContent: sourceOneContent,
      replayContent: rawReplayContent,
      mapRelationship: "official-map",
      mapComparisonEvidence: null,
    }],
    variants: [{
      variantId: "raw-ms",
      kind: "raw",
      replayContent: rawReplayContent,
      decisionCount: 2,
      portableProfile: null,
      lineage: {
        kind: "raw-donor",
        rawDonorId: "official-ms",
        sourceVariantId: null,
        evidence: null,
      },
      portability: "target-specific",
      transforms: [],
      segments: [{
        segmentId: "finish",
        index: 0,
        label: "Finish",
        anchor: { kind: "exit", label: "Enter exit" },
      }],
      certifications: {
        ms: {
          status: "certified",
          outcome: "won",
          evidence: certificationEvidence,
          terminalNativeTick: 1,
          detail: "fixture win",
          segmentSelection: segmentSelection("7"),
          execution: {
            status: "native",
            decisionProfile: {
              profileId: "native-ms-tws-v1",
              profileRevision: "fixture-native-ms-v1",
              clockBasis: "native-tick",
              cadenceHz: 20,
              profileContent: null,
            },
            executedDecisionCount: 1,
            nativeBoundaryClock: "exclusive-advance-count-v1",
            nativeTickRateHz: 20,
            replayContent: rawReplayContent,
            browserReplayContent: rawBrowserContent,
            browserReplayParityReceipt: parityEvidence,
            browserReplayTransport: "native-replay-pulses",
            compilerRevision: null,
            compilationReceipt: null,
            detail: "immutable native replay",
          },
          segmentSpans: [{
            segmentId: "finish",
            index: 0,
            startNativeTick: 0,
            endNativeTick: 1,
            startDecisionOrdinal: null,
            endDecisionOrdinal: null,
            startBoundaryEvidence,
            endBoundaryEvidence,
          }],
        },
        lynx: {
          status: "unavailable",
          outcome: "unsupported",
          evidence: null,
          terminalNativeTick: null,
          detail: "no Lynx execution",
          segmentSelection: null,
          execution: {
            status: "unavailable",
            decisionProfile: null,
            executedDecisionCount: null,
            nativeBoundaryClock: null,
            nativeTickRateHz: null,
            replayContent: null,
            browserReplayContent: null,
            browserReplayParityReceipt: null,
            browserReplayTransport: null,
            compilerRevision: null,
            compilationReceipt: null,
            detail: "no Lynx execution",
          },
          segmentSpans: [],
        },
      },
    }],
    processing: { status: "complete", detail: "native replay processed" },
    viewableVariantId: "raw-ms",
  });
  const blocked = buildP7bTrainingReplayLevel({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "fixture-pack",
      levelNumber: 2,
      title: "Missing replay",
      normalizedGameplaySha256: "6".repeat(64),
      levelContent: sourceTwoContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: "fixture-standard-only-v1",
        evidence: eligibilityTwo,
      },
    },
    donorCoverage: {
      ms: { status: "missing", rawDonorId: null, detail: "no donor" },
      lynx: { status: "missing", rawDonorId: null, detail: "no donor" },
    },
    rawDonors: [],
    variants: [],
    processing: { status: "blocked", detail: "no donor replay is available" },
    viewableVariantId: null,
  });
  return {
    pack: {
      packId: "fixture-pack",
      title: "Fixture training pack",
      expectedLevelCount: 2,
    },
    inventory: [complete, blocked],
    processedLevels: [{
      levelNumber: 1,
      browserTargets: {
        ms: {
          request: { seriesFile: "fixture-ms.dac", levelNumber: 1, ruleset: "MS" },
          display: {
            seriesName: "Fixture MS",
            mapFilename: "fixture.dat",
            level: displayLevel(1, "Replay ready"),
          },
        },
        lynx: {
          request: { seriesFile: "fixture-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
          display: {
            seriesName: "Fixture Lynx",
            mapFilename: "fixture.dat",
            level: displayLevel(1, "Replay ready"),
          },
        },
      },
      rawDonorBytes: [{ donorId: "official-ms", bytes: rawReplayBytes }],
      browserReplays: [{
        variantId: "raw-ms",
        target: "ms",
        replay: rawBrowserReplay,
      }],
      variantPayloads: [],
    }],
    sharedPlayer: await sharedPlayerFixture(),
    portableProfilePayload: null,
    proof: {
      packContent: mapContainerContent,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: "fixture-producer-v1",
      externalInputs: [{
        path: "sets/fixture.dat",
        kind: "official-map",
        content: mapContainerContent,
      }, {
        path: "solutions/fixture.tws",
        kind: "official-replay-container",
        content: replayContainerContent,
      }],
      derivedSources: [{
        kind: "official-level-source",
        content: sourceOneContent,
        sourceContent: mapContainerContent,
        sourcePath: "sets/fixture.dat",
        locator: { kind: "byte-range", byteOffset: 0, byteLength: sourceOne.byteLength },
        extractorRevision: "dat-level-byte-range-v1",
        retainedPath: null,
        levelNumber: 1,
        variantId: null,
        target: null,
      }, {
        kind: "official-level-source",
        content: sourceTwoContent,
        sourceContent: mapContainerContent,
        sourcePath: "sets/fixture.dat",
        locator: {
          kind: "byte-range",
          byteOffset: sourceOne.byteLength,
          byteLength: sourceTwo.byteLength,
        },
        extractorRevision: "dat-level-byte-range-v1",
        retainedPath: null,
        levelNumber: 2,
        variantId: null,
        target: null,
      }, {
        kind: "donor-replay-entry",
        content: rawReplayContent,
        sourceContent: replayContainerContent,
        sourcePath: "solutions/fixture.tws",
        locator: { kind: "entry-ordinal", entryOrdinal: 0 },
        extractorRevision: "tws-solution-entry-v1",
        retainedPath:
          "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/raw/00-ms.tws-entry.bin",
        levelNumber: 1,
        variantId: "raw-ms",
        target: "ms",
      }],
      generatedEvidence: {
        pack: packEvidence,
        levels: [{ occurrenceId: "fixture-001", levelNumber: 1, bundle: levelOneEvidence }, {
          occurrenceId: "fixture-002",
          levelNumber: 2,
          bundle: levelTwoEvidence,
        }],
      },
    },
    sha256,
  };
}

async function portableFixture(): Promise<P7bTrainingPackBuildInput> {
  const input = await fixture();
  const packEvidence = input.proof.generatedEvidence.pack;
  const levelEvidence = input.proof.generatedEvidence.levels[0]!.bundle;
  const trace = {
    artifact: "ccsolver-p7b-portable-decision-trace",
    version: 1,
    profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
    terminalLogicStep: 2,
    changes: [{ logicStep: 0, packet: { primary: "east", secondary: "none" } }, {
      logicStep: 2,
      packet: { primary: "none", secondary: "none" },
    }],
  } as const;
  const traceBytes = new TextEncoder().encode(canonicalizeJson(trace));
  const profileBytes = new TextEncoder().encode(canonicalizeJson(
    P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  ));
  const [traceContent, profileContent, msCompiled, lynxCompiled] = await Promise.all([
    ref(traceBytes),
    ref(profileBytes),
    ref(Uint8Array.of(31, 32)),
    ref(Uint8Array.of(41, 42)),
  ]);
  await Promise.all([
    addExistingEvidence(levelEvidence, traceBytes, "application/json"),
    addExistingEvidence(packEvidence, profileBytes, "application/json"),
    addExistingEvidence(levelEvidence, Uint8Array.of(31, 32), "application/octet-stream"),
    addExistingEvidence(levelEvidence, Uint8Array.of(41, 42), "application/octet-stream"),
  ]);
  const [lineageEvidence, transformEvidence, msCertificationEvidence,
    lynxCertificationEvidence, msParityEvidence, lynxParityEvidence,
    msCompilationEvidence, lynxCompilationEvidence, portableStartBoundary,
    msEndBoundary, lynxEndBoundary] = await Promise.all([
    addJsonEvidence(levelEvidence, "portable-lineage"),
    addJsonEvidence(levelEvidence, "portable-transform"),
    addJsonEvidence(levelEvidence, "portable-ms-certification"),
    addJsonEvidence(levelEvidence, "portable-lynx-certification"),
    addJsonEvidence(levelEvidence, "portable-ms-browser-parity"),
    addJsonEvidence(levelEvidence, "portable-lynx-browser-parity"),
    addJsonEvidence(levelEvidence, "portable-ms-compilation"),
    addJsonEvidence(levelEvidence, "portable-lynx-compilation"),
    addJsonEvidence(levelEvidence, "portable-start-boundary"),
    addJsonEvidence(levelEvidence, "portable-ms-end-boundary"),
    addJsonEvidence(levelEvidence, "portable-lynx-end-boundary"),
  ]);
  const browserEnvelope = (target: "ms" | "lynx", sourceReplayContent: BlobReferenceV1) => ({
    artifact: "ccsolver-p7b-browser-replay" as const,
    version: 1 as const,
    transport: "manual-held-schedule" as const,
    variantId: "portable",
    target,
    sourceReplayContent,
    nativeTickRateHz: 20,
    terminalNativeTick: 4,
    initialization: {
      flags: 0,
      randomSeed: 0,
      randomSlideDirection: 1,
      stepping: 0,
      bestTimeTicks: 4,
    },
    changes: [
      { ordinal: 0, nativeTick: 0, inputCode: 8, modifierMask: 0 },
      { ordinal: 1, nativeTick: 2, inputCode: 0, modifierMask: 0 },
    ],
  });
  const msBrowserReplay = browserEnvelope("ms", msCompiled);
  const lynxBrowserReplay = browserEnvelope("lynx", lynxCompiled);
  const [msBrowserContent, lynxBrowserContent] = await Promise.all([
    ref(new TextEncoder().encode(canonicalizeJson(msBrowserReplay))),
    ref(new TextEncoder().encode(canonicalizeJson(lynxBrowserReplay))),
  ]);
  await Promise.all([
    addExistingEvidence(
      levelEvidence,
      encoder.encode(canonicalizeJson(msBrowserReplay)),
      "application/json",
    ),
    addExistingEvidence(
      levelEvidence,
      encoder.encode(canonicalizeJson(lynxBrowserReplay)),
      "application/json",
    ),
  ]);
  const complete = input.inventory[0]!;
  const portable = {
    variantId: "portable",
    kind: "portable",
    replayContent: traceContent,
    decisionCount: 2,
    portableProfile: {
      profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
      profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
      profileContent,
      decisionTraceContent: traceContent,
      changeCount: 2,
      terminalLogicStep: 2,
    },
    lineage: {
      kind: "normalized-donor",
      rawDonorId: "official-ms",
      sourceVariantId: "raw-ms",
      evidence: lineageEvidence,
    },
    portability: "portable",
    transforms: [{
      ordinal: 0,
      kind: "decision-boundary-rescheduled",
      source: { startDecision: 0, endDecision: 1 },
      output: { startDecision: 0, endDecision: 2 },
      reason: "normalize the fixture pulse to a held portable packet",
      evidence: transformEvidence,
    }],
    segments: complete.variants[0]!.segments,
    certifications: Object.fromEntries((["ms", "lynx"] as const).map((target) => {
      const replayContent = target === "ms" ? msCompiled : lynxCompiled;
      return [target, {
        status: "certified",
        outcome: "won",
        evidence: target === "ms" ? msCertificationEvidence : lynxCertificationEvidence,
        terminalNativeTick: 4,
        detail: `portable fixture won on ${target}`,
        segmentSelection: segmentSelection(target === "ms" ? "8" : "9"),
        execution: {
          status: "compiled",
          decisionProfile: {
            profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
            profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
            clockBasis: "portable-decision",
            cadenceHz: 10,
            profileContent,
          },
          executedDecisionCount: 2,
          nativeBoundaryClock: "exclusive-advance-count-v1",
          nativeTickRateHz: 20,
          replayContent,
          browserReplayContent: target === "ms" ? msBrowserContent : lynxBrowserContent,
          browserReplayParityReceipt: target === "ms" ? msParityEvidence : lynxParityEvidence,
          browserReplayTransport: "manual-held-schedule",
          compilerRevision: `fixture-portable-to-${target}-v1`,
          compilationReceipt: target === "ms" ? msCompilationEvidence : lynxCompilationEvidence,
          detail: "two native ticks per held portable packet",
        },
        segmentSpans: [{
          segmentId: "finish",
          index: 0,
          startNativeTick: 0,
          endNativeTick: 4,
          startDecisionOrdinal: 0,
          endDecisionOrdinal: 2,
          startBoundaryEvidence: portableStartBoundary,
          endBoundaryEvidence: target === "ms" ? msEndBoundary : lynxEndBoundary,
        }],
      }];
    })),
  };
  input.inventory = [buildP7bTrainingReplayLevel({
    ...complete,
    variants: [...complete.variants, portable],
    viewableVariantId: "portable",
  }), ...input.inventory.slice(1)];
  const processed = input.processedLevels[0]!;
  Object.assign(processed, {
    browserReplays: [
      ...processed.browserReplays,
      { variantId: "portable", target: "ms", replay: msBrowserReplay },
      { variantId: "portable", target: "lynx", replay: lynxBrowserReplay },
    ],
    variantPayloads: [{ variantId: "portable", kind: "portable-decision-trace", bytes: traceBytes }],
  });
  Object.assign(input, { portableProfilePayload: { bytes: profileBytes } });
  return input;
}

function removeEvidenceReferences(
  bundle: P7GeneratedEvidenceBundleV1,
  references: readonly BlobReferenceV1[],
): void {
  const keys = new Set(references.map(({ digest, byteLength }) => `${digest}/${byteLength}`));
  const blobs = bundle.blobs.filter(({ content }) => (
    !keys.has(`${content.digest}/${content.byteLength}`)
  ));
  Object.assign(bundle, {
    blobs,
    totals: {
      blobCount: blobs.length,
      byteLength: blobs.reduce((sum, { bytes }) => sum + bytes.byteLength, 0),
    },
  });
}

async function portableWithFailedLynxFixture(): Promise<P7bTrainingPackBuildInput> {
  const input = await portableFixture();
  const level = structuredClone(input.inventory[0]!) as unknown as Record<string, unknown>;
  const portable = (level.variants as Record<string, unknown>[])[1]!;
  portable.portability = "target-specific";
  const certification = (portable.certifications as Record<string, Record<string, unknown>>)
    .lynx!;
  const execution = certification.execution as Record<string, unknown>;
  const segmentSpans = certification.segmentSpans as Array<{
    readonly endBoundaryEvidence: BlobReferenceV1;
  }>;
  const removed = [
    execution.browserReplayContent,
    execution.browserReplayParityReceipt,
    ...segmentSpans.map(({ endBoundaryEvidence }) => endBoundaryEvidence),
  ].filter((reference): reference is BlobReferenceV1 => reference !== null);
  certification.status = "failed";
  certification.outcome = "loss";
  certification.detail = "portable fixture lost on lynx; retained as execution evidence only";
  certification.segmentSelection = {
    ...(certification.segmentSelection as Record<string, unknown>),
    selectionMode: "unviewable",
    selectedCandidateOrdinals: [],
    omittedCandidateCount: 1,
  };
  certification.segmentSpans = [];
  execution.browserReplayContent = null;
  execution.browserReplayParityReceipt = null;
  execution.browserReplayTransport = null;
  input.inventory = [
    buildP7bTrainingReplayLevel(level),
    ...input.inventory.slice(1),
  ];
  Object.assign(input.processedLevels[0]!, {
    browserReplays: input.processedLevels[0]!.browserReplays.filter(
      ({ variantId, target }) => variantId !== "portable" || target !== "lynx",
    ),
  });
  removeEvidenceReferences(input.proof.generatedEvidence.levels[0]!.bundle, removed);
  return input;
}

describe("the scalable P7B training pack checked leaf", () => {
  it("preserves the catalog no-best-time sentinel in browser target metadata", async () => {
    const input = await fixture();
    input.processedLevels[0]!.browserTargets.ms.display.level.bestTimeTicks = TIME_NIL;
    input.processedLevels[0]!.browserTargets.lynx.display.level.bestTimeTicks = TIME_NIL;

    const built = await buildP7bTrainingPackOutputs(input);
    const browserOutput = built.outputs.find(({ path }) => (
      path.endsWith("/levels/001/browser.json")
    ))!;
    const browser = JSON.parse(new TextDecoder().decode(browserOutput.content)) as {
      readonly targets: Record<"ms" | "lynx", {
        readonly display: { readonly level: { readonly bestTimeTicks: number } };
      }>;
    };
    expect(browser.targets.ms.display.level.bestTimeTicks).toBe(TIME_NIL);
    expect(browser.targets.lynx.display.level.bestTimeTicks).toBe(TIME_NIL);
    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      built.outputs,
      proofSourceFixture(),
    )).resolves.toMatchObject({ manifest: { pack: { packId: "fixture-pack" } } });

    const driftedOutputs = built.outputs.map((output) => ({
      ...output,
      content: new Uint8Array(output.content),
    }));
    const driftedBrowserOutput = driftedOutputs.find(({ path }) => (
      path.endsWith("/levels/001/browser.json")
    ))!;
    const driftedBrowser = JSON.parse(new TextDecoder().decode(driftedBrowserOutput.content));
    driftedBrowser.targets.ms.display.level.bestTimeTicks = TIME_NIL + 1;
    driftedBrowserOutput.content = encoder.encode(canonicalizeJson(driftedBrowser));
    const manifestOutput = driftedOutputs.find(({ path }) => path.endsWith("/manifest.json"))!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
    manifest.files.find((file: { path: string }) => (
      file.path === driftedBrowserOutput.path
    )).content = await ref(driftedBrowserOutput.content);
    manifestOutput.content = encoder.encode(canonicalizeJson(manifest));

    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      driftedOutputs,
      proofSourceFixture(),
    )).rejects.toThrow("ms browser best time is out of bounds");
  });

  it("retains failed execution evidence without publishing a failed browser replay", async () => {
    const input = await portableWithFailedLynxFixture();
    const built = await buildP7bTrainingPackOutputs(input);
    expect(built.manifest.levels[0]).toMatchObject({ replayFileCount: 2 });
    expect(built.outputs.some(({ path }) => path.endsWith("/replays/01-lynx.json"))).toBe(false);
    const contractOutput = built.outputs.find(({ path }) => (
      path.endsWith("/levels/001/contract.json")
    ))!;
    const contract = JSON.parse(new TextDecoder().decode(contractOutput.content)) as {
      readonly variants: readonly {
        readonly variantId: string;
        readonly certifications: {
          readonly lynx: {
            readonly status: string;
            readonly detail: string;
            readonly execution: {
              readonly replayContent: BlobReferenceV1 | null;
              readonly browserReplayContent: BlobReferenceV1 | null;
            };
          };
        };
      }[];
    };
    expect(contract.variants.find(({ variantId }) => variantId === "portable")!
      .certifications.lynx).toMatchObject({
        status: "failed",
        detail: "portable fixture lost on lynx; retained as execution evidence only",
        execution: {
          replayContent: expect.any(Object),
          browserReplayContent: null,
        },
      });

    const injected = await portableWithFailedLynxFixture();
    const original = await portableFixture();
    Object.assign(injected.processedLevels[0]!, {
      browserReplays: [
        ...injected.processedLevels[0]!.browserReplays,
        original.processedLevels[0]!.browserReplays.find(({ variantId, target }) => (
          variantId === "portable" && target === "lynx"
        ))!,
      ],
    });
    await expect(buildP7bTrainingPackOutputs(injected)).rejects.toThrow(
      "browser replay set is incomplete",
    );
  });

  it("keeps graph-independent execution bytes stable across a shared-player presentation change", async () => {
    const firstInput = await fixture();
    const secondInput = await fixture();
    Object.assign(secondInput, {
      sharedPlayer: await sharedPlayerFixture("export const player = 'changed';\n"),
    });
    const [first, second] = await Promise.all([
      buildP7bTrainingPackOutputs(firstInput),
      buildP7bTrainingPackOutputs(secondInput),
    ]);
    const bytes = (built: Awaited<ReturnType<typeof buildP7bTrainingPackOutputs>>, suffix: string) => (
      new TextDecoder().decode(built.outputs.find(({ path }) => path.endsWith(suffix))!.content)
    );

    expect(bytes(second, "/execution-index.json")).toBe(bytes(first, "/execution-index.json"));
    expect(bytes(second, "/levels/001/browser.json"))
      .not.toBe(bytes(first, "/levels/001/browser.json"));
    expect(bytes(second, "/manifest.json")).not.toBe(bytes(first, "/manifest.json"));
  });

  it("changes graph-independent authority when an execution target seed changes", async () => {
    const firstInput = await fixture();
    const secondInput = await fixture();
    secondInput.processedLevels[0]!.browserTargets.ms.request.randomSeed = 42;
    const [first, second] = await Promise.all([
      buildP7bTrainingPackOutputs(firstInput),
      buildP7bTrainingPackOutputs(secondInput),
    ]);
    const execution = (built: Awaited<ReturnType<typeof buildP7bTrainingPackOutputs>>) => (
      new TextDecoder().decode(
        built.outputs.find(({ path }) => path.endsWith("/execution-index.json"))!.content,
      )
    );

    expect(execution(second)).not.toBe(execution(first));
  });

  it("builds an exact compact two-level leaf with one processed and one blocked row", async () => {
    const built = await buildP7bTrainingPackOutputs(await fixture());

    const paths = built.outputs.map(({ path }) => path);
    expect(paths.filter((path) => path.includes("/evidence/"))).toEqual([
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/evidence/index.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/evidence/payload.bin",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/002/evidence/index.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/002/evidence/payload.bin",
    ]);
    expect(paths.filter((path) => !path.includes("/evidence/"))).toEqual([
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/browser.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/execution-index.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/index.html",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/browser.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/contract.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/index.html",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/raw/00-ms.tws-entry.bin",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/replays/00-ms.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/002/contract.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/002/index.html",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/manifest.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/pack-summary.json",
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/proof-index.json",
    ]);
    expect(built.manifest.pack).toEqual({
      packId: "fixture-pack",
      title: "Fixture training pack",
      expectedLevelCount: 2,
    });
    expect(built.manifest.levels.map(({ levelNumber, status }) => ({ levelNumber, status })))
      .toEqual([
        { levelNumber: 1, status: "complete" },
        { levelNumber: 2, status: "blocked" },
      ]);
    expect(built.manifest.files).toHaveLength(built.outputs.length - 1);
    expect(built.manifest.proofIndex.path).toBe(
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/proof-index.json",
    );
    expect(built.manifestContent.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it("keeps every inventory row visible while emitting assets only for injected processing", async () => {
    const built = await buildP7bTrainingPackOutputs(await fixture());
    const browser = JSON.parse(new TextDecoder().decode(
      built.outputs.find(({ path }) => path.endsWith("/browser.json"))!.content,
    ));
    const levelBrowsers = built.outputs.filter(({ path }) => /levels\/\d+\/browser\.json$/u.test(path));

    expect(browser.levels).toEqual([
      expect.objectContaining({ levelNumber: 1, status: "complete", processedTargetCount: 2 }),
      expect.objectContaining({ levelNumber: 2, status: "blocked", processedTargetCount: 0 }),
    ]);
    expect(levelBrowsers).toHaveLength(1);
    const expectedPlayerHref = `${P7B_SHARED_PLAYER_LEVEL_HREF}?v=${
      built.manifest.sharedPlayer.entry.content.digest.slice("sha256:".length)
    }`;
    for (const output of levelBrowsers) {
      const levelBrowser = JSON.parse(new TextDecoder().decode(output.content));
      expect(levelBrowser.presentation.playerModuleHref).toBe(expectedPlayerHref);
    }
    expect(built.manifest.sharedPlayer.graphAttestation.path).toBe(
      P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    );
    expect(built.manifest.sharedPlayer.levelPageHref).toBe(expectedPlayerHref);
    expect(new TextDecoder().decode(built.outputs.find(({ path }) => (
      path.endsWith("/levels/001/index.html")
    ))!.content)).toContain(`src="${expectedPlayerHref}"`);
    expect(built.outputs.some(({ path }) => path.endsWith("p7b-replay-player.js"))).toBe(false);
  });

  it("emits the shared player's frozen manifest and replay wrapper without identity ambiguity", async () => {
    const built = await buildP7bTrainingPackOutputs(await fixture());
    const manifestText = new TextDecoder().decode(built.outputs.find(({ path }) => (
      path.endsWith("/levels/001/browser.json")
    ))!.content);
    const replayText = new TextDecoder().decode(built.outputs.find(({ path }) => (
      path.endsWith("/levels/001/replays/00-ms.json")
    ))!.content);

    const manifest = parseP7bReplayBrowserManifest(manifestText);
    expect(manifest.artifact).toBe("ccsolver-p7b-replay-browser-level");
    expect(manifest.presentation.initialSelection).toEqual({
      variant: "raw-ms",
      executionTarget: "ms",
    });
    expect(manifest.presentation.combinations.find(({ variant, executionTarget }) => (
      variant === "raw-ms" && executionTarget === "ms"
    ))).toMatchObject({
      availability: "available",
      authoredDecisionCount: 2,
      executedDecisionCount: 1,
    });
    const contract = JSON.parse(new TextDecoder().decode(
      built.outputs.find(({ path }) => path.endsWith("/levels/001/contract.json"))!.content,
    )) as {
      readonly variants: readonly {
        readonly variantId: string;
        readonly decisionCount: number;
        readonly certifications: { readonly ms: { readonly execution: { readonly executedDecisionCount: number } } };
      }[];
    };
    expect(contract.variants.find(({ variantId }) => variantId === "raw-ms")).toMatchObject({
      decisionCount: 2,
      certifications: { ms: { execution: { executedDecisionCount: 1 } } },
    });
    expect(parseP7bBrowserReplayAsset(replayText, {
      variant: "raw-ms",
      executionTarget: "ms",
    })).toMatchObject({
      transport: "native-replay-pulses",
      decisions: [{ nativeTick: 0, encodedWhen: 0, inputCode: 1 }],
    });
    expect(() => parseP7bBrowserReplayAsset(replayText, {
      variant: "raw-ms",
      executionTarget: "lynx",
    })).toThrow("identity does not match the requested selection");
  });

  it("attests each browser envelope against its contract after manifest rehashing", async () => {
    const built = await buildP7bTrainingPackOutputs(await fixture());
    const proofSources = proofSourceFixture();
    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      built.outputs,
      proofSources,
    )).resolves.toMatchObject({ manifest: { pack: { packId: "fixture-pack" } } });

    const outputs = built.outputs.map((output) => ({
      ...output,
      content: new Uint8Array(output.content),
    }));
    const replay = outputs.find(({ path }) => path.endsWith("/replays/00-ms.json"))!;
    const replayValue = JSON.parse(new TextDecoder().decode(replay.content));
    replayValue.initialization.randomSeed = 123;
    replay.content = new TextEncoder().encode(canonicalizeJson(replayValue));
    const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"))!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
    manifest.files.find((file: { path: string }) => file.path === replay.path).content =
      await ref(replay.content);
    manifestOutput.content = new TextEncoder().encode(canonicalizeJson(manifest));

    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      outputs,
      proofSources,
    )).rejects.toThrow("browser execution binding drifted");
  });

  it("rejects a transplanted execution index whose targets disagree with the browser manifest", async () => {
    const baseInput = await fixture();
    const seededInput = await fixture();
    Object.assign(seededInput.processedLevels[0]!.browserTargets.ms.request, { randomSeed: 42 });
    const [base, seeded] = await Promise.all([
      buildP7bTrainingPackOutputs(baseInput),
      buildP7bTrainingPackOutputs(seededInput),
    ]);
    const outputs = base.outputs.map((output) => ({
      ...output,
      content: new Uint8Array(output.content),
    }));
    const output = (suffix: string) => outputs.find(({ path }) => path.endsWith(suffix))!;
    const transplantedExecution = seeded.outputs.find(({ path }) => (
      path.endsWith("/execution-index.json")
    ))!;
    const executionOutput = output("/execution-index.json");
    executionOutput.content = new Uint8Array(transplantedExecution.content);
    const executionContent = await ref(executionOutput.content);

    const proofOutput = output("/proof-index.json");
    const proof = parseP7TrainingPackProofIndex(new TextDecoder().decode(proofOutput.content));
    const executionDeclaration = proof.generatedBlobs.find(({ kind }) => kind === "execution-index")!;
    const previousExecutionContent = executionDeclaration.content;
    (executionDeclaration as { content: BlobReferenceV1 }).content = executionContent;
    const rootIndex = proof.packReachableRefs.findIndex((reference) => (
      reference.digest === previousExecutionContent.digest
      && reference.byteLength === previousExecutionContent.byteLength
    ));
    expect(rootIndex).toBeGreaterThanOrEqual(0);
    (proof.packReachableRefs as BlobReferenceV1[])[rootIndex] = executionContent;
    proofOutput.content = encoder.encode(canonicalizeP7TrainingPackProofIndex({
      pack: proof.pack,
      externalInputs: proof.externalInputs,
      derivedSources: proof.derivedSources,
      generatedBlobs: proof.generatedBlobs,
      evidenceSidecars: proof.evidenceSidecars,
      levels: proof.levels,
      packReachableRefs: proof.packReachableRefs,
    }));
    const proofContent = await ref(proofOutput.content);

    const manifestOutput = output("/manifest.json");
    const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
    manifest.executionIndex.content = executionContent;
    manifest.files.find((file: { path: string }) => file.path === executionOutput.path).content =
      executionContent;
    manifest.proofIndex.content = proofContent;
    manifest.files.find((file: { path: string }) => file.path === proofOutput.path).content =
      proofContent;
    manifestOutput.content = encoder.encode(canonicalizeJson(manifest));

    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      outputs,
      proofSourceFixture(),
    )).rejects.toThrow("browser targets drifted");
  });

  it("cross-binds the level page cache token to the attested shared-player entry", async () => {
    const built = await buildP7bTrainingPackOutputs(await fixture());
    const outputs = built.outputs.map((output) => ({
      ...output,
      content: new Uint8Array(output.content),
    }));
    const page = outputs.find(({ path }) => path.endsWith("/levels/001/index.html"))!;
    const substituted = new TextEncoder().encode(
      new TextDecoder().decode(page.content).replace(/\?v=[0-9a-f]{64}/u, `?v=${"f".repeat(64)}`),
    );
    page.content = substituted;
    const manifestOutput = outputs.find(({ path }) => path.endsWith("/manifest.json"))!;
    const manifest = JSON.parse(new TextDecoder().decode(manifestOutput.content));
    manifest.files.find((file: { path: string }) => file.path === page.path).content =
      await ref(substituted);
    manifestOutput.content = new TextEncoder().encode(canonicalizeJson(manifest));

    await expect(attestP7bTrainingPackOutputs(
      "/workspace/tworld",
      "fixture-pack",
      outputs,
      proofSourceFixture(),
    )).rejects.toThrow("page shared player binding drifted");
  });

  it("resolves the six-up level href to the one shared dist player entry", () => {
    const distRoot = "/workspace/tworld/web/dist";
    const levelRoot = resolve(
      distRoot,
      "dev/ccsolver/training-replays/cclp1/levels/001",
    );
    const href = `${P7B_SHARED_PLAYER_LEVEL_HREF}?v=${"a".repeat(64)}`;
    expect(resolve(levelRoot, href.split("?")[0]!)).toBe(resolve(
      distRoot,
      "assets/p7b-replay-player.js",
    ));
    expect(href).toMatch(/\?v=[0-9a-f]{64}$/u);
  });

  it("preserves raw donor bytes exactly and emits compact canonical replay JSON without frames", async () => {
    const input = await fixture();
    const built = await buildP7bTrainingPackOutputs(input);
    input.processedLevels[0]!.rawDonorBytes[0]!.bytes[0] = 255;
    const raw = built.outputs.find(({ path }) => path.endsWith("/raw/00-ms.tws-entry.bin"))!;
    const replay = built.outputs.find(({ path }) => path.endsWith("/replays/00-ms.json"))!;
    const replayText = new TextDecoder().decode(replay.content);

    expect([...raw.content]).toEqual([1, 2, 3, 4]);
    expect(canonicalizeJson(JSON.parse(replayText))).toBe(replayText);
    expect(replayText).not.toMatch(/"frames?"|"screenshots?"/u);
  });

  it("publishes one shared portable profile and immutable content-addressed traces", async () => {
    const input = await portableFixture();
    const built = await buildP7bTrainingPackOutputs(input);

    expect(built.outputs.map(({ path }) => path)).toContain(
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/profiles/hybridcc-candidate-10hz-v1.json",
    );
    expect(built.outputs.map(({ path }) => path)).toContain(
      "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack/levels/001/portable/01-hybrid-candidate-10hz.json",
    );
    expect(built.manifest.portableProfile?.profileId).toBe(
      P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    );
    expect(built.manifest.levels[0]!.variantPayloadFileCount).toBe(1);

    const missing = await portableFixture();
    Object.assign(missing.processedLevels[0]!, { variantPayloads: [] });
    await expect(buildP7bTrainingPackOutputs(missing)).rejects.toThrow(
      "portable variant payload set is incomplete",
    );
  });

  it("rejects missing processed assets, invented raw bytes, and frame-shaped replay payloads", async () => {
    const missing = await fixture();
    missing.processedLevels.splice(0, 1);
    await expect(buildP7bTrainingPackOutputs(missing)).rejects.toThrow(
      "executable level 1 lacks injected processed assets",
    );

    const rewritten = await fixture();
    rewritten.processedLevels[0]!.rawDonorBytes[0]!.bytes[0] = 9;
    await expect(buildP7bTrainingPackOutputs(rewritten)).rejects.toThrow(
      "raw donor bytes disagree with immutable content",
    );

    const frames = await fixture();
    (frames.processedLevels[0]!.browserReplays[0]!.replay as unknown as
      Record<string, unknown>).frames = [];
    await expect(buildP7bTrainingPackOutputs(frames)).rejects.toThrow(
      "browser replay has an unsupported shape",
    );

    const beyondPlayerSeek = await fixture();
    const changedLevel = structuredClone(beyondPlayerSeek.inventory[0]!) as any;
    changedLevel.variants[0].certifications.ms.terminalNativeTick = 100_001;
    changedLevel.variants[0].certifications.ms.segmentSpans[0].endNativeTick = 100_001;
    beyondPlayerSeek.inventory = [
      buildP7bTrainingReplayLevel(changedLevel),
      ...beyondPlayerSeek.inventory.slice(1),
    ];
    (beyondPlayerSeek.processedLevels[0]!.browserReplays[0]!.replay as any)
      .terminalNativeTick = 100_001;
    await expect(buildP7bTrainingPackOutputs(beyondPlayerSeek)).rejects.toThrow(
      "exceeds the player seek bound",
    );
  });

  it("requires 149 inventory rows for every official CCLP training pack", async () => {
    const input = await fixture();
    input.pack = { packId: "cclp1", title: "CCLP1", expectedLevelCount: 2 };
    input.inventory = input.inventory.map((contract) => buildP7bTrainingReplayLevel({
      ...contract,
      source: { ...contract.source, packId: "cclp1" },
      rawDonors: contract.rawDonors.map((donor) => ({ ...donor, sourcePackId: "cclp1" })),
    }));
    await expect(buildP7bTrainingPackOutputs(input)).rejects.toThrow(
      "official CCLP training packs require exactly 149 inventory rows",
    );
  });
});
