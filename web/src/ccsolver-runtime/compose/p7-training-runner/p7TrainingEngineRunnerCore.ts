import { resolve } from "node:path";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_PROCESSOR_REVISION,
  P7_TRAINING_SHARD_COUNT,
  P7_TRAINING_SHARD_LIMITS,
  buildP7TrainingShardPlan,
  reduceP7TrainingShards,
  runP7TrainingShard,
  type P7TrainingInventoryLoader,
  type P7TrainingLevelProcessor,
  type P7TrainingReducedPack,
  type P7TrainingShardPlan,
  type P7TrainingShardResultArtifact,
} from "../p7-training-execution/p7TrainingShardProtocol";
import { processP7TrainingLevel } from "../p7-training-execution/p7TrainingLevelProcessor";
import { loadCheckedTrainingPackInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type {
  P7TrainingPackId,
  P7TrainingPackInventoryClosure,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
  assertP7TrainingExecutionPackContent,
  canonicalizeP7TrainingExecutionIndex,
  parseP7TrainingExecutionIndex,
  type P7TrainingExecutionIndexBuildResult,
} from "../p7b-training-review/p7TrainingExecutionIndex";
import { buildP7TrainingReducedPackExecutionIndex } from "../p7b-training-review/composeP7TrainingReducedExecutionIndex";
import {
  P7_TRAINING_RUNNER_LIMITS,
  assertP7TrainingRunBinding,
  buildP7TrainingRunnerAggregatePlan,
  buildP7TrainingRunnerPlan,
  buildP7TrainingRunnerReduced,
  buildP7TrainingRunnerShardResult,
  canonicalizeP7TrainingRunnerAggregatePlan,
  canonicalizeP7TrainingRunnerPlan,
  canonicalizeP7TrainingRunnerReduced,
  canonicalizeP7TrainingRunnerShardResult,
  p7TrainingPackPlanPath,
  p7TrainingPackRoot,
  p7TrainingRequestPath,
  p7TrainingShardManifestPath,
  p7TrainingShardResultPath,
  parseP7TrainingRunnerAggregatePlan,
  parseP7TrainingRunnerPlan,
  parseP7TrainingRunnerReduced,
  parseP7TrainingRunnerShardResult,
  referenceP7TrainingRunnerArtifact,
  type P7TrainingRunBindingV1,
  type P7TrainingRunnerBinaryV1,
  type P7TrainingRunnerAggregatePlanV1,
  type P7TrainingRunnerCanonicalArtifact,
  type P7TrainingRunnerEvidenceDescriptorV1,
  type P7TrainingRunnerPlanV1,
  type P7TrainingRunnerReducedV1,
  type P7TrainingRunnerShardResultV1,
} from "./p7TrainingRunnerContract";
import { P7TrainingArtifactFilesystem } from "./p7TrainingSidecarFilesystem";
import {
  attestCheckedP7TrainingExecutionAuthorities,
  writeP7TrainingExecutionAuthoritiesTransactionally,
} from "./p7TrainingExecutionAuthorityIo";

export type P7TrainingExecutionIndexArtifact = P7TrainingExecutionIndexBuildResult;

export type P7TrainingScopedInventoryLoader = (
  repositoryRoot: string,
  packId: P7TrainingPackId,
  sha256: Sha256Port,
) => Promise<P7TrainingPackInventoryClosure>;

export type P7TrainingExecutionIndexBuilder = (input: {
  readonly repositoryRoot: string;
  readonly packId: P7TrainingPackId;
  readonly inventory: P7TrainingPackInventoryClosure;
  readonly plan: P7TrainingShardPlan;
  readonly reducedPack: P7TrainingReducedPack;
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
  readonly loadEvidence: P7TrainingArtifactFilesystem["verifyEvidence"];
  readonly sha256: Sha256Port;
}) => Promise<P7TrainingExecutionIndexArtifact>;

export interface P7TrainingEngineRunnerOperations {
  readonly loadInventory: P7TrainingScopedInventoryLoader;
  readonly buildShardPlan: typeof buildP7TrainingShardPlan;
  readonly processLevel: P7TrainingLevelProcessor;
  readonly runShard: typeof runP7TrainingShard;
  readonly reduceShards: typeof reduceP7TrainingShards;
  readonly buildExecutionIndex: P7TrainingExecutionIndexBuilder;
  readonly attestExecutionIndex?: (input: {
    readonly repositoryRoot: string;
    readonly packId: P7TrainingPackId;
    readonly artifact: P7TrainingExecutionIndexArtifact;
    readonly sha256: Sha256Port;
  }) => Promise<void>;
}

export interface P7TrainingPreparedPack {
  readonly inventory: P7TrainingPackInventoryClosure;
  readonly shardPlan: P7TrainingShardPlan;
  readonly runnerPlan: P7TrainingRunnerCanonicalArtifact<P7TrainingRunnerPlanV1>;
}

export interface P7TrainingPreparedRun {
  readonly plan: P7TrainingRunnerAggregatePlanV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  readonly packs: readonly P7TrainingPreparedPack[];
}

export interface P7TrainingEngineReduction {
  readonly packId: P7TrainingPackId;
  readonly reducedPack: P7TrainingReducedPack;
  readonly executionIndex: P7TrainingExecutionIndexArtifact;
  readonly reduced: P7TrainingRunnerReducedV1;
  readonly reducedCanonicalJson: CanonicalJson;
  readonly reducedContent: BlobReferenceV1;
  /** Verified occurrence-addressed sidecar loader for graph-free composition. */
  readonly loadEvidence: P7TrainingArtifactFilesystem["verifyEvidence"];
}

export interface P7TrainingShardAssemblyResult {
  readonly shardRoots: readonly string[];
  readonly copiedFiles: number;
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as CanonicalJsonValue) === canonicalizeJson(right as CanonicalJsonValue);
}

