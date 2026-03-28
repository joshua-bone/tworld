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
): InteractiveGameRenderableActor {
  const decorations = [
    projectThinWallActorDecoration(actor.id, topId, bottomId),
    projectActorSupportDecoration(actor.id, topId, bottomId),
  ].filter((decoration): decoration is NonNullable<typeof decoration> => decoration !== null);

  return {
    ...actor,
    visual: {
      kind: "creature",
      tileId: actor.id,
      dir: actor.dir,
      moving: actor.moving,
      frame: actor.frame,
    },
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
  return {
    ...overlay,
    render: projectTileOverlayRender(overlay) ?? undefined,
  };
}
