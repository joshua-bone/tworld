import {
  analyzeStaticTopology,
  type StaticAnalysisV1,
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
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldMsLevelFacts,
  type BuildTworldMsLevelFactsInput,
  type TworldMsLevelFactsBundle,
} from "./buildTworldMsLevelFacts";
import {
  buildTworldMsTopologyEvidence,
  type TworldMsStaticTopologyEvidenceBundle,
} from "./buildTworldMsTopologyEvidence";
import {
  projectLoadedTworldMsLevel,
  type ProjectedTworldMsLevel,
} from "./tworldMsLevelProjection";

export interface BasicDossierDataV1 {
  readonly dossierDataVersion: 1;
  readonly target: "ms";
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

interface AnalysisRevisions {
  readonly policyRevision: string;
  readonly staticAnalyzerRevision: string;
}

export type BuildTworldMsStaticAnalysisInput =
  | (BuildTworldMsLevelFactsInput & AnalysisRevisions)
  | ({
      readonly existingFactsBundle: TworldMsLevelFactsBundle;
      readonly existingProjection: ProjectedTworldMsLevel;
    } & AnalysisRevisions);

export interface TworldMsStaticAnalysisBundle {
  readonly levelFacts: TworldMsLevelFactsBundle;
  readonly levelFactsContent: BlobReferenceV1;
  readonly projected: ProjectedTworldMsLevel;
  readonly topology: TworldMsStaticTopologyEvidenceBundle;
  readonly analysis: StaticAnalysisV1;
  readonly analysisCanonicalJson: CanonicalJson;
  readonly analysisContent: BlobReferenceV1;
  readonly dossier: BasicDossierDataV1;
  readonly dossierCanonicalJson: CanonicalJson;
  readonly dossierContent: BlobReferenceV1;
}

function logicalCellCount(bundle: TworldMsLevelFactsBundle): number {
  const { width, height, depth } = bundle.facts.payload.geometry;
  return width * height * depth;
}

function buildDossierData(
  levelFacts: TworldMsLevelFactsBundle,
  levelFactsContent: BlobReferenceV1,
  topology: TworldMsStaticTopologyEvidenceBundle,
  analysis: StaticAnalysisV1,
  analysisContent: BlobReferenceV1,
): BasicDossierDataV1 {
  const facts = levelFacts.facts.payload;
  return {
    dossierDataVersion: 1,
    target: "ms",
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

export async function buildTworldMsStaticAnalysis(
  input: BuildTworldMsStaticAnalysisInput,
  sha256: Sha256Port,
): Promise<TworldMsStaticAnalysisBundle> {
  const existing = "existingFactsBundle" in input;
  const levelFacts = existing
    ? input.existingFactsBundle
    : await buildTworldMsLevelFacts(input, sha256);
  const projected = existing
    ? input.existingProjection
    : projectLoadedTworldMsLevel(input);
  const topology = await buildTworldMsTopologyEvidence({
    factsBundle: levelFacts,
    projected,
    policyRevision: input.policyRevision,
  }, sha256);
  const levelFactsCanonicalJson = encodeArtifact(levelFacts.facts);
  const levelFactsContent = await referenceCanonicalJson(levelFactsCanonicalJson, sha256);
  const analysis = analyzeStaticTopology({
    levelFacts: levelFacts.facts,
    levelFactsDigest: levelFactsContent.digest,
    evidence: topology.evidence,
    topologyEvidence: topology.content,
    analyzerRevision: input.staticAnalyzerRevision,
  });
  const analysisCanonicalJson = canonicalizeJson(
    analysis as unknown as CanonicalJsonValue,
  );
  const analysisContent = await referenceCanonicalJson(analysisCanonicalJson, sha256);
  const dossier = buildDossierData(
    levelFacts,
    levelFactsContent,
    topology,
    analysis,
    analysisContent,
  );
  const dossierCanonicalJson = canonicalizeJson(
    dossier as unknown as CanonicalJsonValue,
  );
  const dossierContent = await referenceCanonicalJson(dossierCanonicalJson, sha256);
  return {
    levelFacts,
    levelFactsContent,
    projected,
    topology,
    analysis,
    analysisCanonicalJson,
    analysisContent,
    dossier,
    dossierCanonicalJson,
    dossierContent,
  };
}
