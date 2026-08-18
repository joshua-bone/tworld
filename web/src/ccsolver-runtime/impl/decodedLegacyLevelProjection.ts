import type {
  CoordinateV1,
  DirectionV1,
  PlacementStratumV1,
  RulesetTargetV1,
} from "@tworld/ccsolver/domain";

const MAX_LOGICAL_CELLS = 65_536;

export type LegacySourcePlane = "lower" | "upper";
export type ProjectedLegacySourcePlane = LegacySourcePlane | "implicit";

export interface ProjectedResourceSource {
  readonly resourceType: string;
  readonly amount: number;
}

export interface ProjectedResourceGate {
  readonly kind: "consume" | "possess" | "remaining-zero";
  readonly resourceType: string;
  readonly amount?: number;
}

export interface ProjectedForcedSurface {
  readonly motion: "force" | "ice";
  readonly direction: DirectionV1 | null;
  readonly turn: "left" | "right" | "reverse" | null;
}

export interface ProjectedHazard {
  readonly hazardType: string;
  readonly persistence: "persistent" | "single-use";
  readonly protectionResources: readonly string[];
}

export interface ProjectedTransport {
  readonly kind: string;
  readonly routingPolicy: string;
}

export interface ProjectedCatalogElement {
  readonly semanticType: string;
  readonly sourceToken: string;
  readonly stratum: PlacementStratumV1;
  readonly interpretation?: "known" | "unknown";
  readonly facing: DirectionV1 | null;
  readonly initialState?: string | null;
  readonly redundantEmptyFloor?: boolean;
  readonly containsActors?: boolean;
  readonly actor?: {
    readonly semanticType: string;
    readonly disposition: "active" | "contained" | "dormant";
  };
  readonly exit?: boolean;
  readonly resourceSource?: ProjectedResourceSource;
  readonly resourceGate?: ProjectedResourceGate;
  readonly forcedSurface?: ProjectedForcedSurface;
  readonly hazard?: ProjectedHazard;
  readonly transport?: ProjectedTransport;
  readonly wiringRoles?: readonly {
    readonly role: "source" | "target";
    readonly kind: string;
  }[];
}

export interface LegacyElementCatalogProjection {
  readonly catalogId: string;
  readonly catalogRevision: string;
  readonly implicitTerrain?: ProjectedCatalogElement;
  project(
    elementId: number,
    context: {
      readonly state: number;
      readonly plane: LegacySourcePlane;
      readonly coordinate: CoordinateV1;
    },
  ): ProjectedCatalogElement | null;
}

export interface DecodedLegacyConnection {
  readonly from: number;
  readonly to: number;
  readonly fromZ?: number;
  readonly toZ?: number;
}

export interface DecodedLegacyCell {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z?: number;
    readonly pos: number;
  };
  readonly top: { readonly id: number; readonly state: number };
  readonly bottom: { readonly id: number; readonly state: number };
}

export interface DecodedUnknownLegacyElement {
  readonly pos: number;
  readonly plane: LegacySourcePlane;
  readonly elementToken: string;
}

export interface DecodedLegacyLayer {
  readonly z: number;
  readonly number: number;
  readonly cells: readonly DecodedLegacyCell[];
  readonly creaturePositions: readonly number[];
  readonly traps: readonly DecodedLegacyConnection[];
  readonly cloners: readonly DecodedLegacyConnection[];
  readonly unknownElements?: readonly DecodedUnknownLegacyElement[];
}

export interface DecodedLegacyLevel {
  readonly number: number;
  readonly timeLimitSeconds: number;
  readonly chipsNeeded: number;
  readonly badTiles: boolean;
  readonly cells?: readonly DecodedLegacyCell[];
  readonly creaturePositions?: readonly number[];
  readonly traps?: readonly DecodedLegacyConnection[];
  readonly cloners?: readonly DecodedLegacyConnection[];
  readonly layers?: readonly DecodedLegacyLayer[];
}

export interface ProjectedLegacyPlacement extends Omit<ProjectedCatalogElement, "redundantEmptyFloor"> {
  readonly sourceKey: string;
  readonly coordinate: CoordinateV1;
  readonly sourcePlane: ProjectedLegacySourcePlane;
  readonly discriminator: number;
  readonly catalogId: string;
  readonly catalogRevision: string;
}

