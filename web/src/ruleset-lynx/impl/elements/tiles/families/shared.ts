import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import type { RulesetTileFamilyDefinition, RulesetTilePolicyPatch } from "@game-core/impl/tileFamilies";
import type { LynxTilePolicyDefinition } from "@ruleset-lynx/impl/catalogTiles";

export const LYNX_FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

export type LynxTileFamilyDefinition = RulesetTileFamilyDefinition<LynxTilePolicyDefinition, number>;
export type LynxTilePolicyPatch = RulesetTilePolicyPatch<LynxTilePolicyDefinition>;
