import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { describe, expect, it } from "vitest";
import type { CorpusManifestV1 } from "../p1a-corpus/types";
import {
  buildP1bCorpusValidityReport,
  canonicalP1bCorpusValidityReportJson,
} from "./corpusValidityReport";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const manifestPath = resolve(repositoryRoot, "ccsolver/corpus/manifest.v1.json");
const EXPECTED_MANIFEST_DIGEST =
  "bc64d9bbd56e9106b5038ee5d051d98afb39c404c974a721284210a87ecaea25";
const EXPECTED_MANIFEST_BYTE_LENGTH = 3_625_365;

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

async function checkedManifest(): Promise<{
  readonly manifest: CorpusManifestV1;
  readonly text: string;
}> {
  const text = await readFile(manifestPath, "utf8");
  return {
    manifest: JSON.parse(text) as CorpusManifestV1,
    text,
  };
}

let cachedCheckedReport: Promise<ReturnType<typeof buildP1bCorpusValidityReport> extends Promise<infer T> ? T : never> | undefined;

function checkedReport() {
  cachedCheckedReport ??= checkedManifest().then(({ manifest }) =>
    buildP1bCorpusValidityReport({
      manifest,
      source: repositorySource,
      sha256: nodeSha256,
    }),
  );
  return cachedCheckedReport;
}

