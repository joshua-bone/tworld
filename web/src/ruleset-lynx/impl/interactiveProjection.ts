import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import type { StatefulActorRuntimeStore, StatefulActorRuntimeEntry } from "@game-core/impl/statefulActorRuntime";
import { findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import {
  projectLynxRenderableActor,
  projectLynxRenderableAnimation,
  projectLynxRenderableChip,
  projectLynxRenderableOverlay,
} from "@ruleset-lynx/impl/renderPolicy";
import {
  carriedLynxPortableToolItem,
  type LynxPetCarrierPortableItem,
  type LynxPortableItem,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import {
  projectLynxOccupiedPetCarrierRender,
  projectLynxPortableItemRender,
} from "@ruleset-lynx/impl/renderRegistration";
import { collectLevelConnections } from "@ruleset-ms/api/level";
import { MS_TILE } from "@ruleset-ms/api/tiles";

interface LynxProjectedAnimationState {
  pos: number;
  z?: number;
  frame: number;
  tileId: number;
}

interface LynxProjectedRuntimeState {
  visuals?: {
    animations?: LynxProjectedAnimationState[];
    tileOverlays?: Array<InteractiveGameFrame["tileOverlays"][number] & { ttl?: number }>;
  };
  chipRuntime?: {
    chipTeleported?: boolean;
  };
  portableTools?: LynxPortableToolStateStore;
  statefulActors?: StatefulActorRuntimeStore<StatefulActorRuntimeEntry>;
}

function lynxProjectedRuntimeState(state: EngineState): LynxProjectedRuntimeState | null {
  const runtime = (state as EngineState & { lynxRuntimeState?: LynxProjectedRuntimeState }).lynxRuntimeState;
  return runtime ?? null;
}

function ensureMutableProjectedCell(
  frame: InteractiveGameFrame,
  layerIndexesByZ: ReadonlyMap<number, number>,
  clonedLayerIndexes: Set<number>,
  clonedCellKeys: Set<string>,
  z: number,
  pos: number,
): EngineMapCell | null {
  const layerIndex = layerIndexesByZ.get(z);
  if (layerIndex === undefined) {
    return null;
  }

  if (!clonedLayerIndexes.has(layerIndex)) {
    const nextVisibleLayers = frame.visibleLayers.slice();
    const previousLayer = nextVisibleLayers[layerIndex];
    if (!previousLayer) {
      return null;
    }

    const nextLayer = {
      ...previousLayer,
      cells: previousLayer.cells.slice(),
    };
    nextVisibleLayers[layerIndex] = nextLayer;
    frame.visibleLayers = nextVisibleLayers;
    if (layerIndex === 0) {
      frame.cells = nextLayer.cells;
    }
    clonedLayerIndexes.add(layerIndex);
  }

  const layer = frame.visibleLayers[layerIndex];
  const currentCell = layer?.cells[pos];
  if (!currentCell) {
    return null;
  }

  const cellKey = `${layerIndex}:${pos}`;
  if (!clonedCellKeys.has(cellKey)) {
    const nextCell: EngineMapCell = {
      position: currentCell.position,
      top: { ...currentCell.top },
      bottom: { ...currentCell.bottom },
    };
    layer.cells[pos] = nextCell;
    clonedCellKeys.add(cellKey);
    return nextCell;
  }

  return currentCell;
}

function applyLynxTrapRenderState(frame: InteractiveGameFrame, session: LynxInteractiveSessionState): void {
  const visibleLayersByZ = new Map(frame.visibleLayers.map((layer) => [layer.z, layer.cells] as const));
  const layerIndexesByZ = new Map(frame.visibleLayers.map((layer, index) => [layer.z, index] as const));
  const clonedLayerIndexes = new Set<number>();
  const clonedCellKeys = new Set<string>();
  const heldButtonsByZ = new Map<number, Set<number>>();

  const markHeldButton = (z: number, pos: number): void => {
    let heldButtons = heldButtonsByZ.get(z);
    if (!heldButtons) {
      heldButtons = new Set<number>();
      heldButtonsByZ.set(z, heldButtons);
    }
    heldButtons.add(pos);
  };

  const trackHeldButton = (z: number, pos: number): void => {
    const cells = visibleLayersByZ.get(z);
    if (!cells || cells[pos]?.top.id !== MS_TILE.Button_Brown) {
      return;
    }

    markHeldButton(z, pos);
  };

  if (session.chipMoving <= 0) {
    trackHeldButton(session.chipZ ?? 1, session.chipPos);
  }

  for (const actor of session.actors) {
    if (actor.hidden || actor.moving > 0) {
      continue;
    }
    trackHeldButton(actor.z ?? 1, actor.pos);
  }

  for (const layer of frame.visibleLayers) {
    for (const cell of layer.cells) {
      if (cell.top.id === MS_TILE.Sandbag && cell.bottom.id === MS_TILE.Button_Brown) {
        markHeldButton(layer.z, cell.position.pos);
      }
    }
  }

  for (const connection of collectLevelConnections(session.level, "traps")) {
    const z = connection.toZ ?? connection.fromZ ?? 1;
    if ((connection.fromZ ?? z) !== z || (connection.toZ ?? z) !== z) {
      continue;
    }
    if (!heldButtonsByZ.get(z)?.has(connection.from)) {
      continue;
    }

    const trapCell = ensureMutableProjectedCell(
      frame,
      layerIndexesByZ,
      clonedLayerIndexes,
      clonedCellKeys,
      z,
      connection.to,
    );
    if (!trapCell) {
      continue;
    }

    if (trapCell.top.id === MS_TILE.Beartrap) {
      trapCell.top.state |= LYNX_CELL_FLAG.TrapOpen;
    } else if (trapCell.bottom.id === MS_TILE.Beartrap) {
      trapCell.bottom.state |= LYNX_CELL_FLAG.TrapOpen;
    }
  }
}

function lynxLayerCellsAt(
  session: LynxInteractiveSessionState,
  z: number,
) {
  return session.state.map.layers?.find((layer) => layer.z === z)?.cells ?? session.state.map.cells;
}

function isMappedOccupiedLynxPetCarrier(
  item: LynxPortableItem,
): item is LynxPetCarrierPortableItem & { state: Extract<LynxPetCarrierPortableItem["state"], { mode: "map" }> } {
  return item.family === "pet-carrier" && item.state.mode === "map" && item.petCarrierState.occupant !== null;
}

export function projectLynxInteractiveFrame(
  session: LynxInteractiveSessionState,
  phase: InteractiveProjectionPhase,
  previousFrame?: InteractiveGameFrame,
): InteractiveGameFrame {
  const runtime = lynxProjectedRuntimeState(session.state);
  const chipVerticalMove = session.chipMoveKind === "air" || session.chipMoveKind === "elevator";
  const portableTools = runtime?.portableTools ?? null;
  const mappedOccupiedCarriers = portableTools?.portableItems?.filter(isMappedOccupiedLynxPetCarrier) ?? [];
  const carriedPortableItem = portableTools?.portableItems ? carriedLynxPortableToolItem(portableTools) ?? null : null;

  const frame = projectInteractiveFrame(
    engineStateToSnapshot(session.state, phase, session.lastInput),
    session.state.map.cells,
    {
      chip: projectLynxRenderableChip({
        pos: session.chipPos,
        z: session.chipZ,
        dir: session.chipDir,
        moving: chipVerticalMove ? 0 : session.chipMoving,
        pushing: session.chipPushing,
        hidden: runtime?.chipRuntime?.chipTeleported === true,
        failed: session.endGameResult === "failed",
        endGameAnimationTileId: session.endGameAnimationTileId,
        endGameAnimationFrame: session.endGameAnimationFrame,
        scale: session.chipMoveKind === "air" && session.chipMoving > 0 ? 0.9 + (session.chipMoving / 8) * 0.1 : 1,
      }),
      actors: session.actors.map((actor) =>
        {
          const runtimeEntry = findStatefulActorRuntime(
            runtime?.statefulActors ?? { byActorSerial: new Map() },
            actor.serial,
          ) ?? null;

          return projectLynxRenderableActor(
            {
              serial: actor.serial,
              id: actor.id,
              pos: actor.pos,
              z: actor.z,
              dir: actor.dir,
              moving: actor.moveKind === "air" || actor.moveKind === "elevator" ? 0 : actor.moving,
              frame: actor.moveKind === "air" || actor.moveKind === "elevator" ? 0 : actor.frame,
              hidden: actor.hidden,
              animationReserved: actor.animationReserved,
              scale: actor.moveKind === "air" && actor.moving > 0 ? 0.9 + (actor.moving / 8) * 0.1 : 1,
            },
            session.state.map.cells[actor.pos]?.top.id ?? MS_TILE.Empty,
            session.state.map.cells[actor.pos]?.bottom.id ?? MS_TILE.Empty,
            runtimeEntry,
          );
        }
      ),
      animations: runtime?.visuals?.animations?.map((animation) => projectLynxRenderableAnimation({ ...animation })) ?? [],
    },
    {
      currentZ: session.chipZ ?? 1,
      layers: session.state.map.layers,
      previousFrame,
      tileOverlays: [
        ...(runtime?.visuals?.tileOverlays?.map(({ ttl: _ttl, ...overlay }) => projectLynxRenderableOverlay(overlay)) ?? []),
        ...mappedOccupiedCarriers.map((item) => {
          const overlay = projectLynxRenderableOverlay({
            z: item.state.z,
            pos: item.state.pos,
            kind: "portable-item-state" as const,
            tileId: item.tileId,
          });
          if (overlay.render?.mode === "tile") {
            const bottomId = lynxLayerCellsAt(session, item.state.z)[item.state.pos]?.bottom.id ?? MS_TILE.Empty;
            overlay.render = {
              ...overlay.render,
              petCarrierRender: projectLynxOccupiedPetCarrierRender(bottomId, item.petCarrierState.occupant!),
            };
          }
          return overlay;
        }),
        ...(runtime?.portableTools?.primedToolDrop
          ? [
              projectLynxRenderableOverlay({
                z: runtime.portableTools.primedToolDrop.z,
                pos: runtime.portableTools.primedToolDrop.pos,
                kind: "carried-tool" as const,
                tileId: runtime.portableTools.primedToolDrop.tileId,
              }),
            ]
          : []),
      ],
    },
  );

  if (carriedPortableItem?.family === "pet-carrier" && carriedPortableItem.petCarrierState.occupant !== null) {
    const toolRender = projectLynxPortableItemRender(carriedPortableItem.tileId, 1);
    frame.inventoryRender = {
      tools: toolRender?.mode === "tile"
        ? [{
            ...toolRender,
            petCarrierRender: projectLynxOccupiedPetCarrierRender(MS_TILE.Empty, carriedPortableItem.petCarrierState.occupant),
          }]
        : [toolRender],
    };
  }

  applyLynxTrapRenderState(frame, session);
  return frame;
}
