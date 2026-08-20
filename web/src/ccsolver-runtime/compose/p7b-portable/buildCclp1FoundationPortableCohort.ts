import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { BlobReferenceV1 } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { SolutionMove } from "@content/api/solutionDataCodec";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  type LynxNativeCausalEvent,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  type MsNativeCausalEvent,
} from "@ruleset-ms/impl/engine";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedCanonicalDigestV1,
  type P7GeneratedEvidenceBundleV1,
} from "../p7-training-execution/p7GeneratedEvidenceStore";
/*
 * The native segmenter is intentionally shared with the raw cohort pass: a
 * portable target certificate must be anchored by the same engine events,
 * not by a presentation-only approximation.
 */
import {
  referenceFoundationSessionBoundaryEvidence,
  segmentFoundationNativeEvents,
  type Cclp1FoundationInputDecisionEvent,
  type FoundationNativeCausalEvent,
  type ProcessedCclp1FoundationCohort,
  type ProcessedCclp1FoundationLevel,
  type ProcessedCclp1FoundationSegment,
  type ProcessedCclp1FoundationTarget,
} from "../p7b-cohort/buildCclp1FoundationCohort";
import { CCLP1_FOUNDATION_LIMITS } from "../p7b-cohort/cclp1FoundationCohort";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  buildP7bPortableDecisionTrace,
  type P7bPortableDecisionPacketV1,
  type P7bPortableDecisionTraceV1,
  type P7bPortableDirectionV1,
} from "../p7b-training/portableReplayProfile";

const UINT31_MASK = 0x7fff_ffff;
const NATIVE_REPLAY_TICK_MODULUS = 0x80_0000;
const NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP = 2;
const PORTABLE_NATIVE_TICK_SLACK = 40;
const MAX_PORTABLE_NATIVE_ADVANCES = CCLP1_FOUNDATION_LIMITS.maximumAdvanceTicks * 2;

const CARDINAL_DIRECTIONS = [
  { code: 1, name: "north" },
  { code: 8, name: "east" },
  { code: 4, name: "south" },
  { code: 2, name: "west" },
] as const satisfies readonly { readonly code: number; readonly name: P7bPortableDirectionV1 }[];
type CardinalDirectionEntry = (typeof CARDINAL_DIRECTIONS)[number];

const RELEASE_PACKET = Object.freeze({
  primary: "none",
  secondary: "none",
} as const satisfies P7bPortableDecisionPacketV1);

export type P7bPortableBlockerKind =
  | "invalid-direction"
  | "mouse-input"
  | "missing-target-donor"
  | "nondefault-flags"
  | "nondefault-random-slide"
  | "nondefault-stepping"
  | "source-replay-not-certified"
  | "same-step-collision";

export type P7bPortableResidualKind =
  | "adjacent-held-pulse-merged"
  | "diagonal-order-assigned"
  | "native-odd-tick-quantized";

export type P7bPortableTransformKind =
  | "adjacent-held-pulse-merged"
  | "diagonal-order-assigned"
  | "diagonal-order-derived"
  | "input-pulse-normalized"
  | "native-odd-tick-quantized";

export interface P7bPortableBlocker {
  readonly kind: P7bPortableBlockerKind;
  readonly detail: string;
}

export interface P7bPortableQuantizationEntry {
  readonly sourceDecision: number;
  readonly sourceNativeTick: number;
  readonly portableLogicStep: number;
  readonly nativeTickDelta: 0 | -1;
}

export interface P7bPortableDiagonalAssignment {
  readonly sourceDecision: number;
  readonly sourceNativeTick: number;
  readonly inputCode: number;
  readonly primary: Exclude<P7bPortableDirectionV1, "none">;
  readonly secondary: Exclude<P7bPortableDirectionV1, "none">;
  readonly basis: "native-movement-start" | "deterministic-clockwise-order";
  readonly nativeEvent: Cclp1FoundationInputDecisionEvent | null;
}

export interface P7bPortableTransform {
  readonly ordinal: number;
  readonly kind: P7bPortableTransformKind;
  readonly detail: string;
  readonly sourceDecisions: readonly number[];
}

export interface NativeReplayPulseCompilerInput {
  readonly target: "ms" | "lynx";
  /** Exclusive native replay duration. */
  readonly terminalNativeTick: number;
  readonly flags: number;
  readonly stepping: number;
  readonly randomSlideDirection: number;
  readonly containsMouseInput: boolean;
  readonly moves: readonly SolutionMove[];
  readonly inputDecisionEvents: readonly Cclp1FoundationInputDecisionEvent[];
}

interface NativeReplayPulseCompilerBase {
  readonly blockers: readonly P7bPortableBlocker[];
  readonly residuals: readonly P7bPortableResidualKind[];
  readonly quantization: readonly P7bPortableQuantizationEntry[];
  readonly diagonalAssignments: readonly P7bPortableDiagonalAssignment[];
  readonly transforms: readonly P7bPortableTransform[];
}

export type NativeReplayPulseCompilerResult =
  | (NativeReplayPulseCompilerBase & {
      readonly status: "blocked";
      readonly trace: null;
    })
  | (NativeReplayPulseCompilerBase & {
      readonly status: "compiled";
      readonly trace: P7bPortableDecisionTraceV1;
    });

export interface P7bPortableLineage {
  readonly target: "ms" | "lynx";
  readonly donorId: string;
  readonly sourceVariantId: "raw-ms" | "raw-lynx";
  readonly containsMouseInput: boolean;
  readonly flags: number;
  readonly stepping: number;
  readonly randomSlideDirection: number;
  readonly moveCount: number;
  readonly rawReplayContent: BlobReferenceV1;
}

