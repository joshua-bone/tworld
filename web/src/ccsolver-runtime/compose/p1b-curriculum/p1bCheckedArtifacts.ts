import {
  encodeArtifact,
  identifyBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { buildTworldPairedStaticAnalysis } from "../buildTworldPairedStaticAnalysis";
import type {
  CorpusManifestV1,
  CorpusSourcePort,
} from "../p1a-corpus/types";
import {
  P1B_PHASE_A_SYNTHETIC_FIXTURES,
  buildP1bCurriculumManifest,
  type P1bMeasuredCorpusCaseV1,
} from "./curriculumManifest";
import { artifactOccurrenceIdForCorpusOccurrence } from "./corpusArtifactIdentity";
import {
  buildP1bCorpusValidityReport,
  canonicalP1bCorpusValidityReportJson,
  type P1bCorpusOccurrenceV1,
  type P1bCorpusValidityReportV1,
} from "./corpusValidityReport";
import {
  assembleP1bMeasuredCorpusReport,
  type P1bCorpusMeasurementV1,
  type P1bMeasuredCorpusReportAnalysisRevisionsV1,
} from "./measuredCorpusReport";

export const P1B_CORPUS_MANIFEST_PATH = "ccsolver/corpus/manifest.v1.json";
export const P1B_VALIDITY_REPORT_PATH = "ccsolver/corpus/p1b-validity-report.v1.json";
export const P1B_MEASURED_CORPUS_PATH = "ccsolver/corpus/p1b-measured-corpus.v1.json";
export const P1B_CURRICULUM_PATH = "ccsolver/corpus/p1b-curriculum.v1.json";
export const P1B_KEY_PYRAMID_DIRECTORY = "ccsolver/fixtures/golden/p1b/cclp1-001";
export const P1B_KEY_PYRAMID_OCCURRENCE_ID = "cclp1/001";

const ANALYSIS_REVISIONS = {
  artifactProducerRevision: "ccsolver:p1b-cross-ruleset-topology-v1",
  importProfileRevision: "tworld-legacy-dat-static:v1",
  factsAnalyzerRevision: "ccsolver-static-level-facts:p0c1-v1",
  staticAnalyzerRevision: "ccsolver-static-topology:p1a-v1",
  msAdapterRevision: "tworld-ms-level-facts:p0c1-v1",
  lynxAdapterRevision: "tworld-lynx-level-facts:p1b-v1",
} as const;

const CURRICULUM_PRODUCER_REVISION = "ccsolver:p1b-curriculum-v1";

const FORBIDDEN_DONOR_METADATA = [
  "\"bestTimeTicks\":",
  "\"containsDiagonalInput\":",
  "\"containsMouseInput\":",
  "\"entryByteLength\":",
  "\"entryOrdinal\":",
  "\"entrySha256\":",
  "\"flags\":",
  "\"moveCount\":",
  "\"password\":",
  "\"randomSeed\":",
  "\"randomSlideDirection\":",
  "\"seriesConfigPath\":",
  "\"stepping\":",
  ".tws",
] as const;

export interface P1bCheckedArtifactOutput {
  readonly path: string;
  readonly canonicalJson: CanonicalJson;
}

export interface P1bCheckedArtifactSummary {
  readonly outputs: readonly P1bCheckedArtifactOutput[];
  readonly validityReport: P1bCorpusValidityReportV1;
  readonly measurement: P1bCorpusMeasurementV1;
  readonly validOccurrenceCount: number;
  readonly invalidOccurrenceCount: number;
  readonly measuredOccurrenceCount: number;
  readonly parityOccurrenceCount: number;
  readonly divergentOccurrenceCount: number;
}

interface VerifiedOccurrenceSource {
  readonly sourcePath: string;
  readonly containerBytes: Uint8Array;
  readonly layerData: readonly Uint8Array[];
}

export function p1bAnalysisRevisions(
  corpusRevision: string,
): P1bMeasuredCorpusReportAnalysisRevisionsV1 {
  return {
    ...ANALYSIS_REVISIONS,
    catalogRevision: corpusRevision,
    msPolicyRevision: `tworld-ms-static-topology:${corpusRevision}`,
    lynxPolicyRevision: `tworld-lynx-static-topology:${corpusRevision}`,
  };
}

function assertDonorMetadataAbsent(path: string, canonicalJson: CanonicalJson): void {
  const leaked = FORBIDDEN_DONOR_METADATA.find((token) => canonicalJson.includes(token));
  if (leaked !== undefined) {
    throw new Error(`donor replay metadata leaked into ${path}: ${leaked}`);
  }
}

function sameContentReference(
  left: { readonly digest: string; readonly byteLength: number },
  right: { readonly digest: string; readonly byteLength: number },
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

async function verifiedOccurrenceSource(
  occurrence: P1bCorpusOccurrenceV1,
  source: CorpusSourcePort,
  sha256: Sha256Port,
): Promise<VerifiedOccurrenceSource> {
  const members = [...occurrence.sourceMembers].sort((left, right) =>
    left.ordinal - right.ordinal,
  );
  if (members.length === 0 || members.some((member, index) => member.ordinal !== index)) {
    throw new Error(`corpus source member order is invalid: ${occurrence.occurrenceId}`);
  }
  const sourcePath = members[0]!.sourcePath;
  if (members.some((member) => member.sourcePath !== sourcePath)) {
    throw new Error(`corpus occurrence spans source containers: ${occurrence.occurrenceId}`);
  }
  const containerBytes = new Uint8Array(await source.readBytes(sourcePath));
  const layerData: Uint8Array[] = [];
  for (const member of members) {
    const end = member.byteOffset + member.byteLength;
    if (!Number.isSafeInteger(end) || end > containerBytes.byteLength) {
      throw new Error(
        `corpus source member exceeds source bytes: ${occurrence.occurrenceId}/${member.ordinal}`,
      );
    }
    const bytes = containerBytes.slice(member.byteOffset, end);
    const actualDigest = await identifyBytes(bytes, sha256);
    if (actualDigest !== `sha256:${member.sha256}`) {
      throw new Error(
        `corpus source member digest mismatch: ${occurrence.occurrenceId}/${member.ordinal}`,
      );
    }
    layerData.push(bytes);
  }
  return { sourcePath, containerBytes, layerData };
}

/**
 * Recomputes P1B validity and every one of its 12 checked outputs. The callback
 * is the only measurement seam: local mode runs workers, while distributed
 * mode supplies already envelope-validated cases.
 */
export async function buildP1bCheckedArtifacts(input: {
  readonly manifest: CorpusManifestV1;
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
  readonly resolveMeasuredCases: (context: {
    readonly validityReport: P1bCorpusValidityReportV1;
    readonly measurement: P1bCorpusMeasurementV1;
  }) => Promise<readonly P1bMeasuredCorpusCaseV1[]>;
}): Promise<P1bCheckedArtifactSummary> {
  const validity = await buildP1bCorpusValidityReport({
    manifest: input.manifest,
    source: input.source,
    sha256: input.sha256,
  });
  return buildP1bCheckedArtifactsFromValidity({
    ...input,
    validityReport: validity,
  });
}

export async function buildP1bCheckedArtifactsFromValidity(input: {
  readonly manifest: CorpusManifestV1;
  readonly source: CorpusSourcePort;
  readonly sha256: Sha256Port;
  readonly validityReport: P1bCorpusValidityReportV1;
  readonly resolveMeasuredCases: (context: {
    readonly validityReport: P1bCorpusValidityReportV1;
    readonly measurement: P1bCorpusMeasurementV1;
  }) => Promise<readonly P1bMeasuredCorpusCaseV1[]>;
}): Promise<P1bCheckedArtifactSummary> {
  const validity = input.validityReport;
  const validityCanonical = canonicalP1bCorpusValidityReportJson(validity);
  const revisions = p1bAnalysisRevisions(input.manifest.source.revision);
  const measurement: P1bCorpusMeasurementV1 = {
    corpusRevision: validity.source.corpusRevision,
    artifactRepositoryId: validity.source.artifactRepositoryId,
    analysisRevisions: revisions,
  };
  const measuredCases = await input.resolveMeasuredCases({
    validityReport: validity,
    measurement,
  });
  const measured = await assembleP1bMeasuredCorpusReport({
    validityReport: validity,
    sha256: input.sha256,
    analysisRevisions: revisions,
    cases: measuredCases,
  });
  const curriculum = buildP1bCurriculumManifest({
    producerRevision: CURRICULUM_PRODUCER_REVISION,
    source: {
      corpusManifest: validity.source.corpusManifest,
      corpusValidityReport: measured.report.source.corpusValidityReport,
      measuredCorpusReport: measured.content,
      corpusRevision: validity.source.corpusRevision,
      validityPolicyRevision: validity.source.validityPolicyRevision,
    },
    corpusOccurrences: validity.occurrences,
    syntheticFixtures: P1B_PHASE_A_SYNTHETIC_FIXTURES,
    measuredCases: measured.report.cases,
  });

  const keyPyramid = validity.occurrences.find((occurrence) =>
    occurrence.occurrenceId === P1B_KEY_PYRAMID_OCCURRENCE_ID,
  );
  if (keyPyramid === undefined) {
    throw new Error(`checked corpus occurrence is absent: ${P1B_KEY_PYRAMID_OCCURRENCE_ID}`);
  }
  if (!keyPyramid.paired || keyPyramid.validity.status !== "valid") {
    throw new Error(
      `checked corpus occurrence is not valid and paired: ${P1B_KEY_PYRAMID_OCCURRENCE_ID}`,
    );
  }
  const keyPyramidSource = await verifiedOccurrenceSource(
    keyPyramid,
    input.source,
    input.sha256,
  );
  const paired = await buildTworldPairedStaticAnalysis({
    occurrenceId: artifactOccurrenceIdForCorpusOccurrence(keyPyramid.occurrenceId),
    producerRevision: revisions.artifactProducerRevision,
    repository: "tworld",
    repositoryRevision: input.manifest.source.revision,
    sourcePath: keyPyramidSource.sourcePath,
    importProfileRevision: revisions.importProfileRevision,
    analyzerRevision: revisions.factsAnalyzerRevision,
    staticAnalyzerRevision: revisions.staticAnalyzerRevision,
    catalogRevision: revisions.catalogRevision,
    msAdapterRevision: revisions.msAdapterRevision,
    lynxAdapterRevision: revisions.lynxAdapterRevision,
    msPolicyRevision: revisions.msPolicyRevision,
    lynxPolicyRevision: revisions.lynxPolicyRevision,
    containerBytes: keyPyramidSource.containerBytes,
    loaded: {
      levelData: keyPyramidSource.layerData[0]!,
      layerData: keyPyramidSource.layerData,
    },
  }, input.sha256);
  const measuredKeyPyramid = measured.report.cases.find((entry) =>
    entry.occurrenceId === P1B_KEY_PYRAMID_OCCURRENCE_ID,
  );
  if (
    measuredKeyPyramid === undefined
    || !sameContentReference(measuredKeyPyramid.targets[0].levelFacts, paired.ms.levelFactsContent)
    || !sameContentReference(
      measuredKeyPyramid.targets[0].topologyEvidence,
      paired.ms.topology.content,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[0].staticAnalysis,
      paired.ms.analysisContent,
    )
    || !sameContentReference(measuredKeyPyramid.targets[1].levelFacts, paired.lynx.levelFactsContent)
    || !sameContentReference(
      measuredKeyPyramid.targets[1].topologyEvidence,
      paired.lynx.topology.content,
    )
    || !sameContentReference(
      measuredKeyPyramid.targets[1].staticAnalysis,
      paired.lynx.analysisContent,
    )
    || !sameContentReference(measuredKeyPyramid.comparison.content, paired.comparisonContent)
  ) {
    throw new Error("Key Pyramid goldens disagree with the measured corpus evidence");
  }

  const outputs: P1bCheckedArtifactOutput[] = [
    { path: P1B_VALIDITY_REPORT_PATH, canonicalJson: validityCanonical },
    { path: P1B_MEASURED_CORPUS_PATH, canonicalJson: measured.canonicalJson },
    { path: P1B_CURRICULUM_PATH, canonicalJson: canonicalizeJson(curriculum) },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/ms/level-facts.v1.json`,
      canonicalJson: encodeArtifact(paired.ms.levelFacts.facts),
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/ms/topology-evidence.v1.json`,
      canonicalJson: paired.ms.topology.canonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/ms/static-analysis.v1.json`,
      canonicalJson: paired.ms.analysisCanonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/ms/dossier-data.v1.json`,
      canonicalJson: paired.ms.dossierCanonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/level-facts.v1.json`,
      canonicalJson: encodeArtifact(paired.lynx.levelFacts.facts),
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/topology-evidence.v1.json`,
      canonicalJson: paired.lynx.topology.canonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/static-analysis.v1.json`,
      canonicalJson: paired.lynx.analysisCanonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/lynx/dossier-data.v1.json`,
      canonicalJson: paired.lynx.dossierCanonicalJson,
    },
    {
      path: `${P1B_KEY_PYRAMID_DIRECTORY}/comparison/static-topology-comparison.v1.json`,
      canonicalJson: paired.comparisonCanonicalJson,
    },
  ];
  for (const output of outputs.slice(0, 3)) {
    assertDonorMetadataAbsent(output.path, output.canonicalJson);
  }
  return {
    outputs,
    validityReport: validity,
    measurement,
    validOccurrenceCount: validity.summary.validOccurrenceCount,
    invalidOccurrenceCount: validity.summary.invalidOccurrenceCount,
    measuredOccurrenceCount: measured.report.summary.measuredOccurrenceCount,
    parityOccurrenceCount: measured.report.summary.parityOccurrenceCount,
    divergentOccurrenceCount: measured.report.summary.divergentOccurrenceCount,
  };
}
