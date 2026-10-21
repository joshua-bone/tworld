export { smartTeethRouteOverlays } from "./smartTeethRoutes";

export interface SmartTeethNode {
  pos: number;
  dir: number;
  toggled?: boolean;
  via?: number;
  wait?: boolean;
}
export interface SmartTeethAgent extends SmartTeethNode {
  serial: number;
  z: number;
  pendingStep?: SmartTeethNode;
  pendingToggle?: boolean;
}
export interface SmartTeethPlan {
  serial: number;
  z: number;
  path: readonly SmartTeethNode[];
  direct: boolean;
}
export interface SmartTeethPlanningContext {
  width: number;
  height: number;
  player: { pos: number; z: number };
  hasNonlocalEdges?: boolean;
  hasToggleButtons?: boolean;
  canWait?(agent: SmartTeethAgent, node: SmartTeethNode): boolean;
  directionMatters?(agent: SmartTeethAgent, node: SmartTeethNode): boolean;
  neighbors(
    agent: SmartTeethAgent,
    node: SmartTeethNode,
  ): readonly SmartTeethNode[];
}

interface SearchNode {
  node: SmartTeethNode;
  g: number;
  h: number;
  f: number;
  order: number;
  previous?: SearchNode;
}

function distance(a: number, b: number, width: number): number {
  return (
    Math.abs((a % width) - (b % width)) +
    Math.abs(Math.floor(a / width) - Math.floor(b / width))
  );
}

function comesBefore(a: SearchNode, b: SearchNode): boolean {
  return (
    a.f < b.f ||
    (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order)))
  );
}

class OpenSet {
  private readonly nodes: SearchNode[] = [];
  push(node: SearchNode): void {
    let index = this.nodes.length;
    this.nodes.push(node);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!comesBefore(node, this.nodes[parent]!)) break;
      this.nodes[index] = this.nodes[parent]!;
      index = parent;
    }
    this.nodes[index] = node;
  }
  pop(): SearchNode | undefined {
    const first = this.nodes[0];
    const last = this.nodes.pop();
    if (!last || this.nodes.length === 0) return first;
    let index = 0;
    while (index * 2 + 1 < this.nodes.length) {
      let child = index * 2 + 1;
      if (
        child + 1 < this.nodes.length &&
        comesBefore(this.nodes[child + 1]!, this.nodes[child]!)
      )
        child++;
      if (!comesBefore(this.nodes[child]!, last)) break;
      this.nodes[index] = this.nodes[child]!;
      index = child;
    }
    this.nodes[index] = last;
    return first;
  }
}

interface SharedToggle {
  helper: SmartTeethPlan;
  flip?: boolean;
  // A deterministic expansion budget bounds cooperative work on large maps.
  budget: { remaining: number };
  maxSteps?: number;
}

function stateKey(
  agent: SmartTeethAgent,
  context: SmartTeethPlanningContext,
  node: SmartTeethNode,
): number {
  return (
    node.pos * 32 +
    ((context.directionMatters?.(agent, node) ?? true) ? node.dir * 2 : 0) +
    Number(!!node.toggled)
  );
}

function pathTo(end: SearchNode): SmartTeethNode[] {
  const path: SmartTeethNode[] = [];
  for (let step: SearchNode | undefined = end; step; step = step.previous)
    path.push({ ...step.node });
  return path.reverse();
}

function overlaps(a: SmartTeethNode, b: SmartTeethNode): boolean {
  return (
    a.pos === b.pos ||
    a.via === b.pos ||
    b.via === a.pos ||
    (a.via !== undefined && a.via === b.via)
  );
}

