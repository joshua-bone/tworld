import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  projectLynxRegisteredActorRenderSprite,
  projectLynxRegisteredPortableItemRender,
} from "@ruleset-lynx/impl/elementRegistration";
import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";

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
