import type { InteractiveGameTileOverlay } from "@game-core/api/interactive";
import type { SmartTeethPlan } from "@game-core/impl/smartTeethPathfinding";

/** Per-cell half-segments allow the renderer to preserve actors and clip each layer independently. */
export function smartTeethRouteOverlays(plans: readonly SmartTeethPlan[]): InteractiveGameTileOverlay[] {
  return plans.flatMap((plan) => {
    const hue = (((plan.serial * 137.508) % 360) + 360) % 360;
    const color = `hsl(${hue.toFixed(2)} 90% 62%)`;
    const path: Array<{ pos: number; breakBefore: boolean }> = [];
    for (const node of plan.path) {
      const teleported = node.via !== undefined && node.via !== node.pos;
      if (teleported && path.at(-1)?.pos !== node.via) {
        path.push({ pos: node.via!, breakBefore: false });
      }
      path.push({ pos: node.pos, breakBefore: teleported });
    }
    const cells = new Map<number, { connections: Set<number>; endpoint: boolean }>();
    for (const [index, node] of path.entries()) {
      // A teleport is discontinuous even when its entrance and landing happen to be neighbors.
      const connections = [
        node.breakBefore ? undefined : path[index - 1],
        path[index + 1]?.breakBefore ? undefined : path[index + 1],
      ]
        .filter(
          (neighbor) =>
            neighbor !== undefined &&
            Math.abs((node.pos % 32) - (neighbor.pos % 32)) +
              Math.abs(Math.floor(node.pos / 32) - Math.floor(neighbor.pos / 32)) ===
              1,
        )
        .map((neighbor) => neighbor!.pos);
      const cell = cells.get(node.pos) ?? { connections: new Set<number>(), endpoint: false };
      for (const connection of connections) cell.connections.add(connection);
      cell.endpoint ||= index === path.length - 1;
      cells.set(node.pos, cell);
    }
    return [...cells].map(([pos, cell]) => {
      return {
        z: plan.z,
        pos,
        kind: "planned-route",
        render: {
          mode: "planned-route",
          serial: plan.serial,
          color,
          alpha: 0.35,
          direct: plan.direct,
          connections: [...cell.connections],
          endpoint: cell.endpoint,
        },
      };
    });
  });
}
