import {
  canonicalizeJson,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "../domain/canonicalJson.js";
import type {
  ActorIdV1,
  BlobReferenceV1,
  CoordinateV1,
  DirectionV1,
  LevelFactsV1,
  LevelGeometryV1,
  LevelIdentityV1,
  PlacementIdV1,
  RulesetTargetV1,
} from "../domain/artifacts/types.js";
import type {
  StaticAnalysisFeaturesV1,
  StaticAnalysisV1,
  StaticTopologyCaveatV1,
  StaticTopologyEvidenceV1,
  StaticTopologyOccupancyV1,
  StaticTopologyPolicyV1,
  StaticTopologySupportingPlacementV1,
  StaticTraversalClassV1,
} from "./types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;
const MAX_LOGICAL_CELLS = 65_536;
const DIRECTIONS = ["north", "east", "south", "west"] as const;
const DIRECTION_ORDER = new Map<DirectionV1, number>(
  DIRECTIONS.map((direction, index) => [direction, index]),
);
const SOURCE_FACT_PATHS = [
  "/placements",
  "/actors",
  "/timeLimit",
  "/requiredCollectibles",
  "/resourceSources",
  "/resourceGates",
  "/exits",
  "/wiring",
  "/transports",
  "/forcedSurfaces",
  "/hazards",
  "/unknowns",
] as const;
const FEATURE_NAMES = [
  "logicalCellCount",
  "certainOpenCellCount",
  "blockedCellCount",
  "conditionalBoundaryCount",
  "dynamicBoundaryCount",
  "unknownBoundaryCount",
  "directedAdjacencyCount",
  "weakConnectionCount",
  "bidirectionalConnectionCount",
  "oneWayConnectionCount",
  "weakRegionCount",
  "articulationPointCount",
  "resourceGateCount",
  "resourceCandidateSourceCount",
  "transportNetworkCount",
  "transportIncidenceCount",
  "forcedSurfaceCount",
  "hazardCount",
  "exitCount",
  "uncertaintyCount",
] as const satisfies readonly (keyof StaticAnalysisFeaturesV1)[];

type SourceFactPathV1 = typeof SOURCE_FACT_PATHS[number];
type StaticAnalysisFeatureNameV1 = typeof FEATURE_NAMES[number];

export interface StaticTopologyComparisonContentV1 {
  readonly levelFacts: BlobReferenceV1;
  readonly topologyEvidence: BlobReferenceV1;
  readonly staticAnalysis: BlobReferenceV1;
}

export interface StaticTopologyComparisonTargetBundleV1 {
  readonly content: StaticTopologyComparisonContentV1;
  readonly levelFacts: LevelFactsV1;
  readonly evidence: StaticTopologyEvidenceV1;
  readonly staticAnalysis: StaticAnalysisV1;
}

export interface CompareStaticTopologyInputV1 {
  readonly targets: readonly [
    StaticTopologyComparisonTargetBundleV1,
    StaticTopologyComparisonTargetBundleV1,
  ];
}

/**
 * Identifies exact canonical JSON without coupling the pure analyze layer to a
 * hashing port or a concrete runtime implementation.
 */
export type IdentifyCanonicalContentV1 = (
  canonicalJson: CanonicalJson,
) => Promise<BlobReferenceV1>;

export interface StaticTopologySourceFactDifferenceV1 {
  readonly cause: "source-facts";
  readonly factPath: SourceFactPathV1;
  readonly ms: CanonicalJsonValue;
  readonly lynx: CanonicalJsonValue;
}

export interface StaticTopologyCellPolicySnapshotV1 {
  readonly effective: StaticTopologySupportingPlacementV1 | null;
  readonly supporting: readonly StaticTopologySupportingPlacementV1[];
  readonly entryDirections: readonly DirectionV1[];
  readonly exitDirections: readonly DirectionV1[];
  readonly classification: StaticTraversalClassV1;
  readonly caveats: readonly StaticTopologyCaveatV1[];
  readonly occupant: StaticTopologyOccupancyV1;
}

export interface StaticTopologyCellPolicyDifferenceV1 {
  readonly cause: "target-policy";
  readonly cellOrdinal: number;
  readonly coordinate: CoordinateV1;
  readonly ms: StaticTopologyCellPolicySnapshotV1;
  readonly lynx: StaticTopologyCellPolicySnapshotV1;
}

export interface StaticTopologyFeatureDifferenceV1 {
  readonly cause: "derived-from-policy";
  readonly feature: StaticAnalysisFeatureNameV1;
  readonly ms: number;
  readonly lynx: number;
  /** Lynx minus MS. */
  readonly delta: number;
}

export interface StaticTopologyComparisonTargetReferenceV1 {
  readonly levelFacts: BlobReferenceV1;
  readonly topologyEvidence: BlobReferenceV1;
  readonly staticAnalysis: BlobReferenceV1;
  readonly topologyPolicy: StaticTopologyPolicyV1;
}

export interface StaticTopologyComparisonV1 {
  readonly comparisonVersion: 1;
  readonly status: "parity" | "divergent";
  readonly level: LevelIdentityV1;
  readonly geometry: LevelGeometryV1;
  readonly analyzer: StaticAnalysisV1["analyzer"];
  readonly targets: Readonly<Record<RulesetTargetV1, StaticTopologyComparisonTargetReferenceV1>>;
  readonly sourceFactDifferences: readonly StaticTopologySourceFactDifferenceV1[];
  readonly cellPolicyDifferences: readonly StaticTopologyCellPolicyDifferenceV1[];
  readonly featureDifferences: readonly StaticTopologyFeatureDifferenceV1[];
}

export type StaticTopologyComparisonErrorCode =
  | "comparison.input-invalid"
  | "comparison.target-invalid"
  | "comparison.binding-invalid"
  | "comparison.level-mismatch"
  | "comparison.analyzer-mismatch"
  | "comparison.analysis-divergence";

export class StaticTopologyComparisonError extends Error {
  override readonly name = "StaticTopologyComparisonError";

  constructor(
    readonly code: StaticTopologyComparisonErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

interface NormalizedTarget {
  readonly bundle: StaticTopologyComparisonTargetBundleV1;
  readonly inputIndex: number;
  readonly target: RulesetTargetV1;
  readonly sourceFacts: Readonly<Record<SourceFactPathV1, CanonicalJsonValue>>;
  readonly cells: readonly StaticTopologyCellPolicySnapshotV1[];
  readonly analysis: CanonicalJsonValue;
}

function fail(
  code: StaticTopologyComparisonErrorCode,
  path: string,
  message: string,
  options?: ErrorOptions,
): never {
  throw new StaticTopologyComparisonError(code, path, message, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonicalText(value: unknown, path: string): string {
  try {
    return canonicalizeJson(value);
  } catch (error) {
    fail(
      "comparison.input-invalid",
      path,
      "value is not canonical-JSON-safe",
      { cause: error },
    );
  }
}

function canonicalValue(value: unknown, path: string): CanonicalJsonValue {
  return JSON.parse(canonicalText(value, path)) as CanonicalJsonValue;
}

function compareCanonical(left: unknown, right: unknown): number {
  const leftText = canonicalText(left, "");
  const rightText = canonicalText(right, "");
  return leftText < rightText ? -1 : leftText > rightText ? 1 : 0;
}

function equalCanonical(left: unknown, right: unknown): boolean {
  return canonicalText(left, "") === canonicalText(right, "");
}

function sortedCanonicalValues(values: readonly unknown[], path: string): readonly CanonicalJsonValue[] {
  return values
    .map((value, index) => {
      const text = canonicalText(value, `${path}/${index}`);
      return { text, value: JSON.parse(text) as CanonicalJsonValue };
    })
    .sort((left, right) => (
      left.text < right.text ? -1 : left.text > right.text ? 1 : 0
    ))
    .map((entry) => entry.value);
}

function requireArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("comparison.input-invalid", path, "expected an array");
  }
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\r")) {
    fail("comparison.input-invalid", path, "expected a non-empty durable string");
  }
  return value;
}

function requireNonnegativeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < 0
  ) {
    fail("comparison.input-invalid", path, "expected a nonnegative safe integer");
  }
  return value;
}

