import { describe, expect, it } from "vitest";
import { encodeRuntimeInputCode, GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import { expectOverlayPresent } from "@game-core/impl/testOverlays";
import { findStatefulActorRuntime, setStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import {
  createCell as createLynxCell,
  createLevel as createLynxLevel,
  createRequest as createLynxRequest,
  lynxPortableItems,
  lynxRuntimeStateForTest,
} from "@ruleset-lynx/impl/testSupport";
import {
  reconcileLynxPortableToolProjection,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import { advanceLynxInteractiveSession, createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import {
  createEmptyCells as createMsEmptyCells,
  createLevel as createMsLevel,
  createRequest as createMsRequest,
  msStatefulActorsForTest,
  pos as msPos,
} from "@ruleset-ms/impl/testSupport";
import { reconcileMsPortableToolProjection } from "@ruleset-ms/impl/portableItems";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { createLynxUndoHistory, recordLynxUndoTick, restoreLynxUndoHistoryToTick } from "@undo-runtime/impl/lynxHistory";
import { createMsUndoHistory, recordMsUndoTick, restoreMsUndoHistoryToTick } from "@undo-runtime/impl/msHistory";

describe("stateful element undo/projection characterization", () => {
  for (const [label, tileId] of [
    ["sandbag", MS_TILE.Sandbag],
    ["hook", MS_TILE.Hook],
  ] as const) {
    it(`replays MS ${label} primed drops through undo restore without losing the projected overlay`, () => {
      const cells = createMsEmptyCells();
      const chipPos = msPos(8, 10);
      cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

      let session = createMsInteractiveSession(
        createMsRequest(),
        createMsLevel({
          cells,
          creaturePositions: [chipPos],
        }),
      );
      session.state.engine.inventory.tools = [tileId];
      reconcileMsPortableToolProjection(session.state.internal.portableTools, session.state.engine.inventory);

      let history = createMsUndoHistory(session, 2);
      const primeInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
      session = advanceMsInteractiveSession(session, primeInput);
      history = recordMsUndoTick(history, session, primeInput);
      session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
      history = recordMsUndoTick(history, session, GAME_INPUT_CODES.none);

      const restored = restoreMsUndoHistoryToTick(history, 0);

      expect(restored.replayedEventCount).toBeGreaterThan(0);
      expect(restored.session.state.internal.portableTools.primedToolDrop).toEqual({
        tileId,
        pos: chipPos,
        z: 1,
      });
      expect(
        restored.session.state.internal.portableTools.portableItems.find((item) => item.state.mode === "primed")?.tileId,
      ).toBe(tileId);

      const frame = projectMsInteractiveFrame(restored.session, "tick");
      expectOverlayPresent(frame.tileOverlays, {
        z: 1,
        pos: chipPos,
        kind: "carried-tool",
        tileId,
      });
    });

    it(`replays Lynx ${label} primed drops through undo restore without losing the projected overlay`, () => {
      const chipPos = 33;
      let session = createLynxInteractiveSession(
        createLynxRequest(),
        createLynxLevel([createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east))], [chipPos]),
      );
      session.state.inventory.tools = [tileId];
      const runtime = lynxRuntimeStateForTest(session.state);
      const portableTools = runtime.portableTools as LynxPortableToolStateStore;
      reconcileLynxPortableToolProjection(portableTools, session.state.inventory);

      let history = createLynxUndoHistory(session, 2);
      const primeInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
      session = advanceLynxInteractiveSession(session, primeInput);
      history = recordLynxUndoTick(history, session, primeInput);
      session = advanceLynxInteractiveSession(session, GAME_INPUT_CODES.none);
      history = recordLynxUndoTick(history, session, GAME_INPUT_CODES.none);

      const restored = restoreLynxUndoHistoryToTick(history, 0);

      expect(restored.replayedEventCount).toBeGreaterThan(0);
      expect(
        (lynxRuntimeStateForTest(restored.session.state).portableTools as LynxPortableToolStateStore).primedToolDrop,
      ).toEqual({
        tileId,
        pos: chipPos,
        z: 1,
      });
      expect(lynxPortableItems(restored.session.state).find((item) => item.state.mode === "primed")?.tileId).toBe(tileId);

      const frame = projectLynxInteractiveFrame(restored.session, "tick");
      expectOverlayPresent(frame.tileOverlays, {
        z: 1,
        pos: chipPos,
        kind: "carried-tool",
        tileId,
      });
    });
  }

  it("restores a thrown MS bowling ball through undo with runtime inventory and moving projection intact", () => {
    const cells = createMsEmptyCells();
    const chipPos = msPos(8, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.inventory.tools = [MS_TILE.BowlingBall_Still];
    reconcileMsPortableToolProjection(session.state.internal.portableTools, session.state.engine.inventory);
    const carried = session.state.internal.portableTools.portableItems.find(
      (item) => item.state.mode === "carried" && item.family === "bowling-ball",
    );
    const bowlingBallState = carried?.bowlingBallState;
    const localInventory = bowlingBallState?.localInventory;
    if (!bowlingBallState || !localInventory) {
      throw new Error("expected carried bowling ball");
    }
    localInventory.keys = [1, 0, 0, 0];
    localInventory.boots = [0, 1, 0, 0];

    let history = createMsUndoHistory(session, 2);
    const throwInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
    session = advanceMsInteractiveSession(session, throwInput);
    history = recordMsUndoTick(history, session, throwInput);

    const restored = restoreMsUndoHistoryToTick(history, 0);
    const bowlingBall = restored.session.state.internal.creatures.find(
      (creature) => creature.id === MS_TILE.BowlingBall && !creature.hidden,
    );

    expect(restored.replayedEventCount).toBeGreaterThan(0);
    expect(restored.session.state.engine.inventory.tools).toEqual([0]);
    expect(findStatefulActorRuntime(msStatefulActorsForTest(restored.session.state), bowlingBall!.serial)).toMatchObject({
      actorSerial: bowlingBall!.serial,
      kind: "bowling-ball",
      state: {
        mode: "moving",
        localInventory: {
          keys: [1, 0, 0, 0],
          boots: [0, 1, 0, 0],
        },
      },
    });

    const frame = projectMsInteractiveFrame(restored.session, "tick");
    expect(frame.render?.actors.find((actor) => actor.serial === bowlingBall!.serial)?.visual).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
  });

  it("restores a thrown Lynx bowling ball through undo with runtime inventory and moving projection intact", () => {
    const chipPos = 33;
    let session = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel([createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east))], [chipPos]),
    );
    session.state.inventory.tools = [MS_TILE.BowlingBall_Still];
    const portableTools = lynxRuntimeStateForTest(session.state).portableTools as LynxPortableToolStateStore;
    reconcileLynxPortableToolProjection(portableTools, session.state.inventory);
    const carried = lynxPortableItems(session.state).find(
      (item) => item.state.mode === "carried" && item.family === "bowling-ball",
    );
    const bowlingBallState = carried?.bowlingBallState;
    const localInventory = bowlingBallState?.localInventory;
    if (!bowlingBallState || !localInventory) {
      throw new Error("expected carried bowling ball");
    }
    localInventory.keys = [1, 0, 0, 0];
    localInventory.boots = [0, 1, 0, 0];

    let history = createLynxUndoHistory(session, 2);
    const throwInput = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);
    session = advanceLynxInteractiveSession(session, throwInput);
    history = recordLynxUndoTick(history, session, throwInput);

    const restored = restoreLynxUndoHistoryToTick(history, 0);
    const bowlingBall = restored.session.actors.find((actor) => actor.id === MS_TILE.BowlingBall && !actor.hidden);

    expect(restored.replayedEventCount).toBeGreaterThan(0);
    expect(restored.session.state.inventory.tools).toEqual([0]);
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(restored.session.state).statefulActors, bowlingBall!.serial)).toMatchObject({
      actorSerial: bowlingBall!.serial,
      kind: "bowling-ball",
      state: {
        mode: "moving",
        localInventory: {
          keys: [1, 0, 0, 0],
          boots: [0, 1, 0, 0],
        },
      },
    });

    const frame = projectLynxInteractiveFrame(restored.session, "tick");
    expect(frame.render?.actors.find((actor) => actor.serial === bowlingBall!.serial)?.visual).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
  });

  it("restores MS stateful actor runtime entries and serial-aware render actors through undo", () => {
    const cells = createMsEmptyCells();
    const chipPos = msPos(8, 10);
    const bugPos = msPos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[bugPos]!.top.id = msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west);

    let session = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells,
        creaturePositions: [chipPos, bugPos],
      }),
    );

    const bug = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Bug && !creature.hidden);
    expect(bug).toBeTruthy();
    setStatefulActorRuntime(msStatefulActorsForTest(session.state), {
      actorSerial: bug!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    let history = createMsUndoHistory(session, 2);
    session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
    history = recordMsUndoTick(history, session, GAME_INPUT_CODES.none);

    const restored = restoreMsUndoHistoryToTick(history, -1);
    expect(findStatefulActorRuntime(msStatefulActorsForTest(restored.session.state), bug!.serial)).toEqual({
      actorSerial: bug!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    const frame = projectMsInteractiveFrame(restored.session, "tick");
    expect(frame.render?.actors.find((actor) => actor.serial === bug!.serial)?.id).toBe(MS_TILE.Bug);
  });

  it("restores Lynx stateful actor runtime entries and serial-aware render actors through undo", () => {
    const chipPos = 33;
    const bugPos = 34;
    let session = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel(
        [
          createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
          createLynxCell(bugPos, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west)),
        ],
        [chipPos, bugPos],
      ),
    );

    const bug = session.actors.find((actor) => actor.id === MS_TILE.Bug && !actor.hidden);
    expect(bug).toBeTruthy();
    setStatefulActorRuntime(lynxRuntimeStateForTest(session.state).statefulActors, {
      actorSerial: bug!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    let history = createLynxUndoHistory(session, 2);
    session = advanceLynxInteractiveSession(session, GAME_INPUT_CODES.none);
    history = recordLynxUndoTick(history, session, GAME_INPUT_CODES.none);

    const restored = restoreLynxUndoHistoryToTick(history, -1);
    expect(findStatefulActorRuntime(lynxRuntimeStateForTest(restored.session.state).statefulActors, bug!.serial)).toEqual({
      actorSerial: bug!.serial,
      kind: "ghost",
      state: { mode: "phasing" },
    });

    const frame = projectLynxInteractiveFrame(restored.session, "tick");
    expect(frame.render?.actors.find((actor) => actor.serial === bug!.serial)?.id).toBe(MS_TILE.Bug);
  });
});
