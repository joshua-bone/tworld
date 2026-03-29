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
import type { MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";

export type MsBowlingBallRuntimeState = BowlingBallState;

export type MsStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  "bowling-ball",
  MsBowlingBallRuntimeState,
  MsPortableItemFamily
>;

type MsStatefulActorSpawnContext = { actorId: number };

const MS_BOWLING_BALL_RUNTIME_ADAPTER = createStatefulActorRuntimeFamilyAdapter<
  MsStatefulActorRuntimeEntry,
  MsStatefulActorSpawnContext,
  MsPortableItemFamily
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

function msStatefulActorAdapterForKind(
  kind: MsStatefulActorRuntimeEntry["kind"],
): StatefulActorRuntimeFamilyAdapter<MsStatefulActorRuntimeEntry, MsStatefulActorSpawnContext, MsPortableItemFamily> | null {
  return kind === "bowling-ball" ? MS_BOWLING_BALL_RUNTIME_ADAPTER : null;
}

function msStatefulActorAdapterForEntry(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): StatefulActorRuntimeFamilyAdapter<MsStatefulActorRuntimeEntry, MsStatefulActorSpawnContext, MsPortableItemFamily> | null {
  const entry = findStatefulActorRuntime(store, actorSerial);
  return entry ? msStatefulActorAdapterForKind(entry.kind) : null;
}

export function createMsInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): MsStatefulActorRuntimeEntry | null {
  return MS_BOWLING_BALL_RUNTIME_ADAPTER.spawn(
    { byActorSerial: new Map() },
    actorSerial,
    { actorId },
  );
}

export function seedMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  MS_BOWLING_BALL_RUNTIME_ADAPTER.spawn(store, actorSerial, { actorId });
}

export function findMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return findStatefulActorRuntime(store, actorSerial);
}

export function restoreMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  entry: MsStatefulActorRuntimeEntry,
): MsStatefulActorRuntimeEntry {
  const adapter = msStatefulActorAdapterForKind(entry.kind);
  return adapter ? adapter.restore(store, entry) : setStatefulActorRuntime(store, entry);
}

export function cloneMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  sourceActorSerial: number,
  targetActorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  const adapter = msStatefulActorAdapterForEntry(store, sourceActorSerial);
  return adapter ? adapter.clone(store, sourceActorSerial, targetActorSerial) : forkStatefulActorRuntime(store, sourceActorSerial, targetActorSerial);
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
  const adapter = msStatefulActorAdapterForEntry(store, actorSerial);
  if (adapter) {
    adapter.destroy(store, actorSerial);
    return;
  }
  removeStatefulActorRuntime(store, actorSerial);
}

export function attachMsStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableBacking: StatefulActorPortableBacking<MsPortableItemFamily>,
): MsStatefulActorRuntimeEntry | undefined {
  const adapter = msStatefulActorAdapterForEntry(store, actorSerial);
  return adapter?.attachPortableBacking(store, actorSerial, portableBacking);
}

export function spawnMsBowlingBallStatefulActorFromPortable(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  portableItemSerial: number,
  state: BowlingBallState,
): MsStatefulActorRuntimeEntry {
  return restoreMsStatefulActorRuntime(store, {
    actorSerial,
    kind: "bowling-ball",
    portableBacking: {
      family: "bowling-ball",
      portableItemSerial,
    },
    state: cloneBowlingBallState(state),
  });
}

export function detachMsStatefulActorPortableBacking(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  const adapter = msStatefulActorAdapterForEntry(store, actorSerial);
  return adapter?.detachPortableBacking(store, actorSerial);
}
