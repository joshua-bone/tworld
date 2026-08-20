import { resolve } from "node:path";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import { runP7TrainingNodeEntrypoint } from "../p7-training-runner/p7TrainingNodeEntrypoint";
import { installCheckedP7bTrainingPackDistTransactionally } from "./p7bTrainingPackIo";

const ORDERED_PACK_IDS: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];

function parsePackIds(value: string): readonly P7TrainingPackId[] {
  const packIds = value.split(",") as P7TrainingPackId[];
  if (
    packIds.length < 1
    || packIds.length > ORDERED_PACK_IDS.length
    || packIds.some((packId, index) => (
      !ORDERED_PACK_IDS.includes(packId)
      || ORDERED_PACK_IDS.indexOf(packId)
        <= (index === 0 ? -1 : ORDERED_PACK_IDS.indexOf(packIds[index - 1]!))
    ))
  ) throw new Error("--packs must be a strict comma-separated cclp1,cclp4,cclp5 subset");
  return packIds;
}

function parseArguments(argv: readonly string[]): {
  readonly repositoryRoot: string;
  readonly packIds: readonly P7TrainingPackId[];
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined
      || value === undefined
      || value.startsWith("--")
      || !["--root", "--packs"].includes(flag)
      || values.has(flag)
    ) throw new Error(`invalid or duplicate P7 dist argument: ${flag ?? "<missing>"}`);
    values.set(flag, value);
  }
  if (!values.has("--root") || !values.has("--packs")) {
    throw new Error("P7 dist emission requires --root and --packs");
  }
  return {
    repositoryRoot: resolve(values.get("--root")!),
    packIds: parsePackIds(values.get("--packs")!),
  };
}

export async function installCheckedP7bTrainingPackDist(
  repositoryRoot: string,
  packIds: readonly P7TrainingPackId[],
): Promise<void> {
  for (const packId of packIds) {
    await installCheckedP7bTrainingPackDistTransactionally(repositoryRoot, packId);
  }
}

export async function runP7bTrainingPackDistCli(argv: readonly string[]): Promise<void> {
  const parsed = parseArguments(argv);
  await installCheckedP7bTrainingPackDist(parsed.repositoryRoot, parsed.packIds);
}

await runP7TrainingNodeEntrypoint({
  argv: process.argv,
  moduleUrl: import.meta.url,
  dispatch: runP7bTrainingPackDistCli,
});