export interface P7bPortableCompilationReceipt {
  readonly artifact: "ccsolver-p7b-portable-target-compilation-receipt";
  readonly version: 1;
  readonly compilerRevision:
    | "p7b-portable-to-ms-native-input-v1"
    | "p7b-portable-to-lynx-native-input-v1";
  readonly target: "ms" | "lynx";
  readonly profileId: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_ID;
  readonly profileRevision: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION;
  readonly decisionTraceContent: BlobReferenceV1;
  readonly nativeTicksPerLogicStep: 2;
  readonly inputSampling: "repeat-held-packet-each-native-tick";
  readonly oddNativeTickPolicy: "floor-to-prior-portable-boundary";
  readonly maximumNativeAdvanceTicks: number;
  readonly compiledInputChanges: readonly {
    readonly nativeTick: number;
    readonly inputCode: number;
  }[];
}

export interface P7bPortableCertification {
  readonly status: "certified" | "failed" | "not-attempted";
  readonly outcome: "won" | "loss" | "diverged" | "timeout" | "not-run";
  readonly terminalNativeTick: number | null;
  readonly detail: string;
  readonly evidence: BlobReferenceV1 | null;
  readonly initialCheckpoint: BlobReferenceV1 | null;
  readonly finalCheckpoint: BlobReferenceV1 | null;
  readonly eventCount: number;
  readonly advanceTickCount: number;
  readonly segments: readonly ProcessedCclp1FoundationSegment[];
  readonly execution: {
    readonly status: "compiled" | "not-attempted";
    readonly compilerRevision:
      | "p7b-portable-to-ms-native-input-v1"
      | "p7b-portable-to-lynx-native-input-v1"
      | null;
    readonly replayContent: BlobReferenceV1 | null;
    readonly compilationReceipt: BlobReferenceV1 | null;
    readonly receipt: P7bPortableCompilationReceipt | null;
  };
}

interface PortableCandidateBase {
  readonly transforms: readonly P7bPortableTransform[];
  readonly transformEvidence: BlobReferenceV1;
  readonly residuals: readonly P7bPortableResidualKind[];
  readonly blockers: readonly P7bPortableBlocker[];
  readonly certifications: {
    readonly ms: P7bPortableCertification;
    readonly lynx: P7bPortableCertification;
  };
}

export type P7bPortableCandidate =
  | (PortableCandidateBase & {
      readonly status: "blocked";
      readonly trace: null;
      readonly traceContent: null;
      readonly profileContent: null;
      readonly portability: "not-portable";
    })
  | (PortableCandidateBase & {
      readonly status: "compiled";
      readonly trace: P7bPortableDecisionTraceV1;
      readonly traceContent: BlobReferenceV1;
      readonly profileContent: BlobReferenceV1;
      readonly portability: "portable" | "target-specific" | "not-portable";
      readonly segments: readonly {
        readonly segmentId: string;
        readonly index: number;
        readonly label: string;
        readonly anchor: ProcessedCclp1FoundationSegment["anchor"];
      }[];
      readonly segmentAlignment: {
        readonly status:
          | "aligned-targets"
          | "single-certified-target"
          | "conservative-route";
        readonly detail: string;
      };
    });

export interface P7bPortableCclp1FoundationLevel {
  readonly occurrenceId: string;
  readonly source: Omit<ProcessedCclp1FoundationLevel, "generatedEvidence">;
  readonly lineage: P7bPortableLineage;
  readonly lineageEvidence: BlobReferenceV1;
  readonly candidate: P7bPortableCandidate;
  /** Raw plus portable proof bytes, bounded to this occurrence. */
  readonly generatedEvidence: P7GeneratedEvidenceBundleV1;
}

export interface P7bPortableCclp1FoundationCohort {
  readonly cohortId: "p7b-cclp1-foundation-portable";
  readonly packId: "cclp1";
  readonly levels: readonly P7bPortableCclp1FoundationLevel[];
  readonly summary: {
    readonly levelCount: 12;
    readonly lineageCount: 12;
    readonly compiledCandidateCount: number;
    readonly blockedCandidateCount: number;
    readonly certificationAttemptCount: number;
    readonly certifiedTargetCount: number;
    readonly failedTargetCount: number;
    readonly nativeAdvanceTickCount: number;
    readonly maximumNativeAdvanceTickCount: number;
  };
  /** Deduplicated pack-global profile/policy bytes only. */
  readonly packEvidence: P7GeneratedEvidenceBundleV1;
}

function progress(stage: string): void {
  if (process.env.TWORLD_P7B_PROGRESS === "1") {
    process.stderr.write(`[p7b:portable] ${stage}\n`);
  }
}

function packetKey(packet: P7bPortableDecisionPacketV1): string {
  return `${packet.primary}+${packet.secondary}`;
}

function nativeMoveTick(target: "ms" | "lynx", move: SolutionMove): number {
  void target;
  return move.when % NATIVE_REPLAY_TICK_MODULUS;
}

function cardinalForCode(code: number): Exclude<P7bPortableDirectionV1, "none"> | null {
  return CARDINAL_DIRECTIONS.find((entry) => entry.code === code)?.name ?? null;
}

function directionComponents(code: number): CardinalDirectionEntry[] {
  return CARDINAL_DIRECTIONS.filter((entry) => (code & entry.code) !== 0);
}

function authoritativeDiagonalPrimary(
  input: NativeReplayPulseCompilerInput,
  sourceNativeTick: number,
  inputCode: number,
): Cclp1FoundationInputDecisionEvent | null {
  return input.inputDecisionEvents.find((event) => (
    event.kind === "movement-started"
    && event.nativeTick === sourceNativeTick
    && event.movementRole === "self"
    && cardinalForCode(event.direction) !== null
    && (event.direction & inputCode) !== 0
  )) ?? null;
}

