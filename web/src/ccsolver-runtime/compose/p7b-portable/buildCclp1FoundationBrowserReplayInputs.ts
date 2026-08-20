import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  createLynxReplaySession,
  type LynxNativeCausalEvent,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  createMsReplaySession,
  type MsNativeCausalEvent,
} from "@ruleset-ms/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedEvidenceBundleV1,
} from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  canonicalizeP7TrainingBrowserReplay,
  parseP7TrainingBrowserReplay,
  p7ManualHeldInputAtNativeTick,
  projectP7PortableHeldScheduleChanges,
  type P7PortableHeldScheduleProjectionV1,
  type P7TrainingBrowserParityReceiptV1,
  type P7TrainingBrowserReplayInputV1,
  type P7TrainingBrowserReplayV1,
  type P7TrainingBrowserVariantIdV1,
  type P7TrainingManualHeldBrowserReplayV1,
  type P7TrainingNativeBrowserReplayV1,
} from "../p7-training-execution/p7TrainingBrowserReplay";
import {
  countNativeReplayDecisionsThrough,
  referenceFoundationSessionBoundaryEvidence,
  segmentFoundationNativeEvents,
  type FoundationNativeCausalEvent,
  type ProcessedCclp1FoundationSegment,
} from "../p7b-cohort/buildCclp1FoundationCohort";
import { CCLP1_FOUNDATION_LIMITS } from "../p7b-cohort/cclp1FoundationCohort";
import type { P7bReplayTargetV1 } from "../p7b-training/trainingReplayContract";
import type {
  P7bPortableCclp1FoundationCohort,
  P7bPortableCclp1FoundationLevel,
} from "./buildCclp1FoundationPortableCohort";

const UINT31_MASK = 0x7fff_ffff;
const NATIVE_REPLAY_TICK_MODULUS = 0x80_0000;

export type P7bCclp1FoundationBrowserVariantId = P7TrainingBrowserVariantIdV1;
export type P7bCclp1FoundationBrowserReplay = P7TrainingBrowserReplayV1;

export interface P7bCclp1FoundationBrowserReplayLevel {
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly portableDecisionTrace: {
    readonly content: BlobReferenceV1;
    readonly canonicalJson: CanonicalJson;
  } | null;
  readonly browserReplays: readonly P7TrainingBrowserReplayInputV1[];
  /** Raw, portable, browser, and parity proof bytes for this occurrence. */
  readonly generatedEvidence: P7GeneratedEvidenceBundleV1;
}

export interface P7bCclp1FoundationBrowserReplayBundle {
  readonly artifact: "ccsolver-p7b-cclp1-foundation-browser-replay-inputs";
  readonly version: 1;
  readonly cohortId: "p7b-cclp1-foundation-portable";
  readonly packId: "cclp1";
  readonly levels: readonly P7bCclp1FoundationBrowserReplayLevel[];
  readonly summary: {
    readonly levelCount: 12;
    readonly rawReplayCount: 24;
    readonly portableReplayCount: number;
    readonly replayCount: number;
    readonly parityMatchedCount: number;
  };
  /** Small pack-global profile/policy evidence, never copied into level sidecars. */
  readonly packEvidence: P7GeneratedEvidenceBundleV1;
}

interface ParityExecution {
  readonly won: boolean;
  readonly timedOut: boolean;
  readonly terminalNativeTick: number;
  readonly initialCheckpoint: BlobReferenceV1;
  readonly finalCheckpoint: BlobReferenceV1;
  readonly events: readonly FoundationNativeCausalEvent[];
}

function rawVariantId(target: P7bReplayTargetV1): "raw-ms" | "raw-lynx" {
  return target === "ms" ? "raw-ms" : "raw-lynx";
}

function rawBrowserReplay(
  level: P7bPortableCclp1FoundationLevel,
  target: P7bReplayTargetV1,
): P7TrainingNativeBrowserReplayV1 | null {
  const donor = level.source.targets.find((entry) => entry.target === target);
  if (donor === undefined) return null;
  return {
    artifact: "ccsolver-p7b-browser-replay",
    version: 1,
    variantId: rawVariantId(target),
    target,
    transport: "native-replay-pulses",
    sourceReplayContent: donor.rawReplayContent,
    nativeTickRateHz: 20,
    terminalNativeTick: donor.execution.tickCount,
    initialization: {
      flags: donor.expandedSolution.flags,
      randomSeed: donor.expandedSolution.randomSeed >>> 0,
      randomSlideDirection: donor.expandedSolution.randomSlideDirection,
      stepping: donor.expandedSolution.stepping,
      bestTimeTicks: donor.bestTimeTicks,
    },
    decisions: donor.expandedSolution.moves
      .slice(0, donor.execution.decisionCount)
      .map((move, ordinal) => ({
      ordinal,
      nativeTick: move.when % NATIVE_REPLAY_TICK_MODULUS,
      encodedWhen: move.when,
      inputCode: move.dir,
      modifierMask: 0,
      })),
  };
}

