import type {
  ActorIdV1,
  CoordinateV1,
  DirectionV1,
  LevelGeometryV1,
  PlacementIdV1,
  StaticPlacementFactV1,
  UnknownStaticFactV1,
} from "../domain/artifacts/types.js";
import type {
  AnalyzeStaticTopologyInputV1,
  StaticAnalysisUncertaintyV1,
  StaticAnalysisV1,
  StaticBoundaryV1,
  StaticDirectedAdjacencyV1,
  StaticRegionAttachmentV1,
  StaticRegionIdV1,
  StaticTopologyCaveatV1,
  StaticTopologyOccupancyV1,
  StaticTopologySupportingPlacementV1,
  StaticTransportNetworkV1,
  StaticTraversalClassV1,
  StaticWeakRegionV1,
} from "./types.js";

const MAX_LOGICAL_CELLS = 65_536;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DIRECTIONS = ["north", "east", "south", "west"] as const;
const DIRECTION_ORDER = new Map<DirectionV1, number>(
  DIRECTIONS.map((direction, index) => [direction, index]),
);
const DIRECTION_BIT: Readonly<Record<DirectionV1, number>> = {
  north: 1,
  east: 2,
  south: 4,
  west: 8,
};
const OPPOSITE: Readonly<Record<DirectionV1, DirectionV1>> = {
  north: "south",
  east: "west",
  south: "north",
  west: "east",
};

export type StaticAnalysisErrorCode =
  | "analysis.binding-invalid"
  | "analysis.evidence-invalid"
  | "analysis.invariant-invalid";

export class StaticAnalysisError extends Error {
  override readonly name = "StaticAnalysisError";

  constructor(
    readonly code: StaticAnalysisErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

interface NormalizedCell {
  readonly ordinal: number;
  readonly coordinate: CoordinateV1;
  readonly effective: StaticTopologySupportingPlacementV1 | null;
  readonly supporting: readonly StaticTopologySupportingPlacementV1[];
  readonly entryDirections: readonly DirectionV1[];
  readonly exitDirections: readonly DirectionV1[];
  readonly entryMask: number;
  readonly exitMask: number;
  readonly classification: StaticTraversalClassV1;
  readonly caveats: readonly StaticTopologyCaveatV1[];
  readonly occupant: StaticTopologyOccupancyV1;
}

interface ValidatedInput {
  readonly placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>;
  readonly cells: readonly NormalizedCell[];
  readonly logicalCellCount: number;
}

interface DirectionStep {
  readonly dx: number;
  readonly dy: number;
}

const DIRECTION_STEP: Readonly<Record<DirectionV1, DirectionStep>> = {
  north: { dx: 0, dy: -1 },
  east: { dx: 1, dy: 0 },
  south: { dx: 0, dy: 1 },
  west: { dx: -1, dy: 0 },
};

function fail(
  code: StaticAnalysisErrorCode,
  path: string,
  message: string,
): never {
  throw new StaticAnalysisError(code, path, message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumber(left: number, right: number): number {
  return left - right;
}

function assertNonemptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\r")) {
    fail("analysis.evidence-invalid", path, "expected a non-empty durable string");
  }
}

function assertSha256(value: unknown, path: string): asserts value is `sha256:${string}` {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    fail(
      "analysis.evidence-invalid",
      path,
      "expected sha256 followed by 64 lowercase hexadecimal digits",
    );
  }
}

function assertNonnegativeInteger(value: unknown, path: string): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < 0
  ) {
    fail("analysis.evidence-invalid", path, "expected a nonnegative safe integer");
  }
}

function validateGeometry(geometry: LevelGeometryV1, path: string): number {
  for (const dimension of ["width", "height", "depth"] as const) {
    const value = geometry[dimension];
    if (!Number.isSafeInteger(value) || value <= 0) {
      fail(
        "analysis.evidence-invalid",
        `${path}/${dimension}`,
        "geometry dimensions must be positive safe integers",
      );
    }
  }
  const logicalCellCount = geometry.width * geometry.height * geometry.depth;
  if (!Number.isSafeInteger(logicalCellCount) || logicalCellCount > MAX_LOGICAL_CELLS) {
    fail(
      "analysis.evidence-invalid",
      path,
      `geometry must contain at most ${MAX_LOGICAL_CELLS} logical cells`,
    );
  }
  return logicalCellCount;
}

function equalGeometry(left: LevelGeometryV1, right: LevelGeometryV1): boolean {
  return left.width === right.width
    && left.height === right.height
    && left.depth === right.depth;
}

function assertCoordinateInBounds(
  coordinate: CoordinateV1,
  geometry: LevelGeometryV1,
  path: string,
): void {
  for (const dimension of ["x", "y", "z"] as const) {
    const value = coordinate[dimension];
    const limit = dimension === "x"
      ? geometry.width
      : dimension === "y"
        ? geometry.height
        : geometry.depth;
    if (!Number.isSafeInteger(value) || value < 0 || value >= limit) {
      fail(
        "analysis.invariant-invalid",
        `${path}/${dimension}`,
        `coordinate must be an integer from 0 through ${limit - 1}`,
      );
    }
  }
}

function cellOrdinal(coordinate: CoordinateV1, geometry: LevelGeometryV1): number {
  return ((coordinate.z * geometry.height) + coordinate.y) * geometry.width + coordinate.x;
}

function coordinateForOrdinal(ordinal: number, geometry: LevelGeometryV1): CoordinateV1 {
  const planeSize = geometry.width * geometry.height;
  const z = Math.floor(ordinal / planeSize);
  const withinPlane = ordinal - (z * planeSize);
  const y = Math.floor(withinPlane / geometry.width);
  return { x: withinPlane - (y * geometry.width), y, z };
}

function equalCoordinate(left: CoordinateV1, right: CoordinateV1): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function copyCoordinate(coordinate: CoordinateV1): CoordinateV1 {
  return { x: coordinate.x, y: coordinate.y, z: coordinate.z };
}

