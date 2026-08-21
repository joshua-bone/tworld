import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  attestP7TrainingEngineAuthorities,
  assembleP7TrainingEngineShards,
  checkP7TrainingEngineRun,
  prepareP7TrainingEngineRun,
  reduceP7TrainingEngineRun,
  runP7TrainingEngineShard,
  writeP7TrainingEngineAuthorities,
} from "./p7TrainingEngineRunnerCore";
import type { P7TrainingRunBindingV1 } from "./p7TrainingRunnerContract";
import { assertP7TrainingRepositoryHead } from "./p7TrainingRepositoryHead";
import { referenceP7TrainingEngineRunnerBinary } from "./p7TrainingRunnerBinary";
import { runP7TrainingNodeEntrypoint } from "./p7TrainingNodeEntrypoint";

type Command = "prepare" | "shard" | "assemble" | "reduce" | "check" | "write" | "attest";

interface ParsedArguments {
  readonly command: Command;
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly packIds: readonly P7TrainingPackId[] | null;
  readonly shardIndex: number | null;
  readonly shardRoots: readonly string[] | null;
}

const COMMANDS = new Set<Command>([
  "prepare", "shard", "assemble", "reduce", "check", "write", "attest",
]);

function fail(message: string): never {
  throw new Error(message);
}

function parsePackIds(value: string): readonly P7TrainingPackId[] {
  const packIds = value.split(",") as P7TrainingPackId[];
  const order: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
  if (
    packIds.length < 1
    || packIds.length > 3
    || packIds.some((packId, index) => (
      !order.includes(packId)
      || order.indexOf(packId) <= (index === 0 ? -1 : order.indexOf(packIds[index - 1]!))
    ))
  ) fail("--packs must be a strict comma-separated cclp1,cclp4,cclp5 subset");
  return packIds;
}

export function parseP7TrainingEngineRunnerArguments(argv: readonly string[]): ParsedArguments {
  const [rawCommand, ...rest] = argv;
  if (!COMMANDS.has(rawCommand as Command)) fail(`unsupported P7 engine command: ${rawCommand ?? "<missing>"}`);
  const command = rawCommand as Command;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      flag === undefined
      || value === undefined
      || !flag.startsWith("--")
      || value.startsWith("--")
      || values.has(flag)
    ) fail(`invalid or duplicate P7 engine argument: ${flag ?? "<missing>"}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--root", "--artifacts", "--head", "--run-id", "--run-attempt",
    ...(command === "prepare" ? ["--packs"] : []),
    ...(command === "shard" ? ["--shard"] : []),
    ...(command === "assemble"
      ? Array.from({ length: 8 }, (_, index) => `--shard-${index}`)
      : []),
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) fail(`unsupported P7 engine argument: ${flag}`);
  }
  for (const flag of ["--root", "--artifacts", "--head", "--run-id", "--run-attempt"]) {
    if (!values.has(flag)) fail(`missing P7 engine argument: ${flag}`);
  }
  if (command === "prepare" && !values.has("--packs")) fail("missing P7 engine argument: --packs");
  if (command === "shard" && !values.has("--shard")) fail("missing P7 engine argument: --shard");
  if (command === "assemble") {
    for (let shardIndex = 0; shardIndex < 8; shardIndex += 1) {
      if (!values.has(`--shard-${shardIndex}`)) {
        fail(`missing P7 engine argument: --shard-${shardIndex}`);
      }
    }
  }
  const runAttempt = Number(values.get("--run-attempt"));
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) fail("--run-attempt must be a positive integer");
  const shardIndex = command === "shard" ? Number(values.get("--shard")) : null;
  if (shardIndex !== null && (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= 8)) {
    fail("--shard must be an integer in 0..7");
  }
  return {
    command,
    repositoryRoot: resolve(values.get("--root")!),
    artifactRoot: resolve(values.get("--artifacts")!),
    binding: {
      headSha: values.get("--head")!,
      runId: values.get("--run-id")!,
      runAttempt,
    },
    packIds: command === "prepare" ? parsePackIds(values.get("--packs")!) : null,
    shardIndex,
    shardRoots: command === "assemble"
      ? Array.from({ length: 8 }, (_, index) => resolve(values.get(`--shard-${index}`)!))
      : null,
  };
}

export async function runP7TrainingEngineCli(
  argv: readonly string[],
  writeOutput: (value: string) => void = (value) => process.stdout.write(value),
): Promise<void> {
  const parsed = parseP7TrainingEngineRunnerArguments(argv);
  const sha256 = new WebCryptoSha256();
  await assertP7TrainingRepositoryHead({
    repositoryRoot: parsed.repositoryRoot,
    expectedHead: parsed.binding.headSha,
  });
  const runner = await referenceP7TrainingEngineRunnerBinary({
    executablePath: fileURLToPath(import.meta.url),
    sha256,
  });
  const common = {
    repositoryRoot: parsed.repositoryRoot,
    artifactRoot: parsed.artifactRoot,
    binding: parsed.binding,
    runner,
    sha256,
  };
  let summary: unknown;
  if (parsed.command === "prepare") {
    const prepared = await prepareP7TrainingEngineRun({
      ...common,
      packIds: parsed.packIds!,
    });
    summary = {
      command: parsed.command,
      packs: prepared.plan.packs.map(({ packId }) => packId),
      shardCount: prepared.plan.shardCount,
    };
  } else if (parsed.command === "shard") {
    const results = await runP7TrainingEngineShard({
      ...common,
      shardIndex: parsed.shardIndex!,
    });
    summary = {
      command: parsed.command,
      packCount: results.length,
      shardIndex: parsed.shardIndex,
    };
  } else if (parsed.command === "assemble") {
    const assembled = await assembleP7TrainingEngineShards({
      ...common,
      shardRoots: parsed.shardRoots!,
    });
    summary = {
      command: parsed.command,
      shardCount: assembled.shardRoots.length,
      copiedFiles: assembled.copiedFiles,
    };
  } else {
    const reductions = parsed.command === "reduce"
      ? await reduceP7TrainingEngineRun(common)
      : parsed.command === "check"
        ? await checkP7TrainingEngineRun(common)
        : parsed.command === "write"
          ? await writeP7TrainingEngineAuthorities(common)
          : await attestP7TrainingEngineAuthorities(common);
    summary = {
      command: parsed.command,
      packs: reductions.map(({ packId }) => packId),
      levelCounts: reductions.map(({ reducedPack }) => reducedPack.levels.length),
    };
  }
  writeOutput(`${JSON.stringify(summary)}\n`);
}

await runP7TrainingNodeEntrypoint({
  argv: process.argv,
  moduleUrl: import.meta.url,
  dispatch: runP7TrainingEngineCli,
});