function assertRunnerBinary(
  actual: P7TrainingRunnerBinaryV1,
  expected: P7TrainingRunnerBinaryV1,
): void {
  if (actual.path !== expected.path || !sameReference(actual.content, expected.content)) {
    throw new Error("P7 bundled engine runner content drifted");
  }
}

function defaultOperations(
  buildExecutionIndex: P7TrainingExecutionIndexBuilder = buildP7TrainingReducedPackExecutionIndex,
): P7TrainingEngineRunnerOperations {
  return {
    loadInventory: loadCheckedTrainingPackInventory,
    buildShardPlan: buildP7TrainingShardPlan,
    processLevel: processP7TrainingLevel,
    runShard: runP7TrainingShard,
    reduceShards: reduceP7TrainingShards,
    buildExecutionIndex,
  };
}

function resolvedOperations(input: {
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): P7TrainingEngineRunnerOperations {
  if (input.operations !== undefined) return input.operations;
  return defaultOperations(input.buildExecutionIndex);
}

function packFilesystem(input: {
  readonly artifactRoot: string;
  readonly packId: P7TrainingPackId;
  readonly shardIndex?: number;
  readonly sha256: Sha256Port;
}): P7TrainingArtifactFilesystem {
  return new P7TrainingArtifactFilesystem({
    trustedRoot: input.artifactRoot,
    artifactRoot: `${input.artifactRoot}/${p7TrainingPackRoot(input.packId)}`,
    packId: input.packId,
    shardIndex: input.shardIndex ?? 0,
    sha256: input.sha256,
  });
}

function aggregateFilesystem(input: {
  readonly artifactRoot: string;
  readonly packId: P7TrainingPackId;
  readonly sha256: Sha256Port;
}): P7TrainingArtifactFilesystem {
  return new P7TrainingArtifactFilesystem({
    trustedRoot: input.artifactRoot,
    artifactRoot: input.artifactRoot,
    packId: input.packId,
    shardIndex: 0,
    sha256: input.sha256,
  });
}

function scopedLoader(
  operations: P7TrainingEngineRunnerOperations,
  packId: P7TrainingPackId,
): P7TrainingInventoryLoader {
  return (repositoryRoot, sha256) => operations.loadInventory(repositoryRoot, packId, sha256);
}

function assertPackOrder(packIds: readonly P7TrainingPackId[]): void {
  const order: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
  if (
    packIds.length < 1
    || packIds.length > order.length
    || packIds.some((packId, index) => (
      order.indexOf(packId) <= (index === 0 ? -1 : order.indexOf(packIds[index - 1]!))
    ))
  ) throw new Error("P7 engine runner packs must be a strict nonempty cclp1/cclp4/cclp5 subset");
}

async function referencedCanonical<T>(input: {
  readonly value: T;
  readonly canonicalize: (value: T) => CanonicalJson;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingRunnerCanonicalArtifact<T>> {
  return referenceP7TrainingRunnerArtifact(input);
}

export async function prepareP7TrainingEngineRun(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly packIds: readonly P7TrainingPackId[];
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<P7TrainingPreparedRun> {
  assertPackOrder(input.packIds);
  const operations = resolvedOperations(input);
  const rootFilesystem = aggregateFilesystem({
    artifactRoot: input.artifactRoot,
    packId: input.packIds[0]!,
    sha256: input.sha256,
  });
  await rootFilesystem.initialize();
  const packs: P7TrainingPreparedPack[] = [];
  for (const packId of input.packIds) {
    const inventory = await operations.loadInventory(input.repositoryRoot, packId, input.sha256);
    if (inventory.packs.length !== 1 || inventory.packs[0]?.packId !== packId) {
      throw new Error(`P7 scoped inventory did not return exactly ${packId}`);
    }
    const shardPlan = await operations.buildShardPlan({ inventory, packId, sha256: input.sha256 });
    if (shardPlan.requests.length !== P7_TRAINING_SHARD_COUNT) {
      throw new Error(`${packId} P7 plan does not contain exactly eight shards`);
    }
    const runnerPlanValue = buildP7TrainingRunnerPlan({
      binding: input.binding,
      runner: input.runner,
      plan: shardPlan,
    });
    const runnerPlan = await referencedCanonical({
      value: runnerPlanValue,
      canonicalize: canonicalizeP7TrainingRunnerPlan,
      sha256: input.sha256,
    });
    const filesystem = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId,
      sha256: input.sha256,
    });
    await filesystem.initialize();
    for (const [shardIndex, request] of shardPlan.requests.entries()) {
      await filesystem.writeCanonicalJson(
        p7TrainingRequestPath(shardIndex),
        request.canonicalJson,
        P7_TRAINING_SHARD_LIMITS.maximumRequestBytes,
      );
    }
    // The per-pack plan commits its complete request set.
    await filesystem.writeCanonicalJson(
      "plan.json",
      runnerPlan.canonicalJson,
      P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
    );
    packs.push({ inventory, shardPlan, runnerPlan });
  }
  const aggregateValue = buildP7TrainingRunnerAggregatePlan({
    binding: input.binding,
    runner: input.runner,
    plans: packs.map(({ runnerPlan }) => ({
      packId: runnerPlan.value.pack.packId,
      content: runnerPlan.content,
    })),
  });
  const aggregate = await referencedCanonical({
    value: aggregateValue,
    canonicalize: canonicalizeP7TrainingRunnerAggregatePlan,
    sha256: input.sha256,
  });
  // The aggregate plan is the final prepare commit marker.
  await rootFilesystem.writeCanonicalJson(
    "plan.json",
    aggregate.canonicalJson,
    P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
  );
  return { plan: aggregate.value, canonicalJson: aggregate.canonicalJson, content: aggregate.content, packs };
}

async function loadPreparedRun(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations: P7TrainingEngineRunnerOperations;
}): Promise<P7TrainingPreparedRun> {
  // A valid aggregate plan always names at least one pack. Use cclp1 only to
  // access generic root IO; no pack-scoped evidence method is invoked here.
  const rootFilesystem = aggregateFilesystem({
    artifactRoot: input.artifactRoot,
    packId: "cclp1",
    sha256: input.sha256,
  });
  const aggregateJson = await rootFilesystem.readCanonicalJson(
    "plan.json",
    P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
  );
  const aggregateValue = parseP7TrainingRunnerAggregatePlan(aggregateJson);
  assertP7TrainingRunBinding(aggregateValue.binding, input.binding);
  assertRunnerBinary(aggregateValue.runner, input.runner);
  const aggregateContent = await referenceCanonicalJson(aggregateJson, input.sha256);
  const packs: P7TrainingPreparedPack[] = [];
  for (const descriptor of aggregateValue.packs) {
    const filesystem = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId: descriptor.packId,
      sha256: input.sha256,
    });
    const planJson = await filesystem.readCanonicalJson(
      "plan.json",
      P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
    );
    const planContent = await referenceCanonicalJson(planJson, input.sha256);
    if (!sameReference(planContent, descriptor.content)) {
      throw new Error(`${descriptor.packId} P7 plan digest drifted`);
    }
    const planValue = parseP7TrainingRunnerPlan(planJson);
    assertP7TrainingRunBinding(planValue.binding, input.binding);
    assertRunnerBinary(planValue.runner, input.runner);
    if (planValue.pack.packId !== descriptor.packId) {
      throw new Error(`${descriptor.packId} P7 plan identity drifted`);
    }
    const inventory = await input.operations.loadInventory(
      input.repositoryRoot,
      descriptor.packId,
      input.sha256,
    );
    if (inventory.packs.length !== 1 || inventory.packs[0]?.packId !== descriptor.packId) {
      throw new Error(`P7 scoped inventory did not return exactly ${descriptor.packId}`);
    }
    const shardPlan = await input.operations.buildShardPlan({
      inventory,
      packId: descriptor.packId,
      sha256: input.sha256,
    });
    const expectedPlan = buildP7TrainingRunnerPlan({
      binding: input.binding,
      runner: input.runner,
      plan: shardPlan,
    });
    if (canonicalizeP7TrainingRunnerPlan(expectedPlan) !== planJson) {
      throw new Error(`${descriptor.packId} P7 plan does not match fresh scoped inventory`);
    }
    for (const [shardIndex, request] of shardPlan.requests.entries()) {
      const requestJson = await filesystem.readCanonicalJson(
        p7TrainingRequestPath(shardIndex),
        P7_TRAINING_SHARD_LIMITS.maximumRequestBytes,
      );
      if (
        requestJson !== request.canonicalJson
        || !sameReference(
          await referenceCanonicalJson(requestJson, input.sha256),
          planValue.requests[shardIndex]!.content,
        )
      ) throw new Error(`${descriptor.packId} P7 shard ${shardIndex} request digest drifted`);
    }
    packs.push({
      inventory,
      shardPlan,
      runnerPlan: { value: planValue, canonicalJson: planJson, content: planContent },
    });
  }
  return {
    plan: aggregateValue,
    canonicalJson: aggregateJson,
    content: aggregateContent,
    packs,
  };
}