function validateBlobReference(reference: BlobReferenceV1, path: string): void {
  if (!isRecord(reference)) {
    fail("comparison.input-invalid", path, "expected an exact content reference");
  }
  if (typeof reference.digest !== "string" || !SHA256_PATTERN.test(reference.digest)) {
    fail("comparison.input-invalid", `${path}/digest`, "expected a lowercase SHA-256 digest");
  }
  requireNonnegativeInteger(reference.byteLength, `${path}/byteLength`);
}

async function validateCanonicalContentBinding(
  value: unknown,
  expected: BlobReferenceV1,
  path: string,
  identifyCanonicalContent: IdentifyCanonicalContentV1,
): Promise<void> {
  const canonicalJson = canonicalText(value, path) as CanonicalJson;
  const actual = await identifyCanonicalContent(canonicalJson);
  validateBlobReference(actual, path);
  if (actual.byteLength !== expected.byteLength) {
    fail(
      "comparison.binding-invalid",
      `${path}/byteLength`,
      "content byte length does not match the supplied canonical JSON",
    );
  }
  if (actual.digest !== expected.digest) {
    fail(
      "comparison.binding-invalid",
      `${path}/digest`,
      "content digest does not match the supplied canonical JSON",
    );
  }
}

function equalBlobReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function validateLevelReference(
  reference: StaticTopologyEvidenceV1["levelFacts"],
  content: BlobReferenceV1,
  path: string,
): void {
  if (
    reference.protocolVersion !== 1
    || reference.artifactType !== "level-facts"
    || reference.schemaVersion !== 1
  ) {
    fail("comparison.binding-invalid", path, "expected a LevelFactsV1 reference");
  }
  if (reference.digest !== content.digest) {
    fail(
      "comparison.binding-invalid",
      `${path}/digest`,
      "level-facts reference does not identify the supplied exact content",
    );
  }
}

function validateGeometry(geometry: LevelGeometryV1, path: string): number {
  if (!isRecord(geometry)) {
    fail("comparison.input-invalid", path, "expected level geometry");
  }
  for (const dimension of ["width", "height", "depth"] as const) {
    const value = geometry[dimension];
    if (!Number.isSafeInteger(value) || value <= 0) {
      fail(
        "comparison.input-invalid",
        `${path}/${dimension}`,
        "expected a positive safe integer",
      );
    }
  }
  const count = geometry.width * geometry.height * geometry.depth;
  if (!Number.isSafeInteger(count) || count > MAX_LOGICAL_CELLS) {
    fail(
      "comparison.input-invalid",
      path,
      `geometry must contain at most ${MAX_LOGICAL_CELLS} logical cells`,
    );
  }
  return count;
}

function validateCoordinate(
  coordinate: CoordinateV1,
  geometry: LevelGeometryV1,
  path: string,
): void {
  if (!isRecord(coordinate)) {
    fail("comparison.input-invalid", path, "expected a coordinate");
  }
  for (const dimension of ["x", "y", "z"] as const) {
    const limit = dimension === "x"
      ? geometry.width
      : dimension === "y"
        ? geometry.height
        : geometry.depth;
    const value = coordinate[dimension];
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
      fail(
        "comparison.input-invalid",
        `${path}/${dimension}`,
        `expected an integer from 0 through ${limit - 1}`,
      );
    }
  }
}

function ordinalFor(coordinate: CoordinateV1, geometry: LevelGeometryV1): number {
  return ((coordinate.z * geometry.height) + coordinate.y) * geometry.width + coordinate.x;
}

