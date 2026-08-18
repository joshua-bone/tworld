import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { StaticAnalysisFeaturesV1 } from "@tworld/ccsolver/analyze";
import {
  P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
  P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
  P1B_PHASE_A_SYNTHETIC_FIXTURES,
  buildP1bCurriculumManifest,
  computeP1bSearchBudget,
  type P1bMeasuredCorpusCaseV1,
} from "./curriculumManifest";

const DIGESTS = "0123456789abcdef";

function digest(index: number): `sha256:${string}` {
  return `sha256:${DIGESTS[index % DIGESTS.length]!.repeat(64)}`;
}

function features(index: number): StaticAnalysisFeaturesV1 {
  return {
    logicalCellCount: 1_024,
    certainOpenCellCount: 700 + index,
    blockedCellCount: 300 - index,
    conditionalBoundaryCount: index % 7,
    dynamicBoundaryCount: index % 11,
    unknownBoundaryCount: 0,
    directedAdjacencyCount: 2_000 + index,
    weakConnectionCount: 1_000 + index,
    bidirectionalConnectionCount: 900 + index,
    oneWayConnectionCount: 100,
    weakRegionCount: 1 + (index % 5),
    articulationPointCount: index * 3,
    resourceGateCount: index % 4,
    resourceCandidateSourceCount: index % 6,
    transportNetworkCount: index % 2,
    transportIncidenceCount: index % 3,
    forcedSurfaceCount: index % 8,
    hazardCount: index % 3,
    exitCount: 1,
    uncertaintyCount: 0,
  };
}

function caseId(index: number): `case:sha256:${string}` {
  return `case:sha256:${DIGESTS[(index + 8) % DIGESTS.length]!.repeat(64)}`;
}

function measuredCase(occurrenceId: string, index: number): P1bMeasuredCorpusCaseV1 {
  return {
    caseId: caseId(index),
    occurrenceId,
    title: `Fixture ${index}`,
    normalizedGameplaySha256: DIGESTS[index % DIGESTS.length]!.repeat(64),
    sourceValidity: { status: "valid", issueCount: 0 },
    donorAvailability: { ms: true, lynx: true },
    sourceFeatures: {
      logicalCellCount: 1_024,
      placementCount: 800 + index,
      actorCount: index % 5,
      wiringCount: index % 3,
      resourceSourceCount: index % 7,
      resourceGateCount: index % 4,
      transportNetworkCount: index % 2,
      forcedSurfaceCount: index % 8,
      hazardCount: index % 3,
      exitCount: 1,
    },
    targets: [
      {
        target: "ms",
        levelFacts: { digest: digest(index), byteLength: 100 + index },
        topologyEvidence: { digest: digest(index + 1), byteLength: 200 + index },
        staticAnalysis: { digest: digest(index + 2), byteLength: 300 + index },
        features: features(index),
      },
      {
        target: "lynx",
        levelFacts: { digest: digest(index + 3), byteLength: 103 + index },
        topologyEvidence: { digest: digest(index + 4), byteLength: 203 + index },
        staticAnalysis: { digest: digest(index + 5), byteLength: 303 + index },
        features: features(index + 1),
      },
    ],
    comparison: {
      content: { digest: digest(index + 6), byteLength: 400 + index },
      status: index === 0 ? "parity" : "divergent",
      sourceFactDifferenceCount: 0,
      cellPolicyDifferenceCount: index,
      classificationCellDifferenceCount: index % 2,
      entryDirectionCellDifferenceCount: index % 3,
      exitDirectionCellDifferenceCount: index % 4,
      caveatCellDifferenceCount: index % 5,
      featureDifferenceCount: index % 6,
    },
  };
}

function allSelectedCases(): P1bMeasuredCorpusCaseV1[] {
  return [
    ...P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
    ...P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
  ].map(measuredCase);
}

function corpusOccurrences(cases: readonly P1bMeasuredCorpusCaseV1[]) {
  return cases.map((entry) => ({
    caseId: entry.caseId,
    occurrenceId: entry.occurrenceId,
    artifactOccurrenceId: `tworld:fixture:${entry.occurrenceId.replaceAll("/", ":")}`,
    packId: entry.occurrenceId.split("/")[0]!,
    levelNumber: Number(entry.occurrenceId.split("/")[1]),
    title: entry.title,
    author: "Fixture Author",
    normalizedGameplaySha256: entry.normalizedGameplaySha256,
    paired: entry.donorAvailability.ms && entry.donorAvailability.lynx,
    sourceMembers: [],
    validity: {
      status: entry.sourceValidity.status,
      issueCount: entry.sourceValidity.issueCount,
      invalidCellCount: entry.sourceValidity.issueCount,
    },
  }));
}

