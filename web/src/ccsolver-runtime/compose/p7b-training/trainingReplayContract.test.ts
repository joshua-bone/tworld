import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
} from "./portableReplayProfile";
import {
  P7B_MAX_LEVEL_CONTRACT_BYTES,
  P7B_MAX_SEGMENTS_PER_VARIANT,
  assertTrainingReplaySegmentV1,
  buildP7bTrainingPackSummary,
  buildP7bTrainingReplayLevel,
  canonicalizeP7bTrainingReplayLevel,
  parseP7bTrainingReplayLevel,
  type P7bTrainingReplayLevelV1,
} from "./trainingReplayContract";

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;
const content = (character: string, byteLength = 100) => ({
  digest: digest(character),
  byteLength,
});

function segments() {
  return [{
    segmentId: "route-to-key",
    index: 0,
    label: "Reach the key",
    anchor: { kind: "collect", label: "Collect red key" },
  }, {
    segmentId: "route-to-exit",
    index: 1,
    label: "Reach the exit",
    anchor: { kind: "exit", label: "Enter exit" },
  }] as const;
}

function spans(options: {
  readonly terminalNativeTick?: number;
  readonly portable?: boolean;
} = {}) {
  const terminalNativeTick = options.terminalNativeTick ?? 20;
  const midpoint = Math.floor(terminalNativeTick / 2);
  return [{
    segmentId: "route-to-key",
    index: 0,
    startNativeTick: 0,
    endNativeTick: midpoint,
    startDecisionOrdinal: options.portable ? 0 : null,
    endDecisionOrdinal: options.portable ? 2 : null,
    startBoundaryEvidence: content("1"),
    endBoundaryEvidence: content("2"),
  }, {
    segmentId: "route-to-exit",
    index: 1,
    startNativeTick: midpoint,
    endNativeTick: terminalNativeTick,
    startDecisionOrdinal: options.portable ? 2 : null,
    endDecisionOrdinal: options.portable ? 5 : null,
    startBoundaryEvidence: content("2"),
    endBoundaryEvidence: content("3"),
  }];
}

function segmentSelection(selected = true) {
  return {
    policyRevision: "semantic-route-chapters-max-24-v1",
    selectionMode: selected ? "viewable-route-chapters" : "unviewable",
    candidateCount: 2,
    selectedCandidateOrdinals: selected ? [0, 1] : [],
    omittedCandidateCount: selected ? 0 : 2,
    targetTranscript: {
      algorithm: "sha256",
      canonicalization: "tworld-canonical-json-v1",
      digest: digest("7"),
      byteLength: 200,
    },
    semanticTranscript: {
      algorithm: "sha256",
      canonicalization: "tworld-canonical-json-v1",
      digest: digest("8"),
      byteLength: 120,
    },
  } as const;
}

function emptyExecution(
  status: "not-attempted" | "unavailable" = "unavailable",
) {
  return {
    status,
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
    detail: status === "unavailable"
      ? "variant cannot execute on this target"
      : "target compilation has not run",
  } as const;
}

function nativeExecution(
  target: "ms" | "lynx",
  replayCharacter: string,
  browserPublished = true,
) {
  return {
    status: "native",
    decisionProfile: {
      profileId: `native-${target}-tws-v1`,
      profileRevision: `tworld-native-${target}-tws-v1`,
      clockBasis: "native-tick",
      cadenceHz: 20,
      profileContent: null,
    },
    executedDecisionCount: 5,
    nativeBoundaryClock: "exclusive-advance-count-v1",
    nativeTickRateHz: 20,
    replayContent: content(replayCharacter, 300),
    browserReplayContent: browserPublished ? content("f", 500) : null,
    browserReplayParityReceipt: browserPublished ? content("e", 300) : null,
    browserReplayTransport: browserPublished ? "native-replay-pulses" : null,
    compilerRevision: null,
    compilationReceipt: null,
    detail: `immutable ${target} donor replay`,
  } as const;
}