export async function runP7TrainingEngineShard(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly shardIndex: number;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<readonly P7TrainingRunnerCanonicalArtifact<P7TrainingRunnerShardResultV1>[]> {
  if (!Number.isSafeInteger(input.shardIndex) || input.shardIndex < 0 || input.shardIndex >= 8) {
    throw new Error("P7 engine shard index must be in 0..7");
  }
  const operations = resolvedOperations(input);
  const prepared = await loadPreparedRun({ ...input, operations });
  const outputs: P7TrainingRunnerCanonicalArtifact<P7TrainingRunnerShardResultV1>[] = [];
  // One worker index processes the same fixed shard sequentially across the
  // selected pack subset. CI therefore has exactly eight workers, never 24.
  for (const pack of prepared.packs) {
    const packId = pack.shardPlan.packId;
    const request = pack.shardPlan.requests[input.shardIndex]!;
    const filesystem = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId,
      shardIndex: input.shardIndex,
      sha256: input.sha256,
    });
    const result = await operations.runShard({
      repositoryRoot: input.repositoryRoot,
      request,
      sha256: input.sha256,
      processLevel: operations.processLevel,
      persistEvidence: filesystem.persistEvidence,
      loadInventory: scopedLoader(operations, packId),
    });
    if (!sameReference(await referenceCanonicalJson(result.canonicalJson, input.sha256), result.content)) {
      throw new Error(`${packId} P7 shard ${input.shardIndex} result digest drifted`);
    }
    const evidence = await filesystem.collectShardEvidence({
      occurrenceIds: request.request.occurrences.map(({ occurrenceId }) => occurrenceId),
      sha256: input.sha256,
    });
    await filesystem.writeCanonicalJson(
      p7TrainingShardResultPath(input.shardIndex),
      result.canonicalJson,
      P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
    );
    const value = buildP7TrainingRunnerShardResult({
      binding: input.binding,
      packId,
      planContent: pack.runnerPlan.content,
      shardIndex: input.shardIndex,
      requestContent: request.content,
      resultContent: result.content,
      evidence,
    });
    const artifact = await referencedCanonical({
      value,
      canonicalize: canonicalizeP7TrainingRunnerShardResult,
      sha256: input.sha256,
    });
    // The wrapper manifest is the shard commit marker and is written last.
    await filesystem.writeCanonicalJson(
      p7TrainingShardManifestPath(input.shardIndex),
      artifact.canonicalJson,
      P7_TRAINING_RUNNER_LIMITS.maximumShardManifestBytes,
    );
    outputs.push(artifact);
  }
  return outputs;
}

