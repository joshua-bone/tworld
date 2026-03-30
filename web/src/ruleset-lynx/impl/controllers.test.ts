import { describe, expect, it } from "vitest";
import {
  chooseLynxCreatureMoveForTick,
  type LynxCreatureControllerActor,
  type LynxCreatureControllerContext,
} from "@ruleset-lynx/impl/controllers";
import { MS_DIRECTION, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

function createActor(overrides: Partial<LynxCreatureControllerActor> = {}): LynxCreatureControllerActor {
  return {
    id: MS_TILE.Bug,
    pos: 5,
    z: 1,
    dir: MS_DIRECTION.north,
    intentDir: 0,
    forcedDir: 0,
    teleported: false,
    ...overrides,
  };
}

function createContext(overrides: Partial<LynxCreatureControllerContext> = {}): LynxCreatureControllerContext {
  return {
    chipPos: 0,
    currentTime: 0,
    stepping: 0,
    withLayer: (_z, run) => run(),
    floorAt: () => MS_TILE.Empty,
    canStart: () => false,
    chooseBlobDirection: () => MS_DIRECTION.north,
    chooseWalkerRandomDirection: (dir) => dir,
    slideDirection: () => MS_DIRECTION.north,
    treatsForcedFloorAsNormal: () => false,
    ...overrides,
  };
}

describe("lynx controllers", () => {
  it("forces teleported actors to continue in their current direction", () => {
    const actor = createActor({
      dir: MS_DIRECTION.west,
      teleported: true,
    });

    chooseLynxCreatureMoveForTick(createContext(), actor);

    expect(actor.forcedDir).toBe(MS_DIRECTION.west);
    expect(actor.intentDir).toBe(0);
    expect(actor.teleported).toBe(false);
  });

  it("holds direction on clone and trap floors", () => {
    const actor = createActor({
      id: MS_TILE.Glider,
      dir: MS_DIRECTION.east,
    });
    const context = createContext({
      floorAt: () => MS_TILE.CloneMachine,
    });

    chooseLynxCreatureMoveForTick(context, actor);

    expect(actor.intentDir).toBe(MS_DIRECTION.east);
    expect(actor.forcedDir).toBe(0);
  });

  it("routes slide and ice forced movement through the forced-floor helper", () => {
    const slideActor = createActor({
      id: MS_TILE.Glider,
      dir: MS_DIRECTION.north,
    });
    chooseLynxCreatureMoveForTick(
      createContext({
        currentTime: 1,
        floorAt: () => MS_TILE.Slide_East,
        slideDirection: () => MS_DIRECTION.east,
      }),
      slideActor,
    );
    expect(slideActor.forcedDir).toBe(MS_DIRECTION.east);

    const iceActor = createActor({
      id: MS_TILE.Glider,
      dir: MS_DIRECTION.south,
    });
    chooseLynxCreatureMoveForTick(
      createContext({
        currentTime: 1,
        floorAt: () => MS_TILE.Ice,
      }),
      iceActor,
    );
    expect(iceActor.forcedDir).toBe(MS_DIRECTION.south);
  });

  it("lets teeth fall back to the secondary chase direction when the primary one is blocked", () => {
    const actorPos = 1 + MS_GRID_WIDTH;
    const actor = createActor({
      id: MS_TILE.Teeth,
      pos: actorPos,
    });
    const context = createContext({
      chipPos: actorPos + MS_GRID_WIDTH * 2 + 1,
      canStart: (_actor, dir) => dir === MS_DIRECTION.east,
    });

    chooseLynxCreatureMoveForTick(context, actor);

    expect(actor.intentDir).toBe(MS_DIRECTION.east);
  });

  it("uses the walker random fallback when the forward choice is blocked", () => {
    const actor = createActor({
      id: MS_TILE.Walker,
      dir: MS_DIRECTION.south,
    });
    const context = createContext({
      canStart: () => false,
      chooseWalkerRandomDirection: () => MS_DIRECTION.west,
    });

    chooseLynxCreatureMoveForTick(context, actor);

    expect(actor.intentDir).toBe(MS_DIRECTION.west);
  });
});
