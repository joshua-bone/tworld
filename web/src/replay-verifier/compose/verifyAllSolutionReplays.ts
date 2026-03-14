import { existsSync, readdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { loadNodeReplaySweepSeriesCatalog } from "@level-catalog/impl/loadNodeReplaySweepSeriesCatalog";
import {
  NativeOracleGameEngineAdapter,
  defaultOraclePath,
} from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";
import { NodeSolutionFileRepository } from "@replay-verifier/impl/NodeSolutionFileRepository";
import { collectTraceMismatches, type TraceMismatch } from "@replay-verifier/impl/engine/comparators/traceComparison";
import {
  buildReplayTraceScenariosFromSolutionFile,
  isUnsupportedReplaySeries,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { GameTrace } from "@game-core/api/types";
import type { RulesetName } from "@content/api/ruleset";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionFileFilter = process.env.TWORLD_SOLUTION_FILE_FILTER?.trim() || null;
const replayFilter = process.env.TWORLD_REPLAY_FILTER?.trim() || null;
const failOnErrors = process.env.TWORLD_VERIFY_STRICT === "1";
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

type SupportedRuleset = Exclude<RulesetName, "None">;
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
  ruleset: SupportedRuleset;
}

const ANSI = {
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
} as const;

function color(text: string, code: string): string {
  return useColor ? `${code}${text}${ANSI.reset}` : text;
}

function green(text: string): string {
  return color(text, ANSI.green);
}

function red(text: string): string {
  return color(text, ANSI.red);
}

function yellow(text: string): string {
  return color(text, ANSI.yellow);
}

function cyan(text: string): string {
  return color(text, ANSI.cyan);
}

function gray(text: string): string {
  return color(text, ANSI.gray);
}

function discoverSolutionFiles(): string[] {
  const envPaths = process.env.TWORLD_SOLUTION_FILE?.split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  if (envPaths?.length) {
    return envPaths.map((path) => resolve(repoRoot, path));
  }

  const saveDir = resolve(repoRoot, "save");
  if (!existsSync(saveDir)) {
    return [];
  }

  return readdirSync(saveDir)
    .filter((entry) => extname(entry).toLowerCase() === ".tws")
    .map((entry) => resolve(saveDir, entry))
    .sort((left, right) => left.localeCompare(right));
}

function matchesFilter(value: string, filter: string | null): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return value === filter.slice(1);
  }
  return value.includes(filter);
}

function matchesReplayFilter(value: string, filter: string | null): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return value === filter.slice(1);
  }
  if (/^:\d+$/.test(filter)) {
    return value.endsWith(filter);
  }
  return value.includes(filter);
}

function rankCounts(values: string[]): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const rendered = JSON.stringify(value);
  if (!rendered) {
    return String(value);
  }
  return rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered;
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
  return `${field} @ ${scope} | expected ${formatValue(mismatch.expected)}, got ${formatValue(mismatch.actual)}`;
}

function formatOutcomeLabel(kind: ReplayOutcomeKind): string {
  switch (kind) {
    case "pass":
      return green("PASS");
    case "legacy-fail":
    case "ts-fail":
      return red("FAIL");
  }
}

function printSummaryLine(prefix: string, counts: SummaryCounts): void {
  console.log(
    `${prefix} checked ${counts.checked} | passed ${counts.passed} | ts-failed ${counts.tsFailed} | legacy-failed ${counts.legacyFailed}`,
  );
}

