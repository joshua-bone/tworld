import { canonicalizeJson } from "../domain/canonicalJson.js";
import type {
  SolverCausalEventAuthorityV1,
  SolverCausalEventPageV1,
  SolverCausalEventParticipantV1,
  SolverCausalEventReadRequestV1,
  SolverCausalEventRetentionV1,
  SolverCausalEventV1,
  SolverCausalJournalCheckpointV1,
} from "./types.js";

export const SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS = 4_096;

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;

export type SolverCausalEventContractErrorCode =
  | "events.noncanonical-value"
  | "events.invalid-request"
  | "events.invalid-page"
  | "events.invalid-event"
  | "events.invalid-authority"
  | "events.invalid-window"
  | "events.invalid-retention"
  | "events.checkpoint-mismatch";

export class SolverCausalEventContractError extends Error {
  override readonly name = "SolverCausalEventContractError";

  constructor(
    readonly code: SolverCausalEventContractErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

type JsonRecord = Record<string, unknown>;

function fail(
  code: SolverCausalEventContractErrorCode,
  path: string,
  message: string,
): never {
  throw new SolverCausalEventContractError(code, path, message);
}

function assertCanonical(value: unknown): void {
  try {
    canonicalizeJson(value);
  } catch (cause) {
    throw new SolverCausalEventContractError(
      "events.noncanonical-value",
      "",
      "causal journal values must be canonical-JSON-safe",
      { cause },
    );
  }
}

function record(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code, path, "expected an object");
  }
  return value as JsonRecord;
}

function exactKeys(
  value: JsonRecord,
  expected: readonly string[],
  path: string,
  code: SolverCausalEventContractErrorCode,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    fail(code, path, `expected exactly keys ${wanted.join(", ")}`);
  }
}

function safeInteger(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
  minimum = 0,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(code, path, `expected a safe integer >= ${minimum}`);
  }
  return value as number;
}

function stableId(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    fail(code, path, "expected a protocol StableId of at most 128 lowercase ASCII characters");
  }
  return value;
}

function sha256Digest(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(code, path, "expected an exact lowercase SHA-256 digest");
  }
  return value;
}

function nullableActorId(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) {
    fail(code, path, "expected an exact stable actor identity");
  }
  return value;
}

function placementId(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string {
  if (typeof value !== "string" || !PLACEMENT_ID_PATTERN.test(value)) {
    fail(code, path, "expected an exact stable placement identity");
  }
  return value;
}

function nullablePlacementId(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string | null {
  return value === null ? null : placementId(value, path, code);
}

function nullableStableId(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): string | null {
  return value === null ? null : stableId(value, path, code);
}

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  path: string,
  code: SolverCausalEventContractErrorCode,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    fail(code, path, `expected one of ${choices.join(", ")}`);
  }
  return value as T;
}

function nullableCount(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): number | null {
  return value === null ? null : safeInteger(value, path, code);
}

function coordinate(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): void {
  const item = record(value, path, code);
  exactKeys(item, ["x", "y", "z"], path, code);
  safeInteger(item.x, `${path}/x`, code);
  safeInteger(item.y, `${path}/y`, code);
  safeInteger(item.z, `${path}/z`, code);
}

function nullableCoordinate(
  value: unknown,
  path: string,
  code: SolverCausalEventContractErrorCode,
): void {
  if (value !== null) coordinate(value, path, code);
}

function participant(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["semanticType", "actorId", "placementId", "deviceId"],
    path,
    "events.invalid-event",
  );
  stableId(item.semanticType, `${path}/semanticType`, "events.invalid-event");
  nullableActorId(item.actorId, `${path}/actorId`, "events.invalid-event");
  const participantPlacementId = nullablePlacementId(
    item.placementId,
    `${path}/placementId`,
    "events.invalid-event",
  );
  const deviceId = nullablePlacementId(item.deviceId, `${path}/deviceId`, "events.invalid-event");
  if (deviceId !== null && deviceId !== participantPlacementId) {
    fail(
      "events.invalid-event",
      `${path}/deviceId`,
      "a device identity must equal its stable placement identity",
    );
  }
}

