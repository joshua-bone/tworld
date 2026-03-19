import { cloneBoardCells } from "@game-core/impl/board";
import type { TurnDebugPhaseName } from "@game-core/api/turnPhases";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type {
  GameDebugBoardFlag,
  GameDebugFloorState,
  GameDebugPhaseSnapshot,
  GameDebugRuntimeActor,
  GameDebugSlipEntry,
} from "@game-core/api/debug";
import { createRuntimeCommand } from "@game-core/api/playback";
import { hashByte, hashHex, hashInt, mapHash } from "@game-core/impl/hash";
import { boardGamePosition, projectGamePosition } from "@game-core/impl/position";
import {
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_GRID_WIDTH,
  MS_TILE,
  isMsBoots,
  isMsCreature,
  isMsKey,
  msCreatureDir,
  msCreatureId,
} from "@ruleset-ms/api/tiles";
import type { MsGameState, MsInternalState, MsTrackedBlock, MsTrackedCreature } from "@ruleset-ms/impl/engine";

function directionName(dir: number): string {
  switch (dir) {
    case MS_DIRECTION.north:
      return "north";
    case MS_DIRECTION.west:
      return "west";
    case MS_DIRECTION.south:
      return "south";
    case MS_DIRECTION.east:
      return "east";
    default:
      return "none";
  }
}

function floorStateFlags(state: number): string[] {
  const flags: string[] = [];
  if ((state & MS_FLOOR_STATE.ButtonDown) !== 0) {
    flags.push("button-down");
  }
  if ((state & MS_FLOOR_STATE.Cloning) !== 0) {
    flags.push("cloning");
  }
  if ((state & MS_FLOOR_STATE.Broken) !== 0) {
    flags.push("broken");
  }
  if ((state & MS_FLOOR_STATE.Marker) !== 0) {
    flags.push("marker");
  }
  return flags;
}

function chipStatusCode(status: MsInternalState["chipStatus"]): number {
  switch (status) {
    case "okay":
      return 0;
    case "drowned":
      return 1;
    case "burned":
      return 2;
    case "bombed":
      return 3;
    case "outoftime":
      return 4;
    case "collided":
      return 5;
    default:
      return 8;
  }
}

function creatureStateValue(
  released: boolean,
  cloning: boolean,
  hasMoved: boolean,
  turning: boolean,
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator",
  sliding: boolean,
): number {
  let state = 0;
  if (released) {
    state |= 0x01;
  }
  if (cloning) {
    state |= 0x02;
  }
  if (hasMoved) {
    state |= 0x04;
  }
  if (turning) {
    state |= 0x08;
  }
  if (floorMovement === "ice" || floorMovement === "teleport") {
    state |= 0x10;
  }
  if (floorMovement === "slide" || sliding) {
    state |= 0x20;
  }
  return state;
}

function creatureStateFlags(
  released: boolean,
  cloning: boolean,
  hasMoved: boolean,
  turning: boolean,
  floorMovement: "none" | "ice" | "slide" | "teleport" | "air" | "elevator",
  sliding: boolean,
): string[] {
  const flags: string[] = [];
  if (released) {
    flags.push("released");
  }
  if (cloning) {
    flags.push("cloning");
  }
  if (hasMoved) {
    flags.push("has-moved");
  }
  if (turning) {
    flags.push("turning");
  }
  if (floorMovement === "ice" || floorMovement === "teleport") {
    flags.push("slip");
  }
  if (floorMovement === "slide" || sliding) {
    flags.push("slide");
  }
  return flags;
}

function nonChipStateValue(
  released: boolean,
  cloning: boolean,
  hasMoved: boolean,
  turning: boolean,
  slipping: boolean,
  sliding: boolean,
): number {
  let state = 0;
  if (released) {
    state |= 0x01;
  }
  if (cloning) {
    state |= 0x02;
  }
  if (hasMoved) {
    state |= 0x04;
  }
  if (turning) {
    state |= 0x08;
  }
  if (slipping) {
    state |= 0x10;
  }
  if (sliding) {
    state |= 0x20;
  }
  return state;
}

function nonChipStateFlags(
  released: boolean,
  cloning: boolean,
  hasMoved: boolean,
  turning: boolean,
  slipping: boolean,
  sliding: boolean,
): string[] {
  const flags: string[] = [];
  if (released) {
    flags.push("released");
  }
  if (cloning) {
    flags.push("cloning");
  }
  if (hasMoved) {
    flags.push("has-moved");
  }
  if (turning) {
    flags.push("turning");
  }
  if (slipping) {
    flags.push("slip");
  }
  if (sliding) {
    flags.push("slide");
  }
  return flags;
}

