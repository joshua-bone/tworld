import type { RulesetTargetV1, StableIdV1 } from "../domain/artifacts/types.js";
import type {
  SolverCausalEventPageV1,
  SolverCausalEventV1,
} from "../events/index.js";

/** P6A values are deterministic preview DTOs, not durable root artifacts. */
export type SemanticAnchorStrengthV1 = "hard" | "medium" | "soft";

/**
 * Alignment accepts only a complete first-page drain. This keeps P6A from
 * silently interpreting a paginated suffix or an overflowed journal as a run.
 */
export type SemanticEventTraceV1 = SolverCausalEventPageV1;

export interface SemanticEventAlignmentLimitsV1 {
  /** Maximum events accepted on either side; implementation maximum 4,096. */
  readonly maxEventsPerTrace: number;
  /** Maximum dynamic-programming cells; implementation maximum 4,000,000. */
  readonly maxMatrixCells: number;
  /** Maximum movement events folded into one side of a 1:N span (8). */
  readonly maxMovementSpan: number;
}

export interface AlignSemanticEventsInputV1 {
  readonly alignmentVersion: 1;
  readonly left: SemanticEventTraceV1;
  readonly right: SemanticEventTraceV1;
  readonly limits?: Partial<SemanticEventAlignmentLimitsV1>;
}

export interface AlignedSemanticEventRefV1 {
  readonly target: RulesetTargetV1;
  readonly sequence: number;
  readonly occurrenceOrdinal: number;
  readonly kind: SolverCausalEventV1["kind"];
  readonly anchorStrength: SemanticAnchorStrengthV1;
}

export type SemanticMatchCardinalityV1 =
  | "one-to-one"
  | "one-to-many"
  | "many-to-one";

export interface MatchedSemanticSpanV1 {
  readonly spanKind: "matched";
  readonly spanOrder: number;
  readonly cardinality: SemanticMatchCardinalityV1;
  readonly anchorStrength: SemanticAnchorStrengthV1;
  readonly score: number;
  readonly left: readonly AlignedSemanticEventRefV1[];
  readonly right: readonly AlignedSemanticEventRefV1[];
  readonly basis: readonly (
    | "stable-semantic-identity"
    | "semantic-effect"
    | "causal-context"
    | "occurrence-order"
    | "movement-envelope"
  )[];
}

export interface UnmatchedSemanticSpanV1 {
  readonly spanKind: "unmatched";
  readonly spanOrder: number;
  readonly side: "left" | "right";
  readonly strongestAnchor: SemanticAnchorStrengthV1;
  readonly events: readonly AlignedSemanticEventRefV1[];
  readonly reason: "no-compatible-semantic-anchor";
}

export type SemanticDivergenceReasonV1 =
  | "causal-parent-mismatch"
  | "plan-identity-mismatch"
  | "semantic-effect-mismatch"
  | "occurrence-ordinal-mismatch";

export interface DivergentSemanticSpanV1 {
  readonly spanKind: "divergent";
  readonly spanOrder: number;
  readonly anchorStrength: SemanticAnchorStrengthV1;
  readonly left: readonly AlignedSemanticEventRefV1[];
  readonly right: readonly AlignedSemanticEventRefV1[];
  readonly reason: SemanticDivergenceReasonV1;
}

export type SemanticAlignmentSpanV1 =
  | MatchedSemanticSpanV1
  | UnmatchedSemanticSpanV1
  | DivergentSemanticSpanV1;

export interface SemanticEventAlignmentSummaryV1 {
  readonly matchedSpans: number;
  readonly oneToManySpans: number;
  readonly unmatchedLeftEvents: number;
  readonly unmatchedRightEvents: number;
  readonly divergentSpans: number;
  readonly matchedHardAnchors: number;
  readonly unmatchedHardAnchors: number;
  readonly divergentHardAnchors: number;
  readonly terminalAnchorsMatched: boolean;
}

export interface SemanticEventAlignmentV1 {
  readonly alignmentVersion: 1;
  readonly leftTarget: RulesetTargetV1;
  readonly rightTarget: RulesetTargetV1;
  readonly spanOrder: "semantic-sequence";
  readonly spans: readonly SemanticAlignmentSpanV1[];
  readonly score: number;
  readonly summary: SemanticEventAlignmentSummaryV1;
  readonly limits: SemanticEventAlignmentLimitsV1;
}

export type StrategyPlanShapeV1 =
  | "shared-plan"
  | "parallel-implementation"
  | "alternative-branch"
  | "different-plan";

export type StrategyResolutionV1 =
  | "proposed"
  | "partially-verified"
  | "verified"
  | "unresolved"
  | "unsupported";

export interface StrategyDependencyV1 {
  readonly dependencyId: StableIdV1;
  readonly kind: "mechanic" | "ruleset-quirk" | "timing" | "randomness";
  readonly targetRulesets: readonly RulesetTargetV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

export interface StrategyTargetEvidenceV1 {
  readonly target: RulesetTargetV1;
  readonly traceEvidenceId: StableIdV1;
  readonly terminalReached: boolean;
}

export interface StrategyFamilyV1 {
  readonly familyId: StableIdV1;
  readonly title: string;
  readonly planShape: StrategyPlanShapeV1;
  readonly targetRulesets: readonly RulesetTargetV1[];
  readonly targetEvidence: readonly StrategyTargetEvidenceV1[];
  readonly dependencies: readonly StrategyDependencyV1[];
  readonly resolution: StrategyResolutionV1;
  readonly resolutionReason:
    | "aligned-causal-terminals"
    | "aligned-semantic-terminals-with-limited-causal-authority"
    | "localized-target-implementation"
    | "divergent-span-with-rejoin"
    | "causal-plan-disagreement"
    | "insufficient-terminal-evidence";
  readonly alignment: SemanticEventAlignmentV1;
}

export interface StrategyPortfolioV1 {
  readonly portfolioVersion: 1;
  readonly portfolioId: StableIdV1;
  readonly familiesOrder: "family-id";
  readonly families: readonly StrategyFamilyV1[];
  readonly preferredFamilyId: StableIdV1 | null;
}

export interface BuildStrategyPortfolioInputV1 {
  readonly portfolioVersion: 1;
  readonly portfolioId: StableIdV1;
  readonly familyId: StableIdV1;
  readonly title: string;
  readonly alignment: SemanticEventAlignmentV1;
  readonly traceEvidence: Readonly<Record<RulesetTargetV1, StableIdV1>>;
  readonly dependencies?: readonly StrategyDependencyV1[];
}
