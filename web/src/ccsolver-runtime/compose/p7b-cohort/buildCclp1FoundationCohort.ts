import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
  type SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  advanceLynxInteractiveSession,
  createLynxReplaySession,
  type LynxInteractiveSessionState,
  type LynxNativeCausalEvent,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  advanceMsInteractiveSession,
  createMsReplaySession,
  type MsInteractiveSessionState,
  type MsNativeCausalEvent,
} from "@ruleset-ms/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  digestLynxInteractiveSession,
  digestMsInteractiveSession,
} from "@undo-runtime/impl/sessionDigest";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedCanonicalDigestV1,
  type P7GeneratedEvidenceBundleV1,
} from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7TrainingEventAccumulator,
  type P7TrainingEventStreamDigestV1,
  type P7TrainingRetainedCausalEvent,
} from "../p7-training-execution/p7TrainingEventAccumulator";
import {
  P7B_MAX_SEGMENTS_PER_VARIANT,
  P7B_SEGMENT_SELECTION_POLICY_REVISION,
  selectP7bSegmentCandidateOrdinals,
  type P7bSegmentSelectionV1,
} from "../p7b-training/trainingReplayContract";
import { CCLP1_FOUNDATION_LIMITS } from "./cclp1FoundationCohort";
import type {
  LoadedCclp1FoundationCohort,
  LoadedCclp1FoundationLevel,
  LoadedCclp1FoundationTarget,
} from "./loadCclp1FoundationCohort";

const UINT31_MASK = 0x7fff_ffff;
const NATIVE_REPLAY_TICK_MODULUS = 0x80_0000;

export type Cclp1FoundationResidual =
  | "diagonal-input"
  | "mouse-input"
  | "nondefault-flags"
  | "nondefault-stepping";

export interface Cclp1FoundationSegmentBoundary {
  readonly tick: number;
  readonly decision: number;
  readonly checkpoint: BlobReferenceV1;
}

export interface ProcessedCclp1FoundationSegment {
  readonly segmentId: string;
  readonly index: number;
  readonly label: string;
  readonly start: Cclp1FoundationSegmentBoundary;
  readonly end: Cclp1FoundationSegmentBoundary;
  readonly anchor: {
    readonly kind: "button" | "collect" | "exit" | "open" | "socket" | "transport";
    readonly label: string;
  };
}

export interface ProcessedCclp1FoundationTarget extends LoadedCclp1FoundationTarget {
  readonly rawReplayContent: BlobReferenceV1;
  readonly execution: {
    readonly terminal: Exclude<SolverTerminalResult, { readonly kind: "running" }>;
    readonly tickCount: number;
    readonly decisionCount: number;
    readonly advanceTickCount: number;
    readonly eventCount: number;
    readonly eventRetention: {
      readonly status: "digest-and-boundary-events";
      readonly heavyVerification: "reexecute-authoritative-engine";
    };
    readonly eventEvidence: BlobReferenceV1;
    readonly fullEventStream: P7TrainingEventStreamDigestV1;
    readonly segmentSelection: P7bSegmentSelectionV1;
    readonly initialCheckpoint: BlobReferenceV1;
    readonly finalCheckpoint: BlobReferenceV1;
  };
  readonly segments: readonly ProcessedCclp1FoundationSegment[];
  /**
   * Minimal authoritative Chip movement decisions retained for portable-input
   * ordering. The complete native stream is digest-bound by
   * execution.eventEvidence; heavy verification re-executes the engine.
   */
  readonly inputDecisionEvents: readonly Cclp1FoundationInputDecisionEvent[];
  readonly candidateEligibility: {
    /** Hybrid/portable profile selection is deliberately outside this pass. */
    readonly status: "not-assessed";
    readonly residuals: readonly Cclp1FoundationResidual[];
    readonly detail: string;
  };
}

export interface Cclp1FoundationInputDecisionEvent {
  readonly kind: "movement-started" | "movement-blocked";
  readonly nativeTick: number;
  readonly withinTickOrder: number;
  readonly direction: number;
  readonly movementRole: "self" | "push" | "forced";
  readonly decisionSource: "current-input" | "queued-input" | "forced" | null;
}

