export type P7bReplayVariantId = "raw-ms" | "raw-lynx" | "portable";
export type P7bExecutionTargetId = "ms" | "lynx";

export type P7bReplaySelection = {
  readonly executionTarget: P7bExecutionTargetId;
  readonly variant: P7bReplayVariantId;
};

export type P7bReplayVariantPresentation = {
  readonly id: P7bReplayVariantId;
  readonly label: string;
  readonly description: string;
  readonly segments: readonly P7bSemanticSegmentPresentation[];
};

export type P7bExecutionTargetPresentation = {
  readonly id: P7bExecutionTargetId;
  readonly label: string;
};

export type P7bSemanticSegmentPresentation = {
  readonly id: string;
  readonly ordinal: number;
  readonly title: string;
};

export type P7bReplaySegmentSpan = {
  readonly segmentId: string;
  readonly startNativeTick: number;
  readonly endNativeTick: number;
  readonly startDecisionOrdinal?: number;
  readonly endDecisionOrdinal?: number;
};

export type P7bReplayDecisionProfile = {
  readonly profileId: string;
  readonly clockBasis: "native-tick" | "portable-decision";
  readonly cadenceHz: number;
};

export type P7bReplayContentReference = {
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
};

export type P7bAvailableReplayCombination = P7bReplaySelection & {
  readonly availability: "available";
  readonly transport: "native-replay-pulses" | "manual-held-schedule";
  readonly replayHref: string;
  readonly replayContent: P7bReplayContentReference;
  readonly certificationHref?: string;
  readonly provenanceLabel: string;
  readonly decisionProfile: P7bReplayDecisionProfile;
  readonly nativeTickRateHz: number;
  readonly nativeBoundaryClock: "exclusive-advance-count-v1";
  readonly terminalNativeTick: number;
  readonly authoredDecisionCount: number;
  readonly executedDecisionCount: number;
  readonly segmentSpans: readonly P7bReplaySegmentSpan[];
};

export type P7bUnavailableReplayCombination = P7bReplaySelection & {
  readonly availability: "unavailable";
  readonly certificationStatus: "failed" | "not-attempted" | "unavailable";
  readonly reason: string;
};

export type P7bReplayCombination =
  | P7bAvailableReplayCombination
  | P7bUnavailableReplayCombination;

export type P7bLevelReplayPresentation = {
  readonly packId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly sourceHref: string;
  readonly levelManifestHref: string;
  readonly playerModuleHref: string;
  readonly initialSelection: P7bReplaySelection;
  readonly variants: readonly P7bReplayVariantPresentation[];
  readonly executionTargets: readonly P7bExecutionTargetPresentation[];
  readonly combinations: readonly P7bReplayCombination[];
};

export type P7bPackLevelStatus = "complete" | "processing" | "blocked" | "unprocessed";

export type P7bPackLevelPresentation = {
  readonly levelNumber: number;
  readonly title: string;
  readonly href: string;
  readonly status: P7bPackLevelStatus;
  readonly processedTargetCount: number;
  readonly totalTargetCount: number;
};

export type P7bPackPresentation = {
  readonly packId: string;
  readonly title: string;
  readonly expectedLevelCount: number;
  readonly levels: readonly P7bPackLevelPresentation[];
};