function compiledExecution(target: "ms" | "lynx", browserPublished = true) {
  return {
    status: "compiled",
    decisionProfile: {
      profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
      profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
      clockBasis: "portable-decision",
      cadenceHz: 10,
      profileContent: content("6"),
    },
    executedDecisionCount: 5,
    nativeBoundaryClock: "exclusive-advance-count-v1",
    nativeTickRateHz: 20,
    replayContent: content(target === "ms" ? "7" : "8", 260),
    browserReplayContent: browserPublished
      ? content(target === "ms" ? "1" : "2", 500)
      : null,
    browserReplayParityReceipt: browserPublished
      ? content(target === "ms" ? "3" : "4", 300)
      : null,
    browserReplayTransport: browserPublished ? "manual-held-schedule" : null,
    compilerRevision: `portable-to-${target}-tws-v1`,
    compilationReceipt: content(target === "ms" ? "9" : "a"),
    detail: `compiled from the portable decision trace for ${target}`,
  } as const;
}

function certification(options: {
  readonly status: "certified" | "failed" | "not-attempted" | "unavailable";
  readonly execution: ReturnType<typeof emptyExecution>
    | ReturnType<typeof nativeExecution>
    | ReturnType<typeof compiledExecution>;
  readonly portable?: boolean;
  readonly terminalNativeTick?: number;
}) {
  const terminalNativeTick = options.terminalNativeTick ?? 20;
  if (options.status === "certified") {
    return {
      status: "certified",
      outcome: "won",
      evidence: content("b"),
      terminalNativeTick,
      detail: "won under the target engine",
      execution: options.execution,
      segmentSelection: segmentSelection(),
      segmentSpans: spans({ terminalNativeTick, portable: options.portable }),
    } as const;
  }
  if (options.status === "failed") {
    return {
      status: "failed",
      outcome: "diverged",
      evidence: content("c"),
      terminalNativeTick: 6,
      detail: "first semantic divergence at native tick 6",
      execution: options.execution,
      segmentSelection: segmentSelection(false),
      segmentSpans: [],
    } as const;
  }
  return {
    status: options.status,
    outcome: options.status === "not-attempted" ? "not-run" : "unsupported",
    evidence: null,
    terminalNativeTick: null,
    detail: options.status === "not-attempted"
      ? "certification has not run"
      : "variant is unavailable on the target",
    execution: options.execution,
    segmentSelection: null,
    segmentSpans: [],
  } as const;
}

function levelFixture(): Record<string, unknown> {
  return {
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "cclp1",
      levelNumber: 1,
      title: "Lesson One",
      normalizedGameplaySha256: "a".repeat(64),
      levelContent: content("a", 2_000),
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: "standard-only-v1",
        evidence: content("b"),
      },
    },
    donorCoverage: {
      ms: { status: "bound", rawDonorId: "official-ms", detail: "official donor" },
      lynx: { status: "missing", rawDonorId: null, detail: "no donor located" },
    },
    rawDonors: [{
      donorId: "official-ms",
      target: "ms",
      origin: "official-pack",
      sourcePackId: "cclp1",
      sourceLevelNumber: 1,
      sourceNormalizedGameplaySha256: "a".repeat(64),
      sourceLevelContent: content("a", 2_000),
      replayContent: content("c", 300),
      mapRelationship: "official-map",
      mapComparisonEvidence: null,
    }],
    variants: [{
      variantId: "raw-ms",
      kind: "raw",
      replayContent: content("c", 300),
      decisionCount: 5,
      portableProfile: null,
      lineage: {
        kind: "raw-donor",
        rawDonorId: "official-ms",
        sourceVariantId: null,
        evidence: null,
      },
      portability: "target-specific",
      transforms: [],
      segments: segments(),
      certifications: {
        ms: certification({ status: "certified", execution: nativeExecution("ms", "c") }),
        lynx: certification({ status: "unavailable", execution: emptyExecution() }),
      },
    }, {
      variantId: "portable",
      kind: "portable",
      replayContent: content("d", 280),
      decisionCount: 5,
      portableProfile: {
        profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
        profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
        profileContent: content("6"),
        decisionTraceContent: content("d", 280),
        changeCount: 5,
        terminalLogicStep: 10,
      },
      lineage: {
        kind: "normalized-donor",
        rawDonorId: "official-ms",
        sourceVariantId: "raw-ms",
        evidence: content("e"),
      },
      portability: "portable",
      transforms: [{
        ordinal: 0,
        kind: "input-rescheduled",
        source: { startDecision: 1, endDecision: 2 },
        output: { startDecision: 1, endDecision: 2 },
        reason: "move the input to a settled decision boundary",
        evidence: content("f"),
      }],
      segments: segments(),
      certifications: {
        ms: certification({
          status: "certified",
          execution: compiledExecution("ms"),
          portable: true,
        }),
        lynx: certification({
          status: "certified",
          execution: compiledExecution("lynx"),
          portable: true,
        }),
      },
    }],
    processing: {
      status: "complete",
      detail: "all variants classified and the portable replay is viewable",
    },
    viewableVariantId: "portable",
  };
}

