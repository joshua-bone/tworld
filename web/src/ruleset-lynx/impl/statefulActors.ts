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

export interface LynxBowlingBallRuntimeState extends Record<string, unknown> {
  mode: "moving";
  localInventory: StatefulActorLocalInventoryState["localInventory"];
}

export type LynxStatefulActorRuntimeEntry = StatefulActorInventoryEntry<
  "bowling-ball",
  LynxBowlingBallRuntimeState
>;

export function createLynxInitialStatefulActorRuntime(
  actorSerial: number,
  actorId: number,
): LynxStatefulActorRuntimeEntry | null {
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

export function seedLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
  actorId: number,
): void {
  const entry = createLynxInitialStatefulActorRuntime(actorSerial, actorId);
  if (!entry) {
    return;
  }
  setStatefulActorRuntime(store, entry);
}

export function findLynxStatefulActorRuntime(
  store: StatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>,
  actorSerial: number,
): LynxStatefulActorRuntimeEntry | undefined {
  return findStatefulActorRuntime(store, actorSerial);
}
