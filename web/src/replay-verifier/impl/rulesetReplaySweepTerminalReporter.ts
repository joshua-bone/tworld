import {
  rankReplaySweepCounts,
} from "@replay-verifier/impl/replaySweepSupport";
import {
  summarizeSolutionFileReplaySweepFailure,
} from "@replay-verifier/impl/solutionFileReplaySweepReport";
import type {
  SolutionFileReplaySweepProgressReporter,
  SolutionFileReplaySweepReport,
  SupportedReplaySweepRuleset,
} from "@replay-verifier/impl/solutionFileReplaySweepTypes";

interface SummaryCounts {
  checked: number;
  passed: number;
  failed: number;
}

const ANSI = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
} as const;

function createColors(useColor: boolean) {
  const color = (text: string, code: string): string => (useColor ? `${code}${text}${ANSI.reset}` : text);
  return {
    cyan: (text: string) => color(text, ANSI.cyan),
    green: (text: string) => color(text, ANSI.green),
    red: (text: string) => color(text, ANSI.red),
    yellow: (text: string) => color(text, ANSI.yellow),
    gray: (text: string) => color(text, ANSI.gray),
  };
}

function printSummaryLine(prefix: string, counts: SummaryCounts): void {
  console.log(`${prefix} checked ${counts.checked} | passed ${counts.passed} | failed ${counts.failed}`);
}

export interface RulesetReplaySweepTerminalReporter {
  progress: SolutionFileReplaySweepProgressReporter;
  finish(report: SolutionFileReplaySweepReport): number;
}

export function createRulesetReplaySweepTerminalReporter(
  ruleset: SupportedReplaySweepRuleset,
  useColor: boolean,
): RulesetReplaySweepTerminalReporter {
  const colors = createColors(useColor);
  const totalCounts: SummaryCounts = {
    checked: 0,
    passed: 0,
    failed: 0,
  };
  const totalMismatchPaths: string[] = [];
  let supportedFileCount = 0;
  let currentFileCounts: SummaryCounts = { checked: 0, passed: 0, failed: 0 };
  let currentFileMismatchPaths: string[] = [];

  return {
    progress: {
      onUnsupportedFile({ solutionFile }) {
        console.log(colors.cyan(`== ${solutionFile.label} | unsupported ==`));
      },
      onSolutionFileStart({ solutionFile, plan, scenarios }) {
        supportedFileCount += 1;
        currentFileCounts = { checked: 0, passed: 0, failed: 0 };
        currentFileMismatchPaths = [];
        console.log(colors.cyan(`== ${solutionFile.label} | ${plan.series.filebase} | ${ruleset} | ${scenarios.length} replays ==`));
      },
      onScenarioComplete({ scenario, failure }) {
        currentFileCounts.checked += 1;
        totalCounts.checked += 1;

        const levelLabel = `L${String(scenario.request.levelNumber).padStart(3, "0")}`;
        if (!failure) {
          currentFileCounts.passed += 1;
          totalCounts.passed += 1;
          console.log(`${colors.green("PASS")} ${levelLabel} ${scenario.name}`);
          return;
        }

        currentFileCounts.failed += 1;
        totalCounts.failed += 1;
        const firstMismatchPath = failure.mismatchPaths[0];
        if (firstMismatchPath) {
          currentFileMismatchPaths.push(firstMismatchPath);
          totalMismatchPaths.push(firstMismatchPath);
        }
        console.log(`${colors.red("FAIL")} ${levelLabel} ${scenario.name} | ${summarizeSolutionFileReplaySweepFailure(failure)}`);
      },
      onSolutionFileComplete() {
        printSummaryLine(colors.yellow("summary:"), currentFileCounts);
        if (currentFileMismatchPaths.length > 0) {
          const topMismatchPaths = rankReplaySweepCounts(currentFileMismatchPaths).slice(0, 5);
          console.log(colors.gray(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`));
        }
        console.log("");
      },
    },
    finish(report) {
      console.log(colors.cyan("== total summary =="));
      console.log(`solution files checked: ${supportedFileCount}`);
      console.log(`unsupported files: ${report.unsupportedFiles.length > 0 ? report.unsupportedFiles.join(", ") : "(none)"}`);
      printSummaryLine(`${ruleset}:`, totalCounts);
      if (totalMismatchPaths.length > 0) {
        const topMismatchPaths = rankReplaySweepCounts(totalMismatchPaths).slice(0, 10);
        console.log(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`);
      }

      if (report.replayCount === 0) {
        console.log(`No matching ${ruleset} replays were checked.`);
        return 1;
      }

      return report.unsupportedFiles.length > 0 || report.failures.length > 0 ? 1 : 0;
    },
  };
}
