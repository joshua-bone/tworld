import type {
  StaticAnalysisFeaturesV1,
} from "@tworld/ccsolver/analyze";
import type {
  BlobReferenceV1,
} from "@tworld/ccsolver/domain";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/u;
const CASE_ID_PATTERN = /^case:sha256:[0-9a-f]{64}$/u;

export const P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES = [
  "cclp1/001",
  "cclp1/005",
  "cclp3/013",
  "cclp1/113",
  "cclp3/035",
] as const;

export const P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES = [
  "cclp5-voting-initiative/032",
  "cclp5-voting-halo/038",
  "cclp5-voting-broadcast/020",
  "cclp5-voting-darkness/031",
  "cclp5-voting-wilderness/036",
  "cclp5-voting-zipline/034",
] as const;

export interface P1bSyntheticSourceV1 {
  readonly sourceId: string;
  readonly sourceRevision: "ccsolver-phase-a-synthetic-source-v1";
  readonly rows: readonly string[];
  readonly requiredCollectibles: number;
}

export const P1B_PHASE_A_SYNTHETIC_SOURCES: readonly P1bSyntheticSourceV1[] = [
  {
    sourceId: "source-phase-a-straight-exit",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P..E"],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-wall-detour",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P#E", "..."],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-fork-rejoin",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["...", "P#E", "..."],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-chip-socket",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P.C.S.E"],
    requiredCollectibles: 1,
  },
  {
    sourceId: "source-phase-a-key-door",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P.k.D.E"],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-alternative-exits",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["E.P.E"],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-one-block-lane",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P.BE."],
    requiredCollectibles: 0,
  },
  {
    sourceId: "source-phase-a-impossible-socket",
    sourceRevision: "ccsolver-phase-a-synthetic-source-v1",
    rows: ["P.S.E"],
    requiredCollectibles: 1,
  },
] as const;

export interface P1bSyntheticCurriculumFixtureV1 {
  readonly fixtureId: string;
  readonly source: string;
  readonly purpose:
    | "straight-route"
    | "wall-detour"
    | "alternative-routes"
    | "collectible-socket"
    | "key-door"
    | "alternative-exits"
    | "block-push"
    | "impossible-resource-goal";
}

export const P1B_PHASE_A_SYNTHETIC_FIXTURES: readonly P1bSyntheticCurriculumFixtureV1[] = [
  { fixtureId: "phase-a-straight-exit", source: "source-phase-a-straight-exit", purpose: "straight-route" },
  { fixtureId: "phase-a-wall-detour", source: "source-phase-a-wall-detour", purpose: "wall-detour" },
  { fixtureId: "phase-a-fork-rejoin", source: "source-phase-a-fork-rejoin", purpose: "alternative-routes" },
  { fixtureId: "phase-a-chip-socket", source: "source-phase-a-chip-socket", purpose: "collectible-socket" },
  { fixtureId: "phase-a-key-door", source: "source-phase-a-key-door", purpose: "key-door" },
  { fixtureId: "phase-a-alternative-exits", source: "source-phase-a-alternative-exits", purpose: "alternative-exits" },
  { fixtureId: "phase-a-one-block-lane", source: "source-phase-a-one-block-lane", purpose: "block-push" },
  { fixtureId: "phase-a-impossible-socket", source: "source-phase-a-impossible-socket", purpose: "impossible-resource-goal" },
] as const;

export interface P1bSourceFeatureVectorV1 {
  readonly logicalCellCount: number;
  readonly placementCount: number;
  readonly actorCount: number;
  readonly wiringCount: number;
  readonly resourceSourceCount: number;
  readonly resourceGateCount: number;
  readonly transportNetworkCount: number;
  readonly forcedSurfaceCount: number;
  readonly hazardCount: number;
  readonly exitCount: number;
}

export interface P1bMeasuredTargetV1 {
  readonly target: "ms" | "lynx";
  readonly levelFacts: BlobReferenceV1;
  readonly topologyEvidence: BlobReferenceV1;
  readonly staticAnalysis: BlobReferenceV1;
  readonly features: StaticAnalysisFeaturesV1;
}

