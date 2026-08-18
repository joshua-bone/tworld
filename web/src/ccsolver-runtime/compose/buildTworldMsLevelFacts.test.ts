import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  encodeArtifact,
  identifyCanonicalJson,
} from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { buildTworldMsLevelFacts } from "./buildTworldMsLevelFacts";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const sha256 = new WebCryptoSha256();
const CELL_COUNT = 32 * 32;

async function buildIntroLevel8() {
  const loaded = await new NodeLevelRepository(repoRoot).loadLevel({
    seriesFile: "intro-ms.dac",
    levelNumber: 8,
    ruleset: "MS",
  });
  const containerBytes = new Uint8Array(await readFile(resolve(repoRoot, "data/intro.dat")));
  return buildTworldMsLevelFacts({
    occurrenceId: "tworld:intro:8",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "data/intro.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:analyzer",
    catalogRevision: "test:catalog",
    containerBytes,
    loaded,
  }, sha256);
}

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (!entry) throw new Error(`test tile ${tileId} has no DAT registration`);
  return entry.fileCode;
}

function singleSubjectCellFileCode(
  topFileCode: number,
  bottomFileCode = fileCodeForTile(MS_TILE.Empty),
): Uint8Array {
  const encodePlane = (sourceCodes: readonly number[]): number[] => {
    const encoded: number[] = [];
    for (let start = 0; start < sourceCodes.length;) {
      const sourceCode = sourceCodes[start]!;
      let count = 1;
      while (
        start + count < sourceCodes.length
        && sourceCodes[start + count] === sourceCode
        && count < 0xff
      ) count += 1;
      if (count === 1 && sourceCode !== 0xff) encoded.push(sourceCode);
      else encoded.push(0xff, count, sourceCode);
      start += count;
    }
    return encoded;
  };
  const upper = Array<number>(CELL_COUNT).fill(fileCodeForTile(MS_TILE.Empty));
  const lower = Array<number>(CELL_COUNT).fill(fileCodeForTile(MS_TILE.Empty));
  upper[0] = topFileCode;
  lower[0] = bottomFileCode;
  const encodedUpper = encodePlane(upper);
  const encodedLower = encodePlane(lower);
  return Uint8Array.from([
    1, 0,
    0, 0,
    0, 0,
    0, 0,
    encodedUpper.length & 0xff, encodedUpper.length >> 8,
    ...encodedUpper,
    encodedLower.length & 0xff, encodedLower.length >> 8,
    ...encodedLower,
    0, 0,
  ]);
}

function singleSubjectCellLevel(topTile: number, bottomTile = MS_TILE.Empty): Uint8Array {
  return singleSubjectCellFileCode(fileCodeForTile(topTile), fileCodeForTile(bottomTile));
}

