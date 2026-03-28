import { describe, expect, it } from "vitest";
import { applyLynxActorArrivalEffects } from "@ruleset-lynx/impl/actorArrival";
import { projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import { createLynxInitialStatefulActorRuntime } from "@ruleset-lynx/impl/statefulActors";
import { createBoardAtZ, createCell, createEngineState } from "@ruleset-lynx/impl/testSupport";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("applyLynxActorArrivalEffects", () => {
  it("opens green doors without consuming the green key", () => {
    const cells = createBoardAtZ(1);
    cells[34] = createCell(34, MS_TILE.Door_Green, MS_TILE.Empty);
    const state = createEngineState(cells);
    const runtimeEntry = createLynxInitialStatefulActorRuntime(9, MS_TILE.BowlingBall)!;
    const localInventory = runtimeEntry.state.localInventory!;
    localInventory.keys[3] = 1;
    const inventoryOwner = projectLynxActorInventoryOwner(MS_TILE.BowlingBall, state.inventory, {
      actorSerial: 9,
      runtimeEntry,
    });

    const soundEffects = applyLynxActorArrivalEffects(
      {
        state,
        inventoryOwner,
        runtimeEntry,
        soundBits: {
          doorOpened: 1,
          socketOpened: 2,
          tileEmptied: 4,
          wallCreated: 8,
          bootsStolen: 16,
          itemCollected: 32,
          icCollected: 64,
        },
        resolveButtonEffects: () => 0,
      },
      MS_TILE.BowlingBall,
      34,
    );

    expect(soundEffects).toBe(1);
    expect(localInventory.keys[3]).toBe(1);
    expect(state.map.cells[34]?.top.id).toBe(MS_TILE.Empty);
  });
});