function packetForMove(
  input: NativeReplayPulseCompilerInput,
  move: SolutionMove,
  sourceDecision: number,
  sourceNativeTick: number,
  assignments: P7bPortableDiagonalAssignment[],
): P7bPortableDecisionPacketV1 | null {
  const cardinal = cardinalForCode(move.dir);
  if (cardinal !== null) return { primary: cardinal, secondary: "none" };
  const components = directionComponents(move.dir);
  const horizontalCount = components.filter(({ code }) => code === 2 || code === 8).length;
  const verticalCount = components.filter(({ code }) => code === 1 || code === 4).length;
  if (
    components.length !== 2
    || horizontalCount !== 1
    || verticalCount !== 1
    || (components[0]!.code | components[1]!.code) !== move.dir
  ) {
    return null;
  }
  const nativeEvent = authoritativeDiagonalPrimary(input, sourceNativeTick, move.dir);
  const nativePrimary = nativeEvent === null ? null : cardinalForCode(nativeEvent.direction);
  const primary = nativePrimary ?? components[0]!.name;
  const secondary = components.find(({ name }) => name !== primary)!.name;
  assignments.push({
    sourceDecision,
    sourceNativeTick,
    inputCode: move.dir,
    primary,
    secondary,
    basis: nativePrimary === null
      ? "deterministic-clockwise-order"
      : "native-movement-start",
    nativeEvent,
  });
  return { primary, secondary };
}

function blockersForHeaders(input: NativeReplayPulseCompilerInput): P7bPortableBlocker[] {
  const blockers: P7bPortableBlocker[] = [];
  if (input.flags !== 0) {
    blockers.push({
      kind: "nondefault-flags",
      detail: `source flags ${input.flags} require target-native interpretation`,
    });
  }
  if (input.stepping !== 0) {
    blockers.push({
      kind: "nondefault-stepping",
      detail: `source stepping ${input.stepping} is retained as an unresolved native dependency`,
    });
  }
  if (input.randomSlideDirection !== 1) {
    blockers.push({
      kind: "nondefault-random-slide",
      detail: `source random-slide direction ${input.randomSlideDirection} cannot be defaulted`,
    });
  }
  if (input.containsMouseInput) {
    blockers.push({
      kind: "mouse-input",
      detail: "source contains an MS mouse goal that this bounded compiler does not expand",
    });
  }
  return blockers;
}

function transform(
  kind: P7bPortableTransformKind,
  detail: string,
  sourceDecisions: readonly number[],
): P7bPortableTransform {
  return { ordinal: -1, kind, detail, sourceDecisions };
}

function ordinalTransforms(
  transforms: readonly P7bPortableTransform[],
): P7bPortableTransform[] {
  return transforms.map((entry, ordinal) => ({ ...entry, ordinal }));
}

export function compileNativeReplayPulsesToPortableTrace(
  input: NativeReplayPulseCompilerInput,
): NativeReplayPulseCompilerResult {
  const blockers = blockersForHeaders(input);
  const quantization: P7bPortableQuantizationEntry[] = [];
  const diagonalAssignments: P7bPortableDiagonalAssignment[] = [];
  const scheduled: {
    readonly sourceDecision: number;
    readonly sourceNativeTick: number;
    readonly logicStep: number;
    readonly packet: P7bPortableDecisionPacketV1;
  }[] = [];
  for (const [sourceDecision, move] of input.moves.entries()) {
    const sourceNativeTick = nativeMoveTick(input.target, move);
    const logicStep = Math.floor(sourceNativeTick / NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP);
    quantization.push({
      sourceDecision,
      sourceNativeTick,
      portableLogicStep: logicStep,
      nativeTickDelta: sourceNativeTick % 2 === 0 ? 0 : -1,
    });
    const packet = packetForMove(
      input,
      move,
      sourceDecision,
      sourceNativeTick,
      diagonalAssignments,
    );
    if (packet === null) {
      blockers.push({
        kind: "invalid-direction",
        detail: `source decision ${sourceDecision} has unrepresentable input code ${move.dir}`,
      });
      continue;
    }
    const previous = scheduled.at(-1);
    if (previous !== undefined && previous.logicStep === logicStep) {
      blockers.push({
        kind: "same-step-collision",
        detail: `source decisions ${previous.sourceDecision} and ${sourceDecision} both quantize to logic step ${logicStep}`,
      });
      continue;
    }
    scheduled.push({ sourceDecision, sourceNativeTick, logicStep, packet });
  }

  const oddDecisions = quantization
    .filter(({ nativeTickDelta }) => nativeTickDelta !== 0)
    .map(({ sourceDecision }) => sourceDecision);
  const fallbackDiagonals = diagonalAssignments
    .filter(({ basis }) => basis === "deterministic-clockwise-order")
    .map(({ sourceDecision }) => sourceDecision);
  const transforms: P7bPortableTransform[] = [transform(
    "input-pulse-normalized",
    "represent each native replay decision as a full 10 Hz held packet and release or replace it at the next portable boundary",
    input.moves.map((_move, index) => index),
  )];
  if (oddDecisions.length > 0) {
    transforms.push(transform(
      "native-odd-tick-quantized",
      "floor odd native ticks to the prior 100 ms boundary (bounded shift: one 50 ms native tick)",
      oddDecisions,
    ));
  }
  if (diagonalAssignments.length > 0) {
    const derived = diagonalAssignments
      .filter(({ basis }) => basis === "native-movement-start")
      .map(({ sourceDecision }) => sourceDecision);
    if (derived.length > 0) {
      transforms.push(transform(
        "diagonal-order-derived",
        "derive primary direction from the authoritative native Chip movement-start event",
        derived,
      ));
    }
    if (fallbackDiagonals.length > 0) {
      transforms.push(transform(
        "diagonal-order-assigned",
        "assign primary direction by declared clockwise priority north, east, south, west because donor bitmasks carry no ordering",
        fallbackDiagonals,
      ));
    }
  }

  if (blockers.length > 0) {
    return {
      status: "blocked",
      trace: null,
      blockers,
      residuals: [
        ...(oddDecisions.length > 0 ? ["native-odd-tick-quantized" as const] : []),
        ...(fallbackDiagonals.length > 0 ? ["diagonal-order-assigned" as const] : []),
      ],
      quantization,
      diagonalAssignments,
      transforms: ordinalTransforms(transforms),
    };
  }

  const changes: { logicStep: number; packet: P7bPortableDecisionPacketV1 }[] = [];
  const mergedSourceDecisions: number[] = [];
  let heldPacket: P7bPortableDecisionPacketV1 = RELEASE_PACKET;
  for (const [index, entry] of scheduled.entries()) {
    const previousScheduled = scheduled[index - 1];
    if (previousScheduled !== undefined && entry.logicStep > previousScheduled.logicStep + 1) {
      if (packetKey(heldPacket) !== packetKey(RELEASE_PACKET)) {
        changes.push({
          logicStep: previousScheduled.logicStep + 1,
          packet: RELEASE_PACKET,
        });
        heldPacket = RELEASE_PACKET;
      }
    }
    if (packetKey(heldPacket) === packetKey(entry.packet)) {
      mergedSourceDecisions.push(entry.sourceDecision);
      continue;
    }
    changes.push({ logicStep: entry.logicStep, packet: entry.packet });
    heldPacket = entry.packet;
  }
  const lastScheduled = scheduled.at(-1);
  if (lastScheduled !== undefined && packetKey(heldPacket) !== packetKey(RELEASE_PACKET)) {
    changes.push({ logicStep: lastScheduled.logicStep + 1, packet: RELEASE_PACKET });
  }
  if (mergedSourceDecisions.length > 0) {
    transforms.push(transform(
      "adjacent-held-pulse-merged",
      "merge adjacent identical pulses into one continuously held portable packet",
      mergedSourceDecisions,
    ));
  }
  const lastChangeStep = changes.at(-1)?.logicStep ?? 0;
  const terminalLogicStep = Math.max(
    Math.ceil(input.terminalNativeTick / NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP),
    lastChangeStep + 1,
  );
  const trace = buildP7bPortableDecisionTrace({
    artifact: "ccsolver-p7b-portable-decision-trace",
    version: 1,
    profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
    terminalLogicStep,
    changes,
  });
  return {
    status: "compiled",
    trace,
    blockers: [],
    residuals: [
      ...(oddDecisions.length > 0 ? ["native-odd-tick-quantized" as const] : []),
      ...(fallbackDiagonals.length > 0 ? ["diagonal-order-assigned" as const] : []),
      ...(mergedSourceDecisions.length > 0 ? ["adjacent-held-pulse-merged" as const] : []),
    ],
    quantization,
    diagonalAssignments,
    transforms: ordinalTransforms(transforms),
  };
}