export interface P1bComparisonSummaryV1 {
  readonly content: BlobReferenceV1;
  readonly status: "parity" | "divergent";
  readonly sourceFactDifferenceCount: number;
  readonly cellPolicyDifferenceCount: number;
  readonly classificationCellDifferenceCount: number;
  readonly entryDirectionCellDifferenceCount: number;
  readonly exitDirectionCellDifferenceCount: number;
  readonly caveatCellDifferenceCount: number;
  readonly featureDifferenceCount: number;
}

export interface P1bMeasuredCorpusCaseV1 {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly title: string;
  readonly normalizedGameplaySha256: string;
  readonly sourceValidity: {
    readonly status: "valid" | "invalid";
    readonly issueCount: number;
  };
  readonly donorAvailability: {
    readonly ms: boolean;
    readonly lynx: boolean;
  };
  readonly sourceFeatures: P1bSourceFeatureVectorV1;
  readonly targets: readonly [P1bMeasuredTargetV1, P1bMeasuredTargetV1];
  readonly comparison: P1bComparisonSummaryV1;
}

export interface P1bCurriculumManifestInputV1 {
  readonly producerRevision: string;
  readonly source: {
    readonly corpusManifest: BlobReferenceV1;
    readonly corpusValidityReport: BlobReferenceV1;
    readonly measuredCorpusReport: BlobReferenceV1;
    readonly corpusRevision: string;
    readonly validityPolicyRevision: string;
  };
  /** Donor-redacted catalog generated by the bound validity report. */
  readonly corpusOccurrences: readonly P1bCorpusOccurrenceV1[];
  readonly syntheticFixtures: readonly P1bSyntheticCurriculumFixtureV1[];
  readonly measuredCases: readonly P1bMeasuredCorpusCaseV1[];
}

export interface P1bDeterministicSearchBudgetV1 {
  readonly revision: "ccsolver-phase-a-search-budget-v1";
  readonly nodeExpansionLimit: number;
  readonly simulatedDecisionLimit: number;
  readonly replayDecisionLimit: number;
  readonly deterministicAttemptsPerTarget: 1;
}

export interface P1bFrozenCorpusCaseV1 extends P1bMeasuredCorpusCaseV1 {
  readonly donorExposure: "full-input" | "blind";
  readonly searchBudget: P1bDeterministicSearchBudgetV1;
}

export interface P1bFrozenSyntheticFixtureV1 extends P1bSyntheticCurriculumFixtureV1 {
  readonly logicalCellCount: number;
  readonly searchBudget: P1bDeterministicSearchBudgetV1;
}

