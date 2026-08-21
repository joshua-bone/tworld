import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7_TRAINING_PRESENTATION_RUNNER_PATH,
  type P7TrainingPresentationRunnerBinaryV1,
} from "./p7TrainingPresentationRunnerBinary";
import {
  P7B_MAX_PACK_OUTPUT_FILES,
  P7B_MAX_PACK_OUTPUT_TOTAL_BYTES,
  type P7bTrainingPackBuildResult,
} from "../p7b-training-review/buildP7bTrainingPackOutputs";
import { P7B_TRAINING_PACK_CHECKED_PARENT } from "../p7b-training-review/p7TrainingPackPaths";
import {
  parseP7TrainingRunBinding,
  type P7TrainingRunBindingV1,
} from "./p7TrainingRunnerContract";

export const P7_TRAINING_PRESENTATION_ARTIFACT =
  "ccsolver-p7-training-presentation-leaf" as const;
export const P7_TRAINING_PRESENTATION_PRODUCER_REVISION =
  "p7-training-presentation-runner-v1" as const;
export const P7_TRAINING_PRESENTATION_AUTHORITY_ARTIFACT =
  "ccsolver-p7-training-presentation-authority" as const;
export const P7_TRAINING_PRESENTATION_MAX_BYTES = 16 * 1024 * 1024;

export interface P7TrainingPresentationLeafV1 {
  readonly artifact: typeof P7_TRAINING_PRESENTATION_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_PRESENTATION_PRODUCER_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly presentationRunner: P7TrainingPresentationRunnerBinaryV1;
  readonly packId: P7TrainingPackId;
  readonly reducedContent: BlobReferenceV1;
  readonly executionIndexContent: BlobReferenceV1;
  readonly playerGraphContent: BlobReferenceV1;
  readonly manifestContent: BlobReferenceV1;
  readonly outputs: readonly {
    readonly path: string;
    readonly content: BlobReferenceV1;
  }[];
  readonly totalByteLength: number;
}

export interface P7TrainingPresentationAuthorityV1 {
  readonly artifact: typeof P7_TRAINING_PRESENTATION_AUTHORITY_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_PRESENTATION_PRODUCER_REVISION;
  readonly packId: P7TrainingPackId;
  readonly executionIndexContent: BlobReferenceV1;
  readonly playerGraphContent: BlobReferenceV1;
  readonly manifestContent: BlobReferenceV1;
  readonly outputs: P7TrainingPresentationLeafV1["outputs"];
  readonly totalByteLength: number;
}

const encoder = new TextEncoder();
const PACK_IDS = new Set<P7TrainingPackId>(["cclp1", "cclp4", "cclp5"]);
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unsupported shape`);
  }
  return record;
}

function reference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactRecord(value, ["byteLength", "digest"], label);
  if (
    typeof record.digest !== "string"
    || !SHA256_PATTERN.test(record.digest)
    || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 0
  ) throw new Error(`${label} is invalid`);
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: record.byteLength as number,
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function safePath(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 2_048
    || value.startsWith("/")
    || value.includes("\\")
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} is unsafe`);
  return value;
}

function presentationRunner(value: unknown): P7TrainingPresentationRunnerBinaryV1 {
  const source = exactRecord(value, ["content", "path"], "P7 presentation runner");
  if (source.path !== P7_TRAINING_PRESENTATION_RUNNER_PATH) {
    throw new Error("P7 presentation runner path drifted");
  }
  return {
    path: P7_TRAINING_PRESENTATION_RUNNER_PATH,
    content: reference(source.content, "P7 presentation runner content"),
  };
}

