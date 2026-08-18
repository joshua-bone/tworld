import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { beforeAll, describe, expect, it } from "vitest";
import type { CorpusManifestV1 } from "../p1a-corpus/types";
import { artifactOccurrenceIdForCorpusOccurrence } from "./corpusArtifactIdentity";
import type {
  P1bCorpusOccurrenceV1,
  P1bCorpusValidityReportV1,
} from "./corpusValidityReport";
import {
  buildP1bMeasuredCorpusReport,
  canonicalP1bMeasuredCorpusReportJson,
  measureP1bCorpusOccurrences,
  type P1bMeasuredCorpusReportAnalysisRevisionsV1,
} from "./measuredCorpusReport";
import { buildP1bMeasuredCorpusReportSharded } from "./measuredCorpusSharding";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

const nodeSha256: Sha256Port = {
  async digestBytes(value) {
    return new Uint8Array(createHash("sha256").update(value).digest());
  },
  async digestUtf8(value) {
    return new Uint8Array(createHash("sha256").update(value, "utf8").digest());
  },
};

const repositorySource = {
  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await readFile(resolve(repositoryRoot, path)));
  },
};

const revisions: P1bMeasuredCorpusReportAnalysisRevisionsV1 = {
  artifactProducerRevision: "ccsolver:p1b-measured-report-test",
  importProfileRevision: "test:import-profile",
  factsAnalyzerRevision: "test:facts-analyzer",
  staticAnalyzerRevision: "test:static-analyzer",
  catalogRevision: "test:catalog",
  msAdapterRevision: "test:ms-adapter",
  lynxAdapterRevision: "test:lynx-adapter",
  msPolicyRevision: "test:ms-policy",
  lynxPolicyRevision: "test:lynx-policy",
};

let manifest: CorpusManifestV1;
let validityReport: P1bCorpusValidityReportV1;

function pairedOccurrence(
  sourceCase: CorpusManifestV1["cases"][number],
): P1bCorpusOccurrenceV1 {
  return {
    caseId: sourceCase.caseId,
    occurrenceId: sourceCase.occurrenceId,
    artifactOccurrenceId: artifactOccurrenceIdForCorpusOccurrence(sourceCase.occurrenceId),
    packId: sourceCase.packId,
    levelNumber: sourceCase.levelNumber,
    title: sourceCase.title,
    author: sourceCase.author,
    normalizedGameplaySha256: sourceCase.normalizedGameplayReference.sha256,
    paired: true,
    sourceMembers: sourceCase.sourceMembers.map((member) => ({ ...member })),
    validity: { status: "valid", issueCount: 0, invalidCellCount: 0 },
  };
}

beforeAll(async () => {
  manifest = JSON.parse(await readFile(
    resolve(repositoryRoot, "ccsolver/corpus/manifest.v1.json"),
    "utf8",
  )) as CorpusManifestV1;
  const occurrences = ["cclp1/001", "cclp1/005"].map((occurrenceId) => {
    const sourceCase = manifest.cases.find((entry) => entry.occurrenceId === occurrenceId);
    if (sourceCase === undefined) throw new Error(`missing test occurrence: ${occurrenceId}`);
    return pairedOccurrence(sourceCase);
  });
  const manifestCanonical = canonicalizeJson(manifest);
  validityReport = {
    reportType: "ccsolver-p1b-corpus-validity",
    reportVersion: 1,
    stability: "preview",
    producerRevision: "ccsolver-p1b-corpus-validity-report-v1",
    source: {
      corpusManifest: await referenceCanonicalJson(manifestCanonical, nodeSha256),
      corpusRepository: "joshua-bone/tworld",
      corpusRevision: manifest.source.revision,
      artifactRepositoryId: "tworld",
      normalizationProfile: "tworld-legacy-dat-gameplay-v1",
      validityPolicyRevision:
        "dattools-cell-validity:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
    },
    summary: {
      occurrenceCount: occurrences.length,
      validOccurrenceCount: occurrences.length,
      invalidOccurrenceCount: 0,
      pairedOccurrenceCount: occurrences.length,
      validPairedOccurrenceCount: occurrences.length,
      invalidPairedOccurrenceCount: 0,
      uniqueNormalizedGameplayIdentityCount: occurrences.length,
      duplicateAliasGroupCount: 0,
      duplicateAliasOccurrenceCount: 0,
      validPairedUniqueNormalizedGameplayIdentityCount: occurrences.length,
      validPairedDuplicateAliasGroupCount: 0,
      validPairedDuplicateAliasOccurrenceCount: 0,
      invalidCellCount: 0,
      issueRecordCount: 0,
      issueReasonCounts: {
        "legacy-invalid-file-code": 0,
        "lower-plane-actor": 0,
        "nonactor-upper-masks-lower-terrain": 0,
      },
      issueSignatureCounts: [],
    },
    occurrences,
    invalidOccurrences: [],
    duplicateOccurrenceGroups: [],
  };
}, 30_000);

