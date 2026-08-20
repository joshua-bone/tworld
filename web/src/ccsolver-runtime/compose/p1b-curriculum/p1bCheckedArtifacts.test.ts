import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import type { CorpusManifestV1, CorpusSourcePort } from "../p1a-corpus/types";
import {
  P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
  P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
  type P1bMeasuredCorpusCaseV1,
} from "./curriculumManifest";
import type { P1bMeasuredCorpusReportV1 } from "./measuredCorpusReport";
import {
  P1B_KEY_PYRAMID_DIRECTORY,
  buildP1bCheckedArtifacts,
} from "./p1bCheckedArtifacts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const selectedOccurrenceIds = new Set([
  ...P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
  ...P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
]);

const repositorySource: CorpusSourcePort = {
  async readBytes(path) {
    return new Uint8Array(await readFile(resolve(repositoryRoot, path)));
  },
};

async function fixture(): Promise<{
  readonly manifest: CorpusManifestV1;
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
}> {
  const fullManifest = JSON.parse(await readFile(
    resolve(repositoryRoot, "ccsolver/corpus/manifest.v1.json"),
    "utf8",
  )) as CorpusManifestV1;
  const measured = JSON.parse(await readFile(
    resolve(repositoryRoot, "ccsolver/corpus/p1b-measured-corpus.v1.json"),
    "utf8",
  )) as P1bMeasuredCorpusReportV1;
  const cases = fullManifest.cases.filter((entry) =>
    selectedOccurrenceIds.has(entry.occurrenceId as never),
  );
  const packIds = new Set(cases.map((entry) => entry.packId));
  const sourcePaths = new Set(cases.flatMap((entry) =>
    entry.sourceMembers.map((member) => member.sourcePath),
  ));
  const packs = fullManifest.packs.filter((entry) => packIds.has(entry.packId));
  const sources = fullManifest.sources.filter((entry) => sourcePaths.has(entry.path));
  if (cases.length !== selectedOccurrenceIds.size) {
    throw new Error("P1B checked artifact fixture is incomplete");
  }
  return {
    manifest: {
      ...fullManifest,
      packs,
      sources,
      cases,
      summary: {
        donorBackedTargetRecordCount: cases.length * 2,
        lynxOnlyDonorCaseCount: 0,
        mapCaseCount: cases.length,
        msOnlyDonorCaseCount: 0,
        noDonorCaseCount: 0,
        packCount: packs.length,
        pairedDonorCaseCount: cases.length,
        targetRecordCount: cases.length * 2,
      },
    },
    cases: measured.cases.filter((entry) => selectedOccurrenceIds.has(entry.occurrenceId as never)),
  };
}

describe("the shared P1B checked-artifact finalizer", () => {
  it("recomputes validity, consumes supplied cases once, and rebuilds all 12 outputs", async () => {
    const input = await fixture();
    let callbackCount = 0;
    const generated = await buildP1bCheckedArtifacts({
      manifest: input.manifest,
      source: repositorySource,
      sha256: new WebCryptoSha256(),
      async resolveMeasuredCases({ validityReport, measurement }) {
        callbackCount += 1;
        expect(validityReport.summary.validPairedOccurrenceCount).toBe(11);
        expect(measurement.analysisRevisions.catalogRevision).toBe(input.manifest.source.revision);
        return input.cases;
      },
    });

    expect(callbackCount).toBe(1);
    expect(generated.outputs).toHaveLength(12);
    expect(new Set(generated.outputs.map((entry) => entry.path)).size).toBe(12);
    expect(generated.outputs.slice(3).map((entry) => entry.path)).toEqual([
      `${P1B_KEY_PYRAMID_DIRECTORY}/ms/level-facts.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/ms/topology-evidence.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/ms/static-analysis.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/ms/dossier-data.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/level-facts.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/topology-evidence.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/static-analysis.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/dossier-data.v1.json`,
      `${P1B_KEY_PYRAMID_DIRECTORY}/comparison/static-topology-comparison.v1.json`,
    ]);
    await Promise.all(generated.outputs.slice(3).map(async (entry) => {
      expect(entry.canonicalJson).toBe(await readFile(resolve(repositoryRoot, entry.path), "utf8"));
    }));
  }, 30_000);

  it("rejects a tampered measured Key Pyramid reference", async () => {
    const input = await fixture();
    const cases = input.cases.map((entry) => entry.occurrenceId === "cclp1/001"
      ? {
          ...entry,
          comparison: {
            ...entry.comparison,
            content: { ...entry.comparison.content, digest: `sha256:${"0".repeat(64)}` as const },
          },
        }
      : entry);
    await expect(buildP1bCheckedArtifacts({
      manifest: input.manifest,
      source: repositorySource,
      sha256: new WebCryptoSha256(),
      async resolveMeasuredCases() {
        return cases;
      },
    })).rejects.toThrow("Key Pyramid goldens disagree with the measured corpus evidence");
  }, 30_000);

  it("rehashes source bytes before accepting supplied cases", async () => {
    const input = await fixture();
    let callbackCalled = false;
    await expect(buildP1bCheckedArtifacts({
      manifest: input.manifest,
      source: {
        async readBytes(path) {
          const bytes = new Uint8Array(await repositorySource.readBytes(path));
          if (path === input.manifest.cases[0]!.sourceMembers[0]!.sourcePath) bytes[0] ^= 1;
          return bytes;
        },
      },
      sha256: new WebCryptoSha256(),
      async resolveMeasuredCases() {
        callbackCalled = true;
        return input.cases;
      },
    })).rejects.toThrow("corpus source digest mismatch");
    expect(callbackCalled).toBe(false);
  });
});
