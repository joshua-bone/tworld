import type {
  RulesetTargetV1,
  SolverCoordinate,
  SolverCheckpointMetadata,
  SolverObservation,
  SolverRenderRegionRequest,
  SolverRuntimeMode,
  SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import {
  assertSolverCausalEventPageV1,
  assertSolverCausalEventPageCheckpointCoherenceV1,
  assertSolverCausalEventReadRequestV1,
  assertSolverCausalJournalCheckpointV1,
  type SolverCausalEventPageV1,
  type SolverCausalEventReadRequestV1,
  type SolverCausalJournalCheckpointV1,
} from "@tworld/ccsolver/events";
import {
  SolverRuntimeError,
  type SolverAdvanceRequest,
  type SolverCheckpoint,
  type SolverCheckpointHandle,
  type SolverRunHandle,
  type SolverRuntimeOperation,
  type SolverRuntimePort,
  type SolverRuntimeResult,
} from "@tworld/ccsolver/ports";
import { projectSemanticRenderRegion } from "./projectSemanticRenderRegion";

export interface SolverRuntimeDriver<
  Token extends object,
  ManualSource,
  ReplaySource,
> {
  startManual(source: ManualSource): SolverRuntimeResult<Token>;
  startReplay(source: ReplaySource): SolverRuntimeResult<Token>;
  /**
   * Must eagerly preserve every continuation-relevant field without mutating,
   * consuming, or retaining mutable aliases to `token`, including on failure.
   */
  cloneToken(token: Token): SolverRuntimeResult<Token>;
  /**
   * May mutate and return `token`, or return a replacement which owns its
   * continuation state without disposal-sensitive aliases to `token`.
   */
  advanceTick(token: Token, request: SolverAdvanceRequest): SolverRuntimeResult<Token>;
  /** Detached, non-consuming causal journal page read. */
  readEvents(
    token: Token,
    request: SolverCausalEventReadRequestV1,
  ): SolverRuntimeResult<SolverCausalEventPageV1>;
  /** Exact public continuation companion for checkpoint capture and restore. */
  causalJournalCheckpoint(token: Token): SolverRuntimeResult<SolverCausalJournalCheckpointV1 | null>;
  observe(token: Token): SolverRuntimeResult<SolverObservation>;
  /**
   * Re-identifies the complete public semantic observation after the kernel
   * applies its first-terminal latch. Exact/continuation fingerprints are not
   * semantic inputs; the returned value identifies every other field.
   */
  semanticFingerprint(observation: SolverObservation): SolverRuntimeResult<string>;
  /**
   * Pure exact-state read for restore equality, not a normalized semantic
   * digest. It must not mutate or consume `token`, including on failure.
   */
  exactRestoreDigest(token: Token): SolverRuntimeResult<string>;
  disposeToken?(token: Token): SolverRuntimeResult<void>;
}

export interface SolverRuntimeKernelOptions<
  Token extends object,
  ManualSource,
  ReplaySource,
> {
  readonly driver: SolverRuntimeDriver<Token, ManualSource, ReplaySource>;
  readonly ownerId: string;
  readonly target: RulesetTargetV1;
  readonly maximumLiveRuns: number;
  readonly maximumLiveCheckpoints: number;
}

type HandleAuthority = {
  readonly kind: "run" | "checkpoint";
  readonly kernel: object;
  readonly ownerId: string;
  readonly target: RulesetTargetV1;
};

const runAuthorities = new WeakMap<object, HandleAuthority>();
const checkpointAuthorities = new WeakMap<object, HandleAuthority>();
const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;

type RunEntry<Token> = {
  status: "live" | "disposed";
  token: Token | null;
  readonly mode: SolverRuntimeMode;
  readonly binding: RuntimeObservationBinding;
  terminal: SolverTerminalResult;
  queue: Promise<void>;
};

type CheckpointEntry<Token> = {
  status: "live" | "disposed";
  token: Token | null;
  readonly mode: SolverRuntimeMode;
  readonly binding: RuntimeObservationBinding;
  readonly terminal: SolverTerminalResult;
  readonly metadata: SolverCheckpointMetadata;
  readonly causalJournal: SolverCausalJournalCheckpointV1 | null;
  queue: Promise<void>;
};

type RuntimeObservationBinding = Pick<
  SolverObservation,
  "target" | "level" | "levelFacts" | "provenance" | "geometry"
>;

function observationBinding(observation: SolverObservation): RuntimeObservationBinding {
  return copy({
    target: observation.target,
    level: observation.level,
    levelFacts: observation.levelFacts,
    provenance: observation.provenance,
    geometry: observation.geometry,
  });
}

function sameObservationBinding(
  left: RuntimeObservationBinding,
  right: RuntimeObservationBinding,
): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0
    && !Object.is(value, -0);
}

function assertKernelOptions(
  options: SolverRuntimeKernelOptions<object, unknown, unknown>,
): void {
  if (options.ownerId.length === 0) {
    throw new TypeError("ownerId must not be empty");
  }
  for (const [name, value] of [
    ["maximumLiveRuns", options.maximumLiveRuns],
    ["maximumLiveCheckpoints", options.maximumLiveCheckpoints],
  ] as const) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
}

function adapterError(
  error: unknown,
  operation: SolverRuntimeOperation,
  message: string,
): SolverRuntimeError {
  if (error instanceof SolverRuntimeError) return error;
  return new SolverRuntimeError(
    "runtime.adapter-failure",
    operation,
    message,
    undefined,
    { cause: error },
  );
}

function validateTerminal(
  terminal: SolverTerminalResult,
  observation: SolverObservation,
  operation: SolverRuntimeOperation,
): void {
  const candidate = terminal as SolverTerminalResult & { readonly kind: unknown };
  if (candidate.kind === "running") return;
  if (!(["won", "lost", "timed-out"] as const).includes(candidate.kind as "won")) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the terminal result kind is unknown",
    );
  }
  const ended = terminal as Exclude<SolverTerminalResult, { readonly kind: "running" }>;
  if (!isNonnegativeSafeInteger(ended.nativeTick)) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "a terminal result must carry a nonnegative native tick",
    );
  }
  if (ended.nativeTick > observation.boundary.nativeTick) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "a terminal result cannot occur after its observation boundary",
    );
  }
  if (ended.coordinate !== null) {
    const { x, y, z } = ended.coordinate;
    if (
      !isNonnegativeSafeInteger(x) || x >= observation.geometry.width
      || !isNonnegativeSafeInteger(y) || y >= observation.geometry.height
      || !isNonnegativeSafeInteger(z) || z >= observation.geometry.depth
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "the terminal coordinate must be null or inside the level geometry",
      );
    }
  }
  if (
    ended.kind === "lost" && (typeof ended.cause !== "string" || ended.cause.length === 0)
    || ended.kind === "won"
      && ended.exitPlacementId !== null
      && (typeof ended.exitPlacementId !== "string" || ended.exitPlacementId.length === 0)
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the terminal result must carry target-neutral semantic identities",
    );
  }
}

