import type { InteractiveGameFrame } from "@game-core/api/interactive";
import { projectInteractiveFrame, type InteractiveProjectionPhase } from "@game-core/impl/interactiveProjection";
import type { EngineState } from "@game-core/api/model";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import {
  projectMsRenderableActor,
  projectMsRenderableOverlay,
} from "@ruleset-ms/impl/renderPolicy";
import {
  carriedMsPortableToolItem,
  type MsPetCarrierPortableItem,
  type MsPortableItem,
} from "@ruleset-ms/impl/portableItems";
import {
  projectMsOccupiedPetCarrierRender,
  projectMsPortableItemRender,
} from "@ruleset-ms/impl/renderRegistration";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";

type MsProjectedTileOverlay = InteractiveGameFrame["tileOverlays"][number] & { ttl?: number };

function msProjectedRuntimeState(state: EngineState): { tileOverlays?: MsProjectedTileOverlay[] } | null {
  const runtime = state as EngineState & {
    msRuntimeState?: { tileOverlays?: MsProjectedTileOverlay[] };
  };
  return runtime.msRuntimeState ?? null;
}

function applyMsTrapRenderState(frame: InteractiveGameFrame, session: MsInteractiveSessionState): void {
  const visibleLayersByZ = new Map(frame.visibleLayers.map((layer) => [layer.z, layer.cells] as const));

  for (const connection of session.state.internal.traps) {
    const z = connection.toZ ?? connection.fromZ ?? 1;
    if ((connection.fromZ ?? z) !== z || (connection.toZ ?? z) !== z) {
      continue;
    }

    const cells = visibleLayersByZ.get(z);
    if (!cells) {
      continue;
    }

    const buttonCell = cells[connection.from];
    if (!buttonCell || buttonCell.top.id === MS_TILE.Button_Brown) {
      continue;
    }

    const trapCell = cells[connection.to];
    if (!trapCell) {
      continue;
    }

    if (trapCell.top.id === MS_TILE.Beartrap) {
      trapCell.top.state |= MS_FLOOR_STATE.TrapOpen;
    } else if (trapCell.bottom.id === MS_TILE.Beartrap) {
      trapCell.bottom.state |= MS_FLOOR_STATE.TrapOpen;
    }
  }
}

function msDirectionFromActorName(dir: string): number {
  switch (dir) {
    case "north":
      return MS_DIRECTION.north;
    case "west":
      return MS_DIRECTION.west;
    case "south":
      return MS_DIRECTION.south;
    case "east":
      return MS_DIRECTION.east;
    default:
      return MS_DIRECTION.none;
  }
}

function projectMsRenderFrame(session: MsInteractiveSessionState): NonNullable<InteractiveGameFrame["render"]> {
  const creatures = session.state.internal.creatures ?? [];
  const blocks = session.state.internal.blocks ?? [];
  const actors: NonNullable<InteractiveGameFrame["render"]>["actors"] = [];
  const seen = new Set<string>();
  const actorKey = (z: number, pos: number) => `${z}:${pos}`;

  const addActor = (actor: NonNullable<InteractiveGameFrame["render"]>["actors"][number]): void => {
    const key = actorKey(actor.z ?? 1, actor.pos);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    actors.push(actor);
  };

  for (const creature of creatures) {
    const cells = session.state.engine.map.cells;
    const runtimeEntry = creature.serial
      ? findStatefulActorRuntime(session.state.internal.statefulActors, creature.serial) ?? null
      : null;
    addActor(projectMsRenderableActor({
      serial: creature.serial,
      id: creature.id,
      pos: creature.pos,
      z: creature.z,
      dir: creature.dir,
      moving: creature.moving,
      frame: creature.frame,
      hidden: creature.hidden,
    }, cells[creature.pos]?.top.id ?? MS_TILE.Empty, cells[creature.pos]?.bottom.id ?? MS_TILE.Empty, runtimeEntry));
  }

  for (const block of blocks) {
    const cells = session.state.engine.map.cells;
    addActor(projectMsRenderableActor({
      id: MS_TILE.Block,
      pos: block.pos,
      z: block.z,
      dir: block.dir,
      moving: 0,
      frame: 0,
      hidden: block.hidden,
    }, cells[block.pos]?.top.id ?? MS_TILE.Empty, cells[block.pos]?.bottom.id ?? MS_TILE.Empty));
  }

  for (const actor of session.state.engine.actors) {
    if (actor.id === MS_TILE.Chip || actor.id === MS_TILE.Swimming_Chip) {
      continue;
    }
    const cells = session.state.engine.map.cells;
    addActor(projectMsRenderableActor({
      id: actor.id,
      pos: actor.position.pos,
      z: actor.position.z,
      dir: msDirectionFromActorName(actor.dir),
      moving: 0,
      frame: 0,
      hidden: false,
    }, cells[actor.position.pos]?.top.id ?? MS_TILE.Empty, cells[actor.position.pos]?.bottom.id ?? MS_TILE.Empty));
  }

  return {
    chip: null,
    actors,
    animations: [],
  };
}

