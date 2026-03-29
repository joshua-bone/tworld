import type { ReplayRecordedMove, ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameDebugPhaseSnapshot } from "@game-core/api/debug";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { createReplayPlan } from "@game-core/api/playback";
import type { GameRuntimeCommand } from "@game-core/api/types";
import type {
  TurnDebugPhaseRecorder,
} from "@game-core/api/turnPhases";
import type {
  StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
import { MS_TICKS_PER_SECOND } from "@ruleset-ms/api/tiles";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import type { LynxPortableToolStateStore, LynxToolInventoryProjection } from "@ruleset-lynx/impl/portableItems";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import type {
  LynxChipMoveSelection,
} from "@ruleset-lynx/impl/chipInput";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";
import type {
  LynxChipTurnState,
  LynxEndGameResult,
} from "@ruleset-lynx/impl/turnState";

export const LYNX_DEBUG_SCHEMA_VERSION = 2;
export const LYNX_REPLAY_MOVE_TICK_MASK = 0x7fffff;
export const HIDDEN_WALL_REVEAL_TTL = MS_TICKS_PER_SECOND / 2;
export const BLUE_WALL_VISUAL_REVEAL_TTL = 0x7fff_ffff;

export interface LynxInteractiveSessionState {
  level: LynxLevel;
  state: EngineState;
  lastInput: GameRuntimeCommand;
  recordedMoves: ReplayRecordedMove[];
  replayPlan: ReturnType<typeof createReplayPlan> | null;
  chipPos: number;
  chipZ?: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind?: LynxMoveKind;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  chipPushing: boolean;
  actors: LynxRuntimeActor[];
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
}

export interface LynxAdvanceTickRuntime {
  session: LynxInteractiveSessionState;
  debugRecorder: TurnDebugPhaseRecorder<GameDebugPhaseSnapshot> | null;
  replayMode: boolean;
  carryCurrentInputAcrossTicks: boolean;
  state: EngineState;
  level: LynxLevel;
  replayPlan: ReturnType<typeof createReplayPlan> | null;
  runtimeInput: GameRuntimeCommand;
  scheduledInputCode: number | null;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  chipMoving: number;
  chipMoveKind: LynxMoveKind;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  chipPushing: boolean;
  actors: LynxRuntimeActor[];
  endGameTicksElapsed: number | null;
  endGameResult: LynxEndGameResult | null;
  endGameAnimationTileId: number | null;
  endGameAnimationFrame: number | null;
  chipArrivedOnHeldTrapThisTick: boolean;
  justSpawnedActorSerials: Set<number>;
  pendingFallingCollisionActorSerials: number[];
  latchedChipMoveSelection: LynxChipMoveSelection | null;
  recordedReplayInputCode: number;
  nextTick: number;
}

export interface LynxRuntimeActor {
  serial: number;
  id: number;
  pos: number;
  z?: number;
  dir: number;
  intentDir: number;
  forcedDir: number;
  teleported: boolean;
  moving: number;
  frame: number;
  moveKind?: LynxMoveKind;
  ignoreIceFromAir?: boolean;
  hidden: boolean;
  pushed: boolean;
  deferPush: boolean;
  deferPushArmed: boolean;
  reversePending: boolean;
  dormant: boolean;
  animationReserved: boolean;
}

export interface LynxAnimationState {
  pos: number;
  frame: number;
  tileId: number;
}

export const LYNX_ANIMATION_TILE = {
  Water_Splash: 0x74,
  Bomb_Explosion: 0x75,
  Entity_Explosion: 0x76,
} as const;

export interface LynxRuntimeState {
  toggleWallsPending: boolean;
  visuals: {
    animations: LynxAnimationState[];
    tileOverlays: Array<{
      z: number;
      pos: number;
      kind: InteractiveGameTileOverlayKind;
      ttl: number;
    }>;
  };
  chipRuntime: {
    chipTeleported: boolean;
    chipSlideToken: boolean;
    chipIgnoreIceFromAir?: boolean;
    couldntMove: boolean;
    trapReleaseCantMoveThisTick: boolean;
    lastRandomSlideDir: number;
  };
  portableTools: LynxPortableToolStateStore;
  statefulActors: LynxStatefulActorRuntimeState;
  nextActorSerial: number;
  chipPos: number;
  chipZ: number;
}

export interface LynxVisualRuntimeState {
  animations: LynxAnimationState[];
  tileOverlays: Array<{
    z: number;
    pos: number;
    kind: InteractiveGameTileOverlayKind;
    ttl: number;
  }>;
}

export interface LynxChipRuntimeState {
  chipTeleported: boolean;
  chipSlideToken: boolean;
  chipIgnoreIceFromAir?: boolean;
  couldntMove: boolean;
  trapReleaseCantMoveThisTick: boolean;
  lastRandomSlideDir: number;
}

export interface LynxPortableToolRuntimeState extends LynxPortableToolStateStore {}
export interface LynxStatefulActorRuntimeState extends StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry> {}

export interface LynxTickContext {
  state: EngineState;
  actors: LynxRuntimeActor[];
  chipPos: number;
  chipZ: number;
  lowerCells(z?: number): EngineMapCell[] | null;
  upperCells(z?: number): EngineMapCell[] | null;
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
  findVisibleActorAt(pos: number, z: number): LynxRuntimeActor | null;
}

export interface LynxRuntimeLayer {
  z: number;
  cells: EngineMapCell[];
}

export interface LynxDetachedToolInventoryProjection extends LynxToolInventoryProjection {}

export const LYNX_SOUND = {
  ChipLoses: 0,
  ChipWins: 1,
  TimeOut: 2,
  TimeLow: 3,
  Derezz: 4,
  CantMove: 5,
  IcCollected: 6,
  ItemCollected: 7,
  BootsStolen: 8,
  Teleporting: 9,
  DoorOpened: 10,
  SocketOpened: 11,
  ButtonPushed: 12,
  TileEmptied: 13,
  WallCreated: 14,
  TrapEntered: 15,
  BombExplodes: 16,
  WaterSplash: 17,
  BlockMoving: 18,
  SkatingForward: 19,
  SkatingTurn: 20,
  Sliding: 21,
  SlideWalking: 22,
  IceWalking: 23,
  WaterWalking: 24,
  FireWalking: 25,
} as const;

export const LYNX_FLOOR_SOUND_MASK =
  (1 << LYNX_SOUND.SkatingForward) |
  (1 << LYNX_SOUND.SkatingTurn) |
  (1 << LYNX_SOUND.Sliding) |
  (1 << LYNX_SOUND.SlideWalking) |
  (1 << LYNX_SOUND.IceWalking) |
  (1 << LYNX_SOUND.WaterWalking) |
  (1 << LYNX_SOUND.FireWalking);
