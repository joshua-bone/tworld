import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import type { RulesetTileFamilyDefinition, RulesetTilePolicyPatch } from "@game-core/impl/tileFamilies";
import type { MsTilePolicyDefinition } from "@ruleset-ms/impl/catalogTiles";

export const MS_FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

export type MsTileFamilyDefinition = RulesetTileFamilyDefinition<MsTilePolicyDefinition, number>;
export type MsTilePolicyPatch = RulesetTilePolicyPatch<MsTilePolicyDefinition>;
