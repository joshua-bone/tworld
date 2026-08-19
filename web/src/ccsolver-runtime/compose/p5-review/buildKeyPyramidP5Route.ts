import type {
  CoordinateV1,
  LevelFactsV1,
  PlacementIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "@tworld/ccsolver/domain";
import { GAME_INPUT_CODES } from "@game-core/api/command";

const CHIP = "cc1:icchip" as const;
const PLAYER = "cc1:chip" as const;
const FLOOR = "cc1:floor" as const;
const WALL = "cc1:wall" as const;
const SOCKET = "cc1:socket" as const;
const EXIT = "cc1:exit" as const;
const HINT = "cc1:hintbutton" as const;

const DIRECTIONS = [
  { direction: "north", dx: 0, dy: -1, inputCode: GAME_INPUT_CODES.north },
  { direction: "west", dx: -1, dy: 0, inputCode: GAME_INPUT_CODES.west },
  { direction: "south", dx: 0, dy: 1, inputCode: GAME_INPUT_CODES.south },
  { direction: "east", dx: 1, dy: 0, inputCode: GAME_INPUT_CODES.east },
] as const;

type DirectionStep = (typeof DIRECTIONS)[number];
type ResourceColor = "red" | "blue" | "yellow" | "green";

type RelevantPlacement = {
  readonly placementId: PlacementIdV1;
  readonly semanticType: StableIdV1;
  readonly coordinate: CoordinateV1;
};

type RouteCell = {
  readonly coordinate: CoordinateV1;
  readonly terrain: RelevantPlacement;
  readonly pickup: RelevantPlacement | null;
};

type SearchState = {
  readonly x: number;
  readonly y: number;
  readonly red: number;
  readonly blue: number;
  readonly yellow: number;
  readonly green: number;
  readonly remainingChips: number;
  readonly collectedMask: number;
  readonly openedMask: number;
  readonly parentIndex: number;
  readonly directionIndex: number;
};

export type KeyPyramidP5TileStepV1 = {
  readonly stepOrder: number;
  readonly direction: DirectionStep["direction"];
  readonly inputCode: number;
  readonly from: CoordinateV1;
  readonly to: CoordinateV1;
};

export type KeyPyramidP5RouteEventV1 = {
  readonly eventOrder: number;
  readonly afterStepOrder: number;
  readonly kind:
    | "collect-key"
    | "collect-chip"
    | "open-door"
    | "open-socket"
    | "reach-exit";
  readonly coordinate: CoordinateV1;
  readonly placementId: PlacementIdV1;
  readonly semanticType: StableIdV1;
  readonly resourceType: StableIdV1 | null;
};

export type KeyPyramidP5SubgoalV1 = {
  readonly subgoalId: StableIdV1;
  readonly title: string;
  readonly description: string;
  readonly firstStepOrder: number;
  readonly lastStepOrder: number;
  readonly eventOrders: readonly number[];
};

export type KeyPyramidP5RouteV1 = {
  readonly routeType: "p5-key-pyramid-route";
  readonly routeVersion: 1;
  readonly derivation: "checked-facts-resource-search";
  readonly target: RulesetTargetV1;
  readonly level: LevelFactsV1["payload"]["level"];
  readonly start: CoordinateV1;
  readonly tileStepsOrder: "step-order";
  readonly tileSteps: readonly KeyPyramidP5TileStepV1[];
  readonly eventsOrder: "event-order";
  readonly events: readonly KeyPyramidP5RouteEventV1[];
  readonly subgoalsOrder: "execution-order";
  readonly subgoals: readonly KeyPyramidP5SubgoalV1[];
  readonly finalState: {
    readonly coordinate: CoordinateV1;
    readonly remainingChips: 0;
    readonly inventory: Readonly<Record<ResourceColor, number>>;
  };
};

const SUBGOALS = [
  {
    subgoalId: "subgoal:key-pyramid:collect-west",
    title: "Collect the western keys and chips",
    description: "Collect the starting red and blue keys, open the west branches, and leave the western lower chamber with its red key.",
    firstStepOrder: 0,
    lastStepOrder: 28,
  },
  {
    subgoalId: "subgoal:key-pyramid:collect-east",
    title: "Collect the eastern key and chip",
    description: "Return through the center, open the yellow and red eastern doors, and collect the eastern green key and chip.",
    firstStepOrder: 29,
    lastStepOrder: 58,
  },
  {
    subgoalId: "subgoal:key-pyramid:recover-west-red",
    title: "Recover the western red key",
    description: "Carry the green key back to the lower-west chamber and collect the red key needed by the final eastern branch.",
    firstStepOrder: 59,
    lastStepOrder: 86,
  },
  {
    subgoalId: "subgoal:key-pyramid:collect-lower-east",
    title: "Clear the lower-east chambers",
    description: "Open the green and red gates and collect all three chips in the two lower-east chambers.",
    firstStepOrder: 87,
    lastStepOrder: 128,
  },
  {
    subgoalId: "subgoal:key-pyramid:collect-summit",
    title: "Collect the summit chips",
    description: "Return to the upper pyramid, spend the retained blue key, and collect the final two chips.",
    firstStepOrder: 129,
    lastStepOrder: 158,
  },
  {
    subgoalId: "subgoal:key-pyramid:exit",
    title: "Open the socket and exit",
    description: "Cross the zero-remaining socket and enter the exit from the exact continuous state.",
    firstStepOrder: 159,
    lastStepOrder: 161,
  },
] as const;

function coordinateKey({ x, y, z }: CoordinateV1): string {
  return `${z}:${y}:${x}`;
}

function colorForSemanticType(semanticType: string): ResourceColor | null {
  const prefix = semanticType.startsWith("cc1:key-")
    ? "cc1:key-"
    : semanticType.startsWith("cc1:door-")
      ? "cc1:door-"
      : null;
  if (prefix === null) return null;
  const color = semanticType.slice(prefix.length);
  return color === "red" || color === "blue" || color === "yellow" || color === "green"
    ? color
    : null;
}

function comparePlacement(left: RelevantPlacement, right: RelevantPlacement): number {
  return left.coordinate.z - right.coordinate.z
    || left.coordinate.y - right.coordinate.y
    || left.coordinate.x - right.coordinate.x
    || (left.placementId < right.placementId ? -1 : left.placementId > right.placementId ? 1 : 0);
}

function buildCells(facts: LevelFactsV1["payload"]): {
  readonly cells: ReadonlyMap<string, RouteCell>;
  readonly pickups: readonly RelevantPlacement[];
  readonly doors: readonly RelevantPlacement[];
  readonly start: CoordinateV1;
} {
  if (
    facts.geometry.width !== 32
    || facts.geometry.height !== 32
    || facts.geometry.depth !== 1
    || facts.requiredCollectibles.length !== 1
    || facts.requiredCollectibles[0]?.resourceType !== CHIP
    || facts.requiredCollectibles[0]?.amount !== 10
    || facts.exits.length !== 1
  ) {
    throw new Error("Key Pyramid route requires the checked 32x32 one-exit ten-chip facts");
  }
  const placements = facts.placements.map(({ descriptor, placementId }) => ({
    placementId,
    semanticType: descriptor.semanticType,
    coordinate: descriptor.coordinate,
    stratum: descriptor.stratum,
  }));
  const grouped = new Map<string, typeof placements>();
  for (const placement of placements) {
    const key = coordinateKey(placement.coordinate);
    grouped.set(key, [...(grouped.get(key) ?? []), placement]);
  }
  const cells = new Map<string, RouteCell>();
  const pickups: RelevantPlacement[] = [];
  const doors: RelevantPlacement[] = [];
  for (let y = 0; y < facts.geometry.height; y += 1) {
    for (let x = 0; x < facts.geometry.width; x += 1) {
      const coordinate = { x, y, z: 0 };
      const members = grouped.get(coordinateKey(coordinate)) ?? [];
      const terrains = members.filter(({ stratum }) => stratum === "terrain");
      const terrain = terrains.find(({ semanticType }) => semanticType !== FLOOR) ?? terrains[0];
      if (terrain === undefined) {
        throw new Error(`Key Pyramid cell ${x},${y},0 has no terrain placement`);
      }
      if (
        terrain.semanticType !== FLOOR
        && terrain.semanticType !== WALL
        && terrain.semanticType !== SOCKET
        && terrain.semanticType !== EXIT
        && terrain.semanticType !== HINT
        && colorForSemanticType(terrain.semanticType) === null
      ) {
        throw new Error(`Key Pyramid route does not support ${terrain.semanticType}`);
      }
      const pickup = members.find(({ stratum }) => stratum === "pickup") ?? null;
      if (
        pickup !== null
        && pickup.semanticType !== CHIP
        && colorForSemanticType(pickup.semanticType) === null
      ) {
        throw new Error(`Key Pyramid route does not support pickup ${pickup.semanticType}`);
      }
      const normalizedTerrain: RelevantPlacement = terrain;
      const normalizedPickup: RelevantPlacement | null = pickup;
      cells.set(coordinateKey(coordinate), {
        coordinate,
        terrain: normalizedTerrain,
        pickup: normalizedPickup,
      });
      if (normalizedPickup !== null) pickups.push(normalizedPickup);
      if (colorForSemanticType(normalizedTerrain.semanticType) !== null) doors.push(normalizedTerrain);
    }
  }
  pickups.sort(comparePlacement);
  doors.sort(comparePlacement);
  if (pickups.length > 30 || doors.length > 30) {
    throw new Error("Key Pyramid route bitset capacity exceeded");
  }
  const player = facts.actors.find(({ semanticType, disposition }) => (
    semanticType === PLAYER && disposition === "active"
  ));
  const playerPlacement = player === undefined
    ? undefined
    : facts.placements.find(({ placementId }) => placementId === player.descriptor.placementId);
  if (playerPlacement === undefined) {
    throw new Error("Key Pyramid active player placement is missing");
  }
  return { cells, pickups, doors, start: playerPlacement.descriptor.coordinate };
}

function stateKey(state: SearchState): string {
  return [
    state.x,
    state.y,
    state.red,
    state.blue,
    state.yellow,
    state.green,
    state.remainingChips,
    state.collectedMask,
    state.openedMask,
  ].join(":");
}

function inventoryFor(state: SearchState, color: ResourceColor): number {
  return state[color];
}

function moveState(
  state: SearchState,
  directionIndex: number,
  direction: DirectionStep,
  cells: ReadonlyMap<string, RouteCell>,
  pickupIndex: ReadonlyMap<PlacementIdV1, number>,
  doorIndex: ReadonlyMap<PlacementIdV1, number>,
  parentIndex: number,
): SearchState | null {
  const x = state.x + direction.dx;
  const y = state.y + direction.dy;
  const cell = cells.get(coordinateKey({ x, y, z: 0 }));
  if (cell === undefined || cell.terrain.semanticType === WALL) return null;
  let red = state.red;
  let blue = state.blue;
  let yellow = state.yellow;
  let green = state.green;
  let remainingChips = state.remainingChips;
  let collectedMask = state.collectedMask;
  let openedMask = state.openedMask;
  const doorColor = colorForSemanticType(cell.terrain.semanticType);
  if (doorColor !== null) {
    const index = doorIndex.get(cell.terrain.placementId);
    if (index === undefined) throw new Error("Key Pyramid door index is incomplete");
    const bit = 1 << index;
    if ((openedMask & bit) === 0) {
      if (inventoryFor(state, doorColor) === 0) return null;
      if (doorColor === "red") red -= 1;
      if (doorColor === "blue") blue -= 1;
      if (doorColor === "yellow") yellow -= 1;
      openedMask |= bit;
    }
  }
  if (cell.terrain.semanticType === SOCKET && remainingChips !== 0) return null;
  if (cell.pickup !== null) {
    const index = pickupIndex.get(cell.pickup.placementId);
    if (index === undefined) throw new Error("Key Pyramid pickup index is incomplete");
    const bit = 1 << index;
    if ((collectedMask & bit) === 0) {
      collectedMask |= bit;
      if (cell.pickup.semanticType === CHIP) remainingChips -= 1;
      const pickupColor = colorForSemanticType(cell.pickup.semanticType);
      if (pickupColor === "red") red += 1;
      if (pickupColor === "blue") blue += 1;
      if (pickupColor === "yellow") yellow += 1;
      if (pickupColor === "green") green += 1;
    }
  }
  return {
    x,
    y,
    red,
    blue,
    yellow,
    green,
    remainingChips,
    collectedMask,
    openedMask,
    parentIndex,
    directionIndex,
  };
}

function deriveDirections(
  cells: ReadonlyMap<string, RouteCell>,
  pickups: readonly RelevantPlacement[],
  doors: readonly RelevantPlacement[],
  start: CoordinateV1,
  exitPlacementId: PlacementIdV1,
): readonly DirectionStep[] {
  const exit = [...cells.values()].find(({ terrain }) => terrain.placementId === exitPlacementId);
  if (exit === undefined || exit.terrain.semanticType !== EXIT) {
    throw new Error("Key Pyramid exit placement binding is missing");
  }
  const pickupIndex = new Map(pickups.map(({ placementId }, index) => [placementId, index]));
  const doorIndex = new Map(doors.map(({ placementId }, index) => [placementId, index]));
  const initial: SearchState = {
    x: start.x,
    y: start.y,
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
    remainingChips: 10,
    collectedMask: 0,
    openedMask: 0,
    parentIndex: -1,
    directionIndex: -1,
  };
  const queue: SearchState[] = [initial];
  const seen = new Set([stateKey(initial)]);
  let finalIndex = -1;
  for (let index = 0; index < queue.length; index += 1) {
    const state = queue[index]!;
    if (
      state.x === exit.coordinate.x
      && state.y === exit.coordinate.y
      && state.remainingChips === 0
    ) {
      finalIndex = index;
      break;
    }
    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
      const next = moveState(
        state,
        directionIndex,
        DIRECTIONS[directionIndex]!,
        cells,
        pickupIndex,
        doorIndex,
        index,
      );
      if (next === null) continue;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
    if (queue.length > 500_000) {
      throw new Error("Key Pyramid route exceeded the bounded search state budget");
    }
  }
  if (finalIndex < 0) throw new Error("Key Pyramid has no route within the bounded search");
  const reversed: DirectionStep[] = [];
  for (let index = finalIndex; queue[index]!.parentIndex >= 0; index = queue[index]!.parentIndex) {
    reversed.push(DIRECTIONS[queue[index]!.directionIndex]!);
  }
  return reversed.reverse();
}

function materializeRoute(
  directions: readonly DirectionStep[],
  cells: ReadonlyMap<string, RouteCell>,
  pickups: readonly RelevantPlacement[],
  doors: readonly RelevantPlacement[],
  start: CoordinateV1,
): {
  readonly tileSteps: readonly KeyPyramidP5TileStepV1[];
  readonly events: readonly KeyPyramidP5RouteEventV1[];
  readonly finalState: KeyPyramidP5RouteV1["finalState"];
} {
  const pickupIndex = new Map(pickups.map(({ placementId }, index) => [placementId, index]));
  const doorIndex = new Map(doors.map(({ placementId }, index) => [placementId, index]));
  let state: SearchState = {
    x: start.x,
    y: start.y,
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
    remainingChips: 10,
    collectedMask: 0,
    openedMask: 0,
    parentIndex: -1,
    directionIndex: -1,
  };
  const tileSteps: KeyPyramidP5TileStepV1[] = [];
  const events: KeyPyramidP5RouteEventV1[] = [];
  for (let stepOrder = 0; stepOrder < directions.length; stepOrder += 1) {
    const direction = directions[stepOrder]!;
    const from = { x: state.x, y: state.y, z: 0 };
    const beforeCollected = state.collectedMask;
    const beforeOpened = state.openedMask;
    const next = moveState(
      state,
      DIRECTIONS.indexOf(direction),
      direction,
      cells,
      pickupIndex,
      doorIndex,
      stepOrder,
    );
    if (next === null) throw new Error(`Key Pyramid route step ${stepOrder} became invalid`);
    const to = { x: next.x, y: next.y, z: 0 };
    tileSteps.push({ stepOrder, direction: direction.direction, inputCode: direction.inputCode, from, to });
    const cell = cells.get(coordinateKey(to))!;
    const doorBit = doorIndex.get(cell.terrain.placementId);
    if (
      doorBit !== undefined
      && (beforeOpened & (1 << doorBit)) === 0
      && (next.openedMask & (1 << doorBit)) !== 0
    ) {
      events.push({
        eventOrder: events.length,
        afterStepOrder: stepOrder,
        kind: "open-door",
        coordinate: to,
        placementId: cell.terrain.placementId,
        semanticType: cell.terrain.semanticType,
        resourceType: cell.terrain.semanticType.replace("cc1:door-", "cc1:key-"),
      });
    }
    const pickupBit = cell.pickup === null ? undefined : pickupIndex.get(cell.pickup.placementId);
    if (
      cell.pickup !== null
      && pickupBit !== undefined
      && (beforeCollected & (1 << pickupBit)) === 0
      && (next.collectedMask & (1 << pickupBit)) !== 0
    ) {
      events.push({
        eventOrder: events.length,
        afterStepOrder: stepOrder,
        kind: cell.pickup.semanticType === CHIP ? "collect-chip" : "collect-key",
        coordinate: to,
        placementId: cell.pickup.placementId,
        semanticType: cell.pickup.semanticType,
        resourceType: cell.pickup.semanticType,
      });
    }
    if (cell.terrain.semanticType === SOCKET) {
      events.push({
        eventOrder: events.length,
        afterStepOrder: stepOrder,
        kind: "open-socket",
        coordinate: to,
        placementId: cell.terrain.placementId,
        semanticType: SOCKET,
        resourceType: CHIP,
      });
    }
    if (cell.terrain.semanticType === EXIT) {
      events.push({
        eventOrder: events.length,
        afterStepOrder: stepOrder,
        kind: "reach-exit",
        coordinate: to,
        placementId: cell.terrain.placementId,
        semanticType: EXIT,
        resourceType: null,
      });
    }
    state = next;
  }
  if (state.remainingChips !== 0) throw new Error("Key Pyramid route did not collect all chips");
  return {
    tileSteps,
    events,
    finalState: {
      coordinate: { x: state.x, y: state.y, z: 0 },
      remainingChips: 0,
      inventory: {
        red: state.red,
        blue: state.blue,
        yellow: state.yellow,
        green: state.green,
      },
    },
  };
}

export function buildKeyPyramidP5Route(
  facts: LevelFactsV1["payload"],
): KeyPyramidP5RouteV1 {
  const { cells, pickups, doors, start } = buildCells(facts);
  const directions = deriveDirections(cells, pickups, doors, start, facts.exits[0]!);
  const materialized = materializeRoute(directions, cells, pickups, doors, start);
  if (materialized.tileSteps.length !== 162) {
    throw new Error(`Key Pyramid reviewed route drifted to ${materialized.tileSteps.length} steps`);
  }
  const subgoals = SUBGOALS.map((subgoal) => ({
    ...subgoal,
    eventOrders: materialized.events
      .filter(({ afterStepOrder }) => (
        afterStepOrder >= subgoal.firstStepOrder && afterStepOrder <= subgoal.lastStepOrder
      ))
      .map(({ eventOrder }) => eventOrder),
  }));
  return {
    routeType: "p5-key-pyramid-route",
    routeVersion: 1,
    derivation: "checked-facts-resource-search",
    target: facts.target,
    level: facts.level,
    start,
    tileStepsOrder: "step-order",
    tileSteps: materialized.tileSteps,
    eventsOrder: "event-order",
    events: materialized.events,
    subgoalsOrder: "execution-order",
    subgoals,
    finalState: materialized.finalState,
  };
}
