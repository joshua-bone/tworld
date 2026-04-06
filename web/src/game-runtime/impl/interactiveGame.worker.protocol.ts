import type { InteractiveInput } from "@game-core/api/command";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type {
  InteractiveGameFrame,
  InteractiveGameVisibleLayer,
} from "@game-core/api/interactive";
import type {
  EngineMapCell,
  EngineTile,
} from "@game-core/api/model";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionHydrationOptions,
  InteractiveGameSessionHistory,
  InteractiveGameSessionRunState,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { LoadedLevelData } from "@level-catalog/ports/LevelRepository";

export interface WorkerInteractiveGameSessionHandlePayload {
  sessionId: number;
}

export function toWorkerInteractiveGameSessionHandle(sessionId: number): InteractiveGameSessionHandle {
  return { sessionId } as unknown as InteractiveGameSessionHandle;
}

export function readWorkerInteractiveGameSessionId(handle: InteractiveGameSessionHandle): number | null {
  if (
    typeof handle === "object" &&
    handle !== null &&
    "sessionId" in handle &&
    typeof (handle as WorkerInteractiveGameSessionHandlePayload).sessionId === "number"
  ) {
    return (handle as WorkerInteractiveGameSessionHandlePayload).sessionId;
  }

  return null;
}

export type WorkerInteractiveGameSessionHistoryUpdate = Omit<InteractiveGameSessionHistory, "checkpointTicks">;

export interface WorkerInteractiveGameCellUpdate {
  index: number;
  top: EngineTile;
  bottom: EngineTile;
}

export type WorkerInteractiveGameVisibleLayerUpdate =
  | {
      kind: "patch";
      z: number;
      changedCells: WorkerInteractiveGameCellUpdate[];
    }
  | {
      kind: "replace";
      z: number;
      cells: EngineMapCell[];
    };

export type WorkerInteractiveGameVisibleLayersUpdate =
  | {
      mode: "patch";
      layers: WorkerInteractiveGameVisibleLayerUpdate[];
    }
  | {
      mode: "replace";
      layers: InteractiveGameVisibleLayer[];
    };

export interface WorkerInteractiveGameFrameUpdate {
  snapshot: InteractiveGameFrame["snapshot"];
  currentZ: number;
  visibleLayers: WorkerInteractiveGameVisibleLayersUpdate;
  tileOverlays: InteractiveGameFrame["tileOverlays"];
  render: InteractiveGameFrame["render"];
  inventoryRender?: InteractiveGameFrame["inventoryRender"];
}

export interface WorkerInteractiveGameSessionUpdate {
  hintText: string | null;
  frame: WorkerInteractiveGameFrameUpdate;
  history: WorkerInteractiveGameSessionHistoryUpdate;
  run: InteractiveGameSessionRunState;
  recordedMoveCount?: number;
}

