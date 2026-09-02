import type { EngineMapCell } from "@game-core/api/model";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { lynxTileSightEdgeMask, lynxTileSightTransmission } from "@ruleset-lynx/impl/catalog";
import { MS_DIRECTION, isMsBlockActorId } from "@ruleset-ms/api/tiles";
import { msTileSightEdgeMask, msTileSightTransmission } from "@ruleset-ms/impl/catalog";

const BOARD_WIDTH = 32;
const BOARD_HEIGHT = 32;
const CORNER_EPSILON = 1e-9;
const TARGET_SAMPLES = [
  [0.5, 0.5],
  [0.18, 0.18],
  [0.82, 0.18],
  [0.18, 0.82],
  [0.82, 0.82],
] as const;

export interface SpecialModesSightCell {
  transmission: number;
  edgeMask: number;
}

const OUTSIDE_CELL: SpecialModesSightCell = {
  transmission: 0,
  edgeMask: 0,
};

function oppositeDirection(direction: number): number {
  switch (direction) {
    case MS_DIRECTION.north: return MS_DIRECTION.south;
    case MS_DIRECTION.west: return MS_DIRECTION.east;
    case MS_DIRECTION.south: return MS_DIRECTION.north;
    case MS_DIRECTION.east: return MS_DIRECTION.west;
    default: return MS_DIRECTION.none;
  }
}

function cellAt(
  cells: ReadonlyArray<SpecialModesSightCell>,
  x: number,
  y: number,
  width: number,
  height: number,
): SpecialModesSightCell {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return OUTSIDE_CELL;
  }
  return cells[y * width + x] ?? OUTSIDE_CELL;
}

function edgeBlocks(
  cells: ReadonlyArray<SpecialModesSightCell>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  direction: number,
  width: number,
  height: number,
): boolean {
  const from = cellAt(cells, fromX, fromY, width, height);
  const to = cellAt(cells, toX, toY, width, height);
  return (
    (from.edgeMask & direction) !== 0 ||
    (to.edgeMask & oppositeDirection(direction)) !== 0
  );
}

function traceSightRay(options: {
  cells: ReadonlyArray<SpecialModesSightCell>;
  width: number;
  height: number;
  originX: number;
  originY: number;
  targetCellX: number;
  targetCellY: number;
  targetX: number;
  targetY: number;
}): number {
  const {
    cells,
    width,
    height,
    originX,
    originY,
    targetCellX,
    targetCellY,
    targetX,
    targetY,
  } = options;
  let cellX = Math.floor(originX);
  let cellY = Math.floor(originY);
  if (cellX === targetCellX && cellY === targetCellY) {
    return 1;
  }

  const deltaX = targetX - originX;
  const deltaY = targetY - originY;
  const stepX = Math.sign(deltaX);
  const stepY = Math.sign(deltaY);
  const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / deltaX);
  const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / deltaY);
  let tMaxX = stepX === 0
    ? Number.POSITIVE_INFINITY
    : Math.abs(((stepX > 0 ? cellX + 1 : cellX) - originX) / deltaX);
  let tMaxY = stepY === 0
    ? Number.POSITIVE_INFINITY
    : Math.abs(((stepY > 0 ? cellY + 1 : cellY) - originY) / deltaY);
  let transmission = 1;

  const enterCell = (nextX: number, nextY: number): number | null => {
    cellX = nextX;
    cellY = nextY;
    const entered = cellAt(cells, cellX, cellY, width, height);
    const isTarget = cellX === targetCellX && cellY === targetCellY;
    if (isTarget) {
      return transmission;
    }
    if (entered.transmission <= 0) {
      return 0;
    }
    transmission *= entered.transmission;
    return transmission <= 0 ? 0 : null;
  };

  for (let guard = 0; guard < width + height + 4; guard += 1) {
    if (Math.abs(tMaxX - tMaxY) <= CORNER_EPSILON) {
      const nextX = cellX + stepX;
      const nextY = cellY + stepY;
      const horizontalDirection = stepX > 0 ? MS_DIRECTION.east : MS_DIRECTION.west;
      const verticalDirection = stepY > 0 ? MS_DIRECTION.south : MS_DIRECTION.north;
      const horizontalSide = cellAt(cells, nextX, cellY, width, height);
      const verticalSide = cellAt(cells, cellX, nextY, width, height);

      // A ray through the exact corner of an opaque cell may not leak around it.
      // Requiring both orthogonal routes to stay open gives wall corners durable
      // shadows while a real doorway still widens naturally into the room beyond.
      if (
        horizontalSide.transmission <= 0 ||
        verticalSide.transmission <= 0 ||
        edgeBlocks(cells, cellX, cellY, nextX, cellY, horizontalDirection, width, height) ||
        edgeBlocks(cells, cellX, cellY, cellX, nextY, verticalDirection, width, height) ||
        edgeBlocks(cells, nextX, cellY, nextX, nextY, verticalDirection, width, height) ||
        edgeBlocks(cells, cellX, nextY, nextX, nextY, horizontalDirection, width, height)
      ) {
        return 0;
      }
      tMaxX += tDeltaX;
      tMaxY += tDeltaY;
      const result = enterCell(nextX, nextY);
      if (result !== null) {
        return result;
      }
      continue;
    }

    if (tMaxX < tMaxY) {
      const nextX = cellX + stepX;
      const direction = stepX > 0 ? MS_DIRECTION.east : MS_DIRECTION.west;
      if (edgeBlocks(cells, cellX, cellY, nextX, cellY, direction, width, height)) {
        return 0;
      }
      tMaxX += tDeltaX;
      const result = enterCell(nextX, cellY);
      if (result !== null) {
        return result;
      }
      continue;
    }

    const nextY = cellY + stepY;
    const direction = stepY > 0 ? MS_DIRECTION.south : MS_DIRECTION.north;
    if (edgeBlocks(cells, cellX, cellY, cellX, nextY, direction, width, height)) {
      return 0;
    }
    tMaxY += tDeltaY;
    const result = enterCell(cellX, nextY);
    if (result !== null) {
      return result;
    }
  }

  return 0;
}

