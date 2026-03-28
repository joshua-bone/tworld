import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import { applyMsActorArrivalEffects } from "@ruleset-ms/impl/actorArrival";
import { projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import { createMsInitialStatefulActorRuntime } from "@ruleset-ms/impl/statefulActors";

function createCell(bottomId: number): EngineMapCell {
  return {
    position: { x: 0, y: 0, z: 1, pos: 0 },
    top: { id: MS_TILE.BowlingBall, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createInventory(): EngineState["inventory"] {
  return {
    keys: [0, 0, 0, 0],
    boots: [0, 0, 0, 0],
    tools: [0],
    chipsNeeded: 0,
  };
}

describe("applyMsActorArrivalEffects", () => {
  it("collects chips through shared actor floor impact", () => {
    const cells = [createCell(MS_TILE.ICChip)];
    const inventory = createInventory();
    inventory.chipsNeeded = 2;
    const runtimeEntry = createMsInitialStatefulActorRuntime(7, MS_TILE.BowlingBall)!;
    const inventoryOwner = projectMsActorInventoryOwner(MS_TILE.BowlingBall, inventory, {
      actorSerial: 7,
      runtimeEntry,
    });

    const soundEffects = applyMsActorArrivalEffects(cells, MS_TILE.BowlingBall, 0, {
      inventory,
      inventoryOwner,
      runtimeEntry,
    });

    expect(inventory.chipsNeeded).toBe(1);
    expect(cells[0]?.bottom.id).toBe(MS_TILE.Empty);
    expect(soundEffects).toBe(1 << MS_SOUND.IcCollected);
  });
});
