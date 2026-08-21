import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import { canonicalizeJson, type BlobReferenceV1, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildP7GeneratedEvidenceSidecar } from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import { P7GeneratedEvidenceStore } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_PARTITION_IDENTITY,
  P7_TRAINING_PROCESSOR_REVISION,
  P7_TRAINING_SHARD_COUNT,
  P7_TRAINING_SHARD_REQUEST_ARTIFACT,
  P7_TRAINING_SHARD_RESULT_ARTIFACT,
  type P7TrainingShardPlan,
  type P7TrainingShardRequestArtifact,
  type P7TrainingShardResultArtifact,
} from "../p7-training-execution/p7TrainingShardProtocol";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  buildP7TrainingExecutionIndex,
  canonicalizeP7TrainingExecutionIndex,
} from "../p7b-training-review/p7TrainingExecutionIndex";
import {
  buildP7TrainingPackProofIndex,
  type P7TrainingPackProofIndexInput,
} from "../p7b-training-review/p7TrainingPackProofIndex";
import {
  attestP7TrainingEngineAuthorities,
  assembleP7TrainingEngineShards,
  checkP7TrainingEngineRun,
  prepareP7TrainingEngineRun,
  reduceP7TrainingEngineRun,
  runP7TrainingEngineShard,
  writeP7TrainingEngineAuthorities,
  type P7TrainingEngineRunnerOperations,
} from "./p7TrainingEngineRunnerCore";
import { p7TrainingExecutionAuthorityPath } from "./p7TrainingExecutionAuthorityIo";
import {
  P7_TRAINING_RUNNER_LIMITS,
  parseP7TrainingRunnerAggregatePlan,
  parseP7TrainingRunnerReduced,
  type P7TrainingRunBindingV1,
} from "./p7TrainingRunnerContract";

const sha256 = new WebCryptoSha256();
const binding: P7TrainingRunBindingV1 = {
  headSha: "a".repeat(40),
  runId: "123456",
  runAttempt: 1,
};
const runner = {
  path: "runner/p7-training-engine-runner.mjs" as const,
  content: { digest: `sha256:${"f".repeat(64)}` as const, byteLength: 12_345 },
};
let artifactRoot = "";
let repositoryRoot = "";
let additionalRoots: string[] = [];

function packContent(packId: P7TrainingPackId): BlobReferenceV1 {
  const digit = packId === "cclp1" ? "1" : packId === "cclp4" ? "4" : "5";
  return { digest: `sha256:${digit.repeat(64)}`, byteLength: 149 };
}

function reference(index: number): BlobReferenceV1 {
  return {
    digest: `sha256:${index.toString(16).padStart(64, "0")}`,
    byteLength: index + 1,
  };
}

function bounds(shardIndex: number) {
  const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
  const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
  const start = shardIndex * base + Math.min(shardIndex, remainder) + 1;
  return { start, end: start + base + Number(shardIndex < remainder) - 1 };
}

async function fakePlan(packId: P7TrainingPackId): Promise<P7TrainingShardPlan> {
  const requests: P7TrainingShardRequestArtifact[] = [];
  for (let shardIndex = 0; shardIndex < 8; shardIndex += 1) {
    const partition = bounds(shardIndex);
    const request = {
      artifact: P7_TRAINING_SHARD_REQUEST_ARTIFACT,
      version: 1,
      processorRevision: P7_TRAINING_PROCESSOR_REVISION,
      inventory: {
        corpusRevision: "fixture-corpus-v1",
        packId,
        packContent: packContent(packId),
      },
      partition: {
        identity: P7_TRAINING_PARTITION_IDENTITY,
        shardCount: P7_TRAINING_SHARD_COUNT,
        shardIndex,
        startLevelNumber: partition.start,
        endLevelNumber: partition.end,
      },
      occurrences: Array.from(
        { length: partition.end - partition.start + 1 },
        (_, index) => {
          const levelNumber = partition.start + index;
          return {
            caseId: `case:${packId}:${levelNumber}`,
            levelNumber,
            normalizedGameplaySha256: "b".repeat(64),
            occurrenceId: `${packId}/${String(levelNumber).padStart(3, "0")}`,
            sourceContainerContent: packContent(packId),
            sourceLevelContent: {
              digest: `sha256:${"c".repeat(64)}` as const,
              byteLength: levelNumber,
            },
            title: `Level ${levelNumber}`,
          };
        },
      ),
    } as const;
    const canonicalJson = canonicalizeJson(request as unknown as CanonicalJsonValue);
    requests.push({
      request,
      canonicalJson,
      content: await referenceCanonicalJson(canonicalJson, sha256),
    });
  }
  return { packId, packContent: packContent(packId), requests };
}

