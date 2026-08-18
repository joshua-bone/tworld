import type { EngineMapCell } from "@game-core/api/model";
import { createPetCarrierMobSnapshot, type PetCarrierMobSnapshot } from "@game-core/impl/petCarrier";
import { type MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import {
  MS_DIRECTION,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_STATUS_FLAG,
  MS_TICKS_PER_SECOND,
  MS_TILE,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureDir,
  msCreatureId,
  msStaticBlockActorId,
} from "@ruleset-ms/api/tiles";

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

export interface MsPetCarrierLoadEntry {
  pos: number;
  occupant: PetCarrierMobSnapshot;
}

export interface MsLevelLayer {
  z: number;
  cells: EngineMapCell[];
  traps: MsConnection[];
  cloners: MsConnection[];
  creaturePositions: number[];
  petCarrierOccupants?: MsPetCarrierLoadEntry[];
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
  petCarrierOccupants?: MsPetCarrierLoadEntry[];
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
  unknownTiles?: DecodedMsUnknownTile[];
}

export interface DecodedMsUnknownTile {
  z: number;
  pos: number;
  plane: "upper" | "lower";
  fileCode: number;
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
  unknownTiles?: DecodedMsUnknownTile[];
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

const MS_PET_CARRIER_INVALID_LOAD_TILE_IDS = new Set<number>([
  MS_TILE.Sandbag,
  MS_TILE.Hook,
  MS_TILE.PetCarrier,
  MS_TILE.BowlingBall_Still,
]);

function decodeMsPetCarrierLoadOccupant(
  tileId: number,
): PetCarrierMobSnapshot | null | undefined {
  if (isMsStaticBlockTile(tileId)) {
    const actorId = msStaticBlockActorId(tileId);
    if (actorId === null) {
      return undefined;
    }
    return createPetCarrierMobSnapshot({
      actorId,
      dir: MS_DIRECTION.none,
    });
  }

  if (isMsCreature(tileId)) {
    const actorId = msCreatureId(tileId);
    if (actorId === MS_TILE.Chip || actorId === MS_TILE.BowlingBall) {
      return null;
    }
    return createPetCarrierMobSnapshot({
      actorId,
      dir: msCreatureDir(tileId),
    });
  }

  if (MS_PET_CARRIER_INVALID_LOAD_TILE_IDS.has(tileId)) {
    return null;
  }

  return undefined;
}

function decodeLayer(
  target: EngineMapCell[],
  data: Uint8Array,
  startOffset: number,
  size: number,
  key: "top" | "bottom",
  z: number,
  hasHigherLayers: boolean,
  registration: MsLevelDecodeRegistration,
): {
  nextOffset: number;
  badTiles: boolean;
  unknownTiles: DecodedMsUnknownTile[];
} {
  let offset = startOffset;
  let pos = 0;
  let badTiles = false;
  const unknownTiles: DecodedMsUnknownTile[] = [];

  while (offset < startOffset + size && pos < target.length) {
    let count = 1;
    let fileId = data[offset] ?? 0;
    offset += 1;

    if (fileId === 0xff) {
      count = data[offset] ?? 0;
      fileId = data[offset + 1] ?? 0;
      offset += 2;
    }

    const tileId = registration.resolveTileId(fileId, {
      z,
      hasHigherLayers,
    });
    const resolvedId = tileId ?? MS_TILE.Wall;
    if (tileId === undefined) {
      badTiles = true;
    }

    while (count > 0 && pos < target.length) {
      if (tileId === undefined) {
        unknownTiles.push({
          z,
          pos,
          plane: key === "top" ? "upper" : "lower",
          fileCode: fileId,
        });
      }
      target[pos]![key] = { id: resolvedId, state: 0 };
      pos += 1;
      count -= 1;
    }
  }

  return {
    nextOffset: startOffset + size,
    badTiles,
    unknownTiles,
  };
}

function decodeMsSingleLevelData(
  levelData: Uint8Array,
  z: number,
  hasHigherLayers: boolean,
  registration: MsLevelDecodeRegistration,
): DecodedMsLevelLayerData {
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
  const upperResult = decodeLayer(cells, levelData, offset, upperSize, "top", z, hasHigherLayers, registration);
  offset = upperResult.nextOffset;

  const lowerSize = readUint16(levelData, offset);
  offset += 2;
  const lowerResult = decodeLayer(cells, levelData, offset, lowerSize, "bottom", z, hasHigherLayers, registration);
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
    unknownTiles: [...upperResult.unknownTiles, ...lowerResult.unknownTiles],
  };
}

export function decodeMsLevelGroupData(
  levelDataLayers: readonly Uint8Array[],
  primaryLevelData: Uint8Array = levelDataLayers[0] ?? new Uint8Array(),
  registration: MsLevelDecodeRegistration,
): DecodedMsLevelData {
  if (levelDataLayers.length === 0) {
    throw new Error("level group must contain at least one layer");
  }

  const hasHigherLayers = levelDataLayers.length > 1;
  const layers = levelDataLayers.map((levelData, index) =>
    decodeMsSingleLevelData(levelData, index + 1, hasHigherLayers, registration),
  );
  const primary = decodeMsSingleLevelData(primaryLevelData, 1, hasHigherLayers, registration);
  const first = layers[0]!;

  return {
    number: primary.number,
    timeLimitSeconds: primary.timeLimitSeconds,
    chipsNeeded: primary.chipsNeeded,
    hintText: primary.hintText,
    cells: first.cells,
    traps: first.traps,
    cloners: first.cloners,
    creaturePositions: first.creaturePositions,
    badTiles: layers.some((layer) => layer.badTiles),
    unknownTiles: first.unknownTiles,
    layers,
  };
}

export function decodeMsLevelData(
  levelData: Uint8Array,
  registration: MsLevelDecodeRegistration,
): DecodedMsLevelData {
  return decodeMsLevelGroupData([levelData], undefined, registration);
}

export function levelLayers(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "petCarrierOccupants" | "hintText" | "layers">,
): MsLevelLayer[] {
  return level.layers ?? [
    {
      z: 1,
      cells: level.cells,
      traps: level.traps.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? 1, toZ: connection.toZ ?? 1 })),
      cloners: level.cloners.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? 1, toZ: connection.toZ ?? 1 })),
      creaturePositions: [...level.creaturePositions],
      petCarrierOccupants: [...(level.petCarrierOccupants ?? [])],
      hintText: level.hintText,
    },
  ];
}

