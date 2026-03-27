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
import {
  runSolutionFileReplaySweep,
  type SolutionFileReplaySweepFailure,
  type SolutionFileReplaySweepOptions,
} from "@replay-verifier/impl/runSolutionFileReplaySweep";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { RulesetName } from "@content/api/ruleset";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;

type SupportedRuleset = Exclude<RulesetName, "None">;

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

function envPrefixForRuleset(ruleset: SupportedRuleset): string {
  return ruleset === "MS" ? "MS" : "LYNX";
}

function readEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
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

function discoverSolutionFiles(ruleset: SupportedRuleset): string[] {
  const envPrefix = envPrefixForRuleset(ruleset);
  const explicitPaths = readEnv(`TWORLD_${envPrefix}_SOLUTION_FILE`, "TWORLD_SOLUTION_FILE")
    ?.split(",")
    .map((path) => path.trim())
    .filter(Boolean);
  const solutionFileFilter = readEnv(`TWORLD_${envPrefix}_SOLUTION_FILE_FILTER`, "TWORLD_SOLUTION_FILE_FILTER");

  if (explicitPaths?.length) {
    return explicitPaths
      .map((path) => resolve(repoRoot, path))
      .filter((path) => matchesFilter(basename(path), solutionFileFilter));
  }

  const saveDir = resolve(repoRoot, "save");
  if (!existsSync(saveDir)) {
    return [];
  }

  return readdirSync(saveDir)
    .filter((entry) => extname(entry).toLowerCase() === ".tws")
    .filter((entry) => matchesFilter(entry, solutionFileFilter))
    .map((entry) => resolve(saveDir, entry))
    .sort((left, right) => left.localeCompare(right));
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

function summarizeFailure(failure: SolutionFileReplaySweepFailure): string {
  const mismatch = failure.mismatches[0];
  if (!mismatch) {
    return "no mismatch details";
  }
  return `${mismatch.path}: expected ${formatValue(mismatch.expected)}, got ${formatValue(mismatch.actual)}`;
}

function printSummaryLine(prefix: string, counts: SummaryCounts): void {
  console.log(`${prefix} checked ${counts.checked} | passed ${counts.passed} | failed ${counts.failed}`);
}

function parseRulesetArg(argv: string[]): SupportedRuleset {
  const value = argv[2];
  if (value === "MS" || value === "Lynx") {
    return value;
  }
  throw new Error(`Expected ruleset argument "MS" or "Lynx", got ${value ?? "(missing)"}`);
}

async function main(): Promise<void> {
  const ruleset = parseRulesetArg(process.argv);
  const envPrefix = envPrefixForRuleset(ruleset);
  const replayScenarioFilter = readEnv(`TWORLD_${envPrefix}_REPLAY_FILTER`, "TWORLD_REPLAY_FILTER");
  const solutionFiles = discoverSolutionFiles(ruleset);

  if (!process.env.TWORLD_ORACLE_BIN && !NativeOracleGameEngineAdapter.hasDefaultOracle()) {
    console.log(`Skipping ${ruleset} replay verification because no native oracle binary is available.`);
    return;
  }

  if (solutionFiles.length === 0) {
    console.log("No solution files found.");
    return;
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const solutionRepository = new NodeSolutionFileRepository();
  const levelRepository = new NodeLevelRepository();
  const candidates: Record<SupportedRuleset, Pick<GameEnginePort, "runReplayTrace">> = {
    Lynx: new LynxGameEngineAdapter(levelRepository),
    MS: new MsGameEngineAdapter(levelRepository),
  };
  const oracle = new NativeOracleGameEngineAdapter({
    oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath,
  });
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);

  const totalCounts: SummaryCounts = {
    checked: 0,
    passed: 0,
    failed: 0,
  };
  const totalMismatchPaths: string[] = [];
  const unsupportedFiles: string[] = [];
  let supportedFileCount = 0;
  let currentFileCounts: SummaryCounts = { checked: 0, passed: 0, failed: 0 };
  let currentFileMismatchPaths: string[] = [];

  const options: SolutionFileReplaySweepOptions = {
    scenarioNameIncludes: replayScenarioFilter,
    seriesCatalog,
    progress: {
      onUnsupportedFile({ solutionFile }) {
        unsupportedFiles.push(solutionFile.label);
        console.log(cyan(`== ${solutionFile.label} | unsupported ==`));
      },
      onSolutionFileStart({ solutionFile, plan, scenarios }) {
        supportedFileCount += 1;
        currentFileCounts = { checked: 0, passed: 0, failed: 0 };
        currentFileMismatchPaths = [];
        console.log(cyan(`== ${solutionFile.label} | ${plan.series.filebase} | ${ruleset} | ${scenarios.length} replays ==`));
      },
      onScenarioComplete({ scenario, failure }) {
        currentFileCounts.checked += 1;
        totalCounts.checked += 1;

        const levelLabel = `L${String(scenario.request.levelNumber).padStart(3, "0")}`;
        if (!failure) {
          currentFileCounts.passed += 1;
          totalCounts.passed += 1;
          console.log(`${green("PASS")} ${levelLabel} ${scenario.name}`);
          return;
        }

        currentFileCounts.failed += 1;
        totalCounts.failed += 1;
        const firstMismatchPath = failure.mismatchPaths[0];
        if (firstMismatchPath) {
          currentFileMismatchPaths.push(firstMismatchPath);
          totalMismatchPaths.push(firstMismatchPath);
        }
        console.log(`${red("FAIL")} ${levelLabel} ${scenario.name} | ${summarizeFailure(failure)}`);
      },
      onSolutionFileComplete() {
        printSummaryLine(yellow("summary:"), currentFileCounts);
        if (currentFileMismatchPaths.length > 0) {
          const topMismatchPaths = rankCounts(currentFileMismatchPaths).slice(0, 5);
          console.log(gray(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`));
        }
        console.log("");
      },
    },
  };

  const report = await runSolutionFileReplaySweep(
    ruleset,
    {
      fixtureRepository,
      solutionRepository,
      candidate: candidates[ruleset],
      oracle,
    },
    solutionFiles,
    options,
  );

  console.log(cyan("== total summary =="));
  console.log(`solution files checked: ${supportedFileCount}`);
  console.log(`unsupported files: ${unsupportedFiles.length > 0 ? unsupportedFiles.join(", ") : "(none)"}`);
  printSummaryLine(`${ruleset}:`, totalCounts);
  if (totalMismatchPaths.length > 0) {
    const topMismatchPaths = rankCounts(totalMismatchPaths).slice(0, 10);
    console.log(`top mismatch paths: ${topMismatchPaths.map((item) => `${item.key} (${item.count})`).join(", ")}`);
  }

  if (report.replayCount === 0) {
    console.log(`No matching ${ruleset} replays were checked.`);
    process.exitCode = 1;
    return;
  }

  if (report.unsupportedFiles.length > 0 || report.failures.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
