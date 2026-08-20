import {
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  parseCanonicalJson,
  type BlobReferenceV1,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";
import type { P1bCorpusMeasurementV1 } from "./measuredCorpusReport";

export const P1B_DISTRIBUTED_SHARD_COUNT = 8;
export const P1B_DISTRIBUTED_PARTITION_IDENTITY =
  "sorted-occurrence-contiguous-balanced-v1";
export const P1B_SHARD_MANIFEST_ARTIFACT =
  "ccsolver-p1b-distributed-measurement-manifest";
export const P1B_SHARD_REQUEST_ARTIFACT =
  "ccsolver-p1b-distributed-measurement-request";
export const P1B_SHARD_RESULT_ARTIFACT =
  "ccsolver-p1b-distributed-measurement-result";

export const P1B_MAX_DISTRIBUTED_OCCURRENCES = 4_096;
export const P1B_MAX_OCCURRENCES_PER_SHARD = 512;
export const P1B_MAX_SHARD_MANIFEST_BYTES = 2 * 1024 * 1024;
export const P1B_MAX_SHARD_REQUEST_BYTES = 512 * 1024;
export const P1B_MAX_SHARD_RESULT_BYTES = 2 * 1024 * 1024;

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const HEAD_REVISION_PATTERN = /^[0-9a-f]{40,64}$/u;
const DECIMAL_IDENTIFIER_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/u;
const OCCURRENCE_ID_MAX_BYTES = 512;

export interface P1bShardRunContextV1 {
  readonly repository: "joshua-bone/tworld";
  readonly headRevision: string;
  readonly runId: string;
  readonly runAttempt: number;
}

export interface P1bShardProofBindingV1 {
  readonly proofId: "p1b";
  readonly producerContract: BlobReferenceV1;
  readonly spec: BlobReferenceV1;
  readonly inputs: BlobReferenceV1;
}

export interface P1bShardProducerBindingV1 {
  readonly content: BlobReferenceV1;
  readonly fileCount: number;
}

export interface P1bMeasurementShardRequestV1 {
  readonly artifact: typeof P1B_SHARD_REQUEST_ARTIFACT;
  readonly version: 1;
  readonly partition: {
    readonly identity: typeof P1B_DISTRIBUTED_PARTITION_IDENTITY;
    readonly requestedShardCount: typeof P1B_DISTRIBUTED_SHARD_COUNT;
    readonly shardCount: number;
    readonly shardIndex: number;
    readonly startOccurrenceIndex: number;
    readonly endOccurrenceIndex: number;
  };
  readonly producer: P1bShardProducerBindingV1;
  readonly validityPolicyRevision: string;
  readonly measurement: P1bCorpusMeasurementV1;
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
}

export interface P1bMeasurementShardDescriptorV1 {
  readonly shardId: string;
  readonly shardIndex: number;
  readonly startOccurrenceIndex: number;
  readonly endOccurrenceIndex: number;
  readonly occurrenceIds: readonly string[];
  readonly request: BlobReferenceV1;
  readonly requestPath: string;
  readonly resultPath: string;
}

export interface P1bMeasurementShardManifestV1 {
  readonly artifact: typeof P1B_SHARD_MANIFEST_ARTIFACT;
  readonly version: 1;
  readonly context: P1bShardRunContextV1;
  readonly proof: P1bShardProofBindingV1;
  readonly producer: P1bShardProducerBindingV1;
  readonly validity: BlobReferenceV1;
  readonly validityPolicyRevision: string;
  readonly measurement: P1bCorpusMeasurementV1;
  readonly partition: {
    readonly identity: typeof P1B_DISTRIBUTED_PARTITION_IDENTITY;
    readonly requestedShardCount: typeof P1B_DISTRIBUTED_SHARD_COUNT;
    readonly shardCount: number;
    readonly occurrenceCount: number;
  };
  readonly plan: BlobReferenceV1;
  readonly shards: readonly P1bMeasurementShardDescriptorV1[];
}

export interface P1bMeasurementShardResultV1 {
  readonly artifact: typeof P1B_SHARD_RESULT_ARTIFACT;
  readonly version: 1;
  readonly context: P1bShardRunContextV1;
  readonly manifest: BlobReferenceV1;
  readonly plan: BlobReferenceV1;
  readonly request: BlobReferenceV1;
  readonly shardId: string;
  readonly partition: {
    readonly shardCount: number;
    readonly shardIndex: number;
    readonly startOccurrenceIndex: number;
    readonly endOccurrenceIndex: number;
  };
  readonly casesContent: BlobReferenceV1;
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
}

export interface CanonicalArtifact<T> {
  readonly artifact: T;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

export interface P1bMeasurementShardRequestArtifact
  extends CanonicalArtifact<P1bMeasurementShardRequestV1> {
  readonly shardId: string;
  readonly requestPath: string;
  readonly resultPath: string;
  readonly request: P1bMeasurementShardRequestV1;
}

export interface P1bMeasurementShardPlan {
  readonly manifest: CanonicalArtifact<P1bMeasurementShardManifestV1>;
  readonly requests: readonly P1bMeasurementShardRequestArtifact[];
}

export interface BuildP1bMeasurementShardPlanInput {
  readonly context: P1bShardRunContextV1;
  readonly proof: P1bShardProofBindingV1;
  readonly producer: P1bShardProducerBindingV1;
  readonly validity: BlobReferenceV1;
  readonly validityPolicyRevision: string;
  readonly measurement: P1bCorpusMeasurementV1;
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
  readonly sha256: Sha256Port;
}

export interface P1bShardFileArtifact {
  readonly path: string;
  readonly canonicalJson: string;
}

export interface P1bMeasurementShardResultArtifact
  extends CanonicalArtifact<P1bMeasurementShardResultV1> {
  readonly shardId: string;
  readonly resultPath: string;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  description: string,
): Record<string, unknown> {
  const record = requireRecord(value, description);
  const actual = Object.keys(record).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${description} has an unsupported shape`);
  }
  return record;
}

function requireSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  description: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    throw new Error(`${description} is out of bounds`);
  }
  return value as number;
}

function requireDurableText(value: unknown, maximumBytes: number, description: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || value.includes("\n")
    || value.includes("\0")
    || utf8Length(value) > maximumBytes
  ) {
    throw new Error(`${description} is invalid`);
  }
  return value;
}

function copyContentReference(value: unknown, description: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], description);
  if (typeof record.digest !== "string" || !SHA256_DIGEST_PATTERN.test(record.digest)) {
    throw new Error(`${description} digest is invalid`);
  }
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: requireSafeInteger(
      record.byteLength,
      0,
      Number.MAX_SAFE_INTEGER,
      `${description} byte length`,
    ),
  };
}

function sameContentReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function copyContext(value: unknown): P1bShardRunContextV1 {
  const record = exactKeys(
    value,
    ["headRevision", "repository", "runAttempt", "runId"],
    "shard run context",
  );
  if (record.repository !== "joshua-bone/tworld") {
    throw new Error("shard run repository is unsupported");
  }
  if (
    typeof record.headRevision !== "string"
    || !HEAD_REVISION_PATTERN.test(record.headRevision)
  ) {
    throw new Error("shard run HEAD revision is invalid");
  }
  if (typeof record.runId !== "string" || !DECIMAL_IDENTIFIER_PATTERN.test(record.runId)) {
    throw new Error("shard run id is invalid");
  }
  return {
    repository: "joshua-bone/tworld",
    headRevision: record.headRevision,
    runId: record.runId,
    runAttempt: requireSafeInteger(record.runAttempt, 1, 1_000_000, "shard run attempt"),
  };
}

function copyProof(value: unknown): P1bShardProofBindingV1 {
  const record = exactKeys(
    value,
    ["inputs", "producerContract", "proofId", "spec"],
    "P1B proof binding",
  );
  if (record.proofId !== "p1b") {
    throw new Error("P1B proof id is unsupported");
  }
  return {
    proofId: "p1b",
    producerContract: copyContentReference(record.producerContract, "producer contract"),
    spec: copyContentReference(record.spec, "proof spec"),
    inputs: copyContentReference(record.inputs, "proof inputs"),
  };
}

function copyProducer(value: unknown): P1bShardProducerBindingV1 {
  const record = exactKeys(value, ["content", "fileCount"], "semantic producer binding");
  return {
    content: copyContentReference(record.content, "semantic producer content"),
    fileCount: requireSafeInteger(record.fileCount, 1, 100_000, "semantic producer file count"),
  };
}

function copyMeasurement(value: unknown): P1bCorpusMeasurementV1 {
  const record = exactKeys(
    value,
    ["analysisRevisions", "artifactRepositoryId", "corpusRevision"],
    "P1B measurement",
  );
  const revisions = exactKeys(record.analysisRevisions, [
    "artifactProducerRevision",
    "catalogRevision",
    "factsAnalyzerRevision",
    "importProfileRevision",
    "lynxAdapterRevision",
    "lynxPolicyRevision",
    "msAdapterRevision",
    "msPolicyRevision",
    "staticAnalyzerRevision",
  ], "P1B analysis revisions");
  const copiedRevisions = Object.fromEntries(Object.keys(revisions).map((key) => [
    key,
    requireDurableText(revisions[key], 4_096, `P1B analysis revision ${key}`),
  ])) as unknown as P1bCorpusMeasurementV1["analysisRevisions"];
  return {
    corpusRevision: requireDurableText(record.corpusRevision, 4_096, "corpus revision"),
    artifactRepositoryId: requireDurableText(
      record.artifactRepositoryId,
      4_096,
      "artifact repository id",
    ),
    analysisRevisions: copiedRevisions,
  };
}

function requireCanonicalArtifact(
  text: string,
  maximumBytes: number,
  description: string,
): unknown {
  if (typeof text !== "string" || utf8Length(text) > maximumBytes) {
    throw new Error(`${description} is oversized`);
  }
  let value: unknown;
  try {
    value = parseCanonicalJson(text);
  } catch (error) {
    throw new Error(`${description} is not canonical JSON`, { cause: error });
  }
  return value;
}

async function canonicalArtifact<T>(
  artifact: T,
  sha256: Sha256Port,
): Promise<CanonicalArtifact<T>> {
  const canonicalJson = canonicalizeJson(artifact);
  return {
    artifact,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, sha256),
  };
}

function sortedOccurrences(
  values: readonly P1bCorpusOccurrenceV1[],
): readonly P1bCorpusOccurrenceV1[] {
  if (
    !Array.isArray(values)
    || values.length === 0
    || values.length > P1B_MAX_DISTRIBUTED_OCCURRENCES
  ) {
    throw new Error("distributed P1B occurrence count is out of bounds");
  }
  const ordered = [...values].sort((left, right) =>
    compareText(left.occurrenceId, right.occurrenceId),
  );
  let prior: string | undefined;
  for (const entry of ordered) {
    const occurrenceId = requireDurableText(
      entry.occurrenceId,
      OCCURRENCE_ID_MAX_BYTES,
      "P1B occurrence id",
    );
    if (occurrenceId === prior) {
      throw new Error(`duplicate P1B occurrence id: ${occurrenceId}`);
    }
    prior = occurrenceId;
  }
  return ordered;
}

function partitionBounds(
  occurrenceCount: number,
  shardIndex: number,
  shardCount: number,
): { readonly start: number; readonly end: number } {
  return {
    start: Math.floor(shardIndex * occurrenceCount / shardCount),
    end: Math.floor((shardIndex + 1) * occurrenceCount / shardCount),
  };
}

function causalPlanValue(
  manifest: Pick<
    P1bMeasurementShardManifestV1,
    "measurement" | "partition" | "producer" | "shards" | "validity" | "validityPolicyRevision"
  >,
): unknown {
  return {
    measurement: manifest.measurement,
    partition: manifest.partition,
    producer: manifest.producer,
    shards: manifest.shards,
    validity: manifest.validity,
    validityPolicyRevision: manifest.validityPolicyRevision,
  };
}

function requestPath(shardId: string): string {
  return `requests/${shardId}.request.json`;
}

function resultPath(shardId: string): string {
  return `${shardId}/${shardId}.result.json`;
}

export async function buildP1bMeasurementShardPlan(
  input: BuildP1bMeasurementShardPlanInput,
): Promise<P1bMeasurementShardPlan> {
  const context = copyContext(input.context);
  const proof = copyProof(input.proof);
  const producer = copyProducer(input.producer);
  const validity = copyContentReference(input.validity, "P1B validity report");
  const validityPolicyRevision = requireDurableText(
    input.validityPolicyRevision,
    4_096,
    "validity policy revision",
  );
  const copiedMeasurement = copyMeasurement(input.measurement);
  const occurrences = sortedOccurrences(input.occurrences);
  if (occurrences.length < P1B_DISTRIBUTED_SHARD_COUNT) {
    throw new Error("distributed P1B requires at least eight occurrences");
  }
  const shardCount = P1B_DISTRIBUTED_SHARD_COUNT;
  const requestBundles: CanonicalArtifact<P1bMeasurementShardRequestV1>[] = [];
  for (let shardIndex = 0; shardIndex < shardCount; shardIndex += 1) {
    const { start, end } = partitionBounds(occurrences.length, shardIndex, shardCount);
    const slice = occurrences.slice(start, end);
    if (slice.length === 0 || slice.length > P1B_MAX_OCCURRENCES_PER_SHARD) {
      throw new Error(`distributed P1B shard ${shardIndex} occurrence count is out of bounds`);
    }
    requestBundles.push(await canonicalArtifact({
      artifact: P1B_SHARD_REQUEST_ARTIFACT,
      version: 1,
      partition: {
        identity: P1B_DISTRIBUTED_PARTITION_IDENTITY,
        requestedShardCount: P1B_DISTRIBUTED_SHARD_COUNT,
        shardCount,
        shardIndex,
        startOccurrenceIndex: start,
        endOccurrenceIndex: end,
      },
      producer,
      validityPolicyRevision,
      measurement: copiedMeasurement,
      occurrences: slice,
    } satisfies P1bMeasurementShardRequestV1, input.sha256));
  }

  const descriptors = requestBundles.map((bundle, shardIndex) => {
    const request = bundle.artifact;
    const shardId = `${String(shardIndex).padStart(2, "0")}-${bundle.content.digest.slice("sha256:".length)}`;
    return {
      shardId,
      shardIndex,
      startOccurrenceIndex: request.partition.startOccurrenceIndex,
      endOccurrenceIndex: request.partition.endOccurrenceIndex,
      occurrenceIds: request.occurrences.map((entry) => entry.occurrenceId),
      request: bundle.content,
      requestPath: requestPath(shardId),
      resultPath: resultPath(shardId),
    } satisfies P1bMeasurementShardDescriptorV1;
  });
  const partition = {
    identity: P1B_DISTRIBUTED_PARTITION_IDENTITY,
    requestedShardCount: P1B_DISTRIBUTED_SHARD_COUNT,
    shardCount,
    occurrenceCount: occurrences.length,
  } as const;
  const plan = await canonicalArtifact(causalPlanValue({
    measurement: copiedMeasurement,
    partition,
    producer,
    shards: descriptors,
    validity,
    validityPolicyRevision,
  }), input.sha256);
  const manifest = await canonicalArtifact({
    artifact: P1B_SHARD_MANIFEST_ARTIFACT,
    version: 1,
    context,
    proof,
    producer,
    validity,
    validityPolicyRevision,
    measurement: copiedMeasurement,
    partition,
    plan: plan.content,
    shards: descriptors,
  } satisfies P1bMeasurementShardManifestV1, input.sha256);
  if (manifest.content.byteLength > P1B_MAX_SHARD_MANIFEST_BYTES) {
    throw new Error("distributed P1B manifest is oversized");
  }
  return {
    manifest,
    requests: requestBundles.map((bundle, index) => ({
      ...bundle,
      shardId: descriptors[index]!.shardId,
      requestPath: descriptors[index]!.requestPath,
      resultPath: descriptors[index]!.resultPath,
      request: bundle.artifact,
    })),
  };
}

function copyDescriptor(
  value: unknown,
  expectedIndex: number,
  occurrenceCount: number,
  shardCount: number,
): P1bMeasurementShardDescriptorV1 {
  const record = exactKeys(value, [
    "endOccurrenceIndex",
    "occurrenceIds",
    "request",
    "requestPath",
    "resultPath",
    "shardId",
    "shardIndex",
    "startOccurrenceIndex",
  ], `P1B shard descriptor ${expectedIndex}`);
  const shardIndex = requireSafeInteger(record.shardIndex, 0, shardCount - 1, "shard index");
  if (shardIndex !== expectedIndex) throw new Error("P1B shard descriptors are out of order");
  const expected = partitionBounds(occurrenceCount, shardIndex, shardCount);
  const start = requireSafeInteger(record.startOccurrenceIndex, 0, occurrenceCount, "shard start");
  const end = requireSafeInteger(record.endOccurrenceIndex, 0, occurrenceCount, "shard end");
  if (start !== expected.start || end !== expected.end || end <= start) {
    throw new Error(`P1B shard ${shardIndex} has a gapped or overlapping partition`);
  }
  if (
    !Array.isArray(record.occurrenceIds)
    || record.occurrenceIds.length !== end - start
    || record.occurrenceIds.length > P1B_MAX_OCCURRENCES_PER_SHARD
  ) {
    throw new Error(`P1B shard ${shardIndex} occurrence ids are invalid`);
  }
  const occurrenceIds = record.occurrenceIds.map((id) =>
    requireDurableText(id, OCCURRENCE_ID_MAX_BYTES, "P1B occurrence id"),
  );
  for (let index = 1; index < occurrenceIds.length; index += 1) {
    if (compareText(occurrenceIds[index - 1]!, occurrenceIds[index]!) >= 0) {
      throw new Error(`P1B shard ${shardIndex} occurrence ids are not strictly sorted`);
    }
  }
  const request = copyContentReference(record.request, "P1B request content");
  const expectedShardId = `${String(shardIndex).padStart(2, "0")}-${request.digest.slice("sha256:".length)}`;
  if (record.shardId !== expectedShardId) throw new Error("P1B shard id is invalid");
  if (record.requestPath !== requestPath(expectedShardId)) {
    throw new Error("P1B shard request path is invalid");
  }
  if (record.resultPath !== resultPath(expectedShardId)) {
    throw new Error("P1B shard result path is invalid");
  }
  return {
    shardId: expectedShardId,
    shardIndex,
    startOccurrenceIndex: start,
    endOccurrenceIndex: end,
    occurrenceIds,
    request,
    requestPath: record.requestPath,
    resultPath: record.resultPath,
  };
}

export async function parseP1bMeasurementShardManifest(
  canonicalJson: string,
  sha256: Sha256Port,
): Promise<CanonicalArtifact<P1bMeasurementShardManifestV1>> {
  const parsed = requireCanonicalArtifact(
    canonicalJson,
    P1B_MAX_SHARD_MANIFEST_BYTES,
    "distributed P1B manifest",
  );
  const record = exactKeys(parsed, [
    "artifact",
    "context",
    "measurement",
    "partition",
    "plan",
    "producer",
    "proof",
    "shards",
    "validity",
    "validityPolicyRevision",
    "version",
  ], "distributed P1B manifest");
  if (record.artifact !== P1B_SHARD_MANIFEST_ARTIFACT || record.version !== 1) {
    throw new Error("distributed P1B manifest protocol is unsupported");
  }
  const partitionRecord = exactKeys(record.partition, [
    "identity",
    "occurrenceCount",
    "requestedShardCount",
    "shardCount",
  ], "distributed P1B partition");
  if (
    partitionRecord.identity !== P1B_DISTRIBUTED_PARTITION_IDENTITY
    || partitionRecord.requestedShardCount !== P1B_DISTRIBUTED_SHARD_COUNT
  ) {
    throw new Error("distributed P1B partition identity is unsupported");
  }
  const occurrenceCount = requireSafeInteger(
    partitionRecord.occurrenceCount,
    1,
    P1B_MAX_DISTRIBUTED_OCCURRENCES,
    "distributed P1B occurrence count",
  );
  if (occurrenceCount < P1B_DISTRIBUTED_SHARD_COUNT) {
    throw new Error("distributed P1B requires at least eight occurrences");
  }
  const expectedShardCount = P1B_DISTRIBUTED_SHARD_COUNT;
  const shardCount = requireSafeInteger(
    partitionRecord.shardCount,
    1,
    P1B_DISTRIBUTED_SHARD_COUNT,
    "distributed P1B shard count",
  );
  if (shardCount !== expectedShardCount) {
    throw new Error("distributed P1B shard count is not canonical");
  }
  if (!Array.isArray(record.shards) || record.shards.length !== shardCount) {
    throw new Error("distributed P1B shard descriptors are incomplete");
  }
  const shards = record.shards.map((entry, index) =>
    copyDescriptor(entry, index, occurrenceCount, shardCount),
  );
  const allIds = shards.flatMap((entry) => entry.occurrenceIds);
  for (let index = 1; index < allIds.length; index += 1) {
    if (compareText(allIds[index - 1]!, allIds[index]!) >= 0) {
      throw new Error("distributed P1B occurrence ids are duplicated or unsorted");
    }
  }
  const manifest: P1bMeasurementShardManifestV1 = {
    artifact: P1B_SHARD_MANIFEST_ARTIFACT,
    version: 1,
    context: copyContext(record.context),
    proof: copyProof(record.proof),
    producer: copyProducer(record.producer),
    validity: copyContentReference(record.validity, "P1B validity report"),
    validityPolicyRevision: requireDurableText(
      record.validityPolicyRevision,
      4_096,
      "validity policy revision",
    ),
    measurement: copyMeasurement(record.measurement),
    partition: {
      identity: P1B_DISTRIBUTED_PARTITION_IDENTITY,
      requestedShardCount: P1B_DISTRIBUTED_SHARD_COUNT,
      shardCount,
      occurrenceCount,
    },
    plan: copyContentReference(record.plan, "P1B causal plan"),
    shards,
  };
  const actualPlan = await canonicalArtifact(causalPlanValue(manifest), sha256);
  if (!sameContentReference(actualPlan.content, manifest.plan)) {
    throw new Error("distributed P1B causal plan digest is stale");
  }
  return {
    artifact: manifest,
    canonicalJson: canonicalJson as CanonicalJson,
    content: await referenceCanonicalJson(canonicalJson as CanonicalJson, sha256),
  };
}

export async function parseP1bMeasurementShardRequest(
  canonicalJson: string,
  sha256: Sha256Port,
): Promise<CanonicalArtifact<P1bMeasurementShardRequestV1>> {
  const parsed = requireCanonicalArtifact(
    canonicalJson,
    P1B_MAX_SHARD_REQUEST_BYTES,
    "distributed P1B shard request",
  );
  const record = exactKeys(parsed, [
    "artifact",
    "measurement",
    "occurrences",
    "partition",
    "producer",
    "validityPolicyRevision",
    "version",
  ], "distributed P1B shard request");
  if (record.artifact !== P1B_SHARD_REQUEST_ARTIFACT || record.version !== 1) {
    throw new Error("distributed P1B shard request protocol is unsupported");
  }
  const partitionRecord = exactKeys(record.partition, [
    "endOccurrenceIndex",
    "identity",
    "requestedShardCount",
    "shardCount",
    "shardIndex",
    "startOccurrenceIndex",
  ], "distributed P1B request partition");
  if (
    partitionRecord.identity !== P1B_DISTRIBUTED_PARTITION_IDENTITY
    || partitionRecord.requestedShardCount !== P1B_DISTRIBUTED_SHARD_COUNT
  ) {
    throw new Error("distributed P1B request partition is unsupported");
  }
  const shardCount = requireSafeInteger(
    partitionRecord.shardCount,
    1,
    P1B_DISTRIBUTED_SHARD_COUNT,
    "request shard count",
  );
  const shardIndex = requireSafeInteger(
    partitionRecord.shardIndex,
    0,
    shardCount - 1,
    "request shard index",
  );
  const start = requireSafeInteger(
    partitionRecord.startOccurrenceIndex,
    0,
    P1B_MAX_DISTRIBUTED_OCCURRENCES,
    "request start index",
  );
  const end = requireSafeInteger(
    partitionRecord.endOccurrenceIndex,
    start + 1,
    P1B_MAX_DISTRIBUTED_OCCURRENCES,
    "request end index",
  );
  if (
    !Array.isArray(record.occurrences)
    || record.occurrences.length !== end - start
    || record.occurrences.length > P1B_MAX_OCCURRENCES_PER_SHARD
  ) {
    throw new Error("distributed P1B request occurrence count is invalid");
  }
  const occurrences = sortedOccurrences(record.occurrences as P1bCorpusOccurrenceV1[]);
  if (occurrences.length !== record.occurrences.length) {
    throw new Error("distributed P1B request occurrence count changed");
  }
  const originalIds = (record.occurrences as P1bCorpusOccurrenceV1[]).map((entry) =>
    entry.occurrenceId,
  );
  if (occurrences.some((entry, index) => entry.occurrenceId !== originalIds[index])) {
    throw new Error("distributed P1B request occurrences are not sorted");
  }
  const request: P1bMeasurementShardRequestV1 = {
    artifact: P1B_SHARD_REQUEST_ARTIFACT,
    version: 1,
    partition: {
      identity: P1B_DISTRIBUTED_PARTITION_IDENTITY,
      requestedShardCount: P1B_DISTRIBUTED_SHARD_COUNT,
      shardCount,
      shardIndex,
      startOccurrenceIndex: start,
      endOccurrenceIndex: end,
    },
    producer: copyProducer(record.producer),
    validityPolicyRevision: requireDurableText(
      record.validityPolicyRevision,
      4_096,
      "validity policy revision",
    ),
    measurement: copyMeasurement(record.measurement),
    occurrences,
  };
  return {
    artifact: request,
    canonicalJson: canonicalJson as CanonicalJson,
    content: await referenceCanonicalJson(canonicalJson as CanonicalJson, sha256),
  };
}

async function verifiedRequestForDescriptor(
  manifest: P1bMeasurementShardManifestV1,
  descriptor: P1bMeasurementShardDescriptorV1,
  canonicalJson: string,
  sha256: Sha256Port,
): Promise<CanonicalArtifact<P1bMeasurementShardRequestV1>> {
  const request = await parseP1bMeasurementShardRequest(canonicalJson, sha256);
  if (!sameContentReference(request.content, descriptor.request)) {
    throw new Error(`P1B request digest mismatch: ${descriptor.shardId}`);
  }
  if (
    request.artifact.partition.shardIndex !== descriptor.shardIndex
    || request.artifact.partition.shardCount !== manifest.partition.shardCount
    || request.artifact.partition.startOccurrenceIndex !== descriptor.startOccurrenceIndex
    || request.artifact.partition.endOccurrenceIndex !== descriptor.endOccurrenceIndex
    || canonicalizeJson(request.artifact.producer) !== canonicalizeJson(manifest.producer)
    || request.artifact.validityPolicyRevision !== manifest.validityPolicyRevision
    || canonicalizeJson(request.artifact.measurement) !== canonicalizeJson(manifest.measurement)
    || request.artifact.occurrences.some((entry, index) =>
      entry.occurrenceId !== descriptor.occurrenceIds[index],
    )
  ) {
    throw new Error(`P1B request disagrees with its manifest: ${descriptor.shardId}`);
  }
  return request;
}

export async function validateP1bMeasurementShardRequestArtifact(input: {
  readonly manifestCanonicalJson: string;
  readonly requestPath: string;
  readonly requestCanonicalJson: string;
  readonly sha256: Sha256Port;
}): Promise<{
  readonly manifest: CanonicalArtifact<P1bMeasurementShardManifestV1>;
  readonly request: P1bMeasurementShardRequestArtifact;
}> {
  const manifest = await parseP1bMeasurementShardManifest(
    input.manifestCanonicalJson,
    input.sha256,
  );
  const descriptor = manifest.artifact.shards.find((entry) =>
    entry.requestPath === input.requestPath,
  );
  if (descriptor === undefined) throw new Error("P1B shard request path is foreign");
  const verified = await verifiedRequestForDescriptor(
    manifest.artifact,
    descriptor,
    input.requestCanonicalJson,
    input.sha256,
  );
  return {
    manifest,
    request: {
      ...verified,
      shardId: descriptor.shardId,
      requestPath: descriptor.requestPath,
      resultPath: descriptor.resultPath,
      request: verified.artifact,
    },
  };
}

export async function buildP1bMeasurementShardResult(input: {
  readonly manifest: CanonicalArtifact<P1bMeasurementShardManifestV1>;
  readonly request: P1bMeasurementShardRequestArtifact;
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
  readonly sha256: Sha256Port;
}): Promise<P1bMeasurementShardResultArtifact> {
  const manifest = await parseP1bMeasurementShardManifest(
    input.manifest.canonicalJson,
    input.sha256,
  );
  if (!sameContentReference(manifest.content, input.manifest.content)) {
    throw new Error("P1B manifest content reference is stale");
  }
  const descriptor = manifest.artifact.shards.find((entry) =>
    entry.shardId === input.request.shardId,
  );
  if (descriptor === undefined) throw new Error("P1B shard request is foreign to the manifest");
  const request = await verifiedRequestForDescriptor(
    manifest.artifact,
    descriptor,
    input.request.canonicalJson,
    input.sha256,
  );
  if (
    input.cases.length !== descriptor.occurrenceIds.length
    || input.cases.some((entry, index) =>
      entry === null
      || typeof entry !== "object"
      || entry.occurrenceId !== descriptor.occurrenceIds[index],
    )
  ) {
    throw new Error(`P1B shard cases disagree with request: ${descriptor.shardId}`);
  }
  const casesCanonical = canonicalizeJson(input.cases);
  const casesContent = await referenceCanonicalJson(casesCanonical, input.sha256);
  const result = await canonicalArtifact({
    artifact: P1B_SHARD_RESULT_ARTIFACT,
    version: 1,
    context: manifest.artifact.context,
    manifest: manifest.content,
    plan: manifest.artifact.plan,
    request: request.content,
    shardId: descriptor.shardId,
    partition: {
      shardCount: manifest.artifact.partition.shardCount,
      shardIndex: descriptor.shardIndex,
      startOccurrenceIndex: descriptor.startOccurrenceIndex,
      endOccurrenceIndex: descriptor.endOccurrenceIndex,
    },
    casesContent,
    cases: input.cases,
  } satisfies P1bMeasurementShardResultV1, input.sha256);
  if (result.content.byteLength > P1B_MAX_SHARD_RESULT_BYTES) {
    throw new Error(`P1B shard result is oversized: ${descriptor.shardId}`);
  }
  return {
    ...result,
    shardId: descriptor.shardId,
    resultPath: descriptor.resultPath,
  };
}

async function parseResult(
  canonicalJson: string,
  manifest: CanonicalArtifact<P1bMeasurementShardManifestV1>,
  descriptor: P1bMeasurementShardDescriptorV1,
  sha256: Sha256Port,
): Promise<CanonicalArtifact<P1bMeasurementShardResultV1>> {
  const parsed = requireCanonicalArtifact(
    canonicalJson,
    P1B_MAX_SHARD_RESULT_BYTES,
    `P1B shard result ${descriptor.shardId}`,
  );
  const record = exactKeys(parsed, [
    "artifact",
    "cases",
    "casesContent",
    "context",
    "manifest",
    "partition",
    "plan",
    "request",
    "shardId",
    "version",
  ], `P1B shard result ${descriptor.shardId}`);
  if (record.artifact !== P1B_SHARD_RESULT_ARTIFACT || record.version !== 1) {
    throw new Error(`P1B shard result protocol is unsupported: ${descriptor.shardId}`);
  }
  const context = copyContext(record.context);
  const partition = exactKeys(record.partition, [
    "endOccurrenceIndex",
    "shardCount",
    "shardIndex",
    "startOccurrenceIndex",
  ], `P1B shard result partition ${descriptor.shardId}`);
  if (
    canonicalizeJson(context) !== canonicalizeJson(manifest.artifact.context)
    || record.shardId !== descriptor.shardId
    || !sameContentReference(copyContentReference(record.manifest, "result manifest"), manifest.content)
    || !sameContentReference(copyContentReference(record.plan, "result plan"), manifest.artifact.plan)
    || !sameContentReference(copyContentReference(record.request, "result request"), descriptor.request)
    || partition.shardCount !== manifest.artifact.partition.shardCount
    || partition.shardIndex !== descriptor.shardIndex
    || partition.startOccurrenceIndex !== descriptor.startOccurrenceIndex
    || partition.endOccurrenceIndex !== descriptor.endOccurrenceIndex
  ) {
    throw new Error(`P1B shard result envelope is stale or foreign: ${descriptor.shardId}`);
  }
  if (
    !Array.isArray(record.cases)
    || record.cases.length !== descriptor.occurrenceIds.length
    || record.cases.some((entry, index) =>
      entry === null
      || typeof entry !== "object"
      || (entry as { occurrenceId?: unknown }).occurrenceId !== descriptor.occurrenceIds[index],
    )
  ) {
    throw new Error(`P1B shard result cases are incomplete: ${descriptor.shardId}`);
  }
  const casesContent = copyContentReference(record.casesContent, "P1B result cases content");
  const actualCasesContent = await referenceCanonicalJson(
    canonicalizeJson(record.cases),
    sha256,
  );
  if (!sameContentReference(casesContent, actualCasesContent)) {
    throw new Error(`P1B shard result cases were tampered: ${descriptor.shardId}`);
  }
  return {
    artifact: {
      artifact: P1B_SHARD_RESULT_ARTIFACT,
      version: 1,
      context,
      manifest: manifest.content,
      plan: manifest.artifact.plan,
      request: descriptor.request,
      shardId: descriptor.shardId,
      partition: {
        shardCount: manifest.artifact.partition.shardCount,
        shardIndex: descriptor.shardIndex,
        startOccurrenceIndex: descriptor.startOccurrenceIndex,
        endOccurrenceIndex: descriptor.endOccurrenceIndex,
      },
      casesContent,
      cases: record.cases as unknown as readonly P1bMeasuredCorpusCaseV1[],
    },
    canonicalJson: canonicalJson as CanonicalJson,
    content: await referenceCanonicalJson(canonicalJson as CanonicalJson, sha256),
  };
}

function exactArtifactsByPath(
  values: readonly P1bShardFileArtifact[],
  expectedPaths: readonly string[],
  description: string,
): ReadonlyMap<string, string> {
  if (!Array.isArray(values) || values.length !== expectedPaths.length) {
    throw new Error(`${description} file count mismatch`);
  }
  const expected = new Set(expectedPaths);
  const result = new Map<string, string>();
  for (const value of values) {
    if (
      value === null
      || typeof value !== "object"
      || typeof value.path !== "string"
      || typeof value.canonicalJson !== "string"
      || !expected.has(value.path)
    ) {
      throw new Error(`${description} contains an extra or invalid file`);
    }
    if (result.has(value.path)) throw new Error(`${description} contains a duplicate file`);
    result.set(value.path, value.canonicalJson);
  }
  return result;
}

export async function reduceP1bMeasurementShardResults(input: {
  readonly manifestCanonicalJson: string;
  readonly requestArtifacts: readonly P1bShardFileArtifact[];
  readonly resultArtifacts: readonly P1bShardFileArtifact[];
  readonly sha256: Sha256Port;
}): Promise<readonly P1bMeasuredCorpusCaseV1[]> {
  const manifest = await parseP1bMeasurementShardManifest(
    input.manifestCanonicalJson,
    input.sha256,
  );
  const requests = exactArtifactsByPath(
    input.requestArtifacts,
    manifest.artifact.shards.map((entry) => entry.requestPath),
    "P1B request artifact set",
  );
  for (const descriptor of manifest.artifact.shards) {
    await verifiedRequestForDescriptor(
      manifest.artifact,
      descriptor,
      requests.get(descriptor.requestPath)!,
      input.sha256,
    );
  }
  const results = exactArtifactsByPath(
    input.resultArtifacts,
    manifest.artifact.shards.map((entry) => entry.resultPath),
    "P1B result artifact set",
  );
  const cases: P1bMeasuredCorpusCaseV1[] = [];
  for (const descriptor of manifest.artifact.shards) {
    const result = await parseResult(
      results.get(descriptor.resultPath)!,
      manifest,
      descriptor,
      input.sha256,
    );
    cases.push(...result.artifact.cases);
  }
  return cases;
}

export async function reconstructP1bMeasurementShardResults(input: {
  readonly current: P1bMeasurementShardPlan;
  readonly trusted: P1bMeasurementShardPlan;
  readonly trustedCases: readonly P1bMeasuredCorpusCaseV1[];
  readonly sha256: Sha256Port;
}): Promise<{
  readonly pendingShardIds: readonly string[];
  readonly results: readonly P1bMeasurementShardResultArtifact[];
}> {
  await parseP1bMeasurementShardManifest(input.current.manifest.canonicalJson, input.sha256);
  await parseP1bMeasurementShardManifest(input.trusted.manifest.canonicalJson, input.sha256);
  const trustedCasesById = new Map<string, P1bMeasuredCorpusCaseV1>();
  for (const entry of input.trustedCases) {
    if (trustedCasesById.has(entry.occurrenceId)) {
      throw new Error(`trusted P1B cases contain a duplicate: ${entry.occurrenceId}`);
    }
    trustedCasesById.set(entry.occurrenceId, entry);
  }
  const trustedIds = new Set(input.trusted.requests.flatMap((entry) =>
    entry.request.occurrences.map((occurrence) => occurrence.occurrenceId),
  ));
  if (
    trustedCasesById.size !== trustedIds.size
    || [...trustedCasesById.keys()].some((occurrenceId) => !trustedIds.has(occurrenceId))
  ) {
    throw new Error("trusted P1B cases do not exactly cover the trusted plan");
  }
  const trustedRequestTexts = new Set(input.trusted.requests.map((entry) =>
    entry.canonicalJson as string,
  ));
  const pendingShardIds: string[] = [];
  const results: P1bMeasurementShardResultArtifact[] = [];
  for (const request of input.current.requests) {
    if (!trustedRequestTexts.has(request.canonicalJson)) {
      pendingShardIds.push(request.shardId);
      continue;
    }
    const cases = request.request.occurrences.map((occurrence) => {
      const entry = trustedCasesById.get(occurrence.occurrenceId);
      if (entry === undefined) {
        throw new Error(`trusted P1B case is missing: ${occurrence.occurrenceId}`);
      }
      return entry;
    });
    results.push(await buildP1bMeasurementShardResult({
      manifest: input.current.manifest,
      request,
      cases,
      sha256: input.sha256,
    }));
  }
  return { pendingShardIds, results };
}
