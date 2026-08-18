import {
  encodeArtifact,
  referenceCanonicalJson,
  verifyLevelFactsSourceBytes,
} from "@tworld/ccsolver/application";
import type {
  ActorIdV1,
  DirectionV1,
  InitialActorFactV1,
  PlacementIdV1,
  PlacementStratumV1,
  SolverActorIdentityProvenance,
  SolverCoordinate,
  SolverElementIdentity,
  SolverObservedElement,
  SolverRuntimeProvenance,
  StaticPlacementFactV1,
} from "@tworld/ccsolver/domain";
import {
  SolverRuntimeError,
  type Sha256Port,
  type SolverRuntimeOperation,
} from "@tworld/ccsolver/ports";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  TworldSolverSourceValidityError,
  assertTworldSolverSourceEligibility,
} from "../sourceValidity/assertTworldSolverSourceEligibility";
import { TworldSolverSourceScopeError } from "../sourceValidity/analyzeTworldSolverSourceScope";
import type { TworldSolverManualStartSource } from "./tworldSolverRuntimeSource";

export interface RuntimeActorSeed {
  readonly runtimeKey: string;
  readonly semanticType: string;
  readonly coordinate: SolverCoordinate | null;
  /** Original placement coordinate when a dormant map actor materializes after moving. */
  readonly initialCoordinateHint?: SolverCoordinate | null;
  readonly facing: DirectionV1 | null;
}

export interface RuntimeActorBinding {
  readonly actorId: ActorIdV1;
  readonly identityProvenance: SolverActorIdentityProvenance;
  readonly sourcePlacementId: PlacementIdV1 | null;
}

export interface RuntimeActorBindings {
  readonly player: RuntimeActorBinding;
  readonly actors: ReadonlyMap<string, RuntimeActorBinding>;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export async function assertTworldRuntimeSource(
  source: TworldSolverManualStartSource,
  target: "ms" | "lynx",
  sha256: Sha256Port,
  operation: Extract<SolverRuntimeOperation, "startManual" | "startReplay">,
  expectedProvenance: SolverRuntimeProvenance,
): Promise<void> {
  const expectedRuleset = target === "ms" ? "MS" : "Lynx";
  if (source.loaded.request.ruleset !== expectedRuleset) {
    throw new SolverRuntimeError(
      "runtime.target-mismatch",
      operation,
      `expected ${expectedRuleset} level input`,
      { actual: source.loaded.request.ruleset, expected: expectedRuleset },
    );
  }
  if (source.levelFacts.facts.payload.target !== target) {
    throw new SolverRuntimeError(
      "runtime.target-mismatch",
      operation,
      `expected ${target} level facts`,
      { actual: source.levelFacts.facts.payload.target, expected: target },
    );
  }
  try {
    assertTworldSolverSourceEligibility({ layerData: source.loaded.layerData });
  } catch (error) {
    if (error instanceof TworldSolverSourceScopeError) {
      const first = error.report.issues[0];
      throw new SolverRuntimeError(
        "runtime.unsupported",
        operation,
        `runtime source uses a CCSolver-excluded expanded tile under ${error.report.policyRevision}`,
        {
          policyRevision: error.report.policyRevision,
          reason: first?.reason ?? null,
          displayName: first?.displayName ?? null,
          z: first?.z ?? null,
          x: first?.x ?? null,
          y: first?.y ?? null,
          sourceFileCode: first?.sourceFileCode ?? null,
        },
      );
    }
    if (error instanceof TworldSolverSourceValidityError) {
      const first = error.report.issues[0];
      throw new SolverRuntimeError(
        "runtime.unsupported",
        operation,
        `runtime source is invalid under ${error.report.policyRevision}`,
        {
          policyRevision: error.report.policyRevision,
          reason: first?.reason ?? null,
          z: first?.z ?? null,
          x: first?.x ?? null,
          y: first?.y ?? null,
          sourceFileCode: first?.sourceFileCode ?? null,
        },
      );
    }
    throw error;
  }
  if (
    source.provenance.adapterId !== expectedProvenance.adapterId
    || source.provenance.adapterRevision !== expectedProvenance.adapterRevision
    || source.provenance.engineId !== expectedProvenance.engineId
    || source.provenance.engineRevision !== expectedProvenance.engineRevision
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-request",
      operation,
      "runtime provenance is not owned by this adapter instance",
      { actual: source.provenance, expected: expectedProvenance },
    );
  }
  const actualFactsContent = await referenceCanonicalJson(
    encodeArtifact(source.levelFacts.facts),
    sha256,
  );
  if (
    actualFactsContent.digest !== source.levelFactsContent.digest
    || actualFactsContent.byteLength !== source.levelFactsContent.byteLength
  ) {
    throw new SolverRuntimeError(
      "runtime.invalid-request",
      operation,
      "level-facts content reference does not identify the supplied facts",
    );
  }
  await verifyLevelFactsSourceBytes(
    source.levelFacts.facts,
    source.levelFacts.sourceBytes,
    sha256,
  );
  if (source.loaded.layerData.length !== source.levelFacts.sourceBytes.members.length) {
    throw new SolverRuntimeError(
      "runtime.invalid-request",
      operation,
      "loaded runtime layer count does not match the level-facts source occurrence",
    );
  }
  const primaryLayer = source.loaded.layerData[0];
  if (!primaryLayer || !bytesEqual(source.loaded.levelData, primaryLayer)) {
    throw new SolverRuntimeError(
      "runtime.invalid-request",
      operation,
      "loaded primary level bytes do not match the evidenced primary source member",
    );
  }
  for (let index = 0; index < source.loaded.layerData.length; index += 1) {
    const loaded = source.loaded.layerData[index];
    const evidenced = source.levelFacts.sourceBytes.members[index];
    if (!loaded || !evidenced || !bytesEqual(loaded, evidenced)) {
      throw new SolverRuntimeError(
        "runtime.invalid-request",
        operation,
        "loaded runtime bytes do not match the level-facts source occurrence",
        { memberIndex: index },
      );
    }
  }
}

