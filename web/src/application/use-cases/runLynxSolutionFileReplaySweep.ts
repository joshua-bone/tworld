import type { SeriesCatalogEntry } from "@domain/series";
import {
  formatSolutionFileReplaySweepFailureSummary,
  runSolutionFileReplaySweep,
  type SolutionFileReplaySweepDependencies,
  type SolutionFileReplaySweepFailure,
  type SolutionFileReplaySweepOptions,
  type SolutionFileReplaySweepReport,
  type SolutionFileReplaySweepSummaryItem,
} from "@application/use-cases/runSolutionFileReplaySweep";

export type LynxReplaySweepFailure = SolutionFileReplaySweepFailure;
export type LynxReplaySweepSummaryItem = SolutionFileReplaySweepSummaryItem;
export type LynxReplaySweepReport = SolutionFileReplaySweepReport;
export type LynxReplaySweepDependencies = SolutionFileReplaySweepDependencies;
export interface LynxReplaySweepOptions extends SolutionFileReplaySweepOptions {
  seriesCatalog?: SeriesCatalogEntry[] | null;
}

export async function runLynxSolutionFileReplaySweep(
  dependencies: LynxReplaySweepDependencies,
  solutionPaths: string[],
  options: LynxReplaySweepOptions = {},
): Promise<LynxReplaySweepReport> {
  return runSolutionFileReplaySweep("Lynx", dependencies, solutionPaths, options);
}

export function formatLynxReplaySweepFailureSummary(report: LynxReplaySweepReport, limit = 15): string {
  return formatSolutionFileReplaySweepFailureSummary(report, limit);
}