function authority(value: unknown, path: string): SolverCausalEventAuthorityV1 {
  const item = record(value, path, "events.invalid-authority");
  exactKeys(item, ["basis", "evidence", "causality"], path, "events.invalid-authority");
  const basis = oneOf(
    item.basis,
    [
      "native-action-hook",
      "runtime-command",
      "native-diagnostic",
      "boundary-delta",
      "terminal-latch",
    ] as const,
    `${path}/basis`,
    "events.invalid-authority",
  );
  const evidence = oneOf(
    item.evidence,
    ["authoritative", "diagnostic-only"] as const,
    `${path}/evidence`,
    "events.invalid-authority",
  );
  const causality = oneOf(
    item.causality,
    ["explicit", "unattributed"] as const,
    `${path}/causality`,
    "events.invalid-authority",
  );

  const valid =
    (basis === "native-action-hook" && evidence === "authoritative")
    || (basis === "runtime-command" && evidence === "authoritative" && causality === "explicit")
    || (basis === "native-diagnostic" && evidence === "diagnostic-only")
    || (
      basis === "boundary-delta"
      && evidence === "diagnostic-only"
      && causality === "unattributed"
    )
    || (basis === "terminal-latch" && evidence === "authoritative");
  if (!valid) {
    fail(
      "events.invalid-authority",
      path,
      "the basis, evidence, and causality combination is not permitted",
    );
  }
  return item as SolverCausalEventAuthorityV1;
}

function commandDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["requestKind", "inputCode", "influence", "failureReason"],
    path,
    "events.invalid-event",
  );
  const requestKind = oneOf(
    item.requestKind,
    ["manual-poll", "replay-tick"] as const,
    `${path}/requestKind`,
    "events.invalid-event",
  );
  if (item.inputCode !== null) {
    safeInteger(item.inputCode, `${path}/inputCode`, "events.invalid-event", Number.MIN_SAFE_INTEGER);
  }
  if (requestKind === "replay-tick" && item.inputCode !== null) {
    fail("events.invalid-event", `${path}/inputCode`, "a replay tick has no external input code");
  }
  oneOf(
    item.influence,
    ["applied", "held", "blocked", "ignored"] as const,
    `${path}/influence`,
    "events.invalid-event",
  );
  nullableStableId(item.failureReason, `${path}/failureReason`, "events.invalid-event");
}

function movementDetail(value: unknown, path: string, blocked: boolean): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["direction", "movementRole", "attemptedCoordinate", "failureReason"],
    path,
    "events.invalid-event",
  );
  if (item.direction !== null) {
    oneOf(
      item.direction,
      ["north", "east", "south", "west"] as const,
      `${path}/direction`,
      "events.invalid-event",
    );
  }
  oneOf(
    item.movementRole,
    ["self", "push", "forced"] as const,
    `${path}/movementRole`,
    "events.invalid-event",
  );
  nullableCoordinate(item.attemptedCoordinate, `${path}/attemptedCoordinate`, "events.invalid-event");
  const failureReason = nullableStableId(
    item.failureReason,
    `${path}/failureReason`,
    "events.invalid-event",
  );
  if (blocked !== (failureReason !== null)) {
    fail(
      "events.invalid-event",
      `${path}/failureReason`,
      "only a blocked movement must carry the native first-failure reason",
    );
  }
}

function resourceCollectedDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    [
      "resourceType",
      "amount",
      "inventoryBefore",
      "inventoryAfter",
      "remainingBefore",
      "remainingAfter",
    ],
    path,
    "events.invalid-event",
  );
  stableId(item.resourceType, `${path}/resourceType`, "events.invalid-event");
  safeInteger(item.amount, `${path}/amount`, "events.invalid-event", 1);
  nullableCount(item.inventoryBefore, `${path}/inventoryBefore`, "events.invalid-event");
  nullableCount(item.inventoryAfter, `${path}/inventoryAfter`, "events.invalid-event");
  nullableCount(item.remainingBefore, `${path}/remainingBefore`, "events.invalid-event");
  nullableCount(item.remainingAfter, `${path}/remainingAfter`, "events.invalid-event");
}

function resourceCountDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["resourceType", "beforeCount", "afterCount", "reason"],
    path,
    "events.invalid-event",
  );
  stableId(item.resourceType, `${path}/resourceType`, "events.invalid-event");
  safeInteger(item.beforeCount, `${path}/beforeCount`, "events.invalid-event");
  safeInteger(item.afterCount, `${path}/afterCount`, "events.invalid-event");
  stableId(item.reason, `${path}/reason`, "events.invalid-event");
  if (item.beforeCount === item.afterCount) {
    fail("events.invalid-event", path, "a resource-count event must change its count");
  }
}

function mapMutationDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    [
      "mutation",
      "beforeSemanticType",
      "beforeState",
      "afterSemanticType",
      "afterState",
    ],
    path,
    "events.invalid-event",
  );
  stableId(item.mutation, `${path}/mutation`, "events.invalid-event");
  nullableStableId(item.beforeSemanticType, `${path}/beforeSemanticType`, "events.invalid-event");
  nullableStableId(item.beforeState, `${path}/beforeState`, "events.invalid-event");
  nullableStableId(item.afterSemanticType, `${path}/afterSemanticType`, "events.invalid-event");
  nullableStableId(item.afterState, `${path}/afterState`, "events.invalid-event");
  if (
    item.beforeSemanticType === item.afterSemanticType
    && item.beforeState === item.afterState
  ) {
    fail("events.invalid-event", path, "a map mutation must change semantic type or state");
  }
}

function deviceDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(item, ["action", "beforeState", "afterState"], path, "events.invalid-event");
  stableId(item.action, `${path}/action`, "events.invalid-event");
  nullableStableId(item.beforeState, `${path}/beforeState`, "events.invalid-event");
  nullableStableId(item.afterState, `${path}/afterState`, "events.invalid-event");
}

function teleportDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["networkId", "entryPlacementId", "exitPlacementId"],
    path,
    "events.invalid-event",
  );
  stableId(item.networkId, `${path}/networkId`, "events.invalid-event");
  placementId(item.entryPlacementId, `${path}/entryPlacementId`, "events.invalid-event");
  nullablePlacementId(item.exitPlacementId, `${path}/exitPlacementId`, "events.invalid-event");
}

function controlDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(item, ["before", "after", "reason"], path, "events.invalid-event");
  oneOf(
    item.before,
    ["available", "unavailable", "terminal"] as const,
    `${path}/before`,
    "events.invalid-event",
  );
  oneOf(
    item.after,
    ["available", "unavailable", "terminal"] as const,
    `${path}/after`,
    "events.invalid-event",
  );
  stableId(item.reason, `${path}/reason`, "events.invalid-event");
  if (item.before === item.after) {
    fail("events.invalid-event", path, "a control-change event must change control state");
  }
}

function lifecycleDetail(
  value: unknown,
  path: string,
  kind: "actor-spawned" | "actor-lifecycle-changed" | "actor-destroyed",
): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(
    item,
    ["before", "after", "parentActorId", "spawnOrdinal", "reason"],
    path,
    "events.invalid-event",
  );
  for (const key of ["before", "after"] as const) {
    if (item[key] !== null) {
      oneOf(
        item[key],
        ["active", "contained", "dormant", "destroyed"] as const,
        `${path}/${key}`,
        "events.invalid-event",
      );
    }
  }
  nullableActorId(item.parentActorId, `${path}/parentActorId`, "events.invalid-event");
  if (item.spawnOrdinal !== null) {
    safeInteger(item.spawnOrdinal, `${path}/spawnOrdinal`, "events.invalid-event", 1);
  }
  stableId(item.reason, `${path}/reason`, "events.invalid-event");
  if (kind === "actor-spawned") {
    if (item.before !== null || item.after === null || item.after === "destroyed") {
      fail(
        "events.invalid-event",
        path,
        "a spawned actor starts absent and ends in a live lifecycle",
      );
    }
  } else if (kind === "actor-lifecycle-changed") {
    if (item.before === null || item.after === null || item.before === item.after) {
      fail(
        "events.invalid-event",
        path,
        "an actor lifecycle change requires two distinct lifecycle states",
      );
    }
  } else if (item.before === null || item.before === "destroyed" || item.after !== "destroyed") {
    fail(
      "events.invalid-event",
      path,
      "a destroyed actor must transition from a live lifecycle to destroyed",
    );
  }
}

function deathDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(item, ["cause", "hazardPlacementId"], path, "events.invalid-event");
  stableId(item.cause, `${path}/cause`, "events.invalid-event");
  nullablePlacementId(item.hazardPlacementId, `${path}/hazardPlacementId`, "events.invalid-event");
}

