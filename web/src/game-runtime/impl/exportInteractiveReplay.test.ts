import { describe, expect, it } from "vitest";
import { exportInteractiveReplay } from "@game-runtime/impl/exportInteractiveReplay";
import { replayTransferCodec } from "@game-core/api/replayTransferCodec";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

describe("exportInteractiveReplay", () => {
  it("builds a replay artifact and hands it to the transfer port", async () => {
    const exported: { filename: string; bytes: Uint8Array }[] = [];
    const session = {
      request: {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      mode: "manual",
      hintText: null,
      frame: {
        snapshot: {
          phase: "tick",
          input: "east",
          inputCode: 8,
          status: "playing",
          tick: 4,
          currentTime: 4,
          timeOffset: 0,
          secondsPlayed: 0,
          timelimit: 400,
          chipsNeeded: 6,
          statusFlags: 0,
          lastMoveCode: 8,
          lastMove: "east",
          stepping: 0,
          initRandomSlideDir: "north",
          replayCursor: -1,
          randomState: {
            main: {
              initial: "123456789",
              value: "123456789",
              shared: false,
            },
            lynx: {
              prng1: 0,
              prng2: 0,
            },
          },
          soundEffects: 0,
          view: {
            x: 0,
            y: 0,
          },
          inventory: {
            keys: [0, 0, 0, 0],
            boots: [0, 0, 0, 0],
            tools: [0],
          },
          chip: null,
          creatureCount: 0,
          creaturesHash: "",
          mapHash: "",
          creatures: [],
        },
        cells: [],
        currentZ: 1,
        visibleLayers: [
          {
            z: 1,
            cells: [],
          },
        ],
        tileOverlays: [],
        render: null,
      },
      history: {
        enabled: true,
        initialTick: -1,
        currentTick: 4,
        latestTick: 4,
        checkpointTicks: [-1, 4],
        previousTick: 3,
        previousCheckpointTick: -1,
        timelineId: "main",
        timelineCount: 1,
        restoreMode: "live",
        restoredFromTick: null,
        replayTargetTick: null,
      },
      run: {
        undoUsedCount: 0,
        replayAvailable: true,
        result: null,
      },
      recordedMoves: [{ when: 0, dir: 8 }],
      handle: null as never,
    } satisfies InteractiveGameSession;

    await exportInteractiveReplay(
      {
        exportReplay: async (artifact) => {
          exported.push(artifact);
        },
      },
      "intro-ms.dac",
      {
        index: 0,
        number: 1,
        name: "First Steps",
        author: "Tester",
        password: "ABCD",
        timeLimitSeconds: 20,
        chipsRequired: 0,
        bestTimeTicks: 0,
        levelSize: 0,
        solutionSize: 0,
        levelHash: "hash",
        gameplayHash: "gameplay-hash",
        hasSolution: false,
        sgflags: 0,
        unsolvable: null,
      },
      session,
    );

    expect(exported).toHaveLength(1);
    expect(exported[0]?.filename).toBe("intro-MS-1-live-0.2.tws");
    expect(exported[0]?.bytes.length).toBeGreaterThan(0);
  });

  it("exports .twsx when recorded moves include Action 1 modifiers", async () => {
    const exported: { filename: string; bytes: Uint8Array }[] = [];
    const session = {
      request: {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      mode: "manual",
      hintText: null,
      frame: {
        snapshot: {
          phase: "tick",
          input: "east",
          inputCode: 8,
          status: "playing",
          tick: 4,
          currentTime: 4,
          timeOffset: 0,
          secondsPlayed: 0,
          timelimit: 400,
          chipsNeeded: 6,
          statusFlags: 0,
          lastMoveCode: 8,
          lastMove: "east",
          stepping: 0,
          initRandomSlideDir: "north",
          replayCursor: -1,
          randomState: {
            main: {
              initial: "123456789",
              value: "123456789",
              shared: false,
            },
            lynx: {
              prng1: 0,
              prng2: 0,
            },
          },
          soundEffects: 0,
          view: {
            x: 0,
            y: 0,
          },
          inventory: {
            keys: [0, 0, 0, 0],
            boots: [0, 0, 0, 0],
            tools: [0],
          },
          chip: null,
          creatureCount: 0,
          creaturesHash: "",
          mapHash: "",
          creatures: [],
        },
        cells: [],
        currentZ: 1,
        visibleLayers: [
          {
            z: 1,
            cells: [],
          },
        ],
        tileOverlays: [],
        render: null,
      },
      history: {
        enabled: true,
        initialTick: -1,
        currentTick: 4,
        latestTick: 4,
        checkpointTicks: [-1, 4],
        previousTick: 3,
        previousCheckpointTick: -1,
        timelineId: "main",
        timelineCount: 1,
        restoreMode: "live",
        restoredFromTick: null,
        replayTargetTick: null,
      },
      run: {
        undoUsedCount: 0,
        replayAvailable: true,
        result: null,
      },
      recordedMoves: [{ when: 0, dir: 8, modifierMask: 1 }],
      handle: null as never,
    } satisfies InteractiveGameSession;

    await exportInteractiveReplay(
      {
        exportReplay: async (artifact) => {
          exported.push(artifact);
        },
      },
      "intro-ms.dac",
      {
        index: 0,
        number: 1,
        name: "First Steps",
        author: "Tester",
        password: "ABCD",
        timeLimitSeconds: 20,
        chipsRequired: 0,
        bestTimeTicks: 0,
        levelSize: 0,
        solutionSize: 0,
        levelHash: "hash",
        gameplayHash: "gameplay-hash",
        hasSolution: false,
        sgflags: 0,
        unsolvable: null,
      },
      session,
    );

    expect(exported).toHaveLength(1);
    expect(exported[0]?.filename).toBe("intro-MS-1-live-0.2.twsx");
    expect(replayTransferCodec.inspect(exported[0]!.bytes)?.payload.modifierMasks).toEqual([1]);
  });
});
