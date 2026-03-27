import { compareReplayTraceScenario } from "@replay-verifier/impl/engine/use-cases/compareReplayTraceScenario";
import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { SolutionFileRepository } from "@replay-verifier/ports/SolutionFileRepository";
import type { TraceOracle } from "@replay-verifier/ports/TraceOracle";
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
  type SolutionReplaySweepPlan,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { RulesetName } from "@content/api/ruleset";
import type { ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";

export interface SolutionFileReplaySweepFailure {
  scenarioName: string;
  solutionFile: string;
  seriesFile: string;
  levelNumber: number;
  mismatchPaths: string[];
  mismatches: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>;
}

export interface SolutionFileReplaySweepSummaryItem {
  key: string;
  count: number;
}

export interface SolutionFileReplaySweepReport {
  replayCount: number;
  unsupportedFiles: string[];
  failures: SolutionFileReplaySweepFailure[];
  failureCountBySeries: SolutionFileReplaySweepSummaryItem[];
  firstMismatchPathCounts: SolutionFileReplaySweepSummaryItem[];
}

export interface SolutionFileReplaySweepDependencies {
  fixtureRepository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">;
  solutionRepository: Pick<SolutionFileRepository, "loadSolutionFile">;
  candidate: Pick<GameEnginePort, "runReplayTrace"> & Partial<Pick<GameEnginePort, "supportsRuleset">>;
  oracle: Pick<TraceOracle, "runReplayTrace"> & Partial<Pick<GameEnginePort, "supportsRuleset">>;
}

export interface SolutionFileReplaySweepOptions {
  scenarioNameIncludes?: string | null;
  seriesCatalog?: SeriesCatalogEntry[] | null;
  progress?: SolutionFileReplaySweepProgressReporter | null;
}

export interface SolutionFileReplaySweepUnsupportedFileProgress {
  solutionFile: LoadedSolutionFile;
}

export interface SolutionFileReplaySweepFileProgress {
  solutionFile: LoadedSolutionFile;
  plan: SolutionReplaySweepPlan;
  scenarios: ReplayTraceScenario[];
}

export interface SolutionFileReplaySweepScenarioProgress {
  solutionFile: LoadedSolutionFile;
  plan: SolutionReplaySweepPlan;
  scenario: ReplayTraceScenario;
  failure: SolutionFileReplaySweepFailure | null;
}

export interface SolutionFileReplaySweepFileCompleteProgress extends SolutionFileReplaySweepFileProgress {
  replayCount: number;
  failures: SolutionFileReplaySweepFailure[];
}

export interface SolutionFileReplaySweepProgressReporter {
  onUnsupportedFile?(progress: SolutionFileReplaySweepUnsupportedFileProgress): void | Promise<void>;
  onSolutionFileStart?(progress: SolutionFileReplaySweepFileProgress): void | Promise<void>;
  onScenarioComplete?(progress: SolutionFileReplaySweepScenarioProgress): void | Promise<void>;
  onSolutionFileComplete?(progress: SolutionFileReplaySweepFileCompleteProgress): void | Promise<void>;
}

function matchesScenarioFilter(scenarioName: string, filter: string | null | undefined): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return scenarioName === filter.slice(1);
  }
  return scenarioName.includes(filter);
}