export interface ProcessedCclp1FoundationLevel {
  readonly selection: LoadedCclp1FoundationLevel["selection"];
  readonly manifestCase: LoadedCclp1FoundationLevel["manifestCase"];
  readonly validityOccurrence: LoadedCclp1FoundationLevel["validityOccurrence"];
  readonly eligibility: LoadedCclp1FoundationLevel["eligibility"];
  /** Detached exact official map input retained for bounded recompilation. */
  readonly source: LoadedCclp1FoundationLevel["source"];
  readonly levelContent: BlobReferenceV1;
  readonly eligibilityEvidence: BlobReferenceV1;
  readonly targets: readonly ProcessedCclp1FoundationTarget[];
  /** Exact generated proof bytes scoped to this occurrence only. */
  readonly generatedEvidence: P7GeneratedEvidenceBundleV1;
}

export interface ProcessedCclp1FoundationCohort {
  readonly cohortId: "p7b-cclp1-foundation";
  readonly packId: "cclp1";
  readonly levels: readonly ProcessedCclp1FoundationLevel[];
  readonly summary: {
    readonly levelCount: 12;
    readonly targetCount: 24;
    readonly replayRunCount: 24;
    readonly advanceTickCount: number;
  };
}

interface PendingBoundary {
  readonly segmentId: string;
  readonly tick: number;
  readonly decision: number;
  readonly checkpoint: BlobReferenceV1;
  readonly anchor: ProcessedCclp1FoundationSegment["anchor"];
  readonly semanticKey: string;
}

interface PendingBoundaryCandidate {
  readonly candidateOrdinal: number;
  readonly segmentId: string;
  readonly tick: number;
  readonly decision: number;
  readonly checkpoint: BlobReferenceV1 | null;
  readonly evidence: {
    readonly coincidentEventCount: number;
    readonly coincidentAnchorCount: number;
    readonly orderedAnchorTranscript: P7GeneratedCanonicalDigestV1;
    readonly anchorEvent: FoundationNativeCausalEvent;
  } | null;
  readonly anchor: ProcessedCclp1FoundationSegment["anchor"];
  readonly semanticKey: string;
}

export type FoundationNativeCausalEvent = P7TrainingRetainedCausalEvent & {
  readonly kind: string;
  readonly nativeTick: number;
  readonly tileId: number | null;
  readonly action?: string | null;
  readonly direction?: number | null;
  readonly movementRole?: "self" | "push" | "forced";
  readonly decisionSource?: "current-input" | "queued-input" | "forced";
  readonly actorSerial: number | null;
  readonly before: { readonly pos: number; readonly z: number } | null;
  readonly after: { readonly pos: number; readonly z: number } | null;
  readonly withinTickOrder: number;
};

function progress(stage: string): void {
  if (process.env.TWORLD_P7B_PROGRESS === "1") {
    process.stderr.write(`[p7b:cohort] ${stage}\n`);
  }
}

export function countNativeReplayDecisionsThrough(
  target: "ms" | "lynx",
  moves: LoadedCclp1FoundationTarget["expandedSolution"]["moves"],
  tick: number,
): number {
  void target;
  let count = 0;
  while (
    count < moves.length
    && moves[count]!.when % NATIVE_REPLAY_TICK_MODULUS < tick
  ) count += 1;
  return count;
}

function displaySemanticType(value: string): string {
  return value.replace(/^cc1:/u, "").replaceAll("-", " ");
}

function positionKey(position: FoundationNativeCausalEvent["before"]): string {
  return position === null ? "none" : `${position.z}:${position.pos}`;
}

function semanticKeyForNativeEvent(event: FoundationNativeCausalEvent): string {
  if (event.p7Aggregation !== undefined) {
    return [
      "toggle-walls",
      event.sourceTileId ?? "none",
      positionKey(event.sourcePosition ?? null),
      event.p7Aggregation.semanticAction,
    ].join(":");
  }
  return [
    event.kind,
    event.tileId ?? "none",
    positionKey(event.before),
    positionKey(event.after),
    event.action ?? "none",
  ].join(":");
}

function anchorFromEvent(
  event: FoundationNativeCausalEvent,
): ProcessedCclp1FoundationSegment["anchor"] | null {
  if (event.p7Aggregation !== undefined) {
    return {
      kind: "button",
      label: `Activate ${displaySemanticType(event.p7Aggregation.semanticAction)}`,
    };
  }
  switch (event.kind) {
    case "complete-level":
      return { kind: "exit", label: "Enter the exit" };
    case "collect":
      return {
        kind: "collect",
        label: "Collect a resource",
      };
    case "teleport":
      return { kind: "transport", label: "Resolve a teleport" };
    case "device-activated":
      return {
        kind: "button",
        label: event.action == null
          ? "Activate a device"
          : `Activate ${displaySemanticType(event.action)}`,
      };
    case "open-socket":
      return { kind: "socket", label: "Open the socket" };
    case "open-door":
      return { kind: "open", label: "Open a door" };
    default:
      return null;
  }
}

