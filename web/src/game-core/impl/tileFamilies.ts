import type { TileCapability, TileHookName, TileTag } from "@game-core/api/ruleset";

interface RulesetTilePolicyMetadata {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
}

export type RulesetTilePolicyPatch<TPolicy extends RulesetTilePolicyMetadata> = Partial<
  Omit<TPolicy, "tags" | "capabilities" | "hooks">
> & {
  readonly tags?: readonly TileTag[];
  readonly capabilities?: readonly TileCapability[];
  readonly hooks?: readonly TileHookName[];
};

export interface RulesetTileFamilyDefinition<
  TPolicy extends RulesetTilePolicyMetadata,
  TTileId extends number = number,
> {
  readonly name: string;
  matches(id: TTileId): boolean;
  policy(id: TTileId): RulesetTilePolicyPatch<TPolicy>;
}

export function createRulesetTileFamily<
  TPolicy extends RulesetTilePolicyMetadata,
  TTileId extends number = number,
>(options: {
  readonly name: string;
  readonly tileIds?: readonly TTileId[];
  readonly matches?: (id: TTileId) => boolean;
  readonly policy: RulesetTilePolicyPatch<TPolicy> | ((id: TTileId) => RulesetTilePolicyPatch<TPolicy>);
}): RulesetTileFamilyDefinition<TPolicy, TTileId> {
  const tileIdSet = options.tileIds ? new Set(options.tileIds) : null;
  return {
    name: options.name,
    matches(id) {
      if (options.matches) {
        return options.matches(id);
      }
      return tileIdSet?.has(id) ?? false;
    },
    policy(id) {
      return typeof options.policy === "function" ? options.policy(id) : options.policy;
    },
  };
}

function mergeUnique<T>(left: readonly T[], right: readonly T[] | undefined): readonly T[] {
  if (!right || right.length === 0) {
    return left;
  }
  return [...new Set([...left, ...right])];
}

export function composeRulesetTilePolicy<
  TPolicy extends RulesetTilePolicyMetadata,
  TTileId extends number = number,
>(
  basePolicy: TPolicy,
  id: TTileId,
  families: readonly RulesetTileFamilyDefinition<TPolicy, TTileId>[],
): TPolicy {
  const next = {
    ...basePolicy,
    tags: [...basePolicy.tags],
    capabilities: [...basePolicy.capabilities],
    hooks: [...basePolicy.hooks],
  } as unknown as { [key: string]: unknown };

  for (const family of families) {
    if (!family.matches(id)) {
      continue;
    }

    const patch = family.policy(id);
    const { tags, capabilities, hooks, ...scalars } = patch;

    for (const [key, value] of Object.entries(scalars)) {
      if (value !== undefined) {
        next[key] = value;
      }
    }

    next.tags = mergeUnique(next.tags as readonly TileTag[], tags);
    next.capabilities = mergeUnique(next.capabilities as readonly TileCapability[], capabilities);
    next.hooks = mergeUnique(next.hooks as readonly TileHookName[], hooks);
  }

  return next as unknown as TPolicy;
}
