import type {
  InteractiveGameRenderableActor,
  InteractiveGameTileOverlay,
} from "@game-core/api/interactive";
import {
  projectActorSupportDecoration,
  projectTileOverlayRender,
} from "@ruleset-ms/api/renderMetadata";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export function projectMsRenderableActor(
  actor: Omit<InteractiveGameRenderableActor, "visual" | "decorations">,
  topId: number,
  bottomId: number,
  statefulKind: string | null = null,
): InteractiveGameRenderableActor {
  const supportDecoration = projectActorSupportDecoration(actor.id, topId, bottomId);
  const visualTileId = statefulKind === "bowling-ball" ? MS_TILE.BowlingBall : actor.id;
  return {
    ...actor,
    visual: {
      kind: "creature",
      tileId: visualTileId,
      dir: actor.dir,
      moving: actor.moving,
      frame: actor.frame,
    },
    decorations: supportDecoration ? [supportDecoration] : [],
  };
}

export function projectMsRenderableOverlay(
  overlay: InteractiveGameTileOverlay,
): InteractiveGameTileOverlay {
  return {
    ...overlay,
    render: projectTileOverlayRender(overlay) ?? undefined,
  };
}
