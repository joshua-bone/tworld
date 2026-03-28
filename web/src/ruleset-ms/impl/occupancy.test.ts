import { describe, expect, it } from "vitest";
import { OCCUPANCY_TARGET_KIND } from "@game-core/impl/occupancy";
import { queryMsOccupancyTarget } from "@ruleset-ms/impl/occupancy";
import { createEmptyCells, pos } from "@ruleset-ms/impl/testSupport";
import { MS_TILE, msCreatureTile, MS_DIRECTION } from "@ruleset-ms/api/tiles";

describe("ms occupancy query", () => {
  it("reports portable items through the runtime portable-item store instead of raw top-tile checks", () => {
    const cells = createEmptyCells();
    const targetPos = pos(3, 3);
    cells[targetPos]!.top.id = MS_TILE.Hook;

    const target = queryMsOccupancyTarget(
      {
        cells,
        portableItems: [
          {
            tileId: MS_TILE.Hook,
            state: { mode: "map", pos: targetPos, z: 1 },
          },
        ],
      },
      targetPos,
      1,
    );

    expect(target.kind).toBe(OCCUPANCY_TARGET_KIND.portableItem);
    expect(target.tileId).toBe(MS_TILE.Hook);
  });

  it("distinguishes static blocks, live actors, and chip occupancy", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 1);
    const actorPos = pos(2, 1);
    const blockPos = pos(3, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[actorPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;

    expect(
      queryMsOccupancyTarget(
        {
          cells,
          chipPos,
          chipZ: 1,
          creatures: [{ id: MS_TILE.Ball, pos: actorPos, z: 1, hidden: false }],
          blocks: [{ pos: blockPos, z: 2, hidden: false }],
        },
        chipPos,
        1,
      ).kind,
    ).toBe(OCCUPANCY_TARGET_KIND.chip);
    expect(
      queryMsOccupancyTarget(
        {
          cells,
          creatures: [{ id: MS_TILE.Ball, pos: actorPos, z: 1, hidden: false }],
        },
        actorPos,
        1,
      ).kind,
    ).toBe(OCCUPANCY_TARGET_KIND.runtimeActor);
    expect(
      queryMsOccupancyTarget(
        {
          cells,
        },
        blockPos,
        1,
      ).kind,
    ).toBe(OCCUPANCY_TARGET_KIND.staticBlock);
  });
});
