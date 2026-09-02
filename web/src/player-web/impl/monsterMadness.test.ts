import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  MONSTER_MADNESS_MONSTER_FAMILIES,
  buildMonsterMadnessFamilyMap,
  remapMonsterMadnessActorId,
  remapMonsterMadnessTileId,
} from "@player-web/impl/monsterMadness";

describe("monsterMadness", () => {
  it("builds a deterministic species-level derangement", () => {
    const mapping = buildMonsterMadnessFamilyMap(1234, false);
    expect([...mapping.keys()]).toEqual(MONSTER_MADNESS_MONSTER_FAMILIES);
    expect(new Set(mapping.values()).size).toBe(MONSTER_MADNESS_MONSTER_FAMILIES.length);
    for (const family of MONSTER_MADNESS_MONSTER_FAMILIES) {
      expect(mapping.get(family)).not.toBe(family);
    }
    expect(buildMonsterMadnessFamilyMap(1234, false)).toEqual(mapping);
  });

  it("preserves direction while swapping complete artwork families", () => {
    const mapping = buildMonsterMadnessFamilyMap(99, false);
    const mappedFamily = remapMonsterMadnessActorId(MS_TILE.Bug, mapping);
    expect(remapMonsterMadnessTileId(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), mapping))
      .toBe(msCreatureTile(mappedFamily, MS_DIRECTION.west));
  });

  it("adds the Player family only when requested", () => {
    expect(buildMonsterMadnessFamilyMap(2, false).has(MS_TILE.Chip)).toBe(false);
    const withPlayer = buildMonsterMadnessFamilyMap(2, true);
    expect(withPlayer.get(MS_TILE.Chip)).not.toBe(MS_TILE.Chip);
    expect(remapMonsterMadnessTileId(msCreatureTile(MS_TILE.Pushing_Chip, MS_DIRECTION.east), withPlayer))
      .toBe(msCreatureTile(withPlayer.get(MS_TILE.Chip)!, MS_DIRECTION.east));
  });
});
