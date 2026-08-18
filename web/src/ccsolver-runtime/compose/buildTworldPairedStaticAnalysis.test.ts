import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import {
  TworldPairedStaticAnalysisError,
  buildTworldPairedStaticAnalysis,
} from "./buildTworldPairedStaticAnalysis";

const CELL_COUNT = 32 * 32;
const sha256 = new WebCryptoSha256();

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (entry === undefined) throw new Error(`fixture tile is not registered: ${tileId}`);
  return entry.fileCode;
}

function encodePlane(sourceCodes: readonly number[]): number[] {
  const encoded: number[] = [];
  for (let start = 0; start < sourceCodes.length;) {
    const code = sourceCodes[start]!;
    let count = 1;
    while (start + count < sourceCodes.length && sourceCodes[start + count] === code && count < 255) {
      count += 1;
    }
    if (count === 1 && code !== 0xff) encoded.push(code);
    else encoded.push(0xff, count, code);
    start += count;
  }
  return encoded;
}

function levelData(topTile: number, bottomTile: number = MS_TILE.Empty): Uint8Array {
  const upper = Array<number>(CELL_COUNT).fill(fileCodeForTile(MS_TILE.Empty));
  const lower = Array<number>(CELL_COUNT).fill(fileCodeForTile(MS_TILE.Empty));
  upper[0] = fileCodeForTile(topTile);
  lower[0] = fileCodeForTile(bottomTile);
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

function input(bytes: Uint8Array) {
  return {
    occurrenceId: "fixture:paired-static-analysis",
    producerRevision: "ccsolver:p1b-test",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "fixture/paired-static-analysis.dat",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    staticAnalyzerRevision: "test:static-analyzer",
    catalogRevision: "test:catalog",
    msAdapterRevision: "test:ms-adapter",
    lynxAdapterRevision: "test:lynx-adapter",
    msPolicyRevision: "test:ms-policy",
    lynxPolicyRevision: "test:lynx-policy",
    containerBytes: bytes,
    loaded: { levelData: bytes, layerData: [bytes] },
  };
}

describe("buildTworldPairedStaticAnalysis", () => {
  it("builds and binds genuine target artifacts before reporting an ice-corner policy delta", async () => {
    const built = await buildTworldPairedStaticAnalysis(
      input(levelData(MS_TILE.IceWall_Northwest)),
      sha256,
    );

    expect(built.validity.status).toBe("valid");
    expect(built.ms.levelFacts.facts.payload.target).toBe("ms");
    expect(built.lynx.levelFacts.facts.payload.target).toBe("lynx");
    expect(built.ms.levelFacts.facts.payload.level).toEqual(
      built.lynx.levelFacts.facts.payload.level,
    );
    expect(built.comparison.status).toBe("divergent");
    expect(built.comparison.cellPolicyDifferences).toEqual([
      expect.objectContaining({
        cause: "target-policy",
        cellOrdinal: 0,
        ms: expect.objectContaining({
          entryDirections: ["east", "south"],
          exitDirections: ["north", "east", "south", "west"],
        }),
        lynx: expect.objectContaining({
          entryDirections: ["east", "south"],
          exitDirections: ["north", "west"],
        }),
      }),
    ]);
    expect(built.comparison.targets.ms.levelFacts).toEqual(built.ms.levelFactsContent);
    expect(built.comparison.targets.lynx.staticAnalysis).toEqual(built.lynx.analysisContent);
  }, 30_000);

  it("refuses DATTools-invalid source layouts before assigning either target semantics", async () => {
    const bytes = levelData(MS_TILE.Empty, MS_TILE.Water);

    await expect(buildTworldPairedStaticAnalysis(input(bytes), sha256)).rejects.toSatisfy(
      (error: unknown) => error instanceof TworldPairedStaticAnalysisError
        && error.code === "paired-analysis.source-invalid"
        && error.validity.issues[0]?.reason === "nonactor-upper-masks-lower-terrain",
    );
  });

  it("is byte-stable when rebuilt from cloned source bytes", async () => {
    const bytes = levelData(MS_TILE.Empty);
    const first = await buildTworldPairedStaticAnalysis(input(bytes), sha256);
    const secondBytes = new Uint8Array(bytes);
    const second = await buildTworldPairedStaticAnalysis(input(secondBytes), sha256);

    expect(second.comparisonCanonicalJson).toBe(first.comparisonCanonicalJson);
    expect(second.comparisonContent).toEqual(first.comparisonContent);
  }, 30_000);
});
