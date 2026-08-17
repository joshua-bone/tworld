import type {
  ActorIdV1,
  ArtifactReferenceV1,
  BlobReferenceV1,
  CoordinateV1,
  DirectionV1,
  LevelFactsV1,
  LevelGeometryV1,
  LevelIdentityV1,
  PlacementIdV1,
  RevisionIdV1,
  RulesetTargetV1,
  Sha256DigestV1,
  StableIdV1,
} from "../domain/artifacts/types.js";

/**
 * Target policy evidence is deliberately separate from LevelFactsV1. Level
 * facts preserve what the source declared; this value records what one exact
 * ruleset policy concludes about traversing every logical cell.
 */
export type StaticTraversalClassV1 =
  | "open"
  | "blocked"
  | "conditional"
  | "dynamic"
  | "unknown";

export type StaticTopologySourcePlaneV1 = "lower" | "upper" | "implicit";

export type StaticTopologyCaveatKindV1 =
  | "resource-gate"
  | "hazard"
  | "requires-release"
  | "actor-occupancy"
  | "target-policy"
  | "unknown-policy"
  | "state-dependent";

export type StaticTopologyOccupancyKindV1 =
  | "none"
  | "player-start"
  | "pushable"
  | "autonomous"
  | "contained";

export interface StaticTopologyPolicyV1 {
  readonly policyId: StableIdV1;
  readonly policyRevision: RevisionIdV1;
}

export interface StaticTopologySupportingPlacementV1 {
  readonly placementId: PlacementIdV1;
  readonly sourcePlane: StaticTopologySourcePlaneV1;
}

export interface StaticTopologyCaveatV1 {
  readonly caveatId: StableIdV1;
  readonly kind: StaticTopologyCaveatKindV1;
  readonly placementId: PlacementIdV1 | null;
}

export interface StaticTopologyOccupancyV1 {
  readonly kind: StaticTopologyOccupancyKindV1;
  readonly placementId: PlacementIdV1 | null;
  readonly actorId: ActorIdV1 | null;
}

export interface StaticTopologyCellEvidenceV1 {
  readonly coordinate: CoordinateV1;
  readonly effective: StaticTopologySupportingPlacementV1 | null;
  /**
   * Every other LevelFacts placement at this coordinate. Together with
   * `effective`, this is an exact, disjoint partition of the cell placements.
   */
  readonly supporting: readonly StaticTopologySupportingPlacementV1[];
  /** Movement headings permitted while entering this cell. */
  readonly entryDirections: readonly DirectionV1[];
  /** Movement headings permitted while leaving this cell. */
  readonly exitDirections: readonly DirectionV1[];
  readonly classification: StaticTraversalClassV1;
  readonly caveats: readonly StaticTopologyCaveatV1[];
  readonly occupant: StaticTopologyOccupancyV1;
}

/** A canonical-JSON-safe, target-specific analysis input (not an artifact envelope). */
export interface StaticTopologyEvidenceV1 {
  readonly evidenceVersion: 1;
  readonly target: RulesetTargetV1;
  readonly levelFacts: ArtifactReferenceV1<"level-facts", 1>;
  readonly level: LevelIdentityV1;
  readonly geometry: LevelGeometryV1;
  readonly policy: StaticTopologyPolicyV1;
  readonly cells: readonly StaticTopologyCellEvidenceV1[];
}

export interface AnalyzeStaticTopologyInputV1 {
  readonly levelFacts: LevelFactsV1;
  /** Digest computed from the exact canonical LevelFactsV1 bytes supplied here. */
  readonly levelFactsDigest: Sha256DigestV1;
  readonly evidence: StaticTopologyEvidenceV1;
  /** Digest and byte length of the exact canonical topology-evidence JSON. */
  readonly topologyEvidence: BlobReferenceV1;
  readonly analyzerRevision: RevisionIdV1;
}

export type StaticRegionIdV1 = `region:${number}`;

export interface StaticDirectedAdjacencyV1 {
  readonly fromCellOrdinal: number;
  readonly toCellOrdinal: number;
  readonly direction: DirectionV1;
}

export interface StaticWeakRegionV1 {
  readonly regionId: StaticRegionIdV1;
  readonly minimumCellOrdinal: number;
  readonly cellOrdinals: readonly number[];
}

export interface StaticArticulationPointV1 {
  readonly cellOrdinal: number;
  readonly coordinate: CoordinateV1;
  readonly regionId: StaticRegionIdV1;
}

export interface StaticBoundaryV1 {
  readonly boundaryId: `boundary:${number}`;
  readonly kind: Exclude<StaticTraversalClassV1, "open" | "blocked">;
  readonly cellOrdinal: number;
  readonly coordinate: CoordinateV1;
  readonly effectivePlacementId: PlacementIdV1 | null;
  readonly incomingRegionIds: readonly StaticRegionIdV1[];
  readonly outgoingRegionIds: readonly StaticRegionIdV1[];
  readonly caveats: readonly StaticTopologyCaveatV1[];
  readonly occupant: StaticTopologyOccupancyV1;
}