function portableBrowserReplay(
  level: P7bPortableCclp1FoundationLevel,
  target: P7bReplayTargetV1,
): P7TrainingManualHeldBrowserReplayV1 | null {
  if (level.candidate.status !== "compiled") return null;
  const certification = level.candidate.certifications[target];
  if (
    certification.terminalNativeTick === null
    || certification.execution.status !== "compiled"
    || certification.execution.replayContent === null
  ) return null;
  const lineage = level.source.targets.find((entry) => entry.target === level.lineage.target);
  if (lineage === undefined) throw new Error(`${level.occurrenceId} portable browser lineage is missing`);
  return {
    artifact: "ccsolver-p7b-browser-replay",
    version: 1,
    variantId: "portable",
    target,
    transport: "manual-held-schedule",
    sourceReplayContent: certification.execution.replayContent,
    nativeTickRateHz: 20,
    terminalNativeTick: certification.terminalNativeTick,
    initialization: {
      flags: 0,
      randomSeed: lineage.expandedSolution.randomSeed & UINT31_MASK,
      randomSlideDirection: 1,
      stepping: 0,
      bestTimeTicks: lineage.bestTimeTicks,
    },
    changes: projectP7PortableHeldScheduleChanges(
      level.candidate.trace,
      certification.terminalNativeTick,
    ).changes,
  };
}

function replayPayload(replay: P7TrainingNativeBrowserReplayV1): ReplaySolutionPayload & {
  readonly bestTimeTicks: number;
} {
  return {
    flags: replay.initialization.flags,
    randomSeed: replay.initialization.randomSeed,
    randomSlideDirection: replay.initialization.randomSlideDirection,
    stepping: replay.initialization.stepping,
    bestTimeTicks: replay.initialization.bestTimeTicks,
    moves: replay.decisions.map(({ encodedWhen, inputCode }) => ({
      when: encodedWhen,
      dir: inputCode,
    })),
    modifierMasks: replay.decisions.map(({ modifierMask }) => modifierMask),
  };
}

async function executeMsTransport(
  level: P7bPortableCclp1FoundationLevel,
  replay: P7TrainingBrowserReplayV1,
  evidence: P7GeneratedEvidenceStore,
): Promise<ParityExecution> {
  const target = level.source.targets.find((entry) => entry.target === "ms")!;
  const prepared = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.source.levelData),
    layerData: level.source.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  const request = {
    seriesFile: target.seriesFile,
    levelNumber: level.source.selection.levelNumber,
    ruleset: "MS" as const,
    randomSeed: replay.initialization.randomSeed,
  };
  let session = replay.transport === "native-replay-pulses"
    ? createMsReplaySession(request, prepared, replayPayload(replay))
    : createMsInteractiveSession(request, prepared);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("ms", session, evidence);
  const events: MsNativeCausalEvent[] = [];
  let advances = 0;
  while (session.state.engine.status === "playing" && advances < replay.terminalNativeTick) {
    const nextTick = session.state.engine.timer.currentTime + 1;
    const inputCode = replay.transport === "manual-held-schedule"
      ? p7ManualHeldInputAtNativeTick(replay, nextTick)
      : 0;
    session = advanceMsInteractiveSession(session, inputCode, {
      causalEventSink: (event) => {
        events.push(event);
        if (events.length > CCLP1_FOUNDATION_LIMITS.maximumEventsPerTarget) {
          throw new Error(`${level.occurrenceId}/${replay.variantId}/ms parity event cap exhausted`);
        }
      },
    });
    advances += 1;
  }
  const terminalNativeTick = session.state.engine.timer.currentTime + 1;
  if (terminalNativeTick !== replay.terminalNativeTick) {
    throw new Error(`${level.occurrenceId}/${replay.variantId}/ms browser terminal parity failed`);
  }
  return {
    won: session.state.engine.status === "completed" || session.state.internal.completed,
    timedOut: session.state.internal.chipStatus === "outoftime"
      || session.state.engine.status === "playing",
    terminalNativeTick,
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("ms", session, evidence),
    events,
  };
}

