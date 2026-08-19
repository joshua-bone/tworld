import type { RulesetTargetV1 } from "../domain/artifacts/types.js";
import {
  SolverCausalEventContractError,
  assertSolverCausalEventPageV1,
  identifySolverCausalEventOccurrenceAnchorV1,
} from "../events/index.js";
import type { SolverCausalEventV1 } from "../events/index.js";
import type {
  AlignSemanticEventsInputV1,
  AlignedSemanticEventRefV1,
  DivergentSemanticSpanV1,
  MatchedSemanticSpanV1,
  SemanticAlignmentSpanV1,
  SemanticAnchorStrengthV1,
  SemanticDivergenceReasonV1,
  SemanticEventAlignmentLimitsV1,
  SemanticEventAlignmentV1,
  UnmatchedSemanticSpanV1,
} from "./model.js";

const IMPLEMENTATION_LIMITS: SemanticEventAlignmentLimitsV1 = {
  maxEventsPerTrace: 4_096,
  maxMatrixCells: 4_000_000,
  maxMovementSpan: 8,
};

const DEFAULT_LIMITS: SemanticEventAlignmentLimitsV1 = {
  maxEventsPerTrace: 1_024,
  maxMatrixCells: 1_100_000,
  maxMovementSpan: 4,
};

const HARD_EVENT_KINDS = new Set<SolverCausalEventV1["kind"]>([
  "resource-collected",
  "map-mutated",
  "device-state-changed",
  "teleport-relocated",
  "actor-spawned",
  "actor-destroyed",
  "player-died",
  "terminal-reached",
]);

const MEDIUM_EVENT_KINDS = new Set<SolverCausalEventV1["kind"]>([
  "movement-blocked",
  "inventory-changed",
  "requirement-changed",
  "device-activated",
  "teleport-entered",
  "teleport-exited",
  "control-changed",
  "actor-lifecycle-changed",
]);

type RawAlignmentAction =
  | {
      readonly kind: "matched";
      readonly left: readonly SolverCausalEventV1[];
      readonly right: readonly SolverCausalEventV1[];
      readonly strength: SemanticAnchorStrengthV1;
      readonly score: number;
      readonly basis: MatchedSemanticSpanV1["basis"];
    }
  | {
      readonly kind: "divergent";
      readonly left: readonly SolverCausalEventV1[];
      readonly right: readonly SolverCausalEventV1[];
      readonly strength: SemanticAnchorStrengthV1;
      readonly reason: SemanticDivergenceReasonV1;
    }
  | {
      readonly kind: "gap-left" | "gap-right";
      readonly events: readonly SolverCausalEventV1[];
    };

interface CellQuality {
  readonly score: number;
  readonly hardMatches: number;
  readonly mediumMatches: number;
  readonly divergences: number;
  readonly gaps: number;
  readonly spanExtra: number;
}

interface MatrixCell {
  readonly quality: CellQuality;
  readonly previousI: number;
  readonly previousJ: number;
  readonly action: RawAlignmentAction | null;
  readonly actionPriority: number;
}

type OneEventComparison =
  | {
      readonly kind: "matched";
      readonly strength: SemanticAnchorStrengthV1;
      readonly score: number;
      readonly basis: MatchedSemanticSpanV1["basis"];
    }
  | {
      readonly kind: "divergent";
      readonly strength: SemanticAnchorStrengthV1;
      readonly reason: SemanticDivergenceReasonV1;
    };

export class SemanticEventAlignmentError extends Error {
  readonly code: "alignment.input-invalid" | "alignment.limit";
  readonly path: string;

  constructor(
    code: SemanticEventAlignmentError["code"],
    path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = "SemanticEventAlignmentError";
    this.code = code;
    this.path = path;
  }
}

function fail(
  code: SemanticEventAlignmentError["code"],
  path: string,
  message: string,
): never {
  throw new SemanticEventAlignmentError(code, path, message);
}

function positiveInteger(value: unknown, path: string, maximum: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value <= 0
    || value > maximum
  ) {
    fail("alignment.input-invalid", path, `expected an integer from 1 through ${maximum}`);
  }
  return value;
}

