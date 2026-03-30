import type {
  ActorGlobalProgressKind,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorThiefHook,
} from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createPortableBackedActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsPortableBackedActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly localInventoryMode: ActorLocalInventoryMode;
  readonly itemCollectionKind: ActorItemCollectionKind;
  readonly globalProgressKind: ActorGlobalProgressKind;
  readonly thiefHook?: ActorThiefHook;
  readonly tags?: readonly ActorTag[];
}

export function createMsPortableBackedActorFamily(options: MsPortableBackedActorFamilyOptions): MsActorFamilyDefinition {
  return createPortableBackedActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    localInventoryMode: options.localInventoryMode,
    itemCollectionKind: options.itemCollectionKind,
    globalProgressKind: options.globalProgressKind,
    thiefHook: options.thiefHook,
  });
}
