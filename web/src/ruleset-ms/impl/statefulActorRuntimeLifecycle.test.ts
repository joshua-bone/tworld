import { describe, expect, it } from "vitest";
import { findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { createEmptyCells, createLevel, createRequest, msStatefulActorsForTest, pos } from "@ruleset-ms/impl/testSupport";
import {
  attachMsStatefulActorPortableBacking,
  cloneMsStatefulActorRuntimeForCloner,
  detachMsStatefulActorPortableBacking,
  restoreMsStatefulActorRuntime,
  type MsStatefulActorRuntimeEntry,
} from "@ruleset-ms/impl/statefulActors";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";

function msRuntimeStore(session: Parameters<typeof msStatefulActorsForTest>[0]): StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry> {
  return msStatefulActorsForTest(session) as unknown as StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>;
}

function movingBowlingBallState(): MsStatefulActorRuntimeEntry["state"] {
  return {
    mode: "moving",
    localInventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
    },
  };
}

describe("MS stateful actor runtime lifecycle", () => {
  it("seeds bowling ball runtime inventory for live actors", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 1);
    const bowlingBallPos = pos(3, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[bowlingBallPos]!.top.id = msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, bowlingBallPos],
      }),
    );

    const bowlingBall = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.BowlingBall && !creature.hidden);
    expect(bowlingBall).toBeTruthy();
    expect(findStatefulActorRuntime(msRuntimeStore(session.state), bowlingBall!.serial)).toEqual({
      actorSerial: bowlingBall!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: {
        mode: "moving",
        localInventory: {
          keys: [0, 0, 0, 0],
          boots: [0, 0, 0, 0],
        },
      },
    });
  });

  it("forks stateful runtime payloads onto clone-machine creature duplicates", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const cloneMachinePos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[cloneMachinePos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[cloneMachinePos]!.bottom.id = MS_TILE.CloneMachine;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: cloneMachinePos }],
        creaturePositions: [chipPos, cloneMachinePos],
      }),
    );

    const sourceSerial = session.state.internal.cloneSourceSerialByPosition.get(`1:${cloneMachinePos}`);
    expect(sourceSerial).toBeTruthy();
    restoreMsStatefulActorRuntime(msRuntimeStore(session.state), {
      actorSerial: sourceSerial!,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const fireballs = session.state.internal.creatures.filter((creature) => creature.id === MS_TILE.Fireball && !creature.hidden);
    expect(fireballs).toHaveLength(1);

    const clone = fireballs.find((creature) => creature.serial !== sourceSerial);
    expect(clone).toBeTruthy();
    expect(findStatefulActorRuntime(msRuntimeStore(session.state), sourceSerial!)).toEqual({
      actorSerial: sourceSerial!,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });
    expect(findStatefulActorRuntime(msRuntimeStore(session.state), clone!.serial)).toEqual({
      actorSerial: clone!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });
  });

  it("tracks portable-backing attachment through the ruleset helper", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 1);
    const bowlingBallPos = pos(3, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[bowlingBallPos]!.top.id = msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, bowlingBallPos],
      }),
    );

    const bowlingBall = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.BowlingBall && !creature.hidden);
    expect(attachMsStatefulActorPortableBacking(msRuntimeStore(session.state), bowlingBall!.serial, {
      family: "sandbag",
      portableItemSerial: 17,
    })?.portableBacking).toEqual({ family: "sandbag", portableItemSerial: 17 });
    expect(detachMsStatefulActorPortableBacking(msRuntimeStore(session.state), bowlingBall!.serial)?.portableBacking).toBeNull();
  });

  it("exposes family-owned cloner cloning through a dedicated helper", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 1);
    const bowlingBallPos = pos(3, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[bowlingBallPos]!.top.id = msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, bowlingBallPos],
      }),
    );

    const bowlingBall = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.BowlingBall && !creature.hidden);
    const cloneSerial = bowlingBall!.serial + 100;

    expect(cloneMsStatefulActorRuntimeForCloner(msRuntimeStore(session.state), bowlingBall!.serial, cloneSerial)).toEqual({
      actorSerial: cloneSerial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });
  });

  it("removes a family-owned runtime payload when the creature is destroyed", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const ballPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[chipPos]!.bottom.id = MS_TILE.Water;
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
    );
    session.state.engine.inventory.boots[3] = 1;

    const ball = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Ball && !creature.hidden);
    expect(ball).toBeTruthy();
    restoreMsStatefulActorRuntime(msRuntimeStore(session.state), {
      actorSerial: ball!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.creatures.find((creature) => creature.serial === ball!.serial)?.hidden).toBe(true);
    expect(findStatefulActorRuntime(msRuntimeStore(session.state), ball!.serial)).toBeUndefined();
  });
});
