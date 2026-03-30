import type { ActorCapabilityPolicy } from "./actorCapabilities";
import {
  ACTOR_LIFECYCLE_PHASES,
  actorLifecyclePhaseMapToHooks,
  actorLifecycleHooksToPhaseMap,
  composeActorLifecycleHooks,
  createActorLifecycleHooks,
  lookupActorLifecycleHook,
  type ActorLifecycleContext,
  type ActorLifecycleHandler,
  type ActorLifecycleHookName,
  type ActorLifecycleHooks,
  type ActorLifecyclePhase,
} from "./actorLifecycle";
import {
  TILE_LIFECYCLE_PHASES,
  tileLifecyclePhaseMapToHooks,
  tileLifecycleHooksToPhaseMap,
  composeTileLifecycleHooks,
  createTileLifecycleHooks,
  lookupTileLifecycleHook,
  type TileLifecycleContext,
  type TileLifecycleHandler,
  type TileLifecycleHookName,
  type TileLifecycleHooks,
  type TileLifecyclePhase,
} from "./tileLifecycle";

export {
  ACTOR_LIFECYCLE_HOOK_BY_PHASE,
  ACTOR_LIFECYCLE_HOOKS,
  ACTOR_LIFECYCLE_PHASE_BY_HOOK,
  ACTOR_LIFECYCLE_PHASES,
  composeActorLifecycleHooks,
  createActorLifecycleHooks,
  lookupActorLifecycleHook,
  noActorLifecycleHooks,
  actorLifecycleHooksToPhaseMap,
  actorLifecyclePhaseMapToHooks,
} from "./actorLifecycle";
export type {
  ActorArrivalContext,
  ActorBlockedMoveContext,
  ActorClonerCloneContext,
  ActorClonerEntryContext,
  ActorCollisionContext,
  ActorFinishMoveContext,
  ActorHeldFloorContext,
  ActorLifecycleContext,
  ActorLifecycleHandler,
  ActorLifecycleHookName,
  ActorLifecycleHooks,
  ActorLifecyclePhase,
  ActorPortableBackingContext,
  ActorRenderContext,
  ActorStartMoveContext,
  ActorSupportContext,
  ActorTestMoveContext,
  ActorTrapReleaseContext,
} from "./actorLifecycle";
export {
  TILE_LIFECYCLE_HOOK_BY_PHASE,
  TILE_LIFECYCLE_HOOKS,
  TILE_LIFECYCLE_PHASE_BY_HOOK,
  TILE_LIFECYCLE_PHASES,
  composeTileLifecycleHooks,
  createTileLifecycleHooks,
  lookupTileLifecycleHook,
  noTileLifecycleHooks,
  tileLifecycleHooksToPhaseMap,
  tileLifecyclePhaseMapToHooks,
} from "./tileLifecycle";
export type {
  TileActivateContext,
  TileDecodeLoadContext,
  TileFinishEnterContext,
  TileFinishExitContext,
  TileLifecycleContext,
  TileLifecycleHandler,
  TileLifecycleHookName,
  TileLifecycleHooks,
  TileLifecyclePhase,
  TileRenderContext,
  TileStartEnterContext,
  TileSupportContext,
  TileTestEnterContext,
  TileTestExitContext,
  TileTickContext,
} from "./tileLifecycle";

/**
 * Shared lifecycle vocabulary for the in-repo plugin architecture.
 *
 * The current engines do not yet dispatch through all of these phases, but the
 * names here define the contract for future handler registration. This keeps
 * ruleset-specific work aligned on one set of lifecycle boundaries instead of
 * growing more ad hoc hot-path branches in the engines.
 */
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

export type TileBehaviorContext<TTileId extends number = number, TActorId extends number = number> = TileLifecycleContext<
  TTileId,
  TActorId
>;

export interface TileBehavior<TTileId extends number = number, TActorId extends number = number> {
  readonly hooks: Readonly<TileLifecycleHooks<TTileId, TActorId>>;
  readonly phases: Readonly<Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>>>;
}

export type ActorBehaviorContext<TTileId extends number = number, TActorId extends number = number> =
  ActorLifecycleContext<TTileId, TActorId>;

