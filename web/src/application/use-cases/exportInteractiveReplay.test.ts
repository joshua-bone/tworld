import { describe, expect, it } from "vitest";
import { exportInteractiveReplay } from "@application/use-cases/exportInteractiveReplay";
import type { InteractiveGameSession } from "@application/ports/InteractiveGameEngine";

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
          },
          chip: null,
          creatureCount: 0,
          creaturesHash: "",
          mapHash: "",
          creatures: [],
        },
        cells: [],
      },
      recordedMoves: [{ when: 0, dir: 8 }],
      token: null,
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
        bestTimeTicks: 0,
        levelSize: 0,
        solutionSize: 0,
        levelHash: "hash",
        hasSolution: false,
        sgflags: 0,
        unsolvable: null,
      },
      session,
    );

    expect(exported).toHaveLength(1);
    expect(exported[0]?.filename).toBe("intro-ms-level-1.tws.bin");
    expect(exported[0]?.bytes.length).toBeGreaterThan(0);
  });
});
