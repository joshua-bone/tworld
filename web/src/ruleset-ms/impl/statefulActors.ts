import {
  cloneBowlingBallState,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import { type StatefulActorInventoryEntry } from "@game-core/impl/statefulActorLocalInventory";
import {
  createActorIdStatefulActorRuntimeFamilyAdapter,
  createStatefulActorRuntimeRegistry,
  type StatefulActorPortableBacking,
  type StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
import type { MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";
import {
  createMsBowlingBallInitialRuntimeState,
  MS_BOWLING_BALL_ACTOR_FAMILY,
  MS_BOWLING_BALL_ACTOR_ID,
} from "@ruleset-ms/impl/elements/actors/families/bowlingBall";

export type MsBowlingBallRuntimeState = BowlingBallState;

export type MsStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  typeof MS_BOWLING_BALL_ACTOR_FAMILY,
  MsBowlingBallRuntimeState,
  MsPortableItemFamily
>;

const MS_STATEFUL_ACTOR_REGISTRY = createStatefulActorRuntimeRegistry<
  MsStatefulActorRuntimeEntry,
  { actorId: number },
  MsPortableItemFamily
>([
  createActorIdStatefulActorRuntimeFamilyAdapter<MsStatefulActorRuntimeEntry, MsPortableItemFamily>({
    kind: MS_BOWLING_BALL_ACTOR_FAMILY,
    actorId: MS_BOWLING_BALL_ACTOR_ID,
    createEntry(actorSerial) {
      return {
        actorSerial,
        kind: MS_BOWLING_BALL_ACTOR_FAMILY,
        portableBacking: null,
        state: createMsBowlingBallInitialRuntimeState(),
      };
    },
  }),
]);

export function createMsInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): MsStatefulActorRuntimeEntry | null {
  return MS_STATEFUL_ACTOR_REGISTRY.createInitial(actorSerial, { actorId });
}

export function seedMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  MS_STATEFUL_ACTOR_REGISTRY.seed(store, actorSerial, { actorId });
}

export function findMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return MS_STATEFUL_ACTOR_REGISTRY.find(store, actorSerial);
}

export function restoreMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  entry: MsStatefulActorRuntimeEntry,
): MsStatefulActorRuntimeEntry {
  return MS_STATEFUL_ACTOR_REGISTRY.restore(store, entry);
}

export function cloneMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return MS_STATEFUL_ACTOR_REGISTRY.clone(store, sourceActorSerial, targetActorSerial);
}

export function cloneMsStatefulActorRuntimeForCloner(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return cloneMsStatefulActorRuntime(store, sourceActorSerial, targetActorSerial);
}

export function destroyMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): void {
  MS_STATEFUL_ACTOR_REGISTRY.destroy(store, actorSerial);
}

export function attachMsStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableBacking: StatefulActorPortableBacking<MsPortableItemFamily>,
): MsStatefulActorRuntimeEntry | undefined {
  return MS_STATEFUL_ACTOR_REGISTRY.attachPortableBacking(store, actorSerial, portableBacking);
}

export function spawnMsBowlingBallStatefulActorFromPortable(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableItemSerial: number,
  state: BowlingBallState,
): MsStatefulActorRuntimeEntry {
  return restoreMsStatefulActorRuntime(store, {
    actorSerial,
    kind: MS_BOWLING_BALL_ACTOR_FAMILY,
    portableBacking: {
      family: MS_BOWLING_BALL_ACTOR_FAMILY,
      portableItemSerial,
    },
    state: cloneBowlingBallState(state),
  });
}

export function detachMsStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return MS_STATEFUL_ACTOR_REGISTRY.detachPortableBacking(store, actorSerial);
}
