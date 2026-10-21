import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { createEmptyCells, pos } from "@ruleset-ms/impl/testSupport";
import { msSmartTeethCanWait, msSmartTeethHasToggleButtons, msSmartTeethNeighbors } from "@ruleset-ms/impl/smartTeethPlanning";

function fixture() {
  const cells = createEmptyCells();
  const agent = { serial: 1, z: 1, pos: pos(4, 4), dir: MS_DIRECTION.east };
  cells[agent.pos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, agent.dir);
  const context = { cells, actorId: MS_TILE.SmartTeeth, released: false, blockedPositions: new Set<number>() };
  return { cells, agent, context };
}

describe("MS Smart Teeth read-only planning", () => {
  it("allows safe waits only where movement is not forced and scans exposed toggle buttons", () => {
    const { cells, agent, context } = fixture();
    expect(msSmartTeethCanWait(context, agent)).toBe(true);
    cells[agent.pos]!.bottom.id = MS_TILE.Ice;
    expect(msSmartTeethCanWait(context, agent)).toBe(false);
    cells[agent.pos]!.bottom.id = MS_TILE.Slide_East;
    expect(msSmartTeethCanWait(context, agent)).toBe(false);
    cells[agent.pos + 1]!.top.id = MS_TILE.Key_Red;
    cells[agent.pos + 1]!.bottom.id = MS_TILE.Button_Green;
    expect(msSmartTeethHasToggleButtons(context)).toBe(false);
    cells[agent.pos + 1]!.top.id = MS_TILE.Button_Green;
    cells[agent.pos + 1]!.bottom.id = MS_TILE.Empty;
    expect(msSmartTeethHasToggleButtons(context)).toBe(true);
  });

  it("passes keys but rejects lethal hazards, blocks, monsters and locked doors", () => {
    for (const tile of [MS_TILE.Water, MS_TILE.Fire, MS_TILE.Bomb, MS_TILE.Block_Static,
      msCreatureTile(MS_TILE.Bug, MS_DIRECTION.north), MS_TILE.Door_Red]) {
      const { cells, agent, context } = fixture();
      cells[agent.pos + 1]!.top.id = tile;
      expect(msSmartTeethNeighbors(context, agent, agent).some((node) => node.pos === agent.pos + 1)).toBe(false);
    }
    for (const tile of [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green]) {
      const { cells, agent, context } = fixture();
      cells[agent.pos + 1]!.top.id = tile;
      expect(msSmartTeethNeighbors(context, agent, agent)).toContainEqual({ pos: agent.pos + 1, dir: MS_DIRECTION.east });
    }
  });

  it("checks both tile layers without changing cells or occupancy", () => {
    const { cells, agent, context } = fixture();
    cells[agent.pos + 1]!.top.id = MS_TILE.Key_Red;
    cells[agent.pos + 1]!.bottom.id = MS_TILE.Water;
    cells[agent.pos - 1]!.top.id = MS_TILE.HiddenWall_Temp;
    const before = structuredClone(cells);
    expect(msSmartTeethNeighbors(context, agent, agent).map((node) => node.pos)).not.toContain(agent.pos + 1);
    expect(cells).toEqual(before);
    expect(context.blockedPositions.size).toBe(0);
  });

  it("applies thin-wall exits at hypothetical path positions and trap release only at the origin", () => {
    const { cells, agent, context } = fixture();
    const future = { pos: pos(7, 7), dir: MS_DIRECTION.east };
    cells[future.pos]!.top.id = MS_TILE.Wall_East;
    expect(msSmartTeethNeighbors(context, agent, future).map((node) => node.dir)).not.toContain(MS_DIRECTION.east);
    cells[future.pos]!.top.id = MS_TILE.Beartrap;
    expect(msSmartTeethNeighbors({ ...context, released: true }, agent, future)).toEqual([]);
    cells[agent.pos]!.bottom.id = MS_TILE.Beartrap;
    expect(msSmartTeethNeighbors(context, agent, agent)).toEqual([]);
    expect(msSmartTeethNeighbors({ ...context, released: true }, agent, agent)).not.toEqual([]);
  });

  it("preserves direction on ice and obeys force floors", () => {
    const { cells, agent, context } = fixture();
    const future = { pos: pos(7, 7), dir: MS_DIRECTION.east };
    cells[future.pos]!.top.id = MS_TILE.Ice;
    expect(msSmartTeethNeighbors(context, agent, future)).toEqual([{ pos: future.pos + 1, dir: MS_DIRECTION.east }]);
    cells[future.pos]!.top.id = MS_TILE.Slide_North;
    expect(msSmartTeethNeighbors(context, agent, future)).toEqual([{ pos: future.pos - 32, dir: MS_DIRECTION.north }]);
  });

  it("keeps other actors occupied across every hypothetical path node", () => {
    const { agent, context } = fixture();
    context.blockedPositions.add(agent.pos + 1);
    expect(msSmartTeethNeighbors(context, agent, agent).map((node) => node.pos)).not.toContain(agent.pos + 1);
  });

  it("does not enter ice that will force a lethal step or invent a safe bounce", () => {
    const { cells, agent, context } = fixture();
    cells[agent.pos + 1]!.top.id = MS_TILE.Ice;
    cells[agent.pos + 2]!.top.id = MS_TILE.Water;
    expect(msSmartTeethNeighbors(context, agent, agent).map((node) => node.pos)).not.toContain(agent.pos + 1);
    expect(msSmartTeethNeighbors(context, agent, { pos: agent.pos + 1, dir: MS_DIRECTION.east })).toEqual([]);
  });

  it.each(["top", "bottom"] as const)("excludes an unpredictable random force floor in the %s layer", (layer) => {
    const { cells, agent, context } = fixture();
    const target = cells[agent.pos + 1]!;
    target[layer].id = MS_TILE.Slide_Random;
    if (layer === "bottom") {
      target.top.id = MS_TILE.Key_Red;
    }
    const before = structuredClone(cells);
    expect(msSmartTeethNeighbors(context, agent, agent).map((node) => node.pos)).not.toContain(agent.pos + 1);
    expect(cells).toEqual(before);
  });

  it("uses the native teleport destination and rejects its lethal forced exit", () => {
    const { cells, agent, context } = fixture();
    const arrival = pos(8, 8);
    cells[agent.pos + 1]!.top.id = MS_TILE.Teleport;
    cells[arrival]!.top.id = MS_TILE.Teleport;
    expect(msSmartTeethNeighbors(context, agent, agent)).toContainEqual({ pos: arrival, dir: MS_DIRECTION.east, via: agent.pos + 1 });
    cells[arrival + 1]!.top.id = MS_TILE.Fire;
    expect(msSmartTeethNeighbors(context, agent, agent).map((node) => node.dir)).not.toContain(MS_DIRECTION.east);
  });

  it("simulates opening closed toggle walls and closing open walls without changing the board", () => {
    const { cells, agent, context } = fixture();
    cells[agent.pos - 1]!.top.id = MS_TILE.Button_Green;
    cells[agent.pos + 1]!.top.id = MS_TILE.SwitchWall_Closed;
    cells[agent.pos - 32]!.top.id = MS_TILE.SwitchWall_Open;
    const before = structuredClone(cells);
    const pressed = msSmartTeethNeighbors(context, agent, agent).find((node) => node.pos === agent.pos - 1)!;
    expect(pressed).toEqual({ pos: agent.pos - 1, dir: MS_DIRECTION.west, toggled: true });
    const returned = msSmartTeethNeighbors(context, agent, pressed).find((node) => node.pos === agent.pos)!;
    expect(returned.toggled).toBe(true);
    const afterPress = msSmartTeethNeighbors(context, agent, returned);
    expect(afterPress).toContainEqual({ pos: agent.pos + 1, dir: MS_DIRECTION.east, toggled: true });
    expect(afterPress.map((node) => node.pos)).not.toContain(agent.pos - 32);
    expect(msSmartTeethNeighbors(context, agent, returned).find((node) => node.pos === agent.pos - 1)?.toggled ?? false).toBe(false);
    expect(cells).toEqual(before);
  });

  it("uses the entered floor for button presses and preserves broken toggle walls", () => {
    const { cells, agent, context } = fixture();
    cells[agent.pos + 1]!.top.id = MS_TILE.Key_Red;
    cells[agent.pos + 1]!.bottom.id = MS_TILE.Button_Green;
    expect(msSmartTeethNeighbors(context, agent, agent).find((node) => node.pos === agent.pos + 1)?.toggled ?? false).toBe(false);
    cells[agent.pos + 1]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    expect(msSmartTeethNeighbors(context, agent, agent).find((node) => node.pos === agent.pos + 1)?.toggled).toBe(true);
    cells[agent.pos + 1]!.top.id = MS_TILE.SwitchWall_Closed;
    cells[agent.pos + 1]!.top.state = MS_FLOOR_STATE.Broken;
    cells[agent.pos + 1]!.bottom.id = MS_TILE.Empty;
    expect(msSmartTeethNeighbors(context, agent, { ...agent, toggled: true }).map((node) => node.pos)).not.toContain(agent.pos + 1);
  });
});
