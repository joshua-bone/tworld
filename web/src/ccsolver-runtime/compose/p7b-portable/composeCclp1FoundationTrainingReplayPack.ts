import type {
  ProcessedCclp1FoundationSegment,
  ProcessedCclp1FoundationTarget,
} from "../p7b-cohort/buildCclp1FoundationCohort";
import {
  buildP7bTrainingPackSummary,
  buildP7bTrainingReplayLevel,
  type P7bReplayCertificationV1,
  type P7bReplayTargetV1,
  type P7bReplayTransformKindV1,
  type P7bTrainingPackSummaryV1,
  type P7bTrainingReplayLevelV1,
  type P7bTrainingReplaySegmentV1,
  type P7bTrainingReplayTargetSpanV1,
  type P7bTrainingReplayVariantV1,
} from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
} from "../p7b-training/portableReplayProfile";
import type {
  P7bPortableCandidate,
  P7bPortableCclp1FoundationCohort,
  P7bPortableCclp1FoundationLevel,
  P7bPortableCertification,
  P7bPortableTransformKind,
} from "./buildCclp1FoundationPortableCohort";
import type { P7GeneratedEvidenceBundleV1 } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  projectP7PortableHeldScheduleChanges,
  type P7TrainingBrowserReplayInputV1,
} from "../p7-training-execution/p7TrainingBrowserReplay";
import type {
  P7bCclp1FoundationBrowserReplayBundle,
  P7bCclp1FoundationBrowserReplayLevel,
} from "./buildCclp1FoundationBrowserReplayInputs";

export interface ComposedCclp1FoundationTrainingReplayPack {
  readonly levels: readonly P7bTrainingReplayLevelV1[];
  readonly summary: P7bTrainingPackSummaryV1;
  readonly generatedEvidence: {
    readonly pack: P7GeneratedEvidenceBundleV1;
    readonly levels: readonly {
      readonly occurrenceId: string;
      readonly levelNumber: number;
      readonly bundle: P7GeneratedEvidenceBundleV1;
    }[];
  };
}

type BrowserReplayIndex = ReadonlyMap<string, P7TrainingBrowserReplayInputV1>;

export function summarizeP7bPortableBlockers(
  blockers: P7bPortableCandidate["blockers"],
): string {
  const counts = new Map<P7bPortableCandidate["blockers"][number]["kind"], number>();
  for (const { kind } of blockers) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([kind, count]) => `${kind}×${count}`)
    .join(", ");
}

function browserKey(
  occurrenceId: string,
  variantId: string,
  target: P7bReplayTargetV1,
): string {
  return `${occurrenceId}\u0000${variantId}\u0000${target}`;
}

