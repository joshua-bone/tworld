import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldMsStaticAnalysis } from "./buildTworldMsStaticAnalysis";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../");
const sha256 = new WebCryptoSha256();

async function buildIntroLevel8() {
  const loaded = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: "intro-ms.dac",
    levelNumber: 8,
    ruleset: "MS",
  });
  const containerBytes = new Uint8Array(
    await readFile(resolve(repositoryRoot, "data/intro.dat")),
  );
  return buildTworldMsStaticAnalysis({
    occurrenceId: "tworld:intro:8",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "data/intro.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    catalogRevision: "test:catalog",
    policyRevision: "test:ms-topology-policy",
    staticAnalyzerRevision: "test:static-analyzer",
    containerBytes,
    loaded,
  }, sha256);
}

describe("buildTworldMsStaticAnalysis", () => {
  it("builds a deterministic, fully bound Intro level 8 dossier-data slice", async () => {
    const first = await buildIntroLevel8();
    const second = await buildIntroLevel8();

    expect(second).toEqual(first);
    expect(first.topology.evidence.levelFacts.digest).toBe(first.levelFactsContent.digest);
    expect(first.analysis.levelFacts.digest).toBe(first.levelFactsContent.digest);
    expect(first.analysis.levelFacts.digest).toBe(first.topology.evidence.levelFacts.digest);
    expect(first.analysis.topologyEvidence).toEqual(first.topology.content);
    expect(first.dossier.artifacts.levelFacts).toEqual(first.levelFactsContent);
    expect(first.dossier.artifacts.topologyEvidence).toEqual(first.topology.content);
    expect(first.dossier.artifacts.staticAnalysis).toEqual(first.analysisContent);
    expect(first.dossier).toMatchObject({
      dossierDataVersion: 1,
      target: "ms",
      level: {
        occurrenceId: "tworld:intro:8",
      },
      summary: {
        logicalCellCount: 1_024,
        actorCount: 8,
        wiringCount: 6,
        exitCount: 1,
      },
    });
    expect(first.analysis.features.logicalCellCount).toBe(1_024);
    expect(first.analysis.regions.length).toBeGreaterThan(0);
    expect(first.analysis.directedAdjacency.length).toBeGreaterThan(0);
    expect(first.analysis.uncertainties).toEqual([]);
    expect(first.dossier.warnings).toEqual([]);

    for (const content of [
      first.levelFactsContent,
      first.topology.content,
      first.analysisContent,
      first.dossierContent,
    ]) {
      expect(content.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
      expect(content.byteLength).toBeGreaterThan(0);
    }
    for (const canonical of [
      first.topology.canonicalJson,
      first.analysisCanonicalJson,
      first.dossierCanonicalJson,
    ]) {
      expect(canonical.endsWith("\n")).toBe(false);
      expect(JSON.stringify(JSON.parse(canonical))).toBe(canonical);
    }
  }, 30_000);

  it("rejects a non-MS projection instead of relabeling it", async () => {
    const built = await buildIntroLevel8();
    const clonedFacts = structuredClone(built.levelFacts.facts);
    const wrongTarget = {
      ...clonedFacts,
      payload: { ...clonedFacts.payload, target: "lynx" as const },
    };

    await expect(buildTworldMsStaticAnalysis({
      existingFactsBundle: { ...built.levelFacts, facts: wrongTarget },
      existingProjection: built.projected,
      policyRevision: "test:ms-topology-policy",
      staticAnalyzerRevision: "test:static-analyzer",
    }, sha256)).rejects.toThrow(/requires MS facts/u);
  });
});