function msLayerCellsAt(
  session: MsInteractiveSessionState,
  z: number,
) {
  return session.state.engine.map.layers?.find((layer) => layer.z === z)?.cells ?? session.state.engine.map.cells;
}

function isMappedOccupiedMsPetCarrier(
  item: MsPortableItem,
): item is MsPetCarrierPortableItem & { state: Extract<MsPetCarrierPortableItem["state"], { mode: "map" }> } {
  return item.family === "pet-carrier" && item.state.mode === "map" && item.petCarrierState.occupant !== null;
}

export function projectMsInteractiveFrame(
  session: MsInteractiveSessionState,
  phase: InteractiveProjectionPhase,
  previousFrame?: InteractiveGameFrame,
): InteractiveGameFrame {
  const runtime = msProjectedRuntimeState(session.state.engine);
  const portableTools = session.state.internal.portableTools ?? null;
  const mappedOccupiedCarriers = portableTools?.portableItems?.filter(isMappedOccupiedMsPetCarrier) ?? [];
  const carriedPortableItem = portableTools?.portableItems ? carriedMsPortableToolItem(portableTools) ?? null : null;
  const primedToolDrop = session.state.internal.portableTools?.primedToolDrop ?? null;

  const frame = projectInteractiveFrame(
    engineStateToSnapshot(session.state.engine, phase, session.lastInput),
    session.state.engine.map.cells,
    projectMsRenderFrame(session),
    {
      currentZ: session.state.internal.chipZ ?? 1,
      layers: session.state.engine.map.layers,
      previousFrame,
      tileOverlays: [
        ...(runtime?.tileOverlays?.map(({ ttl: _ttl, ...overlay }) => projectMsRenderableOverlay(overlay)) ?? []),
        ...mappedOccupiedCarriers.map((item) => {
          const overlay = projectMsRenderableOverlay({
            z: item.state.z,
            pos: item.state.pos,
            kind: "portable-item-state" as const,
            tileId: item.tileId,
          });
          if (overlay.render?.mode === "tile") {
            const bottomId = msLayerCellsAt(session, item.state.z)[item.state.pos]?.bottom.id ?? MS_TILE.Empty;
            overlay.render = {
              ...overlay.render,
              petCarrierRender: projectMsOccupiedPetCarrierRender(bottomId, item.petCarrierState.occupant!),
            };
          }
          return overlay;
        }),
        ...(primedToolDrop
          ? [
              projectMsRenderableOverlay({
                z: primedToolDrop.z,
                pos: primedToolDrop.pos,
                kind: "carried-tool" as const,
                tileId: primedToolDrop.tileId,
              }),
            ]
          : []),
      ],
    },
  );

  if (carriedPortableItem?.family === "pet-carrier" && carriedPortableItem.petCarrierState.occupant !== null) {
    const toolRender = projectMsPortableItemRender(carriedPortableItem.tileId, 1);
    frame.inventoryRender = {
      tools: toolRender?.mode === "tile"
        ? [{
            ...toolRender,
            petCarrierRender: projectMsOccupiedPetCarrierRender(MS_TILE.Empty, carriedPortableItem.petCarrierState.occupant),
          }]
        : [toolRender],
    };
  }

  applyMsTrapRenderState(frame, session);
  return frame;
}
