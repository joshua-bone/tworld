import { describe, expect, it, vi } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  type LynxInteractiveSessionState,
} from "@ruleset-lynx/impl/engine";
import type { MsLevel } from "@ruleset-ms/api/level";
import {
  MS_DIRECTION,
  MS_GRID_WIDTH,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  type MsInteractiveSessionState,
} from "@ruleset-ms/impl/engine";
import { digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";
import {
  createMsUndoHistory,
  forkMsUndoHistory,
  recordMsUndoTick,
  restoreMsUndoHistoryToTick,
} from "@undo-runtime/impl/msHistory";
import { digestLynxInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import {
  captureLynxUndoCheckpoint,
  restoreLynxUndoCheckpoint,
} from "@undo-runtime/impl/lynxCheckpoint";
import {
  createLynxUndoHistory,
  forkLynxUndoHistory,
  recordLynxUndoTick,
  restoreLynxUndoHistoryToTick,
} from "@undo-runtime/impl/lynxHistory";
import { latestUndoTick, nextUndoTickEvent, previousUndoTick } from "@undo-runtime/impl/history";

function pos(x: number, y: number): number {
  return y * MS_GRID_WIDTH + x;
}

function createMsEmptyCells(): EngineMapCell[] {
  return Array.from({ length: 32 * 32 }, (_, cellPos) => ({
    position: {
      x: cellPos % 32,
      y: Math.floor(cellPos / 32),
      pos: cellPos,
    },
    top: { id: MS_TILE.Empty, state: 0 },
    bottom: { id: MS_TILE.Empty, state: 0 },
  }));
}

function createLynxCell(cellPos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: {
      x: cellPos % 32,
      y: Math.floor(cellPos / 32),
      pos: cellPos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createMsLevel(overrides: Partial<MsLevel> & { cells: EngineMapCell[]; creaturePositions?: number[] }): MsLevel {
  return {
    number: 1,
    timeLimitTicks: 200,
    chipsNeeded: 0,
    hintText: "",
    traps: [],
    cloners: [],
    creaturePositions: overrides.creaturePositions ?? [],
    statusFlags: 0,
    ...overrides,
  };
}

function createLynxLevel(
  cells: EngineMapCell[],
  creaturePositions?: number[],
  hintText = "",
): LynxLevel {
  const board = Array.from({ length: 32 * 32 }, (_, cellPos) => createLynxCell(cellPos, MS_TILE.Empty));
  for (const cell of cells) {
    board[cell.position.pos] = cell;
  }

  return {
    number: 1,
    timeLimitTicks: 4000,
    chipsNeeded: 0,
    hintText,
    cells: board,
    traps: [],
    cloners: [],
    creaturePositions:
      creaturePositions ??
      cells.filter((cell) => cell.top.id !== MS_TILE.Empty || cell.bottom.id !== MS_TILE.Empty).map((cell) => cell.position.pos),
    statusFlags: 0,
  };
}

function createMsRequest() {
  return {
    seriesFile: "undo-ms.dac",
    levelNumber: 1,
    ruleset: "MS" as const,
    randomSeed: 123456789,
  };
}

function createLynxRequest() {
  return {
    seriesFile: "undo-lynx.dac",
    levelNumber: 1,
    ruleset: "Lynx" as const,
    randomSeed: 123456789,
  };
}

function createScenarioSession(): MsInteractiveSessionState {
  const cells = createMsEmptyCells();
  const chipPos = pos(2, 2);
  const blockPos = pos(3, 2);
  const waterPos = pos(4, 2);
  cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
  cells[blockPos]!.top.id = MS_TILE.Block_Static;
  cells[waterPos]!.top.id = MS_TILE.Water;
  cells[blockPos]!.bottom.id = MS_TILE.Button_Brown;

  return createMsInteractiveSession(
    createMsRequest(),
    createMsLevel({
      cells,
      creaturePositions: [blockPos],
    }),
  );
}

function createLynxCheckpointScenarioSession(): LynxInteractiveSessionState {
  const chipPos = pos(1, 1);
  const bugPos = pos(2, 1);
  return createLynxInteractiveSession(
    createLynxRequest(),
    createLynxLevel(
      [
        createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
        createLynxCell(bugPos, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west)),
      ],
      [chipPos, bugPos],
      "undo checkpoint hint",
    ),
  );
}

function createLynxReplayScenarioSession(): LynxInteractiveSessionState {
  const chipPos = pos(1, 1);
  const firePos = pos(2, 1);
  return createLynxInteractiveSession(
    createLynxRequest(),
    createLynxLevel([
      createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createLynxCell(firePos, MS_TILE.Fire),
    ]),
  );
}

describe("MS undo checkpoints", () => {
  it("captures checkpoints by value instead of retaining live references", () => {
    const session = createScenarioSession();
    const checkpoint = captureMsUndoCheckpoint(session);
    const before = checkpoint.stateDigest;

    session.state.internal.currentInput = GAME_INPUT_CODES.east;
    session.state.engine.timer.currentTime = 99;

    expect(checkpoint.stateDigest).toBe(before);
    expect(digestMsInteractiveSession(restoreMsUndoCheckpoint(checkpoint))).toBe(before);
  });
});

describe("Lynx undo checkpoints", () => {
  it("captures checkpoints by value instead of retaining live references", () => {
    const session = createLynxCheckpointScenarioSession();
    const checkpoint = captureLynxUndoCheckpoint(session);
    const before = checkpoint.stateDigest;

    session.queuedChipInputCode = GAME_INPUT_CODES.east | GAME_INPUT_CODES.north;
    session.level.hintText = "mutated";
    session.actors[0]!.hidden = true;

    expect(checkpoint.stateDigest).toBe(before);
    expect(digestLynxInteractiveSession(restoreLynxUndoCheckpoint(checkpoint))).toBe(before);
  });
});

describe("MS undo history", () => {
  it("lazily materializes the initial checkpoint snapshot", () => {
    const session = createScenarioSession();
    const cloneSpy = vi.spyOn(globalThis, "structuredClone");

    try {
      const history = createMsUndoHistory(session, 2, { lazyInitialCheckpoint: true });

      expect(cloneSpy).not.toHaveBeenCalled();

      void history.initialCheckpoint.sessionToken;
      expect(cloneSpy).toHaveBeenCalledTimes(1);

      void history.initialCheckpoint.stateDigest;
      expect(cloneSpy).toHaveBeenCalledTimes(1);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  it("records every tick including none inputs", () => {
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, 2);

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      session = advanceMsInteractiveSession(session, inputCode);
      history = recordMsUndoTick(history, session, inputCode);
    }

    expect(history.events.map((event) => [event.tick, event.inputCode])).toEqual([
      [0, GAME_INPUT_CODES.east],
      [1, GAME_INPUT_CODES.none],
      [2, GAME_INPUT_CODES.none],
    ]);
    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([1]);
  });

  it("restores exact MS session state by checkpoint plus replay", () => {
    const inputs = [
      GAME_INPUT_CODES.east,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
    ];
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, 2);
    const originalDigests = new Map<number, string>([
      [session.state.engine.timer.currentTime, digestMsInteractiveSession(session)],
    ]);

    for (const inputCode of inputs) {
      session = advanceMsInteractiveSession(session, inputCode);
      history = recordMsUndoTick(history, session, inputCode);
      originalDigests.set(session.state.engine.timer.currentTime, digestMsInteractiveSession(session));
    }

    for (const tick of [0, 1, 2, 3, 4]) {
      const restored = restoreMsUndoHistoryToTick(history, tick);
      expect(digestMsInteractiveSession(restored.session)).toBe(originalDigests.get(tick));
    }

    const restoredInitial = restoreMsUndoHistoryToTick(history, -1);
    expect(digestMsInteractiveSession(restoredInitial.session)).toBe(originalDigests.get(-1));
    expect(restoredInitial.replayedEventCount).toBe(0);
  });

  it("forks MS history onto a new timeline without deleting the original future", () => {
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, 2);
    const originalDigests = new Map<number, string>([
      [session.state.engine.timer.currentTime, digestMsInteractiveSession(session)],
    ]);

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      session = advanceMsInteractiveSession(session, inputCode);
      history = recordMsUndoTick(history, session, inputCode);
      originalDigests.set(session.state.engine.timer.currentTime, digestMsInteractiveSession(session));
    }

    const restored = restoreMsUndoHistoryToTick(history, 1).session;
    const forked = forkMsUndoHistory(history, restored);

    expect(forked.branchMetadata.currentTimelineId).toBe("timeline-1");
    expect(forked.branchMetadata.timelines).toEqual([
      {
        id: "main",
        parentTimelineId: null,
        forkTick: null,
      },
      {
        id: "timeline-1",
        parentTimelineId: "main",
        forkTick: 1,
      },
    ]);
    expect(forked.checkpoints.filter((checkpoint) => checkpoint.timelineId === "timeline-1").map((checkpoint) => checkpoint.tick)).toEqual([1]);
    expect(latestUndoTick(forked, "timeline-1")).toBe(1);
    expect(previousUndoTick(forked, 1, "timeline-1")).toBe(0);
    expect(previousUndoTick(forked, 2, "timeline-1")).toBe(1);
    expect(nextUndoTickEvent(forked, 0, "timeline-1")?.tick).toBe(1);
    expect(nextUndoTickEvent(forked, 1, "main")?.tick).toBe(2);
    expect(digestMsInteractiveSession(restoreMsUndoHistoryToTick(forked, 0).session)).toBe(originalDigests.get(0));
    expect(digestMsInteractiveSession(restoreMsUndoHistoryToTick(forked, -1).session)).toBe(originalDigests.get(-1));
  });

  it("keeps recent MS checkpoints dense and thins older checkpoints exponentially", () => {
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, {
      checkpointIntervalTicks: 2,
      recentCheckpointWindowTicks: 4,
      checkpointExponentialBase: 2,
    });

    for (let index = 0; index < 20; index += 1) {
      session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
      history = recordMsUndoTick(history, session, GAME_INPUT_CODES.none);
    }

    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([13, 15, 17, 19]);
    expect(history.initialCheckpoint.tick).toBe(-1);
  });

  it("bounds MS history by policy when unlimited retention is disabled", () => {
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, {
      checkpointIntervalTicks: 2,
      recentCheckpointWindowTicks: 4,
      checkpointExponentialBase: 2,
      retainUnlimitedHistory: false,
      maximumRetainedHistoryTicks: 6,
    });

    for (let index = 0; index < 20; index += 1) {
      session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
      history = recordMsUndoTick(history, session, GAME_INPUT_CODES.none);
    }

    expect(history.initialCheckpoint.tick).toBe(13);
    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([15, 17, 19]);
    expect(history.events[0]?.tick).toBe(14);
    expect(history.events.at(-1)?.tick).toBe(19);
    expect(() => restoreMsUndoHistoryToTick(history, 12)).toThrowError(/no undo checkpoint found/);
    expect(restoreMsUndoHistoryToTick(history, 13).session.state.engine.timer.currentTime).toBe(13);
  });
});