function terminalResult(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  const kind = oneOf(
    item.kind,
    ["won", "lost", "timed-out"] as const,
    `${path}/kind`,
    "events.invalid-event",
  );
  if (kind === "won") {
    exactKeys(item, ["kind", "nativeTick", "coordinate", "exitPlacementId"], path, "events.invalid-event");
    nullablePlacementId(item.exitPlacementId, `${path}/exitPlacementId`, "events.invalid-event");
  } else if (kind === "lost") {
    exactKeys(item, ["kind", "nativeTick", "coordinate", "cause"], path, "events.invalid-event");
    stableId(item.cause, `${path}/cause`, "events.invalid-event");
  } else {
    exactKeys(item, ["kind", "nativeTick", "coordinate"], path, "events.invalid-event");
  }
  safeInteger(item.nativeTick, `${path}/nativeTick`, "events.invalid-event");
  nullableCoordinate(item.coordinate, `${path}/coordinate`, "events.invalid-event");
}

function terminalDetail(value: unknown, path: string): void {
  const item = record(value, path, "events.invalid-event");
  exactKeys(item, ["result"], path, "events.invalid-event");
  terminalResult(item.result, `${path}/result`);
}

function validateDetail(event: JsonRecord, path: string): void {
  const detailPath = `${path}/detail`;
  switch (event.kind) {
    case "command":
      commandDetail(event.detail, detailPath);
      break;
    case "movement-planned":
    case "movement-started":
    case "movement-completed":
      movementDetail(event.detail, detailPath, false);
      break;
    case "movement-blocked":
      movementDetail(event.detail, detailPath, true);
      break;
    case "resource-collected":
      resourceCollectedDetail(event.detail, detailPath);
      break;
    case "inventory-changed":
    case "requirement-changed":
      resourceCountDetail(event.detail, detailPath);
      break;
    case "map-mutated":
      mapMutationDetail(event.detail, detailPath);
      break;
    case "device-activated":
    case "device-state-changed":
      deviceDetail(event.detail, detailPath);
      break;
    case "teleport-entered":
    case "teleport-relocated":
    case "teleport-exited":
      teleportDetail(event.detail, detailPath);
      break;
    case "control-changed":
      controlDetail(event.detail, detailPath);
      break;
    case "actor-spawned":
    case "actor-lifecycle-changed":
    case "actor-destroyed":
      lifecycleDetail(event.detail, detailPath, event.kind);
      break;
    case "player-died":
      deathDetail(event.detail, detailPath);
      break;
    case "terminal-reached":
      terminalDetail(event.detail, detailPath);
      break;
    default:
      fail("events.invalid-event", `${path}/kind`, "unknown causal event kind");
  }
}

function sameCoordinate(
  left: { readonly x: number; readonly y: number; readonly z: number } | null,
  right: { readonly x: number; readonly y: number; readonly z: number } | null,
): boolean {
  return left !== null
    && right !== null
    && left.x === right.x
    && left.y === right.y
    && left.z === right.z;
}

function validateSemanticEffect(event: SolverCausalEventV1, path: string): void {
  if (event.kind === "device-state-changed" && event.detail.beforeState === event.detail.afterState) {
    fail(
      "events.invalid-event",
      `${path}/detail`,
      "a device-state change must change state",
    );
  }
  if (event.kind === "movement-completed") {
    if (
      event.coordinates.before === null
      || event.coordinates.after === null
      || sameCoordinate(event.coordinates.before, event.coordinates.after)
    ) {
      fail(
        "events.invalid-event",
        `${path}/coordinates`,
        "completed movement requires distinct non-null before and after coordinates",
      );
    }
  }
  if (event.kind === "teleport-relocated") {
    if (
      event.detail.exitPlacementId === null
      || event.coordinates.before === null
      || event.coordinates.after === null
      || sameCoordinate(event.coordinates.before, event.coordinates.after)
    ) {
      fail(
        "events.invalid-event",
        path,
        "teleport relocation requires an exit and distinct non-null coordinates",
      );
    }
  }
  if (
    event.kind === "terminal-reached"
    && event.detail.result.nativeTick !== event.boundary.nativeTick
  ) {
    fail(
      "events.invalid-event",
      `${path}/detail/result/nativeTick`,
      "terminal detail and event boundary must name the same native tick",
    );
  }
}

const EVENT_KEYS = [
  "eventVersion",
  "sequence",
  "occurrenceOrdinal",
  "target",
  "mode",
  "boundary",
  "authority",
  "subject",
  "source",
  "coordinates",
  "commandId",
  "planId",
  "causedBySequences",
  "kind",
  "detail",
] as const;

