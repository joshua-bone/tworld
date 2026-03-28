import type { ActorLocalInventoryMode } from "@game-core/api/actorCapabilities";
import {
  createActorInventoryOwnerId,
  createActorLocalInventory,
  projectActorLocalInventoryOwner,
  type ActorKeysBootsInventory,
  type ActorKeysBootsToolsInventory,
  type ActorLocalInventoryOwner,
} from "@game-core/impl/actorLocalInventory";
import type { StatefulActorRuntimeEntry } from "@game-core/impl/statefulActorRuntime";

export interface StatefulActorLocalInventoryState {
  localInventory: ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null;
}

export type StatefulActorInventoryEntry<
  TKind extends string = string,
  TState extends StatefulActorLocalInventoryState = StatefulActorLocalInventoryState,
  TPortableFamily extends string = string,
> = StatefulActorRuntimeEntry<TKind, TState, TPortableFamily>;

export function createStatefulActorLocalInventoryState(
  mode: ActorLocalInventoryMode,
): StatefulActorLocalInventoryState {
  if (mode === "none") {
    return {
      localInventory: null,
    };
  }
  if (mode === "keys-boots") {
    return {
      localInventory: createActorLocalInventory("keys-boots"),
    };
  }
  return {
    localInventory: createActorLocalInventory("keys-boots-tools"),
  };
}

export function statefulActorLocalInventory<
  TEntry extends StatefulActorRuntimeEntry<string, { localInventory?: ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null }>,
>(
  entry: TEntry | null | undefined,
): ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null {
  return entry?.state.localInventory ?? null;
}

export function projectStatefulActorLocalInventoryOwner<
  TEntry extends StatefulActorRuntimeEntry<string, { localInventory?: ActorKeysBootsInventory | ActorKeysBootsToolsInventory | null }>,
>(
  scope: string,
  actorSerial: number,
  mode: ActorLocalInventoryMode,
  entry: TEntry | null | undefined,
): ActorLocalInventoryOwner {
  return projectActorLocalInventoryOwner(
    createActorInventoryOwnerId(scope, actorSerial),
    mode,
    statefulActorLocalInventory(entry),
  );
}