function coordinateFor(ordinal: number, geometry: LevelGeometryV1): CoordinateV1 {
  const planeSize = geometry.width * geometry.height;
  const z = Math.floor(ordinal / planeSize);
  const withinPlane = ordinal - (z * planeSize);
  const y = Math.floor(withinPlane / geometry.width);
  return { x: withinPlane - (y * geometry.width), y, z };
}

function sameCoordinate(left: CoordinateV1, right: CoordinateV1): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function copyBlobReference(reference: BlobReferenceV1): BlobReferenceV1 {
  return { digest: reference.digest, byteLength: reference.byteLength };
}

function copyLevelIdentity(level: LevelIdentityV1): LevelIdentityV1 {
  return {
    occurrenceId: level.occurrenceId,
    normalizationProfile: level.normalizationProfile,
    normalizedGameplayDigest: level.normalizedGameplayDigest,
  };
}

function copyGeometry(geometry: LevelGeometryV1): LevelGeometryV1 {
  return { width: geometry.width, height: geometry.height, depth: geometry.depth };
}

function validateLevelIdentity(level: LevelIdentityV1, path: string): void {
  if (!isRecord(level)) {
    fail("comparison.input-invalid", path, "expected a level identity");
  }
  requireString(level.occurrenceId, `${path}/occurrenceId`);
  requireString(level.normalizationProfile, `${path}/normalizationProfile`);
  if (
    typeof level.normalizedGameplayDigest !== "string"
    || !SHA256_PATTERN.test(level.normalizedGameplayDigest)
  ) {
    fail(
      "comparison.input-invalid",
      `${path}/normalizedGameplayDigest`,
      "expected a lowercase SHA-256 digest",
    );
  }
}

function sameLevelIdentity(left: LevelIdentityV1, right: LevelIdentityV1): boolean {
  return left.occurrenceId === right.occurrenceId
    && left.normalizationProfile === right.normalizationProfile
    && left.normalizedGameplayDigest === right.normalizedGameplayDigest;
}

function sameGeometry(left: LevelGeometryV1, right: LevelGeometryV1): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.depth === right.depth;
}

