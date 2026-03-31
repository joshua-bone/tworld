import type {
  InteractiveGameRenderableActor,
  InteractiveGameTileOverlay,
} from "@game-core/api/interactive";
import {
  projectActorSupportDecoration,
  projectTileOverlayRender,
} from "@ruleset-ms/api/renderMetadata";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  projectMsActorRenderSprite,
  projectMsPortableItemRender,
} from "@ruleset-ms/impl/renderRegistration";

export function projectMsRenderableActor(
  actor: Omit<InteractiveGameRenderableActor, "visual" | "decorations">,
  topId: number,
  bottomId: number,
  runtimeEntry: MsStatefulActorRuntimeEntry | null = null,
): InteractiveGameRenderableActor {
  const supportDecoration = projectActorSupportDecoration(actor.id, topId, bottomId);
  return {
    ...actor,
    visual: projectMsActorRenderSprite(actor, runtimeEntry),
    decorations: supportDecoration ? [supportDecoration] : [],
  };
}

export function projectMsRenderableOverlay(
  overlay: InteractiveGameTileOverlay,
): InteractiveGameTileOverlay {
  if (
    (overlay.kind === "carried-tool" || overlay.kind === "portable-item-state") &&
    typeof overlay.tileId === "number"
  ) {
    return {
      ...overlay,
      render: projectMsPortableItemRender(overlay.tileId, overlay.kind === "carried-tool" ? 0.25 : 1) ?? undefined,
    };
  }

  return {
    ...overlay,
    render: projectTileOverlayRender(overlay) ?? undefined,
  };
}
