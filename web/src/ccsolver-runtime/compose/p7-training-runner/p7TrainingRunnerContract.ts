import {
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_SHARD_COUNT,
  type P7TrainingShardPlan,
} from "../p7-training-execution/p7TrainingShardProtocol";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";

export const P7_TRAINING_RUNNER_REVISION = "p7-training-runner-v1" as const;
export const P7_TRAINING_RUNNER_PLAN_ARTIFACT =
  "ccsolver-p7-training-runner-plan" as const;
export const P7_TRAINING_RUNNER_AGGREGATE_PLAN_ARTIFACT =
  "ccsolver-p7-training-runner-aggregate-plan" as const;
export const P7_TRAINING_RUNNER_SHARD_RESULT_ARTIFACT =
  "ccsolver-p7-training-runner-shard-result" as const;
export const P7_TRAINING_RUNNER_REDUCED_ARTIFACT =
  "ccsolver-p7-training-runner-reduced" as const;
export const P7_TRAINING_ENGINE_RUNNER_PATH =
  "runner/p7-training-engine-runner.mjs" as const;

export const P7_TRAINING_RUNNER_LIMITS = Object.freeze({
  maximumPlanBytes: 2 * 1024 * 1024,
  maximumShardManifestBytes: 8 * 1024 * 1024,
  maximumReducedManifestBytes: 16 * 1024 * 1024,
  maximumRunIdBytes: 128,
});

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const HEAD_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const RUN_ID_PATTERN = /^[1-9][0-9]{0,31}$/u;
const PACK_IDS = new Set<P7TrainingPackId>(["cclp1", "cclp4", "cclp5"]);
const encoder = new TextEncoder();

export interface P7TrainingRunBindingV1 {
  readonly headSha: string;
  readonly runId: string;
  readonly runAttempt: number;
}

export interface P7TrainingRunnerBinaryV1 {
  readonly path: typeof P7_TRAINING_ENGINE_RUNNER_PATH;
  readonly content: BlobReferenceV1;
}

export interface P7TrainingRunnerRequestDescriptorV1 {
  readonly shardIndex: number;
  readonly path: string;
  readonly content: BlobReferenceV1;
}

export interface P7TrainingRunnerPlanV1 {
  readonly artifact: typeof P7_TRAINING_RUNNER_PLAN_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_RUNNER_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly pack: {
    readonly packId: P7TrainingPackId;
    readonly content: BlobReferenceV1;
    readonly levelCount: typeof P7_TRAINING_LEVELS_PER_PACK;
    readonly shardCount: typeof P7_TRAINING_SHARD_COUNT;
  };
  readonly requests: readonly P7TrainingRunnerRequestDescriptorV1[];
}

export interface P7TrainingRunnerAggregatePlanV1 {
  readonly artifact: typeof P7_TRAINING_RUNNER_AGGREGATE_PLAN_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_RUNNER_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly shardCount: typeof P7_TRAINING_SHARD_COUNT;
  /** Strict cclp1, cclp4, cclp5 order; any nonempty subset is legal. */
  readonly packs: readonly {
    readonly packId: P7TrainingPackId;
    readonly path: string;
    readonly content: BlobReferenceV1;
  }[];
}

export interface P7TrainingRunnerEvidenceDescriptorV1 {
  readonly occurrenceId: string;
  readonly levelNumber: number;
  readonly indexPath: string;
  readonly indexContent: BlobReferenceV1;
  readonly payloadPath: string;
  readonly payloadContent: BlobReferenceV1;
}

export interface P7TrainingRunnerShardResultV1 {
  readonly artifact: typeof P7_TRAINING_RUNNER_SHARD_RESULT_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_RUNNER_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly packId: P7TrainingPackId;
  readonly planContent: BlobReferenceV1;
  readonly shardIndex: number;
  readonly request: P7TrainingRunnerRequestDescriptorV1;
  readonly result: {
    readonly path: string;
    readonly content: BlobReferenceV1;
  };
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
}

