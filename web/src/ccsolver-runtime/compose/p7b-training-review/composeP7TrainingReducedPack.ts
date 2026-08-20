import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  parseP7TrainingBrowserReplay,
} from "@game-core/api/p7TrainingBrowserReplay";
import {
  buildP7TrainingPackGeneratedEvidence,
} from "../p7-training-execution/p7TrainingLevelProcessor";
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_PROCESSOR_REVISION,
  P7_TRAINING_SHARD_LIMITS,
  buildP7TrainingShardPlan,
  type P7TrainingInventoryLoader,
  type P7TrainingReducedPack,
  type P7TrainingVerifyPersistedEvidence,
} from "../p7-training-execution/p7TrainingShardProtocol";
import {
  materializeP7GeneratedEvidenceSidecar,
} from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedEvidenceBundleV1,
  type P7GeneratedEvidenceBlobV1,
} from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
} from "../p7b-training/portableReplayProfile";
import {
  loadCheckedTrainingCorpusInventory,
} from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import {
  materializeDetachedReplayBytes,
  type P7TrainingCorpusInventory,
  type P7TrainingDonorCandidate,
  type P7TrainingLevelInventory,
  type P7TrainingPackInventory,
  type P7TrainingVerifiedInput,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7B_TRAINING_PACK_CHECKED_PARENT,
  buildP7bTrainingPackOutputs,
  type P7bTrainingPackBuildInput,
  type P7bTrainingPackBuildResult,
} from "./buildP7bTrainingPackOutputs";
import type {
  P7TrainingPackProofFile,
  P7TrainingProofDerivedSourceV1,
  P7TrainingProofExternalInputKindV1,
  P7TrainingProofExternalInputV1,
} from "./p7TrainingPackProofIndex";

export const P7_TRAINING_REDUCED_PACK_COMPOSER_REVISION =
  "p7-training-reduced-pack-composer-v1" as const;

const CORPUS_MANIFEST_PATH = "ccsolver/corpus/manifest.v1.json";
const CORPUS_VALIDITY_PATH = "ccsolver/corpus/p1b-validity-report.v1.json";
const encoder = new TextEncoder();

type SharedPlayerInput = P7bTrainingPackBuildInput["sharedPlayer"];

export interface ComposeP7TrainingReducedPackInput {
  readonly repositoryRoot: string;
  readonly reducedPack: P7TrainingReducedPack;
  readonly sharedPlayer: SharedPlayerInput;
  readonly sha256: Sha256Port;
  readonly loadEvidence: P7TrainingVerifyPersistedEvidence;
  readonly loadInventory?: P7TrainingInventoryLoader;
  readonly readExternalBytes?: (path: string) => Promise<Uint8Array>;
}

