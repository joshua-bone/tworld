import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { promoteBottomTile, addTopTileFlags } from "@game-core/impl/board";
import { cloneBowlingBallState, setBowlingBallMode } from "@game-core/impl/bowlingBall";
import { movementDidSucceed, type MovementAttemptResult } from "@game-core/api/movementOutcomes";
import type { StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import { lynxTileForcedFloorKind } from "@ruleset-lynx/impl/catalog";
import {
  activateLynxPortableTool,
  findLynxPortableToolAttachedToActor,
  type LynxPortableItem,
  type LynxPortableToolStateStore,
} from "@ruleset-lynx/impl/portableItems";
import {
  attachLynxStatefulActorPortableBacking,
  spawnLynxBowlingBallStatefulActorFromPortable,
  type LynxStatefulActorRuntimeEntry,
} from "@ruleset-lynx/impl/statefulActors";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxRuntimeActor } from "@ruleset-lynx/impl/engine";

export interface LynxBowlingBallRuntimeStore {
  portableTools: LynxPortableToolStateStore;
  statefulActors: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>;
  nextActorSerial: number;
}

export interface LynxBowlingBallThrowContext {
  state: EngineState;
  actors: LynxRuntimeActor[];
  runtime: LynxBowlingBallRuntimeStore;
  chipPos: number;
  chipZ: number;
  carried: LynxPortableItem;
  dir: number;
  canStartMovement(
    actor: LynxRuntimeActor,
    dir: number,
    localInventory: NonNullable<LynxPortableItem["bowlingBallState"]>["localInventory"] | null,
  ): boolean;
  startMovement(actor: LynxRuntimeActor, dir: number): MovementAttemptResult;
  allocateActorSlot(actor: LynxRuntimeActor): LynxRuntimeActor;
}

export interface LynxMappedBowlingBallActivationContext {
  state: EngineState;
  actors: LynxRuntimeActor[];
  runtime: LynxBowlingBallRuntimeStore;
  cellsForZ(z: number): EngineMapCell[];
  slideDirection(floor: number): number;
  allocateActorSlot(actor: LynxRuntimeActor): LynxRuntimeActor;
}

export interface LynxPortableBackedBowlingBallSeedContext {
  actors: LynxRuntimeActor[];
  runtime: LynxBowlingBallRuntimeStore;
  runtimeEntry(actorSerial: number): LynxStatefulActorRuntimeEntry | null;
}

function createLynxBowlingBallActor(serial: number, pos: number, z: number, dir: number): LynxRuntimeActor {
  return {
    serial,
    id: MS_TILE.BowlingBall,
    pos,
    z,
    dir,
    intentDir: 0,
    forcedDir: 0,
    teleported: false,
    moving: 0,
    frame: 0,
    moveKind: "planar",
    ignoreIceFromAir: false,
    hidden: false,
    pushed: false,
    deferPush: false,
    deferPushArmed: false,
    reversePending: false,
    dormant: false,
    animationReserved: false,
  };
}

function registerLynxSpawnedBowlingBall(
  runtime: LynxBowlingBallRuntimeStore,
  portableItemSerial: number,
  actorSerial: number,
  state: NonNullable<LynxPortableItem["bowlingBallState"]>,
): void {
  runtime.nextActorSerial = actorSerial + 1;
  spawnLynxBowlingBallStatefulActorFromPortable(
    runtime.statefulActors,
    actorSerial,
    portableItemSerial,
    state,
  );
}

export function tryActivateLynxPortableBowlingBallThrow(context: LynxBowlingBallThrowContext): boolean {
  const { carried, dir, runtime } = context;
  if (!carried.bowlingBallState) {
    return false;
  }

  const probeActor = createLynxBowlingBallActor(-1, context.chipPos, context.chipZ, dir);
  if (!context.canStartMovement(probeActor, dir, carried.bowlingBallState.localInventory)) {
    return false;
  }

  setBowlingBallMode(carried.bowlingBallState, "moving", dir);
  const actorSerial = runtime.nextActorSerial;
  if (!activateLynxPortableTool(runtime.portableTools, context.state.inventory, carried.serial, actorSerial)) {
    setBowlingBallMode(carried.bowlingBallState, "still", dir);
    return false;
  }

  registerLynxSpawnedBowlingBall(runtime, carried.serial, actorSerial, carried.bowlingBallState);
  const actor = context.allocateActorSlot(createLynxBowlingBallActor(actorSerial, context.chipPos, context.chipZ, dir));
  if (!movementDidSucceed(context.startMovement(actor, dir))) {
    return false;
  }
  return true;
}

export function activateMappedLynxBowlingBallsOnForceFloors(
  context: LynxMappedBowlingBallActivationContext,
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

    const cells = context.cellsForZ(item.state.z);
    const cell = cells[item.state.pos];
    if (!cell || cell.top.id !== item.tileId || lynxTileForcedFloorKind(cell.bottom.id) !== "slide") {
      continue;
    }

    const dir = context.slideDirection(cell.bottom.id);
    if (dir === MS_DIRECTION.none) {
      continue;
    }

    const pos = item.state.pos;
    const z = item.state.z;
    const actorSerial = context.runtime.nextActorSerial;
    setBowlingBallMode(item.bowlingBallState, "moving", dir);
    if (!activateLynxPortableTool(context.runtime.portableTools, context.state.inventory, item.serial, actorSerial)) {
      setBowlingBallMode(item.bowlingBallState, "still", dir);
      continue;
    }

    registerLynxSpawnedBowlingBall(context.runtime, item.serial, actorSerial, item.bowlingBallState);
    promoteBottomTile(cells, pos, MS_TILE.Empty);
    addTopTileFlags(cells, pos, LYNX_CELL_FLAG.Claimed);
    context.allocateActorSlot(createLynxBowlingBallActor(actorSerial, pos, z, dir));
  }
}

export function seedLynxPortableBackedBowlingBallActors(
  context: LynxPortableBackedBowlingBallSeedContext,
): void {
  for (const actor of context.actors) {
    if (actor.hidden || actor.id !== MS_TILE.BowlingBall) {
      continue;
    }

    const runtimeEntry = context.runtimeEntry(actor.serial);
    if (
      runtimeEntry?.kind !== "bowling-ball" ||
      runtimeEntry.portableBacking?.portableItemSerial !== undefined ||
      findLynxPortableToolAttachedToActor(context.runtime.portableTools, actor.serial)
    ) {
      continue;
    }

    const portableItemSerial = context.runtime.portableTools.nextPortableItemSerial;
    context.runtime.portableTools.portableItems.push({
      serial: portableItemSerial,
      family: "bowling-ball",
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools",
      bowlingBallState: cloneBowlingBallState(runtimeEntry.state),
      state: {
        mode: "attached",
        attachmentKind: "actor",
        attachmentId: actor.serial,
      },
    });
    context.runtime.portableTools.nextPortableItemSerial += 1;
    attachLynxStatefulActorPortableBacking(context.runtime.statefulActors, actor.serial, {
      family: "bowling-ball",
      portableItemSerial,
    });
  }
}