export interface ProjectedLegacyActor {
  readonly placementKey: string;
  readonly coordinate: CoordinateV1;
  readonly semanticType: string;
  readonly disposition: "active" | "contained" | "dormant";
  readonly facing: DirectionV1 | null;
  readonly declaredSourceOrder: number | null;
  readonly sourceActorOrder: number;
}

export interface ProjectedLegacyWiringEndpoint {
  readonly coordinate: CoordinateV1;
  readonly placementKey: string | null;
}

export interface ProjectedLegacyWire {
  readonly kind: string;
  readonly sourceOrder: number;
  readonly discriminator: number;
  readonly source: ProjectedLegacyWiringEndpoint;
  readonly target: ProjectedLegacyWiringEndpoint;
}

export type ProjectedLegacyUnknown =
  | {
      readonly unknownKey: string;
      readonly kind: "unknown-catalog-element";
      readonly placementKey: string;
      readonly sourceToken: string;
      readonly coordinate: CoordinateV1;
      readonly reason: string;
    }
  | {
      readonly unknownKey: string;
      readonly kind: "unresolved-wiring";
      readonly wiringKind: string;
      readonly source: CoordinateV1;
      readonly target: CoordinateV1;
      readonly reason: string;
    }
  | {
      readonly unknownKey: string;
      readonly kind: "invalid-source-condition" | "source-decode-warning";
      readonly coordinates: readonly CoordinateV1[];
      readonly reason: string;
    };

export interface ProjectedLegacyLevel {
  readonly target: RulesetTargetV1;
  readonly sourceLevelNumber: number;
  readonly geometry: {
    readonly layers: readonly {
      readonly z: number;
      readonly sourceLevelNumber: number;
      readonly width: number;
      readonly height: number;
    }[];
  };
  readonly placements: readonly ProjectedLegacyPlacement[];
  readonly actors: readonly ProjectedLegacyActor[];
  readonly wiring: readonly ProjectedLegacyWire[];
  readonly timeLimit:
    | { readonly kind: "untimed" }
    | { readonly kind: "bounded"; readonly seconds: number };
  readonly chipsRequired: number;
  readonly unknowns: readonly ProjectedLegacyUnknown[];
}

export interface ProjectDecodedLegacyLevelInput {
  readonly target: RulesetTargetV1;
  readonly width: number;
  readonly height: number;
  readonly catalog: LegacyElementCatalogProjection;
  readonly decoded: DecodedLegacyLevel;
}

export class LegacyLevelProjectionError extends Error {
  override readonly name = "LegacyLevelProjectionError";

  constructor(
    readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
  }
}

function fail(path: string, message: string): never {
  throw new LegacyLevelProjectionError(path, message);
}

function expectPositiveInteger(value: number, path: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    return fail(path, "expected a positive safe integer");
  }
  return value;
}

function coordinateForPosition(pos: number, sourceZ: number, width: number, height: number): CoordinateV1 {
  if (!Number.isSafeInteger(pos) || pos < 0 || pos >= width * height) {
    return fail("/decoded/layers/connections", `position ${pos} is outside the ${width} by ${height} layer`);
  }
  if (!Number.isSafeInteger(sourceZ) || sourceZ <= 0 || sourceZ > 65_536) {
    return fail("/decoded/layers/z", `source z ${sourceZ} cannot map to a uint16 coordinate`);
  }
  return {
    x: pos % width,
    y: Math.floor(pos / width),
    z: sourceZ - 1,
  };
}

function coordinateForMetadataPosition(
  pos: number,
  sourceZ: number,
  width: number,
  height: number,
): CoordinateV1 | null {
  if (
    !Number.isSafeInteger(pos)
    || pos < 0
    || pos >= width * height
    || !Number.isSafeInteger(sourceZ)
    || sourceZ <= 0
    || sourceZ > 65_536
  ) {
    return null;
  }
  return {
    x: pos % width,
    y: Math.floor(pos / width),
    z: sourceZ - 1,
  };
}

function compareCoordinates(left: CoordinateV1, right: CoordinateV1): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function stableTokenSuffix(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._:-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || "unknown";
}

function fallbackUnknownElement(token: string, plane: LegacySourcePlane): ProjectedCatalogElement {
  return {
    semanticType: `cc1:unknown-${stableTokenSuffix(token)}`,
    sourceToken: token,
    stratum: plane === "lower" ? "terrain" : "overlay",
    interpretation: "unknown",
    facing: null,
  };
}