function build(cases = allSelectedCases()) {
  return buildP1bCurriculumManifest({
    producerRevision: "ccsolver:p1b-test",
    source: {
      corpusManifest: { digest: digest(15), byteLength: 3_625_365 },
      corpusValidityReport: { digest: digest(14), byteLength: 200_000 },
      measuredCorpusReport: { digest: digest(13), byteLength: 5_000_000 },
      corpusRevision: "42c78d0db343621f887fefce581315479d9a8be3",
      validityPolicyRevision: "dattools:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
    },
    corpusOccurrences: corpusOccurrences(cases),
    syntheticFixtures: P1B_PHASE_A_SYNTHETIC_FIXTURES,
    measuredCases: cases,
  });
}

describe("the frozen P1B curriculum", () => {
  it("freezes declarative synthetic, donor-visible, and donor-hidden cohorts with explicit budgets", () => {
    const manifest = build();

    expect(manifest.synthetic.map((entry) => entry.fixtureId)).toEqual([
      "phase-a-straight-exit",
      "phase-a-wall-detour",
      "phase-a-fork-rejoin",
      "phase-a-chip-socket",
      "phase-a-key-door",
      "phase-a-alternative-exits",
      "phase-a-one-block-lane",
      "phase-a-impossible-socket",
    ]);
    expect(manifest.syntheticSources.find((entry) =>
      entry.sourceId === "source-phase-a-one-block-lane",
    )?.rows).toEqual(["P.BE."]);
    expect(manifest.training.map((entry) => entry.occurrenceId)).toEqual(
      P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
    );
    expect(manifest.evaluation.map((entry) => entry.occurrenceId)).toEqual(
      P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
    );
    expect(manifest.evaluation.every((entry) => entry.donorExposure === "blind")).toBe(true);
    expect(manifest.source.measuredCorpusReport).toEqual({
      digest: digest(13),
      byteLength: 5_000_000,
    });
    expect(manifest.evaluation[0]?.searchBudget).toEqual({
      revision: "ccsolver-phase-a-search-budget-v1",
      nodeExpansionLimit: 1_048_576,
      simulatedDecisionLimit: 16_777_216,
      replayDecisionLimit: 65_536,
      deterministicAttemptsPerTarget: 1,
    });
    expect(manifest.budgetPolicy).toEqual({
      revision: "ccsolver-phase-a-search-budget-v1",
      nodeExpansionLimit: { perLogicalCell: 1_024 },
      simulatedDecisionLimit: { perNodeExpansion: 16 },
      replayDecisionLimit: { perLogicalCell: 64, maximum: 65_536 },
      deterministicAttemptsPerTarget: 1,
      safetyCutoffs: {
        wallTimeMilliseconds: 60_000,
        memoryMebibytes: 512,
        exhaustionDisposition: "infrastructure-inconclusive",
      },
    });
  });

  it("derives bounded integer budgets from logical cells without treating safety cutoffs as search input", () => {
    expect(computeP1bSearchBudget(1)).toEqual({
      revision: "ccsolver-phase-a-search-budget-v1",
      nodeExpansionLimit: 1_024,
      simulatedDecisionLimit: 16_384,
      replayDecisionLimit: 64,
      deterministicAttemptsPerTarget: 1,
    });
    expect(computeP1bSearchBudget(65_536)).toEqual({
      revision: "ccsolver-phase-a-search-budget-v1",
      nodeExpansionLimit: 67_108_864,
      simulatedDecisionLimit: 1_073_741_824,
      replayDecisionLimit: 65_536,
      deterministicAttemptsPerTarget: 1,
    });
    expect(() => computeP1bSearchBudget(0)).toThrow("1 through 65,536 logical cells");
    expect(() => computeP1bSearchBudget(65_537)).toThrow("1 through 65,536 logical cells");
  });

  it("is deterministic under measured-case order and carries no donor replay data", () => {
    const canonical = canonicalizeJson(build());
    const shuffled = canonicalizeJson(build([...allSelectedCases()].reverse()));
    const shuffledFixtures = canonicalizeJson(buildP1bCurriculumManifest({
      producerRevision: "ccsolver:p1b-test",
      source: {
        corpusManifest: { digest: digest(15), byteLength: 3_625_365 },
        corpusValidityReport: { digest: digest(14), byteLength: 200_000 },
        measuredCorpusReport: { digest: digest(13), byteLength: 5_000_000 },
        corpusRevision: "42c78d0db343621f887fefce581315479d9a8be3",
        validityPolicyRevision: "dattools:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
      },
      corpusOccurrences: corpusOccurrences(allSelectedCases()),
      syntheticFixtures: [...P1B_PHASE_A_SYNTHETIC_FIXTURES].reverse(),
      measuredCases: allSelectedCases(),
    }));

    expect(shuffled).toBe(canonical);
    expect(shuffledFixtures).toBe(canonical);
    expect(canonical).not.toContain("donorPath");
    expect(canonical).not.toContain("bestTimeTicks");
    expect(canonical).not.toContain("randomSeed");
    expect(canonical).not.toContain("moveCount");
  });

  it("projects closed measured records and rejects contradictory comparison summaries", () => {
    const malicious = allSelectedCases();
    Object.assign(malicious[0]!, {
      donorPath: "save/secret.tws",
      bestTimeTicks: 123,
    });
    Object.assign(malicious[0]!.targets[0].levelFacts, {
      randomSeed: 456,
    });
    const canonical = canonicalizeJson(build(malicious));
    expect(canonical).not.toContain("secret.tws");
    expect(canonical).not.toContain("bestTimeTicks");
    expect(canonical).not.toContain("randomSeed");

    const contradictory = allSelectedCases();
    contradictory[0] = {
      ...contradictory[0]!,
      comparison: {
        ...contradictory[0]!.comparison,
        status: "parity",
        cellPolicyDifferenceCount: 1,
      },
    };
    expect(() => build(contradictory)).toThrow(
      "topology comparison status disagrees with its derived differences",
    );
  });

  it("isolates cohorts by normalized gameplay identity rather than occurrence id", () => {
    const cases = allSelectedCases();
    const duplicateIdentity = cases.map((entry) => (
      entry.occurrenceId === P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES[0]
        ? { ...entry, normalizedGameplaySha256: cases[0]!.normalizedGameplaySha256 }
        : entry
    ));

    expect(() => build(duplicateIdentity)).toThrow(
      "curriculum cohorts share normalized gameplay identity",
    );
  });

  it("fails closed when a selected source is invalid, unpaired, absent, or aliases another occurrence", () => {
    const invalid = allSelectedCases().map((entry, index) => (
      index === 0
        ? { ...entry, sourceValidity: { status: "invalid" as const, issueCount: 1 } }
        : entry
    ));
    expect(() => build(invalid)).toThrow("selected curriculum source is invalid");

    const unpaired = allSelectedCases().map((entry, index) => (
      index === 0
        ? { ...entry, donorAvailability: { ...entry.donorAvailability, lynx: false } }
        : entry
    ));
    expect(() => build(unpaired)).toThrow("selected curriculum source is not paired");

    expect(() => build(allSelectedCases().slice(1))).toThrow("selected curriculum occurrence is absent");

    const duplicate = allSelectedCases();
    duplicate.push({ ...duplicate[0]!, caseId: caseId(15) });
    expect(() => build(duplicate)).toThrow("duplicate measured curriculum occurrence");
  });

  it("rejects a dangling or duplicate synthetic fixture registration", () => {
    const duplicate = [
      ...P1B_PHASE_A_SYNTHETIC_FIXTURES,
      P1B_PHASE_A_SYNTHETIC_FIXTURES[0]!,
    ];
    expect(() => buildP1bCurriculumManifest({
      producerRevision: "ccsolver:p1b-test",
      source: {
        corpusManifest: { digest: digest(15), byteLength: 3_625_365 },
        corpusValidityReport: { digest: digest(14), byteLength: 200_000 },
        measuredCorpusReport: { digest: digest(13), byteLength: 5_000_000 },
        corpusRevision: "42c78d0db343621f887fefce581315479d9a8be3",
        validityPolicyRevision: "dattools:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
      },
      corpusOccurrences: corpusOccurrences(allSelectedCases()),
      syntheticFixtures: duplicate,
      measuredCases: allSelectedCases(),
    })).toThrow("duplicate synthetic curriculum fixture");

    const dangling = P1B_PHASE_A_SYNTHETIC_FIXTURES.map((entry, index) => (
      index === 0 ? { ...entry, source: "missing-fixture" } : entry
    ));
    expect(() => buildP1bCurriculumManifest({
      producerRevision: "ccsolver:p1b-test",
      source: {
        corpusManifest: { digest: digest(15), byteLength: 3_625_365 },
        corpusValidityReport: { digest: digest(14), byteLength: 200_000 },
        measuredCorpusReport: { digest: digest(13), byteLength: 5_000_000 },
        corpusRevision: "42c78d0db343621f887fefce581315479d9a8be3",
        validityPolicyRevision: "dattools:68be18aca0dc42fa3929ff8160c6c8acea8c18e5",
      },
      corpusOccurrences: corpusOccurrences(allSelectedCases()),
      syntheticFixtures: dangling,
      measuredCases: allSelectedCases(),
    })).toThrow("synthetic curriculum fixture source is absent");
  });
});
