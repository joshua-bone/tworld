import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldLynxStaticAnalysis } from "../buildTworldLynxStaticAnalysis";
import { buildTworldLynxTopologyEvidence } from "../buildTworldLynxTopologyEvidence";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import { buildTworldMsStaticAnalysis } from "../buildTworldMsStaticAnalysis";
import { buildTworldMsTopologyEvidence } from "../buildTworldMsTopologyEvidence";
import { buildTworldPairedStaticAnalysis } from "../buildTworldPairedStaticAnalysis";
import { normalizedGameplayReferenceForMembers } from "../p1a-corpus/corpusManifest";
import { projectLoadedTworldLynxLevel } from "../tworldLynxLevelProjection";
import { projectLoadedTworldMsLevel } from "../tworldMsLevelProjection";
import { TworldSolverSourceValidityError } from "./assertTworldSolverSourceEligibility";
import { TworldSolverSourceScopeError } from "./analyzeTworldSolverSourceScope";

const sha256 = new WebCryptoSha256();
const CELL_COUNT = 32 * 32;

function encodePlane(sourceCodes: readonly number[]): number[] {
  const encoded: number[] = [];
  for (let start = 0; start < sourceCodes.length;) {
    const sourceCode = sourceCodes[start]!;
    let count = 1;
    while (start + count < sourceCodes.length && sourceCodes[start + count] === sourceCode && count < 0xff) {
      count += 1;
    }
    if (count === 1 && sourceCode !== 0xff) encoded.push(sourceCode);
    else encoded.push(0xff, count, sourceCode);
    start += count;
  }
  return encoded;
}

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (entry === undefined) throw new Error(`fixture tile is not registered: ${tileId}`);
  return entry.fileCode;
}