export function solverDirection(direction: number): DirectionV1 | null {
  switch (direction) {
    case MS_DIRECTION.north: return "north";
    case MS_DIRECTION.east: return "east";
    case MS_DIRECTION.south: return "south";
    case MS_DIRECTION.west: return "west";
    default: return null;
  }
}

export function solverCoordinate(
  pos: number,
  engineZ: number | undefined,
  width: number,
): SolverCoordinate {
  return {
    x: pos % width,
    y: Math.floor(pos / width),
    z: Math.max(0, (engineZ ?? 1) - 1),
  };
}

export function neutralCatalogCode(code: string): string {
  const separator = code.indexOf(":");
  const localName = separator >= 0 ? code.slice(separator + 1) : code;
  return `cc1:${localName.replaceAll("_", "-")}`;
}

function hexDigest(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function runtimeActorId(
  source: TworldSolverManualStartSource,
  target: "ms" | "lynx",
  seed: RuntimeActorSeed,
  sha256: Sha256Port,
  operation: SolverRuntimeOperation,
): Promise<ActorIdV1> {
  const descriptor = [
    source.levelFacts.facts.payload.level.normalizedGameplayDigest,
    target,
    seed.runtimeKey,
    seed.semanticType,
  ].join("\u0000");
  const digest = await sha256.digestBytes(new TextEncoder().encode(descriptor));
  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new SolverRuntimeError(
      "runtime.adapter-failure",
      operation,
      "SHA-256 adapter did not return a 32-byte actor identity digest",
    );
  }
  return `actor:sha256:${hexDigest(digest)}`;
}

function actorCoordinate(
  fact: InitialActorFactV1,
  placementsById: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
): SolverCoordinate | null {
  return placementsById.get(fact.descriptor.placementId)?.descriptor.coordinate ?? null;
}

function matchingInitialActor(
  seed: RuntimeActorSeed,
  candidates: readonly InitialActorFactV1[],
  placementsById: ReadonlyMap<PlacementIdV1, StaticPlacementFactV1>,
  used: ReadonlySet<ActorIdV1>,
): InitialActorFactV1 | null {
  return candidates.find((fact) => {
    if (used.has(fact.actorId) || fact.semanticType !== seed.semanticType) return false;
    const coordinate = actorCoordinate(fact, placementsById);
    const seedCoordinate = seed.initialCoordinateHint ?? seed.coordinate;
    if (coordinate === null || seedCoordinate === null) return false;
    return coordinate.x === seedCoordinate.x
      && coordinate.y === seedCoordinate.y
      && coordinate.z === seedCoordinate.z;
  }) ?? null;
}

