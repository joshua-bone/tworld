import type { EngineMapCell } from "@game-core/api/model";
import { MS_FLOOR_STATE, MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_STATUS_FLAG, MS_TICKS_PER_SECOND, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

export interface MsConnection {
  from: number;
  to: number;
  fromZ?: number;
  toZ?: number;
}

export interface MsLayerPosition {
  z: number;
  pos: number;
}

export interface MsLevelLayer {
  z: number;
  cells: EngineMapCell[];
  traps: MsConnection[];
  cloners: MsConnection[];
  creaturePositions: number[];
  hintText: string;
}

export interface MsLevel {
  number: number;
  timeLimitTicks: number;
  chipsNeeded: number;
  hintText: string;
  cells: EngineMapCell[];
  traps: MsConnection[];
  cloners: MsConnection[];
  creaturePositions: number[];
  statusFlags: number;
  layers?: MsLevelLayer[];
}

export interface DecodedMsLevelLayerData {
  z: number;
  number: number;
  timeLimitSeconds: number;
  chipsNeeded: number;
  hintText: string;
  cells: EngineMapCell[];
  traps: MsConnection[];
  cloners: MsConnection[];
  creaturePositions: number[];
  badTiles: boolean;
}

export interface DecodedMsLevelData {
  number: number;
  timeLimitSeconds: number;
  chipsNeeded: number;
  hintText: string;
  cells: EngineMapCell[];
  traps: MsConnection[];
  cloners: MsConnection[];
  creaturePositions: number[];
  badTiles: boolean;
  layers?: DecodedMsLevelLayerData[];
}

function decodeLatin1(data: Uint8Array): string {
  return Array.from(data, (value) => String.fromCharCode(value)).join("").replace(/\0+$/g, "");
}

function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error("unexpected end of level data");
  }

  return data[offset]! | (data[offset + 1]! << 8);
}

function readPos(data: Uint8Array, xOffset: number, yOffset: number): number {
  const x = data[xOffset] ?? MS_GRID_WIDTH;
  const y = data[yOffset] ?? MS_GRID_HEIGHT;
  return x < MS_GRID_WIDTH ? x + MS_GRID_HEIGHT * y : MS_GRID_WIDTH * MS_GRID_HEIGHT;
}

function createEmptyCells(z = 1): EngineMapCell[] {
  return Array.from({ length: MS_GRID_WIDTH * MS_GRID_HEIGHT }, (_, pos) => ({
    position: {
      x: pos % MS_GRID_WIDTH,
      y: Math.floor(pos / MS_GRID_WIDTH),
      z,
      pos,
    },
    top: { id: 0, state: 0 },
    bottom: { id: 0, state: 0 },
  }));
}

