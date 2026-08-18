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
  msActorControlMode,
  msButtonAction,
  msChipEnterAction,
  msChipMovementMask,
  msExitMovementMask,
  msIsOverlayFloorTile,
  msRequiresReleaseToExit,
  msRulesetCatalog,
  msTileForcedFloorKind,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { isMsBlockedChipEnterRevealTile } from "@ruleset-ms/impl/tileEffects";
import {
  buildInitialChipTopologyEvidence,
  type InitialChipTopologyEvidenceBundle,
  type InitialChipTopologyPolicy,
} from "../impl/buildInitialChipTopologyEvidence";
import type { TworldMsLevelFactsBundle } from "./buildTworldMsLevelFacts";
import type { ProjectedTworldMsLevel } from "./tworldMsLevelProjection";

const POLICY_ID = "tworld-ms-initial-chip-topology-v1";

export type TworldMsInitialTraversalClassification = StaticTraversalClassV1;
export type TworldMsTopologyCaveatKind = StaticTopologyCaveatKindV1;
export type TworldMsTopologyPlacementExposure = StaticTopologySupportingPlacementV1;
export type TworldMsTopologyCaveat = StaticTopologyCaveatV1;
export type TworldMsTopologyOccupant = StaticTopologyOccupancyV1;
export type TworldMsTopologyCellEvidence = StaticTopologyCellEvidenceV1;
export type TworldMsStaticTopologyEvidence = StaticTopologyEvidenceV1;
export type TworldMsStaticTopologyEvidenceBundle = InitialChipTopologyEvidenceBundle;

export interface BuildTworldMsTopologyEvidenceInput {
  readonly factsBundle: TworldMsLevelFactsBundle;
  readonly projected: ProjectedTworldMsLevel;
  readonly policyRevision: string;
}

function tileIdBySourceToken(): ReadonlyMap<string, number> {
  const entries: Array<readonly [string, number]> = [];
  for (const definition of msRulesetCatalog.tiles.values()) {
    entries.push([definition.code, definition.id]);
  }
  for (const definition of msRulesetCatalog.actors.values()) {
    entries.push([definition.code, definition.id]);
  }
  entries.push(["tworld:ruleset-ms/implicit-floor", MS_TILE.Empty]);
  return new Map(entries);
}

function normalizeActorTileId(tileId: number | null): number | null {
  if (tileId === null) return null;
  if (isMsStaticBlockTile(tileId)) return msStaticBlockActorId(tileId);
  return isMsCreature(tileId) ? msCreatureId(tileId) : tileId;
}

const MS_TOPOLOGY_POLICY: InitialChipTopologyPolicy = {
  target: "ms",
  targetLabel: "MS",
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
  actorControlMode: msActorControlMode,
  isBlockActorId: isMsBlockActorId,
  chipProbeUsesUnderlyingFloor: msIsOverlayFloorTile,
  chipMovementMask: msChipMovementMask,
  exitMovementMask: msExitMovementMask,
  isBlockedChipEnterRevealTile: isMsBlockedChipEnterRevealTile,
  tileHasTag: msTileHasTag,
  requiresReleaseToExit: msRequiresReleaseToExit,
  tileForcedFloorKind: msTileForcedFloorKind,
  buttonAction: msButtonAction,
  chipEnterAction: msChipEnterAction,
};

export async function buildTworldMsTopologyEvidence(
  input: BuildTworldMsTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<TworldMsStaticTopologyEvidenceBundle> {
  return buildInitialChipTopologyEvidence({
    ...input,
    policy: MS_TOPOLOGY_POLICY,
  }, sha256);
}
