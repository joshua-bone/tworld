import {
  compareStaticTopology,
  type StaticTopologyComparisonV1,
} from "@tworld/ccsolver/analyze";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { MsLoadedLevelSource } from "@ruleset-ms/api/levelLoader";
import {
  buildTworldLynxStaticAnalysis,
  type TworldLynxStaticAnalysisBundle,
} from "./buildTworldLynxStaticAnalysis";
import {
  buildTworldMsStaticAnalysis,
  type TworldMsStaticAnalysisBundle,
} from "./buildTworldMsStaticAnalysis";
import type { TworldLegacySourceValidityReportV1 } from "./sourceValidity/analyzeTworldLegacySourceValidity";
import {
  TworldSolverSourceValidityError,
  assertTworldSolverSourceEligibility,
} from "./sourceValidity/assertTworldSolverSourceEligibility";

export type TworldPairedStaticAnalysisErrorCode = "paired-analysis.source-invalid";

export class TworldPairedStaticAnalysisError extends Error {
  override readonly name = "TworldPairedStaticAnalysisError";

  constructor(
    readonly code: TworldPairedStaticAnalysisErrorCode,
    readonly validity: TworldLegacySourceValidityReportV1,
  ) {
    super(`source occurrence is invalid under ${validity.policyRevision}`);
  }
}

export interface BuildTworldPairedStaticAnalysisInput {
  readonly occurrenceId: string;
  readonly producerRevision: string;
  readonly repository: string;
  readonly repositoryRevision: string;
  readonly sourcePath: string;
  readonly importProfileRevision: string;
  readonly analyzerRevision: string;
  readonly staticAnalyzerRevision: string;
  readonly catalogRevision: string;
  readonly msAdapterRevision: string;
  readonly lynxAdapterRevision: string;
  readonly msPolicyRevision: string;
  readonly lynxPolicyRevision: string;
  readonly containerBytes: Uint8Array;
  readonly loaded: MsLoadedLevelSource;
}

export interface TworldPairedStaticAnalysisBundle {
  readonly validity: TworldLegacySourceValidityReportV1;
  readonly ms: TworldMsStaticAnalysisBundle;
  readonly lynx: TworldLynxStaticAnalysisBundle;
  readonly comparison: StaticTopologyComparisonV1;
  readonly comparisonCanonicalJson: CanonicalJson;
  readonly comparisonContent: BlobReferenceV1;
}

export async function buildTworldPairedStaticAnalysis(
  input: BuildTworldPairedStaticAnalysisInput,
  sha256: Sha256Port,
): Promise<TworldPairedStaticAnalysisBundle> {
  let validity: TworldLegacySourceValidityReportV1;
  try {
    validity = assertTworldSolverSourceEligibility({
      layerData: input.loaded.layerData,
    }).legacyValidity;
  } catch (error) {
    if (error instanceof TworldSolverSourceValidityError) {
      throw new TworldPairedStaticAnalysisError("paired-analysis.source-invalid", error.report);
    }
    throw error;
  }

  const common = {
    occurrenceId: input.occurrenceId,
    producerRevision: input.producerRevision,
    repository: input.repository,
    repositoryRevision: input.repositoryRevision,
    sourcePath: input.sourcePath,
    importProfileRevision: input.importProfileRevision,
    analyzerRevision: input.analyzerRevision,
    staticAnalyzerRevision: input.staticAnalyzerRevision,
    catalogRevision: input.catalogRevision,
    containerBytes: input.containerBytes,
    loaded: input.loaded,
  } as const;
  const [ms, lynx] = await Promise.all([
    buildTworldMsStaticAnalysis({
      ...common,
      adapterRevision: input.msAdapterRevision,
      policyRevision: input.msPolicyRevision,
    }, sha256),
    buildTworldLynxStaticAnalysis({
      ...common,
      adapterRevision: input.lynxAdapterRevision,
      policyRevision: input.lynxPolicyRevision,
    }, sha256),
  ]);
  const comparison = await compareStaticTopology({
    targets: [
      {
        content: {
          levelFacts: ms.levelFactsContent,
          topologyEvidence: ms.topology.content,
          staticAnalysis: ms.analysisContent,
        },
        levelFacts: ms.levelFacts.facts,
        evidence: ms.topology.evidence,
        staticAnalysis: ms.analysis,
      },
      {
        content: {
          levelFacts: lynx.levelFactsContent,
          topologyEvidence: lynx.topology.content,
          staticAnalysis: lynx.analysisContent,
        },
        levelFacts: lynx.levelFacts.facts,
        evidence: lynx.topology.evidence,
        staticAnalysis: lynx.analysis,
      },
    ],
  }, (canonicalJson) => referenceCanonicalJson(canonicalJson, sha256));
  const comparisonCanonicalJson = canonicalizeJson(
    comparison as unknown as CanonicalJsonValue,
  );
  const comparisonContent = await referenceCanonicalJson(comparisonCanonicalJson, sha256);
  return {
    validity,
    ms,
    lynx,
    comparison,
    comparisonCanonicalJson,
    comparisonContent,
  };
}
