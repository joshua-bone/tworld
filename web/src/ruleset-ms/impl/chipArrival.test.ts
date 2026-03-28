import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  resolveMsChipEnteredTile,
  type MsChipEntryContext,
  type MsChipEntryState,
} from "@ruleset-ms/impl/chipArrival";
import type { MsPortableToolStateStore } from "@ruleset-ms/impl/portableItems";

function makeCell(topId: number, bottomId = MS_TILE.Empty, topState = 0): EngineMapCell {
  return {
    position: { x: 0, y: 0, z: 1, pos: 0 },
    top: { id: topId, state: topState },
    bottom: { id: bottomId, state: 0 },
  };
}

function makeInventory(): EngineState["inventory"] {
  return {
    keys: [0, 0, 0, 0],
    boots: [0, 0, 0, 0],
    tools: [0],
    chipsNeeded: 0,
  };
}

function makePortableTools(): MsPortableToolStateStore {
  return {
    portableItems: [],
    nextPortableItemSerial: 1,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
  };
}

function makeChipState(): MsChipEntryState {
  return { chipStatus: "okay" };
}

function makeContext(
  inventory: EngineState["inventory"],
  portableTools: MsPortableToolStateStore,
): MsChipEntryContext {
  return {
    inventory,
    portableTools,
    runtimeCellZ: () => 1,
  };
}

describe("resolveMsChipEnteredTile", () => {
  it("collects chips through global progress", () => {
    const cells = [makeCell(MS_TILE.ICChip)];
    const inventory = makeInventory();
    inventory.chipsNeeded = 3;

    const result = resolveMsChipEnteredTile(cells, makeChipState(), makeContext(inventory, makePortableTools()), 0);

    expect(inventory.chipsNeeded).toBe(2);
    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.IcCollected);
  });

  it("collects portable tools through the portable item store", () => {
    const cells = [makeCell(MS_TILE.Sandbag)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = resolveMsChipEnteredTile(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.tools[0]).toBe(MS_TILE.Sandbag);
    expect(portableTools.portableItems).toEqual([
      {
        serial: 1,
        tileId: MS_TILE.Sandbag,
        inventorySlot: "tools",
        state: { mode: "carried" },
      },
    ]);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("marks water death when Chip lacks water boots", () => {
    const chip = makeChipState();

    resolveMsChipEnteredTile([makeCell(MS_TILE.Water)], chip, makeContext(makeInventory(), makePortableTools()), 0);

    expect(chip.chipStatus).toBe("drowned");
  });

  it("clears boots and tools on thief tiles", () => {
    const cells = [makeCell(MS_TILE.Burglar)];
    const inventory = makeInventory();
    inventory.boots = [1, 0, 0, 0];
    inventory.tools = [MS_TILE.Sandbag];
    const portableTools = makePortableTools();
    portableTools.portableItems.push({
      serial: 1,
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });

    const result = resolveMsChipEnteredTile(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.boots).toEqual([0, 0, 0, 0]);
    expect(inventory.tools).toEqual([0]);
    expect(portableTools.portableItems).toEqual([]);
    expect(result.soundEffects).toBe(1 << MS_SOUND.BootsStolen);
  });
});