function isIceFloor(floor: number): boolean {
  return floor >= MS_TILE.Ice && floor <= MS_TILE.IceWall_Southeast;
}

function isSlideFloor(floor: number): boolean {
  return floor >= MS_TILE.Slide_North && floor <= MS_TILE.Slide_Random;
}

function floorTile(cells: EngineMapCell[], pos: number): EngineMapCell["top"] {
  const cell = cells[pos]!;
  if (!isMsKey(cell.top.id) && !isMsBoots(cell.top.id) && !isMsCreature(cell.top.id)) {
    return cell.top;
  }
  if (!isMsKey(cell.bottom.id) && !isMsBoots(cell.bottom.id) && !isMsCreature(cell.bottom.id)) {
    return cell.bottom;
  }
  return cell.bottom;
}

function debugPosition(pos: number, z = 1) {
  return boardGamePosition(pos, MS_GRID_WIDTH, z);
}

function debugFloorState(tile: EngineMapCell["top"], movementMode: string, slipDir: number): GameDebugFloorState {
  return {
    id: tile.id,
    state: tile.state,
    stateFlags: floorStateFlags(tile.state),
    movementMode,
    slipDir: directionName(slipDir),
  };
}

function creatureDebugFloorTile(cells: EngineMapCell[], creature: MsTrackedCreature): EngineMapCell["top"] {
  const cell = cells[creature.pos];
  if (!cell) {
    return floorTile(cells, creature.pos);
  }
  if (creature.hidden) {
    return { id: MS_TILE.Empty, state: 0 };
  }
  return floorTile(cells, creature.pos);
}

function collectBoardFlags(cells: EngineMapCell[]): GameDebugBoardFlag[] {
  const flags: GameDebugBoardFlag[] = [];
  for (const cell of cells) {
    if (cell.top.state !== 0) {
      flags.push({
        layer: 1,
        id: cell.top.id,
        position: projectGamePosition(cell.position),
        state: cell.top.state,
        stateFlags: floorStateFlags(cell.top.state),
      });
    }
    if (cell.bottom.state !== 0) {
      flags.push({
        layer: 0,
        id: cell.bottom.id,
        position: projectGamePosition(cell.position),
        state: cell.bottom.state,
        stateFlags: floorStateFlags(cell.bottom.state),
      });
    }
  }
  return flags;
}

function buildCreatureDebugActor(
  cells: EngineMapCell[],
  creature: MsTrackedCreature,
  index: number,
): GameDebugRuntimeActor {
  const slipping = creature.floorMovement !== "none";
  const state = nonChipStateValue(
    creature.released,
    creature.cloning,
    creature.hasMoved,
    creature.turning,
    slipping,
    creature.sliding,
  );
  const floor = creatureDebugFloorTile(cells, creature);
  const movementMode =
    creature.sliding
      ? "slide"
      : creature.floorMovement === "none"
        ? "none"
        : isIceFloor(floor.id)
          ? "ice"
          : isSlideFloor(floor.id)
            ? "slide"
            : floor.id === MS_TILE.Teleport
              ? "teleport"
              : floor.id === MS_TILE.Beartrap
                ? "beartrap"
                : floor.id === MS_TILE.Block_Static
                  ? "block"
                  : "slip";

  return {
    index,
    id: creature.id,
    dir: directionName(creature.dir),
    position: debugPosition(creature.pos, creature.z ?? 1),
    hidden: creature.hidden,
    state,
    stateFlags: nonChipStateFlags(
      creature.released,
      creature.cloning,
      creature.hasMoved,
      creature.turning,
      slipping,
      creature.sliding,
    ),
    tdir: directionName(creature.tdir),
    floor: debugFloorState(floor, movementMode, creature.floorMovementDir),
    moving: creature.moving,
    frame: 0,
  };
}

function buildChipDebugActor(
  cells: EngineMapCell[],
  internal: MsInternalState,
  chipSlipCarryDir: number = MS_DIRECTION.none,
): GameDebugRuntimeActor {
  const state = creatureStateValue(
    internal.chipReleased,
    false,
    internal.chipHasMoved,
    false,
    internal.floorMovement,
    false,
  );
  const floor = debugFloorState(floorTile(cells, internal.chipPos), internal.floorMovement, internal.floorMovementDir);
  if (chipSlipCarryDir !== MS_DIRECTION.none && internal.floorMovement === "none") {
    floor.slipDir = directionName(chipSlipCarryDir);
  }

  return {
    index: 0,
    id: MS_TILE.Chip,
    dir: directionName(internal.chipDir),
    position: debugPosition(internal.chipPos, internal.chipZ ?? 1),
    hidden: false,
    state,
    stateFlags: creatureStateFlags(
      internal.chipReleased,
      false,
      internal.chipHasMoved,
      false,
      internal.floorMovement,
      false,
    ),
    tdir: directionName(internal.chipTDir),
    floor,
    moving: 0,
    frame: 0,
  };
}

