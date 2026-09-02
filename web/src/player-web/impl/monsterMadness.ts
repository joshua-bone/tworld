import {
  MS_TILE,
  isMsCreature,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";

export const MONSTER_MADNESS_MONSTER_FAMILIES = [
  MS_TILE.Tank,
  MS_TILE.Ball,
  MS_TILE.Glider,
  MS_TILE.Fireball,
  MS_TILE.Walker,
  MS_TILE.Blob,
  MS_TILE.Teeth,
  MS_TILE.Bug,
  MS_TILE.Paramecium,
] as const;

function nextRandomState(value: number): number {
  let state = value | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

export function buildMonsterMadnessFamilyMap(
  seed: number,
  includePlayer: boolean,
): ReadonlyMap<number, number> {
  const sources = includePlayer
    ? [MS_TILE.Chip, ...MONSTER_MADNESS_MONSTER_FAMILIES]
    : [...MONSTER_MADNESS_MONSTER_FAMILIES];
  const targets = [...sources];
  let state = (seed ^ 0xa5_a5_a5_a5) >>> 0;

  // Sattolo's algorithm creates one cycle, guaranteeing a derangement.
  for (let index = targets.length - 1; index > 0; index -= 1) {
    state = nextRandomState(state || 0x6d_2b_79_f5);
    const swapIndex = state % index;
    [targets[index], targets[swapIndex]] = [targets[swapIndex]!, targets[index]!];
  }

  return new Map(sources.map((source, index) => [source, targets[index]!] as const));
}

function normalizedPlayerFamily(baseId: number): number {
  return baseId === MS_TILE.Pushing_Chip || baseId === MS_TILE.Swimming_Chip
    ? MS_TILE.Chip
    : baseId;
}

export function remapMonsterMadnessActorId(
  actorId: number,
  familyMap: ReadonlyMap<number, number>,
): number {
  const baseId = isMsCreature(actorId) ? msCreatureId(actorId) : actorId;
  return familyMap.get(normalizedPlayerFamily(baseId)) ?? actorId;
}

export function remapMonsterMadnessTileId(
  tileId: number,
  familyMap: ReadonlyMap<number, number>,
): number {
  if (!isMsCreature(tileId)) {
    return tileId;
  }
  const replacement = familyMap.get(normalizedPlayerFamily(msCreatureId(tileId)));
  return replacement === undefined ? tileId : msCreatureTile(replacement, msCreatureDir(tileId));
}

export function isMonsterMadnessMonsterActorId(actorId: number): boolean {
  const baseId = isMsCreature(actorId) ? msCreatureId(actorId) : actorId;
  return MONSTER_MADNESS_MONSTER_FAMILIES.includes(baseId as typeof MONSTER_MADNESS_MONSTER_FAMILIES[number]);
}
