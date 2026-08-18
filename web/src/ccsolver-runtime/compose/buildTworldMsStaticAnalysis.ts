import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldStaticAnalysisFromParts,
  type TworldBasicDossierDataV1,
  type TworldStaticAnalysisBundle,
} from "../impl/buildTworldStaticAnalysis";
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

export type BasicDossierDataV1 = TworldBasicDossierDataV1<"ms">;

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

export type TworldMsStaticAnalysisBundle = TworldStaticAnalysisBundle<
  "ms",
  ProjectedTworldMsLevel,
  TworldMsStaticTopologyEvidenceBundle
>;

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
  return buildTworldStaticAnalysisFromParts({
    target: "ms",
    levelFacts,
    projected,
    topology,
    staticAnalyzerRevision: input.staticAnalyzerRevision,
  }, sha256);
}