function buildBlockDebugActor(cells: EngineMapCell[], block: MsTrackedBlock, index: number): GameDebugRuntimeActor {
  const slipping = block.floorMovement !== "none";
  const state = (block.released ? 0x01 : 0) | (slipping ? 0x10 : 0) | (block.sliding ? 0x20 : 0);
  const stateFlags = [
    ...(block.released ? ["released"] : []),
    ...(slipping ? ["slip"] : []),
    ...(block.sliding ? ["slide"] : []),
  ];
  const floor = floorTile(cells, block.pos);
  const debugFloor = block.hidden ? { id: MS_TILE.Empty, state: 0 } : floor;
  const movementMode =
    block.sliding
      ? "slide"
      : !slipping
        ? "none"
        : isIceFloor(debugFloor.id)
          ? "ice"
          : isSlideFloor(debugFloor.id)
            ? "slide"
            : debugFloor.id === MS_TILE.Teleport
              ? "teleport"
              : debugFloor.id === MS_TILE.Beartrap
                ? "beartrap"
                : debugFloor.id === MS_TILE.Block_Static
                  ? "block"
                  : "slip";

  return {
    index,
    id: MS_TILE.Block,
    dir: directionName(block.dir),
    position: debugPosition(block.pos, block.z ?? 1),
    hidden: block.hidden,
    state,
    stateFlags,
    tdir: "none",
    floor: debugFloorState(debugFloor, movementMode, block.floorMovementDir),
    moving: 0,
    frame: 0,
  };
}

function buildSlipList(
  cells: EngineMapCell[],
  internal: MsInternalState,
  chipSlipCarryDir: number = MS_DIRECTION.none,
): GameDebugSlipEntry[] {
  const slips: GameDebugSlipEntry[] = [];
  const chipSlipDir =
    internal.floorMovement !== "none" && internal.floorMovementDir !== MS_DIRECTION.none
      ? internal.floorMovementDir
      : chipSlipCarryDir;
  if (chipSlipDir !== MS_DIRECTION.none) {
    slips.push({
      index: 0,
      dir: directionName(chipSlipDir),
      creatureIndex: 0,
      blockIndex: -1,
      creature: buildChipDebugActor(cells, internal, chipSlipCarryDir),
    });
  }

  const activeNonChipSlips = [
    ...internal.creatureSlipList
      .map((entry) => ({
        kind: "creature" as const,
        entry,
        creatureIndex: internal.creatureIndexBySerial.get(entry.serial) ?? -1,
      }))
      .filter(({ creatureIndex }) => creatureIndex >= 0),
    ...internal.blocks
      .map((block, blockIndex) => ({ kind: "block" as const, block, blockIndex }))
      .filter(({ block }) => !block.hidden && block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none),
  ].sort((left, right) => {
    const leftOrder = left.kind === "creature" ? left.entry.slipOrder : left.block.slipOrder;
    const rightOrder = right.kind === "creature" ? right.entry.slipOrder : right.block.slipOrder;
    if (leftOrder === rightOrder) {
      if (left.kind === "creature" && right.kind === "creature") {
        return left.creatureIndex - right.creatureIndex;
      }
      if (left.kind === "block" && right.kind === "block") {
        return left.blockIndex - right.blockIndex;
      }
      return left.kind === "creature" ? -1 : 1;
    }
    return leftOrder - rightOrder;
  });

  for (const entry of activeNonChipSlips) {
    if (entry.kind === "creature") {
      slips.push({
        index: slips.length,
        dir: directionName(entry.entry.dir),
        creatureIndex: entry.creatureIndex + 1,
        blockIndex: -1,
        creature: buildCreatureDebugActor(cells, internal.creatures[entry.creatureIndex]!, entry.creatureIndex + 1),
      });
      continue;
    }

    slips.push({
      index: slips.length,
      dir: directionName(entry.block.floorMovementDir),
      creatureIndex: -1,
      blockIndex: entry.blockIndex,
      creature: buildBlockDebugActor(cells, entry.block, entry.blockIndex),
    });
  }

  return slips;
}