function chooseAnchorEvent(
  events: readonly FoundationNativeCausalEvent[],
): {
  readonly anchor: ProcessedCclp1FoundationSegment["anchor"];
  readonly event: FoundationNativeCausalEvent;
} | null {
  let selected: {
    readonly anchor: ProcessedCclp1FoundationSegment["anchor"];
    readonly event: FoundationNativeCausalEvent;
  } | null = null;
  for (const event of events) {
    const candidate = anchorFromEvent(event);
    if (candidate === null) continue;
    selected = { anchor: candidate, event };
    // A winning terminal is the final semantic authority for its tick.
    if (candidate.kind === "exit") return selected;
  }
  return selected;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return normalized === "" ? "segment" : normalized;
}

function buildSegments(
  initial: BlobReferenceV1,
  boundaries: readonly PendingBoundary[],
): ProcessedCclp1FoundationSegment[] {
  const segments: ProcessedCclp1FoundationSegment[] = [];
  let start: Cclp1FoundationSegmentBoundary = {
    tick: 0,
    decision: 0,
    checkpoint: initial,
  };
  for (const boundary of boundaries) {
    if (boundary.tick <= start.tick) continue;
    const index = segments.length;
    const end = {
      tick: boundary.tick,
      decision: boundary.decision,
      checkpoint: boundary.checkpoint,
    };
    segments.push({
      segmentId: boundary.segmentId,
      index,
      label: boundary.anchor.label,
      start,
      end,
      anchor: boundary.anchor,
    });
    start = end;
  }
  return segments;
}

/**
 * Coalesces a dense causal journal into bounded, chronological route chapters.
 * Each retained boundary is the final semantic anchor in an equal-sized slice,
 * so the whole route remains covered and the terminal boundary is retained.
 */
function viewableBoundaryCandidates(
  candidates: readonly PendingBoundaryCandidate[],
): readonly PendingBoundaryCandidate[] {
  return selectP7bSegmentCandidateOrdinals(
    candidates.length,
    "viewable-route-chapters",
  ).map((ordinal) => candidates[ordinal]!);
}

export interface SegmentFoundationNativeEventsInput {
  readonly occurrenceId: string;
  readonly target: "ms" | "lynx";
  readonly events: readonly FoundationNativeCausalEvent[];
  readonly initialCheckpoint: BlobReferenceV1;
  readonly finalCheckpoint: BlobReferenceV1;
  /** Exclusive target-native terminal tick. */
  readonly terminalNativeTick: number;
  readonly terminalDecisionCount: number;
  readonly decisionCountAtTick: (exclusiveNativeTick: number) => number;
  /** True only when this execution won and therefore has viewable chapters. */
  readonly retainViewableSegments: boolean;
  readonly evidence: P7GeneratedEvidenceStore;
}

export interface SegmentedFoundationNativeEvents {
  readonly segments: readonly ProcessedCclp1FoundationSegment[];
  readonly selection: P7bSegmentSelectionV1;
}

/**
 * Projects the same authoritative native causal event seam for raw and
 * compiled replay executions. Semantic IDs do not carry a target prefix;
 * native clocks and checkpoints remain target-local in the returned spans.
 */
