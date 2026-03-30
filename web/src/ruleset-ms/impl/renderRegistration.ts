import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  projectMsRegisteredActorRenderSprite,
  projectMsRegisteredPortableItemRender,
} from "@ruleset-ms/impl/elementRegistration";
import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";

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
