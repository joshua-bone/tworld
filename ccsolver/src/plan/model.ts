import type {
  PlacementIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";

/**
 * P3A values are canonical-JSON-safe planning previews. They explain a
 * terminal-first regression; they are not executable engine commands or a
 * claim that a route has been witnessed.
 */

export type PlanPredicateKindV1 =
  | "reach-exit"
  | "reach"
  | "collect"
  | "unlock";

export type ReachExitPredicateV1 = {
  readonly kind: "reach-exit";
  readonly exitId: StableIdV1;
};

export type ReachPredicateV1 = {
  readonly kind: "reach";
  readonly regionId: StableIdV1;
};

export type CollectPredicateV1 = {
  readonly kind: "collect";
  readonly resourceType: StableIdV1;
  readonly amount: number;
  /** Distinguishes repeated collections of the same semantic resource. */
  readonly collectionOccurrenceId: StableIdV1;
  /** Exact source when known; null preserves an explicitly aggregate occurrence. */
  readonly sourcePlacementId: PlacementIdV1 | null;
};

export type GateRequirementV1 =
  | {
      readonly kind: "consume-inventory";
      readonly resourceType: StableIdV1;
      readonly amount: number;
    }
  | {
      readonly kind: "possess-inventory";
      readonly resourceType: StableIdV1;
      readonly amount: number;
    }
  | {
      readonly kind: "remaining-zero";
      readonly resourceType: StableIdV1;
    };

export type UnlockPredicateV1 = {
  readonly kind: "unlock";
  readonly gateId: StableIdV1;
  readonly requirement: GateRequirementV1;
};

/** The deliberately closed P3A goal vocabulary. */
export type PlanPredicateV1 =
  | ReachExitPredicateV1
  | ReachPredicateV1
  | CollectPredicateV1
  | UnlockPredicateV1;

export type PlanGoalIdV1 = `goal:${number}`;
export type PlanRootIdV1 = `root:${number}`;
export type PlanOperatorNodeIdV1 = `operator-node:${number}`;
export type ExpandedPlanIdV1 = `plan:${number}:${number}`;
export type PlanningDiagnosticIdV1 = `diagnostic:${number}`;

export type PlanningFactStatusV1 = "satisfied" | "unknown" | "dynamic";

export interface PlanningFactV1 {
  readonly predicate: PlanPredicateV1;
  readonly status: PlanningFactStatusV1;
  readonly evidenceIds: readonly StableIdV1[];
}

export interface PlanningExitV1 {
  readonly target: RulesetTargetV1;
  readonly exitId: StableIdV1;
  readonly evidenceIds: readonly StableIdV1[];
}

export type PlanningStateAxisV1 = "inventory" | "remaining-requirement";

export interface PlanningStateEffectV1 {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: StableIdV1;
  /** Positive increases this exact state axis; negative decreases it. */
  readonly delta: number;
}

interface TerminalFirstOperatorBaseV1<
  TKind extends PlanPredicateKindV1,
  TAchieves extends PlanPredicateV1,
> {
  readonly operatorId: StableIdV1;
  readonly target: RulesetTargetV1;
  readonly kind: TKind;
  readonly achieves: TAchieves;
  /** AND prerequisites. Alternative operators for one goal form its OR choices. */
  readonly prerequisites: readonly PlanPredicateV1[];
  /** Gate consumption is derived from Unlock.requirement and is not repeated here. */
  readonly stateEffects: readonly PlanningStateEffectV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

export type ReachExitOperatorV1 = TerminalFirstOperatorBaseV1<
  "reach-exit",
  ReachExitPredicateV1
>;
export type ReachOperatorV1 = TerminalFirstOperatorBaseV1<"reach", ReachPredicateV1>;
export type CollectOperatorV1 = TerminalFirstOperatorBaseV1<"collect", CollectPredicateV1>;
export type UnlockOperatorV1 = TerminalFirstOperatorBaseV1<"unlock", UnlockPredicateV1>;

/** The deliberately closed P3A operator vocabulary. */
export type TerminalFirstOperatorV1 =
  | ReachExitOperatorV1
  | ReachOperatorV1
  | CollectOperatorV1
  | UnlockOperatorV1;

export interface PlanningInitialStateEntryV1 {
  readonly resourceType: StableIdV1;
  readonly amount: number;
}

export interface PlanningInitialStateV1 {
  readonly inventory: readonly PlanningInitialStateEntryV1[];
  readonly remainingRequirements: readonly PlanningInitialStateEntryV1[];
}

export interface TerminalFirstPlanningLimitsV1 {
  /** Maximum recursion depth for one branch; implementation maximum 256. */
  readonly maxDepth: number;
  /** Maximum previews retained for each exit; implementation maximum 1,024. */
  readonly maxPlansPerExit: number;
  /** Maximum trace records retained; implementation maximum 16,384. */
  readonly maxTraceSteps: number;
  /** Maximum retained diagnostics (1,024); omitted count remains explicit. */
  readonly maxDiagnostics: number;
}

export interface TerminalFirstPlanningInputV1 {
  readonly planningVersion: 1;
  readonly target: RulesetTargetV1;
  readonly exits: readonly PlanningExitV1[];
  readonly facts: readonly PlanningFactV1[];
  readonly operators: readonly TerminalFirstOperatorV1[];
  readonly initialState: PlanningInitialStateV1;
  readonly limits?: Partial<TerminalFirstPlanningLimitsV1>;
}

export type GoalResolutionV1 =
  | "satisfied"
  | "regressed"
  | "regressed-with-unknown"
  | "regressed-with-dynamic"
  | "unresolved-unknown"
  | "unresolved-dynamic"
  | "unresolved-no-achiever";

export interface GoalGraphRootV1 {
  readonly rootId: PlanRootIdV1;
  readonly target: RulesetTargetV1;
  readonly exitId: StableIdV1;
  readonly goalId: PlanGoalIdV1;
  readonly evidenceIds: readonly StableIdV1[];
}

export interface GoalGraphGoalNodeV1 {
  readonly nodeType: "goal";
  readonly goalId: PlanGoalIdV1;
  readonly predicate: PlanPredicateV1;
  readonly resolution: GoalResolutionV1;
  readonly evidenceIds: readonly StableIdV1[];
  /** OR choices, ordered by operator-node identity. */
  readonly achieverNodeIds: readonly PlanOperatorNodeIdV1[];
}

export interface GoalGraphOperatorNodeV1 {
  readonly nodeType: "operator";
  readonly operatorNodeId: PlanOperatorNodeIdV1;
  readonly operatorId: StableIdV1;
  readonly target: RulesetTargetV1;
  readonly kind: PlanPredicateKindV1;
  readonly achievesGoalId: PlanGoalIdV1;
  /** AND edges, ordered by goal identity. */
  readonly prerequisiteGoalIds: readonly PlanGoalIdV1[];
  readonly stateEffects: readonly PlanningStateEffectV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

export interface GoalGraphV1 {
  readonly graphVersion: 1;
  readonly target: RulesetTargetV1;
  readonly rootsOrder: "exit-id";
  readonly roots: readonly GoalGraphRootV1[];
  readonly goalsOrder: "goal-id";
  readonly goals: readonly GoalGraphGoalNodeV1[];
  readonly operatorsOrder: "operator-node-id";
  readonly operators: readonly GoalGraphOperatorNodeV1[];
}

export type BackwardTraceActionV1 =
  | "root"
  | "regress"
  | "satisfied"
  | "unresolved"
  | "cycle"
  | "limit";

export type BackwardTraceProvenanceV1 =
  | "authored"
  | "forward-derived"
  | "backward-regressed"
  | "bidirectional-joined"
  | "donor-inferred";

export interface BackwardTraceStepV1 {
  readonly traceOrder: number;
  readonly rootId: PlanRootIdV1;
  readonly depth: number;
  readonly action: BackwardTraceActionV1;
  readonly provenance: BackwardTraceProvenanceV1;
  readonly goalId: PlanGoalIdV1;
  readonly predicate: PlanPredicateV1;
  readonly viaOperatorId: StableIdV1 | null;
  readonly evidenceIds: readonly StableIdV1[];
}

export type PlanningUnresolvedReasonV1 =
  | "unknown"
  | "dynamic"
  | "no-achiever"
  | "cycle"
  | "limit"
  | "resource-inconsistent";

export interface PlanningUnresolvedObligationV1 {
  readonly goalId: PlanGoalIdV1;
  readonly predicate: PlanPredicateV1;
  readonly reason: PlanningUnresolvedReasonV1;
  readonly viaOperatorId: StableIdV1 | null;
  readonly evidenceIds: readonly StableIdV1[];
  readonly pathGoalIds: readonly PlanGoalIdV1[];
}

/** A forward-ordered provisional step suitable for later P3B witness binding. */
export interface ExpandedPlanStepV1 {
  readonly stepOrder: number;
  readonly operatorId: StableIdV1;
  readonly kind: PlanPredicateKindV1;
  readonly achieves: PlanPredicateV1;
  readonly prerequisites: readonly PlanPredicateV1[];
  /** Includes the derived consume-inventory effect for consuming gates. */
  readonly stateEffects: readonly PlanningStateEffectV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

export interface PlanningStateLedgerEntryV1 {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: StableIdV1;
  readonly initial: number;
  readonly increased: number;
  readonly decreased: number;
  readonly remaining: number;
}

export interface ExpandedPlanPreviewV1 {
  readonly previewVersion: 1;
  readonly planId: ExpandedPlanIdV1;
  readonly target: RulesetTargetV1;
  readonly rootId: PlanRootIdV1;
  readonly exitId: StableIdV1;
  readonly status: "candidate" | "unresolved";
  readonly stepsOrder: "forward-prerequisite-first";
  readonly steps: readonly ExpandedPlanStepV1[];
  readonly unresolvedOrder: "reason-goal-path";
  readonly unresolved: readonly PlanningUnresolvedObligationV1[];
  readonly stateLedgerOrder: "axis-resource-type";
  readonly stateLedger: readonly PlanningStateLedgerEntryV1[];
}

export type PlanningDiagnosticCodeV1 =
  | "planning.cycle"
  | "planning.resource-inconsistent"
  | "planning.no-achiever"
  | "planning.unknown"
  | "planning.dynamic"
  | "planning.limit";

export interface PlanningDiagnosticV1 {
  readonly diagnosticId: PlanningDiagnosticIdV1;
  readonly code: PlanningDiagnosticCodeV1;
  readonly target: RulesetTargetV1;
  readonly rootId: PlanRootIdV1;
  readonly goalId: PlanGoalIdV1;
  readonly operatorId: StableIdV1 | null;
  readonly pathGoalIds: readonly PlanGoalIdV1[];
  readonly detail: string;
}

export interface TerminalFirstPlanningTruncationV1 {
  readonly traceTruncated: boolean;
  readonly expandedPlansTruncated: boolean;
  readonly diagnosticsOmitted: number;
}

export interface TerminalFirstPlanningResultV1 {
  readonly planningVersion: 1;
  readonly target: RulesetTargetV1;
  readonly limits: TerminalFirstPlanningLimitsV1;
  readonly graph: GoalGraphV1;
  readonly traceOrder: "regression-preorder";
  readonly trace: readonly BackwardTraceStepV1[];
  readonly expandedPlansOrder: "exit-id-plan-id";
  readonly expandedPlans: readonly ExpandedPlanPreviewV1[];
  readonly diagnosticsOrder: "code-root-goal-operator-path";
  readonly diagnostics: readonly PlanningDiagnosticV1[];
  readonly truncation: TerminalFirstPlanningTruncationV1;
}
