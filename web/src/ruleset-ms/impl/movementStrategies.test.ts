import { describe, expect, it, vi } from "vitest";
import { blockedMovement, movedMovement } from "@game-core/api/movementOutcomes";
import {
  canStartMsChipMoveByStrategy,
  runMsChipForcedMoveByStrategy,
  startMsBlockMoveByStrategy,
  startMsChipMoveByStrategy,
  startMsCreatureMoveByStrategy,
} from "@ruleset-ms/impl/movementStrategies";

describe("ms movement strategies", () => {
  it("routes chip-like movement through the chip strategy context", () => {
    const startMove = vi.fn(() => movedMovement(9));
    const context = {
      canStartMove: vi.fn(() => true),
      startMove,
      startDownMove: vi.fn(() => movedMovement()),
      startUpMove: vi.fn(() => movedMovement()),
      runForcedMove: vi.fn(() => 5),
    };

    expect(canStartMsChipMoveByStrategy("chip-like", context, [] as never[], {}, {}, 1)).toBe(true);
    expect(startMsChipMoveByStrategy("chip-like", context, [] as never[], {}, {}, 1)).toEqual(movedMovement(9));
    expect(runMsChipForcedMoveByStrategy("chip-like", context, {}, [] as never[])).toBe(5);
    expect(startMove).toHaveBeenCalledOnce();
    expect(startMsChipMoveByStrategy("creature-like", context, [] as never[], {}, {}, 1)).toEqual(blockedMovement());
  });

  it("routes creature-like movement separately from block-like movement", () => {
    const creatureContext = {
      canStartMove: vi.fn(() => true),
      startMove: vi.fn(() => movedMovement(3)),
      startDownMove: vi.fn(() => movedMovement()),
      startUpMove: vi.fn(() => movedMovement()),
    };
    const blockContext = {
      canStartMove: vi.fn(() => true),
      startMove: vi.fn(() => movedMovement(7)),
      startUpMove: vi.fn(() => movedMovement()),
    };

    expect(startMsCreatureMoveByStrategy("creature-like", creatureContext, [] as never[], {}, 2, {})).toEqual(
      movedMovement(3),
    );
    expect(startMsCreatureMoveByStrategy("block-like", creatureContext, [] as never[], {}, 2, {})).toEqual(
      blockedMovement(),
    );
    expect(startMsBlockMoveByStrategy("block-like", blockContext, [] as never[], {}, 10, 2, false, false)).toEqual(
      movedMovement(7),
    );
    expect(startMsBlockMoveByStrategy("creature-like", blockContext, [] as never[], {}, 10, 2, false, false)).toEqual(
      blockedMovement(),
    );
  });
});
