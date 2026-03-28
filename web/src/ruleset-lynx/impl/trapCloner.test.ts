import { describe, expect, it } from "vitest";
import { createEngineState, createLevel, createCell } from "@ruleset-lynx/impl/testSupport";
import { isLynxTrapHeldOpen } from "@ruleset-lynx/impl/trapCloner";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("lynx trap and cloner helpers", () => {
  it("treats mapped portable items as held-open brown-button occupants", () => {
    const buttonPos = 34;
    const trapPos = 70;
    const level = createLevel(
      [
        createCell(buttonPos, MS_TILE.Hook, MS_TILE.Button_Brown),
        createCell(trapPos, MS_TILE.Beartrap, MS_TILE.Empty),
      ],
      undefined,
      { traps: [{ from: buttonPos, to: trapPos }] },
    );
    const state = createEngineState(level.cells);

    expect(
      isLynxTrapHeldOpen(
        state,
        level,
        [],
        [{ tileId: MS_TILE.Hook, state: { mode: "map", pos: buttonPos, z: 1 } }],
        trapPos,
        1,
      ),
    ).toBe(true);
  });
});