export async function segmentFoundationNativeEvents(
  input: SegmentFoundationNativeEventsInput,
): Promise<SegmentedFoundationNativeEvents> {
  const eventsByTick = new Map<number, FoundationNativeCausalEvent[]>();
  for (const event of input.events) {
    const tick = event.nativeTick + 1;
    if (
      tick <= 0
      || tick > input.terminalNativeTick
      || anchorFromEvent(event) === null
    ) continue;
    const events = eventsByTick.get(tick) ?? [];
    events.push(event);
    eventsByTick.set(tick, events);
  }
  const unnumberedCandidates: Omit<
    PendingBoundaryCandidate,
    "candidateOrdinal" | "segmentId"
  >[] = [];
  for (const [tick, events] of [...eventsByTick].sort(([left], [right]) => left - right)) {
    const selected = chooseAnchorEvent(events);
    if (selected === null) continue;
    const orderedAnchorTranscript = await input.evidence.digestCanonical({
      eventsOrder: "within-tick-order",
      events,
    }, CCLP1_FOUNDATION_LIMITS.maximumEventStreamCanonicalBytes);
    unnumberedCandidates.push({
      tick,
      decision: input.decisionCountAtTick(tick),
      checkpoint: null,
      evidence: {
        coincidentEventCount: events.reduce((sum, event) => (
          sum + (event.p7Aggregation?.eventCount ?? 1)
        ), 0),
        coincidentAnchorCount: events.length,
        orderedAnchorTranscript,
        anchorEvent: selected.event,
      },
      anchor: selected.anchor,
      semanticKey: semanticKeyForNativeEvent(selected.event),
    });
  }
  if (input.retainViewableSegments) {
    const existingFinal = unnumberedCandidates.at(-1);
    const finalBoundary: Omit<
      PendingBoundaryCandidate,
      "candidateOrdinal" | "segmentId"
    > = {
      tick: input.terminalNativeTick,
      decision: input.terminalDecisionCount,
      checkpoint: input.finalCheckpoint,
      evidence: existingFinal?.tick === input.terminalNativeTick
        ? existingFinal.evidence
        : null,
      anchor: { kind: "exit", label: "Enter the exit" },
      semanticKey: "complete-level:exit",
    };
    if (existingFinal?.tick === input.terminalNativeTick) {
      unnumberedCandidates[unnumberedCandidates.length - 1] = finalBoundary;
    } else {
      unnumberedCandidates.push(finalBoundary);
    }
  }
  const candidates = unnumberedCandidates.map((candidate, candidateOrdinal) => ({
    ...candidate,
    candidateOrdinal,
    // Preserve the ordinal in the complete pre-selection semantic stream so
    // sampling never renumbers a retained anchor.
    segmentId: `${slug(candidate.semanticKey)}-${String(candidateOrdinal + 1).padStart(2, "0")}`,
  }));
  const [targetTranscript, semanticTranscript] = await Promise.all([
    input.evidence.digestCanonical({
      artifact: "ccsolver-p7-target-anchor-transcript",
      version: 1,
      occurrenceId: input.occurrenceId,
      target: input.target,
      candidates: candidates.map((candidate) => ({
        candidateOrdinal: candidate.candidateOrdinal,
        segmentId: candidate.segmentId,
        nativeBoundaryTick: candidate.tick,
        decisionCount: candidate.decision,
        coincidentEventCount: candidate.evidence?.coincidentEventCount ?? 0,
        coincidentAnchorCount: candidate.evidence?.coincidentAnchorCount ?? 0,
        orderedAnchorTranscript: candidate.evidence?.orderedAnchorTranscript ?? null,
        anchorEvent: candidate.evidence?.anchorEvent ?? null,
      })),
    }, CCLP1_FOUNDATION_LIMITS.maximumEventStreamCanonicalBytes),
    input.evidence.digestCanonical({
      artifact: "ccsolver-p7-semantic-anchor-transcript",
      version: 1,
      anchors: candidates.map((candidate) => ({
        candidateOrdinal: candidate.candidateOrdinal,
        segmentId: candidate.segmentId,
        semanticKey: candidate.semanticKey,
        anchor: candidate.anchor,
      })),
    }, CCLP1_FOUNDATION_LIMITS.maximumEventStreamCanonicalBytes),
  ]);
  const selectedCandidates = input.retainViewableSegments
    ? viewableBoundaryCandidates(candidates)
    : [];
  const boundaries: PendingBoundary[] = [];
  for (const candidate of selectedCandidates) {
    const checkpoint = candidate.checkpoint ?? await input.evidence.referenceCanonical({
      artifact: "ccsolver-p7-segment-boundary-evidence",
      version: 1,
      occurrenceId: input.occurrenceId,
      target: input.target,
      nativeBoundaryTick: candidate.tick,
      // This is compact boundary evidence, not a restorable checkpoint. Keep
      // only a retained authoritative anchor record; the complete journal is
      // digest-bound and reproduced through bounded engine re-execution.
      coincidentEventCount: candidate.evidence!.coincidentEventCount,
      anchorEvent: candidate.evidence!.anchorEvent,
    });
    boundaries.push({
      segmentId: candidate.segmentId,
      tick: candidate.tick,
      decision: candidate.decision,
      checkpoint,
      anchor: candidate.anchor,
      semanticKey: candidate.semanticKey,
    });
  }
  const segments = buildSegments(input.initialCheckpoint, boundaries);
  if (input.retainViewableSegments && (
    segments.length === 0
    || segments[0]!.start.tick !== 0
    || segments.at(-1)!.end.tick !== input.terminalNativeTick
    || segments.at(-1)!.end.decision !== input.terminalDecisionCount
  )) {
    throw new Error(`${input.occurrenceId}/${input.target} segment coverage is incomplete`);
  }
  if (!input.retainViewableSegments && segments.length !== 0) {
    throw new Error(`${input.occurrenceId}/${input.target} uncertified route retained segments`);
  }
  return {
    segments,
    selection: {
      policyRevision: P7B_SEGMENT_SELECTION_POLICY_REVISION,
      selectionMode: input.retainViewableSegments
        ? "viewable-route-chapters"
        : "unviewable",
      candidateCount: candidates.length,
      selectedCandidateOrdinals: selectedCandidates.map(({ candidateOrdinal }) => (
        candidateOrdinal
      )),
      omittedCandidateCount: candidates.length - selectedCandidates.length,
      targetTranscript,
      semanticTranscript,
    },
  };
}

