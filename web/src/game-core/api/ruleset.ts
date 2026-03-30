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

export interface TileBehaviorContext<TTileId extends number = number, TActorId extends number = number> {
  readonly phase: TileLifecyclePhase;
  readonly tileId: TTileId;
  readonly actorId?: TActorId;
}

export type TileLifecycleHandler<TTileId extends number = number, TActorId extends number = number> = (
  context: TileBehaviorContext<TTileId, TActorId>,
) => void;

export interface TileBehavior<TTileId extends number = number, TActorId extends number = number> {
  readonly phases: Readonly<Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>>>;
}

export interface ActorBehaviorContext<TTileId extends number = number, TActorId extends number = number> {
  readonly phase: ActorLifecyclePhase;
  readonly actorId: TActorId;
  readonly tileId?: TTileId;
}

export type ActorLifecycleHandler<TTileId extends number = number, TActorId extends number = number> = (
  context: ActorBehaviorContext<TTileId, TActorId>,
) => void;

export interface ActorBehavior<TTileId extends number = number, TActorId extends number = number> {
  readonly phases: Readonly<Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>>>;
}

export function createTileBehavior<TTileId extends number = number, TActorId extends number = number>(
  phases: Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>> = {},
): TileBehavior<TTileId, TActorId> {
  return {
    phases: { ...phases },
  };
}

export function createActorBehavior<TTileId extends number = number, TActorId extends number = number>(
  phases: Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>> = {},
): ActorBehavior<TTileId, TActorId> {
  return {
    phases: { ...phases },
  };
}

export function noTileBehavior<TTileId extends number = number, TActorId extends number = number>(): TileBehavior<
  TTileId,
  TActorId
> {
  return createTileBehavior<TTileId, TActorId>();
}

export function noActorBehavior<TTileId extends number = number, TActorId extends number = number>(): ActorBehavior<
  TTileId,
  TActorId
> {
  return createActorBehavior<TTileId, TActorId>();
}

export function composeTileBehaviors<TTileId extends number = number, TActorId extends number = number>(
  ...behaviors: ReadonlyArray<TileBehavior<TTileId, TActorId> | undefined>
): TileBehavior<TTileId, TActorId> | undefined {
  const phases: Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>> = {};
  let hasPhase = false;
  for (const behavior of behaviors) {
    if (!behavior) {
      continue;
    }
    Object.assign(phases, behavior.phases);
    hasPhase ||= Object.keys(behavior.phases).length > 0;
  }
  return hasPhase ? createTileBehavior(phases) : undefined;
}

export function lookupTileBehaviorPhase<TTileId extends number = number, TActorId extends number = number>(
  behavior: TileBehavior<TTileId, TActorId>,
  phase: TileLifecyclePhase,
): TileLifecycleHandler<TTileId, TActorId> | null {
  return behavior.phases[phase] ?? null;
}

export function lookupActorBehaviorPhase<TTileId extends number = number, TActorId extends number = number>(
  behavior: ActorBehavior<TTileId, TActorId>,
  phase: ActorLifecyclePhase,
): ActorLifecycleHandler<TTileId, TActorId> | null {
  return behavior.phases[phase] ?? null;
}

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
export interface TileDefinition<TTileId extends number = number, TActorId extends number = number> {
  id: TTileId;
  code: string;
  name: string;
  tags: readonly TileTag[];
  capabilities: readonly TileCapability[];
  hooks: readonly TileHookName[];
  behavior?: TileBehavior<TTileId, TActorId>;
}

/**
 * Static actor registration.
 *
 * The capability policy describes family behavior at a high level today. As
 * the plugin migration proceeds, executable actor handlers should align with
 * {@link ACTOR_LIFECYCLE_PHASES} rather than adding more engine-local special
 * cases.
 */
export interface ActorDefinition<TActorId extends number = number, TTileId extends number = number> {
  id: TActorId;
  code: string;
  name: string;
  tags: readonly ActorTag[];
  capabilities: ActorCapabilityPolicy;
  behavior?: ActorBehavior<TTileId, TActorId>;
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
  readonly tiles: ReadonlyMap<TTileId, TileDefinition<TTileId, TActorId>>;
  readonly actors: ReadonlyMap<TActorId, ActorDefinition<TActorId, TTileId>>;
  readonly tileBehaviors: ReadonlyMap<TTileId, TileBehavior<TTileId, TActorId>>;
  readonly actorBehaviors: ReadonlyMap<TActorId, ActorBehavior<TTileId, TActorId>>;
  getTile(id: TTileId): TileDefinition<TTileId, TActorId> | undefined;
  getActor(id: TActorId): ActorDefinition<TActorId, TTileId> | undefined;
  getTileBehavior(id: TTileId): TileBehavior<TTileId, TActorId> | undefined;
  getActorBehavior(id: TActorId): ActorBehavior<TTileId, TActorId> | undefined;
}

export function createRulesetCatalog<TTileId extends number, TActorId extends number>(config: {
  name: string;
  tiles: readonly TileDefinition<TTileId, TActorId>[];
  actors: readonly ActorDefinition<TActorId, TTileId>[];
}): RulesetCatalog<TTileId, TActorId> {
  const tiles = new Map(config.tiles.map((tile) => [tile.id, tile] as const));
  const actors = new Map(config.actors.map((actor) => [actor.id, actor] as const));
  const tileBehaviors = new Map(
    config.tiles.map((tile) => [tile.id, tile.behavior ?? noTileBehavior<TTileId, TActorId>()] as const),
  );
  const actorBehaviors = new Map(
    config.actors.map((actor) => [actor.id, actor.behavior ?? noActorBehavior<TTileId, TActorId>()] as const),
  );

  return {
    name: config.name,
    tiles,
    actors,
    tileBehaviors,
    actorBehaviors,
    getTile(id) {
      return tiles.get(id);
    },
    getActor(id) {
      return actors.get(id);
    },
    getTileBehavior(id) {
      return tileBehaviors.get(id);
    },
    getActorBehavior(id) {
      return actorBehaviors.get(id);
    },
  };
}
