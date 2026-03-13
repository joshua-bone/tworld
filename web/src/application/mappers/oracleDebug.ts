import type { OracleDebugTraceFixture } from "@application/contracts/oracleDebug";
import type { GameDebugTrace } from "@domain/game/debug";

export function mapOracleDebugFixtureToGameDebugTrace(fixture: OracleDebugTraceFixture): GameDebugTrace {
  return {
    request: {
      seriesFile: fixture.series,
      levelNumber: fixture.levelNumber,
      ruleset: fixture.ruleset,
      randomSeed: Number.parseInt(fixture.randomSeed, 10),
    },
    debugSchemaVersion: fixture.debugSchemaVersion,
    scheduledInputs: fixture.scheduledInputs.map((command) => ({
      tick: command.tick,
      inputCode: command.inputCode,
      inputName: command.input,
    })),
    initialState: fixture.initialState,
    initialDebugState: fixture.initialDebugState,
    steps: fixture.steps.map((step) => ({
      ...step,
      phases: step.phases,
    })),
    result: fixture.result,
  };
}
