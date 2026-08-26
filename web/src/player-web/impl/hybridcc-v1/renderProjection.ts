import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { EngineMapCell, EngineTile } from "@game-core/api/model";
import { MS_DIRECTION, MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  HYBRID_CC_V1_COLOR,
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_ORIENTATION,
  HYBRID_CC_V1_RULE,
} from "./engineFacts";
import type {
  HybridCcV1Cell,
  HybridCcV1ConvertedLevel,
  HybridCcV1Element,
  HybridCcV1InventoryEntry,
  HybridCcV1InventoryQuantity,
} from "./wasmBridge";

export class HybridCcV1ProjectionError extends Error {
  readonly name = "HybridCcV1ProjectionError";
}

const EMPTY_TILE: EngineTile = { id: MS_TILE.Nothing, state: 0 };
const FLOOR_TILE: EngineTile = { id: MS_TILE.Empty, state: 0 };

function tile(id: number, state = 0): EngineTile {
  return { id, state };
}

function unsupported(kind: string, element: HybridCcV1Element): never {
  throw new HybridCcV1ProjectionError(
    `Hybrid v1 cannot project ${kind} element ${element.id} (rule ${element.rule}, color ${element.color}).`,
  );
}

export function hybridCcV1Direction(direction: number): number {
  switch (direction) {
    case HYBRID_CC_V1_DIRECTION.north: return MS_DIRECTION.north;
    case HYBRID_CC_V1_DIRECTION.east: return MS_DIRECTION.east;
    case HYBRID_CC_V1_DIRECTION.south: return MS_DIRECTION.south;
    case HYBRID_CC_V1_DIRECTION.west: return MS_DIRECTION.west;
    case HYBRID_CC_V1_DIRECTION.none: return MS_DIRECTION.none;
    default:
      throw new HybridCcV1ProjectionError(`Hybrid v1 direction ${direction} is outside ABI v1.`);
  }
}

function classicColorTile(
  color: number,
  family: "key" | "door",
): EngineTile {
  const ids = family === "key"
    ? {
        [HYBRID_CC_V1_COLOR.red]: MS_TILE.Key_Red,
        [HYBRID_CC_V1_COLOR.blue]: MS_TILE.Key_Blue,
        [HYBRID_CC_V1_COLOR.yellow]: MS_TILE.Key_Yellow,
        [HYBRID_CC_V1_COLOR.green]: MS_TILE.Key_Green,
      }
    : {
        [HYBRID_CC_V1_COLOR.red]: MS_TILE.Door_Red,
        [HYBRID_CC_V1_COLOR.blue]: MS_TILE.Door_Blue,
        [HYBRID_CC_V1_COLOR.yellow]: MS_TILE.Door_Yellow,
        [HYBRID_CC_V1_COLOR.green]: MS_TILE.Door_Green,
      };
  const id = ids[color as keyof typeof ids];
  if (id === undefined) {
    throw new HybridCcV1ProjectionError(`Hybrid v1 ${family} color ${color} has no classic Lynx artwork.`);
  }
  return tile(id);
}

function forceFloorTile(direction: number): EngineTile {
  switch (direction) {
    case HYBRID_CC_V1_DIRECTION.north: return tile(MS_TILE.Slide_North);
    case HYBRID_CC_V1_DIRECTION.east: return tile(MS_TILE.Slide_East);
    case HYBRID_CC_V1_DIRECTION.south: return tile(MS_TILE.Slide_South);
    case HYBRID_CC_V1_DIRECTION.west: return tile(MS_TILE.Slide_West);
    default:
      throw new HybridCcV1ProjectionError(`Hybrid v1 force-floor direction ${direction} is invalid.`);
  }
}

function iceTile(cell: HybridCcV1Cell): EngineTile {
  const corner = cell.sides.find((side) => side.id === HYBRID_CC_V1_ELEMENT.corner);
  if (!corner) return tile(MS_TILE.Ice);
  switch (corner.orientation) {
    // Hybrid names solid edges; Lynx artwork names the open diagonal.
    case HYBRID_CC_V1_ORIENTATION.northWest: return tile(MS_TILE.IceWall_Southeast);
    case HYBRID_CC_V1_ORIENTATION.northEast: return tile(MS_TILE.IceWall_Southwest);
    case HYBRID_CC_V1_ORIENTATION.southEast: return tile(MS_TILE.IceWall_Northwest);
    case HYBRID_CC_V1_ORIENTATION.southWest: return tile(MS_TILE.IceWall_Northeast);
    default: return unsupported("ice corner", corner);
  }
}

