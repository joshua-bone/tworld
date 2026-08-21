import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  assertP7TrainingRunBinding,
  parseP7TrainingRunBinding,
  type P7TrainingRunBindingV1,
} from "./p7TrainingRunnerContract";
import {
  P7_TRAINING_PRESENTATION_RUNNER_PATH,
  type P7TrainingPresentationRunnerBinaryV1,
} from "./p7TrainingPresentationRunnerBinary";
import { P7TrainingArtifactFilesystem } from "./p7TrainingSidecarFilesystem";

export const P7_TRAINING_PRESENTATION_RUN_MANIFEST_ARTIFACT =
  "ccsolver-p7-training-presentation-run" as const;
export const P7_TRAINING_PRESENTATION_RUN_MANIFEST_REVISION =
  "p7-training-presentation-run-manifest-v1" as const;
export const P7_TRAINING_PRESENTATION_RUN_MANIFEST_PATH = "presentation-run.json" as const;
export const P7_TRAINING_PRESENTATION_RUN_MANIFEST_MAX_BYTES = 64 * 1024;

export interface P7TrainingPresentationRunManifestV1 {
  readonly artifact: typeof P7_TRAINING_PRESENTATION_RUN_MANIFEST_ARTIFACT;
  readonly version: 1;
  readonly producerRevision: typeof P7_TRAINING_PRESENTATION_RUN_MANIFEST_REVISION;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingPresentationRunnerBinaryV1;
}

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const encoder = new TextEncoder();

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const source = value as Record<string, unknown>;
  const actual = Object.keys(source).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unsupported shape`);
  }
  return source;
}

function contentReference(value: unknown): BlobReferenceV1 {
  const source = exactRecord(value, ["byteLength", "digest"], "P7 presentation runner content");
  if (
    typeof source.digest !== "string"
    || !SHA256_PATTERN.test(source.digest)
    || !Number.isSafeInteger(source.byteLength)
    || (source.byteLength as number) < 0
  ) throw new Error("P7 presentation runner content is invalid");
  return { digest: source.digest as BlobReferenceV1["digest"], byteLength: source.byteLength as number };
}

function copyManifest(value: unknown): P7TrainingPresentationRunManifestV1 {
  const source = exactRecord(value, [
    "artifact", "binding", "producerRevision", "runner", "version",
  ], "P7 presentation run manifest");
  const runner = exactRecord(source.runner, ["content", "path"], "P7 presentation runner");
  if (
    source.artifact !== P7_TRAINING_PRESENTATION_RUN_MANIFEST_ARTIFACT
    || source.version !== 1
    || source.producerRevision !== P7_TRAINING_PRESENTATION_RUN_MANIFEST_REVISION
    || runner.path !== P7_TRAINING_PRESENTATION_RUNNER_PATH
  ) throw new Error("P7 presentation run manifest identity drifted");
  return {
    artifact: P7_TRAINING_PRESENTATION_RUN_MANIFEST_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_RUN_MANIFEST_REVISION,
    binding: parseP7TrainingRunBinding(source.binding),
    runner: {
      path: P7_TRAINING_PRESENTATION_RUNNER_PATH,
      content: contentReference(runner.content),
    },
  };
}

function canonicalize(value: unknown): CanonicalJson {
  const canonical = canonicalizeJson(copyManifest(value) as unknown as CanonicalJsonValue);
  if (encoder.encode(canonical).byteLength > P7_TRAINING_PRESENTATION_RUN_MANIFEST_MAX_BYTES) {
    throw new Error("P7 presentation run manifest exceeds its byte bound");
  }
  return canonical;
}

function parse(value: string): P7TrainingPresentationRunManifestV1 {
  if (encoder.encode(value).byteLength > P7_TRAINING_PRESENTATION_RUN_MANIFEST_MAX_BYTES) {
    throw new Error("P7 presentation run manifest exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error("P7 presentation run manifest is invalid JSON", { cause: error });
  }
  const manifest = copyManifest(parsed);
  if (canonicalize(manifest) !== value) throw new Error("P7 presentation run manifest is not canonical");
  return manifest;
}

function filesystem(input: {
  readonly artifactRoot: string;
  readonly sha256: Sha256Port;
}): P7TrainingArtifactFilesystem {
  return new P7TrainingArtifactFilesystem({
    trustedRoot: input.artifactRoot,
    artifactRoot: input.artifactRoot,
    packId: "cclp1",
    shardIndex: 0,
    sha256: input.sha256,
  });
}

export async function prepareP7TrainingPresentationRunManifest(input: {
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingPresentationRunnerBinaryV1;
  readonly sha256: Sha256Port;
}): Promise<{ readonly manifest: P7TrainingPresentationRunManifestV1; readonly content: BlobReferenceV1 }> {
  const manifest = copyManifest({
    artifact: P7_TRAINING_PRESENTATION_RUN_MANIFEST_ARTIFACT,
    version: 1,
    producerRevision: P7_TRAINING_PRESENTATION_RUN_MANIFEST_REVISION,
    binding: input.binding,
    runner: input.runner,
  });
  const canonicalJson = canonicalize(manifest);
  await filesystem(input).writeCanonicalJson(
    P7_TRAINING_PRESENTATION_RUN_MANIFEST_PATH,
    canonicalJson,
    P7_TRAINING_PRESENTATION_RUN_MANIFEST_MAX_BYTES,
  );
  return { manifest, content: await referenceCanonicalJson(canonicalJson, input.sha256) };
}

export async function checkP7TrainingPresentationRunManifest(input: {
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingPresentationRunnerBinaryV1;
  readonly sha256: Sha256Port;
}): Promise<{ readonly manifest: P7TrainingPresentationRunManifestV1; readonly content: BlobReferenceV1 }> {
  const canonicalJson = await filesystem(input).readCanonicalJson(
    P7_TRAINING_PRESENTATION_RUN_MANIFEST_PATH,
    P7_TRAINING_PRESENTATION_RUN_MANIFEST_MAX_BYTES,
  );
  const manifest = parse(canonicalJson);
  assertP7TrainingRunBinding(manifest.binding, input.binding);
  if (
    manifest.runner.path !== input.runner.path
    || manifest.runner.content.digest !== input.runner.content.digest
    || manifest.runner.content.byteLength !== input.runner.content.byteLength
  ) throw new Error("P7 bundled presentation runner content drifted");
  return { manifest, content: await referenceCanonicalJson(canonicalJson, input.sha256) };
}
