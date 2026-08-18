import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldMsStaticAnalysis } from "./buildTworldMsStaticAnalysis";
import { buildTworldLynxStaticAnalysis } from "./buildTworldLynxStaticAnalysis";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../");
const sha256 = new WebCryptoSha256();

async function buildIntroLevel8() {
  const repository = new NodeLevelRepository(repositoryRoot);
  const [msLoaded, lynxLoaded, container] = await Promise.all([
    repository.loadLevel({ seriesFile: "intro-ms.dac", levelNumber: 8, ruleset: "MS" }),
    repository.loadLevel({ seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" }),
    readFile(resolve(repositoryRoot, "data/intro.dat")),
  ]);
  const common = {
    occurrenceId: "tworld:intro:8",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "data/intro.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    catalogRevision: "test:catalog",
    staticAnalyzerRevision: "test:static-analyzer",
    containerBytes: new Uint8Array(container),
  } as const;
  return Promise.all([
    buildTworldMsStaticAnalysis({
      ...common,
      loaded: msLoaded,
      policyRevision: "test:ms-policy",
    }, sha256),
    buildTworldLynxStaticAnalysis({
      ...common,
      loaded: lynxLoaded,
      policyRevision: "test:lynx-policy",
    }, sha256),
    buildTworldLynxStaticAnalysis({
      ...common,
      loaded: lynxLoaded,
      policyRevision: "test:lynx-policy",
    }, sha256),
  ]);
}

describe("buildTworldLynxStaticAnalysis", () => {
  it("builds deterministic, fully bound Lynx analysis and preserves honest target policy", async () => {
    const [ms, first, second] = await buildIntroLevel8();

    expect(second).toEqual(first);
    expect(first.topology.evidence.levelFacts.digest).toBe(first.levelFactsContent.digest);
    expect(first.analysis.levelFacts.digest).toBe(first.levelFactsContent.digest);
    expect(first.analysis.topologyEvidence).toEqual(first.topology.content);
    expect(first.dossier).toMatchObject({
      dossierDataVersion: 1,
      target: "lynx",
      level: { occurrenceId: "tworld:intro:8" },
      summary: {
        logicalCellCount: 1_024,
        actorCount: 8,
        wiringCount: 6,
        exitCount: 1,
      },
    });
    expect(first.analysis.features).toEqual(ms.analysis.features);

    const cloner = first.analysis.boundaries.find((boundary) => (
      boundary.coordinate.x === 23
      && boundary.coordinate.y === 12
      && boundary.coordinate.z === 0
    ));
    const msCloner = ms.analysis.boundaries.find((boundary) => (
      boundary.coordinate.x === 23
      && boundary.coordinate.y === 12
      && boundary.coordinate.z === 0
    ));
    expect(msCloner?.caveats).not.toContainEqual(expect.objectContaining({
      caveatId: "exit-requires-release",
    }));
    expect(cloner?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "exit-requires-release",
      kind: "requires-release",
    }));
  }, 30_000);
});
