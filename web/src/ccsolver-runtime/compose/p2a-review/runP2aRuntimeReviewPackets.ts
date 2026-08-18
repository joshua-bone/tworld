import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyP2aRuntimeReviewOutputs,
  buildP2aRuntimeReviewOutputs,
  P2A_RUNTIME_REVIEW_BOUNDS,
} from "./buildP2aRuntimeReviewOutputs";

type Operation = "check" | "write";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function usage(): string {
  return [
    "Usage: npx vite-node src/ccsolver-runtime/compose/p2a-review/runP2aRuntimeReviewPackets.ts --check",
    "       npx vite-node src/ccsolver-runtime/compose/p2a-review/runP2aRuntimeReviewPackets.ts --write",
    "",
    `Bounds: Key Pyramid MS <= ${P2A_RUNTIME_REVIEW_BOUNDS.keyPyramidMaximumResourceTicks.ms} `
      + `and Lynx <= ${P2A_RUNTIME_REVIEW_BOUNDS.keyPyramidMaximumResourceTicks.lynx} replay ticks; `
      + `Intro 8 <= ${P2A_RUNTIME_REVIEW_BOUNDS.intro8MaximumFollowupTicks} followup polls.`,
  ].join("\n");
}

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  throw new Error("choose exactly one of --check or --write");
}

async function run(operation: Operation): Promise<void> {
  const outputs = await buildP2aRuntimeReviewOutputs(repositoryRoot);
  await applyP2aRuntimeReviewOutputs(repositoryRoot, operation, outputs);
  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${outputs.length} P2A runtime review outputs.\n`,
  );
}

try {
  await run(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
