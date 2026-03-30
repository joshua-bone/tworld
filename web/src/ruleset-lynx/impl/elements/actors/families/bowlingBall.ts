import type { InteractiveGameRenderSprite } from "@game-core/api/interactive";
import {
  bowlingBallArtworkSpriteId,
  createMovingBowlingBallState,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export const LYNX_BOWLING_BALL_ACTOR_FAMILY = "bowling-ball" as const;
export const LYNX_BOWLING_BALL_ACTOR_ID = MS_TILE.BowlingBall;
export const LYNX_BOWLING_BALL_ACTOR_IDS = [LYNX_BOWLING_BALL_ACTOR_ID] as const;

export function createLynxBowlingBallInitialRuntimeState(): BowlingBallState {
  return createMovingBowlingBallState();
}

export function projectLynxBowlingBallActorRenderSprite(
  actor: {
    dir: number;
    moving: number;
    frame: number;
  },
  state: BowlingBallState | null,
): InteractiveGameRenderSprite {
  const mode = state?.mode ?? "moving";
  return {
    kind: "creature",
    tileId: LYNX_BOWLING_BALL_ACTOR_ID,
    artworkSpriteId: bowlingBallArtworkSpriteId(mode),
    dir: actor.dir,
    moving: actor.moving,
    frame: actor.frame,
  };
}
