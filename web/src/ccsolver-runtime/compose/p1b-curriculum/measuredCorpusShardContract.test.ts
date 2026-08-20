import { createHash } from "node:crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { describe, expect, it } from "vitest";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";
import type { P1bCorpusMeasurementV1 } from "./measuredCorpusReport";
import {
  P1B_DISTRIBUTED_SHARD_COUNT,
  P1B_MAX_SHARD_RESULT_BYTES,
  buildP1bMeasurementShardPlan,
  buildP1bMeasurementShardResult,
  reconstructP1bMeasurementShardResults,
  reduceP1bMeasurementShardResults,
  type BuildP1bMeasurementShardPlanInput,
} from "./measuredCorpusShardContract";

const sha256: Sha256Port = {
  async digestBytes(value) {
    return new Uint8Array(createHash("sha256").update(value).digest());
  },
  async digestUtf8(value) {
    return new Uint8Array(createHash("sha256").update(value, "utf8").digest());
  },
};

const digest = (character: string) => `sha256:${character.repeat(64)}` as const;

const measurement: P1bCorpusMeasurementV1 = {
  corpusRevision: "fixture-corpus-v1",
  artifactRepositoryId: "tworld",
  analysisRevisions: {
    artifactProducerRevision: "fixture-artifact-v1",
    importProfileRevision: "fixture-import-v1",
    factsAnalyzerRevision: "fixture-facts-v1",
    staticAnalyzerRevision: "fixture-static-v1",
    catalogRevision: "fixture-catalog-v1",
    msAdapterRevision: "fixture-ms-v1",
    lynxAdapterRevision: "fixture-lynx-v1",
    msPolicyRevision: "fixture-ms-policy-v1",
    lynxPolicyRevision: "fixture-lynx-policy-v1",
  },
};

function occurrence(index: number): P1bCorpusOccurrenceV1 {
  const suffix = String(index).padStart(3, "0");
  return {
    caseId: `case:sha256:${String(index % 10).repeat(64)}`,
    occurrenceId: `fixture/${suffix}`,
    artifactOccurrenceId: `tworld:fixture/${suffix}`,
    packId: "fixture",
    levelNumber: index,
    title: `Fixture ${suffix}`,
    author: "Fixture Author",
    normalizedGameplaySha256: String((index + 1) % 10).repeat(64),
    paired: true,
    sourceMembers: [{
      ordinal: 0,
      sourceLevelNumber: index,
      sourcePath: "data/fixture.dat",
      byteOffset: index * 10,
      byteLength: 10,
      sha256: String((index + 2) % 10).repeat(64),
    }],
    validity: { status: "valid", issueCount: 0, invalidCellCount: 0 },
  };
}

function measuredCase(entry: P1bCorpusOccurrenceV1): P1bMeasuredCorpusCaseV1 {
  return {
    caseId: entry.caseId,
    occurrenceId: entry.occurrenceId,
    title: entry.title,
    normalizedGameplaySha256: entry.normalizedGameplaySha256,
    sourceValidity: { status: "valid", issueCount: 0 },
    donorAvailability: { ms: true, lynx: true },
    sourceFeatures: {
      logicalCellCount: 1,
      placementCount: 1,
      actorCount: 1,
      wiringCount: 0,
      resourceSourceCount: 0,
      resourceGateCount: 0,
      transportNetworkCount: 0,
      forcedSurfaceCount: 0,
      hazardCount: 0,
      exitCount: 1,
    },
    targets: (["ms", "lynx"] as const).map((target) => ({
      target,
      levelFacts: { digest: digest("1"), byteLength: 1 },
      topologyEvidence: { digest: digest("2"), byteLength: 2 },
      staticAnalysis: { digest: digest("3"), byteLength: 3 },
      features: {
        logicalCellCount: 1,
        certainOpenCellCount: 1,
        blockedCellCount: 0,
        conditionalBoundaryCount: 0,
        dynamicBoundaryCount: 0,
        unknownBoundaryCount: 0,
        directedAdjacencyCount: 0,
        weakConnectionCount: 0,
        bidirectionalConnectionCount: 0,
        oneWayConnectionCount: 0,
        weakRegionCount: 1,
        articulationPointCount: 0,
        resourceGateCount: 0,
        resourceCandidateSourceCount: 0,
        transportNetworkCount: 0,
        transportIncidenceCount: 0,
        forcedSurfaceCount: 0,
        hazardCount: 0,
        exitCount: 1,
        uncertaintyCount: 0,
      },
    })) as unknown as P1bMeasuredCorpusCaseV1["targets"],
    comparison: {
      content: { digest: digest("4"), byteLength: 4 },
      status: "parity",
      sourceFactDifferenceCount: 0,
      cellPolicyDifferenceCount: 0,
      classificationCellDifferenceCount: 0,
      entryDirectionCellDifferenceCount: 0,
      exitDirectionCellDifferenceCount: 0,
      caveatCellDifferenceCount: 0,
      featureDifferenceCount: 0,
    },
  };
}

