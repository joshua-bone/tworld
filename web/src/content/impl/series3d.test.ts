import { describe, expect, it } from "vitest";
import { extractGroupedDatLevels, extractIndexedGroupedDatLevel, indexGroupedDatLevels, parseDatFile } from "@content/api/series-file";
import {
  buildSyntheticMsDatFile,
  buildSyntheticMsDatLevel,
} from "@content/impl/contentTestSupport";

describe("3D DAT grouping", () => {
  it("groups contiguous title runs ending in \\1, \\2, \\3 into one logical level", () => {
    const dat = buildSyntheticMsDatFile([
      buildSyntheticMsDatLevel(1, "Stacked\\1"),
      buildSyntheticMsDatLevel(2, "Stacked\\2"),
      buildSyntheticMsDatLevel(3, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(2);
    expect(parsed.levels.map((level) => level.number)).toEqual([1, 2]);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Stacked", "Solo"]);
    expect(grouped.levels).toHaveLength(2);
    expect(grouped.levels[0]?.number).toBe(1);
    expect(grouped.levels[0]?.layerNumbers).toEqual([1, 2]);
    expect(grouped.levels[0]?.layerData).toHaveLength(2);
    expect(grouped.levels[1]?.number).toBe(2);
    expect(grouped.levels[1]?.layerNumbers).toEqual([3]);
  });

  it("also groups contiguous title runs ending in decreasing order down to \\1", () => {
    const dat = buildSyntheticMsDatFile([
      buildSyntheticMsDatLevel(1, "Descending\\3", "AAAA"),
      buildSyntheticMsDatLevel(2, "Descending\\2", "BBBB"),
      buildSyntheticMsDatLevel(3, "Descending\\1", "WXYZ"),
      buildSyntheticMsDatLevel(4, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(2);
    expect(parsed.levels.map((level) => level.number)).toEqual([1, 2]);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Descending", "Solo"]);
    expect(parsed.levels[0]?.password).toBe("WXYZ");
    expect(grouped.levels).toHaveLength(2);
    expect(grouped.levels[0]?.number).toBe(1);
    expect(grouped.levels[0]?.levelData).toEqual(buildSyntheticMsDatLevel(3, "Descending\\1", "WXYZ"));
    expect(grouped.levels[0]?.layerNumbers).toEqual([3, 2, 1]);
    expect(grouped.levels[0]?.layerData).toHaveLength(3);
    expect(grouped.levels[1]?.number).toBe(2);
    expect(grouped.levels[1]?.layerNumbers).toEqual([4]);
  });

  it("does not skip levels when a decreasing run stops before reaching \\1", () => {
    const dat = buildSyntheticMsDatFile([
      buildSyntheticMsDatLevel(1, "Partial\\3"),
      buildSyntheticMsDatLevel(2, "Partial\\2"),
      buildSyntheticMsDatLevel(3, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(3);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Partial\\3", "Partial\\2", "Solo"]);
    expect(grouped.levels.map((level) => level.layerNumbers)).toEqual([[1], [2], [3]]);
  });

  it("marks grouped levels when any constituent DAT layer contains a special-tool byte", () => {
    const dat = buildSyntheticMsDatFile([
      buildSyntheticMsDatLevel(1, "Stacked\\1"),
      buildSyntheticMsDatLevel(2, "Stacked\\2", "ABCD", Uint8Array.from([0x70])),
      buildSyntheticMsDatLevel(3, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });

    expect(parsed.levels[0]?.hasSpecialTools).toBe(true);
    expect(parsed.levels[1]?.hasSpecialTools).toBe(false);
  });

  it("can reconstruct grouped levels from a lightweight DAT index", () => {
    const dat = buildSyntheticMsDatFile([
      buildSyntheticMsDatLevel(1, "Stacked\\1", "ABCD"),
      buildSyntheticMsDatLevel(2, "Stacked\\2", "EFGH"),
      buildSyntheticMsDatLevel(3, "Descending\\3", "IJKL"),
      buildSyntheticMsDatLevel(4, "Descending\\2", "MNOP"),
      buildSyntheticMsDatLevel(5, "Descending\\1", "QRST"),
      buildSyntheticMsDatLevel(6, "Solo", "UVWX"),
    ]);

    const grouped = extractGroupedDatLevels(dat);
    const indexed = indexGroupedDatLevels(dat);

    expect(indexed.levels.map((level) => level.number)).toEqual([1, 2, 3]);
    expect(indexed.levels.map((level) => level.layers.map((layer) => layer.number))).toEqual([
      [1, 2],
      [5, 4, 3],
      [6],
    ]);

    expect(indexed.levels.map((level) => extractIndexedGroupedDatLevel(dat, level))).toEqual(grouped.levels);
  });
});
