import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  attestCheckedP7TrainingPlayerGraph,
  checkP7TrainingPlayerGraph,
  writeP7TrainingPlayerGraphTransactionally,
} from "./p7TrainingPlayerGraphIo";
import {
  attestP7TrainingPresentationPacks,
  buildP7TrainingPresentationRun,
  checkP7TrainingPresentationRun,
  writeP7TrainingPresentationPacks,
} from "./p7TrainingPresentationRunnerCore";
import { assertP7TrainingRepositoryHead } from "./p7TrainingRepositoryHead";
import { referenceP7TrainingEngineRunnerBinary } from "./p7TrainingRunnerBinary";
import { referenceP7TrainingPresentationRunnerBinary } from "./p7TrainingPresentationRunnerBinary";
import type { P7TrainingRunBindingV1 } from "./p7TrainingRunnerContract";
import {
  checkP7TrainingPresentationRunManifest,
  prepareP7TrainingPresentationRunManifest,
} from "./p7TrainingPresentationRunManifest";
import { runP7TrainingNodeEntrypoint } from "./p7TrainingNodeEntrypoint";

export const P7_TRAINING_PRESENTATION_RUNNER_FILENAME =
  "p7-training-presentation-runner.mjs" as const;
export const P7_TRAINING_ENGINE_RUNNER_FILENAME =
  "p7-training-engine-runner.mjs" as const;

type Command =
  | "prepare"
  | "graph-check"
  | "graph-write"
  | "graph-attest"
  | "build"
  | "check"
  | "write"
  | "attest";

interface ParsedArguments {
  readonly command: Command;
  readonly repositoryRoot: string;
  readonly expectedHead: string;
  readonly artifactRoot: string | null;
  readonly presentationArtifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly packIds: readonly P7TrainingPackId[] | null;
}

const COMMANDS = new Set<Command>([
  "prepare", "graph-check", "graph-write", "graph-attest", "build", "check", "write", "attest",
]);
const WORK_COMMANDS = new Set<Command>(["build", "check", "write"]);

function fail(message: string): never {
  throw new Error(message);
}

function parsePackIds(value: string): readonly P7TrainingPackId[] {
  const packIds = value.split(",") as P7TrainingPackId[];
  const order: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
  if (
    packIds.length < 1
    || packIds.length > order.length
    || packIds.some((packId, index) => (
      !order.includes(packId)
      || order.indexOf(packId) <= (index === 0 ? -1 : order.indexOf(packIds[index - 1]!))
    ))
  ) fail("--packs must be a strict comma-separated cclp1,cclp4,cclp5 subset");
  return packIds;
}

export function parseP7TrainingPresentationRunnerArguments(
  argv: readonly string[],
): ParsedArguments {
  const [rawCommand, ...rest] = argv;
  if (!COMMANDS.has(rawCommand as Command)) {
    fail(`unsupported P7 presentation command: ${rawCommand ?? "<missing>"}`);
  }
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
    ) fail(`invalid or duplicate P7 presentation argument: ${flag ?? "<missing>"}`);
    values.set(flag, value);
  }
  const allowed = new Set([
    "--root",
    "--head",
    "--presentation-artifacts",
    "--run-id",
    "--run-attempt",
    ...(WORK_COMMANDS.has(command) ? ["--artifacts", "--run-id", "--run-attempt"] : []),
    ...(command === "attest" ? ["--packs"] : []),
  ]);
  for (const flag of values.keys()) {
    if (!allowed.has(flag)) fail(`unsupported P7 presentation argument: ${flag}`);
  }
  for (const flag of [
    "--root", "--head", "--presentation-artifacts", "--run-id", "--run-attempt",
  ]) {
    if (!values.has(flag)) fail(`missing P7 presentation argument: ${flag}`);
  }
  if (WORK_COMMANDS.has(command)) {
    for (const flag of ["--artifacts", "--run-id", "--run-attempt"]) {
      if (!values.has(flag)) fail(`missing P7 presentation argument: ${flag}`);
    }
  }
  if (command === "attest" && !values.has("--packs")) {
    fail("missing P7 presentation argument: --packs");
  }
  const runAttempt = Number(values.get("--run-attempt"));
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) {
    fail("--run-attempt must be a positive integer");
  }
  const expectedHead = values.get("--head")!;
  return {
    command,
    repositoryRoot: resolve(values.get("--root")!),
    expectedHead,
    artifactRoot: WORK_COMMANDS.has(command) ? resolve(values.get("--artifacts")!) : null,
    presentationArtifactRoot: resolve(values.get("--presentation-artifacts")!),
    binding: {
      headSha: expectedHead,
      runId: values.get("--run-id")!,
      runAttempt,
    },
    packIds: command === "attest" ? parsePackIds(values.get("--packs")!) : null,
  };
}

