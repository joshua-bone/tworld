import { describe, expect, it } from "vitest";
import { importReplayForLevel } from "@game-runtime/impl/importReplayForLevel";
import { replaySolutionCodec } from "@game-core/api/codec";
import { replayTransferCodec } from "@game-core/api/replayTransferCodec";

describe("importReplayForLevel", () => {
  it("decodes a raw replay payload for the selected level", async () => {
    const bytes = replaySolutionCodec.encode(9, "ABCD", 88, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }],
    });

    const imported = await importReplayForLevel(
      {
        importReplay: async () => ({
          name: "intro-ms-level-9.tws.bin",
          bytes,
        }),
      },
      {
        name: "Lesson 9",
        number: 9,
        password: "ABCD",
      },
    );

    expect(imported).not.toBeNull();
    expect(imported?.fileName).toBe("intro-ms-level-9.tws.bin");
    expect(imported?.replay.levelNumber).toBe(9);
    expect(imported?.replay.password).toBe("ABCD");
    expect(imported?.replay.payload.moves).toEqual([{ when: 0, dir: 8 }]);
    expect(imported?.bytes).toEqual(bytes);
  });

  it("decodes a wrapped replay payload with modifier masks", async () => {
    const encoded = replayTransferCodec.encode(9, "ABCD", 88, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }],
      modifierMasks: [1],
    });

    const imported = await importReplayForLevel(
      {
        importReplay: async () => ({
          name: "intro-ms-level-9.twsx",
          bytes: encoded.bytes,
        }),
      },
      {
        name: "Lesson 9",
        number: 9,
        password: "ABCD",
      },
    );

    expect(imported).not.toBeNull();
    expect(imported?.replay.payload.modifierMasks).toEqual([1]);
  });

  it("rejects a replay for a different selected level", async () => {
    const bytes = replaySolutionCodec.encode(8, "ABCD", 88, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }],
    });

    await expect(
      importReplayForLevel(
        {
          importReplay: async () => ({
            name: "wrong-level.bin",
            bytes,
          }),
        },
        {
          name: "Lesson 9",
          number: 9,
          password: "ABCD",
        },
      ),
    ).rejects.toThrow("wrong-level.bin does not match level 9: Lesson 9");
  });

  it("rejects an exported replay whose filename ruleset hint mismatches the current level", async () => {
    const bytes = replaySolutionCodec.encode(9, "ABCD", 88, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }],
    });

    await expect(
      importReplayForLevel(
        {
          importReplay: async () => ({
            name: "intro-MS-9-live-4.4.tws.bin",
            bytes,
          }),
        },
        {
          name: "Lesson 9",
          number: 9,
          password: "ABCD",
        },
        {
          ruleset: "Lynx",
        },
      ),
    ).rejects.toThrow("intro-MS-9-live-4.4.tws.bin was exported for MS, but the current level is Lynx");
  });
});
