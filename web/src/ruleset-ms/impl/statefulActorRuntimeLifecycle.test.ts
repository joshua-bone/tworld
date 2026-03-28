import { describe, expect, it } from "vitest";
import { findStatefulActorRuntime, setStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { createEmptyCells, createLevel, createRequest, msStatefulActorsForTest, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

describe("MS stateful actor runtime lifecycle", () => {
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
    setStatefulActorRuntime(msStatefulActorsForTest(session.state), {
      actorSerial: sourceSerial!,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const fireballs = session.state.internal.creatures.filter((creature) => creature.id === MS_TILE.Fireball && !creature.hidden);
    expect(fireballs).toHaveLength(1);

    const clone = fireballs.find((creature) => creature.serial !== sourceSerial);
    expect(clone).toBeTruthy();
    expect(findStatefulActorRuntime(msStatefulActorsForTest(session.state), sourceSerial!)).toEqual({
      actorSerial: sourceSerial!,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
    expect(findStatefulActorRuntime(msStatefulActorsForTest(session.state), clone!.serial)).toEqual({
      actorSerial: clone!.serial,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
  });

  it("removes a creature runtime payload when the creature is destroyed", () => {
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
    setStatefulActorRuntime(msStatefulActorsForTest(session.state), {
      actorSerial: ball!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.creatures.find((creature) => creature.serial === ball!.serial)?.hidden).toBe(true);
    expect(findStatefulActorRuntime(msStatefulActorsForTest(session.state), ball!.serial)).toBeUndefined();
  });
});
