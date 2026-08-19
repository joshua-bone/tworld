import type {
  BlobReferenceV1,
  DirectionV1,
  PlacementIdV1,
  PlacementStratumV1,
  RulesetTargetV1,
  StableIdV1,
  WiringIdV1,
} from "../domain/artifacts/types.js";
import type {
  SolverCoordinate,
  SolverLevelGeometry,
  SolverRenderCell,
  SolverRuntimeLevelIdentity,
} from "../domain/runtime/types.js";

/** Evidence categories are closed so their human-facing labels cannot drift per dossier. */
export type P4bEvidenceBasisV1 =
  | "source-fact"
  | "static-topology"
  | "plan-intent"
  | "observed-witness";

export const P4B_EVIDENCE_BASIS_LABELS = Object.freeze({
  "source-fact": "Source fact",
  "static-topology": "Static topology",
  "plan-intent": "Plan intent",
  "observed-witness": "Observed witness",
} as const satisfies Readonly<Record<P4bEvidenceBasisV1, string>>);

export const P4B_WHOLE_LEVEL_LIMITS = Object.freeze({
  maximumDimension: 64,
  maximumCells: 4_096,
  maximumItemsPerCell: 8,
  maximumOverlays: 128,
  maximumRouteCoordinates: 4_096,
  maximumOverlayMembers: 1_024,
} as const);

interface P4bOverlayBaseV1<TKind extends string, TBasis extends P4bEvidenceBasisV1> {
  readonly overlayId: StableIdV1;
  readonly kind: TKind;
  readonly basis: TBasis;
  readonly label: string;
  readonly textEquivalent: string;
}

export interface P4bSourceStratumOverlayV1
  extends P4bOverlayBaseV1<"source-stratum", "source-fact"> {
  readonly stratum: PlacementStratumV1;
  readonly cellOrdinalsOrder: "cell-ordinal";
  readonly cellOrdinals: readonly number[];
}

export interface P4bRegionOverlayV1
  extends P4bOverlayBaseV1<"region", "static-topology"> {
  readonly regionId: StableIdV1;
  readonly cellOrdinalsOrder: "cell-ordinal";
  readonly cellOrdinals: readonly number[];
}

export interface P4bResourceSourceOverlayV1
  extends P4bOverlayBaseV1<"resource-source", "source-fact"> {
  readonly placementId: PlacementIdV1;
  readonly resourceType: StableIdV1;
  readonly amount: number;
  readonly coordinate: SolverCoordinate;
}

export type P4bResourceGateKindV1 = "consume" | "possess" | "remaining-zero";

export interface P4bResourceGateOverlayV1
  extends P4bOverlayBaseV1<"resource-gate", "source-fact"> {
  readonly placementId: PlacementIdV1;
  readonly resourceType: StableIdV1;
  readonly gateKind: P4bResourceGateKindV1;
  readonly amount: number | null;
  readonly coordinate: SolverCoordinate;
}

export interface P4bPlanIntentRouteOverlayV1
  extends P4bOverlayBaseV1<"plan-intent-route", "plan-intent"> {
  readonly routeId: StableIdV1;
  readonly coordinatesOrder: "route-order";
  readonly coordinates: readonly SolverCoordinate[];
}

export interface P4bObservedRouteOverlayV1
  extends P4bOverlayBaseV1<"observed-route", "observed-witness"> {
  readonly routeId: StableIdV1;
  readonly coordinatesOrder: "route-order";
  readonly coordinates: readonly SolverCoordinate[];
}

export interface P4bSubgoalSpanOverlayV1
  extends P4bOverlayBaseV1<"subgoal-span", "plan-intent" | "observed-witness"> {
  readonly subgoalId: StableIdV1;
  readonly subgoalOrder: number;
  readonly start: SolverCoordinate;
  readonly end: SolverCoordinate;
}

export interface P4bWiringEndpointV1 {
  readonly placementId: PlacementIdV1;
  readonly coordinate: SolverCoordinate;
}

export interface P4bWiringOverlayV1
  extends P4bOverlayBaseV1<"wiring", "source-fact"> {
  readonly wiringId: WiringIdV1;
  readonly wiringKind: StableIdV1;
  readonly source: P4bWiringEndpointV1;
  readonly target: P4bWiringEndpointV1;
  readonly claim: "declared-connection-only";
}

export interface P4bTransportMemberV1 {
  readonly placementId: PlacementIdV1;
  readonly coordinate: SolverCoordinate;
}

export interface P4bTransportOverlayV1
  extends P4bOverlayBaseV1<"transport", "source-fact"> {
  readonly networkId: StableIdV1;
  readonly transportKind: StableIdV1;
  readonly routingPolicy: StableIdV1;
  readonly membersOrder: "source-order";
  readonly members: readonly P4bTransportMemberV1[];
  readonly claim: "declared-network-membership-only";
}

export type P4bForcedMotionKindV1 = "force" | "ice";
export type P4bForcedTurnV1 = "left" | "right" | "reverse";

export interface P4bForcedSurfaceOverlayV1
  extends P4bOverlayBaseV1<"forced-surface", "source-fact"> {
  readonly placementId: PlacementIdV1;
  readonly coordinate: SolverCoordinate;
  readonly motionKind: P4bForcedMotionKindV1;
  readonly direction: DirectionV1 | null;
  readonly turn: P4bForcedTurnV1 | null;
  readonly claim: "declared-motion-semantics-only";
}

export type P4bWholeLevelOverlayV1 =
  | P4bForcedSurfaceOverlayV1
  | P4bObservedRouteOverlayV1
  | P4bPlanIntentRouteOverlayV1
  | P4bRegionOverlayV1
  | P4bResourceGateOverlayV1
  | P4bResourceSourceOverlayV1
  | P4bSourceStratumOverlayV1
  | P4bSubgoalSpanOverlayV1
  | P4bTransportOverlayV1
  | P4bWiringOverlayV1;

export interface P4bWholeLevelBindingsV1 {
  readonly levelFactsContent: BlobReferenceV1;
  readonly sceneContent: BlobReferenceV1;
  readonly staticAnalysisContent: BlobReferenceV1 | null;
  readonly planContent: BlobReferenceV1 | null;
  readonly witnessContent: BlobReferenceV1 | null;
}

export interface P4bWholeLevelViewV1 {
  readonly viewType: "p4b-whole-level-view";
  readonly viewVersion: 1;
  readonly viewId: StableIdV1;
  readonly caseId: StableIdV1;
  readonly title: string;
  readonly target: RulesetTargetV1;
  readonly level: SolverRuntimeLevelIdentity;
  readonly geometry: SolverLevelGeometry;
  readonly bindings: P4bWholeLevelBindingsV1;
  readonly cellsOrder: "z-y-x";
  readonly cells: readonly SolverRenderCell[];
  readonly overlaysOrder: "basis-kind-id";
  readonly overlays: readonly P4bWholeLevelOverlayV1[];
  readonly accessibleText: string;
  readonly correctness: {
    readonly suppliedCellsAreAuthoritative: true;
    readonly rendererInventsNoTiles: true;
    readonly overlaysDoNotEstablishCausality: true;
  };
}

export type P4bWholeLevelErrorCodeV1 = "p4b.invalid-view";

export class P4bWholeLevelError extends Error {
  override readonly name = "P4bWholeLevelError";

  constructor(
    readonly code: P4bWholeLevelErrorCodeV1,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