function sourceKeyFor(
  coordinate: CoordinateV1,
  stratum: PlacementStratumV1,
  semanticType: string,
  discriminator: number,
): string {
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}:${stratum}:${semanticType}:${discriminator}`;
}

function layerList(decoded: DecodedLegacyLevel): DecodedLegacyLayer[] {
  if (decoded.layers && decoded.layers.length > 0) {
    return [...decoded.layers].sort((left, right) => left.z - right.z);
  }
  if (!decoded.cells) {
    return fail("/decoded/layers", "a decoded level must contain at least one layer");
  }
  return [{
    z: 1,
    number: decoded.number,
    cells: decoded.cells,
    creaturePositions: decoded.creaturePositions ?? [],
    traps: decoded.traps ?? [],
    cloners: decoded.cloners ?? [],
  }];
}

function unknownOverrideKey(pos: number, plane: LegacySourcePlane): string {
  return `${pos}:${plane}`;
}

function findWiringEndpoint(
  placementsAtPosition: ReadonlyMap<string, readonly ProjectedLegacyPlacement[]>,
  coordinate: CoordinateV1,
  kind: string,
  role: "source" | "target",
): ProjectedLegacyPlacement | null {
  const positionKey = `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
  const candidates = placementsAtPosition.get(positionKey) ?? [];
  return [...candidates].reverse().find((placement) =>
    placement.wiringRoles?.some((entry) => entry.kind === kind && entry.role === role),
  ) ?? null;
}

