import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import { buildSolutionFileReplaySweepReport } from "@replay-verifier/impl/solutionFileReplaySweepReport";
import { runSolutionFileReplaySweepFile } from "@replay-verifier/impl/solutionFileReplaySweepExecution";
import type {
  SolutionFileReplaySweepDependencies,
  SolutionFileReplaySweepFailure,
  SolutionFileReplaySweepFileCompleteProgress,
  SolutionFileReplaySweepFileProgress,
  SolutionFileReplaySweepOptions,
  SolutionFileReplaySweepProgressReporter,
  SolutionFileReplaySweepReport,
  SolutionFileReplaySweepScenarioProgress,
  SolutionFileReplaySweepSummaryItem,
  SolutionFileReplaySweepUnsupportedFileProgress,
  SupportedReplaySweepRuleset,
} from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export type {
  SolutionFileReplaySweepDependencies,
  SolutionFileReplaySweepFailure,
  SolutionFileReplaySweepFileCompleteProgress,
  SolutionFileReplaySweepFileProgress,
  SolutionFileReplaySweepOptions,
  SolutionFileReplaySweepProgressReporter,
  SolutionFileReplaySweepReport,
  SolutionFileReplaySweepScenarioProgress,
  SolutionFileReplaySweepSummaryItem,
  SolutionFileReplaySweepUnsupportedFileProgress,
} from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export { formatSolutionFileReplaySweepFailureSummary } from "@replay-verifier/impl/solutionFileReplaySweepReport";

export async function runSolutionFileReplaySweep(
  ruleset: SupportedReplaySweepRuleset,
  dependencies: SolutionFileReplaySweepDependencies,
  solutionPaths: string[],
  options: SolutionFileReplaySweepOptions = {},
): Promise<SolutionFileReplaySweepReport> {
  const seriesCatalog = options.seriesCatalog ?? (await loadSeriesCatalog(dependencies.fixtureRepository));
  const failures: SolutionFileReplaySweepFailure[] = [];
  const unsupportedFiles: string[] = [];
  let replayCount = 0;

  for (const path of solutionPaths) {
    const loaded = await dependencies.solutionRepository.loadSolutionFile(path);
    const fileResult = await runSolutionFileReplaySweepFile(ruleset, dependencies, loaded, seriesCatalog, options);
    if (!fileResult) {
      continue;
    }

    replayCount += fileResult.replayCount;
    failures.push(...fileResult.failures);
    if (fileResult.unsupportedLabel) {
      unsupportedFiles.push(fileResult.unsupportedLabel);
    }
  }

  return buildSolutionFileReplaySweepReport({
    replayCount,
    unsupportedFiles,
    failures,
  });
}