export async function buildRuntimeActorBindings(
  source: TworldSolverManualStartSource,
  target: "ms" | "lynx",
  player: RuntimeActorSeed,
  actors: readonly RuntimeActorSeed[],
  sha256: Sha256Port,
  operation: SolverRuntimeOperation = "startManual",
  existing?: RuntimeActorBindings,
): Promise<RuntimeActorBindings> {
  const facts = source.levelFacts.facts.payload;
  const placementsById = new Map(facts.placements.map((placement) => [placement.placementId, placement]));
  const used = new Set<ActorIdV1>([
    ...(existing ? [existing.player.actorId] : []),
    ...[...(existing?.actors.values() ?? [])].map((binding) => binding.actorId),
  ]);
  if (existing) {
    // A newly materialized clone can occupy the same source cell and species
    // as its contained template. Dormant actors must remain available for
    // their own first materialization; reserve only contained templates.
    for (const fact of facts.actors) {
      if (fact.disposition === "contained") used.add(fact.actorId);
    }
  }
  const bind = async (seed: RuntimeActorSeed): Promise<RuntimeActorBinding> => {
    const initial = matchingInitialActor(seed, facts.actors, placementsById, used);
    if (initial) {
      used.add(initial.actorId);
      return {
        actorId: initial.actorId,
        identityProvenance: "initial-placement",
        sourcePlacementId: initial.descriptor.placementId,
      };
    }
    return {
      actorId: await runtimeActorId(source, target, seed, sha256, operation),
      identityProvenance: "runtime-projected",
      sourcePlacementId: null,
    };
  };
  const playerBinding = existing?.player ?? await bind(player);
  const actorEntries = await Promise.all(actors.map(async (seed) => [
    seed.runtimeKey,
    existing?.actors.get(seed.runtimeKey) ?? await bind(seed),
  ] as const));
  return {
    player: playerBinding,
    actors: new Map(actorEntries),
  };
}

export function placementForRuntimeElement(
  source: TworldSolverManualStartSource,
  coordinate: SolverCoordinate,
  semanticType: string,
  stratum: PlacementStratumV1,
  used: Set<PlacementIdV1>,
): StaticPlacementFactV1 | null {
  const candidates = source.levelFacts.facts.payload.placements.filter((candidate) => (
    !used.has(candidate.placementId)
    && candidate.descriptor.stratum === stratum
    && candidate.descriptor.coordinate.x === coordinate.x
    && candidate.descriptor.coordinate.y === coordinate.y
    && candidate.descriptor.coordinate.z === coordinate.z
  ));
  const lineage = runtimeMutableDeviceLineage(semanticType);
  const placement = candidates.find((candidate) => (
    candidate.descriptor.semanticType === semanticType
  )) ?? (lineage === null ? null : candidates.find((candidate) => (
    runtimeMutableDeviceLineage(candidate.descriptor.semanticType) === lineage
  ))) ?? null;
  if (placement) used.add(placement.placementId);
  return placement;
}

export function runtimeMutableDeviceLineage(semanticType: string): string | null {
  const match = /^(cc1:(?:switchwall|togglewall|(?:switch|toggle)-wall))-(?:open|closed)$/u.exec(semanticType);
  return match?.[1] ?? null;
}

export function runtimeElementMatchesPlacementType(
  runtimeSemanticType: string,
  placementSemanticType: string,
): boolean {
  if (runtimeSemanticType === placementSemanticType) return true;
  const lineage = runtimeMutableDeviceLineage(runtimeSemanticType);
  return lineage !== null && runtimeMutableDeviceLineage(placementSemanticType) === lineage;
}

export function runtimeElementIdentity(
  placement: StaticPlacementFactV1 | null,
  semanticId: string,
): SolverElementIdentity {
  return placement
    ? { kind: "placement", placementId: placement.placementId }
    : { kind: "semantic", semanticId };
}

export function observedRuntimeElement(input: {
  readonly identity: SolverElementIdentity;
  readonly stratum: PlacementStratumV1;
  readonly semanticType: string;
  readonly facing?: DirectionV1 | null;
  readonly state?: string | null;
}): SolverObservedElement {
  return {
    identity: input.identity,
    stratum: input.stratum,
    semanticType: input.semanticType,
    facing: input.facing ?? null,
    state: input.state ?? null,
  };
}
