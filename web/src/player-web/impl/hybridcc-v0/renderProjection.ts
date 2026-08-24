import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { HybridCcElement, HybridCcNativeLevel } from "./nativeLevel";
import type { HybridCcActor, HybridCcSnapshot } from "./wasmBridge";

const DIRECTION_TILES = [
  MS_TILE.Slide_North,
  MS_TILE.Slide_East,
  MS_TILE.Slide_South,
  MS_TILE.Slide_West,
] as const;
const KEY_TILES = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
const DOOR_TILES = [MS_TILE.Door_Red, MS_TILE.Door_Blue, MS_TILE.Door_Yellow, MS_TILE.Door_Green] as const;

function msDirection(direction: number): number {
  return [MS_DIRECTION.north, MS_DIRECTION.east, MS_DIRECTION.south, MS_DIRECTION.west][direction]
    ?? MS_DIRECTION.none;
}

function classicColorIndex(color: number): number {
  switch (color) {
    case 1: return 1;
    case 2: return 0;
    case 3: return 3;
    case 4: return 2;
    default: return 0;
  }
}

function buttonTile(color: number): number {
  switch (color) {
    case 1: case 7: return MS_TILE.Button_Blue;
    case 2: case 8: return MS_TILE.Button_Red;
    case 3: case 4: case 10: return MS_TILE.Button_Green;
    default: return MS_TILE.Button_Brown;
  }
}

function iceTile(edges: number): number {
  switch (edges) {
    case 0b1001: return MS_TILE.IceWall_Northwest;
    case 0b0011: return MS_TILE.IceWall_Northeast;
    case 0b0110: return MS_TILE.IceWall_Southeast;
    case 0b1100: return MS_TILE.IceWall_Southwest;
    default: return MS_TILE.Ice;
  }
}

function panelTile(edges: number): number {
  switch (edges) {
    case 0b0001: return MS_TILE.Wall_North;
    case 0b0010: return MS_TILE.Wall_East;
    case 0b0100: return MS_TILE.Wall_South;
    case 0b1000: return MS_TILE.Wall_West;
    case 0b0110: return MS_TILE.Wall_Southeast;
    default: return MS_TILE.Nothing;
  }
}

function terrainTile(element: HybridCcElement, iceCornerEdges: number): number {
  switch (element.id) {
    case 0: case 1: return MS_TILE.Empty;
    case 2: return MS_TILE.Wall;
    case 3: return MS_TILE.Exit;
    case 4: return MS_TILE.Water;
    case 5: return MS_TILE.Fire;
    case 6:
      if (element.rule === 4) return MS_TILE.BlueWall_Fake;
      if (element.rule === 2) return MS_TILE.BlueWall_Real;
      if (element.rule === 5) return MS_TILE.HiddenWall_Perm;
      return MS_TILE.HiddenWall_Temp;
    case 7: return MS_TILE.Dirt;
    case 8: return MS_TILE.Gravel;
    case 9: return iceTile(iceCornerEdges);
    case 10: return DIRECTION_TILES[element.direction] ?? MS_TILE.Slide_North;
    case 11: return MS_TILE.Slide_Random;
    case 12: return MS_TILE.Teleport;
    case 13: return MS_TILE.Beartrap;
    case 14: return MS_TILE.PopupWall;
    case 15: return MS_TILE.HintButton;
    case 16: return MS_TILE.CloneMachine;
    case 17: return MS_TILE.Burglar;
    default: return MS_TILE.Empty;
  }
}

function itemTile(element: HybridCcElement): number {
  switch (element.id) {
    case 18: return buttonTile(element.color);
    case 19: return element.rule === 6 ? MS_TILE.SwitchWall_Open : MS_TILE.SwitchWall_Closed;
    case 20: return DOOR_TILES[classicColorIndex(element.color)] ?? MS_TILE.Door_Red;
    case 21: return MS_TILE.Socket;
    case 22: return MS_TILE.ICChip;
    case 23: return MS_TILE.Bomb;
    case 24: return KEY_TILES[classicColorIndex(element.color)] ?? MS_TILE.Key_Red;
    case 26: return MS_TILE.Boots_Slide;
    case 27: return MS_TILE.Boots_Ice;
    case 28: return MS_TILE.Boots_Water;
    case 29: return MS_TILE.Boots_Fire;
    default: return MS_TILE.Empty;
  }
}

function actorTile(kind: number): number {
  switch (kind) {
    case 30: return MS_TILE.Block;
    case 31: return MS_TILE.IceBlock;
    case 32: return MS_TILE.Bug;
    case 33: return MS_TILE.Paramecium;
    case 34: return MS_TILE.Glider;
    case 35: return MS_TILE.Fireball;
    case 36: return MS_TILE.Blob;
    case 37: return MS_TILE.Teeth;
    case 38: return MS_TILE.Ball;
    case 39: return MS_TILE.Walker;
    case 40: return MS_TILE.Tank;
    case 41: return MS_TILE.Chip;
    default: return MS_TILE.Nothing;
  }
}

function actorPosition(actor: HybridCcActor, width: number): number {
  return actor.position.y * width + actor.position.x;
}

export function hybridCcSeriesLevel(level: HybridCcNativeLevel): SeriesLevel {
  return {
    index: Math.max(0, level.number - 1),
    number: level.number,
    name: level.title,
    author: level.author,
    password: level.password,
    timeLimitSeconds: level.timeLimitSeconds,
    chipsRequired: level.requiredChips,
    bestTimeTicks: 0,
    levelSize: level.encoded.length,
    solutionSize: 0,
    levelHash: "",
    gameplayHash: "",
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  };
}

