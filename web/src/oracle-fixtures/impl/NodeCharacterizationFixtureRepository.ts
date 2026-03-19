import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultFixtureRoot = resolve(currentDir, "../../../../fixtures/characterization/v1");

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf-8")) as T;
}

export class NodeCharacterizationFixtureRepository implements CharacterizationFixtureRepository {
  constructor(private readonly fixtureRoot = defaultFixtureRoot) {}

  loadManifest(): Promise<FixtureManifest> {
    return readJson(resolve(this.fixtureRoot, "manifest.json"));
  }

  loadSeriesList(): Promise<SeriesListFixture> {
    return readJson(resolve(this.fixtureRoot, "series-list.json"));
  }

  loadLevelInfo(seriesFile: string): Promise<LevelInfoFixture> {
    return readJson(resolve(this.fixtureRoot, "level-info", `${seriesFile}.json`));
  }

  loadScoreTable(seriesFile: string): Promise<ScoreTableFixture> {
    return readJson(resolve(this.fixtureRoot, "score-table", `${seriesFile}.json`));
  }

  loadTimesTable(seriesFile: string): Promise<TimesTableFixture> {
    return readJson(resolve(this.fixtureRoot, "times-table", `${seriesFile}.json`));
  }

  loadSolutionList(seriesFile: string): Promise<SolutionListFixture> {
    return readJson(resolve(this.fixtureRoot, "solution-list", `${seriesFile}.json`));
  }

  loadInputTrace(traceName: string): Promise<InputTraceFixture> {
    return readJson(resolve(this.fixtureRoot, "input-trace", `${traceName}.json`));
  }

  loadReplayTrace(traceName: string): Promise<InputTraceFixture> {
    return readJson(resolve(this.fixtureRoot, "replay-trace", `${traceName}.json`));
  }

  loadSolutionRoundTrip(name: string): Promise<SolutionRoundTripFixture> {
    return readJson(resolve(this.fixtureRoot, "solution-roundtrip", `${name}.json`));
  }
}