async function executeLynxTransport(
  level: P7bPortableCclp1FoundationLevel,
  replay: P7TrainingBrowserReplayV1,
  evidence: P7GeneratedEvidenceStore,
): Promise<ParityExecution> {
  const target = level.source.targets.find((entry) => entry.target === "lynx")!;
  const prepared = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.source.levelData),
    layerData: level.source.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  const request = {
    seriesFile: target.seriesFile,
    levelNumber: level.source.selection.levelNumber,
    ruleset: "Lynx" as const,
    randomSeed: replay.initialization.randomSeed,
  };
  let session = replay.transport === "native-replay-pulses"
    ? createLynxReplaySession(request, prepared, replayPayload(replay))
    : createLynxInteractiveSession(request, prepared);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence);
  const events: LynxNativeCausalEvent[] = [];
  let advances = 0;
  while (session.endGameResult === null && advances < replay.terminalNativeTick) {
    const nextTick = session.state.timer.currentTime + 1;
    const inputCode = replay.transport === "manual-held-schedule"
      ? p7ManualHeldInputAtNativeTick(replay, nextTick)
      : 0;
    session = advanceLynxInteractiveSession(session, inputCode, {
      causalEventSink: (event) => {
        events.push(event);
        if (events.length > CCLP1_FOUNDATION_LIMITS.maximumEventsPerTarget) {
          throw new Error(`${level.occurrenceId}/${replay.variantId}/lynx parity event cap exhausted`);
        }
      },
    });
    advances += 1;
  }
  const terminalNativeTick = session.state.timer.currentTime + 1;
  if (terminalNativeTick !== replay.terminalNativeTick) {
    throw new Error(`${level.occurrenceId}/${replay.variantId}/lynx browser terminal parity failed`);
  }
  return {
    won: session.endGameResult === "completed",
    timedOut: (session.state.timer.timeLimit > 0
      && session.state.timer.currentTime >= session.state.timer.timeLimit)
      || session.endGameResult === null,
    terminalNativeTick,
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence),
    events,
  };
}

function expectedSegments(
  level: P7bPortableCclp1FoundationLevel,
  replay: P7TrainingBrowserReplayV1,
): readonly ProcessedCclp1FoundationSegment[] {
  if (replay.variantId === "portable") {
    if (level.candidate.status !== "compiled") throw new Error("portable parity lacks candidate");
    return level.candidate.certifications[replay.target].segments;
  }
  const source = level.source.targets.find(({ target }) => target === replay.target)!;
  return source.execution.terminal.kind === "won" ? source.segments : [];
}

function conservativeObservedSegments(
  expected: readonly ProcessedCclp1FoundationSegment[],
  observed: readonly ProcessedCclp1FoundationSegment[],
  execution: ParityExecution,
  decisionCount: number,
): readonly ProcessedCclp1FoundationSegment[] {
  if (expected.length !== 1 || expected[0]!.segmentId !== "portable-route-to-exit") return observed;
  return [{
    ...expected[0]!,
    start: { tick: 0, decision: 0, checkpoint: execution.initialCheckpoint },
    end: {
      tick: execution.terminalNativeTick,
      decision: decisionCount,
      checkpoint: execution.finalCheckpoint,
    },
  }];
}

function segmentBoundaries(segments: readonly ProcessedCclp1FoundationSegment[]) {
  return segments.map(({ segmentId, index, start, end }) => ({
    segmentId,
    index,
    startNativeTick: start.tick,
    endNativeTick: end.tick,
    startBoundaryEvidence: start.checkpoint,
    endBoundaryEvidence: end.checkpoint,
  }));
}

