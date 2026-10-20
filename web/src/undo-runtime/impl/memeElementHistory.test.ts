import { describe, expect, it } from "vitest";
import { replaySolutionCodec, type ReplayRecordedMove } from "@game-core/api/codec";
import type { EngineState } from "@game-core/api/model";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { advanceMsInteractiveSession, createMsInteractiveSession, createMsReplaySession } from "@ruleset-ms/impl/engine";
import { createEmptyCells, createLevel as createMsLevel, createRequest as createMsRequest } from "@ruleset-ms/impl/testSupport";
import { advanceLynxInteractiveSession, createLynxInteractiveSession, createLynxReplaySession } from "@ruleset-lynx/impl/engine";
import { createCell, createLevel as createLynxLevel, createRequest as createLynxRequest } from "@ruleset-lynx/impl/testSupport";
import { createMsUndoHistory, recordMsUndoTick, restoreMsUndoHistoryToTick } from "@undo-runtime/impl/msHistory";
import { createLynxUndoHistory, recordLynxUndoTick, restoreLynxUndoHistoryToTick } from "@undo-runtime/impl/lynxHistory";
import { captureLynxUndoCheckpoint, restoreLynxUndoCheckpoint } from "@undo-runtime/impl/lynxCheckpoint";
import { digestLynxInteractiveSession, digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";

const expectedMarks = [
  { pos: 34, z: 1, text: "A" }, { pos: 35, z: 1, text: " " },
  { pos: 36, z: 1, text: "B" }, { pos: 37, z: 1, text: "A" },
];
function memeProgress(state: EngineState) {
  return structuredClone({ hintTrail: state.hintTrail, boots: state.inventory.boots });
}

function createMsHintLevel() {
  const cells = createEmptyCells();
  cells[33]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
  cells[34]!.top.id = MS_TILE.Boots_Hint;
  cells[38]!.top.id = MS_TILE.Burglar;
  return createMsLevel({ cells, hintText: "A B", creaturePositions: [33] });
}
function createMsHintSession() {
  return createMsInteractiveSession(createMsRequest(), createMsHintLevel());
}
function createLynxHintSession() {
  return createLynxInteractiveSession(createLynxRequest(), {
    ...createLynxLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(34, MS_TILE.Boots_Hint), createCell(38, MS_TILE.Burglar),
    ], [33]), hintText: "A B",
  });
}
function createLynxTurnSession() {
  return createLynxInteractiveSession(createLynxRequest(), createLynxLevel([
    createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
    createCell(34, MS_TILE.Ice), createCell(35, MS_TILE.Button_RedTankCW),
    createCell(70, msCreatureTile(MS_TILE.RedTank, MS_DIRECTION.east)),
  ], [33, 70]));
}

function encodedReplay(moves: ReplayRecordedMove[]) {
  const encoded = replaySolutionCodec.encode(1, "TEST", 1000, {
    flags: 0, randomSlideDirection: MS_DIRECTION.north, stepping: 0, randomSeed: 123456789,
    moves: moves.map(({ when, dir }) => ({ when, dir })),
  });
  const decoded = replaySolutionCodec.decode(encoded);
  if (!decoded) throw new Error("expected an encoded solution replay");
  return decoded;
}

