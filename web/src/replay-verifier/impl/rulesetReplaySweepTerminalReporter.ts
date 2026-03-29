import { summarizeSolutionFileReplaySweepFailure } from "@replay-verifier/impl/solutionFileReplaySweepReport";
import { formatReplaySweepOutcomeBar, formatReplaySweepPackPrefix } from "@replay-verifier/impl/replaySweepTerminalFormat";
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
  let supportedFileCount = 0;
  let currentFilePackName = "";
  let currentFileOutcomeBar: string[] = [];
  let currentFileFailureLines: string[] = [];

  return {
    progress: {
      onUnsupportedFile({ solutionFile }) {
        console.log(colors.cyan(`== ${solutionFile.label} | unsupported ==`));
      },
      onSolutionFileStart({ plan }) {
        supportedFileCount += 1;
        currentFilePackName = plan.series.filebase;
        currentFileOutcomeBar = [];
        currentFileFailureLines = [];
        process.stdout.write(colors.cyan(formatReplaySweepPackPrefix(currentFilePackName)));
      },
      onScenarioComplete({ scenario, failure }) {
        totalCounts.checked += 1;

        const levelLabel = `L${String(scenario.request.levelNumber).padStart(3, "0")}`;
        if (!failure) {
          totalCounts.passed += 1;
          const outcome = colors.green("-");
          currentFileOutcomeBar.push(outcome);
          process.stdout.write(outcome);
          return;
        }

        totalCounts.failed += 1;
        const outcome = colors.red("X");
        currentFileOutcomeBar.push(outcome);
        process.stdout.write(outcome);
        currentFileFailureLines.push(
          `${colors.red("FAIL")} ${levelLabel} ${scenario.name} | ${summarizeSolutionFileReplaySweepFailure(failure)}`,
        );
      },
      onSolutionFileComplete() {
        if (currentFileOutcomeBar.length === 0) {
          process.stdout.write(formatReplaySweepOutcomeBar(currentFileOutcomeBar));
        }
        process.stdout.write("\n");
        for (const failureLine of currentFileFailureLines) {
          console.log(failureLine);
        }
        console.log("");
      },
    },
    finish(report) {
      console.log(colors.cyan("== total summary =="));
      console.log(`solution files checked: ${supportedFileCount}`);
      console.log(`unsupported files: ${report.unsupportedFiles.length > 0 ? report.unsupportedFiles.join(", ") : "(none)"}`);
      printSummaryLine(`${ruleset}:`, totalCounts);

      if (report.replayCount === 0) {
        console.log(`No matching ${ruleset} replays were checked.`);
        return 1;
      }

      return report.unsupportedFiles.length > 0 || report.failures.length > 0 ? 1 : 0;
    },
  };
}
