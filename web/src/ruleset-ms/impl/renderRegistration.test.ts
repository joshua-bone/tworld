import { describe, expect, it } from "vitest";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { createMsInitialStatefulActorRuntime, type MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import {
  projectMsActorRenderSprite,
  projectMsPortableItemRender,
} from "@ruleset-ms/impl/renderRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

describe("ms render registration", () => {
  it("projects portable-item still visuals by family", () => {
    expect(projectMsPortableItemRender(MS_TILE.Sandbag, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Sandbag,
      artworkSpriteId: "sandbag",
      alpha: 0.25,
    });
    expect(projectMsPortableItemRender(MS_TILE.Hook, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Hook,
      artworkSpriteId: "sandbag",
      alpha: 0.25,
    });
    expect(projectMsPortableItemRender(MS_TILE.BowlingBall_Still, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.BowlingBall_Still,
      artworkSpriteId: "bowling_ball_still",
      alpha: 0.25,
    });
  });

  it("projects bowling ball actor visuals by runtime mode", () => {
    const movingEntry = createMsInitialStatefulActorRuntime(7, MS_TILE.BowlingBall);
    const stillEntry = {
      actorSerial: 7,
      kind: "bowling-ball",
      portableBacking: null,
      state: createStillBowlingBallState(),
    } as unknown as MsStatefulActorRuntimeEntry;

    expect(
      projectMsActorRenderSprite(
        { id: MS_TILE.BowlingBall, dir: MS_DIRECTION.east, moving: 0, frame: 0 },
        movingEntry,
      ),
    ).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
    expect(
      projectMsActorRenderSprite(
        { id: MS_TILE.BowlingBall, dir: MS_DIRECTION.east, moving: 0, frame: 0 },
        stillEntry,
      ),
    ).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_still",
    });
  });
});
