import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import {
  buildPinnedCorpusManifest,
  canonicalCorpusManifestJson,
  indexDonorEntries,
  normalizedGameplayReferenceForMembers,
  verifyDonorEntryCoverage,
  verifyDonorPassword,
  verifyDonorSetName,
  verifyPinnedSourceFile,
} from "./corpusManifest";
import {
  CCSOLVER_CORPUS_SOURCE_REVISION,
  CORPUS_PACK_REGISTRY,
  corpusRegistrySourcePaths,
  isSafeRepositoryRelativePath,
} from "./registry";
import { PINNED_SOURCE_FILES } from "./sourcePins";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../../");

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
    return new Uint8Array(await readFile(resolve(repoRoot, path)));
  },
};

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (entry === undefined) throw new Error(`fixture tile has no DAT registration: ${tileId}`);
  return entry.fileCode;
}

function semanticLevelFixture(input: {
  readonly actorOrder?: readonly [number, number][];
  readonly time?: number;
  readonly topFileCode?: number;
  readonly trapTargetX?: number;
} = {}): Uint8Array {
  const metadata = [
    4, 10,
    0, 0, 0, 0,
    input.trapTargetX ?? 2, 0, 0, 0,
    0, 0,
    10, (input.actorOrder?.length ?? 2) * 2,
    ...(input.actorOrder ?? [[1, 0], [2, 0]]).flatMap(([x, y]) => [x, y]),
  ];
  const time = input.time ?? 12;
  return Uint8Array.from([
    1, 0,
    time & 0xff, (time >> 8) & 0xff,
    0, 0,
    0, 0,
    1, 0,
    input.topFileCode ?? fileCodeForTile(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.north)),
    0, 0,
    metadata.length & 0xff, (metadata.length >> 8) & 0xff,
    ...metadata,
  ]);
}