function semanticSourceFacts(
  facts: LevelFactsV1,
  path: string,
): {
  readonly projection: Readonly<Record<SourceFactPathV1, CanonicalJsonValue>>;
  readonly placements: ReadonlyMap<PlacementIdV1, LevelFactsV1["payload"]["placements"][number]>;
  readonly actors: ReadonlyMap<ActorIdV1, LevelFactsV1["payload"]["actors"][number]>;
} {
  const { payload } = facts;
  const placements = new Map<PlacementIdV1, LevelFactsV1["payload"]["placements"][number]>();
  const placementValues = requireArray(payload.placements, `${path}/placements`).map(
    (candidate, index) => {
      const placement = candidate as LevelFactsV1["payload"]["placements"][number];
      const placementPath = `${path}/placements/${index}`;
      if (!isRecord(placement) || !PLACEMENT_ID_PATTERN.test(placement.placementId)) {
        fail("comparison.input-invalid", `${placementPath}/placementId`, "invalid placement identity");
      }
      if (placements.has(placement.placementId)) {
        fail("comparison.input-invalid", `${placementPath}/placementId`, "duplicate placement identity");
      }
      validateCoordinate(placement.descriptor.coordinate, payload.geometry, `${placementPath}/descriptor/coordinate`);
      if (placement.descriptor.levelDigest !== payload.level.normalizedGameplayDigest) {
        fail(
          "comparison.binding-invalid",
          `${placementPath}/descriptor/levelDigest`,
          "placement identity belongs to a different normalized level",
        );
      }
      placements.set(placement.placementId, placement);
      return {
        placementId: placement.placementId,
        coordinate: placement.descriptor.coordinate,
        stratum: placement.descriptor.stratum,
        semanticType: placement.descriptor.semanticType,
        discriminator: placement.descriptor.discriminator,
        interpretation: placement.interpretation,
        facing: placement.facing,
        initialState: placement.initialState,
      };
    },
  );

  const requirePlacement = (placementId: PlacementIdV1, referencePath: string): PlacementIdV1 => {
    if (!placements.has(placementId)) {
      fail("comparison.binding-invalid", referencePath, "dangling placement reference");
    }
    return placementId;
  };

  const actors = new Map<ActorIdV1, LevelFactsV1["payload"]["actors"][number]>();
  const actorValues = requireArray(payload.actors, `${path}/actors`).map((candidate, index) => {
    const actor = candidate as LevelFactsV1["payload"]["actors"][number];
    const actorPath = `${path}/actors/${index}`;
    if (!isRecord(actor) || !ACTOR_ID_PATTERN.test(actor.actorId)) {
      fail("comparison.input-invalid", `${actorPath}/actorId`, "invalid actor identity");
    }
    if (actors.has(actor.actorId)) {
      fail("comparison.input-invalid", `${actorPath}/actorId`, "duplicate actor identity");
    }
    actors.set(actor.actorId, actor);
    return {
      actorId: actor.actorId,
      placementId: requirePlacement(actor.descriptor.placementId, `${actorPath}/descriptor/placementId`),
      sourceActorOrder: actor.descriptor.sourceActorOrder,
      semanticType: actor.semanticType,
      disposition: actor.disposition,
      facing: actor.facing,
      declaredSourceOrder: actor.declaredSourceOrder,
    };
  });

  const resourceSources = requireArray(payload.resourceSources, `${path}/resourceSources`).map(
    (candidate, index) => {
      const source = candidate as LevelFactsV1["payload"]["resourceSources"][number];
      return {
        placementId: requirePlacement(source.placementId, `${path}/resourceSources/${index}/placementId`),
        resourceType: source.resourceType,
        amount: source.amount,
      };
    },
  );
  const resourceGates = requireArray(payload.resourceGates, `${path}/resourceGates`).map(
    (candidate, index) => {
      const gate = candidate as LevelFactsV1["payload"]["resourceGates"][number];
      return {
        kind: gate.kind,
        placementId: requirePlacement(gate.placementId, `${path}/resourceGates/${index}/placementId`),
        resourceType: gate.resourceType,
        amount: "amount" in gate ? gate.amount : null,
      };
    },
  );
  const exits = requireArray(payload.exits, `${path}/exits`).map((candidate, index) => (
    requirePlacement(candidate as PlacementIdV1, `${path}/exits/${index}`)
  ));
  const wiring = requireArray(payload.wiring, `${path}/wiring`).map((candidate, index) => {
    const wire = candidate as LevelFactsV1["payload"]["wiring"][number];
    return {
      wiringId: wire.wiringId,
      kind: wire.descriptor.kind,
      sourceOrder: wire.descriptor.sourceOrder,
      sourcePlacementId: requirePlacement(
        wire.descriptor.sourcePlacementId,
        `${path}/wiring/${index}/descriptor/sourcePlacementId`,
      ),
      targetPlacementId: requirePlacement(
        wire.descriptor.targetPlacementId,
        `${path}/wiring/${index}/descriptor/targetPlacementId`,
      ),
      discriminator: wire.descriptor.discriminator,
    };
  });
  const transports = requireArray(payload.transports, `${path}/transports`).map((candidate, index) => {
    const network = candidate as LevelFactsV1["payload"]["transports"][number];
    return {
      networkId: network.networkId,
      kind: network.kind,
      routingPolicy: network.routingPolicy,
      // Transport order is policy-bearing, not set-like.
      members: requireArray(network.members, `${path}/transports/${index}/members`).map(
        (member, memberIndex) => requirePlacement(
          member as PlacementIdV1,
          `${path}/transports/${index}/members/${memberIndex}`,
        ),
      ),
    };
  });
  const forcedSurfaces = requireArray(payload.forcedSurfaces, `${path}/forcedSurfaces`).map(
    (candidate, index) => {
      const surface = candidate as LevelFactsV1["payload"]["forcedSurfaces"][number];
      return {
        placementId: requirePlacement(surface.placementId, `${path}/forcedSurfaces/${index}/placementId`),
        motion: surface.motion,
        direction: surface.direction,
        turn: surface.turn,
      };
    },
  );
  const hazards = requireArray(payload.hazards, `${path}/hazards`).map((candidate, index) => {
    const hazard = candidate as LevelFactsV1["payload"]["hazards"][number];
    return {
      placementId: requirePlacement(hazard.placementId, `${path}/hazards/${index}/placementId`),
      hazardType: hazard.hazardType,
      persistence: hazard.persistence,
      protectionResources: [...hazard.protectionResources].sort(),
    };
  });
  const unknowns = requireArray(payload.unknowns, `${path}/unknowns`).map((candidate, index) => {
    const unknown = candidate as LevelFactsV1["payload"]["unknowns"][number];
    switch (unknown.kind) {
      case "unknown-catalog-element":
        return {
          kind: unknown.kind,
          placementId: requirePlacement(unknown.placementId, `${path}/unknowns/${index}/placementId`),
          sourceToken: unknown.sourceToken,
        };
      case "unresolved-wiring":
        return {
          kind: unknown.kind,
          wiringKind: unknown.wiringKind,
          source: unknown.source,
          target: unknown.target,
        };
      case "unsupported-source-feature":
      case "invalid-source-condition":
        return {
          kind: unknown.kind,
          ...(unknown.kind === "unsupported-source-feature"
            ? { sourceToken: unknown.sourceToken }
            : {}),
          coordinates: sortedCanonicalValues(unknown.coordinates, `${path}/unknowns/${index}/coordinates`),
        };
      default:
        return fail("comparison.input-invalid", `${path}/unknowns/${index}/kind`, "unknown static fact kind");
    }
  });

  const projection = {
    "/placements": canonicalValue(sortedCanonicalValues(placementValues, `${path}/placements`), `${path}/placements`),
    "/actors": canonicalValue(sortedCanonicalValues(actorValues, `${path}/actors`), `${path}/actors`),
    "/timeLimit": canonicalValue(payload.timeLimit, `${path}/timeLimit`),
    "/requiredCollectibles": canonicalValue(
      sortedCanonicalValues(requireArray(payload.requiredCollectibles, `${path}/requiredCollectibles`), `${path}/requiredCollectibles`),
      `${path}/requiredCollectibles`,
    ),
    "/resourceSources": canonicalValue(sortedCanonicalValues(resourceSources, `${path}/resourceSources`), `${path}/resourceSources`),
    "/resourceGates": canonicalValue(sortedCanonicalValues(resourceGates, `${path}/resourceGates`), `${path}/resourceGates`),
    "/exits": canonicalValue([...exits].sort(), `${path}/exits`),
    "/wiring": canonicalValue(sortedCanonicalValues(wiring, `${path}/wiring`), `${path}/wiring`),
    "/transports": canonicalValue(sortedCanonicalValues(transports, `${path}/transports`), `${path}/transports`),
    "/forcedSurfaces": canonicalValue(sortedCanonicalValues(forcedSurfaces, `${path}/forcedSurfaces`), `${path}/forcedSurfaces`),
    "/hazards": canonicalValue(sortedCanonicalValues(hazards, `${path}/hazards`), `${path}/hazards`),
    "/unknowns": canonicalValue(sortedCanonicalValues(unknowns, `${path}/unknowns`), `${path}/unknowns`),
  } satisfies Record<SourceFactPathV1, CanonicalJsonValue>;
  return { projection, placements, actors };
}