function normalizeDirections(values: readonly DirectionV1[], path: string): readonly DirectionV1[] {
  if (!Array.isArray(values)) {
    fail("analysis.evidence-invalid", path, "expected a direction array");
  }
  const seen = new Set<DirectionV1>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || !DIRECTION_ORDER.has(value)) {
      fail(
        "analysis.evidence-invalid",
        `${path}/${index}`,
        `expected one of ${DIRECTIONS.join(", ")}`,
      );
    }
    if (seen.has(value)) {
      fail("analysis.evidence-invalid", `${path}/${index}`, "duplicate direction");
    }
    seen.add(value);
  }
  return [...seen].sort((left, right) => (
    (DIRECTION_ORDER.get(left) ?? 0) - (DIRECTION_ORDER.get(right) ?? 0)
  ));
}

function directionMask(directions: readonly DirectionV1[]): number {
  let mask = 0;
  for (const direction of directions) {
    mask |= DIRECTION_BIT[direction];
  }
  return mask;
}

function validateFactsAndBuildPlacementMap(
  input: AnalyzeStaticTopologyInputV1,
): ReadonlyMap<PlacementIdV1, StaticPlacementFactV1> {
  const { levelFacts } = input;
  if (
    levelFacts.protocol !== "ccsolver-artifact"
    || levelFacts.protocolVersion !== 1
    || levelFacts.artifactType !== "level-facts"
    || levelFacts.schemaVersion !== 1
  ) {
    fail(
      "analysis.binding-invalid",
      "/levelFacts",
      "expected a LevelFactsV1 artifact envelope",
    );
  }

  const geometry = levelFacts.payload.geometry;
  validateGeometry(geometry, "/levelFacts/payload/geometry");
  const placements = new Map<PlacementIdV1, StaticPlacementFactV1>();
  for (let index = 0; index < levelFacts.payload.placements.length; index += 1) {
    const placement = levelFacts.payload.placements[index];
    if (placement === undefined) {
      continue;
    }
    const path = `/levelFacts/payload/placements/${index}`;
    if (placements.has(placement.placementId)) {
      fail("analysis.invariant-invalid", `${path}/placementId`, "duplicate placement identity");
    }
    assertCoordinateInBounds(placement.descriptor.coordinate, geometry, `${path}/descriptor/coordinate`);
    placements.set(placement.placementId, placement);
  }

  const requirePlacement = (placementId: PlacementIdV1, path: string): StaticPlacementFactV1 => {
    const placement = placements.get(placementId);
    if (placement === undefined) {
      fail("analysis.invariant-invalid", path, "dangling placement reference");
    }
    return placement;
  };

  const actors = new Map<ActorIdV1, PlacementIdV1>();
  for (let index = 0; index < levelFacts.payload.actors.length; index += 1) {
    const actor = levelFacts.payload.actors[index];
    if (actor === undefined) {
      continue;
    }
    const actorPath = `/levelFacts/payload/actors/${index}`;
    if (actors.has(actor.actorId)) {
      fail("analysis.invariant-invalid", `${actorPath}/actorId`, "duplicate actor identity");
    }
    requirePlacement(actor.descriptor.placementId, `${actorPath}/descriptor/placementId`);
    actors.set(actor.actorId, actor.descriptor.placementId);
  }

  for (let index = 0; index < levelFacts.payload.resourceSources.length; index += 1) {
    const source = levelFacts.payload.resourceSources[index];
    if (source !== undefined) {
      requirePlacement(
        source.placementId,
        `/levelFacts/payload/resourceSources/${index}/placementId`,
      );
    }
  }
  for (let index = 0; index < levelFacts.payload.resourceGates.length; index += 1) {
    const gate = levelFacts.payload.resourceGates[index];
    if (gate !== undefined) {
      requirePlacement(gate.placementId, `/levelFacts/payload/resourceGates/${index}/placementId`);
    }
  }
  for (let index = 0; index < levelFacts.payload.exits.length; index += 1) {
    const placementId = levelFacts.payload.exits[index];
    if (placementId !== undefined) {
      requirePlacement(placementId, `/levelFacts/payload/exits/${index}`);
    }
  }
  for (let index = 0; index < levelFacts.payload.wiring.length; index += 1) {
    const wiring = levelFacts.payload.wiring[index];
    if (wiring === undefined) {
      continue;
    }
    const path = `/levelFacts/payload/wiring/${index}/descriptor`;
    requirePlacement(wiring.descriptor.sourcePlacementId, `${path}/sourcePlacementId`);
    requirePlacement(wiring.descriptor.targetPlacementId, `${path}/targetPlacementId`);
  }
  const networkIds = new Set<string>();
  for (let networkIndex = 0; networkIndex < levelFacts.payload.transports.length; networkIndex += 1) {
    const network = levelFacts.payload.transports[networkIndex];
    if (network === undefined) {
      continue;
    }
    const networkPath = `/levelFacts/payload/transports/${networkIndex}`;
    if (networkIds.has(network.networkId)) {
      fail("analysis.invariant-invalid", `${networkPath}/networkId`, "duplicate transport network ID");
    }
    networkIds.add(network.networkId);
    const memberIds = new Set<PlacementIdV1>();
    for (let memberIndex = 0; memberIndex < network.members.length; memberIndex += 1) {
      const member = network.members[memberIndex];
      if (member === undefined) {
        continue;
      }
      const memberPath = `${networkPath}/members/${memberIndex}`;
      requirePlacement(member, memberPath);
      if (memberIds.has(member)) {
        fail("analysis.invariant-invalid", memberPath, "duplicate transport member");
      }
      memberIds.add(member);
    }
  }
  for (let index = 0; index < levelFacts.payload.forcedSurfaces.length; index += 1) {
    const surface = levelFacts.payload.forcedSurfaces[index];
    if (surface !== undefined) {
      requirePlacement(
        surface.placementId,
        `/levelFacts/payload/forcedSurfaces/${index}/placementId`,
      );
    }
  }
  for (let index = 0; index < levelFacts.payload.hazards.length; index += 1) {
    const hazard = levelFacts.payload.hazards[index];
    if (hazard !== undefined) {
      requirePlacement(hazard.placementId, `/levelFacts/payload/hazards/${index}/placementId`);
    }
  }
  const unknownIds = new Set<string>();
  for (let index = 0; index < levelFacts.payload.unknowns.length; index += 1) {
    const unknown = levelFacts.payload.unknowns[index];
    if (unknown === undefined) {
      continue;
    }
    const path = `/levelFacts/payload/unknowns/${index}`;
    if (unknownIds.has(unknown.unknownId)) {
      fail("analysis.invariant-invalid", `${path}/unknownId`, "duplicate unknown fact ID");
    }
    unknownIds.add(unknown.unknownId);
    if (unknown.kind === "unknown-catalog-element") {
      requirePlacement(unknown.placementId, `${path}/placementId`);
    } else if (unknown.kind === "unresolved-wiring") {
      assertCoordinateInBounds(unknown.source, geometry, `${path}/source`);
      assertCoordinateInBounds(unknown.target, geometry, `${path}/target`);
    } else {
      for (let coordinateIndex = 0; coordinateIndex < unknown.coordinates.length; coordinateIndex += 1) {
        const coordinate = unknown.coordinates[coordinateIndex];
        if (coordinate !== undefined) {
          assertCoordinateInBounds(coordinate, geometry, `${path}/coordinates/${coordinateIndex}`);
        }
      }
    }
  }

  return placements;
}

