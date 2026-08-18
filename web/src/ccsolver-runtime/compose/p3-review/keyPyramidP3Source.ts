import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { StaticAnalysisV1 } from "@tworld/ccsolver/analyze";
import {
  decodeCanonicalArtifact,
  encodeArtifact,
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
  type LevelFactsV1,
  type RulesetTargetV1,
  type SolverRuntimeProvenance,
} from "@tworld/ccsolver/domain";
import {
  extractIndexedGroupedDatLevel,
  indexGroupedDatLevels,
} from "@content/api/series-file";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import type { TworldLevelFactsBundle } from "../../impl/buildTworldLevelFacts";
import type { TworldSolverManualStartSource } from "../runtime/tworldSolverRuntimeSource";

export const KEY_PYRAMID_CASE_ID = "cclp1-001" as const;
export const KEY_PYRAMID_OCCURRENCE_ID = "tworld:cclp1:001" as const;
export const KEY_PYRAMID_LEVEL_DIGEST =
  "sha256:aa69eb1de0ee692a272820c1c67c0d86371856506cfdb1827ab2bf04e8ec8f4e" as const;
export const KEY_PYRAMID_SOURCE_REVISION =
  "42c78d0db343621f887fefce581315479d9a8be3" as const;
export const KEY_PYRAMID_ENGINE_REVISION =
  "49cf63da3dda99e65dff5136fbabd0f7a09ce72f" as const;
export const KEY_PYRAMID_MANUAL_SEED = 0 as const;

const EXPECTED_CONTENT = {
  ms: {
    levelFacts: {
      digest: "sha256:2aef48efbebea5fca02e319b664ca24659167bf9a46eb46d8b1d8037b3ef1d08",
      byteLength: 643_247,
    },
    staticAnalysis: {
      digest: "sha256:819747b09a9b5efbed0a859db78cae87f735e04966888117dff1bc0d36f919e9",
      byteLength: 236_717,
    },
    topologyEvidence: {
      digest: "sha256:f895eb55f4708829561a4a2e5ec2940678fdab1858e0c6025778a0e2ba8209f3",
      byteLength: 411_206,
    },
    seriesContent: {
      digest: "sha256:d0b660cadb896307c8e232874d0d332b1c19f481ea313115bab0b953a8423258",
      byteLength: 40,
    },
  },
  lynx: {
    levelFacts: {
      digest: "sha256:ba94884e23d4b6921019b6161a3c14d28afc5a1ba277da2cb16151eabaf39673",
      byteLength: 647_864,
    },
    staticAnalysis: {
      digest: "sha256:69775025bc658104966f379d1812ac008b179265ad14ddfb70f32d42012ad870",
      byteLength: 236_723,
    },
    topologyEvidence: {
      digest: "sha256:69841309fd7af57e96accbba82c5181b13e0714878b0731d41932dd8b447570c",
      byteLength: 411_212,
    },
    seriesContent: {
      digest: "sha256:bc19e89be402c875659394f42e369d0f3615c1268e2300323a7a59991d61b86c",
      byteLength: 42,
    },
  },
} as const;

const EXPECTED_MAP_CONTENT = {
  digest: "sha256:46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e",
  byteLength: 111_772,
} as const;

export type KeyPyramidStaticSource = {
  readonly target: RulesetTargetV1;
  readonly levelFacts: LevelFactsV1;
  readonly levelFactsContent: BlobReferenceV1;
  readonly staticAnalysis: StaticAnalysisV1;
  readonly staticAnalysisContent: BlobReferenceV1;
};

export type KeyPyramidRuntimeSource = {
  readonly target: RulesetTargetV1;
  readonly manualSource: TworldSolverManualStartSource;
  readonly levelFacts: TworldLevelFactsBundle;
  readonly levelFactsContent: BlobReferenceV1;
  readonly mapContent: BlobReferenceV1;
  readonly seriesContent: BlobReferenceV1;
  readonly mapPath: "data/CCLP1.dat";
  readonly seriesFile: "CCLP1-MS.dac" | "CCLP1-Lynx.dac";
  readonly runtimeProvenance: SolverRuntimeProvenance;
};

function expected<TTarget extends RulesetTargetV1>(target: TTarget) {
  return EXPECTED_CONTENT[target];
}

function assertReference(
  actual: BlobReferenceV1,
  expectedReference: BlobReferenceV1,
  label: string,
): void {
  if (
    actual.digest !== expectedReference.digest
    || actual.byteLength !== expectedReference.byteLength
  ) {
    throw new Error(
      `${label} drifted: expected ${expectedReference.digest}/${expectedReference.byteLength}, `
      + `received ${actual.digest}/${actual.byteLength}`,
    );
  }
}

function staticDirectory(repositoryRoot: string, target: RulesetTargetV1): string {
  return resolve(
    repositoryRoot,
    "ccsolver",
    "fixtures",
    "golden",
    "p1b",
    KEY_PYRAMID_CASE_ID,
    target,
  );
}

