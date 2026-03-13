import type { InputTraceFixture } from "@application/contracts/characterization";
import type { GameDebugPhaseSnapshot } from "@domain/game/debug";
import type { RulesetName } from "@domain/ruleset";

export interface OracleReplayDebugSpec {
  name: string;
  command: "replay-trace-debug" | "replay-trace-solution-debug";
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

export interface OracleInputDebugSpec {
  name: string;
  command: "input-trace-debug";
  series: string;
  ruleset: Exclude<RulesetName, "None">;
  levelNumber: number;
  inputs: string;
  maxTicks: number;
  randomSeed: number;
}

export type OracleDebugSpec = OracleInputDebugSpec | OracleReplayDebugSpec;

export interface OracleDebugFixtureManifest {
  schemaVersion: number;
  generatedBy: string;
  commandRoot: string;
  commands: string[];
  specs: OracleDebugSpec[];
}

export interface OracleDebugTraceFixture extends Omit<InputTraceFixture, "command" | "steps"> {
  command: "input-trace-debug" | "replay-trace-debug" | "replay-trace-solution-debug";
  debugSchemaVersion: number;
  initialDebugState: GameDebugPhaseSnapshot;
  steps: Array<InputTraceFixture["steps"][number] & { phases: GameDebugPhaseSnapshot[] }>;
}
