import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldStaticAnalysisFromParts,
  type TworldBasicDossierDataV1,
  type TworldStaticAnalysisBundle,
} from "../impl/buildTworldStaticAnalysis";
import {
  type BuildTworldLynxLevelFactsInput,
} from "./buildTworldLynxLevelFacts";
import {
  composeFreshTworldLynxTopologyEvidence,
  type TworldLynxStaticTopologyEvidenceBundle,
} from "./buildTworldLynxTopologyEvidence";
import type { ProjectedTworldLynxLevel } from "./tworldLynxLevelProjection";

export type BasicDossierDataV1 = TworldBasicDossierDataV1<"lynx">;

interface AnalysisRevisions {
  readonly policyRevision: string;
  readonly staticAnalyzerRevision: string;
}

export type BuildTworldLynxStaticAnalysisInput = BuildTworldLynxLevelFactsInput & AnalysisRevisions;

export type TworldLynxStaticAnalysisBundle = TworldStaticAnalysisBundle<
  "lynx",
  ProjectedTworldLynxLevel,
  TworldLynxStaticTopologyEvidenceBundle
>;

export async function buildTworldLynxStaticAnalysis(
  input: BuildTworldLynxStaticAnalysisInput,
  sha256: Sha256Port,
): Promise<TworldLynxStaticAnalysisBundle> {
  const { levelFacts, projected, topology } = await composeFreshTworldLynxTopologyEvidence(
    input,
    sha256,
  );
  return buildTworldStaticAnalysisFromParts({
    target: "lynx",
    levelFacts,
    projected,
    topology,
    staticAnalyzerRevision: input.staticAnalyzerRevision,
  }, sha256);
}