async function main(): Promise<void> {
  const solutionFiles = discoverSolutionFiles().filter((path) =>
    matchesFilter(basename(path), solutionFileFilter),
  );
  if (solutionFiles.length === 0) {
    console.log("No solution files found.");
    return;
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const solutionRepository = new NodeSolutionFileRepository();
  const levelRepository = new NodeLevelRepository();
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });
  const candidates: Record<SupportedRuleset, Pick<GameEnginePort, "runReplayTrace">> = {
    Lynx: new LynxGameEngineAdapter(levelRepository),
    MS: new MsGameEngineAdapter(levelRepository),
  };
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);

  const totalCounts: SummaryCounts = {
    checked: 0,
    passed: 0,
    legacyFailed: 0,
    tsFailed: 0,
  };
  const totalsByRuleset = new Map<SupportedRuleset, RulesetTotals>([
    ["MS", { ruleset: "MS", checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 }],
    ["Lynx", { ruleset: "Lynx", checked: 0, passed: 0, legacyFailed: 0, tsFailed: 0 }],
  ]);
  const totalMismatchPaths: string[] = [];
  const totalLegacyStatuses: string[] = [];
  const unsupportedFiles: string[] = [];
  let supportedFileCount = 0;

  for (const solutionPath of solutionFiles) {
    const loaded = await solutionRepository.loadSolutionFile(solutionPath);

    if (isUnsupportedReplaySeries(loaded, seriesCatalog)) {
      unsupportedFiles.push(loaded.label);
      console.log(cyan(`== ${loaded.label} | unsupported ==`));
      continue;
    }

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
    const scenarios = plan.scenarios.filter((scenario) => matchesReplayFilter(scenario.name, replayFilter));
    supportedFileCount += 1;

    const rulesetTotals = totalsByRuleset.get(loaded.file.ruleset as SupportedRuleset);
    if (!rulesetTotals) {
      throw new Error(`Unsupported ruleset ${loaded.file.ruleset}`);
    }

    const fileCounts: SummaryCounts = {
      checked: 0,
      passed: 0,
      legacyFailed: 0,
      tsFailed: 0,
    };
    const fileMismatchPaths: string[] = [];
    const fileLegacyStatuses: string[] = [];

    console.log(
      cyan(
        `== ${loaded.label} | ${plan.series.filebase} | ${loaded.file.ruleset} | ${scenarios.length} replays ==`,
      ),
    );

    for (const scenario of scenarios) {
      fileCounts.checked += 1;
      totalCounts.checked += 1;
      rulesetTotals.checked += 1;

      let expected: GameTrace;
      try {
        expected = await oracle.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks);
      } catch (error) {
        const detail = summarizeErrorMessage(error instanceof Error ? error.message : String(error));
        fileCounts.legacyFailed += 1;
        totalCounts.legacyFailed += 1;
        rulesetTotals.legacyFailed += 1;
        fileLegacyStatuses.push("$error");
        totalLegacyStatuses.push("$error");
        console.log(
          `${formatOutcomeLabel("legacy-fail")} L${String(scenario.request.levelNumber).padStart(3, "0")} ${scenario.name} | legacy $error: ${detail}`,
        );
        continue;
      }

      if (expected.result.status !== "completed") {
        fileCounts.legacyFailed += 1;
        totalCounts.legacyFailed += 1;
        rulesetTotals.legacyFailed += 1;
        fileLegacyStatuses.push(expected.result.status);
        totalLegacyStatuses.push(expected.result.status);
        console.log(
          `${formatOutcomeLabel("legacy-fail")} L${String(scenario.request.levelNumber).padStart(3, "0")} ${scenario.name} | legacy ${expected.result.status} at tick ${expected.result.finalTick}`,
        );
        continue;
      }

      try {
        const actual = await candidates[scenario.request.ruleset].runReplayTrace(
          scenario.request,
          scenario.replay,
          scenario.maxTicks,
        );
        const mismatches: TraceMismatch[] = [];
        collectTraceMismatches(actual, expected, "$", mismatches, 25);
        if (mismatches.length === 0) {
          fileCounts.passed += 1;
          totalCounts.passed += 1;
          rulesetTotals.passed += 1;
          console.log(
            `${formatOutcomeLabel("pass")} L${String(scenario.request.levelNumber).padStart(3, "0")} ${scenario.name}`,
          );
          continue;
        }

        const mismatch = mismatches[0]!;
        fileCounts.tsFailed += 1;
        totalCounts.tsFailed += 1;
        rulesetTotals.tsFailed += 1;
        fileMismatchPaths.push(mismatch.path);
        totalMismatchPaths.push(mismatch.path);
        console.log(
          `${formatOutcomeLabel("ts-fail")} L${String(scenario.request.levelNumber).padStart(3, "0")} ${scenario.name} | ${summarizeMismatchShort(mismatch)}`,
        );
      } catch (error) {
        const mismatch: TraceMismatch = {
          path: "$engine",
          expected: "matching completed native trace",
          actual: summarizeErrorMessage(error instanceof Error ? error.message : String(error)),
        };
        fileCounts.tsFailed += 1;
        totalCounts.tsFailed += 1;
        rulesetTotals.tsFailed += 1;
        fileMismatchPaths.push(mismatch.path);
        totalMismatchPaths.push(mismatch.path);
        console.log(
          `${formatOutcomeLabel("ts-fail")} L${String(scenario.request.levelNumber).padStart(3, "0")} ${scenario.name} | ${summarizeMismatchShort(mismatch)}`,
        );
      }
    }

    printSummaryLine(yellow(`summary ${loaded.label}:`), fileCounts);
    if (fileMismatchPaths.length > 0) {
      const topMismatchPaths = rankCounts(fileMismatchPaths).slice(0, 5);
      console.log(gray(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`));
    }
    if (fileLegacyStatuses.length > 0) {
      const topStatuses = rankCounts(fileLegacyStatuses);
      console.log(gray(`legacy statuses: ${topStatuses.map((item) => `${item.key} (${item.count})`).join(", ")}`));
    }
    console.log("");
  }

  console.log(cyan("== total summary =="));
  console.log(`solution files checked: ${supportedFileCount}`);
  console.log(`unsupported files: ${unsupportedFiles.length > 0 ? unsupportedFiles.join(", ") : "(none)"}`);
  printSummaryLine("all replays:", totalCounts);
  for (const totals of totalsByRuleset.values()) {
    printSummaryLine(`${totals.ruleset}:`, totals);
  }
  if (totalMismatchPaths.length > 0) {
    const topMismatchPaths = rankCounts(totalMismatchPaths).slice(0, 10);
    console.log(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`);
  }
  if (totalLegacyStatuses.length > 0) {
    const topStatuses = rankCounts(totalLegacyStatuses);
    console.log(`legacy statuses: ${topStatuses.map((item) => `${item.key} (${item.count})`).join(", ")}`);
  }

  if (failOnErrors && (totalCounts.legacyFailed > 0 || totalCounts.tsFailed > 0)) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
