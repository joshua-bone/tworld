import type { DirectionInput } from "@player-web/impl/legacyInput";

export interface MobileDirectionalInputChanges {
  pressed: DirectionInput[];
  released: DirectionInput[];
}

const MOBILE_DIRECTION_ORDER: readonly DirectionInput[] = ["north", "west", "south", "east"];

export class MobileDirectionalInputTracker {
  private readonly activeCounts = new Map<DirectionInput, number>();
  private readonly pointerDirections = new Map<number, DirectionInput>();

  assignPointer(pointerId: number, direction: DirectionInput | null): MobileDirectionalInputChanges {
    const pressed: DirectionInput[] = [];
    const released: DirectionInput[] = [];
    const previousDirection = this.pointerDirections.get(pointerId) ?? null;
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
      this.pointerDirections.delete(pointerId);
    }

    if (direction !== null) {
      this.pointerDirections.set(pointerId, direction);
      const nextCount = (this.activeCounts.get(direction) ?? 0) + 1;
      this.activeCounts.set(direction, nextCount);
      if (nextCount === 1) {
        pressed.push(direction);
      }
    }

    return { pressed, released };
  }

  releasePointer(pointerId: number): MobileDirectionalInputChanges {
    return this.assignPointer(pointerId, null);
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
