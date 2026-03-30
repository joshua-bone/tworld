import { describe, expect, it } from "vitest";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  applyMsChipEnterEffects,
  type MsChipEntryContext,
  type MsChipEntryState,
} from "@ruleset-ms/impl/chipArrival";
import type { MsPortableToolStateStore } from "@ruleset-ms/impl/portableItems";

function makeCell(topId: number, bottomId: number = MS_TILE.Empty, topState: number = 0): EngineMapCell {
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
    removeRuntimeActor: () => {},
  };
}

describe("applyMsChipEnterEffects", () => {
  it("collects chips through global progress", () => {
    const cells = [makeCell(MS_TILE.ICChip)];
    const inventory = makeInventory();
    inventory.chipsNeeded = 3;

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, makePortableTools()), 0);

    expect(inventory.chipsNeeded).toBe(2);
    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.IcCollected);
  });

  it("collects portable tools through the portable item store", () => {
    const cells = [makeCell(MS_TILE.Sandbag)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.tools[0]).toBe(MS_TILE.Sandbag);
    expect(portableTools.portableItems).toEqual([
      {
        serial: 1,
        family: "sandbag",
        tileId: MS_TILE.Sandbag,
        inventorySlot: "tools",
        state: { mode: "carried" },
      },
    ]);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("opens green doors without consuming the green key", () => {
    const cells = [makeCell(MS_TILE.Door_Green)];
    const inventory = makeInventory();
    inventory.keys[3] = 1;

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, makePortableTools()), 0);

    expect(inventory.keys[3]).toBe(1);
    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.DoorOpened);
  });

  it("marks teleport entry through the tile behavior seam", () => {
    const cells = [makeCell(MS_TILE.Teleport)];

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(makeInventory(), makePortableTools()), 0);

    expect(result.enteredTeleport).toBe(true);
  });

  it("opens sockets through the same tile behavior seam", () => {
    const cells = [makeCell(MS_TILE.Socket)];

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(makeInventory(), makePortableTools()), 0);

    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.SocketOpened);
  });

  it("clears fake blue walls through the concrete tile behavior seam", () => {
    const cells = [makeCell(MS_TILE.BlueWall_Fake)];

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(makeInventory(), makePortableTools()), 0);

    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
  });

  it("collects hook portable tools through the same portable item store", () => {
    const cells = [makeCell(MS_TILE.Hook)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.tools[0]).toBe(MS_TILE.Hook);
    expect(portableTools.portableItems).toEqual([
      {
        serial: 1,
        family: "hook",
        tileId: MS_TILE.Hook,
        inventorySlot: "tools",
        state: { mode: "carried" },
      },
    ]);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("collects bowling-ball portable tools through the same portable item store", () => {
    const cells = [makeCell(MS_TILE.BowlingBall_Still)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.tools[0]).toBe(MS_TILE.BowlingBall_Still);
    expect(portableTools.portableItems).toEqual([
      {
        serial: 1,
        family: "bowling-ball",
        tileId: MS_TILE.BowlingBall_Still,
        inventorySlot: "tools",
        bowlingBallState: createStillBowlingBallState(),
        state: { mode: "carried" },
      },
    ]);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("marks water death when Chip lacks water boots", () => {
    const chip = makeChipState();

    applyMsChipEnterEffects([makeCell(MS_TILE.Water)], chip, makeContext(makeInventory(), makePortableTools()), 0);

    expect(chip.chipStatus).toBe("drowned");
  });

  it("marks fire death through the concrete tile behavior seam", () => {
    const chip = makeChipState();

    applyMsChipEnterEffects([makeCell(MS_TILE.Fire)], chip, makeContext(makeInventory(), makePortableTools()), 0);

    expect(chip.chipStatus).toBe("burned");
  });

  it("collects a portable item and then resolves the revealed lower water tile", () => {
    const chip = makeChipState();
    const cells = [makeCell(MS_TILE.BowlingBall_Still, MS_TILE.Water)];

    const result = applyMsChipEnterEffects(cells, chip, makeContext(makeInventory(), makePortableTools()), 0);

    expect(chip.chipStatus).toBe("drowned");
    expect(cells[0]!.top.id).toBe(MS_TILE.Water);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Water);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("collects a portable item and then resolves the revealed lower dirt tile", () => {
    const cells = [makeCell(MS_TILE.Sandbag, MS_TILE.Dirt)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(cells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(cells[0]!.bottom.id).toBe(MS_TILE.Empty);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Empty);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("collects a portable item and then resolves the revealed lower popup wall", () => {
    const cells = [makeCell(MS_TILE.Hook, MS_TILE.PopupWall)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(cells[0]!.top.id).toBe(MS_TILE.Wall);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Wall);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("does not immediately resolve a revealed lower ice floor after collecting a portable item", () => {
    const cells = [makeCell(MS_TILE.Sandbag, MS_TILE.Ice)];
    const inventory = makeInventory();
    const portableTools = makePortableTools();

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(cells[0]!.top.id).toBe(MS_TILE.Ice);
    expect(result.movementFloorTile.id).toBe(MS_TILE.Ice);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("does not immediately resolve a revealed lower IC chip after collecting a non-portable pickup", () => {
    const cells = [makeCell(MS_TILE.Key_Red, MS_TILE.ICChip)];
    const inventory = makeInventory();
    inventory.chipsNeeded = 3;

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, makePortableTools()), 0);

    expect(inventory.keys[0]).toBe(1);
    expect(inventory.chipsNeeded).toBe(3);
    expect(cells[0]!.top.id).toBe(MS_TILE.ICChip);
    expect(cells[0]!.bottom.id).toBe(MS_TILE.Empty);
    expect(result.movementFloorTile.id).toBe(MS_TILE.ICChip);
    expect(result.soundEffects).toBe(1 << MS_SOUND.ItemCollected);
  });

  it("clears boots and tools on thief tiles", () => {
    const cells = [makeCell(MS_TILE.Burglar)];
    const inventory = makeInventory();
    inventory.boots = [1, 0, 0, 0];
    inventory.tools = [MS_TILE.Sandbag];
    const portableTools = makePortableTools();
    portableTools.portableItems.push({
      serial: 1,
      family: "sandbag",
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });

    const result = applyMsChipEnterEffects(cells, makeChipState(), makeContext(inventory, portableTools), 0);

    expect(inventory.boots).toEqual([0, 0, 0, 0]);
    expect(inventory.tools).toEqual([0]);
    expect(portableTools.portableItems).toEqual([]);
    expect(result.soundEffects).toBe(1 << MS_SOUND.BootsStolen);
  });
});
