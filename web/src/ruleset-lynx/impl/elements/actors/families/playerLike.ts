import type { ActorGlobalProgressKind, ActorItemCollectionKind, ActorLocalInventoryMode } from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createPlayerLikeActorFamilyDefinition } from "@game-core/impl/actorFamilyBuilders";
import type { LynxActorFamilyDefinition } from "@ruleset-lynx/impl/elements/actors/families/shared";

export interface LynxPlayerLikeActorFamilyOptions {
  readonly name: string;
  readonly actorIds: readonly number[];
  readonly localInventoryMode?: ActorLocalInventoryMode;
  readonly itemCollectionKind?: ActorItemCollectionKind;
  readonly globalProgressKind?: ActorGlobalProgressKind;
  readonly tags?: readonly ActorTag[];
}

export function createLynxPlayerLikeActorFamily(options: LynxPlayerLikeActorFamilyOptions): LynxActorFamilyDefinition {
  return createPlayerLikeActorFamilyDefinition({
    name: options.name,
    actorIds: options.actorIds,
    baseTags: ["chip", "collects-items", "pushes-blocks"],
    tags: options.tags,
    localInventoryMode: options.localInventoryMode,
    itemCollectionKind: options.itemCollectionKind,
    globalProgressKind: options.globalProgressKind,
  });
}