function rankCounts(values: string[]): SolutionFileReplaySweepSummaryItem[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function engineSupportsRuleset(
  engine: Partial<Pick<GameEnginePort, "supportsRuleset">> | undefined,
  ruleset: Exclude<RulesetName, "None">,
): boolean {
  return engine?.supportsRuleset?.(ruleset) ?? true;
}

export async function runSolutionFileReplaySweep(
  ruleset: Exclude<RulesetName, "None">,
  dependencies: SolutionFileReplaySweepDependencies,
  solutionPaths: string[],
  options: SolutionFileReplaySweepOptions = {},
): Promise<SolutionFileReplaySweepReport> {
  const seriesCatalog = options.seriesCatalog ?? (await loadSeriesCatalog(dependencies.fixtureRepository));
  const failures: SolutionFileReplaySweepFailure[] = [];
  const unsupportedFiles: string[] = [];
  let replayCount = 0;
  const progress = options.progress;

  for (const path of solutionPaths) {
    const loaded = await dependencies.solutionRepository.loadSolutionFile(path);
    if (loaded.file.ruleset !== ruleset) {
      continue;
    }

    if (isUnsupportedReplaySeries(loaded, seriesCatalog)) {
      unsupportedFiles.push(loaded.label);
      await progress?.onUnsupportedFile?.({ solutionFile: loaded });
      continue;
    }

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
    const scenarios = plan.scenarios.filter((scenario) => matchesScenarioFilter(scenario.name, options.scenarioNameIncludes));
    const fileFailures: SolutionFileReplaySweepFailure[] = [];
    await progress?.onSolutionFileStart?.({
      solutionFile: loaded,
      plan,
      scenarios,
    });
    for (const scenario of scenarios) {
      replayCount += 1;
      let failure: SolutionFileReplaySweepFailure | null = null;

      if (!engineSupportsRuleset(dependencies.candidate, ruleset)) {
        failure = {
          scenarioName: scenario.name,
          solutionFile: loaded.path,
          seriesFile: scenario.request.seriesFile,
          levelNumber: scenario.request.levelNumber,
          mismatchPaths: ["$engine"],
          mismatches: [
            {
              path: "$engine",
              expected: `${ruleset} replay trace support`,
              actual: `candidate engine does not support ruleset ${ruleset}`,
            },
          ],
        };
        failures.push(failure);
        fileFailures.push(failure);
        await progress?.onScenarioComplete?.({ solutionFile: loaded, plan, scenario, failure });
        continue;
      }

      if (!engineSupportsRuleset(dependencies.oracle, ruleset)) {
        failure = {
          scenarioName: scenario.name,
          solutionFile: loaded.path,
          seriesFile: scenario.request.seriesFile,
          levelNumber: scenario.request.levelNumber,
          mismatchPaths: ["$oracle"],
          mismatches: [
            {
              path: "$oracle",
              expected: `${ruleset} replay trace support`,
              actual: `trace oracle does not support ruleset ${ruleset}`,
            },
          ],
        };
        failures.push(failure);
        fileFailures.push(failure);
        await progress?.onScenarioComplete?.({ solutionFile: loaded, plan, scenario, failure });
        continue;
      }

      try {
        const comparison = await compareReplayTraceScenario(dependencies.candidate, dependencies.oracle, scenario);

        if (comparison.mismatches.length === 0) {
          await progress?.onScenarioComplete?.({ solutionFile: loaded, plan, scenario, failure: null });
          continue;
        }

        failure = {
          scenarioName: scenario.name,
          solutionFile: loaded.path,
          seriesFile: scenario.request.seriesFile,
          levelNumber: scenario.request.levelNumber,
          mismatchPaths: comparison.mismatches.map((mismatch) => mismatch.path),
          mismatches: comparison.mismatches.map((mismatch) => ({
            path: mismatch.path,
            expected: mismatch.expected,
            actual: mismatch.actual,
          })),
        };
        failures.push(failure);
        fileFailures.push(failure);
        await progress?.onScenarioComplete?.({ solutionFile: loaded, plan, scenario, failure });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failure = {
          scenarioName: scenario.name,
          solutionFile: loaded.path,
          seriesFile: scenario.request.seriesFile,
          levelNumber: scenario.request.levelNumber,
          mismatchPaths: ["$engine"],
          mismatches: [
            {
              path: "$engine",
              expected: `${ruleset} replay trace support`,
              actual: message,
            },
          ],
        };
        failures.push(failure);
        fileFailures.push(failure);
        await progress?.onScenarioComplete?.({ solutionFile: loaded, plan, scenario, failure });
      }
    }

    await progress?.onSolutionFileComplete?.({
      solutionFile: loaded,
      plan,
      scenarios,
      replayCount: scenarios.length,
      failures: fileFailures,
    });
  }

  return {
    replayCount,
    unsupportedFiles: unsupportedFiles.sort((left, right) => left.localeCompare(right)),
    failures,
    failureCountBySeries: rankCounts(failures.map((failure) => failure.seriesFile)),
    firstMismatchPathCounts: rankCounts(
      failures
        .map((failure) => failure.mismatchPaths[0])
        .filter((path): path is string => typeof path === "string" && path.length > 0),
    ),
  };
}

export function formatSolutionFileReplaySweepFailureSummary(
  report: SolutionFileReplaySweepReport,
  limit = 15,
): string {
  const lines: string[] = [];
  lines.push(`unsupported files: ${report.unsupportedFiles.join(", ") || "(none)"}`);
  lines.push(`replays checked: ${report.replayCount}`);
  lines.push(`failing replays: ${report.failures.length}`);

  if (report.failureCountBySeries.length > 0) {
    lines.push("failing series:");
    for (const item of report.failureCountBySeries.slice(0, Math.max(limit, report.failureCountBySeries.length))) {
      lines.push(`- ${item.key}: ${item.count}`);
    }
  }

  if (report.firstMismatchPathCounts.length > 0) {
    lines.push("top first mismatch paths:");
    for (const item of report.firstMismatchPathCounts.slice(0, 10)) {
      lines.push(`- ${item.key}: ${item.count}`);
    }
  }

  if (report.failures.length > 0) {
    lines.push("sample failures:");
    for (const failure of report.failures.slice(0, limit)) {
      const details = failure.mismatches
        .slice(0, 3)
        .map((mismatch) => `${mismatch.path}: expected ${mismatch.expected}, got ${mismatch.actual}`)
        .join(" | ");
      lines.push(`- ${failure.scenarioName} -> ${details}`);
    }
  }

  return lines.join("\n");
}
