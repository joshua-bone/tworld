import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { P7bLevelReplayPresentation } from "@game-core/api/p7bReplayPresentation";
import { assertP7bLevelReplayPresentation } from "@game-core/api/p7bReplayPresentationValidation";
import { parseP7TrainingBrowserReplay } from "@game-core/api/p7TrainingBrowserReplay";
import { parseSolutionFile } from "@content/api/solution-file";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  parseP7bPortableDecisionTrace,
} from "../p7b-training/portableReplayProfile";
import {
  P7B_MAX_OUTPUT_PATH_BYTES,
  P7B_MAX_PACK_OUTPUT_FILE_BYTES,
  P7B_MAX_PACK_OUTPUT_FILES,
  P7B_MAX_PACK_OUTPUT_TOTAL_BYTES,
  P7B_SHARED_PLAYER_DIST_ENTRY,
  P7B_SHARED_PLAYER_SOURCE_ENTRY,
  P7B_TRAINING_PACK_CHECKED_PARENT,
  P7B_TRAINING_PACK_DIST_PARENT,
  buildP7bSharedPlayerLevelHref,
  type P7bTrainingPackManifestV1,
  type P7bTrainingPackMediaType,
  type P7bTrainingPackOutput,
} from "./buildP7bTrainingPackOutputs";
import {
  P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
  attestP7TrainingPackProofIndex,
  p7TrainingPackProofPhysicalPaths,
  parseP7TrainingPackProofIndex,
  type P7TrainingPackProofAttestation,
  type P7TrainingPackProofFile,
  type P7TrainingPackProofIndexV1,
  type P7TrainingProofExtractorRevisionV1,
} from "./p7TrainingPackProofIndex";
import {
  assertP7TrainingExecutionBrowserTargets,
  assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof,
  attestP7TrainingExecutionIndex,
  parseP7TrainingExecutionIndex,
  type P7TrainingExecutionIndexAttestation,
  type P7TrainingExecutionIndexV1,
} from "./p7TrainingExecutionIndex";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES,
  P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES,
  attestP7SharedPlayerGraph,
  parseP7SharedPlayerGraphAttestation,
} from "./p7SharedPlayerGraphAttestation";

const PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const OFFICIAL_TRAINING_PACKS = new Set(["cclp1", "cclp4", "cclp5"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const sha256 = new WebCryptoSha256();

export interface P7bTrainingPackTransactionTargets {
  readonly repositoryRoot: string;
  readonly ccssolverRoot: string;
  readonly checkedRoot: string;
  readonly distRoot: string;
}

export interface P7bTrainingPackAttestation {
  readonly manifest: P7bTrainingPackManifestV1;
  readonly manifestContent: BlobReferenceV1;
  readonly executionIndex: P7TrainingExecutionIndexV1;
  readonly execution: P7TrainingExecutionIndexAttestation;
  readonly proofIndex: P7TrainingPackProofIndexV1;
  readonly proof: P7TrainingPackProofAttestation;
  readonly outputs: readonly P7bTrainingPackOutput[];
}

export interface P7bTrainingPackProofSourceOptions {
  readonly externalFiles?: readonly P7TrainingPackProofFile[];
  readonly extractEntryOrdinal?: (input: {
    readonly sourcePath: string;
    readonly sourceBytes: Uint8Array;
    readonly entryOrdinal: number;
    readonly extractorRevision: P7TrainingProofExtractorRevisionV1;
  }) => Promise<Uint8Array> | Uint8Array;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function requirePackId(packId: unknown): string {
  if (typeof packId !== "string" || !PACK_ID_PATTERN.test(packId)) {
    throw new Error("P7B training pack id is unsafe");
  }
  return packId;
}

function safeDescendant(root: string, target: string, label: string): string {
  const inside = relative(root, target);
  if (
    inside.length === 0
    || inside === ".."
    || inside.startsWith("../")
    || inside.startsWith("..\\")
    || isAbsolute(inside)
  ) {
    throw new Error(`${label} escapes its fixed output leaf`);
  }
  return inside;
}

async function assertTrustedDirectoryChain(
  repositoryRoot: string,
  targetDirectory: string,
  label: string,
): Promise<void> {
  const root = resolve(repositoryRoot);
  const target = resolve(targetDirectory);
  safeDescendant(root, target, `${label} fixed ancestor`);
  let rootDetails;
  try {
    rootDetails = await lstat(root);
  } catch (error) {
    if (isMissing(error)) throw new Error(`${label} repository root is missing`);
    throw error;
  }
  if (rootDetails.isSymbolicLink()) throw new Error(`${label} fixed ancestor is a symlink: ${root}`);
  if (!rootDetails.isDirectory()) throw new Error(`${label} fixed ancestor is not a directory: ${root}`);
  const trustedRoot = await realpath(root);
  let current = root;
  for (const segment of relative(root, target).split(sep)) {
    current = resolve(current, segment);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
    if (details.isSymbolicLink()) {
      throw new Error(`${label} fixed ancestor is a symlink: ${current}`);
    }
    if (!details.isDirectory()) {
      throw new Error(`${label} fixed ancestor is not a directory: ${current}`);
    }
    const actual = await realpath(current);
    const fromTrustedRoot = relative(trustedRoot, actual);
    if (
      fromTrustedRoot === ".."
      || fromTrustedRoot.startsWith(`..${sep}`)
      || isAbsolute(fromTrustedRoot)
    ) {
      throw new Error(`${label} fixed ancestor escapes the real repository root: ${current}`);
    }
  }
}

export function resolveP7bTrainingPackTransactionTargets(
  repositoryRoot: string,
  packIdInput: string,
): P7bTrainingPackTransactionTargets {
  const packId = requirePackId(packIdInput);
  const root = resolve(repositoryRoot);
  const ccssolverRoot = resolve(root, "ccsolver");
  const checkedRoot = resolve(root, P7B_TRAINING_PACK_CHECKED_PARENT, packId);
  const distBase = resolve(root, "web/dist");
  const distRoot = resolve(distBase, P7B_TRAINING_PACK_DIST_PARENT, packId);
  if (
    checkedRoot === ccssolverRoot
    || relative(ccssolverRoot, checkedRoot) !== [
      "fixtures",
      "golden",
      "p7b",
      "training-packs",
      packId,
    ].join(sep)
    || distRoot === distBase
    || relative(distBase, distRoot) !== [
      "dev",
      "ccsolver",
      "training-replays",
      packId,
    ].join(sep)
  ) {
    throw new Error("P7B training pack transaction target scope invariant failed");
  }
  return { repositoryRoot: root, ccssolverRoot, checkedRoot, distRoot };
}

export function assertP7bTrainingPackOutputPath(
  repositoryRoot: string,
  packIdInput: string,
  outputPath: string,
): string {
  const packId = requirePackId(packIdInput);
  const prefix = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}/`;
  if (
    typeof outputPath !== "string"
    || isAbsolute(outputPath)
    || outputPath.includes("\\")
    || outputPath.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
    || !outputPath.startsWith(prefix)
    || outputPath.length === prefix.length
    || utf8Length(outputPath) > P7B_MAX_OUTPUT_PATH_BYTES
  ) {
    throw new Error(`P7B unsafe output path: ${outputPath}`);
  }
  const targets = resolveP7bTrainingPackTransactionTargets(repositoryRoot, packId);
  const target = resolve(repositoryRoot, outputPath);
  safeDescendant(targets.checkedRoot, target, `P7B output ${outputPath}`);
  return outputPath.slice(prefix.length);
}

async function listFiles(
  directory: string,
  prefix = "",
  files: string[] = [],
): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return files;
    throw error;
  }
  for (const entry of entries.sort((left, right) => compareText(left.name, right.name))) {
    const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      await listFiles(resolve(directory, entry.name), path, files);
    } else if (entry.isFile()) {
      files.push(path);
      if (files.length > P7B_MAX_PACK_OUTPUT_FILES) {
        throw new Error("checked P7B training pack file count exceeds its bound");
      }
    } else {
      throw new Error(`checked P7B training pack contains a non-file entry: ${path}`);
    }
  }
  return files;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unsupported shape`);
  }
  return record;
}