function validateObservation(
  observation: SolverObservation,
  expected: {
    readonly target: RulesetTargetV1;
    readonly mode: SolverRuntimeMode;
  },
  operation: SolverRuntimeOperation,
): void {
  try {
    canonicalizeJson(observation);
  } catch (cause) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the adapter observation is not canonical-JSON-safe",
      undefined,
      { cause },
    );
  }
  if (observation.observationVersion !== 1) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the adapter returned an unsupported observation version",
    );
  }
  if (observation.target !== expected.target) {
    throw new SolverRuntimeError(
      "runtime.target-mismatch",
      operation,
      "the adapter observation target does not match the runtime target",
      { expectedTarget: expected.target, actualTarget: observation.target },
    );
  }
  if (observation.mode !== expected.mode) {
    throw new SolverRuntimeError(
      "runtime.mode-mismatch",
      operation,
      "the adapter observation mode does not match the run mode",
      { expectedMode: expected.mode, actualMode: observation.mode },
    );
  }
  if (
    !Number.isSafeInteger(observation.boundary.nativeTick)
    || observation.boundary.nativeTick < -1
    || Object.is(observation.boundary.nativeTick, -0)
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the observation boundary must be the canonical pre-tick -1 or a nonnegative native tick",
    );
  }
  const coordinateInsideGeometry = (coordinate: { x: number; y: number; z: number } | null): boolean => (
    coordinate === null
    || isNonnegativeSafeInteger(coordinate.x) && coordinate.x < width
      && isNonnegativeSafeInteger(coordinate.y) && coordinate.y < height
      && isNonnegativeSafeInteger(coordinate.z) && coordinate.z < depth
  );
  const { width, height, depth } = observation.geometry;
  const logicalCellCount = width * height * depth;
  if (
    !Number.isSafeInteger(width) || width <= 0
    || !Number.isSafeInteger(height) || height <= 0
    || !Number.isSafeInteger(depth) || depth <= 0
    || !Number.isSafeInteger(logicalCellCount)
    || logicalCellCount > 65_536
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the observation geometry must contain between 1 and 65,536 logical cells",
    );
  }
  for (const value of [
    observation.timing.currentTime,
    observation.timing.timeOffset,
    observation.timing.secondsPlayed,
    observation.timing.timeLimit,
  ]) {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "native timing fields must be safe integers and must normalize negative zero",
      );
    }
  }
  if (
    observation.timing.remainingNativeTicks !== null
    && !Number.isSafeInteger(observation.timing.remainingNativeTicks)
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "remainingNativeTicks must be a safe integer or null",
    );
  }
  const replayFields = [
    observation.input.replayCursor,
    observation.input.replayMoveCount,
    observation.input.replayBestTimeTicks,
  ] as const;
  if (
    observation.mode === "manual" && replayFields.some((value) => value !== null)
    || observation.mode === "replay" && replayFields.some((value) => !isNonnegativeSafeInteger(value))
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "replay cursor, move count, and best-time ticks must be null in manual mode and nonnegative in replay mode",
    );
  }
  for (const value of [
    observation.input.lastPolledInputCode,
    observation.input.lastAppliedInputCode,
  ]) {
    if (value !== null && (!Number.isSafeInteger(value) || Object.is(value, -0))) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "polled and applied input codes must be safe integers or null",
      );
    }
  }
  if (
    observation.boundary.nativeTick === -1
      && (observation.input.lastPolledInputCode !== null
        || observation.input.lastAppliedInputCode !== null)
    || observation.boundary.nativeTick >= 0
      && observation.input.lastAppliedInputCode === null
    || observation.boundary.nativeTick >= 0
      && observation.mode === "manual"
      && observation.input.lastPolledInputCode === null
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "input evidence must be absent before tick zero, applied thereafter, and include every manual poll",
    );
  }
  if (observation.mode === "replay" && observation.input.lastPolledInputCode !== null) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "a replay-owned run cannot report a host-polled input code",
    );
  }
  if (
    observation.cellsOrder !== "z-y-x"
    || observation.randomness.nativeStateFingerprintsOrder !== "state-id"
    || observation.actorsOrder !== "observation-order"
    || observation.inventoryOrder !== "runtime-slot-order"
    || observation.remainingRequirementsOrder !== "resource-type"
    || observation.devicesOrder !== "placement-id"
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the observation must declare every deterministic collection order",
    );
  }
  if (observation.cells.length !== logicalCellCount) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the observation must include every logical cell in the level geometry",
    );
  }
  let previousOrdinal = -1;
  const nonActorElementIdentities = new Set<string>();
  const actorCellObservations = new Map<string, {
    readonly ordinal: number;
    readonly semanticType: string;
    readonly facing: string | null;
    readonly state: string | null;
  }>();
  const stratumRank = new Map([
    ["terrain", 0],
    ["overlay", 1],
    ["pickup", 2],
    ["actor", 3],
    ["side", 4],
  ]);
  for (const cell of observation.cells) {
    const { x, y, z } = cell.coordinate;
    const ordinal = z * width * height + y * width + x;
    if (
      !isNonnegativeSafeInteger(x) || x >= width
      || !isNonnegativeSafeInteger(y) || y >= height
      || !isNonnegativeSafeInteger(z) || z >= depth
      || cell.cellOrdinal !== ordinal
      || ordinal !== previousOrdinal + 1
      || cell.elementsOrder !== "stratum-then-identity"
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "observation cells must be unique canonical z-y-x entries inside the level geometry",
      );
    }
    let previousElementKey = "";
    let previousElementRank = -1;
    for (const element of cell.elements) {
      const rank = stratumRank.get(element.stratum);
      const identityKey = element.identity.kind === "placement"
        ? element.identity.placementId
        : element.identity.kind === "actor"
          ? element.identity.actorId
          : element.identity.kind === "semantic"
            ? element.identity.semanticId
            : "";
      if (
        rank === undefined
        || typeof identityKey !== "string" || identityKey.length === 0
        || typeof element.semanticType !== "string" || element.semanticType.length === 0
        || element.state !== null && (typeof element.state !== "string" || element.state.length === 0)
        || rank < previousElementRank
        || rank === previousElementRank && identityKey <= previousElementKey
      ) {
        throw new SolverRuntimeError(
          "runtime.invalid-observation",
          operation,
          "cell elements must be semantic identities in strict stratum-then-identity order",
        );
      }
      previousElementRank = rank;
      previousElementKey = identityKey;
      if (element.identity.kind !== "actor") {
        const globalIdentity = `${element.identity.kind}:${identityKey}`;
        if (nonActorElementIdentities.has(globalIdentity)) {
          throw new SolverRuntimeError(
            "runtime.invalid-observation",
            operation,
            "a placement or synthesized semantic identity cannot appear more than once",
          );
        }
        nonActorElementIdentities.add(globalIdentity);
      }
      if (element.identity.kind === "actor") {
        if (actorCellObservations.has(element.identity.actorId)) {
          throw new SolverRuntimeError(
            "runtime.invalid-observation",
            operation,
            "an active actor identity cannot appear in more than one observed cell",
          );
        }
        actorCellObservations.set(element.identity.actorId, {
          ordinal,
          semanticType: element.semanticType,
          facing: element.facing,
          state: element.state,
        });
      }
    }
    previousOrdinal = ordinal;
  }
  if (!coordinateInsideGeometry(observation.player.coordinate)) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "the player coordinate must be null or inside the level geometry",
    );
  }
  if (observation.player.coordinate !== null && observation.player.lifecycle !== "destroyed") {
    const playerOrdinal = observation.player.coordinate.z * width * height
      + observation.player.coordinate.y * width
      + observation.player.coordinate.x;
    const playerElement = actorCellObservations.get(observation.player.actorId);
    if (
      playerElement?.ordinal !== playerOrdinal
      || playerElement.semanticType !== observation.player.semanticType
      || playerElement.facing !== observation.player.facing
      || playerElement.state !== observation.player.movement
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "the player actor element must agree with the observed player state",
      );
    }
  }
  if (
    observation.terminal.kind === "running"
      && (observation.player.control === "terminal"
        || observation.player.inputInfluence === "terminal")
    || observation.terminal.kind !== "running"
      && (observation.player.control !== "terminal"
        || observation.player.inputInfluence !== "terminal")
    || observation.terminal.kind === "running"
      && observation.mode === "replay"
      && observation.player.inputInfluence !== "replay-owned"
    || observation.terminal.kind === "running"
      && observation.mode === "manual"
      && observation.player.inputInfluence === "replay-owned"
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "player control and input influence must agree with terminal and mode ownership",
    );
  }
  const observedActorIds = new Set<string>([observation.player.actorId]);
  const observedActorRecords = new Map<string, {
    readonly coordinate: SolverCoordinate | null;
    readonly semanticType: string;
    readonly facing: string | null;
    readonly movement: string;
    readonly lifecycle: string;
    readonly isPlayer: boolean;
  }>([[observation.player.actorId, {
    coordinate: observation.player.coordinate,
    semanticType: observation.player.semanticType,
    facing: observation.player.facing,
    movement: observation.player.movement,
    lifecycle: observation.player.lifecycle,
    isPlayer: true,
  }]]);
  const nativePositions = new Set<string>();
  for (const [observationOrder, actor] of observation.actors.entries()) {
    const nativePosition = actor.nativePosition;
    const nativeCollectionAllowed = nativePosition === null
      || observation.target === "ms"
        && (nativePosition.collectionId === "ms:creatures"
          || nativePosition.collectionId === "ms:blocks")
      || observation.target === "lynx"
        && nativePosition.collectionId === "lynx:actors";
    const nativePositionKey = nativePosition === null
      ? null
      : `${nativePosition.collectionId}:${nativePosition.index}`;
    if (
      actor.observationOrder !== observationOrder
      || !nativeCollectionAllowed
      || nativePosition !== null && !isNonnegativeSafeInteger(nativePosition.index)
      || nativePositionKey !== null && nativePositions.has(nativePositionKey)
      || observedActorIds.has(actor.actorId)
      || !coordinateInsideGeometry(actor.coordinate)
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "actors must use contiguous observation order, unique target-native positions and identities, and coordinates inside the level geometry",
      );
    }
    observedActorIds.add(actor.actorId);
    observedActorRecords.set(actor.actorId, {
      coordinate: actor.coordinate,
      semanticType: actor.semanticType,
      facing: actor.facing,
      movement: actor.movement,
      lifecycle: actor.lifecycle,
      isPlayer: false,
    });
    if (nativePositionKey !== null) nativePositions.add(nativePositionKey);
    if (actor.coordinate !== null && actor.lifecycle !== "destroyed") {
      const actorOrdinal = actor.coordinate.z * width * height
        + actor.coordinate.y * width
        + actor.coordinate.x;
      const actorElement = actorCellObservations.get(actor.actorId);
      if (
        actorElement?.ordinal !== actorOrdinal
        || actorElement.semanticType !== actor.semanticType
        || actorElement.facing !== actor.facing
        || actorElement.state !== actor.movement
      ) {
        throw new SolverRuntimeError(
          "runtime.invalid-observation",
          operation,
          "each present actor element must agree with its observed actor state",
        );
      }
    }
  }
  for (const [actorId, actorElement] of actorCellObservations) {
    const actorRecord = observedActorRecords.get(actorId);
    const actorCoordinate = actorRecord?.coordinate;
    const actorOrdinal = actorCoordinate === null || actorCoordinate === undefined
      ? null
      : actorCoordinate.z * width * height + actorCoordinate.y * width + actorCoordinate.x;
    if (
      actorRecord === undefined
      || actorRecord.lifecycle === "destroyed"
      || actorOrdinal === null
      || actorElement.ordinal !== actorOrdinal
      || actorElement.semanticType !== actorRecord.semanticType
      || actorElement.facing !== actorRecord.facing
      || actorElement.state !== actorRecord.movement
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "every actor cell element must agree with exactly one present player or actor record",
      );
    }
  }
  let previousSlot = -1;
  for (const item of observation.inventory) {
    if (
      !isNonnegativeSafeInteger(item.slotOrder) || item.slotOrder <= previousSlot
      || !isNonnegativeSafeInteger(item.count)
      || typeof item.resourceType !== "string" || item.resourceType.length === 0
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "inventory entries must use strict runtime slot order and nonnegative semantic counts",
      );
    }
    previousSlot = item.slotOrder;
  }
  let previousRequirement = "";
  for (const requirement of observation.remainingRequirements) {
    if (
      typeof requirement.resourceType !== "string"
      || requirement.resourceType <= previousRequirement
      || !isNonnegativeSafeInteger(requirement.count)
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "remaining requirements must use strict resource-type order and nonnegative counts",
      );
    }
    previousRequirement = requirement.resourceType;
  }
  let previousDevice = "";
  for (const device of observation.devices) {
    if (
      typeof device.placementId !== "string" || device.placementId <= previousDevice
      || device.attributesOrder !== "name"
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "devices must use strict placement identity order",
      );
    }
    let previousAttribute = "";
    for (const attribute of device.attributes) {
      if (typeof attribute.name !== "string" || attribute.name <= previousAttribute) {
        throw new SolverRuntimeError(
          "runtime.invalid-observation",
          operation,
          "device attributes must use strict name order",
        );
      }
      previousAttribute = attribute.name;
    }
    previousDevice = device.placementId;
  }
  let previousStateId = "";
  for (const fingerprint of observation.randomness.nativeStateFingerprints) {
    if (
      typeof fingerprint.stateId !== "string" || fingerprint.stateId <= previousStateId
      || typeof fingerprint.fingerprint !== "string" || fingerprint.fingerprint.length === 0
    ) {
      throw new SolverRuntimeError(
        "runtime.invalid-observation",
        operation,
        "native state fingerprints must use strict state-id order and string fingerprints",
      );
    }
    previousStateId = fingerprint.stateId;
  }
  if (
    typeof observation.fingerprints.exact !== "string"
    || observation.fingerprints.exact.length === 0
    || typeof observation.fingerprints.semantic !== "string"
    || observation.fingerprints.semantic.length === 0
    || observation.fingerprints.continuation !== null
      && (typeof observation.fingerprints.continuation !== "string"
        || observation.fingerprints.continuation.length === 0)
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-observation",
      operation,
      "exact and semantic runtime fingerprints must not be empty",
    );
  }
  validateTerminal(observation.terminal, observation, operation);
}

