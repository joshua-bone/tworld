import { describe, expect, it } from "vitest";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import { projectHybridCcV0SoundEffects } from "./soundProjection";
import type { HybridCcSnapshot } from "./wasmBridge";

function element(id: number): HybridCcElement {
  return { id, color: 0, direction: 4, rule: 0, channel: 0, count: 0 };
}

function cell(terrain = 1, device = 0, pickup = 0): HybridCcNativeCell {
  return {
    terrain: element(terrain),
    device: element(device),
    pickup: element(pickup),
    actor: element(0),
    panelEdges: 0,
    iceCornerEdges: 0,
  };
}

function fixture(): { level: HybridCcNativeLevel; previous: HybridCcSnapshot; current: HybridCcSnapshot } {
  const cells = [cell(), cell(), cell()];
  const level: HybridCcNativeLevel = {
    width: 3,
    height: 1,
    depth: 1,
    number: 1,
    requiredChips: 0,
    timeLimitSeconds: 100,
    title: "Sound",
    author: "Test",
    hint: "",
    password: "",
    actorOrder: [],
    cells,
    encoded: new Uint8Array(),
  };
  const previous: HybridCcSnapshot = {
    logicStep: 1,
    stateHash: 1n,
    cells,
    actors: [{
      id: 1,
      kind: 41,
      position: { x: 0, y: 0, z: 0 },
      direction: 1,
      alive: true,
      keys: [0, 0, 0, 0],
      tools: [0, 0, 0, 0],
    }],
    outcome: { kind: 0, logicStep: 1, position: { x: 0, y: 0, z: 0 }, exitColor: 0, lossCause: 0 },
    chipsCollected: 0,
  };
  return {
    level,
    previous,
    current: structuredClone(previous),
  };
}

function hasSound(mask: number, sound: number): boolean {
  return (mask & (1 << sound)) !== 0;
}

describe("HybridCC v0 Lynx sound projection", () => {
  it("reports terminal sounds from the durable engine outcome", () => {
    const { level, previous, current } = fixture();
    current.outcome = { kind: 2, logicStep: 2, position: { x: 0, y: 0, z: 0 }, exitColor: 0, lossCause: 3 };

    const mask = projectHybridCcV0SoundEffects(level, previous, current);

    expect(hasSound(mask, LYNX_SOUND.ChipLoses)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.BombExplodes)).toBe(true);
  });

  it("distinguishes chip collection, ordinary pickup, door, and thief sounds", () => {
    const { level, previous, current } = fixture();
    current.chipsCollected = 1;
    current.actors[0]!.keys[0] = 1;
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current), LYNX_SOUND.IcCollected)).toBe(true);
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current), LYNX_SOUND.ItemCollected)).toBe(true);

    const afterPickup = structuredClone(current);
    afterPickup.actors[0]!.position.x = 1;
    afterPickup.actors[0]!.keys[0] = 0;
    current.cells = [cell(), cell(1, 20), cell()];
    afterPickup.cells = [cell(), cell(), cell()];
    expect(hasSound(projectHybridCcV0SoundEffects(level, current, afterPickup), LYNX_SOUND.DoorOpened)).toBe(true);

    const afterThief = structuredClone(afterPickup);
    afterThief.actors[0]!.tools = [0, 0, 0, 0];
    afterPickup.actors[0]!.tools = [1, 0, 0, 0];
    afterThief.cells = [cell(), cell(17), cell()];
    expect(hasSound(projectHybridCcV0SoundEffects(level, afterPickup, afterThief), LYNX_SOUND.BootsStolen)).toBe(true);
  });

  it("keeps Lynx surface loops active and detects teleports", () => {
    const { level, previous, current } = fixture();
    current.actors[0]!.position.x = 2;
    current.cells = [cell(), cell(), cell(10)];

    const mask = projectHybridCcV0SoundEffects(level, previous, current);

    expect(hasSound(mask, LYNX_SOUND.Teleporting)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.Sliding)).toBe(true);
  });

  it("covers blocked moves and the remaining classic floor mutation sounds", () => {
    const { level, previous, current } = fixture();

    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current, 1), LYNX_SOUND.CantMove)).toBe(true);

    previous.cells = [cell(), cell(6), cell()];
    current.cells = [cell(), cell(), cell()];
    current.actors[0]!.position.x = 1;
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current), LYNX_SOUND.TileEmptied)).toBe(true);

    const beforePopupExit = structuredClone(current);
    const afterPopupExit = structuredClone(current);
    beforePopupExit.cells = [cell(), cell(14), cell()];
    afterPopupExit.cells = [cell(), cell(2), cell()];
    beforePopupExit.actors[0]!.position.x = 1;
    afterPopupExit.actors[0]!.position.x = 2;
    expect(hasSound(projectHybridCcV0SoundEffects(level, beforePopupExit, afterPopupExit), LYNX_SOUND.WallCreated)).toBe(true);

    const beforeTrap = structuredClone(previous);
    const afterTrap = structuredClone(previous);
    beforeTrap.actors[0]!.position.x = 0;
    afterTrap.actors[0]!.position.x = 1;
    afterTrap.cells = [cell(), cell(13), cell()];
    expect(hasSound(projectHybridCcV0SoundEffects(level, beforeTrap, afterTrap), LYNX_SOUND.TrapEntered)).toBe(true);
  });

  it("recognizes a successful adjacent teleport from its destination terrain", () => {
    const { level, previous, current } = fixture();
    current.actors[0]!.position.x = 1;
    current.cells = [cell(), cell(12), cell()];

    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current), LYNX_SOUND.Teleporting)).toBe(true);
  });
});