function limitsFor(input: AlignSemanticEventsInputV1): SemanticEventAlignmentLimitsV1 {
  const supplied = input.limits ?? {};
  return {
    maxEventsPerTrace: positiveInteger(
      supplied.maxEventsPerTrace ?? DEFAULT_LIMITS.maxEventsPerTrace,
      "/limits/maxEventsPerTrace",
      IMPLEMENTATION_LIMITS.maxEventsPerTrace,
    ),
    maxMatrixCells: positiveInteger(
      supplied.maxMatrixCells ?? DEFAULT_LIMITS.maxMatrixCells,
      "/limits/maxMatrixCells",
      IMPLEMENTATION_LIMITS.maxMatrixCells,
    ),
    maxMovementSpan: positiveInteger(
      supplied.maxMovementSpan ?? DEFAULT_LIMITS.maxMovementSpan,
      "/limits/maxMovementSpan",
      IMPLEMENTATION_LIMITS.maxMovementSpan,
    ),
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function strengthRank(strength: SemanticAnchorStrengthV1): number {
  return strength === "hard" ? 3 : strength === "medium" ? 2 : 1;
}

function strongestStrength(
  events: readonly SolverCausalEventV1[],
): SemanticAnchorStrengthV1 {
  let strongest: SemanticAnchorStrengthV1 = "soft";
  for (const event of events) {
    const candidate = anchorStrength(event);
    if (strengthRank(candidate) > strengthRank(strongest)) {
      strongest = candidate;
    }
  }
  return strongest;
}

function participantIdentity(participant: SolverCausalEventV1["subject"]): string {
  if (participant === null) {
    return "-";
  }
  const identity = [
    participant.placementId === null ? null : `placement=${participant.placementId}`,
    participant.deviceId === null ? null : `device=${participant.deviceId}`,
    participant.actorId === null ? null : `actor=${participant.actorId}`,
    `semantic=${participant.semanticType}`,
  ].filter((value): value is string => value !== null);
  return identity.join("|");
}

function hasStableParticipantIdentity(
  participant: SolverCausalEventV1["subject"],
): boolean {
  return participant !== null && (
    participant.placementId !== null
    || participant.deviceId !== null
    || participant.actorId !== null
  );
}

function detailRecord(event: SolverCausalEventV1): Readonly<Record<string, unknown>> {
  const detail = (event as SolverCausalEventV1 & { readonly detail?: unknown }).detail;
  if (detail === null || typeof detail !== "object" || Array.isArray(detail)) {
    return {};
  }
  return detail as Readonly<Record<string, unknown>>;
}

function stableSemanticValue(value: unknown, key = ""): unknown {
  if (key === "nativeTick" || key === "phase" || key.toLowerCase().includes("coordinate")) {
    return undefined;
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && !Object.is(value, -0) ? value : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stableSemanticValue(entry));
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort(compareText);
    if (
      keys.includes("x")
      && keys.includes("y")
      && keys.every((entry) => entry === "x" || entry === "y" || entry === "z")
    ) {
      return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const childKey of keys) {
      const child = stableSemanticValue(record[childKey], childKey);
      if (child !== undefined) {
        result[childKey] = child;
      }
    }
    return result;
  }
  return String(value);
}

function semanticEffectKey(event: SolverCausalEventV1): string {
  return JSON.stringify(stableSemanticValue(detailRecord(event)));
}

function coreDetailIdentity(event: SolverCausalEventV1): string {
  const detail = detailRecord(event);
  const entries = ["resourceType", "networkId", "teleportNetworkId"]
    .filter((key) => typeof detail[key] === "string")
    .map((key) => `${key}=${String(detail[key])}`);
  return entries.join("|");
}

function coreIdentity(event: SolverCausalEventV1): string {
  return identifySolverCausalEventOccurrenceAnchorV1(event);
}

function anchorStrength(event: SolverCausalEventV1): SemanticAnchorStrengthV1 {
  if (HARD_EVENT_KINDS.has(event.kind)) {
    const stableIdentity = hasStableParticipantIdentity(event.subject)
      || hasStableParticipantIdentity(event.source)
      || coreDetailIdentity(event).length > 0
      || event.kind === "terminal-reached"
      || event.kind === "player-died";
    if (event.authority.evidence === "diagnostic-only") {
      return stableIdentity ? "medium" : "soft";
    }
    return stableIdentity ? "hard" : "medium";
  }
  return MEDIUM_EVENT_KINDS.has(event.kind) ? "medium" : "soft";
}

function coordinatesEqual(
  left: SolverCausalEventV1["coordinates"]["before"],
  right: SolverCausalEventV1["coordinates"]["before"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function movementEnvelopeEqual(
  left: SolverCausalEventV1,
  right: SolverCausalEventV1,
): boolean {
  return coordinatesEqual(left.coordinates.before, right.coordinates.before)
    && coordinatesEqual(left.coordinates.after, right.coordinates.after);
}

function parentSemanticKeys(
  event: SolverCausalEventV1,
  bySequence: ReadonlyMap<number, SolverCausalEventV1>,
): readonly string[] {
  return event.causedBySequences
    .map((sequence) => bySequence.get(sequence))
    .filter((parent): parent is SolverCausalEventV1 => parent !== undefined)
    .map((parent) => parent.commandId === null
      ? `${coreIdentity(parent)}#${parent.occurrenceOrdinal}`
      : [
          coreIdentity(parent),
          `plan=${parent.planId ?? "-"}`,
          `command=${parent.commandId}`,
        ].join("#"))
    .sort(compareText);
}

function equalStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareOne(
  left: SolverCausalEventV1,
  right: SolverCausalEventV1,
  leftBySequence: ReadonlyMap<number, SolverCausalEventV1>,
  rightBySequence: ReadonlyMap<number, SolverCausalEventV1>,
): OneEventComparison | null {
  if (coreIdentity(left) !== coreIdentity(right)) {
    return null;
  }

  const strength = strengthRank(anchorStrength(left)) < strengthRank(anchorStrength(right))
    ? anchorStrength(left)
    : anchorStrength(right);

  if (left.occurrenceOrdinal !== right.occurrenceOrdinal) {
    return strength === "soft"
      ? null
      : { kind: "divergent", strength, reason: "occurrence-ordinal-mismatch" };
  }

  if (left.planId !== null && right.planId !== null && left.planId !== right.planId) {
    return {
      kind: "divergent",
      strength,
      reason: "plan-identity-mismatch",
    };
  }

  const leftParents = parentSemanticKeys(left, leftBySequence);
  const rightParents = parentSemanticKeys(right, rightBySequence);
  if (
    leftParents.length > 0
    && rightParents.length > 0
    && !equalStrings(leftParents, rightParents)
  ) {
    return {
      kind: "divergent",
      strength,
      reason: "causal-parent-mismatch",
    };
  }

  if (semanticEffectKey(left) !== semanticEffectKey(right)) {
    return strength === "hard"
      ? { kind: "divergent", strength, reason: "semantic-effect-mismatch" }
      : null;
  }

  const commandMatches = left.commandId !== null
    && right.commandId !== null
    && left.commandId === right.commandId;
  if (
    strength === "soft"
    && left.commandId !== null
    && right.commandId !== null
    && !commandMatches
  ) {
    return null;
  }

  const basis: MatchedSemanticSpanV1["basis"][number][] = [
    "stable-semantic-identity",
    "semantic-effect",
    "occurrence-order",
  ];
  if (
    commandMatches
    || (left.planId !== null && left.planId === right.planId)
    || (leftParents.length > 0 && rightParents.length > 0)
  ) {
    basis.push("causal-context");
  }
  if (strength === "soft") {
    if (!commandMatches && !movementEnvelopeEqual(left, right)) {
      return null;
    }
    if (movementEnvelopeEqual(left, right)) {
      basis.push("movement-envelope");
    }
  }

  return {
    kind: "matched",
    strength,
    score: strength === "hard" ? 100 : strength === "medium" ? 35 : 10,
    basis,
  };
}

function isMovement(event: SolverCausalEventV1): boolean {
  return event.kind.startsWith("movement-");
}

function compareMovementSpan(
  singleton: SolverCausalEventV1,
  multiple: readonly SolverCausalEventV1[],
): OneEventComparison | null {
  if (
    !isMovement(singleton)
    || multiple.length < 2
    || !multiple.every(isMovement)
    || singleton.commandId === null
    || multiple.some((event) => event.commandId !== singleton.commandId)
    || multiple.some((event) => participantIdentity(event.subject) !== participantIdentity(singleton.subject))
  ) {
    return null;
  }
  const first = multiple[0];
  const last = multiple[multiple.length - 1];
  if (
    first === undefined
    || last === undefined
    || !coordinatesEqual(singleton.coordinates.before, first.coordinates.before)
    || !coordinatesEqual(singleton.coordinates.after, last.coordinates.after)
  ) {
    return null;
  }
  for (let index = 1; index < multiple.length; index += 1) {
    const previous = multiple[index - 1];
    const current = multiple[index];
    if (
      previous === undefined
      || current === undefined
      || !coordinatesEqual(previous.coordinates.after, current.coordinates.before)
    ) {
      return null;
    }
  }
  return {
    kind: "matched",
    strength: "soft",
    score: Math.max(6, 10 - (multiple.length - 1)),
    basis: ["stable-semantic-identity", "causal-context", "movement-envelope"],
  };
}

function gapPenalty(event: SolverCausalEventV1): number {
  const strength = anchorStrength(event);
  return strength === "hard" ? -50 : strength === "medium" ? -16 : -5;
}

function addQuality(
  previous: CellQuality,
  action: RawAlignmentAction,
): CellQuality {
  if (action.kind === "matched") {
    return {
      score: previous.score + action.score,
      hardMatches: previous.hardMatches + (action.strength === "hard" ? 1 : 0),
      mediumMatches: previous.mediumMatches + (action.strength === "medium" ? 1 : 0),
      divergences: previous.divergences,
      gaps: previous.gaps,
      spanExtra: previous.spanExtra + action.left.length + action.right.length - 2,
    };
  }
  if (action.kind === "divergent") {
    return {
      ...previous,
      score: previous.score + (action.strength === "hard" ? -5 : -8),
      divergences: previous.divergences + 1,
    };
  }
  return {
    ...previous,
    score: previous.score + action.events.reduce((sum, event) => sum + gapPenalty(event), 0),
    gaps: previous.gaps + action.events.length,
  };
}

function compareQuality(left: MatrixCell, right: MatrixCell): number {
  const leftTuple = [
    left.quality.score,
    left.quality.hardMatches,
    left.quality.mediumMatches,
    -left.quality.divergences,
    -left.quality.gaps,
    -left.quality.spanExtra,
    -left.actionPriority,
  ];
  const rightTuple = [
    right.quality.score,
    right.quality.hardMatches,
    right.quality.mediumMatches,
    -right.quality.divergences,
    -right.quality.gaps,
    -right.quality.spanExtra,
    -right.actionPriority,
  ];
  for (let index = 0; index < leftTuple.length; index += 1) {
    if (leftTuple[index] !== rightTuple[index]) {
      return (leftTuple[index] ?? 0) - (rightTuple[index] ?? 0);
    }
  }
  return 0;
}

function ref(event: SolverCausalEventV1): AlignedSemanticEventRefV1 {
  return {
    target: event.target,
    sequence: event.sequence,
    occurrenceOrdinal: event.occurrenceOrdinal,
    kind: event.kind,
    anchorStrength: anchorStrength(event),
  };
}

function materializeSpans(actions: readonly RawAlignmentAction[]): readonly SemanticAlignmentSpanV1[] {
  const grouped: RawAlignmentAction[] = [];
  for (const action of actions) {
    const previous = grouped[grouped.length - 1];
    if (
      previous !== undefined
      && (action.kind === "gap-left" || action.kind === "gap-right")
      && previous.kind === action.kind
    ) {
      grouped[grouped.length - 1] = {
        kind: action.kind,
        events: [...previous.events, ...action.events],
      };
    } else {
      grouped.push(action);
    }
  }

  return grouped.map((action, spanOrder): SemanticAlignmentSpanV1 => {
    if (action.kind === "matched") {
      const cardinality = action.left.length === action.right.length
        ? "one-to-one"
        : action.left.length === 1
          ? "one-to-many"
          : "many-to-one";
      return {
        spanKind: "matched",
        spanOrder,
        cardinality,
        anchorStrength: action.strength,
        score: action.score,
        left: action.left.map(ref),
        right: action.right.map(ref),
        basis: action.basis,
      } satisfies MatchedSemanticSpanV1;
    }
    if (action.kind === "divergent") {
      return {
        spanKind: "divergent",
        spanOrder,
        anchorStrength: action.strength,
        left: action.left.map(ref),
        right: action.right.map(ref),
        reason: action.reason,
      } satisfies DivergentSemanticSpanV1;
    }
    const side = action.kind === "gap-left" ? "left" : "right";
    return {
      spanKind: "unmatched",
      spanOrder,
      side,
      strongestAnchor: strongestStrength(action.events),
      events: action.events.map(ref),
      reason: "no-compatible-semantic-anchor",
    } satisfies UnmatchedSemanticSpanV1;
  });
}

function summarize(spans: readonly SemanticAlignmentSpanV1[]) {
  let matchedSpans = 0;
  let oneToManySpans = 0;
  let unmatchedLeftEvents = 0;
  let unmatchedRightEvents = 0;
  let divergentSpans = 0;
  let matchedHardAnchors = 0;
  let unmatchedHardAnchors = 0;
  let divergentHardAnchors = 0;
  let terminalAnchorsMatched = false;

  for (const span of spans) {
    if (span.spanKind === "matched") {
      matchedSpans += 1;
      oneToManySpans += span.cardinality === "one-to-one" ? 0 : 1;
      if (span.anchorStrength === "hard") {
        matchedHardAnchors += Math.min(span.left.length, span.right.length);
      }
      terminalAnchorsMatched ||= span.left.some((event) => event.kind === "terminal-reached")
        && span.right.some((event) => event.kind === "terminal-reached");
    } else if (span.spanKind === "divergent") {
      divergentSpans += 1;
      divergentHardAnchors += span.anchorStrength === "hard" ? 1 : 0;
    } else {
      if (span.side === "left") {
        unmatchedLeftEvents += span.events.length;
      } else {
        unmatchedRightEvents += span.events.length;
      }
      unmatchedHardAnchors += span.events.filter(
        (event) => event.anchorStrength === "hard",
      ).length;
    }
  }

  return {
    matchedSpans,
    oneToManySpans,
    unmatchedLeftEvents,
    unmatchedRightEvents,
    divergentSpans,
    matchedHardAnchors,
    unmatchedHardAnchors,
    divergentHardAnchors,
    terminalAnchorsMatched,
  };
}

function eventMap(events: readonly SolverCausalEventV1[]): ReadonlyMap<number, SolverCausalEventV1> {
  return new Map(events.map((event) => [event.sequence, event]));
}

function validateTrace(
  trace: AlignSemanticEventsInputV1["left"],
  path: string,
  limits: SemanticEventAlignmentLimitsV1,
): void {
  const { events, target } = trace;
  if (trace.journalVersion !== 1) {
    fail("alignment.input-invalid", `${path}/journalVersion`, "expected 1");
  }
  if (trace.eventsOrder !== "sequence") {
    fail("alignment.input-invalid", `${path}/eventsOrder`, "expected sequence");
  }
  if (trace.retention.status !== "complete") {
    fail("alignment.input-invalid", `${path}/retention/status`, "overflowed journals cannot be aligned");
  }
  if (trace.requested.afterSequence !== null) {
    fail("alignment.input-invalid", `${path}/requested/afterSequence`, "alignment requires a drain beginning at sequence zero");
  }
  if (trace.window.status !== "complete") {
    fail("alignment.input-invalid", `${path}/window/status`, "alignment requires the complete journal, not one page");
  }
  if (events.length > limits.maxEventsPerTrace) {
    fail("alignment.limit", `${path}/events`, `event count exceeds ${limits.maxEventsPerTrace}`);
  }
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event === undefined) {
      fail("alignment.input-invalid", `${path}/${index}`, "missing event");
    }
    if (event.target !== target) {
      fail("alignment.input-invalid", `${path}/${index}/target`, "must equal trace target");
    }
    if (event.mode !== trace.mode) {
      fail("alignment.input-invalid", `${path}/events/${index}/mode`, "must equal journal mode");
    }
    if (event.sequence !== index) {
      fail("alignment.input-invalid", `${path}/events/${index}/sequence`, "must equal its contiguous zero-based event index");
    }
    if (!Number.isSafeInteger(event.occurrenceOrdinal) || event.occurrenceOrdinal < 0) {
      fail("alignment.input-invalid", `${path}/${index}/occurrenceOrdinal`, "must be a nonnegative integer");
    }
  }

  const expectedLast = events.length === 0 ? null : events.length - 1;
  const expectedFirst = events.length === 0 ? null : 0;
  if (
    trace.window.firstAvailableSequence !== expectedFirst
    || trace.window.availableThroughSequence !== expectedLast
    || trace.window.firstReturnedSequence !== expectedFirst
    || trace.window.lastReturnedSequence !== expectedLast
    || trace.window.nextAfterSequence !== expectedLast
  ) {
    fail("alignment.input-invalid", `${path}/window`, "must describe the complete contiguous event drain");
  }
  try {
    assertSolverCausalEventPageV1(trace);
  } catch (error) {
    if (error instanceof SolverCausalEventContractError) {
      fail(
        "alignment.input-invalid",
        `${path}${error.path}`,
        `invalid causal journal (${error.code}): ${error.message}`,
      );
    }
    throw error;
  }
}

export function alignSemanticEvents(
  input: AlignSemanticEventsInputV1,
): SemanticEventAlignmentV1 {
  if (input.alignmentVersion !== 1) {
    fail("alignment.input-invalid", "/alignmentVersion", "expected 1");
  }
  if (input.left.target === input.right.target) {
    fail("alignment.input-invalid", "/right/target", "cross-ruleset traces must use distinct targets");
  }
  if (input.left.mode !== input.right.mode) {
    fail("alignment.input-invalid", "/right/mode", "both journals must use the same runtime mode");
  }
  if (input.left.level.occurrenceId !== input.right.level.occurrenceId) {
    fail("alignment.input-invalid", "/right/level/occurrenceId", "must equal the left journal level occurrence");
  }
  if (
    input.left.level.normalizedGameplayDigest
    !== input.right.level.normalizedGameplayDigest
  ) {
    fail("alignment.input-invalid", "/right/level/normalizedGameplayDigest", "must equal the left journal gameplay identity");
  }

  const limits = limitsFor(input);
  validateTrace(input.left, "/left", limits);
  validateTrace(input.right, "/right", limits);
  const rows = input.left.events.length + 1;
  const columns = input.right.events.length + 1;
  if (rows * columns > limits.maxMatrixCells) {
    fail("alignment.limit", "/limits/maxMatrixCells", `alignment requires ${rows * columns} cells`);
  }

  const leftBySequence = eventMap(input.left.events);
  const rightBySequence = eventMap(input.right.events);
  const matrix: Array<MatrixCell | undefined> = new Array(rows * columns);
  const offset = (i: number, j: number) => i * columns + j;
  matrix[offset(0, 0)] = {
    quality: {
      score: 0,
      hardMatches: 0,
      mediumMatches: 0,
      divergences: 0,
      gaps: 0,
      spanExtra: 0,
    },
    previousI: 0,
    previousJ: 0,
    action: null,
    actionPriority: 0,
  };

  const retain = (i: number, j: number, candidate: MatrixCell): void => {
    const index = offset(i, j);
    const current = matrix[index];
    if (current === undefined || compareQuality(candidate, current) > 0) {
      matrix[index] = candidate;
    }
  };

  for (let i = 0; i < rows; i += 1) {
    for (let j = 0; j < columns; j += 1) {
      const current = matrix[offset(i, j)];
      if (current === undefined) {
        continue;
      }
      const left = input.left.events[i];
      const right = input.right.events[j];
      if (left !== undefined) {
        const action: RawAlignmentAction = { kind: "gap-left", events: [left] };
        retain(i + 1, j, {
          quality: addQuality(current.quality, action),
          previousI: i,
          previousJ: j,
          action,
          actionPriority: 40,
        });
      }
      if (right !== undefined) {
        const action: RawAlignmentAction = { kind: "gap-right", events: [right] };
        retain(i, j + 1, {
          quality: addQuality(current.quality, action),
          previousI: i,
          previousJ: j,
          action,
          actionPriority: 50,
        });
      }
      if (left !== undefined && right !== undefined) {
        const comparison = compareOne(left, right, leftBySequence, rightBySequence);
        if (comparison !== null) {
          const action: RawAlignmentAction = comparison.kind === "matched"
            ? {
                kind: "matched",
                left: [left],
                right: [right],
                strength: comparison.strength,
                score: comparison.score,
                basis: comparison.basis,
              }
            : {
                kind: "divergent",
                left: [left],
                right: [right],
                strength: comparison.strength,
                reason: comparison.reason,
              };
          retain(i + 1, j + 1, {
            quality: addQuality(current.quality, action),
            previousI: i,
            previousJ: j,
            action,
            actionPriority: comparison.kind === "matched" ? 10 : 30,
          });
        }

        for (let spanLength = 2; spanLength <= limits.maxMovementSpan; spanLength += 1) {
          const rightSpan = input.right.events.slice(j, j + spanLength);
          if (rightSpan.length === spanLength) {
            const spanComparison = compareMovementSpan(left, rightSpan);
            if (spanComparison?.kind === "matched") {
              const action: RawAlignmentAction = {
                kind: "matched",
                left: [left],
                right: rightSpan,
                strength: "soft",
                score: spanComparison.score,
                basis: spanComparison.basis,
              };
              retain(i + 1, j + spanLength, {
                quality: addQuality(current.quality, action),
                previousI: i,
                previousJ: j,
                action,
                actionPriority: 20 + spanLength,
              });
            }
          }

          const leftSpan = input.left.events.slice(i, i + spanLength);
          if (leftSpan.length === spanLength) {
            const spanComparison = compareMovementSpan(right, leftSpan);
            if (spanComparison?.kind === "matched") {
              const action: RawAlignmentAction = {
                kind: "matched",
                left: leftSpan,
                right: [right],
                strength: "soft",
                score: spanComparison.score,
                basis: spanComparison.basis,
              };
              retain(i + spanLength, j + 1, {
                quality: addQuality(current.quality, action),
                previousI: i,
                previousJ: j,
                action,
                actionPriority: 20 + spanLength,
              });
            }
          }
        }
      }
    }
  }

  const finalCell = matrix[offset(rows - 1, columns - 1)];
  if (finalCell === undefined) {
    fail("alignment.input-invalid", "/", "no alignment path exists");
  }
  const reversed: RawAlignmentAction[] = [];
  let i = rows - 1;
  let j = columns - 1;
  while (i !== 0 || j !== 0) {
    const cell = matrix[offset(i, j)];
    if (cell?.action === null || cell?.action === undefined) {
      fail("alignment.input-invalid", "/", "alignment path is incomplete");
    }
    reversed.push(cell.action);
    i = cell.previousI;
    j = cell.previousJ;
  }
  const spans = materializeSpans(reversed.reverse());

  return {
    alignmentVersion: 1,
    leftTarget: input.left.target,
    rightTarget: input.right.target,
    spanOrder: "semantic-sequence",
    spans,
    score: finalCell.quality.score,
    summary: summarize(spans),
    limits,
  };
}