interface P7TrainingAssemblyCopy {
  readonly sourceFilesystem: P7TrainingArtifactFilesystem;
  readonly destinationFilesystem: P7TrainingArtifactFilesystem;
  readonly relativePath: string;
  readonly maximumBytes: number;
  readonly content: BlobReferenceV1;
}

function assertExactFiles(actual: readonly string[], expected: ReadonlySet<string>, label: string): void {
  const expectedFiles = [...expected].sort();
  if (
    actual.length !== expectedFiles.length
    || actual.some((path, index) => path !== expectedFiles[index])
  ) throw new Error(`${label} contains missing, extra, or misplaced files`);
}

function preparedFileSet(prepared: P7TrainingPreparedRun): Set<string> {
  const expected = new Set<string>(["plan.json"]);
  for (const pack of prepared.packs) {
    const packRoot = p7TrainingPackRoot(pack.shardPlan.packId);
    expected.add(`${packRoot}/plan.json`);
    for (let shardIndex = 0; shardIndex < P7_TRAINING_SHARD_COUNT; shardIndex += 1) {
      expected.add(`${packRoot}/${p7TrainingRequestPath(shardIndex)}`);
    }
  }
  return expected;
}

async function validateIsolatedShardRoot(input: {
  readonly artifactRoot: string;
  readonly shardIndex: number;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly prepared: P7TrainingPreparedRun;
  readonly destinationRoot: string;
  readonly sha256: Sha256Port;
}): Promise<readonly P7TrainingAssemblyCopy[]> {
  if (input.artifactRoot === input.destinationRoot) {
    throw new Error(`P7 isolated shard ${input.shardIndex} root equals the reducer root`);
  }
  const rootFilesystem = aggregateFilesystem({
    artifactRoot: input.artifactRoot,
    packId: input.prepared.packs[0]!.shardPlan.packId,
    sha256: input.sha256,
  });
  const aggregateJson = await rootFilesystem.readCanonicalJson(
    "plan.json",
    P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
  );
  if (aggregateJson !== input.prepared.canonicalJson) {
    throw new Error(`P7 isolated shard ${input.shardIndex} aggregate plan drifted`);
  }
  const aggregate = parseP7TrainingRunnerAggregatePlan(aggregateJson);
  assertP7TrainingRunBinding(aggregate.binding, input.binding);
  assertRunnerBinary(aggregate.runner, input.runner);
  const expectedFiles = preparedFileSet(input.prepared);
  const copies: P7TrainingAssemblyCopy[] = [];
  for (const pack of input.prepared.packs) {
    const packId = pack.shardPlan.packId;
    const source = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId,
      shardIndex: input.shardIndex,
      sha256: input.sha256,
    });
    const destination = packFilesystem({
      artifactRoot: input.destinationRoot,
      packId,
      shardIndex: input.shardIndex,
      sha256: input.sha256,
    });
    const planJson = await source.readCanonicalJson(
      "plan.json",
      P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
    );
    if (planJson !== pack.runnerPlan.canonicalJson) {
      throw new Error(`${packId} isolated shard ${input.shardIndex} plan drifted`);
    }
    for (let requestIndex = 0; requestIndex < P7_TRAINING_SHARD_COUNT; requestIndex += 1) {
      const requestPath = p7TrainingRequestPath(requestIndex);
      const requestJson = await source.readCanonicalJson(
        requestPath,
        P7_TRAINING_SHARD_LIMITS.maximumRequestBytes,
      );
      if (requestJson !== pack.shardPlan.requests[requestIndex]!.canonicalJson) {
        throw new Error(`${packId} isolated shard ${input.shardIndex} request ${requestIndex} drifted`);
      }
    }
    const manifestPath = p7TrainingShardManifestPath(input.shardIndex);
    const manifestJson = await source.readCanonicalJson(
      manifestPath,
      P7_TRAINING_RUNNER_LIMITS.maximumShardManifestBytes,
    );
    const manifest = parseP7TrainingRunnerShardResult(manifestJson);
    assertP7TrainingRunBinding(manifest.binding, input.binding);
    if (
      manifest.packId !== packId
      || manifest.shardIndex !== input.shardIndex
      || !sameReference(manifest.planContent, pack.runnerPlan.content)
      || !sameReference(
        manifest.request.content,
        pack.shardPlan.requests[input.shardIndex]!.content,
      )
    ) throw new Error(`${packId} isolated shard ${input.shardIndex} manifest binding drifted`);
    const occurrenceIds = pack.shardPlan.requests[input.shardIndex]!.request.occurrences
      .map(({ occurrenceId }) => occurrenceId);
    const physicalEvidence = await source.collectShardEvidence({ occurrenceIds, sha256: input.sha256 });
    if (!sameCanonical(physicalEvidence, manifest.evidence)) {
      throw new Error(`${packId} isolated shard ${input.shardIndex} evidence drifted`);
    }
    const resultPath = p7TrainingShardResultPath(input.shardIndex);
    const resultContent = await source.referenceRegularFile(
      resultPath,
      P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
      input.sha256,
    );
    if (!sameReference(resultContent, manifest.result.content)) {
      throw new Error(`${packId} isolated shard ${input.shardIndex} result digest drifted`);
    }
    const packRoot = p7TrainingPackRoot(packId);
    expectedFiles.add(`${packRoot}/${manifestPath}`);
    expectedFiles.add(`${packRoot}/${resultPath}`);
    const manifestContent = await referenceCanonicalJson(manifestJson, input.sha256);
    for (const evidence of manifest.evidence) {
      expectedFiles.add(`${packRoot}/${evidence.indexPath}`);
      expectedFiles.add(`${packRoot}/${evidence.payloadPath}`);
      copies.push(
        {
          sourceFilesystem: source,
          destinationFilesystem: destination,
          relativePath: evidence.payloadPath,
          maximumBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
          content: evidence.payloadContent,
        },
        {
          sourceFilesystem: source,
          destinationFilesystem: destination,
          relativePath: evidence.indexPath,
          maximumBytes: P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes,
          content: evidence.indexContent,
        },
      );
    }
    copies.push(
      {
        sourceFilesystem: source,
        destinationFilesystem: destination,
        relativePath: resultPath,
        maximumBytes: P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
        content: manifest.result.content,
      },
      {
        sourceFilesystem: source,
        destinationFilesystem: destination,
        relativePath: manifestPath,
        maximumBytes: P7_TRAINING_RUNNER_LIMITS.maximumShardManifestBytes,
        content: manifestContent,
      },
    );
  }
  assertExactFiles(
    await rootFilesystem.listRegularFiles(),
    expectedFiles,
    `P7 isolated shard ${input.shardIndex}`,
  );
  return copies;
}

