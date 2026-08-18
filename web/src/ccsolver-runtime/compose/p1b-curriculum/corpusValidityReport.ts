import { identifyBytes, identifyCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type {
  CorpusMapCaseV1,
  CorpusManifestV1,
  CorpusSourceMemberReferenceV1,
  CorpusSourcePort,
} from "../p1a-corpus/types";
import { normalizedGameplayReferenceForMembers } from "../p1a-corpus/corpusManifest";
import {
  TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION,
  analyzeTworldLegacySourceValidity,
  type TworldLegacySourceValidityIssueV1,
  type TworldLegacySourceValidityReason,
} from "../sourceValidity/analyzeTworldLegacySourceValidity";
import {
  TWORLD_ARTIFACT_REPOSITORY_ID,
  artifactOccurrenceIdForCorpusOccurrence,
} from "./corpusArtifactIdentity";

export const P1B_CORPUS_VALIDITY_REPORT_PRODUCER_REVISION =
  "ccsolver-p1b-corpus-validity-report-v1";

const NORMALIZATION_PROFILE = "tworld-legacy-dat-gameplay-v1";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

export interface BuildP1bCorpusValidityReportInput {
  /** Parsed contents of the checked, canonical P1A corpus manifest. */
  readonly manifest: CorpusManifestV1;
  /** Repository-relative byte source used to re-verify each referenced DAT record. */
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
}

export interface P1bCorpusValidityReportSourceV1 {
  readonly corpusManifest: BlobReferenceV1;
  readonly corpusRepository: "joshua-bone/tworld";
  readonly corpusRevision: string;
  readonly artifactRepositoryId: typeof TWORLD_ARTIFACT_REPOSITORY_ID;
  readonly normalizationProfile: typeof NORMALIZATION_PROFILE;
  readonly validityPolicyRevision: typeof TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION;
}

export interface P1bCorpusOccurrenceV1 {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly artifactOccurrenceId: string;
  readonly packId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly author: string;
  readonly normalizedGameplaySha256: string;
  readonly paired: boolean;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly validity: {
    readonly status: "valid" | "invalid";
    readonly issueCount: number;
    readonly invalidCellCount: number;
  };
}

export interface P1bIssueReasonCountsV1 {
  readonly "legacy-invalid-file-code": number;
  readonly "lower-plane-actor": number;
  readonly "nonactor-upper-masks-lower-terrain": number;
}

export interface P1bIssueSignatureCountV1 {
  /** Sorted reasons emitted for the same source cell. */
  readonly reasons: readonly TworldLegacySourceValidityReason[];
  readonly invalidCellCount: number;
}

export interface P1bCorpusValiditySummaryV1 {
  readonly occurrenceCount: number;
  readonly validOccurrenceCount: number;
  readonly invalidOccurrenceCount: number;
  readonly pairedOccurrenceCount: number;
  readonly validPairedOccurrenceCount: number;
  readonly invalidPairedOccurrenceCount: number;
  readonly uniqueNormalizedGameplayIdentityCount: number;
  readonly duplicateAliasGroupCount: number;
  readonly duplicateAliasOccurrenceCount: number;
  readonly validPairedUniqueNormalizedGameplayIdentityCount: number;
  readonly validPairedDuplicateAliasGroupCount: number;
  readonly validPairedDuplicateAliasOccurrenceCount: number;
  /** Distinct occurrence/z/cell locations with at least one issue. */
  readonly invalidCellCount: number;
  /** Raw analyzer records; can exceed invalidCellCount when reasons overlap. */
  readonly issueRecordCount: number;
  readonly issueReasonCounts: P1bIssueReasonCountsV1;
  /** Mutually exclusive reason signatures, whose counts sum to invalidCellCount. */
  readonly issueSignatureCounts: readonly P1bIssueSignatureCountV1[];
}

export interface P1bInvalidOccurrenceV1 {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly packId: string;
  readonly levelNumber: number;
  readonly title: string;
  readonly author: string;
  readonly normalizedGameplaySha256: string;
  /** True only when both target records have a donor; no replay metadata is copied. */
  readonly paired: boolean;
  readonly sourceMembers: readonly CorpusSourceMemberReferenceV1[];
  readonly validity: {
    readonly geometry: {
      readonly width: 32;
      readonly height: 32;
      readonly depth: number;
    };
    readonly inspectedCellCount: number;
    readonly invalidCellCount: number;
    readonly issues: readonly TworldLegacySourceValidityIssueV1[];
  };
}

export interface P1bDuplicateOccurrenceV1 {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly packId: string;
  readonly levelNumber: number;
  readonly validityStatus: "valid" | "invalid";
  readonly paired: boolean;
}

export interface P1bDuplicateOccurrenceGroupV1 {
  readonly normalizedGameplaySha256: string;
  readonly occurrences: readonly P1bDuplicateOccurrenceV1[];
}

/**
 * P1B preview data, intentionally outside the root artifact protocol until the
 * curriculum contract is reviewed and frozen.
 */
export interface P1bCorpusValidityReportV1 {
  readonly reportType: "ccsolver-p1b-corpus-validity";
  readonly reportVersion: 1;
  readonly stability: "preview";
  readonly producerRevision: typeof P1B_CORPUS_VALIDITY_REPORT_PRODUCER_REVISION;
  readonly source: P1bCorpusValidityReportSourceV1;
  readonly summary: P1bCorpusValiditySummaryV1;
  /** Redacted all-occurrence catalog: no donor replay records or paths. */
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
  readonly invalidOccurrences: readonly P1bInvalidOccurrenceV1[];
  readonly duplicateOccurrenceGroups: readonly P1bDuplicateOccurrenceGroupV1[];
}

interface AuditedOccurrence {
  readonly sourceCase: CorpusMapCaseV1;
  readonly paired: boolean;
  readonly status: "valid" | "invalid";
  readonly invalidCellCount: number;
  readonly geometry: P1bInvalidOccurrenceV1["validity"]["geometry"];
  readonly inspectedCellCount: number;
  readonly issues: readonly TworldLegacySourceValidityIssueV1[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNonnegativeSafeInteger(value: number, description: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a nonnegative safe integer`);
  }
}

function assertSha256(value: string, description: string): void {
  if (!SHA256_PATTERN.test(value)) {
    throw new Error(`${description} must be 64 lowercase hexadecimal digits`);
  }
}

function unprefixedDigest(digest: string): string {
  if (!digest.startsWith("sha256:")) {
    throw new Error(`SHA-256 adapter returned an unsupported digest: ${digest}`);
  }
  return digest.slice("sha256:".length);
}

function isPaired(entry: CorpusMapCaseV1): boolean {
  if (
    entry.targets.length !== 2
    || entry.targets[0].target !== "ms"
    || entry.targets[1].target !== "lynx"
  ) {
    throw new Error(`corpus target order is invalid: ${entry.occurrenceId}`);
  }
  return entry.targets[0].donor !== null && entry.targets[1].donor !== null;
}

function orderedMembers(entry: CorpusMapCaseV1): CorpusSourceMemberReferenceV1[] {
  if (entry.sourceMembers.length === 0) {
    throw new Error(`corpus occurrence has no source members: ${entry.occurrenceId}`);
  }
  const members = [...entry.sourceMembers].sort((left, right) => (
    compareNumber(left.ordinal, right.ordinal)
      || compareText(left.sourcePath, right.sourcePath)
      || compareNumber(left.byteOffset, right.byteOffset)
  ));
  for (let index = 0; index < members.length; index += 1) {
    const member = members[index]!;
    if (member.ordinal !== index) {
      throw new Error(`corpus source member ordinals are not contiguous: ${entry.occurrenceId}`);
    }
    assertNonnegativeSafeInteger(member.byteOffset, "corpus source member byte offset");
    assertNonnegativeSafeInteger(member.byteLength, "corpus source member byte length");
    if (member.byteLength === 0) {
      throw new Error(`corpus source member is empty: ${entry.occurrenceId}/${member.ordinal}`);
    }
    assertSha256(member.sha256, "corpus source member digest");
  }
  return members;
}

async function verifiedSourceFiles(
  manifest: CorpusManifestV1,
  source: CorpusSourcePort,
  sha256: Sha256Port,
): Promise<ReadonlyMap<string, Uint8Array>> {
  const pins = new Map<string, CorpusManifestV1["sources"][number]>();
  for (const pin of manifest.sources) {
    if (pins.has(pin.path)) {
      throw new Error(`duplicate corpus source reference: ${pin.path}`);
    }
    assertNonnegativeSafeInteger(pin.byteLength, "corpus source byte length");
    assertSha256(pin.sha256, "corpus source digest");
    pins.set(pin.path, pin);
  }

  const requiredPaths = [...new Set(manifest.cases.flatMap((entry) =>
    entry.sourceMembers.map((member) => member.sourcePath),
  ))].sort(compareText);
  const loaded = new Map<string, Uint8Array>();
  for (const path of requiredPaths) {
    const pin = pins.get(path);
    if (pin === undefined) {
      throw new Error(`corpus member source is absent from manifest sources: ${path}`);
    }
    const bytes = new Uint8Array(await source.readBytes(path));
    if (bytes.byteLength !== pin.byteLength) {
      throw new Error(
        `corpus source byte length mismatch: ${path}; expected ${pin.byteLength}, received ${bytes.byteLength}`,
      );
    }
    const actualDigest = unprefixedDigest(await identifyBytes(bytes, sha256));
    if (actualDigest !== pin.sha256) {
      throw new Error(
        `corpus source digest mismatch: ${path}; expected ${pin.sha256}, received ${actualDigest}`,
      );
    }
    loaded.set(path, bytes);
  }
  return loaded;
}

async function verifiedMemberBytes(
  occurrenceId: string,
  member: CorpusSourceMemberReferenceV1,
  loaded: ReadonlyMap<string, Uint8Array>,
  sha256: Sha256Port,
): Promise<Uint8Array> {
  const sourceBytes = loaded.get(member.sourcePath);
  if (sourceBytes === undefined) {
    throw new Error(`verified corpus source was not loaded: ${member.sourcePath}`);
  }
  const end = member.byteOffset + member.byteLength;
  if (!Number.isSafeInteger(end) || end > sourceBytes.byteLength) {
    throw new Error(`corpus source member exceeds source bytes: ${occurrenceId}/${member.ordinal}`);
  }
  const bytes = sourceBytes.slice(member.byteOffset, end);
  const actualDigest = unprefixedDigest(await identifyBytes(bytes, sha256));
  if (actualDigest !== member.sha256) {
    throw new Error(
      `corpus source member digest mismatch: ${occurrenceId}/${member.ordinal}; `
      + `expected ${member.sha256}, received ${actualDigest}`,
    );
  }
  return bytes;
}

function compareIssue(
  left: TworldLegacySourceValidityIssueV1,
  right: TworldLegacySourceValidityIssueV1,
): number {
  return compareNumber(left.z, right.z)
    || compareNumber(left.cell, right.cell)
    || compareText(left.reason, right.reason)
    || compareText(left.plane, right.plane)
    || compareNumber(left.sourceFileCode, right.sourceFileCode)
    || compareNumber(left.upperSourceFileCode, right.upperSourceFileCode)
    || compareNumber(left.lowerSourceFileCode, right.lowerSourceFileCode);
}

function cellKey(issue: TworldLegacySourceValidityIssueV1): string {
  return `${issue.z}/${issue.cell}`;
}

function countInvalidCells(issues: readonly TworldLegacySourceValidityIssueV1[]): number {
  return new Set(issues.map(cellKey)).size;
}

function copySourceMember(
  member: CorpusSourceMemberReferenceV1,
): CorpusSourceMemberReferenceV1 {
  return {
    ordinal: member.ordinal,
    sourceLevelNumber: member.sourceLevelNumber,
    sourcePath: member.sourcePath,
    byteOffset: member.byteOffset,
    byteLength: member.byteLength,
    sha256: member.sha256,
  };
}

async function auditOccurrence(
  entry: CorpusMapCaseV1,
  loaded: ReadonlyMap<string, Uint8Array>,
  sha256: Sha256Port,
): Promise<AuditedOccurrence> {
  if (entry.normalizedGameplayReference.status !== "available") {
    throw new Error(`normalized gameplay identity is unavailable: ${entry.occurrenceId}`);
  }
  if (entry.normalizedGameplayReference.profile !== NORMALIZATION_PROFILE) {
    throw new Error(`normalization profile is unsupported: ${entry.occurrenceId}`);
  }
  assertSha256(
    entry.normalizedGameplayReference.sha256,
    `normalized gameplay digest for ${entry.occurrenceId}`,
  );
  const members = orderedMembers(entry);
  const layerData: Uint8Array[] = [];
  for (const member of members) {
    layerData.push(await verifiedMemberBytes(entry.occurrenceId, member, loaded, sha256));
  }
  const normalized = await normalizedGameplayReferenceForMembers(layerData, sha256);
  if (
    normalized.profile !== entry.normalizedGameplayReference.profile
    || normalized.sha256 !== entry.normalizedGameplayReference.sha256
  ) {
    throw new Error(
      `normalized gameplay identity mismatch: ${entry.occurrenceId}; `
      + `expected ${entry.normalizedGameplayReference.sha256}, received ${normalized.sha256}`,
    );
  }
  const validity = analyzeTworldLegacySourceValidity({ layerData });
  const issues = [...validity.issues].sort(compareIssue);
  return {
    sourceCase: entry,
    paired: isPaired(entry),
    status: validity.status,
    invalidCellCount: countInvalidCells(issues),
    geometry: validity.geometry,
    inspectedCellCount: validity.inspectedCellCount,
    issues,
  };
}

function issueCounts(audited: readonly AuditedOccurrence[]): {
  readonly invalidCellCount: number;
  readonly issueRecordCount: number;
  readonly issueReasonCounts: P1bIssueReasonCountsV1;
  readonly issueSignatureCounts: readonly P1bIssueSignatureCountV1[];
} {
  const reasonCounts: Record<TworldLegacySourceValidityReason, number> = {
    "legacy-invalid-file-code": 0,
    "lower-plane-actor": 0,
    "nonactor-upper-masks-lower-terrain": 0,
  };
  const signatureCounts = new Map<string, number>();
  let invalidCellCount = 0;
  let issueRecordCount = 0;

  for (const occurrence of audited) {
    const reasonsByCell = new Map<string, Set<TworldLegacySourceValidityReason>>();
    for (const item of occurrence.issues) {
      reasonCounts[item.reason] += 1;
      issueRecordCount += 1;
      const key = cellKey(item);
      const reasons = reasonsByCell.get(key) ?? new Set<TworldLegacySourceValidityReason>();
      reasons.add(item.reason);
      reasonsByCell.set(key, reasons);
    }
    invalidCellCount += reasonsByCell.size;
    for (const reasons of reasonsByCell.values()) {
      const signature = [...reasons].sort(compareText).join("\u0000");
      signatureCounts.set(signature, (signatureCounts.get(signature) ?? 0) + 1);
    }
  }

  return {
    invalidCellCount,
    issueRecordCount,
    issueReasonCounts: {
      "legacy-invalid-file-code": reasonCounts["legacy-invalid-file-code"],
      "lower-plane-actor": reasonCounts["lower-plane-actor"],
      "nonactor-upper-masks-lower-terrain":
        reasonCounts["nonactor-upper-masks-lower-terrain"],
    },
    issueSignatureCounts: [...signatureCounts.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([signature, count]) => ({
        reasons: signature.split("\u0000") as TworldLegacySourceValidityReason[],
        invalidCellCount: count,
      })),
  };
}

function duplicateGroups(
  audited: readonly AuditedOccurrence[],
): P1bDuplicateOccurrenceGroupV1[] {
  const byDigest = new Map<string, AuditedOccurrence[]>();
  for (const occurrence of audited) {
    const digest = occurrence.sourceCase.normalizedGameplayReference.sha256;
    const group = byDigest.get(digest) ?? [];
    group.push(occurrence);
    byDigest.set(digest, group);
  }

  return [...byDigest.entries()]
    .filter(([, occurrences]) => occurrences.length > 1)
    .sort(([left], [right]) => compareText(left, right))
    .map(([normalizedGameplaySha256, occurrences]) => ({
      normalizedGameplaySha256,
      occurrences: [...occurrences]
        .sort((left, right) => compareText(
          left.sourceCase.occurrenceId,
          right.sourceCase.occurrenceId,
        ))
        .map((occurrence) => ({
          caseId: occurrence.sourceCase.caseId,
          occurrenceId: occurrence.sourceCase.occurrenceId,
          packId: occurrence.sourceCase.packId,
          levelNumber: occurrence.sourceCase.levelNumber,
          validityStatus: occurrence.status,
          paired: occurrence.paired,
        })),
    }));
}

function invalidOccurrences(
  audited: readonly AuditedOccurrence[],
): P1bInvalidOccurrenceV1[] {
  return audited
    .filter((entry) => entry.status === "invalid")
    .map((entry) => ({
      caseId: entry.sourceCase.caseId,
      occurrenceId: entry.sourceCase.occurrenceId,
      packId: entry.sourceCase.packId,
      levelNumber: entry.sourceCase.levelNumber,
      title: entry.sourceCase.title,
      author: entry.sourceCase.author,
      normalizedGameplaySha256: entry.sourceCase.normalizedGameplayReference.sha256,
      paired: entry.paired,
      sourceMembers: orderedMembers(entry.sourceCase).map(copySourceMember),
      validity: {
        geometry: entry.geometry,
        inspectedCellCount: entry.inspectedCellCount,
        invalidCellCount: entry.invalidCellCount,
        issues: entry.issues.map((item) => ({ ...item })),
      },
    }));
}

function redactedOccurrences(
  audited: readonly AuditedOccurrence[],
): P1bCorpusOccurrenceV1[] {
  return audited.map((entry) => ({
    caseId: entry.sourceCase.caseId,
    occurrenceId: entry.sourceCase.occurrenceId,
    artifactOccurrenceId: artifactOccurrenceIdForCorpusOccurrence(
      entry.sourceCase.occurrenceId,
    ),
    packId: entry.sourceCase.packId,
    levelNumber: entry.sourceCase.levelNumber,
    title: entry.sourceCase.title,
    author: entry.sourceCase.author,
    normalizedGameplaySha256: entry.sourceCase.normalizedGameplayReference.sha256,
    paired: entry.paired,
    sourceMembers: orderedMembers(entry.sourceCase).map(copySourceMember),
    validity: {
      status: entry.status,
      issueCount: entry.issues.length,
      invalidCellCount: entry.invalidCellCount,
    },
  }));
}

function assertManifestShape(manifest: CorpusManifestV1): void {
  if (manifest.artifact !== "ccsolver-corpus-manifest" || manifest.version !== 1) {
    throw new Error("P1B validity requires a P1A corpus manifest v1");
  }
  if (manifest.source.repository !== "joshua-bone/tworld" || manifest.source.revision.length === 0) {
    throw new Error("P1B validity requires a revision-bound tworld corpus manifest");
  }
  if (manifest.summary.mapCaseCount !== manifest.cases.length) {
    throw new Error("corpus manifest case count does not match its summary");
  }
  const occurrenceIds = new Set<string>();
  const caseIds = new Set<string>();
  const mapPathByPack = new Map(manifest.packs.map((pack) => [pack.packId, pack.mapPath]));
  for (const entry of manifest.cases) {
    if (occurrenceIds.has(entry.occurrenceId)) {
      throw new Error(`duplicate corpus occurrence id: ${entry.occurrenceId}`);
    }
    if (caseIds.has(entry.caseId)) {
      throw new Error(`duplicate corpus case id: ${entry.caseId}`);
    }
    occurrenceIds.add(entry.occurrenceId);
    caseIds.add(entry.caseId);
    const expectedMapPath = mapPathByPack.get(entry.packId);
    if (expectedMapPath === undefined) {
      throw new Error(`corpus occurrence has no registered pack: ${entry.occurrenceId}`);
    }
    if (entry.sourceMembers.some((member) => member.sourcePath !== expectedMapPath)) {
      throw new Error(`corpus occurrence source does not match its pack: ${entry.occurrenceId}`);
    }
  }
}

export async function buildP1bCorpusValidityReport(
  input: BuildP1bCorpusValidityReportInput,
): Promise<P1bCorpusValidityReportV1> {
  assertManifestShape(input.manifest);
  const canonicalManifest = canonicalizeJson(input.manifest);
  const manifestReference: BlobReferenceV1 = {
    digest: await identifyCanonicalJson(canonicalManifest, input.sha256),
    byteLength: new TextEncoder().encode(canonicalManifest).byteLength,
  };
  const loaded = await verifiedSourceFiles(input.manifest, input.source, input.sha256);
  const orderedCases = [...input.manifest.cases].sort((left, right) =>
    compareText(left.occurrenceId, right.occurrenceId),
  );
  const audited: AuditedOccurrence[] = [];
  for (const entry of orderedCases) {
    audited.push(await auditOccurrence(entry, loaded, input.sha256));
  }

  const invalid = invalidOccurrences(audited);
  const duplicates = duplicateGroups(audited);
  const paired = audited.filter((entry) => entry.paired);
  const validPaired = paired.filter((entry) => entry.status === "valid");
  const validPairedGroups = duplicateGroups(validPaired);
  const counts = issueCounts(audited);
  const uniqueIdentities = new Set(audited.map((entry) =>
    entry.sourceCase.normalizedGameplayReference.sha256,
  ));
  const validPairedIdentities = new Set(validPaired.map((entry) =>
    entry.sourceCase.normalizedGameplayReference.sha256,
  ));

  if (paired.length !== input.manifest.summary.pairedDonorCaseCount) {
    throw new Error("derived paired occurrence count does not match the corpus manifest summary");
  }

  return {
    reportType: "ccsolver-p1b-corpus-validity",
    reportVersion: 1,
    stability: "preview",
    producerRevision: P1B_CORPUS_VALIDITY_REPORT_PRODUCER_REVISION,
    source: {
      corpusManifest: manifestReference,
      corpusRepository: input.manifest.source.repository,
      corpusRevision: input.manifest.source.revision,
      artifactRepositoryId: TWORLD_ARTIFACT_REPOSITORY_ID,
      normalizationProfile: NORMALIZATION_PROFILE,
      validityPolicyRevision: TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION,
    },
    summary: {
      occurrenceCount: audited.length,
      validOccurrenceCount: audited.length - invalid.length,
      invalidOccurrenceCount: invalid.length,
      pairedOccurrenceCount: paired.length,
      validPairedOccurrenceCount: validPaired.length,
      invalidPairedOccurrenceCount: paired.length - validPaired.length,
      uniqueNormalizedGameplayIdentityCount: uniqueIdentities.size,
      duplicateAliasGroupCount: duplicates.length,
      duplicateAliasOccurrenceCount: duplicates.reduce(
        (sum, group) => sum + group.occurrences.length,
        0,
      ),
      validPairedUniqueNormalizedGameplayIdentityCount: validPairedIdentities.size,
      validPairedDuplicateAliasGroupCount: validPairedGroups.length,
      validPairedDuplicateAliasOccurrenceCount: validPairedGroups.reduce(
        (sum, group) => sum + group.occurrences.length,
        0,
      ),
      ...counts,
    },
    occurrences: redactedOccurrences(audited),
    invalidOccurrences: invalid,
    duplicateOccurrenceGroups: duplicates,
  };
}

export function canonicalP1bCorpusValidityReportJson(
  report: P1bCorpusValidityReportV1,
): CanonicalJson {
  return canonicalizeJson(report);
}
