import type {
  StaticTopologyCaveatKindV1,
  StaticTopologyCaveatV1,
  StaticTopologyCellEvidenceV1,
  StaticTopologyEvidenceV1,
  StaticTopologyOccupancyV1,
  StaticTopologySupportingPlacementV1,
  StaticTraversalClassV1,
} from "@tworld/ccsolver/analyze";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  isMsBlockActorId,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureId,
  msStaticBlockActorId,
  MS_DIRECTION,
  MS_TILE,
} from "@ruleset-ms/api/tiles";
import {
  lynxActorControlMode,
  lynxButtonAction,
  lynxChipEnterAction,
  lynxChipMovementMask,
  lynxExitMovementMask,
  lynxRequiresReleaseToExit,
  lynxRulesetCatalog,
  lynxTileForcedFloorKind,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import {
  isLynxBlockedChipEnterRevealTile,
  lynxChipProbeUsesUnderlyingFloor,
} from "@ruleset-lynx/impl/tileEffects";
import {
  buildInitialChipTopologyEvidence,
  type InitialChipTopologyEvidenceBundle,
  type InitialChipTopologyPolicy,
} from "../impl/buildInitialChipTopologyEvidence";
import type { TworldLynxLevelFactsBundle } from "./buildTworldLynxLevelFacts";
import type { ProjectedTworldLynxLevel } from "./tworldLynxLevelProjection";

const POLICY_ID = "tworld-lynx-initial-chip-topology-v1";

export type TworldLynxInitialTraversalClassification = StaticTraversalClassV1;
export type TworldLynxTopologyCaveatKind = StaticTopologyCaveatKindV1;
export type TworldLynxTopologyPlacementExposure = StaticTopologySupportingPlacementV1;
export type TworldLynxTopologyCaveat = StaticTopologyCaveatV1;
export type TworldLynxTopologyOccupant = StaticTopologyOccupancyV1;
export type TworldLynxTopologyCellEvidence = StaticTopologyCellEvidenceV1;
export type TworldLynxStaticTopologyEvidence = StaticTopologyEvidenceV1;
export type TworldLynxStaticTopologyEvidenceBundle = InitialChipTopologyEvidenceBundle;

export interface BuildTworldLynxTopologyEvidenceInput {
  readonly factsBundle: TworldLynxLevelFactsBundle;
  readonly projected: ProjectedTworldLynxLevel;
  readonly policyRevision: string;
}

function tileIdBySourceToken(): ReadonlyMap<string, number> {
  const entries: Array<readonly [string, number]> = [];
  for (const definition of lynxRulesetCatalog.tiles.values()) {
    entries.push([definition.code, definition.id]);
  }
  for (const definition of lynxRulesetCatalog.actors.values()) {
    entries.push([definition.code, definition.id]);
  }
  entries.push(["tworld:ruleset-lynx/implicit-floor", MS_TILE.Empty]);
  return new Map(entries);
}

function normalizeActorTileId(tileId: number | null): number | null {
  if (tileId === null) return null;
  if (isMsStaticBlockTile(tileId)) return msStaticBlockActorId(tileId);
  return isMsCreature(tileId) ? msCreatureId(tileId) : tileId;
}

const LYNX_TOPOLOGY_POLICY: InitialChipTopologyPolicy = {
  target: "lynx",
  targetLabel: "Lynx",
  policyId: POLICY_ID,
  emptyTileId: MS_TILE.Empty,
  nothingTileId: MS_TILE.Nothing,
  directionMasks: {
    north: MS_DIRECTION.north,
    east: MS_DIRECTION.east,
    south: MS_DIRECTION.south,
    west: MS_DIRECTION.west,
  },
  tileIdBySourceToken: tileIdBySourceToken(),
  normalizeActorTileId,
  actorControlMode: lynxActorControlMode,
  isBlockActorId: isMsBlockActorId,
  chipProbeUsesUnderlyingFloor: lynxChipProbeUsesUnderlyingFloor,
  chipMovementMask: lynxChipMovementMask,
  exitMovementMask: lynxExitMovementMask,
  isBlockedChipEnterRevealTile: isLynxBlockedChipEnterRevealTile,
  tileHasTag: lynxTileHasTag,
  requiresReleaseToExit: lynxRequiresReleaseToExit,
  tileForcedFloorKind: lynxTileForcedFloorKind,
  buttonAction: lynxButtonAction,
  chipEnterAction: lynxChipEnterAction,
};

export async function buildTworldLynxTopologyEvidence(
  input: BuildTworldLynxTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<TworldLynxStaticTopologyEvidenceBundle> {
  return buildInitialChipTopologyEvidence({
    ...input,
    policy: LYNX_TOPOLOGY_POLICY,
  }, sha256);
}
