import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildP7TrainingBrowserReplay } from "@game-core/api/p7TrainingBrowserReplay";
import type { GameRequest } from "@game-core/api/types";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { LoadedLevelData, LevelRepository } from "@level-catalog/ports/LevelRepository";
import {
  createP7bBrowserReplayAssetLoader,
  createP7bBrowserReplayPlaybackEngine,
  type P7bReplayBrowserManifestV1,
} from "@player-web/impl/p7b-training-replays/p7bReplayBrowserRuntime";
import { buildCclp1FoundationCohort } from "../p7b-cohort/buildCclp1FoundationCohort";
import { loadCclp1FoundationCohort } from "../p7b-cohort/loadCclp1FoundationCohort";
import {
  buildCclp1FoundationPortableCohort,
  compileNativeReplayPulsesToPortableTrace,
} from "./buildCclp1FoundationPortableCohort";
import {
  buildCclp1FoundationBrowserReplayInputs,
} from "./buildCclp1FoundationBrowserReplayInputs";
import {
  composeCclp1FoundationTrainingReplayPack,
  contractTransformKind,
} from "./composeCclp1FoundationTrainingReplayPack";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class StaticLevelRepository implements LevelRepository {
  constructor(private readonly loaded: LoadedLevelData) {}

  async loadLevel(request: GameRequest): Promise<LoadedLevelData> {
    return {
      request,
      levelData: new Uint8Array(this.loaded.levelData),
      layerData: this.loaded.layerData.map((entry) => new Uint8Array(entry)),
    };
  }
}

function evidenceStats(
  bundles: readonly {
    readonly blobs: readonly {
      readonly content: { readonly digest: string; readonly byteLength: number };
    }[];
  }[],
  prior?: readonly {
    readonly blobs: readonly {
      readonly content: { readonly digest: string; readonly byteLength: number };
    }[];
  }[],
) {
  const priorDigests = new Set(prior?.flatMap(({ blobs }) => (
    blobs.map(({ content }) => content.digest)
  )) ?? []);
  const byDigest = new Map(bundles.flatMap(({ blobs }) => blobs).map((blob) => (
    [blob.content.digest, blob] as const
  )));
  const blobs = [...byDigest.values()].filter(({ content }) => (
    !priorDigests.has(content.digest)
  ));
  return {
    blobCount: blobs.length,
    byteLength: blobs.reduce((sum, { content }) => sum + content.byteLength, 0),
    maximumBlobBytes: blobs.reduce((maximum, { content }) => (
      Math.max(maximum, content.byteLength)
    ), 0),
  };
}

function largestEvidenceBlobs(bundles: readonly {
  readonly blobs: readonly {
    readonly content: { readonly digest: string; readonly byteLength: number };
    readonly mediaType: "application/json" | "application/octet-stream";
    readonly bytes: Uint8Array;
  }[];
}[]) {
  const byDigest = new Map(bundles.flatMap(({ blobs }) => blobs).map((blob) => (
    [blob.content.digest, blob] as const
  )));
  return [...byDigest.values()]
    .sort((left, right) => right.content.byteLength - left.content.byteLength)
    .slice(0, 12)
    .map((blob) => {
      if (blob.mediaType !== "application/json") {
        return { byteLength: blob.content.byteLength, mediaType: blob.mediaType };
      }
      const value = JSON.parse(new TextDecoder().decode(blob.bytes)) as Record<string, unknown>;
      return {
        byteLength: blob.content.byteLength,
        artifact: value.artifact ?? null,
        occurrenceId: value.occurrenceId ?? null,
        target: value.target ?? null,
        nativeBoundaryTick: value.nativeBoundaryTick ?? null,
        keys: Object.keys(value),
      };
    });
}

