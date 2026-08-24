import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import { projectHybridCcSession } from "./renderProjection";
import { HYBRID_CC_V0_CELL_STATE, HYBRID_CC_V0_EVENT } from "./engineFacts";
import type { HybridCcEngineEvent, HybridCcSnapshot } from "./wasmBridge";

function element(id: number, overrides: Partial<HybridCcElement> = {}): HybridCcElement {
  return { id, color: 0, direction: 4, rule: 0, channel: 0, count: 0, ...overrides };
}

function cell(overrides: Partial<HybridCcNativeCell> = {}): HybridCcNativeCell {
  return {
    terrain: element(1),
    device: element(0),
    pickup: element(0),
    actor: element(0),
    panelEdges: 0,
    iceCornerEdges: 0,
    ...overrides,
  };
}

function fixture(): { level: HybridCcNativeLevel; snapshot: HybridCcSnapshot } {
  const cells = [
    cell({ terrain: element(10, { direction: 1 }), pickup: element(24, { color: 1 }) }),
    cell({ terrain: element(9), iceCornerEdges: 0b0011 }),
    cell({ terrain: element(8), panelEdges: 0b1000 }),
  ];
  const level: HybridCcNativeLevel = {
    width: 3,
    height: 1,
    depth: 1,
    number: 7,
    requiredChips: 5,
    timeLimitSeconds: 100,
    title: "Projection",
    author: "Test",
    hint: "",
    password: "ABCD",
    actorOrder: [],
    cells,
    encoded: new Uint8Array([1]),
  };
  const snapshot: HybridCcSnapshot = {
    logicStep: 4,
    stateHash: 0x1234n,
    cells,
    actors: [{
      id: 1,
      kind: 41,
      position: { x: 1, y: 0, z: 0 },
      direction: 1,
      alive: true,
      keys: [2, 1, 0, 0],
      tools: [1, 2, 3, 4],
      color: 0,
      rule: 0,
      channel: 0,
      hasLastMoveStep: true,
      lastMoveStep: 4,
      stateFlags: 1 << 14,
      forcedDirection: 4,
    }],
    eventHash: 0n,
    signals: [],
    events: [],
    eventsOverflowed: false,
    outcome: {
      kind: 0,
      logicStep: 4,
      position: { x: 0, y: 0, z: 0 },
      exitColor: 1,
      lossCause: 0,
    },
    chipsCollected: 2,
  };
  return { level, snapshot };
}

