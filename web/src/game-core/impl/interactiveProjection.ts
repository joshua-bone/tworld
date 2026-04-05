import { cloneBoardCells } from "@game-core/impl/board";
import type {
  InteractiveGameFrame,
  InteractiveGameTileOverlay,
  InteractiveGameVisibleLayer,
} from "@game-core/api/interactive";
import type { EngineMapCell } from "@game-core/api/model";

export type InteractiveProjectionPhase = "initial" | "tick";

interface InteractiveProjectionLayer {
  z: number;
  cells: EngineMapCell[];
}

interface ProjectInteractiveFrameOptions {
  currentZ?: number;
  layers?: ReadonlyArray<InteractiveProjectionLayer>;
  previousFrame?: InteractiveGameFrame;
  tileOverlays?: ReadonlyArray<InteractiveGameTileOverlay>;
}

function currentLayerCells(
  cells: EngineMapCell[],
  currentZ: number,
  layers?: ReadonlyArray<InteractiveProjectionLayer>,
): EngineMapCell[] {
  return layers?.find((layer) => layer.z === currentZ)?.cells ?? cells;
}

function sameTile(left: EngineMapCell["top"], right: EngineMapCell["top"]): boolean {
  return left.id === right.id && left.state === right.state;
}

function sameCellPosition(left: EngineMapCell, right: EngineMapCell): boolean {
  return (
    left.position.pos === right.position.pos &&
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    (left.position.z ?? null) === (right.position.z ?? null)
  );
}

function cloneProjectedCell(cell: EngineMapCell): EngineMapCell {
  return {
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  };
}

function projectVisibleLayerCells(
  cells: EngineMapCell[],
  previousLayer?: InteractiveGameVisibleLayer,
): EngineMapCell[] {
  if (!previousLayer || previousLayer.cells.length !== cells.length) {
    return cloneBoardCells(cells);
  }

  const previousCells = previousLayer.cells;
  let nextCells = previousCells;
  for (let index = 0; index < cells.length; index += 1) {
    const currentCell = cells[index]!;
    const previousCell = previousCells[index];
    if (!previousCell || !sameCellPosition(currentCell, previousCell)) {
      return cloneBoardCells(cells);
    }

    if (sameTile(currentCell.top, previousCell.top) && sameTile(currentCell.bottom, previousCell.bottom)) {
      continue;
    }

    if (nextCells === previousCells) {
      nextCells = previousCells.slice();
    }

    nextCells[index] = cloneProjectedCell(currentCell);
  }

  return nextCells;
}

export function projectInteractiveVisibleLayers(
  cells: EngineMapCell[],
  currentZ = 1,
  layers?: ReadonlyArray<InteractiveProjectionLayer>,
  previousLayers?: ReadonlyArray<InteractiveGameVisibleLayer>,
): InteractiveGameVisibleLayer[] {
  const runtimeLayers = layers ?? [{ z: currentZ, cells }];
  const layerSources = [
    { z: currentZ, cells: currentLayerCells(cells, currentZ, layers) },
    ...runtimeLayers
    .filter((layer) => layer.z < currentZ)
    .sort((left, right) => right.z - left.z)
    .slice(0, 3)
    .map((layer) => ({ z: layer.z, cells: layer.cells })),
  ];
  const previousLayersByZ = new Map((previousLayers ?? []).map((layer) => [layer.z, layer] as const));

  return layerSources.map((layerSource) => {
    const previousLayer = previousLayersByZ.get(layerSource.z);
    const nextCells = projectVisibleLayerCells(layerSource.cells, previousLayer);
    if (previousLayer && nextCells === previousLayer.cells) {
      return previousLayer;
    }

    return {
      z: layerSource.z,
      cells: nextCells,
    };
  });
}

export function projectInteractiveFrame(
  snapshot: InteractiveGameFrame["snapshot"],
  cells: InteractiveGameFrame["cells"],
  render: InteractiveGameFrame["render"],
  options: ProjectInteractiveFrameOptions = {},
): InteractiveGameFrame {
  const currentZ = options.currentZ ?? cells[0]?.position.z ?? 1;
  const visibleLayers = projectInteractiveVisibleLayers(
    cells,
    currentZ,
    options.layers,
    options.previousFrame?.visibleLayers,
  );

  return {
    snapshot,
    cells: visibleLayers[0]?.cells ?? cloneBoardCells(cells),
    currentZ,
    visibleLayers,
    tileOverlays: (options.tileOverlays ?? []).map((overlay) => ({ ...overlay })),
    render,
  };
}
