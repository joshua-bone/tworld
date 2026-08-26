export type HybridCcDirection = "north" | "east" | "south" | "west";

const SAMPLES_PER_LOGIC_STEP = 4;

/**
 * Retains a direction first observed between 100 ms logic boundaries so the
 * next boundary can consume it. Insertion order is semantic: it determines
 * the primary direction and, when present, the orthogonal slap direction.
 */
export class HybridCcInputCollector {
  private readonly pressedAtSample = new Map<HybridCcDirection, number>();
  private sample = 0;

  reset(): void {
    this.pressedAtSample.clear();
    this.sample = 0;
  }

  private advanceLogicWindow(): void {
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
      this.advanceLogicWindow();
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

export function hybridCcInputForDirections(directions: readonly HybridCcDirection[]): number {
  const primary = directions[0];
  if (!primary) {
    return 0;
  }

  const left = turnLeft(primary);
  const right = turnRight(primary);
  const slap = directions.slice(1).find((direction) => direction === left || direction === right);
  return slap ? SLAP_INPUT[primary][slap] ?? SINGLE_DIRECTION_INPUT[primary] : SINGLE_DIRECTION_INPUT[primary];
}

/** Keyboard state sampled four times per authoritative Hybrid logic step. */
export class HybridCcInputBuffer {
  private readonly collector = new HybridCcInputCollector();
  private held: HybridCcDirection[] = [];
  private latchedSinceSample: HybridCcDirection[] = [];

  keyDown(direction: HybridCcDirection): void {
    if (this.held.includes(direction)) return;
    this.held.push(direction);
    this.latchedSinceSample.push(direction);
  }

  keyUp(direction: HybridCcDirection): void {
    this.held = this.held.filter((candidate) => candidate !== direction);
  }

  nextSampleInputCode(): number {
    return hybridCcInputForDirections(this.captureSample());
  }

  reset(): void {
    this.collector.reset();
    this.held = [];
    this.latchedSinceSample = [];
  }

  private captureSample(): readonly HybridCcDirection[] {
    // Browser and native key events can begin and end between two 25 ms host
    // samples. Retain each new press until one sample observes it. Directions
    // already held at the previous sample stay ahead of newer presses, while
    // presses made since that sample retain their event order. The underlying
    // four-sample collector still decides which 100 ms logic boundary consumes
    // the input, so this does not add an engine tick or expose wall-clock time.
    const newlyPressed = new Set(this.latchedSinceSample);
    const sampledDirections = [
      ...this.held.filter((direction) => !newlyPressed.has(direction)),
      ...this.latchedSinceSample,
    ];
    this.latchedSinceSample = [];
    return this.collector.capture(sampledDirections);
  }
}
