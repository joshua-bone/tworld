import type {
  GameActor,
  GamePosition,
  GameRandomState,
  GameRequest,
  GameRuntimeCommand,
  GameSnapshot,
} from "@game-core/api/types";

export type InventorySlots = [number, number, number, number];

export interface EngineTile {
  id: number;
  state: number;
}

export interface EngineMapCell {
  position: GamePosition;
  top: EngineTile;
  bottom: EngineTile;
}

export interface EngineInventory {
  keys: InventorySlots;
  boots: InventorySlots;
  chipsNeeded: number;
}

export interface EngineTimer {
  tick: number;
  currentTime: number;
  timeOffset: number;
  secondsPlayed: number;
  timeLimit: number;
}

export interface EngineReplayState {
  cursor: number;
  stepping: number;
  moveCount: number;
  bestTimeTicks: number;
  initialRandomSlideDirection: string;
  randomState: GameRandomState;
}

export interface EngineMapState {
  hash: string;
  creaturesHash: string;
  creatureCount: number;
  cells: EngineMapCell[];
  layers?: Array<{
    z: number;
    cells: EngineMapCell[];
  }>;
}

export interface EngineMoveState {
  code: number;
  name: string;
}

export interface EngineState {
  request: GameRequest;
  status: string;
  timer: EngineTimer;
  inventory: EngineInventory;
  replay: EngineReplayState;
  chip: GameActor | null;
  actors: GameActor[];
  map: EngineMapState;
  view: {
    x: number;
    y: number;
  };
  soundEffects: number;
  statusFlags: number;
  lastMove: EngineMoveState;
}

export interface EngineLevelSeed {
  request: GameRequest;
  initialSnapshot: GameSnapshot;
  cells?: EngineMapCell[];
}

export interface EngineTransition {
  input: GameRuntimeCommand;
  state: EngineState;
}