describe("the bounded P7B portable replay compiler", () => {
  it("uses explicit one-step packets, floor-quantizes odd ticks, and assigns unknown diagonal order", () => {
    const compiled = compileNativeReplayPulsesToPortableTrace({
      target: "lynx",
      terminalNativeTick: 10,
      flags: 0,
      stepping: 0,
      randomSlideDirection: 1,
      containsMouseInput: false,
      moves: [
        { when: 0, dir: 8 },
        { when: 5, dir: 1 | 8 },
      ],
      inputDecisionEvents: [],
    });

    expect(compiled.status).toBe("compiled");
    if (compiled.status !== "compiled") return;
    expect(compiled.trace.changes).toEqual([
      { logicStep: 0, packet: { primary: "east", secondary: "none" } },
      { logicStep: 1, packet: { primary: "none", secondary: "none" } },
      { logicStep: 2, packet: { primary: "north", secondary: "east" } },
      { logicStep: 3, packet: { primary: "none", secondary: "none" } },
    ]);
    expect(compiled.trace.terminalLogicStep).toBe(5);
    expect(compiled.residuals).toContain("diagonal-order-assigned");
    expect(compiled.transforms.map(({ kind }) => kind)).toEqual([
      "input-pulse-normalized",
      "native-odd-tick-quantized",
      "diagonal-order-assigned",
    ]);
    expect(compiled.quantization).toContainEqual({
      sourceDecision: 1,
      sourceNativeTick: 5,
      portableLogicStep: 2,
      nativeTickDelta: -1,
    });
    expect(contractTransformKind("diagonal-order-assigned"))
      .toBe("diagonal-order-assigned");
    expect(contractTransformKind("diagonal-order-derived"))
      .toBe("diagonal-expanded");
  });

  it("blocks nondefault headers and same-step timing collisions instead of hiding them", () => {
    const stepping = compileNativeReplayPulsesToPortableTrace({
      target: "ms",
      terminalNativeTick: 8,
      flags: 0,
      stepping: 4,
      randomSlideDirection: 1,
      containsMouseInput: false,
      moves: [{ when: 0, dir: 8 }],
      inputDecisionEvents: [],
    });
    expect(stepping).toMatchObject({
      status: "blocked",
      blockers: [{ kind: "nondefault-stepping", detail: expect.any(String) }],
    });

    const collision = compileNativeReplayPulsesToPortableTrace({
      target: "lynx",
      terminalNativeTick: 8,
      flags: 0,
      stepping: 0,
      randomSlideDirection: 1,
      containsMouseInput: false,
      moves: [{ when: 2, dir: 8 }, { when: 3, dir: 1 }],
      inputDecisionEvents: [],
    });
    expect(collision).toMatchObject({
      status: "blocked",
      blockers: [{
        kind: "same-step-collision",
        detail: expect.stringContaining("decisions 0 and 1"),
      }],
    });
  });

  it("chooses one deterministic real lineage and freshly certifies every compilable target", async () => {
    const loaded = await loadCclp1FoundationCohort(repositoryRoot);
    const processed = await buildCclp1FoundationCohort(loaded);
    const before = processed.levels.flatMap((level) => level.targets.map((target) => (
      sha256(target.rawReplayBytes)
    )));

    const portable = await buildCclp1FoundationPortableCohort(processed);
    const browserInputs = await buildCclp1FoundationBrowserReplayInputs(portable);
    const trainingPack = composeCclp1FoundationTrainingReplayPack(portable, browserInputs);

    expect(portable.levels.map(({ occurrenceId, lineage }) => ({
      occurrenceId,
      target: lineage.target,
    }))).toEqual([
      { occurrenceId: "cclp1/001", target: "lynx" },
      { occurrenceId: "cclp1/002", target: "lynx" },
      { occurrenceId: "cclp1/003", target: "lynx" },
      { occurrenceId: "cclp1/004", target: "ms" },
      { occurrenceId: "cclp1/005", target: "lynx" },
      { occurrenceId: "cclp1/006", target: "lynx" },
      { occurrenceId: "cclp1/007", target: "lynx" },
      { occurrenceId: "cclp1/008", target: "lynx" },
      { occurrenceId: "cclp1/009", target: "ms" },
      { occurrenceId: "cclp1/010", target: "ms" },
      { occurrenceId: "cclp1/042", target: "ms" },
      { occurrenceId: "cclp1/137", target: "lynx" },
    ]);

    const mughfe = portable.levels.find(({ occurrenceId }) => occurrenceId === "cclp1/042")!;
    expect(mughfe.candidate).toMatchObject({
      status: "blocked",
      blockers: [{ kind: "nondefault-stepping" }],
      certifications: {
        ms: { status: "not-attempted" },
        lynx: { status: "not-attempted" },
      },
    });
    const thiefStreet = portable.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/137"
    ))!;
    expect(thiefStreet.lineage).toMatchObject({ target: "lynx", containsMouseInput: false });
    expect(thiefStreet.candidate.transforms.map(({ kind }) => kind))
      .toContain("diagonal-order-derived");
    expect(thiefStreet.candidate.residuals).not.toContain("diagonal-order-assigned");
    const keyPyramidCandidate = portable.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    ))!.candidate;
    expect(keyPyramidCandidate).toMatchObject({
      status: "compiled",
      segmentAlignment: { status: "aligned-targets" },
      segments: expect.arrayContaining([expect.objectContaining({
        anchor: expect.objectContaining({ kind: "exit" }),
      })]),
    });
    expect(portable.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/002"
    ))!.candidate).toMatchObject({
      status: "compiled",
      segmentAlignment: { status: "single-certified-target" },
    });
    expect(portable.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/006"
    ))!.candidate).toMatchObject({
      status: "compiled",
      segmentAlignment: { status: "conservative-route" },
    });

    for (const level of portable.levels) {
      if (level.candidate.status === "blocked") {
        expect(level.candidate.blockers.length).toBeGreaterThan(0);
        continue;
      }
      expect(level.candidate.trace.profileId).toBe("hybridcc-candidate-10hz-v1");
      expect(level.candidate.certifications.ms.status).toMatch(/^(certified|failed)$/u);
      expect(level.candidate.certifications.lynx.status).toMatch(/^(certified|failed)$/u);
      expect(level.candidate.certifications.ms.execution.compilerRevision)
        .toBe("p7b-portable-to-ms-native-input-v1");
      expect(level.candidate.certifications.lynx.execution.compilerRevision)
        .toBe("p7b-portable-to-lynx-native-input-v1");
    }

    expect(portable.summary.levelCount).toBe(12);
    expect(portable.summary.lineageCount).toBe(12);
    expect(portable.summary).toEqual({
      levelCount: 12,
      lineageCount: 12,
      compiledCandidateCount: 9,
      blockedCandidateCount: 3,
      certificationAttemptCount: 18,
      certifiedTargetCount: 9,
      failedTargetCount: 9,
      nativeAdvanceTickCount: 8_598,
      maximumNativeAdvanceTickCount: 11_948,
    });
    expect(portable.levels.map(({ occurrenceId, candidate }) => ({
      occurrenceId,
      portability: candidate.portability,
      ms: candidate.certifications.ms.outcome,
      lynx: candidate.certifications.lynx.outcome,
    }))).toEqual([
      { occurrenceId: "cclp1/001", portability: "portable", ms: "won", lynx: "won" },
      { occurrenceId: "cclp1/002", portability: "target-specific", ms: "timeout", lynx: "won" },
      { occurrenceId: "cclp1/003", portability: "not-portable", ms: "not-run", lynx: "not-run" },
      { occurrenceId: "cclp1/004", portability: "target-specific", ms: "won", lynx: "loss" },
      { occurrenceId: "cclp1/005", portability: "portable", ms: "won", lynx: "won" },
      { occurrenceId: "cclp1/006", portability: "not-portable", ms: "loss", lynx: "loss" },
      { occurrenceId: "cclp1/007", portability: "not-portable", ms: "not-run", lynx: "not-run" },
      { occurrenceId: "cclp1/008", portability: "not-portable", ms: "loss", lynx: "loss" },
      { occurrenceId: "cclp1/009", portability: "target-specific", ms: "won", lynx: "timeout" },
      { occurrenceId: "cclp1/010", portability: "target-specific", ms: "won", lynx: "loss" },
      { occurrenceId: "cclp1/042", portability: "not-portable", ms: "not-run", lynx: "not-run" },
      { occurrenceId: "cclp1/137", portability: "target-specific", ms: "timeout", lynx: "won" },
    ]);
    expect(portable.summary.certificationAttemptCount)
      .toBe(portable.summary.compiledCandidateCount * 2);
    expect(portable.summary.nativeAdvanceTickCount).toBeLessThanOrEqual(
      portable.summary.maximumNativeAdvanceTickCount,
    );
    expect(trainingPack.summary).toMatchObject({
      packId: "cclp1",
      totals: {
        levels: 12,
        targets: 24,
        viewableLevels: 12,
        rawDonors: 24,
        variants: 33,
        variantTargetCertifications: 66,
      },
      sources: { eligible: 12, ineligible: 0, standardOnly: 12 },
      processing: { pending: 0, complete: 12, blocked: 0 },
      donorCoverage: { bound: 24, missing: 0, invalid: 0 },
      mapRelationships: { officialMap: 24, exactGameplayAlias: 0, editedRelative: 0 },
      variants: { raw: 24, portable: 9 },
      portability: {
        pending: 0,
        portable: 2,
        targetSpecific: 29,
        quirkRequired: 0,
        notPortable: 2,
      },
      executions: {
        native: 24,
        compiled: 18,
        compilationFailed: 0,
        notAttempted: 0,
        unavailable: 24,
      },
      certifications: {
        certified: 33,
        failed: 9,
        notAttempted: 0,
        unavailable: 24,
      },
    });
    expect(trainingPack.levels).toHaveLength(12);
    expect(trainingPack.levels.every(({ processing }) => processing.status === "complete"))
      .toBe(true);
    expect(trainingPack.levels.find(({ source }) => source.levelNumber === 42)?.variants)
      .toHaveLength(2);
    expect(trainingPack.levels.find(({ source }) => source.levelNumber === 137)?.variants
      .find(({ kind }) => kind === "portable")?.lineage.rawDonorId)
      .toBe("cclp1-137-lynx-official");
    const keyPyramidPortable = trainingPack.levels
      .find(({ source }) => source.levelNumber === 1)!.variants
      .find(({ kind }) => kind === "portable")!;
    expect(keyPyramidPortable.segments.length).toBeGreaterThan(1);
    expect(keyPyramidPortable.certifications.ms.segmentSpans)
      .toHaveLength(keyPyramidPortable.segments.length);
    expect(keyPyramidPortable.certifications.lynx.segmentSpans)
      .toHaveLength(keyPyramidPortable.segments.length);

    const keyPyramid = portable.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    ))!;
    const keyPyramidBrowser = browserInputs.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    ))!;
    expect(keyPyramidBrowser.portableDecisionTrace).not.toBeNull();
    const traceBytes = new TextEncoder().encode(
      keyPyramidBrowser.portableDecisionTrace!.canonicalJson,
    );
    expect(keyPyramidBrowser.portableDecisionTrace!.content).toEqual({
      digest: `sha256:${sha256(traceBytes)}`,
      byteLength: traceBytes.byteLength,
    });
    const portableMsInput = keyPyramidBrowser.browserReplays.find(({ replay }) => (
      replay.variantId === "portable" && replay.target === "ms"
    ))!;
    const portableLynxInput = keyPyramidBrowser.browserReplays.find(({ replay }) => (
      replay.variantId === "portable" && replay.target === "lynx"
    ))!;
    for (const input of [portableMsInput, portableLynxInput]) {
      const replay = input.replay;
      expect(replay.transport).toBe("manual-held-schedule");
      if (replay.transport !== "manual-held-schedule") continue;
      expect(replay.changes.length).toBeGreaterThan(0);
      expect(replay.changes[0]!.inputCode).not.toBe(0);
      expect(replay.changes.every(({ nativeTick }) => (
        nativeTick < replay.terminalNativeTick
      ))).toBe(true);
      expect(input.parity.receipt).toMatchObject({
        transport: "manual-held-schedule",
        status: "matched",
        browserReplayContent: input.content,
        expected: {
          outcome: "won",
          terminalNativeTick: replay.terminalNativeTick,
        },
        observed: {
          outcome: "won",
          terminalNativeTick: replay.terminalNativeTick,
        },
      });
      expect(input.parity.receipt.observed.segmentBoundaries)
        .toEqual(input.parity.receipt.expected.segmentBoundaries);
      expect(input.content).toEqual({
        digest: `sha256:${sha256(new TextEncoder().encode(input.canonicalJson))}`,
        byteLength: new TextEncoder().encode(input.canonicalJson).byteLength,
      });
    }
    expect(browserInputs.summary.parityMatchedCount).toBe(browserInputs.summary.replayCount);
    const graduationSource = processed.levels.find(({ selection }) => (
      selection.levelNumber === 10
    ))!.targets.find(({ target }) => target === "lynx")!;
    const graduationRawLynx = browserInputs.levels.find(({ levelNumber }) => (
      levelNumber === 10
    ))!.browserReplays.find(({ variantId, target }) => (
      variantId === "raw-lynx" && target === "lynx"
    ))!.replay;
    expect(graduationRawLynx.transport).toBe("native-replay-pulses");
    if (graduationRawLynx.transport === "native-replay-pulses") {
      expect(graduationRawLynx.decisions.map(({ encodedWhen }) => encodedWhen))
        .toEqual(graduationSource.expandedSolution.moves.map(({ when }) => when));
      expect(graduationRawLynx.decisions.some(({ encodedWhen }) => (
        encodedWhen > 0xffff_ffff
      ))).toBe(true);
      expect(() => buildP7TrainingBrowserReplay({
        ...graduationRawLynx,
        decisions: graduationRawLynx.decisions.map((decision, index) => (
          index === 0 ? { ...decision, encodedWhen: decision.encodedWhen + 1 } : decision
        )),
      })).toThrow("does not match its native tick");
    }
    expect(browserInputs.levels.every(({ generatedEvidence }) => (
      generatedEvidence.totals.blobCount > 0
      && generatedEvidence.totals.byteLength > 0
    ))).toBe(true);

    const rawBundles = processed.levels.map(({ generatedEvidence }) => generatedEvidence);
    const portableBundles = [
      portable.packEvidence,
      ...portable.levels.map(({ generatedEvidence }) => generatedEvidence),
    ];
    const browserBundles = [
      browserInputs.packEvidence,
      ...browserInputs.levels.map(({ generatedEvidence }) => generatedEvidence),
    ];
    const rawEvidence = evidenceStats(rawBundles);
    const portableEvidence = evidenceStats(
      portableBundles,
      rawBundles,
    );
    const browserParityEvidence = evidenceStats(
      browserBundles,
      portableBundles,
    );
    const combinedEvidence = evidenceStats(browserBundles);
    expect(rawEvidence.blobCount).toBeGreaterThan(0);
    expect(portableEvidence.blobCount).toBeGreaterThan(0);
    expect(browserParityEvidence.blobCount).toBeGreaterThan(0);
    expect(trainingPack.generatedEvidence.levels).toHaveLength(12);
    expect(combinedEvidence.byteLength).toBeLessThan(4 * 1024 * 1024);
    if (process.env.TWORLD_P7B_METRICS === "1") {
      process.stderr.write(`${JSON.stringify({
        rawEvidence,
        portableEvidence,
        browserParityEvidence,
        combinedEvidence,
        largestEvidenceBlobs: largestEvidenceBlobs(browserBundles),
      })}\n`);
    }

    // The direct engine proofs above are authoritative. This one-cell canary
    // additionally proves that the exact emitted portable bytes survive the
    // production browser loader and manual-held playback transport unchanged.
    if (portableMsInput.replay.transport !== "manual-held-schedule") {
      throw new Error("Key Pyramid MS portable browser replay is not a manual schedule");
    }
    const portableMsCertification = keyPyramidPortable.certifications.ms;
    if (
      portableMsCertification.status !== "certified"
      || portableMsCertification.terminalNativeTick === null
      || portableMsCertification.execution.decisionProfile === null
      || portableMsCertification.execution.executedDecisionCount === null
      || portableMsCertification.execution.nativeTickRateHz === null
      || portableMsCertification.execution.nativeBoundaryClock === null
    ) throw new Error("Key Pyramid MS portable certification is incomplete");
    const portableSelection = { variant: "portable", executionTarget: "ms" } as const;
    const replayHref = "portable-ms.json";
    const displayLevel = {
      index: 0,
      number: 1,
      name: keyPyramid.source.selection.title,
      author: "",
      password: "",
      timeLimitSeconds: 0,
      chipsRequired: 0,
      bestTimeTicks: portableMsInput.replay.initialization.bestTimeTicks,
      levelSize: keyPyramid.source.source.levelData.byteLength,
      solutionSize: portableMsInput.replay.changes.length,
      levelHash: keyPyramid.source.selection.caseId,
      gameplayHash: keyPyramid.source.selection.normalizedGameplaySha256,
      hasSolution: true,
      sgflags: 0,
      unsolvable: null,
    };
    const manifest: P7bReplayBrowserManifestV1 = {
      artifact: "ccsolver-p7b-replay-browser-level",
      version: 1,
      presentation: {
        packId: "cclp1",
        levelNumber: 1,
        title: keyPyramid.source.selection.title,
        sourceHref: "contract.json",
        levelManifestHref: "browser.json",
        playerModuleHref: "../../assets/p7b-replay-player.js",
        initialSelection: portableSelection,
        variants: [{
          id: "portable",
          label: "Portable replay",
          description: "Bounded production transport canary",
          segments: keyPyramidPortable.segments.map((segment) => ({
            id: segment.segmentId,
            ordinal: segment.index + 1,
            title: segment.label,
          })),
        }],
        executionTargets: [{ id: "ms", label: "MS engine" }],
        combinations: [{
          ...portableSelection,
          availability: "available",
          transport: portableMsInput.replay.transport,
          replayHref,
          replayContent: portableMsInput.content,
          provenanceLabel: "Normalized portable lineage",
          decisionProfile: {
            profileId: portableMsCertification.execution.decisionProfile.profileId,
            clockBasis: portableMsCertification.execution.decisionProfile.clockBasis,
            cadenceHz: portableMsCertification.execution.decisionProfile.cadenceHz,
          },
          nativeTickRateHz: portableMsCertification.execution.nativeTickRateHz,
          nativeBoundaryClock: portableMsCertification.execution.nativeBoundaryClock,
          terminalNativeTick: portableMsCertification.terminalNativeTick,
          executedDecisionCount:
            portableMsCertification.execution.executedDecisionCount,
          segmentSpans: portableMsCertification.segmentSpans.map((span) => ({
            segmentId: span.segmentId,
            startNativeTick: span.startNativeTick,
            endNativeTick: span.endNativeTick,
            ...(span.startDecisionOrdinal === null ? {} : {
              startDecisionOrdinal: span.startDecisionOrdinal,
              endDecisionOrdinal: span.endDecisionOrdinal!,
            }),
          })),
        }],
      },
      targets: {
        ms: {
          request: {
            seriesFile: keyPyramid.source.targets.find(({ target }) => target === "ms")!.seriesFile,
            levelNumber: 1,
            ruleset: "MS",
          },
          display: { seriesName: "CCLP1 MS", mapFilename: "CCLP1.dat", level: displayLevel },
        },
        lynx: {
          request: {
            seriesFile: keyPyramid.source.targets.find(({ target }) => target === "lynx")!.seriesFile,
            levelNumber: 1,
            ruleset: "Lynx",
          },
          display: { seriesName: "CCLP1 Lynx", mapFilename: "CCLP1.dat", level: displayLevel },
        },
      },
    };
    const levelRepository = new StaticLevelRepository({
      request: manifest.targets.ms.request,
      levelData: keyPyramid.source.source.levelData,
      layerData: [...keyPyramid.source.source.layerData],
    });
    let disposeCount = 0;
    const msEngine = Object.assign(new MsGameEngineAdapter(levelRepository), {
      disposeSession: async () => { disposeCount += 1; },
    });
    const services = {
      engines: {
        MS: msEngine,
        Lynx: new LynxGameEngineAdapter(levelRepository),
      },
    };
    const loader = createP7bBrowserReplayAssetLoader({
      manifest,
      services,
      fetchText: async (href) => {
        if (href !== replayHref) throw new Error(`unexpected canary replay href: ${href}`);
        return portableMsInput.canonicalJson;
      },
    });
    const playback = createP7bBrowserReplayPlaybackEngine(services);
    const asset = await loader.load(portableSelection, replayHref);
    let session = await playback.startFullReplay(asset, portableSelection);
    expect(playback.currentTick(session)).toBe(0);
    const expectedEndBoundaries = portableMsCertification.segmentSpans.map((span) => (
      span.endNativeTick
    ));
    const expectedEndBoundarySet = new Set(expectedEndBoundaries);
    const observedEndBoundaries: number[] = [];
    for (let advance = 0; advance < portableMsCertification.terminalNativeTick; advance += 1) {
      session = await playback.advanceOneTick(session);
      const boundary = playback.currentTick(session);
      if (expectedEndBoundarySet.has(boundary)) observedEndBoundaries.push(boundary);
    }
    expect(playback.currentTick(session)).toBe(portableMsCertification.terminalNativeTick);
    expect(observedEndBoundaries).toEqual(expectedEndBoundaries);
    expect(session.run.result?.outcome).toBe("completed-clean");
    await playback.dispose?.(session);
    expect(disposeCount).toBe(1);

    expect(processed.levels.flatMap((level) => level.targets.map((target) => (
      sha256(target.rawReplayBytes)
    )))).toEqual(before);
  }, 120_000);
});
