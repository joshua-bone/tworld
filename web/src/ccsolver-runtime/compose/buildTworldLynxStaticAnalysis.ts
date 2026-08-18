import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldStaticAnalysisFromParts,
  type TworldBasicDossierDataV1,
  type TworldStaticAnalysisBundle,
} from "../impl/buildTworldStaticAnalysis";
import {
  buildTworldLynxLevelFacts,
  type BuildTworldLynxLevelFactsInput,
  type TworldLynxLevelFactsBundle,
} from "./buildTworldLynxLevelFacts";
import {
  buildTworldLynxTopologyEvidence,
  type TworldLynxStaticTopologyEvidenceBundle,
} from "./buildTworldLynxTopologyEvidence";
import {
  projectLoadedTworldLynxLevel,
  type ProjectedTworldLynxLevel,
} from "./tworldLynxLevelProjection";

export type BasicDossierDataV1 = TworldBasicDossierDataV1<"lynx">;

interface AnalysisRevisions {
  readonly policyRevision: string;
  readonly staticAnalyzerRevision: string;
}

export type BuildTworldLynxStaticAnalysisInput =
  | (BuildTworldLynxLevelFactsInput & AnalysisRevisions)
  | ({
      readonly existingFactsBundle: TworldLynxLevelFactsBundle;
      readonly existingProjection: ProjectedTworldLynxLevel;
    } & AnalysisRevisions);

export type TworldLynxStaticAnalysisBundle = TworldStaticAnalysisBundle<
  "lynx",
  ProjectedTworldLynxLevel,
  TworldLynxStaticTopologyEvidenceBundle
>;

export async function buildTworldLynxStaticAnalysis(
  input: BuildTworldLynxStaticAnalysisInput,
  sha256: Sha256Port,
): Promise<TworldLynxStaticAnalysisBundle> {
  const existing = "existingFactsBundle" in input;
  const levelFacts = existing
    ? input.existingFactsBundle
    : await buildTworldLynxLevelFacts(input, sha256);
  const projected = existing
    ? input.existingProjection
    : projectLoadedTworldLynxLevel(input);
  const topology = await buildTworldLynxTopologyEvidence({
    factsBundle: levelFacts,
    projected,
    policyRevision: input.policyRevision,
  }, sha256);
  return buildTworldStaticAnalysisFromParts({
    target: "lynx",
    levelFacts,
    projected,
    topology,
    staticAnalyzerRevision: input.staticAnalyzerRevision,
  }, sha256);
}
