import { describe, expect, it } from "vitest";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import {
  HybridCcV0GameEngineAdapter,
  HybridCcV0LevelRegistry,
} from "./HybridCcV0GameEngineAdapter";
import type { HybridCcActor, HybridCcEngine, HybridCcEngineEvent, HybridCcSnapshot } from "./wasmBridge";

function element(id: number): HybridCcElement {
  return { id, color: 0, direction: 4, rule: 0, channel: 0, count: 0 };
}

function cell(terrain = 1): HybridCcNativeCell {
  return { terrain: element(terrain), device: element(0), pickup: element(0), actor: element(0), panelEdges: 0, iceCornerEdges: 0 };
}

function player(x: number, tools: HybridCcActor["tools"] = [0, 0, 1, 0]): HybridCcActor {
  return {
    id: 1, kind: 41, position: { x, y: 0, z: 0 }, direction: 1, alive: true,
    keys: [0, 0, 0, 0], tools, color: 0, rule: 0, channel: 0,
    hasLastMoveStep: x > 0, lastMoveStep: x, stateFlags: x > 0 ? 1 << 14 : 0, forcedDirection: 4,
  };
}

function movedEvent(step: number): HybridCcEngineEvent {
  return {
    sequence: 0, kind: 1, interaction: 1, lossCause: 0, actorKind: 41,
    logicStep: step, actorId: 1, direction: 1,
    origin: { x: 0, y: 0, z: 0 }, position: { x: 1, y: 0, z: 0 },
    subject: element(9), replacement: element(0), actorStateFlags: 1 << 14, amount: 0,
  };
}

function snapshot(step: number): HybridCcSnapshot {
  const cells = [cell(9), cell(9)];
  return {
    logicStep: step, stateHash: BigInt(step), eventHash: BigInt(step), cells,
    actors: [player(step === 0 ? 0 : 1)], signals: [], events: step === 0 ? [] : [movedEvent(step)],
    eventsOverflowed: false,
    outcome: { kind: 0, logicStep: step, position: { x: 0, y: 0, z: 0 }, exitColor: 0, lossCause: 0 },
    chipsCollected: 0,
  };
}

function level(): HybridCcNativeLevel {
  return {
    width: 2, height: 1, depth: 1, number: 1, requiredChips: 0, timeLimitSeconds: 100,
    title: "Adapter", author: "Test", hint: "", password: "", actorOrder: [],
    cells: [cell(9), cell(9)], encoded: new Uint8Array([1]),
  };
}

describe("HybridCcV0GameEngineAdapter", () => {
  it("turns four 40 Hz input samples into one 10 Hz logic step and two 20 Hz presentation frames", async () => {
    const inputs: number[] = [];
    let disposed = false;
    const engine: HybridCcEngine = {
      snapshot: () => snapshot(0),
      logicStep: (input) => {
        inputs.push(input);
        return snapshot(inputs.length);
      },
      dispose: () => { disposed = true; },
    };
    const registry = new HybridCcV0LevelRegistry();
    registry.register("Pack-Hybrid", [level()]);
    const adapter = new HybridCcV0GameEngineAdapter(registry, { create: () => engine });
    const request = { seriesFile: "Pack-Hybrid", levelNumber: 1, ruleset: "Hybrid" as const, randomSeed: 7 };

    let session = await adapter.startSession(request);
    expect(session.frame.snapshot.tick).toBe(0);
    session = await adapter.advanceSession(session, 7);
    expect(inputs).toEqual([7]);
    expect(session.frame.snapshot.tick).toBe(2);
    expect(session.frame.render?.chip).toMatchObject({ moving: 8, visual: { frame: 3 } });
    session = await adapter.advanceSession(session, 7);
    expect(session.frame.snapshot.tick).toBe(2);
    session = await adapter.advanceSession(session, 7);
    expect(session.frame.snapshot.tick).toBe(3);
    session = await adapter.advanceSession(session, 7);
    expect(session.frame.snapshot.tick).toBe(3);
    expect(inputs).toEqual([7]);

    await adapter.disposeSession(session);
    expect(disposed).toBe(true);
  });

  it("rejects legacy ruleset requests instead of masquerading as Lynx", async () => {
    const registry = new HybridCcV0LevelRegistry();
    registry.register("Pack-Hybrid", [level()]);
    const adapter = new HybridCcV0GameEngineAdapter(registry, {
      create: () => ({ snapshot: () => snapshot(0), logicStep: () => snapshot(1), dispose: () => {} }),
    });

    await expect(adapter.startSession({ seriesFile: "Pack-Hybrid", levelNumber: 1, ruleset: "Lynx" })).rejects.toThrow(
      "only accepts the Hybrid ruleset",
    );
  });
});
