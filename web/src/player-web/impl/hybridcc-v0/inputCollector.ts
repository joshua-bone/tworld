export type HybridCcDirection = "north" | "east" | "south" | "west";

const SAMPLES_PER_LOGIC_STEP = 4;

export class HybridCcV0InputCollector {
  private readonly pressedAtSample = new Map<HybridCcDirection, number>();
  private sample = 0;

  reset(): void {
    for (const [direction, pressedAt] of this.pressedAtSample) {
      if (pressedAt === 0) {
        this.pressedAtSample.delete(direction);
      } else {
        this.pressedAtSample.set(direction, 0);
      }
    }
    this.sample = 0;
  }

  capture(directions: readonly HybridCcDirection[]): readonly HybridCcDirection[] {
    if (this.sample === SAMPLES_PER_LOGIC_STEP) {
      this.reset();
    }

    for (const direction of directions) {
      if (!this.pressedAtSample.has(direction)) {
        this.pressedAtSample.set(direction, this.sample);
      }
    }

    this.sample += 1;
    return this.collect();
  }

  collect(): readonly HybridCcDirection[] {
    return [...this.pressedAtSample.keys()];
  }
}

function turnLeft(direction: HybridCcDirection): HybridCcDirection {
  switch (direction) {
    case "north": return "west";
    case "west": return "south";
    case "south": return "east";
    case "east": return "north";
  }
}

function turnRight(direction: HybridCcDirection): HybridCcDirection {
  switch (direction) {
    case "north": return "east";
    case "east": return "south";
    case "south": return "west";
    case "west": return "north";
  }
}

const SINGLE_DIRECTION_INPUT: Readonly<Record<HybridCcDirection, number>> = {
  north: 1,
  east: 2,
  south: 3,
  west: 4,
};

const SLAP_INPUT: Readonly<Record<HybridCcDirection, Readonly<Partial<Record<HybridCcDirection, number>>>>> = {
  north: { east: 5, west: 6 },
  east: { north: 7, south: 8 },
  south: { east: 9, west: 10 },
  west: { south: 11, north: 12 },
};

export function replayInputForDirections(directions: readonly HybridCcDirection[]): number {
  const primary = directions[0];
  if (!primary) {
    return 0;
  }

  const left = turnLeft(primary);
  const right = turnRight(primary);
  const slap = directions.slice(1).find((direction) => direction === left || direction === right);
  return slap ? SLAP_INPUT[primary][slap] ?? SINGLE_DIRECTION_INPUT[primary] : SINGLE_DIRECTION_INPUT[primary];
}