export async function loadKeyPyramidStaticSource(
  repositoryRoot: string,
  target: RulesetTargetV1,
  sha256 = new WebCryptoSha256(),
): Promise<KeyPyramidStaticSource> {
  const directory = staticDirectory(repositoryRoot, target);
  const [factsText, analysisText] = await Promise.all([
    readFile(resolve(directory, "level-facts.v1.json"), "utf8"),
    readFile(resolve(directory, "static-analysis.v1.json"), "utf8"),
  ]);
  const artifact = decodeCanonicalArtifact(factsText);
  if (artifact.artifactType !== "level-facts") {
    throw new Error(`${target} Key Pyramid source is not LevelFactsV1`);
  }
  const levelFacts = artifact;
  const parsedAnalysis: unknown = JSON.parse(analysisText);
  const canonicalAnalysis = canonicalizeJson(parsedAnalysis as CanonicalJsonValue);
  if (canonicalAnalysis !== analysisText) {
    throw new Error(`${target} Key Pyramid static analysis is not canonical JSON`);
  }
  const staticAnalysis = parsedAnalysis as StaticAnalysisV1;
  const [levelFactsContent, staticAnalysisContent] = await Promise.all([
    referenceCanonicalJson(encodeArtifact(levelFacts), sha256),
    referenceCanonicalJson(canonicalAnalysis, sha256),
  ]);
  assertReference(levelFactsContent, expected(target).levelFacts, `${target} LevelFacts`);
  assertReference(
    staticAnalysisContent,
    expected(target).staticAnalysis,
    `${target} static analysis`,
  );
  assertReference(
    staticAnalysis.topologyEvidence,
    expected(target).topologyEvidence,
    `${target} topology evidence binding`,
  );
  if (
    levelFacts.payload.target !== target
    || staticAnalysis.target !== target
    || staticAnalysis.levelFacts.digest !== levelFactsContent.digest
    || levelFacts.payload.level.occurrenceId !== KEY_PYRAMID_OCCURRENCE_ID
    || levelFacts.payload.level.normalizedGameplayDigest !== KEY_PYRAMID_LEVEL_DIGEST
    || canonicalizeJson(staticAnalysis.level as unknown as CanonicalJsonValue)
      !== canonicalizeJson(levelFacts.payload.level as unknown as CanonicalJsonValue)
  ) {
    throw new Error(`${target} Key Pyramid static bindings disagree`);
  }
  return {
    target,
    levelFacts,
    levelFactsContent,
    staticAnalysis,
    staticAnalysisContent,
  };
}

function runtimeProvenance(target: RulesetTargetV1): SolverRuntimeProvenance {
  return {
    adapterId: target === "ms"
      ? "tworld-ms-solver-runtime"
      : "tworld-lynx-solver-runtime",
    adapterRevision: target === "ms"
      ? "ccsolver:tworld-ms-solver-runtime:p2a-v1"
      : "ccsolver:tworld-lynx-solver-runtime:p2a-v1",
    engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
    engineRevision: KEY_PYRAMID_ENGINE_REVISION,
  };
}

export async function loadKeyPyramidRuntimeSource(
  repositoryRoot: string,
  target: RulesetTargetV1,
  sha256 = new WebCryptoSha256(),
): Promise<KeyPyramidRuntimeSource> {
  const seriesFile = target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac";
  const [containerBuffer, seriesBuffer] = await Promise.all([
    readFile(resolve(repositoryRoot, "data", "CCLP1.dat")),
    readFile(resolve(repositoryRoot, "sets", seriesFile)),
  ]);
  const containerBytes = new Uint8Array(containerBuffer);
  const seriesBytes = new Uint8Array(seriesBuffer);
  const indexedLevel = indexGroupedDatLevels(containerBytes).levels.find(
    ({ number }) => number === 1,
  );
  if (indexedLevel === undefined) {
    throw new Error("Key Pyramid level 1 is absent from data/CCLP1.dat");
  }
  const extracted = extractIndexedGroupedDatLevel(containerBytes, indexedLevel);
  const loaded = {
    request: {
      seriesFile,
      levelNumber: 1,
      ruleset: target === "ms" ? "MS" as const : "Lynx" as const,
      randomSeed: KEY_PYRAMID_MANUAL_SEED,
    },
    levelData: extracted.levelData,
    layerData: extracted.layerData.map((entry) => new Uint8Array(entry)),
  };
  const common = {
    occurrenceId: KEY_PYRAMID_OCCURRENCE_ID,
    producerRevision: "ccsolver:p1b-cross-ruleset-topology-v1",
    repository: "tworld",
    repositoryRevision: KEY_PYRAMID_SOURCE_REVISION,
    sourcePath: "data/CCLP1.dat",
    adapterRevision: target === "ms"
      ? "tworld-ms-level-facts:p0c1-v1"
      : "tworld-lynx-level-facts:p1b-v1",
    importProfileRevision: "tworld-legacy-dat-static:v1",
    analyzerRevision: "ccsolver-static-level-facts:p0c1-v1",
    catalogRevision: KEY_PYRAMID_SOURCE_REVISION,
    containerBytes,
    loaded,
  } as const;
  const levelFacts = target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  const [levelFactsContent, mapContent, seriesContent] = await Promise.all([
    referenceCanonicalJson(encodeArtifact(levelFacts.facts), sha256),
    referenceSourceBytes(containerBytes, sha256),
    referenceSourceBytes(seriesBytes, sha256),
  ]);
  assertReference(levelFactsContent, expected(target).levelFacts, `${target} runtime LevelFacts`);
  assertReference(mapContent, EXPECTED_MAP_CONTENT, "Key Pyramid map source");
  assertReference(seriesContent, expected(target).seriesContent, `${target} series source`);
  const provenance = runtimeProvenance(target);
  const manualSource: TworldSolverManualStartSource = {
    loaded,
    levelFacts,
    levelFactsContent,
    provenance,
    manualOptions: { stepping: target === "ms" ? 0 : null },
  };
  return {
    target,
    manualSource,
    levelFacts,
    levelFactsContent,
    mapContent,
    seriesContent,
    mapPath: "data/CCLP1.dat",
    seriesFile,
    runtimeProvenance: provenance,
  };
}