function trickWallTile(element: HybridCcV1Element): EngineTile {
  switch (element.rule) {
    case HYBRID_CC_V1_RULE.becomesFloor: return tile(MS_TILE.BlueWall_Fake);
    case HYBRID_CC_V1_RULE.becomesWall: return tile(MS_TILE.BlueWall_Real);
    case HYBRID_CC_V1_RULE.permanentlyInvisible: return tile(MS_TILE.HiddenWall_Perm);
    case HYBRID_CC_V1_RULE.invisibleBecomesWall: return tile(MS_TILE.HiddenWall_Temp);
    default: return unsupported("trick-wall", element);
  }
}

function staticMarkerTile(element: HybridCcV1Element): EngineTile {
  switch (element.id) {
    case HYBRID_CC_V1_ELEMENT.drownedPlayerMarker: return tile(MS_TILE.Drowned_Chip);
    case HYBRID_CC_V1_ELEMENT.burnedPlayerMarkerA:
    case HYBRID_CC_V1_ELEMENT.burnedPlayerMarkerB: return tile(MS_TILE.Burned_Chip);
    case HYBRID_CC_V1_ELEMENT.exitedPlayerMarker: return tile(MS_TILE.Exited_Chip);
    case HYBRID_CC_V1_ELEMENT.unusedExitMarkerA: return tile(MS_TILE.Exit_Extra_1);
    case HYBRID_CC_V1_ELEMENT.unusedExitMarkerB: return tile(MS_TILE.Exit_Extra_2);
    case HYBRID_CC_V1_ELEMENT.swimmingPlayerMarker: return tile(MS_TILE.Swimming_Chip);
    default: return unsupported("static marker", element);
  }
}

function terrainTile(cell: HybridCcV1Cell): EngineTile {
  const element = cell.terrain;
  switch (element.id) {
    case HYBRID_CC_V1_ELEMENT.none: return EMPTY_TILE;
    case HYBRID_CC_V1_ELEMENT.space: return tile(MS_TILE.Air);
    case HYBRID_CC_V1_ELEMENT.floor: return FLOOR_TILE;
    case HYBRID_CC_V1_ELEMENT.wall: return tile(MS_TILE.Wall);
    case HYBRID_CC_V1_ELEMENT.exit: return tile(MS_TILE.Exit);
    case HYBRID_CC_V1_ELEMENT.water: return tile(MS_TILE.Water);
    case HYBRID_CC_V1_ELEMENT.fire: return tile(MS_TILE.Fire);
    case HYBRID_CC_V1_ELEMENT.trickWall: return trickWallTile(element);
    case HYBRID_CC_V1_ELEMENT.dirt: return tile(MS_TILE.Dirt);
    case HYBRID_CC_V1_ELEMENT.gravel: return tile(MS_TILE.Gravel);
    case HYBRID_CC_V1_ELEMENT.ice: return iceTile(cell);
    case HYBRID_CC_V1_ELEMENT.forceFloor: return forceFloorTile(element.direction);
    case HYBRID_CC_V1_ELEMENT.randomForceFloor: return tile(MS_TILE.Slide_Random);
    case HYBRID_CC_V1_ELEMENT.teleport: return tile(MS_TILE.Teleport);
    case HYBRID_CC_V1_ELEMENT.trap:
      return tile(MS_TILE.Beartrap, cell.trapOpen ? MS_FLOOR_STATE.TrapOpen : 0);
    case HYBRID_CC_V1_ELEMENT.steppingStone: return tile(MS_TILE.PopupWall);
    case HYBRID_CC_V1_ELEMENT.hint: return tile(MS_TILE.HintButton);
    case HYBRID_CC_V1_ELEMENT.cloner: return tile(MS_TILE.CloneMachine);
    case HYBRID_CC_V1_ELEMENT.thief: return tile(MS_TILE.Burglar);
    case HYBRID_CC_V1_ELEMENT.drownedPlayerMarker:
    case HYBRID_CC_V1_ELEMENT.burnedPlayerMarkerA:
    case HYBRID_CC_V1_ELEMENT.burnedPlayerMarkerB:
    case HYBRID_CC_V1_ELEMENT.exitedPlayerMarker:
    case HYBRID_CC_V1_ELEMENT.unusedExitMarkerA:
    case HYBRID_CC_V1_ELEMENT.unusedExitMarkerB:
    case HYBRID_CC_V1_ELEMENT.swimmingPlayerMarker:
      return staticMarkerTile(element);
    default: return unsupported("terrain", element);
  }
}

