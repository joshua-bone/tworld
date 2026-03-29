import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  lookupLynxActorFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
} from "@ruleset-lynx/impl/elementRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function lynxPortableItemArtworkSpriteId(tileId: number): string | null {
  switch (lookupLynxPortableItemFamilyRegistrationByTileId(tileId)?.familyId) {
    case "sandbag":
    case "hook":
      return "sandbag";
    default:
      return null;
  }
}

function lynxBowlingBallArtworkSpriteId(
  runtimeEntry: LynxStatefulActorRuntimeEntry | null,
): string {
  const mode = runtimeEntry?.kind === "bowling-ball" ? (runtimeEntry.state as { mode?: string }).mode : "moving";
  return mode === "still" ? "bowling_ball_still" : "bowling_ball_moving";
}

export function projectLynxPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  const artworkSpriteId = lynxPortableItemArtworkSpriteId(tileId);
  if (!artworkSpriteId) {
    return null;
  }

  return {
    mode: "tile",
    tileId,
    artworkSpriteId,
    alpha,
  };
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
  if (runtimeEntry?.kind === "bowling-ball" || lookupLynxActorFamilyRegistration(actor.id)?.familyId === "bowling-ball") {
    return {
      kind: "creature",
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: lynxBowlingBallArtworkSpriteId(runtimeEntry),
      dir: actor.dir,
      moving: actor.moving,
      frame: actor.frame,
    };
  }

  return {
    kind: "creature",
    tileId: actor.id,
    dir: actor.dir ?? MS_DIRECTION.none,
    moving: actor.moving,
    frame: actor.frame,
  };
}