describe("the P1B full-corpus validity and identity report", () => {
  it("audits every checked occurrence and freezes the measured quarantine boundary", async () => {
    const { manifest, text } = await checkedManifest();
    const report = await checkedReport();

    expect(createHash("sha256").update(text, "utf8").digest("hex"))
      .toBe(EXPECTED_MANIFEST_DIGEST);
    expect(Buffer.byteLength(text, "utf8")).toBe(EXPECTED_MANIFEST_BYTE_LENGTH);
    expect(report.source).toEqual({
      corpusManifest: {
        digest: `sha256:${EXPECTED_MANIFEST_DIGEST}`,
        byteLength: EXPECTED_MANIFEST_BYTE_LENGTH,
      },
      corpusRepository: "joshua-bone/tworld",
      corpusRevision: "42c78d0db343621f887fefce581315479d9a8be3",
      artifactRepositoryId: "tworld",
      normalizationProfile: "tworld-legacy-dat-gameplay-v1",
      validityPolicyRevision: "dattools-cell-validity:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
    });
    expect(report.producerRevision).toBe("ccsolver-p1b-corpus-validity-report-v1");
    expect(report.summary).toMatchObject({
      occurrenceCount: 2_440,
      validOccurrenceCount: 2_385,
      invalidOccurrenceCount: 55,
      pairedOccurrenceCount: 2_257,
      validPairedOccurrenceCount: 2_251,
      invalidPairedOccurrenceCount: 6,
      uniqueNormalizedGameplayIdentityCount: 2_358,
      duplicateAliasGroupCount: 82,
      duplicateAliasOccurrenceCount: 164,
      validPairedUniqueNormalizedGameplayIdentityCount: 2_183,
      validPairedDuplicateAliasGroupCount: 68,
      validPairedDuplicateAliasOccurrenceCount: 136,
      invalidCellCount: 1_745,
      issueRecordCount: 1_745,
      issueReasonCounts: {
        "legacy-invalid-file-code": 123,
        "lower-plane-actor": 40,
        "nonactor-upper-masks-lower-terrain": 1_582,
      },
    });
    expect(report.invalidOccurrences).toHaveLength(55);
    expect(report.occurrences).toHaveLength(2_440);
    expect(report.duplicateOccurrenceGroups).toHaveLength(82);
    expect(report.occurrences[0]).toMatchObject({
      occurrenceId: "cclp1/001",
      artifactOccurrenceId: "tworld:cclp1:001",
    });

    expect(report.summary.issueSignatureCounts).toEqual([
      {
        reasons: ["legacy-invalid-file-code"],
        invalidCellCount: 123,
      },
      {
        reasons: ["lower-plane-actor"],
        invalidCellCount: 40,
      },
      {
        reasons: ["nonactor-upper-masks-lower-terrain"],
        invalidCellCount: 1_582,
      },
    ]);
    expect(report.summary.issueRecordCount).toBe(
      Object.values(report.summary.issueReasonCounts).reduce((sum, count) => sum + count, 0),
    );
    expect(report.summary.invalidCellCount).toBe(
      report.summary.issueSignatureCounts.reduce((sum, entry) => sum + entry.invalidCellCount, 0),
    );

    expect(report.invalidOccurrences.filter((entry) => entry.paired)).toHaveLength(6);
    expect(report.invalidOccurrences.filter((entry) => entry.packId === "cclp2")).toHaveLength(49);
    expect(
      report.invalidOccurrences.filter((entry) => entry.paired).map((entry) => entry.occurrenceId),
    ).toEqual([
      "cclp5-voting-acrylic/018",
      "cclp5-voting-darkness/030",
      "cclp5-voting-eagle/009",
      "cclp5-voting-juicy/015",
      "cclp5-voting-juicy/036",
      "cclp5-voting-raspberry/030",
    ]);

    expect(report.invalidOccurrences.reduce(
      (sum, entry) => sum + entry.validity.issues.length,
      0,
    )).toBe(1_745);
    expect(report.invalidOccurrences.every((entry) =>
      entry.validity.invalidCellCount
        === new Set(entry.validity.issues.map((issue) => `${issue.z}/${issue.cell}`)).size,
    )).toBe(true);

    const knownAlias = report.duplicateOccurrenceGroups.find((group) =>
      group.occurrences.some((entry) => entry.occurrenceId === "cclp5/098"),
    );
    expect(knownAlias?.occurrences.map((entry) => entry.occurrenceId)).toEqual([
      "cclp5-voting-immunity/042",
      "cclp5/098",
    ]);
  }, 180_000);

  it("is canonically byte-stable and carries no donor replay metadata", async () => {
    const { manifest } = await checkedManifest();
    const first = await checkedReport();
    const second = await buildP1bCorpusValidityReport({
      manifest: structuredClone(manifest),
      source: repositorySource,
      sha256: nodeSha256,
    });
    const reversed = await buildP1bCorpusValidityReport({
      manifest: {
        ...structuredClone(manifest),
        cases: [...manifest.cases].reverse(),
      },
      source: repositorySource,
      sha256: nodeSha256,
    });
    const canonical = canonicalP1bCorpusValidityReportJson(first);

    expect(canonicalP1bCorpusValidityReportJson(second)).toBe(canonical);
    expect(reversed.summary).toEqual(first.summary);
    expect(reversed.invalidOccurrences).toEqual(first.invalidOccurrences);
    expect(reversed.duplicateOccurrenceGroups).toEqual(first.duplicateOccurrenceGroups);
    expect(reversed.source.corpusManifest.digest).not.toBe(first.source.corpusManifest.digest);
    expect(JSON.stringify(JSON.parse(canonical))).toBe(canonical);
    expect(first.invalidOccurrences.map((entry) => entry.occurrenceId)).toEqual(
      [...first.invalidOccurrences.map((entry) => entry.occurrenceId)].sort(),
    );
    expect(first.duplicateOccurrenceGroups.map((entry) => entry.normalizedGameplaySha256)).toEqual(
      [...first.duplicateOccurrenceGroups.map((entry) => entry.normalizedGameplaySha256)].sort(),
    );
    for (const group of first.duplicateOccurrenceGroups) {
      expect(group.occurrences.map((entry) => entry.occurrenceId)).toEqual(
        [...group.occurrences.map((entry) => entry.occurrenceId)].sort(),
      );
    }
    expect(canonical).not.toContain("bestTimeTicks");
    expect(canonical).not.toContain("randomSeed");
    expect(canonical).not.toContain("moveCount");
    expect(canonical).not.toContain("entrySha256");
    expect(canonical).not.toContain(".tws");

    const malicious = structuredClone(manifest);
    Object.assign(malicious.cases[0]!.sourceMembers[0]!, {
      donorPath: "save/secret.tws",
      bestTimeTicks: 123,
    });
    const projected = await buildP1bCorpusValidityReport({
      manifest: malicious,
      source: repositorySource,
      sha256: nodeSha256,
    });
    expect(canonicalP1bCorpusValidityReportJson(projected)).not.toContain("secret.tws");
  }, 180_000);

  it("fails closed when a source blob no longer matches the checked manifest", async () => {
    const { manifest } = await checkedManifest();
    const firstMember = manifest.cases[0]!.sourceMembers[0]!;
    const source = {
      async readBytes(path: string): Promise<Uint8Array> {
        const bytes = await repositorySource.readBytes(path);
        if (path === firstMember.sourcePath) {
          bytes[firstMember.byteOffset] = bytes[firstMember.byteOffset]! ^ 0xff;
        }
        return bytes;
      },
    };

    await expect(buildP1bCorpusValidityReport({
      manifest,
      source,
      sha256: nodeSha256,
    })).rejects.toThrow(`corpus source digest mismatch: ${firstMember.sourcePath}`);
  });

  it("verifies each member slice even after its containing source blob passes", async () => {
    const { manifest } = await checkedManifest();
    const changedManifest = structuredClone(manifest);
    const firstCase = changedManifest.cases[0]!;
    const firstMember = firstCase.sourceMembers[0]!;
    const changedSource = await repositorySource.readBytes(firstMember.sourcePath);
    changedSource[firstMember.byteOffset] = changedSource[firstMember.byteOffset]! ^ 0xff;
    const sourcePin = changedManifest.sources.find((entry) => entry.path === firstMember.sourcePath);
    if (sourcePin === undefined) throw new Error("test corpus source pin is absent");
    Object.assign(sourcePin, {
      sha256: createHash("sha256").update(changedSource).digest("hex"),
    });

    await expect(buildP1bCorpusValidityReport({
      manifest: changedManifest,
      source: {
        async readBytes(path) {
          return path === firstMember.sourcePath
            ? new Uint8Array(changedSource)
            : repositorySource.readBytes(path);
        },
      },
      sha256: nodeSha256,
    })).rejects.toThrow(`corpus source member digest mismatch: ${firstCase.occurrenceId}/0`);
  });

  it("recomputes normalized gameplay identity from the verified member bytes", async () => {
    const { manifest } = await checkedManifest();
    const firstCase = manifest.cases[0]!;
    const changedManifest = {
      ...structuredClone(manifest),
      cases: [
        {
          ...structuredClone(firstCase),
          normalizedGameplayReference: {
            ...firstCase.normalizedGameplayReference,
            sha256: "0".repeat(64),
          },
        },
        ...structuredClone(manifest.cases.slice(1)),
      ],
    };

    await expect(buildP1bCorpusValidityReport({
      manifest: changedManifest,
      source: repositorySource,
      sha256: nodeSha256,
    })).rejects.toThrow(`normalized gameplay identity mismatch: ${firstCase.occurrenceId}`);
  });
});
