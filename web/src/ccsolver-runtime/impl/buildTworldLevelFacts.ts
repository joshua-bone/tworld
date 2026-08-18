import {
  decodeCanonicalArtifact,
  encodeArtifact,
  identifyActor,
  identifyStaticPlacement,
  identifyStaticWiring,
  referenceCanonicalJson,
  referenceSourceBytes,
  verifyLevelFactsIdentities,
  verifyLevelFactsSourceBytes,
  type LevelFactsSourceBytesV1,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type ActorIdV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type InitialActorFactV1,
  type LevelFactsV1,
  type PlacementIdV1,
  type ResourceGateFactV1,
  type StaticPlacementDescriptorV1,
  type StaticPlacementFactV1,
  type StaticWiringFactV1,
  type UnknownStaticFactV1,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type {
  ProjectedLegacyLevel,
  ProjectedLegacyPlacement,
  ProjectedLegacyUnknown,
  ProjectedLegacyWire,
} from "./decodedLegacyLevelProjection";

const NORMALIZATION_PROFILE = "tworld-legacy-dat-gameplay-v1";
const IMPORT_PROFILE = "tworld-legacy-dat-static-v1";
const ANALYZER_ID = "ccsolver-static-level-facts";
const ANALYSIS_PROFILE = "ccsolver-static-level-facts-v1";
const STRATUM_RANK = new Map([
  ["terrain", 0],
  ["overlay", 1],
  ["pickup", 2],
  ["actor", 3],
  ["side", 4],
]);

export interface ProjectedTworldLevelForFacts {
  readonly source: {
    readonly format: "tworld-dat";
    readonly containerBytes: Uint8Array;
    readonly members: readonly {
      readonly ordinal: number;
      readonly role: "level" | "layer";
      readonly z: number;
      readonly bytes: Uint8Array;
    }[];
  };
  readonly level: ProjectedLegacyLevel;
  readonly normalizedMap: CanonicalJsonValue;
}

export interface BuildTworldLevelFactsFromProjectionInput {
  readonly occurrenceId: string;
  readonly producerRevision: string;
  readonly repository: string;
  readonly repositoryRevision: string;
  readonly sourcePath: string;
  readonly adapterId: string;
  readonly adapterRevision: string;
  readonly importProfileRevision: string;
  readonly analyzerRevision: string;
  readonly projected: ProjectedTworldLevelForFacts;
}

export interface TworldLevelFactsBundle {
  readonly facts: LevelFactsV1;
  readonly normalizedMap: CanonicalJson;
  readonly sourceBytes: LevelFactsSourceBytesV1;
}

interface PlacementBuildRecord {
  readonly projected: ProjectedLegacyPlacement;
  readonly descriptor: StaticPlacementDescriptorV1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePlacementBuildRecords(left: PlacementBuildRecord, right: PlacementBuildRecord): number {
  const leftDescriptor = left.descriptor;
  const rightDescriptor = right.descriptor;
  if (leftDescriptor.coordinate.z !== rightDescriptor.coordinate.z) {
    return leftDescriptor.coordinate.z - rightDescriptor.coordinate.z;
  }
  if (leftDescriptor.coordinate.y !== rightDescriptor.coordinate.y) {
    return leftDescriptor.coordinate.y - rightDescriptor.coordinate.y;
  }
  if (leftDescriptor.coordinate.x !== rightDescriptor.coordinate.x) {
    return leftDescriptor.coordinate.x - rightDescriptor.coordinate.x;
  }
  const stratumDifference =
    (STRATUM_RANK.get(leftDescriptor.stratum) ?? 99)
    - (STRATUM_RANK.get(rightDescriptor.stratum) ?? 99);
  if (stratumDifference !== 0) {
    return stratumDifference;
  }
  const typeDifference = compareText(leftDescriptor.semanticType, rightDescriptor.semanticType);
  return typeDifference === 0
    ? leftDescriptor.discriminator - rightDescriptor.discriminator
    : typeDifference;
}

async function buildPlacements(
  projected: ProjectedLegacyLevel,
  levelDigest: LevelFactsV1["payload"]["level"]["normalizedGameplayDigest"],
  sha256: Sha256Port,
): Promise<{
  placements: StaticPlacementFactV1[];
  placementBySourceKey: Map<string, StaticPlacementFactV1>;
}> {
  const records = projected.placements.map((placement) => ({
    projected: placement,
    descriptor: {
      identityType: "static-placement" as const,
      identityVersion: 1 as const,
      levelDigest,
      coordinate: placement.coordinate,
      stratum: placement.stratum,
      semanticType: placement.semanticType,
      discriminator: placement.discriminator,
    },
  })).sort(comparePlacementBuildRecords);

  const placements = await Promise.all(records.map(async ({ projected: placement, descriptor }) => ({
    placementId: await identifyStaticPlacement(descriptor, sha256),
    descriptor,
    sourceElement: {
      catalogId: placement.catalogId,
      catalogRevision: placement.catalogRevision,
      elementToken: placement.sourceToken,
    },
    interpretation: placement.interpretation ?? "known",
    facing: placement.facing,
    initialState: placement.initialState ?? null,
  } satisfies StaticPlacementFactV1)));

  const placementBySourceKey = new Map<string, StaticPlacementFactV1>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const placement = placements[index];
    if (record !== undefined && placement !== undefined) {
      placementBySourceKey.set(record.projected.sourceKey, placement);
    }
  }
  return { placements, placementBySourceKey };
}

async function buildActors(
  projected: ProjectedLegacyLevel,
  placementBySourceKey: ReadonlyMap<string, StaticPlacementFactV1>,
  sha256: Sha256Port,
): Promise<InitialActorFactV1[]> {
  return Promise.all(projected.actors.map(async (actor) => {
    const placement = placementBySourceKey.get(actor.placementKey);
    if (placement === undefined) {
      throw new Error(`actor placement is absent: ${actor.placementKey}`);
    }
    const descriptor = {
      identityType: "actor" as const,
      identityVersion: 1 as const,
      kind: "initial" as const,
      placementId: placement.placementId,
      sourceActorOrder: actor.sourceActorOrder,
    };
    return {
      actorId: await identifyActor(descriptor, sha256) as ActorIdV1,
      descriptor,
      semanticType: actor.semanticType,
      disposition: actor.disposition,
      facing: actor.facing,
      declaredSourceOrder: actor.declaredSourceOrder,
    } satisfies InitialActorFactV1;
  }));
}

function neutralWiringKind(kind: string): string {
  switch (kind) {
    case "trap": return "cc1:trap-release";
    case "cloner": return "cc1:cloner-activate";
    default: return `cc1:${kind}`;
  }
}

async function buildWiring(
  wires: readonly ProjectedLegacyWire[],
  levelDigest: LevelFactsV1["payload"]["level"]["normalizedGameplayDigest"],
  placementBySourceKey: ReadonlyMap<string, StaticPlacementFactV1>,
  sha256: Sha256Port,
): Promise<StaticWiringFactV1[]> {
  const resolved = wires.flatMap((wire) => {
    const source = wire.source.placementKey === null
      ? undefined
      : placementBySourceKey.get(wire.source.placementKey);
    const target = wire.target.placementKey === null
      ? undefined
      : placementBySourceKey.get(wire.target.placementKey);
    if (source === undefined || target === undefined) {
      return [];
    }
    return [{
      identityType: "static-wiring" as const,
      identityVersion: 1 as const,
      levelDigest,
      kind: neutralWiringKind(wire.kind),
      sourceOrder: wire.sourceOrder,
      sourcePlacementId: source.placementId,
      targetPlacementId: target.placementId,
      discriminator: wire.discriminator,
    }];
  }).sort((left, right) => (
    compareText(left.kind, right.kind)
    || left.sourceOrder - right.sourceOrder
    || compareText(left.sourcePlacementId, right.sourcePlacementId)
    || compareText(left.targetPlacementId, right.targetPlacementId)
    || left.discriminator - right.discriminator
  ));
  return Promise.all(resolved.map(async (descriptor) => ({
    wiringId: await identifyStaticWiring(descriptor, sha256),
    descriptor,
  })));
}

function placementIdFor(
  placementBySourceKey: ReadonlyMap<string, StaticPlacementFactV1>,
  key: string,
): PlacementIdV1 {
  const placement = placementBySourceKey.get(key);
  if (placement === undefined) {
    throw new Error(`feature placement is absent: ${key}`);
  }
  return placement.placementId;
}

function buildUnknowns(
  unknowns: readonly ProjectedLegacyUnknown[],
  placementBySourceKey: ReadonlyMap<string, StaticPlacementFactV1>,
): UnknownStaticFactV1[] {
  return unknowns.map((unknown): UnknownStaticFactV1 => {
    switch (unknown.kind) {
      case "unknown-catalog-element": {
        const placement = placementBySourceKey.get(unknown.placementKey);
        if (placement === undefined) {
          throw new Error(`unknown placement is absent: ${unknown.placementKey}`);
        }
        return {
          unknownId: unknown.unknownKey,
          kind: unknown.kind,
          placementId: placement.placementId,
          catalogId: placement.sourceElement.catalogId,
          sourceToken: unknown.sourceToken,
          reason: unknown.reason,
        };
      }
      case "unresolved-wiring":
        return {
          unknownId: unknown.unknownKey,
          kind: unknown.kind,
          wiringKind: neutralWiringKind(unknown.wiringKind),
          source: unknown.source,
          target: unknown.target,
          reason: unknown.reason,
        };
      case "source-decode-warning":
        return {
          unknownId: unknown.unknownKey,
          kind: "unsupported-source-feature",
          sourceToken: "tworld:bad-tiles",
          coordinates: [...unknown.coordinates],
          reason: unknown.reason,
        };
      case "invalid-source-condition":
        return {
          unknownId: unknown.unknownKey,
          kind: unknown.kind,
          coordinates: [...unknown.coordinates],
          reason: unknown.reason,
        };
    }
  }).sort((left, right) => compareText(left.unknownId, right.unknownId));
}

function groupTransports(
  projected: ProjectedLegacyLevel,
  placementBySourceKey: ReadonlyMap<string, StaticPlacementFactV1>,
): LevelFactsV1["payload"]["transports"] {
  const groups = new Map<string, {
    kind: string;
    routingPolicy: string;
    z: number;
    members: PlacementIdV1[];
  }>();
  for (const placement of projected.placements) {
    if (placement.transport === undefined) continue;
    const key = `${placement.coordinate.z}\0${placement.transport.kind}\0${placement.transport.routingPolicy}`;
    const group = groups.get(key) ?? {
      kind: placement.transport.kind,
      routingPolicy: placement.transport.routingPolicy,
      z: placement.coordinate.z,
      members: [],
    };
    group.members.push(placementIdFor(placementBySourceKey, placement.sourceKey));
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    networkId: `${group.kind}-z${group.z}-network`,
    kind: group.kind,
    members: group.routingPolicy === "reverse-reading-order-cyclic"
      ? [...group.members].reverse()
      : group.members,
    routingPolicy: group.routingPolicy,
  })).sort((left, right) => compareText(left.networkId, right.networkId));
}

