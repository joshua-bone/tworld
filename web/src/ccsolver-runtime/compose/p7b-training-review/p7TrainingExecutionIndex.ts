import {
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { SeriesLevel } from "@content/api/series";
import type { GameRequest } from "@game-core/api/types";
import {
  buildP7TrainingBrowserReplay,
  canonicalizeP7TrainingBrowserReplay,
} from "@game-core/api/p7TrainingBrowserReplay";
import {
  P7B_MAX_REPLAY_TICKS,
  buildP7bTrainingReplayLevel,
  type P7bTrainingReplayLevelV1,
} from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  parseP7bPortableDecisionTrace,
} from "../p7b-training/portableReplayProfile";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_PROCESSOR_REVISION,
  type P7TrainingBrowserTargetV1,
} from "../p7-training-execution/p7TrainingShardProtocol";
import {
  buildP7TrainingPackProofLeaf,
  type P7TrainingPackGeneratedEvidenceSidecarsV1,
  type P7TrainingPackProofPayload,
} from "./buildP7TrainingPackProofLeaf";
import {
  attestP7TrainingPackProofIndex,
  buildP7TrainingPackProofIndex,
  type P7TrainingPackProofAttestation,
  type P7TrainingPackProofFile,
  type P7TrainingPackProofIndexInput,
  type P7TrainingPackProofIndexV1,
  type P7TrainingProofDerivedSourceV1,
  type P7TrainingProofExternalInputV1,
  type P7TrainingProofExtractorRevisionV1,
  type P7TrainingProofGeneratedKindV1,
} from "./p7TrainingPackProofIndex";
import { P7B_TRAINING_PACK_CHECKED_PARENT } from "./p7TrainingPackPaths";

export const P7_TRAINING_EXECUTION_INDEX_ARTIFACT =
  "ccsolver-p7-training-execution-index" as const;
export const P7_TRAINING_EXECUTION_INDEX_MAX_BYTES = 32 * 1024 * 1024;

const OFFICIAL_PACKS = new Set(["cclp1", "cclp4", "cclp5"]);
const SEMANTIC_GENERATED_KINDS = new Set<P7TrainingProofGeneratedKindV1>([
  "level-contract",
  "portable-decision-trace",
  "portable-profile",
  "browser-replay",
  "eligibility-evidence",
  "map-comparison-evidence",
  "lineage-evidence",
  "transform-evidence",
  "compilation-receipt",
  "certification-build-receipt",
  "segment-boundary-evidence",
  "browser-parity-receipt",
  "supporting-build-evidence",
]);
const encoder = new TextEncoder();

export interface P7TrainingExecutionBrowserTargetsV1 {
  readonly levelNumber: number;
  readonly targets: Readonly<Record<"ms" | "lynx", P7TrainingBrowserTargetV1>> | null;
}

export interface P7TrainingExecutionIndexInput {
  readonly processorRevision: typeof P7_TRAINING_PROCESSOR_REVISION;
  readonly pack: {
    readonly packId: string;
    readonly packContent: BlobReferenceV1;
  };
  readonly semanticProof: P7TrainingPackProofIndexV1;
  readonly browserTargets: readonly P7TrainingExecutionBrowserTargetsV1[];
}

export interface P7TrainingExecutionIndexV1 {
  readonly artifact: typeof P7_TRAINING_EXECUTION_INDEX_ARTIFACT;
  readonly version: 1;
  readonly processorRevision: typeof P7_TRAINING_PROCESSOR_REVISION;
  readonly pack: P7TrainingExecutionIndexInput["pack"];
  readonly semanticProof: P7TrainingPackProofIndexV1;
  readonly browserTargetsOrder: "level-number";
  readonly browserTargets: readonly P7TrainingExecutionBrowserTargetsV1[];
}

export interface P7TrainingExecutionIndexBuildResult {
  readonly index: P7TrainingExecutionIndexV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  /** Compact physical evidence files used by the semantic proof. */
  readonly evidenceOutputs: readonly P7TrainingPackProofPayload[];
}

export interface P7TrainingExecutionIndexAttestation {
  readonly proof: P7TrainingPackProofAttestation;
  readonly levelCount: number;
  readonly browserTargetLevelCount: number;
}