function residualsFor(target: LoadedCclp1FoundationTarget): Cclp1FoundationResidual[] {
  const residuals: Cclp1FoundationResidual[] = [];
  if (target.donor.containsDiagonalInput) residuals.push("diagonal-input");
  if (target.donor.containsMouseInput) residuals.push("mouse-input");
  if (target.donor.flags !== 0) residuals.push("nondefault-flags");
  if (target.donor.stepping !== 0) residuals.push("nondefault-stepping");
  return residuals;
}

function candidateEligibilityFor(
  target: LoadedCclp1FoundationTarget,
): ProcessedCclp1FoundationTarget["candidateEligibility"] {
  const residuals = residualsFor(target);
  return {
    status: "not-assessed",
    residuals,
    detail: residuals.length === 0
      ? "raw donor certified; normalization profile eligibility has not been assessed"
      : "raw donor certified with explicit native residuals; profile handling has not been assessed",
  };
}

function inputDecisionEventsFrom(
  events: readonly FoundationNativeCausalEvent[],
): Cclp1FoundationInputDecisionEvent[] {
  return events.flatMap((event): Cclp1FoundationInputDecisionEvent[] => (
    (event.kind === "movement-started" || event.kind === "movement-blocked")
    && event.actorSerial === null
    && event.direction != null
    && event.movementRole != null
      ? [{
          kind: event.kind,
          nativeTick: event.nativeTick,
          withinTickOrder: event.withinTickOrder,
          direction: event.direction,
          movementRole: event.movementRole,
          decisionSource: event.decisionSource ?? null,
        }]
      : []
  ));
}

export async function referenceFoundationSessionBoundaryEvidence(
  target: "ms" | "lynx",
  session: MsInteractiveSessionState | LynxInteractiveSessionState,
  evidence: P7GeneratedEvidenceStore,
): Promise<BlobReferenceV1> {
  const serializedState = target === "ms"
    ? digestMsInteractiveSession(session as MsInteractiveSessionState)
    : digestLynxInteractiveSession(session as LynxInteractiveSessionState);
  const state = await evidence.digestBinary(new TextEncoder().encode(serializedState));
  return evidence.referenceCanonical({
    artifact: "ccsolver-p7-engine-state-boundary-digest",
    version: 1,
    target,
    stateEncoding: "undo-runtime-session-digest-canonical-json-v1",
    state,
  });
}

interface RawReplayExecution {
  readonly terminal: Exclude<SolverTerminalResult, { readonly kind: "running" }>;
  readonly advanceTickCount: number;
  readonly eventCount: number;
  readonly fullEventStream: P7TrainingEventStreamDigestV1;
  readonly events: readonly FoundationNativeCausalEvent[];
  readonly initialCheckpoint: BlobReferenceV1;
  readonly finalCheckpoint: BlobReferenceV1;
}

type RawReplayPrefixEquivalence = Pick<
  RawReplayExecution,
  "terminal" | "advanceTickCount" | "eventCount" | "fullEventStream"
>;

export function assertExactExecutedReplayPrefix(input: {
  readonly occurrenceId: string;
  readonly target: "ms" | "lynx";
  readonly discovered: RawReplayPrefixEquivalence;
  readonly replayed: RawReplayPrefixEquivalence;
  readonly expectedDecisionCount: number;
  readonly replayedDecisionCount: number;
}): void {
  const sameCanonicalValue = (left: unknown, right: unknown) => (
    canonicalizeJson(left as CanonicalJsonValue)
      === canonicalizeJson(right as CanonicalJsonValue)
  );
  if (
    !sameCanonicalValue(input.replayed.terminal, input.discovered.terminal)
    || input.replayed.advanceTickCount !== input.discovered.advanceTickCount
    || input.replayed.eventCount !== input.discovered.eventCount
    || !sameCanonicalValue(
      input.replayed.fullEventStream,
      input.discovered.fullEventStream,
    )
    || input.replayedDecisionCount !== input.expectedDecisionCount
  ) {
    throw new Error(
      `${input.occurrenceId}/${input.target} exact executed replay prefix drifted`,
    );
  }
}

