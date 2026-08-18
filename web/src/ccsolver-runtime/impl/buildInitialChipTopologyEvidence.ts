import {
  encodeArtifact,
  identifyCanonicalJson,
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import type {
  StaticTopologyCaveatV1,
  StaticTopologyCellEvidenceV1,
  StaticTopologyEvidenceV1,
  StaticTopologyOccupancyV1,
  StaticTraversalClassV1,
} from "@tworld/ccsolver/analyze";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type CoordinateV1,
  type DirectionV1,
  type InitialActorFactV1,
  type LevelFactsV1,
  type PlacementIdV1,
  type RulesetTargetV1,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type {
  ProjectedLegacyPlacement,
  ProjectedLegacySourcePlane,
} from "./decodedLegacyLevelProjection";
import type {
  ProjectedTworldLevelForFacts,
  TworldLevelFactsBundle,
} from "./buildTworldLevelFacts";

const DIRECTION_ORDER: readonly DirectionV1[] = ["north", "east", "south", "west"];

export interface InitialChipTopologyPolicy {
  readonly target: RulesetTargetV1;
  readonly targetLabel: string;
  readonly policyId: string;
  readonly emptyTileId: number;
  readonly nothingTileId: number;
  readonly directionMasks: Readonly<Record<DirectionV1, number>>;
  readonly tileIdBySourceToken: ReadonlyMap<string, number>;
  readonly normalizeActorTileId: (tileId: number | null) => number | null;
  readonly actorControlMode: (tileId: number) => string;
  readonly isBlockActorId: (tileId: number) => boolean;
  readonly chipProbeUsesUnderlyingFloor: (tileId: number) => boolean;
  readonly chipMovementMask: (tileId: number) => number;
  readonly exitMovementMask: (tileId: number) => number;
  readonly isBlockedChipEnterRevealTile: (tileId: number) => boolean;
  readonly tileHasTag: (tileId: number, tag: "toggleable" | "exit") => boolean;
  readonly requiresReleaseToExit: (tileId: number) => boolean;
  readonly tileForcedFloorKind: (tileId: number) => string;
  readonly buttonAction: (tileId: number) => string;
  readonly chipEnterAction: (tileId: number) => string;
}

export interface InitialChipTopologyEvidenceBundle {
  readonly evidence: StaticTopologyEvidenceV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

export interface BuildInitialChipTopologyEvidenceInput {
  readonly factsBundle: TworldLevelFactsBundle;
  readonly projected: ProjectedTworldLevelForFacts;
  readonly policyRevision: string;
  readonly policy: InitialChipTopologyPolicy;
}

interface ResolvedProjectedPlacement {
  readonly placementId: PlacementIdV1;
  readonly projected: ProjectedLegacyPlacement;
  readonly tileId: number | null;
}

interface ClassificationIndexes {
  readonly actorByPlacementId: ReadonlyMap<PlacementIdV1, InitialActorFactV1>;
  readonly actorPlacementIds: ReadonlySet<PlacementIdV1>;
  readonly exitIds: ReadonlySet<PlacementIdV1>;
  readonly forcedIds: ReadonlySet<PlacementIdV1>;
  readonly gateByPlacementId: ReadonlyMap<
    PlacementIdV1,
    LevelFactsV1["payload"]["resourceGates"][number]
  >;
  readonly hazardByPlacementId: ReadonlyMap<
    PlacementIdV1,
    LevelFactsV1["payload"]["hazards"][number]
  >;
  readonly resourceSourceIds: ReadonlySet<PlacementIdV1>;
  readonly transportIds: ReadonlySet<PlacementIdV1>;
  readonly unknownPlacementIds: ReadonlySet<PlacementIdV1>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareCoordinates(left: CoordinateV1, right: CoordinateV1): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function coordinateKey(coordinate: CoordinateV1): string {
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
}

function placementKey(placement: {
  readonly coordinate: CoordinateV1;
  readonly stratum: string;
  readonly discriminator: number;
  readonly sourceToken: string;
}): string {
  const { coordinate } = placement;
  return [
    coordinate.z,
    coordinate.y,
    coordinate.x,
    placement.stratum,
    placement.discriminator,
    placement.sourceToken,
  ].join("\0");
}

function sourcePlaneRank(plane: ProjectedLegacySourcePlane): number {
  switch (plane) {
    case "upper": return 0;
    case "lower": return 1;
    case "implicit": return 2;
  }
}

function compareResolvedPlacements(
  left: ResolvedProjectedPlacement,
  right: ResolvedProjectedPlacement,
): number {
  return sourcePlaneRank(left.projected.sourcePlane) - sourcePlaneRank(right.projected.sourcePlane)
    || compareText(left.projected.stratum, right.projected.stratum)
    || left.projected.discriminator - right.projected.discriminator
    || compareText(left.placementId, right.placementId);
}

function directionsForMask(
  mask: number,
  policy: InitialChipTopologyPolicy,
): DirectionV1[] {
  return DIRECTION_ORDER.filter(
    (direction) => (mask & policy.directionMasks[direction]) !== 0,
  );
}

function addCaveat(
  caveats: Map<string, StaticTopologyCaveatV1>,
  caveat: StaticTopologyCaveatV1,
): void {
  caveats.set(`${caveat.caveatId}\0${caveat.kind}\0${caveat.placementId ?? ""}`, caveat);
}

function sortedCaveats(caveats: ReadonlyMap<string, StaticTopologyCaveatV1>): StaticTopologyCaveatV1[] {
  return [...caveats.values()].sort((left, right) => (
    compareText(left.caveatId, right.caveatId)
    || compareText(left.kind, right.kind)
    || compareText(left.placementId ?? "", right.placementId ?? "")
  ));
}

function buildClassificationIndexes(facts: LevelFactsV1): ClassificationIndexes {
  const actorByPlacementId = new Map(
    facts.payload.actors.map((actor) => [actor.descriptor.placementId, actor] as const),
  );
  return {
    actorByPlacementId,
    actorPlacementIds: new Set(actorByPlacementId.keys()),
    exitIds: new Set(facts.payload.exits),
    forcedIds: new Set(facts.payload.forcedSurfaces.map((surface) => surface.placementId)),
    gateByPlacementId: new Map(
      facts.payload.resourceGates.map((gate) => [gate.placementId, gate] as const),
    ),
    hazardByPlacementId: new Map(
      facts.payload.hazards.map((hazard) => [hazard.placementId, hazard] as const),
    ),
    resourceSourceIds: new Set(facts.payload.resourceSources.map((source) => source.placementId)),
    transportIds: new Set(facts.payload.transports.flatMap((network) => network.members)),
    unknownPlacementIds: new Set(facts.payload.unknowns.flatMap((unknown) => (
      unknown.kind === "unknown-catalog-element" ? [unknown.placementId] : []
    ))),
  };
}

function resolveOccupant(
  records: readonly ResolvedProjectedPlacement[],
  actorByPlacementId: ReadonlyMap<PlacementIdV1, InitialActorFactV1>,
  caveats: Map<string, StaticTopologyCaveatV1>,
  policy: InitialChipTopologyPolicy,
): StaticTopologyOccupancyV1 {
  const occupants = records.flatMap((record) => {
    const actor = actorByPlacementId.get(record.placementId);
    return actor === undefined ? [] : [{ actor, record }];
  }).sort((left, right) => (
    left.actor.descriptor.sourceActorOrder - right.actor.descriptor.sourceActorOrder
    || compareText(left.record.placementId, right.record.placementId)
  ));

  if (occupants.length === 0) {
    return { kind: "none", placementId: null, actorId: null };
  }
  const selected = occupants[0]!;
  if (occupants.length > 1) {
    addCaveat(caveats, {
      caveatId: "multiple-initial-occupants",
      kind: "state-dependent",
      placementId: selected.record.placementId,
    });
  }

  let kind: StaticTopologyOccupancyV1["kind"];
  const actorTileId = policy.normalizeActorTileId(selected.record.tileId);
  if (selected.actor.disposition === "contained" || selected.actor.disposition === "dormant") {
    kind = "contained";
  } else if (actorTileId !== null && policy.actorControlMode(actorTileId) === "player-input") {
    kind = "player-start";
  } else if (actorTileId !== null && policy.isBlockActorId(actorTileId)) {
    kind = "pushable";
  } else {
    kind = "autonomous";
  }
  addCaveat(caveats, {
    caveatId: kind === "player-start" ? "initial-player-occupancy" : `${kind}-occupancy`,
    kind: "actor-occupancy",
    placementId: selected.record.placementId,
  });
  return {
    kind,
    placementId: selected.record.placementId,
    actorId: selected.actor.actorId,
  };
}

function classifyCell(
  records: readonly ResolvedProjectedPlacement[],
  indexes: ClassificationIndexes,
  policy: InitialChipTopologyPolicy,
): StaticTopologyCellEvidenceV1 {
  const first = records[0];
  if (first === undefined) throw new Error("topology evidence cell has no projected placements");
  const coordinate = first.projected.coordinate;
  const caveats = new Map<string, StaticTopologyCaveatV1>();

  let effective: ResolvedProjectedPlacement | null = null;
  for (const record of records) {
    if (record.projected.interpretation === "unknown" || record.tileId === null) {
      effective = record;
      break;
    }
    if (indexes.actorPlacementIds.has(record.placementId)) {
      continue;
    }
    if (!policy.chipProbeUsesUnderlyingFloor(record.tileId)) {
      effective = record;
      break;
    }
  }
  const supporting = records.filter((record) => record !== effective);
  const revealedLower = effective?.projected.sourcePlane === "upper"
    && effective.tileId === policy.emptyTileId
    ? records.find((record) => record.projected.sourcePlane === "lower") ?? null
    : null;
  const hasUnknownPolicy = records.some((record) => (
    record.projected.interpretation === "unknown"
    || record.tileId === null
    || indexes.unknownPlacementIds.has(record.placementId)
  ));
  if (hasUnknownPolicy) {
    const unknown = records.find((record) => (
      record.projected.interpretation === "unknown"
      || record.tileId === null
      || indexes.unknownPlacementIds.has(record.placementId)
    ));
    addCaveat(caveats, {
      caveatId: unknown?.projected.interpretation === "unknown"
        ? "unknown-source-element"
        : "unmapped-source-policy",
      kind: "unknown-policy",
      placementId: unknown?.placementId ?? null,
    });
  }

  const occupant = resolveOccupant(records, indexes.actorByPlacementId, caveats, policy);
  let classification: StaticTraversalClassV1 = "unknown";
  let entryDirections: DirectionV1[] = [];
  let exitDirections: DirectionV1[] = [];
  const effectiveTileId = effective?.tileId ?? null;

  if (!hasUnknownPolicy && effective !== null && effectiveTileId !== null) {
    entryDirections = directionsForMask(policy.chipMovementMask(effectiveTileId), policy);
    exitDirections = directionsForMask(policy.exitMovementMask(effectiveTileId), policy);
    classification = entryDirections.length === 0 ? "blocked" : "open";

    const gate = indexes.gateByPlacementId.get(effective.placementId);
    const hazard = indexes.hazardByPlacementId.get(effective.placementId);
    const revealOnProbe = policy.isBlockedChipEnterRevealTile(effectiveTileId);
    const stateToggle = policy.tileHasTag(effectiveTileId, "toggleable");
    const releaseRequired = policy.requiresReleaseToExit(effectiveTileId);
    const forced = indexes.forcedIds.has(effective.placementId) || policy.tileForcedFloorKind(effectiveTileId) !== "none";
    const transported = indexes.transportIds.has(effective.placementId);
    const terminal = indexes.exitIds.has(effective.placementId) || policy.tileHasTag(effectiveTileId, "exit");
    const activation = policy.buttonAction(effectiveTileId) !== "none";
    const enterAction = policy.chipEnterAction(effectiveTileId);
    const localMutation = (enterAction === "clear-floor"
      && effectiveTileId !== policy.emptyTileId
      && effectiveTileId !== policy.nothingTileId)
      || enterAction === "popup-wall"
      || enterAction === "steal-boots";
    const effectiveCollectible = indexes.resourceSourceIds.has(effective.placementId);
    const supportingCollectible = supporting.some((record) => (
      record !== revealedLower && indexes.resourceSourceIds.has(record.placementId)
    ));

    if (gate !== undefined) {
      classification = "conditional";
      addCaveat(caveats, {
        caveatId: `resource-gate-${gate.kind}`,
        kind: "resource-gate",
        placementId: gate.placementId,
      });
    }
    if (hazard !== undefined) {
      classification = "conditional";
      addCaveat(caveats, {
        caveatId: "hazard-entry",
        kind: "hazard",
        placementId: hazard.placementId,
      });
    }
    if (releaseRequired) {
      classification = "conditional";
      addCaveat(caveats, {
        caveatId: "exit-requires-release",
        kind: "requires-release",
        placementId: effective.placementId,
      });
    }
    if (revealOnProbe) {
      classification = "dynamic";
      entryDirections = [];
      addCaveat(caveats, {
        caveatId: "blocked-probe-reveals-wall",
        kind: "state-dependent",
        placementId: effective.placementId,
      });
    }
    if (stateToggle) {
      classification = "dynamic";
      addCaveat(caveats, {
        caveatId: "mutable-toggle-state",
        kind: "state-dependent",
        placementId: effective.placementId,
      });
    }
    if (forced) {
      classification = "dynamic";
      addCaveat(caveats, {
        caveatId: "forced-movement-on-entry",
        kind: "target-policy",
        placementId: effective.placementId,
      });
    }
    if (transported) {
      classification = "dynamic";
      addCaveat(caveats, {
        caveatId: "transport-routing-on-entry",
        kind: "state-dependent",
        placementId: effective.placementId,
      });
    }
    if (terminal) {
      classification = "dynamic";
      addCaveat(caveats, {
        caveatId: "terminal-entry",
        kind: "target-policy",
        placementId: effective.placementId,
      });
    }
    if (activation) {
      classification = "dynamic";
      addCaveat(caveats, {
        caveatId: "activation-on-entry",
        kind: "state-dependent",
        placementId: effective.placementId,
      });
    }
    if (localMutation || effectiveCollectible || supportingCollectible) {
      classification = "dynamic";
      const mutationPlacement = effectiveCollectible
        ? effective.placementId
        : supporting.find((record) => indexes.resourceSourceIds.has(record.placementId))?.placementId
          ?? effective.placementId;
      addCaveat(caveats, {
        caveatId: supportingCollectible || effectiveCollectible ? "collects-on-entry" : "local-map-mutation",
        kind: "state-dependent",
        placementId: mutationPlacement,
      });
    }
  }

  if (!hasUnknownPolicy && revealedLower !== null && revealedLower.tileId !== null) {
    const lowerTileId = revealedLower.tileId;
    classification = "dynamic";
    exitDirections = directionsForMask(policy.exitMovementMask(lowerTileId), policy);
    addCaveat(caveats, {
      caveatId: "empty-top-preserves-underlying-floor",
      kind: "state-dependent",
      placementId: revealedLower.placementId,
    });

    const lowerGate = indexes.gateByPlacementId.get(revealedLower.placementId);
    const lowerHazard = indexes.hazardByPlacementId.get(revealedLower.placementId);
    const lowerReleaseRequired = policy.requiresReleaseToExit(lowerTileId);
    const lowerForced = indexes.forcedIds.has(revealedLower.placementId)
      || policy.tileForcedFloorKind(lowerTileId) !== "none";
    const lowerTransported = indexes.transportIds.has(revealedLower.placementId);
    const lowerTerminal = indexes.exitIds.has(revealedLower.placementId)
      || policy.tileHasTag(lowerTileId, "exit");
    const lowerActivation = policy.buttonAction(lowerTileId) !== "none";
    const lowerStateful = policy.isBlockedChipEnterRevealTile(lowerTileId)
      || policy.tileHasTag(lowerTileId, "toggleable")
      || policy.chipEnterAction(lowerTileId) !== "none"
      || indexes.resourceSourceIds.has(revealedLower.placementId);

    if (lowerGate !== undefined) {
      addCaveat(caveats, {
        caveatId: `resource-gate-${lowerGate.kind}`,
        kind: "resource-gate",
        placementId: lowerGate.placementId,
      });
    }
    if (lowerHazard !== undefined) {
      addCaveat(caveats, {
        caveatId: "underlying-hazard",
        kind: "hazard",
        placementId: lowerHazard.placementId,
      });
    }
    if (lowerReleaseRequired) {
      addCaveat(caveats, {
        caveatId: "exit-requires-release",
        kind: "requires-release",
        placementId: revealedLower.placementId,
      });
    }
    if (lowerForced) {
      addCaveat(caveats, {
        caveatId: "underlying-forced-movement",
        kind: "target-policy",
        placementId: revealedLower.placementId,
      });
    }
    if (lowerTransported) {
      addCaveat(caveats, {
        caveatId: "underlying-transport-policy",
        kind: "state-dependent",
        placementId: revealedLower.placementId,
      });
    }
    if (lowerTerminal) {
      addCaveat(caveats, {
        caveatId: "terminal-entry",
        kind: "target-policy",
        placementId: revealedLower.placementId,
      });
    }
    if (lowerActivation) {
      addCaveat(caveats, {
        caveatId: "underlying-activation-policy",
        kind: "state-dependent",
        placementId: revealedLower.placementId,
      });
    }
    if (lowerStateful) {
      addCaveat(caveats, {
        caveatId: "underlying-stateful-floor",
        kind: "state-dependent",
        placementId: revealedLower.placementId,
      });
    }
  }

  if (occupant.kind === "contained") {
    classification = classification === "unknown" ? "unknown" : "conditional";
  } else if (occupant.kind === "pushable" || occupant.kind === "autonomous") {
    classification = classification === "unknown" ? "unknown" : "dynamic";
  }

  if (hasUnknownPolicy) {
    classification = "unknown";
    entryDirections = [];
    exitDirections = [];
  }

  for (const record of records) {
    if (record.projected.sourcePlane === "implicit" && record !== effective) {
      addCaveat(caveats, {
        caveatId: "implicit-supporting-floor",
        kind: "target-policy",
        placementId: record.placementId,
      });
    }
  }

  return {
    coordinate: { ...coordinate },
    effective: effective === null
      ? null
      : { placementId: effective.placementId, sourcePlane: effective.projected.sourcePlane },
    supporting: supporting.map((record) => ({
      placementId: record.placementId,
      sourcePlane: record.projected.sourcePlane,
    })),
    entryDirections,
    exitDirections,
    classification,
    caveats: sortedCaveats(caveats),
    occupant,
  };
}

function resolveProjectedPlacements(input: BuildInitialChipTopologyEvidenceInput): ResolvedProjectedPlacement[] {
  const factPlacements = input.factsBundle.facts.payload.placements;
  const factsByKey = new Map(factPlacements.map((placement) => [
    placementKey({
      coordinate: placement.descriptor.coordinate,
      stratum: placement.descriptor.stratum,
      discriminator: placement.descriptor.discriminator,
      sourceToken: placement.sourceElement.elementToken,
    }),
    placement,
  ] as const));
  if (factsByKey.size !== factPlacements.length) {
    throw new Error("level facts contain duplicate projected placement identities");
  }
  const tokenMap = input.policy.tileIdBySourceToken;
  const resolved = input.projected.level.placements.map((projected) => {
    const fact = factsByKey.get(placementKey({
      coordinate: projected.coordinate,
      stratum: projected.stratum,
      discriminator: projected.discriminator,
      sourceToken: projected.sourceToken,
    }));
    if (fact === undefined) {
      throw new Error(`projected placement has no matching level fact: ${projected.sourceKey}`);
    }
    if (
      fact.sourceElement.catalogId !== projected.catalogId
      || fact.sourceElement.catalogRevision !== projected.catalogRevision
    ) {
      throw new Error(
        `projected placement uses a different catalog revision than its level fact: ${projected.sourceKey}`,
      );
    }
    return {
      placementId: fact.placementId,
      projected,
      tileId: projected.interpretation === "unknown"
        ? null
        : tokenMap.get(projected.sourceToken) ?? null,
    };
  });
  const resolvedPlacementIds = new Set(resolved.map((record) => record.placementId));
  if (resolvedPlacementIds.size !== resolved.length || resolved.length !== factPlacements.length) {
    throw new Error("projected placements and level facts do not have one-to-one coverage");
  }
  return resolved;
}

export async function buildInitialChipTopologyEvidence(
  input: BuildInitialChipTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<InitialChipTopologyEvidenceBundle> {
  const { facts } = input.factsBundle;
  if (input.policyRevision.length === 0 || input.policyRevision.includes("\r")) {
    throw new Error(`${input.policy.targetLabel} topology policy revision must be a non-empty durable string`);
  }
  if (
    facts.payload.target !== input.policy.target
    || input.projected.level.target !== input.policy.target
  ) {
    throw new Error(
      `Tile World ${input.policy.targetLabel} topology evidence requires ${input.policy.targetLabel} facts and projection`,
    );
  }
  if (canonicalizeJson(input.projected.normalizedMap) !== input.factsBundle.normalizedMap) {
    throw new Error("topology projection and level facts use different normalized gameplay maps");
  }

  const geometry = facts.payload.geometry;
  const projectedLayers = input.projected.level.geometry.layers;
  if (
    projectedLayers.length !== geometry.depth
    || projectedLayers.some((layer, index) => (
      layer.z !== index || layer.width !== geometry.width || layer.height !== geometry.height
    ))
  ) {
    throw new Error("topology projection and level facts use different geometry");
  }

  const resolved = resolveProjectedPlacements(input);
  const classificationIndexes = buildClassificationIndexes(facts);
  const byCoordinate = new Map<string, ResolvedProjectedPlacement[]>();
  for (const record of resolved) {
    const key = coordinateKey(record.projected.coordinate);
    const atCoordinate = byCoordinate.get(key) ?? [];
    atCoordinate.push(record);
    byCoordinate.set(key, atCoordinate);
  }
  for (const records of byCoordinate.values()) records.sort(compareResolvedPlacements);

  const cells: StaticTopologyCellEvidenceV1[] = [];
  for (let z = 0; z < geometry.depth; z += 1) {
    for (let y = 0; y < geometry.height; y += 1) {
      for (let x = 0; x < geometry.width; x += 1) {
        const coordinate = { x, y, z };
        const records = byCoordinate.get(coordinateKey(coordinate)) ?? [];
        if (records.length === 0) {
          throw new Error(`topology projection has no placements at ${z}:${y}:${x}`);
        }
        cells.push(classifyCell(records, classificationIndexes, input.policy));
      }
    }
  }
  cells.sort((left, right) => compareCoordinates(left.coordinate, right.coordinate));

  const levelFactsDigest = await identifyCanonicalJson(encodeArtifact(facts), sha256);
  const evidence = {
    evidenceVersion: 1,
    target: input.policy.target,
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: levelFactsDigest,
    },
    level: facts.payload.level,
    geometry: facts.payload.geometry,
    policy: {
      policyId: input.policy.policyId,
      policyRevision: input.policyRevision,
    },
    cells,
  } satisfies StaticTopologyEvidenceV1;
  const canonicalJson = canonicalizeJson(evidence as unknown as CanonicalJsonValue);
  return {
    evidence,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, sha256),
  };
}