export function collectMsActorsFromLayers(layers: ReadonlyArray<{ z: number; cells: EngineMapCell[] }>): EngineState["actors"] {
  const actors: EngineState["actors"] = [];
  for (const layer of layers) {
    for (let pos = 0; pos < layer.cells.length; pos += 1) {
      const cell = layer.cells[pos]!;
      if (isMsCreature(cell.top.id)) {
        actors.push({
          id: msCreatureId(cell.top.id),
          layer: 1,
          dir: directionName(msCreatureDir(cell.top.id)),
          position: projectGamePosition(cell.position),
          state: cell.top.state,
        });
      }
      if (isMsCreature(cell.bottom.id)) {
        actors.push({
          id: msCreatureId(cell.bottom.id),
          layer: 0,
          dir: directionName(msCreatureDir(cell.bottom.id)),
          position: projectGamePosition(cell.position),
          state: cell.bottom.state,
        });
      }
    }
  }
  return actors;
}

export function collectMsActors(cells: EngineMapCell[]): EngineState["actors"] {
  return collectMsActorsFromLayers([{ z: 1, cells }]);
}

export function hashMsCreaturesFromLayers(layers: ReadonlyArray<{ z: number; cells: EngineMapCell[] }>): string {
  let hash = 1469598103934665603n;
  for (const actor of collectMsActorsFromLayers(layers)) {
    hash = hashInt(hash, actor.position.pos);
    if (actor.position.z !== undefined) {
      hash = hashByte(hash, actor.position.z);
    }
    hash = hashByte(hash, actor.layer);
    hash = hashByte(hash, actor.id);
    const dirCode =
      actor.dir === "north"
        ? MS_DIRECTION.north
        : actor.dir === "west"
          ? MS_DIRECTION.west
          : actor.dir === "south"
            ? MS_DIRECTION.south
            : actor.dir === "east"
              ? MS_DIRECTION.east
              : 0;
    hash = hashByte(hash, dirCode);
    hash = hashByte(hash, actor.state);
  }
  return hashHex(hash);
}

export function hashMsCreatures(cells: EngineMapCell[]): string {
  return hashMsCreaturesFromLayers([{ z: 1, cells }]);
}

export function projectMsDebugPhaseSnapshot(
  state: MsGameState,
  cells: EngineMapCell[],
  internal: MsInternalState,
  inventory: EngineState["inventory"],
  currentTime: number,
  soundEffects: number,
  lastMove: EngineState["lastMove"],
  phase: TurnDebugPhaseName,
  chipSlipCarryDir: number = MS_DIRECTION.none,
): GameDebugPhaseSnapshot {
  const activeCreatures = [
    buildChipDebugActor(cells, internal, chipSlipCarryDir),
    ...internal.creatures.map((creature, index) => buildCreatureDebugActor(cells, creature, index + 1)),
  ];
  const blocks = internal.blocks.map((block, index) => buildBlockDebugActor(cells, block, index));
  const slipList = buildSlipList(cells, internal, chipSlipCarryDir);
  const chipFloorTile = floorTile(cells, internal.chipPos);
  const chipFloor = debugFloorState(chipFloorTile, internal.floorMovement, internal.floorMovementDir);
  if (chipSlipCarryDir !== MS_DIRECTION.none && internal.floorMovement === "none") {
    chipFloor.slipDir = directionName(chipSlipCarryDir);
  }

  return {
    phase,
    tick: Math.max(currentTime, 0),
    currentTime,
    replayCursor: state.engine.replay.cursor,
    currentInputCode: internal.currentInput,
    currentInput: createRuntimeCommand(internal.currentInput, currentTime).inputName,
    lastMoveCode: lastMove.code,
    lastMove: lastMove.name,
    chipsNeeded: inventory.chipsNeeded,
    statusFlags: state.engine.statusFlags,
    chipStatus: internal.chipStatus === "outoftime" ? "out-of-time" : internal.chipStatus,
    chipStatusCode: chipStatusCode(internal.chipStatus),
    chipWait: internal.chipWait,
    controllerDir: directionName(internal.controllerDir),
    lastSlipDir: directionName(internal.lastSlipDir),
    goalPos: internal.goalPos,
    completed: internal.completed,
    msccSlippers: slipList.filter((entry) => entry.creatureIndex !== 0).length,
    soundEffects: soundEffects | internal.pendingSoundEffects,
    chipFloor,
    mapHash: mapHash(cells),
    creaturesHash: hashMsCreatures(cells),
    activeCreatures,
    blocks,
    slipList,
    boardFlags: collectBoardFlags(cells),
    map: {
      cells: cloneBoardCells(cells).map((cell) => ({
        ...cell,
        position: projectGamePosition(cell.position),
      })),
    },
  };
}
