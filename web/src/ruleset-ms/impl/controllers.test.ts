import { describe, expect, it } from "vitest";
import {
  applyBlockedMsCreatureAttempt,
  chooseMsCreatureDirection,
  type MsCreatureControllerContext,
  type MsCreatureControllerCreature,
} from "@ruleset-ms/impl/controllers";
import { MS_DIRECTION, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

function createCreature(overrides: Partial<MsCreatureControllerCreature> = {}): MsCreatureControllerCreature {
  return {
    id: MS_TILE.Bug,
    dir: MS_DIRECTION.north,
    tdir: MS_DIRECTION.none,
    pos: 5,
    released: false,
    turning: false,
    hasMoved: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    ...overrides,
  };
}

function createContext(overrides: Partial<MsCreatureControllerContext> = {}): MsCreatureControllerContext {
  let controllerDir: number = MS_DIRECTION.none;
  return {
    currentTime: 0,
    stepping: 0,
    chipPos: 0,
    floorAt: () => MS_TILE.Empty,
    getControllerDir: () => controllerDir,
    setControllerDir: (dir) => {
      controllerDir = dir;
    },
    canMove: () => false,
    updateCreatureTile: () => {},
    randomize3: () => {},
    randomize4: () => {},
    ...overrides,
  };
}

describe("ms controllers", () => {
  it("uses the global controller direction for bugs on trap-like floors", () => {
    const creature = createCreature({
      id: MS_TILE.Bug,
      pos: 14,
    });
    const context = createContext({
      floorAt: () => MS_TILE.Beartrap,
      getControllerDir: () => MS_DIRECTION.east,
    });

    const dir = chooseMsCreatureDirection(context, creature);

    expect(dir).toBe(MS_DIRECTION.east);
    expect(creature.tdir).toBe(MS_DIRECTION.east);
  });

  it("lets teeth fall back to the secondary chase direction when the primary one is blocked", () => {
    const creaturePos = 1 + MS_GRID_WIDTH;
    const creature = createCreature({
      id: MS_TILE.Teeth,
      pos: creaturePos,
    });
    let lastControllerDir: number = MS_DIRECTION.none;
    const context = createContext({
      chipPos: creaturePos + MS_GRID_WIDTH * 2 + 1,
      setControllerDir: (dir) => {
        lastControllerDir = dir;
      },
      canMove: (_creature, dir) => dir === MS_DIRECTION.east,
    });

    const dir = chooseMsCreatureDirection(context, creature);

    expect(dir).toBe(MS_DIRECTION.east);
    expect(creature.tdir).toBe(MS_DIRECTION.east);
    expect(lastControllerDir).toBe(MS_DIRECTION.east);
  });

  it("marks tanks as having moved when they fail to move off normal floor", () => {
    const creature = createCreature({
      id: MS_TILE.Tank,
      dir: MS_DIRECTION.south,
    });
    const context = createContext();

    const dir = chooseMsCreatureDirection(context, creature);

    expect(dir).toBe(MS_DIRECTION.none);
    expect(creature.hasMoved).toBe(true);
    expect(creature.tdir).toBe(MS_DIRECTION.none);
  });

  it("does not apply blocked-turn feedback while on clone machines or traps", () => {
    const creature = createCreature({
      dir: MS_DIRECTION.north,
    });
    let updates = 0;
    const context = {
      floorAt: () => MS_TILE.CloneMachine,
      updateCreatureTile: () => {
        updates += 1;
      },
    };

    applyBlockedMsCreatureAttempt(context, creature, MS_DIRECTION.east);

    expect(creature.dir).toBe(MS_DIRECTION.north);
    expect(updates).toBe(0);
  });
});
