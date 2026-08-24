export const HYBRID_CC_V0_ACTOR_STATE = {
  collectsChips: 1 << 0,
  collectsItems: 1 << 1,
  entersDirt: 1 << 2,
  pushes: 1 << 3,
  pushable: 1 << 4,
  swimming: 1 << 5,
  slidingIce: 1 << 6,
  slidingForce: 1 << 7,
  slidingTeleport: 1 << 8,
  overridden: 1 << 9,
  forced: 1 << 10,
  speedBoost: 1 << 11,
  pushing: 1 << 12,
  trapped: 1 << 13,
  moved: 1 << 14,
} as const;

export const HYBRID_CC_V0_CELL_STATE = {
  hasSignal: 1 << 0,
  signalOdd: 1 << 1,
  open: 1 << 2,
  armed: 1 << 3,
} as const;

export const HYBRID_CC_V0_EVENT = {
  none: 0,
  actorMoved: 1,
  actorCreated: 2,
  actorDestroyed: 3,
  terrainChanged: 4,
  deviceChanged: 5,
  pickupChanged: 6,
  inventoryChanged: 7,
  interaction: 8,
  terminal: 9,
} as const;

export const HYBRID_CC_V0_INTERACTION = {
  none: 0,
  step: 1,
  slide: 2,
  activate: 3,
  deactivate: 4,
  teleport: 5,
  enter: 6,
  exit: 7,
} as const;

export function hybridCcV0ActorHasState(stateFlags: number, state: number): boolean {
  return (stateFlags & state) !== 0;
}
