import { spawn } from "node:child_process";
import { availableParallelism, cpus } from "node:os";

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
}

export const REPLAY_SWEEP_SHARD_CHILD_ENV = "TWORLD_REPLAY_SWEEP_SHARD_CHILD";

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

async function runReplaySweepShard(
  repoRoot: string,
  scriptName: string,
  solutionFileEnvName: string,
  files: readonly ReplaySweepShardFile[],
  shardIndex: number,
  shardCount: number,
  totalWeight: number,
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
          [solutionFileEnvName]: files.map((file) => file.path).join(","),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
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
      ),
    ),
  );

  for (const result of results.sort((left, right) => left.shardIndex - right.shardIndex)) {
    console.log(
      `== shard ${result.shardIndex + 1}/${result.shardCount} | ${result.fileCount} files | weight ${result.totalWeight} ==`,
    );
    console.log(summarizeShardFiles(shards[result.shardIndex]!.files));
    printBufferedChunk(result.stdout, process.stdout);
    printBufferedChunk(result.stderr, process.stderr);
  }

  process.exitCode = results.some((result) => result.exitCode !== 0) ? 1 : 0;
  return true;
}
