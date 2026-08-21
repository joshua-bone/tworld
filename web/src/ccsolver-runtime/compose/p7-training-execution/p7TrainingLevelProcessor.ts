import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  processCclp1FoundationLevel,
  type ProcessedCclp1FoundationLevel,
} from "../p7b-cohort/buildCclp1FoundationCohort";
import type {
  LoadedCclp1FoundationLevel,
  LoadedCclp1FoundationTarget,
} from "../p7b-cohort/loadCclp1FoundationCohort";
import {
  buildCclp1FoundationBrowserReplayLevel,
} from "../p7b-portable/buildCclp1FoundationBrowserReplayInputs";
import {
  buildCclp1FoundationPortableLevel,
  type P7bPortableCclp1FoundationLevel,
} from "../p7b-portable/buildCclp1FoundationPortableCohort";
import {
  composeCclp1FoundationTrainingReplayLevel,
} from "../p7b-portable/composeCclp1FoundationTrainingReplayPack";
import {
  buildP7bTrainingReplayLevel,
  type P7bRawDonorReferenceV1,
} from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
} from "../p7b-training/portableReplayProfile";
import {
  materializeDetachedLevelSource,
  materializeDetachedReplayBytes,
  materializeDetachedReplaySolution,
  type P7TrainingDonorCandidate,
  type P7TrainingLevelInventory,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";
import {
  buildP7TrainingMapComparisonEvidenceValue,
  type P7TrainingLevelProcessOutputV1,
} from "./p7TrainingShardProtocol";

function sourceLevelContent(input: {
  readonly occurrenceId: string;
  readonly mapPath: string;
  readonly levelNumber: number;
  readonly sourceMembers: P7TrainingLevelInventory["source"]["sourceMembers"];
}): BlobReferenceV1 {
  const member = input.sourceMembers.find(({ ordinal }) => ordinal === 0);
  if (
    member === undefined
    || member.sourcePath !== input.mapPath
    || member.sourceLevelNumber !== input.levelNumber
  ) throw new Error(`${input.occurrenceId} lacks its exact ordinal-zero source member`);
  return { digest: `sha256:${member.sha256}`, byteLength: member.byteLength };
}

function selectedCandidates(row: P7TrainingLevelInventory) {
  return (["ms", "lynx"] as const).map((target) => ({
    target,
    candidate: row.targets.find((entry) => entry.target === target)!.donorCandidates[0] ?? null,
  }));
}

function sourceIsEligible(row: P7TrainingLevelInventory): boolean {
  return row.eligibility.sourceScope.status === "eligible"
    && row.eligibility.legacyValidity.status === "valid";
}

async function retainProvenance(input: {
  readonly row: P7TrainingLevelInventory;
  readonly candidates: ReturnType<typeof selectedCandidates>;
  readonly evidence: P7GeneratedEvidenceStore;
}): Promise<{
  readonly eligibilityEvidence: BlobReferenceV1;
  readonly comparisonByCandidateId: ReadonlyMap<string, BlobReferenceV1 | null>;
}> {
  const eligibilityEvidence = await input.evidence.referenceCanonical(input.row.eligibility);
  const comparisonByCandidateId = new Map<string, BlobReferenceV1 | null>();
  for (const { candidate } of input.candidates) {
    if (candidate === null || comparisonByCandidateId.has(candidate.candidateId)) continue;
    const value = buildP7TrainingMapComparisonEvidenceValue(input.row, candidate);
    comparisonByCandidateId.set(
      candidate.candidateId,
      value === null ? null : await input.evidence.referenceCanonical(value),
    );
  }
  return { eligibilityEvidence, comparisonByCandidateId };
}

function rawDonors(input: {
  readonly candidates: ReturnType<typeof selectedCandidates>;
  readonly comparisonByCandidateId: ReadonlyMap<string, BlobReferenceV1 | null>;
}): P7bRawDonorReferenceV1[] {
  const byId = new Map<string, P7bRawDonorReferenceV1>();
  for (const { target, candidate } of input.candidates) {
    if (candidate === null || byId.has(candidate.candidateId)) continue;
    byId.set(candidate.candidateId, {
      donorId: candidate.candidateId,
      target,
      origin: candidate.source.origin,
      sourcePackId: candidate.source.packId,
      sourceLevelNumber: candidate.source.levelNumber,
      sourceNormalizedGameplaySha256: candidate.source.normalizedGameplaySha256,
      sourceLevelContent: sourceLevelContent({
        occurrenceId: candidate.source.occurrenceId,
        mapPath: candidate.source.mapPath,
        levelNumber: candidate.source.levelNumber,
        sourceMembers: candidate.source.sourceMembers,
      }),
      replayContent: candidate.replay.content,
      mapRelationship: candidate.mapRelationship,
      mapComparisonEvidence: input.comparisonByCandidateId.get(candidate.candidateId) ?? null,
    });
  }
  return [...byId.values()];
}

function browserTargets(row: P7TrainingLevelInventory) {
  const target = (name: "ms" | "lynx") => {
    const execution = row.targets.find(({ target }) => target === name)!.execution;
    return {
      request: structuredClone(execution.request),
      display: structuredClone(execution.display),
    };
  };
  return {
    ms: target("ms"),
    lynx: target("lynx"),
  };
}

async function blockedOutput(input: {
  readonly row: P7TrainingLevelInventory;
  readonly candidates: ReturnType<typeof selectedCandidates>;
  readonly status: "ineligible" | "missing-donor";
  readonly detail: string;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingLevelProcessOutputV1> {
  const evidence = new P7GeneratedEvidenceStore({
    scopeId: `${input.row.occurrenceId}/processed`,
    sha256: input.sha256,
  });
  const provenance = await retainProvenance({
    row: input.row,
    candidates: input.candidates,
    evidence,
  });
  const donors = rawDonors({
    candidates: input.candidates,
    comparisonByCandidateId: provenance.comparisonByCandidateId,
  });
  const eligible = sourceIsEligible(input.row);
  return {
    status: input.status,
    detail: input.detail,
    trainingReplayLevel: buildP7bTrainingReplayLevel({
      artifact: "ccsolver-p7b-training-replay-level",
      version: 1,
      source: {
        packId: input.row.packId,
        levelNumber: input.row.levelNumber,
        title: input.row.title,
        normalizedGameplaySha256: input.row.source.normalizedGameplaySha256,
        levelContent: sourceLevelContent({
          occurrenceId: input.row.occurrenceId,
          mapPath: input.row.source.mapPath,
          levelNumber: input.row.levelNumber,
          sourceMembers: input.row.source.sourceMembers,
        }),
        eligibility: {
          status: eligible ? "eligible" : "ineligible",
          standardOnly: eligible,
          policyRevision: `${input.row.eligibility.sourceScope.policyRevision}+${input.row.eligibility.legacyValidity.policyRevision}`,
          evidence: provenance.eligibilityEvidence,
        },
      },
      donorCoverage: Object.fromEntries(input.candidates.map(({ target, candidate }) => [
        target,
        candidate === null
          ? { status: "missing", rawDonorId: null, detail: "no deterministic donor candidate" }
          : { status: "bound", rawDonorId: candidate.candidateId, detail: "deterministic inventory donor bound" },
      ])),
      rawDonors: donors,
      variants: [],
      processing: { status: "blocked", detail: input.detail },
      viewableVariantId: null,
    }),
    browserTargets: browserTargets(input.row),
    browserReplays: [],
    portableDecisionTraces: [],
    generatedEvidence: evidence.bundle(),
  };
}

function loadedTarget(
  row: P7TrainingLevelInventory,
  target: "ms" | "lynx",
  candidate: P7TrainingDonorCandidate,
): LoadedCclp1FoundationTarget {
  const execution = row.targets.find((entry) => entry.target === target)!.execution;
  return {
    target,
    donorId: candidate.candidateId,
    seriesConfigPath: execution.seriesConfigPath,
    seriesFile: execution.request.seriesFile,
    donor: candidate.donorReference,
    rawReplayBytes: materializeDetachedReplayBytes(candidate.replay),
    expandedSolution: materializeDetachedReplaySolution(candidate.replay),
    bestTimeTicks: candidate.replay.bestTimeTicks,
  };
}

function loadedLevel(
  row: P7TrainingLevelInventory,
  candidates: ReturnType<typeof selectedCandidates>,
): LoadedCclp1FoundationLevel {
  const source = materializeDetachedLevelSource(row.source);
  const available = candidates.flatMap(({ target, candidate }) => (
    candidate === null ? [] : [{ target, candidate }]
  ));
  if (available.length === 0) throw new Error(`${row.occurrenceId} has no materializable donor`);
  const canaries = [
    ...(available.some(({ candidate }) => candidate.replay.stepping !== 0)
      ? ["stepping" as const]
      : []),
    ...(available.some(({ candidate }) => candidate.donorReference.containsMouseInput)
      ? ["ms-mouse" as const]
      : []),
  ];
  return {
    selection: {
      occurrenceId: row.occurrenceId,
      levelNumber: row.levelNumber,
      title: row.title,
      caseId: row.caseId as `case:sha256:${string}`,
      normalizedGameplaySha256: row.source.normalizedGameplaySha256,
      canaries,
    },
    manifestCase: row.manifestCase,
    validityOccurrence: row.validityOccurrence,
    eligibility: row.eligibility,
    source: {
      mapPath: row.source.mapPath,
      containerBytes: source.containerBytes,
      levelData: source.levelData,
      layerData: source.layerData,
    },
    targets: available.map(({ target, candidate }) => loadedTarget(row, target, candidate)),
  };
}

async function mergeEvidence(input: {
  readonly row: P7TrainingLevelInventory;
  readonly portable: P7bPortableCclp1FoundationLevel;
  readonly candidates: ReturnType<typeof selectedCandidates>;
  readonly sha256: Sha256Port;
}): Promise<{
  readonly portable: P7bPortableCclp1FoundationLevel;
  readonly comparisonByCandidateId: ReadonlyMap<string, BlobReferenceV1 | null>;
}> {
  const evidence = new P7GeneratedEvidenceStore({
    scopeId: `${input.row.occurrenceId}/processed`,
    sha256: input.sha256,
  });
  await evidence.importBundle(input.portable.generatedEvidence);
  const provenance = await retainProvenance({
    row: input.row,
    candidates: input.candidates,
    evidence,
  });
  return {
    portable: { ...input.portable, generatedEvidence: evidence.bundle() },
    comparisonByCandidateId: provenance.comparisonByCandidateId,
  };
}

export async function p7TrainingPortableProfileContent(
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<BlobReferenceV1> {
  return referenceCanonicalJson(
    canonicalizeJson(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1 as unknown as CanonicalJsonValue),
    sha256,
  );
}

/** One shared profile blob per pack; occurrence sidecars deliberately omit it. */
export async function buildP7TrainingPackGeneratedEvidence(
  packId: P7TrainingLevelInventory["packId"],
  sha256: Sha256Port = new WebCryptoSha256(),
) {
  const evidence = new P7GeneratedEvidenceStore({ scopeId: `${packId}/pack`, sha256 });
  const content = await evidence.referenceCanonical(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1);
  return { profileContent: content, generatedEvidence: evidence.bundle() };
}

function rewrittenContract(input: {
  readonly row: P7TrainingLevelInventory;
  readonly processed: ProcessedCclp1FoundationLevel;
  readonly portable: P7bPortableCclp1FoundationLevel;
  readonly base: ReturnType<typeof composeCclp1FoundationTrainingReplayLevel>;
  readonly candidates: ReturnType<typeof selectedCandidates>;
  readonly comparisonByCandidateId: ReadonlyMap<string, BlobReferenceV1 | null>;
}) {
  const donors = rawDonors({
    candidates: input.candidates,
    comparisonByCandidateId: input.comparisonByCandidateId,
  });
  const byTarget = new Map(input.candidates.flatMap(({ target, candidate }) => (
    candidate === null ? [] : [[target, candidate] as const]
  )));
  const variants = input.base.variants.map((variant) => {
    const lineageTarget = variant.kind === "portable"
      ? input.portable.lineage.target
      : variant.variantId === "raw-ms" ? "ms" : "lynx";
    return {
      ...variant,
      lineage: {
        ...variant.lineage,
        rawDonorId: byTarget.get(lineageTarget)!.candidateId,
      },
    };
  });
  const certified = variants.some((variant) => (
    variant.certifications.ms.status === "certified"
    || variant.certifications.lynx.status === "certified"
  ));
  const status = certified ? "complete" as const : "no-certified-replay" as const;
  const detail = certified
    ? "deterministic donor executions processed on the official map"
    : "all deterministic donor executions terminated without a certified win";
  return {
    status,
    detail,
    level: buildP7bTrainingReplayLevel({
      ...input.base,
      source: {
        ...input.base.source,
        packId: input.row.packId,
        levelNumber: input.row.levelNumber,
        title: input.row.title,
        normalizedGameplaySha256: input.row.source.normalizedGameplaySha256,
        levelContent: input.processed.levelContent,
      },
      donorCoverage: Object.fromEntries(input.candidates.map(({ target, candidate }) => [
        target,
        candidate === null
          ? { status: "missing", rawDonorId: null, detail: "no deterministic donor candidate" }
          : { status: "bound", rawDonorId: candidate.candidateId, detail: "deterministic inventory donor bound" },
      ])),
      rawDonors: donors,
      variants,
      processing: { status: certified ? "complete" : "blocked", detail },
      viewableVariantId: certified ? input.base.viewableVariantId : null,
    }),
  };
}

/**
 * Production per-row processor used by bounded shards. WeakMap-backed corpus
 * bytes are materialized only inside this call; every native execution uses
 * the official row map and official target request.
 */
export async function processP7TrainingLevel(
  row: P7TrainingLevelInventory,
  sha256: Sha256Port = new WebCryptoSha256(),
): Promise<P7TrainingLevelProcessOutputV1> {
  const candidates = selectedCandidates(row);
  if (!sourceIsEligible(row)) {
    return blockedOutput({
      row,
      candidates,
      status: "ineligible",
      detail: "official source is outside the checked standard-only policy",
      sha256,
    });
  }
  if (candidates.every(({ candidate }) => candidate === null)) {
    return blockedOutput({
      row,
      candidates,
      status: "missing-donor",
      detail: "no target donor candidate is available",
      sha256,
    });
  }
  const processed = await processCclp1FoundationLevel(loadedLevel(row, candidates), sha256);
  const profileContent = await p7TrainingPortableProfileContent(sha256);
  const initialPortable = await buildCclp1FoundationPortableLevel(
    processed,
    profileContent,
    sha256,
  );
  const merged = await mergeEvidence({
    row,
    portable: initialPortable,
    candidates,
    sha256,
  });
  const browser = await buildCclp1FoundationBrowserReplayLevel(merged.portable, sha256);
  const composed = composeCclp1FoundationTrainingReplayLevel(merged.portable, browser);
  const rewritten = rewrittenContract({
    row,
    processed,
    portable: merged.portable,
    base: composed,
    candidates,
    comparisonByCandidateId: merged.comparisonByCandidateId,
  });
  return {
    status: rewritten.status,
    detail: rewritten.detail,
    trainingReplayLevel: rewritten.level,
    browserTargets: browserTargets(row),
    browserReplays: browser.browserReplays,
    portableDecisionTraces: browser.portableDecisionTrace === null
      ? []
      : [browser.portableDecisionTrace],
    generatedEvidence: browser.generatedEvidence,
  };
}
