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
  resolveReplaySeries,
} from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { GameTrace } from "@game-core/api/types";
import type { RulesetName } from "@content/api/ruleset";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const solutionFileFilter = process.env.TWORLD_SOLUTION_FILE_FILTER?.trim() || null;

interface NativeFailure {
  scenarioName: string;
  status: string;
  finalTick: number;
  detail?: string;
}

interface TsFailure {
  scenarioName: string;
  mismatch: TraceMismatch;
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

function matchesSolutionFileFilter(label: string, filter: string | null): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return label === filter.slice(1);
  }
  return label.includes(filter);
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

function summarizeTsFailure(failure: TsFailure): string {
  return `${failure.scenarioName} -> ${failure.mismatch.path}: expected ${formatValue(failure.mismatch.expected)}, got ${formatValue(failure.mismatch.actual)}`;
}

function summarizeNativeFailure(failure: NativeFailure): string {
  if (failure.detail) {
    return `${failure.scenarioName} -> ${failure.status}: ${failure.detail}`;
  }
  return `${failure.scenarioName} -> ${failure.status} at tick ${failure.finalTick}`;
}

function candidateForRuleset(
  ruleset: Exclude<RulesetName, "None">,
  candidates: Record<Exclude<RulesetName, "None">, Pick<GameEnginePort, "runReplayTrace">>,
): Pick<GameEnginePort, "runReplayTrace"> {
  return candidates[ruleset];
}