export interface P7TrainingReducedPackComposition {
  readonly buildInput: P7bTrainingPackBuildInput;
  readonly proofSources: {
    readonly externalFiles: readonly P7TrainingPackProofFile[];
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function referenceKey(value: BlobReferenceV1): string {
  return `${value.digest}/${value.byteLength}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeRepositoryPath(path: string): string {
  if (
    path.length === 0
    || path.startsWith("/")
    || path.includes("\\")
    || path.includes("\0")
    || path.includes("\r")
    || path.includes("\n")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`P7 reduced-pack source path is unsafe: ${path}`);
  return path;
}

function verifiedContent(input: P7TrainingVerifiedInput): BlobReferenceV1 {
  if (!/^[0-9a-f]{64}$/u.test(input.sha256) || !Number.isSafeInteger(input.byteLength)) {
    throw new Error(`P7 checked input content is invalid: ${input.path}`);
  }
  return {
    digest: `sha256:${input.sha256}`,
    byteLength: input.byteLength,
  };
}

function sourceMemberContent(
  row: Pick<P7TrainingLevelInventory, "occurrenceId" | "levelNumber" | "source">,
): {
  readonly content: BlobReferenceV1;
  readonly byteOffset: number;
  readonly byteLength: number;
} {
  const member = row.source.sourceMembers.find(({ ordinal }) => ordinal === 0);
  if (
    member === undefined
    || member.sourcePath !== row.source.mapPath
    || member.sourceLevelNumber !== row.levelNumber
    || !Number.isSafeInteger(member.byteOffset)
    || member.byteOffset < 0
    || !Number.isSafeInteger(member.byteLength)
    || member.byteLength < 1
    || !/^[0-9a-f]{64}$/u.test(member.sha256)
  ) throw new Error(`${row.occurrenceId} exact source member is invalid`);
  return {
    content: { digest: `sha256:${member.sha256}`, byteLength: member.byteLength },
    byteOffset: member.byteOffset,
    byteLength: member.byteLength,
  };
}

function candidateForDonor(
  row: P7TrainingLevelInventory,
  donor: P7TrainingReducedPack["levels"][number]["processing"]["trainingReplayLevel"]["rawDonors"][number],
): P7TrainingDonorCandidate {
  const matches = row.targets.flatMap(({ donorCandidates }) => donorCandidates)
    .filter(({ candidateId }) => candidateId === donor.donorId);
  if (matches.length !== 1) {
    throw new Error(`${row.occurrenceId} raw donor ${donor.donorId} is not uniquely checked`);
  }
  const candidate = matches[0]!;
  const candidateSource = sourceMemberContent({
    occurrenceId: candidate.source.occurrenceId,
    levelNumber: candidate.source.levelNumber,
    source: {
      mapPath: candidate.source.mapPath,
      sourceMembers: candidate.source.sourceMembers,
    } as P7TrainingLevelInventory["source"],
  });
  if (
    candidate.target !== donor.target
    || candidate.source.origin !== donor.origin
    || candidate.source.packId !== donor.sourcePackId
    || candidate.source.levelNumber !== donor.sourceLevelNumber
    || candidate.source.normalizedGameplaySha256 !== donor.sourceNormalizedGameplaySha256
    || candidate.mapRelationship !== donor.mapRelationship
    || !sameReference(candidate.replay.content, donor.replayContent)
    || !sameReference(candidateSource.content, donor.sourceLevelContent)
  ) throw new Error(`${row.occurrenceId} raw donor ${donor.donorId} provenance drifted`);
  return candidate;
}

function assertCanonicalProcessedOrder(
  row: P7TrainingLevelInventory,
  level: P7TrainingReducedPack["levels"][number]["processing"]["trainingReplayLevel"],
): void {
  const expectedDonorIds = row.targets.flatMap(({ donorCandidates }) => (
    donorCandidates[0] === undefined ? [] : [donorCandidates[0].candidateId]
  ));
  const actualDonorIds = level.rawDonors.map(({ donorId }) => donorId);
  if (
    actualDonorIds.length !== expectedDonorIds.length
    || actualDonorIds.some((donorId, index) => donorId !== expectedDonorIds[index])
  ) throw new Error(`${row.occurrenceId} raw donor order drifted from checked target order`);
  const variantRank = new Map([
    ["raw-ms", 0],
    ["raw-lynx", 1],
    ["portable", 2],
  ] as const);
  let previousRank = -1;
  for (const variant of level.variants) {
    const rank = variantRank.get(variant.variantId as "raw-ms" | "raw-lynx" | "portable");
    if (rank === undefined || rank <= previousRank) {
      throw new Error(`${row.occurrenceId} replay variant order is not canonical`);
    }
    if (
      (variant.kind === "raw" && !variant.variantId.startsWith("raw-"))
      || (variant.kind === "portable" && variant.variantId !== "portable")
    ) throw new Error(`${row.occurrenceId} replay variant identity is not canonical`);
    previousRank = rank;
  }
}

function retainedRawPath(
  packId: string,
  levelNumber: number,
  donorIndex: number,
  target: "ms" | "lynx",
): string {
  return [
    P7B_TRAINING_PACK_CHECKED_PARENT,
    packId,
    "levels",
    String(levelNumber).padStart(3, "0"),
    "raw",
    `${String(donorIndex).padStart(2, "0")}-${target}.tws-entry.bin`,
  ].join("/");
}

function sameDerivedSource(
  left: P7TrainingProofDerivedSourceV1,
  right: P7TrainingProofDerivedSourceV1,
): boolean {
  return canonicalizeJson(left as unknown as CanonicalJsonValue)
    === canonicalizeJson(right as unknown as CanonicalJsonValue);
}

async function loadLevelEvidence(input: {
  readonly repositoryRoot: string;
  readonly level: P7TrainingReducedPack["levels"][number];
  readonly sha256: Sha256Port;
  readonly loadEvidence: P7TrainingVerifyPersistedEvidence;
}) {
  const { evidence } = input.level.processing;
  const loaded = await input.loadEvidence({
    occurrenceId: input.level.occurrenceId,
    index: evidence.index,
    indexContent: evidence.indexContent,
    sha256: input.sha256,
  });
  const bundle = await materializeP7GeneratedEvidenceSidecar({
    index: evidence.index,
    indexCanonicalJson: loaded.indexCanonicalJson,
    indexContent: evidence.indexContent,
    payload: loaded.payload,
    limits: {
      maximumBlobCount: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel,
      maximumBlobBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes,
      maximumTotalBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
    },
    sha256: input.sha256,
  });
  if (!bundle.scopeId.startsWith(`${input.level.occurrenceId}/`)) {
    throw new Error(`${input.level.occurrenceId} evidence is not occurrence-local`);
  }
  return bundle;
}

function requiredPack(
  inventory: P7TrainingCorpusInventory,
  reduced: P7TrainingReducedPack,
): P7TrainingPackInventory {
  if (reduced.levels.length !== P7_TRAINING_LEVELS_PER_PACK) {
    throw new Error("P7 reduced pack must contain exactly 149 ordered official levels");
  }
  const pack = inventory.packs.find(({ packId }) => packId === reduced.packId);
  if (pack === undefined || pack.levels.length !== P7_TRAINING_LEVELS_PER_PACK) {
    throw new Error(`${reduced.packId} checked inventory must contain exactly 149 levels`);
  }
  for (const [index, row] of pack.levels.entries()) {
    const reducedLevel = reduced.levels[index];
    if (
      reducedLevel === undefined
      || row.levelNumber !== index + 1
      || reducedLevel.levelNumber !== row.levelNumber
      || reducedLevel.occurrenceId !== row.occurrenceId
      || reducedLevel.caseId !== row.caseId
    ) throw new Error(`${reduced.packId} reduced level ${index + 1} drifted from checked inventory`);
  }
  return pack;
}

export async function composeP7TrainingReducedPack(
  input: ComposeP7TrainingReducedPackInput,
): Promise<P7TrainingReducedPackComposition> {
  const loadInventory = input.loadInventory ?? loadCheckedTrainingCorpusInventory;
  const inventory = await loadInventory(input.repositoryRoot, input.sha256);
  const pack = requiredPack(inventory, input.reducedPack);
  const plan = await buildP7TrainingShardPlan({
    inventory,
    packId: input.reducedPack.packId,
    sha256: input.sha256,
  });
  if (!sameReference(plan.packContent, input.reducedPack.packContent)) {
    throw new Error(`${pack.packId} reduced pack content drifted from checked inventory`);
  }
  const readExternalBytes = input.readExternalBytes ?? (async (path: string) => (
    new Uint8Array(await readFile(resolve(input.repositoryRoot, safeRepositoryPath(path))))
  ));
  const externalSnapshots = new Map<string, Uint8Array>();
  const snapshotExternal = async (pathValue: string): Promise<Uint8Array> => {
    const path = safeRepositoryPath(pathValue);
    const existing = externalSnapshots.get(path);
    if (existing !== undefined) return new Uint8Array(existing);
    const bytes = new Uint8Array(await readExternalBytes(path));
    externalSnapshots.set(path, bytes);
    return new Uint8Array(bytes);
  };

  const verifiedByPath = new Map(inventory.verifiedInputs.map((entry) => [entry.path, entry]));
  const externalByPath = new Map<string, P7TrainingProofExternalInputV1>();
  const derivedByContent = new Map<string, P7TrainingProofDerivedSourceV1>();
  const addExternal = (
    pathValue: string,
    kind: P7TrainingProofExternalInputKindV1,
    expected?: BlobReferenceV1,
  ): BlobReferenceV1 => {
    const path = safeRepositoryPath(pathValue);
    const verified = verifiedByPath.get(path);
    if (verified === undefined) throw new Error(`${pack.packId} lacks checked input ${path}`);
    const content = verifiedContent(verified);
    if (expected !== undefined && !sameReference(content, expected)) {
      throw new Error(`${pack.packId} checked input content drifted: ${path}`);
    }
    const previous = externalByPath.get(path);
    const declaration = { path, kind, content };
    if (
      previous !== undefined
      && (previous.kind !== kind || !sameReference(previous.content, content))
    ) throw new Error(`${pack.packId} checked input has conflicting roles: ${path}`);
    externalByPath.set(path, declaration);
    return content;
  };
  const addDerived = (declaration: P7TrainingProofDerivedSourceV1) => {
    const key = referenceKey(declaration.content);
    const previous = derivedByContent.get(key);
    if (previous !== undefined && !sameDerivedSource(previous, declaration)) {
      throw new Error(`${pack.packId} derived content has ambiguous provenance: ${key}`);
    }
    derivedByContent.set(key, declaration);
  };

  addExternal(pack.mapPath, "official-map", pack.levels[0]!.source.containerContent);
  for (const target of pack.levels[0]!.targets) {
    addExternal(
      target.execution.seriesConfigPath,
      "official-series-config",
      target.execution.seriesConfigContent,
    );
  }

  const inventoryLevels = [];
  const processedLevels: P7bTrainingPackBuildInput["processedLevels"] = [];
  const rawLevelEvidence: {
    readonly occurrenceId: string;
    readonly levelNumber: number;
    readonly bundle: P7GeneratedEvidenceBundleV1;
  }[] = [];
  let hasPortableVariant = false;
  const profileJson = canonicalizeJson(
    P7B_HYBRIDCC_CANDIDATE_PROFILE_V1 as unknown as CanonicalJsonValue,
  );
  const profileBytes = encoder.encode(profileJson);
  const profileContent = await referenceSourceBytes(profileBytes, input.sha256);

  for (const [index, row] of pack.levels.entries()) {
    const reducedLevel = input.reducedPack.levels[index]!;
    const level = reducedLevel.processing.trainingReplayLevel;
    if (
      level.source.packId !== pack.packId
      || level.source.levelNumber !== row.levelNumber
      || level.source.title !== row.title
      || level.source.normalizedGameplaySha256 !== row.source.normalizedGameplaySha256
    ) throw new Error(`${row.occurrenceId} reduced contract identity drifted`);
    assertCanonicalProcessedOrder(row, level);
    const officialSource = sourceMemberContent(row);
    if (!sameReference(officialSource.content, level.source.levelContent)) {
      throw new Error(`${row.occurrenceId} reduced contract source bytes drifted`);
    }
    addDerived({
      kind: "official-level-source",
      content: officialSource.content,
      sourceContent: addExternal(row.source.mapPath, "official-map", row.source.containerContent),
      sourcePath: row.source.mapPath,
      locator: {
        kind: "byte-range",
        byteOffset: officialSource.byteOffset,
        byteLength: officialSource.byteLength,
      },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber: row.levelNumber,
      variantId: null,
      target: null,
    });

    const rawDonorBytes = [];
    for (const [donorIndex, donor] of level.rawDonors.entries()) {
      const candidate = candidateForDonor(row, donor);
      const sourceKind = candidate.source.origin === "official-pack"
        ? "official" as const
        : "voting" as const;
      const sourceMapContent = addExternal(
        candidate.source.mapPath,
        `${sourceKind}-map`,
        candidate.source.mapContent,
      );
      addExternal(
        candidate.source.seriesConfigPath,
        `${sourceKind}-series-config`,
        candidate.source.seriesConfigContent,
      );
      const replayFileContent = addExternal(
        candidate.source.replaySourcePath,
        `${sourceKind}-replay-container`,
        candidate.source.replayFileContent,
      );
      if (candidate.source.origin === "voting-pack") {
        const votingSource = sourceMemberContent({
          occurrenceId: candidate.source.occurrenceId,
          levelNumber: candidate.source.levelNumber,
          source: {
            mapPath: candidate.source.mapPath,
            sourceMembers: candidate.source.sourceMembers,
          } as P7TrainingLevelInventory["source"],
        });
        addDerived({
          kind: "voting-candidate-level-source",
          content: votingSource.content,
          sourceContent: sourceMapContent,
          sourcePath: candidate.source.mapPath,
          locator: {
            kind: "byte-range",
            byteOffset: votingSource.byteOffset,
            byteLength: votingSource.byteLength,
          },
          extractorRevision: "dat-level-byte-range-v1",
          retainedPath: null,
          levelNumber: row.levelNumber,
          variantId: null,
          target: null,
        });
      }
      addDerived({
        kind: "donor-replay-entry",
        content: donor.replayContent,
        sourceContent: replayFileContent,
        sourcePath: candidate.source.replaySourcePath,
        locator: {
          kind: "entry-ordinal",
          entryOrdinal: candidate.source.replayEntryOrdinal,
        },
        extractorRevision: "tws-solution-entry-v1",
        retainedPath: retainedRawPath(pack.packId, row.levelNumber, donorIndex, donor.target),
        levelNumber: row.levelNumber,
        variantId: null,
        target: donor.target,
      });
      rawDonorBytes.push({
        donorId: donor.donorId,
        bytes: materializeDetachedReplayBytes(candidate.replay),
      });
    }

    const browserReplays = reducedLevel.processing.browserReplays.map((asset) => ({
      variantId: asset.variantId,
      target: asset.target,
      replay: parseP7TrainingBrowserReplay(asset.canonicalJson),
    }));
    const variantPayloads = reducedLevel.processing.portableDecisionTraces.map((trace) => ({
      variantId: level.variants.find((variant) => (
        variant.kind === "portable" && sameReference(variant.replayContent, trace.content)
      ))?.variantId ?? (() => {
        throw new Error(`${row.occurrenceId} portable trace lacks its exact variant`);
      })(),
      kind: "portable-decision-trace" as const,
      bytes: encoder.encode(trace.canonicalJson),
    }));
    const portableVariants = level.variants.filter(({ kind }) => kind === "portable");
    if (portableVariants.length > 0) {
      hasPortableVariant = true;
      for (const variant of portableVariants) {
        if (
          variant.portableProfile === null
          || !sameReference(variant.portableProfile.profileContent, profileContent)
        ) throw new Error(`${row.occurrenceId} portable profile binding drifted`);
      }
    }
    const evidence = await loadLevelEvidence({
      repositoryRoot: input.repositoryRoot,
      level: reducedLevel,
      sha256: input.sha256,
      loadEvidence: input.loadEvidence,
    });
    if (evidence.blobs.some(({ content }) => sameReference(content, profileContent))) {
      throw new Error(`${row.occurrenceId} occurrence sidecar duplicates the pack profile`);
    }
    rawLevelEvidence.push({
      occurrenceId: row.occurrenceId,
      levelNumber: row.levelNumber,
      bundle: evidence,
    });
    inventoryLevels.push(level);
    processedLevels.push({
      levelNumber: row.levelNumber,
      browserTargets: structuredClone(reducedLevel.processing.browserTargets),
      rawDonorBytes,
      browserReplays,
      variantPayloads,
    });
  }

  for (const [path, kind] of [
    [CORPUS_MANIFEST_PATH, "corpus-manifest"],
    [CORPUS_VALIDITY_PATH, "corpus-validity"],
  ] as const) {
    const bytes = await snapshotExternal(path);
    const content = await referenceSourceBytes(bytes, input.sha256);
    externalByPath.set(path, { path, kind, content });
  }

  const packEvidence = await buildP7TrainingPackGeneratedEvidence(pack.packId, input.sha256);
  if (
    hasPortableVariant
    && !sameReference(packEvidence.profileContent, profileContent)
  ) throw new Error(`${pack.packId} pack profile content drifted`);
  const packEvidenceStore = new P7GeneratedEvidenceStore({
    scopeId: `${pack.packId}/pack`,
    sha256: input.sha256,
  });
  if (hasPortableVariant) {
    await packEvidenceStore.importBundle(packEvidence.generatedEvidence);
  }
  const evidenceUseCount = new Map<string, number>();
  const evidenceByContent = new Map<string, P7GeneratedEvidenceBlobV1>();
  for (const { bundle } of rawLevelEvidence) {
    for (const blob of bundle.blobs) {
      const key = referenceKey(blob.content);
      evidenceUseCount.set(key, (evidenceUseCount.get(key) ?? 0) + 1);
      const previous = evidenceByContent.get(key);
      if (
        previous !== undefined
        && (
          previous.mediaType !== blob.mediaType
          || previous.bytes.byteLength !== blob.bytes.byteLength
          || previous.bytes.some((value, index) => value !== blob.bytes[index])
        )
      ) throw new Error(`${pack.packId} shared evidence content conflicts: ${key}`);
      evidenceByContent.set(key, blob);
    }
  }
  const sharedEvidenceKeys = new Set([...evidenceUseCount].flatMap(([key, count]) => (
    count > 1 ? [key] : []
  )));
  if (sharedEvidenceKeys.size > 0) {
    const sharedBlobs = [...sharedEvidenceKeys].sort(compareText)
      .map((key) => evidenceByContent.get(key)!);
    await packEvidenceStore.importBundle({
      artifact: "ccsolver-p7-generated-evidence-bundle",
      version: 1,
      scopeId: `${pack.packId}/shared-level-evidence`,
      limits: { ...rawLevelEvidence[0]!.bundle.limits },
      totals: {
        blobCount: sharedBlobs.length,
        byteLength: sharedBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: sharedBlobs,
    });
  }
  const generatedLevelEvidence = rawLevelEvidence.map(({ occurrenceId, levelNumber, bundle }) => {
    const blobs = bundle.blobs.filter(({ content }) => !sharedEvidenceKeys.has(referenceKey(content)));
    return {
      occurrenceId,
      levelNumber,
      bundle: {
        ...bundle,
        totals: {
          blobCount: blobs.length,
          byteLength: blobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
        },
        blobs,
      },
    };
  });

  const externalInputs = [...externalByPath.values()].sort((left, right) => (
    compareText(left.path, right.path)
  ));
  const externalFiles = [];
  for (const declaration of externalInputs) {
    const bytes = await snapshotExternal(declaration.path);
    if (!sameReference(await referenceSourceBytes(bytes, input.sha256), declaration.content)) {
      throw new Error(`${pack.packId} proof-source snapshot drifted: ${declaration.path}`);
    }
    externalFiles.push({ path: declaration.path, bytes });
  }
  const buildInput: P7bTrainingPackBuildInput = {
    pack: {
      packId: pack.packId,
      title: pack.displayName,
      expectedLevelCount: P7_TRAINING_LEVELS_PER_PACK,
    },
    inventory: inventoryLevels,
    processedLevels,
    sharedPlayer: input.sharedPlayer,
    portableProfilePayload: hasPortableVariant ? { bytes: profileBytes } : null,
    proof: {
      corpusRevision: inventory.corpusRevision,
      producerRevision: `${P7_TRAINING_PROCESSOR_REVISION}+${P7_TRAINING_REDUCED_PACK_COMPOSER_REVISION}`,
      externalInputs,
      derivedSources: [...derivedByContent.values()].sort((left, right) => (
        compareText(referenceKey(left.content), referenceKey(right.content))
      )),
      generatedEvidence: {
        pack: packEvidenceStore.bundle(),
        levels: generatedLevelEvidence,
      },
    },
    sha256: input.sha256,
  };
  return { buildInput, proofSources: { externalFiles } };
}

export async function composeP7TrainingReducedPackBuildInput(
  input: ComposeP7TrainingReducedPackInput,
): Promise<P7bTrainingPackBuildInput> {
  return (await composeP7TrainingReducedPack(input)).buildInput;
}

export async function buildP7TrainingReducedPackOutputs(
  input: ComposeP7TrainingReducedPackInput,
): Promise<P7bTrainingPackBuildResult> {
  return buildP7bTrainingPackOutputs(
    await composeP7TrainingReducedPackBuildInput(input),
  );
}
