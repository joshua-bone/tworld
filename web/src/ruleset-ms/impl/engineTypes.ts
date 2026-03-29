import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { RecordedReplayMoveDecision, createReplayPlan } from "@game-core/api/playback";
import type { GameRuntimeCommand } from "@game-core/api/types";
import type {
  StatefulActorRuntimeEntry,
  StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
import type { MsConnection } from "@ruleset-ms/api/level";
import { MS_DIRECTION, MS_TICKS_PER_SECOND } from "@ruleset-ms/api/tiles";
import type { MsPortableToolStateStore } from "@ruleset-ms/impl/portableItems";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";

export interface MsTrackedCreature {
  serial: number;
  id: number;
  dir: number;
  tdir: number;
  pos: number;
  z?: number;
  hidden: boolean;
  moving: number;
  frame: number;
  cloning: boolean;
  released: boolean;
  turning: boolean;
  hasMoved: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  sliding: boolean;
}

export interface MsCreatureSlipEntry {
  serial: number;
  dir: number;
  slipOrder: number;
}

export interface MsTrackedBlock {
  pos: number;
  z?: number;
  dir: number;
  hidden: boolean;
  released: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  sliding: boolean;
  slideDelayPending: boolean;
  slipOrder: number;
}

export interface MsRandomRuntimeState {
  initial: bigint;
  value: bigint;
}

export interface MsPortableToolRuntimeState extends MsPortableToolStateStore {}
export interface MsStatefulActorRuntimeState extends StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry> {}

export interface MsInternalState {
  chipPos: number;
  chipZ?: number;
  chipDir: number;
  chipTDir: number;
  currentInput: number;
  goalPos: number;
  controllerDir: number;
  chipHasMoved: boolean;
  chipReleased: boolean;
  chipWait: number;
  chipStatus: "okay" | "drowned" | "burned" | "bombed" | "outoftime" | "collided";
  completed: boolean;
  replayDeadlineFailed: boolean;
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator";
  floorMovementDir: number;
  creatures: MsTrackedCreature[];
  creatureIndexBySerial: Map<number, number>;
  creatureSlipList: MsCreatureSlipEntry[];
  blocks: MsTrackedBlock[];
  cloneSourceSerialByPosition: Map<string, number>;
  traps: MsConnection[];
  cloners: MsConnection[];
  pendingCloners: number[];
  pendingSoundEffects: number;
  nextCreatureSerial: number;
  nextSlipOrder: number;
  randomState: MsRandomRuntimeState;
  lastSlipDir: number;
  portableTools: MsPortableToolRuntimeState;
  statefulActors: MsStatefulActorRuntimeState;
  runtimeLayers: MsRuntimeLayer[];
}

export interface MsQueueTraceEvent {
  tick: number;
  phase: "non-chip-floor";
  action: string;
  slipIndex: number;
  advance: number;
  entry: string | null;
  queue: string[];
}

export interface MsRuntimeLayer {
  z: number;
  cells: EngineMapCell[];
}

export interface MsRuntimeState {
  tileOverlays: Array<{
    z: number;
    pos: number;
    kind: InteractiveGameTileOverlayKind;
    ttl: number;
    tileId?: number;
  }>;
}

export interface MsTickContext {
  engine: EngineState;
  internal: MsInternalState;
  inventory: EngineState["inventory"];
  cellsForZ(z?: number): EngineMapCell[] | null;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
  chipActsWallForMobs(pos: number, z: number): boolean;
  addTileOverlay(
    z: number,
    pos: number,
    kind: InteractiveGameTileOverlayKind,
    ttl?: number,
    tileId?: number,
  ): void;
}

export interface ChipMoveOptions {
  exposeWalls?: boolean;
  allowPushing?: boolean;
  noLeaveCheck?: boolean;
  teleportPush?: boolean;
  deferButtons?: boolean;
  occupiedOriginPos?: number;
}

export interface MsGameState {
  engine: EngineState;
  internal: MsInternalState;
}

export interface MsInteractiveSessionState {
  state: MsGameState;
  lastInput: GameRuntimeCommand;
  recordedMoves: ReplayRecordedMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
}

export type MsSessionReplayOptions = Partial<
  Pick<ReplaySolutionPayload, "randomSeed" | "stepping" | "randomSlideDirection">
> & {
  moveCount?: number;
  bestTimeTicks?: number;
};

export interface MsAdvanceTickResult {
  state: MsGameState;
  recordedReplayMove: RecordedReplayMoveDecision | null;
}

export const UINT31_MASK = 0x7fffffffn;
export const RANDOM3_MASK = 0x3fffffffn;
export const RANDOM4_MASK = 0x0fffffffn;
export const RANDOM3_DIVISOR = 0x40000000n;
export const RANDOM4_DIVISOR = 0x10000000n;
export const MS_DEBUG_SCHEMA_VERSION = 2;
export const MS_AIR_MOVEMENT_DIR = MS_DIRECTION.north;
export const MS_ELEVATOR_MOVEMENT_DIR = MS_DIRECTION.south;
export const HIDDEN_WALL_REVEAL_TTL = MS_TICKS_PER_SECOND / 2;
export const PUSH_BLOCK_PICKUP_REVEAL_TTL = 3;

export type MsStatefulActorRuntimeStoreLike = StatefulActorRuntimeStore<StatefulActorRuntimeEntry>;