function portableHeaderResidualCount(target: ProcessedCclp1FoundationTarget): number {
  return Number(target.donor.flags !== 0)
    + Number(target.donor.stepping !== 0)
    + Number(target.donor.randomSlideDirection !== 1)
    + Number(target.donor.containsMouseInput);
}

function selectLineageTarget(
  level: ProcessedCclp1FoundationLevel,
): ProcessedCclp1FoundationTarget {
  const lynx = level.targets.find(({ target }) => target === "lynx");
  if (
    lynx !== undefined
    && lynx.execution.terminal.kind === "won"
    && portableHeaderResidualCount(lynx) === 0
  ) return lynx;
  return [...level.targets].sort((left, right) => (
    Number(right.execution.terminal.kind === "won")
      - Number(left.execution.terminal.kind === "won")
    || portableHeaderResidualCount(left) - portableHeaderResidualCount(right)
    || (left.target === "ms" ? -1 : 1)
  ))[0]!;
}

function donorId(level: ProcessedCclp1FoundationLevel, target: "ms" | "lynx"): string {
  return level.targets.find((entry) => entry.target === target)!.donorId
    ?? `cclp1-${String(level.selection.levelNumber).padStart(3, "0")}-${target}-official`;
}

async function lineageFor(
  level: ProcessedCclp1FoundationLevel,
  evidence: P7GeneratedEvidenceStore,
): Promise<{ lineage: P7bPortableLineage; target: ProcessedCclp1FoundationTarget; evidence: BlobReferenceV1 }> {
  const target = selectLineageTarget(level);
  const lineage: P7bPortableLineage = {
    target: target.target,
    donorId: donorId(level, target.target),
    sourceVariantId: target.target === "ms" ? "raw-ms" : "raw-lynx",
    containsMouseInput: target.donor.containsMouseInput,
    flags: target.donor.flags,
    stepping: target.donor.stepping,
    randomSlideDirection: target.donor.randomSlideDirection,
    moveCount: target.expandedSolution.moves.length,
    rawReplayContent: target.rawReplayContent,
  };
  return {
    lineage,
    target,
    evidence: await evidence.referenceCanonical({
      policy: "prefer-clean-lynx-otherwise-lowest-native-header-residual-ms-tiebreak-v1",
      occurrenceId: level.selection.occurrenceId,
      candidates: level.targets.map((candidate) => ({
        target: candidate.target,
        donorId: donorId(level, candidate.target),
        flags: candidate.donor.flags,
        stepping: candidate.donor.stepping,
        randomSlideDirection: candidate.donor.randomSlideDirection,
        containsMouseInput: candidate.donor.containsMouseInput,
        residualCount: portableHeaderResidualCount(candidate),
      })),
      selected: lineage,
    }),
  };
}