/**
 * Fail-closed assembly of exactly eight isolated CI shard artifacts. All roots
 * are completely verified before any shard file is copied into the reducer tree.
 */
export async function assembleP7TrainingEngineShards(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly shardRoots: readonly string[];
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<P7TrainingShardAssemblyResult> {
  if (input.shardRoots.length !== P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 shard assembly requires exactly eight isolated roots");
  }
  const normalizedRoots = input.shardRoots.map((root) => resolve(root));
  if (new Set(normalizedRoots).size !== P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 shard assembly roots must be distinct");
  }
  const destinationRoot = resolve(input.artifactRoot);
  const operations = resolvedOperations(input);
  const prepared = await loadPreparedRun({ ...input, artifactRoot: destinationRoot, operations });
  const destinationFilesystem = aggregateFilesystem({
    artifactRoot: destinationRoot,
    packId: prepared.packs[0]!.shardPlan.packId,
    sha256: input.sha256,
  });
  assertExactFiles(
    await destinationFilesystem.listRegularFiles(),
    preparedFileSet(prepared),
    "P7 reducer prepared root",
  );
  const copySets: P7TrainingAssemblyCopy[][] = [];
  for (let shardIndex = 0; shardIndex < P7_TRAINING_SHARD_COUNT; shardIndex += 1) {
    copySets.push([...(await validateIsolatedShardRoot({
      artifactRoot: normalizedRoots[shardIndex]!,
      shardIndex,
      binding: input.binding,
      runner: input.runner,
      prepared,
      destinationRoot,
      sha256: input.sha256,
    }))]);
  }
  let copiedFiles = 0;
  for (const copies of copySets) {
    for (const copy of copies) {
      const bytes = await copy.sourceFilesystem.readRegularFile(copy.relativePath, copy.maximumBytes);
      if (!sameReference(await referenceSourceBytes(bytes, input.sha256), copy.content)) {
        throw new Error(`P7 isolated shard file changed after validation: ${copy.relativePath}`);
      }
      await copy.destinationFilesystem.writeRegularFile(copy.relativePath, bytes, copy.maximumBytes);
      copiedFiles += 1;
    }
  }
  return { shardRoots: normalizedRoots, copiedFiles };
}

interface LoadedPackResults {
  readonly results: readonly P7TrainingShardResultArtifact[];
  readonly resultManifestContents: readonly BlobReferenceV1[];
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
  readonly verifyEvidence: P7TrainingArtifactFilesystem["verifyEvidence"];
}

async function loadPackResults(input: {
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly pack: P7TrainingPreparedPack;
  readonly sha256: Sha256Port;
}): Promise<LoadedPackResults> {
  const packId = input.pack.shardPlan.packId;
  const results: P7TrainingShardResultArtifact[] = [];
  const resultManifestContents: BlobReferenceV1[] = [];
  const evidence: P7TrainingRunnerEvidenceDescriptorV1[] = [];
  const byOccurrence = new Map<string, {
    readonly filesystem: P7TrainingArtifactFilesystem;
    readonly descriptor: P7TrainingRunnerEvidenceDescriptorV1;
  }>();
  for (let shardIndex = 0; shardIndex < P7_TRAINING_SHARD_COUNT; shardIndex += 1) {
    const filesystem = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId,
      shardIndex,
      sha256: input.sha256,
    });
    const manifestJson = await filesystem.readCanonicalJson(
      p7TrainingShardManifestPath(shardIndex),
      P7_TRAINING_RUNNER_LIMITS.maximumShardManifestBytes,
    );
    const manifest = parseP7TrainingRunnerShardResult(manifestJson);
    assertP7TrainingRunBinding(manifest.binding, input.binding);
    if (
      manifest.packId !== packId
      || manifest.shardIndex !== shardIndex
      || !sameReference(manifest.planContent, input.pack.runnerPlan.content)
      || !sameReference(manifest.request.content, input.pack.shardPlan.requests[shardIndex]!.content)
    ) throw new Error(`${packId} P7 shard ${shardIndex} manifest binding drifted`);
    const physicalEvidence = await filesystem.collectShardEvidence({
      occurrenceIds: input.pack.shardPlan.requests[shardIndex]!.request.occurrences
        .map(({ occurrenceId }) => occurrenceId),
      sha256: input.sha256,
    });
    if (!sameCanonical(physicalEvidence, manifest.evidence)) {
      throw new Error(`${packId} P7 shard ${shardIndex} sidecar manifest drifted`);
    }
    for (const descriptor of manifest.evidence) {
      if (byOccurrence.has(descriptor.occurrenceId)) {
        throw new Error(`duplicate P7 sidecar occurrence across shards: ${descriptor.occurrenceId}`);
      }
      byOccurrence.set(descriptor.occurrenceId, { filesystem, descriptor });
      evidence.push(descriptor);
    }
    const resultJson = await filesystem.readCanonicalJson(
      p7TrainingShardResultPath(shardIndex),
      P7_TRAINING_SHARD_LIMITS.maximumResultBytes,
    );
    if (!sameReference(await referenceCanonicalJson(resultJson, input.sha256), manifest.result.content)) {
      throw new Error(`${packId} P7 shard ${shardIndex} result digest drifted`);
    }
    results.push({
      result: JSON.parse(resultJson) as P7TrainingShardResultArtifact["result"],
      canonicalJson: resultJson,
      content: manifest.result.content,
    });
    resultManifestContents.push(await referenceCanonicalJson(manifestJson, input.sha256));
  }
  if (
    evidence.length !== P7_TRAINING_LEVELS_PER_PACK
    || evidence.some((entry, index) => entry.levelNumber !== index + 1)
  ) throw new Error(`${packId} P7 result sidecars do not exactly cover ordered 149 levels`);
  const verifyEvidence: P7TrainingArtifactFilesystem["verifyEvidence"] = async (verifyInput) => {
    const owner = byOccurrence.get(verifyInput.occurrenceId);
    if (owner === undefined) throw new Error(`P7 evidence occurrence is not reduced: ${verifyInput.occurrenceId}`);
    if (
      !sameReference(owner.descriptor.indexContent, verifyInput.indexContent)
      || !sameReference(owner.descriptor.payloadContent, verifyInput.index.payloadContent)
    ) throw new Error(`${verifyInput.occurrenceId} P7 evidence descriptor drifted`);
    return owner.filesystem.verifyEvidence(verifyInput);
  };
  return { results, resultManifestContents, evidence, verifyEvidence };
}

