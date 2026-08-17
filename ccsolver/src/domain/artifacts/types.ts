export type StableIdV1 = string;
export type RevisionIdV1 = string;
export type Sha256DigestV1 = `sha256:${string}`;
export type PlacementIdV1 = `placement:sha256:${string}`;
export type ActorIdV1 = `actor:sha256:${string}`;

export type UInt16V1 = number;
export type UInt32V1 = number;
export type PositiveUInt32V1 = number;
export type NonnegativeSafeIntegerV1 = number;

export type RulesetTargetV1 = "ms" | "lynx";

export interface ArtifactReferenceV1<
  TArtifactType extends string = string,
  TSchemaVersion extends number = number,
> {
  readonly protocolVersion: 1;
  readonly artifactType: TArtifactType;
  readonly schemaVersion: TSchemaVersion;
  readonly digest: Sha256DigestV1;
}

export interface BlobReferenceV1 {
  readonly digest: Sha256DigestV1;
  readonly byteLength: NonnegativeSafeIntegerV1;
}

export interface ReplayReferenceV1 {
  readonly format: "tws";
  readonly content: BlobReferenceV1;
}

export interface LevelIdentityV1 {
  readonly occurrenceId: StableIdV1;
  readonly normalizationProfile: StableIdV1;
  readonly normalizedGameplayDigest: Sha256DigestV1;
}

export interface CoordinateV1 {
  readonly x: UInt16V1;
  readonly y: UInt16V1;
  readonly z: UInt16V1;
}

export type PlacementStratumV1 = "terrain" | "overlay" | "pickup" | "actor" | "side";

export interface StaticPlacementDescriptorV1 {
  readonly identityType: "static-placement";
  readonly identityVersion: 1;
  readonly levelDigest: Sha256DigestV1;
  readonly coordinate: CoordinateV1;
  readonly stratum: PlacementStratumV1;
  readonly semanticType: StableIdV1;
  readonly discriminator: UInt16V1;
}

export interface InitialActorIdentityDescriptorV1 {
  readonly identityType: "actor";
  readonly identityVersion: 1;
  readonly kind: "initial";
  readonly placementId: PlacementIdV1;
  readonly sourceActorOrder: UInt16V1;
}

export interface CloneActorIdentityDescriptorV1 {
  readonly identityType: "actor";
  readonly identityVersion: 1;
  readonly kind: "clone";
  readonly parentActorId: ActorIdV1;
  readonly sourcePlacementId: PlacementIdV1;
  readonly cloneOrdinal: PositiveUInt32V1;
}

export type ActorIdentityDescriptorV1 = InitialActorIdentityDescriptorV1 | CloneActorIdentityDescriptorV1;

export interface PlanReferenceV1 {
  readonly artifact: ArtifactReferenceV1<"expanded-plan">;
  readonly goalId: StableIdV1 | null;
  readonly subgoalId: StableIdV1 | null;
}

export type DonorAvailabilityV1 = "paired" | "single-ruleset" | "none";
export type DonorExposureV1 = "blind" | "terminal-only" | "semantic-guided" | "full-input";
export type ConstructionMethodV1 =
  | "from-scratch"
  | "tactic-composed"
  | "semantic-guided"
  | "input-translated"
  | "manual-assisted";

export interface AttemptContextV1 {
  readonly donorAvailability: DonorAvailabilityV1;
  readonly donorExposure: DonorExposureV1;
  readonly constructionMethod: ConstructionMethodV1;
  readonly evaluationCohort: StableIdV1 | null;
  readonly budgetRevision: RevisionIdV1;
  readonly solverRevision: RevisionIdV1;
  readonly searchSeed: UInt32V1 | null;
}

export type AttemptFailureCategoryV1 =
  | "import"
  | "runtime-oracle"
  | "observation"
  | "decomposition"
  | "local-repair-exhausted"
  | "route-replan-exhausted"
  | "ruleset-divergence"
  | "fixture"
  | "reviewed-nonportable"
  | "cancelled";

