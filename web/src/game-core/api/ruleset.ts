import type { ActorCapabilityPolicy } from "./actorCapabilities";

export type TileTag =
  | "walkable"
  | "blocking"
  | "pushable"
  | "collectible"
  | "deadly"
  | "button"
  | "door"
  | "key"
  | "boots"
  | "teleport"
  | "trap"
  | "cloner"
  | "slide"
  | "ice"
  | "toggleable"
  | "exit"
  | "socket"
  | "hint";

export type ActorTag =
  | "chip"
  | "block"
  | "creature"
  | "fire-immune"
  | "water-immune"
  | "pushes-blocks"
  | "collects-items";

export type TileCapability =
  | "allow-entry"
  | "allow-exit"
  | "collect-on-entry"
  | "trigger-on-entry"
  | "trigger-on-leave"
  | "kills-on-entry"
  | "forces-movement"
  | "redirects-movement"
  | "accepts-blocks"
  | "toggles-linked-state";

export type TileHookName =
  | "before-enter"
  | "after-enter"
  | "before-leave"
  | "after-leave"
  | "tick"
  | "activate"
  | "resolve-collision";

export interface TileDefinition<TTileId extends number = number> {
  id: TTileId;
  code: string;
  name: string;
  tags: readonly TileTag[];
  capabilities: readonly TileCapability[];
  hooks: readonly TileHookName[];
}

export interface ActorDefinition<TActorId extends number = number> {
  id: TActorId;
  code: string;
  name: string;
  tags: readonly ActorTag[];
  capabilities: ActorCapabilityPolicy;
}

export interface RulesetCatalog<TTileId extends number = number, TActorId extends number = number> {
  readonly name: string;
  readonly tiles: ReadonlyMap<TTileId, TileDefinition<TTileId>>;
  readonly actors: ReadonlyMap<TActorId, ActorDefinition<TActorId>>;
  getTile(id: TTileId): TileDefinition<TTileId> | undefined;
  getActor(id: TActorId): ActorDefinition<TActorId> | undefined;
}

export function createRulesetCatalog<TTileId extends number, TActorId extends number>(config: {
  name: string;
  tiles: readonly TileDefinition<TTileId>[];
  actors: readonly ActorDefinition<TActorId>[];
}): RulesetCatalog<TTileId, TActorId> {
  const tiles = new Map(config.tiles.map((tile) => [tile.id, tile] as const));
  const actors = new Map(config.actors.map((actor) => [actor.id, actor] as const));

  return {
    name: config.name,
    tiles,
    actors,
    getTile(id) {
      return tiles.get(id);
    },
    getActor(id) {
      return actors.get(id);
    },
  };
}
