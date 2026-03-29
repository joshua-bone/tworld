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
  tileOverlays?: ReadonlyArray<InteractiveGameTileOverlay>;
}

function currentLayerCells(
  cells: EngineMapCell[],
  currentZ: number,
  layers?: ReadonlyArray<InteractiveProjectionLayer>,
): EngineMapCell[] {
  return layers?.find((layer) => layer.z === currentZ)?.cells ?? cells;
}

export function projectInteractiveVisibleLayers(
  cells: EngineMapCell[],
  currentZ = 1,
  layers?: ReadonlyArray<InteractiveProjectionLayer>,
): InteractiveGameVisibleLayer[] {
  const currentCells = cloneBoardCells(currentLayerCells(cells, currentZ, layers));
  const runtimeLayers = layers ?? [{ z: currentZ, cells }];
  const visibleLayers: InteractiveGameVisibleLayer[] = [{ z: currentZ, cells: currentCells }];

  const lowerLayers = runtimeLayers
    .filter((layer) => layer.z < currentZ)
    .sort((left, right) => right.z - left.z)
    .slice(0, 3)
    .map((layer) => ({
      z: layer.z,
      cells: cloneBoardCells(layer.cells),
    }));

  visibleLayers.push(...lowerLayers);
  return visibleLayers;
}

export function projectInteractiveFrame(
  snapshot: InteractiveGameFrame["snapshot"],
  cells: InteractiveGameFrame["cells"],
  render: InteractiveGameFrame["render"],
  options: ProjectInteractiveFrameOptions = {},
): InteractiveGameFrame {
  const currentZ = options.currentZ ?? cells[0]?.position.z ?? 1;
  const visibleLayers = projectInteractiveVisibleLayers(cells, currentZ, options.layers);

  return {
    snapshot,
    cells: visibleLayers[0]?.cells ?? cloneBoardCells(cells),
    currentZ,
    visibleLayers,
    tileOverlays: (options.tileOverlays ?? []).map((overlay) => ({ ...overlay })),
    render,
  };
}