function search(
  agent: SmartTeethAgent,
  context: SmartTeethPlanningContext,
  occupied: ReadonlySet<number>,
  assignedTargets: ReadonlySet<number>,
  reservedNextSteps: ReadonlySet<number>,
  allowToggle = true,
  sharedToggle?: SharedToggle,
): SmartTeethPlan {
  const start = { pos: agent.pos, dir: agent.dir };
  const stationary = {
    serial: agent.serial,
    z: agent.z,
    path: [start],
    direct: false,
  };
  if (agent.z !== context.player.z) return stationary;
  const flipAt = sharedToggle ? sharedToggle.helper.path.length - 1 : 0;
  const key = (node: SmartTeethNode, time: number) =>
    stateKey(agent, context, node) * (flipAt + 1) + Math.min(time, flipAt);
  const open = new OpenSet();
  const costs = new Map<number, number>([[key(start, 0), 0]]);
  const h = distance(start.pos, context.player.pos, context.width);
  const root: SearchNode = {
    node: start,
    g: 0,
    h,
    f: context.hasNonlocalEdges ? 0 : h,
    order: 0,
  };
  open.push(root);
  let order = 1;
  let closest: SearchNode | undefined;
  let current: SearchNode | undefined;
  while ((current = open.pop())) {
    if (costs.get(key(current.node, current.g)) !== current.g) continue;
    if (sharedToggle && --sharedToggle.budget.remaining < 0) break;
    if (!assignedTargets.has(current.node.pos)) {
      if (
        !closest ||
        current.h < closest.h ||
        (current.h === closest.h && current.g < closest.g)
      )
        closest = current;
      if (current.node.pos === context.player.pos) {
        closest = current;
        break;
      }
    }
    if (
      sharedToggle?.maxSteps !== undefined &&
      current.g >= sharedToggle.maxSteps
    )
      continue;
    const committed = current.g === 0 && agent.pendingStep;
    const neighbors = committed
      ? [committed]
      : [...context.neighbors(agent, current.node)];
    // Wait only on terrain where the engine can actually hold position. Keeping
    // time in the key lets A* distinguish waiting for a teammate from a loop.
    if (
      !committed &&
      sharedToggle &&
      current.g < flipAt &&
      (context.canWait?.(agent, current.node) ?? true)
    ) {
      neighbors.push({
        pos: current.node.pos,
        dir: current.node.dir,
        toggled: current.node.toggled,
        wait: true,
      });
    }
    for (const candidate of neighbors) {
      let node = candidate;
      if (
        !Number.isInteger(node.pos) ||
        node.pos < 0 ||
        node.pos >= context.width * context.height
      )
        continue;
      if (![1, 2, 4, 8].includes(node.dir)) continue;
      if (occupied.has(node.pos) && node.pos !== agent.pos) continue;
      if (
        node.via !== undefined &&
        occupied.has(node.via) &&
        node.via !== agent.pos
      )
        continue;
      if (!allowToggle && !!node.toggled !== !!current.node.toggled) continue;
      if (node.pos === context.player.pos && assignedTargets.has(node.pos))
        continue;
      if (
        current.g === 0 &&
        (reservedNextSteps.has(node.pos) ||
          (node.via !== undefined && reservedNextSteps.has(node.via)))
      )
        continue;
      const g = current.g + 1;
      if (sharedToggle) {
        // A forced transition can finish after a teammate changes its exit.
        // Defer entry until actual toggles settle instead of predicting a safe
        // landing from the board at departure (especially for teleports).
        if (
          g <= flipAt &&
          (node.via !== undefined || context.canWait?.(agent, node) === false)
        )
          continue;
        const helperFrom =
          sharedToggle.helper.path[Math.min(current.g, flipAt)]!;
        const helperTo = sharedToggle.helper.path[Math.min(g, flipAt)]!;
        if (
          overlaps(node, helperTo) ||
          (overlaps(node, helperFrom) && overlaps(current.node, helperTo))
        )
          continue;
        // The helper's arrival changes the board after this round's moves.
        // Nobody gets to cross a closed wall on the strength of a future press.
        if (g === flipAt && sharedToggle.flip !== false)
          node = { ...node, toggled: !node.toggled };
      }
      if ((costs.get(key(node, g)) ?? Infinity) <= g) continue;
      costs.set(key(node, g), g);
      const h = distance(node.pos, context.player.pos, context.width);
      open.push({
        node,
        g,
        h,
        f: g + (context.hasNonlocalEdges ? 0 : h),
        order: order++,
        previous: current,
      });
    }
  }
  if (!closest) return stationary;
  return {
    serial: agent.serial,
    z: agent.z,
    path: pathTo(closest),
    direct: closest.node.pos === context.player.pos,
  };
}

