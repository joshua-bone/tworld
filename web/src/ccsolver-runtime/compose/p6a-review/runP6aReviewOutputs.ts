import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildP6aReviewOutputs,
  P6A_CHECKED_OUTPUT_ROOT,
} from "./buildP6aReviewOutputs";
import {
  checkP6aOutputTree,
  installP6aDistTransactionally,
  loadCheckedP6aDistOutputs,
  writeP6aCheckedOutputsTransactionally,
} from "./p6aReviewIo";

type Operation = "check" | "write" | "attest" | "emit-dist";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  if (arguments_.length === 1 && arguments_[0] === "--attest") return "attest";
  if (arguments_.length === 1 && arguments_[0] === "--emit-dist") return "emit-dist";
  throw new Error("choose exactly one of --check, --write, --attest, or --emit-dist");
}

async function apply(operation: Operation): Promise<void> {
  if (operation === "attest") {
    const checkedOutputs = await loadCheckedP6aDistOutputs(repositoryRoot);
    process.stdout.write(
      `Attested ${checkedOutputs.length} checked causal-alignment files without running either runtime or mutating dist.\n`,
    );
    return;
  }
  if (operation === "emit-dist") {
    const distOutputs = await loadCheckedP6aDistOutputs(repositoryRoot);
    await installP6aDistTransactionally(repositoryRoot, distOutputs);
    process.stdout.write(
      `Validated and emitted ${distOutputs.length} checked files beneath the causal-alignment dist leaf without running either runtime.\n`,
    );
    return;
  }
  const built = await buildP6aReviewOutputs(repositoryRoot);
  if (operation === "check") {
    await checkP6aOutputTree(
      repositoryRoot,
      P6A_CHECKED_OUTPUT_ROOT,
      built.checkedOutputs,
    );
    process.stdout.write(
      `Verified ${built.checkedOutputs.length} checked P2B/P6A Key Pyramid outputs.\n`,
    );
    return;
  }
  if (operation === "write") {
    await writeP6aCheckedOutputsTransactionally(repositoryRoot, built.checkedOutputs);
    process.stdout.write(
      `Wrote ${built.checkedOutputs.length} checked P2B/P6A outputs; human review remains unreviewed.\n`,
    );
    return;
  }
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p6a-review/runP6aReviewOutputs.ts --check|--write|--attest|--emit-dist\n",
  );
  process.exitCode = 1;
}
