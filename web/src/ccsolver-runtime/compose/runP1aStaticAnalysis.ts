import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { encodeArtifact } from "@tworld/ccsolver/application";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldMsStaticAnalysis } from "./buildTworldMsStaticAnalysis";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../");
const outputDirectory = resolve(
  repositoryRoot,
  "ccsolver/fixtures/golden/p1a/intro-008/ms",
);

const OUTPUTS = [
  "level-facts.v1.json",
  "topology-evidence.v1.json",
  "static-analysis.v1.json",
  "dossier-data.v1.json",
] as const;

type Operation = "check" | "write";

function usage(): string {
  return [
    "Usage: npm run ccsolver:analysis:check",
    "       npm run ccsolver:analysis:generate",
    "",
    "Options:",
    "  --check    Compare the Intro 8 analysis with the checked-in goldens.",
    "  --write    Regenerate the checked-in goldens.",
  ].join("\n");
}

function parseArguments(arguments_: readonly string[]): Operation {
  if (arguments_.length === 1 && arguments_[0] === "--check") return "check";
  if (arguments_.length === 1 && arguments_[0] === "--write") return "write";
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0] ?? "")) {
    process.stdout.write(`${usage()}\n`);
    process.exit(0);
  }
  throw new Error("choose exactly one of --check or --write");
}

async function buildOutputs(): Promise<ReadonlyMap<(typeof OUTPUTS)[number], string>> {
  const sourceRevision = "42c78d0db343621f887fefce581315479d9a8be3";
  const loaded = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: "intro-ms.dac",
    levelNumber: 8,
    ruleset: "MS",
  });
  const containerBytes = new Uint8Array(
    await readFile(resolve(repositoryRoot, "data/intro.dat")),
  );
  const built = await buildTworldMsStaticAnalysis({
    occurrenceId: "tworld:intro:8",
    producerRevision: "ccsolver:p1a-static-analysis-v1",
    repository: "tworld",
    repositoryRevision: sourceRevision,
    sourcePath: "data/intro.dat",
    adapterRevision: "tworld-ms-level-facts:p0c1-v1",
    importProfileRevision: "tworld-legacy-dat-static:v1",
    analyzerRevision: "ccsolver-static-level-facts:p0c1-v1",
    catalogRevision: sourceRevision,
    policyRevision: `tworld-ms-static-topology:${sourceRevision}`,
    staticAnalyzerRevision: "ccsolver-static-topology:p1a-v1",
    containerBytes,
    loaded,
  }, new WebCryptoSha256());

  return new Map([
    ["level-facts.v1.json", encodeArtifact(built.levelFacts.facts)],
    ["topology-evidence.v1.json", built.topology.canonicalJson],
    ["static-analysis.v1.json", built.analysisCanonicalJson],
    ["dossier-data.v1.json", built.dossierCanonicalJson],
  ]);
}

async function run(operation: Operation): Promise<void> {
  const outputs = await buildOutputs();
  if (operation === "write") await mkdir(outputDirectory, { recursive: true });

  for (const fileName of OUTPUTS) {
    const canonical = outputs.get(fileName);
    if (canonical === undefined) throw new Error(`missing generated output: ${fileName}`);
    const outputPath = resolve(outputDirectory, fileName);
    if (operation === "write") {
      await writeFile(outputPath, canonical, "utf8");
      continue;
    }
    let checkedIn: string;
    try {
      checkedIn = await readFile(outputPath, "utf8");
    } catch (error) {
      throw new Error(`checked-in P1A golden is missing: ${fileName}`, { cause: error });
    }
    if (checkedIn !== canonical) {
      throw new Error(
        `checked-in P1A golden is stale: ${fileName}; `
        + "run npm run ccsolver:analysis:generate",
      );
    }
  }

  process.stdout.write(
    `${operation === "write" ? "Wrote" : "Verified"} ${OUTPUTS.length} P1A Intro 8 goldens.\n`,
  );
}

try {
  await run(parseArguments(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
}