function packetInputCode(packet: P7bPortableDecisionPacketV1): number {
  let code = 0;
  for (const part of [packet.primary, packet.secondary]) {
    code |= CARDINAL_DIRECTIONS.find(({ name }) => name === part)?.code ?? 0;
  }
  return code;
}

function compiledInputChanges(trace: P7bPortableDecisionTraceV1) {
  return trace.changes.map(({ logicStep, packet }) => ({
    nativeTick: logicStep * NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP,
    inputCode: packetInputCode(packet),
  }));
}

function inputAtLogicStep(trace: P7bPortableDecisionTraceV1, logicStep: number): number {
  let packet: P7bPortableDecisionPacketV1 = RELEASE_PACKET;
  for (const change of trace.changes) {
    if (change.logicStep > logicStep) break;
    packet = change.packet;
  }
  return packetInputCode(packet);
}

function portableDecisionCountThrough(
  trace: P7bPortableDecisionTraceV1,
  exclusiveNativeTick: number,
): number {
  return trace.changes.filter(({ logicStep }) => (
    logicStep * NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP < exclusiveNativeTick
  )).length;
}

function compilationReceipt(
  target: "ms" | "lynx",
  trace: P7bPortableDecisionTraceV1,
  traceContent: BlobReferenceV1,
  maximumNativeAdvanceTicks: number,
): P7bPortableCompilationReceipt {
  return {
    artifact: "ccsolver-p7b-portable-target-compilation-receipt",
    version: 1,
    compilerRevision: target === "ms"
      ? "p7b-portable-to-ms-native-input-v1"
      : "p7b-portable-to-lynx-native-input-v1",
    target,
    profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
    decisionTraceContent: traceContent,
    nativeTicksPerLogicStep: NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP,
    inputSampling: "repeat-held-packet-each-native-tick",
    oddNativeTickPolicy: "floor-to-prior-portable-boundary",
    maximumNativeAdvanceTicks,
    compiledInputChanges: compiledInputChanges(trace),
  };
}

interface ExecutedPortableTarget {
  readonly won: boolean;
  readonly timedOut: boolean;
  readonly terminalNativeTick: number;
  readonly advanceTickCount: number;
  readonly eventCount: number;
  readonly fullEventStream: P7GeneratedCanonicalDigestV1;
  readonly initialCheckpoint: BlobReferenceV1;
  readonly finalCheckpoint: BlobReferenceV1;
  readonly events: readonly FoundationNativeCausalEvent[];
}

async function executePortableMs(
  level: ProcessedCclp1FoundationLevel,
  lineage: ProcessedCclp1FoundationTarget,
  trace: P7bPortableDecisionTraceV1,
  maximumNativeAdvanceTicks: number,
  evidence: P7GeneratedEvidenceStore,
): Promise<ExecutedPortableTarget> {
  const target = level.targets.find((entry) => entry.target === "ms")!;
  const prepared = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.levelData),
    layerData: level.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  let session = createMsInteractiveSession({
    seriesFile: target.seriesFile,
    levelNumber: level.selection.levelNumber,
    ruleset: "MS",
    randomSeed: lineage.expandedSolution.randomSeed & UINT31_MASK,
  }, prepared);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("ms", session, evidence);
  const events: MsNativeCausalEvent[] = [];
  let advanceTickCount = 0;
  while (session.state.engine.status === "playing" && advanceTickCount < maximumNativeAdvanceTicks) {
    const nextNativeTick = session.state.engine.timer.currentTime + 1;
    const logicStep = Math.floor(nextNativeTick / NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP);
    session = advanceMsInteractiveSession(session, inputAtLogicStep(trace, logicStep), {
      causalEventSink: (event) => {
        events.push(event);
        if (events.length > CCLP1_FOUNDATION_LIMITS.maximumEventsPerTarget) {
          throw new Error(`${level.selection.occurrenceId}/portable/ms causal event capacity exhausted`);
        }
      },
    });
    advanceTickCount += 1;
  }
  const terminalNativeTick = session.state.engine.timer.currentTime + 1;
  return {
    won: session.state.engine.status === "completed" || session.state.internal.completed,
    timedOut: session.state.internal.chipStatus === "outoftime"
      || (session.state.engine.status === "playing" && advanceTickCount >= maximumNativeAdvanceTicks),
    terminalNativeTick,
    advanceTickCount,
    eventCount: events.length,
    fullEventStream: await evidence.digestCanonical({ eventsOrder: "sequence", events }),
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("ms", session, evidence),
    events,
  };
}

async function executePortableLynx(
  level: ProcessedCclp1FoundationLevel,
  lineage: ProcessedCclp1FoundationTarget,
  trace: P7bPortableDecisionTraceV1,
  maximumNativeAdvanceTicks: number,
  evidence: P7GeneratedEvidenceStore,
): Promise<ExecutedPortableTarget> {
  const target = level.targets.find((entry) => entry.target === "lynx")!;
  const prepared = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(level.source.levelData),
    layerData: level.source.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  let session = createLynxInteractiveSession({
    seriesFile: target.seriesFile,
    levelNumber: level.selection.levelNumber,
    ruleset: "Lynx",
    randomSeed: lineage.expandedSolution.randomSeed & UINT31_MASK,
  }, prepared);
  const initialCheckpoint = await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence);
  const events: LynxNativeCausalEvent[] = [];
  let advanceTickCount = 0;
  while (session.endGameResult === null && advanceTickCount < maximumNativeAdvanceTicks) {
    const nextNativeTick = session.state.timer.currentTime + 1;
    const logicStep = Math.floor(nextNativeTick / NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP);
    session = advanceLynxInteractiveSession(session, inputAtLogicStep(trace, logicStep), {
      causalEventSink: (event) => {
        events.push(event);
        if (events.length > CCLP1_FOUNDATION_LIMITS.maximumEventsPerTarget) {
          throw new Error(`${level.selection.occurrenceId}/portable/lynx causal event capacity exhausted`);
        }
      },
    });
    advanceTickCount += 1;
  }
  const terminalNativeTick = session.state.timer.currentTime + 1;
  return {
    won: session.endGameResult === "completed",
    timedOut: (session.state.timer.timeLimit > 0 && session.state.timer.currentTime >= session.state.timer.timeLimit)
      || (session.endGameResult === null && advanceTickCount >= maximumNativeAdvanceTicks),
    terminalNativeTick,
    advanceTickCount,
    eventCount: events.length,
    fullEventStream: await evidence.digestCanonical({ eventsOrder: "sequence", events }),
    initialCheckpoint,
    finalCheckpoint: await referenceFoundationSessionBoundaryEvidence("lynx", session, evidence),
    events,
  };
}