export interface P7TrainingRunnerResultDescriptorV1 {
  readonly shardIndex: number;
  readonly path: string;
  readonly content: BlobReferenceV1;
}

export interface P7TrainingRunnerReducedV1 {
  readonly artifact: typeof P7_TRAINING_RUNNER_REDUCED_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_RUNNER_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly pack: {
    readonly packId: P7TrainingPackId;
    readonly content: BlobReferenceV1;
    readonly levelCount: typeof P7_TRAINING_LEVELS_PER_PACK;
  };
  readonly planContent: BlobReferenceV1;
  /** Graph-independent semantic execution authority for this 149-level pack. */
  readonly executionIndexContent: BlobReferenceV1;
  readonly results: readonly P7TrainingRunnerResultDescriptorV1[];
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
}

export interface P7TrainingRunnerCanonicalArtifact<T> {
  readonly value: T;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new Error(`${label} has an unsupported shape`);
  return record;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer of at least ${minimum}`);
  }
  return value as number;
}

function contentReference(value: unknown, label: string): BlobReferenceV1 {
  const source = exactRecord(value, ["byteLength", "digest"], label);
  if (typeof source.digest !== "string" || !SHA256_PATTERN.test(source.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  return {
    digest: source.digest as BlobReferenceV1["digest"],
    byteLength: safeInteger(source.byteLength, `${label} byte length`),
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function runnerBinary(value: unknown, label: string): P7TrainingRunnerBinaryV1 {
  const source = exactRecord(value, ["content", "path"], label);
  if (source.path !== P7_TRAINING_ENGINE_RUNNER_PATH) {
    throw new Error(`${label} path drifted`);
  }
  return {
    path: P7_TRAINING_ENGINE_RUNNER_PATH,
    content: contentReference(source.content, `${label} content`),
  };
}

function shardBounds(shardIndex: number): { readonly start: number; readonly end: number } {
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 shard index is out of range");
  }
  const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
  const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
  const start = shardIndex * base + Math.min(shardIndex, remainder) + 1;
  return { start, end: start + base + Number(shardIndex < remainder) - 1 };
}

export function parseP7TrainingRunBinding(value: unknown): P7TrainingRunBindingV1 {
  const source = exactRecord(value, ["headSha", "runAttempt", "runId"], "P7 run binding");
  if (typeof source.headSha !== "string" || !HEAD_PATTERN.test(source.headSha)) {
    throw new Error("P7 run binding HEAD is invalid");
  }
  if (
    typeof source.runId !== "string"
    || !RUN_ID_PATTERN.test(source.runId)
    || encoder.encode(source.runId).byteLength > P7_TRAINING_RUNNER_LIMITS.maximumRunIdBytes
  ) throw new Error("P7 run binding run ID is invalid");
  return {
    headSha: source.headSha,
    runId: source.runId,
    runAttempt: safeInteger(source.runAttempt, "P7 run attempt", 1),
  };
}

export function sameP7TrainingRunBinding(
  left: P7TrainingRunBindingV1,
  right: P7TrainingRunBindingV1,
): boolean {
  return left.headSha === right.headSha
    && left.runId === right.runId
    && left.runAttempt === right.runAttempt;
}

export function assertP7TrainingRunBinding(
  actual: P7TrainingRunBindingV1,
  expected: P7TrainingRunBindingV1,
): void {
  const checkedActual = parseP7TrainingRunBinding(actual);
  const checkedExpected = parseP7TrainingRunBinding(expected);
  if (!sameP7TrainingRunBinding(checkedActual, checkedExpected)) {
    throw new Error("P7 run HEAD, run ID, or attempt binding drifted");
  }
}

function packId(value: unknown, label: string): P7TrainingPackId {
  if (typeof value !== "string" || !PACK_IDS.has(value as P7TrainingPackId)) {
    throw new Error(`${label} pack ID is invalid`);
  }
  return value as P7TrainingPackId;
}

export function p7TrainingRequestPath(shardIndex: number): string {
  const index = safeInteger(shardIndex, "P7 shard index");
  if (index >= P7_TRAINING_SHARD_COUNT) throw new Error("P7 shard index is out of range");
  return `requests/shard-${index}.json`;
}

export function p7TrainingPackRoot(packIdInput: P7TrainingPackId): string {
  const checkedPackId = packId(packIdInput, "P7 runner aggregate plan");
  return `packs/${checkedPackId}`;
}

export function p7TrainingPackPlanPath(packIdInput: P7TrainingPackId): string {
  return `${p7TrainingPackRoot(packIdInput)}/plan.json`;
}

export function p7TrainingShardResultPath(shardIndex: number): string {
  const index = safeInteger(shardIndex, "P7 shard index");
  if (index >= P7_TRAINING_SHARD_COUNT) throw new Error("P7 shard index is out of range");
  return `shards/${index}/result.json`;
}

export function p7TrainingShardManifestPath(shardIndex: number): string {
  const index = safeInteger(shardIndex, "P7 shard index");
  if (index >= P7_TRAINING_SHARD_COUNT) throw new Error("P7 shard index is out of range");
  return `shards/${index}/manifest.json`;
}

export function parseP7TrainingOccurrenceId(input: {
  readonly occurrenceId: unknown;
  readonly packId?: P7TrainingPackId;
  readonly levelNumber?: number;
}): { readonly packId: P7TrainingPackId; readonly levelNumber: number; readonly occurrenceId: string } {
  if (typeof input.occurrenceId !== "string") {
    throw new Error("P7 occurrence ID is invalid");
  }
  const match = /^(cclp1|cclp4|cclp5)\/([0-9]{3})$/u.exec(input.occurrenceId);
  if (match === null) throw new Error("P7 occurrence ID is unsafe or unsupported");
  const parsedPack = packId(match[1], "P7 occurrence");
  const parsedLevel = Number(match[2]);
  if (parsedLevel < 1 || parsedLevel > P7_TRAINING_LEVELS_PER_PACK) {
    throw new Error("P7 occurrence level number is out of range");
  }
  if (
    (input.packId !== undefined && input.packId !== parsedPack)
    || (input.levelNumber !== undefined && input.levelNumber !== parsedLevel)
  ) throw new Error("P7 occurrence ID disagrees with its pack or level number");
  return { packId: parsedPack, levelNumber: parsedLevel, occurrenceId: input.occurrenceId };
}

export function p7TrainingEvidencePaths(input: {
  readonly shardIndex: number;
  readonly occurrenceId: string;
  readonly packId?: P7TrainingPackId;
  readonly levelNumber?: number;
}): { readonly indexPath: string; readonly payloadPath: string } {
  const index = safeInteger(input.shardIndex, "P7 shard index");
  if (index >= P7_TRAINING_SHARD_COUNT) throw new Error("P7 shard index is out of range");
  const occurrence = parseP7TrainingOccurrenceId(input);
  const root = `shards/${index}/evidence/${occurrence.occurrenceId}`;
  return { indexPath: `${root}/index.json`, payloadPath: `${root}/payload.bin` };
}

function requestDescriptor(
  value: unknown,
  label: string,
): P7TrainingRunnerRequestDescriptorV1 {
  const source = exactRecord(value, ["content", "path", "shardIndex"], label);
  const shardIndex = safeInteger(source.shardIndex, `${label} shard index`);
  const path = p7TrainingRequestPath(shardIndex);
  if (source.path !== path) throw new Error(`${label} path drifted`);
  return { shardIndex, path, content: contentReference(source.content, `${label} content`) };
}

function evidenceDescriptor(
  value: unknown,
  input: { readonly label: string; readonly packId: P7TrainingPackId; readonly shardIndex: number },
): P7TrainingRunnerEvidenceDescriptorV1 {
  const source = exactRecord(value, [
    "indexContent", "indexPath", "levelNumber", "occurrenceId", "payloadContent", "payloadPath",
  ], input.label);
  const levelNumber = safeInteger(source.levelNumber, `${input.label} level number`, 1);
  const occurrence = parseP7TrainingOccurrenceId({
    occurrenceId: source.occurrenceId,
    packId: input.packId,
    levelNumber,
  });
  const paths = p7TrainingEvidencePaths({
    shardIndex: input.shardIndex,
    occurrenceId: occurrence.occurrenceId,
    packId: input.packId,
    levelNumber,
  });
  if (source.indexPath !== paths.indexPath || source.payloadPath !== paths.payloadPath) {
    throw new Error(`${input.label} path drifted`);
  }
  return {
    occurrenceId: occurrence.occurrenceId,
    levelNumber,
    indexPath: paths.indexPath,
    indexContent: contentReference(source.indexContent, `${input.label} index content`),
    payloadPath: paths.payloadPath,
    payloadContent: contentReference(source.payloadContent, `${input.label} payload content`),
  };
}

function parseJson(value: string, label: string, maximumBytes: number): unknown {
  if (encoder.encode(value).byteLength > maximumBytes) throw new Error(`${label} exceeds its byte bound`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== value) {
    throw new Error(`${label} is not canonical JSON`);
  }
  return parsed;
}

function copyPlan(value: unknown): P7TrainingRunnerPlanV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "pack", "producerRevision", "requests", "runner", "version",
  ], "P7 runner plan");
  if (
    source.artifact !== P7_TRAINING_RUNNER_PLAN_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_RUNNER_REVISION
    || !Array.isArray(source.requests)
    || source.requests.length !== P7_TRAINING_SHARD_COUNT
  ) throw new Error("P7 runner plan identity or shard denominator drifted");
  const rawPack = exactRecord(source.pack, ["content", "levelCount", "packId", "shardCount"], "P7 runner plan pack");
  const checkedPackId = packId(rawPack.packId, "P7 runner plan");
  if (
    rawPack.levelCount !== P7_TRAINING_LEVELS_PER_PACK
    || rawPack.shardCount !== P7_TRAINING_SHARD_COUNT
  ) throw new Error("P7 runner plan pack denominator drifted");
  const requests = source.requests.map((entry, index) => {
    const request = requestDescriptor(entry, `P7 runner request ${index}`);
    if (request.shardIndex !== index) throw new Error("P7 runner requests are not exactly ordered 0..7");
    return request;
  });
  return {
    artifact: P7_TRAINING_RUNNER_PLAN_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    runner: runnerBinary(source.runner, "P7 runner plan binary"),
    pack: {
      packId: checkedPackId,
      content: contentReference(rawPack.content, "P7 runner plan pack content"),
      levelCount: P7_TRAINING_LEVELS_PER_PACK,
      shardCount: P7_TRAINING_SHARD_COUNT,
    },
    requests,
  };
}

export function buildP7TrainingRunnerPlan(input: {
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly plan: P7TrainingShardPlan;
}): P7TrainingRunnerPlanV1 {
  return copyPlan({
    artifact: P7_TRAINING_RUNNER_PLAN_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: input.binding,
    runner: input.runner,
    pack: {
      packId: input.plan.packId,
      content: input.plan.packContent,
      levelCount: P7_TRAINING_LEVELS_PER_PACK,
      shardCount: P7_TRAINING_SHARD_COUNT,
    },
    requests: input.plan.requests.map((request, shardIndex) => ({
      shardIndex,
      path: p7TrainingRequestPath(shardIndex),
      content: request.content,
    })),
  });
}

export function canonicalizeP7TrainingRunnerPlan(value: unknown): CanonicalJson {
  return canonicalizeJson(copyPlan(value) as unknown as CanonicalJsonValue);
}

export function parseP7TrainingRunnerPlan(value: string): P7TrainingRunnerPlanV1 {
  return copyPlan(parseJson(
    value,
    "P7 runner plan",
    P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
  ));
}

function copyAggregatePlan(value: unknown): P7TrainingRunnerAggregatePlanV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "packs", "producerRevision", "runner", "shardCount", "version",
  ], "P7 runner aggregate plan");
  if (
    source.artifact !== P7_TRAINING_RUNNER_AGGREGATE_PLAN_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_RUNNER_REVISION
    || source.shardCount !== P7_TRAINING_SHARD_COUNT
    || !Array.isArray(source.packs)
    || source.packs.length < 1
    || source.packs.length > 3
  ) throw new Error("P7 runner aggregate plan identity or pack denominator drifted");
  const canonicalOrder: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
  let previousOrder = -1;
  const packs = source.packs.map((entry, index) => {
    const raw = exactRecord(entry, ["content", "packId", "path"], `P7 aggregate pack ${index}`);
    const checkedPackId = packId(raw.packId, `P7 aggregate pack ${index}`);
    const order = canonicalOrder.indexOf(checkedPackId);
    if (order <= previousOrder) throw new Error("P7 aggregate packs are duplicate or out of order");
    previousOrder = order;
    const path = p7TrainingPackPlanPath(checkedPackId);
    if (raw.path !== path) throw new Error(`P7 aggregate pack ${checkedPackId} path drifted`);
    return {
      packId: checkedPackId,
      path,
      content: contentReference(raw.content, `P7 aggregate pack ${checkedPackId} content`),
    };
  });
  return {
    artifact: P7_TRAINING_RUNNER_AGGREGATE_PLAN_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    runner: runnerBinary(source.runner, "P7 runner aggregate binary"),
    shardCount: P7_TRAINING_SHARD_COUNT,
    packs,
  };
}

export function buildP7TrainingRunnerAggregatePlan(input: {
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly plans: readonly {
    readonly packId: P7TrainingPackId;
    readonly content: BlobReferenceV1;
  }[];
}): P7TrainingRunnerAggregatePlanV1 {
  return copyAggregatePlan({
    artifact: P7_TRAINING_RUNNER_AGGREGATE_PLAN_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: input.binding,
    runner: input.runner,
    shardCount: P7_TRAINING_SHARD_COUNT,
    packs: input.plans.map(({ packId, content }) => ({
      packId,
      path: p7TrainingPackPlanPath(packId),
      content,
    })),
  });
}

export function canonicalizeP7TrainingRunnerAggregatePlan(value: unknown): CanonicalJson {
  return canonicalizeJson(copyAggregatePlan(value) as unknown as CanonicalJsonValue);
}

export function parseP7TrainingRunnerAggregatePlan(value: string): P7TrainingRunnerAggregatePlanV1 {
  return copyAggregatePlan(parseJson(
    value,
    "P7 runner aggregate plan",
    P7_TRAINING_RUNNER_LIMITS.maximumPlanBytes,
  ));
}

function copyShardResult(value: unknown): P7TrainingRunnerShardResultV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "evidence", "packId", "planContent", "producerRevision",
    "request", "result", "shardIndex", "version",
  ], "P7 runner shard result");
  if (
    source.artifact !== P7_TRAINING_RUNNER_SHARD_RESULT_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_RUNNER_REVISION
    || !Array.isArray(source.evidence)
  ) throw new Error("P7 runner shard result identity is invalid");
  const checkedPackId = packId(source.packId, "P7 runner shard result");
  const shardIndex = safeInteger(source.shardIndex, "P7 runner shard result index");
  if (shardIndex >= P7_TRAINING_SHARD_COUNT) throw new Error("P7 runner shard result index is out of range");
  const request = requestDescriptor(source.request, "P7 runner shard request");
  if (request.shardIndex !== shardIndex) throw new Error("P7 runner shard request index drifted");
  const rawResult = exactRecord(source.result, ["content", "path"], "P7 runner frozen shard result");
  const resultPath = p7TrainingShardResultPath(shardIndex);
  if (rawResult.path !== resultPath) throw new Error("P7 runner frozen shard result path drifted");
  let previousLevel = 0;
  const evidence = source.evidence.map((entry, index) => {
    const checked = evidenceDescriptor(entry, {
      label: `P7 runner shard evidence ${index}`,
      packId: checkedPackId,
      shardIndex,
    });
    if (checked.levelNumber <= previousLevel) {
      throw new Error("P7 runner shard evidence order is not strict");
    }
    previousLevel = checked.levelNumber;
    return checked;
  });
  const bounds = shardBounds(shardIndex);
  if (
    evidence.length !== bounds.end - bounds.start + 1
    || evidence.some((entry, index) => entry.levelNumber !== bounds.start + index)
  ) throw new Error("P7 runner shard evidence does not exactly cover its fixed partition");
  return {
    artifact: P7_TRAINING_RUNNER_SHARD_RESULT_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    packId: checkedPackId,
    planContent: contentReference(source.planContent, "P7 runner shard plan content"),
    shardIndex,
    request,
    result: {
      path: resultPath,
      content: contentReference(rawResult.content, "P7 runner frozen shard result content"),
    },
    evidence,
  };
}

export function canonicalizeP7TrainingRunnerShardResult(value: unknown): CanonicalJson {
  return canonicalizeJson(copyShardResult(value) as unknown as CanonicalJsonValue);
}

export function parseP7TrainingRunnerShardResult(value: string): P7TrainingRunnerShardResultV1 {
  return copyShardResult(parseJson(
    value,
    "P7 runner shard result",
    P7_TRAINING_RUNNER_LIMITS.maximumShardManifestBytes,
  ));
}

export function buildP7TrainingRunnerShardResult(input: {
  readonly binding: P7TrainingRunBindingV1;
  readonly packId: P7TrainingPackId;
  readonly planContent: BlobReferenceV1;
  readonly shardIndex: number;
  readonly requestContent: BlobReferenceV1;
  readonly resultContent: BlobReferenceV1;
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
}): P7TrainingRunnerShardResultV1 {
  return copyShardResult({
    artifact: P7_TRAINING_RUNNER_SHARD_RESULT_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: input.binding,
    packId: input.packId,
    planContent: input.planContent,
    shardIndex: input.shardIndex,
    request: {
      shardIndex: input.shardIndex,
      path: p7TrainingRequestPath(input.shardIndex),
      content: input.requestContent,
    },
    result: {
      path: p7TrainingShardResultPath(input.shardIndex),
      content: input.resultContent,
    },
    evidence: input.evidence,
  });
}

function resultDescriptor(value: unknown, index: number): P7TrainingRunnerResultDescriptorV1 {
  const source = exactRecord(value, ["content", "path", "shardIndex"], `P7 reduced result ${index}`);
  const shardIndex = safeInteger(source.shardIndex, `P7 reduced result ${index} shard index`);
  if (shardIndex !== index || source.path !== p7TrainingShardManifestPath(index)) {
    throw new Error("P7 reduced results are not exactly ordered 0..7");
  }
  return {
    shardIndex,
    path: p7TrainingShardManifestPath(index),
    content: contentReference(source.content, `P7 reduced result ${index} content`),
  };
}

function copyReduced(value: unknown): P7TrainingRunnerReducedV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "evidence", "executionIndexContent", "pack", "planContent",
    "producerRevision", "results", "version",
  ], "P7 runner reduced manifest");
  if (
    source.artifact !== P7_TRAINING_RUNNER_REDUCED_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_RUNNER_REVISION
    || !Array.isArray(source.results)
    || source.results.length !== P7_TRAINING_SHARD_COUNT
    || !Array.isArray(source.evidence)
    || source.evidence.length !== P7_TRAINING_LEVELS_PER_PACK
  ) throw new Error("P7 runner reduced identity or denominator drifted");
  const rawPack = exactRecord(source.pack, ["content", "levelCount", "packId"], "P7 reduced pack");
  const checkedPackId = packId(rawPack.packId, "P7 reduced");
  if (rawPack.levelCount !== P7_TRAINING_LEVELS_PER_PACK) {
    throw new Error("P7 reduced pack must cover exactly 149 levels");
  }
  const results = source.results.map(resultDescriptor);
  let previousLevel = 0;
  const evidence = source.evidence.map((entry, index) => {
    const levelNumber = index + 1;
    // The balanced partition has two shorter tail shards. Derive the true
    // owner by fixed partition boundaries rather than trusting the manifest.
    let owner = 0;
    const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
    const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
    for (let candidate = 0; candidate < P7_TRAINING_SHARD_COUNT; candidate += 1) {
      const start = candidate * base + Math.min(candidate, remainder) + 1;
      const length = base + Number(candidate < remainder);
      if (levelNumber >= start && levelNumber < start + length) owner = candidate;
    }
    const checked = evidenceDescriptor(entry, {
      label: `P7 reduced evidence ${index}`,
      packId: checkedPackId,
      shardIndex: owner,
    });
    if (checked.levelNumber !== levelNumber || checked.levelNumber <= previousLevel) {
      throw new Error("P7 reduced evidence does not exactly cover ordered levels 1..149");
    }
    previousLevel = checked.levelNumber;
    return checked;
  });
  return {
    artifact: P7_TRAINING_RUNNER_REDUCED_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    pack: {
      packId: checkedPackId,
      content: contentReference(rawPack.content, "P7 reduced pack content"),
      levelCount: P7_TRAINING_LEVELS_PER_PACK,
    },
    planContent: contentReference(source.planContent, "P7 reduced plan content"),
    executionIndexContent: contentReference(
      source.executionIndexContent,
      "P7 reduced execution index content",
    ),
    results,
    evidence,
  };
}

/** Build the graph-independent 149-level execution reduction envelope. */
export function buildP7TrainingRunnerReduced(input: {
  readonly binding: P7TrainingRunBindingV1;
  readonly packId: P7TrainingPackId;
  readonly packContent: BlobReferenceV1;
  readonly planContent: BlobReferenceV1;
  readonly resultManifestContents: readonly BlobReferenceV1[];
  readonly evidence: readonly P7TrainingRunnerEvidenceDescriptorV1[];
  readonly executionIndexContent: BlobReferenceV1;
}): P7TrainingRunnerReducedV1 {
  return copyReduced({
    artifact: P7_TRAINING_RUNNER_REDUCED_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_RUNNER_REVISION,
    binding: input.binding,
    pack: {
      packId: input.packId,
      content: input.packContent,
      levelCount: P7_TRAINING_LEVELS_PER_PACK,
    },
    planContent: input.planContent,
    executionIndexContent: input.executionIndexContent,
    results: input.resultManifestContents.map((content, shardIndex) => ({
      shardIndex,
      path: p7TrainingShardManifestPath(shardIndex),
      content,
    })),
    evidence: input.evidence,
  });
}

export function canonicalizeP7TrainingRunnerReduced(value: unknown): CanonicalJson {
  return canonicalizeJson(copyReduced(value) as unknown as CanonicalJsonValue);
}

export function parseP7TrainingRunnerReduced(value: string): P7TrainingRunnerReducedV1 {
  return copyReduced(parseJson(
    value,
    "P7 runner reduced manifest",
    P7_TRAINING_RUNNER_LIMITS.maximumReducedManifestBytes,
  ));
}

export async function referenceP7TrainingRunnerArtifact<T>(input: {
  readonly value: T;
  readonly canonicalize: (value: T) => CanonicalJson;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingRunnerCanonicalArtifact<T>> {
  const canonicalJson = input.canonicalize(input.value);
  return {
    value: input.value,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, input.sha256),
  };
}
