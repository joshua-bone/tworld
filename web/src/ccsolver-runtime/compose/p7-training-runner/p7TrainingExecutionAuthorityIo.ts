import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import type { CanonicalJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7_TRAINING_EXECUTION_INDEX_MAX_BYTES,
  canonicalizeP7TrainingExecutionIndex,
  parseP7TrainingExecutionIndex,
} from "../p7b-training-review/p7TrainingExecutionIndex";
import type { P7TrainingExecutionIndexArtifact } from "./p7TrainingEngineRunnerCore";

export const P7_TRAINING_EXECUTION_AUTHORITY_PARENT =
  "ccsolver/fixtures/golden/p7b/execution-authorities" as const;

const PACK_IDS: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
let transactionOrdinal = 0;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sameReference(
  left: P7TrainingExecutionIndexArtifact["content"],
  right: P7TrainingExecutionIndexArtifact["content"],
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

export function p7TrainingExecutionAuthorityPath(packId: P7TrainingPackId): string {
  if (!PACK_IDS.includes(packId)) throw new Error(`unsupported P7 execution authority pack: ${packId}`);
  return `${P7_TRAINING_EXECUTION_AUTHORITY_PARENT}/${packId}.json`;
}

async function requiredRoot(repositoryRoot: string): Promise<string> {
  const root = resolve(repositoryRoot);
  const details = await lstat(root);
  if (details.isSymbolicLink()) throw new Error("P7 authority repository root is a symbolic link");
  if (!details.isDirectory()) throw new Error("P7 authority repository root is not a directory");
  return root;
}

async function directoryChain(input: {
  readonly repositoryRoot: string;
  readonly relativeDirectory: string;
  readonly create: boolean;
}): Promise<string> {
  const root = await requiredRoot(input.repositoryRoot);
  let current = root;
  for (const segment of input.relativeDirectory.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || segment.includes("\\")) {
      throw new Error("P7 authority directory is unsafe");
    }
    current = resolve(current, segment);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (!isMissing(error) || !input.create) {
        if (isMissing(error)) throw new Error(`P7 authority directory is missing: ${input.relativeDirectory}`);
        throw error;
      }
      await mkdir(current);
      details = await lstat(current);
    }
    if (details.isSymbolicLink()) throw new Error(`P7 authority directory is a symbolic link: ${input.relativeDirectory}`);
    if (!details.isDirectory()) throw new Error(`P7 authority directory is invalid: ${input.relativeDirectory}`);
  }
  return current;
}

async function checkedAuthority(input: {
  readonly packId: P7TrainingPackId;
  readonly artifact: P7TrainingExecutionIndexArtifact;
  readonly sha256: Sha256Port;
}): Promise<CanonicalJson> {
  const parsed = parseP7TrainingExecutionIndex(input.artifact.canonicalJson);
  if (
    parsed.pack.packId !== input.packId
    || canonicalizeP7TrainingExecutionIndex(input.artifact.index) !== input.artifact.canonicalJson
    || !sameReference(
      await referenceCanonicalJson(input.artifact.canonicalJson, input.sha256),
      input.artifact.content,
    )
  ) throw new Error(`${input.packId} P7 authority bytes or identity drifted`);
  return input.artifact.canonicalJson;
}

async function existingAuthorities(repositoryRoot: string): Promise<Map<P7TrainingPackId, Uint8Array>> {
  let root: string;
  try {
    root = await directoryChain({
      repositoryRoot,
      relativeDirectory: P7_TRAINING_EXECUTION_AUTHORITY_PARENT,
      create: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("is missing")) return new Map();
    throw error;
  }
  const result = new Map<P7TrainingPackId, Uint8Array>();
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`P7 authority leaf is a symbolic link: ${entry.name}`);
    const packId = PACK_IDS.find((candidate) => entry.name === `${candidate}.json`);
    if (packId === undefined || !entry.isFile()) {
      throw new Error(`P7 authority directory contains an unexpected entry: ${entry.name}`);
    }
    const absolute = resolve(root, entry.name);
    const details = await lstat(absolute);
    if (details.isSymbolicLink() || !details.isFile() || details.size > P7_TRAINING_EXECUTION_INDEX_MAX_BYTES) {
      throw new Error(`P7 authority leaf is invalid: ${entry.name}`);
    }
    const bytes = new Uint8Array(await readFile(absolute));
    if (bytes.byteLength !== details.size) throw new Error(`P7 authority changed while read: ${entry.name}`);
    const parsed = parseP7TrainingExecutionIndex(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    if (parsed.pack.packId !== packId) {
      throw new Error(`P7 authority filename identity drifted: ${entry.name}`);
    }
    result.set(packId, bytes);
  }
  return result;
}

export interface P7TrainingLoadedExecutionAuthority {
  readonly packId: P7TrainingPackId;
  readonly artifact: P7TrainingExecutionIndexArtifact;
}

