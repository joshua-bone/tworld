import { describe, expect, it } from "vitest";
import { findStatefulActorRuntime, setStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { advanceLynxTicks, createCell, createLevel, createRequest, lynxRuntimeStateForTest } from "@ruleset-lynx/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

describe("Lynx stateful actor runtime lifecycle", () => {
  it("seeds bowling ball runtime inventory for live actors", () => {
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east), MS_TILE.Empty),
      ]),
    );

    const bowlingBall = session.actors.find((actor) => actor.id === MS_TILE.BowlingBall && !actor.hidden);
    expect(bowlingBall).toBeTruthy();
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, bowlingBall!.serial)).toEqual({
      actorSerial: bowlingBall!.serial,
      kind: "bowling-ball",
      state: {
        mode: "moving",
        localInventory: {
          keys: [0, 0, 0, 0],
          boots: [0, 0, 0, 0],
        },
      },
    });
  });

  it("forks stateful runtime payloads onto cloner duplicates", () => {
    const buttonPos = 34;
    const clonerPos = 70;
    let session = createLynxInteractiveSession(
      createRequest(),
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Button_Red, MS_TILE.Empty),
          createCell(clonerPos, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east), MS_TILE.CloneMachine),
          createCell(clonerPos + 1, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { cloners: [{ from: buttonPos, to: clonerPos }] },
      ),
    );

    const source = session.actors.find((actor) => actor.id === MS_TILE.Ball && !actor.hidden);
    expect(source).toBeTruthy();
    setStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, {
      actorSerial: source!.serial,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });

    session = advanceLynxTicks(session, 4, MS_DIRECTION.east);

    const balls = session.actors.filter((actor) => actor.id === MS_TILE.Ball && !actor.hidden);
    expect(balls).toHaveLength(2);

    const clone = balls.find((actor) => actor.serial !== source!.serial);
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, source!.serial)).toEqual({
      actorSerial: source!.serial,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, clone!.serial)).toEqual({
      actorSerial: clone!.serial,
      kind: "bowling-ball",
      state: { mode: "moving" },
    });
  });

  it("removes a runtime payload when an actor is destroyed", () => {
    let session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east), MS_TILE.Empty),
        createCell(35, MS_TILE.Water, MS_TILE.Empty),
      ]),
    );

    const ball = session.actors.find((actor) => actor.id === MS_TILE.Ball && !actor.hidden);
    expect(ball).toBeTruthy();
    setStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, {
      actorSerial: ball!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    session = advanceLynxTicks(session, 4);

    expect(session.actors.find((actor) => actor.serial === ball!.serial)?.hidden).toBe(true);
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, ball!.serial)).toBeUndefined();
  });
});
