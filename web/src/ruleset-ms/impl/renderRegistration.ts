import type { PetCarrierMobSnapshot } from "@game-core/impl/petCarrier";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  projectMsRegisteredActorRenderSprite,
  projectMsRegisteredPortableItemRender,
} from "@ruleset-ms/impl/elementRegistration";
import type {
  InteractiveGamePetCarrierRender,
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";

function projectMsPetCarrierOccupantRender(
  occupant: PetCarrierMobSnapshot,
): InteractiveGameRenderSprite {
  const runtimeEntry: MsStatefulActorRuntimeEntry | null =
    occupant.runtimeKind !== undefined && occupant.runtimeState !== undefined
      ? {
          actorSerial: 0,
          kind: occupant.runtimeKind as MsStatefulActorRuntimeEntry["kind"],
          portableBacking: null,
          state: structuredClone(occupant.runtimeState) as MsStatefulActorRuntimeEntry["state"],
        }
      : null;

  return projectMsRegisteredActorRenderSprite(
    {
      id: occupant.actorId,
      dir: occupant.dir,
      moving: 0,
      frame: 0,
    },
    runtimeEntry,
  );
}

export function projectMsOccupiedPetCarrierRender(
  baseTileId: number,
  occupant: PetCarrierMobSnapshot,
): InteractiveGamePetCarrierRender {
  return {
    baseTileId,
    occupant: projectMsPetCarrierOccupantRender(occupant),
  };
}

export function projectMsPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  return projectMsRegisteredPortableItemRender(tileId, alpha);
}

export function projectMsActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: MsStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  return projectMsRegisteredActorRenderSprite(actor, runtimeEntry);
}