function validateBindings(input: AnalyzeStaticTopologyInputV1): void {
  const { evidence, levelFacts, levelFactsDigest, topologyEvidence } = input;
  assertNonemptyString(input.analyzerRevision, "/analyzerRevision");
  assertSha256(levelFactsDigest, "/levelFactsDigest");
  assertSha256(topologyEvidence.digest, "/topologyEvidence/digest");
  assertNonnegativeInteger(topologyEvidence.byteLength, "/topologyEvidence/byteLength");
  if (evidence.evidenceVersion !== 1) {
    fail("analysis.evidence-invalid", "/evidence/evidenceVersion", "expected evidence version 1");
  }
  if (
    evidence.levelFacts.protocolVersion !== 1
    || evidence.levelFacts.artifactType !== "level-facts"
    || evidence.levelFacts.schemaVersion !== 1
  ) {
    fail(
      "analysis.binding-invalid",
      "/evidence/levelFacts",
      "topology evidence must reference LevelFactsV1",
    );
  }
  assertSha256(evidence.levelFacts.digest, "/evidence/levelFacts/digest");
  if (evidence.levelFacts.digest !== levelFactsDigest) {
    fail(
      "analysis.binding-invalid",
      "/evidence/levelFacts/digest",
      "topology evidence does not reference the supplied level-facts bytes",
    );
  }
  if (evidence.target !== levelFacts.payload.target) {
    fail(
      "analysis.binding-invalid",
      "/evidence/target",
      "topology target does not match level facts",
    );
  }
  const factsLevel = levelFacts.payload.level;
  if (
    evidence.level.occurrenceId !== factsLevel.occurrenceId
    || evidence.level.normalizationProfile !== factsLevel.normalizationProfile
    || evidence.level.normalizedGameplayDigest !== factsLevel.normalizedGameplayDigest
  ) {
    fail(
      "analysis.binding-invalid",
      "/evidence/level",
      "topology level identity does not match level facts",
    );
  }
  if (!equalGeometry(evidence.geometry, levelFacts.payload.geometry)) {
    fail(
      "analysis.binding-invalid",
      "/evidence/geometry",
      "topology geometry does not match level facts",
    );
  }
  assertNonemptyString(evidence.policy.policyId, "/evidence/policy/policyId");
  assertNonemptyString(evidence.policy.policyRevision, "/evidence/policy/policyRevision");
}

function validatePlacementAtCell(
  placementId: PlacementIdV1,
  path: string,
  coordinate: CoordinateV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): void {
  const placement = placements.get(placementId);
  if (placement === undefined) {
    fail("analysis.invariant-invalid", path, "dangling placement reference");
  }
  if (!equalCoordinate(placement.descriptor.coordinate, coordinate)) {
    fail(
      "analysis.invariant-invalid",
      path,
      "placement reference belongs to a different logical cell",
    );
  }
}

function normalizeSupporting(
  supporting: readonly StaticTopologySupportingPlacementV1[],
  path: string,
  coordinate: CoordinateV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): readonly StaticTopologySupportingPlacementV1[] {
  if (!Array.isArray(supporting)) {
    fail("analysis.evidence-invalid", path, "expected a supporting-placement array");
  }
  const seen = new Set<PlacementIdV1>();
  const normalized = supporting.map((entry, index) => {
    const entryPath = `${path}/${index}`;
    if (
      entry.sourcePlane !== "lower"
      && entry.sourcePlane !== "upper"
      && entry.sourcePlane !== "implicit"
    ) {
      fail(
        "analysis.evidence-invalid",
        `${entryPath}/sourcePlane`,
        "expected lower, upper, or implicit",
      );
    }
    validatePlacementAtCell(
      entry.placementId,
      `${entryPath}/placementId`,
      coordinate,
      placements,
    );
    if (seen.has(entry.placementId)) {
      fail("analysis.evidence-invalid", `${entryPath}/placementId`, "duplicate supporting placement");
    }
    seen.add(entry.placementId);
    return { placementId: entry.placementId, sourcePlane: entry.sourcePlane };
  });
  normalized.sort((left, right) => {
    const sourcePlaneOrder = (sourcePlane: string): number => (
      sourcePlane === "lower" ? 0 : sourcePlane === "upper" ? 1 : 2
    );
    const planeOrder = sourcePlaneOrder(left.sourcePlane) - sourcePlaneOrder(right.sourcePlane);
    return planeOrder || compareText(left.placementId, right.placementId);
  });
  return normalized;
}