export interface P7TrainingExecutionProcessedLevelInput {
  readonly levelNumber: number;
  readonly browserTargets: Readonly<Record<"ms" | "lynx", P7TrainingBrowserTargetV1>>;
  readonly rawDonorBytes: readonly {
    readonly donorId: string;
    readonly bytes: Uint8Array;
  }[];
  readonly browserReplays: readonly {
    readonly variantId: string;
    readonly target: "ms" | "lynx";
    readonly replay: unknown;
  }[];
  readonly variantPayloads: readonly {
    readonly variantId: string;
    readonly kind: "portable-decision-trace";
    readonly bytes: Uint8Array;
  }[];
}

export interface P7TrainingReducedSemanticInput {
  readonly pack: {
    readonly packId: string;
    readonly title: string;
    readonly expectedLevelCount: number;
  };
  readonly inventory: readonly P7bTrainingReplayLevelV1[];
  readonly processedLevels: readonly P7TrainingExecutionProcessedLevelInput[];
  readonly portableProfilePayload: { readonly bytes: Uint8Array } | null;
  readonly proof: {
    readonly packContent: BlobReferenceV1;
    readonly corpusRevision: string;
    readonly externalInputs: readonly P7TrainingProofExternalInputV1[];
    readonly derivedSources: readonly P7TrainingProofDerivedSourceV1[];
    readonly generatedEvidence: P7TrainingPackGeneratedEvidenceSidecarsV1;
  };
  readonly sha256: Sha256Port;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function referenceKey(reference: BlobReferenceV1): string {
  return `${reference.digest}/${reference.byteLength}`;
}

function copyReference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactRecord(value, ["byteLength", "digest"], label);
  if (
    typeof record.digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(record.digest)
  ) throw new Error(`${label} digest is invalid`);
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: integer(
      record.byteLength,
      0,
      P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
      `${label} byte length`,
    ),
  };
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const expected = [...expectedKeys].sort(compareText);
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new Error(`${label} has an unsupported shape`);
  return record;
}

