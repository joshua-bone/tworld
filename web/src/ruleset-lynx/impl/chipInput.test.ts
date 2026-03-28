import { describe, expect, it } from "vitest";
import {
  previewInputCodeForLynxChipMoveSelection,
  resolveLynxChipInputDirection,
  selectLynxChipMoveForTick,
  shouldSuppressLynxChipMoveSelectionForHeldTrapArrival,
  suppressLynxChipMoveSelectionForHeldTrapArrival,
} from "@ruleset-lynx/impl/chipInput";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

describe("lynx chipInput", () => {
  it("prefers the open half of a diagonal when chip is already facing one component", () => {
    const dir = resolveLynxChipInputDirection(
      MS_DIRECTION.east,
      MS_DIRECTION.east | MS_DIRECTION.north,
      {
        probeMove: (probeDir) => ({
          canMove: probeDir === MS_DIRECTION.north,
          pushBlockPos: null,
        }),
        isDormantBlockAt: () => false,
      },
    );

    expect(dir).toBe(MS_DIRECTION.north);
  });

  it("chooses the vertical half of a diagonal when the horizontal half would wake a dormant block", () => {
    const dir = resolveLynxChipInputDirection(
      MS_DIRECTION.none,
      MS_DIRECTION.east | MS_DIRECTION.north,
      {
        probeMove: (probeDir) => ({
          canMove: probeDir === MS_DIRECTION.east,
          pushBlockPos: probeDir === MS_DIRECTION.east ? 17 : null,
        }),
        isDormantBlockAt: (pos) => pos === 17,
      },
    );

    expect(dir).toBe(MS_DIRECTION.north);
  });

  it("builds a start movement from queued replay input when not forced", () => {
    const selection = selectLynxChipMoveForTick({
      chipPos: 12,
      chipZ: 1,
      chipDir: MS_DIRECTION.south,
      chipMoving: 0,
      endGameTicksElapsed: null,
      floorBeforeMove: MS_TILE.Empty,
      currentInputCode: 0,
      queuedReplayInputCode: MS_DIRECTION.west,
      queuedChipInputCode: 0,
      forcedMove: { dir: 0, discardInput: false },
      resolveInputDirection: (inputCode) => inputCode,
    });

    expect(selection).toMatchObject({
      rawRequestedInputCode: MS_DIRECTION.west,
      requestedInputCode: MS_DIRECTION.west,
      chosenInputCode: MS_DIRECTION.west,
      startInputCode: MS_DIRECTION.west,
      startAirMove: false,
      startElevatorMove: false,
    });
  });

  it("suppresses held-trap chip selection and preview when chip re-arrives on the trap", () => {
    const selection = selectLynxChipMoveForTick({
      chipPos: 8,
      chipZ: 1,
      chipDir: MS_DIRECTION.south,
      chipMoving: 0,
      endGameTicksElapsed: null,
      floorBeforeMove: MS_TILE.Slide_South,
      currentInputCode: 0,
      queuedReplayInputCode: 0,
      queuedChipInputCode: 0,
      forcedMove: { dir: MS_DIRECTION.south, discardInput: true },
      resolveInputDirection: () => MS_DIRECTION.none,
    });

    expect(shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(0, true, true)).toBe(true);

    const suppressed = suppressLynxChipMoveSelectionForHeldTrapArrival(selection);
    expect(suppressed.startInputCode).toBe(0);
    expect(
      previewInputCodeForLynxChipMoveSelection(
        suppressed,
        (floorId) => floorId === MS_TILE.Slide_South,
        () => true,
      ),
    ).toBe(0);
  });
});