function normalizeCaveats(
  caveats: readonly StaticTopologyCaveatV1[],
  path: string,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): readonly StaticTopologyCaveatV1[] {
  if (!Array.isArray(caveats)) {
    fail("analysis.evidence-invalid", path, "expected a caveat array");
  }
  const allowedKinds = new Set([
    "resource-gate",
    "hazard",
    "requires-release",
    "actor-occupancy",
    "target-policy",
    "unknown-policy",
    "state-dependent",
  ]);
  const caveatIds = new Set<string>();
  const normalized = caveats.map((caveat, index) => {
    const caveatPath = `${path}/${index}`;
    assertNonemptyString(caveat.caveatId, `${caveatPath}/caveatId`);
    if (!allowedKinds.has(caveat.kind)) {
      fail("analysis.evidence-invalid", `${caveatPath}/kind`, "unknown topology caveat kind");
    }
    if (caveatIds.has(caveat.caveatId)) {
      fail("analysis.evidence-invalid", `${caveatPath}/caveatId`, "duplicate caveat ID");
    }
    caveatIds.add(caveat.caveatId);
    if (caveat.placementId !== null && !placements.has(caveat.placementId)) {
      fail("analysis.invariant-invalid", `${caveatPath}/placementId`, "dangling placement reference");
    }
    return {
      caveatId: caveat.caveatId,
      kind: caveat.kind,
      placementId: caveat.placementId,
    };
  });
  normalized.sort((left, right) => (
    compareText(left.caveatId, right.caveatId)
    || compareText(left.kind, right.kind)
    || compareText(left.placementId ?? "", right.placementId ?? "")
  ));
  return normalized;
}

function normalizeOccupant(
  occupant: StaticTopologyOccupancyV1,
  path: string,
  coordinate: CoordinateV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
  actors: ReadonlyMap<ActorIdV1, PlacementIdV1>,
): StaticTopologyOccupancyV1 {
  const allowedKinds = new Set(["none", "player-start", "pushable", "autonomous", "contained"]);
  if (!allowedKinds.has(occupant.kind)) {
    fail("analysis.evidence-invalid", `${path}/kind`, "unknown occupant kind");
  }
  if (occupant.kind === "none") {
    if (occupant.placementId !== null || occupant.actorId !== null) {
      fail(
        "analysis.evidence-invalid",
        path,
        "an empty occupant must have null placement and actor identities",
      );
    }
  } else if (occupant.placementId === null) {
    fail(
      "analysis.evidence-invalid",
      `${path}/placementId`,
      "a non-empty occupant requires a placement identity",
    );
  }
  if (occupant.placementId !== null) {
    validatePlacementAtCell(occupant.placementId, `${path}/placementId`, coordinate, placements);
  }
  if (occupant.actorId !== null) {
    const actorPlacementId = actors.get(occupant.actorId);
    if (actorPlacementId === undefined) {
      fail("analysis.invariant-invalid", `${path}/actorId`, "dangling actor reference");
    }
    if (actorPlacementId !== occupant.placementId) {
      fail(
        "analysis.invariant-invalid",
        `${path}/actorId`,
        "actor identity does not belong to the occupant placement",
      );
    }
  }
  return {
    kind: occupant.kind,
    placementId: occupant.placementId,
    actorId: occupant.actorId,
  };
}