function containsPrivatePath(value: unknown, repositoryRoot: string): boolean {
  if (typeof value === "string") {
    return value.includes(repositoryRoot)
      || /^(?:\/[A-Za-z0-9_.-]+){2,}|^[A-Za-z]:\\/u.test(value);
  }
  if (Array.isArray(value)) return value.some((entry) => containsPrivatePath(entry, repositoryRoot));
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => (
      /shared.?player|graph.?attestation|level.?page.?href/iu.test(key)
      || containsPrivatePath(entry, repositoryRoot)
    ));
  }
  return false;
}

async function checkedExecutionIndex(input: {
  readonly repositoryRoot: string;
  readonly packId: P7TrainingPackId;
  readonly plan: P7TrainingShardPlan;
  readonly reducedPack: P7TrainingReducedPack;
  readonly artifact: P7TrainingExecutionIndexArtifact;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingExecutionIndexArtifact> {
  const index = parseP7TrainingExecutionIndex(input.artifact.canonicalJson);
  if (canonicalizeP7TrainingExecutionIndex(input.artifact.index) !== input.artifact.canonicalJson) {
    throw new Error(`${input.packId} P7 execution index object drifted from its canonical bytes`);
  }
  assertP7TrainingExecutionPackContent({
    executionIndex: index,
    packId: input.packId,
    packContent: input.plan.packContent,
  });
  assertP7TrainingExecutionPackContent({
    executionIndex: index,
    packId: input.packId,
    packContent: input.reducedPack.packContent,
  });
  const value = JSON.parse(input.artifact.canonicalJson) as unknown;
  if (containsPrivatePath(value, input.repositoryRoot)) {
    throw new Error(`${input.packId} P7 execution index contains a private path or player graph binding`);
  }
  const content = await referenceCanonicalJson(input.artifact.canonicalJson, input.sha256);
  if (!sameReference(content, input.artifact.content)) {
    throw new Error(`${input.packId} P7 execution index digest drifted`);
  }
  return {
    index,
    canonicalJson: input.artifact.canonicalJson,
    content,
    evidenceOutputs: input.artifact.evidenceOutputs.map((output) => ({
      ...output,
      content: new Uint8Array(output.content),
    })),
  };
}

async function assembleReductions(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations: P7TrainingEngineRunnerOperations;
  readonly write: boolean;
}): Promise<readonly P7TrainingEngineReduction[]> {
  const prepared = await loadPreparedRun(input);
  const reductions: P7TrainingEngineReduction[] = [];
  for (const pack of prepared.packs) {
    const packId = pack.shardPlan.packId;
    const loaded = await loadPackResults({ ...input, pack });
    const reducedPack = await input.operations.reduceShards({
      repositoryRoot: input.repositoryRoot,
      plan: pack.shardPlan,
      results: loaded.results,
      sha256: input.sha256,
      verifyEvidence: loaded.verifyEvidence,
      loadInventory: scopedLoader(input.operations, packId),
    });
    if (
      reducedPack.packId !== packId
      || !sameReference(reducedPack.packContent, pack.shardPlan.packContent)
      || reducedPack.levels.length !== P7_TRAINING_LEVELS_PER_PACK
      || reducedPack.levels.some((entry, index) => entry.levelNumber !== index + 1)
    ) throw new Error(`${packId} P7 reduction must contain exactly 149 ordered levels`);
    const executionIndex = await checkedExecutionIndex({
      repositoryRoot: input.repositoryRoot,
      packId,
      plan: pack.shardPlan,
      reducedPack,
      artifact: await input.operations.buildExecutionIndex({
        repositoryRoot: input.repositoryRoot,
        packId,
        inventory: pack.inventory,
        plan: pack.shardPlan,
        reducedPack,
        evidence: loaded.evidence,
        loadEvidence: loaded.verifyEvidence,
        sha256: input.sha256,
      }),
      sha256: input.sha256,
    });
    await input.operations.attestExecutionIndex?.({
      repositoryRoot: input.repositoryRoot,
      packId,
      artifact: executionIndex,
      sha256: input.sha256,
    });
    const reducedValue = buildP7TrainingRunnerReduced({
      binding: input.binding,
      packId,
      packContent: reducedPack.packContent,
      planContent: pack.runnerPlan.content,
      resultManifestContents: loaded.resultManifestContents,
      evidence: loaded.evidence,
      executionIndexContent: executionIndex.content,
    });
    const reducedArtifact = await referencedCanonical({
      value: reducedValue,
      canonicalize: canonicalizeP7TrainingRunnerReduced,
      sha256: input.sha256,
    });
    if (input.write) {
      const filesystem = packFilesystem({
        artifactRoot: input.artifactRoot,
        packId,
        sha256: input.sha256,
      });
      await filesystem.writeCanonicalJson(
        "execution-index.json",
        executionIndex.canonicalJson,
        P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
      );
      // Reduced manifest commits the independently hashed execution index.
      await filesystem.writeCanonicalJson(
        "reduced.json",
        reducedArtifact.canonicalJson,
        P7_TRAINING_RUNNER_LIMITS.maximumReducedManifestBytes,
      );
    }
    reductions.push({
      packId,
      reducedPack,
      executionIndex,
      reduced: reducedValue,
      reducedCanonicalJson: reducedArtifact.canonicalJson,
      reducedContent: reducedArtifact.content,
      loadEvidence: loaded.verifyEvidence,
    });
  }
  return reductions;
}

export async function reduceP7TrainingEngineRun(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<readonly P7TrainingEngineReduction[]> {
  return assembleReductions({
    ...input,
    operations: resolvedOperations(input),
    write: true,
  });
}

/** Read-only, processor-free fresh-inventory reduction and authority recomputation. */
export async function checkP7TrainingEngineRun(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<readonly P7TrainingEngineReduction[]> {
  const operations = resolvedOperations(input);
  const reductions = await assembleReductions({ ...input, operations, write: false });
  for (const reduction of reductions) {
    const filesystem = packFilesystem({
      artifactRoot: input.artifactRoot,
      packId: reduction.packId,
      sha256: input.sha256,
    });
    const executionJson = await filesystem.readCanonicalJson(
      "execution-index.json",
      P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
    );
    if (
      executionJson !== reduction.executionIndex.canonicalJson
      || !sameReference(
        await referenceCanonicalJson(executionJson, input.sha256),
        reduction.reduced.executionIndexContent,
      )
    ) throw new Error(`${reduction.packId} checked P7 execution index drifted`);
    const reducedJson = await filesystem.readCanonicalJson(
      "reduced.json",
      P7_TRAINING_RUNNER_LIMITS.maximumReducedManifestBytes,
    );
    const stored = parseP7TrainingRunnerReduced(reducedJson);
    assertP7TrainingRunBinding(stored.binding, input.binding);
    if (reducedJson !== reduction.reducedCanonicalJson) {
      throw new Error(`${reduction.packId} checked P7 reduced manifest drifted`);
    }
  }
  return reductions;
}

/** The only engine-side mutation of independently checked authority files. */
export async function writeP7TrainingEngineAuthorities(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<readonly P7TrainingEngineReduction[]> {
  const reductions = await checkP7TrainingEngineRun(input);
  await writeP7TrainingExecutionAuthoritiesTransactionally({
    repositoryRoot: input.repositoryRoot,
    authorities: reductions.map(({ packId, executionIndex }) => ({
      packId,
      artifact: executionIndex,
    })),
    sha256: input.sha256,
  });
  await attestCheckedP7TrainingExecutionAuthorities({
    repositoryRoot: input.repositoryRoot,
    authorities: reductions.map(({ packId, executionIndex }) => ({
      packId,
      artifact: executionIndex,
    })),
    sha256: input.sha256,
  });
  return reductions;
}

/** Processor-free fresh recomputation plus checked-authority attestation. */
export async function attestP7TrainingEngineAuthorities(input: {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingEngineRunnerOperations;
  readonly buildExecutionIndex?: P7TrainingExecutionIndexBuilder;
}): Promise<readonly P7TrainingEngineReduction[]> {
  const reductions = await checkP7TrainingEngineRun(input);
  await attestCheckedP7TrainingExecutionAuthorities({
    repositoryRoot: input.repositoryRoot,
    authorities: reductions.map(({ packId, executionIndex }) => ({
      packId,
      artifact: executionIndex,
    })),
    sha256: input.sha256,
  });
  return reductions;
}
