import { describe, expect, it } from "vitest";
import { smartTeethRouteOverlays } from "@game-core/impl/smartTeethRoutes";
import type { SmartTeethPlan } from "@game-core/impl/smartTeethPathfinding";

function plan(serial: number, positions: number[], z = 1, direct = true): SmartTeethPlan {
  return { serial, z, direct, path: positions.map((pos) => ({ pos, dir: 8 })) };
}

describe("Smart Teeth route overlays", () => {
  it("connects consecutive route cells with translucent segments and a destination mark", () => {
    const overlays = smartTeethRouteOverlays([plan(4, [33, 34, 66], 2)]);
    expect(overlays).toMatchObject([
      {
        z: 2,
        pos: 33,
        kind: "planned-route",
        render: { mode: "planned-route", serial: 4, alpha: 0.35, direct: true, connections: [34], endpoint: false },
      },
      { z: 2, pos: 34, kind: "planned-route", render: { connections: [33, 66], endpoint: false } },
      { z: 2, pos: 66, kind: "planned-route", render: { connections: [34], endpoint: true } },
    ]);
  });

  it("keeps actor colors stable when route assignment order changes", () => {
    const before = smartTeethRouteOverlays([plan(1, [33, 34]), plan(2, [65, 66])]);
    const after = smartTeethRouteOverlays([plan(2, [97, 98], 1, false), plan(1, [34, 35])]);
    const color = (overlays: typeof before, serial: number) => {
      const render = overlays.find(
        (overlay) => overlay.render?.mode === "planned-route" && overlay.render.serial === serial,
      )?.render;
      return render?.mode === "planned-route" ? render.color : undefined;
    };
    expect(color(before, 1)).toEqual(expect.any(String));
    expect(color(before, 1)).toBe(color(after, 1));
    expect(color(before, 1)).not.toBe(color(before, 2));
  });

  it("breaks teleport jumps and row wraps instead of drawing through intervening cells", () => {
    const overlays = smartTeethRouteOverlays([plan(1, [30, 31, 32, 200, 201])]);
    expect(
      overlays.map((overlay) => (overlay.render?.mode === "planned-route" ? overlay.render.connections : null)),
    ).toEqual([[31], [30], [], [201], [200]]);
  });

  it("shows the physical teleporter entrance before resuming the route at its remote landing", () => {
    const route = plan(1, [33, 200, 201]);
    route.path[1]!.via = 34;
    expect(smartTeethRouteOverlays([route])).toMatchObject([
      { pos: 33, render: { connections: [34], endpoint: false } },
      { pos: 34, render: { connections: [33], endpoint: false } },
      { pos: 200, render: { connections: [201], endpoint: false } },
      { pos: 201, render: { connections: [200], endpoint: true } },
    ]);
  });

  it("does not duplicate an in-flight actor already occupying its teleporter entrance", () => {
    const route = plan(1, [34, 200, 201]);
    route.path[1]!.via = 34;
    const overlays = smartTeethRouteOverlays([route]);
    expect(overlays).toMatchObject([
      { pos: 34, render: { connections: [], endpoint: false } },
      { pos: 200, render: { connections: [201], endpoint: false } },
      { pos: 201, render: { connections: [200], endpoint: true } },
    ]);
  });

  it("breaks a teleport connector even when its entrance and landing are adjacent", () => {
    const route = plan(1, [33, 35, 36]);
    route.path[1]!.via = 34;
    expect(smartTeethRouteOverlays([route])).toMatchObject([
      { pos: 33, render: { connections: [34] } },
      { pos: 34, render: { connections: [33] } },
      { pos: 35, render: { connections: [36] } },
      { pos: 36, render: { connections: [35], endpoint: true } },
    ]);
  });

  it("merges waits and revisited cells into one translucent overlay with all connections", () => {
    const route = plan(1, [33, 34, 34, 35, 34, 66, 34]);
    route.path[2]!.wait = true;
    expect(smartTeethRouteOverlays([route])).toMatchObject([
      { pos: 33, render: { connections: [34], endpoint: false, alpha: 0.35 } },
      { pos: 34, render: { connections: [33, 35, 66], endpoint: true, alpha: 0.35 } },
      { pos: 35, render: { connections: [34], endpoint: false, alpha: 0.35 } },
      { pos: 66, render: { connections: [34], endpoint: false, alpha: 0.35 } },
    ]);
  });

  it("keeps different actors' overlapping route cells separate", () => {
    const overlays = smartTeethRouteOverlays([plan(1, [33, 34]), plan(2, [34, 35])]);
    expect(overlays.filter((overlay) => overlay.pos === 34)).toMatchObject([
      { render: { serial: 1, connections: [33], endpoint: true } },
      { render: { serial: 2, connections: [35], endpoint: false } },
    ]);
  });

  it("preserves the adjacent teleport break when merging a revisited landing", () => {
    const route = plan(1, [33, 35, 36, 35]);
    route.path[1]!.via = 34;
    expect(smartTeethRouteOverlays([route])).toMatchObject([
      { pos: 33, render: { connections: [34], endpoint: false } },
      { pos: 34, render: { connections: [33], endpoint: false } },
      { pos: 35, render: { connections: [36], endpoint: true } },
      { pos: 36, render: { connections: [35], endpoint: false } },
    ]);
  });

  it("omits empty plans and retains a stationary surround target on its own layer", () => {
    expect(smartTeethRouteOverlays([plan(1, [])])).toEqual([]);
    expect(smartTeethRouteOverlays([plan(2, [100], 3, false)])).toMatchObject([
      { z: 3, pos: 100, render: { connections: [], endpoint: true, direct: false } },
    ]);
  });
});