describe("HybridCC v0 Tile World render projection", () => {
  it("maps native layers and metadata to Lynx artwork tiles", () => {
    const { level, snapshot } = fixture();
    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.cells).toMatchObject([
      { top: { id: MS_TILE.Key_Blue }, bottom: { id: MS_TILE.Slide_East } },
      { top: { id: MS_TILE.IceWall_Southwest }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Wall_West }, bottom: { id: MS_TILE.Gravel } },
    ]);
  });

  it("draws bare terrain on the visible layer instead of covering it with floor", () => {
    const { level, snapshot } = fixture();
    const terrain = [
      element(1),
      element(2),
      element(4),
      element(5),
      element(7),
      element(8),
    ];
    level.width = terrain.length;
    level.cells = terrain.map((value) => cell({ terrain: value }));
    snapshot.cells = level.cells;

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.cells).toMatchObject([
      { top: { id: MS_TILE.Empty }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Wall }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Water }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Fire }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Dirt }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Gravel }, bottom: { id: MS_TILE.Nothing } },
    ]);
  });

  it("maps native key and boot slots into the shared Lynx HUD order", () => {
    const { level, snapshot } = fixture();
    snapshot.actors[0]!.keys = [11, 22, 33, 44];
    snapshot.actors[0]!.tools = [55, 66, 77, 88];

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.snapshot.inventory).toMatchObject({
      // Hybrid native keys: blue, red, green, yellow.
      // Shared HUD keys: red, blue, yellow, green.
      keys: [22, 11, 44, 33],
      // Hybrid native tools: flippers, fire boots, ice skates, force boots.
      // Shared HUD boots: ice skates, force boots, fire boots, flippers.
      boots: [77, 88, 66, 55],
    });
  });

  it("projects timing, direction, and state hashes without changing engine state", () => {
    const { level, snapshot } = fixture();
    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 9);

    expect(session.frame.snapshot).toMatchObject({
      tick: 9,
      currentTime: 9,
      chipsNeeded: 3,
      mapHash: "1234",
    });
    expect(session.frame.render?.chip).toMatchObject({
      pos: 1,
      dir: MS_DIRECTION.east,
      visual: { tileId: MS_TILE.Chip, frame: 0 },
    });
  });

  it("renders all ice corners by their artwork opening, opposite their solid native edges", () => {
    const { level, snapshot } = fixture();
    level.width = 4;
    level.cells = [0b1001, 0b0011, 0b0110, 0b1100]
      .map((iceCornerEdges) => cell({ terrain: element(9), iceCornerEdges }));
    snapshot.cells = level.cells;

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.cells.map((projected) => projected.top.id)).toEqual([
      MS_TILE.IceWall_Southeast,
      MS_TILE.IceWall_Southwest,
      MS_TILE.IceWall_Northwest,
      MS_TILE.IceWall_Northeast,
    ]);
  });

  it("preserves both visible DAT layers when panels, pickups, and devices overlap", () => {
    const { level, snapshot } = fixture();
    level.width = 2;
    level.cells = [
      cell({ pickup: element(24, { color: 2 }), panelEdges: 0b0001 }),
      cell({ device: element(18, { color: 1 }), pickup: element(22) }),
    ];
    snapshot.cells = level.cells;

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.cells).toMatchObject([
      { top: { id: MS_TILE.Wall_North }, bottom: { id: MS_TILE.Key_Red } },
      { top: { id: MS_TILE.ICChip }, bottom: { id: MS_TILE.Button_Blue } },
    ]);
  });

  it("renders toggle walls from current signal state instead of their initial rule", () => {
    const { level, snapshot } = fixture();
    level.width = 2;
    level.cells = [
      cell({ device: element(19, { rule: 6 }), dynamicState: 0 }),
      cell({ device: element(19, { rule: 7 }), dynamicState: HYBRID_CC_V0_CELL_STATE.open }),
    ];
    snapshot.cells = level.cells;

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.cells.map((projected) => projected.top.id)).toEqual([
      MS_TILE.SwitchWall_Closed,
      MS_TILE.SwitchWall_Open,
    ]);
  });

  it("keeps the camera and inventory at Chip's terminal position after death", () => {
    const { level, snapshot } = fixture();
    const chip = snapshot.actors[0]!;
    chip.alive = false;
    chip.position = { x: 2, y: 0, z: 0 };
    snapshot.outcome = {
      kind: 2,
      logicStep: 4,
      position: { x: 2, y: 0, z: 0 },
      exitColor: 0,
      lossCause: 2,
    };

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.snapshot.view).toEqual({ x: 16, y: 0 });
    expect(session.frame.snapshot.inventory.keys).toEqual([1, 2, 0, 0]);
    expect(session.frame.render?.chip).toMatchObject({ pos: 2, failed: true });
    expect(session.run.result).toMatchObject({
      outcome: "failed",
      endPosition: { x: 3, y: 1, z: 1 },
      cause: {
        kind: "fire",
        message: "Stepped in fire at (3, 1)",
        position: { x: 3, y: 1, z: 1 },
      },
    });
  });

  it("keeps the camera on the durable terminal position when Chip is no longer in the actor list", () => {
    const { level, snapshot } = fixture();
    snapshot.actors = [];
    snapshot.outcome = {
      kind: 2,
      logicStep: 4,
      position: { x: 2, y: 0, z: 0 },
      exitColor: 0,
      lossCause: 3,
    };
    const destroyed: HybridCcEngineEvent = {
      sequence: 0, kind: HYBRID_CC_V0_EVENT.actorDestroyed, interaction: 0,
      lossCause: 3, actorKind: 41, logicStep: 4, actorId: 1, direction: 1,
      origin: { x: 2, y: 0, z: 0 }, position: { x: 2, y: 0, z: 0 },
      subject: element(0), replacement: element(0), actorStateFlags: 0, amount: 0,
    };
    snapshot.events = [destroyed];

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.frame.snapshot.view).toEqual({ x: 16, y: 0 });
    expect(session.frame.render?.animations).toContainEqual({
      pos: 2,
      z: 0,
      frame: 0,
      tileId: 0x75,
    });
  });

  it("projects a completed run with the shared score summary", () => {
    const { level, snapshot } = fixture();
    snapshot.outcome = {
      kind: 1,
      logicStep: 4,
      position: { x: 1, y: 0, z: 0 },
      exitColor: 1,
      lossCause: 0,
    };

    const session = projectHybridCcSession(level, snapshot, "PACK.dat", 8);

    expect(session.run.result).toMatchObject({
      outcome: "completed-clean",
      endPosition: { x: 2, y: 1, z: 1 },
      score: { baseScore: 3500, timeBonus: 1000, finalScore: 4500 },
    });
  });
});
