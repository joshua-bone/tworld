import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { MS_STATUS_FLAG } from "@ruleset-ms/api/tiles";
import {
  activeGameplayHintOverlay,
  buildHistoryJumpOptions,
  describeGameplayHint,
  describeGameplayStatus,
  formatGameplayTimeLeft,
  parseHistoryTickInput,
} from "@player-web/impl/modern/gameplayShellModel";

function createSession(
  overrides: Partial<InteractiveGameSession["history"]> = {},
  snapshotOverrides: Partial<InteractiveGameSession["frame"]["snapshot"]> = {},
): InteractiveGameSession {
  return {
    request: {
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 1,
    },
    mode: "manual",
    hintText: "Read the hint",
    frame: {
      snapshot: {
        phase: "game",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 40,
        currentTime: 40,
        timeOffset: 0,
        secondsPlayed: 2,
        timelimit: 200,
        chipsNeeded: 5,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 0,
        randomState: {
          main: { initial: "1", value: "1", shared: true },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "",
        mapHash: "",
        creatures: [],
        ...snapshotOverrides,
      },
      cells: [],
      currentZ: 0,
      visibleLayers: [],
      tileOverlays: [],
      render: null,
    },
    history: {
      enabled: true,
      initialTick: 0,
      currentTick: 40,
      latestTick: 40,
      checkpointTicks: [0, 8, 16, 24, 32, 40],
      previousTick: 39,
      previousCheckpointTick: 32,
      timelineId: "A",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
      ...overrides,
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: true,
      result: null,
    },
    recordedMoves: [],
    handle: {} as InteractiveGameSession["handle"],
  };
}

describe("gameplayShellModel", () => {
  it("formats session status labels for live, rewound, replay, and terminal states", () => {
    expect(describeGameplayStatus(createSession(), false)).toBe("Playing");
    expect(describeGameplayStatus(createSession({ restoreMode: "restored-paused" }), false)).toBe("Rewound");
    expect(describeGameplayStatus({ ...createSession(), mode: "replay" }, false)).toBe("Replay");
    expect(describeGameplayStatus(createSession({}, { status: "completed" }), false)).toBe("Completed");
    expect(describeGameplayStatus(createSession({}, { status: "failed" }), false)).toBe("Failed");
    expect(describeGameplayStatus(null, true)).toBe("Loading");
  });

  it("builds history jump options and clamps exact tick input", () => {
    const session = createSession();

    expect(buildHistoryJumpOptions(session)).toEqual([
      { label: "Checkpoint 1.6s", targetTick: 32 },
      { label: "Checkpoint 1.2s", targetTick: 24 },
      { label: "Checkpoint 0.8s", targetTick: 16 },
      { label: "Checkpoint 0.4s", targetTick: 8 },
      { label: "Start (0.0s)", targetTick: 0 },
    ]);
    expect(parseHistoryTickInput("17", 40)).toBe(17);
    expect(parseHistoryTickInput("99", 40)).toBe(40);
    expect(parseHistoryTickInput("-1", 40)).toBeNull();
  });

  it("formats time remaining and prioritizes invalid, unsolvable, hint, and terminal hint text", () => {
    const level = {
      number: 1,
      name: "Test",
      author: "Author",
      password: "ABCD",
      timeLimitSeconds: 10,
      chipsRequired: 0,
      bestTimeTicks: 0,
      index: 0,
      levelSize: 0,
      solutionSize: 0,
      levelHash: "hash",
      gameplayHash: "gameplay-hash",
      hasSolution: false,
      sgflags: 0,
      unsolvable: "broken",
    };

    expect(formatGameplayTimeLeft(createSession())).toBe("8");
    expect(describeGameplayHint(createSession({}, { statusFlags: MS_STATUS_FLAG.Invalid }), level)).toBe(
      "This level cannot be played.",
    );
    expect(describeGameplayHint(createSession({}, { currentTime: -1 }), level)).toBe(
      "This level is reported to be unsolvable: broken.",
    );
    expect(describeGameplayHint(createSession({}, { statusFlags: MS_STATUS_FLAG.ShowHint }), { ...level, unsolvable: null })).toBe(
      "Read the hint",
    );
    expect(describeGameplayHint(createSession({}, { status: "completed" }), { ...level, unsolvable: null })).toBe(
      "Level Completed",
    );
  });

  it("only exposes the live hint overlay while the ShowHint flag is active", () => {
    expect(activeGameplayHintOverlay(createSession())).toBeNull();
    expect(activeGameplayHintOverlay(createSession({}, { statusFlags: MS_STATUS_FLAG.ShowHint }))).toBe("Read the hint");
    expect(activeGameplayHintOverlay({ ...createSession({}, { statusFlags: MS_STATUS_FLAG.ShowHint }), hintText: null })).toBeNull();
  });
});
