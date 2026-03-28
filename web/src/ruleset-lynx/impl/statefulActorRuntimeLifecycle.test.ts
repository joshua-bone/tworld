import { describe, expect, it } from "vitest";
import { findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { advanceLynxTicks, createCell, createLevel, createRequest, lynxRuntimeStateForTest } from "@ruleset-lynx/impl/testSupport";
import {
  attachLynxStatefulActorPortableBacking,
  detachLynxStatefulActorPortableBacking,
  restoreLynxStatefulActorRuntime,
  type LynxStatefulActorRuntimeEntry,
} from "@ruleset-lynx/impl/statefulActors";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";

function lynxRuntimeStore(
  session: { state: Parameters<typeof lynxRuntimeStateForTest>[0] },
): StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry> {
  return lynxRuntimeStateForTest(session.state).statefulActors as unknown as StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>;
}

function movingBowlingBallState(): LynxStatefulActorRuntimeEntry["state"] {
  return {
    mode: "moving",
    localInventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
    },
  };
}

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
    expect(findStatefulActorRuntime(lynxRuntimeStore(session), bowlingBall!.serial)).toEqual({
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
    restoreLynxStatefulActorRuntime(lynxRuntimeStore(session), {
      actorSerial: source!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });

    session = advanceLynxTicks(session, 4, MS_DIRECTION.east);

    const balls = session.actors.filter((actor) => actor.id === MS_TILE.Ball && !actor.hidden);
    expect(balls).toHaveLength(2);

    const clone = balls.find((actor) => actor.serial !== source!.serial);
    expect(findStatefulActorRuntime(lynxRuntimeStore(session), source!.serial)).toEqual({
      actorSerial: source!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });
    expect(findStatefulActorRuntime(lynxRuntimeStore(session), clone!.serial)).toEqual({
      actorSerial: clone!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });
  });

  it("tracks portable-backing attachment through the ruleset helper", () => {
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east), MS_TILE.Empty),
      ]),
    );

    const bowlingBall = session.actors.find((actor) => actor.id === MS_TILE.BowlingBall && !actor.hidden);
    expect(
      attachLynxStatefulActorPortableBacking(lynxRuntimeStore(session), bowlingBall!.serial, {
        family: "sandbag",
        portableItemSerial: 17,
      })?.portableBacking,
    ).toEqual({ family: "sandbag", portableItemSerial: 17 });
    expect(
      detachLynxStatefulActorPortableBacking(lynxRuntimeStore(session), bowlingBall!.serial)
        ?.portableBacking,
    ).toBeNull();
  });

  it("removes a family-owned runtime payload when an actor is destroyed", () => {
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
    restoreLynxStatefulActorRuntime(lynxRuntimeStore(session), {
      actorSerial: ball!.serial,
      kind: "bowling-ball",
      portableBacking: null,
      state: movingBowlingBallState(),
    });

    session = advanceLynxTicks(session, 4);

    expect(session.actors.find((actor) => actor.serial === ball!.serial)?.hidden).toBe(true);
    expect(findStatefulActorRuntime(lynxRuntimeStore(session), ball!.serial)).toBeUndefined();
  });
});