const baseInput = {
  context: {
    repository: "joshua-bone/tworld",
    headRevision: "a".repeat(40),
    runId: "1234",
    runAttempt: 2,
  },
  proof: {
    proofId: "p1b",
    producerContract: { digest: digest("5"), byteLength: 100 },
    spec: { digest: digest("6"), byteLength: 200 },
    inputs: { digest: digest("7"), byteLength: 300 },
  },
  producer: { content: { digest: digest("8"), byteLength: 400 }, fileCount: 40 },
  validity: { digest: digest("9"), byteLength: 500 },
  validityPolicyRevision: "fixture-validity-v1",
  measurement,
} satisfies Omit<BuildP1bMeasurementShardPlanInput, "occurrences" | "sha256">;

async function plan(overrides: Partial<typeof baseInput> = {}, count = 17) {
  return buildP1bMeasurementShardPlan({
    ...baseInput,
    ...overrides,
    occurrences: Array.from({ length: count }, (_, index) => occurrence(index + 1)),
    sha256,
  });
}

async function resultsFor(
  built: Awaited<ReturnType<typeof plan>>,
) {
  return Promise.all(built.requests.map(async (request) => ({
    path: request.resultPath,
    canonicalJson: (await buildP1bMeasurementShardResult({
      manifest: built.manifest,
      request,
      cases: request.request.occurrences.map(measuredCase),
      sha256,
    })).canonicalJson,
  })));
}