export function computeSpecialModesLineOfSight(options: {
  cells: ReadonlyArray<SpecialModesSightCell>;
  originPos: number;
  width?: number;
  height?: number;
}): Float32Array {
  const width = options.width ?? BOARD_WIDTH;
  const height = options.height ?? BOARD_HEIGHT;
  const originX = options.originPos % width + 0.5;
  const originY = Math.floor(options.originPos / width) + 0.5;
  const visibility = new Float32Array(width * height);

  for (let targetCellY = 0; targetCellY < height; targetCellY += 1) {
    for (let targetCellX = 0; targetCellX < width; targetCellX += 1) {
      const targetPos = targetCellY * width + targetCellX;
      let strongest = 0;
      for (const [sampleX, sampleY] of TARGET_SAMPLES) {
        strongest = Math.max(strongest, traceSightRay({
          cells: options.cells,
          width,
          height,
          originX,
          originY,
          targetCellX,
          targetCellY,
          targetX: targetCellX + sampleX,
          targetY: targetCellY + sampleY,
        }));
        if (strongest >= 1) {
          break;
        }
      }
      visibility[targetPos] = strongest;
    }
  }

  return visibility;
}

function sessionLayerCells(session: InteractiveGameSession): EngineMapCell[] {
  return session.frame.visibleLayers.find((layer) => layer.z === session.frame.currentZ)?.cells
    ?? session.frame.cells;
}

function sessionTileSight(
  tileId: number,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
): SpecialModesSightCell {
  if (ruleset === "MS") {
    return {
      transmission: msTileSightTransmission(tileId),
      edgeMask: msTileSightEdgeMask(tileId),
    };
  }
  return {
    transmission: lynxTileSightTransmission(tileId),
    edgeMask: lynxTileSightEdgeMask(tileId),
  };
}

function mergeCellSight(
  cell: EngineMapCell,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
): SpecialModesSightCell {
  const top = sessionTileSight(cell.top.id, ruleset);
  const bottom = sessionTileSight(cell.bottom.id, ruleset);
  return {
    transmission: Math.min(top.transmission, bottom.transmission),
    edgeMask: top.edgeMask | bottom.edgeMask,
  };
}

export function sessionSpecialModesSightCells(
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
): SpecialModesSightCell[] {
  const layerCells = sessionLayerCells(session);
  const sightCells = Array.from({ length: BOARD_WIDTH * BOARD_HEIGHT }, (_, pos) => {
    const cell = layerCells[pos];
    return cell ? mergeCellSight(cell, ruleset) : OUTSIDE_CELL;
  });

  for (const overlay of session.frame.tileOverlays) {
    if (
      overlay.z === session.frame.currentZ &&
      (overlay.kind === "hidden-wall-reveal" || overlay.kind === "blue-wall-reveal")
    ) {
      sightCells[overlay.pos] = {
        ...sightCells[overlay.pos]!,
        transmission: 0,
      };
    }
  }

  for (const actor of session.frame.render?.actors ?? []) {
    if (
      !actor.hidden &&
      (actor.z ?? session.frame.currentZ) === session.frame.currentZ &&
      isMsBlockActorId(actor.id)
    ) {
      sightCells[actor.pos] = {
        ...sightCells[actor.pos]!,
        transmission: 0,
      };
    }
  }

  return sightCells;
}

export function sessionSpecialModesLineOfSight(
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
): Float32Array {
  const chip = session.frame.render?.chip;
  const snapshotChip = session.frame.snapshot.chip;
  const originPos = chip?.pos ?? snapshotChip?.position.pos;
  if (originPos === undefined) {
    return new Float32Array(BOARD_WIDTH * BOARD_HEIGHT);
  }
  return computeSpecialModesLineOfSight({
    cells: sessionSpecialModesSightCells(session, ruleset),
    originPos,
  });
}

export function clearSightCell(): SpecialModesSightCell {
  return { transmission: 1, edgeMask: 0 };
}

export function opaqueSightCell(): SpecialModesSightCell {
  return { transmission: 0, edgeMask: 0 };
}

export function attenuatingSightCell(): SpecialModesSightCell {
  return { transmission: 0.5, edgeMask: 0 };
}