function requireInteger(
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

function requireText(value: unknown, label: string, maximumBytes = 4_096): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || value.includes("\n")
    || value.includes("\0")
    || utf8Length(value) > maximumBytes
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function copyReference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], label);
  if (typeof record.digest !== "string" || !SHA256_PATTERN.test(record.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: requireInteger(
      record.byteLength,
      0,
      P7B_MAX_PACK_OUTPUT_FILE_BYTES,
      `${label} byte length`,
    ),
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function parseCanonicalJson(path: string, content: Uint8Array): unknown {
  let text: string;
  let parsed: unknown;
  try {
    text = decoder.decode(content);
    parsed = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`checked P7B JSON is invalid: ${path}`, { cause: error });
  }
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
    throw new Error(`checked P7B JSON is not canonical: ${path}`);
  }
  return parsed;
}

function mediaTypeFor(path: string): P7bTrainingPackMediaType {
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".bin")) return "application/octet-stream";
  throw new Error(`checked P7B manifest declares an unsupported file extension: ${path}`);
}

function containsEmbeddedFrames(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsEmbeddedFrames);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, entry]) => (
    key === "frames" || key === "frameSnapshots" || containsEmbeddedFrames(entry)
  ));
}

function validateManifest(
  value: unknown,
  expectedPackId: string,
): P7bTrainingPackManifestV1 {
  const manifest = exactKeys(value, [
    "artifact",
    "executionIndex",
    "files",
    "filesOrder",
    "levels",
    "pack",
    "portableProfile",
    "producerRevision",
    "proofIndex",
    "sharedPlayer",
    "summary",
    "version",
  ], "P7B training pack manifest");
  if (
    manifest.artifact !== "ccsolver-p7b-training-pack-manifest"
    || manifest.version !== 1
    || manifest.producerRevision !== "ccsolver-p7b-training-pack-output-v1"
    || manifest.filesOrder !== "path"
  ) {
    throw new Error("checked P7B training pack manifest identity is unsupported");
  }
  const pack = exactKeys(manifest.pack, ["expectedLevelCount", "packId", "title"], "P7B pack");
  if (pack.packId !== expectedPackId) throw new Error("checked P7B manifest pack id drifted");
  const expectedLevelCount = requireInteger(
    pack.expectedLevelCount,
    1,
    4_096,
    "P7B pack expected level count",
  );
  if (OFFICIAL_TRAINING_PACKS.has(expectedPackId) && expectedLevelCount !== 149) {
    throw new Error("official CCLP training packs require exactly 149 inventory rows");
  }
  requireText(pack.title, "P7B pack title");

  const player = exactKeys(manifest.sharedPlayer, [
    "entry",
    "graphAttestation",
    "levelPageHref",
  ], "P7B shared player contract");
  const graphAttestation = exactKeys(
    player.graphAttestation,
    ["content", "path"],
    "P7B shared player graph attestation",
  );
  const entry = exactKeys(player.entry, ["content", "path"], "P7B shared player entry");
  const entryContent = copyReference(entry.content, "P7B shared player entry content");
  if (
    graphAttestation.path !== P7_SHARED_PLAYER_GRAPH_CHECKED_PATH
    || entry.path !== P7B_SHARED_PLAYER_DIST_ENTRY
    || player.levelPageHref !== buildP7bSharedPlayerLevelHref(entryContent)
  ) {
    throw new Error("checked P7B shared player contract drifted");
  }
  copyReference(graphAttestation.content, "P7B shared player graph content");

  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${expectedPackId}`;
  if (manifest.portableProfile !== null) {
    const profile = exactKeys(manifest.portableProfile, [
      "content",
      "path",
      "profileId",
      "profileRevision",
    ], "P7B portable profile contract");
    if (
      profile.profileId !== P7B_HYBRIDCC_CANDIDATE_PROFILE_ID
      || profile.profileRevision !== P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION
      || profile.path !== `${root}/profiles/${P7B_HYBRIDCC_CANDIDATE_PROFILE_ID}.json`
    ) {
      throw new Error("checked P7B portable profile contract drifted");
    }
    copyReference(profile.content, "P7B portable profile content");
  }
  const summary = exactKeys(manifest.summary, ["content", "path"], "P7B pack summary reference");
  if (summary.path !== `${root}/pack-summary.json`) {
    throw new Error("checked P7B summary path drifted");
  }
  copyReference(summary.content, "P7B pack summary content");
  const executionIndex = exactKeys(
    manifest.executionIndex,
    ["content", "path"],
    "P7B pack execution-index reference",
  );
  if (executionIndex.path !== `${root}/execution-index.json`) {
    throw new Error("checked P7B execution-index path drifted");
  }
  copyReference(executionIndex.content, "P7B pack execution-index content");
  const proofIndex = exactKeys(
    manifest.proofIndex,
    ["content", "path"],
    "P7B pack proof-index reference",
  );
  if (proofIndex.path !== `${root}/proof-index.json`) {
    throw new Error("checked P7B proof-index path drifted");
  }
  copyReference(proofIndex.content, "P7B pack proof-index content");

  if (!Array.isArray(manifest.levels) || manifest.levels.length !== expectedLevelCount) {
    throw new Error("checked P7B manifest level denominator drifted");
  }
  for (const [index, value] of manifest.levels.entries()) {
    const level = exactKeys(
      value,
      [
        "levelNumber",
        "rawDonorFileCount",
        "replayFileCount",
        "status",
        "variantPayloadFileCount",
      ],
      `P7B manifest level ${index + 1}`,
    );
    if (level.levelNumber !== index + 1) {
      throw new Error(`checked P7B manifest must contain level ${index + 1} exactly once`);
    }
    if (
      level.status !== "complete"
      && level.status !== "processing"
      && level.status !== "blocked"
      && level.status !== "unprocessed"
    ) {
      throw new Error(`checked P7B manifest level ${index + 1} status is invalid`);
    }
    requireInteger(
      level.rawDonorFileCount,
      0,
      P7B_MAX_PACK_OUTPUT_FILES,
      `P7B manifest level ${index + 1} raw count`,
    );
    requireInteger(
      level.replayFileCount,
      0,
      P7B_MAX_PACK_OUTPUT_FILES,
      `P7B manifest level ${index + 1} replay count`,
    );
    requireInteger(
      level.variantPayloadFileCount,
      0,
      P7B_MAX_PACK_OUTPUT_FILES,
      `P7B manifest level ${index + 1} variant payload count`,
    );
  }

  if (!Array.isArray(manifest.files) || manifest.files.length > P7B_MAX_PACK_OUTPUT_FILES - 1) {
    throw new Error("checked P7B manifest file count exceeds its bound");
  }
  let previousPath = "";
  const paths = new Set<string>();
  for (const [index, value] of manifest.files.entries()) {
    const file = exactKeys(value, ["content", "mediaType", "path"], `P7B manifest file ${index}`);
    const path = requireText(file.path, `P7B manifest file ${index} path`, P7B_MAX_OUTPUT_PATH_BYTES);
    if (
      !path.startsWith(`${root}/`)
      || path.includes("\\")
      || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
      || paths.has(path)
      || (index > 0 && compareText(previousPath, path) >= 0)
    ) {
      throw new Error(`checked P7B manifest file order or path is unsafe: ${path}`);
    }
    if (file.mediaType !== mediaTypeFor(path)) {
      throw new Error(`checked P7B manifest media type drifted: ${path}`);
    }
    copyReference(file.content, `P7B manifest file ${index} content`);
    paths.add(path);
    previousPath = path;
  }
  return structuredClone(value) as P7bTrainingPackManifestV1;
}

function levelLabel(levelNumber: number): string {
  return String(levelNumber).padStart(3, "0");
}

function assertBrowserTargetDescriptor(
  value: unknown,
  target: "ms" | "lynx",
  levelNumber: number,
): void {
  const descriptor = exactKeys(value, ["display", "request"], `${target} browser target`);
  const rawRequest = exactKeys(
    descriptor.request,
    Object.hasOwn((descriptor.request ?? {}) as object, "randomSeed")
      ? ["levelNumber", "randomSeed", "ruleset", "seriesFile"]
      : ["levelNumber", "ruleset", "seriesFile"],
    `${target} browser request`,
  );
  if (
    rawRequest.levelNumber !== levelNumber
    || rawRequest.ruleset !== (target === "ms" ? "MS" : "Lynx")
  ) {
    throw new Error(`checked P7B ${target} browser request identity drifted`);
  }
  requireText(rawRequest.seriesFile, `${target} browser series file`);
  if (rawRequest.randomSeed !== undefined) {
    requireInteger(rawRequest.randomSeed, 0, 0xffff_ffff, `${target} browser random seed`);
  }
  const display = exactKeys(
    descriptor.display,
    ["level", "mapFilename", "seriesName"],
    `${target} browser display`,
  );
  requireText(display.seriesName, `${target} browser series name`);
  requireText(display.mapFilename, `${target} browser map filename`);
  const level = exactKeys(
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
  if (level.number !== levelNumber) {
    throw new Error(`checked P7B ${target} browser display identity drifted`);
  }
  requireText(level.name, `${target} browser level name`);
}

function assertLevelBrowserBindings(input: {
  readonly manifest: P7bTrainingPackManifestV1;
  readonly contract: ReturnType<typeof buildP7bTrainingReplayLevel>;
  readonly browserPath: string;
  readonly browserValue: unknown;
  readonly parsedJson: ReadonlyMap<string, unknown>;
}): void {
  const browser = exactKeys(
    input.browserValue,
    ["artifact", "presentation", "targets", "version"],
    "checked P7B browser level manifest",
  );
  if (browser.artifact !== "ccsolver-p7b-replay-browser-level" || browser.version !== 1) {
    throw new Error("checked P7B browser level manifest identity is unsupported");
  }
  const presentation = structuredClone(browser.presentation) as P7bLevelReplayPresentation;
  assertP7bLevelReplayPresentation(presentation);
  if (
    presentation.packId !== input.contract.source.packId
    || presentation.levelNumber !== input.contract.source.levelNumber
    || presentation.title !== input.contract.source.title
    || presentation.sourceHref !== "contract.json"
    || presentation.levelManifestHref !== "browser.json"
    || presentation.playerModuleHref !== input.manifest.sharedPlayer.levelPageHref
  ) {
    throw new Error("checked P7B browser presentation identity drifted from its contract");
  }
  const targets = exactKeys(browser.targets, ["lynx", "ms"], "checked P7B browser targets");
  assertBrowserTargetDescriptor(targets.ms, "ms", input.contract.source.levelNumber);
  assertBrowserTargetDescriptor(targets.lynx, "lynx", input.contract.source.levelNumber);

  if (presentation.variants.length !== input.contract.variants.length) {
    throw new Error("checked P7B browser variant set drifted from its contract");
  }
  for (const [variantIndex, variant] of input.contract.variants.entries()) {
    const displayedVariant = presentation.variants[variantIndex];
    if (
      displayedVariant?.id !== variant.variantId
      || displayedVariant.segments.length !== variant.segments.length
      || displayedVariant.segments.some((segment, segmentIndex) => (
        segment.id !== variant.segments[segmentIndex]?.segmentId
        || segment.ordinal !== segmentIndex + 1
        || segment.title !== variant.segments[segmentIndex]?.label
      ))
    ) {
      throw new Error(`checked P7B browser variant semantics drifted: ${variant.variantId}`);
    }
    for (const target of ["ms", "lynx"] as const) {
      const certification = variant.certifications[target];
      const combination = presentation.combinations.find((candidate) => (
        candidate.variant === variant.variantId && candidate.executionTarget === target
      ));
      if (combination === undefined) {
        throw new Error(`checked P7B browser combination is missing: ${variant.variantId}:${target}`);
      }
      const executable = certification.status === "certified"
        && (certification.execution.status === "native"
          || certification.execution.status === "compiled");
      if (!executable) {
        if (combination.availability !== "unavailable") {
          throw new Error(`checked P7B browser falsely exposes unavailable execution: ${variant.variantId}:${target}`);
        }
        continue;
      }
      if (combination.availability !== "available") {
        throw new Error(`checked P7B browser hides certified execution: ${variant.variantId}:${target}`);
      }
      const execution = certification.execution;
      const expectedHref = `replays/${String(variantIndex).padStart(2, "0")}-${target}.json`;
      const replayPath = `${input.browserPath.slice(0, -"browser.json".length)}${expectedHref}`;
      const declaredReplay = input.manifest.files.find(({ path }) => path === replayPath);
      if (
        combination.replayHref !== expectedHref
        || declaredReplay === undefined
        || !sameReference(combination.replayContent, declaredReplay.content)
        || execution.browserReplayContent === null
        || !sameReference(combination.replayContent, execution.browserReplayContent)
        || combination.transport !== execution.browserReplayTransport
        || combination.nativeBoundaryClock !== execution.nativeBoundaryClock
        || combination.nativeTickRateHz !== execution.nativeTickRateHz
        || combination.terminalNativeTick !== certification.terminalNativeTick
        || combination.executedDecisionCount !== execution.executedDecisionCount
        || execution.decisionProfile === null
        || combination.decisionProfile.profileId !== execution.decisionProfile.profileId
        || combination.decisionProfile.clockBasis !== execution.decisionProfile.clockBasis
        || combination.decisionProfile.cadenceHz !== execution.decisionProfile.cadenceHz
      ) {
        throw new Error(`checked P7B browser execution binding drifted: ${variant.variantId}:${target}`);
      }
      const expectedSpans = certification.segmentSpans.map((span) => ({
        segmentId: span.segmentId,
        startNativeTick: span.startNativeTick,
        endNativeTick: span.endNativeTick,
        ...(span.startDecisionOrdinal === null ? {} : {
          startDecisionOrdinal: span.startDecisionOrdinal,
          endDecisionOrdinal: span.endDecisionOrdinal!,
        }),
      }));
      if (
        canonicalizeJson(combination.segmentSpans as unknown as CanonicalJsonValue)
        !== canonicalizeJson(expectedSpans as unknown as CanonicalJsonValue)
      ) {
        throw new Error(`checked P7B browser segment bindings drifted: ${variant.variantId}:${target}`);
      }
      const replayValue = input.parsedJson.get(replayPath);
      const replay = parseP7TrainingBrowserReplay(
        canonicalizeJson(replayValue as CanonicalJsonValue),
      );
      const replayInputCount = replay.transport === "native-replay-pulses"
        ? replay.decisions.length
        : replay.changes.length;
      if (
        replay.variantId !== variant.variantId
        || replay.target !== target
        || replay.transport !== execution.browserReplayTransport
        || execution.replayContent === null
        || !sameReference(replay.sourceReplayContent, execution.replayContent)
        || replay.nativeTickRateHz !== execution.nativeTickRateHz
        || replay.terminalNativeTick !== certification.terminalNativeTick
        || replayInputCount !== execution.executedDecisionCount
      ) {
        throw new Error(`checked P7B replay envelope drifted from certification: ${variant.variantId}:${target}`);
      }
    }
  }
}

function validateDeclaredLayout(
  manifest: P7bTrainingPackManifestV1,
  parsedJson: ReadonlyMap<string, unknown>,
  outputByPath: ReadonlyMap<string, P7bTrainingPackOutput>,
): void {
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${manifest.pack.packId}`;
  const paths = new Set(manifest.files.map(({ path }) => path));
  for (const required of [
    `${root}/browser.json`,
    `${root}/execution-index.json`,
    `${root}/index.html`,
    `${root}/pack-summary.json`,
    `${root}/proof-index.json`,
  ]) {
    if (!paths.has(required)) throw new Error(`checked P7B manifest omits required file: ${required}`);
  }
  const allowed = new Set([
    `${root}/browser.json`,
    `${root}/execution-index.json`,
    `${root}/index.html`,
    `${root}/pack-summary.json`,
    `${root}/proof-index.json`,
  ]);
  const packEvidencePaths = [`${root}/evidence/index.json`, `${root}/evidence/payload.bin`];
  const packEvidenceCount = packEvidencePaths.filter((path) => paths.has(path)).length;
  if (packEvidenceCount !== 0 && packEvidenceCount !== packEvidencePaths.length) {
    throw new Error("checked P7B pack evidence sidecar is incomplete");
  }
  packEvidencePaths.filter((path) => paths.has(path)).forEach((path) => allowed.add(path));
  if (manifest.portableProfile !== null) {
    if (!paths.has(manifest.portableProfile.path)) {
      throw new Error("checked P7B manifest omits its portable profile descriptor");
    }
    const declared = manifest.files.find(({ path }) => path === manifest.portableProfile!.path)!;
    if (!sameReference(declared.content, manifest.portableProfile.content)) {
      throw new Error("checked P7B portable profile reference drifted");
    }
    allowed.add(manifest.portableProfile.path);
  }
  for (const level of manifest.levels) {
    const levelRoot = `${root}/levels/${levelLabel(level.levelNumber)}`;
    const contractPath = `${levelRoot}/contract.json`;
    const pagePath = `${levelRoot}/index.html`;
    for (const required of [contractPath, pagePath]) {
      if (!paths.has(required)) throw new Error(`checked P7B manifest omits required file: ${required}`);
      allowed.add(required);
    }
    const levelEvidencePaths = [
      `${levelRoot}/evidence/index.json`,
      `${levelRoot}/evidence/payload.bin`,
    ];
    const levelEvidenceCount = levelEvidencePaths.filter((path) => paths.has(path)).length;
    if (levelEvidenceCount !== 0 && levelEvidenceCount !== levelEvidencePaths.length) {
      throw new Error(`checked P7B level ${level.levelNumber} evidence sidecar is incomplete`);
    }
    levelEvidencePaths.filter((path) => paths.has(path)).forEach((path) => allowed.add(path));
    const contractValue = parsedJson.get(contractPath);
    const contract = buildP7bTrainingReplayLevel(contractValue);
    if (
      contract.source.packId !== manifest.pack.packId
      || contract.source.levelNumber !== level.levelNumber
    ) {
      throw new Error(`checked P7B level contract identity drifted: ${contractPath}`);
    }
    const expectsBrowser = contract.variants.length > 0;
    const pageHtml = decoder.decode(outputByPath.get(pagePath)!.content);
    const playerScript = `<script type="module" defer src="${
      manifest.sharedPlayer.levelPageHref
    }"></script>`;
    const scriptCount = pageHtml.match(/<script\b/giu)?.length ?? 0;
    if (
      expectsBrowser
        ? scriptCount !== 1 || !pageHtml.includes(playerScript)
        : scriptCount !== 0 || pageHtml.includes("p7b-replay-player.js")
    ) throw new Error(`checked P7B level ${level.levelNumber} page shared player binding drifted`);
    const expectedVariantPayloadCount = contract.variants.filter(({ kind }) => (
      kind === "portable"
    )).length;
    const browserPath = `${levelRoot}/browser.json`;
    if (expectsBrowser === true && !paths.has(browserPath)) {
      throw new Error(`checked P7B manifest omits required browser manifest: ${browserPath}`);
    }
    if (expectsBrowser === false && paths.has(browserPath)) {
      throw new Error(`checked P7B no-variant level must not claim a browser manifest: ${browserPath}`);
    }
    if (paths.has(browserPath)) {
      allowed.add(browserPath);
      assertLevelBrowserBindings({
        manifest,
        contract,
        browserPath,
        browserValue: parsedJson.get(browserPath),
        parsedJson,
      });
    }

    const raw = manifest.files.filter(({ path }) => path.startsWith(`${levelRoot}/raw/`));
    const replays = manifest.files.filter(({ path }) => path.startsWith(`${levelRoot}/replays/`));
    const variantPayloads = manifest.files.filter(({ path }) => (
      path.startsWith(`${levelRoot}/portable/`)
    ));
    if (
      raw.length !== level.rawDonorFileCount
      || replays.length !== level.replayFileCount
      || variantPayloads.length !== level.variantPayloadFileCount
      || (
        variantPayloads.length !== expectedVariantPayloadCount
      )
      || raw.some(({ path }) => !/^.+\/raw\/\d{2,4}-(?:ms|lynx)\.tws-entry\.bin$/u.test(path))
      || replays.some(({ path }) => !/^.+\/replays\/\d{2,4}-(?:ms|lynx)\.json$/u.test(path))
      || variantPayloads.some(({ path }) => (
        !/^.+\/portable\/\d{2,4}-hybrid-candidate-10hz\.json$/u.test(path)
      ))
    ) {
      throw new Error(`checked P7B level ${level.levelNumber} asset counts or names drifted`);
    }
    for (const [donorIndex, donor] of contract.rawDonors.entries()) {
      const donorPath = `${levelRoot}/raw/${String(donorIndex).padStart(2, "0")}-${donor.target}.tws-entry.bin`;
      const declared = raw.find(({ path }) => path === donorPath);
      if (declared === undefined || !sameReference(declared.content, donor.replayContent)) {
        throw new Error(`checked P7B raw donor binding drifted: ${donor.donorId}`);
      }
    }
    for (const [variantIndex, variant] of contract.variants.entries()) {
      if (variant.kind !== "portable") continue;
      const payloadPath = `${levelRoot}/portable/${String(variantIndex).padStart(2, "0")}-hybrid-candidate-10hz.json`;
      const declared = variantPayloads.find(({ path }) => path === payloadPath);
      if (
        declared === undefined
        || !sameReference(declared.content, variant.replayContent)
        || variant.portableProfile === null
        || !sameReference(declared.content, variant.portableProfile.decisionTraceContent)
      ) {
        throw new Error(`checked P7B portable payload binding drifted: ${variant.variantId}`);
      }
    }
    raw.forEach(({ path }) => allowed.add(path));
    replays.forEach(({ path }) => {
      allowed.add(path);
      if (containsEmbeddedFrames(parsedJson.get(path))) {
        throw new Error(`checked P7B replay must not embed frames: ${path}`);
      }
    });
    variantPayloads.forEach(({ path }) => {
      allowed.add(path);
      const value = parsedJson.get(path);
      parseP7bPortableDecisionTrace(canonicalizeJson(value as CanonicalJsonValue));
    });
  }
  const unexpected = [...paths].find((path) => !allowed.has(path));
  if (unexpected !== undefined) {
    throw new Error(`checked P7B manifest declares an unsupported path: ${unexpected}`);
  }
}

