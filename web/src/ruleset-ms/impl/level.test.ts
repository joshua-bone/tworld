import { describe, expect, it } from "vitest";
import {
  collectLevelConnections,
  collectLevelCreaturePositions,
  decodeMsLevelData,
  decodeMsLevelGroupData,
  levelHintTextAtZ,
  prepareMsLevel,
} from "@ruleset-ms/api/level";
import { createMsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { MS_STATUS_FLAG, MS_TICKS_PER_SECOND, MS_TILE } from "@ruleset-ms/api/tiles";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";

function createMinimalLevelData(levelNumber = 7): Uint8Array {
  return Uint8Array.from([
    levelNumber, 0,
    12, 0,
    3, 0,
    0, 0,
    1, 0,
    1,
    0, 0,
    0, 0,
  ]);
}

function createSingleTopTileLevelData(fileCode: number, levelNumber = 7): Uint8Array {
  return Uint8Array.from([
    levelNumber, 0,
    12, 0,
    3, 0,
    0, 0,
    1, 0,
    fileCode,
    0, 0,
    0, 0,
  ]);
}

describe("ms level preparation", () => {
  it("decodes DAT bytes into raw level data", () => {
    const decoded = decodeMsLevelData(createMinimalLevelData(), msElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.number).toBe(7);
    expect(decoded.timeLimitSeconds).toBe(12);
    expect(decoded.chipsNeeded).toBe(3);
    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.Wall);
    expect(decoded.cells[1]?.top.id).toBe(0);
    expect(decoded.cells[0]?.position.z).toBe(1);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes grouped level data into z-layered raw level data while keeping layer 1 metadata global", () => {
    const decoded = decodeMsLevelGroupData(
      [createMinimalLevelData(7), createMinimalLevelData(8)],
      undefined,
      msElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(decoded.number).toBe(7);
    expect(decoded.layers).toHaveLength(2);
    expect(decoded.layers?.map((layer) => layer.z)).toEqual([1, 2]);
    expect(decoded.layers?.[0]?.number).toBe(7);
    expect(decoded.layers?.[1]?.number).toBe(8);
    expect(decoded.layers?.[0]?.cells[0]?.position.z).toBe(1);
    expect(decoded.layers?.[1]?.cells[0]?.position.z).toBe(2);
  });

  it("can preserve global metadata from a separate primary level while decoding normalized layer order", () => {
    const decoded = decodeMsLevelGroupData(
      [createMinimalLevelData(7), createMinimalLevelData(8)],
      createMinimalLevelData(42),
      msElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(decoded.number).toBe(42);
    expect(decoded.layers?.map((layer) => layer.number)).toEqual([7, 8]);
  });

  it("remaps DAT file code 32 to air on z>1 only", () => {
    const decoded = decodeMsLevelGroupData(
      [createSingleTopTileLevelData(32, 7), createSingleTopTileLevelData(32, 8)],
      undefined,
      msElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(decoded.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Overlay_Buffer);
    expect(decoded.layers?.[1]?.cells[0]?.top.id).toBe(MS_TILE.Air);
  });

  it("remaps DAT file code 57 to elevator only when the grouped level has higher layers", () => {
    const grouped = decodeMsLevelGroupData(
      [createSingleTopTileLevelData(57, 7), createSingleTopTileLevelData(57, 8)],
      undefined,
      msElementFamilyRegistration.levelDecodeRegistration,
    );
    const single = decodeMsLevelData(createSingleTopTileLevelData(57, 7), msElementFamilyRegistration.levelDecodeRegistration);

    expect(grouped.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Elevator);
    expect(grouped.layers?.[1]?.cells[0]?.top.id).toBe(MS_TILE.Elevator);
    expect(single.cells[0]?.top.id).toBe(MS_TILE.Exited_Chip);
  });

  it("routes DAT decoding through the decode registration seam", () => {
    const decoded = decodeMsLevelGroupData(
      [createSingleTopTileLevelData(1, 7)],
      undefined,
      createMsLevelDecodeRegistration([{ fileCode: 1, tileId: MS_TILE.Fire }]),
    );

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.Fire);
  });

  it("decodes built-in DAT file code 0x71 as a still bowling ball", () => {
    const decoded = decodeMsLevelData(createSingleTopTileLevelData(0x71, 7), msElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.BowlingBall_Still);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x72 as cloud on higher layers and floor on z1", () => {
    const single = decodeMsLevelData(createSingleTopTileLevelData(0x72, 7), msElementFamilyRegistration.levelDecodeRegistration);
    const grouped = decodeMsLevelGroupData(
      [createSingleTopTileLevelData(0x72, 7), createSingleTopTileLevelData(0x72, 8)],
      undefined,
      msElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(single.cells[0]?.top.id).toBe(MS_TILE.Empty);
    expect(grouped.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Empty);
    expect(grouped.layers?.[1]?.cells[0]?.top.id).toBe(MS_TILE.Cloud);
    expect(grouped.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x73 as hook", () => {
    const decoded = decodeMsLevelData(createSingleTopTileLevelData(0x73, 7), msElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.Hook);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x74 as an ice block", () => {
    const decoded = decodeMsLevelData(createSingleTopTileLevelData(0x74, 7), msElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.IceBlock_Static);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x75 as pet carrier", () => {
    const decoded = decodeMsLevelData(createSingleTopTileLevelData(0x75, 7), msElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.PetCarrier);
    expect(decoded.badTiles).toBe(false);
  });

  it("prepares loaded MS levels through the ruleset-local load registration seam", () => {
    const levelData = createSingleTopTileLevelData(1, 7);
    const prepared = msElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
      levelData,
      layerData: [levelData],
    });
    const overridden = prepareMsLevel(
      decodeMsLevelGroupData(
        [levelData],
        levelData,
        createMsLevelDecodeRegistration([{ fileCode: 1, tileId: MS_TILE.Fire }]),
      ),
    );

    expect(prepared.cells[0]?.top.id).toBe(MS_TILE.Wall);
    expect(overridden.cells[0]?.top.id).toBe(MS_TILE.Fire);
  });

  it("collects z-aware connection and creature metadata in layer order", () => {
    const prepared = prepareMsLevel({
      number: 9,
      timeLimitSeconds: 15,
      chipsNeeded: 4,
      hintText: "hint-1",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 9,
          timeLimitSeconds: 15,
          chipsNeeded: 4,
          hintText: "hint-1",
          cells: [],
          traps: [{ from: 1, to: 2 }],
          cloners: [{ from: 3, to: 4 }],
          creaturePositions: [12],
          badTiles: false,
        },
        {
          z: 2,
          number: 10,
          timeLimitSeconds: 99,
          chipsNeeded: 0,
          hintText: "hint-2",
          cells: [],
          traps: [{ from: 5, to: 6 }],
          cloners: [{ from: 7, to: 8 }],
          creaturePositions: [20, 21],
          badTiles: false,
        },
      ],
    });

    expect(collectLevelConnections(prepared, "traps")).toEqual([
      { from: 1, to: 2, fromZ: 1, toZ: 1 },
      { from: 5, to: 6, fromZ: 2, toZ: 2 },
    ]);
    expect(collectLevelConnections(prepared, "cloners")).toEqual([
      { from: 3, to: 4, fromZ: 1, toZ: 1 },
      { from: 7, to: 8, fromZ: 2, toZ: 2 },
    ]);
    expect(collectLevelCreaturePositions(prepared)).toEqual([
      { z: 1, pos: 12 },
      { z: 2, pos: 20 },
      { z: 2, pos: 21 },
    ]);
  });

  it("resolves hint text by active z-layer", () => {
    const prepared = prepareMsLevel({
      number: 9,
      timeLimitSeconds: 15,
      chipsNeeded: 4,
      hintText: "hint-1",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 9,
          timeLimitSeconds: 15,
          chipsNeeded: 4,
          hintText: "hint-1",
          cells: [],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
        {
          z: 2,
          number: 10,
          timeLimitSeconds: 15,
          chipsNeeded: 4,
          hintText: "hint-2",
          cells: [],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
      ],
    });

    expect(levelHintTextAtZ(prepared, 1)).toBe("hint-1");
    expect(levelHintTextAtZ(prepared, 2)).toBe("hint-2");
    expect(levelHintTextAtZ(prepared, 3)).toBe("hint-1");
  });

  it("prepares decoded MS level data into runtime ticks and flags", () => {
    const prepared = prepareMsLevel({
      number: 9,
      timeLimitSeconds: 15,
      chipsNeeded: 4,
      hintText: "hint",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [12],
      badTiles: true,
      layers: [
        {
          z: 1,
          number: 9,
          timeLimitSeconds: 15,
          chipsNeeded: 4,
          hintText: "hint",
          cells: [],
          traps: [],
          cloners: [],
          creaturePositions: [12],
          badTiles: true,
        },
      ],
    });

    expect(prepared.timeLimitTicks).toBe(15 * MS_TICKS_PER_SECOND);
    expect(prepared.statusFlags).toBe(MS_STATUS_FLAG.BadTiles);
    expect(prepared.creaturePositions).toEqual([12]);
    expect(prepared.hintText).toBe("hint");
    expect(prepared.layers).toHaveLength(1);
    expect(prepared.layers?.[0]?.z).toBe(1);
  });
});
