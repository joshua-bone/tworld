import {
  encodeArtifact,
  identifyCanonicalJson,
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import type {
  StaticTopologyCaveatKindV1,
  StaticTopologyCaveatV1,
  StaticTopologyCellEvidenceV1,
  StaticTopologyEvidenceV1,
  StaticTopologyOccupancyV1,
  StaticTopologySupportingPlacementV1,
  StaticTraversalClassV1,
} from "@tworld/ccsolver/analyze";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type CoordinateV1,
  type DirectionV1,
  type PlacementIdV1,
} from "@tworld/ccsolver/domain";
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
import type {
  ProjectedLegacyPlacement,
  ProjectedLegacySourcePlane,
} from "../impl/decodedLegacyLevelProjection";
import type { TworldMsLevelFactsBundle } from "./buildTworldMsLevelFacts";
import type { ProjectedTworldMsLevel } from "./tworldMsLevelProjection";

const POLICY_ID = "tworld-ms-initial-chip-topology-v1";
const DIRECTION_ORDER: readonly DirectionV1[] = ["north", "east", "south", "west"];

export type TworldMsInitialTraversalClassification = StaticTraversalClassV1;
export type TworldMsTopologyCaveatKind = StaticTopologyCaveatKindV1;
export type TworldMsTopologyPlacementExposure = StaticTopologySupportingPlacementV1;
export type TworldMsTopologyCaveat = StaticTopologyCaveatV1;
export type TworldMsTopologyOccupant = StaticTopologyOccupancyV1;
export type TworldMsTopologyCellEvidence = StaticTopologyCellEvidenceV1;
export type TworldMsStaticTopologyEvidence = StaticTopologyEvidenceV1;