async function loadProofExternalFiles(
  repositoryRoot: string,
  index: P7TrainingPackProofIndexV1,
  supplied: readonly P7TrainingPackProofFile[] | undefined,
): Promise<readonly P7TrainingPackProofFile[]> {
  if (supplied !== undefined) {
    return supplied.map((file) => ({ path: file.path, bytes: new Uint8Array(file.bytes) }));
  }
  const root = resolve(repositoryRoot);
  const planned: {
    readonly path: string;
    readonly absolutePath: string;
    readonly byteLength: number;
  }[] = [];
  let total = 0;
  for (const external of index.externalInputs) {
    const absolutePath = resolve(root, external.path);
    safeDescendant(root, absolutePath, `proof external input ${external.path}`);
    await assertTrustedDirectoryChain(root, dirname(absolutePath), "proof external input");
    let details;
    try {
      details = await lstat(absolutePath);
    } catch (error) {
      if (isMissing(error)) throw new Error(`proof external input is missing: ${external.path}`);
      throw error;
    }
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(`proof external input is not a regular file: ${external.path}`);
    }
    if (details.size > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
      throw new Error(`proof external input exceeds its file byte bound: ${external.path}`);
    }
    total += details.size;
    if (total > P7B_MAX_PACK_OUTPUT_TOTAL_BYTES) {
      throw new Error("proof external input byte total exceeds its bound");
    }
    planned.push({ path: external.path, absolutePath, byteLength: details.size });
  }
  const files: P7TrainingPackProofFile[] = [];
  for (const plannedFile of planned) {
    const bytes = new Uint8Array(await readFile(plannedFile.absolutePath));
    if (bytes.byteLength !== plannedFile.byteLength) {
      throw new Error(`proof external input changed while being read: ${plannedFile.path}`);
    }
    files.push({ path: plannedFile.path, bytes });
  }
  return files;
}