async function executeMsRawReplay(
  level: LoadedCclp1FoundationLevel,
  target: LoadedCclp1FoundationTarget,
  evidence: P7GeneratedEvidenceStore,
  sha256: Sha256Port,
  replayDecisionCount = target.expandedSolution.moves.length,
): Promise<RawReplayExecution> {
  const request = {
    seriesFile: target.seriesFile,
    levelNumber: level.selection.levelNumber,
    ruleset: "MS" as const,
    randomSeed: target.expandedSolution.randomSeed & UINT31_MASK,
  };
  const prepared = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.levelData),
    layerData: level.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  const expandedReplay = structuredClone(target.expandedSolution);
  const replay = {
    ...expandedReplay,
    moves: expandedReplay.moves.slice(0, replayDecisionCount),
    bestTimeTicks: target.bestTimeTicks,
    modifierMasks: [],
  };
  let session = createMsReplaySession(request, prepared, replay);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("ms", session, evidence);
  const eventAccumulator = new P7TrainingEventAccumulator({
    occurrenceId: level.selection.occurrenceId,
    target: "ms",
    sha256,
    maximumRetainedEvents: CCLP1_FOUNDATION_LIMITS.maximumRetainedEventsPerTarget,
  });
  const maximumAdvanceTicks = target.bestTimeTicks + CCLP1_FOUNDATION_LIMITS.replayTickSlackPerTarget;
  let advanceTickCount = 0;
  while (session.state.engine.status === "playing" && advanceTickCount < maximumAdvanceTicks) {
    session = advanceMsInteractiveSession(session, 0, {
      causalEventSink: eventAccumulator.causalEventSink,
    });
    await eventAccumulator.flushNativeTick();
    advanceTickCount += 1;
  }
  const accumulated = await eventAccumulator.finish();
  const nativeTick = session.state.engine.timer.currentTime;
  const terminal: Exclude<SolverTerminalResult, { readonly kind: "running" }> =
    session.state.engine.status === "completed" || session.state.internal.completed
      ? { kind: "won", nativeTick, coordinate: null, exitPlacementId: null }
      : session.state.internal.chipStatus === "outoftime"
        ? { kind: "timed-out", nativeTick, coordinate: null }
        : {
            kind: "lost",
            nativeTick,
            coordinate: null,
            cause: session.state.engine.status === "playing"
              ? "cc1:p7b-replay-budget"
              : "cc1:raw-replay-failed",
          };
  return {
    terminal,
    advanceTickCount,
    eventCount: accumulated.rawEventCount,
    fullEventStream: accumulated.fullEventStream,
    events: accumulated.events as readonly FoundationNativeCausalEvent[],
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("ms", session, evidence),
  };
}

async function executeLynxRawReplay(
  level: LoadedCclp1FoundationLevel,
  target: LoadedCclp1FoundationTarget,
  evidence: P7GeneratedEvidenceStore,
  sha256: Sha256Port,
  replayDecisionCount = target.expandedSolution.moves.length,
): Promise<RawReplayExecution> {
  const request = {
    seriesFile: target.seriesFile,
    levelNumber: level.selection.levelNumber,
    ruleset: "Lynx" as const,
    randomSeed: target.expandedSolution.randomSeed & UINT31_MASK,
  };
  const prepared = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.levelData),
    layerData: level.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  const expandedReplay = structuredClone(target.expandedSolution);
  const replay = {
    ...expandedReplay,
    moves: expandedReplay.moves.slice(0, replayDecisionCount),
    bestTimeTicks: target.bestTimeTicks,
    modifierMasks: [],
  };
  let session = createLynxReplaySession(request, prepared, replay);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence);
  const eventAccumulator = new P7TrainingEventAccumulator({
    occurrenceId: level.selection.occurrenceId,
    target: "lynx",
    sha256,
    maximumRetainedEvents: CCLP1_FOUNDATION_LIMITS.maximumRetainedEventsPerTarget,
  });
  const maximumAdvanceTicks = target.bestTimeTicks + CCLP1_FOUNDATION_LIMITS.replayTickSlackPerTarget;
  let advanceTickCount = 0;
  while (session.endGameResult === null && advanceTickCount < maximumAdvanceTicks) {
    session = advanceLynxInteractiveSession(session, 0, {
      causalEventSink: eventAccumulator.causalEventSink,
    });
    await eventAccumulator.flushNativeTick();
    advanceTickCount += 1;
  }
  const accumulated = await eventAccumulator.finish();
  const nativeTick = session.state.timer.currentTime;
  const terminal: Exclude<SolverTerminalResult, { readonly kind: "running" }> =
    session.endGameResult === "completed"
      ? { kind: "won", nativeTick, coordinate: null, exitPlacementId: null }
      : session.state.timer.timeLimit > 0 && nativeTick >= session.state.timer.timeLimit
        ? { kind: "timed-out", nativeTick, coordinate: null }
        : {
            kind: "lost",
            nativeTick,
            coordinate: null,
            cause: session.endGameResult === null
              ? "cc1:p7b-replay-budget"
              : "cc1:raw-replay-failed",
          };
  return {
    terminal,
    advanceTickCount,
    eventCount: accumulated.rawEventCount,
    fullEventStream: accumulated.fullEventStream,
    events: accumulated.events as readonly FoundationNativeCausalEvent[],
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence),
  };
}