export interface ActorBehavior<TTileId extends number = number, TActorId extends number = number> {
  readonly hooks: Readonly<ActorLifecycleHooks<TTileId, TActorId>>;
  readonly phases: Readonly<Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>>>;
}

type TileBehaviorInitializer<TTileId extends number = number, TActorId extends number = number> =
  | Partial<Record<TileLifecyclePhase, TileLifecycleHandler<TTileId, TActorId>>>
  | Partial<TileLifecycleHooks<TTileId, TActorId>>;

type ActorBehaviorInitializer<TTileId extends number = number, TActorId extends number = number> =
  | Partial<Record<ActorLifecyclePhase, ActorLifecycleHandler<TTileId, TActorId>>>
  | Partial<ActorLifecycleHooks<TTileId, TActorId>>;

function isTileLifecycleHookInput<TTileId extends number = number, TActorId extends number = number>(
  input: TileBehaviorInitializer<TTileId, TActorId>,
): input is Partial<TileLifecycleHooks<TTileId, TActorId>> {
  return Object.keys(input).some((key) => key === "decodeLoad" || !key.includes("-"));
}

function isActorLifecycleHookInput<TTileId extends number = number, TActorId extends number = number>(
  input: ActorBehaviorInitializer<TTileId, TActorId>,
): input is Partial<ActorLifecycleHooks<TTileId, TActorId>> {
  return Object.keys(input).some((key) => !key.includes("-"));
}

export function createTileBehavior<TTileId extends number = number, TActorId extends number = number>(
  config: TileBehaviorInitializer<TTileId, TActorId> = {},
): TileBehavior<TTileId, TActorId> {
  const hooks = isTileLifecycleHookInput(config) ? createTileLifecycleHooks(config) : tileLifecyclePhaseMapToHooks(config);
  return {
    hooks,
    phases: tileLifecycleHooksToPhaseMap(hooks),
  };
}

export function createActorBehavior<TTileId extends number = number, TActorId extends number = number>(
  config: ActorBehaviorInitializer<TTileId, TActorId> = {},
): ActorBehavior<TTileId, TActorId> {
  const hooks = isActorLifecycleHookInput(config) ? createActorLifecycleHooks(config) : actorLifecyclePhaseMapToHooks(config);
  return {
    hooks,
    phases: actorLifecycleHooksToPhaseMap(hooks),
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
  const hooks = composeTileLifecycleHooks(...behaviors.map((behavior) => behavior?.hooks));
  return hooks ? createTileBehavior(hooks) : undefined;
}

export function composeActorBehaviors<TTileId extends number = number, TActorId extends number = number>(
  ...behaviors: ReadonlyArray<ActorBehavior<TTileId, TActorId> | undefined>
): ActorBehavior<TTileId, TActorId> | undefined {
  const hooks = composeActorLifecycleHooks(...behaviors.map((behavior) => behavior?.hooks));
  return hooks ? createActorBehavior(hooks) : undefined;
}

export function lookupTileBehaviorPhase<TTileId extends number = number, TActorId extends number = number>(
  behavior: TileBehavior<TTileId, TActorId>,
  phase: TileLifecyclePhase,
): TileLifecycleHandler<TTileId, TActorId> | null {
  return behavior.phases[phase] ?? null;
}

export function lookupTileBehaviorHook<TTileId extends number = number, TActorId extends number = number>(
  behavior: TileBehavior<TTileId, TActorId>,
  hook: TileLifecycleHookName,
): TileBehavior<TTileId, TActorId>["hooks"][typeof hook] | null {
  return lookupTileLifecycleHook(behavior.hooks, hook);
}

export function lookupActorBehaviorPhase<TTileId extends number = number, TActorId extends number = number>(
  behavior: ActorBehavior<TTileId, TActorId>,
  phase: ActorLifecyclePhase,
): ActorLifecycleHandler<TTileId, TActorId> | null {
  return behavior.phases[phase] ?? null;
}

export function lookupActorBehaviorHook<TTileId extends number = number, TActorId extends number = number>(
  behavior: ActorBehavior<TTileId, TActorId>,
  hook: ActorLifecycleHookName,
): ActorBehavior<TTileId, TActorId>["hooks"][typeof hook] | null {
  return lookupActorLifecycleHook(behavior.hooks, hook);
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