export function projectDecodedLegacyLevel(input: ProjectDecodedLegacyLevelInput): ProjectedLegacyLevel {
  const width = expectPositiveInteger(input.width, "/width");
  const height = expectPositiveInteger(input.height, "/height");
  const cellCountPerLayer = width * height;
  if (!Number.isSafeInteger(cellCountPerLayer)) {
    return fail("/geometry", "layer cell count exceeds the safe integer range");
  }

  const layers = layerList(input.decoded);
  if (cellCountPerLayer * layers.length > MAX_LOGICAL_CELLS) {
    return fail("/geometry/layers", "level contains more than 65,536 logical cells");
  }

  const placements: ProjectedLegacyPlacement[] = [];
  const placementsAtPosition = new Map<string, ProjectedLegacyPlacement[]>();
  const actorPlacementsAtPosition = new Map<string, ProjectedLegacyPlacement[]>();
  const unknowns: ProjectedLegacyUnknown[] = [];

  for (const [layerIndex, layer] of layers.entries()) {
    if (layer.z !== layerIndex + 1) {
      return fail(`/decoded/layers/${layerIndex}/z`, "source layers must have contiguous one-based z values");
    }
    if (layer.cells.length !== cellCountPerLayer) {
      return fail(
        `/decoded/layers/${layerIndex}/cells`,
        `expected exactly ${cellCountPerLayer} row-major cells`,
      );
    }

    const unknownOverrides = new Map(
      (layer.unknownElements ?? []).map((entry) => [unknownOverrideKey(entry.pos, entry.plane), entry] as const),
    );

    for (let pos = 0; pos < layer.cells.length; pos += 1) {
      const cell = layer.cells[pos]!;
      const coordinate = coordinateForPosition(pos, layer.z, width, height);
      if (
        cell.position.pos !== pos
        || cell.position.x !== coordinate.x
        || cell.position.y !== coordinate.y
        || (cell.position.z !== undefined && cell.position.z !== layer.z)
      ) {
        return fail(`/decoded/layers/${layerIndex}/cells/${pos}/position`, "cell position is not canonical row-major source data");
      }

      const elements = [
        { plane: "lower" as const, value: cell.bottom },
        { plane: "upper" as const, value: cell.top },
      ];
      const rawProjectedElements: Array<{
        plane: ProjectedLegacySourcePlane;
        projected: ProjectedCatalogElement;
      }> = elements.map(({ plane, value }) => {
        const unknownOverride = unknownOverrides.get(unknownOverrideKey(pos, plane));
        const projected = unknownOverride
          ? fallbackUnknownElement(unknownOverride.elementToken, plane)
          : input.catalog.project(value.id, { state: value.state, plane, coordinate })
            ?? fallbackUnknownElement(`catalog-id-${value.id}`, plane);
        return { plane, projected };
      });
      const lowerProjected = rawProjectedElements[0]!.projected;
      const upperProjected = rawProjectedElements[1]!.projected;
      const upperIsRedundantEmptyFloor =
        upperProjected.redundantEmptyFloor
        && lowerProjected.redundantEmptyFloor
        && upperProjected.semanticType === lowerProjected.semanticType
        && upperProjected.stratum === lowerProjected.stratum
        && (upperProjected.initialState ?? null) === (lowerProjected.initialState ?? null)
        && upperProjected.facing === lowerProjected.facing;
      const projectedElements = upperIsRedundantEmptyFloor
        ? rawProjectedElements.slice(0, 1)
        : rawProjectedElements;
      if (input.catalog.implicitTerrain && !projectedElements.some(({ projected }) => projected.stratum === "terrain")) {
        if (input.catalog.implicitTerrain.stratum !== "terrain") {
          return fail("/catalog/implicitTerrain/stratum", "implicit terrain must use the terrain stratum");
        }
        projectedElements.unshift({ plane: "implicit", projected: input.catalog.implicitTerrain });
      }
      const discriminatorBySlot = new Map<string, number>();

      for (const { plane, projected } of projectedElements) {
        const slotKey = projected.stratum;
        const discriminator = discriminatorBySlot.get(slotKey) ?? 0;
        discriminatorBySlot.set(slotKey, discriminator + 1);
        const { redundantEmptyFloor: _redundantEmptyFloor, ...placementProjection } = projected;
        const placement: ProjectedLegacyPlacement = {
          ...placementProjection,
          interpretation: projected.interpretation ?? "known",
          initialState: projected.initialState ?? null,
          wiringRoles: projected.wiringRoles ? [...projected.wiringRoles] : undefined,
          catalogId: input.catalog.catalogId,
          catalogRevision: input.catalog.catalogRevision,
          coordinate,
          discriminator,
          sourceKey: sourceKeyFor(coordinate, projected.stratum, projected.semanticType, discriminator),
          sourcePlane: plane,
        };
        placements.push(placement);

        const positionKey = `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
        const atPosition = placementsAtPosition.get(positionKey) ?? [];
        atPosition.push(placement);
        placementsAtPosition.set(positionKey, atPosition);
        if (placement.actor) {
          const actorsAtPosition = actorPlacementsAtPosition.get(positionKey) ?? [];
          actorsAtPosition.push(placement);
          actorPlacementsAtPosition.set(positionKey, actorsAtPosition);
        }

        if (placement.interpretation === "unknown") {
          unknowns.push({
            unknownKey: `unknown-catalog:${placement.sourceKey}`,
            kind: "unknown-catalog-element",
            placementKey: placement.sourceKey,
            sourceToken: placement.sourceToken,
            coordinate,
            reason: "source element is not defined by the selected catalog projection",
          });
        }
      }
    }
  }

  if (input.decoded.badTiles && !unknowns.some((entry) => entry.kind === "unknown-catalog-element")) {
    unknowns.push({
      unknownKey: "source-decode-warning:bad-tiles",
      kind: "source-decode-warning",
      coordinates: [],
      reason: "source decoder reported unknown tiles without location diagnostics",
    });
  }

  const orderedActorPlacements: Array<{ placement: ProjectedLegacyPlacement; declaredSourceOrder: number | null }> = [];
  const orderedPlacementKeys = new Set<string>();
  let sourceDeclaredEntryIndex = 0;
  let normalizedDeclaredSourceOrder = 0;
  for (const layer of layers) {
    for (const pos of layer.creaturePositions) {
      const coordinate = coordinateForMetadataPosition(pos, layer.z, width, height);
      if (coordinate === null) {
        unknowns.push({
          unknownKey: `invalid-actor-order:${layer.z}:${sourceDeclaredEntryIndex}`,
          kind: "invalid-source-condition",
          coordinates: [],
          reason: `declared creature position ${pos} is outside its source layer`,
        });
        sourceDeclaredEntryIndex += 1;
        continue;
      }
      const candidates = actorPlacementsAtPosition.get(`${coordinate.z}:${coordinate.y}:${coordinate.x}`) ?? [];
      const placement = [...candidates].reverse().find((candidate) => !orderedPlacementKeys.has(candidate.sourceKey));
      if (!placement) {
        unknowns.push({
          unknownKey: `invalid-actor-order:${layer.z}:${sourceDeclaredEntryIndex}`,
          kind: "invalid-source-condition",
          coordinates: [coordinate],
          reason: "declared creature order does not resolve to an unclaimed actor placement",
        });
      } else {
        orderedActorPlacements.push({
          placement,
          declaredSourceOrder: normalizedDeclaredSourceOrder,
        });
        orderedPlacementKeys.add(placement.sourceKey);
        normalizedDeclaredSourceOrder += 1;
      }
      sourceDeclaredEntryIndex += 1;
    }
  }
  for (const placement of placements) {
    if (placement.actor && !orderedPlacementKeys.has(placement.sourceKey)) {
      orderedActorPlacements.push({ placement, declaredSourceOrder: null });
      orderedPlacementKeys.add(placement.sourceKey);
    }
  }

  const actors: ProjectedLegacyActor[] = orderedActorPlacements.map(({ placement, declaredSourceOrder }, sourceActorOrder) => {
    const positionKey = `${placement.coordinate.z}:${placement.coordinate.y}:${placement.coordinate.x}`;
    const isContained = (placementsAtPosition.get(positionKey) ?? []).some((candidate) => (
      candidate.containsActors === true
    ));
    return {
      placementKey: placement.sourceKey,
      coordinate: placement.coordinate,
      semanticType: placement.actor!.semanticType,
      disposition: isContained ? "contained" : placement.actor!.disposition,
      facing: placement.facing,
      declaredSourceOrder,
      sourceActorOrder,
    };
  });

  const wiring: ProjectedLegacyWire[] = [];
  const sourceOrderByKind = new Map<string, number>();
  const discriminatorByWire = new Map<string, number>();
  for (const layer of layers) {
    for (const [kind, connections] of [["trap", layer.traps], ["cloner", layer.cloners]] as const) {
      for (const connection of connections) {
        const sourceOrder = sourceOrderByKind.get(kind) ?? 0;
        sourceOrderByKind.set(kind, sourceOrder + 1);
        const source = coordinateForMetadataPosition(
          connection.from,
          connection.fromZ ?? layer.z,
          width,
          height,
        );
        const target = coordinateForMetadataPosition(
          connection.to,
          connection.toZ ?? layer.z,
          width,
          height,
        );
        if (source === null || target === null) {
          unknowns.push({
            unknownKey: `invalid-wiring:${kind}:${sourceOrder}`,
            kind: "invalid-source-condition",
            coordinates: [source, target]
              .filter((coordinate): coordinate is CoordinateV1 => coordinate !== null)
              .sort(compareCoordinates),
            reason: "wiring endpoint is outside the normalized level geometry",
          });
          continue;
        }
        const sourcePlacement = findWiringEndpoint(placementsAtPosition, source, kind, "source");
        const targetPlacement = findWiringEndpoint(placementsAtPosition, target, kind, "target");
        const wireKey = `${kind}:${source.z}:${source.y}:${source.x}:${target.z}:${target.y}:${target.x}`;
        const discriminator = discriminatorByWire.get(wireKey) ?? 0;
        discriminatorByWire.set(wireKey, discriminator + 1);
        wiring.push({
          kind,
          sourceOrder,
          discriminator,
          source: { coordinate: source, placementKey: sourcePlacement?.sourceKey ?? null },
          target: { coordinate: target, placementKey: targetPlacement?.sourceKey ?? null },
        });
        if (!sourcePlacement || !targetPlacement) {
          unknowns.push({
            unknownKey: `unresolved-wiring:${kind}:${sourceOrder}`,
            kind: "unresolved-wiring",
            wiringKind: kind,
            source,
            target,
            reason: !sourcePlacement && !targetPlacement
              ? "neither wiring endpoint has the required catalog role"
              : !sourcePlacement
                ? "wiring source does not have the required catalog role"
                : "wiring target does not have the required catalog role",
          });
        }
      }
    }
  }

  return {
    target: input.target,
    sourceLevelNumber: input.decoded.number,
    geometry: {
      layers: layers.map((layer) => ({
        z: layer.z - 1,
        sourceLevelNumber: layer.number,
        width,
        height,
      })),
    },
    placements,
    actors,
    wiring,
    timeLimit: input.decoded.timeLimitSeconds === 0
      ? { kind: "untimed" }
      : { kind: "bounded", seconds: input.decoded.timeLimitSeconds },
    chipsRequired: input.decoded.chipsNeeded,
    unknowns,
  };
}
