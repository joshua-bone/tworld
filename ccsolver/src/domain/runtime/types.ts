import type {
  ActorIdV1,
  DirectionV1,
  PlacementIdV1,
  PlacementStratumV1,
  RevisionIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "../artifacts/types.js";

/**
 * P2A runtime values are canonical-JSON-safe preview DTOs, not root artifact
 * envelopes. Exact engine sessions and checkpoints remain opaque port values.
 */

export type SolverRuntimeMode = "manual" | "replay";

/** A canonical-safe copy of the level identity used by runtime previews. */
export type SolverRuntimeLevelIdentity = {
  readonly occurrenceId: StableIdV1;
  readonly normalizationProfile: StableIdV1;
  readonly normalizedGameplayDigest: `sha256:${string}`;
};

/** Exact target LevelFactsV1 binding without importing artifact-envelope authority. */
export type SolverLevelFactsReference = {
  readonly protocolVersion: 1;
  readonly artifactType: "level-facts";
  readonly schemaVersion: 1;
  readonly digest: `sha256:${string}`;
};

export type SolverCoordinate = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type SolverLevelGeometry = {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
};

export type SolverRuntimeProvenance = {
  readonly adapterId: StableIdV1;
  readonly adapterRevision: RevisionIdV1;
  readonly engineId: StableIdV1;
  readonly engineRevision: RevisionIdV1;
};

export type SolverRuntimeBoundary = {
  /** The target engine's exact native tick boundary; no shared tick rate is implied. */
  readonly nativeTick: number;
};

export type SolverTerminalResult =
  | {
      readonly kind: "running";
    }
  | {
      readonly kind: "won";
      readonly nativeTick: number;
      readonly coordinate: SolverCoordinate | null;
      readonly exitPlacementId: PlacementIdV1 | null;
    }
  | {
      readonly kind: "lost";
      readonly nativeTick: number;
      readonly coordinate: SolverCoordinate | null;
      readonly cause: StableIdV1;
    }
  | {
      readonly kind: "timed-out";
      readonly nativeTick: number;
      readonly coordinate: SolverCoordinate | null;
    };

export type SolverElementIdentity =
  | {
      readonly kind: "placement";
      readonly placementId: PlacementIdV1;
    }
  | {
      readonly kind: "actor";
      readonly actorId: ActorIdV1;
    }
  | {
      /** Stable semantic identity for state synthesized by the runtime projection. */
      readonly kind: "semantic";
      readonly semanticId: StableIdV1;
    };

export type SolverObservedElement = {
  readonly identity: SolverElementIdentity;
  readonly stratum: PlacementStratumV1;
  /** Target-neutral semantic catalog identity; never a raw tile number. */
  readonly semanticType: StableIdV1;
  readonly facing: DirectionV1 | null;
  /** Closed semantic state token; never a raw engine struct. */
  readonly state: StableIdV1 | null;
};

export type SolverObservedCell = {
  readonly cellOrdinal: number;
  readonly coordinate: SolverCoordinate;
  readonly elementsOrder: "stratum-then-identity";
  readonly elements: readonly SolverObservedElement[];
};

export type SolverActorLifecycle = "active" | "contained" | "dormant" | "destroyed";

export type SolverActorMovement =
  | "stationary"
  | "moving"
  | "forced"
  | "sliding"
  | "teleporting"
  | "trapped";

export type SolverActorIdentityProvenance =
  | "initial-placement"
  | "clone-lineage"
  | "runtime-projected";

export type SolverActorNativePosition = {
  /** Exact target collection; no cross-collection execution precedence is implied. */
  readonly collectionId: "ms:creatures" | "ms:blocks" | "lynx:actors";
  readonly index: number;
};

export type SolverActorObservation = {
  /** Contiguous canonical position in the observation actor array. */
  readonly observationOrder: number;
  /** Exact target collection/index, or null for a static-facts-only actor. */
  readonly nativePosition: SolverActorNativePosition | null;
  /** Stable semantic actor identity; never a raw actor-array index or numeric id. */
  readonly actorId: ActorIdV1;
  readonly identityProvenance: SolverActorIdentityProvenance;
  readonly sourcePlacementId: PlacementIdV1 | null;
  readonly semanticType: StableIdV1;
  readonly coordinate: SolverCoordinate | null;
  readonly facing: DirectionV1 | null;
  readonly lifecycle: SolverActorLifecycle;
  readonly movement: SolverActorMovement;
};

export type SolverPlayerControl = "available" | "unavailable" | "terminal";

export type SolverInputInfluence =
  | "eligible"
  | "in-transit"
  | "blocked"
  | "replay-owned"
  | "terminal";

export type SolverPlayerObservation = {
  readonly actorId: ActorIdV1;
  readonly identityProvenance: SolverActorIdentityProvenance;
  readonly sourcePlacementId: PlacementIdV1 | null;
  readonly semanticType: StableIdV1;
  readonly coordinate: SolverCoordinate | null;
  readonly facing: DirectionV1 | null;
  readonly lifecycle: SolverActorLifecycle;
  readonly movement: SolverActorMovement;
  readonly control: SolverPlayerControl;
  readonly inputInfluence: SolverInputInfluence;
};

export type SolverInventoryEntry = {
  readonly slotOrder: number;
  readonly resourceType: StableIdV1;
  readonly count: number;
};

export type SolverRemainingRequirement = {
  readonly resourceType: StableIdV1;
  readonly count: number;
};

export type SolverSemanticScalar = null | boolean | number | string;

export type SolverDeviceAttribute = {
  readonly name: StableIdV1;
  readonly value: SolverSemanticScalar;
};

export type SolverDeviceObservation = {
  readonly placementId: PlacementIdV1;
  readonly semanticType: StableIdV1;
  readonly state: StableIdV1;
  readonly attributesOrder: "name";
  readonly attributes: readonly SolverDeviceAttribute[];
};

export type SolverStateFingerprint = {
  readonly stateId: StableIdV1;
  readonly fingerprint: StableIdV1;
};

export type SolverRuntimeFingerprints = {
  /** Exact target runtime digest suitable for checkpoint restore equality. */
  readonly exact: StableIdV1;
  /** Future-facing digest when the adapter can provide one. */
  readonly continuation: StableIdV1 | null;
  /** Target-scoped canonical observation digest; not cross-target parity proof. */
  readonly semantic: StableIdV1;
};

export type SolverObservation = {
  readonly observationVersion: 1;
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: SolverLevelFactsReference;
  readonly provenance: SolverRuntimeProvenance;
  readonly boundary: SolverRuntimeBoundary;
  readonly geometry: SolverLevelGeometry;
  readonly timing: {
    /** Exact target timer fields; adapters must not normalize their phase away. */
    readonly currentTime: number;
    readonly timeOffset: number;
    readonly secondsPlayed: number;
    /** Native ticks; zero denotes an untimed level in the current engines. */
    readonly timeLimit: number;
    /** Derived from the native timer, or null for an untimed level. */
    readonly remainingNativeTicks: number | null;
  };
  readonly input: {
    /** Exact last host poll in manual mode; null before the first poll and in replay mode. */
    readonly lastPolledInputCode: number | null;
    /** Last target-resolved manual or replay input actually presented to gameplay. */
    readonly lastAppliedInputCode: number | null;
    /** Null in manual mode; otherwise the exact replay-stream cursor. */
    readonly replayCursor: number | null;
    /** Null in manual mode; otherwise the replay plan's declared move count. */
    readonly replayMoveCount: number | null;
    /** Null in manual mode; otherwise the target-native replay deadline. */
    readonly replayBestTimeTicks: number | null;
  };
  readonly randomness: {
    readonly stepping: number;
    /** Replay-header seed direction; mutable target rotor state stays native in P2A. */
    readonly initialRandomSlideDirection: DirectionV1 | null;
    readonly nativeStateFingerprintsOrder: "state-id";
    readonly nativeStateFingerprints: readonly SolverStateFingerprint[];
  };
  readonly cellsOrder: "z-y-x";
  readonly cells: readonly SolverObservedCell[];
  readonly player: SolverPlayerObservation;
  readonly actorsOrder: "observation-order";
  readonly actors: readonly SolverActorObservation[];
  readonly inventoryOrder: "runtime-slot-order";
  readonly inventory: readonly SolverInventoryEntry[];
  /** Outstanding level requirements (for example chips), not owned inventory. */
  readonly remainingRequirementsOrder: "resource-type";
  readonly remainingRequirements: readonly SolverRemainingRequirement[];
  readonly devicesOrder: "placement-id";
  readonly devices: readonly SolverDeviceObservation[];
  readonly fingerprints: SolverRuntimeFingerprints;
  readonly terminal: SolverTerminalResult;
};

export type SolverRenderRegionRequest =
  | {
      readonly kind: "full-map";
    }
  | {
      readonly kind: "box";
      readonly minimum: SolverCoordinate;
      readonly maximum: SolverCoordinate;
    };

export type SolverResolvedRenderRegion = {
  readonly kind: "full-map" | "box";
  readonly minimum: SolverCoordinate;
  readonly maximum: SolverCoordinate;
};

export type SolverRenderItem = {
  readonly identity: SolverElementIdentity;
  readonly semanticType: StableIdV1;
  readonly stratum: PlacementStratumV1;
  readonly facing: DirectionV1 | null;
  readonly state: StableIdV1 | null;
  /** Deterministic projection position; this is not target-native visual depth. */
  readonly projectionOrder: number;
  readonly source: "observation-element" | "runtime-overlay";
};

export type SolverRenderCell = {
  readonly cellOrdinal: number;
  readonly coordinate: SolverCoordinate;
  readonly itemsOrder: "stratum-then-identity";
  readonly items: readonly SolverRenderItem[];
};

/** Deterministic semantic scene data; rendering pixels is deliberately out of scope. */
export type SolverRenderProjection = {
  readonly projectionVersion: 1;
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: SolverLevelFactsReference;
  readonly provenance: SolverRuntimeProvenance;
  readonly boundary: SolverRuntimeBoundary;
  /** Binds the scene to the exact observation state from which it was projected. */
  readonly fingerprints: SolverRuntimeFingerprints;
  readonly region: SolverResolvedRenderRegion;
  readonly cellsOrder: "z-y-x";
  readonly cells: readonly SolverRenderCell[];
  readonly terminal: SolverTerminalResult;
};

/** Canonical-safe public metadata; the checkpoint payload itself remains opaque. */
export type SolverCheckpointMetadata = {
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: SolverLevelFactsReference;
  readonly nativeTick: number;
  readonly exactRestoreDigest: StableIdV1;
  readonly provenance: SolverRuntimeProvenance;
};
