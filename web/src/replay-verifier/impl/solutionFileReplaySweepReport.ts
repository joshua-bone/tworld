import {
  formatReplaySweepValue,
  rankReplaySweepCounts,
} from "@replay-verifier/impl/replaySweepSupport";
import type {
  SolutionFileReplaySweepFailure,
  SolutionFileReplaySweepReport,
} from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export interface BuildSolutionFileReplaySweepReportOptions {
  replayCount: number;
  unsupportedFiles: readonly string[];
  failures: readonly SolutionFileReplaySweepFailure[];
}

export function summarizeSolutionFileReplaySweepFailure(failure: SolutionFileReplaySweepFailure): string {
  const mismatch = failure.mismatches[0];
  if (!mismatch) {
    return "no mismatch details";
  }
  return `${mismatch.path}: expected ${formatReplaySweepValue(mismatch.expected)}, got ${formatReplaySweepValue(mismatch.actual)}`;
}

export function buildSolutionFileReplaySweepReport({
  replayCount,
  unsupportedFiles,
  failures,
}: BuildSolutionFileReplaySweepReportOptions): SolutionFileReplaySweepReport {
  return {
    replayCount,
    unsupportedFiles: [...unsupportedFiles].sort((left, right) => left.localeCompare(right)),
    failures: [...failures],
    failureCountBySeries: rankReplaySweepCounts(failures.map((failure) => failure.seriesFile)),
    firstMismatchPathCounts: rankReplaySweepCounts(
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