function validateEvent(value: unknown, path: string): SolverCausalEventV1 {
  const event = record(value, path, "events.invalid-event");
  exactKeys(event, EVENT_KEYS, path, "events.invalid-event");
  if (event.eventVersion !== 1) {
    fail("events.invalid-event", `${path}/eventVersion`, "expected event version 1");
  }
  const sequence = safeInteger(event.sequence, `${path}/sequence`, "events.invalid-event");
  safeInteger(event.occurrenceOrdinal, `${path}/occurrenceOrdinal`, "events.invalid-event");
  oneOf(event.target, ["ms", "lynx"] as const, `${path}/target`, "events.invalid-event");
  oneOf(event.mode, ["manual", "replay"] as const, `${path}/mode`, "events.invalid-event");

  const boundary = record(event.boundary, `${path}/boundary`, "events.invalid-event");
  exactKeys(boundary, ["nativeTick", "phase"], `${path}/boundary`, "events.invalid-event");
  safeInteger(boundary.nativeTick, `${path}/boundary/nativeTick`, "events.invalid-event");
  oneOf(
    boundary.phase,
    ["command", "transition", "settlement", "terminal"] as const,
    `${path}/boundary/phase`,
    "events.invalid-event",
  );

  const eventAuthority = authority(event.authority, `${path}/authority`);
  if (event.subject !== null) participant(event.subject, `${path}/subject`);
  if (event.source !== null) participant(event.source, `${path}/source`);

  const coordinates = record(event.coordinates, `${path}/coordinates`, "events.invalid-event");
  exactKeys(coordinates, ["before", "after"], `${path}/coordinates`, "events.invalid-event");
  nullableCoordinate(coordinates.before, `${path}/coordinates/before`, "events.invalid-event");
  nullableCoordinate(coordinates.after, `${path}/coordinates/after`, "events.invalid-event");

  const commandId = nullableStableId(event.commandId, `${path}/commandId`, "events.invalid-event");
  const planId = nullableStableId(event.planId, `${path}/planId`, "events.invalid-event");
  if (planId !== null && commandId === null) {
    fail("events.invalid-authority", `${path}/planId`, "plan authority must arrive through a command");
  }
  if (!Array.isArray(event.causedBySequences)) {
    fail("events.invalid-event", `${path}/causedBySequences`, "expected an array");
  }
  if (event.causedBySequences.length > SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS) {
    fail(
      "events.invalid-event",
      `${path}/causedBySequences`,
      `an event cannot retain more than ${SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS} causal links`,
    );
  }
  let previousCause = -1;
  for (const [causeIndex, causeValue] of event.causedBySequences.entries()) {
    const cause = safeInteger(
      causeValue,
      `${path}/causedBySequences/${causeIndex}`,
      "events.invalid-event",
    );
    if (cause >= sequence || cause <= previousCause) {
      fail(
        "events.invalid-authority",
        `${path}/causedBySequences/${causeIndex}`,
        "explicit causes must be unique earlier sequences in ascending order",
      );
    }
    previousCause = cause;
  }

  if (eventAuthority.causality === "unattributed") {
    if (commandId !== null || planId !== null || event.causedBySequences.length !== 0) {
      fail(
        "events.invalid-authority",
        path,
        "unattributed evidence cannot carry command, plan, or event causal links",
      );
    }
  } else if (commandId === null && event.causedBySequences.length === 0) {
    fail(
      "events.invalid-authority",
      path,
      "explicit causality requires a command or earlier event link",
    );
  }
  if (eventAuthority.basis === "runtime-command" && event.kind !== "command") {
    fail(
      "events.invalid-authority",
      `${path}/kind`,
      "runtime-command authority can author only command events",
    );
  }
  if (event.kind === "command" && eventAuthority.basis !== "runtime-command") {
    fail(
      "events.invalid-authority",
      `${path}/authority/basis`,
      "command events require runtime-command authority",
    );
  }
  if (event.kind === "command" && boundary.phase !== "command") {
    fail("events.invalid-event", `${path}/boundary/phase`, "command events use the command phase");
  }
  if (event.kind === "terminal-reached" && boundary.phase !== "terminal") {
    fail("events.invalid-event", `${path}/boundary/phase`, "terminal events use the terminal phase");
  }

  oneOf(
    event.kind,
    [
      "command",
      "movement-planned",
      "movement-blocked",
      "movement-started",
      "movement-completed",
      "resource-collected",
      "inventory-changed",
      "requirement-changed",
      "map-mutated",
      "device-activated",
      "device-state-changed",
      "teleport-entered",
      "teleport-relocated",
      "teleport-exited",
      "control-changed",
      "actor-spawned",
      "actor-lifecycle-changed",
      "actor-destroyed",
      "player-died",
      "terminal-reached",
    ] as const,
    `${path}/kind`,
    "events.invalid-event",
  );
  validateDetail(event, path);
  const validated = event as SolverCausalEventV1;
  validateSemanticEffect(validated, path);
  return validated;
}