describe("the distributed P1B measurement shard contract", () => {
  it("builds a canonical deterministic fixed-eight balanced contiguous plan", async () => {
    const built = await plan();
    const shuffled = await buildP1bMeasurementShardPlan({
      ...baseInput,
      occurrences: Array.from({ length: 17 }, (_, index) => occurrence(17 - index)),
      sha256,
    });

    expect(P1B_DISTRIBUTED_SHARD_COUNT).toBe(8);
    expect(built.manifest.canonicalJson).toBe(shuffled.manifest.canonicalJson);
    expect(built.requests.map((entry) => entry.request.occurrences.length)).toEqual([
      2, 2, 2, 2, 2, 2, 2, 3,
    ]);
    expect(built.requests.map((entry) => entry.request.partition.startOccurrenceIndex)).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14,
    ]);
    expect(built.requests.every((entry) =>
      canonicalizeJson(JSON.parse(entry.canonicalJson)) === entry.canonicalJson,
    )).toBe(true);
  });

  it("pins the production 2,251-occurrence partition sizes and boundaries", async () => {
    const built = await plan({}, 2_251);

    expect(built.requests.map((entry) => entry.request.occurrences.length)).toEqual([
      281, 281, 282, 281, 281, 282, 281, 282,
    ]);
    expect(built.requests.map((entry) => [
      entry.request.partition.startOccurrenceIndex,
      entry.request.partition.endOccurrenceIndex,
    ])).toEqual([
      [0, 281],
      [281, 562],
      [562, 844],
      [844, 1_125],
      [1_125, 1_406],
      [1_406, 1_688],
      [1_688, 1_969],
      [1_969, 2_251],
    ]);
  });

  it("fails closed instead of weakening the fixed-eight partition", async () => {
    await expect(plan({}, 7)).rejects.toThrow("requires at least eight occurrences");
  });

  it("keeps causal request identity independent of head and broad receipt policy", async () => {
    const original = await plan();
    const rebound = await plan({
      context: { ...baseInput.context, headRevision: "b".repeat(40), runAttempt: 3 },
      proof: {
        ...baseInput.proof,
        spec: { digest: digest("a"), byteLength: 201 },
        inputs: { digest: digest("b"), byteLength: 301 },
      },
    });

    expect(rebound.manifest.canonicalJson).not.toBe(original.manifest.canonicalJson);
    expect(rebound.requests.map((entry) => entry.canonicalJson)).toEqual(
      original.requests.map((entry) => entry.canonicalJson),
    );
  });

  it("invalidates all requests for producer or measurement drift and only the affected shard for occurrence drift", async () => {
    const original = await plan();
    const producerDrift = await plan({
      producer: { content: { digest: digest("c"), byteLength: 401 }, fileCount: 40 },
    });
    const measurementDrift = await plan({
      measurement: {
        ...measurement,
        analysisRevisions: {
          ...measurement.analysisRevisions,
          msPolicyRevision: "fixture-ms-policy-v2",
        },
      },
    });
    const changedOccurrences = Array.from({ length: 17 }, (_, index) => occurrence(index + 1));
    changedOccurrences[5] = {
      ...changedOccurrences[5]!,
      sourceMembers: [{
        ...changedOccurrences[5]!.sourceMembers[0]!,
        sha256: "d".repeat(64),
      }],
    };
    const occurrenceDrift = await buildP1bMeasurementShardPlan({
      ...baseInput,
      occurrences: changedOccurrences,
      sha256,
    });

    expect(producerDrift.requests.every((entry, index) =>
      entry.canonicalJson !== original.requests[index]!.canonicalJson,
    )).toBe(true);
    expect(measurementDrift.requests.every((entry, index) =>
      entry.canonicalJson !== original.requests[index]!.canonicalJson,
    )).toBe(true);
    expect(occurrenceDrift.requests.map((entry, index) =>
      entry.canonicalJson === original.requests[index]!.canonicalJson,
    )).toEqual([true, true, false, true, true, true, true, true]);

    const producerReuse = await reconstructP1bMeasurementShardResults({
      current: producerDrift,
      trusted: original,
      trustedCases: original.requests.flatMap((entry) =>
        entry.request.occurrences.map(measuredCase),
      ),
      sha256,
    });
    expect(producerReuse.results).toEqual([]);
    expect(producerReuse.pendingShardIds).toEqual(
      producerDrift.requests.map((entry) => entry.shardId),
    );
  });

  it("reduces exact result envelopes in monolithic occurrence order", async () => {
    const built = await plan();
    const results = await resultsFor(built);
    const reduced = await reduceP1bMeasurementShardResults({
      manifestCanonicalJson: built.manifest.canonicalJson,
      requestArtifacts: built.requests.map(({ requestPath: path, canonicalJson }) => ({
        path,
        canonicalJson,
      })),
      resultArtifacts: results,
      sha256,
    });

    expect(reduced.map((entry) => entry.occurrenceId)).toEqual(
      Array.from({ length: 17 }, (_, index) => occurrence(index + 1).occurrenceId),
    );
    expect(JSON.parse(results[0]!.canonicalJson)).not.toHaveProperty("diagnostics");
  });

  it.each([
    ["HEAD", (manifest: any) => { manifest.context.headRevision = "b".repeat(40); }],
    ["run attempt", (manifest: any) => { manifest.context.runAttempt += 1; }],
    ["full inputs", (manifest: any) => { manifest.proof.inputs.digest = digest("a"); }],
    ["validity", (manifest: any) => { manifest.validity.digest = digest("b"); }],
    ["plan", (manifest: any) => { manifest.plan.digest = digest("c"); }],
    ["request", (manifest: any) => { manifest.shards[0].request.digest = digest("d"); }],
    ["index", (manifest: any) => { manifest.shards[0].shardIndex = 1; }],
    ["count", (manifest: any) => { manifest.partition.shardCount = 7; }],
    ["gap", (manifest: any) => { manifest.shards[1].startOccurrenceIndex += 1; }],
    ["ordered ids", (manifest: any) => { manifest.shards[0].occurrenceIds.reverse(); }],
  ])("rejects a stale or malformed %s manifest binding", async (_name, mutate) => {
    const built = await plan();
    const values = await resultsFor(built);
    const manifest = JSON.parse(built.manifest.canonicalJson);
    mutate(manifest);
    await expect(reduceP1bMeasurementShardResults({
      manifestCanonicalJson: canonicalizeJson(manifest),
      requestArtifacts: built.requests.map(({ requestPath: path, canonicalJson }) => ({
        path,
        canonicalJson,
      })),
      resultArtifacts: values,
      sha256,
    })).rejects.toThrow();
  });

  it("rejects missing, duplicate, extra, and tampered request artifacts", async () => {
    const built = await plan();
    const values = await resultsFor(built);
    const requests = built.requests.map(({ requestPath: path, canonicalJson }) => ({
      path,
      canonicalJson,
    }));
    const parsed = JSON.parse(requests[0]!.canonicalJson);
    parsed.occurrences[0].title = "Tampered request";
    for (const mutation of [
      requests.slice(1),
      [...requests.slice(0, -1), requests[0]!],
      [...requests, { path: "requests/foreign.request.json", canonicalJson: requests[0]!.canonicalJson }],
      [{ ...requests[0]!, canonicalJson: canonicalizeJson(parsed) }, ...requests.slice(1)],
    ]) {
      await expect(reduceP1bMeasurementShardResults({
        manifestCanonicalJson: built.manifest.canonicalJson,
        requestArtifacts: mutation,
        resultArtifacts: values,
        sha256,
      })).rejects.toThrow();
    }
  });

  it.each([
    ["missing", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => values.slice(1)],
    ["extra", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => [...values, { path: "foreign/result.json", canonicalJson: values[0]!.canonicalJson }]],
    ["duplicate", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => [...values.slice(0, -1), { ...values[0]! }]],
    ["swapped", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => [{ ...values[0]!, canonicalJson: values[1]!.canonicalJson }, { ...values[1]!, canonicalJson: values[0]!.canonicalJson }, ...values.slice(2)]],
    ["tampered", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => {
      const parsed = JSON.parse(values[0]!.canonicalJson);
      parsed.cases[0].title = "Tampered";
      return [{ ...values[0]!, canonicalJson: canonicalizeJson(parsed) }, ...values.slice(1)];
    }],
    ["noncanonical", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => [{ ...values[0]!, canonicalJson: `${values[0]!.canonicalJson}\n` }, ...values.slice(1)]],
    ["unknown-shape", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => {
      const parsed = JSON.parse(values[0]!.canonicalJson);
      parsed.diagnostics = { elapsedMilliseconds: 1 };
      return [{ ...values[0]!, canonicalJson: canonicalizeJson(parsed) }, ...values.slice(1)];
    }],
    ["oversized", async (built: Awaited<ReturnType<typeof plan>>, values: Awaited<ReturnType<typeof resultsFor>>) => [{
      ...values[0]!,
      canonicalJson: " ".repeat(P1B_MAX_SHARD_RESULT_BYTES + 1),
    }, ...values.slice(1)]],
  ])("rejects %s shard results", async (_name, mutate) => {
    const built = await plan();
    const values = await resultsFor(built);
    await expect(reduceP1bMeasurementShardResults({
      manifestCanonicalJson: built.manifest.canonicalJson,
      requestArtifacts: built.requests.map(({ requestPath: path, canonicalJson }) => ({ path, canonicalJson })),
      resultArtifacts: await mutate(built, values),
      sha256,
    })).rejects.toThrow();
  });

  it("reconstructs only byte-identical trusted requests under the current manifest", async () => {
    const trusted = await plan();
    const rebound = await plan({
      context: { ...baseInput.context, headRevision: "b".repeat(40), runAttempt: 3 },
      proof: { ...baseInput.proof, spec: { digest: digest("a"), byteLength: 201 } },
    });
    const allCases = trusted.requests.flatMap((entry) =>
      entry.request.occurrences.map(measuredCase),
    );
    const allReused = await reconstructP1bMeasurementShardResults({
      current: rebound,
      trusted,
      trustedCases: allCases,
      sha256,
    });
    expect(allReused.pendingShardIds).toEqual([]);
    expect(allReused.results).toHaveLength(8);
    expect(allReused.results.every((entry) =>
      JSON.parse(entry.canonicalJson).manifest.digest === rebound.manifest.content.digest,
    )).toBe(true);

    const driftedOccurrences = Array.from({ length: 17 }, (_, index) => occurrence(index + 1));
    driftedOccurrences[5] = {
      ...driftedOccurrences[5]!,
      validity: { status: "valid", issueCount: 0, invalidCellCount: 1 },
    };
    const drifted = await buildP1bMeasurementShardPlan({
      ...baseInput,
      occurrences: driftedOccurrences,
      sha256,
    });
    const partiallyReused = await reconstructP1bMeasurementShardResults({
      current: drifted,
      trusted,
      trustedCases: allCases,
      sha256,
    });
    expect(partiallyReused.pendingShardIds).toEqual([drifted.requests[2]!.shardId]);
    expect(partiallyReused.results).toHaveLength(7);
  });
});