describe("Meme element undo and deterministic history replay", () => {
  it("restores MS hint cursor, spaces, marks and fifth boot before and after theft", () => {
    let session = createMsHintSession();
    let history = createMsUndoHistory(session, 5);
    const initialTick = session.state.engine.timer.currentTime;
    const states = new Map([[initialTick, memeProgress(session.state.engine)]]);
    const digests = new Map([[initialTick, digestMsInteractiveSession(session)]]);
    for (let index = 0; index < 28; index += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
      history = recordMsUndoTick(history, session, MS_DIRECTION.east);
      states.set(session.state.engine.timer.currentTime, memeProgress(session.state.engine));
      digests.set(session.state.engine.timer.currentTime, digestMsInteractiveSession(session));
    }
    expect(session.state.engine.hintTrail).toEqual({ nextIndex: 1, marks: expectedMarks });
    expect(session.state.engine.inventory.boots[4] ?? 0).toBe(0);
    let replayed = false;
    for (const [tick, expected] of states) {
      const restored = restoreMsUndoHistoryToTick(history, tick);
      replayed ||= restored.replayedEventCount > 0;
      expect(memeProgress(restored.session.state.engine)).toEqual(expected);
      expect(digestMsInteractiveSession(restored.session)).toBe(digests.get(tick));
    }
    expect(replayed).toBe(true);
    expect([...states.values()].some((state) => state.boots[4] === 1 && state.hintTrail?.nextIndex === 2)).toBe(true);
  });

  it("restores Lynx hint cursor, spaces, marks and fifth boot before and after theft", () => {
    let session = createLynxHintSession();
    let history = createLynxUndoHistory(session, 5);
    const initialTick = session.state.timer.currentTime;
    const states = new Map([[initialTick, memeProgress(session.state)]]);
    const digests = new Map([[initialTick, digestLynxInteractiveSession(session)]]);
    for (let index = 0; index < 28; index += 1) {
      session = advanceLynxInteractiveSession(session, MS_DIRECTION.east);
      history = recordLynxUndoTick(history, session, MS_DIRECTION.east);
      states.set(session.state.timer.currentTime, memeProgress(session.state));
      digests.set(session.state.timer.currentTime, digestLynxInteractiveSession(session));
    }
    expect(session.state.hintTrail).toEqual({ nextIndex: 1, marks: expectedMarks });
    expect(session.state.inventory.boots[4] ?? 0).toBe(0);
    let replayed = false;
    for (const [tick, expected] of states) {
      const restored = restoreLynxUndoHistoryToTick(history, tick);
      replayed ||= restored.replayedEventCount > 0;
      expect(memeProgress(restored.session.state)).toEqual(expected);
      expect(digestLynxInteractiveSession(restored.session)).toBe(digests.get(tick));
    }
    expect(replayed).toBe(true);
    expect([...states.values()].some((state) => state.boots[4] === 1 && state.hintTrail?.nextIndex === 2)).toBe(true);
  });

  it("restores an in-flight Lynx Red tank turn from a checkpoint and replay", () => {
    let session = createLynxTurnSession();
    let history = createLynxUndoHistory(session, 6);
    for (let index = 0; index < 10; index += 1) {
      const input = index === 0 ? MS_DIRECTION.east : MS_DIRECTION.none;
      session = advanceLynxInteractiveSession(session, input);
      history = recordLynxUndoTick(history, session, input);
    }
    for (const tick of [5, 6]) {
      const restored = restoreLynxUndoHistoryToTick(history, tick);
      expect(restored.replayedEventCount).toBe(tick - 5);
      expect(restored.session.actors.find((actor) => actor.id === MS_TILE.RedTank)).toMatchObject({
        pos: 72, dir: MS_DIRECTION.east, moving: tick === 5 ? 4 : 2, quarterTurnsPending: 1,
      });
      let resumed = restored.session;
      for (let index = tick; index < 8; index += 1) resumed = advanceLynxInteractiveSession(resumed, MS_DIRECTION.none);
      expect(resumed.actors.find((actor) => actor.id === MS_TILE.RedTank)).toMatchObject({
        pos: 104, dir: MS_DIRECTION.south, moving: 6,
      });
    }
  });

  it("isolates restored Lynx trail marks and pending turns from their checkpoint", () => {
    let session = createLynxTurnSession();
    session.state.inventory.boots[4] = 1;
    session.level.hintText = "A B";
    for (let index = 0; index < 6; index += 1) session = advanceLynxInteractiveSession(session, index === 0 ? MS_DIRECTION.east : 0);
    const checkpoint = captureLynxUndoCheckpoint(session);
    const digest = checkpoint.stateDigest;
    const restored = restoreLynxUndoCheckpoint(checkpoint);
    restored.state.hintTrail!.marks[0]!.text = "changed";
    restored.actors.find((actor) => actor.id === MS_TILE.RedTank)!.quarterTurnsPending = 3;
    expect(digestLynxInteractiveSession(checkpoint.sessionToken)).toBe(digest);
    expect(digestLynxInteractiveSession(restored)).not.toBe(digest);
  });
  it("reproduces MS hint marks and fifth boots from an encoded solution replay", () => {
    let manual = createMsHintSession();
    const level = createMsHintLevel();
    const expected = [];
    for (let index = 0; index < 28; index += 1) {
      manual = advanceMsInteractiveSession(manual, MS_DIRECTION.east);
      expected.push(memeProgress(manual.state.engine));
    }
    let replay = createMsReplaySession(createMsRequest(), level, encodedReplay(manual.recordedMoves));
    for (const progress of expected) {
      replay = advanceMsInteractiveSession(replay, MS_DIRECTION.none);
      expect(memeProgress(replay.state.engine)).toEqual(progress);
    }
  });

  it("reproduces Lynx hint marks and fifth boots from an encoded solution replay", () => {
    let manual = createLynxHintSession();
    const level = manual.level;
    const expected = [];
    for (let index = 0; index < 28; index += 1) {
      manual = advanceLynxInteractiveSession(manual, MS_DIRECTION.east);
      expected.push(memeProgress(manual.state));
    }
    let replay = createLynxReplaySession(createLynxRequest(), level, encodedReplay(manual.recordedMoves));
    for (const progress of expected) {
      replay = advanceLynxInteractiveSession(replay, MS_DIRECTION.none);
      expect(memeProgress(replay.state)).toEqual(progress);
    }
  });

});
