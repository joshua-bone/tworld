import type { CanonicalJsonValue, DirectionV1 } from "@tworld/ccsolver/domain";
import type { DecodedMsLevelData } from "@ruleset-ms/api/level";
import type { MsLoadedLevelSource } from "@ruleset-ms/api/levelLoader";
import {
  MS_DIRECTION,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_TILE,
  isMsCreature,
  isMsStaticBlockTile,
  msCreatureDir,
  msCreatureId,
  msStaticBlockActorId,
} from "@ruleset-ms/api/tiles";
import {
  msButtonAction,
  msChipEnterAction,
  msDoorKeyIndex,
  msRulesetCatalog,
  msSlideDirection,
  msTileForcedFloorKind,
  msTileHasCapability,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { msElementFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import {
  normalizeDecodedTworldLevelWithPolicy,
  projectLoadedTworldLevel,
  type ProjectedTworldLevel,
  type ProjectedTworldSourceMaterial as SharedProjectedTworldSourceMaterial,
  type ProjectedTworldSourceMember as SharedProjectedTworldSourceMember,
  type TworldLevelProjectionPolicy,
} from "../impl/tworldLevelProjection";
import { assertTworldSolverSourceEligibility } from "./sourceValidity/assertTworldSolverSourceEligibility";

export interface ProjectedTworldSourceMember extends SharedProjectedTworldSourceMember {}

export interface ProjectedTworldSourceMaterial extends SharedProjectedTworldSourceMaterial {
  readonly members: readonly ProjectedTworldSourceMember[];
}

export interface ProjectedTworldMsLevel extends ProjectedTworldLevel {
  readonly source: ProjectedTworldSourceMaterial;
}

export interface ProjectLoadedTworldMsLevelInput {
  readonly catalogRevision: string;
  readonly containerBytes: Uint8Array;
  readonly loaded: MsLoadedLevelSource;
}

function directionForMsValue(direction: number): DirectionV1 | null {
  switch (direction) {
    case MS_DIRECTION.north:
      return "north";
    case MS_DIRECTION.east:
      return "east";
    case MS_DIRECTION.south:
      return "south";
    case MS_DIRECTION.west:
      return "west";
    default:
      return null;
  }
}

const MS_PROJECTION_POLICY: TworldLevelProjectionPolicy<MsLoadedLevelSource> = {
  target: "ms",
  catalogId: "tworld:ruleset-ms",
  implicitFloorSourceToken: "tworld:ruleset-ms/implicit-floor",
  layerCountErrorSubject: "Tile World source",
  width: MS_GRID_WIDTH,
  height: MS_GRID_HEIGHT,
  tileIds: {
    empty: MS_TILE.Empty,
    nothing: MS_TILE.Nothing,
    chip: MS_TILE.ICChip,
    waterBoots: MS_TILE.Boots_Water,
    fireBoots: MS_TILE.Boots_Fire,
    redKey: MS_TILE.Key_Red,
    greenDoor: MS_TILE.Door_Green,
    cloneMachine: MS_TILE.CloneMachine,
  },
  decodeLoadedLevel: (loaded) => (
    msElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel(loaded)
  ),
  directionForSourceValue: directionForMsValue,
  isCreature: isMsCreature,
  creatureDirection: msCreatureDir,
  creatureId: msCreatureId,
  isStaticBlockTile: isMsStaticBlockTile,
  staticBlockActorId: msStaticBlockActorId,
  tileCode: (elementId) => msRulesetCatalog.getTile(elementId)?.code ?? null,
  actorCode: (actorId) => msRulesetCatalog.getActor(actorId)?.code ?? null,
  chipEnterAction: msChipEnterAction,
  doorKeyIndex: msDoorKeyIndex,
  forcedFloorKind: msTileForcedFloorKind,
  slideDirection: (elementId) => msSlideDirection(elementId, MS_DIRECTION.none),
  tileHasCapability: (elementId, capability) => msTileHasCapability(elementId, capability),
  tileHasTag: (elementId, tag) => msTileHasTag(elementId, tag),
  buttonAction: msButtonAction,
};

export function normalizeDecodedTworldLevel(decoded: DecodedMsLevelData): CanonicalJsonValue {
  return normalizeDecodedTworldLevelWithPolicy(decoded, MS_PROJECTION_POLICY);
}

export function projectLoadedTworldMsLevel(
  input: ProjectLoadedTworldMsLevelInput,
): ProjectedTworldMsLevel {
  assertTworldSolverSourceEligibility({ layerData: input.loaded.layerData });
  return projectLoadedTworldLevel(input, MS_PROJECTION_POLICY);
}