export async function runP7TrainingPresentationCli(
  argv: readonly string[],
  writeOutput: (value: string) => void = (value) => process.stdout.write(value),
): Promise<void> {
  const parsed = parseP7TrainingPresentationRunnerArguments(argv);
  const sha256 = new WebCryptoSha256();
  await assertP7TrainingRepositoryHead({
    repositoryRoot: parsed.repositoryRoot,
    expectedHead: parsed.expectedHead,
  });
  const presentationRunner = await referenceP7TrainingPresentationRunnerBinary({
    executablePath: fileURLToPath(import.meta.url),
    sha256,
  });
  if (parsed.command === "prepare") {
    const prepared = await prepareP7TrainingPresentationRunManifest({
      artifactRoot: parsed.presentationArtifactRoot,
      binding: parsed.binding,
      runner: presentationRunner,
      sha256,
    });
    await checkP7TrainingPresentationRunManifest({
      artifactRoot: parsed.presentationArtifactRoot,
      binding: parsed.binding,
      runner: presentationRunner,
      sha256,
    });
    writeOutput(`${JSON.stringify({
      command: parsed.command,
      runner: prepared.manifest.runner,
    })}\n`);
    return;
  }
  await checkP7TrainingPresentationRunManifest({
    artifactRoot: parsed.presentationArtifactRoot,
    binding: parsed.binding,
    runner: presentationRunner,
    sha256,
  });
  let summary: unknown;
  if (parsed.command === "graph-check") {
    const checked = await checkP7TrainingPlayerGraph({
      repositoryRoot: parsed.repositoryRoot,
      sha256,
    });
    summary = { command: parsed.command, entry: checked.graphAttestation.entry };
  } else if (parsed.command === "graph-write") {
    const checked = await writeP7TrainingPlayerGraphTransactionally({
      repositoryRoot: parsed.repositoryRoot,
      sha256,
    });
    summary = { command: parsed.command, entry: checked.graphAttestation.entry };
  } else if (parsed.command === "graph-attest") {
    summary = {
      command: parsed.command,
      ...(await attestCheckedP7TrainingPlayerGraph({
        repositoryRoot: parsed.repositoryRoot,
        sha256,
      })),
    };
  } else if (parsed.command === "attest") {
    const attested = await attestP7TrainingPresentationPacks({
      repositoryRoot: parsed.repositoryRoot,
      packIds: parsed.packIds!,
      sha256,
    });
    summary = {
      command: parsed.command,
      packs: attested.map(({ packId }) => packId),
      outputCounts: attested.map(({ outputCount }) => outputCount),
    };
  } else {
    const executableDirectory = dirname(fileURLToPath(import.meta.url));
    const runner = await referenceP7TrainingEngineRunnerBinary({
      executablePath: resolve(executableDirectory, P7_TRAINING_ENGINE_RUNNER_FILENAME),
      sha256,
    });
    const common = {
      repositoryRoot: parsed.repositoryRoot,
      artifactRoot: parsed.artifactRoot!,
      binding: parsed.binding,
      runner,
      presentationRunner,
      sha256,
    };
    const presentations = parsed.command === "build"
      ? await buildP7TrainingPresentationRun(common)
      : parsed.command === "check"
        ? await checkP7TrainingPresentationRun(common)
        : await writeP7TrainingPresentationPacks(common);
    summary = {
      command: parsed.command,
      packs: presentations.map(({ packId }) => packId),
      outputCounts: presentations.map(({ built }) => built.outputs.length),
    };
  }
  writeOutput(`${JSON.stringify(summary)}\n`);
}

await runP7TrainingNodeEntrypoint({
  argv: process.argv,
  moduleUrl: import.meta.url,
  dispatch: runP7TrainingPresentationCli,
});