function mutateAt(
  value: Record<string, unknown>,
  path: readonly (string | number)[],
  replacement: unknown,
): Record<string, unknown> {
  const clone = structuredClone(value);
  let cursor: Record<string | number, unknown> = clone;
  for (const key of path.slice(0, -1)) {
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  cursor[path.at(-1)!] = replacement;
  return clone;
}

describe("the P7B training replay contract", () => {
  it("copies and deeply freezes immutable raw donor replay references", () => {
    const input = levelFixture();
    const built = buildP7bTrainingReplayLevel(input);
    const rawInput = (input.rawDonors as Record<string, unknown>[])[0]!;
    const originalDigest = built.rawDonors[0]!.replayContent.digest;
    (rawInput.replayContent as Record<string, unknown>).digest = digest("0");

    expect(built.rawDonors[0]!.replayContent.digest).toBe(originalDigest);
    expect(Object.isFrozen(built.rawDonors[0]!.replayContent)).toBe(true);
    expect(() => {
      (built.rawDonors[0]!.replayContent as { digest: string }).digest = digest("0");
    }).toThrow();
  });

  it("binds raw variants and native execution byte-for-byte to donor replay", () => {
    const changedVariant = mutateAt(
      levelFixture(), ["variants", 0, "replayContent"], content("0", 300),
    );
    expect(() => buildP7bTrainingReplayLevel(changedVariant)).toThrow(
      "raw variant replay must equal its donor replay",
    );

    const changedExecution = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "execution", "replayContent"],
      content("0", 300),
    );
    expect(() => buildP7bTrainingReplayLevel(changedExecution)).toThrow(
      "native execution replay must equal the raw donor replay",
    );
  });

  it("requires eligible standard-only source evidence before completion", () => {
    const nonstandard = mutateAt(
      levelFixture(), ["source", "eligibility", "standardOnly"], false,
    );
    expect(() => buildP7bTrainingReplayLevel(nonstandard)).toThrow(
      "complete level source must be eligible and standard-only",
    );
  });

  it("distinguishes official maps, exact aliases, and evidenced edited relatives", () => {
    const exactAlias = levelFixture();
    const donor = (exactAlias.rawDonors as Record<string, unknown>[])[0]!;
    donor.origin = "voting-pack";
    donor.sourcePackId = "cclp5-voting-07";
    donor.mapRelationship = "exact-gameplay-alias";
    expect(buildP7bTrainingReplayLevel(exactAlias).rawDonors[0]!.mapRelationship)
      .toBe("exact-gameplay-alias");

    const falseAlias = mutateAt(
      exactAlias,
      ["rawDonors", 0, "sourceNormalizedGameplaySha256"],
      "b".repeat(64),
    );
    expect(() => buildP7bTrainingReplayLevel(falseAlias)).toThrow(
      "exact alias gameplay digest must match the official level",
    );
    const unevidencedEdit = mutateAt(
      falseAlias, ["rawDonors", 0, "mapRelationship"], "edited-relative",
    );
    expect(() => buildP7bTrainingReplayLevel(unevidencedEdit)).toThrow(
      "edited relative requires map comparison evidence",
    );
    const evidencedEdit = mutateAt(
      unevidencedEdit, ["rawDonors", 0, "mapComparisonEvidence"], content("7"),
    );
    expect(buildP7bTrainingReplayLevel(evidencedEdit).rawDonors[0]!.mapRelationship)
      .toBe("edited-relative");
  });

  it("binds portable variants to the audited 10 Hz candidate profile and trace", () => {
    const wrongCadence = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "execution", "decisionProfile", "cadenceHz"],
      20,
    );
    expect(() => buildP7bTrainingReplayLevel(wrongCadence)).toThrow(
      "compiled execution must use the portable 10 Hz decision profile",
    );
    const changedTrace = mutateAt(
      levelFixture(),
      ["variants", 1, "portableProfile", "decisionTraceContent"],
      content("0"),
    );
    expect(() => buildP7bTrainingReplayLevel(changedTrace)).toThrow(
      "portable variant replay must equal its decision trace",
    );
    const rawClaim = mutateAt(
      levelFixture(),
      ["variants", 0, "portableProfile"],
      (levelFixture().variants as Record<string, unknown>[])[1]!.portableProfile,
    );
    expect(() => buildP7bTrainingReplayLevel(rawClaim)).toThrow(
      "raw variant cannot claim a portable profile",
    );
  });

  it("requires target-specific compilation receipts without claiming Hybrid wire compatibility", () => {
    const noReceipt = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "lynx", "execution", "compilationReceipt"],
      null,
    );
    expect(() => buildP7bTrainingReplayLevel(noReceipt)).toThrow(
      "compiled execution requires replay, compiler, and receipt",
    );
    const noCompiler = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "execution", "compilerRevision"],
      null,
    );
    expect(() => buildP7bTrainingReplayLevel(noCompiler)).toThrow(
      "compiled execution requires replay, compiler, and receipt",
    );
  });

  it("publishes exact browser replay envelopes only for certified executions", () => {
    const built = buildP7bTrainingReplayLevel(levelFixture());
    expect(built.variants[0]!.certifications.ms.execution.browserReplayContent)
      .toEqual(content("f", 500));

    const hidden = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "execution", "browserReplayContent"],
      null,
    );
    expect(() => buildP7bTrainingReplayLevel(hidden)).toThrow(
      "native execution binding is invalid",
    );

    const wrongNativeTransport = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "execution", "browserReplayTransport"],
      "manual-held-schedule",
    );
    expect(() => buildP7bTrainingReplayLevel(wrongNativeTransport)).toThrow(
      "native execution binding is invalid",
    );

    const wrongPortableTransport = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "lynx", "execution", "browserReplayTransport"],
      "native-replay-pulses",
    );
    expect(() => buildP7bTrainingReplayLevel(wrongPortableTransport)).toThrow(
      "compiled execution requires replay, compiler, receipt, and manual browser transport",
    );

    const failedNative = structuredClone(levelFixture());
    const failedRaw = (failedNative.variants as Record<string, unknown>[])[0]!;
    failedRaw.portability = "not-portable";
    failedRaw.segments = [];
    (failedRaw.certifications as Record<string, unknown>).ms = certification({
      status: "failed",
      execution: nativeExecution("ms", "c", false),
    });
    failedNative.variants = [failedRaw];
    failedNative.processing = { status: "blocked", detail: "native donor lost" };
    failedNative.viewableVariantId = null;
    expect(buildP7bTrainingReplayLevel(failedNative).variants[0]!.certifications.ms)
      .toMatchObject({
        status: "failed",
        detail: "first semantic divergence at native tick 6",
        execution: {
          status: "native",
          browserReplayContent: null,
          browserReplayParityReceipt: null,
          browserReplayTransport: null,
        },
      });

    const leakedFailedNative = mutateAt(
      failedNative,
      ["variants", 0, "certifications", "ms", "execution", "browserReplayContent"],
      content("f", 500),
    );
    expect(() => buildP7bTrainingReplayLevel(leakedFailedNative)).toThrow(
      "failed execution cannot publish a browser replay",
    );

    const failedPortable = structuredClone(levelFixture());
    const portable = (failedPortable.variants as Record<string, unknown>[])[1]!;
    portable.portability = "target-specific";
    (portable.certifications as Record<string, unknown>).lynx = certification({
      status: "failed",
      execution: compiledExecution("lynx", false),
      portable: true,
    });
    expect(buildP7bTrainingReplayLevel(failedPortable).variants[1]!.certifications.lynx)
      .toMatchObject({
        status: "failed",
        execution: {
          status: "compiled",
          browserReplayContent: null,
          browserReplayParityReceipt: null,
          browserReplayTransport: null,
        },
      });
    const leakedFailedPortable = mutateAt(
      failedPortable,
      ["variants", 1, "certifications", "lynx", "execution", "browserReplayParityReceipt"],
      content("4", 300),
    );
    expect(() => buildP7bTrainingReplayLevel(leakedFailedPortable)).toThrow(
      "failed execution cannot publish a browser replay",
    );
  });

  it("requires an exact certification record for every variant-target pair", () => {
    const missing = structuredClone(levelFixture());
    delete ((missing.variants as Record<string, unknown>[])[0]!.certifications as
      Record<string, unknown>).lynx;
    expect(() => buildP7bTrainingReplayLevel(missing)).toThrow(
      "certifications has an unsupported shape",
    );
    const unsupported = mutateAt(
      levelFixture(), ["variants", 0, "certifications", "lynx", "status"], "assumed-good",
    );
    expect(() => buildP7bTrainingReplayLevel(unsupported)).toThrow(
      "certification status is invalid",
    );
  });

  it("keeps stable segment IDs while target-native timing differs", () => {
    const changed = structuredClone(levelFixture());
    const portable = (changed.variants as Record<string, unknown>[])[1]!;
    const lynx = (portable.certifications as Record<string, unknown>).lynx as
      Record<string, unknown>;
    lynx.terminalNativeTick = 22;
    lynx.segmentSpans = spans({ terminalNativeTick: 22, portable: true });

    const built = buildP7bTrainingReplayLevel(changed);
    expect(built.variants[1]!.segments.map(({ segmentId }) => segmentId)).toEqual([
      "route-to-key", "route-to-exit",
    ]);
    expect(built.variants[1]!.certifications.ms.terminalNativeTick).toBe(20);
    expect(built.variants[1]!.certifications.lynx.terminalNativeTick).toBe(22);
  });

  it("bounds viewable chapters and publishes none for an uncertified variant", () => {
    const oversized = structuredClone(levelFixture());
    (oversized.variants as Record<string, unknown>[])[0]!.segments = Array.from(
      { length: P7B_MAX_SEGMENTS_PER_VARIANT + 1 },
      (_, index) => ({
        segmentId: `route-${index}`,
        index,
        label: `Route ${index}`,
        anchor: { kind: "route", label: `Route ${index}` },
      }),
    );
    expect(() => buildP7bTrainingReplayLevel(oversized)).toThrow(
      "training replay segments is out of bounds",
    );

    const failed = structuredClone(levelFixture());
    const raw = (failed.variants as Record<string, unknown>[])[0]!;
    raw.portability = "not-portable";
    raw.segments = [];
    (raw.certifications as Record<string, unknown>).ms = certification({
      status: "failed",
      execution: nativeExecution("ms", "c", false),
    });
    failed.variants = [raw];
    failed.processing = { status: "blocked", detail: "no donor replay won" };
    failed.viewableVariantId = null;
    expect(buildP7bTrainingReplayLevel(failed).variants[0]!.segments).toEqual([]);

    raw.segments = segments();
    expect(() => buildP7bTrainingReplayLevel(failed)).toThrow(
      "variant segments must exist exactly when a target is certified",
    );
  });

  it("binds certified chapters to the exact full-transcript selection policy", () => {
    const omittedPublished = structuredClone(levelFixture());
    const omittedSelection = ((omittedPublished.variants as Record<string, unknown>[])[0]!
      .certifications as Record<string, Record<string, unknown>>).ms!
      .segmentSelection as Record<string, unknown>;
    omittedSelection.selectionMode = "conservative-whole-route";
    omittedSelection.selectedCandidateOrdinals = [1];
    omittedSelection.omittedCandidateCount = 1;
    expect(() => buildP7bTrainingReplayLevel(omittedPublished)).toThrow(
      "certified replay requires evidence, execution, win, terminal tick, and bounded segments",
    );
    const policyDrift = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "segmentSelection", "policyRevision"],
      "semantic-route-chapters-max-48-v1",
    );
    expect(() => buildP7bTrainingReplayLevel(policyDrift)).toThrow(
      "ms segment selection policy revision is invalid",
    );
    const totalDrift = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "segmentSelection", "omittedCandidateCount"],
      1,
    );
    expect(() => buildP7bTrainingReplayLevel(totalDrift)).toThrow(
      "ms segment selection candidate totals drifted",
    );
    const ordinalDrift = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "ms", "segmentSelection", "selectedCandidateOrdinals"],
      [1, 1],
    );
    expect(() => buildP7bTrainingReplayLevel(ordinalDrift)).toThrow();
  });

  it("requires target spans to cover native ticks and portable ordinals exactly", () => {
    const tickGap = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "segmentSpans", 1, "startNativeTick"],
      11,
    );
    expect(() => buildP7bTrainingReplayLevel(tickGap)).toThrow(
      "target segment native tick ranges must be adjacent",
    );
    const decisionOverlap = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "segmentSpans", 1, "startDecisionOrdinal"],
      1,
    );
    expect(() => buildP7bTrainingReplayLevel(decisionOverlap)).toThrow(
      "target segment decision ranges must be adjacent",
    );
    const boundaryEvidenceMismatch = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "segmentSpans", 1, "startBoundaryEvidence"],
      content("0"),
    );
    expect(() => buildP7bTrainingReplayLevel(boundaryEvidenceMismatch)).toThrow(
      "target segment boundary evidence must join exactly",
    );
    const incompleteTail = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "segmentSpans", 1, "endNativeTick"],
      19,
    );
    expect(() => buildP7bTrainingReplayLevel(incompleteTail)).toThrow(
      "target segments must end at certified replay totals",
    );
    const missingOrdinal = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "segmentSpans", 0, "startDecisionOrdinal"],
      null,
    );
    expect(() => buildP7bTrainingReplayLevel(missingOrdinal)).toThrow(
      "target segment decision ordinal range is incomplete",
    );

    const executedPrefix = structuredClone(levelFixture());
    const portableMs = (executedPrefix.variants as Record<string, unknown>[])[1]!
      .certifications as Record<string, Record<string, unknown>>;
    (portableMs.ms!.execution as Record<string, unknown>).executedDecisionCount = 4;
    ((portableMs.ms!.segmentSpans as Record<string, unknown>[])[1]!).endDecisionOrdinal = 4;
    expect(
      buildP7bTrainingReplayLevel(executedPrefix)
        .variants[1]!.certifications.ms.execution.executedDecisionCount,
    ).toBe(4);

    const overAuthored = mutateAt(
      levelFixture(),
      ["variants", 1, "certifications", "ms", "execution", "executedDecisionCount"],
      6,
    );
    expect(() => buildP7bTrainingReplayLevel(overAuthored)).toThrow(
      "ms executed decision count is out of bounds",
    );
  });

  it("exports the stable semantic segment validator", () => {
    expect(assertTrainingReplaySegmentV1(segments()[0]).anchor.kind).toBe("collect");
    expect(() => assertTrainingReplaySegmentV1({
      ...segments()[0], surpriseClock: 20,
    })).toThrow("training replay segment has an unsupported shape");
  });

  it("bounds the transformation ledger against source and output decisions", () => {
    const assignedDiagonalOrder = mutateAt(
      levelFixture(),
      ["variants", 1, "transforms", 0, "kind"],
      "diagonal-order-assigned",
    );
    expect(buildP7bTrainingReplayLevel(
      assignedDiagonalOrder,
    ).variants[1]!.transforms[0]!.kind).toBe("diagonal-order-assigned");

    const wrongOrdinal = mutateAt(
      levelFixture(), ["variants", 1, "transforms", 0, "ordinal"], 1,
    );
    expect(() => buildP7bTrainingReplayLevel(wrongOrdinal)).toThrow(
      "transform ordinal is invalid",
    );
    const outOfBounds = mutateAt(
      levelFixture(), ["variants", 1, "transforms", 0, "source", "endDecision"], 6,
    );
    expect(() => buildP7bTrainingReplayLevel(outOfBounds)).toThrow(
      "transform source decision range is out of bounds",
    );
    expect(() => buildP7bTrainingReplayLevel(
      mutateAt(levelFixture(), ["variants", 1, "transforms"], []),
    )).toThrow("changed portable replay requires a transform ledger");
  });

  it("supports an evidenced generated replacement without fabricated donor provenance", () => {
    const value = levelFixture();
    value.donorCoverage = {
      ms: { status: "missing", rawDonorId: null, detail: "no replay" },
      lynx: { status: "missing", rawDonorId: null, detail: "no replay" },
    };
    value.rawDonors = [];
    const portable = (value.variants as Record<string, unknown>[])[1]!;
    portable.lineage = {
      kind: "generated-replacement",
      rawDonorId: null,
      sourceVariantId: null,
      evidence: content("e"),
    };
    portable.transforms = [{
      ordinal: 0,
      kind: "generated-replacement",
      source: { startDecision: 0, endDecision: 0 },
      output: { startDecision: 0, endDecision: 5 },
      reason: "generated because no donor replay exists",
      evidence: content("f"),
    }];
    value.variants = [portable];

    const built = buildP7bTrainingReplayLevel(value);
    expect(built.rawDonors).toEqual([]);
    expect(built.variants[0]!.lineage.kind).toBe("generated-replacement");
  });

  it("does not let complete levels conceal pending classifications", () => {
    const pendingCertification = mutateAt(
      levelFixture(),
      ["variants", 0, "certifications", "lynx"],
      certification({
        status: "not-attempted",
        execution: emptyExecution("not-attempted"),
      }),
    );
    expect(() => buildP7bTrainingReplayLevel(pendingCertification)).toThrow(
      "complete level cannot contain pending certification",
    );
    expect(() => buildP7bTrainingReplayLevel(
      mutateAt(levelFixture(), ["variants", 0, "portability"], "pending"),
    )).toThrow("complete level cannot contain pending portability");
  });

  it("distinguishes an untouched pending row from genuinely missing donor coverage", () => {
    const pending = levelFixture();
    pending.donorCoverage = {
      ms: { status: "not-assessed", rawDonorId: null, detail: "processing has not started" },
      lynx: { status: "not-assessed", rawDonorId: null, detail: "processing has not started" },
    };
    pending.rawDonors = [];
    pending.variants = [];
    pending.processing = { status: "pending", detail: "queued for bounded processing" };
    pending.viewableVariantId = null;

    const built = buildP7bTrainingReplayLevel(pending);
    expect(built.donorCoverage.ms.status).toBe("not-assessed");
    expect(buildP7bTrainingPackSummary([built]).donorCoverage).toEqual({
      notAssessed: 2,
      bound: 0,
      missing: 0,
      invalid: 0,
    });

    const concealed = structuredClone(pending);
    concealed.processing = { status: "blocked", detail: "incorrectly classified" };
    expect(() => buildP7bTrainingReplayLevel(concealed)).toThrow(
      "not-assessed donor coverage requires an untouched pending row",
    );
  });

  it("canonicalizes, parses, rejects extensions, and enforces the byte ceiling", () => {
    const text = canonicalizeP7bTrainingReplayLevel(levelFixture());
    expect(parseP7bTrainingReplayLevel(text)).toEqual(
      buildP7bTrainingReplayLevel(levelFixture()),
    );
    expect(() => parseP7bTrainingReplayLevel(`${text}\n`)).toThrow(
      "training replay level is not canonical JSON",
    );
    expect(() => buildP7bTrainingReplayLevel({
      ...levelFixture(), surprise: true,
    })).toThrow("training replay level has an unsupported shape");
    expect(() => parseP7bTrainingReplayLevel(" ".repeat(
      P7B_MAX_LEVEL_CONTRACT_BYTES + 1,
    ))).toThrow("training replay level is oversized");
  });

  it("derives exact visible pack denominators and statuses", () => {
    const complete = buildP7bTrainingReplayLevel(levelFixture());
    const blockedInput = levelFixture();
    (blockedInput.source as Record<string, unknown>).levelNumber = 2;
    ((blockedInput.source as Record<string, unknown>).eligibility as
      Record<string, unknown>).status = "ineligible";
    ((blockedInput.source as Record<string, unknown>).eligibility as
      Record<string, unknown>).standardOnly = false;
    blockedInput.donorCoverage = {
      ms: { status: "missing", rawDonorId: null, detail: "no replay" },
      lynx: { status: "missing", rawDonorId: null, detail: "no replay" },
    };
    blockedInput.rawDonors = [];
    blockedInput.variants = [];
    blockedInput.processing = {
      status: "blocked", detail: "source is outside the standard-only scope",
    };
    blockedInput.viewableVariantId = null;

    const summary = buildP7bTrainingPackSummary([
      buildP7bTrainingReplayLevel(blockedInput), complete,
    ]);
    expect(summary).toEqual({
      artifact: "ccsolver-p7b-training-replay-pack-summary",
      version: 1,
      packId: "cclp1",
      totals: {
        levels: 2, targets: 4, viewableLevels: 1, rawDonors: 1,
        variants: 2, variantTargetCertifications: 4,
      },
      sources: { eligible: 1, ineligible: 1, standardOnly: 1 },
      processing: { pending: 0, complete: 1, blocked: 1 },
      donorCoverage: { notAssessed: 0, bound: 1, missing: 3, invalid: 0 },
      mapRelationships: { officialMap: 1, exactGameplayAlias: 0, editedRelative: 0 },
      variants: { raw: 1, portable: 1 },
      portability: {
        pending: 0, portable: 1, targetSpecific: 1,
        quirkRequired: 0, notPortable: 0,
      },
      executions: {
        native: 1, compiled: 2, compilationFailed: 0,
        notAttempted: 0, unavailable: 1,
      },
      certifications: { certified: 3, failed: 0, notAttempted: 0, unavailable: 1 },
    });
    expect(Object.isFrozen(summary.totals)).toBe(true);
  });

  it("rejects duplicate levels and mixed-pack summaries", () => {
    const first = buildP7bTrainingReplayLevel(levelFixture());
    expect(() => buildP7bTrainingPackSummary([first, first])).toThrow(
      "pack summary contains duplicate level 1",
    );
    const otherPack = mutateAt(levelFixture(), ["source", "packId"], "cclp4");
    ((otherPack.rawDonors as Record<string, unknown>[])[0]!).sourcePackId = "cclp4";
    const second = buildP7bTrainingReplayLevel(otherPack);
    expect(() => buildP7bTrainingPackSummary([first, second])).toThrow(
      "pack summary cannot mix packs",
    );
  });

  it("matches the shared canonical JSON kernel", () => {
    const built = buildP7bTrainingReplayLevel(levelFixture());
    expect(canonicalizeP7bTrainingReplayLevel(built)).toBe(canonicalizeJson(built));
  });
});

void ((value: P7bTrainingReplayLevelV1): P7bTrainingReplayLevelV1 => value);
