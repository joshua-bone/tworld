import { describe, expect, it } from "vitest";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import { advanceHybridCcV0MotionTracks, hybridCcV0ActorMotion } from "./motionProjection";
import type { HybridCcActor, HybridCcSnapshot } from "./wasmBridge";

function element(id: number): HybridCcElement {
  return { id, color: 0, direction: 4, rule: 0, channel: 0, count: 0 };
}

function cell(terrain: number): HybridCcNativeCell {
  return {
    terrain: element(terrain),
    device: element(0),
    pickup: element(0),
    actor: element(0),
    panelEdges: 0,
    iceCornerEdges: 0,
  };
}

function actor(x: number, direction = 1): HybridCcActor {
  return {
    id: 1,
    kind: 41,
    position: { x, y: 0, z: 0 },
    direction,
    alive: true,
    keys: [0, 0, 0, 0],
    tools: [0, 0, 0, 0],
    color: 0,
    rule: 0,
    channel: 0,
    hasLastMoveStep: false,
    lastMoveStep: 0,
    stateFlags: 0,
    forcedDirection: 4,
  };
}

function snapshot(actorValue: HybridCcActor, cells: HybridCcNativeCell[]): HybridCcSnapshot {
  return {
    logicStep: 0,
    stateHash: 0n,
    eventHash: 0n,
    cells,
    actors: [actorValue],
    outcome: { kind: 0, logicStep: 0, position: { x: 0, y: 0, z: 0 }, exitColor: 0, lossCause: 0 },
    chipsCollected: 0,
    signals: [],
    events: [],
    eventsOverflowed: false,
  };
}

const level = { width: 4, height: 1, depth: 1 } as HybridCcNativeLevel;

describe("HybridCC v0 presentation-only actor motion", () => {
  it("interpolates ordinary movement across four 20 Hz presentation samples", () => {
    const cells = [cell(1), cell(1), cell(1), cell(1)];
    const previous = snapshot(actor(0), cells);
    const current = snapshot(actor(1), cells);
    current.events = [{
      sequence: 0, kind: 1, interaction: 1, lossCause: 0, actorKind: 41,
      logicStep: 1, actorId: 1, direction: 1,
      origin: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 0, z: 0 },
      subject: element(1), replacement: element(0), actorStateFlags: 1 << 14, amount: 0,
    }];
    const tracks = advanceHybridCcV0MotionTracks(level, previous, current, 2, new Map());

    expect(hybridCcV0ActorMotion(tracks, 1, 2)).toEqual({ frame: 3, moving: 8 });
    expect(hybridCcV0ActorMotion(tracks, 1, 3)).toEqual({ frame: 2, moving: 6 });
    expect(hybridCcV0ActorMotion(tracks, 1, 4)).toEqual({ frame: 1, moving: 4 });
    expect(hybridCcV0ActorMotion(tracks, 1, 5)).toEqual({ frame: 0, moving: 2 });
    expect(hybridCcV0ActorMotion(tracks, 1, 6)).toEqual({ frame: 0, moving: 0 });
  });

  it("uses authoritative sliding/forced flags instead of inferring speed from terrain", () => {
    for (const terrain of [9, 10]) {
      const previousCells = [cell(terrain), cell(1), cell(1), cell(1)];
      const currentCells = [cell(terrain), cell(terrain), cell(1), cell(1)];
      const previous = snapshot(actor(0), previousCells);
      const current = snapshot(actor(1), currentCells);
      current.events = [{
        sequence: 0, kind: 1, interaction: 2, lossCause: 0, actorKind: 41,
        logicStep: 1, actorId: 1, direction: 1,
        origin: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 0, z: 0 },
        subject: element(terrain), replacement: element(0),
        actorStateFlags: terrain === 9 ? 1 << 6 : 1 << 7, amount: 0,
      }];
      const tracks = advanceHybridCcV0MotionTracks(
        level,
        previous,
        current,
        2,
        new Map(),
      );
      expect(hybridCcV0ActorMotion(tracks, 1, 2).moving).toBe(8);
      expect(hybridCcV0ActorMotion(tracks, 1, 3).moving).toBe(4);
      expect(hybridCcV0ActorMotion(tracks, 1, 4).moving).toBe(0);
    }
  });

  it("animates boot-protected walking normally and does not invent a stationary track", () => {
    const cells = [cell(9), cell(9), cell(9), cell(9)];
    const previous = snapshot(actor(0), cells);
    const current = snapshot(actor(1), cells);
    current.events = [{
      sequence: 0, kind: 1, interaction: 1, lossCause: 0, actorKind: 41,
      logicStep: 1, actorId: 1, direction: 1,
      origin: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 0, z: 0 },
      subject: element(9), replacement: element(0), actorStateFlags: 1 << 14, amount: 0,
    }];
    const moving = advanceHybridCcV0MotionTracks(level, previous, current, 2, new Map());
    expect(moving.get(1)?.durationPresentationTicks).toBe(4);

    const stationarySnapshot = structuredClone(current);
    stationarySnapshot.logicStep += 1;
    stationarySnapshot.events = [];
    const stationary = advanceHybridCcV0MotionTracks(level, current, stationarySnapshot, 6, moving);
    expect(stationary.has(1)).toBe(false);
  });

  it("uses direction-relative movement for a long teleport instead of spanning the map", () => {
    const cells = [cell(12), cell(1), cell(1), cell(12)];
    const previous = snapshot(actor(0), cells);
    const current = snapshot(actor(3), cells);
    current.events = [{
      sequence: 0, kind: 1, interaction: 5, lossCause: 0, actorKind: 41,
      logicStep: 1, actorId: 1, direction: 1,
      origin: { x: 0, y: 0, z: 0 }, position: { x: 3, y: 0, z: 0 },
      subject: element(12), replacement: element(0), actorStateFlags: (1 << 8) | (1 << 14), amount: 0,
    }];
    const tracks = advanceHybridCcV0MotionTracks(level, previous, current, 2, new Map());

    expect(tracks.get(1)).toMatchObject({ from: { x: 2, y: 0, z: 0 }, to: { x: 3, y: 0, z: 0 } });
  });
});
