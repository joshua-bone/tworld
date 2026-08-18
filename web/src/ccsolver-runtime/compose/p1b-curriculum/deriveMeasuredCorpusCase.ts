import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { LevelFactsV1 } from "@tworld/ccsolver/domain";
import type { TworldPairedStaticAnalysisBundle } from "../buildTworldPairedStaticAnalysis";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";
import type {
  P1bComparisonSummaryV1,
  P1bMeasuredCorpusCaseV1,
  P1bSourceFeatureVectorV1,
} from "./curriculumManifest";

export interface DeriveP1bMeasuredCorpusCaseInput {
  readonly occurrence: P1bCorpusOccurrenceV1;
  readonly paired: TworldPairedStaticAnalysisBundle;
}

function sourceFeatures(facts: LevelFactsV1): P1bSourceFeatureVectorV1 {
  const payload = facts.payload;
  const { width, height, depth } = payload.geometry;
  return {
    logicalCellCount: width * height * depth,
    placementCount: payload.placements.length,
    actorCount: payload.actors.length,
    wiringCount: payload.wiring.length,
    resourceSourceCount: payload.resourceSources.length,
    resourceGateCount: payload.resourceGates.length,
    transportNetworkCount: payload.transports.length,
    forcedSurfaceCount: payload.forcedSurfaces.length,
    hazardCount: payload.hazards.length,
    exitCount: payload.exits.length,
  };
}

function sameCanonical(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function comparisonSummary(
  paired: TworldPairedStaticAnalysisBundle,
): P1bComparisonSummaryV1 {
  const policyDifferences = paired.comparison.cellPolicyDifferences;
  return {
    content: { ...paired.comparisonContent },
    status: paired.comparison.status,
    sourceFactDifferenceCount: paired.comparison.sourceFactDifferences.length,
    cellPolicyDifferenceCount: policyDifferences.length,
    classificationCellDifferenceCount: policyDifferences.filter((difference) =>
      difference.ms.classification !== difference.lynx.classification,
    ).length,
    entryDirectionCellDifferenceCount: policyDifferences.filter((difference) =>
      !sameCanonical(difference.ms.entryDirections, difference.lynx.entryDirections),
    ).length,
    exitDirectionCellDifferenceCount: policyDifferences.filter((difference) =>
      !sameCanonical(difference.ms.exitDirections, difference.lynx.exitDirections),
    ).length,
    caveatCellDifferenceCount: policyDifferences.filter((difference) =>
      !sameCanonical(difference.ms.caveats, difference.lynx.caveats),
    ).length,
    featureDifferenceCount: paired.comparison.featureDifferences.length,
  };
}

/**
 * Projects one verified paired analysis into the closed, donor-redacted record
 * consumed by the frozen curriculum. No caller-owned object is spread into the
 * result.
 */
export function deriveP1bMeasuredCorpusCase(
  input: DeriveP1bMeasuredCorpusCaseInput,
): P1bMeasuredCorpusCaseV1 {
  const { occurrence, paired } = input;
  if (!occurrence.paired) {
    throw new Error(`measured curriculum occurrence is not paired: ${occurrence.occurrenceId}`);
  }
  if (occurrence.validity.status !== "valid" || occurrence.validity.issueCount !== 0) {
    throw new Error(`measured curriculum occurrence is invalid: ${occurrence.occurrenceId}`);
  }
  if (paired.validity.status !== "valid" || paired.validity.issues.length !== 0) {
    throw new Error(`paired analysis source is invalid: ${occurrence.occurrenceId}`);
  }

  const expectedDigest = `sha256:${occurrence.normalizedGameplaySha256}`;
  for (const [target, facts] of [
    ["ms", paired.ms.levelFacts.facts],
    ["lynx", paired.lynx.levelFacts.facts],
  ] as const) {
    if (
      facts.payload.target !== target
      || facts.payload.level.occurrenceId !== occurrence.artifactOccurrenceId
      || facts.payload.level.normalizedGameplayDigest !== expectedDigest
    ) {
      throw new Error(
        `paired ${target} facts do not identify the redacted corpus occurrence: ${occurrence.occurrenceId}`,
      );
    }
  }

  const msSourceFeatures = sourceFeatures(paired.ms.levelFacts.facts);
  const lynxSourceFeatures = sourceFeatures(paired.lynx.levelFacts.facts);
  if (!sameCanonical(msSourceFeatures, lynxSourceFeatures)) {
    throw new Error(
      `target level-fact inventories disagree for curriculum selection: ${occurrence.occurrenceId}`,
    );
  }

  return {
    caseId: occurrence.caseId,
    occurrenceId: occurrence.occurrenceId,
    title: occurrence.title,
    normalizedGameplaySha256: occurrence.normalizedGameplaySha256,
    sourceValidity: { status: "valid", issueCount: 0 },
    donorAvailability: { ms: true, lynx: true },
    sourceFeatures: msSourceFeatures,
    targets: [
      {
        target: "ms",
        levelFacts: { ...paired.ms.levelFactsContent },
        topologyEvidence: { ...paired.ms.topology.content },
        staticAnalysis: { ...paired.ms.analysisContent },
        features: { ...paired.ms.analysis.features },
      },
      {
        target: "lynx",
        levelFacts: { ...paired.lynx.levelFactsContent },
        topologyEvidence: { ...paired.lynx.topology.content },
        staticAnalysis: { ...paired.lynx.analysisContent },
        features: { ...paired.lynx.analysis.features },
      },
    ],
    comparison: comparisonSummary(paired),
  };
}
