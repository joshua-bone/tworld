import {
  identifyBytes,
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { buildTworldPairedStaticAnalysis } from "../buildTworldPairedStaticAnalysis";
import type {
  CorpusSourceMemberReferenceV1,
  CorpusSourcePort,
} from "../p1a-corpus/types";
import {
  TWORLD_ARTIFACT_REPOSITORY_ID,
  artifactOccurrenceIdForCorpusOccurrence,
} from "./corpusArtifactIdentity";
import {
  P1B_CORPUS_VALIDITY_REPORT_PRODUCER_REVISION,
  canonicalP1bCorpusValidityReportJson,
  type P1bCorpusOccurrenceV1,
  type P1bCorpusValidityReportV1,
} from "./corpusValidityReport";
import { deriveP1bMeasuredCorpusCase } from "./deriveMeasuredCorpusCase";
import {
  copyP1bMeasuredCorpusCase,
  type P1bMeasuredCorpusCaseV1,
} from "./curriculumManifest";

export const P1B_MEASURED_CORPUS_REPORT_PRODUCER_REVISION =
  "ccsolver-p1b-measured-corpus-report-v1";

const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const DEFAULT_MAX_CONCURRENCY = 4;
const MAX_CONCURRENCY = 32;

export interface P1bMeasuredCorpusReportAnalysisRevisionsV1 {
  readonly artifactProducerRevision: string;
  readonly importProfileRevision: string;
  readonly factsAnalyzerRevision: string;
  readonly staticAnalyzerRevision: string;
  readonly catalogRevision: string;
  readonly msAdapterRevision: string;
  readonly lynxAdapterRevision: string;
  readonly msPolicyRevision: string;
  readonly lynxPolicyRevision: string;
}

export interface BuildP1bMeasuredCorpusReportInput {
  /** Exact validity preview that owns the donor-redacted occurrence catalog. */
  readonly validityReport: P1bCorpusValidityReportV1;
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
  readonly analysisRevisions: P1bMeasuredCorpusReportAnalysisRevisionsV1;
  /**
   * Unit-ATDD escape hatch. Omit in generation: omission means every valid,
   * paired occurrence. Any use is made durable and conspicuous in `scope`.
   */
  readonly explicitTestSubsetOccurrenceIds?: readonly string[];
  /** Deterministic output ordering is independent of this bounded worker count. */
  readonly maxConcurrency?: number;
}

export interface P1bCorpusMeasurementV1 {
  readonly corpusRevision: string;
  readonly artifactRepositoryId: string;
  readonly analysisRevisions: P1bMeasuredCorpusReportAnalysisRevisionsV1;
}

export interface MeasureP1bCorpusOccurrencesInput extends P1bCorpusMeasurementV1 {
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
  readonly maxConcurrency?: number;
}

export interface AssembleP1bMeasuredCorpusReportInput {
  readonly validityReport: P1bCorpusValidityReportV1;
  readonly sha256: Sha256Port;
  readonly analysisRevisions: P1bMeasuredCorpusReportAnalysisRevisionsV1;
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
}

export type P1bMeasuredCorpusReportScopeV1 =
  | { readonly kind: "all-valid-paired" }
  | {
      readonly kind: "explicit-test-subset";
      readonly occurrenceIds: readonly string[];
    };

export interface P1bMeasuredCorpusReportV1 {
  readonly reportType: "ccsolver-p1b-measured-corpus";
  readonly reportVersion: 1;
  readonly stability: "preview";
  readonly producerRevision: typeof P1B_MEASURED_CORPUS_REPORT_PRODUCER_REVISION;
  readonly source: {
    readonly corpusManifest: BlobReferenceV1;
    readonly corpusValidityReport: BlobReferenceV1;
    readonly corpusRepository: "joshua-bone/tworld";
    readonly corpusRevision: string;
    readonly artifactRepositoryId: string;
    readonly normalizationProfile: "tworld-legacy-dat-gameplay-v1";
    readonly validityPolicyRevision: string;
    readonly sourceMemberVerification: "sha256-rehashed";
    readonly analysisRevisions: P1bMeasuredCorpusReportAnalysisRevisionsV1;
  };
  readonly scope: P1bMeasuredCorpusReportScopeV1;
  readonly summary: {
    readonly corpusOccurrenceCount: number;
    readonly eligibleValidPairedOccurrenceCount: number;
    readonly scopeOccurrenceCount: number;
    readonly measuredOccurrenceCount: number;
    readonly unmeasuredEligibleOccurrenceCount: number;
    readonly fullValidPairedCoverage: boolean;
    readonly uniqueNormalizedGameplayIdentityCount: number;
    readonly parityOccurrenceCount: number;
    readonly divergentOccurrenceCount: number;
  };
  /** Exact measured facts/features/content references; donor replay records are absent. */
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
}

export interface P1bMeasuredCorpusReportBundle {
  readonly report: P1bMeasuredCorpusReportV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

interface VerifiedOccurrenceSource {
  readonly sourcePath: string;
  readonly containerBytes: Uint8Array;
  readonly layerData: readonly Uint8Array[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireNonnegativeSafeInteger(value: number, description: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a nonnegative safe integer`);
  }
  return value;
}

function requireNonemptyText(value: string, description: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\r")) {
    throw new Error(`${description} must be a non-empty durable string`);
  }
  return value;
}

function copyBlobReference(value: BlobReferenceV1, description: string): BlobReferenceV1 {
  if (!SHA256_DIGEST_PATTERN.test(value.digest)) {
    throw new Error(`${description} must contain a lowercase SHA-256 digest`);
  }
  return {
    digest: value.digest,
    byteLength: requireNonnegativeSafeInteger(value.byteLength, `${description} byte length`),
  };
}

function copyAnalysisRevisions(
  value: P1bMeasuredCorpusReportAnalysisRevisionsV1,
): P1bMeasuredCorpusReportAnalysisRevisionsV1 {
  return {
    artifactProducerRevision: requireNonemptyText(
      value.artifactProducerRevision,
      "artifact producer revision",
    ),
    importProfileRevision: requireNonemptyText(
      value.importProfileRevision,
      "import profile revision",
    ),
    factsAnalyzerRevision: requireNonemptyText(
      value.factsAnalyzerRevision,
      "facts analyzer revision",
    ),
    staticAnalyzerRevision: requireNonemptyText(
      value.staticAnalyzerRevision,
      "static analyzer revision",
    ),
    catalogRevision: requireNonemptyText(value.catalogRevision, "catalog revision"),
    msAdapterRevision: requireNonemptyText(value.msAdapterRevision, "MS adapter revision"),
    lynxAdapterRevision: requireNonemptyText(value.lynxAdapterRevision, "Lynx adapter revision"),
    msPolicyRevision: requireNonemptyText(value.msPolicyRevision, "MS policy revision"),
    lynxPolicyRevision: requireNonemptyText(value.lynxPolicyRevision, "Lynx policy revision"),
  };
}

function requireConcurrency(value: number | undefined): number {
  const concurrency = value ?? DEFAULT_MAX_CONCURRENCY;
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) {
    throw new Error(`max concurrency must be an integer from 1 through ${MAX_CONCURRENCY}`);
  }
  return concurrency;
}

function validateMember(
  member: CorpusSourceMemberReferenceV1,
  occurrenceId: string,
  expectedOrdinal: number,
): void {
  if (member.ordinal !== expectedOrdinal) {
    throw new Error(`corpus source member ordinals are not contiguous: ${occurrenceId}`);
  }
  requireNonnegativeSafeInteger(member.sourceLevelNumber, "source member level number");
  requireNonemptyText(member.sourcePath, "source member path");
  requireNonnegativeSafeInteger(member.byteOffset, "source member byte offset");
  requireNonnegativeSafeInteger(member.byteLength, "source member byte length");
  if (member.byteLength === 0) {
    throw new Error(`corpus source member is empty: ${occurrenceId}/${member.ordinal}`);
  }
  if (!SHA256_HEX_PATTERN.test(member.sha256)) {
    throw new Error(`corpus source member digest is invalid: ${occurrenceId}/${member.ordinal}`);
  }
}

function orderedMembers(occurrence: P1bCorpusOccurrenceV1): CorpusSourceMemberReferenceV1[] {
  if (occurrence.sourceMembers.length === 0) {
    throw new Error(`corpus occurrence has no source members: ${occurrence.occurrenceId}`);
  }
  const members = [...occurrence.sourceMembers].sort((left, right) => (
    left.ordinal - right.ordinal
      || compareText(left.sourcePath, right.sourcePath)
      || left.byteOffset - right.byteOffset
  ));
  for (let index = 0; index < members.length; index += 1) {
    validateMember(members[index]!, occurrence.occurrenceId, index);
  }
  const sourcePath = members[0]!.sourcePath;
  if (members.some((member) => member.sourcePath !== sourcePath)) {
    throw new Error(`corpus occurrence spans multiple source containers: ${occurrence.occurrenceId}`);
  }
  return members;
}

function validateValidityReport(
  report: P1bCorpusValidityReportV1,
): readonly P1bCorpusOccurrenceV1[] {
  if (
    report.reportType !== "ccsolver-p1b-corpus-validity"
    || report.reportVersion !== 1
    || report.stability !== "preview"
    || report.producerRevision !== P1B_CORPUS_VALIDITY_REPORT_PRODUCER_REVISION
  ) {
    throw new Error("measured corpus requires a supported P1B validity preview");
  }
  copyBlobReference(report.source.corpusManifest, "corpus manifest reference");
  requireNonemptyText(report.source.corpusRevision, "corpus revision");
  requireNonemptyText(report.source.validityPolicyRevision, "validity policy revision");
  if (
    report.source.corpusRepository !== "joshua-bone/tworld"
    || report.source.artifactRepositoryId !== TWORLD_ARTIFACT_REPOSITORY_ID
    || report.source.normalizationProfile !== "tworld-legacy-dat-gameplay-v1"
  ) {
    throw new Error("measured corpus validity source is unsupported");
  }

  const occurrenceIds = new Set<string>();
  const caseIds = new Set<string>();
  let validCount = 0;
  let pairedCount = 0;
  let validPairedCount = 0;
  for (const occurrence of report.occurrences) {
    requireNonemptyText(occurrence.occurrenceId, "corpus occurrence id");
    requireNonemptyText(occurrence.caseId, "corpus case id");
    if (occurrenceIds.has(occurrence.occurrenceId)) {
      throw new Error(`duplicate corpus occurrence id: ${occurrence.occurrenceId}`);
    }
    if (caseIds.has(occurrence.caseId)) {
      throw new Error(`duplicate corpus case id: ${occurrence.caseId}`);
    }
    occurrenceIds.add(occurrence.occurrenceId);
    caseIds.add(occurrence.caseId);
    if (!SHA256_HEX_PATTERN.test(occurrence.normalizedGameplaySha256)) {
      throw new Error(`normalized gameplay digest is invalid: ${occurrence.occurrenceId}`);
    }
    if (
      occurrence.artifactOccurrenceId
        !== artifactOccurrenceIdForCorpusOccurrence(occurrence.occurrenceId)
    ) {
      throw new Error(`artifact occurrence id is invalid: ${occurrence.occurrenceId}`);
    }
    orderedMembers(occurrence);
    const valid = occurrence.validity.status === "valid";
    requireNonnegativeSafeInteger(
      occurrence.validity.issueCount,
      `validity issue count for ${occurrence.occurrenceId}`,
    );
    requireNonnegativeSafeInteger(
      occurrence.validity.invalidCellCount,
      `invalid cell count for ${occurrence.occurrenceId}`,
    );
    if (valid && (
      occurrence.validity.issueCount !== 0
      || occurrence.validity.invalidCellCount !== 0
    )) {
      throw new Error(`valid corpus occurrence carries validity issues: ${occurrence.occurrenceId}`);
    }
    validCount += valid ? 1 : 0;
    pairedCount += occurrence.paired ? 1 : 0;
    validPairedCount += valid && occurrence.paired ? 1 : 0;
  }

  if (
    report.summary.occurrenceCount !== report.occurrences.length
    || report.summary.validOccurrenceCount !== validCount
    || report.summary.invalidOccurrenceCount !== report.occurrences.length - validCount
    || report.summary.pairedOccurrenceCount !== pairedCount
    || report.summary.validPairedOccurrenceCount !== validPairedCount
    || report.summary.invalidPairedOccurrenceCount !== pairedCount - validPairedCount
  ) {
    throw new Error("corpus validity occurrence catalog does not match its summary");
  }
  const validPairedIdentities = new Set(report.occurrences
    .filter((occurrence) => occurrence.paired && occurrence.validity.status === "valid")
    .map((occurrence) => occurrence.normalizedGameplaySha256));
  if (
    report.summary.validPairedUniqueNormalizedGameplayIdentityCount
      !== validPairedIdentities.size
  ) {
    throw new Error("valid paired identity count does not match the validity summary");
  }
  return report.occurrences;
}

function selectOccurrences(
  report: P1bCorpusValidityReportV1,
  explicitIds: readonly string[] | undefined,
): {
  readonly eligible: readonly P1bCorpusOccurrenceV1[];
  readonly selected: readonly P1bCorpusOccurrenceV1[];
  readonly scope: P1bMeasuredCorpusReportScopeV1;
} {
  const all = validateValidityReport(report);
  const eligible = all
    .filter((entry) => entry.paired && entry.validity.status === "valid")
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  if (explicitIds === undefined) {
    return { eligible, selected: eligible, scope: { kind: "all-valid-paired" } };
  }
  if (explicitIds.length === 0) {
    throw new Error("explicit test subset must contain at least one occurrence id");
  }
  const allById = new Map(all.map((entry) => [entry.occurrenceId, entry]));
  const seen = new Set<string>();
  const selected: P1bCorpusOccurrenceV1[] = [];
  for (const occurrenceId of explicitIds) {
    requireNonemptyText(occurrenceId, "explicit test subset occurrence id");
    if (seen.has(occurrenceId)) {
      throw new Error(`duplicate explicit test subset occurrence id: ${occurrenceId}`);
    }
    seen.add(occurrenceId);
    const occurrence = allById.get(occurrenceId);
    if (occurrence === undefined) {
      throw new Error(`explicit test subset occurrence is absent: ${occurrenceId}`);
    }
    if (!occurrence.paired || occurrence.validity.status !== "valid") {
      throw new Error(`explicit test subset occurrence is not valid and paired: ${occurrenceId}`);
    }
    selected.push(occurrence);
  }
  selected.sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  return {
    eligible,
    selected,
    scope: {
      kind: "explicit-test-subset",
      occurrenceIds: selected.map((entry) => entry.occurrenceId),
    },
  };
}

export function selectP1bValidPairedCorpusOccurrences(
  report: P1bCorpusValidityReportV1,
): readonly P1bCorpusOccurrenceV1[] {
  return selectOccurrences(report, undefined).eligible;
}

function sourceLoader(source: CorpusSourcePort): (path: string) => Promise<Uint8Array> {
  const cache = new Map<string, Promise<Uint8Array>>();
  return async (path) => {
    let pending = cache.get(path);
    if (pending === undefined) {
      pending = source.readBytes(path).then((bytes) => new Uint8Array(bytes));
      cache.set(path, pending);
    }
    return pending;
  };
}

async function verifyOccurrenceSource(
  occurrence: P1bCorpusOccurrenceV1,
  loadSource: (path: string) => Promise<Uint8Array>,
  sha256: Sha256Port,
): Promise<VerifiedOccurrenceSource> {
  const members = orderedMembers(occurrence);
  const sourcePath = members[0]!.sourcePath;
  const containerBytes = await loadSource(sourcePath);
  const layerData: Uint8Array[] = [];
  for (const member of members) {
    const end = member.byteOffset + member.byteLength;
    if (!Number.isSafeInteger(end) || end > containerBytes.byteLength) {
      throw new Error(
        `corpus source member exceeds source bytes: ${occurrence.occurrenceId}/${member.ordinal}`,
      );
    }
    const bytes = containerBytes.slice(member.byteOffset, end);
    const actualDigest = await identifyBytes(bytes, sha256);
    if (actualDigest !== `sha256:${member.sha256}`) {
      throw new Error(
        `corpus source member digest mismatch: ${occurrence.occurrenceId}/${member.ordinal}; `
        + `expected ${member.sha256}, received ${actualDigest.slice("sha256:".length)}`,
      );
    }
    layerData.push(bytes);
  }
  return { sourcePath, containerBytes, layerData };
}

async function mapConcurrentOrdered<Input, Output>(
  inputs: readonly Input[],
  concurrency: number,
  project: (input: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  const results = new Array<Output>(inputs.length);
  const failures = new Array<{ readonly error: unknown } | undefined>(inputs.length);
  let nextIndex = 0;
  let stopped = false;
  const workerCount = Math.min(concurrency, inputs.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (!stopped && nextIndex < inputs.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = await project(inputs[index]!, index);
      } catch (error) {
        failures[index] = { error };
        stopped = true;
      }
    }
  }));
  const firstFailure = failures.find((failure) => failure !== undefined);
  if (firstFailure !== undefined) {
    throw firstFailure.error;
  }
  return results;
}

function validateMeasuredCases(
  cases: readonly P1bMeasuredCorpusCaseV1[],
  selected: readonly P1bCorpusOccurrenceV1[],
): P1bMeasuredCorpusCaseV1[] {
  const ordered = cases
    .map(copyP1bMeasuredCorpusCase)
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  if (ordered.length !== selected.length) {
    throw new Error(
      `measured case count mismatch: expected ${selected.length}, received ${ordered.length}`,
    );
  }
  for (let index = 0; index < selected.length; index += 1) {
    const occurrence = selected[index]!;
    const measured = ordered[index]!;
    if (
      measured.occurrenceId !== occurrence.occurrenceId
      || measured.caseId !== occurrence.caseId
      || measured.title !== occurrence.title
      || measured.normalizedGameplaySha256 !== occurrence.normalizedGameplaySha256
      || measured.sourceValidity.status !== "valid"
      || measured.sourceValidity.issueCount !== 0
      || !measured.donorAvailability.ms
      || !measured.donorAvailability.lynx
    ) {
      throw new Error(
        `measured case disagrees with the validity catalog: ${occurrence.occurrenceId}`,
      );
    }
  }
  return ordered;
}

async function assembleMeasuredCorpusReport(
  input: AssembleP1bMeasuredCorpusReportInput,
  selected: readonly P1bCorpusOccurrenceV1[],
  eligible: readonly P1bCorpusOccurrenceV1[],
  scope: P1bMeasuredCorpusReportScopeV1,
): Promise<P1bMeasuredCorpusReportBundle> {
  const revisions = copyAnalysisRevisions(input.analysisRevisions);
  const cases = validateMeasuredCases(input.cases, selected);
  const validityCanonical = canonicalP1bCorpusValidityReportJson(input.validityReport);
  const validityContent = await referenceCanonicalJson(validityCanonical, input.sha256);
  const fullCoverage = cases.length === eligible.length;
  const report: P1bMeasuredCorpusReportV1 = {
    reportType: "ccsolver-p1b-measured-corpus",
    reportVersion: 1,
    stability: "preview",
    producerRevision: P1B_MEASURED_CORPUS_REPORT_PRODUCER_REVISION,
    source: {
      corpusManifest: copyBlobReference(
        input.validityReport.source.corpusManifest,
        "corpus manifest reference",
      ),
      corpusValidityReport: validityContent,
      corpusRepository: input.validityReport.source.corpusRepository,
      corpusRevision: input.validityReport.source.corpusRevision,
      artifactRepositoryId: input.validityReport.source.artifactRepositoryId,
      normalizationProfile: input.validityReport.source.normalizationProfile,
      validityPolicyRevision: input.validityReport.source.validityPolicyRevision,
      sourceMemberVerification: "sha256-rehashed",
      analysisRevisions: revisions,
    },
    scope,
    summary: {
      corpusOccurrenceCount: input.validityReport.summary.occurrenceCount,
      eligibleValidPairedOccurrenceCount: eligible.length,
      scopeOccurrenceCount: selected.length,
      measuredOccurrenceCount: cases.length,
      unmeasuredEligibleOccurrenceCount: eligible.length - cases.length,
      fullValidPairedCoverage: fullCoverage,
      uniqueNormalizedGameplayIdentityCount: new Set(cases.map((entry) =>
        entry.normalizedGameplaySha256,
      )).size,
      parityOccurrenceCount: cases.filter((entry) => entry.comparison.status === "parity").length,
      divergentOccurrenceCount: cases.filter((entry) =>
        entry.comparison.status === "divergent",
      ).length,
    },
    cases,
  };
  const canonicalJson = canonicalizeJson(report as unknown as CanonicalJsonValue);
  return {
    report,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, input.sha256),
  };
}

export async function measureP1bCorpusOccurrences(
  input: MeasureP1bCorpusOccurrencesInput,
): Promise<readonly P1bMeasuredCorpusCaseV1[]> {
  const concurrency = requireConcurrency(input.maxConcurrency);
  const revisions = copyAnalysisRevisions(input.analysisRevisions);
  const corpusRevision = requireNonemptyText(input.corpusRevision, "corpus revision");
  const artifactRepositoryId = requireNonemptyText(
    input.artifactRepositoryId,
    "artifact repository id",
  );
  if (artifactRepositoryId !== TWORLD_ARTIFACT_REPOSITORY_ID) {
    throw new Error(`unsupported artifact repository id: ${artifactRepositoryId}`);
  }
  const occurrenceIds = new Set<string>();
  const occurrences = [...input.occurrences]
    .sort((left, right) => compareText(left.occurrenceId, right.occurrenceId));
  for (const occurrence of occurrences) {
    requireNonemptyText(occurrence.occurrenceId, "corpus occurrence id");
    if (occurrenceIds.has(occurrence.occurrenceId)) {
      throw new Error(`duplicate measured occurrence: ${occurrence.occurrenceId}`);
    }
    occurrenceIds.add(occurrence.occurrenceId);
    if (!occurrence.paired || occurrence.validity.status !== "valid") {
      throw new Error(`measured occurrence is not valid and paired: ${occurrence.occurrenceId}`);
    }
    if (
      occurrence.artifactOccurrenceId
        !== artifactOccurrenceIdForCorpusOccurrence(occurrence.occurrenceId)
    ) {
      throw new Error(`artifact occurrence id is invalid: ${occurrence.occurrenceId}`);
    }
    orderedMembers(occurrence);
  }

  const loadSource = sourceLoader(input.source);
  return mapConcurrentOrdered(
    occurrences,
    concurrency,
    async (occurrence) => {
      const verified = await verifyOccurrenceSource(occurrence, loadSource, input.sha256);
      const paired = await buildTworldPairedStaticAnalysis({
        occurrenceId: occurrence.artifactOccurrenceId,
        producerRevision: revisions.artifactProducerRevision,
        repository: artifactRepositoryId,
        repositoryRevision: corpusRevision,
        sourcePath: verified.sourcePath,
        importProfileRevision: revisions.importProfileRevision,
        analyzerRevision: revisions.factsAnalyzerRevision,
        staticAnalyzerRevision: revisions.staticAnalyzerRevision,
        catalogRevision: revisions.catalogRevision,
        msAdapterRevision: revisions.msAdapterRevision,
        lynxAdapterRevision: revisions.lynxAdapterRevision,
        msPolicyRevision: revisions.msPolicyRevision,
        lynxPolicyRevision: revisions.lynxPolicyRevision,
        containerBytes: verified.containerBytes,
        loaded: {
          levelData: verified.layerData[0]!,
          layerData: verified.layerData,
        },
      }, input.sha256);
      return deriveP1bMeasuredCorpusCase({ occurrence, paired });
    },
  );
}

export async function assembleP1bMeasuredCorpusReport(
  input: AssembleP1bMeasuredCorpusReportInput,
): Promise<P1bMeasuredCorpusReportBundle> {
  const { eligible, selected, scope } = selectOccurrences(input.validityReport, undefined);
  return assembleMeasuredCorpusReport(input, selected, eligible, scope);
}

export async function buildP1bMeasuredCorpusReport(
  input: BuildP1bMeasuredCorpusReportInput,
): Promise<P1bMeasuredCorpusReportBundle> {
  const { eligible, selected, scope } = selectOccurrences(
    input.validityReport,
    input.explicitTestSubsetOccurrenceIds,
  );
  const cases = await measureP1bCorpusOccurrences({
    occurrences: selected,
    source: input.source,
    sha256: input.sha256,
    corpusRevision: input.validityReport.source.corpusRevision,
    artifactRepositoryId: input.validityReport.source.artifactRepositoryId,
    analysisRevisions: input.analysisRevisions,
    maxConcurrency: input.maxConcurrency,
  });
  return assembleMeasuredCorpusReport({
    validityReport: input.validityReport,
    sha256: input.sha256,
    analysisRevisions: input.analysisRevisions,
    cases,
  }, selected, eligible, scope);
}

export function canonicalP1bMeasuredCorpusReportJson(
  report: P1bMeasuredCorpusReportV1,
): CanonicalJson {
  return canonicalizeJson(report as unknown as CanonicalJsonValue);
}
