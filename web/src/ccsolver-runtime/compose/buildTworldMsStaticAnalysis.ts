import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldStaticAnalysisFromParts,
  type TworldBasicDossierDataV1,
  type TworldStaticAnalysisBundle,
} from "../impl/buildTworldStaticAnalysis";
import {
  type BuildTworldMsLevelFactsInput,
} from "./buildTworldMsLevelFacts";
import {
  composeFreshTworldMsTopologyEvidence,
  type TworldMsStaticTopologyEvidenceBundle,
} from "./buildTworldMsTopologyEvidence";
import type { ProjectedTworldMsLevel } from "./tworldMsLevelProjection";

export type BasicDossierDataV1 = TworldBasicDossierDataV1<"ms">;

interface AnalysisRevisions {
  readonly policyRevision: string;
  readonly staticAnalyzerRevision: string;
}

export type BuildTworldMsStaticAnalysisInput = BuildTworldMsLevelFactsInput & AnalysisRevisions;

export type TworldMsStaticAnalysisBundle = TworldStaticAnalysisBundle<
  "ms",
  ProjectedTworldMsLevel,
  TworldMsStaticTopologyEvidenceBundle
>;

export async function buildTworldMsStaticAnalysis(
  input: BuildTworldMsStaticAnalysisInput,
  sha256: Sha256Port,
): Promise<TworldMsStaticAnalysisBundle> {
  const { levelFacts, projected, topology } = await composeFreshTworldMsTopologyEvidence(
    input,
    sha256,
  );
  return buildTworldStaticAnalysisFromParts({
    target: "ms",
    levelFacts,
    projected,
    topology,
    staticAnalyzerRevision: input.staticAnalyzerRevision,
  }, sha256);
}