describe("buildTworldMsLevelFacts", () => {
  it("builds and verifies deterministic content-addressed facts for bundled intro level 8", async () => {
    const first = await buildIntroLevel8();
    const second = await buildIntroLevel8();
    const { facts } = first;

    expect(encodeArtifact(second.facts)).toBe(encodeArtifact(facts));
    expect({
      artifactDigest: await identifyCanonicalJson(encodeArtifact(facts), sha256),
      normalizedMap: facts.payload.provenance.normalizedMap.content,
    }).toEqual({
      artifactDigest: "sha256:ece163d2068dcd4d8c219d24331e943784b0f6e7b3a3e78ecb48ccd9f98e3e84",
      normalizedMap: {
        byteLength: 126_467,
        digest: "sha256:f1b12c0991cb55c45b567695ad335a98e1bb961dacc95d1b1f770fd9e03d375a",
      },
    });
    expect(facts.payload.geometry).toEqual({ depth: 1, height: 32, width: 32 });
    expect(facts.payload.timeLimit).toEqual({ kind: "bounded", seconds: 500 });
    expect(facts.payload.requiredCollectibles).toEqual([]);
    expect(facts.payload.provenance.source.content).toEqual({
      byteLength: 3_415,
      digest: "sha256:0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6",
    });
    expect(facts.payload.provenance.occurrence.members).toEqual([
      {
        ordinal: 0,
        role: "level",
        z: 0,
        content: {
          byteLength: 499,
          digest: "sha256:afbf9dfb9e91d8d2f028b48af4775174e4097eadf5e93d9b358965a231151b7d",
        },
      },
    ]);
    expect(facts.payload.level.normalizedGameplayDigest).toBe(
      "sha256:f1b12c0991cb55c45b567695ad335a98e1bb961dacc95d1b1f770fd9e03d375a",
    );
    expect(facts.payload.actors).toHaveLength(8);
    expect(facts.payload.actors.filter((actor) => actor.declaredSourceOrder !== null)).toHaveLength(6);
    expect(facts.payload.wiring).toHaveLength(6);
    expect(facts.payload.exits).toHaveLength(1);
    expect(facts.payload.hazards.map((hazard) => hazard.hazardType)).toEqual(["cc1:water"]);
    expect(facts.payload.unknowns).toEqual([]);
    expect(facts.payload.placements.filter((placement) => (
      placement.sourceElement.elementToken.startsWith("ms:button_")
    ))).toHaveLength(14);
    expect(facts.payload.placements.filter((placement) => (
      placement.sourceElement.elementToken.startsWith("ms:button_")
    )).every((placement) => placement.descriptor.stratum === "overlay")).toBe(true);
    expect(facts.payload.placements.every((placement) => (
      !/^\d+$/u.test(placement.sourceElement.elementToken)
      && !placement.descriptor.semanticType.startsWith("ms:")
    ))).toBe(true);

    const placementById = new Map(
      facts.payload.placements.map((placement) => [placement.placementId, placement]),
    );
    expect(facts.payload.actors
      .filter((actor) => actor.declaredSourceOrder !== null)
      .map((actor) => placementById.get(actor.descriptor.placementId)?.descriptor.coordinate)
    ).toEqual([
      { x: 21, y: 10, z: 0 },
      { x: 23, y: 12, z: 0 },
      { x: 12, y: 16, z: 0 },
      { x: 20, y: 16, z: 0 },
      { x: 8, y: 18, z: 0 },
      { x: 16, y: 18, z: 0 },
    ]);
    expect(facts.payload.wiring.map((wire) => ({
      kind: wire.descriptor.kind,
      sourceOrder: wire.descriptor.sourceOrder,
    }))).toEqual([
      { kind: "cc1:cloner-activate", sourceOrder: 0 },
      { kind: "cc1:cloner-activate", sourceOrder: 1 },
      { kind: "cc1:cloner-activate", sourceOrder: 2 },
      { kind: "cc1:cloner-activate", sourceOrder: 3 },
      { kind: "cc1:trap-release", sourceOrder: 0 },
      { kind: "cc1:trap-release", sourceOrder: 1 },
    ]);
  });

  it("keeps teleport routing networks local to each z layer", async () => {
    const lower = singleSubjectCellLevel(MS_TILE.Teleport);
    const upper = singleSubjectCellLevel(MS_TILE.Teleport);
    const containerBytes = Uint8Array.from([...lower, ...upper]);
    const { facts } = await buildTworldMsLevelFacts({
      occurrenceId: "fixture:two-layer-teleports",
      producerRevision: "test:producer",
      repository: "tworld",
      repositoryRevision: "git:test-source",
      sourcePath: "fixture/two-layer-teleports.dat",
      adapterRevision: "test:adapter",
      importProfileRevision: "test:import-profile",
      analyzerRevision: "test:analyzer",
      catalogRevision: "test:catalog",
      containerBytes,
      loaded: { levelData: lower, layerData: [lower, upper] },
    }, sha256);

    expect(facts.payload.transports.map((transport) => ({
      networkId: transport.networkId,
      memberCount: transport.members.length,
    }))).toEqual([
      { networkId: "cc1:teleport-z0-network", memberCount: 1 },
      { networkId: "cc1:teleport-z1-network", memberCount: 1 },
    ]);
  });

  it("preserves an unknown DAT element through the final facts artifact", async () => {
    const levelBytes = singleSubjectCellFileCode(0xfe);
    const { facts } = await buildTworldMsLevelFacts({
      occurrenceId: "fixture:unknown-dat-element",
      producerRevision: "test:producer",
      repository: "tworld",
      repositoryRevision: "git:test-source",
      sourcePath: "fixture/unknown-dat-element.dat",
      adapterRevision: "test:adapter",
      importProfileRevision: "test:import-profile",
      analyzerRevision: "test:analyzer",
      catalogRevision: "test:catalog",
      containerBytes: levelBytes,
      loaded: { levelData: levelBytes, layerData: [levelBytes] },
    }, sha256);

    const unknownPlacement = facts.payload.placements.find((placement) => (
      placement.sourceElement.elementToken === "0xfe"
    ));
    expect(unknownPlacement).toEqual(expect.objectContaining({ interpretation: "unknown" }));
    expect(facts.payload.unknowns).toEqual([
      expect.objectContaining({
        kind: "unknown-catalog-element",
        placementId: unknownPlacement?.placementId,
        sourceToken: "0xfe",
      }),
    ]);
  });
});
