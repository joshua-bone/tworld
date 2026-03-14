import type { TurnDebugPhaseName } from "@domain/game/core/turnPhases";
import type { GamePosition, GameSnapshot, GameTrace } from "@domain/game/types";

export interface GameDebugFloorState {
  id: number;
  state: number;
  stateFlags: string[];
  movementMode: string;
  slipDir: string;
}

export interface GameDebugRuntimeActor {
  index: number;
  id: number;
  dir: string;
  position: GamePosition;
  hidden: boolean;
  state: number;
  stateFlags: string[];
  tdir: string;
  floor: GameDebugFloorState;
  moving: number;
  frame: number;
}

export interface GameDebugSlipEntry {
  index: number;
  dir: string;
  creatureIndex: number;
  blockIndex: number;
  creature: GameDebugRuntimeActor;
}

export interface GameDebugBoardFlag {
  layer: number;
  id: number;
  position: GamePosition;
  state: number;
  stateFlags: string[];
}

export interface GameDebugMapCell {
  position: GamePosition;
  top: {
    id: number;
    state: number;
  };
  bottom: {
    id: number;
    state: number;
  };
}

export interface GameDebugPhaseSnapshot {
  phase: TurnDebugPhaseName;
  tick: number;
  currentTime: number;
  replayCursor: number;
  currentInputCode: number;
  currentInput: string;
  lastMoveCode: number;
  lastMove: string;
  chipsNeeded: number;
  statusFlags: number;
  chipStatus: string;
  chipStatusCode: number;
  chipWait: number;
  controllerDir: string;
  lastSlipDir: string;
  goalPos: number;
  completed: boolean;
  msccSlippers: number;
  soundEffects: number;
  chipFloor: GameDebugFloorState;
  mapHash: string;
  creaturesHash: string;
  activeCreatures: GameDebugRuntimeActor[];
  blocks: GameDebugRuntimeActor[];
  slipList: GameDebugSlipEntry[];
  boardFlags: GameDebugBoardFlag[];
  map: {
    cells: GameDebugMapCell[];
  };
}

export interface GameDebugTraceStep extends GameSnapshot {
  phases: GameDebugPhaseSnapshot[];
}

export interface GameDebugTrace extends Omit<GameTrace, "steps"> {
  debugSchemaVersion: number;
  initialDebugState: GameDebugPhaseSnapshot;
  steps: GameDebugTraceStep[];
}