function buttonTile(element: HybridCcV1Element): EngineTile {
  switch (element.color) {
    case HYBRID_CC_V1_COLOR.blue: return tile(MS_TILE.Button_Blue);
    case HYBRID_CC_V1_COLOR.green: return tile(MS_TILE.Button_Green);
    case HYBRID_CC_V1_COLOR.red: return tile(MS_TILE.Button_Red);
    case HYBRID_CC_V1_COLOR.brown: return tile(MS_TILE.Button_Brown);
    default: return unsupported("button", element);
  }
}

function deviceTile(cell: HybridCcV1Cell): EngineTile {
  const element = cell.device;
  switch (element.id) {
    case HYBRID_CC_V1_ELEMENT.none: return EMPTY_TILE;
    case HYBRID_CC_V1_ELEMENT.button: return buttonTile(element);
    case HYBRID_CC_V1_ELEMENT.toggleWall:
      return tile(cell.toggleWallOpen ? MS_TILE.SwitchWall_Open : MS_TILE.SwitchWall_Closed);
    case HYBRID_CC_V1_ELEMENT.door: return classicColorTile(element.color, "door");
    case HYBRID_CC_V1_ELEMENT.socket: return tile(MS_TILE.Socket);
    default: return unsupported("device", element);
  }
}

function pickupTile(cell: HybridCcV1Cell): EngineTile {
  const element = cell.pickup;
  switch (element.id) {
    case HYBRID_CC_V1_ELEMENT.none: return EMPTY_TILE;
    case HYBRID_CC_V1_ELEMENT.chip: return tile(MS_TILE.ICChip);
    case HYBRID_CC_V1_ELEMENT.bomb: return tile(MS_TILE.Bomb);
    case HYBRID_CC_V1_ELEMENT.key: return classicColorTile(element.color, "key");
    case HYBRID_CC_V1_ELEMENT.forceBoots: return tile(MS_TILE.Boots_Slide);
    case HYBRID_CC_V1_ELEMENT.iceSkates: return tile(MS_TILE.Boots_Ice);
    case HYBRID_CC_V1_ELEMENT.flippers: return tile(MS_TILE.Boots_Water);
    case HYBRID_CC_V1_ELEMENT.fireBoots: return tile(MS_TILE.Boots_Fire);
    default: return unsupported("pickup", element);
  }
}

function panelTile(cell: HybridCcV1Cell): EngineTile {
  const panels = cell.sides.filter((side) => side.id === HYBRID_CC_V1_ELEMENT.panel);
  if (panels.length === 0) return EMPTY_TILE;
  const orientation = panels.reduce((value, panel) => value | panel.orientation, 0);
  switch (orientation) {
    case HYBRID_CC_V1_ORIENTATION.north: return tile(MS_TILE.Wall_North);
    case HYBRID_CC_V1_ORIENTATION.east: return tile(MS_TILE.Wall_East);
    case HYBRID_CC_V1_ORIENTATION.south: return tile(MS_TILE.Wall_South);
    case HYBRID_CC_V1_ORIENTATION.west: return tile(MS_TILE.Wall_West);
    case HYBRID_CC_V1_ORIENTATION.southEast: return tile(MS_TILE.Wall_Southeast);
    default:
      throw new HybridCcV1ProjectionError(`Hybrid v1 panel orientation mask ${orientation} has no classic artwork.`);
  }
}

export function projectHybridCcV1Cell(
  cell: HybridCcV1Cell,
  position: number,
  width: number,
): EngineMapCell {
  if (!Number.isSafeInteger(width) || width <= 0) {
    throw new HybridCcV1ProjectionError(`Hybrid v1 projection width ${width} is invalid.`);
  }
  const terrain = terrainTile(cell);
  const overlays = [deviceTile(cell), pickupTile(cell), panelTile(cell)]
    .filter((candidate) => candidate.id !== MS_TILE.Nothing);
  return {
    position: {
      x: position % width,
      y: Math.floor(position / width),
      z: 0,
      pos: position,
    },
    top: overlays.at(-1) ?? terrain,
    bottom: overlays.length > 1
      ? overlays.at(-2)!
      : overlays.length === 1 ? terrain : EMPTY_TILE,
  };
}

