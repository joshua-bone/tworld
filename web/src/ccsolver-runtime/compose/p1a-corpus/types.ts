import type { Sha256Port } from "@tworld/ccsolver/ports";

export type CorpusTarget = "ms" | "lynx";

export interface CorpusTargetSourceSpec {
  readonly target: CorpusTarget;
  readonly seriesConfigPath: string | null;
  readonly donorPath: string | null;
  readonly donorSetName: string | null;
}

export interface CorpusPackSpec {
  readonly packId: string;
  readonly displayName: string;
  readonly mapPath: string;
  readonly targets: readonly [CorpusTargetSourceSpec, CorpusTargetSourceSpec];
}

export interface PinnedSourceFile {
  readonly byteLength: number;
  readonly sha256: string;
}

export interface CorpusSourcePort {
  readBytes(path: string): Promise<Uint8Array>;
}

export interface BuildPinnedCorpusManifestInput {
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
}

export interface CorpusSourceReferenceV1 extends PinnedSourceFile {
  readonly path: string;
}

export interface CorpusSourceMemberReferenceV1 {
  readonly ordinal: number;
  readonly sourceLevelNumber: number;
  readonly sourcePath: string;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface NormalizedGameplayReferenceV1 {
  readonly status: "available";
  readonly profile: "tworld-legacy-dat-gameplay-v1";
  readonly sha256: string;
}

export interface CorpusDonorReferenceV1 {
  readonly sourcePath: string;
  readonly entryOrdinal: number;
  readonly sourceLevelNumber: number;
  readonly password: string;
  readonly bestTimeTicks: number;
  readonly entryByteLength: number;
  readonly entrySha256: string;
  readonly flags: number;
  readonly randomSlideDirection: number;
  readonly stepping: number;
  readonly randomSeed: number;
  readonly moveCount: number;
  readonly containsDiagonalInput: boolean;
  readonly containsMouseInput: boolean;
}

export interface CorpusTargetRecordV1 {
  readonly target: CorpusTarget;
  readonly seriesConfigPath: string | null;
  readonly donor: CorpusDonorReferenceV1 | null;
}

export interface CorpusMapCaseV1 {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly packId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly author: string;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly normalizedGameplayReference: NormalizedGameplayReferenceV1;
  readonly targets: readonly [CorpusTargetRecordV1, CorpusTargetRecordV1];
}

export interface CorpusManifestPackV1 {
  readonly packId: string;
  readonly displayName: string;
  readonly mapPath: string;
  readonly logicalMapCount: number;
  readonly targets: readonly [CorpusTargetSourceSpec, CorpusTargetSourceSpec];
}

export interface CorpusManifestSummaryV1 {
  readonly packCount: number;
  readonly mapCaseCount: number;
  readonly targetRecordCount: number;
  readonly donorBackedTargetRecordCount: number;
  readonly pairedDonorCaseCount: number;
  readonly msOnlyDonorCaseCount: number;
  readonly lynxOnlyDonorCaseCount: number;
  readonly noDonorCaseCount: number;
}

export interface CorpusManifestV1 {
  readonly artifact: "ccsolver-corpus-manifest";
  readonly version: 1;
  readonly source: {
    readonly repository: "joshua-bone/tworld";
    readonly revision: string;
  };
  readonly sources: readonly CorpusSourceReferenceV1[];
  readonly packs: readonly CorpusManifestPackV1[];
  readonly cases: readonly CorpusMapCaseV1[];
  readonly summary: CorpusManifestSummaryV1;
}
