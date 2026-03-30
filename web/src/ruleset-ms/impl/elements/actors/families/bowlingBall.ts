import type { InteractiveGameRenderSprite } from "@game-core/api/interactive";
import {
  bowlingBallArtworkSpriteId,
  createMovingBowlingBallState,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export const MS_BOWLING_BALL_ACTOR_FAMILY = "bowling-ball" as const;
export const MS_BOWLING_BALL_ACTOR_ID = MS_TILE.BowlingBall;
export const MS_BOWLING_BALL_ACTOR_IDS = [MS_BOWLING_BALL_ACTOR_ID] as const;

export function createMsBowlingBallInitialRuntimeState(): BowlingBallState {
  return createMovingBowlingBallState();
}

export function projectMsBowlingBallActorRenderSprite(
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
    tileId: MS_BOWLING_BALL_ACTOR_ID,
    artworkSpriteId: bowlingBallArtworkSpriteId(mode),
    dir: actor.dir,
    moving: actor.moving,
    frame: actor.frame,
  };
}
