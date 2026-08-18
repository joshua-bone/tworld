import {
  canonicalizeJson,
} from "../domain/canonicalJson.js";
import type { BlobReferenceV1 } from "../domain/artifacts/types.js";
import type { SolverCoordinate } from "../domain/runtime/types.js";
import type { Sha256Port } from "../ports/Sha256Port.js";
import {
  ContextualWitnessExecutorError,
  type ContextualDecisionDigestV1,
  type ContextualEntryIdV1,
  type ContextualWitnessIdV1,
  type ObservationChangeSelectorV1,
} from "./model.js";

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function coordinateKey(coordinate: SolverCoordinate): string {
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
}

export function compareCoordinate(
  left: SolverCoordinate,
  right: SolverCoordinate,
): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

export function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

/** Detaches a value while simultaneously proving that it is canonical-safe. */
export function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

export function assertNonnegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || Object.is(value, -0)
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be a nonnegative safe integer`,
    );
  }
}

export function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
  assertNonnegativeSafeInteger(value, label);
  if (value === 0) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be positive`,
    );
  }
}

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;

export function assertStableId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 128
    || !STABLE_ID_PATTERN.test(value)
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must use the protocol StableId grammar and at most 128 characters`,
    );
  }
}

export function assertRevisionId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > 256
    || value.includes("\r")
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be a nonempty revision of at most 256 Unicode scalars without carriage returns`,
    );
  }
}

export function assertDurableText(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > 2_048
    || value.includes("\r")
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be nonempty durable text of at most 2,048 Unicode scalars without carriage returns`,
    );
  }
}

export function assertPlacementId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !PLACEMENT_ID_PATTERN.test(value)) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be an exact placement:sha256 identity`,
    );
  }
}

export function assertActorId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-request",
      `${label} must be an exact actor:sha256 identity`,
    );
  }
}

export function selectorKey(selector: ObservationChangeSelectorV1): string {
  switch (selector.kind) {
    case "inventory-resource":
    case "remaining-requirement":
      return `${selector.kind}:${selector.resourceType}`;
    case "actor":
      return `${selector.kind}:${selector.actorId}`;
    case "device":
      return `${selector.kind}:${selector.placementId}`;
    case "cell":
      return `${selector.kind}:${coordinateKey(selector.coordinate)}`;
    case "placement":
      return `${selector.kind}:${selector.placementId}`;
    default:
      return selector.kind;
  }
}

function hexDigest(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function digestCanonical(
  value: unknown,
  sha256: Sha256Port,
): Promise<`sha256:${string}`> {
  try {
    const bytes = await sha256.digestUtf8(canonicalizeJson(value));
    if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
      throw new Error("SHA-256 port returned a digest other than 32 bytes");
    }
    return `sha256:${hexDigest(bytes)}`;
  } catch (cause) {
    if (cause instanceof ContextualWitnessExecutorError) throw cause;
    throw new ContextualWitnessExecutorError(
      "witness.hash-failed",
      "the contextual witness identity could not be hashed",
      { cause },
    );
  }
}

export async function digestDecisions(
  decisions: readonly unknown[],
  sha256: Sha256Port,
): Promise<ContextualDecisionDigestV1> {
  return digestCanonical({ decisionEncodingVersion: 1, decisions }, sha256);
}

export async function identifyEntry(
  value: unknown,
  sha256: Sha256Port,
): Promise<ContextualEntryIdV1> {
  const digest = await digestCanonical(value, sha256);
  return `entry:${digest}` as ContextualEntryIdV1;
}

export async function identifyWitness(
  value: unknown,
  sha256: Sha256Port,
): Promise<ContextualWitnessIdV1> {
  const digest = await digestCanonical(value, sha256);
  return `witness:${digest}` as ContextualWitnessIdV1;
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const scalar of value) {
    const codePoint = scalar.codePointAt(0)!;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}

export async function referenceCanonical(
  value: unknown,
  sha256: Sha256Port,
): Promise<BlobReferenceV1> {
  const canonical = canonicalizeJson(value);
  return {
    digest: await digestCanonical(value, sha256),
    byteLength: utf8ByteLength(canonical),
  };
}
