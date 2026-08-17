import type { CanonicalJsonValue, DirectionV1 } from "@tworld/ccsolver/domain";
import type { DecodedMsLevelData, DecodedMsLevelLayerData } from "@ruleset-ms/api/level";
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
  projectDecodedLegacyLevel,
  type DecodedLegacyLayer,
  type DecodedUnknownLegacyElement,
  type LegacyElementCatalogProjection,
  type LegacySourcePlane,
  type ProjectedCatalogElement,
  type ProjectedForcedSurface,
  type ProjectedHazard,
  type ProjectedLegacyLevel,
  type ProjectedResourceGate,
  type ProjectedResourceSource,
  type ProjectedTransport,
} from "../impl/decodedLegacyLevelProjection";

const TWORLD_MS_CATALOG_ID = "tworld:ruleset-ms";
const MAX_TWORLD_LAYERS = 65_536 / (MS_GRID_WIDTH * MS_GRID_HEIGHT);

export interface ProjectedTworldSourceMember {
  readonly ordinal: number;
  readonly role: "level" | "layer";
  readonly z: number;
  readonly bytes: Uint8Array;
}

export interface ProjectedTworldSourceMaterial {
  readonly format: "tworld-dat";
  readonly containerBytes: Uint8Array;
  readonly members: readonly ProjectedTworldSourceMember[];
}

export interface ProjectedTworldMsLevel {
  readonly source: ProjectedTworldSourceMaterial;
  readonly level: ProjectedLegacyLevel;
  readonly normalizedMap: CanonicalJsonValue;
}

export interface ProjectLoadedTworldMsLevelInput {
  readonly catalogRevision: string;
  readonly containerBytes: Uint8Array;
  readonly loaded: MsLoadedLevelSource;
}

