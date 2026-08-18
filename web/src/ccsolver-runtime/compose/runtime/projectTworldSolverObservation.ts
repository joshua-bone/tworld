import {
  identifyCanonicalJson,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type SolverActorObservation,
  type SolverDeviceObservation,
  type SolverInventoryEntry,
  type SolverObservation,
  type SolverObservedCell,
  type SolverPlayerObservation,
  type SolverRuntimeMode,
  type SolverStateFingerprint,
  type SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { TworldSolverManualStartSource } from "./tworldSolverRuntimeSource";

export interface ProjectTworldSolverObservationInput {
  readonly target: "ms" | "lynx";
  readonly mode: SolverRuntimeMode;
  readonly source: TworldSolverManualStartSource;
  readonly nativeTick: number;
  readonly timing: SolverObservation["timing"];
  readonly lastPolledInputCode: number | null;
  readonly lastAppliedInputCode: number | null;
  readonly replayCursor: number | null;
  readonly replayMoveCount: number | null;
  readonly replayBestTimeTicks: number | null;
  readonly stepping: number;
  readonly initialRandomSlideDirection: SolverObservation["randomness"]["initialRandomSlideDirection"];
  readonly nativeStateFingerprints: readonly SolverStateFingerprint[];
  readonly cells: readonly SolverObservedCell[];
  readonly player: SolverPlayerObservation;
  readonly actors: readonly SolverActorObservation[];
  readonly inventory: readonly SolverInventoryEntry[];
  readonly remainingRequirements: SolverObservation["remainingRequirements"];
  readonly devices: readonly SolverDeviceObservation[];
  readonly exactFingerprint: string;
  readonly terminal: SolverTerminalResult;
}

function withoutSemanticFingerprint(
  observation: Omit<SolverObservation, "fingerprints"> | SolverObservation,
  exactFingerprint: string,
) {
  return {
    ...observation,
    fingerprints: {
      exact: exactFingerprint,
      continuation: null,
      semantic: "semantic-fingerprint:excluded",
    },
  } as SolverObservation;
}

export async function identifyTworldSolverObservationSemantic(
  observation: SolverObservation,
  sha256: Sha256Port,
): Promise<string> {
  const semanticSource = withoutSemanticFingerprint(
    observation,
    "exact-fingerprint:excluded",
  );
  return identifyCanonicalJson(canonicalizeJson(semanticSource), sha256);
}

export async function projectTworldSolverObservation(
  input: ProjectTworldSolverObservationInput,
  sha256: Sha256Port,
): Promise<SolverObservation> {
  const facts = input.source.levelFacts.facts;
  const observation = {
    observationVersion: 1,
    target: input.target,
    mode: input.mode,
    level: facts.payload.level,
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: input.source.levelFactsContent.digest,
    },
    provenance: input.source.provenance,
    boundary: { nativeTick: input.nativeTick },
    geometry: facts.payload.geometry,
    timing: input.timing,
    input: {
      lastPolledInputCode: input.lastPolledInputCode,
      lastAppliedInputCode: input.lastAppliedInputCode,
      replayCursor: input.replayCursor,
      replayMoveCount: input.replayMoveCount,
      replayBestTimeTicks: input.replayBestTimeTicks,
    },
    randomness: {
      stepping: input.stepping,
      initialRandomSlideDirection: input.initialRandomSlideDirection,
      nativeStateFingerprintsOrder: "state-id",
      nativeStateFingerprints: [...input.nativeStateFingerprints]
        .sort((left, right) => left.stateId < right.stateId ? -1 : left.stateId > right.stateId ? 1 : 0),
    },
    cellsOrder: "z-y-x",
    cells: input.cells,
    player: input.player,
    actorsOrder: "observation-order",
    actors: input.actors,
    inventoryOrder: "runtime-slot-order",
    inventory: input.inventory,
    remainingRequirementsOrder: "resource-type",
    remainingRequirements: [...input.remainingRequirements]
      .sort((left, right) => left.resourceType < right.resourceType ? -1 : left.resourceType > right.resourceType ? 1 : 0),
    devicesOrder: "placement-id",
    devices: [...input.devices]
      .sort((left, right) => left.placementId < right.placementId ? -1 : left.placementId > right.placementId ? 1 : 0),
    terminal: input.terminal,
  } as const satisfies Omit<SolverObservation, "fingerprints">;
  const provisional = withoutSemanticFingerprint(observation, input.exactFingerprint);
  const semantic = await identifyTworldSolverObservationSemantic(provisional, sha256);
  return {
    ...observation,
    fingerprints: {
      exact: input.exactFingerprint,
      continuation: null,
      semantic,
    },
  };
}
