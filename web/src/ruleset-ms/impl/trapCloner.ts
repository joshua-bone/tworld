import type { EngineMapCell } from "@game-core/api/model";
import { addBottomTileFlags, topTileId } from "@game-core/impl/board";
import type { MsConnection } from "@ruleset-ms/api/level";
import {
  isMsBlockActorId,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureDir,
  msCreatureId,
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_TILE,
} from "@ruleset-ms/api/tiles";
import {
  msActorClonerCloneBehavior,
  msActorClonerEntryBehavior,
  msActorTrapReleaseStartsMovement,
} from "@ruleset-ms/impl/actorLifecycleQueries";
import { isMsClonerSpecialFloor } from "@ruleset-ms/impl/elements/tiles/specialFloorRegistration";

export interface MsTrapClonerCreatureRef {
  id?: number;
  released: boolean;
}

export interface MsTrapClonerBlockRef {
  id?: number;
  released: boolean;
}

function findMsConnectionTarget(
  connections: readonly MsConnection[],
  buttonPos: number,
  buttonZ = 1,
): number | null {
  return connections.find(
    (connection) =>
      connection.from === buttonPos &&
      (connection.fromZ ?? 1) === buttonZ &&
      (connection.toZ ?? 1) === buttonZ,
  )?.to ?? null;
}

export function findMsClonerTarget(
  cloners: readonly MsConnection[],
  buttonPos: number,
  buttonZ = 1,
): number | null {
  return findMsConnectionTarget(cloners, buttonPos, buttonZ);
}

export function findMsTrapTarget(
  traps: readonly MsConnection[],
  buttonPos: number,
  buttonZ = 1,
): number | null {
  return findMsConnectionTarget(traps, buttonPos, buttonZ);
}

function isMsTrapButtonDown(cells: EngineMapCell[], pos: number): boolean {
  return pos >= 0 && pos < cells.length && topTileId(cells, pos) !== MS_TILE.Button_Brown;
}

export function hasMsTrapConnection(
  traps: readonly MsConnection[],
  pos: number,
  z = 1,
): boolean {
  return traps.some((connection) => connection.to === pos && (connection.toZ ?? 1) === z);
}

export function isMsTrapOpen(args: {
  cells: EngineMapCell[];
  traps: readonly MsConnection[];
  trapPos: number;
  skipButtonPos: number;
  z?: number;
}): boolean {
  const {
    cells,
    traps,
    trapPos,
    skipButtonPos,
    z = 1,
  } = args;
  return traps.some(
    (connection) =>
      connection.to === trapPos &&
      connection.from !== skipButtonPos &&
      (connection.fromZ ?? 1) === z &&
      (connection.toZ ?? 1) === z &&
      isMsTrapButtonDown(cells, connection.from),
  );
}

export function springMsTrap(args: {
  cells: EngineMapCell[];
  traps: readonly MsConnection[];
  buttonPos: number;
  buttonZ?: number;
  chipPos: number;
  chipZ?: number;
  releaseChip(): void;
  findTrackedBlock(pos: number, z: number): MsTrapClonerBlockRef | undefined;
  releaseStaticBlock(pos: number): MsTrapClonerBlockRef;
  findCreature(pos: number, z: number): MsTrapClonerCreatureRef | undefined;
}): void {
  const {
    cells,
    traps,
    buttonPos,
    buttonZ = 1,
    chipPos,
    chipZ,
    releaseChip,
    findTrackedBlock,
    releaseStaticBlock,
    findCreature,
  } = args;
  const trapPos = findMsTrapTarget(traps, buttonPos, buttonZ);
  if (trapPos === null || trapPos < 0 || trapPos >= cells.length) {
    return;
  }

  if (trapPos === chipPos && (chipZ ?? 1) === buttonZ) {
    if (msActorTrapReleaseStartsMovement(MS_TILE.Chip)) {
      releaseChip();
    }
  }

  const trappedBlock = findTrackedBlock(trapPos, buttonZ);
  if (trappedBlock && msActorTrapReleaseStartsMovement(trappedBlock.id ?? MS_TILE.Block)) {
    trappedBlock.released = true;
  } else if (isMsStaticBlockTile(cells[trapPos]?.top.id ?? MS_TILE.Empty)) {
    const releasedBlock = releaseStaticBlock(trapPos);
    if (msActorTrapReleaseStartsMovement(releasedBlock.id ?? MS_TILE.Block)) {
      releasedBlock.released = true;
    }
  }

  const trappedCreature = findCreature(trapPos, buttonZ);
  if (trappedCreature && msActorTrapReleaseStartsMovement(trappedCreature.id ?? MS_TILE.Empty)) {
    trappedCreature.released = true;
  }
}

export function activateMsCloner(args: {
  cells: EngineMapCell[];
  cloners: readonly MsConnection[];
  buttonPos: number;
  buttonZ?: number;
  moveBlockSource(sourcePos: number, sourceDir: number, sourceIsCloneMachine: boolean): void;
  canCloneCreatureMove(sourcePos: number, sourceId: number, sourceDir: number): boolean;
  spawnCreatureClone(sourcePos: number, sourceId: number, sourceDir: number, z: number, cloneFamilyRuntime: boolean): void;
}): void {
  const {
    cells,
    cloners,
    buttonPos,
    buttonZ = 1,
    moveBlockSource,
    canCloneCreatureMove,
    spawnCreatureClone,
  } = args;
  const sourcePos = findMsClonerTarget(cloners, buttonPos, buttonZ);
  if (sourcePos === null) {
    return;
  }

  const sourceCell = cells[sourcePos];
  if (!sourceCell || !isMsCreature(sourceCell.top.id)) {
    return;
  }

  const sourceId = msCreatureId(sourceCell.top.id);
  if (sourceId === MS_TILE.Chip) {
    return;
  }
  const clonerEntry = msActorClonerEntryBehavior(sourceId);
  const clonerClone = msActorClonerCloneBehavior(sourceId);
  if (clonerEntry.entryBehavior === "none" || !clonerClone.exitStartsMovement) {
    return;
  }

  const sourceDir = msCreatureDir(sourceCell.top.id);
  if (isMsBlockActorId(sourceId)) {
    const sourceIsCloneMachine = isMsClonerSpecialFloor(sourceCell.bottom.id);
    if (sourceIsCloneMachine && (sourceCell.bottom.state & MS_FLOOR_STATE.Cloning) !== 0) {
      return;
    }
    if (sourceDir !== MS_DIRECTION.none) {
      moveBlockSource(sourcePos, sourceDir, sourceIsCloneMachine);
    }
    return;
  }

  if (!isMsClonerSpecialFloor(sourceCell.bottom.id) || (sourceCell.bottom.state & MS_FLOOR_STATE.Cloning) !== 0) {
    return;
  }

  if (!canCloneCreatureMove(sourcePos, sourceId, sourceDir)) {
    return;
  }

  addBottomTileFlags(cells, sourcePos, MS_FLOOR_STATE.Cloning);
  spawnCreatureClone(sourcePos, sourceId, sourceDir, buttonZ, clonerClone.cloneFamilyRuntime);
}