export async function buildTworldLevelFactsFromProjection(
  input: BuildTworldLevelFactsFromProjectionInput,
  sha256: Sha256Port,
): Promise<TworldLevelFactsBundle> {
  const { projected } = input;
  const normalizedMap = canonicalizeJson(projected.normalizedMap);
  const normalizedMapReference = await referenceCanonicalJson(normalizedMap, sha256);
  const sourceReference = await referenceSourceBytes(projected.source.containerBytes, sha256);
  const sourceMembers = await Promise.all(projected.source.members.map(async (member) => ({
    ordinal: member.ordinal,
    role: member.role,
    z: member.z,
    content: await referenceSourceBytes(member.bytes, sha256),
  })));
  const levelDigest = normalizedMapReference.digest;
  const { placements, placementBySourceKey } = await buildPlacements(
    projected.level,
    levelDigest,
    sha256,
  );
  const actors = await buildActors(projected.level, placementBySourceKey, sha256);
  const wiring = await buildWiring(projected.level.wiring, levelDigest, placementBySourceKey, sha256);
  const firstLayer = projected.level.geometry.layers[0];
  if (firstLayer === undefined) {
    throw new Error("projected legacy level has no geometry layer");
  }

  const resourceSources = projected.level.placements.flatMap((placement) => (
    placement.resourceSource === undefined
      ? []
      : [{
          placementId: placementIdFor(placementBySourceKey, placement.sourceKey),
          ...placement.resourceSource,
        }]
  )).sort((left, right) => (
    compareText(left.placementId, right.placementId)
    || compareText(left.resourceType, right.resourceType)
  ));
  const resourceGates: ResourceGateFactV1[] = [];
  for (const placement of projected.level.placements) {
    if (placement.resourceGate === undefined) continue;
    const placementId = placementIdFor(placementBySourceKey, placement.sourceKey);
    if (placement.resourceGate.kind === "remaining-zero") {
      resourceGates.push({
        kind: "remaining-zero",
        placementId,
        resourceType: placement.resourceGate.resourceType,
      });
    } else {
      resourceGates.push({
        kind: placement.resourceGate.kind,
        placementId,
        resourceType: placement.resourceGate.resourceType,
        amount: placement.resourceGate.amount ?? 1,
      });
    }
  }
  resourceGates.sort((left, right) => (
    compareText(left.placementId, right.placementId)
    || compareText(left.resourceType, right.resourceType)
    || compareText(left.kind, right.kind)
  ));
  const exits = projected.level.placements
    .filter((placement) => placement.exit)
    .map((placement) => placementIdFor(placementBySourceKey, placement.sourceKey))
    .sort(compareText);
  const forcedSurfaces = projected.level.placements.flatMap((placement) => (
    placement.forcedSurface === undefined
      ? []
      : [{
          placementId: placementIdFor(placementBySourceKey, placement.sourceKey),
          ...placement.forcedSurface,
        }]
  )).sort((left, right) => compareText(left.placementId, right.placementId));
  const hazards = projected.level.placements.flatMap((placement) => (
    placement.hazard === undefined
      ? []
      : [{
          placementId: placementIdFor(placementBySourceKey, placement.sourceKey),
          ...placement.hazard,
          protectionResources: [...placement.hazard.protectionResources].sort(compareText),
        }]
  )).sort((left, right) => (
    compareText(left.placementId, right.placementId)
    || compareText(left.hazardType, right.hazardType)
  ));

  const candidate: LevelFactsV1 = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    payload: {
      producerRevision: input.producerRevision,
      target: projected.level.target,
      level: {
        occurrenceId: input.occurrenceId,
        normalizationProfile: NORMALIZATION_PROFILE,
        normalizedGameplayDigest: levelDigest,
      },
      analyzer: {
        analyzerId: ANALYZER_ID,
        analyzerRevision: input.analyzerRevision,
        analysisProfile: ANALYSIS_PROFILE,
      },
      provenance: {
        source: {
          format: projected.source.format,
          origin: {
            kind: "repository",
            repository: input.repository,
            revision: input.repositoryRevision,
            path: input.sourcePath,
          },
          content: sourceReference,
        },
        occurrence: {
          occurrenceId: input.occurrenceId,
          members: sourceMembers,
        },
        importProfile: {
          profileId: IMPORT_PROFILE,
          profileRevision: input.importProfileRevision,
          adapterId: input.adapterId,
          adapterRevision: input.adapterRevision,
          normalizationProfile: NORMALIZATION_PROFILE,
        },
        normalizedMap: {
          format: "ccsolver-normalized-gameplay-map",
          formatVersion: 1,
          content: normalizedMapReference,
        },
      },
      geometry: {
        width: firstLayer.width,
        height: firstLayer.height,
        depth: projected.level.geometry.layers.length,
      },
      placements,
      actors,
      timeLimit: projected.level.timeLimit,
      requiredCollectibles: projected.level.chipsRequired === 0
        ? []
        : [{ resourceType: "cc1:icchip", amount: projected.level.chipsRequired }],
      resourceSources,
      resourceGates,
      exits,
      wiring,
      transports: groupTransports(projected.level, placementBySourceKey),
      forcedSurfaces,
      hazards,
      unknowns: buildUnknowns(projected.level.unknowns, placementBySourceKey),
    },
  };

  const decoded = decodeCanonicalArtifact(encodeArtifact(candidate));
  if (decoded.artifactType !== "level-facts") {
    throw new Error("level-facts construction returned a different artifact type");
  }
  await verifyLevelFactsIdentities(decoded, sha256);
  const sourceBytes = {
    container: projected.source.containerBytes,
    members: projected.source.members.map((member) => member.bytes),
    normalizedMap,
  } satisfies LevelFactsSourceBytesV1;
  await verifyLevelFactsSourceBytes(decoded, sourceBytes, sha256);
  return { facts: decoded, normalizedMap, sourceBytes };
}
