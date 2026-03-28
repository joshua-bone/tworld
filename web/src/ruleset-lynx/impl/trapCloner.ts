import type { EngineState } from "@game-core/api/model";
import { movementDidSucceed, type MovementAttemptResult } from "@game-core/api/movementOutcomes";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import { collectLevelConnections } from "@ruleset-ms/api/level";
import { topTileIdOr } from "@game-core/impl/board";
import { lynxTileHasTag } from "@ruleset-lynx/impl/catalog";
import { queryLynxOccupancyTarget, type LynxOccupancyPortableItemRef } from "@ruleset-lynx/impl/occupancy";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxTrapClonerActor {
  serial: number;
  id: number;
  pos: number;
  z?: number;
  dir: number;
  moving: number;
  hidden: boolean;
}

export interface LynxTrapHeldActor {
  id: number;
  pos: number;
  z?: number;
  moving: number;
  hidden: boolean;
}

export interface LynxTrapClonerContext<TActor extends LynxTrapClonerActor> {
  state: EngineState;
  level: LynxLevel;
  actors: TActor[];
  activeLayerZ(): number;
  withLayer<T>(z: number, run: () => T): T;
  findVisibleActorAt(pos: number, z: number): TActor | null;
  buildCloneSnapshot(sourceActor: TActor, z: number): TActor;
  allocateCloneSlot(snapshot: TActor): TActor;
  syncCloneRuntime(sourceActor: TActor, clone: TActor): void;
  startCreatureMovement(actor: TActor, dir: number, releasing: boolean): MovementAttemptResult;
  advanceCreature(actor: TActor, currentTime: number): void;
  currentTime: number;
}

function findLynxConnectionTarget(
  level: LynxLevel,
  kind: "traps" | "cloners",
  buttonPos: number,
  z = 1,
): number | null {
  return collectLevelConnections(level, kind).find(
    (connection) => connection.from === buttonPos && (connection.fromZ ?? 1) === z && (connection.toZ ?? 1) === z,
  )?.to ?? null;
}

export function findLynxClonerTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return findLynxConnectionTarget(level, "cloners", buttonPos, z);
}

export function findLynxTrapTarget(level: LynxLevel, buttonPos: number, z = 1): number | null {
  return findLynxConnectionTarget(level, "traps", buttonPos, z);
}

export function isLynxTrapHeldOpen<TActor extends LynxTrapHeldActor>(
  state: EngineState,
  level: LynxLevel,
  actors: TActor[],
  portableItems: readonly LynxOccupancyPortableItemRef[],
  trapPos: number,
  z = 1,
): boolean {
  return collectLevelConnections(level, "traps").some((connection) => {
    const buttonZ = connection.fromZ ?? connection.toZ ?? 1;
    const trapZ = connection.toZ ?? connection.fromZ ?? 1;
    if (connection.to !== trapPos || buttonZ !== z || trapZ !== z) {
      return false;
    }

    const buttonCell = state.map.cells[connection.from];
    if (!buttonCell) {
      return false;
    }

    const buttonOccupancy = queryLynxOccupancyTarget(
      {
        cells: state.map.cells,
        actors,
        portableItems,
      },
      connection.from,
      z,
    );
    if (buttonOccupancy.kind === "portable-item") {
      return true;
    }

    if (buttonCell.top.id !== MS_TILE.Button_Brown) {
      return false;
    }

    const occupant = buttonOccupancy.runtimeActor;
    return buttonOccupancy.kind === "runtime-actor" && occupant !== undefined && occupant.moving <= 0;
  });
}

export function activateLynxCloner<TActor extends LynxTrapClonerActor>(
  context: LynxTrapClonerContext<TActor>,
  buttonPos: number,
): boolean {
  const buttonZ = context.activeLayerZ();
  return context.withLayer(buttonZ, () => {
    const sourcePos = findLynxClonerTarget(context.level, buttonPos, buttonZ);
    if (sourcePos === null || sourcePos < 0 || sourcePos >= context.state.map.cells.length) {
      return false;
    }

    if (!lynxTileHasTag(context.state.map.cells[sourcePos]?.top.id ?? MS_TILE.Empty, "cloner")) {
      return false;
    }

    const sourceActor = context.findVisibleActorAt(sourcePos, buttonZ);
    if (!sourceActor || sourceActor.dir === 0) {
      return false;
    }

    const sourceSnapshot = context.buildCloneSnapshot(sourceActor, buttonZ);
    const clone = context.allocateCloneSlot(sourceSnapshot);

    if (!movementDidSucceed(context.startCreatureMovement(sourceActor, sourceActor.dir, true))) {
      return false;
    }

    Object.assign(clone, {
      ...sourceSnapshot,
      hidden: false,
    });
    context.syncCloneRuntime(sourceActor, clone);
    context.advanceCreature(sourceActor, context.currentTime + 1);
    return true;
  });
}

export function springLynxTrap<TActor extends LynxTrapClonerActor>(
  context: LynxTrapClonerContext<TActor>,
  buttonPos: number,
): boolean {
  const buttonZ = context.activeLayerZ();
  return context.withLayer(buttonZ, () => {
    const sourcePos = findLynxTrapTarget(context.level, buttonPos, buttonZ);
    if (sourcePos === null || sourcePos < 0 || sourcePos >= context.state.map.cells.length) {
      return false;
    }
    if (!lynxTileHasTag(topTileIdOr(context.state.map.cells, sourcePos, MS_TILE.Empty), "trap")) {
      return false;
    }

    const sourceActor = context.findVisibleActorAt(sourcePos, buttonZ);
    if (!sourceActor || sourceActor.dir === 0) {
      return false;
    }

    if (
      sourceActor.moving <= 0 &&
      !movementDidSucceed(context.startCreatureMovement(sourceActor, sourceActor.dir, true))
    ) {
      return false;
    }

    context.advanceCreature(sourceActor, context.currentTime + 1);
    return true;
  });
}