describe("the pinned CCSolver donor corpus", () => {
  it("declares exactly the intended packs and safe pinned inputs", () => {
    expect(CCSOLVER_CORPUS_SOURCE_REVISION).toBe("42c78d0db343621f887fefce581315479d9a8be3");
    expect(CORPUS_PACK_REGISTRY).toHaveLength(39);
    expect(new Set(CORPUS_PACK_REGISTRY.map((pack) => pack.packId)).size).toBe(39);

    const paths = corpusRegistrySourcePaths(CORPUS_PACK_REGISTRY);
    expect(paths).toHaveLength(193);
    expect(paths.every(isSafeRepositoryRelativePath)).toBe(true);
    expect(paths.some((path) => path.toLowerCase().includes("cclxp2"))).toBe(false);
    expect(Object.keys(PINNED_SOURCE_FILES).sort()).toEqual([...paths].sort());
    expect(Object.values(PINNED_SOURCE_FILES).every((pin) =>
      pin.byteLength > 0 && /^[0-9a-f]{64}$/.test(pin.sha256),
    )).toBe(true);
  });

  it("builds the deterministic 2,440-map, two-target manifest from pinned sources", async () => {
    const manifest = await buildPinnedCorpusManifest({
      source: repositorySource,
      sha256: nodeSha256,
    });

    expect(manifest.source).toEqual({
      repository: "joshua-bone/tworld",
      revision: CCSOLVER_CORPUS_SOURCE_REVISION,
    });
    expect(manifest.packs).toHaveLength(39);
    expect(manifest.cases).toHaveLength(2_440);
    expect(manifest.summary).toEqual({
      packCount: 39,
      mapCaseCount: 2_440,
      targetRecordCount: 4_880,
      donorBackedTargetRecordCount: 4_664,
      pairedDonorCaseCount: 2_257,
      msOnlyDonorCaseCount: 150,
      lynxOnlyDonorCaseCount: 0,
      noDonorCaseCount: 33,
    });

    expect(manifest.cases.every((entry) =>
      entry.targets.map((target) => target.target).join(",") === "ms,lynx",
    )).toBe(true);
    expect(manifest.cases.every((entry) => entry.sourceMembers.length >= 1)).toBe(true);
    expect(manifest.cases.every((entry) =>
      entry.normalizedGameplayReference.status === "available"
      && /^[0-9a-f]{64}$/.test(entry.normalizedGameplayReference.sha256),
    )).toBe(true);
    expect(manifest.cases.every((entry) => /^case:sha256:[0-9a-f]{64}$/.test(entry.caseId))).toBe(true);
    expect(new Set(manifest.cases.map((entry) => entry.caseId)).size).toBe(2_440);
    expect(manifest.sources.map((source) => source.path)).toEqual(
      [...manifest.sources.map((source) => source.path)].sort(),
    );
    expect(manifest.packs.map((pack) => pack.packId)).toEqual(
      CORPUS_PACK_REGISTRY.map((pack) => pack.packId),
    );

    const cclp2 = manifest.cases.filter((entry) => entry.packId === "cclp2");
    expect(cclp2).toHaveLength(149);
    expect(cclp2.every((entry) => entry.targets[0].donor !== null)).toBe(true);
    expect(cclp2.every((entry) => entry.targets[1].donor === null)).toBe(true);

    const cclp5Level23 = manifest.cases.find((entry) => entry.occurrenceId === "cclp5/023");
    expect(cclp5Level23?.targets[0].donor).toMatchObject({
      entryOrdinal: 21,
      sourceLevelNumber: 23,
    });
    expect(cclp5Level23?.targets[1].donor).toBeNull();
    expect(manifest.cases.some((entry) => entry.packId.toLowerCase().includes("cclxp2"))).toBe(false);

    const json = canonicalCorpusManifestJson(manifest);
    expect(canonicalCorpusManifestJson(manifest)).toBe(json);
    expect(JSON.stringify(JSON.parse(json))).toBe(json);
  }, 90_000);

  it("normalizes gameplay-significant timer, facing, actor-order, and wiring changes", async () => {
    const digest = async (bytes: Uint8Array) => (
      await normalizedGameplayReferenceForMembers([bytes], nodeSha256)
    ).sha256;
    const baseline = await digest(semanticLevelFixture());
    const changed = await Promise.all([
      digest(semanticLevelFixture({ time: 13 })),
      digest(semanticLevelFixture({
        topFileCode: fileCodeForTile(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.east)),
      })),
      digest(semanticLevelFixture({ actorOrder: [[2, 0], [1, 0]] })),
      digest(semanticLevelFixture({ trapTargetX: 3 })),
    ]);

    expect(new Set([baseline, ...changed]).size).toBe(5);
  });

  it("rejects byte-length and digest drift instead of silently repinning", async () => {
    const [path, pin] = Object.entries(PINNED_SOURCE_FILES)[0]!;
    const original = await repositorySource.readBytes(path);
    const changed = new Uint8Array(original);
    changed[0] = (changed[0] ?? 0) ^ 0xff;

    await expect(verifyPinnedSourceFile(path, changed, pin, nodeSha256)).rejects.toThrow(
      `pinned source digest mismatch: ${path}`,
    );
    await expect(verifyPinnedSourceFile(path, changed.subarray(1), pin, nodeSha256)).rejects.toThrow(
      `pinned source byte length mismatch: ${path}`,
    );
  });

  it("rejects ambiguous donor ordinals and passwords before binding", () => {
    const entry = {
      levelNumber: 7,
      password: "ABCD",
      bestTimeTicks: null,
      solutionData: null,
      expandedSolution: null,
    };
    expect(() => indexDonorEntries("fixture", "ms", [entry, entry])).toThrow(
      "duplicate donor entry: fixture/ms/7",
    );
    expect(() => verifyDonorPassword("save/fixture.tws", 7, "ABCD", "WXYZ")).toThrow(
      "donor password mismatch: save/fixture.tws/7",
    );
  });

  it("rejects donor files whose embedded set identity disagrees with the registry", () => {
    expect(() => verifyDonorSetName(
      "save/fixture.tws",
      "public_fixture.dac",
      "public_other.dac",
    )).toThrow("donor set-name mismatch: save/fixture.tws");
    expect(() => verifyDonorSetName("save/fixture.tws", null, "public_fixture.dac")).toThrow(
      "donor set-name mismatch: save/fixture.tws",
    );
    expect(() => verifyDonorSetName("save/fixture.tws", null, null)).not.toThrow();
  });

  it("rejects parsed donor entries that do not bind to a logical map occurrence", () => {
    const donorEntries = indexDonorEntries("fixture", "ms", [{
      levelNumber: 3,
      password: "ABCD",
      bestTimeTicks: null,
      solutionData: null,
      expandedSolution: null,
    }]);

    expect(() => verifyDonorEntryCoverage("fixture", "ms", donorEntries, [1, 2])).toThrow(
      "donor entry has no corpus occurrence: fixture/ms/3",
    );
    expect(() => verifyDonorEntryCoverage("fixture", "ms", donorEntries, [1, 2, 3])).not.toThrow();
  });
});