async function proveBrowserReplay(
  level: P7bPortableCclp1FoundationLevel,
  authoredReplay: P7TrainingBrowserReplayV1,
  evidence: P7GeneratedEvidenceStore,
): Promise<P7TrainingBrowserReplayInputV1> {
  const canonicalJson = canonicalizeP7TrainingBrowserReplay(authoredReplay);
  const content = await evidence.referenceCanonicalJson(canonicalJson);
  // Execute exactly the parsed canonical envelope that the browser consumes.
  const replay = parseP7TrainingBrowserReplay(canonicalJson);
  const execution = replay.target === "ms"
    ? await executeMsTransport(level, replay, evidence)
    : await executeLynxTransport(level, replay, evidence);
  const expected = expectedSegments(level, replay);
  const decisionCountAtTick = replay.transport === "native-replay-pulses"
    ? (tick: number) => replay.decisions.filter(({ nativeTick }) => nativeTick < tick).length
    : (tick: number) => replay.changes.filter(({ nativeTick }) => nativeTick < tick).length;
  const terminalDecisionCount = replay.transport === "native-replay-pulses"
    ? replay.decisions.length
    : replay.changes.length;
  const segmented = expected.length === 0
    ? []
    : await segmentFoundationNativeEvents({
        occurrenceId: level.occurrenceId,
        target: replay.target,
        events: execution.events,
        initialCheckpoint: execution.initialCheckpoint,
        finalCheckpoint: execution.finalCheckpoint,
        terminalNativeTick: execution.terminalNativeTick,
        terminalDecisionCount,
        decisionCountAtTick,
        evidence,
      });
  const observed = conservativeObservedSegments(
    expected,
    segmented,
    execution,
    terminalDecisionCount,
  );
  const expectedCanonical = canonicalizeJson(expected as unknown as CanonicalJsonValue);
  const observedCanonical = canonicalizeJson(observed as unknown as CanonicalJsonValue);
  if (expectedCanonical !== observedCanonical) {
    const mismatchIndex = Math.max(
      0,
      expected.findIndex((segment, index) => (
        canonicalizeJson(segment as unknown as CanonicalJsonValue)
        !== canonicalizeJson(observed[index] as unknown as CanonicalJsonValue)
      )),
    );
    throw new Error(
      `${level.occurrenceId}/${replay.variantId}/${replay.target} segment parity failed: `
      + `first mismatch at index ${mismatchIndex} `
      + `(expected ${expected.length} segments; observed ${observed.length}); `
      + `expected=${expectedCanonical}; observed=${observedCanonical}`,
    );
  }
  const expectedBoundaryEvidence = segmentBoundaries(expected);
  const observedBoundaryEvidence = segmentBoundaries(observed);
  let portableScheduleProjection: P7PortableHeldScheduleProjectionV1 | null = null;
  if (replay.transport === "manual-held-schedule") {
    if (level.candidate.status !== "compiled") {
      throw new Error("portable parity lacks its decision trace");
    }
    portableScheduleProjection = projectP7PortableHeldScheduleChanges(
      level.candidate.trace,
      replay.terminalNativeTick,
    );
  }
  const expectedOutcome = replay.transport === "native-replay-pulses"
    ? (() => {
        const terminal = level.source.targets.find(({ target }) => (
          target === replay.target
        ))!.execution.terminal;
        return terminal.kind === "won"
          ? "won"
          : terminal.kind === "timed-out"
            || (terminal.kind === "lost" && terminal.cause === "cc1:p7b-replay-budget")
            ? "timeout"
            : "loss";
      })()
    : level.candidate.status === "compiled"
      ? level.candidate.certifications[replay.target].outcome
      : "not-run";
  if (expectedOutcome === "not-run") {
    throw new Error("browser replay parity cannot target an unevaluated execution");
  }
  const observedOutcome = execution.won
    ? portableScheduleProjection?.omittedPostTerminalChanges.some(({ inputCode }) => inputCode !== 0)
      ? "diverged"
      : "won"
    : execution.timedOut
      ? "timeout"
      : "loss";
  if (observedOutcome !== expectedOutcome) {
    throw new Error(
      `${level.occurrenceId}/${replay.variantId}/${replay.target} browser outcome parity failed: `
      + `${observedOutcome} != ${expectedOutcome}`,
    );
  }
  const receipt: P7TrainingBrowserParityReceiptV1 = {
    artifact: "ccsolver-p7-browser-replay-parity-receipt",
    version: 1,
    occurrenceId: level.occurrenceId,
    variantId: replay.variantId,
    target: replay.target,
    transport: replay.transport,
    sourceReplayContent: replay.sourceReplayContent,
    browserReplayContent: content,
    nativeBoundaryClock: "exclusive-advance-count-v1",
    portableScheduleProjection: portableScheduleProjection === null
      ? null
      : {
          authoredChangeCount: portableScheduleProjection.changes.length
            + portableScheduleProjection.omittedPostTerminalChanges.length,
          executedChangeCount: portableScheduleProjection.changes.length,
          omittedPostTerminalChanges: portableScheduleProjection.omittedPostTerminalChanges,
        },
    expected: {
      outcome: expectedOutcome,
      terminalNativeTick: authoredReplay.terminalNativeTick,
      segmentBoundaries: expectedBoundaryEvidence,
    },
    observed: {
      outcome: observedOutcome,
      terminalNativeTick: execution.terminalNativeTick,
      segmentBoundaries: observedBoundaryEvidence,
    },
    status: "matched",
  };
  return {
    variantId: replay.variantId,
    target: replay.target,
    replay,
    canonicalJson,
    content,
    parity: {
      receipt,
      evidence: await evidence.referenceCanonical(receipt),
    },
  };
}

