import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import { bowlingBallArtworkSpriteId } from "@game-core/impl/bowlingBall";
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
    case "bowling-ball":
      return "bowling_ball_still";
    default:
      return null;
  }
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
    const mode = runtimeEntry?.kind === "bowling-ball" ? runtimeEntry.state.mode : "moving";
    return {
      kind: "creature",
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: bowlingBallArtworkSpriteId(mode),
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