function normalizeCells(
  input: AnalyzeStaticTopologyInputV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
  logicalCellCount: number,
): readonly NormalizedCell[] {
  const { evidence, levelFacts } = input;
  if (!Array.isArray(evidence.cells) || evidence.cells.length !== logicalCellCount) {
    fail(
      "analysis.evidence-invalid",
      "/evidence/cells",
      "topology evidence must contain exactly one entry for every logical cell",
    );
  }
  const actors = new Map<ActorIdV1, PlacementIdV1>();
  for (const actor of levelFacts.payload.actors) {
    actors.set(actor.actorId, actor.descriptor.placementId);
  }
  const placementIdsByOrdinal: PlacementIdV1[][] = Array.from(
    { length: logicalCellCount },
    () => [],
  );
  for (const placement of placements.values()) {
    const ordinal = cellOrdinal(placement.descriptor.coordinate, evidence.geometry);
    placementIdsByOrdinal[ordinal]?.push(placement.placementId);
  }
  for (const placementIds of placementIdsByOrdinal) {
    placementIds.sort(compareText);
  }
  const normalizedByOrdinal: Array<NormalizedCell | undefined> = Array(logicalCellCount);
  const classifications = new Set(["open", "blocked", "conditional", "dynamic", "unknown"]);
  for (let index = 0; index < evidence.cells.length; index += 1) {
    const cell = evidence.cells[index];
    if (cell === undefined) {
      continue;
    }
    const path = `/evidence/cells/${index}`;
    assertCoordinateInBounds(cell.coordinate, evidence.geometry, `${path}/coordinate`);
    const ordinal = cellOrdinal(cell.coordinate, evidence.geometry);
    if (normalizedByOrdinal[ordinal] !== undefined) {
      fail("analysis.evidence-invalid", `${path}/coordinate`, "duplicate logical cell coordinate");
    }
    if (!classifications.has(cell.classification)) {
      fail("analysis.evidence-invalid", `${path}/classification`, "unknown traversal classification");
    }
    let effective: StaticTopologySupportingPlacementV1 | null = null;
    if (cell.effective !== null) {
      if (
        cell.effective.sourcePlane !== "lower"
        && cell.effective.sourcePlane !== "upper"
        && cell.effective.sourcePlane !== "implicit"
      ) {
        fail(
          "analysis.evidence-invalid",
          `${path}/effective/sourcePlane`,
          "expected lower, upper, or implicit",
        );
      }
      validatePlacementAtCell(
        cell.effective.placementId,
        `${path}/effective/placementId`,
        cell.coordinate,
        placements,
      );
      effective = {
        placementId: cell.effective.placementId,
        sourcePlane: cell.effective.sourcePlane,
      };
    }
    const supporting = normalizeSupporting(
      cell.supporting,
      `${path}/supporting`,
      cell.coordinate,
      placements,
    );
    if (effective !== null) {
      const duplicateSupportingIndex = cell.supporting.findIndex(
        (entry: StaticTopologySupportingPlacementV1) => (
          entry.placementId === effective?.placementId
        ),
      );
      if (duplicateSupportingIndex >= 0) {
        fail(
          "analysis.evidence-invalid",
          `${path}/supporting/${duplicateSupportingIndex}/placementId`,
          "effective and supporting placement roles must be disjoint",
        );
      }
    }
    const representedPlacementIds = [
      ...(effective === null ? [] : [effective.placementId]),
      ...supporting.map((entry) => entry.placementId),
    ].sort(compareText);
    const expectedPlacementIds = placementIdsByOrdinal[ordinal] ?? [];
    if (
      representedPlacementIds.length !== expectedPlacementIds.length
      || representedPlacementIds.some((placementId, placementIndex) => (
        placementId !== expectedPlacementIds[placementIndex]
      ))
    ) {
      fail(
        "analysis.invariant-invalid",
        `${path}/supporting`,
        "effective and supporting roles must represent every level-facts placement exactly once",
      );
    }
    const entryDirections = normalizeDirections(cell.entryDirections, `${path}/entryDirections`);
    const exitDirections = normalizeDirections(cell.exitDirections, `${path}/exitDirections`);
    const caveats = normalizeCaveats(cell.caveats, `${path}/caveats`, placements);
    const occupant = normalizeOccupant(
      cell.occupant,
      `${path}/occupant`,
      cell.coordinate,
      placements,
      actors,
    );
    normalizedByOrdinal[ordinal] = {
      ordinal,
      coordinate: copyCoordinate(cell.coordinate),
      effective,
      supporting,
      entryDirections,
      exitDirections,
      entryMask: directionMask(entryDirections),
      exitMask: directionMask(exitDirections),
      classification: cell.classification,
      caveats,
      occupant,
    };
  }
  for (let ordinal = 0; ordinal < normalizedByOrdinal.length; ordinal += 1) {
    if (normalizedByOrdinal[ordinal] === undefined) {
      fail(
        "analysis.evidence-invalid",
        "/evidence/cells",
        `missing logical cell ${ordinal}`,
      );
    }
  }
  return normalizedByOrdinal as readonly NormalizedCell[];
}

function validateInput(input: AnalyzeStaticTopologyInputV1): ValidatedInput {
  const placements = validateFactsAndBuildPlacementMap(input);
  validateBindings(input);
  const logicalCellCount = validateGeometry(input.evidence.geometry, "/evidence/geometry");
  const cells = normalizeCells(input, placements, logicalCellCount);
  return { placements, cells, logicalCellCount };
}

function neighborOrdinal(
  cell: NormalizedCell,
  direction: DirectionV1,
  geometry: LevelGeometryV1,
): number | undefined {
  const step = DIRECTION_STEP[direction];
  const x = cell.coordinate.x + step.dx;
  const y = cell.coordinate.y + step.dy;
  if (x < 0 || x >= geometry.width || y < 0 || y >= geometry.height) {
    return undefined;
  }
  // Static planar adjacency is intentionally confined to the same z layer.
  return ((cell.coordinate.z * geometry.height) + y) * geometry.width + x;
}

function canMove(
  from: NormalizedCell,
  to: NormalizedCell,
  direction: DirectionV1,
): boolean {
  return (from.exitMask & DIRECTION_BIT[direction]) !== 0
    && (to.entryMask & DIRECTION_BIT[direction]) !== 0;
}

interface CertainGraph {
  readonly directedAdjacency: readonly StaticDirectedAdjacencyV1[];
  readonly weakNeighbors: readonly (readonly number[] | undefined)[];
  readonly weakConnectionCount: number;
  readonly bidirectionalConnectionCount: number;
  readonly oneWayConnectionCount: number;
}

function buildCertainGraph(
  cells: readonly NormalizedCell[],
  geometry: LevelGeometryV1,
): CertainGraph {
  const directedAdjacency: StaticDirectedAdjacencyV1[] = [];
  const weakNeighbors: Array<number[] | undefined> = Array(cells.length);
  for (const cell of cells) {
    if (cell.classification === "open") {
      weakNeighbors[cell.ordinal] = [];
    }
  }

  for (const cell of cells) {
    if (cell.classification !== "open") {
      continue;
    }
    for (const direction of DIRECTIONS) {
      const adjacentOrdinal = neighborOrdinal(cell, direction, geometry);
      if (adjacentOrdinal === undefined) {
        continue;
      }
      const adjacent = cells[adjacentOrdinal];
      if (
        adjacent !== undefined
        && adjacent.classification === "open"
        && canMove(cell, adjacent, direction)
      ) {
        directedAdjacency.push({
          fromCellOrdinal: cell.ordinal,
          toCellOrdinal: adjacentOrdinal,
          direction,
        });
      }
    }
  }

  let weakConnectionCount = 0;
  let bidirectionalConnectionCount = 0;
  let oneWayConnectionCount = 0;
  for (const cell of cells) {
    if (cell.classification !== "open") {
      continue;
    }
    for (const direction of ["east", "south"] as const) {
      const adjacentOrdinal = neighborOrdinal(cell, direction, geometry);
      if (adjacentOrdinal === undefined) {
        continue;
      }
      const adjacent = cells[adjacentOrdinal];
      if (adjacent === undefined || adjacent.classification !== "open") {
        continue;
      }
      const forward = canMove(cell, adjacent, direction);
      const reverse = canMove(adjacent, cell, OPPOSITE[direction]);
      if (!forward && !reverse) {
        continue;
      }
      weakConnectionCount += 1;
      if (forward && reverse) {
        bidirectionalConnectionCount += 1;
      } else {
        oneWayConnectionCount += 1;
      }
      weakNeighbors[cell.ordinal]?.push(adjacentOrdinal);
      weakNeighbors[adjacentOrdinal]?.push(cell.ordinal);
    }
  }
  for (const neighbors of weakNeighbors) {
    neighbors?.sort(compareNumber);
  }
  return {
    directedAdjacency,
    weakNeighbors,
    weakConnectionCount,
    bidirectionalConnectionCount,
    oneWayConnectionCount,
  };
}