export async function loadCheckedP7TrainingExecutionAuthorities(input: {
  readonly repositoryRoot: string;
  readonly packIds: readonly P7TrainingPackId[];
  readonly sha256: Sha256Port;
}): Promise<readonly P7TrainingLoadedExecutionAuthority[]> {
  if (
    input.packIds.length < 1
    || input.packIds.length > PACK_IDS.length
    || input.packIds.some((packId, index) => (
      PACK_IDS.indexOf(packId) <= (index === 0 ? -1 : PACK_IDS.indexOf(input.packIds[index - 1]!))
    ))
  ) throw new Error("P7 authority load requires a strict ordered pack subset");
  const existing = await existingAuthorities(input.repositoryRoot);
  const loaded: P7TrainingLoadedExecutionAuthority[] = [];
  for (const packId of input.packIds) {
    const bytes = existing.get(packId);
    if (bytes === undefined) throw new Error(`${packId} checked P7 execution authority is missing`);
    const canonicalJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes) as CanonicalJson;
    const index = parseP7TrainingExecutionIndex(canonicalJson);
    const content = await referenceCanonicalJson(canonicalJson, input.sha256);
    loaded.push({
      packId,
      artifact: { index, canonicalJson, content, evidenceOutputs: [] },
    });
  }
  return loaded;
}

/** Explicit graph-free transaction; preserves unselected checked authorities. */
export async function writeP7TrainingExecutionAuthoritiesTransactionally(input: {
  readonly repositoryRoot: string;
  readonly authorities: readonly {
    readonly packId: P7TrainingPackId;
    readonly artifact: P7TrainingExecutionIndexArtifact;
  }[];
  readonly sha256: Sha256Port;
}): Promise<void> {
  if (input.authorities.length < 1 || input.authorities.length > PACK_IDS.length) {
    throw new Error("P7 authority transaction requires a nonempty bounded pack set");
  }
  const selected = new Map<P7TrainingPackId, Uint8Array>();
  for (const { packId, artifact } of input.authorities) {
    if (selected.has(packId)) throw new Error(`duplicate P7 authority pack: ${packId}`);
    selected.set(packId, new TextEncoder().encode(await checkedAuthority({
      packId,
      artifact,
      sha256: input.sha256,
    })));
  }
  const desired = await existingAuthorities(input.repositoryRoot);
  selected.forEach((bytes, packId) => desired.set(packId, bytes));
  const parentRelative = dirname(P7_TRAINING_EXECUTION_AUTHORITY_PARENT).split(sep).join("/");
  const parent = await directoryChain({
    repositoryRoot: input.repositoryRoot,
    relativeDirectory: parentRelative,
    create: true,
  });
  const target = resolve(input.repositoryRoot, P7_TRAINING_EXECUTION_AUTHORITY_PARENT);
  transactionOrdinal += 1;
  const suffix = `${process.pid}-${transactionOrdinal}`;
  const staging = resolve(parent, `.execution-authorities.staging-${suffix}`);
  const backup = resolve(parent, `.execution-authorities.backup-${suffix}`);
  await mkdir(staging);
  let targetMoved = false;
  let installed = false;
  try {
    for (const packId of PACK_IDS) {
      const bytes = desired.get(packId);
      if (bytes !== undefined) await writeFile(resolve(staging, `${packId}.json`), bytes, { flag: "wx" });
    }
    try {
      const details = await lstat(target);
      if (details.isSymbolicLink()) throw new Error("P7 authority target is a symbolic link");
      if (!details.isDirectory()) throw new Error("P7 authority target is not a directory");
      await rename(target, backup);
      targetMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(staging, target);
    installed = true;
    if (targetMoved) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (targetMoved && !installed) await rename(backup, target).catch(() => undefined);
    throw error;
  } finally {
    if (!installed) await rm(staging, { recursive: true, force: true });
  }
}

export async function attestCheckedP7TrainingExecutionAuthorities(input: {
  readonly repositoryRoot: string;
  readonly authorities: readonly {
    readonly packId: P7TrainingPackId;
    readonly artifact: P7TrainingExecutionIndexArtifact;
  }[];
  readonly sha256: Sha256Port;
}): Promise<readonly { readonly packId: P7TrainingPackId; readonly content: P7TrainingExecutionIndexArtifact["content"] }[]> {
  const result = [];
  for (const { packId, artifact } of input.authorities) {
    await checkedAuthority({ packId, artifact, sha256: input.sha256 });
    const relativePath = p7TrainingExecutionAuthorityPath(packId);
    await directoryChain({
      repositoryRoot: input.repositoryRoot,
      relativeDirectory: dirname(relativePath).split(sep).join("/"),
      create: false,
    });
    const absolute = resolve(input.repositoryRoot, relativePath);
    const details = await lstat(absolute).catch((error) => {
      if (isMissing(error)) throw new Error(`${packId} checked P7 execution authority is missing`);
      throw error;
    });
    if (details.isSymbolicLink() || !details.isFile() || details.size > P7_TRAINING_EXECUTION_INDEX_MAX_BYTES) {
      throw new Error(`${packId} checked P7 execution authority is invalid`);
    }
    const canonicalJson = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(absolute));
    const parsed = parseP7TrainingExecutionIndex(canonicalJson);
    const canonical = canonicalizeP7TrainingExecutionIndex(parsed);
    if (
      parsed.pack.packId !== packId
      || canonical !== artifact.canonicalJson
      || !sameReference(await referenceCanonicalJson(canonical, input.sha256), artifact.content)
    ) throw new Error(`${packId} checked P7 execution authority drifted`);
    result.push({ packId, content: artifact.content });
  }
  return result;
}
