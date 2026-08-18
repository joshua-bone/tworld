import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { analyzeStaticTopology } from "@tworld/ccsolver/analyze";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import {
  MS_DIRECTION,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import {
  msChipEnterAction,
  msChipMovementMask,
} from "@ruleset-ms/impl/catalog";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import {
  buildTworldMsLevelFacts,
  type BuildTworldMsLevelFactsInput,
} from "./buildTworldMsLevelFacts";
import { buildTworldMsTopologyEvidence } from "./buildTworldMsTopologyEvidence";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");
const sha256 = new WebCryptoSha256();
const CELL_COUNT = 32 * 32;

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (!entry) throw new Error(`test tile ${tileId} has no DAT registration`);
  return entry.fileCode;
}

function twoPlaneFixture(topFileCode: number, bottomFileCode: number): Uint8Array {
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

function factsInput(levelBytes: Uint8Array): BuildTworldMsLevelFactsInput {
  return {
    occurrenceId: "fixture:ms-topology-evidence",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "fixture/ms-topology-evidence.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    catalogRevision: "test:catalog",
    containerBytes: levelBytes,
    loaded: { levelData: levelBytes, layerData: [levelBytes] },
  };
}

async function buildSynthetic(
  topTile: number,
  bottomTile: number = MS_TILE.Empty,
) {
  const levelBytes = twoPlaneFixture(fileCodeForTile(topTile), fileCodeForTile(bottomTile));
  const input = factsInput(levelBytes);
  return (await buildTworldMsTopologyEvidence({
    factsBundle: await buildTworldMsLevelFacts(input, sha256),
    policyRevision: "test:ms-topology-policy",
  }, sha256)).evidence;
}

async function buildUnknown() {
  const levelBytes = twoPlaneFixture(0xfe, fileCodeForTile(MS_TILE.Empty));
  const input = factsInput(levelBytes);
  return (await buildTworldMsTopologyEvidence({
    factsBundle: await buildTworldMsLevelFacts(input, sha256),
    policyRevision: "test:ms-topology-policy",
  }, sha256)).evidence;
}

describe("buildTworldMsTopologyEvidence", () => {
  it("limits transparent upper-plane handling to Empty rather than Nothing", () => {
    expect(msChipMovementMask(MS_TILE.Empty)).not.toBe(0);
    expect(msChipEnterAction(MS_TILE.Empty)).toBe("clear-floor");
    expect(msChipMovementMask(MS_TILE.Nothing)).toBe(0);
    expect(msChipEnterAction(MS_TILE.Nothing)).toBe("none");
  });

  it.each([
    ["floor", MS_TILE.Empty, "open", "lower"],
    ["wall", MS_TILE.Wall, "blocked", "upper"],
    ["red door", MS_TILE.Door_Red, "conditional", "upper"],
    ["socket", MS_TILE.Socket, "conditional", "upper"],
    ["water", MS_TILE.Water, "conditional", "upper"],
    ["trap", MS_TILE.Beartrap, "conditional", "upper"],
    ["cloner", MS_TILE.CloneMachine, "blocked", "upper"],
    ["open toggle wall", MS_TILE.SwitchWall_Open, "dynamic", "upper"],
    ["closed toggle wall", MS_TILE.SwitchWall_Closed, "dynamic", "upper"],
    ["temporary hidden wall", MS_TILE.HiddenWall_Temp, "dynamic", "upper"],
  ] as const)("classifies an initial %s without claiming more certainty than MS policy supports", async (
    _label,
    tile,
    classification,
    effectiveSourcePlane,
  ) => {
    const evidence = await buildSynthetic(tile);
    const first = evidence.cells[0];

    expect(first).toMatchObject({
      classification,
      coordinate: { x: 0, y: 0, z: 0 },
      occupant: { kind: "none" },
    });
    expect(first?.effective?.sourcePlane).toBe(effectiveSourcePlane);
  });

  it("keeps directional entry and exit policy evidence in canonical direction order", async () => {
    const evidence = await buildSynthetic(MS_TILE.Wall_North);

    expect(evidence.cells[0]).toMatchObject({
      classification: "open",
      entryDirections: ["north", "east", "west"],
      exitDirections: ["east", "south", "west"],
    });
  });

  it.each([
    [
      "hazard",
      MS_TILE.Water,
      ["north", "east", "south", "west"],
      ["north", "east", "south", "west"],
      "hazard-entry",
      "hazard",
      "conditional",
    ],
    [
      "directional exit policy",
      MS_TILE.Wall_North,
      ["north", "east", "west"],
      ["east", "south", "west"],
      null,
      null,
      "open",
    ],
    [
      "forced movement",
      MS_TILE.Slide_East,
      ["north", "east", "south", "west"],
      ["north", "east", "south", "west"],
      "forced-movement-on-entry",
      "target-policy",
      "dynamic",
    ],
    [
      "resource gate",
      MS_TILE.Door_Red,
      ["north", "east", "south", "west"],
      ["north", "east", "south", "west"],
      "resource-gate-consume",
      "resource-gate",
      "conditional",
    ],
  ] as const)("keeps lower-plane %s policy under a valid initial player actor", async (
    _label,
    lowerTile,
    entryDirections,
    exitDirections,
    policyCaveatId,
    policyCaveatKind,
    classification,
  ) => {
    const evidence = await buildSynthetic(
      msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south),
      lowerTile,
    );
    const first = evidence.cells[0];

    expect(first).toMatchObject({
      classification,
      effective: { sourcePlane: "lower" },
      entryDirections,
      exitDirections,
      occupant: { kind: "player-start" },
      supporting: [expect.objectContaining({ sourcePlane: "upper" })],
    });
    expect(first?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "initial-player-occupancy",
      kind: "actor-occupancy",
    }));
    if (policyCaveatId !== null) {
      expect(first?.caveats).toContainEqual(expect.objectContaining({
        caveatId: policyCaveatId,
        kind: policyCaveatKind,
      }));
    }
  });

  it("represents a collectible overlay on its valid standard floor", async () => {
    const evidence = await buildSynthetic(MS_TILE.Key_Red, MS_TILE.Empty);

    expect(evidence.cells[0]).toMatchObject({
      classification: "dynamic",
      effective: { sourcePlane: "lower" },
      entryDirections: ["north", "east", "south", "west"],
      exitDirections: ["north", "east", "south", "west"],
      supporting: [expect.objectContaining({ sourcePlane: "upper" })],
    });
    expect(evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "collects-on-entry",
    }));
  });

  it("exposes the lower floor through a player actor without treating the player as an obstacle", async () => {
    const evidence = await buildSynthetic(
      msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south),
      MS_TILE.Empty,
    );

    expect(evidence.cells[0]).toMatchObject({
      classification: "open",
      effective: { sourcePlane: "lower" },
      occupant: { kind: "player-start" },
      supporting: [expect.objectContaining({ sourcePlane: "upper" })],
    });
    expect(evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "initial-player-occupancy",
    }));
  });

  it.each([
    ["pushable", MS_TILE.Block_Static, "pushable", "lower"],
    ["autonomous", msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east), "autonomous", "lower"],
  ] as const)("classifies an initially %s actor as dynamic occupancy", async (
    _label,
    actorTile,
    occupantKind,
    effectiveSourcePlane,
  ) => {
    const evidence = await buildSynthetic(actorTile);
    const first = evidence.cells[0];

    expect(first).toMatchObject({
      classification: "dynamic",
      effective: { sourcePlane: effectiveSourcePlane },
      occupant: { kind: occupantKind },
    });
    expect(first?.effective?.placementId).not.toBe(first?.occupant.placementId);
    expect(first?.supporting).toContainEqual({
      placementId: first?.occupant.placementId,
      sourcePlane: "upper",
    });
  });

  it("preserves an unknown upper-plane element instead of using the known floor below it", async () => {
    const evidence = await buildUnknown();

    expect(evidence.cells[0]).toMatchObject({
      classification: "unknown",
      effective: { sourcePlane: "upper" },
      entryDirections: [],
      exitDirections: [],
      occupant: { kind: "none" },
    });
    expect(evidence.cells[0]?.caveats).toContainEqual(expect.objectContaining({
      caveatId: "unknown-source-element",
    }));
  });

  it("binds deterministic Intro level 8 evidence to exact facts and preserves representative caveats", async () => {
    const loaded = await new NodeLevelRepository(repoRoot).loadLevel({
      seriesFile: "intro-ms.dac",
      levelNumber: 8,
      ruleset: "MS",
    });
    const containerBytes = new Uint8Array(await readFile(resolve(repoRoot, "data/intro.dat")));
    const input: BuildTworldMsLevelFactsInput = {
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
    };
    const factsBundle = await buildTworldMsLevelFacts(input, sha256);
    const firstBundle = await buildTworldMsTopologyEvidence({
      factsBundle,
      policyRevision: "test:ms-topology-policy",
    }, sha256);
    const secondBundle = await buildTworldMsTopologyEvidence({
      factsBundle,
      policyRevision: "test:ms-topology-policy",
    }, sha256);
    const first = firstBundle.evidence;
    const analysis = analyzeStaticTopology({
      analyzerRevision: "test:static-topology-analyzer",
      evidence: first,
      levelFacts: factsBundle.facts,
      levelFactsDigest: first.levelFacts.digest,
      topologyEvidence: firstBundle.content,
    });

    expect(secondBundle).toEqual(firstBundle);
    expect(firstBundle.content.byteLength).toBe(new TextEncoder().encode(firstBundle.canonicalJson).byteLength);
    expect(firstBundle.content.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(firstBundle.canonicalJson.endsWith("\n")).toBe(false);
    expect(first).toMatchObject({
      evidenceVersion: 1,
      levelFacts: {
        artifactType: "level-facts",
        digest: "sha256:ece163d2068dcd4d8c219d24331e943784b0f6e7b3a3e78ecb48ccd9f98e3e84",
        protocolVersion: 1,
        schemaVersion: 1,
      },
      policy: {
        policyId: "tworld-ms-initial-chip-topology-v1",
        policyRevision: "test:ms-topology-policy",
      },
      target: "ms",
    });
    expect(first.cells).toHaveLength(1_024);
    expect(analysis).toMatchObject({
      topologyEvidence: firstBundle.content,
      features: { logicalCellCount: 1_024 },
    });

    const at = (x: number, y: number) => first.cells.find((cell) => (
      cell.coordinate.x === x && cell.coordinate.y === y && cell.coordinate.z === 0
    ));
    expect(at(4, 4)).toMatchObject({ classification: "open", occupant: { kind: "player-start" } });
    expect(at(8, 8)).toMatchObject({ classification: "dynamic", occupant: { kind: "none" } });
    expect(at(12, 8)).toMatchObject({ classification: "dynamic", occupant: { kind: "none" } });
    expect(at(21, 10)).toMatchObject({ classification: "dynamic", occupant: { kind: "autonomous" } });
    expect(at(23, 12)).toMatchObject({ classification: "conditional", occupant: { kind: "contained" } });
    expect(at(21, 17)).toMatchObject({ classification: "dynamic", occupant: { kind: "pushable" } });
    expect(at(16, 20)).toMatchObject({ classification: "conditional", occupant: { kind: "none" } });
    expect(at(14, 20)).toMatchObject({ classification: "conditional", occupant: { kind: "none" } });
    expect(at(15, 20)).toMatchObject({ classification: "dynamic", occupant: { kind: "none" } });
    expect(at(3, 3)).toMatchObject({ classification: "blocked", occupant: { kind: "none" } });
  });
});