function sameReference(
  left: { readonly digest: string; readonly byteLength: number },
  right: { readonly digest: string; readonly byteLength: number },
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function browserReplayIndex(
  cohort: P7bPortableCclp1FoundationCohort,
  bundle: P7bCclp1FoundationBrowserReplayBundle,
): BrowserReplayIndex {
  if (
    bundle.artifact !== "ccsolver-p7b-cclp1-foundation-browser-replay-inputs"
    || bundle.version !== 1
    || bundle.cohortId !== cohort.cohortId
    || bundle.packId !== cohort.packId
    || bundle.levels.length !== cohort.levels.length
  ) throw new Error("training replay composition requires its exact proven browser bundle");
  const expected = new Set<string>();
  for (const level of cohort.levels) {
    for (const target of level.source.targets) {
      if (target.execution.terminal.kind === "won") {
        expected.add(browserKey(
          level.occurrenceId,
          target.target === "ms" ? "raw-ms" : "raw-lynx",
          target.target,
        ));
      }
    }
    if (level.candidate.status === "compiled") {
      for (const target of ["ms", "lynx"] as const) {
        if (level.candidate.certifications[target].status === "certified") {
          expected.add(browserKey(level.occurrenceId, "portable", target));
        }
      }
    }
  }
  const result = new Map<string, P7TrainingBrowserReplayInputV1>();
  for (const browserLevel of bundle.levels) {
    const level = cohort.levels.find(({ occurrenceId }) => (
      occurrenceId === browserLevel.occurrenceId
    ));
    if (
      level === undefined
      || browserLevel.levelNumber !== level.source.selection.levelNumber
    ) throw new Error("proven browser bundle contains an unknown level identity");
    if (level.candidate.status === "compiled") {
      if (
        browserLevel.portableDecisionTrace === null
        || !sameReference(
          browserLevel.portableDecisionTrace.content,
          level.candidate.traceContent,
        )
      ) throw new Error("proven browser bundle lost its portable decision trace binding");
    } else if (browserLevel.portableDecisionTrace !== null) {
      throw new Error("blocked portable level cannot carry a browser decision trace");
    }
    const evidenceDigests = new Set([
      ...bundle.packEvidence.blobs,
      ...browserLevel.generatedEvidence.blobs,
    ].map(({ content }) => content.digest));
    for (const input of browserLevel.browserReplays) {
      const key = browserKey(browserLevel.occurrenceId, input.variantId, input.target);
      if (!expected.has(key) || result.has(key)) {
        throw new Error(`proven browser bundle contains an unexpected or duplicate cell: ${key}`);
      }
      if (
        !evidenceDigests.has(input.content.digest)
        || !evidenceDigests.has(input.parity.evidence.digest)
      ) throw new Error("proven browser bundle has a dangling generated evidence reference");
      result.set(key, input);
    }
  }
  if (result.size !== expected.size || [...expected].some((key) => !result.has(key))) {
    throw new Error("proven browser bundle does not cover the exact executable replay matrix");
  }
  return result;
}

function checkedBrowserReplay(input: {
  readonly index: BrowserReplayIndex;
  readonly occurrenceId: string;
  readonly variantId: "raw-ms" | "raw-lynx" | "portable";
  readonly target: P7bReplayTargetV1;
  readonly sourceReplayContent: { readonly digest: string; readonly byteLength: number };
  readonly terminalNativeTick: number;
  readonly outcome: "won" | "loss" | "diverged" | "timeout";
  readonly segments: readonly ProcessedCclp1FoundationSegment[];
}): P7TrainingBrowserReplayInputV1 {
  const replay = input.index.get(browserKey(input.occurrenceId, input.variantId, input.target));
  if (replay === undefined) throw new Error("required proven browser replay is missing");
  const receipt = replay.parity.receipt;
  if (
    replay.variantId !== input.variantId
    || replay.target !== input.target
    || replay.replay.variantId !== input.variantId
    || replay.replay.target !== input.target
    || !sameReference(replay.replay.sourceReplayContent, input.sourceReplayContent)
    || replay.replay.terminalNativeTick !== input.terminalNativeTick
    || receipt.occurrenceId !== input.occurrenceId
    || receipt.variantId !== input.variantId
    || receipt.target !== input.target
    || receipt.transport !== replay.replay.transport
    || receipt.nativeBoundaryClock !== "exclusive-advance-count-v1"
    || !sameReference(receipt.sourceReplayContent, input.sourceReplayContent)
    || !sameReference(receipt.browserReplayContent, replay.content)
    || receipt.expected.outcome !== input.outcome
    || receipt.observed.outcome !== input.outcome
    || receipt.expected.terminalNativeTick !== input.terminalNativeTick
    || receipt.observed.terminalNativeTick !== input.terminalNativeTick
    || receipt.status !== "matched"
  ) throw new Error("proven browser replay identity or terminal parity does not match execution");
  if (replay.replay.transport === "manual-held-schedule") {
    const projection = receipt.portableScheduleProjection;
    if (
      projection === null
      || projection.executedChangeCount !== replay.replay.changes.length
      || projection.authoredChangeCount < projection.executedChangeCount
      || projection.omittedPostTerminalChanges.length
        !== projection.authoredChangeCount - projection.executedChangeCount
    ) throw new Error("portable browser replay executed-prefix binding drifted");
  } else if (receipt.portableScheduleProjection !== null) {
    throw new Error("native browser replay cannot carry a portable schedule projection");
  }
  const expectedBoundaries = input.segments.map(({ segmentId, index, start, end }) => ({
    segmentId,
    index,
    startNativeTick: start.tick,
    endNativeTick: end.tick,
    startBoundaryEvidence: start.checkpoint,
    endBoundaryEvidence: end.checkpoint,
  }));
  for (const boundaries of [receipt.expected.segmentBoundaries, receipt.observed.segmentBoundaries]) {
    if (
      boundaries.length !== expectedBoundaries.length
      || boundaries.some((boundary, index) => {
        const expectedBoundary = expectedBoundaries[index];
        return expectedBoundary === undefined
          || boundary.segmentId !== expectedBoundary.segmentId
          || boundary.index !== expectedBoundary.index
          || boundary.startNativeTick !== expectedBoundary.startNativeTick
          || boundary.endNativeTick !== expectedBoundary.endNativeTick
          || !sameReference(
            boundary.startBoundaryEvidence,
            expectedBoundary.startBoundaryEvidence,
          )
          || !sameReference(
            boundary.endBoundaryEvidence,
            expectedBoundary.endBoundaryEvidence,
          );
      })
    ) throw new Error("proven browser replay segment-boundary parity does not match execution");
  }
  return replay;
}

function rawDonorId(
  levelNumber: number,
  target: P7bReplayTargetV1,
  declared?: string,
): string {
  return declared ?? `cclp1-${String(levelNumber).padStart(3, "0")}-${target}-official`;
}

function semanticSegments(
  segments: readonly ProcessedCclp1FoundationSegment[],
): P7bTrainingReplaySegmentV1[] {
  return segments.map(({ segmentId, index, label, anchor }) => ({
    segmentId,
    index,
    label,
    anchor,
  }));
}

function rawTargetSpans(
  segments: readonly ProcessedCclp1FoundationSegment[],
): P7bTrainingReplayTargetSpanV1[] {
  return segments.map(({ segmentId, index, start, end }) => ({
    segmentId,
    index,
    startNativeTick: start.tick,
    endNativeTick: end.tick,
    startDecisionOrdinal: null,
    endDecisionOrdinal: null,
    startBoundaryEvidence: start.checkpoint,
    endBoundaryEvidence: end.checkpoint,
  }));
}

function unavailableRawCertification(
  declaredTarget: P7bReplayTargetV1,
  executionTarget: P7bReplayTargetV1,
): P7bReplayCertificationV1 {
  return {
    status: "unavailable",
    outcome: "unsupported",
    evidence: null,
    terminalNativeTick: null,
    detail: `immutable ${declaredTarget} donor was not reinterpreted as a ${executionTarget} replay`,
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
      detail: "raw donor execution is available only on its declared native target",
    },
    segmentSelection: null,
    segmentSpans: [],
  };
}

