import type {
  InputTraceFixture,
  LevelInfoEntry,
  LevelInfoFixture,
  SeriesListFixture,
  SolutionListFixture,
} from "@oracle-fixtures/impl/contracts/characterizationContract";
import type { GameTrace } from "@game-core/api/types";
import type { ScoreLevelRecord } from "@content/api/score";
import type { SeriesDefinition, SeriesLevel } from "@content/api/series";
import type { SolutionCatalogSource } from "@content/api/solution";

export function mapLevelInfoEntryToScoreLevel(entry: LevelInfoEntry): ScoreLevelRecord {
  return {
    index: entry.index,
    number: entry.number,
    name: entry.name,
    timeLimitSeconds: entry.timeLimitSeconds,
    bestTimeTicks: entry.bestTimeTicks,
    hasSolution: entry.hasSolution,
    sgflags: entry.sgflags,
  };
}

export function mapLevelInfoEntriesToScoreLevels(entries: LevelInfoEntry[]): ScoreLevelRecord[] {
  return entries.map(mapLevelInfoEntryToScoreLevel);
}

export function mapLevelInfoFixtureToSeriesLevels(fixture: LevelInfoFixture): SeriesLevel[] {
  return fixture.levels.map((level) => ({
    index: level.index,
    number: level.number,
    name: level.name,
    author: level.author,
    password: level.password,
    timeLimitSeconds: level.timeLimitSeconds,
    chipsRequired: 0,
    bestTimeTicks: level.bestTimeTicks,
    levelSize: level.levelSize,
    solutionSize: level.solutionSize,
    levelHash: level.levelHash,
    gameplayHash: level.levelHash,
    hasSolution: level.hasSolution,
    sgflags: level.sgflags,
    unsolvable: level.unsolvable,
  }));
}

export function mapSeriesListFixtureToDefinitions(fixture: SeriesListFixture): SeriesDefinition[] {
  return fixture.series.map((series) => ({
    name: series.name,
    filebase: series.filebase,
    mapfilename: series.mapfilename,
    ruleset: series.ruleset,
    levelCount: series.levelCount,
  }));
}

export function mapSolutionListFixture(fixture: SolutionListFixture): SolutionCatalogSource {
  return {
    series: fixture.series,
    files: [...fixture.files],
  };
}

export function mapInputTraceFixtureToGameTrace(fixture: InputTraceFixture): GameTrace {
  return {
    request: {
      seriesFile: fixture.series,
      levelNumber: fixture.levelNumber,
      ruleset: fixture.ruleset,
      randomSeed: Number.parseInt(fixture.randomSeed, 10),
    },
    scheduledInputs: fixture.scheduledInputs.map((command) => ({
      tick: command.tick,
      inputCode: command.inputCode,
      inputName: command.input,
    })),
    initialState: fixture.initialState,
    steps: fixture.steps,
    result: fixture.result,
  };
}
