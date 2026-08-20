import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildP6bP7aReviewOutputs } from "./buildP6bP7aReviewOutputs";
import {
  P6B_P7A_CHECKED_ROOT,
  checkP6bP7aOutputTree,
  installP6bP7aDistTransactionally,
  loadCheckedP6bP7aDistOutputs,
  writeP6bP7aCheckedOutputsTransactionally,
} from "./p6bP7aReviewIo";

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
    const outputs = await loadCheckedP6bP7aDistOutputs(repositoryRoot);
    process.stdout.write(
      `Attested ${outputs.length} checked P6B/P7A files without running either engine or mutating dist.\n`,
    );
    return;
  }
  if (operation === "emit-dist") {
    const outputs = await loadCheckedP6bP7aDistOutputs(repositoryRoot);
    await installP6bP7aDistTransactionally(repositoryRoot, outputs);
    process.stdout.write(
      `Validated and emitted ${outputs.length} checked P6B/P7A files without running either engine.\n`,
    );
    return;
  }

  process.env.TWORLD_P7A_PROGRESS ??= "1";
  const built = await buildP6bP7aReviewOutputs(repositoryRoot);
  if (operation === "check") {
    await checkP6bP7aOutputTree(repositoryRoot, built.checkedOutputs);
    process.stdout.write(
      `Verified ${built.checkedOutputs.length} checked standard-tactic review files.\n`,
    );
    return;
  }

  if (P6B_P7A_CHECKED_ROOT !== "ccsolver/fixtures/golden/p7a/phase-a-key-door") {
    throw new Error("P6B/P7A checked output root drifted");
  }
  await writeP6bP7aCheckedOutputsTransactionally(repositoryRoot, built.checkedOutputs);
  process.stdout.write(
    `Wrote ${built.checkedOutputs.length} checked P6B/P7A review files; portfolio claims remain proposals.\n`,
  );
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p6b-p7a-review/runP6bP7aReviewOutputs.ts --check|--write|--attest|--emit-dist\n",
  );
  process.exitCode = 1;
}
