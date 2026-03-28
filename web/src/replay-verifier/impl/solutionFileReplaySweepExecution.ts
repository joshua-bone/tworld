import { compareReplayTraceScenario } from "@replay-verifier/impl/engine/use-cases/compareReplayTraceScenario";
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
  type SolutionReplaySweepPlan,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import { matchesSubstringFilter } from "@replay-verifier/impl/replaySweepSupport";
import type { ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";
import type {
  SolutionFileReplaySweepDependencies,
  SolutionFileReplaySweepFailure,
  SolutionFileReplaySweepOptions,
  SupportedReplaySweepRuleset,
} from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export interface SolutionFileReplaySweepFileResult {
  replayCount: number;
  failures: SolutionFileReplaySweepFailure[];
  unsupportedLabel: string | null;
}

function engineSupportsRuleset(
  engine: Partial<Pick<GameEnginePort, "supportsRuleset">> | undefined,
  ruleset: SupportedReplaySweepRuleset,
): boolean {
  return engine?.supportsRuleset?.(ruleset) ?? true;
}

function createRulesetSupportFailure(
  scope: "$engine" | "$oracle",
  scenario: ReplayTraceScenario,
  loaded: LoadedSolutionFile,
  ruleset: SupportedReplaySweepRuleset,
  detail: string,
): SolutionFileReplaySweepFailure {
  return {
    scenarioName: scenario.name,
    solutionFile: loaded.path,
    seriesFile: scenario.request.seriesFile,
    levelNumber: scenario.request.levelNumber,
    mismatchPaths: [scope],
    mismatches: [
      {
        path: scope,
        expected: `${ruleset} replay trace support`,
        actual: detail,
      },
    ],
  };
}

function createMismatchFailure(
  scenario: ReplayTraceScenario,
  loaded: LoadedSolutionFile,
  mismatches: readonly { path: string; expected: unknown; actual: unknown }[],
): SolutionFileReplaySweepFailure {
  return {
    scenarioName: scenario.name,
    solutionFile: loaded.path,
    seriesFile: scenario.request.seriesFile,
    levelNumber: scenario.request.levelNumber,
    mismatchPaths: mismatches.map((mismatch) => mismatch.path),
    mismatches: mismatches.map((mismatch) => ({
      path: mismatch.path,
      expected: mismatch.expected,
      actual: mismatch.actual,
    })),
  };
}

async function compareSolutionReplaySweepScenario(
  ruleset: SupportedReplaySweepRuleset,
  dependencies: SolutionFileReplaySweepDependencies,
  loaded: LoadedSolutionFile,
  scenario: ReplayTraceScenario,
): Promise<SolutionFileReplaySweepFailure | null> {
  if (!engineSupportsRuleset(dependencies.candidate, ruleset)) {
    return createRulesetSupportFailure(
      "$engine",
      scenario,
      loaded,
      ruleset,
      `candidate engine does not support ruleset ${ruleset}`,
    );
  }

  if (!engineSupportsRuleset(dependencies.oracle, ruleset)) {
    return createRulesetSupportFailure(
      "$oracle",
      scenario,
      loaded,
      ruleset,
      `trace oracle does not support ruleset ${ruleset}`,
    );
  }

  try {
    const comparison = await compareReplayTraceScenario(dependencies.candidate, dependencies.oracle, scenario);
    return comparison.mismatches.length === 0 ? null : createMismatchFailure(scenario, loaded, comparison.mismatches);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createRulesetSupportFailure("$engine", scenario, loaded, ruleset, message);
  }
}

function filterReplaySweepScenarios(
  plan: SolutionReplaySweepPlan,
  scenarioNameIncludes: string | null | undefined,
): ReplayTraceScenario[] {
  return plan.scenarios.filter((scenario) => matchesSubstringFilter(scenario.name, scenarioNameIncludes));
}

export async function runSolutionFileReplaySweepFile(
  ruleset: SupportedReplaySweepRuleset,
  dependencies: SolutionFileReplaySweepDependencies,
  loaded: LoadedSolutionFile,
  seriesCatalog: readonly SeriesCatalogEntry[],
  options: SolutionFileReplaySweepOptions,
): Promise<SolutionFileReplaySweepFileResult | null> {
  const planningSeriesCatalog = [...seriesCatalog];

  if (loaded.file.ruleset !== ruleset) {
    return null;
  }

  if (isUnsupportedReplaySeries(loaded, planningSeriesCatalog)) {
    await options.progress?.onUnsupportedFile?.({ solutionFile: loaded });
    return {
      replayCount: 0,
      failures: [],
      unsupportedLabel: loaded.label,
    };
  }

  const plan = buildReplayTraceScenariosFromSolutionFile(loaded, planningSeriesCatalog);
  const scenarios = filterReplaySweepScenarios(plan, options.scenarioNameIncludes);
  const failures: SolutionFileReplaySweepFailure[] = [];

  await options.progress?.onSolutionFileStart?.({
    solutionFile: loaded,
    plan,
    scenarios,
  });

  for (const scenario of scenarios) {
    const failure = await compareSolutionReplaySweepScenario(ruleset, dependencies, loaded, scenario);
    if (failure) {
      failures.push(failure);
    }
    await options.progress?.onScenarioComplete?.({
      solutionFile: loaded,
      plan,
      scenario,
      failure,
    });
  }

  await options.progress?.onSolutionFileComplete?.({
    solutionFile: loaded,
    plan,
    scenarios,
    replayCount: scenarios.length,
    failures,
  });

  return {
    replayCount: scenarios.length,
    failures,
    unsupportedLabel: null,
  };
}