function levelData(
  upperOverrides: Readonly<Record<number, number>> = {},
  lowerOverrides: Readonly<Record<number, number>> = {},
): Uint8Array {
  const upper = Array<number>(CELL_COUNT).fill(0);
  const lower = Array<number>(CELL_COUNT).fill(0);
  for (const [cell, sourceCode] of Object.entries(upperOverrides)) upper[Number(cell)] = sourceCode;
  for (const [cell, sourceCode] of Object.entries(lowerOverrides)) lower[Number(cell)] = sourceCode;
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

function expandedLevelData(sourceFileCode: number, plane: "upper" | "lower" = "upper"): Uint8Array {
  return plane === "upper"
    ? levelData({ 7: sourceFileCode })
    : levelData({}, { 7: sourceFileCode });
}

function commonInput(bytes: Uint8Array) {
  return {
    occurrenceId: "fixture:source-eligibility",
    producerRevision: "test:producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "fixture/source-eligibility.dat",
    adapterRevision: "test:adapter",
    importProfileRevision: "test:import-profile",
    analyzerRevision: "test:facts-analyzer",
    catalogRevision: "test:catalog",
    containerBytes: bytes,
    loaded: { levelData: bytes, layerData: [bytes] },
  } as const;
}

describe("CCSolver source eligibility boundaries", () => {
  it("rejects expanded tiles before projection, normalized corpus identity, or either target's LevelFacts", async () => {
    const bytes = expandedLevelData(0x75);
    const input = commonInput(bytes);

    expect(() => projectLoadedTworldMsLevel(input)).toThrow(TworldSolverSourceScopeError);
    expect(() => projectLoadedTworldLynxLevel(input)).toThrow(TworldSolverSourceScopeError);
    await expect(normalizedGameplayReferenceForMembers([bytes], sha256))
      .rejects.toBeInstanceOf(TworldSolverSourceScopeError);
    await expect(buildTworldMsLevelFacts(input, sha256))
      .rejects.toBeInstanceOf(TworldSolverSourceScopeError);
    await expect(buildTworldLynxLevelFacts(input, sha256))
      .rejects.toBeInstanceOf(TworldSolverSourceScopeError);
  });

  it("rejects expanded tiles before paired target interpretation", async () => {
    const bytes = expandedLevelData(0x74, "lower");
    const input = commonInput(bytes);

    await expect(buildTworldPairedStaticAnalysis({
      ...input,
      staticAnalyzerRevision: "test:static-analyzer",
      msAdapterRevision: "test:ms-adapter",
      lynxAdapterRevision: "test:lynx-adapter",
      msPolicyRevision: "test:ms-policy",
      lynxPolicyRevision: "test:lynx-policy",
    }, sha256)).rejects.toBeInstanceOf(TworldSolverSourceScopeError);
  });

  it("rejects DATTools-invalid layouts at both direct target projection, facts, and analysis boundaries", async () => {
    const bytes = levelData({}, { 7: fileCodeForTile(MS_TILE.Water) });
    const input = commonInput(bytes);

    expect(() => projectLoadedTworldMsLevel(input)).toThrow(TworldSolverSourceValidityError);
    expect(() => projectLoadedTworldLynxLevel(input)).toThrow(TworldSolverSourceValidityError);
    await expect(buildTworldMsLevelFacts(input, sha256))
      .rejects.toBeInstanceOf(TworldSolverSourceValidityError);
    await expect(buildTworldLynxLevelFacts(input, sha256))
      .rejects.toBeInstanceOf(TworldSolverSourceValidityError);
    await expect(buildTworldMsStaticAnalysis({
      ...input,
      policyRevision: "test:ms-policy",
      staticAnalyzerRevision: "test:static-analyzer",
    }, sha256)).rejects.toBeInstanceOf(TworldSolverSourceValidityError);
    await expect(buildTworldLynxStaticAnalysis({
      ...input,
      policyRevision: "test:lynx-policy",
      staticAnalyzerRevision: "test:static-analyzer",
    }, sha256)).rejects.toBeInstanceOf(TworldSolverSourceValidityError);
  });

  it("rederives topology from verified facts instead of trusting supplied projection metadata", async () => {
    const validBytes = levelData({ 7: fileCodeForTile(MS_TILE.Wall) });
    const input = commonInput(validBytes);
    const [msFacts, lynxFacts] = await Promise.all([
      buildTworldMsLevelFacts(input, sha256),
      buildTworldLynxLevelFacts(input, sha256),
    ]);
    const msProjection = projectLoadedTworldMsLevel(input);
    const lynxProjection = projectLoadedTworldLynxLevel(input);
    const forgedMsProjection = {
      ...msProjection,
      level: {
        ...msProjection.level,
        placements: msProjection.level.placements.map((placement, index) => (
          index === 0
            ? { ...placement, sourcePlane: "side" as const, interpretation: "unknown" as const }
            : placement
        )),
      },
    };
    const forgedLynxProjection = {
      ...lynxProjection,
      level: {
        ...lynxProjection.level,
        placements: lynxProjection.level.placements.map((placement, index) => (
          index === 0
            ? { ...placement, sourcePlane: "side" as const, interpretation: "unknown" as const }
            : placement
        )),
      },
    };

    const expectedMs = await buildTworldMsTopologyEvidence({
      factsBundle: msFacts,
      policyRevision: "test:ms-policy",
    }, sha256);
    const expectedLynx = await buildTworldLynxTopologyEvidence({
      factsBundle: lynxFacts,
      policyRevision: "test:lynx-policy",
    }, sha256);

    await expect(buildTworldMsTopologyEvidence({
      factsBundle: msFacts,
      policyRevision: "test:ms-policy",
      projected: forgedMsProjection,
    } as never, sha256)).resolves.toEqual(expectedMs);
    await expect(buildTworldLynxTopologyEvidence({
      factsBundle: lynxFacts,
      policyRevision: "test:lynx-policy",
      projected: forgedLynxProjection,
    } as never, sha256)).resolves.toEqual(expectedLynx);
  }, 30_000);

  it("rejects tampered facts source bytes, member coordinates, and catalog revisions", async () => {
    const bytes = levelData({ 7: fileCodeForTile(MS_TILE.Wall) });
    const input = commonInput(bytes);
    const [msFacts, lynxFacts] = await Promise.all([
      buildTworldMsLevelFacts(input, sha256),
      buildTworldLynxLevelFacts(input, sha256),
    ]);
    const changedMember = new Uint8Array(msFacts.sourceBytes.members[0]!);
    changedMember[0] = (changedMember[0] ?? 0) ^ 0x01;

    await expect(buildTworldMsTopologyEvidence({
      factsBundle: {
        ...msFacts,
        sourceBytes: { ...msFacts.sourceBytes, members: [changedMember] },
      },
      policyRevision: "test:ms-policy",
    }, sha256)).rejects.toThrow(/source digest mismatch/u);
    await expect(buildTworldLynxTopologyEvidence({
      factsBundle: {
        ...lynxFacts,
        sourceBytes: { ...lynxFacts.sourceBytes, members: [changedMember] },
      },
      policyRevision: "test:lynx-policy",
    }, sha256)).rejects.toThrow(/source digest mismatch/u);

    const invalidMemberFacts = {
      ...msFacts.facts,
      payload: {
        ...msFacts.facts.payload,
        provenance: {
          ...msFacts.facts.payload.provenance,
          occurrence: {
            ...msFacts.facts.payload.provenance.occurrence,
            members: msFacts.facts.payload.provenance.occurrence.members.map((member, index) => (
              index === 0 ? { ...member, ordinal: 2 } : member
            )),
          },
        },
      },
    };
    await expect(buildTworldMsTopologyEvidence({
      factsBundle: { ...msFacts, facts: invalidMemberFacts },
      policyRevision: "test:ms-policy",
    }, sha256)).rejects.toThrow(/invalid source member coordinates/u);

    const mixedCatalogFacts = {
      ...lynxFacts.facts,
      payload: {
        ...lynxFacts.facts.payload,
        placements: lynxFacts.facts.payload.placements.map((placement, index) => (
          index === 0
            ? {
                ...placement,
                sourceElement: {
                  ...placement.sourceElement,
                  catalogRevision: "test:different-catalog-revision",
                },
              }
            : placement
        )),
      },
    };
    await expect(buildTworldLynxTopologyEvidence({
      factsBundle: { ...lynxFacts, facts: mixedCatalogFacts },
      policyRevision: "test:lynx-policy",
    }, sha256)).rejects.toThrow(/exactly one catalog revision/u);
  }, 30_000);

  it("checks expanded exclusions before overlapping DATTools layout validity", () => {
    const bytes = expandedLevelData(0x70, "lower");
    const input = commonInput(bytes);

    expect(() => projectLoadedTworldMsLevel(input)).toThrow(TworldSolverSourceScopeError);
    expect(() => projectLoadedTworldLynxLevel(input)).toThrow(TworldSolverSourceScopeError);
  });

  it("keeps normalized identity available so corpus reports can quarantine DATTools-invalid occurrences", async () => {
    const bytes = levelData({}, { 7: fileCodeForTile(MS_TILE.Water) });

    await expect(normalizedGameplayReferenceForMembers([bytes], sha256)).resolves.toMatchObject({
      status: "available",
      profile: "tworld-legacy-dat-gameplay-v1",
    });
  });
});
