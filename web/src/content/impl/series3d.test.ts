import { describe, expect, it } from "vitest";
import { extractGroupedDatLevels, parseDatFile } from "@content/api/series-file";

function encodePassword(password: string): number[] {
  return Array.from(password, (char) => char.charCodeAt(0) ^ 0x99);
}

function encodeLatin1(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function createLevelData(number: number, name: string, password = "ABCD"): Uint8Array {
  const upperLayer = Uint8Array.from([1]);
  const lowerLayer = Uint8Array.from([]);
  const metadata = Uint8Array.from([
    3,
    name.length,
    ...encodeLatin1(name),
    6,
    password.length,
    ...encodePassword(password),
  ]);

  return Uint8Array.from([
    number,
    0,
    10,
    0,
    0,
    0,
    0,
    0,
    upperLayer.length,
    0,
    ...upperLayer,
    lowerLayer.length,
    0,
    ...lowerLayer,
    metadata.length,
    0,
    ...metadata,
  ]);
}

function createDatFile(levels: Uint8Array[]): Uint8Array {
  const bytes = [0xac, 0xaa, 0x02, 0x00, levels.length, 0x00];
  for (const level of levels) {
    bytes.push(level.length & 0xff, (level.length >> 8) & 0xff, ...level);
  }
  return Uint8Array.from(bytes);
}

describe("3D DAT grouping", () => {
  it("groups contiguous title runs ending in \\1, \\2, \\3 into one logical level", () => {
    const dat = createDatFile([
      createLevelData(1, "Stacked\\1"),
      createLevelData(2, "Stacked\\2"),
      createLevelData(3, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(2);
    expect(parsed.levels.map((level) => level.number)).toEqual([1, 3]);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Stacked", "Solo"]);
    expect(grouped.levels).toHaveLength(2);
    expect(grouped.levels[0]?.number).toBe(1);
    expect(grouped.levels[0]?.layerNumbers).toEqual([1, 2]);
    expect(grouped.levels[0]?.layerData).toHaveLength(2);
    expect(grouped.levels[1]?.number).toBe(3);
    expect(grouped.levels[1]?.layerNumbers).toEqual([3]);
  });

  it("also groups contiguous title runs ending in decreasing order down to \\1", () => {
    const dat = createDatFile([
      createLevelData(1, "Descending\\3", "AAAA"),
      createLevelData(2, "Descending\\2", "BBBB"),
      createLevelData(3, "Descending\\1", "WXYZ"),
      createLevelData(4, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(2);
    expect(parsed.levels.map((level) => level.number)).toEqual([3, 4]);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Descending", "Solo"]);
    expect(parsed.levels[0]?.password).toBe("WXYZ");
    expect(grouped.levels).toHaveLength(2);
    expect(grouped.levels[0]?.number).toBe(3);
    expect(grouped.levels[0]?.levelData).toEqual(createLevelData(3, "Descending\\1", "WXYZ"));
    expect(grouped.levels[0]?.layerNumbers).toEqual([3, 2, 1]);
    expect(grouped.levels[0]?.layerData).toHaveLength(3);
    expect(grouped.levels[1]?.layerNumbers).toEqual([4]);
  });

  it("does not skip levels when a decreasing run stops before reaching \\1", () => {
    const dat = createDatFile([
      createLevelData(1, "Partial\\3"),
      createLevelData(2, "Partial\\2"),
      createLevelData(3, "Solo"),
    ]);

    const parsed = parseDatFile(dat, { ruleset: "MS" });
    const grouped = extractGroupedDatLevels(dat);

    expect(parsed.levelCount).toBe(3);
    expect(parsed.levels.map((level) => level.name)).toEqual(["Partial\\3", "Partial\\2", "Solo"]);
    expect(grouped.levels.map((level) => level.layerNumbers)).toEqual([[1], [2], [3]]);
  });
});