/** Discover actions from graph transitions, without knowing tile IDs or actor roles. */
function reachableTogglePlans(
  agent: SmartTeethAgent,
  context: SmartTeethPlanningContext,
  occupied: ReadonlySet<number>,
): SmartTeethPlan[] {
  if (agent.z !== context.player.z) return [];
  const start = { pos: agent.pos, dir: agent.dir };
  const queue: SearchNode[] = [{ node: start, g: 0, h: 0, f: 0, order: 0 }];
  const visited = new Set([stateKey(agent, context, start)]);
  const buttons = new Set<number>();
  const plans: SmartTeethPlan[] = [];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]!;
    const neighbors =
      current.g === 0 && agent.pendingStep
        ? [agent.pendingStep]
        : context.neighbors(agent, current.node);
    for (const node of neighbors) {
      if (
        (occupied.has(node.pos) && node.pos !== agent.pos) ||
        (node.via !== undefined &&
          occupied.has(node.via) &&
          node.via !== agent.pos)
      )
        continue;
      const next = {
        node,
        g: current.g + 1,
        h: 0,
        f: 0,
        order: 0,
        previous: current,
      };
      if (node.toggled) {
        if (!buttons.has(node.pos)) {
          buttons.add(node.pos);
          plans.push({
            serial: agent.serial,
            z: agent.z,
            path: pathTo(next),
            direct: false,
          });
        }
        continue;
      }
      const key = stateKey(agent, context, node);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }
  return plans;
}

