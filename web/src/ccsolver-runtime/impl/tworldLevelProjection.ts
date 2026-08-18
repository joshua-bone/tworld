import type {
  CanonicalJsonValue,
  DirectionV1,
  RulesetTargetV1,
} from "@tworld/ccsolver/domain";
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
} from "./decodedLegacyLevelProjection";

const MAX_LOGICAL_CELLS = 65_536;

export interface TworldLoadedLevelSource {
  readonly layerData: readonly Uint8Array[];
  readonly levelData: Uint8Array;
}

interface TworldDecodedConnection {
  readonly from: number;
  readonly to: number;
  readonly fromZ?: number;
  readonly toZ?: number;
}

interface TworldDecodedElement {
  readonly id: number;
  readonly state: number;
}

interface TworldDecodedCell {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
    readonly pos: number;
  };
  readonly top: TworldDecodedElement;
  readonly bottom: TworldDecodedElement;
}

interface TworldDecodedUnknownTile {
  readonly pos: number;
  readonly plane: LegacySourcePlane;
  readonly fileCode: number;
}

export interface TworldDecodedLevelLayer {
  readonly z: number;
  readonly number: number;
  readonly timeLimitSeconds: number;
  readonly chipsNeeded: number;
  readonly hintText: string;
  readonly cells: readonly TworldDecodedCell[];
  readonly traps: readonly TworldDecodedConnection[];
  readonly cloners: readonly TworldDecodedConnection[];
  readonly creaturePositions: readonly number[];
  readonly badTiles: boolean;
  readonly unknownTiles?: readonly TworldDecodedUnknownTile[];
}

export interface TworldDecodedLevel {
  readonly number: number;
  readonly timeLimitSeconds: number;
  readonly chipsNeeded: number;
  readonly hintText: string;
  readonly cells: readonly TworldDecodedCell[];
  readonly traps: readonly TworldDecodedConnection[];
  readonly cloners: readonly TworldDecodedConnection[];
  readonly creaturePositions: readonly number[];
  readonly badTiles: boolean;
  readonly unknownTiles?: readonly TworldDecodedUnknownTile[];
  readonly layers?: readonly TworldDecodedLevelLayer[];
}

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

export interface ProjectedTworldLevel {
  readonly source: ProjectedTworldSourceMaterial;
  readonly level: ProjectedLegacyLevel;
  readonly normalizedMap: CanonicalJsonValue;
}

export interface ProjectLoadedTworldLevelInput<TLoaded extends TworldLoadedLevelSource> {
  readonly catalogRevision: string;
  readonly containerBytes: Uint8Array;
  readonly loaded: TLoaded;
}

export interface TworldLevelProjectionPolicy<TLoaded extends TworldLoadedLevelSource> {
  readonly target: RulesetTargetV1;
  readonly catalogId: string;
  readonly implicitFloorSourceToken: string;
  readonly layerCountErrorSubject: string;
  readonly width: number;
  readonly height: number;
  readonly tileIds: {
    readonly empty: number;
    readonly nothing: number;
    readonly chip: number;
    readonly waterBoots: number;
    readonly fireBoots: number;
    readonly redKey: number;
    readonly greenDoor: number;
    readonly cloneMachine: number;
  };
  decodeLoadedLevel(loaded: TLoaded): TworldDecodedLevel;
  directionForSourceValue(direction: number): DirectionV1 | null;
  isCreature(elementId: number): boolean;
  creatureDirection(elementId: number): number;
  creatureId(elementId: number): number;
  isStaticBlockTile(elementId: number): boolean;
  staticBlockActorId(elementId: number): number | null;
  tileCode(elementId: number): string | null;
  actorCode(actorId: number): string | null;
  chipEnterAction(elementId: number): string;
  doorKeyIndex(elementId: number): number | null;
  forcedFloorKind(elementId: number): string;
  slideDirection(elementId: number): number;
  tileHasCapability(elementId: number, capability: "collect-on-entry"): boolean;
  tileHasTag(elementId: number, tag: "button" | "cloner" | "exit" | "trap"): boolean;
  buttonAction(elementId: number): string;
}

function neutralCatalogCode(code: string): string {
  const separator = code.indexOf(":");
  const localName = separator >= 0 ? code.slice(separator + 1) : code;
  return `cc1:${localName.replaceAll("_", "-")}`;
}

function encodedInitialState(state: number): string | null {
  return state === 0 ? null : `source-state:0x${state.toString(16).padStart(2, "0")}`;
}

function semanticTypeForTile<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): string | null {
  const code = policy.tileCode(elementId);
  return code === null ? null : neutralCatalogCode(code);
}

function resourceSourceFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  semanticType: string,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedResourceSource | undefined {
  const action = policy.chipEnterAction(elementId);
  if (action !== "collect-chip" && action !== "collect-item") {
    return undefined;
  }
  return { resourceType: semanticType, amount: 1 };
}

function resourceGateFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedResourceGate | undefined {
  if (policy.chipEnterAction(elementId) === "open-socket") {
    const resourceType = semanticTypeForTile(policy.tileIds.chip, policy);
    return resourceType ? { kind: "remaining-zero", resourceType } : undefined;
  }

  const keyIndex = policy.doorKeyIndex(elementId);
  if (keyIndex === null) {
    return undefined;
  }
  const resourceType = semanticTypeForTile(policy.tileIds.redKey + keyIndex, policy);
  if (!resourceType) {
    return undefined;
  }
  return elementId === policy.tileIds.greenDoor
    ? { kind: "possess", resourceType, amount: 1 }
    : { kind: "consume", resourceType, amount: 1 };
}

function forcedSurfaceFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedForcedSurface | undefined {
  switch (policy.forcedFloorKind(elementId)) {
    case "slide":
      return {
        motion: "force",
        direction: policy.directionForSourceValue(policy.slideDirection(elementId)),
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

function hazardFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  semanticType: string,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedHazard | undefined {
  switch (policy.chipEnterAction(elementId)) {
    case "water-death":
      return {
        hazardType: semanticType,
        persistence: "persistent",
        protectionResources: [semanticTypeForTile(policy.tileIds.waterBoots, policy)!],
      };
    case "fire-death":
      return {
        hazardType: semanticType,
        persistence: "persistent",
        protectionResources: [semanticTypeForTile(policy.tileIds.fireBoots, policy)!],
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

function transportFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedTransport | undefined {
  return policy.forcedFloorKind(elementId) === "teleport"
    ? {
        kind: "cc1:teleport",
        routingPolicy: "reverse-reading-order-cyclic",
      }
    : undefined;
}

function wiringRolesFor<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedCatalogElement["wiringRoles"] {
  const roles: Array<{ role: "source" | "target"; kind: string }> = [];
  switch (policy.buttonAction(elementId)) {
    case "spring-trap":
      roles.push({ role: "source", kind: "trap" });
      break;
    case "activate-cloner":
      roles.push({ role: "source", kind: "cloner" });
      break;
    default:
      break;
  }
  if (policy.tileHasTag(elementId, "trap")) {
    roles.push({ role: "target", kind: "trap" });
  }
  if (policy.tileHasTag(elementId, "cloner")) {
    roles.push({ role: "target", kind: "cloner" });
  }
  return roles.length > 0 ? roles : undefined;
}

function projectCatalogElement<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  state: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedCatalogElement | null {
  const staticActorId = policy.isStaticBlockTile(elementId)
    ? policy.staticBlockActorId(elementId)
    : null;
  const actorId = staticActorId ?? (policy.isCreature(elementId) ? policy.creatureId(elementId) : null);
  if (actorId !== null) {
    const actorCode = policy.actorCode(actorId);
    if (actorCode === null) {
      return null;
    }
    const sourceCode = policy.tileCode(elementId) ?? actorCode;
    const semanticType = neutralCatalogCode(actorCode);
    return {
      semanticType,
      sourceToken: sourceCode,
      stratum: "actor",
      interpretation: "known",
      facing: staticActorId === null
        ? policy.directionForSourceValue(policy.creatureDirection(elementId))
        : null,
      initialState: encodedInitialState(state),
      actor: {
        semanticType,
        disposition: "active",
      },
    };
  }

  const sourceCode = policy.tileCode(elementId);
  if (sourceCode === null) {
    return null;
  }
  const redundantEmptyFloor = elementId === policy.tileIds.empty || elementId === policy.tileIds.nothing;
  const semanticType = redundantEmptyFloor ? "cc1:floor" : neutralCatalogCode(sourceCode);
  return {
    semanticType,
    sourceToken: sourceCode,
    stratum: policy.tileHasCapability(elementId, "collect-on-entry")
      ? "pickup"
      : policy.tileHasTag(elementId, "button")
        ? "overlay"
        : "terrain",
    interpretation: "known",
    facing: null,
    initialState: encodedInitialState(state),
    redundantEmptyFloor,
    containsActors: elementId === policy.tileIds.cloneMachine,
    exit: policy.tileHasTag(elementId, "exit") || undefined,
    resourceSource: resourceSourceFor(elementId, semanticType, policy),
    resourceGate: resourceGateFor(elementId, policy),
    forcedSurface: forcedSurfaceFor(elementId, policy),
    hazard: hazardFor(elementId, semanticType, policy),
    transport: transportFor(elementId, policy),
    wiringRoles: wiringRolesFor(elementId, policy),
  };
}

function unknownElementsForLayer(layer: TworldDecodedLevelLayer): DecodedUnknownLegacyElement[] {
  return (layer.unknownTiles ?? []).map((unknown) => ({
    pos: unknown.pos,
    plane: unknown.plane,
    elementToken: `0x${unknown.fileCode.toString(16).padStart(2, "0")}`,
  }));
}

function projectDecodedLayers(decoded: TworldDecodedLevel): DecodedLegacyLayer[] | undefined {
  return decoded.layers?.map((layer) => ({
    ...layer,
    unknownElements: unknownElementsForLayer(layer),
  }));
}

function sourceMembers(loaded: TworldLoadedLevelSource): ProjectedTworldSourceMember[] {
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

function assertLoadedSourceCoherence<TLoaded extends TworldLoadedLevelSource>(
  input: ProjectLoadedTworldLevelInput<TLoaded>,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): void {
  const { layerData, levelData } = input.loaded;
  const maxLayers = MAX_LOGICAL_CELLS / (policy.width * policy.height);
  if (layerData.length === 0 || layerData.length > maxLayers) {
    throw new Error(`${policy.layerCountErrorSubject} must contain 1 through ${maxLayers} logical layers`);
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

function neutralSourceElementType<TLoaded extends TworldLoadedLevelSource>(
  elementId: number,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): string {
  if (elementId === policy.tileIds.empty || elementId === policy.tileIds.nothing) {
    return "cc1:floor";
  }
  const staticActorId = policy.isStaticBlockTile(elementId)
    ? policy.staticBlockActorId(elementId)
    : null;
  const actorId = staticActorId ?? (policy.isCreature(elementId) ? policy.creatureId(elementId) : null);
  const code = policy.tileCode(elementId) ?? (actorId === null ? null : policy.actorCode(actorId));
  if (code === null) {
    throw new Error(`decoded Tile World element ${elementId} has no registered source identity`);
  }
  return neutralCatalogCode(code);
}

function normalizedSourceElement<TLoaded extends TworldLoadedLevelSource>(
  layer: TworldDecodedLevelLayer,
  pos: number,
  plane: LegacySourcePlane,
  element: TworldDecodedElement,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): CanonicalJsonValue {
  const unknown = layer.unknownTiles?.find((entry) => entry.pos === pos && entry.plane === plane);
  return {
    facing: policy.isCreature(element.id)
      ? policy.directionForSourceValue(policy.creatureDirection(element.id))
      : null,
    semanticType: unknown === undefined
      ? neutralSourceElementType(element.id, policy)
      : `cc1:unknown-0x${unknown.fileCode.toString(16).padStart(2, "0")}`,
    state: element.state,
  };
}

function decodedSourceLayers(decoded: TworldDecodedLevel): readonly TworldDecodedLevelLayer[] {
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

export function normalizeDecodedTworldLevelWithPolicy<TLoaded extends TworldLoadedLevelSource>(
  decoded: TworldDecodedLevel,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): CanonicalJsonValue {
  const layers = decodedSourceLayers(decoded);
  return {
    format: "ccsolver-normalized-gameplay-map",
    formatVersion: 1,
    geometry: {
      depth: layers.length,
      height: policy.height,
      width: policy.width,
    },
    requiredCollectibles: decoded.chipsNeeded,
    timeLimitSeconds: decoded.timeLimitSeconds,
    layers: layers.map((layer) => ({
      actorOrder: [...layer.creaturePositions],
      cells: layer.cells.map((cell) => ({
        bottom: normalizedSourceElement(layer, cell.position.pos, "lower", cell.bottom, policy),
        top: normalizedSourceElement(layer, cell.position.pos, "upper", cell.top, policy),
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

export function projectLoadedTworldLevel<TLoaded extends TworldLoadedLevelSource>(
  input: ProjectLoadedTworldLevelInput<TLoaded>,
  policy: TworldLevelProjectionPolicy<TLoaded>,
): ProjectedTworldLevel {
  assertLoadedSourceCoherence(input, policy);
  const implicitTerrain = projectCatalogElement(policy.tileIds.empty, 0, policy)!;
  const catalog: LegacyElementCatalogProjection = {
    catalogId: policy.catalogId,
    catalogRevision: input.catalogRevision,
    implicitTerrain: {
      ...implicitTerrain,
      sourceToken: policy.implicitFloorSourceToken,
    },
    project(elementId, context) {
      return projectCatalogElement(elementId, context.state, policy);
    },
  };
  const decoded = policy.decodeLoadedLevel(input.loaded);
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
    normalizedMap: normalizeDecodedTworldLevelWithPolicy(decoded, policy),
    level: projectDecodedLegacyLevel({
      target: policy.target,
      width: policy.width,
      height: policy.height,
      catalog,
      decoded: projectedDecoded,
    }),
  };
}