async function main(): Promise<void> {
  const solutionFiles = discoverSolutionFiles().filter((path) =>
    matchesSolutionFileFilter(basename(path), solutionFileFilter),
  );
  if (solutionFiles.length === 0) {
    console.log("No solution files found.");
    return;
  }

  const fixtureRepository = new NodeCharacterizationFixtureRepository();
  const solutionRepository = new NodeSolutionFileRepository();
  const levelRepository = new NodeLevelRepository();
  const oracle = new NativeOracleGameEngineAdapter({ oraclePath: process.env.TWORLD_ORACLE_BIN ?? defaultOraclePath });
  const candidates: Record<Exclude<RulesetName, "None">, Pick<GameEnginePort, "runReplayTrace">> = {
    Lynx: new LynxGameEngineAdapter(levelRepository),
    MS: new MsGameEngineAdapter(levelRepository),
  };
  const seriesCatalog = await loadNodeReplaySweepSeriesCatalog(fixtureRepository, repoRoot);

  let solutionCount = 0;
  let replayCount = 0;
  let nativePassingCount = 0;
  let nativeNonPassingCount = 0;
  let tsPassingCount = 0;
  let tsFailingCount = 0;

  const unsupportedFiles: string[] = [];
  const nativeFailures: NativeFailure[] = [];
  const tsFailures: TsFailure[] = [];
  const nativeFailureStatuses: string[] = [];
  const tsFailureSeries: string[] = [];

  for (const solutionPath of solutionFiles) {
    const loaded = await solutionRepository.loadSolutionFile(solutionPath);
    if (!resolveReplaySeries(loaded, seriesCatalog)) {
      unsupportedFiles.push(loaded.label);
      console.log(`== ${loaded.label} ==`);
      console.log("unsupported");
      continue;
    }

    const plan = buildReplayTraceScenariosFromSolutionFile(loaded, seriesCatalog);
    const fileNativeFailures: NativeFailure[] = [];
    const fileTsFailures: TsFailure[] = [];
    solutionCount += 1;

    console.log(`== ${loaded.label} ==`);
    console.log(`series ${plan.series.filebase} | ruleset ${loaded.file.ruleset} | replays ${plan.scenarios.length}`);

    for (const scenario of plan.scenarios) {
      replayCount += 1;
      const candidate = candidateForRuleset(scenario.request.ruleset, candidates);
      let expected: GameTrace;
      try {
        expected = await oracle.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks);
      } catch (error) {
        const failure = {
          scenarioName: scenario.name,
          status: "$error",
          finalTick: -1,
          detail: error instanceof Error ? error.message : String(error),
        } satisfies NativeFailure;
        fileNativeFailures.push(failure);
        nativeFailures.push(failure);
        nativeFailureStatuses.push(failure.status);
        nativeNonPassingCount += 1;
        console.log(`LEGACY ${summarizeNativeFailure(failure)}`);
        continue;
      }

      if (expected.result.status !== "completed") {
        const failure = {
          scenarioName: scenario.name,
          status: expected.result.status,
          finalTick: expected.result.finalTick,
        } satisfies NativeFailure;
        fileNativeFailures.push(failure);
        nativeFailures.push(failure);
        nativeFailureStatuses.push(failure.status);
        nativeNonPassingCount += 1;
        console.log(`LEGACY ${summarizeNativeFailure(failure)}`);
        continue;
      }

      nativePassingCount += 1;

      let actual: GameTrace;
      try {
        actual = await candidate.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks);
      } catch (error) {
        const failure = {
          scenarioName: scenario.name,
          mismatch: {
            path: "$engine",
            expected: "matching completed native trace",
            actual: error instanceof Error ? error.message : String(error),
          },
        } satisfies TsFailure;
        fileTsFailures.push(failure);
        tsFailures.push(failure);
        tsFailureSeries.push(plan.series.filebase);
        tsFailingCount += 1;
        console.log(`TS FAIL ${summarizeTsFailure(failure)}`);
        continue;
      }

      const mismatches: TraceMismatch[] = [];
      collectTraceMismatches(actual, expected, "$", mismatches, 25);
      if (mismatches.length === 0) {
        tsPassingCount += 1;
        continue;
      }

      const failure = {
        scenarioName: scenario.name,
        mismatch: mismatches[0]!,
      } satisfies TsFailure;
      fileTsFailures.push(failure);
      tsFailures.push(failure);
      tsFailureSeries.push(plan.series.filebase);
      tsFailingCount += 1;
      console.log(`TS FAIL ${summarizeTsFailure(failure)}`);
    }

    console.log(
      `summary legacy-pass ${plan.scenarios.length - fileNativeFailures.length}/${plan.scenarios.length}` +
        ` | legacy-nonpass ${fileNativeFailures.length}` +
        ` | ts-pass ${plan.scenarios.length - fileNativeFailures.length - fileTsFailures.length}/${plan.scenarios.length - fileNativeFailures.length}` +
        ` | ts-fail ${fileTsFailures.length}`,
    );
  }

  console.log("");
  console.log("== aggregate ==");
  console.log(`solution files checked: ${solutionCount}`);
  console.log(`unsupported files: ${unsupportedFiles.join(", ") || "(none)"}`);
  console.log(`replays checked: ${replayCount}`);
  console.log(`legacy passing replays: ${nativePassingCount}`);
  console.log(`legacy non-passing replays: ${nativeNonPassingCount}`);
  if (nativeFailureStatuses.length > 0) {
    console.log("legacy non-passing statuses:");
    for (const item of rankCounts(nativeFailureStatuses)) {
      console.log(`- ${item.key}: ${item.count}`);
    }
  }
  if (nativeFailures.length > 0) {
    console.log("legacy non-passing replays:");
    for (const failure of nativeFailures) {
      console.log(`- ${summarizeNativeFailure(failure)}`);
    }
  }
  console.log(`ts passing replays: ${tsPassingCount}`);
  console.log(`ts failing replays: ${tsFailingCount}`);
  if (tsFailureSeries.length > 0) {
    console.log("ts failing series:");
    for (const item of rankCounts(tsFailureSeries)) {
      console.log(`- ${item.key}: ${item.count}`);
    }
  }
  if (tsFailures.length > 0) {
    console.log("ts failing replays:");
    for (const failure of tsFailures) {
      console.log(`- ${summarizeTsFailure(failure)}`);
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