function sameTile(left: EngineTile, right: EngineTile): boolean {
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

function cloneTile(tile: EngineTile): EngineTile {
  return {
    ...tile,
  };
}

function cloneCell(cell: EngineMapCell): EngineMapCell {
  return {
    position: { ...cell.position },
    top: cloneTile(cell.top),
    bottom: cloneTile(cell.bottom),
  };
}

function buildVisibleLayerUpdate(
  previous: InteractiveGameVisibleLayer,
  next: InteractiveGameVisibleLayer,
): WorkerInteractiveGameVisibleLayerUpdate | null {
  if (
    previous.z !== next.z ||
    previous.cells.length !== next.cells.length ||
    previous.cells.some((cell, index) => !sameCellPosition(cell, next.cells[index]!))
  ) {
    return {
      kind: "replace",
      z: next.z,
      cells: next.cells,
    };
  }

  const changedCells: WorkerInteractiveGameCellUpdate[] = [];
  for (let index = 0; index < next.cells.length; index += 1) {
    const previousCell = previous.cells[index]!;
    const nextCell = next.cells[index]!;
    if (sameTile(previousCell.top, nextCell.top) && sameTile(previousCell.bottom, nextCell.bottom)) {
      continue;
    }

    changedCells.push({
      index,
      top: cloneTile(nextCell.top),
      bottom: cloneTile(nextCell.bottom),
    });
  }

  if (changedCells.length === 0) {
    return null;
  }

  return {
    kind: "patch",
    z: next.z,
    changedCells,
  };
}

function buildVisibleLayersUpdate(
  previous: InteractiveGameFrame["visibleLayers"],
  next: InteractiveGameFrame["visibleLayers"],
): WorkerInteractiveGameVisibleLayersUpdate {
  const canPatch =
    previous.length === next.length &&
    previous.every((layer, index) => layer.z === next[index]?.z);

  if (!canPatch) {
    return {
      mode: "replace",
      layers: next,
    };
  }

  return {
    mode: "patch",
    layers: next
      .map((layer, index) => buildVisibleLayerUpdate(previous[index]!, layer))
      .filter((layer): layer is WorkerInteractiveGameVisibleLayerUpdate => layer !== null),
  };
}

function applyVisibleLayerUpdate(
  previous: InteractiveGameVisibleLayer,
  update: WorkerInteractiveGameVisibleLayerUpdate,
): InteractiveGameVisibleLayer {
  if (update.kind === "replace") {
    return {
      z: update.z,
      cells: update.cells,
    };
  }

  if (update.changedCells.length === 0) {
    return previous;
  }

  const cells = previous.cells.slice();
  for (const cellUpdate of update.changedCells) {
    const previousCell = previous.cells[cellUpdate.index];
    if (!previousCell) {
      continue;
    }

    cells[cellUpdate.index] = {
      position: previousCell.position,
      top: cloneTile(cellUpdate.top),
      bottom: cloneTile(cellUpdate.bottom),
    };
  }

  return {
    z: previous.z,
    cells,
  };
}

function applyVisibleLayersUpdate(
  previous: InteractiveGameFrame["visibleLayers"],
  update: WorkerInteractiveGameVisibleLayersUpdate,
): InteractiveGameFrame["visibleLayers"] {
  if (update.mode === "replace") {
    return update.layers;
  }

  if (update.layers.length === 0) {
    return previous;
  }

  const updatesByZ = new Map(update.layers.map((layer) => [layer.z, layer] as const));
  return previous.map((layer) => {
    const layerUpdate = updatesByZ.get(layer.z);
    if (!layerUpdate) {
      return layer;
    }

    return applyVisibleLayerUpdate(layer, layerUpdate);
  });
}

export function toWorkerInteractiveGameSessionUpdate(
  previous: InteractiveGameSession,
  next: InteractiveGameSession,
): WorkerInteractiveGameSessionUpdate {
  return {
    hintText: next.hintText,
    frame: {
      snapshot: next.frame.snapshot,
      currentZ: next.frame.currentZ,
      visibleLayers: buildVisibleLayersUpdate(previous.frame.visibleLayers, next.frame.visibleLayers),
      tileOverlays: next.frame.tileOverlays,
      render: next.frame.render,
      inventoryRender: next.frame.inventoryRender,
    },
    history: {
      enabled: next.history.enabled,
      initialTick: next.history.initialTick,
      currentTick: next.history.currentTick,
      latestTick: next.history.latestTick,
      checkpointCount: next.history.checkpointCount ?? next.history.checkpointTicks?.length,
      recentTicks: next.history.recentTicks ? [...next.history.recentTicks] : undefined,
      previousTick: next.history.previousTick,
      previousCheckpointTick: next.history.previousCheckpointTick,
      timelineId: next.history.timelineId,
      timelineCount: next.history.timelineCount,
      restoreMode: next.history.restoreMode,
      restoredFromTick: next.history.restoredFromTick,
      replayTargetTick: next.history.replayTargetTick,
    },
    run: next.run,
    recordedMoveCount: next.recordedMoveCount ?? next.recordedMoves?.length,
  };
}

export function applyWorkerInteractiveGameSessionUpdate(
  previous: InteractiveGameSession,
  update: WorkerInteractiveGameSessionUpdate,
): InteractiveGameSession {
  const visibleLayers = applyVisibleLayersUpdate(previous.frame.visibleLayers, update.frame.visibleLayers);

  return {
    ...previous,
    hintText: update.hintText,
    frame: {
      snapshot: update.frame.snapshot,
      currentZ: update.frame.currentZ,
      visibleLayers,
      cells: visibleLayers[0]?.cells ?? previous.frame.cells,
      tileOverlays: update.frame.tileOverlays,
      render: update.frame.render,
      inventoryRender: update.frame.inventoryRender,
    },
    history: {
      ...update.history,
      recentTicks: update.history.recentTicks ? [...update.history.recentTicks] : undefined,
    },
    run: update.run,
    recordedMoveCount: update.recordedMoveCount,
    recordedMoves: undefined,
  };
}

export type InteractiveGameWorkerRequest =
  | {
      id: number;
      type: "ping";
    }
  | {
      id: number;
      type: "start-session";
      request: GameRequest;
      options?: InteractiveGameSessionStartOptions;
    }
  | {
      id: number;
      type: "start-replay-session";
      request: GameRequest;
      replay: ReplaySolutionPayload;
      options?: InteractiveGameSessionStartOptions;
    }
  | {
      id: number;
      type: "advance-session";
      sessionId: number;
      input: InteractiveInput;
    }
  | {
      id: number;
      type: "restore-session";
      sessionId: number;
      targetTick: number;
    }
  | {
      id: number;
      type: "resume-session";
      sessionId: number;
    }
  | {
      id: number;
      type: "hydrate-session";
      sessionId: number;
      options: InteractiveGameSessionHydrationOptions;
    }
  | {
      id: number;
      type: "dispose-session";
      sessionId: number;
    }
  | {
      id: number;
      type: "sync-imported-dat";
      filename: string;
      datHash: string;
      datBytes: Uint8Array;
    }
  | {
      id: number;
      type: "delete-imported-dat";
      filename: string;
    }
  | {
      id: number;
      type: "preload-level";
      loaded: LoadedLevelData;
    };

export interface InteractiveGameWorkerResponse {
  id: number;
  error?: string;
  session?: InteractiveGameSession;
  sessionUpdate?: WorkerInteractiveGameSessionUpdate;
}
