import {
  createStatefulActorLocalInventoryState,
  type StatefulActorInventoryEntry,
  type StatefulActorLocalInventoryState,
} from "@game-core/impl/statefulActorLocalInventory";
import {
  findStatefulActorRuntime,
  setStatefulActorRuntime,
  type StatefulActorRuntimeStore,
} from "@game-core/impl/statefulActorRuntime";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface MsBowlingBallRuntimeState extends Record<string, unknown> {
  mode: "moving";
  localInventory: StatefulActorLocalInventoryState["localInventory"];
}

export type MsStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  "bowling-ball",
  MsBowlingBallRuntimeState
>;

export function createMsInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): MsStatefulActorRuntimeEntry | null {
  if (actorId !== MS_TILE.BowlingBall) {
    return null;
  }

  return {
    actorSerial,
    kind: "bowling-ball",
    state: {
      mode: "moving",
      localInventory: createStatefulActorLocalInventoryState("keys-boots").localInventory,
    },
  };
}

export function seedMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  const entry = createMsInitialStatefulActorRuntime(actorSerial, actorId);
  if (!entry) {
    return;
  }
  setStatefulActorRuntime(store, entry);
}

export function findMsStatefulActorRuntime(
  store: StatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>,
  actorSerial: number,
): MsStatefulActorRuntimeEntry | undefined {
  return findStatefulActorRuntime(store, actorSerial);
}
