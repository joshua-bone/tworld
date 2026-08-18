import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { CorpusManifestV1 } from "../p1a-corpus/types";
import { buildTworldPairedStaticAnalysis } from "../buildTworldPairedStaticAnalysis";
import { artifactOccurrenceIdForCorpusOccurrence } from "./corpusArtifactIdentity";
import { deriveP1bMeasuredCorpusCase } from "./deriveMeasuredCorpusCase";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const sha256 = new WebCryptoSha256();

describe("deriveP1bMeasuredCorpusCase", () => {
  it("binds a real paired Key Pyramid analysis to its redacted corpus identity", async () => {
    const manifest = JSON.parse(await readFile(
      resolve(repositoryRoot, "ccsolver/corpus/manifest.v1.json"),
      "utf8",
    )) as CorpusManifestV1;
    const sourceCase = manifest.cases.find((entry) => entry.occurrenceId === "cclp1/001");
    if (sourceCase === undefined) throw new Error("Key Pyramid is absent from the corpus");
    const sourcePath = sourceCase.sourceMembers[0]!.sourcePath;
    const containerBytes = new Uint8Array(await readFile(resolve(repositoryRoot, sourcePath)));
    const layerData = sourceCase.sourceMembers.map((member) =>
      containerBytes.slice(member.byteOffset, member.byteOffset + member.byteLength),
    );
    const artifactOccurrenceId = artifactOccurrenceIdForCorpusOccurrence(sourceCase.occurrenceId);
    const paired = await buildTworldPairedStaticAnalysis({
      occurrenceId: artifactOccurrenceId,
      producerRevision: "ccsolver:p1b-test",
      repository: "tworld",
      repositoryRevision: manifest.source.revision,
      sourcePath,
      importProfileRevision: "test:import-profile",
      analyzerRevision: "test:facts-analyzer",
      staticAnalyzerRevision: "test:static-analyzer",
      catalogRevision: manifest.source.revision,
      msAdapterRevision: "test:ms-adapter",
      lynxAdapterRevision: "test:lynx-adapter",
      msPolicyRevision: "test:ms-policy",
      lynxPolicyRevision: "test:lynx-policy",
      containerBytes,
      loaded: { levelData: layerData[0]!, layerData },
    }, sha256);
    const measured = deriveP1bMeasuredCorpusCase({
      occurrence: {
        caseId: sourceCase.caseId,
        occurrenceId: sourceCase.occurrenceId,
        artifactOccurrenceId,
        packId: sourceCase.packId,
        levelNumber: sourceCase.levelNumber,
        title: sourceCase.title,
        author: sourceCase.author,
        normalizedGameplaySha256: sourceCase.normalizedGameplayReference.sha256,
        paired: true,
        sourceMembers: sourceCase.sourceMembers,
        validity: { status: "valid", issueCount: 0, invalidCellCount: 0 },
      },
      paired,
    });

    expect(measured.occurrenceId).toBe("cclp1/001");
    expect(measured.targets.map((entry) => entry.target)).toEqual(["ms", "lynx"]);
    expect(measured.targets[0].features.logicalCellCount).toBe(1_024);
    expect(measured.sourceFeatures.logicalCellCount).toBe(1_024);
    expect(measured.comparison.cellPolicyDifferenceCount).toBe(
      paired.comparison.cellPolicyDifferences.length,
    );
    expect(measured.comparison.status).toBe(paired.comparison.status);
  }, 30_000);
});
