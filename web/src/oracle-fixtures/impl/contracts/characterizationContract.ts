import type { RulesetName } from "@content/api/ruleset";
import type { TableSpec } from "@content/api/table";
import type { GameInputName } from "@game-core/api/command";

export interface FixtureManifest {
  schemaVersion: number;
  generatedBy: string;
  commandRoot: string;
  commands: string[];
  includedSeries: string[];
  excludedSeries: string[];
  traceSpecs: TraceSpec[];
  replayTraceSpecs: ReplayTraceSpec[];
  solutionSpecs: SolutionSpec[];
}

export interface SeriesSummaryFixture {
  name: string;
  filebase: string;
  mapfilename: string;
  ruleset: RulesetName;
  levelCount: number;
}

export interface SeriesListFixture {
  command: "series-list";
  series: SeriesSummaryFixture[];
  table: TableSpec;
}

export interface LevelInfoEntry {
  index: number;
  number: number;
  name: string;
  author: string;
  password: string;
  timeLimitSeconds: number;
  bestTimeTicks: number;
  levelSize: number;
  solutionSize: number;
  levelHash: string;
  hasSolution: boolean;
  sgflags: number;
  unsolvable: string | null;
}

export interface LevelInfoFixture {
  command: "level-info";
  series: {
    name: string;
    filebase: string;
    ruleset: RulesetName;
    levelCount: number;
  };
  levels: LevelInfoEntry[];
}

export interface ScoreTableFixture {
  command: "score-table";
  series: string;
  rowLevelIndexes: number[];
  table: TableSpec;
}

export interface TimesTableFixture {
  command: "times-table";
  series: string;
  showPartial: number;
  rowLevelIndexes: number[];
  table: TableSpec;
}

export interface SolutionListFixture {
  command: "solution-list";
  series: string;
  files: string[];
}

export interface TraceSpec {
  name: string;
  series: string;
  ruleset: Exclude<RulesetName, "None">;
  levelNumber: number;
  inputs: string;
  maxTicks: number;
  randomSeed: number;
}

export interface ReplayTraceSpec {
  name: string;
  series: string;
  ruleset: Exclude<RulesetName, "None">;
  levelNumber: number;
  maxTicks: number;
  replay: {
    bestTimeTicks: number;
    flags: number;
    randomSlideDirection: number;
    stepping: number;
    randomSeed: number;
    moves: string;
  };
}

export interface SolutionSpec {
  name: string;
  ruleset: Exclude<RulesetName, "None">;
  levelNumber: number;
  password: string;
  bestTimeTicks: number;
  flags: number;
  randomSlideDirection: number;
  stepping: number;
  randomSeed: number;
  moves: string;
}

export interface InputTraceFixture {
  command: "input-trace" | "replay-trace";
  series: string;
  levelNumber: number;
  levelIndex: number;
  ruleset: Exclude<RulesetName, "None">;
  maxTicks: number;
  timerSecondMs: number;
  randomSeed: string;
  scheduledInputs: Array<{
    tick: number;
    input: GameInputName;
    inputCode: number;
  }>;
  initialState: TraceSnapshot;
  steps: TraceSnapshot[];
  result: {
    status: string;
    finalTick: number;
    stepCount: number;
  };
}

export interface TraceSnapshot {
  phase: string;
  tick: number;
  status: string;
  input: string;
  inputCode: number;
  replayCursor: number;
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
  randomState: {
    main: {
      initial: string;
      value: string;
      shared: boolean;
    };
    lynx: {
      prng1: number;
      prng2: number;
    };
  };
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
  chip: {
    id: number;
    layer: number;
    dir: string;
    position: {
      x: number;
      y: number;
      pos: number;
    };
    state: number;
    source?: string;
  } | null;
  creatureCount: number;
  creaturesHash: string;
  mapHash: string;
  creatures: Array<{
    id: number;
    layer: number;
    dir: string;
    position: {
      x: number;
      y: number;
      pos: number;
    };
    state: number;
  }>;
}

export interface SolutionRoundTripFixture {
  command: "solution-roundtrip";
  ruleset: Exclude<RulesetName, "None">;
  levelNumber: number;
  password: string;
  bestTimeTicks: number;
  source: {
    flags: number;
    randomSlideDirection: number;
    stepping: number;
    randomSeed: number;
    moves: Array<{
      when: number;
      dir: number;
    }>;
  };
  encoded: {
    size: number;
    hex: string;
  };
  memoryRoundTrip: {
    flags: number;
    randomSlideDirection: number;
    stepping: number;
    randomSeed: number;
    moves: Array<{
      when: number;
      dir: number;
    }>;
  } | null;
  fileRoundTrip: {
    bestTimeTicks: number;
    sgflags: number;
    solutionSize: number;
    hex: string;
    expanded: {
      flags: number;
      randomSlideDirection: number;
      stepping: number;
      randomSeed: number;
      moves: Array<{
        when: number;
        dir: number;
      }>;
    } | null;
  };
}
