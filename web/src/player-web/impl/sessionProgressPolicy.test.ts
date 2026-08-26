import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  shouldPersistLevelProgress,
  terminalSessionRecordKey,
} from "@player-web/impl/sessionProgressPolicy";

describe("sessionProgressPolicy", () => {
  it("persists only live manual runs with a terminal result", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(true);
  });

  it("does not persist replay sessions or replay-launched sessions", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "replay",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: true,
      }),
    ).toBe(false);
  });

  it("does not persist incomplete sessions or non-game modes", () => {
    expect(
      shouldPersistLevelProgress({
        hasResult: false,
        mode: "game",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
    expect(
      shouldPersistLevelProgress({
        hasResult: true,
        mode: "series-list",
        sessionMode: "manual",
        sessionStartedFromReplay: false,
      }),
    ).toBe(false);
  });

  it("keeps a terminal record key stable across observer-only post-result frames", () => {
    const session = {
      request: { seriesFile: "CCLP1.dat", levelNumber: 7, ruleset: "hybrid-v1" },
      frame: { snapshot: { currentTime: 11, tick: 12 } },
      run: {
        undoUsedCount: 0,
        replayAvailable: false,
        result: {
          outcome: "failed",
          endPosition: { x: 3, y: 4, z: 1 },
          cause: {
            kind: "monster",
            message: "Killed by block at (3, 4)",
            position: { x: 3, y: 4, z: 1 },
            actorId: null,
            actorName: "block",
            tileId: 10,
          },
          score: null,
        },
      },
    } as unknown as InteractiveGameSession;
    const observerFrame = {
      ...session,
      frame: { snapshot: { ...session.frame.snapshot, tick: 200 } },
    } as InteractiveGameSession;

    expect(terminalSessionRecordKey(observerFrame)).toBe(terminalSessionRecordKey(session));
  });
});
