import type { ActorGlobalProgressKind, ActorItemCollectionKind, ActorLocalInventoryMode } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createPlayerLikeActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { MsActorFamilyDefinition } from "@ruleset-ms/impl/elements/actors/families/shared";

export interface MsPlayerLikeActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly localInventoryMode?: ActorLocalInventoryMode;
  readonly itemCollectionKind?: ActorItemCollectionKind;
  readonly globalProgressKind?: ActorGlobalProgressKind;
  readonly tags?: readonly ActorTag[];
}

export function createMsPlayerLikeActorFamily(options: MsPlayerLikeActorFamilyOptions): MsActorFamilyDefinition {
  return createPlayerLikeActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    tags: options.tags,
    localInventoryMode: options.localInventoryMode,
    itemCollectionKind: options.itemCollectionKind,
    globalProgressKind: options.globalProgressKind,
  });
}
