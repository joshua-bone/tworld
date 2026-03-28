import type {
  InteractiveGameRenderableActor,
  InteractiveGameTileOverlay,
} from "@game-core/api/interactive";
import {
  projectActorSupportDecoration,
  projectTileOverlayRender,
} from "@ruleset-ms/api/renderMetadata";

export function projectMsRenderableActor(
  actor: Omit<InteractiveGameRenderableActor, "visual" | "decorations">,
  topId: number,
  bottomId: number,
): InteractiveGameRenderableActor {
  const supportDecoration = projectActorSupportDecoration(actor.id, topId, bottomId);
  return {
    ...actor,
    visual: {
      kind: "creature",
      tileId: actor.id,
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