/** Shared, deterministic planning round. Probes must be pure; route arrays are replaced, never mutated. */
export function coordinateSmartTeethRoutes(
  agents: readonly SmartTeethAgent[],
  context: SmartTeethPlanningContext,
): SmartTeethPlan[] {
  const cachedNeighbors = new Map<
    number,
    Map<number, readonly SmartTeethNode[]>
  >();
  const originalContext = context;
  context = {
    ...context,
    neighbors: (agent, node) => {
      let cache = cachedNeighbors.get(agent.serial);
      if (!cache) {
        cache = new Map();
        cachedNeighbors.set(agent.serial, cache);
      }
      const key =
        node.pos * 32 +
        ((originalContext.directionMatters?.(agent, node) ?? true)
          ? node.dir * 2
          : 0) +
        Number(!!node.toggled);
      let result = cache.get(key);
      if (!result) {
        result = [...originalContext.neighbors(agent, node)].sort(
          (a, b) => a.dir - b.dir || a.pos - b.pos,
        );
        cache.set(key, result);
      }
      return result;
    },
  };
  const occupied = new Set(
    agents
      .filter((agent) => agent.z === context.player.z)
      .map((agent) => agent.pos),
  );
  // Lynx commits movement before arrival actions fire. Treat those real future
  // presses as shared state, so a replan cannot recruit a cancelling helper.
  const pending = agents
    .filter((agent) => agent.pendingToggle && agent.z === context.player.z)
    .sort((a, b) => a.serial - b.serial);
  const hold = (agent: SmartTeethAgent): SmartTeethPlan => ({
    serial: agent.serial,
    z: agent.z,
    path: [{ pos: agent.pos, dir: agent.dir }],
    direct: false,
  });
  const pendingHelper =
    pending.length > 0
      ? {
          ...hold(pending[0]!),
          path: [
            { pos: pending[0]!.pos, dir: pending[0]!.dir },
            {
              pos: pending[0]!.pos,
              dir: pending[0]!.dir,
              wait: true,
              toggled: true,
            },
          ],
        }
      : undefined;
  const pendingSchedule = () =>
    pendingHelper
      ? {
          helper: pendingHelper,
          flip: pending.length % 2 === 1,
          budget: { remaining: 8192 },
        }
      : undefined;
  const canScheduleToggle = agents.every(
    (agent) =>
      agent.z !== context.player.z ||
      (!agent.pendingStep && context.canWait?.(agent, agent) !== false),
  );
  const initial = agents.map((agent) => ({
    agent,
    plan: agent.pendingToggle
      ? hold(agent)
      : search(
          agent,
          context,
          occupied,
          new Set(),
          new Set(),
          pending.length === 0 && canScheduleToggle,
          pendingSchedule(),
        ),
  }));
  initial.sort(
    (a, b) =>
      Number(b.plan.direct) - Number(a.plan.direct) ||
      a.plan.path.length - b.plan.path.length ||
      a.agent.serial - b.agent.serial,
  );
  let cooperative:
    | { helper: SmartTeethPlan; pursuer: SmartTeethPlan }
    | undefined;
  let bestCost = initial[0]?.plan.direct
    ? initial[0].plan.path.length - 1
    : Infinity;
  if (
    pending.length === 0 &&
    canScheduleToggle &&
    context.hasToggleButtons &&
    agents.length > 1 &&
    bestCost > 1
  ) {
    const helpers = [...agents]
      .sort((a, b) => a.serial - b.serial)
      .flatMap((agent) => reachableTogglePlans(agent, context, occupied))
      .sort(
        (a, b) =>
          a.path.length - b.path.length ||
          a.serial - b.serial ||
          a.path.at(-1)!.pos - b.path.at(-1)!.pos,
      );
    const budget = { remaining: 8192 };
    for (const helper of helpers) {
      if (helper.path.length - 1 >= bestCost || budget.remaining <= 0) break;
      for (const { agent } of initial) {
        if (agent.serial === helper.serial || agent.z !== helper.z) continue;
        const pursuer = search(
          agent,
          context,
          occupied,
          new Set(),
          new Set(),
          false,
          { helper, budget, maxSteps: bestCost - 1 },
        );
        if (pursuer.direct && pursuer.path.length - 1 < bestCost) {
          cooperative = { helper, pursuer };
          bestCost = pursuer.path.length - 1;
        }
      }
    }
  }
  const soloPlan = initial[0]?.plan;
  const soloFlipIndex =
    soloPlan?.path.findIndex((node, index) => index > 0 && node.toggled) ?? -1;
  const soloHelper =
    soloPlan && soloFlipIndex > 0
      ? { ...soloPlan, path: soloPlan.path.slice(0, soloFlipIndex + 1) }
      : undefined;
  const assignedTargets = new Set<number>();
  const reservedNextSteps = new Set<number>();
  const plans: SmartTeethPlan[] = [];
  const assign = (plan: SmartTeethPlan) => {
    plans.push(plan);
    if (plan.z !== context.player.z) return;
    assignedTargets.add(plan.path.at(-1)!.pos);
    reservedNextSteps.add((plan.path[1] ?? plan.path[0])!.pos);
    if (plan.path[1]?.via !== undefined)
      reservedNextSteps.add(plan.path[1].via);
  };
  if (cooperative) {
    assign(cooperative.pursuer);
    assign(cooperative.helper);
  }
  for (const { agent, plan: initialPlan } of initial) {
    if (plans.some((plan) => plan.serial === agent.serial)) continue;
    const plan =
      plans.length === 0 || agent.pendingToggle
        ? initialPlan
        : search(
            agent,
            context,
            occupied,
            assignedTargets,
            reservedNextSteps,
            false,
            cooperative
              ? { helper: cooperative.helper, budget: { remaining: 4096 } }
              : (pendingSchedule() ??
                  (soloHelper
                    ? { helper: soloHelper, budget: { remaining: 4096 } }
                    : undefined)),
          );
    assign(plan);
  }
  return plans.sort((a, b) => a.serial - b.serial);
}
