import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  MS_DIRECTION,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { buildTworldMsLevelFacts } from "./buildTworldMsLevelFacts";
import { buildTworldMsTopologyEvidence } from "./buildTworldMsTopologyEvidence";
import { buildTworldLynxLevelFacts } from "./buildTworldLynxLevelFacts";
import { buildTworldLynxTopologyEvidence } from "./buildTworldLynxTopologyEvidence";

const sha256 = new WebCryptoSha256();
const CELL_COUNT = 32 * 32;

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (!entry) throw new Error(`test tile ${tileId} has no DAT registration`);
  return entry.fileCode;
}

function twoPlaneFixture(topTile: number, bottomTile: number = MS_TILE.Empty): Uint8Array {
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

function commonInput(levelBytes: Uint8Array) {
  return {
    occurrenceId: "fixture:cross-ruleset-topology",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "fixture/cross-ruleset-topology.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    catalogRevision: "test:catalog",
    containerBytes: levelBytes,
    loaded: { levelData: levelBytes, layerData: [levelBytes] },
  } as const;
}

async function buildPair(topTile: number, bottomTile: number = MS_TILE.Empty) {
  const input = commonInput(twoPlaneFixture(topTile, bottomTile));
  const [msFacts, lynxFacts] = await Promise.all([
    buildTworldMsLevelFacts(input, sha256),
    buildTworldLynxLevelFacts(input, sha256),
  ]);
  const [ms, lynx, lynxAgain] = await Promise.all([
    buildTworldMsTopologyEvidence({
      factsBundle: msFacts,
      policyRevision: "test:ms-policy",
    }, sha256),
    buildTworldLynxTopologyEvidence({
      factsBundle: lynxFacts,
      policyRevision: "test:lynx-policy",
    }, sha256),
    buildTworldLynxTopologyEvidence({
      factsBundle: lynxFacts,
      policyRevision: "test:lynx-policy",
    }, sha256),
  ]);
  return { lynx, lynxAgain, lynxFacts, ms, msFacts };
}

describe("buildTworldLynxTopologyEvidence", () => {
  it("preserves the Lynx ice-corner exit restriction instead of copying MS", async () => {
    const { lynx, ms } = await buildPair(MS_TILE.IceWall_Northwest);

    expect(ms.evidence.cells[0]).toMatchObject({
      classification: "dynamic",
      entryDirections: ["east", "south"],
      exitDirections: ["north", "east", "south", "west"],
    });
    expect(lynx.evidence.cells[0]).toMatchObject({
      classification: "dynamic",
      entryDirections: ["east", "south"],
      exitDirections: ["north", "west"],
    });
    expect(lynx.evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "forced-movement-on-entry",
    }));
  });

  it("records Lynx clone-machine release policy for a contained actor", async () => {
    const { lynx, ms } = await buildPair(
      msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east),
      MS_TILE.CloneMachine,
    );

    expect(ms.evidence.cells[0]).toMatchObject({
      classification: "conditional",
      effective: { sourcePlane: "lower" },
      occupant: { kind: "contained" },
    });
    expect(ms.evidence.cells[0]?.caveats).not.toContainEqual(expect.objectContaining({
      caveatId: "exit-requires-release",
    }));
    expect(lynx.evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "exit-requires-release",
      kind: "requires-release",
    }));
  }, 30_000);

  it("keeps the IC chip as the probe surface while retaining collectible dynamics", async () => {
    const { lynx, ms } = await buildPair(MS_TILE.ICChip);

    expect(ms.evidence.cells[0]).toMatchObject({
      classification: "dynamic",
      effective: { sourcePlane: "upper" },
    });
    expect(lynx.evidence.cells[0]).toMatchObject({
      classification: "dynamic",
      effective: { sourcePlane: "upper" },
    });
    expect(lynx.evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "collects-on-entry",
    }));
  });

  it("normalizes reveal-wall probing to the same conservative evidence", async () => {
    const { lynx, lynxAgain, ms } = await buildPair(MS_TILE.HiddenWall_Temp);

    expect(lynxAgain).toEqual(lynx);
    for (const bundle of [ms, lynx]) {
      expect(bundle.evidence.cells[0]).toMatchObject({
        classification: "dynamic",
        entryDirections: [],
        exitDirections: ["north", "east", "south", "west"],
      });
      expect(bundle.evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
        caveatId: "blocked-probe-reveals-wall",
      }));
    }
    expect(lynx.evidence).toMatchObject({
      target: "lynx",
      policy: { policyId: "tworld-lynx-initial-chip-topology-v1" },
    });
  });

  it("rejects MS facts instead of relabeling them as Lynx evidence", async () => {
    const { msFacts } = await buildPair(MS_TILE.Empty);

    await expect(buildTworldLynxTopologyEvidence({
      factsBundle: msFacts,
      policyRevision: "test:lynx-policy",
    }, sha256)).rejects.toThrow(/requires Lynx facts/u);
  });
});