function integer(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is out of bounds`);
  }
  return value as number;
}

function text(value: unknown, label: string, maximumBytes = 4_096): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.includes("\r")
    || value.includes("\n")
    || encoder.encode(value).byteLength > maximumBytes
  ) throw new Error(`${label} is invalid`);
  return value;
}

function boundedText(value: unknown, label: string, maximumBytes = 4_096): string {
  if (
    typeof value !== "string"
    || value.includes("\0")
    || value.includes("\r")
    || value.includes("\n")
    || encoder.encode(value).byteLength > maximumBytes
  ) throw new Error(`${label} is invalid`);
  return value;
}

function copyBrowserTarget(
  value: unknown,
  target: "ms" | "lynx",
  expectedLevelNumber: number,
): P7TrainingBrowserTargetV1 {
  const descriptor = exactRecord(value, ["display", "request"], `${target} browser target`);
  const rawRequest = exactRecord(
    descriptor.request,
    Object.hasOwn((descriptor.request ?? {}) as object, "randomSeed")
      ? ["levelNumber", "randomSeed", "ruleset", "seriesFile"]
      : ["levelNumber", "ruleset", "seriesFile"],
    `${target} browser request`,
  );
  const levelNumber = integer(
    rawRequest.levelNumber,
    1,
    P7B_MAX_REPLAY_TICKS,
    `${target} browser request level number`,
  );
  const ruleset = target === "ms" ? "MS" as const : "Lynx" as const;
  if (levelNumber !== expectedLevelNumber || rawRequest.ruleset !== ruleset) {
    throw new Error(`${target} browser request identity drifted`);
  }
  const request: GameRequest = {
    seriesFile: text(rawRequest.seriesFile, `${target} browser series file`),
    levelNumber,
    ruleset,
    ...(rawRequest.randomSeed === undefined ? {} : {
      randomSeed: integer(
        rawRequest.randomSeed,
        0,
        0xffff_ffff,
        `${target} browser random seed`,
      ),
    }),
  };
  const display = exactRecord(
    descriptor.display,
    ["level", "mapFilename", "seriesName"],
    `${target} browser display`,
  );
  const rawLevel = exactRecord(
    display.level,
    Object.hasOwn((display.level ?? {}) as object, "hasSpecialTools")
      ? [
          "author", "bestTimeTicks", "chipsRequired", "gameplayHash", "hasSolution",
          "hasSpecialTools", "index", "levelHash", "levelSize", "name", "number",
          "password", "sgflags", "solutionSize", "timeLimitSeconds", "unsolvable",
        ]
      : [
          "author", "bestTimeTicks", "chipsRequired", "gameplayHash", "hasSolution",
          "index", "levelHash", "levelSize", "name", "number", "password", "sgflags",
          "solutionSize", "timeLimitSeconds", "unsolvable",
        ],
    `${target} browser display level`,
  );
  const displayLevelNumber = integer(
    rawLevel.number,
    1,
    P7B_MAX_REPLAY_TICKS,
    `${target} browser display level number`,
  );
  if (displayLevelNumber !== expectedLevelNumber) {
    throw new Error(`${target} browser display identity drifted`);
  }
  if (
    typeof rawLevel.hasSolution !== "boolean"
    || (Object.hasOwn(rawLevel, "hasSpecialTools") && typeof rawLevel.hasSpecialTools !== "boolean")
    || (rawLevel.unsolvable !== null && typeof rawLevel.unsolvable !== "string")
  ) throw new Error(`${target} browser display flags are invalid`);
  const level: SeriesLevel = {
    index: integer(rawLevel.index, 0, P7B_MAX_REPLAY_TICKS, `${target} level index`),
    number: displayLevelNumber,
    name: text(rawLevel.name, `${target} level name`),
    author: boundedText(rawLevel.author, `${target} level author`),
    password: boundedText(rawLevel.password, `${target} level password`, 64),
    timeLimitSeconds: integer(
      rawLevel.timeLimitSeconds,
      0,
      P7B_MAX_REPLAY_TICKS,
      `${target} level time limit`,
    ),
    chipsRequired: integer(rawLevel.chipsRequired, 0, 65_535, `${target} chips required`),
    bestTimeTicks: integer(
      rawLevel.bestTimeTicks,
      0,
      0xffff_ffff,
      `${target} best time`,
    ),
    levelSize: integer(
      rawLevel.levelSize,
      0,
      P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
      `${target} level byte size`,
    ),
    solutionSize: integer(
      rawLevel.solutionSize,
      0,
      P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
      `${target} solution byte size`,
    ),
    levelHash: boundedText(rawLevel.levelHash, `${target} level hash`),
    gameplayHash: boundedText(rawLevel.gameplayHash, `${target} gameplay hash`),
    hasSolution: rawLevel.hasSolution,
    sgflags: integer(rawLevel.sgflags, 0, 0xffff_ffff, `${target} level flags`),
    unsolvable: rawLevel.unsolvable === null
      ? null
      : boundedText(rawLevel.unsolvable, `${target} unsolvable detail`),
    ...(Object.hasOwn(rawLevel, "hasSpecialTools")
      ? { hasSpecialTools: rawLevel.hasSpecialTools as boolean }
      : {}),
  };
  return {
    request,
    display: {
      seriesName: text(display.seriesName, `${target} browser series name`),
      mapFilename: text(display.mapFilename, `${target} browser map filename`),
      level,
    },
  };
}

export function copyP7TrainingExecutionBrowserTargets(
  value: unknown,
  expectedLevelNumber: number,
): Readonly<Record<"ms" | "lynx", P7TrainingBrowserTargetV1>> {
  const targets = exactRecord(value, ["lynx", "ms"], "P7 execution browser targets");
  return {
    ms: copyBrowserTarget(targets.ms, "ms", expectedLevelNumber),
    lynx: copyBrowserTarget(targets.lynx, "lynx", expectedLevelNumber),
  };
}

function semanticProof(value: unknown): P7TrainingPackProofIndexV1 {
  const proof = buildP7TrainingPackProofIndex(value as P7TrainingPackProofIndexV1);
  if (proof.pack.producerRevision !== P7_TRAINING_PROCESSOR_REVISION) {
    throw new Error("P7 execution semantic proof processor revision drifted");
  }
  for (const blob of proof.generatedBlobs) {
    if (
      !SEMANTIC_GENERATED_KINDS.has(blob.kind)
      || blob.mediaType === "text/html"
      || (blob.locator.kind === "file" && (
        blob.locator.path.endsWith(".html")
        || blob.locator.path.endsWith("/browser.json")
        || blob.locator.path.endsWith("/pack-summary.json")
        || blob.locator.path.endsWith("/execution-index.json")
        || blob.locator.path.endsWith("/proof-index.json")
      ))
    ) throw new Error("P7 execution semantic proof contains presentation material");
  }
  return proof;
}

function copyBrowserTargetRows(
  value: unknown,
  proof: P7TrainingPackProofIndexV1,
): readonly P7TrainingExecutionBrowserTargetsV1[] {
  if (!Array.isArray(value) || value.length !== proof.levels.length) {
    throw new Error("P7 execution browser target denominator drifted");
  }
  return value.map((entry, index) => {
    const record = exactRecord(entry, ["levelNumber", "targets"], "P7 execution target row");
    const levelNumber = integer(
      record.levelNumber,
      1,
      proof.pack.expectedLevelCount,
      "P7 execution target level number",
    );
    if (levelNumber !== index + 1 || proof.levels[index]?.levelNumber !== levelNumber) {
      throw new Error("P7 execution browser targets must be contiguous by level number");
    }
    const targets = record.targets === null
      ? null
      : copyP7TrainingExecutionBrowserTargets(record.targets, levelNumber);
    if (targets === null && OFFICIAL_PACKS.has(proof.pack.packId)) {
      throw new Error("official P7 execution authority requires browser targets for all 149 levels");
    }
    return { levelNumber, targets };
  });
}

export function buildP7TrainingExecutionIndex(
  value: P7TrainingExecutionIndexInput | P7TrainingExecutionIndexV1,
): P7TrainingExecutionIndexV1 {
  const built = value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.hasOwn(value, "artifact");
  const source = exactRecord(
    value,
    built
      ? [
          "artifact", "browserTargets", "browserTargetsOrder", "processorRevision",
          "pack", "semanticProof", "version",
        ]
      : ["browserTargets", "pack", "processorRevision", "semanticProof"],
    "P7 training execution index",
  );
  if (
    source.processorRevision !== P7_TRAINING_PROCESSOR_REVISION
    || (built && (
      source.artifact !== P7_TRAINING_EXECUTION_INDEX_ARTIFACT
      || source.version !== 1
      || source.browserTargetsOrder !== "level-number"
    ))
  ) throw new Error("P7 training execution index identity or revision is unsupported");
  const proof = semanticProof(source.semanticProof);
  const rawPack = exactRecord(source.pack, ["packContent", "packId"], "P7 execution pack");
  const pack = {
    packId: text(rawPack.packId, "P7 execution pack id", 64),
    packContent: copyReference(rawPack.packContent, "P7 execution pack content"),
  };
  if (pack.packId !== proof.pack.packId) {
    throw new Error("P7 execution pack content identity drifted from its semantic proof");
  }
  if (
    OFFICIAL_PACKS.has(proof.pack.packId)
    && (
      proof.pack.expectedLevelCount !== P7_TRAINING_LEVELS_PER_PACK
      || proof.levels.length !== P7_TRAINING_LEVELS_PER_PACK
    )
  ) throw new Error("official P7 execution authority requires exactly 149 contracts");
  const browserTargets = copyBrowserTargetRows(source.browserTargets, proof);
  return {
    artifact: P7_TRAINING_EXECUTION_INDEX_ARTIFACT,
    version: 1,
    processorRevision: P7_TRAINING_PROCESSOR_REVISION,
    pack,
    semanticProof: proof,
    browserTargetsOrder: "level-number",
    browserTargets,
  };
}

export function canonicalizeP7TrainingExecutionIndex(
  value: P7TrainingExecutionIndexInput | P7TrainingExecutionIndexV1,
): CanonicalJson {
  const canonical = canonicalizeJson(
    buildP7TrainingExecutionIndex(value) as unknown as CanonicalJsonValue,
  );
  if (encoder.encode(canonical).byteLength > P7_TRAINING_EXECUTION_INDEX_MAX_BYTES) {
    throw new Error("P7 training execution index exceeds its byte bound");
  }
  return canonical;
}

export function parseP7TrainingExecutionIndex(value: string): P7TrainingExecutionIndexV1 {
  if (encoder.encode(value).byteLength > P7_TRAINING_EXECUTION_INDEX_MAX_BYTES) {
    throw new Error("P7 training execution index exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new Error("P7 training execution index is not valid JSON", { cause: error });
  }
  const index = buildP7TrainingExecutionIndex(parsed as P7TrainingExecutionIndexV1);
  if (canonicalizeP7TrainingExecutionIndex(index) !== value) {
    throw new Error("P7 training execution index is not canonical JSON");
  }
  return index;
}

function declarationKey(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function assertSubset(
  semantic: readonly unknown[],
  full: readonly unknown[],
  label: string,
): void {
  const fullKeys = new Set(full.map(declarationKey));
  const missing = semantic.find((entry) => !fullKeys.has(declarationKey(entry)));
  if (missing !== undefined) {
    throw new Error(`P7 execution ${label} declaration is absent from the full proof`);
  }
}

export function assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof(input: {
  readonly executionIndex: P7TrainingExecutionIndexV1;
  readonly fullProof: P7TrainingPackProofIndexV1;
}): void {
  const index = buildP7TrainingExecutionIndex(input.executionIndex);
  const semantic = index.semanticProof;
  const full = buildP7TrainingPackProofIndex(input.fullProof);
  if (
    semantic.pack.packId !== full.pack.packId
    || semantic.pack.expectedLevelCount !== full.pack.expectedLevelCount
    || semantic.pack.corpusRevision !== full.pack.corpusRevision
  ) throw new Error("P7 execution and full proof pack identity drifted");
  assertSubset(semantic.externalInputs, full.externalInputs, "external input");
  assertSubset(semantic.derivedSources, full.derivedSources, "derived source");
  assertSubset(semantic.generatedBlobs, full.generatedBlobs, "generated blob");
  assertSubset(semantic.evidenceSidecars, full.evidenceSidecars, "evidence sidecar");
  assertSubset(semantic.packReachableRefs, full.packReachableRefs, "pack root");
  if (semantic.levels.length !== full.levels.length || semantic.levels.some((level, index) => (
    declarationKey(level) !== declarationKey(full.levels[index])
  ))) throw new Error("P7 execution level closure drifted from the full proof");
  const semanticCount = semantic.externalInputs.length
    + semantic.derivedSources.length
    + semantic.generatedBlobs.length
    + semantic.evidenceSidecars.length;
  const fullCount = full.externalInputs.length
    + full.derivedSources.length
    + full.generatedBlobs.length
    + full.evidenceSidecars.length;
  if (fullCount <= semanticCount) {
    throw new Error("P7 training full proof must be a strict superset of execution authority");
  }
}

export function assertP7TrainingExecutionBrowserTargets(input: {
  readonly executionIndex: P7TrainingExecutionIndexV1;
  readonly levelNumber: number;
  readonly browserTargets: unknown;
}): void {
  const index = buildP7TrainingExecutionIndex(input.executionIndex);
  const row = index.browserTargets[input.levelNumber - 1];
  if (row?.levelNumber !== input.levelNumber || row.targets === null) {
    throw new Error(`P7 execution level ${input.levelNumber} has no browser targets`);
  }
  const observed = copyP7TrainingExecutionBrowserTargets(
    input.browserTargets,
    input.levelNumber,
  );
  if (
    canonicalizeJson(observed as unknown as CanonicalJsonValue)
    !== canonicalizeJson(row.targets as unknown as CanonicalJsonValue)
  ) throw new Error(`P7 execution level ${input.levelNumber} browser targets drifted`);
}

export function assertP7TrainingExecutionPackContent(input: {
  readonly executionIndex: P7TrainingExecutionIndexV1;
  readonly packId: string;
  readonly packContent: BlobReferenceV1;
}): void {
  const index = buildP7TrainingExecutionIndex(input.executionIndex);
  const expected = copyReference(input.packContent, "expected P7 reduced pack content");
  if (
    index.pack.packId !== input.packId
    || referenceKey(index.pack.packContent) !== referenceKey(expected)
  ) throw new Error("P7 execution authority reduced pack content drifted");
}

function semanticPackProofInput(full: P7TrainingPackProofIndexV1): P7TrainingPackProofIndexInput {
  const reachable = new Set<string>();
  full.levels.forEach((level) => {
    reachable.add(referenceKey(level.contract.content));
    level.reachableRefs.forEach((reference) => reachable.add(referenceKey(reference)));
  });
  const externalByReference = new Map(full.externalInputs.map((entry) => [
    referenceKey(entry.content),
    entry,
  ]));
  const semanticPackRoots = full.packReachableRefs.filter((reference) => (
    externalByReference.has(referenceKey(reference))
  ));
  semanticPackRoots.forEach((reference) => reachable.add(referenceKey(reference)));
  const generatedBlobs = full.generatedBlobs.filter(({ content }) => (
    reachable.has(referenceKey(content))
  ));
  if (generatedBlobs.some(({ kind }) => !SEMANTIC_GENERATED_KINDS.has(kind))) {
    throw new Error("P7 level contract closure reaches presentation material");
  }
  const derivedSources = full.derivedSources.filter(({ content }) => (
    reachable.has(referenceKey(content))
  ));
  const externalInputs = full.externalInputs.filter(({ content }) => (
    reachable.has(referenceKey(content))
  ));
  const generatedKeys = new Set(generatedBlobs.map(({ content }) => referenceKey(content)));
  const evidenceSidecars = full.evidenceSidecars.filter((sidecar) => full.generatedBlobs.some(
    ({ locator, content }) => locator.kind === "evidence-sidecar-entry"
      && locator.indexPath === sidecar.index.path
      && generatedKeys.has(referenceKey(content)),
  ));
  for (const sidecar of evidenceSidecars) {
    const unselected = full.generatedBlobs.find(({ locator, content }) => (
      locator.kind === "evidence-sidecar-entry"
      && locator.indexPath === sidecar.index.path
      && !generatedKeys.has(referenceKey(content))
    ));
    if (unselected !== undefined) {
      throw new Error("P7 execution semantic evidence sidecar contains an unselected declaration");
    }
  }
  return {
    pack: {
      ...full.pack,
      producerRevision: P7_TRAINING_PROCESSOR_REVISION,
    },
    externalInputs,
    derivedSources,
    generatedBlobs,
    evidenceSidecars,
    levels: full.levels,
    packReachableRefs: semanticPackRoots,
  };
}

export function projectP7TrainingExecutionIndexFromPackProof(input: {
  readonly fullProof: P7TrainingPackProofIndexV1;
  readonly packContent: BlobReferenceV1;
  readonly browserTargets: readonly P7TrainingExecutionBrowserTargetsV1[];
}): P7TrainingExecutionIndexV1 {
  const full = buildP7TrainingPackProofIndex(input.fullProof);
  return buildP7TrainingExecutionIndex({
    processorRevision: P7_TRAINING_PROCESSOR_REVISION,
    pack: { packId: full.pack.packId, packContent: input.packContent },
    semanticProof: buildP7TrainingPackProofIndex(semanticPackProofInput(
      full,
    )),
    browserTargets: input.browserTargets,
  });
}

function validateGenericNullTargets(input: {
  readonly index: P7TrainingExecutionIndexV1;
  readonly contracts: readonly P7bTrainingReplayLevelV1[];
}): void {
  if (OFFICIAL_PACKS.has(input.index.semanticProof.pack.packId)) return;
  for (const row of input.index.browserTargets) {
    const contract = input.contracts[row.levelNumber - 1];
    if (
      row.targets === null
      && (contract === undefined || contract.rawDonors.length > 0 || contract.variants.length > 0)
    ) {
      throw new Error(
        `P7 execution level ${row.levelNumber} may omit browser targets only without executable material`,
      );
    }
  }
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function levelLabel(levelNumber: number): string {
  return String(levelNumber).padStart(3, "0");
}

/** Builds the complete graph-free authority directly from reduced semantic material. */
export async function buildP7TrainingExecutionIndexFromReducedSemanticInput(
  input: P7TrainingReducedSemanticInput,
): Promise<P7TrainingExecutionIndexBuildResult> {
  const levels = input.inventory.map(buildP7bTrainingReplayLevel)
    .sort((left, right) => left.source.levelNumber - right.source.levelNumber);
  if (
    levels.length !== input.pack.expectedLevelCount
    || levels.some((level, index) => (
      level.source.packId !== input.pack.packId || level.source.levelNumber !== index + 1
    ))
  ) throw new Error("P7 reduced semantic inventory denominator drifted");
  const processedByLevel = new Map<number, P7TrainingExecutionProcessedLevelInput>();
  for (const processed of input.processedLevels) {
    if (
      !Number.isSafeInteger(processed.levelNumber)
      || processed.levelNumber < 1
      || processed.levelNumber > input.pack.expectedLevelCount
      || processedByLevel.has(processed.levelNumber)
    ) throw new Error("P7 reduced semantic processed-level identity drifted");
    processedByLevel.set(processed.levelNumber, processed);
  }
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${input.pack.packId}`;
  const semanticOutputs: P7TrainingPackProofPayload[] = [];
  const browserTargets: P7TrainingExecutionBrowserTargetsV1[] = [];
  const hasPortable = levels.some((level) => level.variants.some(({ kind }) => kind === "portable"));
  if (hasPortable) {
    if (input.portableProfilePayload === null) {
      throw new Error("P7 reduced semantic portable profile is missing");
    }
    let profileText: string;
    let profileValue: unknown;
    try {
      profileText = new TextDecoder("utf-8", { fatal: true })
        .decode(input.portableProfilePayload.bytes);
      profileValue = JSON.parse(profileText) as unknown;
    } catch (error: unknown) {
      throw new Error("P7 reduced semantic portable profile is invalid", { cause: error });
    }
    if (
      canonicalizeJson(profileValue as CanonicalJsonValue) !== profileText
      || canonicalizeJson(profileValue as CanonicalJsonValue)
        !== canonicalizeJson(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1 as unknown as CanonicalJsonValue)
    ) throw new Error("P7 reduced semantic portable profile drifted");
    semanticOutputs.push({
      path: `${root}/profiles/${P7B_HYBRIDCC_CANDIDATE_PROFILE_ID}.json`,
      mediaType: "application/json",
      content: new Uint8Array(input.portableProfilePayload.bytes),
    });
  } else if (input.portableProfilePayload !== null) {
    throw new Error("P7 reduced semantic pack without portable variants has a profile");
  }
  for (const level of levels) {
    const levelNumber = level.source.levelNumber;
    const levelRoot = `${root}/levels/${levelLabel(levelNumber)}`;
    semanticOutputs.push({
      path: `${levelRoot}/contract.json`,
      mediaType: "application/json",
      content: encoder.encode(canonicalizeJson(level as unknown as CanonicalJsonValue)),
    });
    const processed = processedByLevel.get(levelNumber);
    browserTargets.push({
      levelNumber,
      targets: processed === undefined
        ? null
        : copyP7TrainingExecutionBrowserTargets(processed.browserTargets, levelNumber),
    });
    if (processed === undefined) continue;
    const rawById = new Map(processed.rawDonorBytes.map((entry) => [entry.donorId, entry]));
    if (rawById.size !== processed.rawDonorBytes.length || rawById.size !== level.rawDonors.length) {
      throw new Error(`P7 reduced semantic level ${levelNumber} raw donor set drifted`);
    }
    for (const [index, donor] of level.rawDonors.entries()) {
      const supplied = rawById.get(donor.donorId);
      if (supplied === undefined) {
        throw new Error(`P7 reduced semantic level ${levelNumber} raw donor is missing`);
      }
      const content = await referenceSourceBytes(supplied.bytes, input.sha256);
      if (!sameReference(content, donor.replayContent)) {
        throw new Error(`P7 reduced semantic level ${levelNumber} raw donor content drifted`);
      }
      semanticOutputs.push({
        path: `${levelRoot}/raw/${String(index).padStart(2, "0")}-${donor.target}.tws-entry.bin`,
        mediaType: "application/octet-stream",
        content: new Uint8Array(supplied.bytes),
      });
    }
    for (const asset of processed.browserReplays) {
      const variantIndex = level.variants.findIndex(({ variantId }) => variantId === asset.variantId);
      if (variantIndex < 0) {
        throw new Error(`P7 reduced semantic level ${levelNumber} browser replay variant drifted`);
      }
      const replay = buildP7TrainingBrowserReplay(asset.replay);
      if (replay.variantId !== asset.variantId || replay.target !== asset.target) {
        throw new Error(`P7 reduced semantic level ${levelNumber} browser replay identity drifted`);
      }
      semanticOutputs.push({
        path: `${levelRoot}/replays/${String(variantIndex).padStart(2, "0")}-${asset.target}.json`,
        mediaType: "application/json",
        content: encoder.encode(canonicalizeP7TrainingBrowserReplay(replay)),
      });
    }
    for (const payload of processed.variantPayloads) {
      const variantIndex = level.variants.findIndex(({ variantId, kind }) => (
        variantId === payload.variantId && kind === "portable"
      ));
      if (variantIndex < 0 || payload.kind !== "portable-decision-trace") {
        throw new Error(`P7 reduced semantic level ${levelNumber} portable payload identity drifted`);
      }
      parseP7bPortableDecisionTrace(new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes));
      semanticOutputs.push({
        path: `${levelRoot}/portable/${String(variantIndex).padStart(2, "0")}-hybrid-candidate-10hz.json`,
        mediaType: "application/json",
        content: new Uint8Array(payload.bytes),
      });
    }
  }
  return buildP7TrainingExecutionIndexFromSemanticInputs({
    root,
    pack: {
      packId: input.pack.packId,
      expectedLevelCount: input.pack.expectedLevelCount,
      corpusRevision: input.proof.corpusRevision,
      packContent: input.proof.packContent,
    },
    levels,
    browserTargets,
    semanticOutputs,
    externalInputs: input.proof.externalInputs,
    derivedSources: input.proof.derivedSources,
    generatedEvidence: input.proof.generatedEvidence,
    sha256: input.sha256,
  });
}