function participantAnchor(value: SolverCausalEventParticipantV1 | null): string {
  return value === null
    ? "-"
    : [
        value.semanticType,
        value.actorId ?? "-",
        value.placementId ?? "-",
        value.deviceId ?? "-",
      ].join("|");
}

/** Stable target-local key used only to number repeated semantic events. */
export function identifySolverCausalEventOccurrenceAnchorV1(
  event: SolverCausalEventV1,
): string {
  let detailIdentity = "-";
  if (
    event.kind === "resource-collected"
    || event.kind === "inventory-changed"
    || event.kind === "requirement-changed"
  ) {
    detailIdentity = event.detail.resourceType;
  } else if (
    event.kind === "teleport-entered"
    || event.kind === "teleport-relocated"
    || event.kind === "teleport-exited"
  ) {
    detailIdentity = event.detail.networkId;
  }
  return [
    event.kind,
    participantAnchor(event.subject),
    participantAnchor(event.source),
    detailIdentity,
  ].join("||");
}

function validateReadRequest(value: unknown, canonical: boolean): SolverCausalEventReadRequestV1 {
  if (canonical) assertCanonical(value);
  const request = record(value, "", "events.invalid-request");
  exactKeys(request, ["afterSequence", "maximumEvents"], "", "events.invalid-request");
  if (request.afterSequence !== null) {
    safeInteger(request.afterSequence, "/afterSequence", "events.invalid-request");
  }
  const maximumEvents = safeInteger(
    request.maximumEvents,
    "/maximumEvents",
    "events.invalid-request",
    1,
  );
  if (maximumEvents > SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS) {
    fail(
      "events.invalid-request",
      "/maximumEvents",
      `maximumEvents cannot exceed ${SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS}`,
    );
  }
  return request as SolverCausalEventReadRequestV1;
}

export function assertSolverCausalEventReadRequestV1(
  value: unknown,
): asserts value is SolverCausalEventReadRequestV1 {
  validateReadRequest(value, true);
}

function validateRetention(value: unknown, path: string): SolverCausalEventRetentionV1 {
  const retention = record(value, path, "events.invalid-retention");
  if (retention.status === "complete") {
    exactKeys(retention, ["status"], path, "events.invalid-retention");
  } else if (retention.status === "overflow") {
    exactKeys(
      retention,
      ["status", "reason", "firstOmittedSequence", "omittedEventCount"],
      path,
      "events.invalid-retention",
    );
    if (retention.reason !== "capacity-exhausted") {
      fail("events.invalid-retention", `${path}/reason`, "unknown overflow reason");
    }
    safeInteger(
      retention.firstOmittedSequence,
      `${path}/firstOmittedSequence`,
      "events.invalid-retention",
    );
    safeInteger(
      retention.omittedEventCount,
      `${path}/omittedEventCount`,
      "events.invalid-retention",
      1,
    );
  } else {
    fail("events.invalid-retention", `${path}/status`, "unknown retention status");
  }
  return retention as SolverCausalEventRetentionV1;
}

function validateLevelBinding(page: JsonRecord): void {
  const level = record(page.level, "/level", "events.invalid-page");
  exactKeys(
    level,
    ["occurrenceId", "normalizationProfile", "normalizedGameplayDigest"],
    "/level",
    "events.invalid-page",
  );
  stableId(level.occurrenceId, "/level/occurrenceId", "events.invalid-page");
  stableId(level.normalizationProfile, "/level/normalizationProfile", "events.invalid-page");
  sha256Digest(
    level.normalizedGameplayDigest,
    "/level/normalizedGameplayDigest",
    "events.invalid-page",
  );

  const levelFacts = record(page.levelFacts, "/levelFacts", "events.invalid-page");
  exactKeys(
    levelFacts,
    ["protocolVersion", "artifactType", "schemaVersion", "digest"],
    "/levelFacts",
    "events.invalid-page",
  );
  if (
    levelFacts.protocolVersion !== 1
    || levelFacts.artifactType !== "level-facts"
    || levelFacts.schemaVersion !== 1
  ) {
    fail("events.invalid-page", "/levelFacts", "expected an exact level-facts v1 reference");
  }
  sha256Digest(levelFacts.digest, "/levelFacts/digest", "events.invalid-page");

  const provenance = record(page.provenance, "/provenance", "events.invalid-page");
  exactKeys(
    provenance,
    ["adapterId", "adapterRevision", "engineId", "engineRevision"],
    "/provenance",
    "events.invalid-page",
  );
  for (const key of ["adapterId", "adapterRevision", "engineId", "engineRevision"] as const) {
    stableId(provenance[key], `/provenance/${key}`, "events.invalid-page");
  }
}

