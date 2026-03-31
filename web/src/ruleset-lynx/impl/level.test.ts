import { describe, expect, it } from "vitest";
import { prepareLynxLevel } from "@ruleset-lynx/api/level";
import { decodeLoadedLynxLevelData } from "@ruleset-lynx/api/levelLoader";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import { collectLevelCreaturePositions, collectLevelPetCarrierOccupants, type DecodedMsLevelData } from "@ruleset-ms/api/level";
import { createMsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { MS_DIRECTION, MS_STATUS_FLAG, MS_TILE, MS_TICKS_PER_SECOND, msCreatureTile } from "@ruleset-ms/api/tiles";

function createSingleTopTileLevelData(fileCode: number, levelNumber = 7): Uint8Array {
  return Uint8Array.from([
    levelNumber, 0,
    12, 0,
    0, 0,
    0, 0,
    1, 0,
    fileCode,
    0, 0,
    0, 0,
  ]);
}

function createDecodedLevelWithSpecialTiles(): DecodedMsLevelData {
  return {
    number: 11,
    timeLimitSeconds: 20,
    chipsNeeded: 0,
    hintText: "",
    cells: [
      {
        position: { x: 0, y: 0, z: 1, pos: 0 },
        top: { id: MS_TILE.Drowned_Chip, state: 0 },
        bottom: { id: MS_TILE.Bombed_Chip, state: 0 },
      },
      {
        position: { x: 1, y: 0, z: 1, pos: 1 },
        top: { id: MS_TILE.Exited_Chip, state: 0 },
        bottom: { id: MS_TILE.Exit_Extra_1, state: 0 },
      },
    ],
    traps: [],
    cloners: [],
    creaturePositions: [],
    badTiles: true,
    layers: [
      {
        z: 1,
        number: 11,
        timeLimitSeconds: 20,
        chipsNeeded: 0,
        hintText: "",
        cells: [
          {
            position: { x: 0, y: 0, z: 1, pos: 0 },
            top: { id: MS_TILE.Drowned_Chip, state: 0 },
            bottom: { id: MS_TILE.Bombed_Chip, state: 0 },
          },
          {
            position: { x: 1, y: 0, z: 1, pos: 1 },
            top: { id: MS_TILE.Exited_Chip, state: 0 },
            bottom: { id: MS_TILE.Exit_Extra_1, state: 0 },
          },
        ],
        traps: [],
        cloners: [],
        creaturePositions: [],
        badTiles: true,
      },
    ],
  };
}

function createCell(topId: number, bottomId: number, z = 1, pos = 0) {
  return {
    position: { x: pos % 32, y: Math.floor(pos / 32), z, pos },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

describe("lynx level preparation", () => {
  it("normalizes Lynx special tiles during preparation", () => {
    const prepared = prepareLynxLevel(createDecodedLevelWithSpecialTiles());

    expect(prepared.timeLimitTicks).toBe(20 * MS_TICKS_PER_SECOND);
    expect(prepared.statusFlags).toBe(MS_STATUS_FLAG.BadTiles);
    expect(prepared.cells[0]?.top.id).toBe(MS_TILE.Wall);
    expect(prepared.cells[0]?.bottom.id).toBe(MS_TILE.Wall);
    expect(prepared.cells[1]?.top.id).toBe(MS_TILE.Exited_Chip);
    expect(prepared.cells[1]?.bottom.id).toBe(MS_TILE.Wall);
    expect(prepared.layers?.[0]?.cells[0]?.position.z).toBe(1);
  });

  it("preserves air on upper layers during Lynx preparation", () => {
    const prepared = prepareLynxLevel({
      number: 12,
      timeLimitSeconds: 20,
      chipsNeeded: 0,
      hintText: "",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 12,
          timeLimitSeconds: 20,
          chipsNeeded: 0,
          hintText: "",
          cells: [
            {
              position: { x: 0, y: 0, z: 1, pos: 0 },
              top: { id: MS_TILE.Overlay_Buffer, state: 0 },
              bottom: { id: MS_TILE.Empty, state: 0 },
            },
          ],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
        {
          z: 2,
          number: 13,
          timeLimitSeconds: 20,
          chipsNeeded: 0,
          hintText: "",
          cells: [
            {
              position: { x: 0, y: 0, z: 2, pos: 0 },
              top: { id: MS_TILE.Air, state: 0 },
              bottom: { id: MS_TILE.Empty, state: 0 },
            },
          ],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
      ],
    });

    expect(prepared.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Wall);
    expect(prepared.layers?.[1]?.cells[0]?.top.id).toBe(MS_TILE.Air);
  });

  it("preserves elevator tiles during Lynx preparation", () => {
    const prepared = prepareLynxLevel({
      number: 13,
      timeLimitSeconds: 20,
      chipsNeeded: 0,
      hintText: "",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 13,
          timeLimitSeconds: 20,
          chipsNeeded: 0,
          hintText: "",
          cells: [
            {
              position: { x: 0, y: 0, z: 1, pos: 0 },
              top: { id: MS_TILE.Elevator, state: 0 },
              bottom: { id: MS_TILE.Empty, state: 0 },
            },
          ],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
      ],
    });

    expect(prepared.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Elevator);
  });

  it("decodes loaded Lynx levels through the shared decode registration seam", () => {
    const levelData = createSingleTopTileLevelData(1, 11);
    const decoded = decodeLoadedLynxLevelData(
      {
        levelData,
        layerData: [levelData],
      },
      createMsLevelDecodeRegistration([{ fileCode: 1, tileId: MS_TILE.Fire }]),
    );

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.Fire);
  });

  it("decodes built-in DAT file code 0x71 as a still bowling ball in loaded Lynx levels", () => {
    const levelData = createSingleTopTileLevelData(0x71, 11);
    const decoded = decodeLoadedLynxLevelData({
      levelData,
      layerData: [levelData],
    }, lynxElementFamilyRegistration.levelDecodeRegistration);

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.BowlingBall_Still);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x72 as cloud on higher layers and floor on z1 in loaded Lynx levels", () => {
    const levelData = createSingleTopTileLevelData(0x72, 11);
    const single = decodeLoadedLynxLevelData({
      levelData,
      layerData: [levelData],
    }, lynxElementFamilyRegistration.levelDecodeRegistration);
    const grouped = decodeLoadedLynxLevelData({
      levelData,
      layerData: [levelData, createSingleTopTileLevelData(0x72, 12)],
    }, lynxElementFamilyRegistration.levelDecodeRegistration);

    expect(single.cells[0]?.top.id).toBe(MS_TILE.Empty);
    expect(grouped.layers?.[0]?.cells[0]?.top.id).toBe(MS_TILE.Empty);
    expect(grouped.layers?.[1]?.cells[0]?.top.id).toBe(MS_TILE.Cloud);
    expect(grouped.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x74 as an ice block in loaded Lynx levels", () => {
    const levelData = createSingleTopTileLevelData(0x74, 11);
    const decoded = decodeLoadedLynxLevelData(
      {
        levelData,
        layerData: [levelData],
      },
      lynxElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.IceBlock_Static);
    expect(decoded.badTiles).toBe(false);
  });

  it("decodes built-in DAT file code 0x75 as pet carrier in loaded Lynx levels", () => {
    const levelData = createSingleTopTileLevelData(0x75, 11);
    const decoded = decodeLoadedLynxLevelData(
      {
        levelData,
        layerData: [levelData],
      },
      lynxElementFamilyRegistration.levelDecodeRegistration,
    );

    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.PetCarrier);
    expect(decoded.badTiles).toBe(false);
  });

  it("prepares loaded Lynx levels through the ruleset-local load registration seam", () => {
    const levelData = createSingleTopTileLevelData(51, 11);
    const prepared = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
      levelData,
      layerData: [levelData],
    });

    expect(prepared.cells[0]?.top.id).toBe(MS_TILE.Wall);
  });

  it("loads an occupied pet carrier from a lower monster tile in Lynx", () => {
    const prepared = prepareLynxLevel({
      number: 13,
      timeLimitSeconds: 20,
      chipsNeeded: 0,
      hintText: "",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [0],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 13,
          timeLimitSeconds: 20,
          chipsNeeded: 0,
          hintText: "",
          cells: [createCell(MS_TILE.PetCarrier, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.east))],
          traps: [],
          cloners: [],
          creaturePositions: [0],
          badTiles: false,
        },
      ],
    });

    expect(prepared.cells[0]?.bottom.id).toBe(MS_TILE.Empty);
    expect(collectLevelCreaturePositions(prepared)).toEqual([]);
    expect(collectLevelPetCarrierOccupants(prepared)).toEqual([
      {
        z: 1,
        pos: 0,
        occupant: {
          actorId: MS_TILE.Bug,
          dir: MS_DIRECTION.east,
        },
      },
    ]);
  });

  it("leaves a Lynx pet carrier empty when the lower tile is a special item", () => {
    const prepared = prepareLynxLevel({
      number: 13,
      timeLimitSeconds: 20,
      chipsNeeded: 0,
      hintText: "",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [],
      badTiles: false,
      layers: [
        {
          z: 1,
          number: 13,
          timeLimitSeconds: 20,
          chipsNeeded: 0,
          hintText: "",
          cells: [createCell(MS_TILE.PetCarrier, MS_TILE.Sandbag)],
          traps: [],
          cloners: [],
          creaturePositions: [],
          badTiles: false,
        },
      ],
    });

    expect(prepared.cells[0]?.bottom.id).toBe(MS_TILE.Empty);
    expect(collectLevelPetCarrierOccupants(prepared)).toEqual([]);
  });
});