function extractSolutionEntry(input: {
  readonly sourcePath: string;
  readonly sourceBytes: Uint8Array;
  readonly entryOrdinal: number;
  readonly extractorRevision: P7TrainingProofExtractorRevisionV1;
}): Uint8Array {
  if (input.extractorRevision !== "tws-solution-entry-v1") {
    throw new Error("proof solution entry extractor revision is unsupported");
  }
  const entry = parseSolutionFile(input.sourceBytes).entries[input.entryOrdinal];
  if (entry?.solutionData === null || entry?.solutionData === undefined) {
    throw new Error(`proof solution entry is absent: ${input.sourcePath}/${input.entryOrdinal}`);
  }
  return new Uint8Array(entry.solutionData);
}

async function attestOutputCollection(
  repositoryRoot: string,
  packId: string,
  outputsInput: readonly P7bTrainingPackOutput[],
  proofSources: P7bTrainingPackProofSourceOptions = {},
): Promise<P7bTrainingPackAttestation> {
  if (outputsInput.length === 0 || outputsInput.length > P7B_MAX_PACK_OUTPUT_FILES) {
    throw new Error("P7B training pack output count is out of bounds");
  }
  const outputs = [...outputsInput].sort((left, right) => compareText(left.path, right.path));
  const outputByPath = new Map<string, P7bTrainingPackOutput>();
  let totalBytes = 0;
  const parsedJson = new Map<string, unknown>();
  for (const output of outputs) {
    assertP7bTrainingPackOutputPath(repositoryRoot, packId, output.path);
    if (outputByPath.has(output.path)) throw new Error(`duplicate P7B output: ${output.path}`);
    if (output.mediaType !== mediaTypeFor(output.path)) {
      throw new Error(`P7B output media type drifted: ${output.path}`);
    }
    if (!(output.content instanceof Uint8Array)) {
      throw new Error(`P7B output is not bytes: ${output.path}`);
    }
    if (output.content.byteLength > P7B_MAX_PACK_OUTPUT_FILE_BYTES) {
      throw new Error(`P7B output exceeds its file byte bound: ${output.path}`);
    }
    totalBytes += output.content.byteLength;
    if (totalBytes > P7B_MAX_PACK_OUTPUT_TOTAL_BYTES) {
      throw new Error("P7B training pack output exceeds its total byte bound");
    }
    if (output.mediaType === "application/json") {
      parsedJson.set(output.path, parseCanonicalJson(output.path, output.content));
    }
    outputByPath.set(output.path, output);
  }
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}`;
  const manifestPath = `${root}/manifest.json`;
  const manifestOutput = outputByPath.get(manifestPath);
  if (manifestOutput === undefined) throw new Error("checked P7B training pack lacks its manifest");
  const manifest = validateManifest(parsedJson.get(manifestPath), packId);
  const declaredPaths = manifest.files.map(({ path }) => path);
  const expectedPaths = [...declaredPaths, manifestPath].sort(compareText);
  const actualPaths = outputs.map(({ path }) => path);
  if (
    expectedPaths.length !== actualPaths.length
    || expectedPaths.some((path, index) => path !== actualPaths[index])
  ) {
    throw new Error("checked file set drifted for the P7B training pack");
  }
  for (const declared of manifest.files) {
    const output = outputByPath.get(declared.path)!;
    const actual = await referenceSourceBytes(output.content, sha256);
    if (declared.mediaType !== output.mediaType || !sameReference(actual, declared.content)) {
      throw new Error(`checked P7B manifest payload drifted: ${declared.path}`);
    }
  }
  const summaryFile = manifest.files.find(({ path }) => path === manifest.summary.path);
  if (summaryFile === undefined || !sameReference(summaryFile.content, manifest.summary.content)) {
    throw new Error("checked P7B summary reference drifted");
  }
  const executionFile = manifest.files.find(({ path }) => path === manifest.executionIndex.path);
  if (
    executionFile === undefined
    || !sameReference(executionFile.content, manifest.executionIndex.content)
  ) throw new Error("checked P7B execution-index reference drifted");
  const proofFile = manifest.files.find(({ path }) => path === manifest.proofIndex.path);
  if (proofFile === undefined || !sameReference(proofFile.content, manifest.proofIndex.content)) {
    throw new Error("checked P7B proof-index reference drifted");
  }
  validateDeclaredLayout(manifest, parsedJson, outputByPath);
  const proofIndex = parseP7TrainingPackProofIndex(
    decoder.decode(outputByPath.get(manifest.proofIndex.path)!.content),
  );
  if (
    proofIndex.pack.packId !== manifest.pack.packId
    || proofIndex.pack.expectedLevelCount !== manifest.pack.expectedLevelCount
  ) {
    throw new Error("checked P7B proof-index pack identity drifted");
  }
  const executionIndex = parseP7TrainingExecutionIndex(
    decoder.decode(outputByPath.get(manifest.executionIndex.path)!.content),
  );
  if (
    executionIndex.semanticProof.pack.packId !== manifest.pack.packId
    || executionIndex.semanticProof.pack.expectedLevelCount !== manifest.pack.expectedLevelCount
  ) throw new Error("checked P7B execution-index pack identity drifted");
  const declaredExecution = proofIndex.generatedBlobs.find(({ locator }) => (
    locator.kind === "file" && locator.path === manifest.executionIndex.path
  ));
  if (
    declaredExecution?.kind !== "execution-index"
    || !sameReference(declaredExecution.content, manifest.executionIndex.content)
  ) throw new Error("checked P7B execution-index manifest binding drifted from the full proof");
  assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof({
    executionIndex,
    fullProof: proofIndex,
  });
  for (const row of executionIndex.browserTargets) {
    const browserPath = `${root}/levels/${levelLabel(row.levelNumber)}/browser.json`;
    const browserValue = parsedJson.get(browserPath);
    if (browserValue === undefined) continue;
    const browser = exactKeys(
      browserValue,
      ["artifact", "presentation", "targets", "version"],
      `P7B level ${row.levelNumber} browser manifest`,
    );
    assertP7TrainingExecutionBrowserTargets({
      executionIndex,
      levelNumber: row.levelNumber,
      browserTargets: browser.targets,
    });
  }
  const proofPayloadPaths = new Set([
    ...proofIndex.generatedBlobs.flatMap(({ locator }) => locator.kind === "file"
      ? [locator.path]
      : []),
    ...proofIndex.evidenceSidecars.flatMap(({ index, payload }) => [index.path, payload.path]),
    ...proofIndex.derivedSources.flatMap(({ retainedPath }) => (
      retainedPath === null ? [] : [retainedPath]
    )),
  ]);
  const manifestPayloadPaths = manifest.files
    .map(({ path }) => path)
    .filter((path) => path !== manifest.proofIndex.path);
  if (
    proofPayloadPaths.size !== manifestPayloadPaths.length
    || manifestPayloadPaths.some((path) => !proofPayloadPaths.has(path))
  ) {
    throw new Error("checked P7B proof-index generated file set drifted from the manifest");
  }
  const externalFiles = await loadProofExternalFiles(
    repositoryRoot,
    proofIndex,
    proofSources.externalFiles,
  );
  const proofFiles: P7TrainingPackProofFile[] = [
    ...externalFiles,
    ...[...proofPayloadPaths].map((path) => ({
      path,
      bytes: outputByPath.get(path)!.content,
    })),
  ];
  const proof = await attestP7TrainingPackProofIndex({
    index: proofIndex,
    files: proofFiles,
    sha256,
    extractEntryOrdinal: proofSources.extractEntryOrdinal ?? extractSolutionEntry,
  });
  const proofFileByPath = new Map(proofFiles.map((file) => [file.path, file]));
  const executionProofFiles = p7TrainingPackProofPhysicalPaths(
    executionIndex.semanticProof,
  ).map((path) => {
    const file = proofFileByPath.get(path);
    if (file === undefined) throw new Error(`checked P7B execution proof file is missing: ${path}`);
    return file;
  });
  const execution = await attestP7TrainingExecutionIndex({
    index: executionIndex,
    files: executionProofFiles,
    sha256,
    extractEntryOrdinal: proofSources.extractEntryOrdinal ?? extractSolutionEntry,
  });
  return {
    manifest,
    manifestContent: await referenceSourceBytes(manifestOutput.content, sha256),
    executionIndex,
    execution,
    proofIndex,
    proof,
    outputs: outputs.map((output) => ({ ...output, content: new Uint8Array(output.content) })),
  };
}

/** Engine-free attestation for an injected checked-leaf output collection. */
export async function attestP7bTrainingPackOutputs(
  repositoryRoot: string,
  packIdInput: string,
  outputs: readonly P7bTrainingPackOutput[],
  proofSources: P7bTrainingPackProofSourceOptions = {},
): Promise<P7bTrainingPackAttestation> {
  return attestOutputCollection(
    repositoryRoot,
    requirePackId(packIdInput),
    outputs,
    proofSources,
  );
}

export async function attestCheckedP7bTrainingPack(
  repositoryRoot: string,
  packIdInput: string,
): Promise<P7bTrainingPackAttestation> {
  const packId = requirePackId(packIdInput);
  const targets = resolveP7bTrainingPackTransactionTargets(repositoryRoot, packId);
  await assertTrustedDirectoryChain(
    targets.repositoryRoot,
    targets.checkedRoot,
    `checked P7B pack ${packId}`,
  );
  const suffixes = await listFiles(targets.checkedRoot);
  const plannedFiles: {
    readonly suffix: string;
    readonly path: string;
    readonly absolutePath: string;
    readonly byteLength: number;
  }[] = [];
  let plannedByteLength = 0;
  for (const suffix of suffixes) {
    const path = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}/${suffix}`;
    assertP7bTrainingPackOutputPath(repositoryRoot, packId, path);
    const absolutePath = resolve(targets.checkedRoot, suffix);
    const details = await lstat(absolutePath);
    if (!details.isFile() || details.isSymbolicLink()) {
      throw new Error(`checked P7B pack contains an invalid file: ${path}`);
    }
    if (details.size > P7B_MAX_PACK_OUTPUT_FILE_BYTES) {
      throw new Error(`checked P7B pack file exceeds its byte bound: ${path}`);
    }
    plannedByteLength += details.size;
    if (plannedByteLength > P7B_MAX_PACK_OUTPUT_TOTAL_BYTES) {
      throw new Error("checked P7B pack file byte total exceeds its bound");
    }
    plannedFiles.push({ suffix, path, absolutePath, byteLength: details.size });
  }
  const outputs: P7bTrainingPackOutput[] = [];
  for (const { path, absolutePath, byteLength } of plannedFiles) {
    const content = new Uint8Array(await readFile(absolutePath));
    if (content.byteLength !== byteLength) {
      throw new Error(`checked P7B pack file changed while being read: ${path}`);
    }
    outputs.push({ path, mediaType: mediaTypeFor(path), content });
  }
  return attestOutputCollection(repositoryRoot, packId, outputs);
}

