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

export type MsReplaySweepFailure = SolutionFileReplaySweepFailure;
export type MsReplaySweepSummaryItem = SolutionFileReplaySweepSummaryItem;
export type MsReplaySweepReport = SolutionFileReplaySweepReport;
export type MsReplaySweepDependencies = SolutionFileReplaySweepDependencies;
export interface MsReplaySweepOptions extends SolutionFileReplaySweepOptions {
  seriesCatalog?: SeriesCatalogEntry[] | null;
}

export async function runMsSolutionFileReplaySweep(
  dependencies: MsReplaySweepDependencies,
  solutionPaths: string[],
  options: MsReplaySweepOptions = {},
): Promise<MsReplaySweepReport> {
  return runSolutionFileReplaySweep("MS", dependencies, solutionPaths, options);
}

export function formatMsReplaySweepFailureSummary(report: MsReplaySweepReport, limit = 15): string {
  return formatSolutionFileReplaySweepFailureSummary(report, limit);
}