async function evidenceSidecar(occurrenceId: string) {
  const store = new P7GeneratedEvidenceStore({
    scopeId: `${occurrenceId}/runner-test`,
    sha256,
  });
  await store.referenceCanonical({ occurrenceId, status: "complete" });
  return buildP7GeneratedEvidenceSidecar({ bundle: store.bundle(), sha256 });
}

function browserTargets(levelNumber: number) {
  const target = (ruleset: "MS" | "Lynx") => ({
    request: {
      seriesFile: `fixture-${ruleset.toLowerCase()}.dac`,
      levelNumber,
      ruleset,
    },
    display: {
      seriesName: `Fixture ${ruleset}`,
      mapFilename: "fixture.dat",
      level: {
        index: levelNumber - 1,
        number: levelNumber,
        name: `Level ${levelNumber}`,
        author: "Fixture",
        password: "QWER",
        timeLimitSeconds: 100,
        chipsRequired: 0,
        bestTimeTicks: 0,
        levelSize: 1,
        solutionSize: 0,
        levelHash: `level-${levelNumber}`,
        gameplayHash: `gameplay-${levelNumber}`,
        hasSolution: false,
        sgflags: 0,
        unsolvable: null,
      },
    },
  });
  return { ms: target("MS"), lynx: target("Lynx") };
}

async function executionIndexFixture(
  packId: P7TrainingPackId,
  authorityPackContent: BlobReferenceV1,
) {
  const mapContent = reference(40_000);
  const externalInputs: P7TrainingPackProofIndexInput["externalInputs"] = [{
    path: "sets/fixture.dat",
    kind: "official-map",
    content: mapContent,
  }];
  const derivedSources: P7TrainingPackProofIndexInput["derivedSources"] = [];
  const generatedBlobs: P7TrainingPackProofIndexInput["generatedBlobs"] = [];
  const levels: P7TrainingPackProofIndexInput["levels"] = [];
  for (let levelNumber = 1; levelNumber <= 149; levelNumber += 1) {
    const levelContent = reference(41_000 + levelNumber);
    const contractContent = reference(42_000 + levelNumber);
    derivedSources.push({
      kind: "official-level-source",
      content: levelContent,
      sourceContent: mapContent,
      sourcePath: "sets/fixture.dat",
      locator: { kind: "byte-range", byteOffset: levelNumber - 1, byteLength: levelContent.byteLength },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber,
      variantId: null,
      target: null,
    });
    const contractPath = `packs/${packId}/levels/${String(levelNumber).padStart(3, "0")}/contract.json`;
    generatedBlobs.push({
      locator: { kind: "file", path: contractPath },
      mediaType: "application/json",
      content: contractContent,
      kind: "level-contract",
      levelNumber,
      variantId: null,
      target: null,
    });
    levels.push({
      levelNumber,
      contract: { path: contractPath, content: contractContent },
      reachableRefs: [levelContent, mapContent],
    });
  }
  const semanticProof = buildP7TrainingPackProofIndex({
    pack: {
      packId,
      expectedLevelCount: 149,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: P7_TRAINING_PROCESSOR_REVISION,
    },
    externalInputs,
    derivedSources,
    generatedBlobs,
    evidenceSidecars: [],
    levels,
    packReachableRefs: [],
  });
  return buildP7TrainingExecutionIndex({
    processorRevision: P7_TRAINING_PROCESSOR_REVISION,
    pack: { packId, packContent: authorityPackContent },
    semanticProof,
    browserTargets: Array.from({ length: 149 }, (_, index) => ({
      levelNumber: index + 1,
      targets: browserTargets(index + 1),
    })),
  });
}

