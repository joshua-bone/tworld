import type { CanonicalJsonValue, DirectionV1 } from "@tworld/ccsolver/domain";
import type { DecodedMsLevelData } from "@ruleset-ms/api/level";
import type { LynxLoadedLevelSource } from "@ruleset-lynx/api/levelLoader";
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
  lynxButtonAction,
  lynxChipEnterAction,
  lynxDoorKeyIndex,
  lynxFixedSlideDirection,
  lynxRulesetCatalog,
  lynxTileForcedFloorKind,
  lynxTileHasCapability,
  lynxTileHasTag,
} from "@ruleset-lynx/impl/catalog";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import {
  normalizeDecodedTworldLevelWithPolicy,
  projectLoadedTworldLevel,
  type ProjectedTworldLevel,
  type ProjectedTworldSourceMaterial as SharedProjectedTworldSourceMaterial,
  type ProjectedTworldSourceMember as SharedProjectedTworldSourceMember,
  type TworldLevelProjectionPolicy,
} from "../impl/tworldLevelProjection";

export interface ProjectedTworldSourceMember extends SharedProjectedTworldSourceMember {}

export interface ProjectedTworldSourceMaterial extends SharedProjectedTworldSourceMaterial {
  readonly members: readonly ProjectedTworldSourceMember[];
}

export interface ProjectedTworldLynxLevel extends ProjectedTworldLevel {
  readonly source: ProjectedTworldSourceMaterial;
}

export interface ProjectLoadedTworldLynxLevelInput {
  readonly catalogRevision: string;
  readonly containerBytes: Uint8Array;
  readonly loaded: LynxLoadedLevelSource;
}

function directionForLynxValue(direction: number): DirectionV1 | null {
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

const LYNX_PROJECTION_POLICY: TworldLevelProjectionPolicy<LynxLoadedLevelSource> = {
  target: "lynx",
  catalogId: "tworld:ruleset-lynx",
  implicitFloorSourceToken: "tworld:ruleset-lynx/implicit-floor",
  layerCountErrorSubject: "Tile World Lynx source",
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
    petCarrier: MS_TILE.PetCarrier,
  },
  decodeLoadedLevel: (loaded) => (
    lynxElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel(loaded)
  ),
  directionForSourceValue: directionForLynxValue,
  isCreature: isMsCreature,
  creatureDirection: msCreatureDir,
  creatureId: msCreatureId,
  isStaticBlockTile: isMsStaticBlockTile,
  staticBlockActorId: msStaticBlockActorId,
  tileCode: (elementId) => lynxRulesetCatalog.getTile(elementId)?.code ?? null,
  actorCode: (actorId) => lynxRulesetCatalog.getActor(actorId)?.code ?? null,
  chipEnterAction: lynxChipEnterAction,
  doorKeyIndex: lynxDoorKeyIndex,
  forcedFloorKind: lynxTileForcedFloorKind,
  slideDirection: lynxFixedSlideDirection,
  tileHasCapability: (elementId, capability) => lynxTileHasCapability(elementId, capability),
  tileHasTag: (elementId, tag) => lynxTileHasTag(elementId, tag),
  buttonAction: lynxButtonAction,
};

export function normalizeDecodedTworldLynxLevel(decoded: DecodedMsLevelData): CanonicalJsonValue {
  return normalizeDecodedTworldLevelWithPolicy(decoded, LYNX_PROJECTION_POLICY);
}

export function projectLoadedTworldLynxLevel(
  input: ProjectLoadedTworldLynxLevelInput,
): ProjectedTworldLynxLevel {
  return projectLoadedTworldLevel(input, LYNX_PROJECTION_POLICY);
}
