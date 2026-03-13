import type {
  FixtureManifest,
  InputTraceFixture,
  LevelInfoFixture,
  ScoreTableFixture,
  SeriesListFixture,
  SolutionListFixture,
  SolutionRoundTripFixture,
  TimesTableFixture,
} from "@application/contracts/characterization";

export interface CharacterizationFixtureRepository {
  loadManifest(): Promise<FixtureManifest>;
  loadSeriesList(): Promise<SeriesListFixture>;
  loadLevelInfo(seriesFile: string): Promise<LevelInfoFixture>;
  loadScoreTable(seriesFile: string): Promise<ScoreTableFixture>;
  loadTimesTable(seriesFile: string): Promise<TimesTableFixture>;
  loadSolutionList(seriesFile: string): Promise<SolutionListFixture>;
  loadInputTrace(traceName: string): Promise<InputTraceFixture>;
  loadReplayTrace(traceName: string): Promise<InputTraceFixture>;
  loadSolutionRoundTrip(name: string): Promise<SolutionRoundTripFixture>;
}
