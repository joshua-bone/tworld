import type { RulesetName } from "@content/api/ruleset";
import type { GameInputName } from "@game-core/api/command";

export interface GameRequest {
  seriesFile: string;
  levelNumber: number;
  ruleset: Exclude<RulesetName, "None">;
  randomSeed?: number;
}

export interface GameCommand {
  tick: number;
  inputCode: number;
  inputName: GameInputName;
}

export interface GameRuntimeCommand {
  tick: number;
  inputCode: number;
  inputName: string;
}

export interface GamePosition {
  x: number;
  y: number;
  z?: number;
  pos: number;
}

export interface GameActor {
  id: number;
  layer: number;
  dir: string;
  position: GamePosition;
  state: number;
  source?: string;
}

export interface GameRandomState {
  main: {
    initial: string;
    value: string;
    shared: boolean;
  };
  lynx: {
    prng1: number;
    prng2: number;
  };
}

export interface GameSnapshot {
  phase: string;
  input: string;
  inputCode: number;
  status: string;
  tick: number;
  currentTime: number;
  timeOffset: number;
  secondsPlayed: number;
  timelimit: number;
  chipsNeeded: number;
  statusFlags: number;
  lastMoveCode: number;
  lastMove: string;
  stepping: number;
  initRandomSlideDir: string;
  replayCursor: number;
  randomState: GameRandomState;
  soundEffects: number;
  view: {
    x: number;
    y: number;
  };
  inventory: {
    keys: number[];
    boots: number[];
    tools: number[];
  };
  chip: GameActor | null;
  creatureCount: number;
  creaturesHash: string;
  mapHash: string;
  creatures: GameActor[];
}

export interface GameTrace {
  request: GameRequest;
  scheduledInputs: GameCommand[];
  initialState: GameSnapshot;
  steps: GameSnapshot[];
  result: {
    status: string;
    finalTick: number;
    stepCount: number;
  };
}
