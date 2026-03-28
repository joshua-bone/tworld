import { describe, expect, it } from "vitest";
import { OCCUPANCY_TARGET_KIND } from "@game-core/impl/occupancy";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { queryLynxOccupancyTarget } from "@ruleset-lynx/impl/occupancy";
import { createBoardAtZ, createCell } from "@ruleset-lynx/impl/testSupport";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("lynx occupancy query", () => {
  it("reports mapped portable items without relying on their top-tile id", () => {
    const cells = createBoardAtZ(1);
    cells[34] = createCell(34, MS_TILE.Hook, MS_TILE.Button_Brown);

    const target = queryLynxOccupancyTarget(
      {
        cells,
        portableItems: [{ tileId: MS_TILE.Hook, state: { mode: "map", pos: 34, z: 1 } }],
      },
      34,
      1,
    );

    expect(target.kind).toBe(OCCUPANCY_TARGET_KIND.portableItem);
    expect(target.tileId).toBe(MS_TILE.Hook);
  });

  it("distinguishes blocked visuals and claimed runtime actors", () => {
    const cells = createBoardAtZ(1);
    cells[34] = createCell(34, MS_TILE.Empty, MS_TILE.Empty);
    cells[34]!.top.state |= LYNX_CELL_FLAG.Animated;
    cells[35] = createCell(35, MS_TILE.Empty, MS_TILE.Empty);
    cells[35]!.top.state |= LYNX_CELL_FLAG.Claimed;

    expect(queryLynxOccupancyTarget({ cells }, 34, 1).kind).toBe(OCCUPANCY_TARGET_KIND.blockedVisual);

    const claimedActor = queryLynxOccupancyTarget(
      {
        cells,
        actors: [{ id: MS_TILE.Block, pos: 35, z: 1, hidden: false }],
      },
      35,
      1,
    );
    expect(claimedActor.kind).toBe(OCCUPANCY_TARGET_KIND.runtimeActor);
    expect(claimedActor.claimed).toBe(true);
  });
});