async function certifyPortableTarget(
  level: ProcessedCclp1FoundationLevel,
  lineage: ProcessedCclp1FoundationTarget,
  trace: P7bPortableDecisionTraceV1,
  traceContent: BlobReferenceV1,
  target: "ms" | "lynx",
  evidenceStore: P7GeneratedEvidenceStore,
): Promise<P7bPortableCertification> {
  const maximumNativeAdvanceTicks = trace.terminalLogicStep
    * NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP
    + PORTABLE_NATIVE_TICK_SLACK;
  const receipt = compilationReceipt(target, trace, traceContent, maximumNativeAdvanceTicks);
  const [replayContent, receiptContent] = await Promise.all([
    evidenceStore.referenceCanonical({
      artifact: "ccsolver-p7b-compiled-native-input-replay",
      version: 1,
      target,
      randomSeed: lineage.expandedSolution.randomSeed & UINT31_MASK,
      changes: receipt.compiledInputChanges,
    }),
    evidenceStore.referenceCanonical(receipt),
  ]);
  const executed = target === "ms"
    ? await executePortableMs(level, lineage, trace, maximumNativeAdvanceTicks, evidenceStore)
    : await executePortableLynx(level, lineage, trace, maximumNativeAdvanceTicks, evidenceStore);
  const decisionsBeforeTerminal = portableDecisionCountThrough(
    trace,
    executed.terminalNativeTick,
  );
  const remainingGameplayInputs = trace.changes.slice(decisionsBeforeTerminal)
    .filter(({ packet }) => packetKey(packet) !== packetKey(RELEASE_PACKET));
  // A terminal release may sit exactly after a target has already latched its
  // win. That release remains explicit profile state but is not a missing
  // gameplay input. Any remaining directional packet is a real divergence.
  const consumedWholeStrategy = remainingGameplayInputs.length === 0;
  const outcome = executed.won && consumedWholeStrategy
    ? "won"
    : executed.won
      ? "diverged"
      : executed.timedOut
        ? "timeout"
        : "loss";
  const status = outcome === "won" ? "certified" : "failed";
  const segments = status === "certified"
    ? await segmentFoundationNativeEvents({
        occurrenceId: level.selection.occurrenceId,
        target,
        events: executed.events,
        initialCheckpoint: executed.initialCheckpoint,
        finalCheckpoint: executed.finalCheckpoint,
        terminalNativeTick: executed.terminalNativeTick,
        terminalDecisionCount: decisionsBeforeTerminal,
        decisionCountAtTick: (tick) => portableDecisionCountThrough(trace, tick),
        evidence: evidenceStore,
      })
    : [];
  const evidence = await evidenceStore.referenceCanonical({
    artifact: "ccsolver-p7b-portable-target-certification",
    version: 1,
    occurrenceId: level.selection.occurrenceId,
    target,
    status,
    outcome,
    decisionsBeforeTerminal,
    terminalReleaseDeclarations: trace.changes.length - decisionsBeforeTerminal,
    terminalNativeTick: executed.terminalNativeTick,
    advanceTickCount: executed.advanceTickCount,
    eventCount: executed.eventCount,
    eventRetention: {
      status: "digest-and-boundary-events",
      heavyVerification: "reexecute-authoritative-engine",
    },
    fullEventStream: executed.fullEventStream,
    initialCheckpoint: executed.initialCheckpoint,
    finalCheckpoint: executed.finalCheckpoint,
    segmentBoundaries: segments.map(({ segmentId, index, start, end }) => ({
      segmentId,
      index,
      startNativeTick: start.tick,
      endNativeTick: end.tick,
      startBoundaryEvidence: start.checkpoint,
      endBoundaryEvidence: end.checkpoint,
    })),
    replayContent,
    compilationReceipt: receiptContent,
  });
  progress(
    `${level.selection.occurrenceId}/${target} ${status} (${outcome}) after `
    + `${executed.advanceTickCount}/${maximumNativeAdvanceTicks} advances`,
  );
  return {
    status,
    outcome,
    terminalNativeTick: executed.terminalNativeTick,
    detail: status === "certified"
      ? `portable input trace won under the real ${target} engine`
      : `portable input trace ended with ${outcome} under the real ${target} engine after ${executed.advanceTickCount} bounded advances`,
    evidence,
    initialCheckpoint: executed.initialCheckpoint,
    finalCheckpoint: executed.finalCheckpoint,
    eventCount: executed.eventCount,
    advanceTickCount: executed.advanceTickCount,
    segments,
    execution: {
      status: "compiled",
      compilerRevision: receipt.compilerRevision,
      replayContent,
      compilationReceipt: receiptContent,
      receipt,
    },
  };
}