describe("the P1B measured corpus report", () => {
  it("assembles process-shard-shaped results byte-identically to serial measurement", async () => {
    const serial = await buildP1bMeasuredCorpusReport({
      validityReport,
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxConcurrency: 1,
    });
    const sharded = await buildP1bMeasuredCorpusReportSharded({
      validityReport,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxWorkers: 2,
      async runShard({ occurrences, measurement, signal }) {
        expect(signal.aborted).toBe(false);
        return measureP1bCorpusOccurrences({
          ...measurement,
          occurrences,
          source: repositorySource,
          sha256: nodeSha256,
          maxConcurrency: 1,
        });
      },
    });

    expect(sharded.canonicalJson).toBe(serial.canonicalJson);
    expect(sharded.content).toEqual(serial.content);
  }, 60_000);

  it("aborts and drains sibling shards before surfacing a shard failure", async () => {
    let siblingAborted = false;
    let siblingSettled = false;
    const failing = buildP1bMeasuredCorpusReportSharded({
      validityReport,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxWorkers: 2,
      async runShard({ shardIndex, signal }) {
        if (shardIndex === 0) {
          await Promise.resolve();
          throw new Error("deliberate shard failure");
        }
        await new Promise<void>((resolvePromise) => {
          signal.addEventListener("abort", () => {
            siblingAborted = true;
            resolvePromise();
          }, { once: true });
        });
        siblingSettled = true;
        return [];
      },
    });

    await expect(failing).rejects.toThrow("deliberate shard failure");
    expect(siblingAborted).toBe(true);
    expect(siblingSettled).toBe(true);
  });

  it("rejects process counts above the measured eight-worker memory cap", async () => {
    await expect(buildP1bMeasuredCorpusReportSharded({
      validityReport,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxWorkers: 9,
      async runShard() {
        throw new Error("must not run");
      },
    })).rejects.toThrow("max workers must be an integer from 1 through 8");
  });

  it("measures every valid paired occurrence by default with byte-stable bounded concurrency", async () => {
    const serial = await buildP1bMeasuredCorpusReport({
      validityReport,
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxConcurrency: 1,
    });
    const parallel = await buildP1bMeasuredCorpusReport({
      validityReport: structuredClone(validityReport),
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxConcurrency: 2,
    });

    expect(parallel.canonicalJson).toBe(serial.canonicalJson);
    expect(parallel.content).toEqual(serial.content);
    expect(canonicalP1bMeasuredCorpusReportJson(parallel.report)).toBe(serial.canonicalJson);
    expect(parallel.report.scope).toEqual({ kind: "all-valid-paired" });
    expect(parallel.report.summary).toMatchObject({
      corpusOccurrenceCount: 2,
      eligibleValidPairedOccurrenceCount: 2,
      scopeOccurrenceCount: 2,
      measuredOccurrenceCount: 2,
      unmeasuredEligibleOccurrenceCount: 0,
      fullValidPairedCoverage: true,
    });
    expect(parallel.report.cases.map((entry) => entry.occurrenceId)).toEqual([
      "cclp1/001",
      "cclp1/005",
    ]);
    expect(parallel.report.cases.every((entry) =>
      entry.targets.map((target) => target.target).join(",") === "ms,lynx",
    )).toBe(true);
  }, 60_000);

  it("marks a bounded explicit test subset and binds both exact upstream reports", async () => {
    const result = await buildP1bMeasuredCorpusReport({
      validityReport,
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      explicitTestSubsetOccurrenceIds: ["cclp1/005"],
      maxConcurrency: 4,
    });
    const validityCanonical = canonicalizeJson(validityReport);

    expect(result.report.scope).toEqual({
      kind: "explicit-test-subset",
      occurrenceIds: ["cclp1/005"],
    });
    expect(result.report.summary).toMatchObject({
      eligibleValidPairedOccurrenceCount: 2,
      scopeOccurrenceCount: 1,
      measuredOccurrenceCount: 1,
      unmeasuredEligibleOccurrenceCount: 1,
      fullValidPairedCoverage: false,
    });
    expect(result.report.source.corpusManifest)
      .toEqual(validityReport.source.corpusManifest);
    expect(result.report.source.corpusValidityReport)
      .toEqual(await referenceCanonicalJson(validityCanonical, nodeSha256));
    expect(result.report.source.sourceMemberVerification)
      .toBe("sha256-rehashed");
  }, 30_000);

  it("projects no donor replay metadata even when caller objects carry extra fields", async () => {
    const malicious = structuredClone(validityReport);
    Object.assign(malicious.occurrences[0]!, {
      donorPath: "save/secret.tws",
      bestTimeTicks: 123,
      randomSeed: 456,
      moveCount: 789,
    });
    const result = await buildP1bMeasuredCorpusReport({
      validityReport: malicious,
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      explicitTestSubsetOccurrenceIds: ["cclp1/001"],
    });

    expect(result.canonicalJson).not.toContain("secret.tws");
    expect(result.canonicalJson).not.toContain("bestTimeTicks");
    expect(result.canonicalJson).not.toContain("randomSeed");
    expect(result.canonicalJson).not.toContain("moveCount");
  }, 30_000);

  it("fails closed when any selected source-member slice does not re-hash", async () => {
    const badOccurrence = validityReport.occurrences[1]!;
    const badMember = badOccurrence.sourceMembers[0]!;
    const source = {
      async readBytes(path: string): Promise<Uint8Array> {
        const bytes = await repositorySource.readBytes(path);
        if (path === badMember.sourcePath) {
          bytes[badMember.byteOffset] = bytes[badMember.byteOffset]! ^ 0xff;
        }
        return bytes;
      },
    };

    await expect(buildP1bMeasuredCorpusReport({
      validityReport,
      source,
      sha256: nodeSha256,
      analysisRevisions: revisions,
      maxConcurrency: 2,
    })).rejects.toThrow(
      `corpus source member digest mismatch: ${badOccurrence.occurrenceId}/0`,
    );
  }, 30_000);

  it("rejects non-eligible, duplicate, empty, and unknown explicit subsets", async () => {
    const invalid: P1bCorpusValidityReportV1 = {
      ...structuredClone(validityReport),
      occurrences: validityReport.occurrences.map((occurrence, index) => index === 0
        ? {
            ...occurrence,
            validity: { status: "invalid", issueCount: 1, invalidCellCount: 1 },
          }
        : { ...occurrence }),
      summary: {
        ...validityReport.summary,
        validOccurrenceCount: 1,
        invalidOccurrenceCount: 1,
        validPairedOccurrenceCount: 1,
        invalidPairedOccurrenceCount: 1,
        validPairedUniqueNormalizedGameplayIdentityCount: 1,
      },
    };

    const base = {
      source: repositorySource,
      sha256: nodeSha256,
      analysisRevisions: revisions,
    } as const;
    await expect(buildP1bMeasuredCorpusReport({
      ...base,
      validityReport,
      explicitTestSubsetOccurrenceIds: [],
    })).rejects.toThrow("explicit test subset must contain at least one occurrence id");
    await expect(buildP1bMeasuredCorpusReport({
      ...base,
      validityReport,
      explicitTestSubsetOccurrenceIds: ["cclp1/001", "cclp1/001"],
    })).rejects.toThrow("duplicate explicit test subset occurrence id: cclp1/001");
    await expect(buildP1bMeasuredCorpusReport({
      ...base,
      validityReport,
      explicitTestSubsetOccurrenceIds: ["missing/999"],
    })).rejects.toThrow("explicit test subset occurrence is absent: missing/999");
    await expect(buildP1bMeasuredCorpusReport({
      ...base,
      validityReport: invalid,
      explicitTestSubsetOccurrenceIds: ["cclp1/001"],
    })).rejects.toThrow("explicit test subset occurrence is not valid and paired: cclp1/001");
  });
});
