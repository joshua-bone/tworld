import type { PetCarrierMobSnapshot } from "@game-core/impl/petCarrier";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  projectLynxRegisteredActorRenderSprite,
  projectLynxRegisteredPortableItemRender,
} from "@ruleset-lynx/impl/elementRegistration";
import type {
  InteractiveGamePetCarrierRender,
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";

function projectLynxPetCarrierOccupantRender(
  occupant: PetCarrierMobSnapshot,
): InteractiveGameRenderSprite {
  const runtimeEntry: LynxStatefulActorRuntimeEntry | null =
    occupant.runtimeKind !== undefined && occupant.runtimeState !== undefined
      ? {
          actorSerial: 0,
          kind: occupant.runtimeKind as LynxStatefulActorRuntimeEntry["kind"],
          portableBacking: null,
          state: structuredClone(occupant.runtimeState) as LynxStatefulActorRuntimeEntry["state"],
        }
      : null;

  return projectLynxRegisteredActorRenderSprite(
    {
      id: occupant.actorId,
      dir: occupant.dir,
      moving: 0,
      frame: 0,
    },
    runtimeEntry,
  );
}

export function projectLynxOccupiedPetCarrierRender(
  baseTileId: number,
  occupant: PetCarrierMobSnapshot,
): InteractiveGamePetCarrierRender {
  return {
    baseTileId,
    occupant: projectLynxPetCarrierOccupantRender(occupant),
  };
}

export function projectLynxPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  return projectLynxRegisteredPortableItemRender(tileId, alpha);
}

export function projectLynxActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: LynxStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  return projectLynxRegisteredActorRenderSprite(actor, runtimeEntry);
}
