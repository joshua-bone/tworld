import {
  analyzeStaticTopology,
  type StaticAnalysisV1,
  type StaticTopologyEvidenceV1,
} from "@tworld/ccsolver/analyze";
import {
  encodeArtifact,
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type LevelIdentityV1,
  type RulesetTargetV1,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { TworldLevelFactsBundle } from "./buildTworldLevelFacts";

export interface TworldTopologyEvidenceBundle {
  readonly evidence: StaticTopologyEvidenceV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

export interface TworldBasicDossierDataV1<
  TTarget extends RulesetTargetV1 = RulesetTargetV1,
> {
  readonly dossierDataVersion: 1;
  readonly target: TTarget;
  readonly level: LevelIdentityV1;
  readonly artifacts: {
    readonly levelFacts: BlobReferenceV1;
    readonly topologyEvidence: BlobReferenceV1;
    readonly staticAnalysis: BlobReferenceV1;
  };
  readonly summary: {
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
    readonly certainOpenCellCount: number;
    readonly regionCount: number;
    readonly articulationPointCount: number;
    readonly uncertaintyCount: number;
  };
  readonly warnings: readonly string[];
}

export interface TworldStaticAnalysisBundle<
  TTarget extends RulesetTargetV1,
  TProjection,
  TTopology extends TworldTopologyEvidenceBundle,
> {
  readonly levelFacts: TworldLevelFactsBundle;
  readonly levelFactsContent: BlobReferenceV1;
  readonly projected: TProjection;
  readonly topology: TTopology;
  readonly analysis: StaticAnalysisV1;
  readonly analysisCanonicalJson: CanonicalJson;
  readonly analysisContent: BlobReferenceV1;
  readonly dossier: TworldBasicDossierDataV1<TTarget>;
  readonly dossierCanonicalJson: CanonicalJson;
  readonly dossierContent: BlobReferenceV1;
}

export interface BuildTworldStaticAnalysisFromPartsInput<
  TTarget extends RulesetTargetV1,
  TProjection,
  TTopology extends TworldTopologyEvidenceBundle,
> {
  readonly target: TTarget;
  readonly levelFacts: TworldLevelFactsBundle;
  readonly projected: TProjection;
  readonly topology: TTopology;
  readonly staticAnalyzerRevision: string;
}

function logicalCellCount(bundle: TworldLevelFactsBundle): number {
  const { width, height, depth } = bundle.facts.payload.geometry;
  return width * height * depth;
}

function buildDossierData<TTarget extends RulesetTargetV1>(
  target: TTarget,
  levelFacts: TworldLevelFactsBundle,
  levelFactsContent: BlobReferenceV1,
  topology: TworldTopologyEvidenceBundle,
  analysis: StaticAnalysisV1,
  analysisContent: BlobReferenceV1,
): TworldBasicDossierDataV1<TTarget> {
  const facts = levelFacts.facts.payload;
  return {
    dossierDataVersion: 1,
    target,
    level: { ...facts.level },
    artifacts: {
      levelFacts: { ...levelFactsContent },
      topologyEvidence: { ...topology.content },
      staticAnalysis: { ...analysisContent },
    },
    summary: {
      logicalCellCount: logicalCellCount(levelFacts),
      placementCount: facts.placements.length,
      actorCount: facts.actors.length,
      wiringCount: facts.wiring.length,
      resourceSourceCount: facts.resourceSources.length,
      resourceGateCount: facts.resourceGates.length,
      transportNetworkCount: facts.transports.length,
      forcedSurfaceCount: facts.forcedSurfaces.length,
      hazardCount: facts.hazards.length,
      exitCount: facts.exits.length,
      certainOpenCellCount: analysis.features.certainOpenCellCount,
      regionCount: analysis.regions.length,
      articulationPointCount: analysis.articulationPoints.length,
      uncertaintyCount: analysis.uncertainties.length,
    },
    warnings: analysis.uncertainties.map((uncertainty) => uncertainty.uncertaintyId),
  };
}

export async function buildTworldStaticAnalysisFromParts<
  TTarget extends RulesetTargetV1,
  TProjection,
  TTopology extends TworldTopologyEvidenceBundle,
>(
  input: BuildTworldStaticAnalysisFromPartsInput<TTarget, TProjection, TTopology>,
  sha256: Sha256Port,
): Promise<TworldStaticAnalysisBundle<TTarget, TProjection, TTopology>> {
  if (input.levelFacts.facts.payload.target !== input.target) {
    throw new Error(
      `level facts target ${input.levelFacts.facts.payload.target} does not match ${input.target} static analysis`,
    );
  }
  const levelFactsCanonicalJson = encodeArtifact(input.levelFacts.facts);
  const levelFactsContent = await referenceCanonicalJson(levelFactsCanonicalJson, sha256);
  const analysis = analyzeStaticTopology({
    levelFacts: input.levelFacts.facts,
    levelFactsDigest: levelFactsContent.digest,
    evidence: input.topology.evidence,
    topologyEvidence: input.topology.content,
    analyzerRevision: input.staticAnalyzerRevision,
  });
  const analysisCanonicalJson = canonicalizeJson(
    analysis as unknown as CanonicalJsonValue,
  );
  const analysisContent = await referenceCanonicalJson(analysisCanonicalJson, sha256);
  const dossier = buildDossierData(
    input.target,
    input.levelFacts,
    levelFactsContent,
    input.topology,
    analysis,
    analysisContent,
  );
  const dossierCanonicalJson = canonicalizeJson(
    dossier as unknown as CanonicalJsonValue,
  );
  const dossierContent = await referenceCanonicalJson(dossierCanonicalJson, sha256);
  return {
    levelFacts: input.levelFacts,
    levelFactsContent,
    projected: input.projected,
    topology: input.topology,
    analysis,
    analysisCanonicalJson,
    analysisContent,
    dossier,
    dossierCanonicalJson,
    dossierContent,
  };
}
