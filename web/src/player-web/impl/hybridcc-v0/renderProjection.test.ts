import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { HybridCcElement, HybridCcNativeCell, HybridCcNativeLevel } from "./nativeLevel";
import { projectHybridCcSession } from "./renderProjection";
import type { HybridCcSnapshot } from "./wasmBridge";

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
    }],
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
    const session = projectHybridCcSession(level, snapshot, "PACK.dat");

    expect(session.frame.cells).toMatchObject([
      { top: { id: MS_TILE.Key_Blue }, bottom: { id: MS_TILE.Slide_East } },
      { top: { id: MS_TILE.IceWall_Northeast }, bottom: { id: MS_TILE.Nothing } },
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

    const session = projectHybridCcSession(level, snapshot, "PACK.dat");

    expect(session.frame.cells).toMatchObject([
      { top: { id: MS_TILE.Empty }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Wall }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Water }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Fire }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Dirt }, bottom: { id: MS_TILE.Nothing } },
      { top: { id: MS_TILE.Gravel }, bottom: { id: MS_TILE.Nothing } },
    ]);
  });

  it("projects timing, inventory, direction, and state hashes without changing engine state", () => {
    const { level, snapshot } = fixture();
    const session = projectHybridCcSession(level, snapshot, "PACK.dat");

    expect(session.frame.snapshot).toMatchObject({
      tick: 8,
      currentTime: 8,
      chipsNeeded: 3,
      inventory: {
        keys: [2, 1, 0, 0],
        boots: [2, 1, 4, 3],
      },
      mapHash: "1234",
    });
    expect(session.frame.render?.chip).toMatchObject({
      pos: 1,
      dir: MS_DIRECTION.east,
      visual: { tileId: MS_TILE.Chip },
    });
  });
});