function notAttemptedCertification(): P7bPortableCertification {
  return {
    status: "not-attempted",
    outcome: "not-run",
    terminalNativeTick: null,
    detail: "portable compilation is blocked by explicit source residuals",
    evidence: null,
    initialCheckpoint: null,
    finalCheckpoint: null,
    eventCount: 0,
    advanceTickCount: 0,
    segments: [],
    execution: {
      status: "not-attempted",
      compilerRevision: null,
      replayContent: null,
      compilationReceipt: null,
      receipt: null,
    },
  };
}

function semanticSegment(
  segment: ProcessedCclp1FoundationSegment,
): Extract<P7bPortableCandidate, { readonly status: "compiled" }>["segments"][number] {
  return {
    segmentId: segment.segmentId,
    index: segment.index,
    label: segment.label,
    anchor: segment.anchor,
  };
}

function sameSemanticSegments(
  left: readonly ProcessedCclp1FoundationSegment[],
  right: readonly ProcessedCclp1FoundationSegment[],
): boolean {
  return left.length === right.length && left.every((segment, index) => {
    const other = right[index];
    return other !== undefined
      && segment.segmentId === other.segmentId
      && segment.index === other.index
      && segment.label === other.label
      && segment.anchor.kind === other.anchor.kind
      && segment.anchor.label === other.anchor.label;
  });
}

function conservativeRouteSegment(
  certification: P7bPortableCertification,
  decisionCount: number,
): ProcessedCclp1FoundationSegment {
  if (
    certification.status !== "certified"
    || certification.terminalNativeTick === null
    || certification.initialCheckpoint === null
    || certification.finalCheckpoint === null
  ) {
    throw new Error("conservative portable route requires a certified target");
  }
  return {
    segmentId: "portable-route-to-exit",
    index: 0,
    label: "Complete the level",
    anchor: { kind: "exit", label: "Enter the exit" },
    start: {
      tick: 0,
      decision: 0,
      checkpoint: certification.initialCheckpoint,
    },
    end: {
      tick: certification.terminalNativeTick,
      decision: decisionCount,
      checkpoint: certification.finalCheckpoint,
    },
  };
}

function alignPortableSegments(
  ms: P7bPortableCertification,
  lynx: P7bPortableCertification,
  decisionCount: number,
): {
  readonly ms: P7bPortableCertification;
  readonly lynx: P7bPortableCertification;
  readonly segments: Extract<P7bPortableCandidate, { readonly status: "compiled" }>["segments"];
  readonly segmentAlignment: Extract<P7bPortableCandidate, { readonly status: "compiled" }>["segmentAlignment"];
} {
  const certified = [ms, lynx].filter((entry) => entry.status === "certified");
  if (certified.length === 2 && sameSemanticSegments(ms.segments, lynx.segments)) {
    return {
      ms,
      lynx,
      segments: ms.segments.map(semanticSegment),
      segmentAlignment: {
        status: "aligned-targets",
        detail: "MS and Lynx compiled executions expose the same ordered authoritative anchor keys",
      },
    };
  }
  if (certified.length === 1) {
    const source = certified[0]!;
    return {
      ms,
      lynx,
      segments: source.segments.map(semanticSegment),
      segmentAlignment: {
        status: "single-certified-target",
        detail: "semantic segments come from the one target with a winning compiled execution",
      },
    };
  }
  const segment = {
    segmentId: "portable-route-to-exit",
    index: 0,
    label: "Complete the level",
    anchor: { kind: "exit", label: "Enter the exit" },
  } as const;
  return {
    ms: ms.status === "certified"
      ? { ...ms, segments: [conservativeRouteSegment(ms, decisionCount)] }
      : ms,
    lynx: lynx.status === "certified"
      ? { ...lynx, segments: [conservativeRouteSegment(lynx, decisionCount)] }
      : lynx,
    segments: [segment],
    segmentAlignment: {
      status: "conservative-route",
      detail: certified.length === 2
        ? "target anchor sequences differ; publish one conservative whole-route segment"
        : "no target certified; retain one conservative variant-local route descriptor",
    },
  };
}

