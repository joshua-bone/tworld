/**
 * Named values from HybridCC v1's public C ABI. Presentation code must cross
 * the ABI by name; ordinal casts between Hybrid and Tile World are forbidden.
 *
 * Provenance: HybridCC2026 PR #43, PR #44's HCR1 version correction, and
 * PR #47's generic pushable-actor transaction, PR #52's staged dependent-push
 * admission, PR #54's force-first arrival fallback, PR #55's signal-driven
 * release ordering, PR #56's entry-scoped teleport activation, PR #58's
 * atomic teleport self-return occupancy, PR #60's category-aware released-
 * trap arbitration, and the D029 DAT special-art policy,
 * include/hybridcc/v1/c_api.h, ABI version 2, ruleset 1.0.14.
 */
export const HYBRID_CC_V1_DIRECTION = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
  none: 4,
} as const;

export const HYBRID_CC_V1_COLOR = {
  red: 0,
  yellow: 1,
  blue: 2,
  green: 3,
  gray: 4,
  white: 5,
  black: 6,
  orange: 7,
  cyan: 8,
  purple: 9,
  pink: 10,
  magenta: 11,
  brown: 12,
  lime: 13,
  teal: 14,
  navy: 15,
  maroon: 16,
  tan: 17,
} as const;

export const HYBRID_CC_V1_ELEMENT = {
  none: 0,
  space: 1,
  floor: 2,
  wall: 3,
  exit: 4,
  water: 5,
  fire: 6,
  trickWall: 7,
  dirt: 8,
  gravel: 9,
  ice: 10,
  forceFloor: 11,
  randomForceFloor: 12,
  teleport: 13,
  trap: 14,
  steppingStone: 15,
  hint: 16,
  cloner: 17,
  thief: 18,
  railroad: 19,
  checkpoint: 20,
  elevator: 21,
  button: 22,
  toggleWall: 23,
  door: 24,
  socket: 25,
  colorBlocker: 26,
  chip: 27,
  bomb: 28,
  key: 29,
  forceBoots: 30,
  iceSkates: 31,
  flippers: 32,
  fireBoots: 33,
  sandbag: 34,
  bonus: 35,
  itemBlocker: 36,
  bribe: 37,
  dirtBlock: 38,
  iceBlock: 39,
  ant: 40,
  centipede: 41,
  glider: 42,
  fireball: 43,
  blob: 44,
  teeth: 45,
  ball: 46,
  walker: 47,
  mirrorPlayer: 48,
  tank: 49,
  robot: 50,
  player: 51,
  directionalBlock: 52,
  placeholder: 53,
  panel: 54,
  corner: 55,
  drownedPlayerMarker: 56,
  burnedPlayerMarkerA: 57,
  bombedPlayerMarker: 58,
  unusedMarkerA: 59,
  unusedMarkerB: 60,
  unusedMarkerC: 61,
  exitedPlayerMarker: 62,
  unusedExitMarkerA: 63,
  unusedExitMarkerB: 64,
  swimmingPlayerMarker: 65,
} as const;

export const HYBRID_CC_V1_RULE = {
  none: 0,
  passThrough: 1,
  becomesWall: 2,
  invisibleBecomesWall: 3,
  becomesFloor: 4,
  permanentlyInvisible: 5,
  startsOpen: 14,
  startsShut: 15,
  startsHolding: 16,
  startsReleasing: 17,
  stealKeys: 22,
  stealTools: 23,
  stealBoth: 24,
  stepActivated: 25,
  toggle: 26,
  holdOne: 27,
  holdAll: 28,
  directionalPad: 29,
  toggleOpen: 54,
  toggleShut: 55,
  normalCorner: 56,
  toggleCorner: 57,
} as const;

export const HYBRID_CC_V1_ORIENTATION = {
  none: 0,
  north: 1,
  east: 2,
  south: 4,
  west: 8,
  northEast: 3,
  southEast: 6,
  southWest: 12,
  northWest: 9,
  all: 15,
} as const;

export const HYBRID_CC_V1_OUTCOME = {
  unfinished: 0,
  win: 1,
  loss: 2,
} as const;

export const HYBRID_CC_V1_LOSS = {
  none: 0,
  water: 1,
  fire: 2,
  bomb: 3,
  clock: 4,
  ant: 5,
  centipede: 6,
  glider: 7,
  fireball: 8,
  blob: 9,
  teeth: 10,
  ball: 11,
  walker: 12,
  tank: 13,
  capacity: 14,
  dirtBlock: 15,
} as const;

export const HYBRID_CC_V1_MOVEMENT_OWNER = {
  none: 0,
  playerInput: 1,
  playerForceOverride: 2,
  // Reserved ABI owner 3. The current ruleset never emits it; ordinary
  // continuation is playerInput and readiness comes from accepted completion.
  playerExitCredit: 3,
  actorAi: 4,
  forceFloor: 5,
  ice: 6,
  teleport: 7,
  trap: 8,
  cloner: 9,
  pushableActor: 10,
  // Compatibility name for consumers written before the admission policy was
  // separated from the generic push transaction. Numeric ABI value unchanged.
  dirtBlockPush: 10,
} as const;

export const HYBRID_CC_V1_MOVEMENT_CLASS = {
  ordinary: 0,
  fast: 1,
  boosted: 2,
  forced: 3,
  sliding: 4,
  pushed: 5,
  teleport: 6,
} as const;

export const HYBRID_CC_V1_EVENT = {
  none: 0,
  moveStarted: 1,
  moveRejected: 2,
  moveCompleted: 3,
  actorCreated: 4,
  actorDestroyed: 5,
  terrainChanged: 6,
  deviceChanged: 7,
  pickupChanged: 8,
  inventoryChanged: 9,
  interaction: 10,
  signalChanged: 11,
  hintShown: 12,
  hintHidden: 13,
  terminal: 14,
} as const;

export const HYBRID_CC_V1_INTERACTION = {
  none: 0,
  step: 1,
  slide: 2,
  activate: 3,
  deactivate: 4,
  teleport: 5,
  enter: 6,
  exit: 7,
  push: 8,
  reveal: 9,
} as const;

export function isClassicHybridCcV1Color(color: number): boolean {
  return color >= HYBRID_CC_V1_COLOR.red && color <= HYBRID_CC_V1_COLOR.green;
}