function normalizeDirections(values: readonly DirectionV1[], path: string): readonly DirectionV1[] {
  const seen = new Set<DirectionV1>();
  for (const [index, value] of requireArray(values, path).entries()) {
    if (!DIRECTION_ORDER.has(value as DirectionV1)) {
      fail("comparison.input-invalid", `${path}/${index}`, "unknown direction");
    }
    const direction = value as DirectionV1;
    if (seen.has(direction)) {
      fail("comparison.input-invalid", `${path}/${index}`, "duplicate direction");
    }
    seen.add(direction);
  }
  return [...seen].sort((left, right) => (
    (DIRECTION_ORDER.get(left) ?? 0) - (DIRECTION_ORDER.get(right) ?? 0)
  ));
}

function normalizeCells(
  evidence: StaticTopologyEvidenceV1,
  placements: ReadonlyMap<PlacementIdV1, LevelFactsV1["payload"]["placements"][number]>,
  actors: ReadonlyMap<ActorIdV1, LevelFactsV1["payload"]["actors"][number]>,
  path: string,
): readonly StaticTopologyCellPolicySnapshotV1[] {
  const logicalCellCount = validateGeometry(evidence.geometry, `${path}/geometry`);
  const rawCells = requireArray(evidence.cells, `${path}/cells`);
  if (rawCells.length !== logicalCellCount) {
    fail(
      "comparison.input-invalid",
      `${path}/cells`,
      "expected exactly one policy record for every logical cell",
    );
  }
  const expectedPlacements: PlacementIdV1[][] = Array.from({ length: logicalCellCount }, () => []);
  for (const placement of placements.values()) {
    expectedPlacements[ordinalFor(placement.descriptor.coordinate, evidence.geometry)]?.push(placement.placementId);
  }
  for (const ids of expectedPlacements) ids.sort();

  const cells: Array<StaticTopologyCellPolicySnapshotV1 | undefined> = Array(logicalCellCount);
  for (let inputIndex = 0; inputIndex < rawCells.length; inputIndex += 1) {
    const cell = rawCells[inputIndex] as StaticTopologyEvidenceV1["cells"][number];
    const cellPath = `${path}/cells/${inputIndex}`;
    if (!isRecord(cell)) {
      fail("comparison.input-invalid", cellPath, "expected a topology-policy cell");
    }
    validateCoordinate(cell.coordinate, evidence.geometry, `${cellPath}/coordinate`);
    const ordinal = ordinalFor(cell.coordinate, evidence.geometry);
    if (cells[ordinal] !== undefined) {
      fail("comparison.input-invalid", `${cellPath}/coordinate`, "duplicate logical cell coordinate");
    }
    const represented = new Set<PlacementIdV1>();
    const validateSupporting = (
      candidate: StaticTopologySupportingPlacementV1,
      supportingPath: string,
    ): StaticTopologySupportingPlacementV1 => {
      if (
        !isRecord(candidate)
        || !["lower", "upper", "implicit"].includes(candidate.sourcePlane)
      ) {
        fail("comparison.input-invalid", supportingPath, "invalid supporting placement");
      }
      const placement = placements.get(candidate.placementId);
      if (placement === undefined) {
        fail("comparison.binding-invalid", `${supportingPath}/placementId`, "dangling placement reference");
      }
      if (!sameCoordinate(placement.descriptor.coordinate, cell.coordinate)) {
        fail("comparison.binding-invalid", `${supportingPath}/placementId`, "placement belongs to another cell");
      }
      if (represented.has(candidate.placementId)) {
        fail("comparison.input-invalid", `${supportingPath}/placementId`, "duplicate placement role");
      }
      represented.add(candidate.placementId);
      return { placementId: candidate.placementId, sourcePlane: candidate.sourcePlane };
    };
    const effective = cell.effective === null
      ? null
      : validateSupporting(cell.effective, `${cellPath}/effective`);
    const supporting = requireArray(cell.supporting, `${cellPath}/supporting`)
      .map((candidate, index) => validateSupporting(
        candidate as StaticTopologySupportingPlacementV1,
        `${cellPath}/supporting/${index}`,
      ))
      .sort(compareCanonical);
    const expected = expectedPlacements[ordinal] ?? [];
    const representedIds = [...represented].sort();
    if (!equalCanonical(expected, representedIds)) {
      fail(
        "comparison.binding-invalid",
        `${cellPath}/supporting`,
        "cell policy must represent every source-fact placement exactly once",
      );
    }
    if (!["open", "blocked", "conditional", "dynamic", "unknown"].includes(cell.classification)) {
      fail("comparison.input-invalid", `${cellPath}/classification`, "unknown traversal classification");
    }
    const caveatIds = new Set<string>();
    const caveats = requireArray(cell.caveats, `${cellPath}/caveats`).map((candidate, index) => {
      const caveat = candidate as StaticTopologyCaveatV1;
      const caveatPath = `${cellPath}/caveats/${index}`;
      if (!isRecord(caveat)) {
        fail("comparison.input-invalid", caveatPath, "invalid topology caveat");
      }
      requireString(caveat.caveatId, `${caveatPath}/caveatId`);
      if (caveatIds.has(caveat.caveatId)) {
        fail("comparison.input-invalid", `${caveatPath}/caveatId`, "duplicate caveat identity");
      }
      caveatIds.add(caveat.caveatId);
      if (caveat.placementId !== null && !placements.has(caveat.placementId)) {
        fail("comparison.binding-invalid", `${caveatPath}/placementId`, "dangling placement reference");
      }
      return {
        caveatId: caveat.caveatId,
        kind: caveat.kind,
        placementId: caveat.placementId,
      };
    }).sort(compareCanonical);
    const occupant = cell.occupant;
    if (!isRecord(occupant)) {
      fail("comparison.input-invalid", `${cellPath}/occupant`, "invalid occupant policy");
    }
    if (occupant.placementId !== null) {
      const placement = placements.get(occupant.placementId);
      if (placement === undefined || !sameCoordinate(placement.descriptor.coordinate, cell.coordinate)) {
        fail("comparison.binding-invalid", `${cellPath}/occupant/placementId`, "invalid occupant placement");
      }
    }
    if (occupant.actorId !== null) {
      const actor = actors.get(occupant.actorId);
      if (actor === undefined || actor.descriptor.placementId !== occupant.placementId) {
        fail("comparison.binding-invalid", `${cellPath}/occupant/actorId`, "invalid occupant actor");
      }
    }
    cells[ordinal] = {
      effective,
      supporting,
      entryDirections: normalizeDirections(cell.entryDirections, `${cellPath}/entryDirections`),
      exitDirections: normalizeDirections(cell.exitDirections, `${cellPath}/exitDirections`),
      classification: cell.classification,
      caveats,
      occupant: {
        kind: occupant.kind,
        placementId: occupant.placementId,
        actorId: occupant.actorId,
      },
    };
  }
  if (cells.some((cell) => cell === undefined)) {
    fail("comparison.input-invalid", `${path}/cells`, "missing logical cell policy");
  }
  return cells as readonly StaticTopologyCellPolicySnapshotV1[];
}

