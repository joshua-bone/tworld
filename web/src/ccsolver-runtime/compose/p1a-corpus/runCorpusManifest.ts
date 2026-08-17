import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  buildPinnedCorpusManifest,
  canonicalCorpusManifestJson,
} from "./corpusManifest";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(currentDirectory, "../../../../../");
const defaultOutputPath = "ccsolver/corpus/manifest.v1.json";

type Operation = "check" | "write";

interface CommandOptions {
  readonly operation: Operation;
  readonly repositoryRoot: string;
}

function usage(): string {
  return [
    "Usage: npm run ccsolver:corpus:check",
    "       npm run ccsolver:corpus:generate",
    "",
    "Options:",
    "  --check                 Compare pinned inputs with the checked-in manifest.",
    "  --write                 Regenerate the checked-in manifest.",
    "  --repo-root <path>      Repository root (testing and automation only).",
  ].join("\n");
}

function parseArguments(arguments_: readonly string[]): CommandOptions {
  let operation: Operation | undefined;
  let repositoryRoot = defaultRepositoryRoot;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--check" || argument === "--write") {
      const nextOperation = argument.slice(2) as Operation;
      if (operation !== undefined && operation !== nextOperation) {
        throw new Error("choose exactly one of --check or --write");
      }
      operation = nextOperation;
      continue;
    }
    if (argument === "--repo-root") {
      const value = arguments_[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      index += 1;
      repositoryRoot = resolve(value);
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    throw new Error(`unknown argument: ${argument}`);
  }

  if (operation === undefined) throw new Error("choose --check or --write");
  return { operation, repositoryRoot };
}

async function run(options: CommandOptions): Promise<void> {
  const sha256 = new WebCryptoSha256();
  const manifest = await buildPinnedCorpusManifest({
    sha256,
    source: {
      async readBytes(path) {
        return new Uint8Array(await readFile(resolve(options.repositoryRoot, path)));
      },
    },
  });
  const canonical = canonicalCorpusManifestJson(manifest);
  const absoluteOutput = resolve(options.repositoryRoot, defaultOutputPath);

  if (options.operation === "write") {
    await mkdir(dirname(absoluteOutput), { recursive: true });
    await writeFile(absoluteOutput, canonical, "utf8");
    process.stdout.write(
      `Wrote ${defaultOutputPath}: ${manifest.summary.mapCaseCount} cases, `
      + `${manifest.summary.donorBackedTargetRecordCount} donor-backed targets.\n`,
    );
    return;
  }

  let checkedIn: string;
  try {
    checkedIn = await readFile(absoluteOutput, "utf8");
  } catch (error) {
    throw new Error(`checked-in corpus manifest is missing: ${defaultOutputPath}`, { cause: error });
  }
  if (checkedIn !== canonical) {
    throw new Error(
      `checked-in corpus manifest is stale: ${relative(options.repositoryRoot, absoluteOutput)}; `
      + "run npm run ccsolver:corpus:generate",
    );
  }
  process.stdout.write(
    `Verified ${defaultOutputPath}: ${manifest.summary.mapCaseCount} cases, `
    + `${manifest.summary.donorBackedTargetRecordCount} donor-backed targets.\n`,
  );
}

try {
  await run(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