export function hybridCcV1ActorTile(kind: number): number {
  switch (kind) {
    case HYBRID_CC_V1_ELEMENT.dirtBlock: return MS_TILE.Block;
    case HYBRID_CC_V1_ELEMENT.iceBlock: return MS_TILE.IceBlock;
    case HYBRID_CC_V1_ELEMENT.ant: return MS_TILE.Bug;
    case HYBRID_CC_V1_ELEMENT.centipede: return MS_TILE.Paramecium;
    case HYBRID_CC_V1_ELEMENT.glider: return MS_TILE.Glider;
    case HYBRID_CC_V1_ELEMENT.fireball: return MS_TILE.Fireball;
    case HYBRID_CC_V1_ELEMENT.blob: return MS_TILE.Blob;
    case HYBRID_CC_V1_ELEMENT.teeth: return MS_TILE.Teeth;
    case HYBRID_CC_V1_ELEMENT.ball: return MS_TILE.Ball;
    case HYBRID_CC_V1_ELEMENT.walker: return MS_TILE.Walker;
    case HYBRID_CC_V1_ELEMENT.tank: return MS_TILE.Tank;
    case HYBRID_CC_V1_ELEMENT.player: return MS_TILE.Chip;
    default:
      throw new HybridCcV1ProjectionError(`Hybrid v1 actor element ${kind} has no classic Lynx artwork.`);
  }
}

function displayQuantity(quantity: HybridCcV1InventoryQuantity): number {
  if (quantity.unlimited) return 1;
  if (quantity.count <= 0n) return 0;
  const maximum = BigInt(Number.MAX_SAFE_INTEGER);
  return Number(quantity.count > maximum ? maximum : quantity.count);
}

function quantityFor(
  entries: readonly HybridCcV1InventoryEntry[],
  kind: number,
  color?: number,
): HybridCcV1InventoryQuantity {
  return entries.find((entry) => (
    entry.identity.kind === kind && (color === undefined || entry.identity.color === color)
  ))?.quantity ?? { count: 0n, unlimited: false };
}

export interface HybridCcV1InventoryProjection {
  keys: [number, number, number, number];
  boots: [number, number, number, number];
  tools: [];
  chipsNeeded: number;
}

export function projectHybridCcV1Inventory(
  entries: readonly HybridCcV1InventoryEntry[],
  requiredChips: number,
): HybridCcV1InventoryProjection {
  const chips = quantityFor(entries, HYBRID_CC_V1_ELEMENT.chip, HYBRID_CC_V1_COLOR.gray);
  const collectedChips = chips.unlimited ? requiredChips : displayQuantity(chips);
  return {
    // Shared Tile World HUD order: red, blue, yellow, green.
    keys: [
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.red)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.blue)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.yellow)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.green)),
    ],
    // Shared Tile World HUD order: ice, force, fire, water.
    boots: [
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.iceSkates)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.forceBoots)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.fireBoots)),
      displayQuantity(quantityFor(entries, HYBRID_CC_V1_ELEMENT.flippers)),
    ],
    tools: [],
    chipsNeeded: Math.max(0, requiredChips - collectedChips),
  };
}

export function hybridCcV1SeriesLevel(
  level: HybridCcV1ConvertedLevel,
  gameplayHash = "",
): SeriesLevel {
  return {
    index: Math.max(0, level.entryOrdinal),
    number: level.nativeLevel.number,
    name: level.nativeLevel.title,
    author: level.nativeLevel.author,
    password: level.nativeLevel.password,
    timeLimitSeconds: level.nativeLevel.timeLimitSeconds,
    chipsRequired: level.requiredChips,
    bestTimeTicks: 0,
    levelSize: level.nativeLevel.encoded.length,
    solutionSize: 0,
    levelHash: gameplayHash,
    gameplayHash,
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  };
}

export function hybridCcV1Series(
  filebase: string,
  name: string,
  levels: readonly HybridCcV1ConvertedLevel[],
  gameplayHashes: readonly string[] = [],
): SeriesCatalogEntry {
  return {
    name,
    filebase,
    ruleset: "Hybrid",
    mapfilename: filebase,
    levels: levels.map((level, index) => hybridCcV1SeriesLevel(level, gameplayHashes[index] ?? "")),
  };
}
