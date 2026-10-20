import { describe, expect, it } from "vitest";
import { createTestEngineState } from "./testEngineState";
import { actorInventoryClearBoots, actorInventoryCollectIndexedItem, createActorInventoryOwnerId, createKeysBootsActorLocalInventoryOwner } from "./actorLocalInventory";
import { engineStateToSnapshot } from "./snapshot";
import { snapshotToEngineState } from "./initialize";
import { msRegisteredLevelDecodeRegistration } from "@ruleset-ms/impl/builtinLevelRegistration";
import { isMsCreature, msCreatureDir, msCreatureId } from "@ruleset-ms/api/tiles";

describe("Meme tile data contracts", () => {
  it("collects a fifth boot without NaN and removes it with the other boots", () => {
    const state = createTestEngineState([], "MS");
    const owner = createKeysBootsActorLocalInventoryOwner(createActorInventoryOwnerId("test", "chip"), state.inventory);
    actorInventoryCollectIndexedItem(owner, "boots", 4);
    expect(state.inventory.boots).toEqual([0, 0, 0, 0, 1]);
    actorInventoryClearBoots(owner);
    expect(state.inventory.boots[4] ?? 0).toBe(0);
  });

  it("round trips the extra boot and independent hint marks through a snapshot", () => {
    const state = createTestEngineState([], "MS");
    state.inventory.boots.push(1);
    Object.assign(state, { hintTrail: { nextIndex: 2, marks: [{ pos: 34, z: 1, text: "A" }] } });
    const snapshot = engineStateToSnapshot(state, "test", { inputCode: 0, inputName: "none" });
    const restored = snapshotToEngineState(state.request, snapshot);
    expect(restored.inventory.boots).toEqual([0, 0, 0, 0, 1]);
    expect(restored).toHaveProperty("hintTrail", { nextIndex: 2, marks: [{ pos: 34, z: 1, text: "A" }] });
    expect(Reflect.get(restored, "hintTrail")).not.toBe(Reflect.get(state, "hintTrail"));
    expect(Reflect.get(snapshot, "hintTrail")).not.toBe(Reflect.get(state, "hintTrail"));
  });

  it.each([[0x76, 0x86], [0x77, 0x7c], [0x78, 0x7d], [0x79, 0x7e], [0x7a, 0x7f], [0x7b, 0x87], [0x7c, 0x88]])(
    "decodes DAT code %i to its game element", (fileCode, tileId) => {
      expect(msRegisteredLevelDecodeRegistration.resolveTileId(fileCode, { z: 1, hasHigherLayers: false })).toBe(tileId);
    },
  );

  it.each([[0x7c, 1], [0x7d, 2], [0x7e, 4], [0x7f, 8]])("loads Red tank tile %i as a directional actor", (tile, dir) => {
    expect(isMsCreature(tile)).toBe(true);
    expect(msCreatureId(tile)).toBe(0x7c);
    expect(msCreatureDir(tile)).toBe(dir);
  });
});