describe("Lynx undo history", () => {
  it("lazily materializes the initial checkpoint snapshot", () => {
    const session = createLynxReplayScenarioSession();
    const cloneSpy = vi.spyOn(globalThis, "structuredClone");

    try {
      const history = createLynxUndoHistory(session, 2, { lazyInitialCheckpoint: true });

      expect(cloneSpy).not.toHaveBeenCalled();

      void history.initialCheckpoint.sessionToken;
      expect(cloneSpy).toHaveBeenCalledTimes(1);

      void history.initialCheckpoint.stateDigest;
      expect(cloneSpy).toHaveBeenCalledTimes(1);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  it("records every tick including none inputs", () => {
    let session = createLynxReplayScenarioSession();
    let history = createLynxUndoHistory(session, 2);

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      session = advanceLynxInteractiveSession(session, inputCode);
      history = recordLynxUndoTick(history, session, inputCode);
    }

    expect(history.events.map((event) => [event.tick, event.inputCode])).toEqual([
      [0, GAME_INPUT_CODES.east],
      [1, GAME_INPUT_CODES.none],
      [2, GAME_INPUT_CODES.none],
    ]);
    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([1]);
  });

  it("restores exact Lynx session state by checkpoint plus replay", () => {
    const inputs = [
      GAME_INPUT_CODES.east,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
    ];
    let session = createLynxReplayScenarioSession();
    let history = createLynxUndoHistory(session, 2);
    const originalDigests = new Map<number, string>([
      [session.state.timer.currentTime, digestLynxInteractiveSession(session)],
    ]);

    for (const inputCode of inputs) {
      session = advanceLynxInteractiveSession(session, inputCode);
      history = recordLynxUndoTick(history, session, inputCode);
      originalDigests.set(session.state.timer.currentTime, digestLynxInteractiveSession(session));
    }

    for (const tick of [0, 1, 2, 3, 4, 5]) {
      const restored = restoreLynxUndoHistoryToTick(history, tick);
      expect(digestLynxInteractiveSession(restored.session)).toBe(originalDigests.get(tick));
    }

    const restoredInitial = restoreLynxUndoHistoryToTick(history, -1);
    expect(digestLynxInteractiveSession(restoredInitial.session)).toBe(originalDigests.get(-1));
    expect(restoredInitial.replayedEventCount).toBe(0);
  });

  it("forks Lynx history onto a new timeline without deleting the original future", () => {
    let session = createLynxReplayScenarioSession();
    let history = createLynxUndoHistory(session, 2);
    const originalDigests = new Map<number, string>([
      [session.state.timer.currentTime, digestLynxInteractiveSession(session)],
    ]);

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      session = advanceLynxInteractiveSession(session, inputCode);
      history = recordLynxUndoTick(history, session, inputCode);
      originalDigests.set(session.state.timer.currentTime, digestLynxInteractiveSession(session));
    }

    const restored = restoreLynxUndoHistoryToTick(history, 1).session;
    const forked = forkLynxUndoHistory(history, restored);

    expect(forked.branchMetadata.currentTimelineId).toBe("timeline-1");
    expect(forked.checkpoints.filter((checkpoint) => checkpoint.timelineId === "timeline-1").map((checkpoint) => checkpoint.tick)).toEqual([1]);
    expect(latestUndoTick(forked, "timeline-1")).toBe(1);
    expect(previousUndoTick(forked, 1, "timeline-1")).toBe(0);
    expect(previousUndoTick(forked, 2, "timeline-1")).toBe(1);
    expect(nextUndoTickEvent(forked, 0, "timeline-1")?.tick).toBe(1);
    expect(nextUndoTickEvent(forked, 1, "main")?.tick).toBe(2);
    expect(digestLynxInteractiveSession(restoreLynxUndoHistoryToTick(forked, 0).session)).toBe(originalDigests.get(0));
    expect(digestLynxInteractiveSession(restoreLynxUndoHistoryToTick(forked, -1).session)).toBe(originalDigests.get(-1));
  });

  it("bounds Lynx history by policy when unlimited retention is disabled", () => {
    let session = createLynxReplayScenarioSession();
    let history = createLynxUndoHistory(session, {
      checkpointIntervalTicks: 2,
      recentCheckpointWindowTicks: 4,
      checkpointExponentialBase: 2,
      retainUnlimitedHistory: false,
      maximumRetainedHistoryTicks: 6,
    });

    for (let index = 0; index < 20; index += 1) {
      session = advanceLynxInteractiveSession(session, GAME_INPUT_CODES.none);
      history = recordLynxUndoTick(history, session, GAME_INPUT_CODES.none);
    }

    expect(history.initialCheckpoint.tick).toBe(13);
    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([15, 17, 19]);
    expect(history.events[0]?.tick).toBe(14);
    expect(history.events.at(-1)?.tick).toBe(19);
    expect(() => restoreLynxUndoHistoryToTick(history, 12)).toThrowError(/no undo checkpoint found/);
    expect(restoreLynxUndoHistoryToTick(history, 13).session.state.timer.currentTime).toBe(13);
  });
});
