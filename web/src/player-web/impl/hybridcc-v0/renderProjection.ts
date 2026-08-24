import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  buildCompletedRunState,
  buildFailedRunState,
  buildInteractiveFailureCause,
  buildLiveRunState,
} from "@game-runtime/impl/interactiveSessionRun";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { HybridCcElement, HybridCcNativeLevel } from "./nativeLevel";
import {
  hybridCcV0ActorMotion,
  type HybridCcV0MotionTracks,
} from "./motionProjection";
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

function legacyKeyCounts(keys: readonly number[]): [number, number, number, number] {
  // Hybrid native order: blue, red, green, yellow.
  // Shared Tile World HUD order: red, blue, yellow, green.
  return [keys[1] ?? 0, keys[0] ?? 0, keys[3] ?? 0, keys[2] ?? 0];
}

function legacyBootCounts(tools: readonly number[]): [number, number, number, number] {
  // Hybrid native order: flippers, fire boots, ice skates, force boots.
  // Shared Tile World HUD order: ice skates, force boots, fire boots, flippers.
  return [tools[2] ?? 0, tools[3] ?? 0, tools[1] ?? 0, tools[0] ?? 0];
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
  // Native maps store the corner's solid edges. The Lynx artwork names the
  // open corner, which is the opposite diagonal.
  switch (edges) {
    case 0b1001: return MS_TILE.IceWall_Southeast;
    case 0b0011: return MS_TILE.IceWall_Southwest;
    case 0b0110: return MS_TILE.IceWall_Northwest;
    case 0b1100: return MS_TILE.IceWall_Northeast;
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

function outcomeGridPosition(snapshot: HybridCcSnapshot) {
  return {
    x: snapshot.outcome.position.x + 1,
    y: snapshot.outcome.position.y + 1,
    z: snapshot.outcome.position.z + 1,
  };
}

function failureCause(snapshot: HybridCcSnapshot) {
  const position = outcomeGridPosition(snapshot);
  const coordinate = `(${position.x}, ${position.y})`;
  switch (snapshot.outcome.lossCause) {
    case 1:
      return buildInteractiveFailureCause({ kind: "water", message: `Drowned at ${coordinate}`, position });
    case 2:
      return buildInteractiveFailureCause({ kind: "fire", message: `Stepped in fire at ${coordinate}`, position });
    case 3:
      return buildInteractiveFailureCause({ kind: "bomb", message: `Hit a bomb at ${coordinate}`, position });
    case 4:
      return buildInteractiveFailureCause({
        kind: "timeout",
        message: `Ran out of time at ${(snapshot.outcome.logicStep / 10).toFixed(1)}s`,
        position,
      });
    default: {
      const actorNames = ["bug", "paramecium", "glider", "fireball", "blob", "teeth", "ball", "walker", "tank"];
      const actorTileIds = [
        MS_TILE.Bug,
        MS_TILE.Paramecium,
        MS_TILE.Glider,
        MS_TILE.Fireball,
        MS_TILE.Blob,
        MS_TILE.Teeth,
        MS_TILE.Ball,
        MS_TILE.Walker,
        MS_TILE.Tank,
      ];
      const actorIndex = snapshot.outcome.lossCause - 5;
      const actorName = actorNames[actorIndex] ?? null;
      const tileId = actorTileIds[actorIndex] ?? null;
      return buildInteractiveFailureCause({
        actorName,
        kind: actorName ? "monster" : "other",
        message: actorName ? `Killed by ${actorName} at ${coordinate}` : `Failed at ${coordinate}`,
        position,
        tileId,
      });
    }
  }
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
  presentationTick: number,
  soundEffects = 0,
  recordedMoveCount = 0,
  motionTracks: HybridCcV0MotionTracks = new Map(),
): InteractiveGameSession {
  const cells = snapshot.cells.map((cell, pos) => {
    const terrain = terrainTile(cell.terrain, cell.iceCornerEdges);
    const device = itemTile(cell.device);
    const pickup = itemTile(cell.pickup);
    const panel = panelTile(cell.panelEdges);
    const overlays = [device, pickup, panel].filter(
      (tile) => tile !== MS_TILE.Empty && tile !== MS_TILE.Nothing,
    );
    const top = overlays.at(-1) ?? terrain;
    const bottom = overlays.length > 1 ? overlays.at(-2)! : overlays.length === 1 ? terrain : MS_TILE.Nothing;
    return {
      position: { x: pos % level.width, y: Math.floor(pos / level.width), z: 0, pos },
      top: { id: top, state: 0 },
      bottom: { id: bottom, state: 0 },
    };
  });
  const livingActors = snapshot.actors.filter((actor) => actor.alive && actor.position.z === 0);
  const chip = snapshot.actors.find((actor) => actor.kind === 41 && actor.position.z === 0) ?? null;
  const chipsNeeded = Math.max(0, level.requiredChips - snapshot.chipsCollected);
  const keys = chip?.keys ?? [0, 0, 0, 0];
  const tools = chip?.tools ?? [0, 0, 0, 0];
  const status = snapshot.outcome.kind === 1 ? "completed" : snapshot.outcome.kind === 2 ? "failed" : "playing";
  const endPosition = snapshot.outcome.kind === 0 ? null : outcomeGridPosition(snapshot);
  const run = snapshot.outcome.kind === 1
    ? buildCompletedRunState(level.number, level.timeLimitSeconds * 20, presentationTick, 0, endPosition, false)
    : snapshot.outcome.kind === 2
      ? buildFailedRunState(0, failureCause(snapshot), endPosition, false)
      : buildLiveRunState(0, false);
  const renderActor = (actor: HybridCcActor) => {
    const motion = hybridCcV0ActorMotion(motionTracks, actor.id, presentationTick);
    return {
      serial: actor.id,
      id: actorTile(actor.kind),
      pos: actorPosition(actor, level.width),
      z: 0,
      dir: msDirection(actor.direction),
      moving: motion.moving,
      frame: motion.frame,
      hidden: false,
      visual: {
        kind: "creature" as const,
        tileId: actorTile(actor.kind),
        dir: msDirection(actor.direction),
        moving: motion.moving,
        frame: motion.frame,
      },
    };
  };
  const chipMotion = chip ? hybridCcV0ActorMotion(motionTracks, chip.id, presentationTick) : null;
  const chipRender = chip && chipMotion ? {
    pos: actorPosition(chip, level.width),
    z: 0,
    dir: msDirection(chip.direction),
    moving: chipMotion.moving,
    pushing: false,
    hidden: false,
    failed: snapshot.outcome.kind === 2,
    endGameAnimationTileId: null,
    endGameAnimationFrame: null,
    visual: {
      kind: "creature" as const,
      tileId: MS_TILE.Chip,
      dir: msDirection(chip.direction),
      moving: chipMotion.moving,
      frame: chipMotion.frame,
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
        tick: presentationTick,
        currentTime: presentationTick,
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
        soundEffects,
        view: chip
          ? { x: chip.position.x * 8, y: chip.position.y * 8 }
          : { x: 0, y: 0 },
        inventory: {
          keys: legacyKeyCounts(keys),
          boots: legacyBootCounts(tools),
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
        creatureCount: livingActors.filter((actor) => actor.kind !== 41).length,
        creaturesHash: snapshot.stateHash.toString(16),
        mapHash: snapshot.stateHash.toString(16),
        creatures: livingActors.filter((actor) => actor.kind !== 41).map((actor) => ({
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
        actors: livingActors.filter((actor) => actor.kind !== 41).map(renderActor),
        animations: [],
      },
    },
    history: {
      enabled: false,
      initialTick: 0,
      currentTick: presentationTick,
      latestTick: presentationTick,
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "hybridcc-v0",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run,
    recordedMoveCount,
    handle: 0 as never,
  };
}
