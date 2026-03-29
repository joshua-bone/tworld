import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import { bowlingBallArtworkSpriteId } from "@game-core/impl/bowlingBall";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  lookupMsActorFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
} from "@ruleset-ms/impl/elementRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function msPortableItemArtworkSpriteId(tileId: number): string | null {
  switch (lookupMsPortableItemFamilyRegistrationByTileId(tileId)?.familyId) {
    case "sandbag":
    case "hook":
      return "sandbag";
    case "bowling-ball":
      return "bowling_ball_still";
    default:
      return null;
  }
}

export function projectMsPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  const artworkSpriteId = msPortableItemArtworkSpriteId(tileId);
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

export function projectMsActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: MsStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  if (runtimeEntry?.kind === "bowling-ball" || lookupMsActorFamilyRegistration(actor.id)?.familyId === "bowling-ball") {
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
