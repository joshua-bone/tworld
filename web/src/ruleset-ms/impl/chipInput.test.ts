import { describe, expect, it } from "vitest";
import { encodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import {
  chooseMsManualMovement,
  latchCurrentMsInput,
  resolveMsRecordedReplayMoveAfterChoose,
  resolveMsReplayLastMoveAfterChoose,
  type MsChipInputState,
} from "@ruleset-ms/impl/chipInput";
import { MS_DIRECTION, MS_GRID_WIDTH } from "@ruleset-ms/api/tiles";

const TEST_MOUSE_RANGE_MIN = -9;
const TEST_MOUSE_RANGE = 19;
const TEST_CMD_MOUSE_MOVE_FIRST = (MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east) + 1;
const TEST_CMD_MOVE_NOP = TEST_CMD_MOUSE_MOVE_FIRST - TEST_MOUSE_RANGE_MIN * (TEST_MOUSE_RANGE + 1);
const TEST_CMD_ABS_MOUSE_MOVE_FIRST = 512;

function absoluteMouseMoveCode(targetPos: number): number {
  return TEST_CMD_ABS_MOUSE_MOVE_FIRST + targetPos;
}

function relativeMouseMoveCode(chipPos: number, targetPos: number): number {
  const dx = (targetPos % MS_GRID_WIDTH) - (chipPos % MS_GRID_WIDTH);
  const dy = Math.floor(targetPos / MS_GRID_WIDTH) - Math.floor(chipPos / MS_GRID_WIDTH);
  return TEST_CMD_MOUSE_MOVE_FIRST + (dy - TEST_MOUSE_RANGE_MIN) * TEST_MOUSE_RANGE + (dx - TEST_MOUSE_RANGE_MIN);
}

function createChipInputState(overrides: Partial<MsChipInputState> = {}): MsChipInputState {
  return {
    chipTDir: MS_DIRECTION.none,
    chipHasMoved: false,
    currentInput: MS_DIRECTION.none,
    goalPos: -1,
    chipPos: 0,
    floorMovement: "none",
    chipDir: MS_DIRECTION.none,
    ...overrides,
  };
}

describe("chipInput", () => {
  it("chooses goal movement from an absolute mouse command on the active movement cadence", () => {
    const chipPos = 3 + 4 * MS_GRID_WIDTH;
    const targetPos = chipPos + 1;
    const state = createChipInputState({
      chipPos,
      currentInput: absoluteMouseMoveCode(targetPos),
    });

    const choice = chooseMsManualMovement(state, 2, () => MS_DIRECTION.east);

    expect(choice).toEqual({
      consumedInputCode: absoluteMouseMoveCode(targetPos),
      dir: MS_DIRECTION.east,
    });
    expect(state.goalPos).toBe(targetPos);
    expect(state.chipTDir).toBe(MS_DIRECTION.east);
    expect(state.currentInput).toBe(MS_DIRECTION.none);
  });

  it("drops manual input while teleport floor movement is active", () => {
    const state = createChipInputState({
      floorMovement: "teleport",
      currentInput: MS_DIRECTION.east,
      goalPos: 99,
    });

    const choice = chooseMsManualMovement(state, 2, () => MS_DIRECTION.east);

    expect(choice).toEqual({
      consumedInputCode: 0,
      dir: MS_DIRECTION.none,
    });
    expect(state.goalPos).toBe(-1);
    expect(state.chipTDir).toBe(MS_DIRECTION.none);
  });

  it("normalizes directional input while preserving mouse-goal commands and replay-latched input", () => {
    expect(
      latchCurrentMsInput(
        -1,
        MS_DIRECTION.none,
        encodeRuntimeInputCode(MS_DIRECTION.east, GAME_INPUT_MODIFIER_MASKS.action1),
      ),
    ).toBe(encodeRuntimeInputCode(MS_DIRECTION.east, GAME_INPUT_MODIFIER_MASKS.action1));

    const absoluteMouse = absoluteMouseMoveCode(17);
    expect(latchCurrentMsInput(-1, MS_DIRECTION.none, absoluteMouse)).toBe(absoluteMouse);
    expect(latchCurrentMsInput(3, MS_DIRECTION.south, MS_DIRECTION.none)).toBe(MS_DIRECTION.south);
  });

  it("converts absolute mouse replay moves to relative runtime commands", () => {
    const chipPos = 10 + 6 * MS_GRID_WIDTH;
    const targetPos = chipPos + MS_GRID_WIDTH + 1;

    const lastMove = resolveMsReplayLastMoveAfterChoose(
      {
        replayCursor: 1,
        previousLastMove: { code: MS_DIRECTION.none, name: "none" },
        currentTime: 14,
        engineTime: 13,
      },
      absoluteMouseMoveCode(targetPos),
      {
        chipHasMovedBeforeChoose: false,
        goalPosBeforeChoose: -1,
        floorMovementBeforeChoose: "none",
        chipDirBeforeChoose: MS_DIRECTION.none,
        chipPos,
      },
      false,
    );

    expect(lastMove.code).toBe(relativeMouseMoveCode(chipPos, targetPos));
  });

  it("records goal-preserving nop replay moves when chip has already moved", () => {
    const recorded = resolveMsRecordedReplayMoveAfterChoose(
      -1,
      21,
      absoluteMouseMoveCode(77),
      {
        chipHasMovedBeforeChoose: true,
        goalPosBeforeChoose: 77,
        floorMovementBeforeChoose: "none",
        chipDirBeforeChoose: MS_DIRECTION.none,
        chipPos: 12,
      },
      false,
    );

    expect(recorded).toEqual({
      when: 21,
      dir: TEST_CMD_MOVE_NOP,
      modifierMask: 0,
    });
  });
});
