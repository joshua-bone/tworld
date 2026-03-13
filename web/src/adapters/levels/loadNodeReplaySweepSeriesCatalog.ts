import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CharacterizationFixtureRepository } from "@application/ports/CharacterizationFixtureRepository";
import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import type { SeriesCatalogEntry } from "@domain/series";
import { loadNodeSeriesCatalogEntries } from "@adapters/levels/loadNodeSeriesCatalogEntries";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(currentDir, "../../../../");
const CCLP5_VOTING_PACK_NAMES = [
  "CCLP5Voting-Acrylic",
  "CCLP5Voting-Broadcast",
  "CCLP5Voting-Chocolate",
  "CCLP5Voting-Darkness",
  "CCLP5Voting-Eagle",
  "CCLP5Voting-Fertilizer",
  "CCLP5Voting-Gobbledygook",
  "CCLP5Voting-Halo",
  "CCLP5Voting-Immunity",
  "CCLP5Voting-Initiative",
  "CCLP5Voting-Jellyfish",
  "CCLP5Voting-Juicy",
  "CCLP5Voting-Krypton",
  "CCLP5Voting-Llama",
  "CCLP5Voting-Mobius",
  "CCLP5Voting-Nature",
  "CCLP5Voting-Nonsense",
  "CCLP5Voting-Oxford",
  "CCLP5Voting-Plastic",
  "CCLP5Voting-Qualification",
  "CCLP5Voting-Raspberry",
  "CCLP5Voting-Razor",
  "CCLP5Voting-Spatula",
  "CCLP5Voting-Supermarket",
  "CCLP5Voting-Tangent",
  "CCLP5Voting-Technetium",
  "CCLP5Voting-Tuxedo",
  "CCLP5Voting-Uniform",
  "CCLP5Voting-Universal",
  "CCLP5Voting-Vanadium",
  "CCLP5Voting-Wilderness",
  "CCLP5Voting-Xiphioid",
  "CCLP5Voting-Yogurt",
  "CCLP5Voting-Zipline",
] as const;
const CCLP5_VOTING_PACK_SERIES_FILES = CCLP5_VOTING_PACK_NAMES.flatMap((name) => [`${name}-MS.dac`, `${name}-Lynx.dac`]);

const LOCAL_REPLAY_SWEEP_SERIES_FILES = [
  "public_CHIPS.dac",
  "public_CHIPS-lynx.dac",
  "public_CCZoneTT.dac",
  "public_CCZoneTT-lynx.dac",
  "public_EvanD1.dac",
  "EvanD1.dat-lynx.dac",
  "cc-ms.dac",
  "cc-lynx.dac",
  "cc-fixlynx.dac",
  "intro-ms.dac",
  "intro-lynx.dac",
  "CCLP1-MS.dac",
  "CCLP1-Lynx.dac",
  "CCLP2.dac",
  "CCLP2.dat-lynx.dac",
  "CCLP3-MS.dac",
  "CCLP3-Lynx.dac",
  "CCLP4-MS.dac",
  "CCLP4-Lynx.dac",
  "CCLP5-MS.dac",
  "CCLP5-Lynx.dac",
  "CCLXP2.dat-ms.dac",
  ...CCLP5_VOTING_PACK_SERIES_FILES,
] as const;

export async function loadNodeReplaySweepSeriesCatalog(
  repository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">,
  repoRoot = defaultRepoRoot,
): Promise<SeriesCatalogEntry[]> {
  const supplements = await loadNodeSeriesCatalogEntries([...LOCAL_REPLAY_SWEEP_SERIES_FILES], repoRoot);
  return loadSeriesCatalog(repository, supplements);
}
