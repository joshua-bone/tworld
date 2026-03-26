import { describe, expect, it } from "vitest";
import { replayTransferCodec } from "@game-core/api/replayTransferCodec";
import { replaySolutionCodec } from "@game-core/api/codec";

describe("replayTransferCodec", () => {
  it("keeps plain replays as .tws when no modifiers are present", () => {
    const payload = {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }],
    };
    const encoded = replayTransferCodec.encode(9, "ABCD", 88, payload);

    expect(encoded.extension).toBe("tws");
    expect(encoded.bytes).toEqual(replaySolutionCodec.encode(9, "ABCD", 88, payload));
  });

  it("wraps replays as .twsx when modifier masks are present", () => {
    const encoded = replayTransferCodec.encode(9, "ABCD", 88, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: 8 }, { when: 4, dir: 1 }],
      modifierMasks: [1, 0],
    });

    expect(encoded.extension).toBe("twsx");
    expect(replayTransferCodec.inspect(encoded.bytes)).toEqual({
      levelNumber: 9,
      password: "ABCD",
      bestTimeTicks: 88,
      payload: {
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 123456789,
        moves: [{ when: 0, dir: 8 }, { when: 4, dir: 1 }],
        modifierMasks: [1, 0],
      },
    });
  });
});
