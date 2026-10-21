import { describe, expect, it } from "vitest";
import { advancePositionIfPossible } from "./grid";
import {
  coordinateSmartTeethRoutes,
  type SmartTeethAgent,
  type SmartTeethPlanningContext,
} from "./smartTeethPathfinding";

const actor = (serial: number, pos: number): SmartTeethAgent => ({
  serial,
  pos,
  dir: 8,
  z: 1,
});
function board(
  player: number,
  blocked: number[] = [],
): SmartTeethPlanningContext {
  return {
    width: 7,
    height: 7,
    player: { pos: player, z: 1 },
    neighbors: (_, node) =>
      [1, 2, 4, 8].flatMap((dir) => {
        const pos = advancePositionIfPossible(node.pos, dir, 7, 7);
        return pos === null || blocked.includes(pos) ? [] : [{ pos, dir }];
      }),
  };
}
const positions = (
  plan: ReturnType<typeof coordinateSmartTeethRoutes>[number],
) => plan.path.map((node) => node.pos);

describe("Smart Teeth coordinated A*", () => {
  it("plans a button detour that revisits the same corridor with walls toggled", () => {
    const context = board(12);
    const legal = new Set([8, 9, 10, 11, 12, 15, 22]);
    const ordinary = context.neighbors;
    context.neighbors = (agent, node) =>
      ordinary(agent, node)
        .filter(
          (next) => legal.has(next.pos) && (next.pos !== 10 || node.toggled),
        )
        .map((next) => ({
          ...next,
          toggled: next.pos === 15 ? !node.toggled : !!node.toggled,
        }));
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 8), actor(2, 22)],
      context,
    );
    expect(positions(plans.find((p) => p.serial === 1)!)).toEqual([
      8, 15, 8, 9, 10, 11, 12,
    ]);
    expect(plans.find((p) => p.serial === 1)!.direct).toBe(true);
    expect(positions(plans.find((p) => p.serial === 2)!)).toEqual([22]);
  });

  function cooperationBoard(
    player = 12,
    button = 15,
    extra: number[] = [],
  ): SmartTeethPlanningContext {
    const context = board(player);
    const legal = new Set([8, 9, 10, 11, 12, 15, 22, ...extra]);
    const ordinary = context.neighbors;
    context.hasToggleButtons = true;
    context.directionMatters = () => false;
    context.neighbors = (agent, node) =>
      ordinary(agent, node)
        .filter(
          (next) => legal.has(next.pos) && (next.pos !== 10 || node.toggled),
        )
        .map((next) => ({
          ...next,
          toggled: next.pos === button ? !node.toggled : !!node.toggled,
        }));
    return context;
  }

  it("assigns a reachable button to a helper when that shortens another actor's pursuit", () => {
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 8), actor(2, 22)],
      cooperationBoard(),
    );
    expect(positions(plans[0]!)).toEqual([8, 9, 10, 11, 12]);
    expect(plans[0]!.direct).toBe(true);
    expect(positions(plans[1]!)).toEqual([22, 15]);
    expect(plans[1]!.direct).toBe(false);
    expect(plans[1]!.path[1]!.toggled).toBe(true);
  });

  it("waits at a closed passage until the helper can actually reach its button", () => {
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 9), actor(2, 36)],
      cooperationBoard(12, 15, [29, 36]),
    );
    expect(plans[0]!.direct).toBe(true);
    expect(plans[0]!.path[1]!.wait).toBe(true);
    expect(positions(plans[0]!)).toEqual([9, 9, 9, 9, 10, 11, 12]);
    expect(positions(plans[1]!)).toEqual([36, 29, 22, 15]);
  });

  it("keeps a shorter solo pursuit and does not send an unnecessary button helper", () => {
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 11), actor(2, 22)],
      cooperationBoard(),
    );
    expect(positions(plans[0]!)).toEqual([11, 12]);
    expect(plans[0]!.direct).toBe(true);
    expect(plans[1]!.path.some((node) => node.toggled)).toBe(false);
  });

  it("discovers useful helpers without depending on actor enumeration order", () => {
    const agents = [actor(9, 8), actor(2, 22), actor(3, 36)];
    const context = cooperationBoard(12, 15, [29, 36]);
    const plans = coordinateSmartTeethRoutes(agents, context);
    expect(plans.find((p) => p.serial === 9)!.direct).toBe(true);
    expect(positions(plans.find((p) => p.serial === 2)!)).toEqual([22, 15]);
    expect(positions(plans.find((p) => p.serial === 3)!)).not.toContain(15);
    expect(coordinateSmartTeethRoutes([...agents].reverse(), context)).toEqual(
      plans,
    );
  });

  it("accounts for a committed helper arrival instead of assigning a second press", () => {
    const context = cooperationBoard(12, 15, [29, 36]);
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 9), { ...actor(2, 15), pendingToggle: true }, actor(3, 36)],
      context,
    );
    expect(plans[0]!.direct).toBe(true);
    expect(plans[0]!.path[1]!.wait).toBe(true);
    expect(positions(plans[0]!)).toEqual([9, 9, 10, 11, 12]);
    expect(positions(plans[1]!)).toEqual([15]);
    expect(positions(plans[2]!)).not.toContain(15);
  });

  it("does not invent an opening when two committed toggle arrivals cancel", () => {
    const context = cooperationBoard(12, 15, [29, 36]);
    const plans = coordinateSmartTeethRoutes(
      [
        actor(1, 9),
        { ...actor(2, 15), pendingToggle: true },
        { ...actor(3, 36), pendingToggle: true },
      ],
      context,
    );
    expect(plans.some((plan) => plan.direct)).toBe(false);
    expect(positions(plans[0]!)).toEqual([9]);
  });

  it("defers teleport entry until a teammate's pending flip has settled", () => {
    const context = cooperationBoard();
    const ordinary = context.neighbors;
    context.hasNonlocalEdges = true;
    context.neighbors = (agent, node) =>
      agent.serial === 3
        ? node.pos === 40
          ? [{ pos: 11, dir: 8, via: 41, toggled: node.toggled }]
          : []
        : ordinary(agent, node);
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 9), { ...actor(2, 15), pendingToggle: true }, actor(3, 40)],
      context,
    );
    expect(
      plans.find((plan) => plan.serial === 3)!.path[1]?.via,
    ).toBeUndefined();
  });

  it("defers new toggle actions while a teammate is already committed to forced movement", () => {
    const context = cooperationBoard();
    context.canWait = (agent) => agent.serial !== 3;
    const plans = coordinateSmartTeethRoutes(
      [
        actor(1, 8),
        actor(2, 22),
        { ...actor(3, 40), pendingStep: { pos: 41, dir: 8, via: 40 } },
      ],
      context,
    );
    expect(plans.some((plan) => plan.path.some((node) => node.toggled))).toBe(
      false,
    );
    expect(positions(plans.find((plan) => plan.serial === 2)!)).toEqual([22]);
  });

  it("reserves physical teleport entrances as well as remote landings", () => {
    const context = board(48);
    context.hasNonlocalEdges = true;
    context.neighbors = (agent, node) => {
      if (node.pos === agent.pos)
        return [{ pos: agent.serial === 1 ? 40 : 46, dir: 8, via: 20 }];
      if (node.pos === 40 || node.pos === 46) return [{ pos: 48, dir: 8 }];
      return [];
    };
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 8), actor(2, 9)],
      context,
    );
    expect(plans.filter((p) => p.path.length > 1)).toHaveLength(1);
  });
  it("takes the shortest detour and fixes equal route ties north before south", () => {
    const [plan] = coordinateSmartTeethRoutes(
      [actor(1, 22)],
      board(26, [23, 24, 25]),
    );
    expect(positions(plan!)).toEqual([22, 15, 16, 17, 18, 19, 26]);
    expect(plan!.direct).toBe(true);
  });

  it("routes to the nearest reachable tile when the player is sealed off", () => {
    const [plan] = coordinateSmartTeethRoutes(
      [actor(1, 22)],
      board(26, [19, 25, 33, 27]),
    );
    expect(positions(plan!)).toEqual([22, 23, 24]);
    expect(plan!.direct).toBe(false);
  });

  it("stays still when already at the best fallback tile", () => {
    const [plan] = coordinateSmartTeethRoutes(
      [actor(1, 24)],
      board(26, [19, 25, 33, 27]),
    );
    expect(positions(plan!)).toEqual([24]);
  });

  it("gives the shortest-path actor pursuit even when it is last in actor order", () => {
    const plans = coordinateSmartTeethRoutes(
      [actor(1, 21), actor(2, 14), actor(3, 25)],
      board(27),
    );
    expect(plans.find((plan) => plan.direct)?.serial).toBe(3);
    expect(new Set(plans.map((plan) => plan.path.at(-1)!.pos)).size).toBe(3);
    expect(plans.filter((plan) => plan.path.at(-1)!.pos === 27)).toHaveLength(
      1,
    );
  });

  it("reserves next steps and prevents crossing another actor's current tile", () => {
    const agents = [actor(1, 22), actor(2, 16), actor(3, 30)];
    const plans = coordinateSmartTeethRoutes(agents, board(26));
    const nextSteps = plans.map((plan) => (plan.path[1] ?? plan.path[0])!.pos);
    expect(new Set(nextSteps).size).toBe(3);
    for (const plan of plans) {
      expect(
        plan.path
          .slice(1)
          .some((node) =>
            agents.some((a) => a.serial !== plan.serial && a.pos === node.pos),
          ),
      ).toBe(false);
    }
  });

  it("reassigns pursuit when a moving player makes another actor closer", () => {
    const agents = [actor(1, 7), actor(2, 13)];
    expect(
      coordinateSmartTeethRoutes(agents, board(8)).find((p) => p.direct)
        ?.serial,
    ).toBe(1);
    expect(
      coordinateSmartTeethRoutes(agents, board(12)).find((p) => p.direct)
        ?.serial,
    ).toBe(2);
  });

  it("uses facing as part of search state for directional forced-floor paths", () => {
    const context = board(10);
    context.neighbors = (_, node) => {
      if (node.pos === 8)
        return [
          { pos: 9, dir: 8 },
          { pos: 16, dir: 4 },
        ];
      if (node.pos === 16) return [{ pos: 9, dir: 1 }];
      if (node.pos === 9 && node.dir === 1) return [{ pos: 10, dir: 8 }];
      return [];
    };
    expect(
      positions(coordinateSmartTeethRoutes([actor(1, 8)], context)[0]!),
    ).toEqual([8, 16, 9, 10]);
  });

  it("keeps shortest-path guarantees across nonlocal teleport edges", () => {
    const context = board(12);
    context.hasNonlocalEdges = true;
    const ordinary = context.neighbors;
    context.neighbors = (agent, node) =>
      node.pos === 42 ? [{ pos: 12, dir: 8 }] : ordinary(agent, node);
    expect(
      positions(coordinateSmartTeethRoutes([actor(1, 43)], context)[0]!),
    ).toEqual([43, 42, 12]);
  });

  it("uses stable serial order for equal pursuers and never targets a different layer", () => {
    const agents = [actor(9, 11), actor(2, 9), { ...actor(1, 10), z: 2 }];
    const context = board(10);
    const plans = coordinateSmartTeethRoutes(agents, context);
    expect(plans.find((p) => p.direct)?.serial).toBe(2);
    expect(positions(plans.find((p) => p.serial === 1)!)).toEqual([10]);
    expect(coordinateSmartTeethRoutes([...agents].reverse(), context)).toEqual(
      plans,
    );
  });
});