function normalizedRegionAttachment<T extends {
  readonly regionIds: readonly string[];
}>(value: T): T {
  return { ...value, regionIds: [...value.regionIds].sort() };
}

function normalizeAnalysis(analysis: StaticAnalysisV1, path: string): CanonicalJsonValue {
  const normalizeSet = (values: readonly unknown[], setPath: string): readonly CanonicalJsonValue[] => (
    sortedCanonicalValues(values, setPath)
  );
  const projection = {
    directedAdjacency: normalizeSet(analysis.directedAdjacency, `${path}/directedAdjacency`),
    regions: normalizeSet(analysis.regions.map((region) => ({
      ...region,
      cellOrdinals: [...region.cellOrdinals].sort((left, right) => left - right),
    })), `${path}/regions`),
    articulationPoints: normalizeSet(analysis.articulationPoints, `${path}/articulationPoints`),
    boundaries: normalizeSet(analysis.boundaries.map((boundary) => ({
      ...boundary,
      incomingRegionIds: [...boundary.incomingRegionIds].sort(),
      outgoingRegionIds: [...boundary.outgoingRegionIds].sort(),
      caveats: [...boundary.caveats].sort(compareCanonical),
    })), `${path}/boundaries`),
    resourceDependencies: normalizeSet(analysis.resourceDependencies.map((dependency) => ({
      ...normalizedRegionAttachment(dependency),
      candidateSources: [...dependency.candidateSources]
        .map(normalizedRegionAttachment)
        .sort(compareCanonical),
    })), `${path}/resourceDependencies`),
    transports: normalizeSet(analysis.transports.map((network) => ({
      ...network,
      // Transport member order is semantically significant.
      members: network.members.map(normalizedRegionAttachment),
    })), `${path}/transports`),
    attachments: {
      forcedSurfaces: normalizeSet(
        analysis.attachments.forcedSurfaces.map(normalizedRegionAttachment),
        `${path}/attachments/forcedSurfaces`,
      ),
      hazards: normalizeSet(analysis.attachments.hazards.map((hazard) => ({
        ...normalizedRegionAttachment(hazard),
        protectionResources: [...hazard.protectionResources].sort(),
      })), `${path}/attachments/hazards`),
      exits: normalizeSet(
        analysis.attachments.exits.map(normalizedRegionAttachment),
        `${path}/attachments/exits`,
      ),
    },
    uncertainties: normalizeSet(analysis.uncertainties.map((uncertainty) => ({
      ...uncertainty,
      cellOrdinals: [...uncertainty.cellOrdinals].sort((left, right) => left - right),
    })), `${path}/uncertainties`),
    features: analysis.features,
  };
  return canonicalValue(projection, path);
}

function validateFeatures(
  features: StaticAnalysisFeaturesV1,
  logicalCellCount: number,
  path: string,
): void {
  if (!isRecord(features)) {
    fail("comparison.input-invalid", path, "expected exact static-analysis features");
  }
  const actualKeys = Object.keys(features).sort();
  const expectedKeys = [...FEATURE_NAMES].sort();
  if (!equalCanonical(actualKeys, expectedKeys)) {
    fail("comparison.input-invalid", path, "static-analysis feature set does not match v1");
  }
  for (const feature of FEATURE_NAMES) {
    requireNonnegativeInteger(features[feature], `${path}/${feature}`);
  }
  if (features.logicalCellCount !== logicalCellCount) {
    fail(
      "comparison.binding-invalid",
      `${path}/logicalCellCount`,
      "analysis logical-cell count does not match level geometry",
    );
  }
}

