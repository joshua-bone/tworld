import type {
  ActorIdV1,
  BlobReferenceV1,
  PlacementIdV1,
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";
import type {
  SolverCoordinate,
  SolverRenderCell,
  SolverResolvedRenderRegion,
  SolverRuntimeLevelIdentity,
} from "../domain/runtime/types.js";
import type { ContextualWitnessFailureV1 } from "../snippets/model.js";

export type SubgoalEvidenceBasisV1 =
  | "regressed-requirement"
  | "backward-candidate"
  | "plan-intent"
  | "observed-witness"
  | "donor-evidence";

export type SubgoalPointOfInterestRoleV1 =
  | "route-start"
  | "route-end"
  | "selected-target"
  | "retained-alternative"
  | "later-gate"
  | "changed-cell"
  | "failure-site";

interface SubgoalEvidenceOverlayBaseV1 {
  readonly overlayId: StableIdV1;
  readonly basis: SubgoalEvidenceBasisV1;
  readonly target: RulesetTargetV1;
  readonly label: string;
  readonly textEquivalent: string;
}

export interface SubgoalRouteOverlayV1 extends SubgoalEvidenceOverlayBaseV1 {
  readonly kind: "route";
  readonly coordinates: readonly SolverCoordinate[];
  readonly actorId: ActorIdV1 | null;
}

export interface SubgoalPointOfInterestOverlayV1 extends SubgoalEvidenceOverlayBaseV1 {
  readonly kind: "point-of-interest";
  readonly coordinate: SolverCoordinate;
  readonly role: SubgoalPointOfInterestRoleV1;
  readonly placementId: PlacementIdV1 | null;
}

export interface SubgoalStateChangeOverlayV1 extends SubgoalEvidenceOverlayBaseV1 {
  readonly kind: "state-change";
  readonly basis: "observed-witness";
  readonly coordinate: SolverCoordinate;
  readonly beforeSemanticTypes: readonly StableIdV1[];
  readonly afterSemanticTypes: readonly StableIdV1[];
}

export type SubgoalEvidenceOverlayV1 =
  | SubgoalRouteOverlayV1
  | SubgoalPointOfInterestOverlayV1
  | SubgoalStateChangeOverlayV1;

export interface SubgoalEvidenceMetricV1 {
  readonly metricId: StableIdV1;
  readonly label: string;
  readonly value: string;
}

export interface SubgoalEvidenceSceneV1 {
  readonly region: SolverResolvedRenderRegion;
  readonly cellsOrder: "z-y-x";
  readonly cells: readonly SolverRenderCell[];
}

export interface ObservedSubgoalPanelBindingV1 {
  readonly kind: "observed";
  readonly nativeTick: number;
  readonly exactFingerprint: StableIdV1;
  readonly observationContent: BlobReferenceV1;
  readonly renderContent: BlobReferenceV1;
}

export interface ExpectedSubgoalPanelBindingV1 {
  readonly kind: "expected";
  readonly contractContent: BlobReferenceV1;
  readonly predicateIdsOrder: "predicate-id";
  readonly predicateIds: readonly StableIdV1[];
}

export type SubgoalPanelBindingV1 =
  | ObservedSubgoalPanelBindingV1
  | ExpectedSubgoalPanelBindingV1;

interface SubgoalEvidencePanelBaseV1 {
  readonly panelId: StableIdV1;
  readonly title: string;
  readonly scene: SubgoalEvidenceSceneV1;
  /** Subset order inherited from the view's canonical basis-kind-id overlay order. */
  readonly overlayIdsOrder: "basis-kind-id";
  readonly overlayIds: readonly StableIdV1[];
  readonly metricsOrder: "metric-id";
  readonly metrics: readonly SubgoalEvidenceMetricV1[];
  readonly accessibleText: string;
}

export interface StartingSubgoalEvidencePanelV1 extends SubgoalEvidencePanelBaseV1 {
  readonly panelKind: "starting-state";
  readonly binding: ObservedSubgoalPanelBindingV1;
}

export interface EndingSubgoalEvidencePanelV1 extends SubgoalEvidencePanelBaseV1 {
  readonly panelKind: "ending-state";
  readonly binding: ObservedSubgoalPanelBindingV1;
}

export interface IntendedEndingSubgoalEvidencePanelV1 extends SubgoalEvidencePanelBaseV1 {
  readonly panelKind: "intended-ending";
  readonly binding: ExpectedSubgoalPanelBindingV1;
}

export interface ActualFailureSubgoalEvidencePanelV1 extends SubgoalEvidencePanelBaseV1 {
  readonly panelKind: "actual-failure";
  readonly binding: ObservedSubgoalPanelBindingV1;
}

export type SubgoalEvidencePanelV1 =
  | StartingSubgoalEvidencePanelV1
  | EndingSubgoalEvidencePanelV1
  | IntendedEndingSubgoalEvidencePanelV1
  | ActualFailureSubgoalEvidencePanelV1;

export type SubgoalEvidenceEndingV1 =
  | {
      readonly kind: "verified";
      readonly observed: EndingSubgoalEvidencePanelV1;
    }
  | {
      readonly kind: "failed";
      readonly expected: IntendedEndingSubgoalEvidencePanelV1;
      readonly actual: ActualFailureSubgoalEvidencePanelV1;
      readonly firstFailure: ContextualWitnessFailureV1;
    };

export interface SubgoalEvidenceMotionRecommendationV1 {
  readonly kind: "recommended" | "not-recommended";
  readonly reason: string;
}

export interface SubgoalEvidenceViewV1 {
  readonly viewType: "subgoal-evidence-view";
  readonly viewVersion: 1;
  readonly viewId: StableIdV1;
  readonly caseId: StableIdV1;
  readonly target: RulesetTargetV1;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: BlobReferenceV1;
  readonly plan: BlobReferenceV1;
  readonly contract: BlobReferenceV1;
  readonly witness: BlobReferenceV1;
  readonly subgoal: {
    readonly subgoalId: StableIdV1;
    readonly title: string;
    readonly description: string;
  };
  readonly renderer: {
    readonly rendererId: StableIdV1;
    readonly rendererRevision: string;
  };
  readonly viewport: SolverResolvedRenderRegion;
  readonly overlaysOrder: "basis-kind-id";
  readonly overlays: readonly SubgoalEvidenceOverlayV1[];
  readonly starting: StartingSubgoalEvidencePanelV1;
  readonly ending: SubgoalEvidenceEndingV1;
  readonly correctness: {
    readonly fullWorldWitnessIsAuthority: true;
    readonly croppedPanelsAreReviewOnly: true;
  };
  readonly motion: SubgoalEvidenceMotionRecommendationV1 | null;
}

export type SubgoalEvidencePanelSelectionV1 =
  | "starting"
  | "ending"
  | "expected-ending"
  | "actual-failure";

export type SubgoalEvidenceErrorCodeV1 =
  | "evidence.invalid-view"
  | "evidence.invalid-panel-selection";

export class SubgoalEvidenceError extends Error {
  override readonly name = "SubgoalEvidenceError";

  constructor(
    readonly code: SubgoalEvidenceErrorCodeV1,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}