export interface CandidateGeneratedAttemptResultV1 {
  readonly kind: "candidate-generated";
  readonly replay: ReplayReferenceV1;
}

export interface CertifiedAttemptResultV1 {
  readonly kind: "certified";
  readonly replay: ReplayReferenceV1;
  readonly certificate: ArtifactReferenceV1<"replay-certificate", 1>;
}

export interface FailedAttemptResultV1 {
  readonly kind: "failed";
  readonly category: AttemptFailureCategoryV1;
  readonly evidence: readonly ArtifactReferenceV1[];
  readonly nextAction: string;
}

export type AttemptResultV1 =
  | CandidateGeneratedAttemptResultV1
  | CertifiedAttemptResultV1
  | FailedAttemptResultV1;

export interface AttemptV1 {
  readonly attemptId: StableIdV1;
  readonly sequence: PositiveUInt32V1;
  readonly context: AttemptContextV1;
  readonly plan: PlanReferenceV1 | null;
  readonly result: AttemptResultV1;
}

export type CorpusTargetStateV1 =
  | { readonly status: "awaiting-import" }
  | {
      readonly status: "import-blocked";
      readonly reason: string;
      readonly evidence: readonly ArtifactReferenceV1[];
    }
  | { readonly status: "ready" }
  | {
      readonly status: "analyzed";
      readonly levelFacts: ArtifactReferenceV1<"level-facts">;
    }
  | { readonly status: "candidate-generated"; readonly attemptId: StableIdV1 }
  | { readonly status: "needs-local-repair"; readonly attemptId: StableIdV1 }
  | { readonly status: "needs-route-replan"; readonly attemptId: StableIdV1 }
  | { readonly status: "solved-current"; readonly attemptId: StableIdV1 }
  | {
      readonly status: "needs-reverify";
      readonly attemptId: StableIdV1;
      readonly reason: string;
    }
  | {
      readonly status: "excluded-reviewed";
      readonly reason: string;
      readonly evidence: readonly ArtifactReferenceV1[];
      readonly reviewRevision: RevisionIdV1;
    };

export interface CorpusTargetV1 {
  readonly target: RulesetTargetV1;
  readonly attempts: readonly AttemptV1[];
  readonly state: CorpusTargetStateV1;
}

export interface CorpusCasePayloadV1 {
  readonly caseId: StableIdV1;
  readonly producerRevision: RevisionIdV1;
  readonly previous: ArtifactReferenceV1<"corpus-case", 1> | null;
  readonly level: LevelIdentityV1;
  readonly targets: readonly CorpusTargetV1[];
}

export interface CorpusCaseV1 {
  readonly protocol: "ccsolver-artifact";
  readonly protocolVersion: 1;
  readonly artifactType: "corpus-case";
  readonly schemaVersion: 1;
  readonly payload: CorpusCasePayloadV1;
}

export interface ReplayVerificationV1 {
  readonly toolRevision: RevisionIdV1;
  readonly result: "win";
  readonly terminalTick: UInt32V1;
}

export interface ReplayCertificatePayloadV1 {
  readonly caseId: StableIdV1;
  readonly producerRevision: RevisionIdV1;
  readonly level: LevelIdentityV1;
  readonly target: RulesetTargetV1;
  readonly attemptId: StableIdV1;
  readonly replay: ReplayReferenceV1;
  readonly plan: PlanReferenceV1 | null;
  readonly verifications: {
    readonly typescript: ReplayVerificationV1;
    readonly nativeOracle: ReplayVerificationV1;
  };
  readonly lineage: readonly ArtifactReferenceV1[];
}

export interface ReplayCertificateV1 {
  readonly protocol: "ccsolver-artifact";
  readonly protocolVersion: 1;
  readonly artifactType: "replay-certificate";
  readonly schemaVersion: 1;
  readonly payload: ReplayCertificatePayloadV1;
}

export type ArtifactV1 = CorpusCaseV1 | ReplayCertificateV1;
