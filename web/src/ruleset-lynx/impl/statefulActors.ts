import {
  cloneBowlingBallState,
  createMovingBowlingBallState,
  type BowlingBallState,
} from "@game-core/impl/bowlingBall";
import { type StatefulActorInventoryEntry } from "@game-core/impl/statefulActorLocalInventory";
import {
  createStatefulActorRuntimeFamilyAdapter,
  findStatefulActorRuntime,
  forkStatefulActorRuntime,
  removeStatefulActorRuntime,
  setStatefulActorRuntime,
  type StatefulActorPortableBacking,
  type StatefulActorRuntimeFamilyAdapter,
  type StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";

export type LynxBowlingBallRuntimeState = BowlingBallState;

export type LynxStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  "bowling-ball",
  LynxBowlingBallRuntimeState,
  LynxPortableItemFamily
>;

type LynxStatefulActorSpawnContext = { actorId: number };

const LYNX_BOWLING_BALL_RUNTIME_ADAPTER = createStatefulActorRuntimeFamilyAdapter<
  LynxStatefulActorRuntimeEntry,
  LynxStatefulActorSpawnContext,
  LynxPortableItemFamily
>({
  kind: "bowling-ball",
  createSpawnEntry(actorSerial, context) {
    if (context.actorId !== MS_TILE.BowlingBall) {
      return null;
    }

    return {
      actorSerial,
      kind: "bowling-ball",
      portableBacking: null,
      state: createMovingBowlingBallState(),
    };
  },
});

function lynxStatefulActorAdapterForKind(
  kind: LynxStatefulActorRuntimeEntry["kind"],
): StatefulActorRuntimeFamilyAdapter<LynxStatefulActorRuntimeEntry, LynxStatefulActorSpawnContext, LynxPortableItemFamily> | null {
  return kind === "bowling-ball" ? LYNX_BOWLING_BALL_RUNTIME_ADAPTER : null;
}

function lynxStatefulActorAdapterForEntry(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): StatefulActorRuntimeFamilyAdapter<LynxStatefulActorRuntimeEntry, LynxStatefulActorSpawnContext, LynxPortableItemFamily> | null {
  const entry = findStatefulActorRuntime(store, actorSerial);
  return entry ? lynxStatefulActorAdapterForKind(entry.kind) : null;
}

export function createLynxInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): LynxStatefulActorRuntimeEntry | null {
  return LYNX_BOWLING_BALL_RUNTIME_ADAPTER.spawn(
    { byActorSerial: new Map() },
    actorSerial,
    { actorId },
  );
}

export function seedLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  LYNX_BOWLING_BALL_RUNTIME_ADAPTER.spawn(store, actorSerial, { actorId });
}

export function findLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return findStatefulActorRuntime(store, actorSerial);
}

export function restoreLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  entry: LynxStatefulActorRuntimeEntry,
): LynxStatefulActorRuntimeEntry {
  const adapter = lynxStatefulActorAdapterForKind(entry.kind);
  return adapter ? adapter.restore(store, entry) : setStatefulActorRuntime(store, entry);
}

export function cloneLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  const adapter = lynxStatefulActorAdapterForEntry(store, sourceActorSerial);
  return adapter ? adapter.clone(store, sourceActorSerial, targetActorSerial) : forkStatefulActorRuntime(store, sourceActorSerial, targetActorSerial);
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
  const adapter = lynxStatefulActorAdapterForEntry(store, actorSerial);
  if (adapter) {
    adapter.destroy(store, actorSerial);
    return;
  }
  removeStatefulActorRuntime(store, actorSerial);
}

export function attachLynxStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableBacking: StatefulActorPortableBacking<LynxPortableItemFamily>,
): LynxStatefulActorRuntimeEntry | undefined {
  const adapter = lynxStatefulActorAdapterForEntry(store, actorSerial);
  return adapter?.attachPortableBacking(store, actorSerial, portableBacking);
}

export function spawnLynxBowlingBallStatefulActorFromPortable(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableItemSerial: number,
  state: BowlingBallState,
): LynxStatefulActorRuntimeEntry {
  return restoreLynxStatefulActorRuntime(store, {
    actorSerial,
    kind: "bowling-ball",
    portableBacking: {
      family: "bowling-ball",
      portableItemSerial,
    },
    state: cloneBowlingBallState(state),
  });
}

export function detachLynxStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  const adapter = lynxStatefulActorAdapterForEntry(store, actorSerial);
  return adapter?.detachPortableBacking(store, actorSerial);
}