export async function buildP7TrainingExecutionIndexFromSemanticInputs(input: {
  readonly root: string;
  readonly pack: {
    readonly packId: string;
    readonly expectedLevelCount: number;
    readonly corpusRevision: string;
    readonly packContent: BlobReferenceV1;
  };
  readonly levels: readonly P7bTrainingReplayLevelV1[];
  readonly browserTargets: readonly P7TrainingExecutionBrowserTargetsV1[];
  readonly semanticOutputs: readonly P7TrainingPackProofPayload[];
  readonly externalInputs: readonly P7TrainingProofExternalInputV1[];
  readonly derivedSources: readonly P7TrainingProofDerivedSourceV1[];
  readonly generatedEvidence: P7TrainingPackGeneratedEvidenceSidecarsV1;
  readonly sha256: Sha256Port;
}): Promise<P7TrainingExecutionIndexBuildResult> {
  const levels = input.levels.map(buildP7bTrainingReplayLevel);
  const proofLeaf = await buildP7TrainingPackProofLeaf({
    root: input.root,
    pack: {
      packId: input.pack.packId,
      expectedLevelCount: input.pack.expectedLevelCount,
      corpusRevision: input.pack.corpusRevision,
      producerRevision: P7_TRAINING_PROCESSOR_REVISION,
    },
    levels,
    baseOutputs: input.semanticOutputs,
    externalInputs: input.externalInputs,
    derivedSources: input.derivedSources,
    generatedEvidence: input.generatedEvidence,
    sha256: input.sha256,
  });
  const index = buildP7TrainingExecutionIndex({
    processorRevision: P7_TRAINING_PROCESSOR_REVISION,
    pack: { packId: input.pack.packId, packContent: input.pack.packContent },
    semanticProof: proofLeaf.proofIndex,
    browserTargets: input.browserTargets,
  });
  validateGenericNullTargets({ index, contracts: levels });
  const canonicalJson = canonicalizeP7TrainingExecutionIndex(index);
  return {
    index,
    canonicalJson,
    content: await referenceCanonicalJson(canonicalJson, input.sha256),
    evidenceOutputs: proofLeaf.evidenceOutputs,
  };
}

