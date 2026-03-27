import type { OracleDebugTraceFixture } from "@oracle-fixtures/impl/contracts/oracleDebugContract";
import { normalizeTraceSnapshot } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import type { GameDebugTrace } from "@game-core/api/debug";

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
    initialState: normalizeTraceSnapshot(fixture.initialState),
    initialDebugState: fixture.initialDebugState,
    steps: fixture.steps.map((step) => ({
      ...normalizeTraceSnapshot(step),
      phases: step.phases,
    })),
    result: fixture.result,
  };
}