function nativeRawCertification(
  target: ProcessedCclp1FoundationTarget,
  browserReplay: P7TrainingBrowserReplayInputV1 | null,
): P7bReplayCertificationV1 {
  const outcome = target.execution.terminal.kind === "won"
    ? "won"
    : target.execution.terminal.kind === "timed-out"
      || (
        target.execution.terminal.kind === "lost"
        && target.execution.terminal.cause === "cc1:p7b-replay-budget"
      )
      ? "timeout"
      : "loss";
  const certified = outcome === "won";
  if (certified !== (browserReplay !== null)) {
    throw new Error("native browser replay publication drifted from certification");
  }
  return {
    status: certified ? "certified" : "failed",
    outcome,
    evidence: target.execution.eventEvidence,
    terminalNativeTick: target.execution.tickCount,
    detail: certified
      ? `immutable ${target.target} donor won under the real ${target.target} engine`
      : `immutable ${target.target} donor terminated ${outcome} on the official map`,
    execution: {
      status: "native",
      decisionProfile: {
        profileId: `native-${target.target}-tws-v1`,
        profileRevision: `tworld-native-${target.target}-tws-v1`,
        clockBasis: "native-tick",
        cadenceHz: 20,
        profileContent: null,
      },
      executedDecisionCount: target.execution.decisionCount,
      nativeBoundaryClock: "exclusive-advance-count-v1",
      nativeTickRateHz: 20,
      replayContent: target.rawReplayContent,
      browserReplayContent: browserReplay?.content ?? null,
      browserReplayParityReceipt: browserReplay?.parity.evidence ?? null,
      browserReplayTransport: browserReplay === null ? null : "native-replay-pulses",
      compilerRevision: null,
      compilationReceipt: null,
      detail: "immutable TWS entry retained byte-for-byte; exact executed prefix replayed",
    },
    segmentSelection: target.execution.segmentSelection,
    segmentSpans: certified ? rawTargetSpans(target.segments) : [],
  };
}