export async function attestP7TrainingExecutionIndex(input: {
  readonly index: P7TrainingExecutionIndexV1;
  readonly files: readonly P7TrainingPackProofFile[];
  readonly sha256: Sha256Port;
  readonly extractEntryOrdinal?: (input: {
    readonly sourcePath: string;
    readonly sourceBytes: Uint8Array;
    readonly entryOrdinal: number;
    readonly extractorRevision: P7TrainingProofExtractorRevisionV1;
  }) => Promise<Uint8Array> | Uint8Array;
}): Promise<P7TrainingExecutionIndexAttestation> {
  const index = buildP7TrainingExecutionIndex(input.index);
  const proof = await attestP7TrainingPackProofIndex({
    index: index.semanticProof,
    files: input.files,
    sha256: input.sha256,
    extractEntryOrdinal: input.extractEntryOrdinal,
  });
  const fileByPath = new Map(input.files.map(({ path, bytes }) => [path, bytes]));
  const contracts = index.semanticProof.levels.map((level) => {
    const bytes = fileByPath.get(level.contract.path);
    if (bytes === undefined) throw new Error(`P7 execution contract bytes are missing: ${level.contract.path}`);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
    } catch (error: unknown) {
      throw new Error(`P7 execution contract is invalid: ${level.contract.path}`, { cause: error });
    }
    return buildP7bTrainingReplayLevel(value);
  });
  validateGenericNullTargets({ index, contracts });
  return {
    proof,
    levelCount: index.semanticProof.levels.length,
    browserTargetLevelCount: index.browserTargets.filter(({ targets }) => targets !== null).length,
  };
}