export interface P1bCurriculumManifestV1 {
  readonly artifact: "ccsolver-p1b-curriculum";
  readonly version: 1;
  readonly producerRevision: string;
  readonly source: P1bCurriculumManifestInputV1["source"];
  readonly syntheticSources: readonly P1bSyntheticSourceV1[];
  readonly synthetic: readonly P1bFrozenSyntheticFixtureV1[];
  readonly training: readonly P1bFrozenCorpusCaseV1[];
  readonly evaluation: readonly P1bFrozenCorpusCaseV1[];
  readonly budgetPolicy: {
    readonly revision: "ccsolver-phase-a-search-budget-v1";
    readonly nodeExpansionLimit: { readonly perLogicalCell: 1_024 };
    readonly simulatedDecisionLimit: { readonly perNodeExpansion: 16 };
    readonly replayDecisionLimit: { readonly perLogicalCell: 64; readonly maximum: 65_536 };
    readonly deterministicAttemptsPerTarget: 1;
    readonly safetyCutoffs: {
      readonly wallTimeMilliseconds: 60_000;
      readonly memoryMebibytes: 512;
      readonly exhaustionDisposition: "infrastructure-inconclusive";
    };
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireText(value: string, description: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\r")) {
    throw new Error(`${description} must be a non-empty durable string`);
  }
  return value;
}

function requireCount(value: number, description: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${description} must be a nonnegative safe integer`);
  }
  return value;
}

function copyBlobReference(
  value: BlobReferenceV1,
  description: string,
): BlobReferenceV1 {
  if (
    value === null
    || typeof value !== "object"
    || typeof value.digest !== "string"
    || !SHA256_PATTERN.test(value.digest)
  ) {
    throw new Error(`${description} must contain a lowercase SHA-256 digest`);
  }
  return {
    digest: value.digest,
    byteLength: requireCount(value.byteLength, `${description} byte length`),
  };
}

function copyFeatures(
  value: StaticAnalysisFeaturesV1,
  description: string,
): StaticAnalysisFeaturesV1 {
  return {
    logicalCellCount: requireCount(value.logicalCellCount, `${description} logical cell count`),
    certainOpenCellCount: requireCount(value.certainOpenCellCount, `${description} certain-open count`),
    blockedCellCount: requireCount(value.blockedCellCount, `${description} blocked count`),
    conditionalBoundaryCount: requireCount(value.conditionalBoundaryCount, `${description} conditional count`),
    dynamicBoundaryCount: requireCount(value.dynamicBoundaryCount, `${description} dynamic count`),
    unknownBoundaryCount: requireCount(value.unknownBoundaryCount, `${description} unknown count`),
    directedAdjacencyCount: requireCount(value.directedAdjacencyCount, `${description} adjacency count`),
    weakConnectionCount: requireCount(value.weakConnectionCount, `${description} weak-connection count`),
    bidirectionalConnectionCount: requireCount(value.bidirectionalConnectionCount, `${description} bidirectional count`),
    oneWayConnectionCount: requireCount(value.oneWayConnectionCount, `${description} one-way count`),
    weakRegionCount: requireCount(value.weakRegionCount, `${description} region count`),
    articulationPointCount: requireCount(value.articulationPointCount, `${description} articulation count`),
    resourceGateCount: requireCount(value.resourceGateCount, `${description} resource-gate count`),
    resourceCandidateSourceCount: requireCount(value.resourceCandidateSourceCount, `${description} resource-source count`),
    transportNetworkCount: requireCount(value.transportNetworkCount, `${description} transport count`),
    transportIncidenceCount: requireCount(value.transportIncidenceCount, `${description} transport-incidence count`),
    forcedSurfaceCount: requireCount(value.forcedSurfaceCount, `${description} forced-surface count`),
    hazardCount: requireCount(value.hazardCount, `${description} hazard count`),
    exitCount: requireCount(value.exitCount, `${description} exit count`),
    uncertaintyCount: requireCount(value.uncertaintyCount, `${description} uncertainty count`),
  };
}

function copySourceFeatures(
  value: P1bSourceFeatureVectorV1,
  description: string,
): P1bSourceFeatureVectorV1 {
  return {
    logicalCellCount: requireCount(value.logicalCellCount, `${description} logical cell count`),
    placementCount: requireCount(value.placementCount, `${description} placement count`),
    actorCount: requireCount(value.actorCount, `${description} actor count`),
    wiringCount: requireCount(value.wiringCount, `${description} wiring count`),
    resourceSourceCount: requireCount(value.resourceSourceCount, `${description} resource-source count`),
    resourceGateCount: requireCount(value.resourceGateCount, `${description} resource-gate count`),
    transportNetworkCount: requireCount(value.transportNetworkCount, `${description} transport count`),
    forcedSurfaceCount: requireCount(value.forcedSurfaceCount, `${description} forced-surface count`),
    hazardCount: requireCount(value.hazardCount, `${description} hazard count`),
    exitCount: requireCount(value.exitCount, `${description} exit count`),
  };
}

function copyMeasuredTarget(
  value: P1bMeasuredTargetV1,
  expectedTarget: P1bMeasuredTargetV1["target"],
  logicalCellCount: number,
): P1bMeasuredTargetV1 {
  if (value.target !== expectedTarget) {
    throw new Error(`selected curriculum target order is invalid: expected ${expectedTarget}`);
  }
  const features = copyFeatures(value.features, `${expectedTarget} static features`);
  if (features.logicalCellCount !== logicalCellCount) {
    throw new Error(`selected curriculum target geometry disagrees: ${expectedTarget}`);
  }
  return {
    target: expectedTarget,
    levelFacts: copyBlobReference(value.levelFacts, `${expectedTarget} level facts`),
    topologyEvidence: copyBlobReference(value.topologyEvidence, `${expectedTarget} topology evidence`),
    staticAnalysis: copyBlobReference(value.staticAnalysis, `${expectedTarget} static analysis`),
    features,
  };
}

function copyComparison(value: P1bComparisonSummaryV1): P1bComparisonSummaryV1 {
  if (value.status !== "parity" && value.status !== "divergent") {
    throw new Error("topology comparison status is invalid");
  }
  const result = {
    content: copyBlobReference(value.content, "topology comparison"),
    status: value.status,
    sourceFactDifferenceCount: requireCount(value.sourceFactDifferenceCount, "source-fact difference count"),
    cellPolicyDifferenceCount: requireCount(value.cellPolicyDifferenceCount, "cell-policy difference count"),
    classificationCellDifferenceCount: requireCount(value.classificationCellDifferenceCount, "classification difference count"),
    entryDirectionCellDifferenceCount: requireCount(value.entryDirectionCellDifferenceCount, "entry-direction difference count"),
    exitDirectionCellDifferenceCount: requireCount(value.exitDirectionCellDifferenceCount, "exit-direction difference count"),
    caveatCellDifferenceCount: requireCount(value.caveatCellDifferenceCount, "caveat difference count"),
    featureDifferenceCount: requireCount(value.featureDifferenceCount, "feature difference count"),
  } satisfies P1bComparisonSummaryV1;
  const total = result.sourceFactDifferenceCount
    + result.cellPolicyDifferenceCount
    + result.featureDifferenceCount;
  if (
    result.classificationCellDifferenceCount > result.cellPolicyDifferenceCount
    || result.entryDirectionCellDifferenceCount > result.cellPolicyDifferenceCount
    || result.exitDirectionCellDifferenceCount > result.cellPolicyDifferenceCount
    || result.caveatCellDifferenceCount > result.cellPolicyDifferenceCount
  ) {
    throw new Error("topology comparison detail exceeds its cell-policy difference count");
  }
  if (
    (result.status === "parity" && total !== 0)
    || (result.status === "divergent" && total === 0)
  ) {
    throw new Error("topology comparison status disagrees with its derived differences");
  }
  return result;
}

export function copyP1bMeasuredCorpusCase(
  entry: P1bMeasuredCorpusCaseV1,
): P1bMeasuredCorpusCaseV1 {
  if (!CASE_ID_PATTERN.test(entry.caseId)) {
    throw new Error(`selected curriculum case id is invalid: ${entry.caseId}`);
  }
  if (!SHA256_HEX_PATTERN.test(entry.normalizedGameplaySha256)) {
    throw new Error(`selected curriculum gameplay identity is invalid: ${entry.occurrenceId}`);
  }
  if (entry.sourceValidity.status !== "valid" && entry.sourceValidity.status !== "invalid") {
    throw new Error(`selected curriculum validity status is invalid: ${entry.occurrenceId}`);
  }
  const issueCount = requireCount(entry.sourceValidity.issueCount, "source validity issue count");
  if (
    (entry.sourceValidity.status === "valid" && issueCount !== 0)
    || (entry.sourceValidity.status === "invalid" && issueCount === 0)
  ) {
    throw new Error(`selected curriculum validity status disagrees: ${entry.occurrenceId}`);
  }
  if (
    typeof entry.donorAvailability.ms !== "boolean"
    || typeof entry.donorAvailability.lynx !== "boolean"
  ) {
    throw new Error(`selected curriculum donor availability is invalid: ${entry.occurrenceId}`);
  }
  const sourceFeatures = copySourceFeatures(entry.sourceFeatures, "source features");
  if (!Array.isArray(entry.targets) || entry.targets.length !== 2) {
    throw new Error(`selected curriculum target pair is invalid: ${entry.occurrenceId}`);
  }
  return {
    caseId: entry.caseId,
    occurrenceId: requireText(entry.occurrenceId, "curriculum occurrence id"),
    title: requireText(entry.title, "curriculum title"),
    normalizedGameplaySha256: entry.normalizedGameplaySha256,
    sourceValidity: { status: entry.sourceValidity.status, issueCount },
    donorAvailability: {
      ms: entry.donorAvailability.ms,
      lynx: entry.donorAvailability.lynx,
    },
    sourceFeatures,
    targets: [
      copyMeasuredTarget(entry.targets[0], "ms", sourceFeatures.logicalCellCount),
      copyMeasuredTarget(entry.targets[1], "lynx", sourceFeatures.logicalCellCount),
    ],
    comparison: copyComparison(entry.comparison),
  };
}

function validateSyntheticSources(): ReadonlyMap<string, P1bSyntheticSourceV1> {
  const sources = new Map<string, P1bSyntheticSourceV1>();
  const allowedTiles = /^[.#PCSkDBE]+$/;
  for (const source of P1B_PHASE_A_SYNTHETIC_SOURCES) {
    if (sources.has(source.sourceId)) {
      throw new Error(`duplicate synthetic curriculum source: ${source.sourceId}`);
    }
    if (source.rows.length === 0 || source.rows[0]?.length === 0) {
      throw new Error(`synthetic curriculum fixture source is empty: ${source.sourceId}`);
    }
    const width = source.rows[0]!.length;
    if (source.rows.some((row) => row.length !== width || !allowedTiles.test(row))) {
      throw new Error(`synthetic curriculum fixture source is malformed: ${source.sourceId}`);
    }
    const joined = source.rows.join("");
    if ([...joined].filter((tile) => tile === "P").length !== 1) {
      throw new Error(`synthetic curriculum fixture must contain one player: ${source.sourceId}`);
    }
    if (![...joined].some((tile) => tile === "E")) {
      throw new Error(`synthetic curriculum fixture must contain an exit: ${source.sourceId}`);
    }
    sources.set(source.sourceId, source);
  }
  return sources;
}

function validateSyntheticFixtures(
  fixtures: readonly P1bSyntheticCurriculumFixtureV1[],
): P1bFrozenSyntheticFixtureV1[] {
  const sources = validateSyntheticSources();
  const fixtureIds = new Set<string>();
  const fixtureById = new Map<string, P1bSyntheticCurriculumFixtureV1>();
  for (const fixture of fixtures) {
    if (fixtureIds.has(fixture.fixtureId)) {
      throw new Error(`duplicate synthetic curriculum fixture: ${fixture.fixtureId}`);
    }
    fixtureIds.add(fixture.fixtureId);
    fixtureById.set(fixture.fixtureId, fixture);
    if (!sources.has(fixture.source)) {
      throw new Error(`synthetic curriculum fixture source is absent: ${fixture.source}`);
    }
  }
  if (fixtures.length !== P1B_PHASE_A_SYNTHETIC_FIXTURES.length) {
    throw new Error("synthetic curriculum fixture set is incomplete");
  }
  return P1B_PHASE_A_SYNTHETIC_FIXTURES.map((expected) => {
    const actual = fixtureById.get(expected.fixtureId);
    if (
      actual === undefined
      || actual.source !== expected.source
      || actual.purpose !== expected.purpose
    ) {
      throw new Error(`synthetic curriculum fixture registration drift: ${expected.fixtureId}`);
    }
    const source = sources.get(actual.source)!;
    const logicalCellCount = source.rows.length * source.rows[0]!.length;
    return {
      fixtureId: actual.fixtureId,
      source: actual.source,
      purpose: actual.purpose,
      logicalCellCount,
      searchBudget: computeP1bSearchBudget(logicalCellCount),
    };
  });
}

function indexMeasuredCases(
  measuredCases: readonly P1bMeasuredCorpusCaseV1[],
): ReadonlyMap<string, P1bMeasuredCorpusCaseV1> {
  const byOccurrence = new Map<string, P1bMeasuredCorpusCaseV1>();
  const caseIds = new Set<string>();
  for (const candidate of measuredCases) {
    const entry = copyP1bMeasuredCorpusCase(candidate);
    if (byOccurrence.has(entry.occurrenceId)) {
      throw new Error(`duplicate measured curriculum occurrence: ${entry.occurrenceId}`);
    }
    if (caseIds.has(entry.caseId)) {
      throw new Error(`duplicate measured curriculum case id: ${entry.caseId}`);
    }
    caseIds.add(entry.caseId);
    byOccurrence.set(entry.occurrenceId, entry);
  }
  return byOccurrence;
}

function indexCorpusOccurrences(
  occurrences: readonly P1bCorpusOccurrenceV1[],
): {
  readonly byOccurrence: ReadonlyMap<string, P1bCorpusOccurrenceV1>;
  readonly occurrencesByGameplay: ReadonlyMap<string, readonly P1bCorpusOccurrenceV1[]>;
} {
  const byOccurrence = new Map<string, P1bCorpusOccurrenceV1>();
  const occurrencesByGameplay = new Map<string, P1bCorpusOccurrenceV1[]>();
  for (const entry of occurrences) {
    if (byOccurrence.has(entry.occurrenceId)) {
      throw new Error(`duplicate redacted corpus occurrence: ${entry.occurrenceId}`);
    }
    if (!SHA256_HEX_PATTERN.test(entry.normalizedGameplaySha256)) {
      throw new Error(`redacted corpus gameplay identity is invalid: ${entry.occurrenceId}`);
    }
    byOccurrence.set(entry.occurrenceId, entry);
    const group = occurrencesByGameplay.get(entry.normalizedGameplaySha256) ?? [];
    group.push(entry);
    occurrencesByGameplay.set(entry.normalizedGameplaySha256, group);
  }
  return { byOccurrence, occurrencesByGameplay };
}

function assertMeasuredCaseMatchesCatalog(
  entry: P1bMeasuredCorpusCaseV1,
  catalog: ReadonlyMap<string, P1bCorpusOccurrenceV1>,
): void {
  const source = catalog.get(entry.occurrenceId);
  if (source === undefined) {
    throw new Error(`selected curriculum occurrence is absent from the redacted corpus: ${entry.occurrenceId}`);
  }
  if (
    source.caseId !== entry.caseId
    || source.title !== entry.title
    || source.normalizedGameplaySha256 !== entry.normalizedGameplaySha256
  ) {
    throw new Error(`selected curriculum occurrence disagrees with the redacted corpus: ${entry.occurrenceId}`);
  }
  if (
    source.validity.status !== entry.sourceValidity.status
    || source.validity.issueCount !== entry.sourceValidity.issueCount
    || source.paired !== (entry.donorAvailability.ms && entry.donorAvailability.lynx)
  ) {
    throw new Error(`selected curriculum evidence disagrees with the redacted corpus: ${entry.occurrenceId}`);
  }
}

function freezeCohort(
  occurrenceIds: readonly string[],
  donorExposure: P1bFrozenCorpusCaseV1["donorExposure"],
  measuredByOccurrence: ReadonlyMap<string, P1bMeasuredCorpusCaseV1>,
): P1bFrozenCorpusCaseV1[] {
  return occurrenceIds.map((occurrenceId) => {
    const entry = measuredByOccurrence.get(occurrenceId);
    if (entry === undefined) {
      throw new Error(`selected curriculum occurrence is absent: ${occurrenceId}`);
    }
    if (entry.sourceValidity.status !== "valid" || entry.sourceValidity.issueCount !== 0) {
      throw new Error(`selected curriculum source is invalid: ${occurrenceId}`);
    }
    if (!entry.donorAvailability.ms || !entry.donorAvailability.lynx) {
      throw new Error(`selected curriculum source is not paired: ${occurrenceId}`);
    }
    if (entry.targets[0].target !== "ms" || entry.targets[1].target !== "lynx") {
      throw new Error(`selected curriculum target order is invalid: ${occurrenceId}`);
    }
    return {
      ...structuredClone(entry),
      donorExposure,
      searchBudget: computeP1bSearchBudget(entry.sourceFeatures.logicalCellCount),
    };
  });
}

/**
 * A revisioned policy formula, not a performance or solvability claim. Safety
 * cutoffs live beside it in the manifest and never influence deterministic
 * action selection.
 */
export function computeP1bSearchBudget(logicalCellCount: number): P1bDeterministicSearchBudgetV1 {
  if (
    !Number.isSafeInteger(logicalCellCount)
    || logicalCellCount <= 0
    || logicalCellCount > 65_536
  ) {
    throw new Error("search budget requires 1 through 65,536 logical cells");
  }
  const nodeExpansionLimit = logicalCellCount * 1_024;
  return {
    revision: "ccsolver-phase-a-search-budget-v1",
    nodeExpansionLimit,
    simulatedDecisionLimit: nodeExpansionLimit * 16,
    replayDecisionLimit: Math.min(65_536, logicalCellCount * 64),
    deterministicAttemptsPerTarget: 1,
  };
}

function assertIsolatedGameplayIdentities(
  training: readonly P1bFrozenCorpusCaseV1[],
  evaluation: readonly P1bFrozenCorpusCaseV1[],
  occurrencesByGameplay: ReadonlyMap<string, readonly P1bCorpusOccurrenceV1[]>,
): void {
  const trainingDigests = new Set<string>();
  for (const entry of training) {
    if (trainingDigests.has(entry.normalizedGameplaySha256)) {
      throw new Error(
        `training cohort contains a normalized gameplay alias: ${entry.normalizedGameplaySha256}`,
      );
    }
    trainingDigests.add(entry.normalizedGameplaySha256);
  }
  const evaluationDigests = new Set<string>();
  for (const entry of evaluation) {
    if (trainingDigests.has(entry.normalizedGameplaySha256)) {
      throw new Error(
        `curriculum cohorts share normalized gameplay identity: ${entry.normalizedGameplaySha256}`,
      );
    }
    const aliases = occurrencesByGameplay.get(entry.normalizedGameplaySha256) ?? [];
    if (aliases.length !== 1 || aliases[0]?.occurrenceId !== entry.occurrenceId) {
      throw new Error(
        `evaluation occurrence has a corpus gameplay alias: ${entry.normalizedGameplaySha256}`,
      );
    }
    if (evaluationDigests.has(entry.normalizedGameplaySha256)) {
      throw new Error(
        `evaluation cohort contains a normalized gameplay alias: ${entry.normalizedGameplaySha256}`,
      );
    }
    evaluationDigests.add(entry.normalizedGameplaySha256);
  }
}

export function buildP1bCurriculumManifest(
  input: P1bCurriculumManifestInputV1,
): P1bCurriculumManifestV1 {
  const measuredByOccurrence = indexMeasuredCases(input.measuredCases);
  const corpus = indexCorpusOccurrences(input.corpusOccurrences);
  for (const entry of measuredByOccurrence.values()) {
    assertMeasuredCaseMatchesCatalog(entry, corpus.byOccurrence);
  }
  const training = freezeCohort(
    P1B_DONOR_VISIBLE_TRAINING_OCCURRENCES,
    "full-input",
    measuredByOccurrence,
  );
  const evaluation = freezeCohort(
    P1B_DONOR_HIDDEN_EVALUATION_OCCURRENCES,
    "blind",
    measuredByOccurrence,
  );
  assertIsolatedGameplayIdentities(
    training,
    evaluation,
    corpus.occurrencesByGameplay,
  );

  return {
    artifact: "ccsolver-p1b-curriculum",
    version: 1,
    producerRevision: input.producerRevision,
    source: {
      corpusManifest: copyBlobReference(input.source.corpusManifest, "corpus manifest"),
      corpusValidityReport: copyBlobReference(
        input.source.corpusValidityReport,
        "corpus validity report",
      ),
      measuredCorpusReport: copyBlobReference(
        input.source.measuredCorpusReport,
        "measured corpus report",
      ),
      corpusRevision: requireText(input.source.corpusRevision, "corpus revision"),
      validityPolicyRevision: requireText(
        input.source.validityPolicyRevision,
        "validity policy revision",
      ),
    },
    syntheticSources: [...P1B_PHASE_A_SYNTHETIC_SOURCES]
      .sort((left, right) => compareText(left.sourceId, right.sourceId))
      .map((source) => ({
        sourceId: source.sourceId,
        sourceRevision: source.sourceRevision,
        rows: [...source.rows],
        requiredCollectibles: source.requiredCollectibles,
      })),
    synthetic: validateSyntheticFixtures(input.syntheticFixtures),
    training,
    evaluation,
    budgetPolicy: {
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
    },
  };
}