async function validateAndNormalizeTarget(
  candidate: StaticTopologyComparisonTargetBundleV1,
  inputIndex: number,
  identifyCanonicalContent: IdentifyCanonicalContentV1,
): Promise<NormalizedTarget> {
  const path = `/targets/${inputIndex}`;
  if (!isRecord(candidate)) {
    fail("comparison.input-invalid", path, "expected a comparison target bundle");
  }
  if (!isRecord(candidate.content)) {
    fail("comparison.input-invalid", `${path}/content`, "expected exact content references");
  }
  validateBlobReference(candidate.content.levelFacts, `${path}/content/levelFacts`);
  validateBlobReference(candidate.content.topologyEvidence, `${path}/content/topologyEvidence`);
  validateBlobReference(candidate.content.staticAnalysis, `${path}/content/staticAnalysis`);
  const facts = candidate.levelFacts;
  if (
    !isRecord(facts)
    || facts.protocol !== "ccsolver-artifact"
    || facts.protocolVersion !== 1
    || facts.artifactType !== "level-facts"
    || facts.schemaVersion !== 1
    || !isRecord(facts.payload)
  ) {
    fail("comparison.input-invalid", `${path}/levelFacts`, "expected a LevelFactsV1 envelope");
  }
  await validateCanonicalContentBinding(
    facts,
    candidate.content.levelFacts,
    `${path}/content/levelFacts`,
    identifyCanonicalContent,
  );
  const target = facts.payload.target;
  if (target !== "ms" && target !== "lynx") {
    fail("comparison.target-invalid", `${path}/levelFacts/payload/target`, "expected ms or lynx");
  }
  const levelPath = `${path}/levelFacts/payload/level`;
  validateLevelIdentity(facts.payload.level, levelPath);
  const geometryPath = `${path}/levelFacts/payload/geometry`;
  const logicalCellCount = validateGeometry(facts.payload.geometry, geometryPath);

  const evidence = candidate.evidence;
  if (!isRecord(evidence) || evidence.evidenceVersion !== 1) {
    fail("comparison.input-invalid", `${path}/evidence`, "expected StaticTopologyEvidenceV1");
  }
  await validateCanonicalContentBinding(
    evidence,
    candidate.content.topologyEvidence,
    `${path}/content/topologyEvidence`,
    identifyCanonicalContent,
  );
  if (evidence.target !== target) {
    fail("comparison.binding-invalid", `${path}/evidence/target`, "topology target does not match facts");
  }
  validateLevelReference(evidence.levelFacts, candidate.content.levelFacts, `${path}/evidence/levelFacts`);
  if (!sameLevelIdentity(evidence.level, facts.payload.level)) {
    fail("comparison.binding-invalid", `${path}/evidence/level`, "topology level does not match facts");
  }
  if (!sameGeometry(evidence.geometry, facts.payload.geometry)) {
    fail("comparison.binding-invalid", `${path}/evidence/geometry`, "topology geometry does not match facts");
  }
  requireString(evidence.policy.policyId, `${path}/evidence/policy/policyId`);
  requireString(evidence.policy.policyRevision, `${path}/evidence/policy/policyRevision`);

  const analysis = candidate.staticAnalysis;
  if (!isRecord(analysis) || analysis.analysisVersion !== 1) {
    fail("comparison.input-invalid", `${path}/staticAnalysis`, "expected StaticAnalysisV1");
  }
  await validateCanonicalContentBinding(
    analysis,
    candidate.content.staticAnalysis,
    `${path}/content/staticAnalysis`,
    identifyCanonicalContent,
  );
  if (analysis.target !== target) {
    fail("comparison.binding-invalid", `${path}/staticAnalysis/target`, "analysis target does not match facts");
  }
  validateLevelReference(analysis.levelFacts, candidate.content.levelFacts, `${path}/staticAnalysis/levelFacts`);
  if (!sameLevelIdentity(analysis.level, facts.payload.level)) {
    fail("comparison.binding-invalid", `${path}/staticAnalysis/level`, "analysis level does not match facts");
  }
  if (!sameGeometry(analysis.geometry, facts.payload.geometry)) {
    fail("comparison.binding-invalid", `${path}/staticAnalysis/geometry`, "analysis geometry does not match facts");
  }
  if (!equalCanonical(analysis.topologyPolicy, evidence.policy)) {
    fail(
      "comparison.binding-invalid",
      `${path}/staticAnalysis/topologyPolicy`,
      "analysis policy does not match topology evidence",
    );
  }
  validateBlobReference(analysis.topologyEvidence, `${path}/staticAnalysis/topologyEvidence`);
  if (!equalBlobReference(analysis.topologyEvidence, candidate.content.topologyEvidence)) {
    fail(
      "comparison.binding-invalid",
      `${path}/staticAnalysis/topologyEvidence`,
      "analysis does not identify the supplied exact topology evidence",
    );
  }
  if (
    !isRecord(analysis.analyzer)
    || analysis.analyzer.analyzerId !== "ccsolver-static-topology-analyzer"
  ) {
    fail(
      "comparison.input-invalid",
      `${path}/staticAnalysis/analyzer/analyzerId`,
      "unexpected static-topology analyzer",
    );
  }
  requireString(analysis.analyzer.analyzerRevision, `${path}/staticAnalysis/analyzer/analyzerRevision`);
  requireString(analysis.analyzer.analysisProfile, `${path}/staticAnalysis/analyzer/analysisProfile`);
  validateFeatures(analysis.features, logicalCellCount, `${path}/staticAnalysis/features`);

  const semanticFacts = semanticSourceFacts(facts, `${path}/levelFacts/payload`);
  const cells = normalizeCells(
    evidence,
    semanticFacts.placements,
    semanticFacts.actors,
    `${path}/evidence`,
  );
  return {
    bundle: candidate,
    inputIndex,
    target,
    sourceFacts: semanticFacts.projection,
    cells,
    analysis: normalizeAnalysis(analysis, `${path}/staticAnalysis`),
  };
}

function targetReference(target: NormalizedTarget): StaticTopologyComparisonTargetReferenceV1 {
  return {
    levelFacts: copyBlobReference(target.bundle.content.levelFacts),
    topologyEvidence: copyBlobReference(target.bundle.content.topologyEvidence),
    staticAnalysis: copyBlobReference(target.bundle.content.staticAnalysis),
    topologyPolicy: {
      policyId: target.bundle.evidence.policy.policyId,
      policyRevision: target.bundle.evidence.policy.policyRevision,
    },
  };
}

/**
 * Compares two exact, already-produced static-analysis bundles. This remains a
 * preview value: it is canonical-JSON-safe but deliberately is not a root
 * artifact or compatibility schema.
 */