export function assertSolverCausalEventPageV1(
  value: unknown,
): asserts value is SolverCausalEventPageV1 {
  assertCanonical(value);
  const page = record(value, "", "events.invalid-page");
  exactKeys(
    page,
    [
      "journalVersion",
      "target",
      "mode",
      "level",
      "levelFacts",
      "provenance",
      "requested",
      "eventsOrder",
      "events",
      "window",
      "retention",
    ],
    "",
    "events.invalid-page",
  );
  if (page.journalVersion !== 1) {
    fail("events.invalid-page", "/journalVersion", "expected journal version 1");
  }
  const target = oneOf(page.target, ["ms", "lynx"] as const, "/target", "events.invalid-page");
  const mode = oneOf(page.mode, ["manual", "replay"] as const, "/mode", "events.invalid-page");
  validateLevelBinding(page);
  const request = validateReadRequest(page.requested, false);
  if (page.eventsOrder !== "sequence") {
    fail("events.invalid-page", "/eventsOrder", "events must be ordered by sequence");
  }
  if (!Array.isArray(page.events)) {
    fail("events.invalid-page", "/events", "expected an event array");
  }
  if (page.events.length > request.maximumEvents) {
    fail("events.invalid-window", "/events", "the page exceeds its requested event bound");
  }

  const expectedFirstSequence = request.afterSequence === null ? 0 : request.afterSequence + 1;
  const occurrenceByAnchor = new Map<string, number>();
  const events = page.events.map((eventValue, index) => {
    const event = validateEvent(eventValue, `/events/${index}`);
    if (event.target !== target || event.mode !== mode) {
      fail(
        "events.invalid-page",
        `/events/${index}`,
        "event target and mode must match the journal page",
      );
    }
    if (event.sequence !== expectedFirstSequence + index) {
      fail("events.invalid-window", `/events/${index}/sequence`, "event sequences must be contiguous");
    }
    const occurrenceAnchor = identifySolverCausalEventOccurrenceAnchorV1(event);
    const previousOccurrence = occurrenceByAnchor.get(occurrenceAnchor);
    if (previousOccurrence !== undefined && event.occurrenceOrdinal !== previousOccurrence + 1) {
      fail(
        "events.invalid-event",
        `/events/${index}/occurrenceOrdinal`,
        "occurrence ordinals for one semantic anchor must be contiguous",
      );
    }
    if (request.afterSequence === null && previousOccurrence === undefined && event.occurrenceOrdinal !== 0) {
      fail(
        "events.invalid-event",
        `/events/${index}/occurrenceOrdinal`,
        "the first event for a semantic anchor starts its occurrence at zero",
      );
    }
    occurrenceByAnchor.set(occurrenceAnchor, event.occurrenceOrdinal);
    return event;
  });

  const window = record(page.window, "/window", "events.invalid-window");
  exactKeys(
    window,
    [
      "firstAvailableSequence",
      "availableThroughSequence",
      "firstReturnedSequence",
      "lastReturnedSequence",
      "nextAfterSequence",
      "status",
    ],
    "/window",
    "events.invalid-window",
  );
  for (const key of [
    "firstAvailableSequence",
    "availableThroughSequence",
    "firstReturnedSequence",
    "lastReturnedSequence",
    "nextAfterSequence",
  ] as const) {
    if (window[key] !== null) {
      safeInteger(window[key], `/window/${key}`, "events.invalid-window");
    }
  }
  const windowStatus = oneOf(
    window.status,
    ["complete", "maximum-events-reached"] as const,
    "/window/status",
    "events.invalid-window",
  );
  const firstReturned = events[0]?.sequence ?? null;
  const lastReturned = events.at(-1)?.sequence ?? null;
  if (window.firstReturnedSequence !== firstReturned || window.lastReturnedSequence !== lastReturned) {
    fail("events.invalid-window", "/window", "returned sequence bounds do not match the page events");
  }
  const expectedNext = lastReturned ?? request.afterSequence;
  if (window.nextAfterSequence !== expectedNext) {
    fail("events.invalid-window", "/window/nextAfterSequence", "next cursor does not match this page");
  }
  const availableThrough = window.availableThroughSequence as number | null;
  if ((availableThrough === null) !== (window.firstAvailableSequence === null)) {
    fail("events.invalid-window", "/window", "available sequence bounds must both be null or present");
  }
  if (availableThrough !== null && window.firstAvailableSequence !== 0) {
    fail("events.invalid-window", "/window/firstAvailableSequence", "retained journals start at zero");
  }
  if (lastReturned !== null && (availableThrough === null || lastReturned > availableThrough)) {
    fail("events.invalid-window", "/window/availableThroughSequence", "page exceeds available events");
  }
  if (windowStatus === "maximum-events-reached") {
    if (
      events.length !== request.maximumEvents
      || lastReturned === null
      || availableThrough === null
      || lastReturned >= availableThrough
    ) {
      fail(
        "events.invalid-window",
        "/window/status",
        "maximum-events-reached requires a full page with retained events remaining",
      );
    }
  } else {
    const cursor = request.afterSequence ?? -1;
    const caughtUp = events.length === 0
      ? availableThrough === null || cursor >= availableThrough
      : lastReturned === availableThrough;
    if (!caughtUp) {
      fail("events.invalid-window", "/window/status", "a complete page must be caught up");
    }
  }

  const retention = validateRetention(page.retention, "/retention");
  if (retention.status === "overflow") {
    const expectedFirstOmitted = availableThrough === null ? 0 : availableThrough + 1;
    if (retention.firstOmittedSequence !== expectedFirstOmitted) {
      fail(
        "events.invalid-retention",
        "/retention/firstOmittedSequence",
        "overflow must begin immediately after the retained prefix",
      );
    }
  }
}