function latchTerminal(
  current: SolverTerminalResult,
  observed: SolverTerminalResult,
): SolverTerminalResult {
  return copy(current.kind === "running" ? observed : current);
}

function assertIndependentClone<Token extends object>(
  source: Token,
  cloned: Token,
  operation: SolverRuntimeOperation,
): void {
  if (Object.is(source, cloned)) {
    throw new SolverRuntimeError(
      "runtime.adapter-failure",
      operation,
      "the runtime driver returned the live token instead of an independent clone",
    );
  }
}

export function createSolverRuntimeKernel<Token extends object, ManualSource, ReplaySource>(
  options: SolverRuntimeKernelOptions<Token, ManualSource, ReplaySource>,
): SolverRuntimePort<ManualSource, ReplaySource> {
  assertKernelOptions(options as SolverRuntimeKernelOptions<object, unknown, unknown>);
  const {
    driver,
    ownerId,
    target,
    maximumLiveRuns,
    maximumLiveCheckpoints,
  } = options;
  const kernelAuthority = Object.freeze({});
  const runs = new WeakMap<SolverRunHandle, RunEntry<Token>>();
  const checkpoints = new WeakMap<SolverCheckpointHandle, CheckpointEntry<Token>>();
  let liveRuns = 0;
  let reservedRuns = 0;
  let liveCheckpoints = 0;
  let reservedCheckpoints = 0;

  function error(
    code: ConstructorParameters<typeof SolverRuntimeError>[0],
    operation: SolverRuntimeOperation,
    message: string,
    details?: ConstructorParameters<typeof SolverRuntimeError>[3],
  ): SolverRuntimeError {
    return new SolverRuntimeError(code, operation, message, details);
  }

  function mintRunHandle(): SolverRunHandle {
    const handle = Object.freeze({}) as SolverRunHandle;
    runAuthorities.set(handle, {
      kind: "run",
      kernel: kernelAuthority,
      ownerId,
      target,
    });
    return handle;
  }

  function mintCheckpointHandle(): SolverCheckpointHandle {
    const handle = Object.freeze({}) as SolverCheckpointHandle;
    checkpointAuthorities.set(handle, {
      kind: "checkpoint",
      kernel: kernelAuthority,
      ownerId,
      target,
    });
    return handle;
  }

  function runEntry(
    handle: SolverRunHandle,
    operation: SolverRuntimeOperation,
    allowDisposed = false,
  ): RunEntry<Token> {
    const authority = isObject(handle) ? runAuthorities.get(handle) : undefined;
    if (authority === undefined || authority.kind !== "run") {
      throw error("runtime.run-not-found", operation, "the run handle is unknown");
    }
    if (authority.ownerId !== ownerId) {
      throw error(
        "runtime.run-owner-mismatch",
        operation,
        "the run belongs to a different runtime owner",
        { expectedOwnerId: ownerId, actualOwnerId: authority.ownerId },
      );
    }
    if (authority.target !== target) {
      throw error(
        "runtime.target-mismatch",
        operation,
        "the run belongs to a different ruleset target",
        { expectedTarget: target, actualTarget: authority.target },
      );
    }
    const entry = authority.kernel === kernelAuthority ? runs.get(handle) : undefined;
    if (entry === undefined) {
      throw error("runtime.run-not-found", operation, "the run is not registered by this runtime");
    }
    if (!allowDisposed && entry.status === "disposed") {
      throw error("runtime.run-disposed", operation, "the run has been disposed");
    }
    return entry;
  }

  function checkpointEntry(
    handle: SolverCheckpointHandle,
    operation: SolverRuntimeOperation,
    allowDisposed = false,
  ): CheckpointEntry<Token> {
    const authority = isObject(handle) ? checkpointAuthorities.get(handle) : undefined;
    if (authority === undefined || authority.kind !== "checkpoint") {
      throw error("runtime.checkpoint-not-found", operation, "the checkpoint handle is unknown");
    }
    if (authority.ownerId !== ownerId) {
      throw error(
        "runtime.checkpoint-owner-mismatch",
        operation,
        "the checkpoint belongs to a different runtime owner",
        { expectedOwnerId: ownerId, actualOwnerId: authority.ownerId },
      );
    }
    if (authority.target !== target) {
      throw error(
        "runtime.checkpoint-target-mismatch",
        operation,
        "the checkpoint belongs to a different ruleset target",
        { expectedTarget: target, actualTarget: authority.target },
      );
    }
    const entry = authority.kernel === kernelAuthority ? checkpoints.get(handle) : undefined;
    if (entry === undefined) {
      throw error(
        "runtime.checkpoint-not-found",
        operation,
        "the checkpoint is not registered by this runtime",
      );
    }
    if (!allowDisposed && entry.status === "disposed") {
      throw error("runtime.checkpoint-disposed", operation, "the checkpoint has been disposed");
    }
    return entry;
  }

  function queueRun<Result>(
    handle: SolverRunHandle,
    operation: SolverRuntimeOperation,
    action: (entry: RunEntry<Token>) => Promise<Result>,
  ): Promise<Result> {
    const entry = runEntry(handle, operation);
    const result = entry.queue.then(async () => {
      if (entry.status === "disposed" || entry.token === null) {
        throw error("runtime.run-disposed", operation, "the run has been disposed");
      }
      return action(entry);
    });
    entry.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function queueCheckpoint<Result>(
    handle: SolverCheckpointHandle,
    operation: SolverRuntimeOperation,
    action: (entry: CheckpointEntry<Token>) => Promise<Result>,
  ): Promise<Result> {
    const entry = checkpointEntry(handle, operation);
    const result = entry.queue.then(async () => {
      if (entry.status === "disposed" || entry.token === null) {
        throw error(
          "runtime.checkpoint-disposed",
          operation,
          "the checkpoint has been disposed",
        );
      }
      return action(entry);
    });
    entry.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  function reserveRun(operation: SolverRuntimeOperation): () => void {
    if (liveRuns + reservedRuns >= maximumLiveRuns) {
      throw error(
        "runtime.capacity-exhausted",
        operation,
        "the runtime run capacity is exhausted",
        { capacityKind: "runs", maximumLiveRuns },
      );
    }
    reservedRuns += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      reservedRuns -= 1;
    };
  }

  function reserveCheckpoint(operation: SolverRuntimeOperation): () => void {
    if (liveCheckpoints + reservedCheckpoints >= maximumLiveCheckpoints) {
      throw error(
        "runtime.capacity-exhausted",
        operation,
        "the runtime checkpoint capacity is exhausted",
        { capacityKind: "checkpoints", maximumLiveCheckpoints },
      );
    }
    reservedCheckpoints += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      reservedCheckpoints -= 1;
    };
  }

  async function disposeTokenQuietly(token: Token): Promise<void> {
    try {
      await driver.disposeToken?.(token);
    } catch {
      // Cleanup must never turn a successfully committed operation into a
      // reported failure after its visible state has already changed.
    }
  }

  async function disposeRegisteredToken(
    entry: { status: "live" | "disposed"; token: Token | null },
    operation: "disposeRun" | "disposeCheckpoint",
  ): Promise<boolean> {
    if (entry.status === "disposed" || entry.token === null) return false;
    const original = entry.token;
    if (driver.disposeToken === undefined) {
      entry.token = null;
      entry.status = "disposed";
      return true;
    }

    // Disposal is also transactional: if a driver mutates and then rejects its
    // token, the authority remains attached to an eager exact backup.
    const backup = await cloneToken(original, operation);
    try {
      await driver.disposeToken(original);
    } catch (cause) {
      entry.token = backup;
      throw adapterError(cause, operation, "the runtime driver could not dispose its exact token");
    }
    await disposeTokenQuietly(backup);
    entry.token = null;
    entry.status = "disposed";
    return true;
  }

  async function cloneToken(
    token: Token,
    operation: SolverRuntimeOperation,
  ): Promise<Token> {
    let cloned: Token | undefined;
    try {
      const sourceDigestBefore = await driver.exactRestoreDigest(token);
      cloned = await driver.cloneToken(token);
      assertIndependentClone(token, cloned, operation);
      const [sourceDigestAfter, cloneDigest] = await Promise.all([
        driver.exactRestoreDigest(token),
        driver.exactRestoreDigest(cloned),
      ]);
      if (
        typeof sourceDigestBefore !== "string" || sourceDigestBefore.length === 0
        || sourceDigestAfter !== sourceDigestBefore
        || cloneDigest !== sourceDigestBefore
      ) {
        throw new SolverRuntimeError(
          "runtime.adapter-failure",
          operation,
          "the runtime driver clone did not preserve one exact source state",
        );
      }
      return cloned;
    } catch (cause) {
      if (cloned !== undefined && !Object.is(cloned, token)) {
        await disposeTokenQuietly(cloned);
      }
      throw adapterError(cause, operation, "the runtime driver could not clone its exact token");
    }
  }

  async function observeToken(
    token: Token,
    mode: SolverRuntimeMode,
    operation: SolverRuntimeOperation,
    binding?: RuntimeObservationBinding,
  ): Promise<SolverObservation> {
    const probe = await cloneToken(token, operation);
    try {
      const exactBefore = await driver.exactRestoreDigest(probe);
      const observed = copy(await driver.observe(probe));
      const exactAfter = await driver.exactRestoreDigest(probe);
      if (
        typeof exactBefore !== "string" || exactBefore.length === 0
        || exactAfter !== exactBefore
        || observed.fingerprints.exact !== exactBefore
      ) {
        throw new SolverRuntimeError(
          "runtime.adapter-failure",
          operation,
          "runtime observation must be read-only and identify the exact observed token",
        );
      }
      validateObservation(observed, { target, mode }, operation);
      if (binding !== undefined && !sameObservationBinding(observationBinding(observed), binding)) {
        throw new SolverRuntimeError(
          "runtime.invalid-observation",
          operation,
          "the runtime observation changed its immutable level, facts, provenance, or geometry binding",
        );
      }
      return observed;
    } catch (cause) {
      throw adapterError(cause, operation, "the runtime driver could not project an observation");
    } finally {
      await disposeTokenQuietly(probe);
    }
  }

  async function observationWithTerminal(
    observation: SolverObservation,
    terminal: SolverTerminalResult,
    operation: Extract<SolverRuntimeOperation, "observe" | "projectRender">,
  ): Promise<SolverObservation> {
    const provisional: SolverObservation = copy({
      ...observation,
      terminal,
      player: terminal.kind === "running" ? observation.player : {
        ...observation.player,
        control: "terminal" as const,
        inputInfluence: "terminal" as const,
      },
      fingerprints: {
        ...observation.fingerprints,
        semantic: "semantic-fingerprint:pending",
      },
    });
    try {
      const semantic = await driver.semanticFingerprint(copy(provisional));
      if (typeof semantic !== "string" || semantic.length === 0) {
        throw error(
          "runtime.invalid-observation",
          operation,
          "the runtime driver returned an empty semantic fingerprint",
        );
      }
      const result = copy({
        ...provisional,
        fingerprints: {
          ...provisional.fingerprints,
          semantic,
        },
      });
      validateObservation(result, { target, mode: result.mode }, operation);
      return result;
    } catch (cause) {
      throw adapterError(
        cause,
        operation,
        "the runtime driver could not identify the terminal-latched observation",
      );
    }
  }

  async function exactRestoreDigest(
    token: Token,
    operation: SolverRuntimeOperation,
  ): Promise<string> {
    const probe = await cloneToken(token, operation);
    try {
      const digest = await driver.exactRestoreDigest(probe);
      if (typeof digest !== "string" || digest.length === 0) {
        throw error(
          "runtime.invalid-checkpoint",
          operation,
          "the runtime driver returned an empty exact restore digest",
        );
      }
      return digest;
    } catch (cause) {
      throw adapterError(cause, operation, "the runtime driver could not fingerprint its exact token");
    } finally {
      await disposeTokenQuietly(probe);
    }
  }

  async function causalJournalCheckpoint(
    token: Token,
    operation: SolverRuntimeOperation,
  ): Promise<SolverCausalJournalCheckpointV1 | null> {
    const before = await exactRestoreDigest(token, operation);
    const checkpoint = copy(await driver.causalJournalCheckpoint(token));
    const after = await exactRestoreDigest(token, operation);
    if (before !== after) {
      throw error(
        "runtime.adapter-failure",
        operation,
        "the runtime driver mutated exact continuation while reading causal journal metadata",
      );
    }
    if (checkpoint !== null) assertSolverCausalJournalCheckpointV1(checkpoint);
    return checkpoint;
  }

  function registerRun(
    token: Token,
    mode: SolverRuntimeMode,
    terminal: SolverTerminalResult,
    binding: RuntimeObservationBinding,
  ): SolverRunHandle {
    const handle = mintRunHandle();
    runs.set(handle, {
      status: "live",
      token,
      mode,
      binding: copy(binding),
      terminal: copy(terminal),
      queue: Promise.resolve(),
    });
    liveRuns += 1;
    return handle;
  }

  function registerCheckpoint(
    token: Token,
    mode: SolverRuntimeMode,
    terminal: SolverTerminalResult,
    metadata: SolverCheckpointMetadata,
    causalJournal: SolverCausalJournalCheckpointV1 | null,
    binding: RuntimeObservationBinding,
  ): SolverCheckpoint {
    const handle = mintCheckpointHandle();
    const detachedMetadata = copy(metadata);
    checkpoints.set(handle, {
      status: "live",
      token,
      mode,
      binding: copy(binding),
      terminal: copy(terminal),
      metadata: detachedMetadata,
      causalJournal: copy(causalJournal),
      queue: Promise.resolve(),
    });
    liveCheckpoints += 1;
    return {
      handle,
      metadata: copy(detachedMetadata),
      causalJournal: copy(causalJournal),
    };
  }

  async function start(
    mode: SolverRuntimeMode,
    operation: "startManual" | "startReplay",
    source: ManualSource | ReplaySource,
  ): Promise<SolverRunHandle> {
    const releaseReservation = reserveRun(operation);
    let token: Token | undefined;
    try {
      // Detach synchronously, before the first await. A caller must not be able
      // to change bytes, replay commands, or options while an asynchronous
      // driver validates and starts the run.
      const detachedSource = copy(source);
      token = mode === "manual"
        ? await driver.startManual(detachedSource as ManualSource)
        : await driver.startReplay(detachedSource as ReplaySource);
      const observed = await observeToken(token, mode, operation);
      const terminal = latchTerminal({ kind: "running" }, observed.terminal);
      const handle = registerRun(token, mode, terminal, observationBinding(observed));
      token = undefined;
      return handle;
    } catch (cause) {
      if (token !== undefined) await disposeTokenQuietly(token);
      throw adapterError(cause, operation, "the runtime driver could not start a run");
    } finally {
      releaseReservation();
    }
  }

  function validateAdvanceRequest(
    mode: SolverRuntimeMode,
    request: SolverAdvanceRequest,
  ): void {
    if (request.kind === "manual-poll") {
      if (!Number.isSafeInteger(request.inputCode) || Object.is(request.inputCode, -0)) {
        throw error(
          "runtime.invalid-request",
          "advanceTick",
          "a manual poll requires one safe integer native input code",
        );
      }
      if (mode !== "manual") {
        throw error(
          "runtime.mode-mismatch",
          "advanceTick",
          "a manual poll cannot advance a replay run",
          { expectedMode: "manual", actualMode: mode },
        );
      }
      return;
    }
    if (request.kind !== "replay-tick") {
      throw error("runtime.invalid-request", "advanceTick", "the advance request kind is unknown");
    }
    if (mode !== "replay") {
      throw error(
        "runtime.mode-mismatch",
        "advanceTick",
        "a replay tick cannot advance a manual run",
        { expectedMode: "replay", actualMode: mode },
      );
    }
  }

  function detachAdvanceRequest(request: SolverAdvanceRequest): SolverAdvanceRequest {
    if (!isObject(request)) {
      throw error("runtime.invalid-request", "advanceTick", "the advance request must be an object");
    }
    const candidate = request as unknown as Record<string, unknown>;
    const detachCausalContext = () => {
      if (!Object.hasOwn(candidate, "causalContext")) return undefined;
      if (!isObject(candidate.causalContext)) {
        throw error(
          "runtime.invalid-request",
          "advanceTick",
          "causalContext must be an object when supplied",
        );
      }
      const context = candidate.causalContext as Record<string, unknown>;
      if (typeof context.commandId !== "string" || !STABLE_ID_PATTERN.test(context.commandId)) {
        throw error(
          "runtime.invalid-request",
          "advanceTick",
          "causalContext.commandId must be a non-empty stable identity",
        );
      }
      if (
        context.planId !== null
        && (typeof context.planId !== "string" || !STABLE_ID_PATTERN.test(context.planId))
      ) {
        throw error(
          "runtime.invalid-request",
          "advanceTick",
          "causalContext.planId must be null or a non-empty stable identity",
        );
      }
      return {
        commandId: context.commandId,
        planId: context.planId as string | null,
      };
    };
    if (candidate.kind === "manual-poll") {
      if (!Number.isSafeInteger(candidate.inputCode) || Object.is(candidate.inputCode, -0)) {
        throw error(
          "runtime.invalid-request",
          "advanceTick",
          "a manual poll requires one safe integer native input code",
        );
      }
      const causalContext = detachCausalContext();
      return causalContext === undefined
        ? { kind: "manual-poll", inputCode: candidate.inputCode as number }
        : { kind: "manual-poll", inputCode: candidate.inputCode as number, causalContext };
    }
    if (candidate.kind === "replay-tick") {
      if (Object.hasOwn(candidate, "inputCode")) {
        throw error(
          "runtime.input-not-allowed-in-replay",
          "advanceTick",
          "a replay tick cannot carry external input",
        );
      }
      const causalContext = detachCausalContext();
      return causalContext === undefined
        ? { kind: "replay-tick" }
        : { kind: "replay-tick", causalContext };
    }
    throw error("runtime.invalid-request", "advanceTick", "the advance request kind is unknown");
  }

  function detachCausalEventReadRequest(
    request: SolverCausalEventReadRequestV1,
  ): SolverCausalEventReadRequestV1 {
    const detached = copy(request);
    try {
      assertSolverCausalEventReadRequestV1(detached);
      return detached;
    } catch (cause) {
      throw new SolverRuntimeError(
        "runtime.invalid-request",
        "readEvents",
        "the causal event read request is invalid",
        undefined,
        { cause },
      );
    }
  }

  function detachRenderRegionRequest(
    request: SolverRenderRegionRequest,
  ): SolverRenderRegionRequest {
    if (!isObject(request)) {
      throw error("runtime.invalid-request", "projectRender", "the render request must be an object");
    }
    const candidate = request as unknown as Record<string, unknown>;
    if (candidate.kind === "full-map") return { kind: "full-map" };
    if (candidate.kind !== "box" || !isObject(candidate.minimum) || !isObject(candidate.maximum)) {
      throw error("runtime.invalid-request", "projectRender", "the render request kind or box is invalid");
    }
    const minimum = candidate.minimum as Record<string, unknown>;
    const maximum = candidate.maximum as Record<string, unknown>;
    return {
      kind: "box",
      minimum: {
        x: minimum.x as number,
        y: minimum.y as number,
        z: minimum.z as number,
      },
      maximum: {
        x: maximum.x as number,
        y: maximum.y as number,
        z: maximum.z as number,
      },
    };
  }

  async function advance(
    entry: RunEntry<Token>,
    request: SolverAdvanceRequest,
  ): Promise<void> {
    validateAdvanceRequest(entry.mode, request);
    const original = entry.token;
    if (original === null) {
      throw error("runtime.run-disposed", "advanceTick", "the run has been disposed");
    }
    const working = await cloneToken(original, "advanceTick");
    let advanced: Token | undefined;
    try {
      advanced = await driver.advanceTick(working, request);
      if (Object.is(advanced, original)) {
        throw error(
          "runtime.adapter-failure",
          "advanceTick",
          "the runtime driver returned the live source token instead of its working branch",
        );
      }
      const observed = await observeToken(advanced, entry.mode, "advanceTick", entry.binding);
      const terminal = latchTerminal(entry.terminal, observed.terminal);
      entry.token = advanced;
      entry.terminal = terminal;
      advanced = undefined;
      if (!Object.is(entry.token, working)) await disposeTokenQuietly(working);
      await disposeTokenQuietly(original);
    } catch (cause) {
      if (
        advanced !== undefined
        && !Object.is(advanced, working)
        && !Object.is(advanced, original)
      ) {
        await disposeTokenQuietly(advanced);
      }
      await disposeTokenQuietly(working);
      throw adapterError(cause, "advanceTick", "the runtime driver could not advance one native tick");
    }
  }

  async function capture(entry: RunEntry<Token>): Promise<SolverCheckpoint> {
    const releaseReservation = reserveCheckpoint("captureCheckpoint");
    const source = entry.token;
    if (source === null) {
      releaseReservation();
      throw error("runtime.run-disposed", "captureCheckpoint", "the run has been disposed");
    }
    let checkpointToken: Token | undefined;
    try {
      checkpointToken = await cloneToken(source, "captureCheckpoint");
      const observed = await observeToken(
        checkpointToken,
        entry.mode,
        "captureCheckpoint",
        entry.binding,
      );
      const digest = await exactRestoreDigest(checkpointToken, "captureCheckpoint");
      const causalJournal = await causalJournalCheckpoint(checkpointToken, "captureCheckpoint");
      if (observed.fingerprints.exact !== digest) {
        throw error(
          "runtime.invalid-checkpoint",
          "captureCheckpoint",
          "the observation exact fingerprint does not match the checkpoint restore digest",
          { observationDigest: observed.fingerprints.exact, exactRestoreDigest: digest },
        );
      }
      const result = registerCheckpoint(
        checkpointToken,
        entry.mode,
        entry.terminal,
        checkpointMetadataFor(observed, digest),
        causalJournal,
        entry.binding,
      );
      checkpointToken = undefined;
      return result;
    } catch (cause) {
      if (checkpointToken !== undefined) await disposeTokenQuietly(checkpointToken);
      throw adapterError(cause, "captureCheckpoint", "the runtime could not capture a checkpoint");
    } finally {
      releaseReservation();
    }
  }

  function checkpointMetadataFor(
    observed: SolverObservation,
    exactRestoreDigestValue: string,
  ): SolverCheckpointMetadata {
    return {
      target,
      mode: observed.mode,
      level: observed.level,
      levelFacts: observed.levelFacts,
      nativeTick: observed.boundary.nativeTick,
      exactRestoreDigest: exactRestoreDigestValue,
      provenance: observed.provenance,
    };
  }

  async function verifyCheckpointToken(
    token: Token,
    entry: CheckpointEntry<Token>,
    operation: "cloneCheckpoint" | "restoreCheckpoint",
  ): Promise<void> {
    const digest = await exactRestoreDigest(token, operation);
    if (digest !== entry.metadata.exactRestoreDigest) {
      throw error(
        "runtime.invalid-checkpoint",
        operation,
        "the cloned token does not match the checkpoint exact restore digest",
        { expectedDigest: entry.metadata.exactRestoreDigest, actualDigest: digest },
      );
    }
    const observed = await observeToken(token, entry.mode, operation, entry.binding);
    const observedMetadata = checkpointMetadataFor(observed, digest);
    const causalJournal = await causalJournalCheckpoint(token, operation);
    if (
      observed.fingerprints.exact !== digest
      || canonicalizeJson(observedMetadata) !== canonicalizeJson(entry.metadata)
      || canonicalizeJson(causalJournal) !== canonicalizeJson(entry.causalJournal)
    ) {
      throw error(
        "runtime.invalid-checkpoint",
        operation,
        "the cloned token observation does not match its checkpoint metadata",
      );
    }
  }

  const port: SolverRuntimePort<ManualSource, ReplaySource> = {
    startManual(source) {
      return start("manual", "startManual", source);
    },
    startReplay(source) {
      return start("replay", "startReplay", source);
    },
    advanceTick(run, request) {
      runEntry(run, "advanceTick");
      const detachedRequest = detachAdvanceRequest(request);
      return queueRun(run, "advanceTick", (entry) => advance(entry, detachedRequest));
    },
    readEvents(run, request) {
      runEntry(run, "readEvents");
      const detachedRequest = detachCausalEventReadRequest(request);
      return queueRun(run, "readEvents", async (entry) => {
        const source = entry.token;
        if (source === null) {
          throw error("runtime.run-disposed", "readEvents", "the run has been disposed");
        }
        const probe = await cloneToken(source, "readEvents");
        try {
          const before = await exactRestoreDigest(probe, "readEvents");
          const page = copy(await driver.readEvents(probe, detachedRequest));
          const companion = copy(await driver.causalJournalCheckpoint(probe));
          const after = await exactRestoreDigest(probe, "readEvents");
          if (before !== after) {
            throw error(
              "runtime.adapter-failure",
              "readEvents",
              "the runtime driver mutated causal journal continuation while reading it",
            );
          }
          assertSolverCausalEventPageV1(page);
          if (companion === null) {
            throw error(
              "runtime.adapter-failure",
              "readEvents",
              "the runtime driver returned events while causal capture is disabled",
            );
          }
          assertSolverCausalJournalCheckpointV1(companion);
          assertSolverCausalEventPageCheckpointCoherenceV1(page, companion);
          if (!sameObservationBinding(entry.binding, {
            target: page.target,
            level: page.level,
            levelFacts: page.levelFacts,
            provenance: page.provenance,
            geometry: entry.binding.geometry,
          }) || page.mode !== entry.mode) {
            throw error(
              "runtime.adapter-failure",
              "readEvents",
              "the causal journal page does not match its run binding",
            );
          }
          return page;
        } catch (cause) {
          throw adapterError(cause, "readEvents", "the runtime driver could not read causal events");
        } finally {
          await disposeTokenQuietly(probe);
        }
      });
    },
    observe(run) {
      return queueRun(run, "observe", async (entry) => {
        const token = entry.token;
        if (token === null) throw error("runtime.run-disposed", "observe", "the run has been disposed");
        const observed = await observeToken(token, entry.mode, "observe", entry.binding);
        return observationWithTerminal(observed, entry.terminal, "observe");
      });
    },
    terminal(run) {
      return queueRun(run, "terminal", async (entry) => copy(entry.terminal));
    },
    captureCheckpoint(run) {
      return queueRun(run, "captureCheckpoint", capture);
    },
    cloneCheckpoint(checkpoint) {
      return queueCheckpoint(checkpoint, "cloneCheckpoint", async (entry) => {
        const releaseReservation = reserveCheckpoint("cloneCheckpoint");
        const source = entry.token;
        let cloned: Token | undefined;
        try {
          if (source === null) {
            throw error(
              "runtime.checkpoint-disposed",
              "cloneCheckpoint",
              "the checkpoint has been disposed",
            );
          }
          cloned = await cloneToken(source, "cloneCheckpoint");
          await verifyCheckpointToken(cloned, entry, "cloneCheckpoint");
          const result = registerCheckpoint(
            cloned,
            entry.mode,
            entry.terminal,
            entry.metadata,
            entry.causalJournal,
            entry.binding,
          );
          cloned = undefined;
          return result;
        } catch (cause) {
          if (cloned !== undefined) await disposeTokenQuietly(cloned);
          throw adapterError(cause, "cloneCheckpoint", "the runtime could not clone a checkpoint");
        } finally {
          releaseReservation();
        }
      });
    },
    restoreCheckpoint(checkpoint) {
      return queueCheckpoint(checkpoint, "restoreCheckpoint", async (entry) => {
        const releaseReservation = reserveRun("restoreCheckpoint");
        const source = entry.token;
        let restored: Token | undefined;
        try {
          if (source === null) {
            throw error(
              "runtime.checkpoint-disposed",
              "restoreCheckpoint",
              "the checkpoint has been disposed",
            );
          }
          restored = await cloneToken(source, "restoreCheckpoint");
          await verifyCheckpointToken(restored, entry, "restoreCheckpoint");
          const handle = registerRun(restored, entry.mode, entry.terminal, entry.binding);
          restored = undefined;
          return handle;
        } catch (cause) {
          if (restored !== undefined) await disposeTokenQuietly(restored);
          throw adapterError(cause, "restoreCheckpoint", "the runtime could not restore a checkpoint");
        } finally {
          releaseReservation();
        }
      });
    },
    projectRender(run, region) {
      runEntry(run, "projectRender");
      const detachedRegion = detachRenderRegionRequest(region);
      return queueRun(run, "projectRender", async (entry) => {
        const token = entry.token;
        if (token === null) {
          throw error("runtime.run-disposed", "projectRender", "the run has been disposed");
        }
        const observed = await observeToken(token, entry.mode, "projectRender", entry.binding);
        const detached = await observationWithTerminal(
          observed,
          entry.terminal,
          "projectRender",
        );
        try {
          return projectSemanticRenderRegion(detached, detachedRegion);
        } catch (cause) {
          if (cause instanceof SolverRuntimeError) throw cause;
          throw new SolverRuntimeError(
            "runtime.invalid-projection",
            "projectRender",
            "the semantic render projection failed",
            undefined,
            { cause },
          );
        }
      });
    },
    disposeRun(run) {
      const entry = runEntry(run, "disposeRun", true);
      const result = entry.queue.then(async () => {
        if (await disposeRegisteredToken(entry, "disposeRun")) liveRuns -= 1;
      });
      entry.queue = result.then(() => undefined, () => undefined);
      return result;
    },
    disposeCheckpoint(checkpoint) {
      const entry = checkpointEntry(checkpoint, "disposeCheckpoint", true);
      const result = entry.queue.then(async () => {
        if (await disposeRegisteredToken(entry, "disposeCheckpoint")) liveCheckpoints -= 1;
      });
      entry.queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };

  return port;
}
