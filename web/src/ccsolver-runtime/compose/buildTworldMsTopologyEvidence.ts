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
import {
  composeTworldMsLevelFacts,
  type BuildTworldMsLevelFactsInput,
  type TworldMsLevelFactsBundle,
} from "./buildTworldMsLevelFacts";
import { projectVerifiedTworldLevelFacts } from "./projectVerifiedTworldLevelFacts";
import {
  projectLoadedTworldMsLevel,
  type ProjectedTworldMsLevel,
} from "./tworldMsLevelProjection";

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
  readonly policyRevision: string;
}

export interface ComposedTworldMsTopologyEvidence {
  readonly projected: ProjectedTworldMsLevel;
  readonly topology: TworldMsStaticTopologyEvidenceBundle;
}

export interface BuildFreshTworldMsTopologyEvidenceInput extends BuildTworldMsLevelFactsInput {
  readonly policyRevision: string;
}

export interface ComposedFreshTworldMsTopologyEvidence extends ComposedTworldMsTopologyEvidence {
  readonly levelFacts: TworldMsLevelFactsBundle;
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

async function buildTworldMsTopologyEvidenceFromFreshProjection(
  input: BuildTworldMsTopologyEvidenceInput,
  projected: ProjectedTworldMsLevel,
  sha256: Sha256Port,
): Promise<TworldMsStaticTopologyEvidenceBundle> {
  return buildInitialChipTopologyEvidence({
    ...input,
    projected,
    policy: MS_TOPOLOGY_POLICY,
  }, sha256);
}

/**
 * Raw-source composition path used by static analysis. The projection cannot
 * be supplied independently: it is created together with the facts it feeds.
 */
export async function composeFreshTworldMsTopologyEvidence(
  input: BuildFreshTworldMsTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<ComposedFreshTworldMsTopologyEvidence> {
  const { levelFacts, projected } = await composeTworldMsLevelFacts(input, sha256);
  const topology = await buildTworldMsTopologyEvidenceFromFreshProjection({
    factsBundle: levelFacts,
    policyRevision: input.policyRevision,
  }, projected, sha256);
  return { levelFacts, projected, topology };
}

export async function composeTworldMsTopologyEvidence(
  input: BuildTworldMsTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<ComposedTworldMsTopologyEvidence> {
  const projected = await projectVerifiedTworldLevelFacts({
    factsBundle: input.factsBundle,
    target: "ms",
    targetLabel: "MS",
    catalogId: "tworld:ruleset-ms",
    project: projectLoadedTworldMsLevel,
  }, sha256);
  const topology = await buildTworldMsTopologyEvidenceFromFreshProjection(
    input,
    projected,
    sha256,
  );
  return { projected, topology };
}

export async function buildTworldMsTopologyEvidence(
  input: BuildTworldMsTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<TworldMsStaticTopologyEvidenceBundle> {
  return (await composeTworldMsTopologyEvidence(input, sha256)).topology;
}
