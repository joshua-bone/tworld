import { describe, expect, it } from "vitest";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { createLynxInitialStatefulActorRuntime, type LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import {
  projectLynxActorRenderSprite,
  projectLynxPortableItemRender,
} from "@ruleset-lynx/impl/renderRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

describe("lynx render registration", () => {
  it("projects portable-item still visuals by family", () => {
    expect(projectLynxPortableItemRender(MS_TILE.Sandbag, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Sandbag,
      artworkSpriteId: "sandbag",
      alpha: 0.25,
    });
    expect(projectLynxPortableItemRender(MS_TILE.Hook, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Hook,
      artworkSpriteId: "hook",
      alpha: 0.25,
    });
    expect(projectLynxPortableItemRender(MS_TILE.BowlingBall_Still, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.BowlingBall_Still,
      artworkSpriteId: "bowling_ball_still",
      alpha: 0.25,
    });
  });

  it("projects bowling ball actor visuals by runtime mode", () => {
    const movingEntry = createLynxInitialStatefulActorRuntime(7, MS_TILE.BowlingBall);
    const stillEntry = {
      actorSerial: 7,
      kind: "bowling-ball",
      portableBacking: null,
      state: createStillBowlingBallState(),
    } as unknown as LynxStatefulActorRuntimeEntry;

    expect(
      projectLynxActorRenderSprite(
        { id: MS_TILE.BowlingBall, dir: MS_DIRECTION.east, moving: 0, frame: 0 },
        movingEntry,
      ),
    ).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
    expect(
      projectLynxActorRenderSprite(
        { id: MS_TILE.BowlingBall, dir: MS_DIRECTION.east, moving: 0, frame: 0 },
        stillEntry,
      ),
    ).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_still",
    });
  });
});