export function hybridCcSeries(
  filebase: string,
  name: string,
  levels: HybridCcNativeLevel[],
): SeriesCatalogEntry {
  return {
    name,
    filebase,
    ruleset: "Lynx",
    mapfilename: filebase,
    levels: levels.map(hybridCcSeriesLevel),
  };
}

export function projectHybridCcSession(
  level: HybridCcNativeLevel,
  snapshot: HybridCcSnapshot,
  seriesFile: string,
): InteractiveGameSession {
  const cells = snapshot.cells.map((cell, pos) => {
    const terrain = terrainTile(cell.terrain, cell.iceCornerEdges);
    const device = itemTile(cell.device);
    const pickup = itemTile(cell.pickup);
    const panel = panelTile(cell.panelEdges);
    const overlay = pickup !== MS_TILE.Empty
      ? pickup
      : device !== MS_TILE.Empty
        ? device
        : panel !== MS_TILE.Nothing
          ? panel
          : null;
    return {
      position: { x: pos % level.width, y: Math.floor(pos / level.width), z: 0, pos },
      top: { id: overlay ?? terrain, state: 0 },
      bottom: { id: overlay === null ? MS_TILE.Nothing : terrain, state: 0 },
    };
  });
  const livingActors = snapshot.actors.filter((actor) => actor.alive && actor.position.z === 0);
  const chip = livingActors.find((actor) => actor.kind === 41) ?? null;
  const chipsNeeded = Math.max(0, level.requiredChips - snapshot.chipsCollected);
  const keys = chip?.keys ?? [0, 0, 0, 0];
  const tools = chip?.tools ?? [0, 0, 0, 0];
  const status = snapshot.outcome.kind === 1 ? "completed" : snapshot.outcome.kind === 2 ? "failed" : "playing";
  const renderActor = (actor: HybridCcActor) => ({
    serial: actor.id,
    id: actorTile(actor.kind),
    pos: actorPosition(actor, level.width),
    z: 0,
    dir: msDirection(actor.direction),
    moving: 0,
    frame: snapshot.logicStep,
    hidden: false,
    visual: {
      kind: "creature" as const,
      tileId: actorTile(actor.kind),
      dir: msDirection(actor.direction),
      moving: 0,
      frame: snapshot.logicStep,
    },
  });
  const chipRender = chip ? {
    pos: actorPosition(chip, level.width),
    z: 0,
    dir: msDirection(chip.direction),
    moving: 0,
    pushing: false,
    hidden: false,
    failed: snapshot.outcome.kind === 2,
    endGameAnimationTileId: null,
    endGameAnimationFrame: null,
    visual: {
      kind: "creature" as const,
      tileId: MS_TILE.Chip,
      dir: msDirection(chip.direction),
      moving: 0,
      frame: snapshot.logicStep,
    },
  } : null;

  return {
    request: { seriesFile, levelNumber: level.number, ruleset: "Lynx", randomSeed: 0 },
    mode: "manual",
    hintText: level.hint || null,
    frame: {
      snapshot: {
        phase: status,
        input: "none",
        inputCode: 0,
        status,
        tick: snapshot.logicStep * 2,
        currentTime: snapshot.logicStep * 2,
        timeOffset: 0,
        secondsPlayed: Math.floor(snapshot.logicStep / 10),
        timelimit: level.timeLimitSeconds * 20,
        chipsNeeded,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: snapshot.logicStep,
        randomState: {
          main: { initial: "0", value: snapshot.stateHash.toString(16), shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: chip
          ? { x: chip.position.x * 8, y: chip.position.y * 8 }
          : { x: 0, y: 0 },
        inventory: {
          keys: [...keys],
          boots: [tools[1], tools[0], tools[3], tools[2]],
          tools: [],
        },
        chip: chip ? {
          id: MS_TILE.Chip,
          layer: 0,
          dir: String(msDirection(chip.direction)),
          position: {
            x: chip.position.x,
            y: chip.position.y,
            z: 0,
            pos: actorPosition(chip, level.width),
          },
          state: 0,
        } : null,
        creatureCount: Math.max(0, livingActors.length - (chip ? 1 : 0)),
        creaturesHash: snapshot.stateHash.toString(16),
        mapHash: snapshot.stateHash.toString(16),
        creatures: livingActors.filter((actor) => actor !== chip).map((actor) => ({
          id: actorTile(actor.kind),
          layer: 0,
          dir: String(msDirection(actor.direction)),
          position: {
            x: actor.position.x,
            y: actor.position.y,
            z: 0,
            pos: actorPosition(actor, level.width),
          },
          state: 0,
        })),
      },
      cells,
      currentZ: 0,
      visibleLayers: [{ z: 0, cells }],
      tileOverlays: [],
      render: {
        chip: chipRender,
        actors: livingActors.filter((actor) => actor !== chip).map(renderActor),
        animations: [],
      },
    },
    history: {
      enabled: false,
      initialTick: 0,
      currentTick: snapshot.logicStep * 2,
      latestTick: snapshot.logicStep * 2,
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "hybridcc-v0",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run: { undoUsedCount: 0, replayAvailable: false, result: null },
    handle: 0 as never,
  };
}
