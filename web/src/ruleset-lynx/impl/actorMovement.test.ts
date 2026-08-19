import { describe, expect, it } from "vitest";
import { OCCUPANCY_TARGET_KIND } from "@game-core/impl/occupancy";
import {
  finishLynxActorMovement,
  startLynxActorMovement,
  type LynxActorMovementActor,
  type LynxActorMovementContext,
} from "@ruleset-lynx/impl/actorMovement";
import { createBoardAtZ, createCell, createEngineState } from "@ruleset-lynx/impl/testSupport";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createActor(overrides: Partial<LynxActorMovementActor> = {}): LynxActorMovementActor {
  return {
    id: MS_TILE.Ball,
    pos: 34,
    z: 1,
    dir: MS_DIRECTION.east,
    moving: 0,
    frame: 0,
    moveKind: "planar",
    ignoreIceFromAir: false,
    hidden: false,
    pushed: false,
    deferPush: false,
    deferPushArmed: false,
    dormant: false,
    ...overrides,
  };
}

function createContext(overrides: Partial<LynxActorMovementContext> = {}): LynxActorMovementContext {
  const cells = createBoardAtZ(1);
  const state = createEngineState(cells);
  return {
    state,
    actors: [],
    soundBits: {
      trapEntered: 1,
      waterSplash: 2,
      bombExplodes: 4,
      blockMoving: 8,
    },
    activeLayerZ: () => 1,
    canExitTile: () => true,
    treatsForcedFloorAsNormal: () => false,
    chipActsWallForMobs: () => false,
    queryTargetOccupancy: (pos, z) => ({
      kind: OCCUPANCY_TARGET_KIND.empty,
      pos,
      z,
      tileId: MS_TILE.Empty,
      claimed: false,
    }),
    interactionOutcome: () => ({
      chipFails: false,
      denyMove: false,
      removeMovingActor: false,
      removeTargetActor: false,
      preserveTarget: false,
      consumeTarget: false,
      transformTargetTileId: null,
    }),
    clearAnimationAt: () => {},
    applyMobExitFloorEffect: () => {},
    canActorEnter: () => true,
    arrivalOutcome: () => "none",
    effectiveTargetTileId: (tileId) => tileId,
    turnBlockedIceDirection: () => MS_DIRECTION.west,
    shouldTurnBlockedIce: () => true,
    applyIceWallTurn: (dir) => dir,
    resolveButtonEffects: () => 0,
    removeActor: () => {},
    animationTileId: () => null,
    waterSplashTileId: 100,
    bombExplosionTileId: 101,
    applyArrivalEffects: () => 0,
    isChipAt: () => false,
    recordFallingChipCollision: () => {},
    ...overrides,
  };
}

describe("lynx actor movement", () => {
  it("uses the blocked-ice turn hook when a move cannot start", () => {
    const context = createContext({
      canActorEnter: () => false,
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Ice, MS_TILE.Empty);
    const actor = createActor({ pos: 34, dir: MS_DIRECTION.east });

    const result = startLynxActorMovement(context, actor, MS_DIRECTION.east);

    expect(result.status).toBe("blocked");
    expect(actor.dir).toBe(MS_DIRECTION.west);
  });

  it("routes button arrivals through shared floor effects for blocks", () => {
    const context = createContext({
      arrivalOutcome: () => "button",
      resolveButtonEffects: () => 32,
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Button_Brown, MS_TILE.Empty);
    const actor = createActor({
      id: MS_TILE.Block,
      pos: 34,
      deferPush: true,
      deferPushArmed: true,
    });

    const arrival = finishLynxActorMovement(context, actor);

    expect(arrival.status).toBe("resolved");
    expect(arrival.soundEffects).toBe(32);
    expect(actor.deferPush).toBe(false);
    expect(actor.deferPushArmed).toBe(false);
  });

  it("records Chip collision when an actor lands from air through the support-family hook", () => {
    const recorded: number[] = [];
    const context = createContext({
      isChipAt: () => true,
      recordFallingChipCollision: (actor) => {
        recorded.push(actor.id);
      },
    });
    context.state.map.cells[34] = createCell(34, MS_TILE.Empty, MS_TILE.Empty);
    const actor = createActor({
      id: MS_TILE.BowlingBall,
      pos: 34,
      z: 1,
      moveKind: "air",
    });

    finishLynxActorMovement(context, actor);

    expect(recorded).toEqual([MS_TILE.BowlingBall]);
  });
});