async function processTarget(
  level: LoadedCclp1FoundationLevel,
  target: LoadedCclp1FoundationTarget,
  sha256: Sha256Port,
  evidence: P7GeneratedEvidenceStore,
): Promise<ProcessedCclp1FoundationTarget> {
  if (
    target.target === "ms"
    && target.expandedSolution.stepping !== 0
    && target.expandedSolution.stepping !== 4
  ) {
    throw new Error(`${level.selection.occurrenceId}/ms uses unsupported stepping`);
  }
  const execute = (
    executionEvidence: P7GeneratedEvidenceStore,
    replayDecisionCount?: number,
  ) => target.target === "ms"
    ? executeMsRawReplay(level, target, executionEvidence, sha256, replayDecisionCount)
    : executeLynxRawReplay(level, target, executionEvidence, sha256, replayDecisionCount);
  const discoveryEvidence = new P7GeneratedEvidenceStore({
    scopeId: `${level.selection.occurrenceId}/${target.target}/raw-discovery`,
    sha256,
  });
  let executed = await execute(discoveryEvidence);
  let tickCount = executed.terminal.nativeTick + 1;
  let decisionCount = countNativeReplayDecisionsThrough(
    target.target,
    target.expandedSolution.moves,
    tickCount,
  );
  if (decisionCount < target.expandedSolution.moves.length) {
    const discovered = executed;
    executed = await execute(evidence, decisionCount);
    tickCount = executed.terminal.nativeTick + 1;
    const replayedDecisionCount = countNativeReplayDecisionsThrough(
      target.target,
      target.expandedSolution.moves,
      tickCount,
    );
    assertExactExecutedReplayPrefix({
      occurrenceId: level.selection.occurrenceId,
      target: target.target,
      discovered,
      replayed: executed,
      expectedDecisionCount: decisionCount,
      replayedDecisionCount,
    });
    decisionCount = replayedDecisionCount;
  } else {
    await evidence.importBundle(discoveryEvidence.bundle());
  }
  const { terminal, advanceTickCount } = executed;
  // Retain the immutable authored replay while binding certification evidence
  // to exactly the decisions that execute before the native terminal boundary.
  const allEvents = executed.events;
  const inputDecisionEvents = inputDecisionEventsFrom(allEvents);
  const finalCheckpoint = executed.finalCheckpoint;
  const segmented = await segmentFoundationNativeEvents({
    occurrenceId: level.selection.occurrenceId,
    target: target.target,
    events: allEvents,
    initialCheckpoint: executed.initialCheckpoint,
    finalCheckpoint,
    terminalNativeTick: tickCount,
    terminalDecisionCount: decisionCount,
    decisionCountAtTick: (tick) => countNativeReplayDecisionsThrough(
      target.target,
      target.expandedSolution.moves,
      tick,
    ),
    retainViewableSegments: terminal.kind === "won",
    evidence,
  });
  const { segments, selection: segmentSelection } = segmented;
  const rawReplayContent = await referenceSourceBytes(target.rawReplayBytes, sha256);
  const eventRetention = {
    status: "digest-and-boundary-events",
    heavyVerification: "reexecute-authoritative-engine",
  } as const;
  const eventEvidence = await evidence.referenceCanonical({
    artifact: "ccsolver-p7-native-replay-certification-receipt",
    version: 1,
    occurrenceId: level.selection.occurrenceId,
    target: target.target,
    eventRetention,
    terminal,
    terminalNativeTick: tickCount,
    decisionCount,
    advanceTickCount,
    eventCount: executed.eventCount,
    fullEventStream: executed.fullEventStream,
    segmentSelection,
    initialBoundaryEvidence: executed.initialCheckpoint,
    finalBoundaryEvidence: finalCheckpoint,
    segmentBoundaries: terminal.kind === "won"
      ? segments.map(({ segmentId, index, start, end }) => ({
          segmentId,
          index,
          startNativeTick: start.tick,
          endNativeTick: end.tick,
          startBoundaryEvidence: start.checkpoint,
          endBoundaryEvidence: end.checkpoint,
        }))
      : [],
  });
  progress(
    `${level.selection.occurrenceId}/${target.target} ${terminal.kind} in ${advanceTickCount} advances; `
    + `${executed.eventCount} native events; ${segments.length} segments`,
  );
  return {
    ...target,
    rawReplayBytes: new Uint8Array(target.rawReplayBytes),
    expandedSolution: structuredClone(target.expandedSolution),
    rawReplayContent,
    execution: {
      terminal,
      tickCount,
      decisionCount,
      advanceTickCount,
      eventCount: executed.eventCount,
      eventRetention,
      eventEvidence,
      fullEventStream: executed.fullEventStream,
      segmentSelection,
      initialCheckpoint: executed.initialCheckpoint,
      finalCheckpoint,
    },
    segments,
    inputDecisionEvents,
    candidateEligibility: candidateEligibilityFor(target),
  };
}