interface RegionAnalysis {
  readonly regions: readonly StaticWeakRegionV1[];
  readonly regionIndexByOrdinal: Int32Array;
}

function buildWeakRegions(
  cells: readonly NormalizedCell[],
  weakNeighbors: readonly (readonly number[] | undefined)[],
): RegionAnalysis {
  const regionIndexByOrdinal = new Int32Array(cells.length);
  regionIndexByOrdinal.fill(-1);
  const regions: StaticWeakRegionV1[] = [];
  for (const cell of cells) {
    if (cell.classification !== "open" || regionIndexByOrdinal[cell.ordinal] !== -1) {
      continue;
    }
    const regionIndex = regions.length;
    const members: number[] = [];
    const stack = [cell.ordinal];
    regionIndexByOrdinal[cell.ordinal] = regionIndex;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) {
        continue;
      }
      members.push(current);
      for (const adjacent of weakNeighbors[current] ?? []) {
        if (regionIndexByOrdinal[adjacent] === -1) {
          regionIndexByOrdinal[adjacent] = regionIndex;
          stack.push(adjacent);
        }
      }
    }
    members.sort(compareNumber);
    const minimumCellOrdinal = members[0];
    if (minimumCellOrdinal === undefined) {
      fail("analysis.invariant-invalid", "/analysis/regions", "empty weak region");
    }
    regions.push({
      regionId: `region:${minimumCellOrdinal}`,
      minimumCellOrdinal,
      cellOrdinals: members,
    });
  }
  return { regions, regionIndexByOrdinal };
}

interface DfsFrame {
  readonly node: number;
  nextNeighborIndex: number;
  childCount: number;
}