export async function compareStaticTopology(
  input: CompareStaticTopologyInputV1,
  identifyCanonicalContent: IdentifyCanonicalContentV1,
): Promise<StaticTopologyComparisonV1> {
  if (!isRecord(input) || !Array.isArray(input.targets) || input.targets.length !== 2) {
    fail("comparison.input-invalid", "/targets", "expected exactly two target bundles");
  }
  const normalized: NormalizedTarget[] = [];
  for (const [index, target] of input.targets.entries()) {
    normalized.push(await validateAndNormalizeTarget(target, index, identifyCanonicalContent));
  }
  const byTarget = new Map<RulesetTargetV1, NormalizedTarget>();
  for (const target of normalized) {
    if (byTarget.has(target.target)) {
      fail("comparison.target-invalid", "/targets", "expected one genuine MS and one genuine Lynx target");
    }
    byTarget.set(target.target, target);
  }
  const ms = byTarget.get("ms");
  const lynx = byTarget.get("lynx");
  if (ms === undefined || lynx === undefined) {
    fail("comparison.target-invalid", "/targets", "expected one genuine MS and one genuine Lynx target");
  }
  const msFacts = ms.bundle.levelFacts.payload;
  const lynxFacts = lynx.bundle.levelFacts.payload;
  if (!sameLevelIdentity(msFacts.level, lynxFacts.level)) {
    fail(
      "comparison.level-mismatch",
      `/targets/${lynx.inputIndex}/levelFacts/payload/level`,
      "targets do not identify the same normalized level",
    );
  }
  if (!sameGeometry(msFacts.geometry, lynxFacts.geometry)) {
    fail(
      "comparison.level-mismatch",
      `/targets/${lynx.inputIndex}/levelFacts/payload/geometry`,
      "targets do not use the same logical geometry",
    );
  }
  const msAnalyzer = ms.bundle.staticAnalysis.analyzer;
  const lynxAnalyzer = lynx.bundle.staticAnalysis.analyzer;
  if (msAnalyzer.analyzerRevision !== lynxAnalyzer.analyzerRevision) {
    fail(
      "comparison.analyzer-mismatch",
      `/targets/${lynx.inputIndex}/staticAnalysis/analyzer/analyzerRevision`,
      "targets were not analyzed by the same revision",
    );
  }
  if (msAnalyzer.analysisProfile !== lynxAnalyzer.analysisProfile) {
    fail(
      "comparison.analyzer-mismatch",
      `/targets/${lynx.inputIndex}/staticAnalysis/analyzer/analysisProfile`,
      "targets were not analyzed with the same profile",
    );
  }
  if (msAnalyzer.analysisProfile !== "ccsolver-static-topology-v1") {
    fail(
      "comparison.input-invalid",
      `/targets/${ms.inputIndex}/staticAnalysis/analyzer/analysisProfile`,
      "unexpected static-topology analysis profile",
    );
  }

  const sourceFactDifferences: StaticTopologySourceFactDifferenceV1[] = [];
  for (const factPath of SOURCE_FACT_PATHS) {
    const msValue = ms.sourceFacts[factPath];
    const lynxValue = lynx.sourceFacts[factPath];
    if (!equalCanonical(msValue, lynxValue)) {
      sourceFactDifferences.push({
        cause: "source-facts",
        factPath,
        ms: msValue,
        lynx: lynxValue,
      });
    }
  }

  const cellPolicyDifferences: StaticTopologyCellPolicyDifferenceV1[] = [];
  for (let ordinal = 0; ordinal < ms.cells.length; ordinal += 1) {
    const msCell = ms.cells[ordinal];
    const lynxCell = lynx.cells[ordinal];
    if (msCell === undefined || lynxCell === undefined) {
      fail("comparison.input-invalid", "/targets", "missing normalized cell policy");
    }
    if (!equalCanonical(msCell, lynxCell)) {
      cellPolicyDifferences.push({
        cause: "target-policy",
        cellOrdinal: ordinal,
        coordinate: coordinateFor(ordinal, msFacts.geometry),
        ms: msCell,
        lynx: lynxCell,
      });
    }
  }

  const featureDifferences: StaticTopologyFeatureDifferenceV1[] = [];
  for (const feature of FEATURE_NAMES) {
    const msValue = ms.bundle.staticAnalysis.features[feature];
    const lynxValue = lynx.bundle.staticAnalysis.features[feature];
    if (msValue !== lynxValue) {
      featureDifferences.push({
        cause: "derived-from-policy",
        feature,
        ms: msValue,
        lynx: lynxValue,
        delta: lynxValue - msValue,
      });
    }
  }

  if (sourceFactDifferences.length === 0 && cellPolicyDifferences.length === 0) {
    const firstFeatureDifference = featureDifferences[0];
    if (firstFeatureDifference !== undefined) {
      fail(
        "comparison.analysis-divergence",
        `/targets/${lynx.inputIndex}/staticAnalysis/features/${firstFeatureDifference.feature}`,
        "identical semantic inputs produced different exact feature counts",
      );
    }
    if (!equalCanonical(ms.analysis, lynx.analysis)) {
      fail(
        "comparison.analysis-divergence",
        `/targets/${lynx.inputIndex}/staticAnalysis`,
        "identical semantic inputs produced different static analysis",
      );
    }
  }

  const comparison: StaticTopologyComparisonV1 = {
    comparisonVersion: 1,
    status: sourceFactDifferences.length === 0
      && cellPolicyDifferences.length === 0
      && featureDifferences.length === 0
      ? "parity"
      : "divergent",
    level: copyLevelIdentity(msFacts.level),
    geometry: copyGeometry(msFacts.geometry),
    analyzer: {
      analyzerId: "ccsolver-static-topology-analyzer",
      analyzerRevision: msAnalyzer.analyzerRevision,
      analysisProfile: "ccsolver-static-topology-v1",
    },
    targets: {
      ms: targetReference(ms),
      lynx: targetReference(lynx),
    },
    sourceFactDifferences,
    cellPolicyDifferences,
    featureDifferences,
  };
  canonicalText(comparison, "");
  return comparison;
}
