import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
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
import {
  P7_TRAINING_LEVELS_PER_PACK,
  P7_TRAINING_SHARD_COUNT,
  P7_TRAINING_SHARD_LIMITS,
  type P7TrainingPersistEvidence,
  type P7TrainingVerifyPersistedEvidence,
} from "../p7-training-execution/p7TrainingShardProtocol";
import {
  canonicalizeP7GeneratedEvidenceSidecarIndex,
  materializeP7GeneratedEvidenceSidecar,
  parseP7GeneratedEvidenceSidecarIndex,
  type P7GeneratedEvidenceSidecarV1,
} from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  p7TrainingEvidencePaths,
  parseP7TrainingOccurrenceId,
  type P7TrainingRunnerEvidenceDescriptorV1,
} from "./p7TrainingRunnerContract";

const SAFE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
let temporaryOrdinal = 0;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

export function assertP7TrainingArtifactRelativePath(path: string): string {
  if (
    typeof path !== "string"
    || path.length === 0
    || encoder.encode(path).byteLength > 2_048
    || !SAFE_PATH_PATTERN.test(path)
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`P7 training artifact path is unsafe: ${path}`);
  return path;
}

function shardBounds(shardIndex: number): { readonly start: number; readonly end: number } {
  if (!Number.isSafeInteger(shardIndex) || shardIndex < 0 || shardIndex >= P7_TRAINING_SHARD_COUNT) {
    throw new Error("P7 training filesystem shard index is invalid");
  }
  const base = Math.floor(P7_TRAINING_LEVELS_PER_PACK / P7_TRAINING_SHARD_COUNT);
  const remainder = P7_TRAINING_LEVELS_PER_PACK % P7_TRAINING_SHARD_COUNT;
  const start = shardIndex * base + Math.min(shardIndex, remainder) + 1;
  return { start, end: start + base + Number(shardIndex < remainder) - 1 };
}

async function requiredDirectory(path: string, label: string): Promise<void> {
  let details;
  try {
    details = await lstat(path);
  } catch (error) {
    if (isMissing(error)) throw new Error(`${label} is missing`);
    throw error;
  }
  if (details.isSymbolicLink()) throw new Error(`${label} is a symbolic link`);
  if (!details.isDirectory()) throw new Error(`${label} is not a directory`);
}

export class P7TrainingArtifactFilesystem {
  readonly artifactRoot: string;
  readonly trustedRoot: string;
  readonly packId: P7TrainingPackId;
  readonly shardIndex: number;
  readonly sha256: Sha256Port;

  constructor(input: {
    readonly artifactRoot: string;
    readonly trustedRoot?: string;
    readonly packId: P7TrainingPackId;
    readonly shardIndex: number;
    readonly sha256: Sha256Port;
  }) {
    this.artifactRoot = resolve(input.artifactRoot);
    this.trustedRoot = resolve(input.trustedRoot ?? input.artifactRoot);
    this.packId = input.packId;
    this.shardIndex = input.shardIndex;
    this.sha256 = input.sha256;
    shardBounds(this.shardIndex);
    parseP7TrainingOccurrenceId({ occurrenceId: `${this.packId}/001`, packId: this.packId });
    const descendantPath = relative(this.trustedRoot, this.artifactRoot);
    if (descendantPath === ".." || descendantPath.startsWith(`..${sep}`) || resolve(this.trustedRoot, descendantPath) !== this.artifactRoot) {
      throw new Error("P7 training artifact root escapes its trusted root");
    }
  }

  async initialize(): Promise<void> {
    await requiredDirectory(this.trustedRoot, "P7 training trusted artifact root");
    const suffix = relative(this.trustedRoot, this.artifactRoot);
    let current = this.trustedRoot;
    for (const segment of suffix === "" ? [] : suffix.split(sep)) {
      current = resolve(current, segment);
      let details;
      try {
        details = await lstat(current);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await mkdir(current);
        details = await lstat(current);
      }
      if (details.isSymbolicLink()) throw new Error("P7 training artifact ancestor is a symbolic link");
      if (!details.isDirectory()) throw new Error("P7 training artifact ancestor is not a directory");
    }
  }

  private absolutePath(relativePath: string): string {
    const safe = assertP7TrainingArtifactRelativePath(relativePath);
    const absolute = resolve(this.artifactRoot, safe);
    const prefix = `${this.artifactRoot}${sep}`;
    if (!absolute.startsWith(prefix)) throw new Error(`P7 training artifact path is unsafe: ${safe}`);
    return absolute;
  }