const FILE_IDS = [
  MS_TILE.Empty,
  MS_TILE.Wall,
  MS_TILE.ICChip,
  MS_TILE.Water,
  MS_TILE.Fire,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Wall_North,
  MS_TILE.Wall_West,
  MS_TILE.Wall_South,
  MS_TILE.Wall_East,
  MS_TILE.Block_Static,
  MS_TILE.Dirt,
  MS_TILE.Ice,
  MS_TILE.Slide_South,
  msCreatureTile(MS_TILE.Block, 1),
  msCreatureTile(MS_TILE.Block, 2),
  msCreatureTile(MS_TILE.Block, 4),
  msCreatureTile(MS_TILE.Block, 8),
  MS_TILE.Slide_North,
  MS_TILE.Slide_East,
  MS_TILE.Slide_West,
  MS_TILE.Exit,
  MS_TILE.Door_Blue,
  MS_TILE.Door_Red,
  MS_TILE.Door_Green,
  MS_TILE.Door_Yellow,
  MS_TILE.IceWall_Southeast,
  MS_TILE.IceWall_Southwest,
  MS_TILE.IceWall_Northwest,
  MS_TILE.IceWall_Northeast,
  MS_TILE.BlueWall_Fake,
  MS_TILE.BlueWall_Real,
  MS_TILE.Overlay_Buffer,
  MS_TILE.Burglar,
  MS_TILE.Socket,
  MS_TILE.Button_Green,
  MS_TILE.Button_Red,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.SwitchWall_Open,
  MS_TILE.Button_Brown,
  MS_TILE.Button_Blue,
  MS_TILE.Teleport,
  MS_TILE.Bomb,
  MS_TILE.Beartrap,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.Gravel,
  MS_TILE.PopupWall,
  MS_TILE.HintButton,
  MS_TILE.Wall_Southeast,
  MS_TILE.CloneMachine,
  MS_TILE.Slide_Random,
  MS_TILE.Drowned_Chip,
  MS_TILE.Burned_Chip,
  MS_TILE.Bombed_Chip,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Exited_Chip,
  MS_TILE.Exit_Extra_1,
  MS_TILE.Exit_Extra_2,
  msCreatureTile(MS_TILE.Swimming_Chip, 1),
  msCreatureTile(MS_TILE.Swimming_Chip, 2),
  msCreatureTile(MS_TILE.Swimming_Chip, 4),
  msCreatureTile(MS_TILE.Swimming_Chip, 8),
  msCreatureTile(MS_TILE.Bug, 1),
  msCreatureTile(MS_TILE.Bug, 2),
  msCreatureTile(MS_TILE.Bug, 4),
  msCreatureTile(MS_TILE.Bug, 8),
  msCreatureTile(MS_TILE.Fireball, 1),
  msCreatureTile(MS_TILE.Fireball, 2),
  msCreatureTile(MS_TILE.Fireball, 4),
  msCreatureTile(MS_TILE.Fireball, 8),
  msCreatureTile(MS_TILE.Ball, 1),
  msCreatureTile(MS_TILE.Ball, 2),
  msCreatureTile(MS_TILE.Ball, 4),
  msCreatureTile(MS_TILE.Ball, 8),
  msCreatureTile(MS_TILE.Tank, 1),
  msCreatureTile(MS_TILE.Tank, 2),
  msCreatureTile(MS_TILE.Tank, 4),
  msCreatureTile(MS_TILE.Tank, 8),
  msCreatureTile(MS_TILE.Glider, 1),
  msCreatureTile(MS_TILE.Glider, 2),
  msCreatureTile(MS_TILE.Glider, 4),
  msCreatureTile(MS_TILE.Glider, 8),
  msCreatureTile(MS_TILE.Teeth, 1),
  msCreatureTile(MS_TILE.Teeth, 2),
  msCreatureTile(MS_TILE.Teeth, 4),
  msCreatureTile(MS_TILE.Teeth, 8),
  msCreatureTile(MS_TILE.Walker, 1),
  msCreatureTile(MS_TILE.Walker, 2),
  msCreatureTile(MS_TILE.Walker, 4),
  msCreatureTile(MS_TILE.Walker, 8),
  msCreatureTile(MS_TILE.Blob, 1),
  msCreatureTile(MS_TILE.Blob, 2),
  msCreatureTile(MS_TILE.Blob, 4),
  msCreatureTile(MS_TILE.Blob, 8),
  msCreatureTile(MS_TILE.Paramecium, 1),
  msCreatureTile(MS_TILE.Paramecium, 2),
  msCreatureTile(MS_TILE.Paramecium, 4),
  msCreatureTile(MS_TILE.Paramecium, 8),
  MS_TILE.Key_Blue,
  MS_TILE.Key_Red,
  MS_TILE.Key_Green,
  MS_TILE.Key_Yellow,
  MS_TILE.Boots_Water,
  MS_TILE.Boots_Fire,
  MS_TILE.Boots_Ice,
  MS_TILE.Boots_Slide,
  msCreatureTile(MS_TILE.Chip, 1),
  msCreatureTile(MS_TILE.Chip, 2),
  msCreatureTile(MS_TILE.Chip, 4),
  msCreatureTile(MS_TILE.Chip, 8),
] as const;

