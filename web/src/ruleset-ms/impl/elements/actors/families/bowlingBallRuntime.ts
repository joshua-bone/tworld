import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { cloneBoardCells } from "@game-core/impl/board";
import { advanceToCell } from "@game-core/impl/grid";
import { setBowlingBallMode } from "@game-core/impl/bowlingBall";
import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import {
  activateMsPortableTool,
  type MsPortableItem,
  type MsPortableToolStateStore,
} from "@ruleset-ms/impl/portableItems";
import {
  spawnMsBowlingBallStatefulActorFromPortable,
  type MsStatefulActorRuntimeEntry,
} from "@ruleset-ms/impl/statefulActors";
import {
  MS_DIRECTION,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import { msTileForcedFloorKind } from "@ruleset-ms/impl/catalog";
import type { MsTrackedCreature } from "@ruleset-ms/impl/engine";

export interface MsBowlingBallRuntimeStore {
  chipPos: number;
  chipZ?: number;
  chipReleased: boolean;
  nextCreatureSerial: number;
  creatures: MsTrackedCreature[];
  creatureIndexBySerial: Map<number, number>;
  portableTools: MsPortableToolStateStore;
  statefulActors: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>;
}

interface MsBowlingBallCreatureSeed {
  serial: number;
  pos: number;
  z: number;
  dir: number;
  released: boolean;
}

export interface MsBowlingBallThrowContext {
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>;
  fallbackCells: EngineMapCell[];
  runtime: MsBowlingBallRuntimeStore;
  inventory: EngineState["inventory"];
  carried: MsPortableItem;
  dir: number;
  queryTargetOccupancy(cells: EngineMapCell[], pos: number, z: number): { kind: string };
  canStartMovement(
    cells: EngineMapCell[],
    creature: MsTrackedCreature,
    dir: number,
    inventory: EngineState["inventory"],
    localInventory: NonNullable<MsPortableItem["bowlingBallState"]>["localInventory"] | null,
  ): boolean;
  resolvePreMoveCollision(
    workingCells: EngineMapCell[],
    cells: EngineMapCell[],
    creature: MsTrackedCreature,
    targetPos: number,
    dir: number,
  ): void;
  settleSpawnedLanding(
    cells: EngineMapCell[],
    creature: MsTrackedCreature,
    dir: number,
    targetTop: number,
    targetTopState: number,
    targetBottom: number,
    targetBottomState: number,
  ): void;
  pushTile(cells: EngineMapCell[], pos: number, tile: EngineMapCell["top"]): void;
}

export interface MsMappedBowlingBallActivationContext {
  layerCellsByZ: ReadonlyMap<number, EngineMapCell[]>;
  runtime: MsBowlingBallRuntimeStore;
  inventory: EngineState["inventory"];
  slideDirection(floor: number): number;
  syncCreatureFloorMovement(cells: EngineMapCell[], creature: MsTrackedCreature): void;
}

function createMsBowlingBallCreature(seed: MsBowlingBallCreatureSeed): MsTrackedCreature {
  return {
    serial: seed.serial,
    id: MS_TILE.BowlingBall,
    dir: seed.dir,
    tdir: MS_DIRECTION.none,
    pos: seed.pos,
    z: seed.z,
    hidden: false,
    moving: 0,
    frame: 0,
    cloning: false,
    released: seed.released,
    turning: false,
    hasMoved: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    sliding: false,
  };
}

function registerMsSpawnedBowlingBall(
  runtime: MsBowlingBallRuntimeStore,
  portableItemSerial: number,
  actorSerial: number,
  pos: number,
  z: number,
  dir: number,
  released: boolean,
  bowlingBallState: NonNullable<MsPortableItem["bowlingBallState"]>,
): MsTrackedCreature {
  runtime.nextCreatureSerial = actorSerial + 1;
  const creature = createMsBowlingBallCreature({
    serial: actorSerial,
    pos,
    z,
    dir,
    released,
  });
  runtime.creatures.push(creature);
  runtime.creatureIndexBySerial.set(actorSerial, runtime.creatures.length - 1);
  spawnMsBowlingBallStatefulActorFromPortable(
    runtime.statefulActors,
    actorSerial,
    portableItemSerial,
    bowlingBallState,
  );
  return creature;
}

export function tryActivateMsPortableBowlingBallThrow(context: MsBowlingBallThrowContext): boolean {
  const { carried, dir, runtime } = context;
  const z = runtime.chipZ ?? 1;
  const cells = context.layerCellsByZ.get(z) ?? context.fallbackCells;
  const targetStep = advanceToCell(cells, runtime.chipPos, dir, MS_GRID_WIDTH, MS_GRID_HEIGHT);
  if (!targetStep || !carried.bowlingBallState) {
    return false;
  }

  const probeCreature = createMsBowlingBallCreature({
    serial: -1,
    pos: runtime.chipPos,
    z,
    dir,
    released: runtime.chipReleased,
  });
  if (
    !context.canStartMovement(
      cells,
      probeCreature,
      dir,
      context.inventory,
      carried.bowlingBallState.localInventory,
    )
  ) {
    return false;
  }

  const targetOccupancy = context.queryTargetOccupancy(cells, targetStep.pos, z);
  const targetTop = cells[targetStep.pos]!.top.id;
  const targetTopState = cells[targetStep.pos]!.top.state;
  const targetBottom = cells[targetStep.pos]!.bottom.id;
  const targetBottomState = cells[targetStep.pos]!.bottom.state;

  setBowlingBallMode(carried.bowlingBallState, "moving", dir);
  const actorSerial = runtime.nextCreatureSerial;
  if (!activateMsPortableTool(runtime.portableTools, context.inventory, carried.serial, actorSerial)) {
    setBowlingBallMode(carried.bowlingBallState, "still", dir);
    return false;
  }

  const creature = registerMsSpawnedBowlingBall(
    runtime,
    carried.serial,
    actorSerial,
    runtime.chipPos,
    z,
    dir,
    false,
    carried.bowlingBallState,
  );
  if (targetOccupancy.kind !== "empty") {
    context.resolvePreMoveCollision(cloneBoardCells(cells), cells, creature, targetStep.pos, dir);
    return true;
  }

  creature.pos = targetStep.pos;
  context.pushTile(cells, targetStep.pos, { id: MS_TILE.Empty, state: 0 });
  cells[targetStep.pos]!.top = {
    id: msCreatureTile(MS_TILE.BowlingBall, dir),
    state: 0,
  };
  context.settleSpawnedLanding(
    cells,
    creature,
    dir,
    targetTop,
    targetTopState,
    targetBottom,
    targetBottomState,
  );
  return true;
}

export function activateMsMappedBowlingBallsOnForceFloors(
  context: MsMappedBowlingBallActivationContext,
): void {
  for (const item of context.runtime.portableTools.portableItems) {
    if (
      item.family !== "bowling-ball" ||
      item.state.mode !== "map" ||
      !item.bowlingBallState ||
      item.bowlingBallState.mode !== "still"
    ) {
      continue;
    }

    const cells = context.layerCellsByZ.get(item.state.z);
    const cell = cells?.[item.state.pos];
    if (!cell || cell.top.id !== item.tileId || msTileForcedFloorKind(cell.bottom.id) !== "slide") {
      continue;
    }

    const dir = context.slideDirection(cell.bottom.id);
    if (dir === MS_DIRECTION.none) {
      continue;
    }

    const pos = item.state.pos;
    const z = item.state.z;
    setBowlingBallMode(item.bowlingBallState, "moving", dir);
    const actorSerial = context.runtime.nextCreatureSerial;
    if (!activateMsPortableTool(context.runtime.portableTools, context.inventory, item.serial, actorSerial)) {
      setBowlingBallMode(item.bowlingBallState, "still", dir);
      continue;
    }

    const creature = registerMsSpawnedBowlingBall(
      context.runtime,
      item.serial,
      actorSerial,
      pos,
      z,
      dir,
      false,
      item.bowlingBallState,
    );
    cells[pos]!.top = {
      id: msCreatureTile(MS_TILE.BowlingBall, dir),
      state: 0,
    };
    context.syncCreatureFloorMovement(cells, creature);
  }
}
