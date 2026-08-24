import { describe, expect, it } from "vitest";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { HYBRID_CC_V0_EVENT, HYBRID_CC_V0_INTERACTION } from "./engineFacts";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcV0MotionTrack } from "./motionProjection";
import { projectHybridCcV0SoundEffects } from "./soundProjection";
import type { HybridCcActor, HybridCcEngineEvent, HybridCcSnapshot } from "./wasmBridge";

function element(id: number): HybridCcElement {
  return { id, color: 0, direction: 4, rule: 0, channel: 0, count: 0 };
}

function cell(): HybridCcNativeCell {
  return {
    terrain: element(1), device: element(0), pickup: element(0), actor: element(0),
    panelEdges: 0, iceCornerEdges: 0,
  };
}

function player(overrides: Partial<HybridCcActor> = {}): HybridCcActor {
  return {
    id: 1, kind: 41, position: { x: 0, y: 0, z: 0 }, direction: 1, alive: true,
    keys: [0, 0, 0, 0], tools: [0, 0, 0, 0], color: 0, rule: 0, channel: 0,
    hasLastMoveStep: false, lastMoveStep: 0, stateFlags: 0, forcedDirection: 4,
    ...overrides,
  };
}

function event(overrides: Partial<HybridCcEngineEvent>): HybridCcEngineEvent {
  return {
    sequence: 0, kind: HYBRID_CC_V0_EVENT.none, interaction: HYBRID_CC_V0_INTERACTION.none,
    lossCause: 0, actorKind: 41, logicStep: 2, actorId: 1, direction: 1,
    origin: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 0, z: 0 },
    subject: element(0), replacement: element(0), actorStateFlags: 0, amount: 0,
    ...overrides,
  };
}

function fixture(): { level: HybridCcNativeLevel; previous: HybridCcSnapshot; current: HybridCcSnapshot } {
  const cells = [cell(), cell(), cell()];
  const level: HybridCcNativeLevel = {
    width: 3, height: 1, depth: 1, number: 1, requiredChips: 0, timeLimitSeconds: 100,
    title: "Sound", author: "Test", hint: "", password: "", actorOrder: [], cells,
    encoded: new Uint8Array(),
  };
  const previous: HybridCcSnapshot = {
    logicStep: 1, stateHash: 1n, eventHash: 0n, cells, actors: [player()], signals: [], events: [],
    eventsOverflowed: false,
    outcome: { kind: 0, logicStep: 1, position: { x: 0, y: 0, z: 0 }, exitColor: 0, lossCause: 0 },
    chipsCollected: 0,
  };
  return { level, previous, current: structuredClone(previous) };
}

function hasSound(mask: number, sound: number): boolean {
  return (mask & (1 << sound)) !== 0;
}

describe("HybridCC v0 Lynx sound projection", () => {
  it("plays loss and bomb sounds from terminal events after the player has been removed", () => {
    const { level, previous, current } = fixture();
    current.actors = [];
    current.outcome = { kind: 2, logicStep: 2, position: { x: 1, y: 0, z: 0 }, exitColor: 0, lossCause: 3 };
    current.events = [event({ kind: HYBRID_CC_V0_EVENT.terminal, lossCause: 3 })];

    const mask = projectHybridCcV0SoundEffects(level, previous, current);

    expect(hasSound(mask, LYNX_SOUND.ChipLoses)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.BombExplodes)).toBe(true);
  });

  it("uses inventory and device events for chips, items, doors, and sockets", () => {
    const { level, previous, current } = fixture();
    current.events = [
      event({ kind: HYBRID_CC_V0_EVENT.inventoryChanged, subject: element(22), amount: 1 }),
      event({ kind: HYBRID_CC_V0_EVENT.inventoryChanged, subject: element(24), amount: 1 }),
      event({ kind: HYBRID_CC_V0_EVENT.deviceChanged, subject: element(20) }),
      event({ kind: HYBRID_CC_V0_EVENT.deviceChanged, subject: element(21) }),
    ];
    const mask = projectHybridCcV0SoundEffects(level, previous, current);
    expect(hasSound(mask, LYNX_SOUND.IcCollected)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.ItemCollected)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.DoorOpened)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.SocketOpened)).toBe(true);
  });

  it("plays button audio for Chip, blocks, and mobs from the same activation event", () => {
    const { level, previous, current } = fixture();
    for (const actorKind of [41, 30, 36]) {
      current.events = [event({
        kind: HYBRID_CC_V0_EVENT.interaction,
        interaction: HYBRID_CC_V0_INTERACTION.activate,
        actorKind,
        subject: element(18),
      })];
      expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current), LYNX_SOUND.ButtonPushed)).toBe(true);
    }
  });

  it("keeps a boot-walking loop only for the visible committed movement", () => {
    const { level, previous, current } = fixture();
    current.actors[0]!.tools[2] = 1;
    const track: HybridCcV0MotionTrack = {
      actorId: 1, actorKind: 41, direction: 1, durationPresentationTicks: 4,
      from: { x: 0, y: 0, z: 0 }, to: { x: 1, y: 0, z: 0 },
      startedAtPresentationTick: 2, surfaceId: 9,
    };
    const tracks = new Map([[1, track]]);

    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current, 0, tracks, 2), LYNX_SOUND.IceWalking)).toBe(true);
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current, 0, tracks, 5), LYNX_SOUND.IceWalking)).toBe(true);
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current, 0, tracks, 6), LYNX_SOUND.IceWalking)).toBe(false);
  });

  it("derives blocked moves, terrain changes, traps, and teleports from explicit facts", () => {
    const { level, previous, current } = fixture();
    expect(hasSound(projectHybridCcV0SoundEffects(level, previous, current, 1), LYNX_SOUND.CantMove)).toBe(true);

    current.events = [
      event({ kind: HYBRID_CC_V0_EVENT.terrainChanged, subject: element(6), replacement: element(1) }),
      event({ kind: HYBRID_CC_V0_EVENT.terrainChanged, subject: element(14), replacement: element(2) }),
      event({ kind: HYBRID_CC_V0_EVENT.actorMoved, subject: element(13) }),
      event({ kind: HYBRID_CC_V0_EVENT.interaction, interaction: HYBRID_CC_V0_INTERACTION.teleport }),
    ];
    const mask = projectHybridCcV0SoundEffects(level, previous, current);
    expect(hasSound(mask, LYNX_SOUND.TileEmptied)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.WallCreated)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.TrapEntered)).toBe(true);
    expect(hasSound(mask, LYNX_SOUND.Teleporting)).toBe(true);
  });
});