export interface TworldMsStaticTopologyEvidenceBundle {
  readonly evidence: TworldMsStaticTopologyEvidence;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

export interface BuildTworldMsTopologyEvidenceInput {
  readonly factsBundle: TworldMsLevelFactsBundle;
  readonly projected: ProjectedTworldMsLevel;
  readonly policyRevision: string;
}

interface ResolvedProjectedPlacement {
  readonly placementId: PlacementIdV1;
  readonly projected: ProjectedLegacyPlacement;
  readonly tileId: number | null;
}

type TworldMsLevelFacts = TworldMsLevelFactsBundle["facts"];
type TworldMsActorFact = TworldMsLevelFacts["payload"]["actors"][number];

interface ClassificationIndexes {
  readonly actorByPlacementId: ReadonlyMap<PlacementIdV1, TworldMsActorFact>;
  readonly actorPlacementIds: ReadonlySet<PlacementIdV1>;
  readonly exitIds: ReadonlySet<PlacementIdV1>;
  readonly forcedIds: ReadonlySet<PlacementIdV1>;
  readonly gateByPlacementId: ReadonlyMap<
    PlacementIdV1,
    TworldMsLevelFacts["payload"]["resourceGates"][number]
  >;
  readonly hazardByPlacementId: ReadonlyMap<
    PlacementIdV1,
    TworldMsLevelFacts["payload"]["hazards"][number]
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

function directionMask(direction: DirectionV1): number {
  switch (direction) {
    case "north": return MS_DIRECTION.north;
    case "east": return MS_DIRECTION.east;
    case "south": return MS_DIRECTION.south;
    case "west": return MS_DIRECTION.west;
  }
}

function directionsForMask(mask: number): DirectionV1[] {
  return DIRECTION_ORDER.filter((direction) => (mask & directionMask(direction)) !== 0);
}

function addCaveat(
  caveats: Map<string, TworldMsTopologyCaveat>,
  caveat: TworldMsTopologyCaveat,
): void {
  caveats.set(`${caveat.caveatId}\0${caveat.kind}\0${caveat.placementId ?? ""}`, caveat);
}

function sortedCaveats(caveats: ReadonlyMap<string, TworldMsTopologyCaveat>): TworldMsTopologyCaveat[] {
  return [...caveats.values()].sort((left, right) => (
    compareText(left.caveatId, right.caveatId)
    || compareText(left.kind, right.kind)
    || compareText(left.placementId ?? "", right.placementId ?? "")
  ));
}

function normalizedActorTileId(tileId: number | null): number | null {
  if (tileId === null) return null;
  if (isMsStaticBlockTile(tileId)) return msStaticBlockActorId(tileId);
  return isMsCreature(tileId) ? msCreatureId(tileId) : tileId;
}

function buildClassificationIndexes(facts: TworldMsLevelFacts): ClassificationIndexes {
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
  actorByPlacementId: ReadonlyMap<PlacementIdV1, TworldMsActorFact>,
  caveats: Map<string, TworldMsTopologyCaveat>,
): TworldMsTopologyOccupant {
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

  let kind: TworldMsTopologyOccupant["kind"];
  const actorTileId = normalizedActorTileId(selected.record.tileId);
  if (selected.actor.disposition === "contained" || selected.actor.disposition === "dormant") {
    kind = "contained";
  } else if (actorTileId !== null && msActorControlMode(actorTileId) === "player-input") {
    kind = "player-start";
  } else if (actorTileId !== null && isMsBlockActorId(actorTileId)) {
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
): TworldMsTopologyCellEvidence {
  const first = records[0];
  if (first === undefined) throw new Error("topology evidence cell has no projected placements");
  const coordinate = first.projected.coordinate;
  const caveats = new Map<string, TworldMsTopologyCaveat>();

  let effective: ResolvedProjectedPlacement | null = null;
  for (const record of records) {
    if (record.projected.interpretation === "unknown" || record.tileId === null) {
      effective = record;
      break;
    }
    if (indexes.actorPlacementIds.has(record.placementId)) {
      continue;
    }
    if (!msIsOverlayFloorTile(record.tileId)) {
      effective = record;
      break;
    }
  }
  const supporting = records.filter((record) => record !== effective);
  const revealedLower = effective?.projected.sourcePlane === "upper"
    && effective.tileId === MS_TILE.Empty
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

  const occupant = resolveOccupant(records, indexes.actorByPlacementId, caveats);
  let classification: TworldMsInitialTraversalClassification = "unknown";
  let entryDirections: DirectionV1[] = [];
  let exitDirections: DirectionV1[] = [];
  const effectiveTileId = effective?.tileId ?? null;

  if (!hasUnknownPolicy && effective !== null && effectiveTileId !== null) {
    entryDirections = directionsForMask(msChipMovementMask(effectiveTileId));
    exitDirections = directionsForMask(msExitMovementMask(effectiveTileId));
    classification = entryDirections.length === 0 ? "blocked" : "open";

    const gate = indexes.gateByPlacementId.get(effective.placementId);
    const hazard = indexes.hazardByPlacementId.get(effective.placementId);
    const revealOnProbe = isMsBlockedChipEnterRevealTile(effectiveTileId);
    const stateToggle = msTileHasTag(effectiveTileId, "toggleable");
    const releaseRequired = msRequiresReleaseToExit(effectiveTileId);
    const forced = indexes.forcedIds.has(effective.placementId) || msTileForcedFloorKind(effectiveTileId) !== "none";
    const transported = indexes.transportIds.has(effective.placementId);
    const terminal = indexes.exitIds.has(effective.placementId) || msTileHasTag(effectiveTileId, "exit");
    const activation = msButtonAction(effectiveTileId) !== "none";
    const enterAction = msChipEnterAction(effectiveTileId);
    const localMutation = (enterAction === "clear-floor"
      && effectiveTileId !== MS_TILE.Empty
      && effectiveTileId !== MS_TILE.Nothing)
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
    exitDirections = directionsForMask(msExitMovementMask(lowerTileId));
    addCaveat(caveats, {
      caveatId: "empty-top-preserves-underlying-floor",
      kind: "state-dependent",
      placementId: revealedLower.placementId,
    });

    const lowerGate = indexes.gateByPlacementId.get(revealedLower.placementId);
    const lowerHazard = indexes.hazardByPlacementId.get(revealedLower.placementId);
    const lowerReleaseRequired = msRequiresReleaseToExit(lowerTileId);
    const lowerForced = indexes.forcedIds.has(revealedLower.placementId)
      || msTileForcedFloorKind(lowerTileId) !== "none";
    const lowerTransported = indexes.transportIds.has(revealedLower.placementId);
    const lowerTerminal = indexes.exitIds.has(revealedLower.placementId)
      || msTileHasTag(lowerTileId, "exit");
    const lowerActivation = msButtonAction(lowerTileId) !== "none";
    const lowerStateful = isMsBlockedChipEnterRevealTile(lowerTileId)
      || msTileHasTag(lowerTileId, "toggleable")
      || msChipEnterAction(lowerTileId) !== "none"
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

function resolveProjectedPlacements(input: BuildTworldMsTopologyEvidenceInput): ResolvedProjectedPlacement[] {
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
  const tokenMap = tileIdBySourceToken();
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

export async function buildTworldMsTopologyEvidence(
  input: BuildTworldMsTopologyEvidenceInput,
  sha256: Sha256Port,
): Promise<TworldMsStaticTopologyEvidenceBundle> {
  const { facts } = input.factsBundle;
  if (input.policyRevision.length === 0 || input.policyRevision.includes("\r")) {
    throw new Error("MS topology policy revision must be a non-empty durable string");
  }
  if (facts.payload.target !== "ms" || input.projected.level.target !== "ms") {
    throw new Error("Tile World MS topology evidence requires MS facts and projection");
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

  const cells: TworldMsTopologyCellEvidence[] = [];
  for (let z = 0; z < geometry.depth; z += 1) {
    for (let y = 0; y < geometry.height; y += 1) {
      for (let x = 0; x < geometry.width; x += 1) {
        const coordinate = { x, y, z };
        const records = byCoordinate.get(coordinateKey(coordinate)) ?? [];
        if (records.length === 0) {
          throw new Error(`topology projection has no placements at ${z}:${y}:${x}`);
        }
        cells.push(classifyCell(records, classificationIndexes));
      }
    }
  }
  cells.sort((left, right) => compareCoordinates(left.coordinate, right.coordinate));

  const levelFactsDigest = await identifyCanonicalJson(encodeArtifact(facts), sha256);
  const evidence = {
    evidenceVersion: 1,
    target: "ms",
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: levelFactsDigest,
    },
    level: facts.payload.level,
    geometry: facts.payload.geometry,
    policy: {
      policyId: POLICY_ID,
      policyRevision: input.policyRevision,
    },
    cells,
  } satisfies TworldMsStaticTopologyEvidence;
  const canonicalJson = canonicalizeJson(evidence as unknown as CanonicalJsonValue);
  return {
    evidence,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, sha256),
  };
}
