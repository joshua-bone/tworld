import {
  HYBRIDCC_V1_ABI,
  type HybridCcV1Actor,
  type HybridCcV1Cell,
  type HybridCcV1Element,
  type HybridCcV1Event,
  type HybridCcV1InventoryEntry,
  type HybridCcV1MotionTrack,
  type HybridCcV1PlayerPush,
  type HybridCcV1Snapshot,
} from "./wasmBridge";
import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_OUTCOME,
} from "./engineFacts";

export const TEST_CHANNEL = {
  bytes: new Uint8Array(4),
  isNone: true,
};

export function testElement(
  overrides: Partial<HybridCcV1Element> = {},
): HybridCcV1Element {
  return {
    id: HYBRID_CC_V1_ELEMENT.none,
    color: 0,
    direction: HYBRID_CC_V1_DIRECTION.none,
    speed: 1,
    rule: 0,
    impactRule: 0,
    movementRule: 0,
    orientation: 0,
    channel: TEST_CHANNEL,
    count: 0,
    countIsUnlimited: false,
    textIndex: 0,
    timeLimitSeconds: 0,
    ...overrides,
  };
}

export function testCell(overrides: Partial<HybridCcV1Cell> = {}): HybridCcV1Cell {
  return {
    terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.floor }),
    device: testElement(),
    pickup: testElement(),
    sides: [],
    occupant: null,
    terrainSignal: { participates: false, color: 0, channel: TEST_CHANNEL, value: 0n, active: false },
    deviceSignal: { participates: false, color: 0, channel: TEST_CHANNEL, value: 0n, active: false },
    pickupSignal: { participates: false, color: 0, channel: TEST_CHANNEL, value: 0n, active: false },
    trapOpen: false,
    toggleWallOpen: false,
    bombArmed: false,
    ...overrides,
  };
}

export function testActor(overrides: Partial<HybridCcV1Actor> = {}): HybridCcV1Actor {
  return {
    id: 1n,
    kind: HYBRID_CC_V1_ELEMENT.player,
    logicalPosition: { x: 0, y: 0, z: 0 },
    direction: HYBRID_CC_V1_DIRECTION.east,
    color: 0,
    speed: 1,
    rule: 0,
    impactRule: 0,
    movementRule: 0,
    channel: TEST_CHANNEL,
    alive: true,
    hasMovement: false,
    movement: {
      origin: { x: 0, y: 0, z: 0 },
      destination: { x: 0, y: 0, z: 0 },
      direction: HYBRID_CC_V1_DIRECTION.east,
      slapDirection: HYBRID_CC_V1_DIRECTION.none,
      startBoundary: 0n,
      completionBoundary: 0n,
      owner: 0,
      movementClass: 0,
      discontinuous: false,
    },
    lifecycleReceipt: [],
    controlOwner: 0,
    terrainOwner: 0,
    idleReason: 0,
    nextOrdinaryBoundary: 0n,
    playerMomentum: {
      forceOverrideAvailable: false,
      forceOverrideEligibleBoundary: 0n,
      exitCreditAvailable: false,
      exitCreditEligibleBoundary: 0n,
      sourceTerrain: 0,
      sourceDirection: HYBRID_CC_V1_DIRECTION.none,
    },
    observedControlSignalValue: 0n,
    observedActorSignalValue: 0n,
    pendingFacing: HYBRID_CC_V1_DIRECTION.none,
    ...overrides,
  };
}

export function testMotionTrack(
  overrides: Partial<HybridCcV1MotionTrack> = {},
): HybridCcV1MotionTrack {
  return {
    actorId: 1n,
    actorKind: HYBRID_CC_V1_ELEMENT.player,
    origin: { x: 0, y: 0, z: 0 },
    destination: { x: 1, y: 0, z: 0 },
    direction: HYBRID_CC_V1_DIRECTION.east,
    startBoundary: 1n,
    completionBoundary: 3n,
    presentationSampleCount: 4,
    owner: 1,
    movementClass: 0,
    discontinuous: false,
    ...overrides,
  };
}

export function testPlayerPush(
  overrides: Partial<HybridCcV1PlayerPush> = {},
): HybridCcV1PlayerPush {
  return {
    direction: HYBRID_CC_V1_DIRECTION.east,
    origin: { x: 0, y: 0, z: 0 },
    contact: { x: 1, y: 0, z: 0 },
    blockActorId: null,
    moving: false,
    startBoundary: 1n,
    completionBoundary: 1n,
    ...overrides,
  };
}

export function testEvent(overrides: Partial<HybridCcV1Event> = {}): HybridCcV1Event {
  return {
    sequence: 0,
    kind: 0,
    interaction: 0,
    lossCause: 0,
    logicBoundary: 1n,
    actorId: 1n,
    actorKind: HYBRID_CC_V1_ELEMENT.player,
    origin: { x: 0, y: 0, z: 0 },
    destination: { x: 1, y: 0, z: 0 },
    direction: HYBRID_CC_V1_DIRECTION.east,
    slapDirection: HYBRID_CC_V1_DIRECTION.none,
    owner: 0,
    movementClass: 0,
    reason: 0,
    subject: testElement(),
    replacement: testElement(),
    inventoryIdentity: { kind: 0, color: 0, rule: 0 },
    inventoryBefore: { count: 0n, unlimited: false },
    inventoryAfter: { count: 0n, unlimited: false },
    signalColor: 0,
    signalChannel: TEST_CHANNEL,
    signalBefore: 0n,
    signalAfter: 0n,
    ...overrides,
  };
}

export function testInventoryEntry(
  kind: number,
  color: number,
  count: bigint,
  unlimited = false,
): HybridCcV1InventoryEntry {
  return {
    identity: { kind, color, rule: 0 },
    quantity: { count, unlimited },
  };
}

export function testSnapshot(overrides: Partial<HybridCcV1Snapshot> = {}): HybridCcV1Snapshot {
  const outcome = {
    kind: HYBRID_CC_V1_OUTCOME.unfinished,
    logicBoundary: 0n,
    position: { x: 0, y: 0, z: 0 },
    exitColor: 0,
    lossCause: 0,
  };
  return {
    header: {
      recordVersion: 2,
      abiVersion: 2,
      // Synthetic snapshots use the production decoder's pinned contract.
      ruleset: HYBRIDCC_V1_ABI.ruleset,
      width: 1,
      height: 1,
      depth: 1,
      logicBoundary: 0n,
      randomSeed: 0,
      timeLimitSeconds: 100,
      timeRemainingLogicSteps: 1_000,
      outcome,
      cellCount: 1,
      actorCount: 1,
      inventoryCount: 0,
      signalCount: 0,
      eventCount: 0,
      eventsOverflowed: false,
      droppedEventCount: 0,
      stateHash: 1n,
      eventHash: 2n,
      presentationHash: 3n,
    },
    cells: [testCell()],
    actors: [testActor()],
    inventory: [],
    signals: [],
    events: [],
    presentation: {
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: null,
      terminalMotion: null,
      playerPush: null,
      activeHint: null,
    },
    ...overrides,
  };
}