async function planSharedPlayerFile(input: {
  readonly repositoryRoot: string;
  readonly relativePath: string;
  readonly maximumBytes: number;
  readonly label: string;
}): Promise<{ readonly absolutePath: string; readonly byteLength: number }> {
  const absolutePath = resolve(input.repositoryRoot, input.relativePath);
  safeDescendant(input.repositoryRoot, absolutePath, input.label);
  await assertTrustedDirectoryChain(
    input.repositoryRoot,
    dirname(absolutePath),
    input.label,
  );
  let details;
  try {
    details = await lstat(absolutePath);
  } catch (error) {
    if (isMissing(error)) throw new Error(`${input.label} is missing: ${input.relativePath}`);
    throw error;
  }
  if (details.isSymbolicLink() || !details.isFile() || details.size > input.maximumBytes) {
    throw new Error(`${input.label} is missing or invalid: ${input.relativePath}`);
  }
  return { absolutePath, byteLength: details.size };
}

async function readPlannedSharedPlayerFile(input: {
  readonly absolutePath: string;
  readonly byteLength: number;
  readonly label: string;
}): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(input.absolutePath));
  if (bytes.byteLength !== input.byteLength) {
    throw new Error(`${input.label} changed while being read`);
  }
  return bytes;
}

async function attestSharedPlayerBuild(
  repositoryRoot: string,
  manifest: P7bTrainingPackManifestV1,
): Promise<void> {
  const repository = resolve(repositoryRoot);
  const graphPlan = await planSharedPlayerFile({
    repositoryRoot: repository,
    relativePath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_ATTESTATION_BYTES,
    label: "shared player graph attestation",
  });
  const graphBytes = await readPlannedSharedPlayerFile({
    ...graphPlan,
    label: "shared player graph attestation",
  });
  const graphContent = await referenceSourceBytes(graphBytes, sha256);
  if (!sameReference(graphContent, manifest.sharedPlayer.graphAttestation.content)) {
    throw new Error("shared player graph attestation drifted from the checked pack contract");
  }
  const graph = parseP7SharedPlayerGraphAttestation(decoder.decode(graphBytes));
  if (
    graph.entry.path !== manifest.sharedPlayer.entry.path
    || !sameReference(graph.entry.content, manifest.sharedPlayer.entry.content)
    || manifest.sharedPlayer.levelPageHref !== buildP7bSharedPlayerLevelHref(graph.entry.content)
  ) throw new Error("shared player graph entry drifted from the checked pack contract");

  const sourcePlan = await planSharedPlayerFile({
    repositoryRoot: repository,
    relativePath: P7B_SHARED_PLAYER_SOURCE_ENTRY,
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
    label: "shared player source entry",
  });
  const viteManifestPlan = await planSharedPlayerFile({
    repositoryRoot: repository,
    relativePath: "web/dist/.vite/manifest.json",
    maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_MANIFEST_BYTES,
    label: "shared player Vite manifest",
  });
  const builtPlans = [];
  let builtByteLength = 0;
  for (const file of graph.files) {
    const plan = await planSharedPlayerFile({
      repositoryRoot: repository,
      relativePath: `web/dist/${file.path}`,
      maximumBytes: P7_SHARED_PLAYER_GRAPH_MAX_FILE_BYTES,
      label: "shared player dependency",
    });
    builtByteLength += plan.byteLength;
    if (builtByteLength > P7_SHARED_PLAYER_GRAPH_MAX_TOTAL_BYTES) {
      throw new Error("shared player dependency graph exceeds its total byte bound");
    }
    builtPlans.push({ path: file.path, ...plan });
  }
  const [sourceEntryBytes, viteManifestBytes, builtFiles] = await Promise.all([
    readPlannedSharedPlayerFile({ ...sourcePlan, label: "shared player source entry" }),
    readPlannedSharedPlayerFile({ ...viteManifestPlan, label: "shared player Vite manifest" }),
    Promise.all(builtPlans.map(async ({ path, ...plan }) => ({
      path,
      bytes: await readPlannedSharedPlayerFile({ ...plan, label: `shared player dependency ${path}` }),
    }))),
  ]);
  await attestP7SharedPlayerGraph({
    attestation: graph,
    sourceEntryBytes,
    sourceClosureRevision: graph.source.closureRevision,
    toolchainRevision: graph.toolchainRevision,
    viteManifestBytes,
    builtFiles,
    sha256,
  });
}