function rawVariant(
  occurrenceId: string,
  target: ProcessedCclp1FoundationTarget,
  browserIndex: BrowserReplayIndex,
): P7bTrainingReplayVariantV1 {
  const otherTarget = target.target === "ms" ? "lynx" : "ms";
  const variantId = target.target === "ms" ? "raw-ms" : "raw-lynx";
  const browserReplay = target.execution.terminal.kind === "won"
    ? checkedBrowserReplay({
        index: browserIndex,
        occurrenceId,
        variantId,
        target: target.target,
        sourceReplayContent: target.rawReplayContent,
        terminalNativeTick: target.execution.tickCount,
        outcome: "won",
        segments: target.segments,
      })
    : null;
  const native = nativeRawCertification(target, browserReplay);
  const unavailable = unavailableRawCertification(target.target, otherTarget);
  return {
    variantId,
    kind: "raw",
    replayContent: target.rawReplayContent,
    decisionCount: target.expandedSolution.moves.length,
    portableProfile: null,
    lineage: {
      kind: "raw-donor",
      rawDonorId: rawDonorId(target.donor.sourceLevelNumber, target.target, target.donorId),
      sourceVariantId: null,
      evidence: null,
    },
    portability: target.execution.terminal.kind === "won"
      ? "target-specific"
      : "not-portable",
    transforms: [],
    segments: semanticSegments(target.segments),
    certifications: target.target === "ms"
      ? { ms: native, lynx: unavailable }
      : { ms: unavailable, lynx: native },
  };
}

export function contractTransformKind(
  kind: P7bPortableTransformKind,
): P7bReplayTransformKindV1 {
  switch (kind) {
    case "adjacent-held-pulse-merged":
      return "redundant-input-removed";
    case "diagonal-order-assigned":
      return "diagonal-order-assigned";
    case "diagonal-order-derived":
      return "diagonal-expanded";
    case "input-pulse-normalized":
      return "decision-boundary-rescheduled";
    case "native-odd-tick-quantized":
      return "input-rescheduled";
  }
}

function portableCertification(
  occurrenceId: string,
  target: P7bReplayTargetV1,
  certification: P7bPortableCertification,
  candidate: Extract<P7bPortableCandidate, { readonly status: "compiled" }>,
  browserIndex: BrowserReplayIndex,
): P7bReplayCertificationV1 {
  if (
    certification.status === "not-attempted"
    || certification.execution.status !== "compiled"
    || certification.execution.compilerRevision === null
    || certification.execution.replayContent === null
    || certification.execution.compilationReceipt === null
  ) {
    throw new Error("compiled portable candidate contains an unevaluated target");
  }
  const certified = certification.status === "certified";
  if (
    certified
    && (
      certification.terminalNativeTick === null
      || certification.initialCheckpoint === null
      || certification.finalCheckpoint === null
    )
  ) {
    throw new Error("portable target certificate lacks its exact native boundary evidence");
  }
  if (
    certified
    && (
      certification.segments.length !== candidate.segments.length
      || certification.segments.some((segment, index) => (
        segment.segmentId !== candidate.segments[index]?.segmentId
        || segment.index !== index
      ))
    )
  ) {
    throw new Error("portable target spans do not align with variant semantic segments");
  }
  if (certification.terminalNativeTick === null) {
    throw new Error("compiled portable target lacks its observed terminal boundary");
  }
  if (certification.outcome === "not-run") {
    throw new Error("compiled portable target lacks an observed outcome");
  }
  const browserReplay = certified
    ? checkedBrowserReplay({
        index: browserIndex,
        occurrenceId,
        variantId: "portable",
        target,
        sourceReplayContent: certification.execution.replayContent,
        terminalNativeTick: certification.terminalNativeTick,
        outcome: "won",
        segments: certification.segments,
      })
    : null;
  if (browserReplay !== null && browserReplay.replay.transport !== "manual-held-schedule") {
    throw new Error("portable browser replay transport is invalid");
  }
  const executedDecisionCount = projectP7PortableHeldScheduleChanges(
    candidate.trace,
    certification.terminalNativeTick,
  ).changes.length;
  if (
    browserReplay !== null
    && browserReplay.replay.transport === "manual-held-schedule"
    && browserReplay.replay.changes.length !== executedDecisionCount
  ) throw new Error("portable browser replay executed prefix drifted from compilation");
  return {
    status: certification.status,
    outcome: certification.outcome,
    evidence: certification.evidence,
    terminalNativeTick: certification.terminalNativeTick,
    detail: certification.detail,
    execution: {
      status: "compiled",
      decisionProfile: {
        profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
        profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
        clockBasis: "portable-decision",
        cadenceHz: 10,
        profileContent: candidate.profileContent,
      },
      executedDecisionCount,
      nativeBoundaryClock: "exclusive-advance-count-v1",
      nativeTickRateHz: 20,
      replayContent: certification.execution.replayContent,
      browserReplayContent: browserReplay?.content ?? null,
      browserReplayParityReceipt: browserReplay?.parity.evidence ?? null,
      browserReplayTransport: browserReplay === null ? null : "manual-held-schedule",
      compilerRevision: certification.execution.compilerRevision,
      compilationReceipt: certification.execution.compilationReceipt,
      detail: "10 Hz held-packet trace compiled to two real target-native ticks per logic step",
    },
    segmentSelection: certification.segmentSelection,
    segmentSpans: certified
      ? certification.segments.map(({ segmentId, index, start, end }) => ({
          segmentId,
          index,
          startNativeTick: start.tick,
          endNativeTick: end.tick,
          startDecisionOrdinal: start.decision,
          endDecisionOrdinal: end.decision,
          startBoundaryEvidence: start.checkpoint,
          endBoundaryEvidence: end.checkpoint,
        }))
      : [],
  };
}

