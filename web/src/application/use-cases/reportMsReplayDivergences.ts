import { existsSync, readdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@adapters/levels/loadNodeReplaySweepSeriesCatalog";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@adapters/oracle/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@adapters/solutions/NodeSolutionFileRepository";
import { compareReplayTraceScenario } from "@application/engine/use-cases/compareReplayTraceScenario";
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
} from "@application/use-cases/buildReplayTraceScenariosFromSolutionFile";

interface RankedDivergence {
  scenarioName: string;
  mismatchPath: string;
  tickIndex: number | null;
  expected: unknown;
  actual: unknown;
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const scenarioFilter = process.env.TWORLD_MS_REPLAY_FILTER?.trim() || null;
const maxResults = Number.parseInt(process.env.TWORLD_MS_MAX_RESULTS ?? "25", 10);
const includeSoundMismatches = process.env.TWORLD_MS_INCLUDE_SOUND === "1";
const mismatchPathFilter = process.env.TWORLD_MS_MISMATCH_PATH?.trim() || null;

function discoverSolutionFiles(): string[] {
  const envPaths = process.env.TWORLD_MS_SOLUTION_FILE?.split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  if (envPaths?.length) {
    return envPaths.map((path) => resolve(repoRoot, path));
  }

  const saveDir = resolve(repoRoot, "save");
  if (!existsSync(saveDir)) {
    return [];
  }

  return readdirSync(saveDir)
    .filter((entry) => extname(entry).toLowerCase() === ".tws")
    .map((entry) => resolve(saveDir, entry))
    .sort((left, right) => left.localeCompare(right));
}

function matchesScenarioFilter(name: string): boolean {
  if (!scenarioFilter) {
    return true;
  }
  if (scenarioFilter.startsWith("=")) {
    return name === scenarioFilter.slice(1);
  }
  return name.includes(scenarioFilter);
}

function firstRankedMismatch(
  mismatches: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>,
): RankedDivergence | null {
  for (const mismatch of mismatches) {
    if (!includeSoundMismatches && mismatch.path.endsWith(".soundEffects")) {
      continue;
    }
    if (mismatchPathFilter && !mismatch.path.includes(mismatchPathFilter)) {
      continue;
    }

    const match = mismatch.path.match(/^\$\.steps\[(\d+)\]/);
    return {
      scenarioName: "",
      mismatchPath: mismatch.path,
      tickIndex: match ? Number.parseInt(match[1], 10) : null,
      expected: mismatch.expected,
      actual: mismatch.actual,
    };
  }

  return null;
}

function compareDivergences(left: RankedDivergence, right: RankedDivergence): number {
  if (left.tickIndex === null && right.tickIndex !== null) {
    return 1;
  }
  if (left.tickIndex !== null && right.tickIndex === null) {
    return -1;
  }
  if (left.tickIndex !== null && right.tickIndex !== null && left.tickIndex !== right.tickIndex) {
    return left.tickIndex - right.tickIndex;
  }
  return left.scenarioName.localeCompare(right.scenarioName);
}

async function main(): Promise<void> {
  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);
  const solutionRepository = new NodeSolutionFileRepository();
  const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
  const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
  const files = discoverSolutionFiles();
  const results: RankedDivergence[] = [];

  for (const path of files) {
    const solutionFile = await solutionRepository.loadSolutionFile(path);
    if (solutionFile.file.ruleset !== "MS" || isUnsupportedReplaySeries(solutionFile, seriesCatalog)) {
      continue;
    }

    const plan = buildReplayTraceScenariosFromSolutionFile(solutionFile, seriesCatalog);
    for (const scenario of plan.scenarios) {
      if (!matchesScenarioFilter(scenario.name)) {
        continue;
      }

      const comparison = await compareReplayTraceScenario(candidate, oracle, scenario);
      const firstMismatch = firstRankedMismatch(comparison.mismatches);
      if (!firstMismatch) {
        continue;
      }

      results.push({
        ...firstMismatch,
        scenarioName: scenario.name,
      });
    }
  }

  results.sort(compareDivergences);
  const limited = results.slice(0, Number.isFinite(maxResults) && maxResults > 0 ? maxResults : 25);

  if (limited.length === 0) {
    console.log("No non-sound mismatches found.");
    return;
  }

  for (const result of limited) {
    const tick = result.tickIndex === null ? "result" : `step ${result.tickIndex}`;
    console.log(
      `${result.scenarioName} | ${tick} | ${result.mismatchPath} | expected=${String(result.expected)} | actual=${String(result.actual)}`,
    );
  }
}

await main();