function operations(input: {
  readonly shortReduction?: boolean;
  readonly mismatchedExecutionPack?: boolean;
  readonly onRunShard?: () => void;
} = {}): P7TrainingEngineRunnerOperations {
  return {
    loadInventory: async (_root, packId) => ({
      corpusRevision: "fixture-corpus-v1",
      verifiedInputs: [],
      packs: [{ packId }],
    }) as never,
    buildShardPlan: async ({ packId }) => fakePlan(packId),
    processLevel: async () => { throw new Error("fixture processLevel should be owned by fake runShard"); },
    runShard: async (runInput) => {
      input.onRunShard?.();
      const request = runInput.request;
      await runInput.loadInventory?.(runInput.repositoryRoot, runInput.sha256);
      for (const occurrence of request.request.occurrences) {
        await runInput.persistEvidence({
          occurrenceId: occurrence.occurrenceId,
          sidecar: await evidenceSidecar(occurrence.occurrenceId),
        });
      }
      const result = {
        artifact: P7_TRAINING_SHARD_RESULT_ARTIFACT,
        version: 1,
        processorRevision: P7_TRAINING_PROCESSOR_REVISION,
        inventory: request.request.inventory,
        requestContent: request.content,
        partition: request.request.partition,
        levels: request.request.occurrences.map((occurrence) => ({
          occurrenceId: occurrence.occurrenceId,
          caseId: occurrence.caseId,
          levelNumber: occurrence.levelNumber,
          processing: { status: "complete" },
        })),
      } as never;
      const canonicalJson = canonicalizeJson(result as CanonicalJsonValue);
      return {
        result,
        canonicalJson,
        content: await referenceCanonicalJson(canonicalJson, sha256),
      } as P7TrainingShardResultArtifact;
    },
    reduceShards: async (reduceInput) => {
      await reduceInput.loadInventory?.(reduceInput.repositoryRoot, reduceInput.sha256);
      const levels = reduceInput.results.flatMap(({ result }) => result.levels);
      return {
        packId: reduceInput.plan.packId,
        packContent: reduceInput.plan.packContent,
        levels: input.shortReduction ? levels.slice(0, -1) : levels,
      } as never;
    },
    buildExecutionIndex: async ({ packId, reducedPack }) => {
      const result = await executionIndexFixture(
        packId,
        input.mismatchedExecutionPack ? packContent("cclp4") : reducedPack.packContent,
      );
      const canonicalJson = canonicalizeP7TrainingExecutionIndex(result);
      return {
        index: result,
        canonicalJson,
        content: await referenceCanonicalJson(canonicalJson, sha256),
        evidenceOutputs: [],
      };
    },
  };
}

async function treeDigest(root: string): Promise<string> {
  const entries: { path: string; bytes: Uint8Array }[] = [];
  async function walk(relativePath: string): Promise<void> {
    const absolute = resolve(root, relativePath);
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else entries.push({ path: child, bytes: new Uint8Array(await readFile(resolve(root, child))) });
    }
  }
  await walk("");
  const hash = createHash("sha256");
  for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) {
    hash.update(entry.path);
    hash.update(entry.bytes);
  }
  return hash.digest("hex");
}

