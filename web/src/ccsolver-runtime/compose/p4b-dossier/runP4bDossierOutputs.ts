import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildP4bDossierOutputs,
  P4B_CHECKED_OUTPUT_ROOT,
} from "./buildP4bDossierOutputs";
import {
  checkExactOutputTree,
  installP4bDistTransactionally,
  writeP4bCheckedOutputsTransactionally,
} from "./p4bDossierIo";

type Operation = "check" | "write" | "emit-dist";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  if (arguments_.length === 1 && arguments_[0] === "--emit-dist") return "emit-dist";
  throw new Error("choose exactly one of --check, --write, or --emit-dist");
}

async function apply(operation: Operation): Promise<void> {
  const built = await buildP4bDossierOutputs(repositoryRoot);
  if (operation === "check") {
    await checkExactOutputTree(repositoryRoot, P4B_CHECKED_OUTPUT_ROOT, built.checkedOutputs);
    process.stdout.write(
      `Verified ${built.checkedOutputs.length} checked P4B outputs from 32 digest-verified P5 files.\n`,
    );
    return;
  }
  if (operation === "write") {
    await writeP4bCheckedOutputsTransactionally(repositoryRoot, built.checkedOutputs);
    process.stdout.write(
      `Wrote ${built.checkedOutputs.length} checked P4B outputs; human review remains unreviewed.\n`,
    );
    return;
  }
  // Pages order is intentional: Vite builds first, the workflow copies the
  // player index to 404.html, then this step atomically installs the dossier
  // subtree and augments (rather than replaces) the existing SPA fallback.
  await checkExactOutputTree(repositoryRoot, P4B_CHECKED_OUTPUT_ROOT, built.checkedOutputs);
  await installP4bDistTransactionally(repositoryRoot, built.distOutputs);
  process.stdout.write(
    `Emitted ${built.distOutputs.length} P4B dist files and installed the bounded 404 route guard.\n`,
  );
}

try {
  await apply(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(
    "Usage: npx vite-node src/ccsolver-runtime/compose/p4b-dossier/runP4bDossierOutputs.ts --check|--write|--emit-dist\n",
  );
  process.exitCode = 1;
}
