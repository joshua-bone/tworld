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
import type { LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import {
  createLynxBowlingBallInitialRuntimeState,
  LYNX_BOWLING_BALL_ACTOR_FAMILY,
  LYNX_BOWLING_BALL_ACTOR_ID,
} from "@ruleset-lynx/impl/elements/actors/families/bowlingBall";

export type LynxBowlingBallRuntimeState = BowlingBallState;

export type LynxStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  typeof LYNX_BOWLING_BALL_ACTOR_FAMILY,
  LynxBowlingBallRuntimeState,
  LynxPortableItemFamily
>;

const LYNX_STATEFUL_ACTOR_REGISTRY = createStatefulActorRuntimeRegistry<
  LynxStatefulActorRuntimeEntry,
  { actorId: number },
  LynxPortableItemFamily
>([
  createActorIdStatefulActorRuntimeFamilyAdapter<LynxStatefulActorRuntimeEntry, LynxPortableItemFamily>({
    kind: LYNX_BOWLING_BALL_ACTOR_FAMILY,
    actorId: LYNX_BOWLING_BALL_ACTOR_ID,
    createEntry(actorSerial) {
      return {
        actorSerial,
        kind: LYNX_BOWLING_BALL_ACTOR_FAMILY,
        portableBacking: null,
        state: createLynxBowlingBallInitialRuntimeState(),
      };
    },
  }),
]);

export function createLynxInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): LynxStatefulActorRuntimeEntry | null {
  return LYNX_STATEFUL_ACTOR_REGISTRY.createInitial(actorSerial, { actorId });
}

export function seedLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  LYNX_STATEFUL_ACTOR_REGISTRY.seed(store, actorSerial, { actorId });
}

export function findLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return LYNX_STATEFUL_ACTOR_REGISTRY.find(store, actorSerial);
}

export function restoreLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  entry: LynxStatefulActorRuntimeEntry,
): LynxStatefulActorRuntimeEntry {
  return LYNX_STATEFUL_ACTOR_REGISTRY.restore(store, entry);
}

export function cloneLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return LYNX_STATEFUL_ACTOR_REGISTRY.clone(store, sourceActorSerial, targetActorSerial);
}

export function cloneLynxStatefulActorRuntimeForCloner(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return cloneLynxStatefulActorRuntime(store, sourceActorSerial, targetActorSerial);
}

export function destroyLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): void {
  LYNX_STATEFUL_ACTOR_REGISTRY.destroy(store, actorSerial);
}

export function attachLynxStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableBacking: StatefulActorPortableBacking<LynxPortableItemFamily>,
): LynxStatefulActorRuntimeEntry | undefined {
  return LYNX_STATEFUL_ACTOR_REGISTRY.attachPortableBacking(store, actorSerial, portableBacking);
}

export function spawnLynxBowlingBallStatefulActorFromPortable(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableItemSerial: number,
  state: BowlingBallState,
): LynxStatefulActorRuntimeEntry {
  return restoreLynxStatefulActorRuntime(store, {
    actorSerial,
    kind: LYNX_BOWLING_BALL_ACTOR_FAMILY,
    portableBacking: {
      family: LYNX_BOWLING_BALL_ACTOR_FAMILY,
      portableItemSerial,
    },
    state: cloneBowlingBallState(state),
  });
}

export function detachLynxStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return LYNX_STATEFUL_ACTOR_REGISTRY.detachPortableBacking(store, actorSerial);
}
