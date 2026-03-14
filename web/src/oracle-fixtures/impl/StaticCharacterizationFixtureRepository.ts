import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type {
  FixtureManifest,
  InputTraceFixture,
  LevelInfoFixture,
  ScoreTableFixture,
  SeriesListFixture,
  SolutionListFixture,
  SolutionRoundTripFixture,
  TimesTableFixture,
} from "@oracle-fixtures/impl/contracts/characterizationContract";

export class StaticCharacterizationFixtureRepository implements CharacterizationFixtureRepository {
  private readonly manifests = import.meta.glob("@fixtures/manifest.json", {
    import: "default",
  }) as Record<string, () => Promise<FixtureManifest>>;
  private readonly seriesLists = import.meta.glob("@fixtures/series-list.json", {
    import: "default",
  }) as Record<string, () => Promise<SeriesListFixture>>;
  private readonly levelInfoFixtures = import.meta.glob("@fixtures/level-info/*.json", {
    import: "default",
  }) as Record<string, () => Promise<LevelInfoFixture>>;
  private readonly scoreFixtures = import.meta.glob("@fixtures/score-table/*.json", {
    import: "default",
  }) as Record<string, () => Promise<ScoreTableFixture>>;
  private readonly timeFixtures = import.meta.glob("@fixtures/times-table/*.json", {
    import: "default",
  }) as Record<string, () => Promise<TimesTableFixture>>;
  private readonly solutionFixtures = import.meta.glob("@fixtures/solution-list/*.json", {
    import: "default",
  }) as Record<string, () => Promise<SolutionListFixture>>;
  private readonly traceFixtures = import.meta.glob("@fixtures/input-trace/*.json", {
    import: "default",
  }) as Record<string, () => Promise<InputTraceFixture>>;
  private readonly replayTraceFixtures = import.meta.glob("@fixtures/replay-trace/*.json", {
    import: "default",
  }) as Record<string, () => Promise<InputTraceFixture>>;
  private readonly solutionRoundTripFixtures = import.meta.glob("@fixtures/solution-roundtrip/*.json", {
    import: "default",
  }) as Record<string, () => Promise<SolutionRoundTripFixture>>;

  private async loadSingle<T>(fixtures: Record<string, () => Promise<T>>, suffix: string): Promise<T> {
    const match = Object.entries(fixtures).find(([path]) => path.endsWith(suffix));
    if (!match) {
      throw new Error(`fixture not found: ${suffix}`);
    }
    return match[1]();
  }

  async loadManifest(): Promise<FixtureManifest> {
    return this.loadSingle(this.manifests, "/manifest.json");
  }

  async loadSeriesList(): Promise<SeriesListFixture> {
    return this.loadSingle(this.seriesLists, "/series-list.json");
  }

  async loadLevelInfo(seriesFile: string): Promise<LevelInfoFixture> {
    return this.loadSingle(this.levelInfoFixtures, `/level-info/${seriesFile}.json`);
  }

  async loadScoreTable(seriesFile: string): Promise<ScoreTableFixture> {
    return this.loadSingle(this.scoreFixtures, `/score-table/${seriesFile}.json`);
  }

  async loadTimesTable(seriesFile: string): Promise<TimesTableFixture> {
    return this.loadSingle(this.timeFixtures, `/times-table/${seriesFile}.json`);
  }

  async loadSolutionList(seriesFile: string): Promise<SolutionListFixture> {
    return this.loadSingle(this.solutionFixtures, `/solution-list/${seriesFile}.json`);
  }

  async loadInputTrace(traceName: string): Promise<InputTraceFixture> {
    return this.loadSingle(this.traceFixtures, `/input-trace/${traceName}.json`);
  }

  async loadReplayTrace(traceName: string): Promise<InputTraceFixture> {
    return this.loadSingle(this.replayTraceFixtures, `/replay-trace/${traceName}.json`);
  }

  async loadSolutionRoundTrip(name: string): Promise<SolutionRoundTripFixture> {
    return this.loadSingle(this.solutionRoundTripFixtures, `/solution-roundtrip/${name}.json`);
  }
}
