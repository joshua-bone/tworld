import type {
  InteractiveGameRenderableActor,
  InteractiveGameRenderableAnimation,
  InteractiveGameRenderableChip,
  InteractiveGameTileOverlay,
} from "@game-core/api/interactive";
import {
  projectActorSupportDecoration,
  projectThinWallActorDecoration,
  projectTileOverlayRender,
} from "@ruleset-ms/api/renderMetadata";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  projectLynxActorRenderSprite,
  projectLynxPortableItemRender,
} from "@ruleset-lynx/impl/renderRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

export function projectLynxRenderableChip(
  chip: Omit<InteractiveGameRenderableChip, "visual">,
): InteractiveGameRenderableChip {
  const visual =
    chip.failed && chip.endGameAnimationTileId !== null && chip.endGameAnimationFrame !== null
      ? {
          kind: "creature" as const,
          tileId: chip.endGameAnimationTileId,
          dir: MS_DIRECTION.north,
          moving: 0,
          frame: chip.endGameAnimationFrame,
        }
      : chip.hidden || chip.failed
        ? null
        : {
            kind: "creature" as const,
            tileId: chip.pushing ? MS_TILE.Pushing_Chip : MS_TILE.Chip,
            dir: chip.dir,
            moving: chip.moving,
            frame: Math.trunc(chip.moving / 2),
          };

  return {
    ...chip,
    visual,
  };
}

export function projectLynxRenderableActor(
  actor: Omit<InteractiveGameRenderableActor, "visual" | "decorations">,
  topId: number,
  bottomId: number,
  runtimeEntry: LynxStatefulActorRuntimeEntry | null = null,
): InteractiveGameRenderableActor {
  const decorations = [
    projectThinWallActorDecoration(actor.id, topId, bottomId),
    projectActorSupportDecoration(actor.id, topId, bottomId),
  ].filter((decoration): decoration is NonNullable<typeof decoration> => decoration !== null);

  return {
    ...actor,
    visual: projectLynxActorRenderSprite(actor, runtimeEntry),
    decorations,
  };
}

export function projectLynxRenderableAnimation(
  animation: Omit<InteractiveGameRenderableAnimation, "visual">,
): InteractiveGameRenderableAnimation {
  return {
    ...animation,
    visual: {
      kind: "creature",
      tileId: animation.tileId,
      dir: MS_DIRECTION.north,
      moving: 0,
      frame: animation.frame,
    },
  };
}

export function projectLynxRenderableOverlay(
  overlay: InteractiveGameTileOverlay,
): InteractiveGameTileOverlay {
  if (
    (overlay.kind === "carried-tool" || overlay.kind === "portable-item-state") &&
    typeof overlay.tileId === "number"
  ) {
    return {
      ...overlay,
      render: projectLynxPortableItemRender(overlay.tileId, overlay.kind === "carried-tool" ? 0.25 : 1) ?? undefined,
    };
  }

  return {
    ...overlay,
    render: projectTileOverlayRender(overlay) ?? undefined,
  };
}