export async function processCclp1FoundationLevel(
  level: LoadedCclp1FoundationLevel,
  sha256: Sha256Port,
): Promise<ProcessedCclp1FoundationLevel> {
  const evidence = new P7GeneratedEvidenceStore({
    scopeId: `${level.selection.occurrenceId}/raw`,
    sha256,
  });
  if (level.targets.length < 1 || level.targets.length > 2) {
    throw new Error(`${level.selection.occurrenceId} must expose one or two donor targets`);
  }
  // Keep target execution sequential. This bounds live engine state to one
  // replay and makes the global run accounting exact.
  const targets: ProcessedCclp1FoundationTarget[] = [];
  for (const target of level.targets) {
    targets.push(await processTarget(level, target, sha256, evidence));
  }
  const [levelContent, eligibilityEvidence] = await Promise.all([
    referenceSourceBytes(level.source.levelData, sha256),
    evidence.referenceCanonical(level.eligibility),
  ]);
  return {
    selection: level.selection,
    manifestCase: level.manifestCase,
    validityOccurrence: level.validityOccurrence,
    eligibility: level.eligibility,
    source: {
      mapPath: level.source.mapPath,
      containerBytes: new Uint8Array(level.source.containerBytes),
      levelData: new Uint8Array(level.source.levelData),
      layerData: level.source.layerData.map((bytes) => new Uint8Array(bytes)),
    },
    levelContent,
    eligibilityEvidence,
    targets,
    generatedEvidence: evidence.bundle(),
  };
}

export async function buildCclp1FoundationCohort(
  input: LoadedCclp1FoundationCohort,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<ProcessedCclp1FoundationCohort> {
  if (
    input.cohortId !== "p7b-cclp1-foundation"
    || input.packId !== "cclp1"
    || input.levels.length !== CCLP1_FOUNDATION_LIMITS.levelCount
    || input.levels.reduce((sum, level) => sum + level.targets.length, 0)
      !== CCLP1_FOUNDATION_LIMITS.targetCount
  ) {
    throw new Error("P7B processor requires the exact bounded CCLP1 foundation cohort");
  }
  const levels: ProcessedCclp1FoundationLevel[] = [];
  for (const level of input.levels) {
    levels.push(await processCclp1FoundationLevel(level, sha256));
  }
  const advanceTickCount = levels.reduce((sum, level) => (
    sum + level.targets.reduce((targetSum, target) => (
      targetSum + target.execution.advanceTickCount
    ), 0)
  ), 0);
  if (advanceTickCount > CCLP1_FOUNDATION_LIMITS.maximumAdvanceTicks) {
    throw new Error("P7B processor exceeded its fixed advance-tick budget");
  }
  return {
    cohortId: "p7b-cclp1-foundation",
    packId: "cclp1",
    levels,
    summary: {
      levelCount: CCLP1_FOUNDATION_LIMITS.levelCount,
      targetCount: CCLP1_FOUNDATION_LIMITS.targetCount,
      replayRunCount: CCLP1_FOUNDATION_LIMITS.targetCount,
      advanceTickCount,
    },
  };
}
