import { collectTraceMismatches, type TraceMismatch } from "@replay-verifier/impl/engine/comparators/traceComparison";
import { rankReplaySweepCounts, formatReplaySweepValue } from "@replay-verifier/impl/replaySweepSupport";
import type { GameTrace } from "@game-core/api/types";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

type ReplayOutcomeKind = "pass" | "legacy-fail" | "ts-fail";

interface ReplayOutcome {
  kind: ReplayOutcomeKind;
  scenarioName: string;
  levelNumber: number;
  detail: string;
  firstMismatchPath?: string;
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

function formatOutcomeLabel(kind: ReplayOutcomeKind, colors: ReturnType<typeof createColors>): string {
  switch (kind) {
    case "pass":
      return colors.green("PASS");
    case "legacy-fail":
    case "ts-fail":
      return colors.red("FAIL");
  }
}

function printSummaryLine(prefix: string, counts: SummaryCounts): void {
  console.log(
    `${prefix} checked ${counts.checked} | passed ${counts.passed} | ts-failed ${counts.tsFailed} | legacy-failed ${counts.legacyFailed}`,
  );
}

function printAnomalousOutcome(
  outcome: ReplayOutcome,
  colors: ReturnType<typeof createColors>,
): void {
  const label = outcome.kind === "legacy-fail" ? colors.yellow("legacy-fail") : colors.red("ts-fail");
  const mismatchSuffix = outcome.firstMismatchPath ? ` | first mismatch ${outcome.firstMismatchPath}` : "";
  console.log(
    `${label} L${String(outcome.levelNumber).padStart(3, "0")} ${outcome.scenarioName} | ${outcome.detail}${mismatchSuffix}`,
  );
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
  const totalMismatchPaths: string[] = [];
  const totalLegacyStatuses: string[] = [];
  const anomalyOutcomes: ReplayOutcome[] = [];
  const unsupportedFiles: string[] = [];
  let supportedFileCount = 0;
  let fileCounts: SummaryCounts = { checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 };
  let fileMismatchPaths: string[] = [];
  let fileLegacyStatuses: string[] = [];

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
    onSolutionFileStart(label, seriesFilebase, ruleset, replayCount) {
      supportedFileCount += 1;
      fileCounts = { checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 };
      fileMismatchPaths = [];
      fileLegacyStatuses = [];
      console.log(colors.cyan(`== ${label} | ${seriesFilebase} | ${ruleset} | ${replayCount} replays ==`));
    },
    onLegacyFailure(scenarioName, levelNumber, ruleset, detail, status) {
      const totals = rulesetTotals(ruleset);
      fileCounts.checked += 1;
      totalCounts.checked += 1;
      totals.checked += 1;
      fileCounts.legacyFailed += 1;
      totalCounts.legacyFailed += 1;
      totals.legacyFailed += 1;
      fileLegacyStatuses.push(status);
      totalLegacyStatuses.push(status);
      anomalyOutcomes.push({
        kind: "legacy-fail",
        scenarioName,
        levelNumber,
        detail,
      });
      console.log(`${formatOutcomeLabel("legacy-fail", colors)} L${String(levelNumber).padStart(3, "0")} ${scenarioName} | ${detail}`);
    },
    onPass(scenarioName, levelNumber, ruleset) {
      const totals = rulesetTotals(ruleset);
      fileCounts.checked += 1;
      totalCounts.checked += 1;
      totals.checked += 1;
      fileCounts.passed += 1;
      totalCounts.passed += 1;
      totals.passed += 1;
      console.log(`${formatOutcomeLabel("pass", colors)} L${String(levelNumber).padStart(3, "0")} ${scenarioName}`);
    },
    onTraceComparisonFailure(scenarioName, levelNumber, ruleset, mismatch) {
      const totals = rulesetTotals(ruleset);
      fileCounts.checked += 1;
      totalCounts.checked += 1;
      totals.checked += 1;
      fileCounts.tsFailed += 1;
      totalCounts.tsFailed += 1;
      totals.tsFailed += 1;
      fileMismatchPaths.push(mismatch.path);
      totalMismatchPaths.push(mismatch.path);
      anomalyOutcomes.push({
        kind: "ts-fail",
        scenarioName,
        levelNumber,
        detail: summarizeMismatchShort(mismatch),
        firstMismatchPath: mismatch.path,
      });
      console.log(`${formatOutcomeLabel("ts-fail", colors)} L${String(levelNumber).padStart(3, "0")} ${scenarioName} | ${summarizeMismatchShort(mismatch)}`);
    },
    onSolutionFileComplete() {
      printSummaryLine(colors.yellow("summary:"), fileCounts);
      if (fileMismatchPaths.length > 0) {
        const topMismatchPaths = rankReplaySweepCounts(fileMismatchPaths).slice(0, 5);
        console.log(colors.gray(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`));
      }
      if (fileLegacyStatuses.length > 0) {
        const topStatuses = rankReplaySweepCounts(fileLegacyStatuses);
        console.log(colors.gray(`legacy statuses: ${topStatuses.map((item) => `${item.key} (${item.count})`).join(", ")}`));
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
      if (totalMismatchPaths.length > 0) {
        const topMismatchPaths = rankReplaySweepCounts(totalMismatchPaths).slice(0, 10);
        console.log(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`);
      }
      if (totalLegacyStatuses.length > 0) {
        const topStatuses = rankReplaySweepCounts(totalLegacyStatuses);
        console.log(`legacy statuses: ${topStatuses.map((item) => `${item.key} (${item.count})`).join(", ")}`);
      }
      if (anomalyOutcomes.length > 0) {
        console.log("anomalous levels:");
        for (const outcome of anomalyOutcomes) {
          printAnomalousOutcome(outcome, colors);
        }
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