export async function loadCheckedP7bTrainingPackDistOutputs(
  repositoryRoot: string,
  packIdInput: string,
): Promise<readonly P7bTrainingPackOutput[]> {
  const packId = requirePackId(packIdInput);
  const attested = await attestCheckedP7bTrainingPack(repositoryRoot, packId);
  await attestSharedPlayerBuild(repositoryRoot, attested.manifest);
  const checkedPrefix = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}/`;
  return attested.outputs.map((output) => ({
    ...output,
    path: `${P7B_TRAINING_PACK_DIST_PARENT}/${packId}/${output.path.slice(checkedPrefix.length)}`,
    content: new Uint8Array(output.content),
  })).sort((left, right) => compareText(left.path, right.path));
}

async function writeLeaf(input: {
  readonly repositoryRoot: string;
  readonly outputRoot: string;
  readonly outputs: readonly { readonly suffix: string; readonly content: Uint8Array }[];
  readonly label: string;
}): Promise<void> {
  const root = resolve(input.repositoryRoot);
  const outputRoot = resolve(input.outputRoot);
  safeDescendant(root, outputRoot, `${input.label} fixed output root`);
  await assertTrustedDirectoryChain(root, outputRoot, input.label);
  const staging = await mkdtemp(resolve(root, ".p7b-training-pack-output-"));
  await assertTrustedDirectoryChain(root, staging, `${input.label} staging`);
  const fresh = resolve(staging, "new");
  const backup = resolve(staging, "old");
  let oldMoved = false;
  let newMoved = false;
  let preserve = false;
  try {
    const suffixes = new Set<string>();
    for (const output of input.outputs) {
      if (
        output.suffix.includes("\\")
        || output.suffix.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
        || suffixes.has(output.suffix)
      ) {
        throw new Error(`${input.label} contains an unsafe or duplicate output path`);
      }
      suffixes.add(output.suffix);
      const staged = resolve(fresh, output.suffix);
      safeDescendant(fresh, staged, `${input.label} staged output`);
      await mkdir(dirname(staged), { recursive: true });
      await writeFile(staged, output.content);
    }
    await mkdir(dirname(outputRoot), { recursive: true });
    await assertTrustedDirectoryChain(root, dirname(outputRoot), input.label);
    await assertTrustedDirectoryChain(root, outputRoot, input.label);
    try {
      await rename(outputRoot, backup);
      oldMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(fresh, outputRoot);
    newMoved = true;
  } catch (error) {
    const rollback: unknown[] = [];
    try {
      if (newMoved) await rm(outputRoot, { recursive: true, force: true });
    } catch (cause) {
      rollback.push(cause);
    }
    try {
      if (oldMoved) await rename(backup, outputRoot);
    } catch (cause) {
      rollback.push(cause);
    }
    if (rollback.length > 0) {
      preserve = true;
      throw new AggregateError(
        [error, ...rollback],
        `${input.label} rollback failed; recovery remains at ${staging}`,
      );
    }
    throw error;
  } finally {
    if (!preserve) await rm(staging, { recursive: true, force: true });
  }
}

export async function writeP7bTrainingPackCheckedOutputsTransactionally(
  repositoryRoot: string,
  packIdInput: string,
  outputs: readonly P7bTrainingPackOutput[],
): Promise<void> {
  const packId = requirePackId(packIdInput);
  const targets = resolveP7bTrainingPackTransactionTargets(repositoryRoot, packId);
  const attested = await attestP7bTrainingPackOutputs(repositoryRoot, packId, outputs);
  const prefix = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${packId}/`;
  await writeLeaf({
    repositoryRoot,
    outputRoot: targets.checkedRoot,
    label: `P7B checked pack ${packId}`,
    outputs: attested.outputs.map((output) => ({
      suffix: output.path.slice(prefix.length),
      content: output.content,
    })),
  });
}

export async function installCheckedP7bTrainingPackDistTransactionally(
  repositoryRoot: string,
  packIdInput: string,
): Promise<void> {
  const packId = requirePackId(packIdInput);
  const targets = resolveP7bTrainingPackTransactionTargets(repositoryRoot, packId);
  const outputs = await loadCheckedP7bTrainingPackDistOutputs(repositoryRoot, packId);
  const prefix = `${P7B_TRAINING_PACK_DIST_PARENT}/${packId}/`;
  await writeLeaf({
    repositoryRoot,
    outputRoot: targets.distRoot,
    label: `P7B dist pack ${packId}`,
    outputs: outputs.map((output) => ({
      suffix: output.path.slice(prefix.length),
      content: output.content,
    })),
  });
}
