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
import type { BlobReferenceV1, CanonicalJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7_TRAINING_PRESENTATION_MAX_BYTES,
  canonicalizeP7TrainingPresentationAuthority,
  parseP7TrainingPresentationAuthority,
  type P7TrainingPresentationAuthorityV1,
} from "./p7TrainingPresentationContract";

export const P7_TRAINING_PRESENTATION_AUTHORITY_PARENT =
  "ccsolver/fixtures/golden/p7b/presentation-authorities" as const;

const PACK_IDS: readonly P7TrainingPackId[] = ["cclp1", "cclp4", "cclp5"];
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
let transactionOrdinal = 0;

export interface P7TrainingPresentationAuthorityArtifact {
  readonly packId: P7TrainingPackId;
  readonly authority: P7TrainingPresentationAuthorityV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

export function p7TrainingPresentationAuthorityPath(packId: P7TrainingPackId): string {
  if (!PACK_IDS.includes(packId)) throw new Error(`unsupported P7 presentation authority: ${packId}`);
  return `${P7_TRAINING_PRESENTATION_AUTHORITY_PARENT}/${packId}.json`;
}

async function directoryChain(input: {
  readonly repositoryRoot: string;
  readonly relativeDirectory: string;
  readonly create: boolean;
}): Promise<string> {
  const root = resolve(input.repositoryRoot);
  const rootDetails = await lstat(root);
  if (rootDetails.isSymbolicLink() || !rootDetails.isDirectory()) {
    throw new Error("P7 presentation authority repository root is invalid");
  }
  let current = root;
  for (const segment of input.relativeDirectory.split("/")) {
    if (segment === "" || segment === "." || segment === ".." || segment.includes("\\")) {
      throw new Error("P7 presentation authority directory is unsafe");
    }
    current = resolve(current, segment);
    let details;
    try {
      details = await lstat(current);
    } catch (error) {
      if (!isMissing(error) || !input.create) {
        if (isMissing(error)) throw new Error("P7 presentation authority directory is missing");
        throw error;
      }
      await mkdir(current);
      details = await lstat(current);
    }
    if (details.isSymbolicLink() || !details.isDirectory()) {
      throw new Error("P7 presentation authority directory is invalid or symbolic");
    }
  }
  return current;
}

async function checkedArtifact(input: {
  readonly artifact: P7TrainingPresentationAuthorityArtifact;
  readonly sha256: Sha256Port;
}): Promise<Uint8Array> {
  const parsed = parseP7TrainingPresentationAuthority(input.artifact.canonicalJson);
  if (
    parsed.packId !== input.artifact.packId
    || canonicalizeP7TrainingPresentationAuthority(input.artifact.authority) !== input.artifact.canonicalJson
    || !sameReference(
      await referenceCanonicalJson(input.artifact.canonicalJson, input.sha256),
      input.artifact.content,
    )
  ) throw new Error(`${input.artifact.packId} P7 presentation authority drifted`);
  return encoder.encode(input.artifact.canonicalJson);
}

async function existingAuthorities(
  repositoryRoot: string,
  sha256: Sha256Port,
): Promise<Map<P7TrainingPackId, P7TrainingPresentationAuthorityArtifact>> {
  let root: string;
  try {
    root = await directoryChain({
      repositoryRoot,
      relativeDirectory: P7_TRAINING_PRESENTATION_AUTHORITY_PARENT,
      create: false,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("is missing")) return new Map();
    throw error;
  }
  const authorities = new Map<P7TrainingPackId, P7TrainingPresentationAuthorityArtifact>();
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const packId = PACK_IDS.find((candidate) => entry.name === `${candidate}.json`);
    if (entry.isSymbolicLink() || !entry.isFile() || packId === undefined) {
      throw new Error(`unexpected P7 presentation authority entry: ${entry.name}`);
    }
    const absolute = resolve(root, entry.name);
    const details = await lstat(absolute);
    if (details.isSymbolicLink() || !details.isFile() || details.size > P7_TRAINING_PRESENTATION_MAX_BYTES) {
      throw new Error(`invalid P7 presentation authority entry: ${entry.name}`);
    }
    const bytes = new Uint8Array(await readFile(absolute));
    if (bytes.byteLength !== details.size) {
      throw new Error(`P7 presentation authority changed while read: ${entry.name}`);
    }
    const canonicalJson = decoder.decode(bytes) as CanonicalJson;
    const authority = parseP7TrainingPresentationAuthority(canonicalJson);
    if (authority.packId !== packId) {
      throw new Error(`P7 presentation authority filename identity drifted: ${entry.name}`);
    }
    authorities.set(packId, {
      packId,
      authority,
      canonicalJson,
      content: await referenceCanonicalJson(canonicalJson, sha256),
    });
  }
  return authorities;
}

export async function loadCheckedP7TrainingPresentationAuthorities(input: {
  readonly repositoryRoot: string;
  readonly packIds: readonly P7TrainingPackId[];
  readonly sha256: Sha256Port;
}): Promise<readonly P7TrainingPresentationAuthorityArtifact[]> {
  if (
    input.packIds.length < 1
    || input.packIds.length > PACK_IDS.length
    || input.packIds.some((packId, index) => (
      PACK_IDS.indexOf(packId) <= (index === 0 ? -1 : PACK_IDS.indexOf(input.packIds[index - 1]!))
    ))
  ) throw new Error("P7 presentation authority load requires a strict ordered pack subset");
  const existing = await existingAuthorities(input.repositoryRoot, input.sha256);
  return input.packIds.map((packId) => {
    const artifact = existing.get(packId);
    if (artifact === undefined) throw new Error(`${packId} checked P7 presentation authority is missing`);
    return artifact;
  });
}

/** Explicit transaction; preserves and validates all unselected presentation receipts. */
export async function writeP7TrainingPresentationAuthoritiesTransactionally(input: {
  readonly repositoryRoot: string;
  readonly authorities: readonly P7TrainingPresentationAuthorityArtifact[];
  readonly sha256: Sha256Port;
}): Promise<void> {
  if (input.authorities.length < 1 || input.authorities.length > PACK_IDS.length) {
    throw new Error("P7 presentation authority transaction requires a nonempty pack set");
  }
  const selected = new Map<P7TrainingPackId, Uint8Array>();
  for (const artifact of input.authorities) {
    if (selected.has(artifact.packId)) {
      throw new Error(`duplicate P7 presentation authority: ${artifact.packId}`);
    }
    selected.set(artifact.packId, await checkedArtifact({ artifact, sha256: input.sha256 }));
  }
  const existing = await existingAuthorities(input.repositoryRoot, input.sha256);
  const desired = new Map<P7TrainingPackId, Uint8Array>();
  existing.forEach((artifact, packId) => desired.set(packId, encoder.encode(artifact.canonicalJson)));
  selected.forEach((bytes, packId) => desired.set(packId, bytes));

  const parentRelative = dirname(P7_TRAINING_PRESENTATION_AUTHORITY_PARENT).split(sep).join("/");
  const parent = await directoryChain({
    repositoryRoot: input.repositoryRoot,
    relativeDirectory: parentRelative,
    create: true,
  });
  const target = resolve(input.repositoryRoot, P7_TRAINING_PRESENTATION_AUTHORITY_PARENT);
  transactionOrdinal += 1;
  const suffix = `${process.pid}-${transactionOrdinal}`;
  const staging = resolve(parent, `.presentation-authorities.staging-${suffix}`);
  const backup = resolve(parent, `.presentation-authorities.backup-${suffix}`);
  await mkdir(staging);
  let targetMoved = false;
  let installed = false;
  try {
    for (const packId of PACK_IDS) {
      const bytes = desired.get(packId);
      if (bytes !== undefined) {
        await writeFile(resolve(staging, `${packId}.json`), bytes, { flag: "wx" });
      }
    }
    try {
      const details = await lstat(target);
      if (details.isSymbolicLink() || !details.isDirectory()) {
        throw new Error("P7 presentation authority target is invalid or symbolic");
      }
      await rename(target, backup);
      targetMoved = true;
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rename(staging, target);
    installed = true;
    if (targetMoved) await rm(backup, { force: true, recursive: true });
  } catch (error) {
    if (targetMoved && !installed) await rename(backup, target).catch(() => undefined);
    throw error;
  } finally {
    if (!installed) await rm(staging, { force: true, recursive: true });
  }
}
