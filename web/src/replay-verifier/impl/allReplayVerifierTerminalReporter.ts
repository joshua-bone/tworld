import { collectTraceMismatches, type TraceMismatch } from "@replay-verifier/impl/engine/comparators/traceComparison";
import { formatReplaySweepValue } from "@replay-verifier/impl/replaySweepSupport";
import { formatReplaySweepOutcomeBar, formatReplaySweepPackPrefix } from "@replay-verifier/impl/replaySweepTerminalFormat";
import type { GameTrace } from "@game-core/api/types";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

interface ReplayOutcome {
  scenarioName: string;
  levelNumber: number;
  detail: string;
}

interface SummaryCounts {
  checked: number;
  passed: number;
  legacyFailed: number;
  tsFailed: number;
}

interface RulesetTotals extends SummaryCounts {
  ruleset: SupportedReplaySweepRuleset;
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

function summarizeErrorMessage(message: string): string {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const summary = lines.at(-1) ?? message.trim();
  return summary.length > 220 ? `${summary.slice(0, 217)}...` : summary;
}

function summarizeMismatchShort(mismatch: TraceMismatch): string {
  const segments = mismatch.path.split(".");
  const field = segments[segments.length - 1] ?? mismatch.path;
  const scope = mismatch.path.slice(0, Math.max(0, mismatch.path.length - field.length - 1)) || "$";
  return `${field} @ ${scope} | expected ${formatReplaySweepValue(mismatch.expected)}, got ${formatReplaySweepValue(mismatch.actual)}`;
}

function printSummaryLine(prefix: string, counts: SummaryCounts): void {
  console.log(
    `${prefix} checked ${counts.checked} | passed ${counts.passed} | ts-failed ${counts.tsFailed} | legacy-failed ${counts.legacyFailed}`,
  );
}

function formatFailureOutcomeLine(
  outcome: ReplayOutcome,
  colors: ReturnType<typeof createColors>,
): string {
  return `${colors.red("FAIL")} L${String(outcome.levelNumber).padStart(3, "0")} ${outcome.scenarioName} | ${outcome.detail}`;
}

export interface AllReplayVerifierTerminalReporter {
  onUnsupportedFile(label: string): void;
  onSolutionFileStart(label: string, seriesFilebase: string, ruleset: SupportedReplaySweepRuleset, replayCount: number): void;
  onLegacyFailure(scenarioName: string, levelNumber: number, ruleset: SupportedReplaySweepRuleset, detail: string, status: string): void;
  onPass(scenarioName: string, levelNumber: number, ruleset: SupportedReplaySweepRuleset): void;
  onTraceComparisonFailure(scenarioName: string, levelNumber: number, ruleset: SupportedReplaySweepRuleset, mismatch: TraceMismatch): void;
  onSolutionFileComplete(): void;
  finish(failOnErrors: boolean): void;
  compareTraces(actual: GameTrace, expected: GameTrace): TraceMismatch[];
}

export function createAllReplayVerifierTerminalReporter(useColor: boolean): AllReplayVerifierTerminalReporter {
  const colors = createColors(useColor);
  const totalCounts: SummaryCounts = {
    checked: 0,
    passed: 0,
    legacyFailed: 0,
    tsFailed: 0,
  };
  const totalsByRuleset = new Map<SupportedReplaySweepRuleset, RulesetTotals>([
    ["MS", { ruleset: "MS", checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 }],
    ["Lynx", { ruleset: "Lynx", checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 }],
  ]);
  const unsupportedFiles: string[] = [];
  let supportedFileCount = 0;
  let filePackName = "";
  let fileOutcomeBar: string[] = [];
  let fileFailureLines: string[] = [];

  function rulesetTotals(ruleset: SupportedReplaySweepRuleset): RulesetTotals {
    const totals = totalsByRuleset.get(ruleset);
    if (!totals) {
      throw new Error(`Unsupported ruleset ${ruleset}`);
    }
    return totals;
  }

  return {
    onUnsupportedFile(label) {
      unsupportedFiles.push(label);
      console.log(colors.cyan(`== ${label} | unsupported ==`));
    },
    onSolutionFileStart(_label, seriesFilebase, _ruleset, _replayCount) {
      supportedFileCount += 1;
      filePackName = seriesFilebase;
      fileOutcomeBar = [];
      fileFailureLines = [];
      process.stdout.write(colors.cyan(formatReplaySweepPackPrefix(filePackName)));
    },
    onLegacyFailure(scenarioName, levelNumber, ruleset, detail, _status) {
      const totals = rulesetTotals(ruleset);
      totalCounts.checked += 1;
      totals.checked += 1;
      totalCounts.legacyFailed += 1;
      totals.legacyFailed += 1;
      const outcome = colors.red("X");
      fileOutcomeBar.push(outcome);
      process.stdout.write(outcome);
      fileFailureLines.push(
        formatFailureOutcomeLine({
          scenarioName,
          levelNumber,
          detail,
        }, colors),
      );
    },
    onPass(_scenarioName, _levelNumber, ruleset) {
      const totals = rulesetTotals(ruleset);
      totalCounts.checked += 1;
      totals.checked += 1;
      totalCounts.passed += 1;
      totals.passed += 1;
      const outcome = colors.green("-");
      fileOutcomeBar.push(outcome);
      process.stdout.write(outcome);
    },
    onTraceComparisonFailure(scenarioName, levelNumber, ruleset, mismatch) {
      const totals = rulesetTotals(ruleset);
      totalCounts.checked += 1;
      totals.checked += 1;
      totalCounts.tsFailed += 1;
      totals.tsFailed += 1;
      const outcome = colors.red("X");
      fileOutcomeBar.push(outcome);
      process.stdout.write(outcome);
      fileFailureLines.push(
        formatFailureOutcomeLine({
          scenarioName,
          levelNumber,
          detail: summarizeMismatchShort(mismatch),
        }, colors),
      );
    },
    onSolutionFileComplete() {
      if (fileOutcomeBar.length === 0) {
        process.stdout.write(formatReplaySweepOutcomeBar(fileOutcomeBar));
      }
      process.stdout.write("\n");
      for (const failureLine of fileFailureLines) {
        console.log(failureLine);
      }
      console.log("");
    },
    finish(failOnErrors) {
      console.log(colors.cyan("== total summary =="));
      console.log(`solution files checked: ${supportedFileCount}`);
      console.log(`unsupported files: ${unsupportedFiles.length > 0 ? unsupportedFiles.join(", ") : "(none)"}`);
      printSummaryLine("all replays:", totalCounts);
      for (const totals of totalsByRuleset.values()) {
        printSummaryLine(`${totals.ruleset}:`, totals);
      }

      if (failOnErrors && (totalCounts.legacyFailed > 0 || totalCounts.tsFailed > 0)) {
        process.exitCode = 1;
      }
    },
    compareTraces(actual, expected) {
      const mismatches: TraceMismatch[] = [];
      collectTraceMismatches(actual, expected, "$", mismatches, 25);
      return mismatches;
    },
  };
}

export function summarizeReplayVerifierError(error: unknown): string {
  return summarizeErrorMessage(error instanceof Error ? error.message : String(error));
}
