import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type BlobReferenceV1, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_SHARD_COUNT,
  type P7TrainingShardPlan,
} from "../p7-training-execution/p7TrainingShardProtocol";
import {
  assertP7TrainingRunBinding,
  buildP7TrainingRunnerAggregatePlan,
  buildP7TrainingRunnerPlan,
  buildP7TrainingRunnerShardResult,
  buildP7TrainingRunnerReduced,
  canonicalizeP7TrainingRunnerPlan,
  canonicalizeP7TrainingRunnerAggregatePlan,
  canonicalizeP7TrainingRunnerReduced,
  canonicalizeP7TrainingRunnerShardResult,
  p7TrainingEvidencePaths,
  parseP7TrainingRunnerPlan,
  parseP7TrainingRunnerAggregatePlan,
  parseP7TrainingRunnerReduced,
  parseP7TrainingRunnerShardResult,
  referenceP7TrainingRunnerArtifact,
  type P7TrainingRunBindingV1,
  type P7TrainingRunnerEvidenceDescriptorV1,
} from "./p7TrainingRunnerContract";

const sha256 = new WebCryptoSha256();
const binding: P7TrainingRunBindingV1 = {
  headSha: "a".repeat(40),
  runId: "123456789",
  runAttempt: 2,
};
const runner = {
  path: "runner/p7-training-engine-runner.mjs" as const,
  content: { digest: `sha256:${"f".repeat(64)}` as const, byteLength: 12_345 },
};

function reference(index: number, byteLength = index + 1): BlobReferenceV1 {
  return { digest: `sha256:${index.toString(16).padStart(64, "0")}`, byteLength };
}

function plan(): P7TrainingShardPlan {
  return {
    packId: "cclp1",
    packContent: reference(900),
    requests: Array.from({ length: P7_TRAINING_SHARD_COUNT }, (_, shardIndex) => ({
      request: null,
      canonicalJson: "{}",
      content: reference(shardIndex + 1),
    })) as unknown as P7TrainingShardPlan["requests"],
  };
}

function owner(levelNumber: number): number {
  const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
  const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
  for (let shardIndex = 0; shardIndex < P7_TRAINING_SHARD_COUNT; shardIndex += 1) {
    const start = shardIndex * base + Math.min(shardIndex, remainder) + 1;
    const length = base + Number(shardIndex < remainder);
    if (levelNumber >= start && levelNumber < start + length) return shardIndex;
  }
  throw new Error("fixture level has no owner");
}

function evidence(levelNumber: number): P7TrainingRunnerEvidenceDescriptorV1 {
  const occurrenceId = `cclp1/${String(levelNumber).padStart(3, "0")}`;
  const paths = p7TrainingEvidencePaths({
    shardIndex: owner(levelNumber),
    occurrenceId,
    packId: "cclp1",
    levelNumber,
  });
  return {
    occurrenceId,
    levelNumber,
    indexPath: paths.indexPath,
    indexContent: reference(1_000 + levelNumber),
    payloadPath: paths.payloadPath,
    payloadContent: reference(2_000 + levelNumber),
  };
}

describe("P7 training runner transport contract", () => {
  it("round-trips a canonical plan with exactly eight request references", async () => {
    const value = buildP7TrainingRunnerPlan({ binding, runner, plan: plan() });
    const artifact = await referenceP7TrainingRunnerArtifact({
      value,
      canonicalize: canonicalizeP7TrainingRunnerPlan,
      sha256,
    });

    expect(parseP7TrainingRunnerPlan(artifact.canonicalJson)).toEqual(value);
    expect(value.requests).toHaveLength(8);

    const mutation = structuredClone(value) as unknown as Record<string, unknown>;
    (mutation.requests as Record<string, unknown>[])[0]!.path = "../request.json";
    expect(() => parseP7TrainingRunnerPlan(
      canonicalizeJson(mutation as CanonicalJsonValue),
    )).toThrow("path drifted");
  });

  it("binds a sorted pack subset to one aggregate plan for exactly eight workers", () => {
    const aggregate = buildP7TrainingRunnerAggregatePlan({
      binding,
      runner,
      plans: [
        { packId: "cclp1", content: reference(100) },
        { packId: "cclp5", content: reference(500) },
      ],
    });
    expect(parseP7TrainingRunnerAggregatePlan(
      canonicalizeP7TrainingRunnerAggregatePlan(aggregate),
    )).toEqual(aggregate);
    expect(aggregate.shardCount).toBe(8);

    expect(() => buildP7TrainingRunnerAggregatePlan({
      binding,
      runner,
      plans: [
        { packId: "cclp5", content: reference(500) },
        { packId: "cclp1", content: reference(100) },
      ],
    })).toThrow("out of order");
    expect(() => buildP7TrainingRunnerAggregatePlan({ binding, runner, plans: [] }))
      .toThrow("denominator drifted");
  });

  it("binds every shard artifact to HEAD, run ID, and attempt", () => {
    expect(() => assertP7TrainingRunBinding(binding, {
      ...binding,
      headSha: "b".repeat(40),
    })).toThrow("binding drifted");
    expect(() => assertP7TrainingRunBinding(binding, {
      ...binding,
      runId: "987654321",
    })).toThrow("binding drifted");
    expect(() => assertP7TrainingRunBinding(binding, {
      ...binding,
      runAttempt: 3,
    })).toThrow("binding drifted");
  });

  it("requires each shard manifest to own its exact balanced partition", () => {
    const value = buildP7TrainingRunnerShardResult({
      binding,
      packId: "cclp1",
      planContent: reference(8_000),
      shardIndex: 0,
      requestContent: reference(1),
      resultContent: reference(9_000),
      evidence: Array.from({ length: 19 }, (_, index) => evidence(index + 1)),
    });
    const canonical = canonicalizeP7TrainingRunnerShardResult(value);
    expect(parseP7TrainingRunnerShardResult(canonical)).toEqual(value);

    const missing = structuredClone(value) as unknown as Record<string, unknown>;
    (missing.evidence as unknown[]).pop();
    expect(() => parseP7TrainingRunnerShardResult(
      canonicalizeJson(missing as CanonicalJsonValue),
    )).toThrow("exactly cover");
  });

  it("binds the graph-independent execution authority and exact ordered 149-level denominator", () => {
    const reduced = buildP7TrainingRunnerReduced({
      binding,
      packId: "cclp1",
      packContent: reference(900),
      planContent: reference(8_000),
      resultManifestContents: Array.from({ length: 8 }, (_, index) => reference(3_000 + index)),
      evidence: Array.from({ length: 149 }, (_, index) => evidence(index + 1)),
      executionIndexContent: reference(7_000),
    });
    const canonical = canonicalizeP7TrainingRunnerReduced(reduced);
    expect(parseP7TrainingRunnerReduced(canonical)).toEqual(reduced);
    expect(reduced.executionIndexContent).toEqual(reference(7_000));

    const short = structuredClone(reduced) as unknown as Record<string, unknown>;
    (short.evidence as unknown[]).pop();
    expect(() => parseP7TrainingRunnerReduced(
      canonicalizeJson(short as CanonicalJsonValue),
    )).toThrow("denominator drifted");
  });
});