function findArticulationOrdinals(
  cells: readonly NormalizedCell[],
  weakNeighbors: readonly (readonly number[] | undefined)[],
): readonly number[] {
  const discovery = new Int32Array(cells.length);
  const low = new Int32Array(cells.length);
  const parent = new Int32Array(cells.length);
  const articulation = new Uint8Array(cells.length);
  discovery.fill(-1);
  parent.fill(-1);
  let time = 0;

  for (const root of cells) {
    if (root.classification !== "open" || discovery[root.ordinal] !== -1) {
      continue;
    }
    discovery[root.ordinal] = time;
    low[root.ordinal] = time;
    time += 1;
    const stack: DfsFrame[] = [{ node: root.ordinal, nextNeighborIndex: 0, childCount: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (frame === undefined) {
        break;
      }
      const neighbors = weakNeighbors[frame.node] ?? [];
      const adjacent = neighbors[frame.nextNeighborIndex];
      if (adjacent !== undefined) {
        frame.nextNeighborIndex += 1;
        if (discovery[adjacent] === -1) {
          frame.childCount += 1;
          parent[adjacent] = frame.node;
          discovery[adjacent] = time;
          low[adjacent] = time;
          time += 1;
          stack.push({ node: adjacent, nextNeighborIndex: 0, childCount: 0 });
        } else if (adjacent !== parent[frame.node]) {
          low[frame.node] = Math.min(low[frame.node] ?? 0, discovery[adjacent] ?? 0);
        }
        continue;
      }

      stack.pop();
      const parentOrdinal = parent[frame.node];
      if (parentOrdinal === undefined) {
        fail("analysis.invariant-invalid", "/analysis/articulationPoints", "invalid DFS parent");
      }
      if (parentOrdinal === -1) {
        if (frame.childCount > 1) {
          articulation[frame.node] = 1;
        }
      } else {
        low[parentOrdinal] = Math.min(low[parentOrdinal] ?? 0, low[frame.node] ?? 0);
        if (
          parent[parentOrdinal] !== -1
          && (low[frame.node] ?? 0) >= (discovery[parentOrdinal] ?? 0)
        ) {
          articulation[parentOrdinal] = 1;
        }
      }
    }
  }

  const result: number[] = [];
  for (let ordinal = 0; ordinal < articulation.length; ordinal += 1) {
    if (articulation[ordinal] === 1) {
      result.push(ordinal);
    }
  }
  return result;
}

function regionIdsFromIndexes(
  indexes: ReadonlySet<number>,
  regions: readonly StaticWeakRegionV1[],
): readonly StaticRegionIdV1[] {
  return [...indexes]
    .sort(compareNumber)
    .map((index) => {
      const region = regions[index];
      if (region === undefined) {
        fail("analysis.invariant-invalid", "/analysis/regions", "invalid internal region index");
      }
      return region.regionId;
    });
}

function buildBoundaries(
  cells: readonly NormalizedCell[],
  geometry: LevelGeometryV1,
  regions: readonly StaticWeakRegionV1[],
  regionIndexByOrdinal: Int32Array,
): readonly StaticBoundaryV1[] {
  const boundaries: StaticBoundaryV1[] = [];
  for (const cell of cells) {
    if (
      cell.classification !== "conditional"
      && cell.classification !== "dynamic"
      && cell.classification !== "unknown"
    ) {
      continue;
    }
    const incomingRegionIndexes = new Set<number>();
    const outgoingRegionIndexes = new Set<number>();
    for (const direction of DIRECTIONS) {
      const adjacentOrdinal = neighborOrdinal(cell, direction, geometry);
      if (adjacentOrdinal === undefined) {
        continue;
      }
      const adjacent = cells[adjacentOrdinal];
      if (adjacent === undefined || adjacent.classification !== "open") {
        continue;
      }
      const regionIndex = regionIndexByOrdinal[adjacentOrdinal];
      if (regionIndex === undefined || regionIndex < 0) {
        continue;
      }
      if (canMove(adjacent, cell, OPPOSITE[direction])) {
        incomingRegionIndexes.add(regionIndex);
      }
      if (canMove(cell, adjacent, direction)) {
        outgoingRegionIndexes.add(regionIndex);
      }
    }
    boundaries.push({
      boundaryId: `boundary:${cell.ordinal}`,
      kind: cell.classification,
      cellOrdinal: cell.ordinal,
      coordinate: copyCoordinate(cell.coordinate),
      effectivePlacementId: cell.effective?.placementId ?? null,
      incomingRegionIds: regionIdsFromIndexes(incomingRegionIndexes, regions),
      outgoingRegionIds: regionIdsFromIndexes(outgoingRegionIndexes, regions),
      caveats: cell.caveats.map((caveat) => ({ ...caveat })),
      occupant: { ...cell.occupant },
    });
  }
  return boundaries;
}

function sortedRegionUnion(
  regionIds: readonly StaticRegionIdV1[],
  regionIndexById: ReadonlyMap<StaticRegionIdV1, number>,
): readonly StaticRegionIdV1[] {
  return [...new Set(regionIds)].sort((left, right) => (
    (regionIndexById.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (regionIndexById.get(right) ?? Number.MAX_SAFE_INTEGER)
  ));
}

function makeRegionAttachmentResolver(
  geometry: LevelGeometryV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
  regions: readonly StaticWeakRegionV1[],
  regionIndexByOrdinal: Int32Array,
  boundaries: readonly StaticBoundaryV1[],
): (placementId: PlacementIdV1) => StaticRegionAttachmentV1 {
  const boundaryByOrdinal = new Map(boundaries.map((boundary) => [boundary.cellOrdinal, boundary]));
  const regionIndexById = new Map(regions.map((region, index) => [region.regionId, index]));
  return (placementId) => {
    const placement = placements.get(placementId);
    if (placement === undefined) {
      fail("analysis.invariant-invalid", "/analysis/attachments", "dangling placement reference");
    }
    const coordinate = placement.descriptor.coordinate;
    const ordinal = cellOrdinal(coordinate, geometry);
    const certainRegionIndex = regionIndexByOrdinal[ordinal];
    let regionIds: readonly StaticRegionIdV1[] = [];
    if (certainRegionIndex !== undefined && certainRegionIndex >= 0) {
      const region = regions[certainRegionIndex];
      if (region !== undefined) {
        regionIds = [region.regionId];
      }
    } else {
      const boundary = boundaryByOrdinal.get(ordinal);
      if (boundary !== undefined) {
        regionIds = sortedRegionUnion(
          [...boundary.incomingRegionIds, ...boundary.outgoingRegionIds],
          regionIndexById,
        );
      }
    }
    return { cellOrdinal: ordinal, coordinate: copyCoordinate(coordinate), regionIds };
  };
}

function unknownFactCoordinates(
  unknown: UnknownStaticFactV1,
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): readonly CoordinateV1[] {
  if (unknown.kind === "unknown-catalog-element") {
    const placement = placements.get(unknown.placementId);
    return placement === undefined ? [] : [placement.descriptor.coordinate];
  }
  if (unknown.kind === "unresolved-wiring") {
    return [unknown.source, unknown.target];
  }
  return unknown.coordinates;
}

function buildUncertainties(
  cells: readonly NormalizedCell[],
  geometry: LevelGeometryV1,
  unknowns: readonly UnknownStaticFactV1[],
  placements: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): readonly StaticAnalysisUncertaintyV1[] {
  const result: StaticAnalysisUncertaintyV1[] = [];
  for (const cell of cells) {
    if (cell.classification === "unknown") {
      result.push({
        uncertaintyId: `topology-unknown-cell:${cell.ordinal}`,
        kind: "unknown-traversal",
        sourceKind: null,
        placementId: cell.effective?.placementId ?? null,
        cellOrdinals: [cell.ordinal],
        detail: "Target policy did not establish whether this logical cell is traversable.",
      });
    }
  }
  for (const unknown of [...unknowns].sort((left, right) => compareText(left.unknownId, right.unknownId))) {
    const ordinals = [...new Set(
      unknownFactCoordinates(unknown, placements).map((coordinate) => cellOrdinal(coordinate, geometry)),
    )].sort(compareNumber);
    result.push({
      uncertaintyId: `level-fact:${unknown.unknownId}`,
      kind: "unknown-static-fact",
      sourceKind: unknown.kind,
      placementId: unknown.kind === "unknown-catalog-element" ? unknown.placementId : null,
      cellOrdinals: ordinals,
      detail: unknown.reason,
    });
  }
  result.sort((left, right) => compareText(left.uncertaintyId, right.uncertaintyId));
  return result;
}

/**
 * Derives only facts justified by target-specific evidence. In particular,
 * conditional, dynamic, and unknown cells are never promoted into the certain
 * graph, regardless of their semantic type or directional masks.
 */
export function analyzeStaticTopology(input: AnalyzeStaticTopologyInputV1): StaticAnalysisV1 {
  const { placements, cells, logicalCellCount } = validateInput(input);
  const { levelFacts, evidence } = input;
  const geometry = evidence.geometry;
  const graph = buildCertainGraph(cells, geometry);
  const regionAnalysis = buildWeakRegions(cells, graph.weakNeighbors);
  const articulationOrdinals = findArticulationOrdinals(cells, graph.weakNeighbors);
  const articulationPoints = articulationOrdinals.map((ordinal) => {
    const regionIndex = regionAnalysis.regionIndexByOrdinal[ordinal];
    if (regionIndex === undefined) {
      fail("analysis.invariant-invalid", "/analysis/articulationPoints", "missing point region index");
    }
    const region = regionAnalysis.regions[regionIndex];
    if (region === undefined) {
      fail("analysis.invariant-invalid", "/analysis/articulationPoints", "missing point region");
    }
    return {
      cellOrdinal: ordinal,
      coordinate: coordinateForOrdinal(ordinal, geometry),
      regionId: region.regionId,
    };
  });
  const boundaries = buildBoundaries(
    cells,
    geometry,
    regionAnalysis.regions,
    regionAnalysis.regionIndexByOrdinal,
  );
  const resolveAttachment = makeRegionAttachmentResolver(
    geometry,
    placements,
    regionAnalysis.regions,
    regionAnalysis.regionIndexByOrdinal,
    boundaries,
  );

  const sourceFacts = [...levelFacts.payload.resourceSources]
    .sort((left, right) => compareText(left.placementId, right.placementId));
  const resourceDependencies = [...levelFacts.payload.resourceGates]
    .sort((left, right) => compareText(left.placementId, right.placementId))
    .map((gate) => ({
      gatePlacementId: gate.placementId,
      gateKind: gate.kind,
      resourceType: gate.resourceType,
      amount: gate.kind === "remaining-zero" ? null : gate.amount,
      ...resolveAttachment(gate.placementId),
      candidateSources: sourceFacts
        .filter((source) => source.resourceType === gate.resourceType)
        .map((source) => ({
          placementId: source.placementId,
          amount: source.amount,
          ...resolveAttachment(source.placementId),
        })),
    }));

  const transports: StaticTransportNetworkV1[] = [...levelFacts.payload.transports]
    .sort((left, right) => compareText(left.networkId, right.networkId))
    .map((network) => ({
      networkId: network.networkId,
      kind: network.kind,
      routingPolicy: network.routingPolicy,
      members: network.members.map((placementId, memberOrder) => ({
        memberOrder,
        placementId,
        ...resolveAttachment(placementId),
      })),
    }));

  const forcedSurfaces = [...levelFacts.payload.forcedSurfaces]
    .sort((left, right) => compareText(left.placementId, right.placementId))
    .map((surface) => ({
      placementId: surface.placementId,
      motion: surface.motion,
      direction: surface.direction,
      turn: surface.turn,
      ...resolveAttachment(surface.placementId),
    }));
  const hazards = [...levelFacts.payload.hazards]
    .sort((left, right) => compareText(left.placementId, right.placementId))
    .map((hazard) => ({
      placementId: hazard.placementId,
      hazardType: hazard.hazardType,
      persistence: hazard.persistence,
      protectionResources: [...hazard.protectionResources].sort(compareText),
      ...resolveAttachment(hazard.placementId),
    }));
  const exits = [...levelFacts.payload.exits]
    .sort(compareText)
    .map((placementId) => ({ placementId, ...resolveAttachment(placementId) }));
  const uncertainties = buildUncertainties(
    cells,
    geometry,
    levelFacts.payload.unknowns,
    placements,
  );

  let certainOpenCellCount = 0;
  let blockedCellCount = 0;
  let conditionalBoundaryCount = 0;
  let dynamicBoundaryCount = 0;
  let unknownBoundaryCount = 0;
  for (const cell of cells) {
    switch (cell.classification) {
      case "open": certainOpenCellCount += 1; break;
      case "blocked": blockedCellCount += 1; break;
      case "conditional": conditionalBoundaryCount += 1; break;
      case "dynamic": dynamicBoundaryCount += 1; break;
      case "unknown": unknownBoundaryCount += 1; break;
    }
  }
  const resourceCandidateSourceCount = resourceDependencies.reduce(
    (count, dependency) => count + dependency.candidateSources.length,
    0,
  );
  const transportIncidenceCount = transports.reduce(
    (count, network) => count + network.members.length,
    0,
  );

  return {
    analysisVersion: 1,
    analyzer: {
      analyzerId: "ccsolver-static-topology-analyzer",
      analyzerRevision: input.analyzerRevision,
      analysisProfile: "ccsolver-static-topology-v1",
    },
    target: evidence.target,
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: evidence.levelFacts.digest,
    },
    level: {
      occurrenceId: evidence.level.occurrenceId,
      normalizationProfile: evidence.level.normalizationProfile,
      normalizedGameplayDigest: evidence.level.normalizedGameplayDigest,
    },
    geometry: { width: geometry.width, height: geometry.height, depth: geometry.depth },
    topologyPolicy: {
      policyId: evidence.policy.policyId,
      policyRevision: evidence.policy.policyRevision,
    },
    topologyEvidence: {
      digest: input.topologyEvidence.digest,
      byteLength: input.topologyEvidence.byteLength,
    },
    directedAdjacency: graph.directedAdjacency,
    regions: regionAnalysis.regions,
    articulationPoints,
    boundaries,
    resourceDependencies,
    transports,
    attachments: { forcedSurfaces, hazards, exits },
    uncertainties,
    features: {
      logicalCellCount,
      certainOpenCellCount,
      blockedCellCount,
      conditionalBoundaryCount,
      dynamicBoundaryCount,
      unknownBoundaryCount,
      directedAdjacencyCount: graph.directedAdjacency.length,
      weakConnectionCount: graph.weakConnectionCount,
      bidirectionalConnectionCount: graph.bidirectionalConnectionCount,
      oneWayConnectionCount: graph.oneWayConnectionCount,
      weakRegionCount: regionAnalysis.regions.length,
      articulationPointCount: articulationPoints.length,
      resourceGateCount: resourceDependencies.length,
      resourceCandidateSourceCount,
      transportNetworkCount: transports.length,
      transportIncidenceCount,
      forcedSurfaceCount: forcedSurfaces.length,
      hazardCount: hazards.length,
      exitCount: exits.length,
      uncertaintyCount: uncertainties.length,
    },
  };
}
