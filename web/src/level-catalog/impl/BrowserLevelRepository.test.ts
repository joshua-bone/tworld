import { describe, expect, it } from "vitest";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";

function encodePassword(password: string): number[] {
  return Array.from(password, (char) => char.charCodeAt(0) ^ 0x99);
}

function encodeLatin1(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function createLevelData(number: number, name: string, topFileCode = 1, bottomFileCode = 0, password = "ABCD"): Uint8Array {
  const upperLayer = Uint8Array.from([topFileCode]);
  const lowerLayer = Uint8Array.from([bottomFileCode]);
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

describe("BrowserLevelRepository", () => {
  it("imports a local DAT file as playable MS and Lynx catalog entries", async () => {
    const repository = new BrowserLevelRepository();
    const dat = createDatFile([
      createLevelData(1, "Imported Stack\\1", 1, 0),
      createLevelData(2, "Imported Stack\\2", 2, 0),
      createLevelData(3, "Imported Solo", 3, 0),
    ]);

    const entries = repository.importDatBytes("Imported.dat", dat);
    const msEntry = entries.find((entry) => entry.ruleset === "MS");
    const lynxEntry = entries.find((entry) => entry.ruleset === "Lynx");

    expect(entries).toHaveLength(2);
    expect(msEntry?.filebase).toBe("Imported (MS)");
    expect(lynxEntry?.filebase).toBe("Imported (Lynx)");
    expect(msEntry?.levels.map((level) => level.name)).toEqual(["Imported Stack", "Imported Solo"]);
    expect(lynxEntry?.levels.map((level) => level.number)).toEqual([1, 3]);

    const loaded = await repository.loadLevel({
      seriesFile: msEntry!.filebase,
      levelNumber: 1,
      ruleset: "MS",
    });

    expect(loaded.levelData).toEqual(loaded.layerData[0]);
    expect(loaded.layerData).toHaveLength(2);
  });
});
