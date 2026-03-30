import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";
import { createRulesetTileFamily, type RulesetTileFamilyDefinition, type RulesetTilePolicyPatch } from "@game-core/impl/tileFamilies";

interface TilePolicyMetadata {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
}

export type TileMaskValue<TTileId extends number = number> = number | ((id: TTileId) => number);

type TileScalarPatch<TPolicy extends TilePolicyMetadata> = Omit<
  RulesetTilePolicyPatch<TPolicy>,
  "tags" | "capabilities" | "hooks"
>;

type DynamicTileScalarPatch<TPolicy extends TilePolicyMetadata, TTileId extends number> =
  | TileScalarPatch<TPolicy>
  | ((id: TTileId) => TileScalarPatch<TPolicy>);

interface CommonTileFamilyBuilderOptions<
  TPolicy extends TilePolicyMetadata,
  TTileId extends number,
> {
  readonly name: string;
  readonly tileIds?: readonly TTileId[];
  readonly matches?: (id: TTileId) => boolean;
  readonly baseTags?: readonly TileTag[];
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
  readonly extraPolicy?: DynamicTileScalarPatch<TPolicy, TTileId>;
}

export interface WalkableTileFamilyBuilderOptions<
  TPolicy extends TilePolicyMetadata,
  TTileId extends number,
> extends CommonTileFamilyBuilderOptions<TPolicy, TTileId> {
  readonly fullMovementMask: number;
  readonly chipMovementMask?: TileMaskValue<TTileId>;
  readonly creatureMovementMask?: TileMaskValue<TTileId>;
  readonly blockMovementMask?: TileMaskValue<TTileId>;
  readonly exitMovementMask?: TileMaskValue<TTileId>;
  readonly requiresReleaseToExit?: boolean;
}

export interface BlockingTileFamilyBuilderOptions<
  TPolicy extends TilePolicyMetadata,
  TTileId extends number,
> extends CommonTileFamilyBuilderOptions<TPolicy, TTileId> {
  readonly fullMovementMask: number;
  readonly chipMovementMask?: TileMaskValue<TTileId>;
  readonly creatureMovementMask?: TileMaskValue<TTileId>;
  readonly blockMovementMask?: TileMaskValue<TTileId>;
  readonly exitMovementMask?: TileMaskValue<TTileId>;
  readonly requiresReleaseToExit?: boolean;
}

function resolveTileMask<TTileId extends number>(
  value: TileMaskValue<TTileId> | undefined,
  id: TTileId,
  fallback: number,
): number {
  if (typeof value === "function") {
    return value(id);
  }
  return value ?? fallback;
}

function resolveExtraTilePolicy<TPolicy extends TilePolicyMetadata, TTileId extends number>(
  value: DynamicTileScalarPatch<TPolicy, TTileId> | undefined,
  id: TTileId,
): TileScalarPatch<TPolicy> {
  if (typeof value === "function") {
    return value(id);
  }
  return (value ?? {}) as TileScalarPatch<TPolicy>;
}

export function createWalkableTileFamily<
  TPolicy extends TilePolicyMetadata,
  TTileId extends number = number,
>(
  options: WalkableTileFamilyBuilderOptions<TPolicy, TTileId>,
): RulesetTileFamilyDefinition<TPolicy, TTileId> {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    matches: options.matches,
    policy: (id) => {
      const next = {
        tags: [...(options.baseTags ?? ["walkable"]), ...(options.tags ?? [])],
        capabilities: options.capabilities ?? [],
        hooks: options.hooks ?? [],
        chipMovementMask: resolveTileMask(options.chipMovementMask, id, options.fullMovementMask),
        creatureMovementMask: resolveTileMask(options.creatureMovementMask, id, options.fullMovementMask),
        blockMovementMask: resolveTileMask(options.blockMovementMask, id, options.fullMovementMask),
        exitMovementMask: resolveTileMask(options.exitMovementMask, id, options.fullMovementMask),
        requiresReleaseToExit: options.requiresReleaseToExit ?? false,
      } as unknown as RulesetTilePolicyPatch<TPolicy>;
      return {
        ...next,
        ...resolveExtraTilePolicy(options.extraPolicy, id),
      };
    },
  });
}

export function createBlockingTileFamily<
  TPolicy extends TilePolicyMetadata,
  TTileId extends number = number,
>(
  options: BlockingTileFamilyBuilderOptions<TPolicy, TTileId>,
): RulesetTileFamilyDefinition<TPolicy, TTileId> {
  return createRulesetTileFamily({
    name: options.name,
    tileIds: options.tileIds,
    matches: options.matches,
    policy: (id) => {
      const next = {
        tags: [...(options.baseTags ?? ["blocking"]), ...(options.tags ?? [])],
        capabilities: options.capabilities ?? [],
        hooks: options.hooks ?? [],
        chipMovementMask: resolveTileMask(options.chipMovementMask, id, 0),
        creatureMovementMask: resolveTileMask(options.creatureMovementMask, id, 0),
        blockMovementMask: resolveTileMask(options.blockMovementMask, id, 0),
        exitMovementMask: resolveTileMask(options.exitMovementMask, id, options.fullMovementMask),
        requiresReleaseToExit: options.requiresReleaseToExit ?? false,
      } as unknown as RulesetTilePolicyPatch<TPolicy>;
      return {
        ...next,
        ...resolveExtraTilePolicy(options.extraPolicy, id),
      };
    },
  });
}
