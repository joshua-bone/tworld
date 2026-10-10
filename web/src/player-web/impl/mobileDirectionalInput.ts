import type { DirectionInput } from "@player-web/impl/legacyInput";

export interface MobileDirectionalInputChanges {
  pressed: DirectionInput[];
  released: DirectionInput[];
}

const MOBILE_DIRECTION_ORDER: readonly DirectionInput[] = ["north", "west", "south", "east"];
const MOBILE_DIRECTION_EDGE_TOLERANCE_PX = 6;

export interface MobileDirectionRegion {
  direction: DirectionInput;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export function mobileDirectionAtPoint(
  x: number,
  y: number,
  regions: readonly MobileDirectionRegion[],
  currentDirection: DirectionInput | null,
): DirectionInput | null {
  const contains = (region: MobileDirectionRegion, tolerance: number) =>
    x >= region.left - tolerance && x <= region.right + tolerance &&
    y >= region.top - tolerance && y <= region.bottom + tolerance;
  const direct = regions.find((region) => contains(region, 0));
  if (direct) {
    return direct.direction;
  }
  // Slight edge drift keeps a hold stable, but cannot start a new direction.
  const current = regions.find((region) => region.direction === currentDirection);
  return current && contains(current, MOBILE_DIRECTION_EDGE_TOLERANCE_PX) ? current.direction : null;
}

export class MobileDirectionalInputTracker {
  private readonly activeCounts = new Map<DirectionInput, number>();
  private readonly pointerDirections = new Map<number, DirectionInput | null>();

  hasPointer(pointerId: number): boolean {
    return this.pointerDirections.has(pointerId);
  }

  pointerDirection(pointerId: number): DirectionInput | null {
    return this.pointerDirections.get(pointerId) ?? null;
  }

  assignPointer(pointerId: number, direction: DirectionInput | null): MobileDirectionalInputChanges {
    const pressed: DirectionInput[] = [];
    const released: DirectionInput[] = [];
    const previousDirection = this.pointerDirections.get(pointerId) ?? null;
    // Keep ownership while a captured finger is in neutral space, so it can
    // slide back onto an arrow without lifting. reset/release remove ownership.
    this.pointerDirections.set(pointerId, direction);
    if (previousDirection === direction) {
      return { pressed, released };
    }

    if (previousDirection !== null) {
      const nextCount = (this.activeCounts.get(previousDirection) ?? 0) - 1;
      if (nextCount <= 0) {
        this.activeCounts.delete(previousDirection);
        released.push(previousDirection);
      } else {
        this.activeCounts.set(previousDirection, nextCount);
      }
    }

    if (direction !== null) {
      const nextCount = (this.activeCounts.get(direction) ?? 0) + 1;
      this.activeCounts.set(direction, nextCount);
      if (nextCount === 1) {
        pressed.push(direction);
      }
    }

    return { pressed, released };
  }

  releasePointer(pointerId: number): MobileDirectionalInputChanges {
    const changes = this.assignPointer(pointerId, null);
    this.pointerDirections.delete(pointerId);
    return changes;
  }

  reset(): MobileDirectionalInputChanges {
    const released = MOBILE_DIRECTION_ORDER.filter((direction) => (this.activeCounts.get(direction) ?? 0) > 0);
    this.activeCounts.clear();
    this.pointerDirections.clear();
    return {
      pressed: [],
      released,
    };
  }
}