function remapThreeDimensionalTileId(tileId: number, z: number, hasHigherLayers: boolean): number {
  if (z > 1 && tileId === MS_TILE.Overlay_Buffer) {
    return MS_TILE.Air;
  }

  if (hasHigherLayers && tileId === MS_TILE.Exited_Chip) {
    return MS_TILE.Elevator;
  }

  return tileId;
}

function decodeLayer(
  target: EngineMapCell[],
  data: Uint8Array,
  startOffset: number,
  size: number,
  key: "top" | "bottom",
  z: number,
  hasHigherLayers: boolean,
): {
  nextOffset: number;
  badTiles: boolean;
} {
  let offset = startOffset;
  let pos = 0;
  let badTiles = false;

  while (offset < startOffset + size && pos < target.length) {
    let count = 1;
    let fileId = data[offset] ?? 0;
    offset += 1;

    if (fileId === 0xff) {
      count = data[offset] ?? 0;
      fileId = data[offset + 1] ?? 0;
      offset += 2;
    }

    const tileId = FILE_IDS[fileId];
    const resolvedId = remapThreeDimensionalTileId(tileId ?? MS_TILE.Wall, z, hasHigherLayers);
    if (tileId === undefined) {
      badTiles = true;
    }

    while (count > 0 && pos < target.length) {
      target[pos]![key] = { id: resolvedId, state: 0 };
      pos += 1;
      count -= 1;
    }
  }

  return {
    nextOffset: startOffset + size,
    badTiles,
  };
}

function decodeMsSingleLevelData(levelData: Uint8Array, z: number, hasHigherLayers: boolean): DecodedMsLevelLayerData {
  if (levelData.length < 10) {
    throw new Error("invalid level data");
  }

  const number = readUint16(levelData, 0);
  let timeLimitSeconds = readUint16(levelData, 2);
  let chipsNeeded = readUint16(levelData, 4);
  const cells = createEmptyCells(z);
  const traps: MsConnection[] = [];
  const cloners: MsConnection[] = [];
  const creaturePositions: number[] = [];
  let hintText = "";

  let offset = 10;

  const upperSize = readUint16(levelData, 8);
  const upperResult = decodeLayer(cells, levelData, offset, upperSize, "top", z, hasHigherLayers);
  offset = upperResult.nextOffset;

  const lowerSize = readUint16(levelData, offset);
  offset += 2;
  const lowerResult = decodeLayer(cells, levelData, offset, lowerSize, "bottom", z, hasHigherLayers);
  offset = lowerResult.nextOffset;

  const metadataSize = readUint16(levelData, offset);
  offset += 2;
  const metadataEnd = Math.min(offset + metadataSize, levelData.length);

  while (offset + 2 <= metadataEnd) {
    const fieldId = levelData[offset] ?? 0;
    const fieldSize = Math.min(levelData[offset + 1] ?? 0, metadataEnd - offset - 2);
    const fieldOffset = offset + 2;

    switch (fieldId) {
      case 1:
        if (fieldSize >= 2) {
          timeLimitSeconds = readUint16(levelData, fieldOffset);
        }
        break;
      case 2:
        if (fieldSize >= 2) {
          chipsNeeded = readUint16(levelData, fieldOffset);
        }
        break;
      case 4:
        for (let connectionOffset = 0; connectionOffset + 9 < fieldSize; connectionOffset += 10) {
          traps.push({
            from: readPos(levelData, fieldOffset + connectionOffset, fieldOffset + connectionOffset + 2),
            to: readPos(levelData, fieldOffset + connectionOffset + 4, fieldOffset + connectionOffset + 6),
            fromZ: z,
            toZ: z,
          });
        }
        break;
      case 5:
        for (let connectionOffset = 0; connectionOffset + 7 < fieldSize; connectionOffset += 8) {
          cloners.push({
            from: readPos(levelData, fieldOffset + connectionOffset, fieldOffset + connectionOffset + 2),
            to: readPos(levelData, fieldOffset + connectionOffset + 4, fieldOffset + connectionOffset + 6),
            fromZ: z,
            toZ: z,
          });
        }
        break;
      case 7:
        hintText = decodeLatin1(levelData.slice(fieldOffset, fieldOffset + fieldSize));
        break;
      case 10:
        for (let creatureOffset = 0; creatureOffset + 1 < fieldSize; creatureOffset += 2) {
          creaturePositions.push(readPos(levelData, fieldOffset + creatureOffset, fieldOffset + creatureOffset + 1));
        }
        break;
      default:
        break;
    }

    offset = fieldOffset + fieldSize;
  }

  return {
    z,
    number,
    timeLimitSeconds,
    chipsNeeded,
    hintText,
    cells,
    traps,
    cloners,
    creaturePositions,
    badTiles: upperResult.badTiles || lowerResult.badTiles,
  };
}