export function collectLevelConnections(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "petCarrierOccupants" | "hintText" | "layers">,
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
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "petCarrierOccupants" | "hintText" | "layers">,
): MsLayerPosition[] {
  return levelLayers(level).flatMap((layer) =>
    layer.creaturePositions.map((pos) => ({
      z: layer.z,
      pos,
    })),
  );
}

export interface MsPetCarrierLayerPosition extends MsLayerPosition {
  occupant: PetCarrierMobSnapshot;
}

export function collectLevelPetCarrierOccupants(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "petCarrierOccupants" | "hintText" | "layers">,
): MsPetCarrierLayerPosition[] {
  return levelLayers(level).flatMap((layer) =>
    (layer.petCarrierOccupants ?? []).map(({ pos, occupant }) => ({
      z: layer.z,
      pos,
      occupant,
    })),
  );
}

export function levelHintTextAtZ(
  level: Pick<MsLevel, "cells" | "traps" | "cloners" | "creaturePositions" | "petCarrierOccupants" | "hintText" | "layers">,
  z: number | undefined,
): string {
  const layers = levelLayers(level);
  const targetZ = z ?? 1;
  return layers.find((layer) => layer.z === targetZ)?.hintText ?? layers[0]?.hintText ?? level.hintText;
}

export function prepareMsLevel(decoded: DecodedMsLevelData): MsLevel {
  const hasExplicitLayers = decoded.layers !== undefined;
  const sourceLayers = decoded.layers ?? [{
    z: 1,
    number: decoded.number,
    timeLimitSeconds: decoded.timeLimitSeconds,
    chipsNeeded: decoded.chipsNeeded,
    hintText: decoded.hintText,
    cells: decoded.cells,
    traps: decoded.traps,
    cloners: decoded.cloners,
    creaturePositions: decoded.creaturePositions,
    badTiles: decoded.badTiles,
  }];
  const layers: MsLevelLayer[] = sourceLayers.map((layer) => {
    const absorbedCreaturePositions = new Set<number>();
    const petCarrierOccupants: MsPetCarrierLoadEntry[] = [];
    const cells = layer.cells.map((cell) => {
      if (cell.top.id !== MS_TILE.PetCarrier) {
        return cell;
      }

      const occupant = decodeMsPetCarrierLoadOccupant(cell.bottom.id);
      if (occupant === undefined) {
        return cell;
      }

      absorbedCreaturePositions.add(cell.position.pos);
      if (occupant !== null) {
        petCarrierOccupants.push({
          pos: cell.position.pos,
          occupant,
        });
      }

      return {
        ...cell,
        bottom: {
          ...cell.bottom,
          id: MS_TILE.Empty,
        },
      };
    });

    return {
      z: layer.z,
      cells,
      traps: layer.traps.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? layer.z, toZ: connection.toZ ?? layer.z })),
      cloners: layer.cloners.map((connection) => ({ ...connection, fromZ: connection.fromZ ?? layer.z, toZ: connection.toZ ?? layer.z })),
      creaturePositions: layer.creaturePositions.filter((pos) => !absorbedCreaturePositions.has(pos)),
      petCarrierOccupants,
      hintText: layer.hintText,
    };
  });

  return {
    number: decoded.number,
    timeLimitTicks: decoded.timeLimitSeconds * MS_TICKS_PER_SECOND,
    chipsNeeded: decoded.chipsNeeded,
    hintText: decoded.hintText,
    cells: layers[0]?.cells ?? decoded.cells,
    traps: layers[0]?.traps ?? decoded.traps,
    cloners: layers[0]?.cloners ?? decoded.cloners,
    creaturePositions: layers[0]?.creaturePositions ?? decoded.creaturePositions,
    petCarrierOccupants: layers[0]?.petCarrierOccupants ?? [],
    statusFlags: decoded.badTiles ? MS_STATUS_FLAG.BadTiles : 0,
    layers: hasExplicitLayers ? layers : undefined,
  };
}