function copyLeaf(value: unknown): P7TrainingPresentationLeafV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "executionIndexContent", "manifestContent", "outputs", "packId",
    "playerGraphContent", "presentationRunner", "producerRevision", "reducedContent",
    "totalByteLength", "version",
  ], "P7 presentation leaf");
  if (
    source.artifact !== P7_TRAINING_PRESENTATION_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_PRESENTATION_PRODUCER_REVISION
    || typeof source.packId !== "string"
    || !PACK_IDS.has(source.packId as P7TrainingPackId)
    || !Array.isArray(source.outputs)
    || source.outputs.length > P7B_MAX_PACK_OUTPUT_FILES
  ) throw new Error("P7 presentation leaf identity or output count is invalid");
  const packId = source.packId as P7TrainingPackId;
  let previousPath = "";
  const outputs = source.outputs.map((entry, index) => {
    const raw = exactRecord(entry, ["content", "path"], `P7 presentation output ${index}`);
    const path = safePath(raw.path, `P7 presentation output ${index} path`);
    if (index > 0 && compareText(previousPath, path) >= 0) {
      throw new Error("P7 presentation outputs are not strictly path-ordered");
    }
    previousPath = path;
    return { path, content: reference(raw.content, `P7 presentation output ${index} content`) };
  });
  const totalByteLength = outputs.reduce((total, output) => total + output.content.byteLength, 0);
  if (
    source.totalByteLength !== totalByteLength
    || totalByteLength > P7B_MAX_PACK_OUTPUT_TOTAL_BYTES
  ) throw new Error("P7 presentation output byte total drifted or exceeds its bound");
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}`;
  const manifestContent = reference(source.manifestContent, "P7 presentation manifest content");
  const executionIndexContent = reference(
    source.executionIndexContent,
    "P7 presentation execution-index content",
  );
  const manifestOutput = outputs.find(({ path }) => path === `${root}/manifest.json`);
  const executionOutput = outputs.find(({ path }) => path === `${root}/execution-index.json`);
  if (
    manifestOutput === undefined
    || executionOutput === undefined
    || !sameReference(manifestOutput.content, manifestContent)
    || !sameReference(executionOutput.content, executionIndexContent)
  ) throw new Error("P7 presentation manifest or execution-index output binding drifted");
  return {
    artifact: P7_TRAINING_PRESENTATION_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_PRODUCER_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    presentationRunner: presentationRunner(source.presentationRunner),
    packId,
    reducedContent: reference(source.reducedContent, "P7 presentation reduced content"),
    executionIndexContent,
    playerGraphContent: reference(source.playerGraphContent, "P7 presentation player graph content"),
    manifestContent,
    outputs,
    totalByteLength,
  };
}

export async function buildP7TrainingPresentationLeaf(input: {
  readonly binding: P7TrainingRunBindingV1;
  readonly presentationRunner: P7TrainingPresentationRunnerBinaryV1;
  readonly packId: P7TrainingPackId;
  readonly reducedContent: BlobReferenceV1;
  readonly executionIndexContent: BlobReferenceV1;
  readonly playerGraphContent: BlobReferenceV1;
  readonly built: P7bTrainingPackBuildResult;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingPresentationLeafV1> {
  const outputs = await Promise.all([...input.built.outputs]
    .sort((left, right) => compareText(left.path, right.path))
    .map(async ({ path, content }) => ({
      path,
      content: await referenceSourceBytes(content, input.sha256),
    })));
  return copyLeaf({
    artifact: P7_TRAINING_PRESENTATION_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_PRODUCER_REVISION,
    binding: input.binding,
    presentationRunner: input.presentationRunner,
    packId: input.packId,
    reducedContent: input.reducedContent,
    executionIndexContent: input.executionIndexContent,
    playerGraphContent: input.playerGraphContent,
    manifestContent: input.built.manifestContent,
    outputs,
    totalByteLength: outputs.reduce((total, output) => total + output.content.byteLength, 0),
  });
}

export function canonicalizeP7TrainingPresentationLeaf(value: unknown): CanonicalJson {
  const canonical = canonicalizeJson(copyLeaf(value) as unknown as CanonicalJsonValue);
  if (encoder.encode(canonical).byteLength > P7_TRAINING_PRESENTATION_MAX_BYTES) {
    throw new Error("P7 presentation leaf exceeds its byte bound");
  }
  return canonical;
}

export function parseP7TrainingPresentationLeaf(value: string): P7TrainingPresentationLeafV1 {
  if (encoder.encode(value).byteLength > P7_TRAINING_PRESENTATION_MAX_BYTES) {
    throw new Error("P7 presentation leaf exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("P7 presentation leaf is invalid JSON", { cause: error });
  }
  const leaf = copyLeaf(parsed);
  if (canonicalizeP7TrainingPresentationLeaf(leaf) !== value) {
    throw new Error("P7 presentation leaf is not canonical JSON");
  }
  return leaf;
}

export function assertP7TrainingPresentationLeafRunner(
  leaf: P7TrainingPresentationLeafV1,
  expected: P7TrainingPresentationRunnerBinaryV1,
): void {
  if (
    leaf.presentationRunner.path !== expected.path
    || !sameReference(leaf.presentationRunner.content, expected.content)
  ) throw new Error("P7 presentation leaf runner content drifted");
}

function copyAuthority(value: unknown): P7TrainingPresentationAuthorityV1 {
  const source = exactRecord(value, [
    "artifact", "executionIndexContent", "manifestContent", "outputs", "packId",
    "playerGraphContent", "producerRevision", "totalByteLength", "version",
  ], "P7 presentation authority");
  if (
    source.artifact !== P7_TRAINING_PRESENTATION_AUTHORITY_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_PRESENTATION_PRODUCER_REVISION
  ) throw new Error("P7 presentation authority identity is invalid");
  const validated = copyLeaf({
    artifact: P7_TRAINING_PRESENTATION_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_PRODUCER_REVISION,
    binding: { headSha: "0".repeat(40), runId: "1", runAttempt: 1 },
    presentationRunner: {
      path: P7_TRAINING_PRESENTATION_RUNNER_PATH,
      content: { digest: `sha256:${"0".repeat(64)}`, byteLength: 0 },
    },
    packId: source.packId,
    reducedContent: { digest: `sha256:${"0".repeat(64)}`, byteLength: 0 },
    executionIndexContent: source.executionIndexContent,
    playerGraphContent: source.playerGraphContent,
    manifestContent: source.manifestContent,
    outputs: source.outputs,
    totalByteLength: source.totalByteLength,
  });
  return {
    artifact: P7_TRAINING_PRESENTATION_AUTHORITY_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_PRODUCER_REVISION,
    packId: validated.packId,
    executionIndexContent: validated.executionIndexContent,
    playerGraphContent: validated.playerGraphContent,
    manifestContent: validated.manifestContent,
    outputs: validated.outputs,
    totalByteLength: validated.totalByteLength,
  };
}

export function buildP7TrainingPresentationAuthority(
  leaf: P7TrainingPresentationLeafV1,
): P7TrainingPresentationAuthorityV1 {
  return copyAuthority({
    artifact: P7_TRAINING_PRESENTATION_AUTHORITY_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_PRODUCER_REVISION,
    packId: leaf.packId,
    executionIndexContent: leaf.executionIndexContent,
    playerGraphContent: leaf.playerGraphContent,
    manifestContent: leaf.manifestContent,
    outputs: leaf.outputs,
    totalByteLength: leaf.totalByteLength,
  });
}

export function canonicalizeP7TrainingPresentationAuthority(value: unknown): CanonicalJson {
  const canonical = canonicalizeJson(copyAuthority(value) as unknown as CanonicalJsonValue);
  if (encoder.encode(canonical).byteLength > P7_TRAINING_PRESENTATION_MAX_BYTES) {
    throw new Error("P7 presentation authority exceeds its byte bound");
  }
  return canonical;
}

export function parseP7TrainingPresentationAuthority(
  value: string,
): P7TrainingPresentationAuthorityV1 {
  if (encoder.encode(value).byteLength > P7_TRAINING_PRESENTATION_MAX_BYTES) {
    throw new Error("P7 presentation authority exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("P7 presentation authority is invalid JSON", { cause: error });
  }
  const authority = copyAuthority(parsed);
  if (canonicalizeP7TrainingPresentationAuthority(authority) !== value) {
    throw new Error("P7 presentation authority is not canonical JSON");
  }
  return authority;
}