export async function buildCclp1FoundationPortableLevel(
  level: ProcessedCclp1FoundationLevel,
  profileContent: BlobReferenceV1,
  sha256: Sha256Port,
): Promise<P7bPortableCclp1FoundationLevel> {
  const evidence = new P7GeneratedEvidenceStore({
    scopeId: `${level.selection.occurrenceId}/portable`,
    sha256,
  });
  await evidence.importBundle(level.generatedEvidence);
  const { generatedEvidence: _rawEvidence, ...source } = level;
  const selected = await lineageFor(level, evidence);
  const compiled: NativeReplayPulseCompilerResult = level.targets.length < 2
    ? {
        status: "blocked",
        trace: null,
        blockers: [{
          kind: "missing-target-donor",
          detail: "portable compilation is withheld until both native donor targets are available",
        }],
        residuals: [],
        quantization: [],
        diagonalAssignments: [],
        transforms: [],
      }
    : selected.target.execution.terminal.kind !== "won"
    ? {
        status: "blocked",
        trace: null,
        blockers: [{
          kind: "source-replay-not-certified",
          detail: `selected source replay terminated ${selected.target.execution.terminal.kind} on the official map`,
        }],
        residuals: [],
        quantization: [],
        diagonalAssignments: [],
        transforms: [],
      }
    : compileNativeReplayPulsesToPortableTrace({
        target: selected.target.target,
        terminalNativeTick: selected.target.execution.tickCount,
        flags: selected.target.donor.flags,
        stepping: selected.target.donor.stepping,
        randomSlideDirection: selected.target.donor.randomSlideDirection,
        containsMouseInput: selected.target.donor.containsMouseInput,
        moves: selected.target.expandedSolution.moves,
        inputDecisionEvents: selected.target.inputDecisionEvents,
      });
  const transformEvidence = await evidence.referenceCanonical({
    occurrenceId: level.selection.occurrenceId,
    compilerPolicy: {
      nativeTicksPerPortableLogicStep: NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP,
      oddNativeTickPolicy: "floor-to-prior-portable-boundary",
      fallbackDiagonalPriority: CARDINAL_DIRECTIONS.map(({ name }) => name),
      inputPulsePolicy: "one-portable-step-then-release-or-full-packet-replacement",
      sameStepCollisionPolicy: "block-without-search",
    },
    status: compiled.status,
    blockers: compiled.blockers,
    residuals: compiled.residuals,
    quantization: compiled.quantization,
    diagonalAssignments: compiled.diagonalAssignments,
    transforms: compiled.transforms,
  });
  progress(
    `${level.selection.occurrenceId} selected ${selected.target.target}; ${compiled.status}; `
    + `${compiled.quantization.filter(({ nativeTickDelta }) => nativeTickDelta !== 0).length} odd ticks; `
    + `${compiled.diagonalAssignments.filter(({ basis }) => basis === "native-movement-start").length} derived diagonals; `
    + `${compiled.diagonalAssignments.filter(({ basis }) => basis === "deterministic-clockwise-order").length} assigned diagonals`,
  );
  if (compiled.status === "blocked") {
    const notAttempted = notAttemptedCertification();
    return {
      occurrenceId: level.selection.occurrenceId,
      source,
      lineage: selected.lineage,
      lineageEvidence: selected.evidence,
      candidate: {
        status: "blocked",
        trace: null,
        traceContent: null,
        profileContent: null,
        portability: "not-portable",
        transforms: compiled.transforms,
        transformEvidence,
        residuals: compiled.residuals,
        blockers: compiled.blockers,
        certifications: { ms: notAttempted, lynx: notAttemptedCertification() },
      },
      generatedEvidence: evidence.bundle(),
    };
  }
  const traceContent = await evidence.referenceCanonical(compiled.trace);
  // Keep the two fresh target sessions sequential to retain the same bounded
  // one-engine-at-a-time behavior as raw cohort processing.
  const ms = await certifyPortableTarget(
    level,
    selected.target,
    compiled.trace,
    traceContent,
    "ms",
    evidence,
  );
  const lynx = await certifyPortableTarget(
    level,
    selected.target,
    compiled.trace,
    traceContent,
    "lynx",
    evidence,
  );
  const aligned = alignPortableSegments(ms, lynx, compiled.trace.changes.length);
  return {
    occurrenceId: level.selection.occurrenceId,
    source,
    lineage: selected.lineage,
    lineageEvidence: selected.evidence,
    candidate: {
      status: "compiled",
      trace: compiled.trace,
      traceContent,
      profileContent,
      portability: ms.status === "certified" && lynx.status === "certified"
        ? "portable"
        : ms.status === "certified" || lynx.status === "certified"
          ? "target-specific"
          : "not-portable",
      transforms: compiled.transforms,
      transformEvidence,
      residuals: compiled.residuals,
      blockers: [],
      certifications: { ms: aligned.ms, lynx: aligned.lynx },
      segments: aligned.segments,
      segmentAlignment: aligned.segmentAlignment,
    },
    generatedEvidence: evidence.bundle(),
  };
}

export async function buildCclp1FoundationPortableCohort(
  input: ProcessedCclp1FoundationCohort,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<P7bPortableCclp1FoundationCohort> {
  if (
    input.cohortId !== "p7b-cclp1-foundation"
    || input.packId !== "cclp1"
    || input.levels.length !== CCLP1_FOUNDATION_LIMITS.levelCount
    || input.summary.replayRunCount !== CCLP1_FOUNDATION_LIMITS.targetCount
  ) {
    throw new Error("portable compiler requires the exact processed CCLP1 foundation cohort");
  }
  const packEvidence = new P7GeneratedEvidenceStore({
    scopeId: "cclp1/pack",
    sha256,
  });
  const profileContent = await packEvidence.referenceCanonical(
    P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  );
  const levels: P7bPortableCclp1FoundationLevel[] = [];
  for (const level of input.levels) {
    levels.push(await buildCclp1FoundationPortableLevel(level, profileContent, sha256));
  }
  const compiledCandidateCount = levels.filter(({ candidate }) => (
    candidate.status === "compiled"
  )).length;
  const certifications = levels.flatMap(({ candidate }) => (
    [candidate.certifications.ms, candidate.certifications.lynx]
  ));
  const nativeAdvanceTickCount = certifications.reduce((sum, certification) => (
    sum + certification.advanceTickCount
  ), 0);
  const maximumNativeAdvanceTickCount = levels.reduce((sum, { candidate }) => (
    candidate.status === "compiled"
      ? sum + 2 * (
          candidate.trace.terminalLogicStep * NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP
          + PORTABLE_NATIVE_TICK_SLACK
        )
      : sum
  ), 0);
  if (
    nativeAdvanceTickCount > maximumNativeAdvanceTickCount
    || maximumNativeAdvanceTickCount > MAX_PORTABLE_NATIVE_ADVANCES
  ) {
    throw new Error("portable cohort exceeded its deterministic native advance budget");
  }
  return {
    cohortId: "p7b-cclp1-foundation-portable",
    packId: "cclp1",
    levels,
    summary: {
      levelCount: CCLP1_FOUNDATION_LIMITS.levelCount,
      lineageCount: CCLP1_FOUNDATION_LIMITS.levelCount,
      compiledCandidateCount,
      blockedCandidateCount: levels.length - compiledCandidateCount,
      certificationAttemptCount: compiledCandidateCount * 2,
      certifiedTargetCount: certifications.filter(({ status }) => status === "certified").length,
      failedTargetCount: certifications.filter(({ status }) => status === "failed").length,
      nativeAdvanceTickCount,
      maximumNativeAdvanceTickCount,
    },
    packEvidence: packEvidence.bundle(),
  };
}