  private async ensureDirectory(relativePath: string): Promise<string> {
    const safe = assertP7TrainingArtifactRelativePath(relativePath);
    await this.initialize();
    let current = this.artifactRoot;
    for (const segment of safe.split("/")) {
      current = resolve(current, segment);
      let details;
      try {
        details = await lstat(current);
      } catch (error) {
        if (!isMissing(error)) throw error;
        await mkdir(current);
        details = await lstat(current);
      }
      if (details.isSymbolicLink()) {
        throw new Error(`P7 training artifact parent is a symbolic link: ${safe}`);
      }
      if (!details.isDirectory()) {
        throw new Error(`P7 training artifact parent is not a directory: ${safe}`);
      }
    }
    return current;
  }

  private async assertDirectory(relativePath: string): Promise<string> {
    const absolute = this.absolutePath(relativePath);
    await this.initialize();
    let current = this.artifactRoot;
    for (const segment of assertP7TrainingArtifactRelativePath(relativePath).split("/")) {
      current = resolve(current, segment);
      await requiredDirectory(current, `P7 training artifact directory ${relativePath}`);
    }
    return absolute;
  }

  async writeRegularFile(relativePath: string, bytes: Uint8Array, maximumBytes: number): Promise<void> {
    const safe = assertP7TrainingArtifactRelativePath(relativePath);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > maximumBytes) {
      throw new Error(`P7 training artifact file exceeds its byte bound: ${safe}`);
    }
    const parent = dirname(safe).split(sep).join("/");
    if (parent === ".") await this.initialize();
    else await this.ensureDirectory(parent);
    const absolute = this.absolutePath(safe);
    try {
      const existing = await lstat(absolute);
      if (existing.isSymbolicLink()) {
        throw new Error(`P7 training artifact file is a symbolic link: ${safe}`);
      }
      if (!existing.isFile()) throw new Error(`P7 training artifact target is not a file: ${safe}`);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    temporaryOrdinal += 1;
    const temporary = `${absolute}.tmp-${process.pid}-${temporaryOrdinal}`;
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, absolute);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async writeCanonicalJson(
    relativePath: string,
    canonicalJson: CanonicalJson | string,
    maximumBytes: number,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(canonicalJson) as unknown;
    } catch (error) {
      throw new Error("P7 training artifact canonical JSON is invalid", { cause: error });
    }
    if (canonicalizeJson(parsed as CanonicalJsonValue) !== canonicalJson) {
      throw new Error("P7 training artifact JSON is not canonical");
    }
    await this.writeRegularFile(relativePath, encoder.encode(canonicalJson), maximumBytes);
  }

  async readRegularFile(relativePath: string, maximumBytes: number): Promise<Uint8Array> {
    const safe = assertP7TrainingArtifactRelativePath(relativePath);
    const absolute = this.absolutePath(safe);
    const parent = dirname(safe).split(sep).join("/");
    if (parent === ".") await this.initialize();
    else await this.assertDirectory(parent);
    let details;
    try {
      details = await lstat(absolute);
    } catch (error) {
      if (isMissing(error)) throw new Error(`P7 training artifact file is missing: ${safe}`);
      throw error;
    }
    if (details.isSymbolicLink()) throw new Error(`P7 training artifact file is a symbolic link: ${safe}`);
    if (!details.isFile()) throw new Error(`P7 training artifact path is not a file: ${safe}`);
    if (details.size > maximumBytes) throw new Error(`P7 training artifact file exceeds its byte bound: ${safe}`);
    const bytes = new Uint8Array(await readFile(absolute));
    if (bytes.byteLength !== details.size) throw new Error(`P7 training artifact file changed while read: ${safe}`);
    return bytes;
  }

  async readCanonicalJson(relativePath: string, maximumBytes: number): Promise<CanonicalJson> {
    const bytes = await this.readRegularFile(relativePath, maximumBytes);
    let value: unknown;
    let text: string;
    try {
      text = decoder.decode(bytes);
      value = JSON.parse(text) as unknown;
    } catch (error) {
      throw new Error(`P7 training artifact JSON is invalid: ${relativePath}`, { cause: error });
    }
    if (canonicalizeJson(value as CanonicalJsonValue) !== text) {
      throw new Error(`P7 training artifact JSON is not canonical: ${relativePath}`);
    }
    return text as CanonicalJson;
  }

  async referenceRegularFile(
    relativePath: string,
    maximumBytes: number,
    sha256: Sha256Port,
  ): Promise<BlobReferenceV1> {
    return referenceSourceBytes(await this.readRegularFile(relativePath, maximumBytes), sha256);
  }

  async listRegularFiles(maximumFiles = 2_048): Promise<readonly string[]> {
    if (!Number.isSafeInteger(maximumFiles) || maximumFiles < 1) {
      throw new Error("P7 training artifact file-count bound is invalid");
    }
    await this.initialize();
    const files: string[] = [];
    const walk = async (relativeDirectory: string): Promise<void> => {
      const absoluteDirectory = relativeDirectory === ""
        ? this.artifactRoot
        : this.absolutePath(relativeDirectory);
      for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
        const child = relativeDirectory === "" ? entry.name : `${relativeDirectory}/${entry.name}`;
        assertP7TrainingArtifactRelativePath(child);
        const details = await lstat(resolve(absoluteDirectory, entry.name));
        if (details.isSymbolicLink()) {
          throw new Error(`P7 training artifact tree contains a symbolic link: ${child}`);
        }
        if (details.isDirectory()) {
          await walk(child);
          continue;
        }
        if (!details.isFile()) {
          throw new Error(`P7 training artifact tree contains a non-regular file: ${child}`);
        }
        files.push(child);
        if (files.length > maximumFiles) {
          throw new Error("P7 training artifact tree exceeds its file-count bound");
        }
      }
    };
    await walk("");
    return files.sort();
  }

  readonly persistEvidence: P7TrainingPersistEvidence = async ({ occurrenceId, sidecar }) => {
    const occurrence = parseP7TrainingOccurrenceId({ occurrenceId, packId: this.packId });
    const bounds = shardBounds(this.shardIndex);
    if (occurrence.levelNumber < bounds.start || occurrence.levelNumber > bounds.end) {
      throw new Error(`${occurrenceId} is outside P7 shard ${this.shardIndex}`);
    }
    await this.validateSidecar(occurrenceId, sidecar);
    const paths = p7TrainingEvidencePaths({
      shardIndex: this.shardIndex,
      occurrenceId,
      packId: this.packId,
      levelNumber: occurrence.levelNumber,
    });
    // The canonical index is the commit marker for the payload pair.
    await this.writeRegularFile(
      paths.payloadPath,
      sidecar.payload,
      P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
    );
    await this.writeCanonicalJson(
      paths.indexPath,
      sidecar.indexCanonicalJson,
      P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes,
    );
  };

  private async validateSidecar(
    occurrenceId: string,
    sidecar: P7GeneratedEvidenceSidecarV1,
  ): Promise<void> {
    const index = parseP7GeneratedEvidenceSidecarIndex(sidecar.index);
    const canonicalJson = canonicalizeP7GeneratedEvidenceSidecarIndex(index);
    if (
      !index.scopeId.startsWith(`${occurrenceId}/`)
      || canonicalJson !== sidecar.indexCanonicalJson
      || !sameReference(
        await referenceCanonicalJson(canonicalJson, this.sha256),
        sidecar.indexContent,
      )
      || !sameReference(
        await referenceSourceBytes(sidecar.payload, this.sha256),
        index.payloadContent,
      )
    ) throw new Error(`${occurrenceId} P7 sidecar identity drifted`);
  }

  readonly verifyEvidence: P7TrainingVerifyPersistedEvidence = async ({
    occurrenceId,
    index: expectedIndex,
    indexContent: expectedIndexContent,
    sha256,
  }) => {
    const occurrence = parseP7TrainingOccurrenceId({ occurrenceId, packId: this.packId });
    const paths = p7TrainingEvidencePaths({
      shardIndex: this.shardIndex,
      occurrenceId,
      packId: this.packId,
      levelNumber: occurrence.levelNumber,
    });
    const indexCanonicalJson = await this.readCanonicalJson(
      paths.indexPath,
      P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes,
    );
    const index = parseP7GeneratedEvidenceSidecarIndex(JSON.parse(indexCanonicalJson) as unknown);
    if (
      canonicalizeP7GeneratedEvidenceSidecarIndex(expectedIndex) !== indexCanonicalJson
      || !sameReference(
        await referenceCanonicalJson(indexCanonicalJson, sha256),
        expectedIndexContent,
      )
    ) throw new Error(`${occurrenceId} P7 evidence index digest drifted`);
    const payload = await this.readRegularFile(
      paths.payloadPath,
      P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
    );
    if (!sameReference(await referenceSourceBytes(payload, sha256), index.payloadContent)) {
      throw new Error(`${occurrenceId} P7 evidence payload digest drifted`);
    }
    await materializeP7GeneratedEvidenceSidecar({
      index,
      indexCanonicalJson,
      indexContent: expectedIndexContent,
      payload,
      limits: {
        maximumBlobCount: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel,
        maximumBlobBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes,
        maximumTotalBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
      },
      sha256,
    });
    return { indexCanonicalJson, payload };
  };

  private async listedNames(relativePath: string): Promise<readonly string[]> {
    const absolute = await this.assertDirectory(relativePath);
    const entries = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new Error(`P7 training artifact tree contains a symbolic link: ${relativePath}/${entry.name}`);
      }
    }
    return entries.map(({ name }) => name).sort();
  }

  async collectShardEvidence(input: {
    readonly occurrenceIds: readonly string[];
    readonly sha256: Sha256Port;
  }): Promise<readonly P7TrainingRunnerEvidenceDescriptorV1[]> {
    const expected = new Map<number, string>();
    const bounds = shardBounds(this.shardIndex);
    for (const occurrenceId of input.occurrenceIds) {
      const occurrence = parseP7TrainingOccurrenceId({ occurrenceId, packId: this.packId });
      if (occurrence.levelNumber < bounds.start || occurrence.levelNumber > bounds.end) {
        throw new Error(`${occurrenceId} is outside P7 shard ${this.shardIndex}`);
      }
      if (expected.has(occurrence.levelNumber)) {
        throw new Error(`duplicate P7 sidecar occurrence: ${occurrenceId}`);
      }
      expected.set(occurrence.levelNumber, occurrenceId);
    }
    const evidenceRoot = `shards/${this.shardIndex}/evidence`;
    let roots: readonly string[];
    try {
      roots = await this.listedNames(evidenceRoot);
    } catch (error) {
      if (error instanceof Error && error.message.includes("is missing")) {
        throw new Error(`P7 sidecar tree is missing for shard ${this.shardIndex}`);
      }
      throw error;
    }
    if (roots.length !== 1 || roots[0] !== this.packId) {
      throw new Error(`P7 sidecar tree contains an unexpected pack for shard ${this.shardIndex}`);
    }
    const packRoot = `${evidenceRoot}/${this.packId}`;
    const leaves = await this.listedNames(packRoot);
    const expectedLeaves = [...expected.keys()].sort((left, right) => left - right)
      .map((levelNumber) => String(levelNumber).padStart(3, "0"));
    if (
      leaves.length !== expectedLeaves.length
      || leaves.some((leaf, index) => leaf !== expectedLeaves[index])
    ) {
      const missing = expectedLeaves.find((leaf) => !leaves.includes(leaf));
      if (missing !== undefined) throw new Error(`P7 sidecar is missing: ${this.packId}/${missing}`);
      throw new Error(`P7 sidecar tree contains an unexpected occurrence for shard ${this.shardIndex}`);
    }
    const descriptors: P7TrainingRunnerEvidenceDescriptorV1[] = [];
    for (const levelNumber of [...expected.keys()].sort((left, right) => left - right)) {
      const occurrenceId = expected.get(levelNumber)!;
      const paths = p7TrainingEvidencePaths({
        shardIndex: this.shardIndex,
        occurrenceId,
        packId: this.packId,
        levelNumber,
      });
      const leaf = dirname(paths.indexPath).split(sep).join("/");
      const files = await this.listedNames(leaf);
      if (
        files.length !== 2
        || files[0] !== "index.json"
        || files[1] !== "payload.bin"
      ) throw new Error(`P7 sidecar leaf contains an unexpected or missing file: ${occurrenceId}`);
      const indexCanonicalJson = await this.readCanonicalJson(
        paths.indexPath,
        P7_TRAINING_SHARD_LIMITS.maximumLevelResultBytes,
      );
      const index = parseP7GeneratedEvidenceSidecarIndex(JSON.parse(indexCanonicalJson) as unknown);
      if (!index.scopeId.startsWith(`${occurrenceId}/`)) {
        throw new Error(`${occurrenceId} P7 sidecar scope drifted`);
      }
      const indexContent = await referenceCanonicalJson(indexCanonicalJson, input.sha256);
      const payload = await this.readRegularFile(
        paths.payloadPath,
        P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
      );
      const payloadContent = await referenceSourceBytes(payload, input.sha256);
      if (!sameReference(payloadContent, index.payloadContent)) {
        throw new Error(`${occurrenceId} P7 evidence payload digest drifted`);
      }
      await materializeP7GeneratedEvidenceSidecar({
        index,
        indexCanonicalJson,
        indexContent,
        payload,
        limits: {
          maximumBlobCount: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobCountPerLevel,
          maximumBlobBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBlobBytes,
          maximumTotalBytes: P7_TRAINING_SHARD_LIMITS.maximumEvidenceBytesPerLevel,
        },
        sha256: input.sha256,
      });
      descriptors.push({
        occurrenceId,
        levelNumber,
        indexPath: paths.indexPath,
        indexContent,
        payloadPath: paths.payloadPath,
        payloadContent,
      });
    }
    return descriptors;
  }
}