export interface StaticRegionAttachmentV1 {
  readonly cellOrdinal: number;
  readonly coordinate: CoordinateV1;
  readonly regionIds: readonly StaticRegionIdV1[];
}

export interface StaticResourceCandidateSourceV1 extends StaticRegionAttachmentV1 {
  readonly placementId: PlacementIdV1;
  readonly amount: number;
}

export interface StaticResourceDependencyV1 extends StaticRegionAttachmentV1 {
  readonly gatePlacementId: PlacementIdV1;
  readonly gateKind: "consume" | "possess" | "remaining-zero";
  readonly resourceType: StableIdV1;
  readonly amount: number | null;
  readonly candidateSources: readonly StaticResourceCandidateSourceV1[];
}

export interface StaticTransportIncidenceV1 extends StaticRegionAttachmentV1 {
  readonly memberOrder: number;
  readonly placementId: PlacementIdV1;
}

export interface StaticTransportNetworkV1 {
  readonly networkId: StableIdV1;
  readonly kind: StableIdV1;
  readonly routingPolicy: StableIdV1;
  /** Member order is copied exactly because it can define target routing. */
  readonly members: readonly StaticTransportIncidenceV1[];
}

export interface StaticForcedSurfaceAttachmentV1 extends StaticRegionAttachmentV1 {
  readonly placementId: PlacementIdV1;
  readonly motion: "force" | "ice";
  readonly direction: DirectionV1 | null;
  readonly turn: "left" | "right" | "reverse" | null;
}

export interface StaticHazardAttachmentV1 extends StaticRegionAttachmentV1 {
  readonly placementId: PlacementIdV1;
  readonly hazardType: StableIdV1;
  readonly persistence: "persistent" | "single-use";
  readonly protectionResources: readonly StableIdV1[];
}

export interface StaticExitAttachmentV1 extends StaticRegionAttachmentV1 {
  readonly placementId: PlacementIdV1;
}

export interface StaticAnalysisAttachmentsV1 {
  readonly forcedSurfaces: readonly StaticForcedSurfaceAttachmentV1[];
  readonly hazards: readonly StaticHazardAttachmentV1[];
  readonly exits: readonly StaticExitAttachmentV1[];
}

export interface StaticAnalysisUncertaintyV1 {
  readonly uncertaintyId: StableIdV1;
  readonly kind: "unknown-traversal" | "unknown-static-fact";
  readonly sourceKind: StableIdV1 | null;
  readonly placementId: PlacementIdV1 | null;
  readonly cellOrdinals: readonly number[];
  readonly detail: string;
}

/** All metrics are exact integer counts, never heuristic scores. */
export interface StaticAnalysisFeaturesV1 {
  readonly logicalCellCount: number;
  readonly certainOpenCellCount: number;
  readonly blockedCellCount: number;
  readonly conditionalBoundaryCount: number;
  readonly dynamicBoundaryCount: number;
  readonly unknownBoundaryCount: number;
  readonly directedAdjacencyCount: number;
  readonly weakConnectionCount: number;
  readonly bidirectionalConnectionCount: number;
  readonly oneWayConnectionCount: number;
  readonly weakRegionCount: number;
  readonly articulationPointCount: number;
  readonly resourceGateCount: number;
  readonly resourceCandidateSourceCount: number;
  readonly transportNetworkCount: number;
  readonly transportIncidenceCount: number;
  readonly forcedSurfaceCount: number;
  readonly hazardCount: number;
  readonly exitCount: number;
  readonly uncertaintyCount: number;
}

/** A canonical-JSON-safe derived value (not an artifact envelope). */
export interface StaticAnalysisV1 {
  readonly analysisVersion: 1;
  readonly analyzer: {
    readonly analyzerId: "ccsolver-static-topology-analyzer";
    readonly analyzerRevision: RevisionIdV1;
    readonly analysisProfile: "ccsolver-static-topology-v1";
  };
  readonly target: RulesetTargetV1;
  readonly levelFacts: ArtifactReferenceV1<"level-facts", 1>;
  readonly level: LevelIdentityV1;
  readonly geometry: LevelGeometryV1;
  readonly topologyPolicy: StaticTopologyPolicyV1;
  readonly topologyEvidence: BlobReferenceV1;
  readonly directedAdjacency: readonly StaticDirectedAdjacencyV1[];
  readonly regions: readonly StaticWeakRegionV1[];
  readonly articulationPoints: readonly StaticArticulationPointV1[];
  readonly boundaries: readonly StaticBoundaryV1[];
  readonly resourceDependencies: readonly StaticResourceDependencyV1[];
  readonly transports: readonly StaticTransportNetworkV1[];
  readonly attachments: StaticAnalysisAttachmentsV1;
  readonly uncertainties: readonly StaticAnalysisUncertaintyV1[];
  readonly features: StaticAnalysisFeaturesV1;
}