beforeEach(async () => {
  additionalRoots = [];
  repositoryRoot = await mkdtemp(resolve(tmpdir(), "tworld-p7-engine-repo-"));
  artifactRoot = await mkdtemp(resolve(tmpdir(), "tworld-p7-engine-artifacts-"));
});

afterEach(async () => {
  await Promise.all([
    rm(repositoryRoot, { recursive: true, force: true }),
    rm(artifactRoot, { recursive: true, force: true }),
    ...additionalRoots.map((root) => rm(root, { recursive: true, force: true })),
  ]);
});

describe("P7 graph-independent engine runner", () => {
  it("prepares one ordered aggregate plan and uses exactly eight workers across its pack subset", async () => {
    const prepared = await prepareP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      packIds: ["cclp1", "cclp5"],
      sha256,
      operations: operations(),
    });
    expect(prepared.plan.packs.map(({ packId }) => packId)).toEqual(["cclp1", "cclp5"]);
    expect(prepared.plan.shardCount).toBe(8);
    const stored = parseP7TrainingRunnerAggregatePlan(
      new TextDecoder().decode(await readFile(resolve(artifactRoot, "plan.json"))),
    );
    expect(stored).toEqual(prepared.plan);
    await expect(runP7TrainingEngineShard({
      repositoryRoot,
      artifactRoot,
      binding,
      runner: { ...runner, content: reference(99_999) },
      shardIndex: 0,
      sha256,
      operations: operations(),
    })).rejects.toThrow("runner content drifted");
  });

  it("fail-closed assembles exactly eight isolated shard roots before reduction", async () => {
    const baseOperations = operations();
    await prepareP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      packIds: ["cclp1"],
      sha256,
      operations: baseOperations,
    });
    const shardRoots: string[] = [];
    for (let shardIndex = 0; shardIndex < 8; shardIndex += 1) {
      const parent = await mkdtemp(resolve(tmpdir(), `tworld-p7-isolated-${shardIndex}-`));
      additionalRoots.push(parent);
      const shardRoot = resolve(parent, "artifacts");
      await cp(artifactRoot, shardRoot, { recursive: true });
      await runP7TrainingEngineShard({
        repositoryRoot,
        artifactRoot: shardRoot,
        binding,
        runner,
        shardIndex,
        sha256,
        operations: baseOperations,
      });
      shardRoots.push(shardRoot);
    }

    await writeFile(resolve(shardRoots[0]!, "extra.json"), "{}", "utf8");
    await expect(assembleP7TrainingEngineShards({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      shardRoots,
      sha256,
      operations: baseOperations,
    })).rejects.toThrow("missing, extra, or misplaced");
    await unlink(resolve(shardRoots[0]!, "extra.json"));

    const manifestPath = resolve(shardRoots[0]!, "packs/cclp1/shards/0/manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    (manifest.binding as Record<string, unknown>).runAttempt = 2;
    await writeFile(manifestPath, canonicalizeJson(manifest as CanonicalJsonValue), "utf8");
    await expect(assembleP7TrainingEngineShards({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      shardRoots,
      sha256,
      operations: baseOperations,
    })).rejects.toThrow("binding drifted");
    await runP7TrainingEngineShard({
      repositoryRoot,
      artifactRoot: shardRoots[0]!,
      binding,
      runner,
      shardIndex: 0,
      sha256,
      operations: baseOperations,
    });

    const missingPayload = resolve(
      shardRoots[7]!,
      "packs/cclp1/shards/7/evidence/cclp1/149/payload.bin",
    );
    await unlink(missingPayload);
    await expect(assembleP7TrainingEngineShards({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      shardRoots,
      sha256,
      operations: baseOperations,
    })).rejects.toThrow(/missing|missing, extra/iu);
    await runP7TrainingEngineShard({
      repositoryRoot,
      artifactRoot: shardRoots[7]!,
      binding,
      runner,
      shardIndex: 7,
      sha256,
      operations: baseOperations,
    });

    await expect(assembleP7TrainingEngineShards({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      shardRoots,
      sha256,
      operations: baseOperations,
    })).resolves.toMatchObject({ shardRoots, copiedFiles: 314 });
    await expect(reduceP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: baseOperations,
    })).resolves.toHaveLength(1);
  }, 30_000);

  it("runs, reduces, and immutably rechecks all 149 sidecars without calling the processor", async () => {
    const baseOperations = operations();
    await prepareP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      packIds: ["cclp1"],
      sha256,
      operations: baseOperations,
    });
    for (let shardIndex = 0; shardIndex < 8; shardIndex += 1) {
      await runP7TrainingEngineShard({
        repositoryRoot,
        artifactRoot,
        binding,
        runner,
        shardIndex,
        sha256,
        operations: baseOperations,
      });
    }
    const reduced = await reduceP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: baseOperations,
    });
    expect(reduced).toHaveLength(1);
    expect(reduced[0]!.reduced.evidence).toHaveLength(149);
    expect(parseP7TrainingRunnerReduced(
      new TextDecoder().decode(await readFile(resolve(artifactRoot, "packs/cclp1/reduced.json"))),
    )).toEqual(reduced[0]!.reduced);

    const before = await treeDigest(artifactRoot);
    let processorCalls = 0;
    const checkingOperations = operations({ onRunShard: () => { processorCalls += 1; } });
    await checkP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: checkingOperations,
    });
    expect(processorCalls).toBe(0);
    expect(await treeDigest(artifactRoot)).toBe(before);

    await writeP7TrainingEngineAuthorities({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: checkingOperations,
    });
    expect(new TextDecoder().decode(await readFile(
      resolve(repositoryRoot, p7TrainingExecutionAuthorityPath("cclp1")),
    ))).toBe(reduced[0]!.executionIndex.canonicalJson);
    await attestP7TrainingEngineAuthorities({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: checkingOperations,
    });
    expect(processorCalls).toBe(0);

    const cclp1Authority = resolve(repositoryRoot, p7TrainingExecutionAuthorityPath("cclp1"));
    const transplantedAuthority = resolve(repositoryRoot, p7TrainingExecutionAuthorityPath("cclp4"));
    await writeFile(transplantedAuthority, await readFile(cclp1Authority));
    await expect(writeP7TrainingEngineAuthorities({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: checkingOperations,
    })).rejects.toThrow("filename identity drifted");
    await unlink(transplantedAuthority);

    await expect(checkP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding: { ...binding, runAttempt: 2 },
      runner,
      sha256,
      operations: baseOperations,
    })).rejects.toThrow("binding drifted");
  }, 30_000);

  it("rejects result digest drift, transplanted pack authority, and a 148-level reduction", async () => {
    const baseOperations = operations();
    await prepareP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      packIds: ["cclp1"],
      sha256,
      operations: baseOperations,
    });
    for (let shardIndex = 0; shardIndex < 8; shardIndex += 1) {
      await runP7TrainingEngineShard({
        repositoryRoot,
        artifactRoot,
        binding,
        runner,
        shardIndex,
        sha256,
        operations: baseOperations,
      });
    }
    await writeFile(resolve(artifactRoot, "packs/cclp1/shards/0/result.json"), "{}", "utf8");
    await expect(reduceP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: baseOperations,
    })).rejects.toThrow("digest drifted");

    // Restore the deterministic shard result, then exercise reduction-level mutations.
    await runP7TrainingEngineShard({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      shardIndex: 0,
      sha256,
      operations: baseOperations,
    });
    await expect(reduceP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: operations({ mismatchedExecutionPack: true }),
    })).rejects.toThrow("pack content drifted");
    await expect(reduceP7TrainingEngineRun({
      repositoryRoot,
      artifactRoot,
      binding,
      runner,
      sha256,
      operations: operations({ shortReduction: true }),
    })).rejects.toThrow("exactly 149");
  }, 30_000);
});