export function findCclp1FoundationBrowserReplayInput(
  bundle: P7bCclp1FoundationBrowserReplayBundle,
  key: {
    readonly occurrenceId: string;
    readonly variantId: P7TrainingBrowserVariantIdV1;
    readonly target: P7bReplayTargetV1;
  },
): P7TrainingBrowserReplayInputV1 | undefined {
  return bundle.levels
    .find(({ occurrenceId }) => occurrenceId === key.occurrenceId)
    ?.browserReplays.find(({ variantId, target }) => (
      variantId === key.variantId && target === key.target
    ));
}

export async function buildCclp1FoundationBrowserReplayLevel(
  level: P7bPortableCclp1FoundationLevel,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<P7bCclp1FoundationBrowserReplayLevel> {
  const evidence = new P7GeneratedEvidenceStore({
    scopeId: `${level.occurrenceId}/browser-parity`,
    sha256,
  });
  await evidence.importBundle(level.generatedEvidence);
  const authored = [
    rawBrowserReplay(level, "ms"),
    rawBrowserReplay(level, "lynx"),
    portableBrowserReplay(level, "ms"),
    portableBrowserReplay(level, "lynx"),
  ].filter((replay): replay is P7TrainingBrowserReplayV1 => replay !== null);
  const browserReplays: P7TrainingBrowserReplayInputV1[] = [];
  for (const replay of authored) {
    browserReplays.push(await proveBrowserReplay(level, replay, evidence));
  }
  return {
    occurrenceId: level.occurrenceId,
    levelNumber: level.source.selection.levelNumber,
    portableDecisionTrace: level.candidate.status === "compiled"
      ? {
          content: level.candidate.traceContent,
          canonicalJson: canonicalizeJson(
            level.candidate.trace as unknown as CanonicalJsonValue,
          ),
        }
      : null,
    browserReplays,
    generatedEvidence: evidence.bundle(),
  };
}

export async function buildCclp1FoundationBrowserReplayInputs(
  input: P7bPortableCclp1FoundationCohort,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<P7bCclp1FoundationBrowserReplayBundle> {
  if (
    input.cohortId !== "p7b-cclp1-foundation-portable"
    || input.packId !== "cclp1"
    || input.levels.length !== 12
  ) throw new Error("browser replay inputs require the exact portable CCLP1 foundation cohort");
  const levels: P7bCclp1FoundationBrowserReplayLevel[] = [];
  for (const level of input.levels) {
    levels.push(await buildCclp1FoundationBrowserReplayLevel(level, sha256));
  }
  const rawReplayCount = levels.reduce((sum, level) => (
    sum + level.browserReplays.filter(({ variantId }) => variantId !== "portable").length
  ), 0);
  const portableReplayCount = levels.reduce((sum, level) => (
    sum + level.browserReplays.filter(({ variantId }) => variantId === "portable").length
  ), 0);
  if (rawReplayCount !== 24) throw new Error("browser replay inputs lost an exact raw donor");
  return {
    artifact: "ccsolver-p7b-cclp1-foundation-browser-replay-inputs",
    version: 1,
    cohortId: "p7b-cclp1-foundation-portable",
    packId: "cclp1",
    levels,
    summary: {
      levelCount: 12,
      rawReplayCount: 24,
      portableReplayCount,
      replayCount: rawReplayCount + portableReplayCount,
      parityMatchedCount: rawReplayCount + portableReplayCount,
    },
    packEvidence: input.packEvidence,
  };
}