function neutralCatalogCode(code: string): string {
  const separator = code.indexOf(":");
  const localName = separator >= 0 ? code.slice(separator + 1) : code;
  return `cc1:${localName.replaceAll("_", "-")}`;
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

function encodedInitialState(state: number): string | null {
  return state === 0 ? null : `source-state:0x${state.toString(16).padStart(2, "0")}`;
}

function resourceSourceFor(elementId: number, semanticType: string): ProjectedResourceSource | undefined {
  const action = msChipEnterAction(elementId);
  if (action !== "collect-chip" && action !== "collect-item") {
    return undefined;
  }
  return { resourceType: semanticType, amount: 1 };
}

function semanticTypeForTile(elementId: number): string | null {
  const definition = msRulesetCatalog.getTile(elementId);
  return definition ? neutralCatalogCode(definition.code) : null;
}

function resourceGateFor(elementId: number): ProjectedResourceGate | undefined {
  if (msChipEnterAction(elementId) === "open-socket") {
    const resourceType = semanticTypeForTile(MS_TILE.ICChip);
    return resourceType ? { kind: "remaining-zero", resourceType } : undefined;
  }

  const keyIndex = msDoorKeyIndex(elementId);
  if (keyIndex === null) {
    return undefined;
  }
  const resourceType = semanticTypeForTile(MS_TILE.Key_Red + keyIndex);
  if (!resourceType) {
    return undefined;
  }
  return elementId === MS_TILE.Door_Green
    ? { kind: "possess", resourceType, amount: 1 }
    : { kind: "consume", resourceType, amount: 1 };
}

function forcedSurfaceFor(elementId: number): ProjectedForcedSurface | undefined {
  switch (msTileForcedFloorKind(elementId)) {
    case "slide":
      return {
        motion: "force",
        direction: directionForMsValue(msSlideDirection(elementId, MS_DIRECTION.none)),
        turn: null,
      };
    case "ice":
      return {
        motion: "ice",
        direction: null,
        turn: null,
      };
    default:
      return undefined;
  }
}

function hazardFor(elementId: number, semanticType: string): ProjectedHazard | undefined {
  switch (msChipEnterAction(elementId)) {
    case "water-death":
      return {
        hazardType: semanticType,
        persistence: "persistent",
        protectionResources: [semanticTypeForTile(MS_TILE.Boots_Water)!],
      };
    case "fire-death":
      return {
        hazardType: semanticType,
        persistence: "persistent",
        protectionResources: [semanticTypeForTile(MS_TILE.Boots_Fire)!],
      };
    case "explode-bomb":
      return {
        hazardType: semanticType,
        persistence: "single-use",
        protectionResources: [],
      };
    default:
      return undefined;
  }
}

function transportFor(elementId: number): ProjectedTransport | undefined {
  return msTileForcedFloorKind(elementId) === "teleport"
    ? {
        kind: "cc1:teleport",
        routingPolicy: "reverse-reading-order-cyclic",
      }
    : undefined;
}

function wiringRolesFor(elementId: number): ProjectedCatalogElement["wiringRoles"] {
  const roles: Array<{ role: "source" | "target"; kind: string }> = [];
  switch (msButtonAction(elementId)) {
    case "spring-trap":
      roles.push({ role: "source", kind: "trap" });
      break;
    case "activate-cloner":
      roles.push({ role: "source", kind: "cloner" });
      break;
    default:
      break;
  }
  if (msTileHasTag(elementId, "trap")) {
    roles.push({ role: "target", kind: "trap" });
  }
  if (msTileHasTag(elementId, "cloner")) {
    roles.push({ role: "target", kind: "cloner" });
  }
  return roles.length > 0 ? roles : undefined;
}

function projectMsCatalogElement(
  elementId: number,
  state: number,
  _plane: LegacySourcePlane,
): ProjectedCatalogElement | null {
  const staticActorId = isMsStaticBlockTile(elementId) ? msStaticBlockActorId(elementId) : null;
  const actorId = staticActorId ?? (isMsCreature(elementId) ? msCreatureId(elementId) : null);
  if (actorId !== null) {
    const actorDefinition = msRulesetCatalog.getActor(actorId);
    if (!actorDefinition) {
      return null;
    }
    const sourceDefinition = msRulesetCatalog.getTile(elementId) ?? actorDefinition;
    const semanticType = neutralCatalogCode(actorDefinition.code);
    return {
      semanticType,
      sourceToken: sourceDefinition.code,
      stratum: "actor",
      interpretation: "known",
      facing: staticActorId === null ? directionForMsValue(msCreatureDir(elementId)) : null,
      initialState: encodedInitialState(state),
      actor: {
        semanticType,
        disposition: "active",
      },
    };
  }

  const definition = msRulesetCatalog.getTile(elementId);
  if (!definition) {
    return null;
  }
  const redundantEmptyFloor = elementId === MS_TILE.Empty || elementId === MS_TILE.Nothing;
  const semanticType = redundantEmptyFloor ? "cc1:floor" : neutralCatalogCode(definition.code);
  return {
    semanticType,
    sourceToken: definition.code,
    stratum: msTileHasCapability(elementId, "collect-on-entry")
      ? "pickup"
      : msTileHasTag(elementId, "button")
        ? "overlay"
        : "terrain",
    interpretation: "known",
    facing: null,
    initialState: encodedInitialState(state),
    redundantEmptyFloor,
    containsActors: elementId === MS_TILE.CloneMachine || elementId === MS_TILE.PetCarrier,
    exit: msTileHasTag(elementId, "exit") || undefined,
    resourceSource: resourceSourceFor(elementId, semanticType),
    resourceGate: resourceGateFor(elementId),
    forcedSurface: forcedSurfaceFor(elementId),
    hazard: hazardFor(elementId, semanticType),
    transport: transportFor(elementId),
    wiringRoles: wiringRolesFor(elementId),
  };
}

function unknownElementsForLayer(layer: DecodedMsLevelLayerData): DecodedUnknownLegacyElement[] {
  return (layer.unknownTiles ?? []).map((unknown) => ({
    pos: unknown.pos,
    plane: unknown.plane,
    elementToken: `0x${unknown.fileCode.toString(16).padStart(2, "0")}`,
  }));
}

function projectDecodedLayers(decoded: DecodedMsLevelData): DecodedLegacyLayer[] | undefined {
  return decoded.layers?.map((layer) => ({
    ...layer,
    unknownElements: unknownElementsForLayer(layer),
  }));
}

function sourceMembers(loaded: MsLoadedLevelSource): ProjectedTworldSourceMember[] {
  return loaded.layerData.map((bytes, ordinal) => ({
    ordinal,
    role: ordinal === 0 ? "level" : "layer",
    z: ordinal,
    bytes: new Uint8Array(bytes),
  }));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}

function containsBytes(container: Uint8Array, member: Uint8Array): boolean {
  if (member.byteLength === 0) return true;
  if (member.byteLength > container.byteLength) return false;
  const prefix = new Uint32Array(member.byteLength);
  for (let index = 1, matched = 0; index < member.byteLength; index += 1) {
    while (matched > 0 && member[index] !== member[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (member[index] === member[matched]) matched += 1;
    prefix[index] = matched;
  }
  for (let index = 0, matched = 0; index < container.byteLength; index += 1) {
    while (matched > 0 && container[index] !== member[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (container[index] === member[matched]) matched += 1;
    if (matched === member.byteLength) return true;
  }
  return false;
}

function assertLoadedSourceCoherence(input: ProjectLoadedTworldMsLevelInput): void {
  const { layerData, levelData } = input.loaded;
  if (layerData.length === 0 || layerData.length > MAX_TWORLD_LAYERS) {
    throw new Error(`Tile World source must contain 1 through ${MAX_TWORLD_LAYERS} logical layers`);
  }
  if (!equalBytes(levelData, layerData[0]!)) {
    throw new Error("primary level bytes must exactly match occurrence member z=0");
  }
  for (let index = 0; index < layerData.length; index += 1) {
    if (!containsBytes(input.containerBytes, layerData[index]!)) {
      throw new Error(`occurrence member ${index} is not present in its source container`);
    }
  }
}

function neutralSourceElementType(elementId: number): string {
  if (elementId === MS_TILE.Empty || elementId === MS_TILE.Nothing) {
    return "cc1:floor";
  }
  const staticActorId = isMsStaticBlockTile(elementId) ? msStaticBlockActorId(elementId) : null;
  const actorId = staticActorId ?? (isMsCreature(elementId) ? msCreatureId(elementId) : null);
  const definition = msRulesetCatalog.getTile(elementId)
    ?? (actorId === null ? undefined : msRulesetCatalog.getActor(actorId));
  if (!definition) {
    throw new Error(`decoded Tile World element ${elementId} has no registered source identity`);
  }
  return neutralCatalogCode(definition.code);
}

function normalizedSourceElement(
  layer: DecodedMsLevelLayerData,
  pos: number,
  plane: LegacySourcePlane,
  element: { readonly id: number; readonly state: number },
): CanonicalJsonValue {
  const unknown = layer.unknownTiles?.find((entry) => entry.pos === pos && entry.plane === plane);
  return {
    facing: isMsCreature(element.id)
      ? directionForMsValue(msCreatureDir(element.id))
      : null,
    semanticType: unknown === undefined
      ? neutralSourceElementType(element.id)
      : `cc1:unknown-0x${unknown.fileCode.toString(16).padStart(2, "0")}`,
    state: element.state,
  };
}

function decodedSourceLayers(decoded: DecodedMsLevelData): readonly DecodedMsLevelLayerData[] {
  return decoded.layers ?? [{
    z: 1,
    number: decoded.number,
    timeLimitSeconds: decoded.timeLimitSeconds,
    chipsNeeded: decoded.chipsNeeded,
    hintText: decoded.hintText,
    cells: decoded.cells,
    traps: decoded.traps,
    cloners: decoded.cloners,
    creaturePositions: decoded.creaturePositions,
    badTiles: decoded.badTiles,
    unknownTiles: decoded.unknownTiles,
  }];
}

export function normalizeDecodedTworldLevel(decoded: DecodedMsLevelData): CanonicalJsonValue {
  const layers = decodedSourceLayers(decoded);
  return {
    format: "ccsolver-normalized-gameplay-map",
    formatVersion: 1,
    geometry: {
      depth: layers.length,
      height: MS_GRID_HEIGHT,
      width: MS_GRID_WIDTH,
    },
    requiredCollectibles: decoded.chipsNeeded,
    timeLimitSeconds: decoded.timeLimitSeconds,
    layers: layers.map((layer) => ({
      actorOrder: [...layer.creaturePositions],
      cells: layer.cells.map((cell) => ({
        bottom: normalizedSourceElement(layer, cell.position.pos, "lower", cell.bottom),
        top: normalizedSourceElement(layer, cell.position.pos, "upper", cell.top),
      })),
      cloners: layer.cloners.map((connection) => ({
        from: connection.from,
        fromZ: connection.fromZ ?? layer.z,
        to: connection.to,
        toZ: connection.toZ ?? layer.z,
      })),
      traps: layer.traps.map((connection) => ({
        from: connection.from,
        fromZ: connection.fromZ ?? layer.z,
        to: connection.to,
        toZ: connection.toZ ?? layer.z,
      })),
      z: layer.z - 1,
    })),
  };
}

export function projectLoadedTworldMsLevel(input: ProjectLoadedTworldMsLevelInput): ProjectedTworldMsLevel {
  assertLoadedSourceCoherence(input);
  const implicitTerrain = projectMsCatalogElement(MS_TILE.Empty, 0, "lower")!;
  const catalog: LegacyElementCatalogProjection = {
    catalogId: TWORLD_MS_CATALOG_ID,
    catalogRevision: input.catalogRevision,
    implicitTerrain: {
      ...implicitTerrain,
      sourceToken: "tworld:ruleset-ms/implicit-floor",
    },
    project(elementId, context) {
      return projectMsCatalogElement(elementId, context.state, context.plane);
    },
  };
  const decoded = msElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel(input.loaded);
  const projectedDecoded = {
    ...decoded,
    layers: projectDecodedLayers(decoded),
  };

  return {
    source: {
      format: "tworld-dat",
      containerBytes: new Uint8Array(input.containerBytes),
      members: sourceMembers(input.loaded),
    },
    normalizedMap: normalizeDecodedTworldLevel(decoded),
    level: projectDecodedLegacyLevel({
      target: "ms",
      width: MS_GRID_WIDTH,
      height: MS_GRID_HEIGHT,
      catalog,
      decoded: projectedDecoded,
    }),
  };
}