export function assertSolverCausalJournalCheckpointV1(
  value: unknown,
): asserts value is SolverCausalJournalCheckpointV1 {
  assertCanonical(value);
  const checkpoint = record(value, "", "events.checkpoint-mismatch");
  exactKeys(
    checkpoint,
    ["nextSequence", "retainedEventCount", "retention"],
    "",
    "events.checkpoint-mismatch",
  );
  const nextSequence = safeInteger(
    checkpoint.nextSequence,
    "/nextSequence",
    "events.checkpoint-mismatch",
  );
  const retainedEventCount = safeInteger(
    checkpoint.retainedEventCount,
    "/retainedEventCount",
    "events.checkpoint-mismatch",
  );
  const retention = validateRetention(checkpoint.retention, "/retention");
  if (retention.status === "complete") {
    if (nextSequence !== retainedEventCount) {
      fail(
        "events.checkpoint-mismatch",
        "/nextSequence",
        "a complete checkpoint continues immediately after its retained prefix",
      );
    }
  } else if (
    retainedEventCount !== retention.firstOmittedSequence
    || nextSequence !== retention.firstOmittedSequence + retention.omittedEventCount
  ) {
    fail(
      "events.checkpoint-mismatch",
      "",
      "an overflow checkpoint must retain its exact omitted sequence range",
    );
  }
}

export function assertSolverCausalEventPageCheckpointCoherenceV1(
  page: SolverCausalEventPageV1,
  checkpoint: SolverCausalJournalCheckpointV1,
): void {
  assertSolverCausalEventPageV1(page);
  assertSolverCausalJournalCheckpointV1(checkpoint);
  const expectedAvailableThrough = checkpoint.retainedEventCount === 0
    ? null
    : checkpoint.retainedEventCount - 1;
  if (page.window.availableThroughSequence !== expectedAvailableThrough) {
    fail(
      "events.checkpoint-mismatch",
      "/window/availableThroughSequence",
      "page retained range does not match the checkpoint journal prefix",
    );
  }
  if (canonicalizeJson(page.retention) !== canonicalizeJson(checkpoint.retention)) {
    fail(
      "events.checkpoint-mismatch",
      "/retention",
      "page and checkpoint retention status differ",
    );
  }
}