export function decodeMsLevelGroupData(levelDataLayers: readonly Uint8Array[]): DecodedMsLevelData {
  if (levelDataLayers.length === 0) {
    throw new Error("level group must contain at least one layer");
  }

  const hasHigherLayers = levelDataLayers.length > 1;
  const layers = levelDataLayers.map((levelData, index) => decodeMsSingleLevelData(levelData, index + 1, hasHigherLayers));
  const first = layers[0]!;

  return {
    number: first.number,
    timeLimitSeconds: first.timeLimitSeconds,
    chipsNeeded: first.chipsNeeded,
    hintText: first.hintText,
    cells: first.cells,
    traps: first.traps,
    cloners: first.cloners,
    creaturePositions: first.creaturePositions,
    badTiles: layers.some((layer) => layer.badTiles),
    layers,
  };
}

export function decodeMsLevelData(levelData: Uint8Array): DecodedMsLevelData {
  return decodeMsLevelGroupData([levelData]);
}

export function levelLayers(level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "hintText" | "layers">): MsLevelLayer[] {
  return level.layers ?? [
    {
      z: 1,
      cells: level.cells,
      traps: level.traps.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? 1, toZ: connection.toZ ?? 1 })),
      cloners: level.cloners.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? 1, toZ: connection.toZ ?? 1 })),
      creaturePositions: [...level.creaturePositions],
      hintText: level.hintText,
    },
  ];
}

export function collectLevelConnections(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "hintText" | "layers">,
  kind: "traps" | "cloners",
): MsConnection[] {
  return levelLayers(level).flatMap((layer) =>
    layer[kind].map((connection) => ({
      ...connection,
      fromZ: connection.fromZ ?? layer.z,
      toZ: connection.toZ ?? layer.z,
    })),
  );
}

export function collectLevelCreaturePositions(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "hintText" | "layers">,
): MsLayerPosition[] {
  return levelLayers(level).flatMap((layer) =>
    layer.creaturePositions.map((pos) => ({
      z: layer.z,
      pos,
    })),
  );
}

export function prepareMsLevel(decoded: DecodedMsLevelData): MsLevel {
  const layers: MsLevelLayer[] = (decoded.layers ?? []).map((layer) => ({
    z: layer.z,
    cells: layer.cells,
    traps: layer.traps.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? layer.z, toZ: connection.toZ ?? layer.z })),
    cloners: layer.cloners.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? layer.z, toZ: connection.toZ ?? layer.z })),
    creaturePositions: layer.creaturePositions,
    hintText: layer.hintText,
  }));

  return {
    number: decoded.number,
    timeLimitTicks: decoded.timeLimitSeconds * MS_TICKS_PER_SECOND,
    chipsNeeded: decoded.chipsNeeded,
    hintText: decoded.hintText,
    cells: layers[0]?.cells ?? decoded.cells,
    traps: layers[0]?.traps ?? decoded.traps,
    cloners: layers[0]?.cloners ?? decoded.cloners,
    creaturePositions: layers[0]?.creaturePositions ?? decoded.creaturePositions,
    statusFlags: decoded.badTiles ? MS_STATUS_FLAG.BadTiles : 0,
    layers,
  };
}