function portableVariant(
  level: P7bPortableCclp1FoundationLevel,
  candidate: Extract<P7bPortableCandidate, { readonly status: "compiled" }>,
  browserIndex: BrowserReplayIndex,
): P7bTrainingReplayVariantV1 {
  if (level.lineageEvidence === null) {
    throw new Error("compiled portable candidate lacks its lineage evidence");
  }
  return {
    variantId: "portable",
    kind: "portable",
    replayContent: candidate.traceContent,
    decisionCount: candidate.trace.changes.length,
    portableProfile: {
      profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
      profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
      profileContent: candidate.profileContent,
      decisionTraceContent: candidate.traceContent,
      changeCount: candidate.trace.changes.length,
      terminalLogicStep: candidate.trace.terminalLogicStep,
    },
    lineage: {
      kind: "normalized-donor",
      rawDonorId: level.lineage.donorId,
      sourceVariantId: level.lineage.sourceVariantId,
      evidence: level.lineageEvidence,
    },
    portability: candidate.portability,
    transforms: candidate.transforms.map((entry, ordinal) => ({
      ordinal,
      kind: contractTransformKind(entry.kind),
      // Detailed affected source ordinals live in the content-addressed
      // evidence. Zero-width policy markers keep independently applicable
      // transforms ordered without falsely claiming disjoint source spans.
      source: { startDecision: 0, endDecision: 0 },
      output: { startDecision: 0, endDecision: 0 },
      reason: entry.detail,
      evidence: candidate.transformEvidence,
    })),
    segments: candidate.segments,
    certifications: {
      ms: portableCertification(
        level.occurrenceId,
        "ms",
        candidate.certifications.ms,
        candidate,
        browserIndex,
      ),
      lynx: portableCertification(
        level.occurrenceId,
        "lynx",
        candidate.certifications.lynx,
        candidate,
        browserIndex,
      ),
    },
  };
}

