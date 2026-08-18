import type { CorpusPackSpec, CorpusTargetSourceSpec } from "./types";

export const CCSOLVER_CORPUS_SOURCE_REVISION = "42c78d0db343621f887fefce581315479d9a8be3";

const VOTING_PACK_NAMES = [
  "Acrylic",
  "Broadcast",
  "Chocolate",
  "Darkness",
  "Eagle",
  "Fertilizer",
  "Gobbledygook",
  "Halo",
  "Immunity",
  "Initiative",
  "Jellyfish",
  "Juicy",
  "Krypton",
  "Llama",
  "Mobius",
  "Nature",
  "Nonsense",
  "Oxford",
  "Plastic",
  "Qualification",
  "Raspberry",
  "Razor",
  "Spatula",
  "Supermarket",
  "Tangent",
  "Technetium",
  "Tuxedo",
  "Uniform",
  "Universal",
  "Vanadium",
  "Wilderness",
  "Xiphioid",
  "Yogurt",
  "Zipline",
] as const;

function target(
  targetName: CorpusTargetSourceSpec["target"],
  seriesConfigPath: string | null,
  donorPath: string | null,
  donorSetName: string | null,
): CorpusTargetSourceSpec {
  return { target: targetName, seriesConfigPath, donorPath, donorSetName };
}

function officialPack(number: 1 | 2 | 3 | 4 | 5): CorpusPackSpec {
  const name = `CCLP${number}`;
  const msConfig = number === 2 ? `sets/${name}.dac` : `sets/${name}-MS.dac`;
  const msDonor = `save/${name}.dac.tws`;
  return {
    packId: name.toLowerCase(),
    displayName: name,
    mapPath: `data/${name}.dat`,
    targets: [
      target("ms", msConfig, msDonor, `public_${name}.dac`),
      number === 2
        ? target("lynx", null, null, null)
        : target(
            "lynx",
            `sets/${name}-Lynx.dac`,
            `save/${name}-lynx.dac.tws`,
            `public_${name}-lynx.dac`,
          ),
    ],
  };
}

function votingPack(name: (typeof VOTING_PACK_NAMES)[number]): CorpusPackSpec {
  const stem = `CCLP5Voting-${name}`;
  return {
    packId: `cclp5-voting-${name.toLowerCase()}`,
    displayName: `CCLP5 Voting — ${name}`,
    mapPath: `data/${stem}.dat`,
    targets: [
      target("ms", `sets/${stem}-MS.dac`, `save/${stem}-MS.tws`, null),
      target("lynx", `sets/${stem}-Lynx.dac`, `save/${stem}-Lynx.tws`, null),
    ],
  };
}

export const CORPUS_PACK_REGISTRY: readonly CorpusPackSpec[] = [
  officialPack(1),
  officialPack(2),
  officialPack(3),
  officialPack(4),
  officialPack(5),
  ...VOTING_PACK_NAMES.map(votingPack),
];

export function isSafeRepositoryRelativePath(path: string): boolean {
  if (!/^[A-Za-z0-9._/-]+$/.test(path) || path.startsWith("/") || path.includes("\\")) {
    return false;
  }
  const parts = path.split("/");
  return parts.length >= 2 && parts.every((part) => part !== "" && part !== "." && part !== "..");
}

export function corpusRegistrySourcePaths(registry: readonly CorpusPackSpec[]): string[] {
  return registry.flatMap((pack) => [
    pack.mapPath,
    ...pack.targets.flatMap((entry) => [entry.seriesConfigPath, entry.donorPath]
      .filter((path): path is string => path !== null)),
  ]);
}
