import type { ActorCapabilityPolicy } from "./actorCapabilities";

/**
 * Shared lifecycle vocabulary for the in-repo plugin architecture.
 *
 * The current engines do not yet dispatch through all of these phases, but the
 * names here define the contract for future handler registration. This keeps
 * ruleset-specific work aligned on one set of lifecycle boundaries instead of
 * growing more ad hoc hot-path branches in the engines.
 */
export type TileLifecyclePhase =
  | "probe-enter"
  | "begin-enter"
  | "complete-enter"
  | "probe-exit"
  | "complete-exit"
  | "probe-support"
  | "activate"
  | "tick"
  | "render"
  | "decode-load";

export const TILE_LIFECYCLE_PHASES = [
  "probe-enter",
  "begin-enter",
  "complete-enter",
  "probe-exit",
  "complete-exit",
  "probe-support",
  "activate",
  "tick",
  "render",
  "decode-load",
] as const satisfies readonly TileLifecyclePhase[];

export type ActorLifecyclePhase =
  | "probe-move"
  | "begin-move"
  | "complete-move"
  | "blocked-move"
  | "collision"
  | "arrival"
  | "held-floor"
  | "trap-release"
  | "cloner-entry"
  | "cloner-clone"
  | "support"
  | "portable-backing"
  | "render";

export const ACTOR_LIFECYCLE_PHASES = [
  "probe-move",
  "begin-move",
  "complete-move",
  "blocked-move",
  "collision",
  "arrival",
  "held-floor",
  "trap-release",
  "cloner-entry",
  "cloner-clone",
  "support",
  "portable-backing",
  "render",
] as const satisfies readonly ActorLifecyclePhase[];

export type RulesetKernelResponsibility =
  | "phase-scheduling"
  | "movement-cadence"
  | "replay-integration"
  | "undo-history"
  | "occupancy-bookkeeping"
  | "runtime-actor-indexing"
  | "z-layer-traversal"
  | "board-mutation-primitives"
  | "debug-projection";

export const RULESET_KERNEL_RESPONSIBILITIES = [
  "phase-scheduling",
  "movement-cadence",
  "replay-integration",
  "undo-history",
  "occupancy-bookkeeping",
  "runtime-actor-indexing",
  "z-layer-traversal",
  "board-mutation-primitives",
  "debug-projection",
] as const satisfies readonly RulesetKernelResponsibility[];

export type RulesetPluginResponsibility =
  | "entry-legality"
  | "exit-legality"
  | "entry-effects"
  | "exit-effects"
  | "support-effects"
  | "activation-effects"
  | "collision-effects"
  | "blocked-move-effects"
  | "family-runtime-effects"
  | "render-registration"
  | "decode-load-registration";

export const RULESET_PLUGIN_RESPONSIBILITIES = [
  "entry-legality",
  "exit-legality",
  "entry-effects",
  "exit-effects",
  "support-effects",
  "activation-effects",
  "collision-effects",
  "blocked-move-effects",
  "family-runtime-effects",
  "render-registration",
  "decode-load-registration",
] as const satisfies readonly RulesetPluginResponsibility[];

/**
 * Architectural contract for the ruleset plugin migration.
 *
 * The engine kernel owns timing and bookkeeping. Element plugins own behavior
 * at the lifecycle seams above. When a suitable lifecycle seam already exists,
 * new gameplay behavior should be registered through tile or actor families
 * instead of adding raw tile-id branches in engine hot paths.
 */
export interface RulesetArchitectureContract {
  readonly tileLifecyclePhases: readonly TileLifecyclePhase[];
  readonly actorLifecyclePhases: readonly ActorLifecyclePhase[];
  readonly kernelResponsibilities: readonly RulesetKernelResponsibility[];
  readonly pluginResponsibilities: readonly RulesetPluginResponsibility[];
}

export const RULESET_ARCHITECTURE_CONTRACT: RulesetArchitectureContract = {
  tileLifecyclePhases: TILE_LIFECYCLE_PHASES,
  actorLifecyclePhases: ACTOR_LIFECYCLE_PHASES,
  kernelResponsibilities: RULESET_KERNEL_RESPONSIBILITIES,
  pluginResponsibilities: RULESET_PLUGIN_RESPONSIBILITIES,
};

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

/**
 * Static tile registration.
 *
 * This remains metadata-only for now. Future executable tile handlers should
 * align with {@link TILE_LIFECYCLE_PHASES} and respect
 * {@link RULESET_ARCHITECTURE_CONTRACT}.
 */
export interface TileDefinition<TTileId extends number = number> {
  id: TTileId;
  code: string;
  name: string;
  tags: readonly TileTag[];
  capabilities: readonly TileCapability[];
  hooks: readonly TileHookName[];
}

/**
 * Static actor registration.
 *
 * The capability policy describes family behavior at a high level today. As
 * the plugin migration proceeds, executable actor handlers should align with
 * {@link ACTOR_LIFECYCLE_PHASES} rather than adding more engine-local special
 * cases.
 */
export interface ActorDefinition<TActorId extends number = number> {
  id: TActorId;
  code: string;
  name: string;
  tags: readonly ActorTag[];
  capabilities: ActorCapabilityPolicy;
}

/**
 * Ruleset catalog for metadata and lifecycle vocabulary.
 *
 * The catalog itself does not yet dispatch gameplay handlers. It is the shared
 * registration root for ruleset-owned tiles and actors, and the place where the
 * plugin migration contract is documented.
 */
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
