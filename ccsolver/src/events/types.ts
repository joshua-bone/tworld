import type {
  ActorIdV1,
  DirectionV1,
  PlacementIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";
import type {
  SolverActorLifecycle,
  SolverCoordinate,
  SolverLevelFactsReference,
  SolverPlayerControl,
  SolverRuntimeLevelIdentity,
  SolverRuntimeMode,
  SolverRuntimeProvenance,
  SolverTerminalResult,
} from "../domain/runtime/types.js";

/**
 * P2B values are target-neutral, canonical-JSON-safe evidence DTOs. A semantic
 * event is authoritative only to the degree declared by its authority field;
 * chronological adjacency never supplies a causal edge.
 */

export type SolverCausalEventKindV1 =
  | "command"
  | "movement-planned"
  | "movement-blocked"
  | "movement-started"
  | "movement-completed"
  | "resource-collected"
  | "inventory-changed"
  | "requirement-changed"
  | "map-mutated"
  | "device-activated"
  | "device-state-changed"
  | "teleport-entered"
  | "teleport-relocated"
  | "teleport-exited"
  | "control-changed"
  | "actor-spawned"
  | "actor-lifecycle-changed"
  | "actor-destroyed"
  | "player-died"
  | "terminal-reached";

export type SolverCausalEventBoundaryPhaseV1 =
  | "command"
  | "transition"
  | "settlement"
  | "terminal";

export type SolverCausalEventBoundaryV1 = {
  /** Exact native target tick. Equal values across targets do not imply equal time. */
  readonly nativeTick: number;
  readonly phase: SolverCausalEventBoundaryPhaseV1;
};

/** A device is identified by its stable static placement identity. */
export type SolverDeviceIdV1 = PlacementIdV1;

export type SolverCausalEventParticipantV1 = {
  readonly semanticType: StableIdV1;
  readonly actorId: ActorIdV1 | null;
  readonly placementId: PlacementIdV1 | null;
  readonly deviceId: SolverDeviceIdV1 | null;
};

export type SolverCausalEventCoordinatesV1 = {
  readonly before: SolverCoordinate | null;
  readonly after: SolverCoordinate | null;
};

export type SolverCausalEventAuthorityV1 =
  | {
      /** A purpose-built hook at the native semantic action site. */
      readonly basis: "native-action-hook";
      readonly evidence: "authoritative";
      readonly causality: "explicit" | "unattributed";
    }
  | {
      /** The target-neutral runtime observed the command it supplied. */
      readonly basis: "runtime-command";
      readonly evidence: "authoritative";
      readonly causality: "explicit";
    }
  | {
      /** Native diagnostic output: useful for diagnosis, never proof by itself. */
      readonly basis: "native-diagnostic";
      readonly evidence: "diagnostic-only";
      readonly causality: "explicit" | "unattributed";
    }
  | {
      /** A change observed across boundaries without an authoritative action hook. */
      readonly basis: "boundary-delta";
      readonly evidence: "diagnostic-only";
      readonly causality: "unattributed";
    }
  | {
      /** The runtime's stable first-terminal latch. */
      readonly basis: "terminal-latch";
      readonly evidence: "authoritative";
      readonly causality: "explicit" | "unattributed";
    };

export type SolverCommandCausalContextV1 = {
  readonly commandId: StableIdV1;
  readonly planId: StableIdV1 | null;
};

export type SolverCommandEventDetailV1 = {
  readonly requestKind: "manual-poll" | "replay-tick";
  readonly inputCode: number | null;
  readonly influence: "applied" | "held" | "blocked" | "ignored";
  readonly failureReason: StableIdV1 | null;
};

export type SolverMovementEventDetailV1 = {
  readonly direction: DirectionV1 | null;
  readonly movementRole: "self" | "push" | "forced";
  readonly attemptedCoordinate: SolverCoordinate | null;
  /** The native first-failure reason when available; otherwise null. */
  readonly failureReason: StableIdV1 | null;
};

export type SolverResourceCollectedEventDetailV1 = {
  readonly resourceType: StableIdV1;
  readonly amount: number;
  readonly inventoryBefore: number | null;
  readonly inventoryAfter: number | null;
  readonly remainingBefore: number | null;
  readonly remainingAfter: number | null;
};

export type SolverResourceCountEventDetailV1 = {
  readonly resourceType: StableIdV1;
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly reason: StableIdV1;
};

export type SolverMapMutationEventDetailV1 = {
  readonly mutation: StableIdV1;
  readonly beforeSemanticType: StableIdV1 | null;
  readonly beforeState: StableIdV1 | null;
  readonly afterSemanticType: StableIdV1 | null;
  readonly afterState: StableIdV1 | null;
};

export type SolverDeviceEventDetailV1 = {
  readonly action: StableIdV1;
  readonly beforeState: StableIdV1 | null;
  readonly afterState: StableIdV1 | null;
};

export type SolverTeleportEventDetailV1 = {
  readonly networkId: StableIdV1;
  readonly entryPlacementId: PlacementIdV1;
  readonly exitPlacementId: PlacementIdV1 | null;
};

export type SolverControlChangedEventDetailV1 = {
  readonly before: SolverPlayerControl;
  readonly after: SolverPlayerControl;
  readonly reason: StableIdV1;
};

export type SolverActorLifecycleEventDetailV1 = {
  readonly before: SolverActorLifecycle | null;
  readonly after: SolverActorLifecycle | null;
  readonly parentActorId: ActorIdV1 | null;
  readonly spawnOrdinal: number | null;
  readonly reason: StableIdV1;
};

export type SolverPlayerDeathEventDetailV1 = {
  readonly cause: StableIdV1;
  readonly hazardPlacementId: PlacementIdV1 | null;
};

export type SolverTerminalReachedEventDetailV1 = {
  readonly result: Exclude<SolverTerminalResult, { readonly kind: "running" }>;
};

type SolverCausalEventBaseV1 = {
  readonly eventVersion: 1;
  /** Contiguous zero-based order within this run journal. */
  readonly sequence: number;
  /**
   * Zero-based occurrence for kind + stable subject/source identities + the
   * relevant resource or transport-network identity.
   */
  readonly occurrenceOrdinal: number;
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly boundary: SolverCausalEventBoundaryV1;
  readonly authority: SolverCausalEventAuthorityV1;
  readonly subject: SolverCausalEventParticipantV1 | null;
  readonly source: SolverCausalEventParticipantV1 | null;
  readonly coordinates: SolverCausalEventCoordinatesV1;
  /** Null when no command authority exists. */
  readonly commandId: StableIdV1 | null;
  /** Null when the executing caller supplied no plan authority. */
  readonly planId: StableIdV1 | null;
  /** Explicit earlier event causes only; never chronological predecessors. */
  readonly causedBySequences: readonly number[];
};

export type SolverCausalEventV1 = SolverCausalEventBaseV1 & (
  | { readonly kind: "command"; readonly detail: SolverCommandEventDetailV1 }
  | {
      readonly kind:
        | "movement-planned"
        | "movement-blocked"
        | "movement-started"
        | "movement-completed";
      readonly detail: SolverMovementEventDetailV1;
    }
  | {
      readonly kind: "resource-collected";
      readonly detail: SolverResourceCollectedEventDetailV1;
    }
  | {
      readonly kind: "inventory-changed" | "requirement-changed";
      readonly detail: SolverResourceCountEventDetailV1;
    }
  | { readonly kind: "map-mutated"; readonly detail: SolverMapMutationEventDetailV1 }
  | {
      readonly kind: "device-activated" | "device-state-changed";
      readonly detail: SolverDeviceEventDetailV1;
    }
  | {
      readonly kind: "teleport-entered" | "teleport-relocated" | "teleport-exited";
      readonly detail: SolverTeleportEventDetailV1;
    }
  | { readonly kind: "control-changed"; readonly detail: SolverControlChangedEventDetailV1 }
  | {
      readonly kind: "actor-spawned" | "actor-lifecycle-changed" | "actor-destroyed";
      readonly detail: SolverActorLifecycleEventDetailV1;
    }
  | { readonly kind: "player-died"; readonly detail: SolverPlayerDeathEventDetailV1 }
  | { readonly kind: "terminal-reached"; readonly detail: SolverTerminalReachedEventDetailV1 }
);

export type SolverCausalEventReadRequestV1 = {
  /** Exclusive sequence cursor; null starts before sequence zero. */
  readonly afterSequence: number | null;
  /** Positive finite page bound chosen by the caller. */
  readonly maximumEvents: number;
};

export type SolverCausalEventRetentionV1 =
  | {
      readonly status: "complete";
    }
  | {
      /** The sink stopped retaining events; gameplay continued unchanged. */
      readonly status: "overflow";
      readonly reason: "capacity-exhausted";
      readonly firstOmittedSequence: number;
      readonly omittedEventCount: number;
    };

export type SolverCausalEventPageWindowV1 = {
  readonly firstAvailableSequence: number | null;
  readonly availableThroughSequence: number | null;
  readonly firstReturnedSequence: number | null;
  readonly lastReturnedSequence: number | null;
  /** Cursor for the next non-consuming read; unchanged when this page is empty. */
  readonly nextAfterSequence: number | null;
  readonly status: "complete" | "maximum-events-reached";
};

export type SolverCausalEventPageV1 = {
  readonly journalVersion: 1;
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: SolverLevelFactsReference;
  readonly provenance: SolverRuntimeProvenance;
  readonly requested: SolverCausalEventReadRequestV1;
  readonly eventsOrder: "sequence";
  readonly events: readonly SolverCausalEventV1[];
  readonly window: SolverCausalEventPageWindowV1;
  readonly retention: SolverCausalEventRetentionV1;
};

/** Opaque-checkpoint companion state retained by an adapter across restore. */
export type SolverCausalJournalCheckpointV1 = {
  readonly nextSequence: number;
  readonly retainedEventCount: number;
  readonly retention: SolverCausalEventRetentionV1;
};
