import { describe, expect, it, vi } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  applyLynxChipStartMoveStateByStrategy,
  blockedLynxChipMoveDirectionByStrategy,
  forcedLynxActorDirectionByStrategy,
} from "@ruleset-lynx/impl/movementStrategies";

describe("lynx movement strategies", () => {
  it("updates chip slide and ice carry state through the chip-like strategy", () => {
    const context = {
      hasSlideBoot: () => false,
      hasIceBoot: () => false,
      applyIceWallTurn: vi.fn((dir: number) => dir),
    };

    expect(
      applyLynxChipStartMoveStateByStrategy("chip-like", context, MS_TILE.Slide_East, 0, true, false),
    ).toEqual({
      chipIgnoreIceFromAir: false,
      chipSlideToken: true,
    });

    expect(
      applyLynxChipStartMoveStateByStrategy("chip-like", context, MS_TILE.Ice, MS_DIRECTION.east, true, true),
    ).toEqual({
      chipIgnoreIceFromAir: false,
      chipSlideToken: true,
    });
  });

  it("routes blocked chip ice turns through the strategy seam", () => {
    const applyIceWallTurn = vi.fn((dir: number) => dir ^ 0x0f);
    const context = {
      hasSlideBoot: () => false,
      hasIceBoot: () => false,
      applyIceWallTurn,
    };

    const nextDir = blockedLynxChipMoveDirectionByStrategy("chip-like", context, MS_TILE.Ice, MS_DIRECTION.east);
    expect(applyIceWallTurn).toHaveBeenCalledWith(MS_DIRECTION.west, MS_TILE.Ice);
    expect(nextDir).toBe(MS_DIRECTION.west ^ 0x0f);
  });

  it("routes actor forced movement through the actor strategy registry", () => {
    const actor = {
      id: MS_TILE.Ball,
      pos: 0,
      dir: MS_DIRECTION.south,
      moving: 0,
      frame: 0,
      hidden: false,
      pushed: false,
      deferPush: false,
      deferPushArmed: false,
      dormant: false,
      ignoreIceFromAir: false,
    };

    expect(
      forcedLynxActorDirectionByStrategy("creature-like", () => MS_DIRECTION.east, actor, MS_TILE.Slide_North, 4),
    ).toBe(MS_DIRECTION.east);
    expect(
      forcedLynxActorDirectionByStrategy("creature-like", () => MS_DIRECTION.east, actor, MS_TILE.Ice, 4),
    ).toBe(MS_DIRECTION.south);
    expect(
      forcedLynxActorDirectionByStrategy("creature-like", () => MS_DIRECTION.east, actor, MS_TILE.Empty, 0),
    ).toBe(0);
  });
});
