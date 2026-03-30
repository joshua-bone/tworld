import {
  lookupActorBehaviorHook,
  lookupActorBehaviorPhase,
  lookupTileBehaviorHook,
  lookupTileBehaviorPhase,
  type ActorBehavior,
  type ActorDefinition,
  type ActorLifecycleHookName,
  type ActorLifecycleHooks,
  type ActorLifecyclePhase,
  type TileBehavior,
  type TileDefinition,
  type TileLifecycleHookName,
  type TileLifecycleHooks,
  type TileLifecyclePhase,
} from "./ruleset";

export interface TileLifecycleRegistry<TTileId extends number = number, TActorId extends number = number> {
  readonly behaviors: ReadonlyMap<TTileId, TileBehavior<TTileId, TActorId>>;
  getBehavior(id: TTileId): TileBehavior<TTileId, TActorId> | undefined;
  getPhase(id: TTileId, phase: TileLifecyclePhase): ReturnType<typeof lookupTileBehaviorPhase<TTileId, TActorId>>;
  getHook(
    id: TTileId,
    hook: TileLifecycleHookName,
  ): TileLifecycleHooks<TTileId, TActorId>[typeof hook] | null;
}

export interface ActorLifecycleRegistry<TActorId extends number = number, TTileId extends number = number> {
  readonly behaviors: ReadonlyMap<TActorId, ActorBehavior<TTileId, TActorId>>;
  getBehavior(id: TActorId): ActorBehavior<TTileId, TActorId> | undefined;
  getPhase(
    id: TActorId,
    phase: ActorLifecyclePhase,
  ): ReturnType<typeof lookupActorBehaviorPhase<TTileId, TActorId>>;
  getHook(
    id: TActorId,
    hook: ActorLifecycleHookName,
  ): ActorLifecycleHooks<TTileId, TActorId>[typeof hook] | null;
}

function behaviorMapHasHandlers<TBehavior extends { readonly phases: Readonly<Record<string, unknown>> }>(
  behavior: TBehavior | undefined,
): behavior is TBehavior {
  return behavior !== undefined && Object.keys(behavior.phases).length > 0;
}

export function createTileLifecycleRegistry<TTileId extends number = number, TActorId extends number = number>(
  definitions: readonly TileDefinition<TTileId, TActorId>[],
): TileLifecycleRegistry<TTileId, TActorId> {
  const behaviors = new Map<TTileId, TileBehavior<TTileId, TActorId>>(
    definitions.flatMap((definition) =>
      behaviorMapHasHandlers(definition.behavior) ? [[definition.id, definition.behavior] as const] : [],
    ),
  );

  return {
    behaviors,
    getBehavior(id) {
      return behaviors.get(id);
    },
    getPhase(id, phase) {
      const behavior = behaviors.get(id);
      return behavior ? lookupTileBehaviorPhase(behavior, phase) : null;
    },
    getHook(id, hook) {
      const behavior = behaviors.get(id);
      return behavior ? lookupTileBehaviorHook(behavior, hook) : null;
    },
  };
}

export function createActorLifecycleRegistry<TActorId extends number = number, TTileId extends number = number>(
  definitions: readonly ActorDefinition<TActorId, TTileId>[],
): ActorLifecycleRegistry<TActorId, TTileId> {
  const behaviors = new Map<TActorId, ActorBehavior<TTileId, TActorId>>(
    definitions.flatMap((definition) =>
      behaviorMapHasHandlers(definition.behavior) ? [[definition.id, definition.behavior] as const] : [],
    ),
  );

  return {
    behaviors,
    getBehavior(id) {
      return behaviors.get(id);
    },
    getPhase(id, phase) {
      const behavior = behaviors.get(id);
      return behavior ? lookupActorBehaviorPhase(behavior, phase) : null;
    },
    getHook(id, hook) {
      const behavior = behaviors.get(id);
      return behavior ? lookupActorBehaviorHook(behavior, hook) : null;
    },
  };
}
