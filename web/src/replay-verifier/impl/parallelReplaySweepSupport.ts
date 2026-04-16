import { spawn } from "node:child_process";
import { availableParallelism, cpus } from "node:os";
import { parseReplaySweepCoordinationLine, REPLAY_SWEEP_COORDINATED_ENV, type ReplaySweepCoordinationEvent } from "@replay-verifier/impl/replaySweepCoordination";
import { trimReplaySweepPackName } from "@replay-verifier/impl/replaySweepTerminalFormat";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export interface ReplaySweepShardFile {
  path: string;
  label: string;
  weight: number;
}

export interface ReplaySweepShard {
  files: ReplaySweepShardFile[];
  totalWeight: number;
}

export interface ReplaySweepShardResult {
  shardIndex: number;
  shardCount: number;
  fileCount: number;
  totalWeight: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunParallelReplaySweepOptions {
  repoRoot: string;
  scriptName: string;
  description: string;
  solutionFileEnvName: string;
  files: ReplaySweepShardFile[];
  jobsEnvValue: string | null;
  summaryKind: "all" | "ruleset";
  ruleset?: SupportedReplaySweepRuleset;
}

export const REPLAY_SWEEP_SHARD_CHILD_ENV = "TWORLD_REPLAY_SWEEP_SHARD_CHILD";

interface ReplaySweepShardAggregate {
  supportedFileCount: number;
  unsupportedFiles: string[];
  checked: number;
  passed: number;
  failed: number;
  tsFailed: number;
  legacyFailed: number;
  byRuleset: Record<SupportedReplaySweepRuleset, {
    checked: number;
    passed: number;
    failed: number;
    tsFailed: number;
    legacyFailed: number;
  }>;
}

function systemParallelism(): number {
  const detected = typeof availableParallelism === "function" ? availableParallelism() : cpus().length;
  return Math.max(1, detected);
}

export function parseReplaySweepJobs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function resolveReplaySweepJobs(fileCount: number, value: string | null | undefined): number {
  if (fileCount <= 1) {
    return 1;
  }

  const requested = parseReplaySweepJobs(value);
  if (requested !== null) {
    return Math.max(1, Math.min(fileCount, requested));
  }

  const detected = systemParallelism();
  const automatic = detected > 1 ? detected - 1 : 1;
  return Math.max(1, Math.min(fileCount, automatic));
}

export function partitionReplaySweepFiles(
  files: readonly ReplaySweepShardFile[],
  requestedJobs: number,
): ReplaySweepShard[] {
  if (files.length === 0) {
    return [];
  }

  const shardCount = Math.max(1, Math.min(requestedJobs, files.length));
  const shards: ReplaySweepShard[] = Array.from({ length: shardCount }, () => ({
    files: [],
    totalWeight: 0,
  }));

  const sortedFiles = [...files].sort(
    (left, right) => right.weight - left.weight || left.label.localeCompare(right.label),
  );

  for (const file of sortedFiles) {
    let target = shards[0]!;
    for (const shard of shards.slice(1)) {
      if (shard.totalWeight < target.totalWeight) {
        target = shard;
        continue;
      }

      if (shard.totalWeight === target.totalWeight && shard.files.length < target.files.length) {
        target = shard;
      }
    }

    target.files.push(file);
    target.totalWeight += Math.max(1, file.weight);
  }

  return shards
    .filter((shard) => shard.files.length > 0)
    .map((shard) => ({
      totalWeight: shard.totalWeight,
      files: [...shard.files].sort((left, right) => left.label.localeCompare(right.label)),
    }));
}

function npmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function createReplaySweepShardAggregate(): ReplaySweepShardAggregate {
  return {
    supportedFileCount: 0,
    unsupportedFiles: [],
    checked: 0,
    passed: 0,
    failed: 0,
    tsFailed: 0,
    legacyFailed: 0,
    byRuleset: {
      MS: { checked: 0, passed: 0, failed: 0, tsFailed: 0, legacyFailed: 0 },
      Lynx: { checked: 0, passed: 0, failed: 0, tsFailed: 0, legacyFailed: 0 },
    },
  };
}

function formatElapsedDuration(elapsedMs: number): string {
  if (elapsedMs < 1000) {
    return `${elapsedMs}ms`;
  }

  if (elapsedMs < 60_000) {
    return `${(elapsedMs / 1000).toFixed(1)}s`;
  }

  const totalSeconds = Math.round(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function printReplaySweepSummaryLine(prefix: string, counts: Pick<ReplaySweepShardAggregate, "checked" | "passed" | "failed">): void {
  console.log(`${prefix} checked ${counts.checked} | passed ${counts.passed} | failed ${counts.failed}`);
}

function printAllReplaySweepSummaryLine(
  prefix: string,
  counts: Pick<ReplaySweepShardAggregate, "checked" | "passed" | "tsFailed" | "legacyFailed">,
): void {
  console.log(
    `${prefix} checked ${counts.checked} | passed ${counts.passed} | ts-failed ${counts.tsFailed} | legacy-failed ${counts.legacyFailed}`,
  );
}

function handleReplaySweepCoordinationEvent(
  aggregate: ReplaySweepShardAggregate,
  options: RunParallelReplaySweepOptions,
  shardIndex: number,
  shardCount: number,
  event: ReplaySweepCoordinationEvent,
): void {
  const shardLabel = `[${shardIndex + 1}/${shardCount}]`;

  switch (event.type) {
    case "file-start": {
      const replayLabel = event.replayCount === 1 ? "1 replay" : `${event.replayCount} replays`;
      const rulesetPrefix = options.summaryKind === "all" ? `${event.ruleset} ` : "";
      console.log(`start ${shardLabel} ${rulesetPrefix}${trimReplaySweepPackName(event.packName)} | ${replayLabel}`);
      return;
    }
    case "file-complete": {
      aggregate.supportedFileCount += 1;
      aggregate.checked += event.checked;
      aggregate.passed += event.passed;
      aggregate.failed += event.failed;
      aggregate.tsFailed += event.tsFailed;
      aggregate.legacyFailed += event.legacyFailed;
      const rulesetTotals = aggregate.byRuleset[event.ruleset];
      rulesetTotals.checked += event.checked;
      rulesetTotals.passed += event.passed;
      rulesetTotals.failed += event.failed;
      rulesetTotals.tsFailed += event.tsFailed;
      rulesetTotals.legacyFailed += event.legacyFailed;

      const rulesetPrefix = options.summaryKind === "all" ? `${event.ruleset} ` : "";
      if (options.summaryKind === "all") {
        console.log(
          `done  ${shardLabel} ${rulesetPrefix}${trimReplaySweepPackName(event.packName)} | checked ${event.checked} | passed ${event.passed} | ts-failed ${event.tsFailed} | legacy-failed ${event.legacyFailed} | ${formatElapsedDuration(event.elapsedMs)}`,
        );
      } else {
        console.log(
          `done  ${shardLabel} ${rulesetPrefix}${trimReplaySweepPackName(event.packName)} | checked ${event.checked} | passed ${event.passed} | failed ${event.failed} | ${formatElapsedDuration(event.elapsedMs)}`,
        );
      }
      for (const failureLine of event.failureLines) {
        console.log(`  ${failureLine}`);
      }
      return;
    }
    case "unsupported-file":
      aggregate.unsupportedFiles.push(event.solutionLabel);
      console.log(`skip  ${shardLabel} ${event.solutionLabel} | unsupported`);
      return;
  }
}

function printReplaySweepAggregateSummary(
  aggregate: ReplaySweepShardAggregate,
  options: RunParallelReplaySweepOptions,
): void {
  console.log("== total summary ==");
  console.log(`solution files checked: ${aggregate.supportedFileCount}`);
  console.log(`unsupported files: ${aggregate.unsupportedFiles.length > 0 ? aggregate.unsupportedFiles.join(", ") : "(none)"}`);

  if (options.summaryKind === "all") {
    printAllReplaySweepSummaryLine("all replays:", aggregate);
    printAllReplaySweepSummaryLine("MS:", aggregate.byRuleset.MS);
    printAllReplaySweepSummaryLine("Lynx:", aggregate.byRuleset.Lynx);
    return;
  }

  printReplaySweepSummaryLine(`${options.ruleset ?? "replays"}:`, aggregate);
}

async function runReplaySweepShard(
  repoRoot: string,
  scriptName: string,
  solutionFileEnvName: string,
  files: readonly ReplaySweepShardFile[],
  shardIndex: number,
  shardCount: number,
  totalWeight: number,
  options: RunParallelReplaySweepOptions,
  aggregate: ReplaySweepShardAggregate,
): Promise<ReplaySweepShardResult> {
  return await new Promise<ReplaySweepShardResult>((resolve, reject) => {
    const child = spawn(
      npmCommand(),
      ["--silent", "--workspace", "web", "run", scriptName, "--"],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          [REPLAY_SWEEP_SHARD_CHILD_ENV]: "1",
          [REPLAY_SWEEP_COORDINATED_ENV]: "1",
          [solutionFileEnvName]: files.map((file) => file.path).join(","),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let stdoutRemainder = "";
    let stderrRemainder = "";

    function consumeLine(line: string, isStdout: boolean): void {
      if (isStdout) {
        const event = parseReplaySweepCoordinationLine(line);
        if (event) {
          handleReplaySweepCoordinationEvent(aggregate, options, shardIndex, shardCount, event);
          return;
        }
        stdout += `${line}\n`;
        return;
      }

      stderr += `${line}\n`;
    }

    function consumeChunk(chunk: Buffer | string, isStdout: boolean): void {
      const text = chunk.toString();
      let buffer = `${isStdout ? stdoutRemainder : stderrRemainder}${text}`;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        consumeLine(buffer.slice(0, newlineIndex), isStdout);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf("\n");
      }

      if (isStdout) {
        stdoutRemainder = buffer;
      } else {
        stderrRemainder = buffer;
      }
    }

    child.stdout?.on("data", (chunk: Buffer | string) => {
      consumeChunk(chunk, true);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      consumeChunk(chunk, false);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (stdoutRemainder) {
        consumeLine(stdoutRemainder, true);
      }
      if (stderrRemainder) {
        consumeLine(stderrRemainder, false);
      }

      resolve({
        shardIndex,
        shardCount,
        fileCount: files.length,
        totalWeight,
        stdout,
        stderr: signal ? `${stderr}\nExited via signal ${signal}`.trim() : stderr,
        exitCode: signal ? 1 : code ?? 1,
      });
    });
  });
}

function summarizeShardFiles(files: readonly ReplaySweepShardFile[]): string {
  if (files.length === 0) {
    return "(none)";
  }

  const preview = files.slice(0, 3).map((file) => file.label);
  if (files.length <= 3) {
    return preview.join(", ");
  }

  return `${preview.join(", ")}, +${files.length - 3} more`;
}

function printBufferedChunk(output: string, writer: Pick<NodeJS.WriteStream, "write">): void {
  if (!output) {
    return;
  }

  writer.write(output.endsWith("\n") ? output : `${output}\n`);
}

export async function maybeRunParallelReplaySweep(options: RunParallelReplaySweepOptions): Promise<boolean> {
  if (process.env[REPLAY_SWEEP_SHARD_CHILD_ENV] === "1") {
    return false;
  }

  const jobCount = resolveReplaySweepJobs(options.files.length, options.jobsEnvValue);
  if (jobCount <= 1 || options.files.length <= 1) {
    return false;
  }

  const shards = partitionReplaySweepFiles(options.files, jobCount);
  console.log(
    `${options.description}: sharding ${options.files.length} solution files across ${shards.length} workers`,
  );

  const aggregate = createReplaySweepShardAggregate();

  const results = await Promise.all(
    shards.map((shard, index) =>
      runReplaySweepShard(
        options.repoRoot,
        options.scriptName,
        options.solutionFileEnvName,
        shard.files,
        index,
        shards.length,
        shard.totalWeight,
        options,
        aggregate,
      ),
    ),
  );

  for (const result of results.sort((left, right) => left.shardIndex - right.shardIndex)) {
    if (!result.stdout && !result.stderr) {
      continue;
    }
    console.log(
      `== shard ${result.shardIndex + 1}/${result.shardCount} | ${result.fileCount} files | weight ${result.totalWeight} ==`,
    );
    console.log(summarizeShardFiles(shards[result.shardIndex]!.files));
    printBufferedChunk(result.stdout, process.stdout);
    printBufferedChunk(result.stderr, process.stderr);
  }

  printReplaySweepAggregateSummary(aggregate, options);
  process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
  return true;
}
