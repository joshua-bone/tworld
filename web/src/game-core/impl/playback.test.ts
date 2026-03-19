import { describe, expect, it } from "vitest";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import {
  appendRecordedReplayMove,
  createReplayPlan,
  plannedReplayInput,
  recordManualMove,
  resolveManualInput,
  scheduledInputForTick,
} from "@game-core/api/playback";

describe("game playback helpers", () => {
  it("selects the final scheduled command for a tick after canonical sorting", () => {
    const input = scheduledInputForTick(
      [
        { tick: 4, inputCode: GAME_INPUT_CODES.west, inputName: "west" },
        { tick: 4, inputCode: GAME_INPUT_CODES.east, inputName: "east" },
      ],
      4,
    );

    expect(input).toEqual({
      tick: 4,
      inputCode: GAME_INPUT_CODES.east,
      inputName: "east",
    });
  });

  it("preserves the previous command only for explicit preserve inputs", () => {
    const previous = { tick: 2, inputCode: GAME_INPUT_CODES.north, inputName: "north" };
    const preserved = resolveManualInput(previous, {
      tick: 3,
      inputCode: GAME_INPUT_CODES.preserve,
      inputName: "preserve",
    });
    const cleared = resolveManualInput(previous, {
      tick: 3,
      inputCode: GAME_INPUT_CODES.none,
      inputName: "none",
    });

    expect(preserved).toEqual({
      tick: 3,
      inputCode: GAME_INPUT_CODES.north,
      inputName: "north",
    });
    expect(cleared).toEqual({
      tick: 3,
      inputCode: GAME_INPUT_CODES.none,
      inputName: "none",
    });
  });

  it("advances replay cursor only on the scheduled move tick", () => {
    const replayPlan = createReplayPlan({
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [
        { when: 3, dir: GAME_INPUT_CODES.east },
        { when: 5, dir: 42 },
      ],
    });

    const idle = plannedReplayInput(replayPlan, 2);
    const firstMove = plannedReplayInput(idle.plan, 3);
    const secondMove = plannedReplayInput(firstMove.plan, 5);

    expect(idle.input.inputName).toBe("none");
    expect(idle.plan.cursor).toBe(0);
    expect(firstMove.input.inputName).toBe("east");
    expect(firstMove.plan.cursor).toBe(1);
    expect(secondMove.input.inputName).toBe("cmd-42");
    expect(secondMove.plan.cursor).toBe(2);
  });

  it("normalizes replay move times to the native 23-bit action range", () => {
    const replayPlan = createReplayPlan({
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [{ when: 75_497_472, dir: GAME_INPUT_CODES.east }],
    });

    const firstMove = plannedReplayInput(replayPlan, 0);

    expect(firstMove.input.inputName).toBe("east");
    expect(firstMove.plan.cursor).toBe(1);
  });

  it("records only non-replay moves with a non-zero last move", () => {
    const manual = recordManualMove([], 8, -1, GAME_INPUT_CODES.east);
    const replay = recordManualMove(manual, 12, 0, GAME_INPUT_CODES.west);
    const idle = recordManualMove(replay, 16, -1, GAME_INPUT_CODES.none);

    expect(manual).toEqual([{ when: 8, dir: GAME_INPUT_CODES.east }]);
    expect(replay).toEqual(manual);
    expect(idle).toEqual(manual);
  });

  it("appends only ruleset-emitted replay move decisions", () => {
    const appended = appendRecordedReplayMove([], -1, { when: 4, dir: 42 });
    const replay = appendRecordedReplayMove(appended, 0, { when: 8, dir: GAME_INPUT_CODES.east });
    const idle = appendRecordedReplayMove(appended, -1, null);

    expect(appended).toEqual([{ when: 4, dir: 42 }]);
    expect(replay).toEqual(appended);
    expect(idle).toEqual(appended);
  });
});