function composeLevel(
  level: P7bPortableCclp1FoundationLevel,
  browserIndex: BrowserReplayIndex,
): P7bTrainingReplayLevelV1 {
  const { source } = level;
  const rawVariants = source.targets.map((target) => (
    rawVariant(level.occurrenceId, target, browserIndex)
  ));
  const variants = level.candidate.status === "compiled"
    ? [...rawVariants, portableVariant(level, level.candidate, browserIndex)]
    : rawVariants;
  const viewableVariantId = level.candidate.status === "compiled"
    && (
      level.candidate.certifications.ms.status === "certified"
      || level.candidate.certifications.lynx.status === "certified"
    )
    ? "portable"
    : rawVariants.find((variant) => (
        variant.certifications.ms.status === "certified"
        || variant.certifications.lynx.status === "certified"
      ))?.variantId ?? null;
  const rawDonors = source.targets.map((target) => ({
    donorId: rawDonorId(source.selection.levelNumber, target.target, target.donorId),
    target: target.target,
    origin: "official-pack" as const,
    sourcePackId: "cclp1",
    sourceLevelNumber: source.selection.levelNumber,
    sourceNormalizedGameplaySha256: source.selection.normalizedGameplaySha256,
    sourceLevelContent: source.levelContent,
    replayContent: target.rawReplayContent,
    mapRelationship: "official-map" as const,
    mapComparisonEvidence: null,
  }));
  const donorCoverage = (target: P7bReplayTargetV1) => {
    const donor = source.targets.find((entry) => entry.target === target);
    return donor === undefined
      ? { status: "missing" as const, rawDonorId: null, detail: `no ${target} donor candidate is available` }
      : {
          status: "bound" as const,
          rawDonorId: rawDonorId(source.selection.levelNumber, target, donor.donorId),
          detail: `deterministic ${target} donor entry is bound`,
        };
  };
  return buildP7bTrainingReplayLevel({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "cclp1",
      levelNumber: source.selection.levelNumber,
      title: source.selection.title,
      normalizedGameplaySha256: source.selection.normalizedGameplaySha256,
      levelContent: source.levelContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: `${source.eligibility.sourceScope.policyRevision}+${source.eligibility.legacyValidity.policyRevision}`,
        evidence: source.eligibilityEvidence,
      },
    },
    donorCoverage: {
      ms: donorCoverage("ms"),
      lynx: donorCoverage("lynx"),
    },
    rawDonors,
    variants,
    processing: {
      status: viewableVariantId === null ? "blocked" : "complete",
      detail: viewableVariantId === null
        ? "donor executions completed without a certified replay"
        : level.candidate.status === "compiled"
          ? `raw donors certified and portable candidate classified ${level.candidate.portability}`
          : `raw donors certified; portable candidate blocked: ${summarizeP7bPortableBlockers(level.candidate.blockers)}`,
    },
    viewableVariantId,
  });
}

export function composeCclp1FoundationTrainingReplayLevel(
  level: P7bPortableCclp1FoundationLevel,
  browserLevel: P7bCclp1FoundationBrowserReplayLevel,
): P7bTrainingReplayLevelV1 {
  if (
    browserLevel.occurrenceId !== level.occurrenceId
    || browserLevel.levelNumber !== level.source.selection.levelNumber
    || (level.candidate.status === "compiled") !== (browserLevel.portableDecisionTrace !== null)
  ) throw new Error("single-level training replay composition identity drifted");
  if (
    level.candidate.status === "compiled"
    && !sameReference(browserLevel.portableDecisionTrace!.content, level.candidate.traceContent)
  ) throw new Error("single-level training replay composition lost its portable trace");
  const expected = new Set([
    ...level.source.targets.flatMap((target) => target.execution.terminal.kind === "won"
      ? [browserKey(
          level.occurrenceId,
          target.target === "ms" ? "raw-ms" : "raw-lynx",
          target.target,
        )]
      : []),
    ...(level.candidate.status === "compiled"
      ? (["ms", "lynx"] as const).flatMap((target) => (
          level.candidate.status === "compiled"
          && level.candidate.certifications[target].status === "certified"
            ? [browserKey(level.occurrenceId, "portable", target)]
            : []
        ))
      : []),
  ]);
  const index = new Map<string, P7TrainingBrowserReplayInputV1>();
  for (const replay of browserLevel.browserReplays) {
    const key = browserKey(level.occurrenceId, replay.variantId, replay.target);
    if (!expected.has(key) || index.has(key)) {
      throw new Error(`single-level training replay composition has unexpected cell ${key}`);
    }
    index.set(key, replay);
  }
  if (index.size !== expected.size) {
    throw new Error("single-level training replay composition is missing a proven cell");
  }
  return composeLevel(level, index);
}

export function composeCclp1FoundationTrainingReplayPack(
  input: P7bPortableCclp1FoundationCohort,
  browserInputs: P7bCclp1FoundationBrowserReplayBundle,
): ComposedCclp1FoundationTrainingReplayPack {
  if (
    input.cohortId !== "p7b-cclp1-foundation-portable"
    || input.packId !== "cclp1"
    || input.levels.length !== 12
  ) {
    throw new Error("training replay composition requires the exact portable CCLP1 cohort");
  }
  const browserIndex = browserReplayIndex(input, browserInputs);
  const levels = input.levels.map((level) => composeLevel(level, browserIndex));
  return {
    levels,
    summary: buildP7bTrainingPackSummary(levels),
    generatedEvidence: {
      pack: browserInputs.packEvidence,
      levels: browserInputs.levels.map((level) => ({
        occurrenceId: level.occurrenceId,
        levelNumber: level.levelNumber,
        bundle: level.generatedEvidence,
      })),
    },
  };
}
