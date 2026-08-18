import type {
  ActorIdV1,
  BlobReferenceV1,
  DirectionV1,
  PlacementIdV1,
  RevisionIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";
import type {
  SolverActorLifecycle,
  SolverActorMovement,
  SolverActorObservation,
  SolverCoordinate,
  SolverDeviceObservation,
  SolverInventoryEntry,
  SolverObservation,
  SolverObservedElement,
  SolverRenderProjection,
  SolverRenderRegionRequest,
  SolverRuntimeMode,
  SolverStateFingerprint,
  SolverTerminalResult,
} from "../domain/runtime/types.js";
import type {
  ExpandedPlanIdV1,
  ExpandedPlanPreviewV1,
  ExpandedPlanStepV1,
  PlanRootIdV1,
  PlanningStateAxisV1,
} from "../plan/model.js";
import type { SolverAdvanceRequest } from "../ports/SolverRuntimePort.js";

/** P3B remains a canonical-safe preview; opaque checkpoints never enter these values. */
export type ContextualEntryIdV1 = `entry:sha256:${string}`;
export type ContextualWitnessIdV1 = `witness:sha256:${string}`;
export type ContextualDecisionDigestV1 = `sha256:${string}`;

export type CountComparisonV1 = "equals" | "at-least" | "at-most";

interface ObservationPredicateBaseV1<TKind extends string> {
  readonly predicateId: StableIdV1;
  readonly kind: TKind;
}

export type PlayerCoordinatePredicateV1 = ObservationPredicateBaseV1<"player-coordinate"> & {
  readonly coordinate: SolverCoordinate | null;
};

export type InventoryCountPredicateV1 = ObservationPredicateBaseV1<"inventory-count"> & {
  readonly resourceType: StableIdV1;
  readonly comparison: CountComparisonV1;
  readonly count: number;
};

export type RemainingRequirementCountPredicateV1 = ObservationPredicateBaseV1<
  "remaining-requirement-count"
> & {
  readonly resourceType: StableIdV1;
  readonly comparison: CountComparisonV1;
  readonly count: number;
};

export type PlacementPresencePredicateV1 = ObservationPredicateBaseV1<
  "placement-presence"
> & {
  readonly placementId: PlacementIdV1;
  readonly present: boolean;
};

export type ActorStatePredicateV1 = ObservationPredicateBaseV1<"actor-state"> & {
  readonly actorId: ActorIdV1;
} & (
  | {
      readonly property: "coordinate";
      readonly value: SolverCoordinate | null;
    }
  | {
      readonly property: "lifecycle";
      readonly value: SolverActorLifecycle;
    }
  | {
      readonly property: "facing";
      readonly value: DirectionV1 | null;
    }
  | {
      readonly property: "movement";
      readonly value: SolverActorMovement;
    }
);

export type DeviceStatePredicateV1 = ObservationPredicateBaseV1<"device-state"> & {
  readonly placementId: PlacementIdV1;
  readonly state: StableIdV1;
};

export type TerminalStatePredicateV1 = ObservationPredicateBaseV1<"terminal-state"> & (
  | { readonly terminalKind: "running" }
  | {
      readonly terminalKind: "won";
      /** Null explicitly accepts an engine result whose exit identity is unavailable. */
      readonly exitPlacementId: PlacementIdV1 | null;
    }
  | {
      readonly terminalKind: "lost";
      readonly cause: StableIdV1 | null;
    }
  | { readonly terminalKind: "timed-out" }
);

export type NativeStateFingerprintPredicateV1 = ObservationPredicateBaseV1<
  "native-state-fingerprint"
> & {
  readonly stateId: StableIdV1;
  readonly fingerprint: StableIdV1;
};

/** Closed predicates evaluated only from one P2A observation. */
export type SubgoalObservationPredicateV1 =
  | PlayerCoordinatePredicateV1
  | InventoryCountPredicateV1
  | RemainingRequirementCountPredicateV1
  | PlacementPresencePredicateV1
  | ActorStatePredicateV1
  | DeviceStatePredicateV1
  | TerminalStatePredicateV1
  | NativeStateFingerprintPredicateV1;

export type ObservationChangeSelectorV1 =
  | { readonly kind: "timing" }
  | { readonly kind: "input" }
  | { readonly kind: "randomness" }
  | { readonly kind: "player" }
  | { readonly kind: "inventory-resource"; readonly resourceType: StableIdV1 }
  | { readonly kind: "inventory-order" }
  | { readonly kind: "remaining-requirement"; readonly resourceType: StableIdV1 }
  | { readonly kind: "actor"; readonly actorId: ActorIdV1 }
  | { readonly kind: "actor-order" }
  | { readonly kind: "device"; readonly placementId: PlacementIdV1 }
  | { readonly kind: "cell"; readonly coordinate: SolverCoordinate }
  | { readonly kind: "placement"; readonly placementId: PlacementIdV1 }
  | { readonly kind: "terminal" };

export interface ContextualPlanSegmentV1 {
  readonly planId: ExpandedPlanIdV1;
  readonly rootId: PlanRootIdV1;
  readonly startStepOrder: number;
  readonly endStepOrder: number;
  readonly operatorIds: readonly StableIdV1[];
}

export interface SubgoalContractV1 {
  readonly contractVersion: 1;
  readonly contractId: StableIdV1;
  readonly title: string;
  readonly description: string;
  readonly target: RulesetTargetV1;
  readonly planSegment: ContextualPlanSegmentV1;
  readonly requires: readonly SubgoalObservationPredicateV1[];
  readonly ensures: readonly SubgoalObservationPredicateV1[];
  readonly invariants: readonly SubgoalObservationPredicateV1[];
  readonly stop: SubgoalObservationPredicateV1;
  readonly maximumAdvanceTicks: number;
  readonly footprint: {
    readonly mustChange: readonly ObservationChangeSelectorV1[];
    readonly mayChange: readonly ObservationChangeSelectorV1[];
    readonly mustNotChange: readonly ObservationChangeSelectorV1[];
  };
  /** Boundary-delta patterns only; these are deliberately not causal events. */
  readonly forbiddenObservedChanges: readonly ObservationChangeSelectorV1[];
  readonly provenance: {
    readonly derivation:
      | "authored"
      | "forward-derived"
      | "backward-regressed"
      | "bidirectional-joined"
      | "donor-inferred";
    readonly derivationRevision: RevisionIdV1;
    readonly review:
      | { readonly status: "unreviewed" }
      | { readonly status: "reviewed"; readonly reviewRevision: RevisionIdV1 };
  };
}

export interface ContextualInitializationV1 {
  readonly randomSeed: number;
  readonly seedSemantics: StableIdV1;
  /** Exact replay source when replay mode owns input; null in manual mode. */
  readonly replay: BlobReferenceV1 | null;
}

export type ContextualWitnessStart<TManualSource, TReplaySource> =
  | { readonly kind: "manual"; readonly source: TManualSource }
  | { readonly kind: "replay"; readonly source: TReplaySource };

export interface ExecuteContextualWitnessInputV1<TManualSource, TReplaySource> {
  readonly start: ContextualWitnessStart<TManualSource, TReplaySource>;
  readonly initialization: ContextualInitializationV1;
  readonly prefix: readonly SolverAdvanceRequest[];
  readonly snippet: readonly SolverAdvanceRequest[];
  readonly expectedEntryBoundary: number;
  readonly plan: ExpandedPlanPreviewV1;
  readonly segment: ContextualPlanSegmentV1;
  readonly contract: SubgoalContractV1;
  readonly renderRegion: SolverRenderRegionRequest;
  readonly bounds: {
    readonly maximumPrefixTicks: number;
    readonly maximumSnippetTicks: number;
  };
}

export type SolverObservedChangeV1 =
  | {
      readonly kind: "timing-state";
      readonly before: SolverObservation["timing"];
      readonly after: SolverObservation["timing"];
    }
  | {
      readonly kind: "input-state";
      readonly before: SolverObservation["input"];
      readonly after: SolverObservation["input"];
    }
  | {
      readonly kind: "randomness-state";
      readonly before: SolverObservation["randomness"];
      readonly after: SolverObservation["randomness"];
    }
  | {
      readonly kind: "player-state";
      readonly before: SolverObservation["player"];
      readonly after: SolverObservation["player"];
    }
  | {
      readonly kind: "inventory-count";
      readonly resourceType: StableIdV1;
      readonly before: number;
      readonly after: number;
    }
  | {
      readonly kind: "inventory-order";
      readonly before: readonly SolverInventoryEntry[];
      readonly after: readonly SolverInventoryEntry[];
    }
  | {
      readonly kind: "remaining-requirement-count";
      readonly resourceType: StableIdV1;
      readonly before: number;
      readonly after: number;
    }
  | {
      readonly kind: "actor-state";
      readonly actorId: ActorIdV1;
      readonly before: SolverActorObservation | null;
      readonly after: SolverActorObservation | null;
    }
  | {
      readonly kind: "actor-order";
      readonly before: readonly ActorIdV1[];
      readonly after: readonly ActorIdV1[];
    }
  | {
      readonly kind: "device-state";
      readonly placementId: PlacementIdV1;
      readonly before: SolverDeviceObservation | null;
      readonly after: SolverDeviceObservation | null;
    }
  | {
      readonly kind: "cell-elements";
      readonly coordinate: SolverCoordinate;
      readonly before: readonly SolverObservedElement[];
      readonly after: readonly SolverObservedElement[];
    }
  | {
      readonly kind: "terminal-state";
      readonly before: SolverTerminalResult;
      readonly after: SolverTerminalResult;
    };

export interface ObservationPredicateVerdictV1 {
  readonly predicateId: StableIdV1;
  readonly passed: boolean;
  readonly actual: null | boolean | number | string | SolverCoordinate;
}

export interface FootprintSelectorVerdictV1 {
  readonly selector: ObservationChangeSelectorV1;
  readonly passed: boolean;
  readonly matchedChangeOrders: readonly number[];
}

export interface SubgoalContractValidationV1 {
  readonly requires: readonly ObservationPredicateVerdictV1[];
  readonly ensures: readonly ObservationPredicateVerdictV1[];
  readonly invariantsAtEntry: readonly ObservationPredicateVerdictV1[];
  readonly mustChange: readonly FootprintSelectorVerdictV1[];
  readonly mustNotChange: readonly FootprintSelectorVerdictV1[];
  readonly forbiddenObservedChanges: readonly FootprintSelectorVerdictV1[];
  readonly unaccountedChangeOrders: readonly number[];
}

export interface ContextualBoundaryCaptureV1 {
  readonly observation: SolverObservation;
  readonly observationContent: BlobReferenceV1;
  readonly render: SolverRenderProjection;
  readonly renderContent: BlobReferenceV1;
}

export interface ContextualBoundaryCheckV1 {
  readonly decisionOrder: number | null;
  readonly nativeTick: number;
  readonly exactDigest: StableIdV1;
  readonly invariantVerdicts: readonly ObservationPredicateVerdictV1[];
  readonly stopVerdict: ObservationPredicateVerdictV1;
}

export type ContextualWitnessFailureCodeV1 =
  | "witness.precondition"
  | "witness.invariant"
  | "witness.decision-exhausted"
  | "witness.budget-exhausted"
  | "witness.terminal-before-stop"
  | "witness.postcondition"
  | "witness.must-change"
  | "witness.must-not-change"
  | "witness.forbidden-change"
  | "witness.unaccounted-change"
  | "witness.plan-effect"
  | "witness.join-broken";

export interface ContextualWitnessFailureV1 {
  readonly code: ContextualWitnessFailureCodeV1;
  readonly boundaryNativeTick: number;
  readonly predicateId: StableIdV1 | null;
  readonly decisionOrder: number | null;
  readonly detail: string;
}

export type ContextualWitnessOutcomeV1 =
  | { readonly kind: "verified" }
  | { readonly kind: "failed"; readonly failure: ContextualWitnessFailureV1 };

export interface ContextualWitnessJoinV1 {
  readonly state: "exact" | "semantic-only" | "broken";
  readonly comparedDecisionCount: number;
  readonly firstDivergenceDecisionOrder: number | null;
}

export interface ContextualPlanVerificationScopeV1 {
  /** A witness proves this selection only; it never upgrades the parent plan. */
  readonly kind: "selected-segment-only";
  readonly parentPlanStatus: ExpandedPlanPreviewV1["status"];
}

export interface ContextualPlanEffectVerdictV1 {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: StableIdV1;
  readonly expectedDelta: number;
  readonly observedDelta: number;
  readonly passed: boolean;
}

export interface ContextualWitnessResultV1 {
  readonly witnessVersion: 1;
  readonly witnessId: ContextualWitnessIdV1;
  readonly entryId: ContextualEntryIdV1;
  readonly target: RulesetTargetV1;
  readonly mode: SolverRuntimeMode;
  readonly level: SolverObservation["level"];
  readonly levelFacts: SolverObservation["levelFacts"];
  readonly runtimeProvenance: SolverObservation["provenance"];
  readonly initialization: ContextualInitializationV1;
  readonly planSegment: ContextualPlanSegmentV1;
  readonly planVerificationScope: ContextualPlanVerificationScopeV1;
  readonly planIntentOrder: "step-order";
  readonly planIntent: readonly ExpandedPlanStepV1[];
  readonly contract: SubgoalContractV1;
  readonly prefix: {
    readonly digest: ContextualDecisionDigestV1;
    readonly decisions: readonly SolverAdvanceRequest[];
  };
  readonly snippet: {
    readonly digest: ContextualDecisionDigestV1;
    readonly decisions: readonly SolverAdvanceRequest[];
    readonly consumedDecisionCount: number;
  };
  readonly entry: ContextualBoundaryCaptureV1;
  readonly end: ContextualBoundaryCaptureV1;
  readonly boundaryChecksOrder: "execution-order";
  readonly boundaryChecks: readonly ContextualBoundaryCheckV1[];
  readonly observedChangesOrder: "kind-identity";
  readonly observedChanges: readonly SolverObservedChangeV1[];
  readonly planEffectValidationOrder: "axis-resource-type";
  readonly planEffectValidation: readonly ContextualPlanEffectVerdictV1[];
  readonly contractValidation: SubgoalContractValidationV1;
  readonly join: ContextualWitnessJoinV1 | null;
  readonly evidence: {
    readonly coverage: "single-witness";
    readonly rulesetScope: RulesetTargetV1;
    readonly robustness: "single-context";
  };
  readonly provenance: {
    /** P3A selected-plan intent remains distinct from contract authorship. */
    readonly planIntentDerivation: "backward-regressed";
    readonly derivation: SubgoalContractV1["provenance"]["derivation"];
    readonly observation: "observed";
    readonly review: SubgoalContractV1["provenance"]["review"];
    readonly verification: "verified" | "failed";
    readonly validatorRevision: RevisionIdV1;
  };
  readonly outcome: ContextualWitnessOutcomeV1;
}

export type ContextualWitnessExecutorErrorCodeV1 =
  | "witness.invalid-request"
  | "witness.invalid-plan-segment"
  | "witness.invalid-contract"
  | "witness.hash-failed"
  | "witness.runtime-failed"
  | "witness.render-incoherent"
  | "witness.checkpoint-incoherent"
  | "witness.cleanup-failed";

export class ContextualWitnessExecutorError extends Error {
  override readonly name = "ContextualWitnessExecutorError";

  constructor(
    readonly code: ContextualWitnessExecutorErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export interface ContextualWitnessExecutor<TManualSource, TReplaySource> {
  execute(
    input: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>,
  ): Promise<ContextualWitnessResultV1>;
  clearCheckpointCache(): Promise<void>;
}

export interface ContextualWitnessExecutorOptions<TManualSource, TReplaySource> {
  readonly runtime: import("../ports/SolverRuntimePort.js").SolverRuntimePort<
    TManualSource,
    TReplaySource
  >;
  readonly sha256: import("../ports/Sha256Port.js").Sha256Port;
  readonly validatorRevision: RevisionIdV1;
  readonly maximumCachedPrefixes: number;
}

export type RuntimeResourceCollectionV1 = readonly {
  readonly resourceType: StableIdV1;
  readonly count: number;
}[];

export type RuntimeFingerprintCollectionV1 = readonly SolverStateFingerprint[];
