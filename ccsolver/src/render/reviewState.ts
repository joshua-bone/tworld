import { canonicalizeJson } from "../domain/canonicalJson.js";
import type {
  BlobReferenceV1,
  StableIdV1,
} from "../domain/artifacts/types.js";

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const MAX_TEXT_SCALARS = 2_048;

export type ReviewStatusV1 = "unreviewed" | "reviewed" | "changes-requested";

export interface ReviewBindingV1 {
  /** Exact regenerated machine-evidence bytes shown to the reviewer. */
  readonly evidenceContent: BlobReferenceV1;
  /** Exact authoritative contextual-witness bytes underlying that evidence. */
  readonly witnessContent: BlobReferenceV1;
}

export interface HumanReviewNoteV1 {
  readonly noteId: StableIdV1;
  readonly text: string;
}

/**
 * A human-owned presentation adjustment. Machine annotations remain outside
 * this type and can therefore be regenerated without overwriting review data.
 */
export interface ReviewOverlayOverrideV1 {
  readonly overrideId: StableIdV1;
  readonly overlayId: StableIdV1;
  readonly replacementText: string | null;
  readonly hidden: boolean;
}

export type ReviewStaleBindingReasonV1 =
  | "bound-witness-changed"
  | "machine-evidence-changed";

/** Retains the exact transition that invalidated an earlier human review. */
export interface ReviewStaleBindingV1 {
  readonly reason: ReviewStaleBindingReasonV1;
  readonly previousBinding: ReviewBindingV1;
  readonly currentBinding: ReviewBindingV1;
}

/** Pure, canonical-JSON-safe durable human review data. */
export interface ReviewStateV1 {
  readonly reviewStateVersion: 1;
  readonly binding: ReviewBindingV1;
  readonly status: ReviewStatusV1;
  readonly notes: readonly HumanReviewNoteV1[];
  readonly overlayOverrides: readonly ReviewOverlayOverrideV1[];
  readonly staleBinding: ReviewStaleBindingV1 | null;
}

export interface CreateReviewStateInputV1 {
  readonly binding: ReviewBindingV1;
  readonly status?: ReviewStatusV1;
  readonly notes?: readonly HumanReviewNoteV1[];
  readonly overlayOverrides?: readonly ReviewOverlayOverrideV1[];
  readonly staleBinding?: ReviewStaleBindingV1 | null;
}

export type ReviewStateValidationErrorCode = "review-state.invalid";

export class ReviewStateValidationError extends Error {
  override readonly name = "ReviewStateValidationError";

  constructor(
    readonly code: ReviewStateValidationErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

function fail(path: string, message: string, options?: ErrorOptions): never {
  throw new ReviewStateValidationError("review-state.invalid", path, message, options);
}

function childPath(path: string, token: string | number): string {
  const escaped = String(token).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${path}/${escaped}`;
}

function assertCanonicalSafe(value: unknown, path: string): void {
  try {
    canonicalizeJson(value);
  } catch (cause) {
    const causePath = cause !== null
      && typeof cause === "object"
      && "path" in cause
      && typeof cause.path === "string"
      ? cause.path
      : "";
    fail(`${path}${causePath}`, "review data must be canonical-JSON-safe", { cause });
  }
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(path, "expected an object");
  }
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(childPath(path, key), "unexpected review-state field");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      fail(childPath(path, key), "missing required review-state field");
    }
  }
}

function requireStableId(value: unknown, path: string): asserts value is StableIdV1 {
  if (
    typeof value !== "string"
    || value.length > 128
    || !STABLE_ID_PATTERN.test(value)
  ) {
    fail(path, "expected a protocol StableId of at most 128 characters");
  }
}

function requireDurableText(value: unknown, path: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || Array.from(value).length > MAX_TEXT_SCALARS
  ) {
    fail(
      path,
      `expected nonempty durable text of at most ${MAX_TEXT_SCALARS} Unicode scalars without carriage returns`,
    );
  }
}

function requireBlobReference(
  value: unknown,
  path: string,
): asserts value is BlobReferenceV1 {
  const record = requireRecord(value, path);
  requireExactKeys(record, ["digest", "byteLength"], ["digest", "byteLength"], path);
  if (typeof record.digest !== "string" || !SHA256_PATTERN.test(record.digest)) {
    fail(childPath(path, "digest"), "expected a lowercase SHA-256 digest");
  }
  if (
    typeof record.byteLength !== "number"
    || !Number.isSafeInteger(record.byteLength)
    || Object.is(record.byteLength, -0)
    || record.byteLength < 0
  ) {
    fail(childPath(path, "byteLength"), "expected a nonnegative safe integer");
  }
}

function requireBinding(value: unknown, path: string): asserts value is ReviewBindingV1 {
  const record = requireRecord(value, path);
  requireExactKeys(
    record,
    ["evidenceContent", "witnessContent"],
    ["evidenceContent", "witnessContent"],
    path,
  );
  requireBlobReference(record.evidenceContent, childPath(path, "evidenceContent"));
  requireBlobReference(record.witnessContent, childPath(path, "witnessContent"));
}

function requireStatus(value: unknown, path: string): asserts value is ReviewStatusV1 {
  if (value !== "unreviewed" && value !== "reviewed" && value !== "changes-requested") {
    fail(path, "expected unreviewed, reviewed, or changes-requested");
  }
}

function requireNotes(value: unknown, path: string): asserts value is readonly HumanReviewNoteV1[] {
  if (!Array.isArray(value)) {
    fail(path, "expected an ordered array of human notes");
  }
  const noteIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const notePath = childPath(path, index);
    const note = requireRecord(value[index], notePath);
    requireExactKeys(note, ["noteId", "text"], ["noteId", "text"], notePath);
    requireStableId(note.noteId, childPath(notePath, "noteId"));
    requireDurableText(note.text, childPath(notePath, "text"));
    if (noteIds.has(note.noteId)) {
      fail(childPath(notePath, "noteId"), `duplicate note ID ${note.noteId}`);
    }
    noteIds.add(note.noteId);
  }
}

function requireOverlayOverrides(
  value: unknown,
  path: string,
): asserts value is readonly ReviewOverlayOverrideV1[] {
  if (!Array.isArray(value)) {
    fail(path, "expected an ordered array of overlay overrides");
  }
  const overrideIds = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const overridePath = childPath(path, index);
    const override = requireRecord(value[index], overridePath);
    requireExactKeys(
      override,
      ["overrideId", "overlayId", "replacementText", "hidden"],
      ["overrideId", "overlayId", "replacementText", "hidden"],
      overridePath,
    );
    requireStableId(override.overrideId, childPath(overridePath, "overrideId"));
    requireStableId(override.overlayId, childPath(overridePath, "overlayId"));
    if (override.replacementText !== null) {
      requireDurableText(override.replacementText, childPath(overridePath, "replacementText"));
    }
    if (typeof override.hidden !== "boolean") {
      fail(childPath(overridePath, "hidden"), "expected a boolean");
    }
    if (overrideIds.has(override.overrideId)) {
      fail(
        childPath(overridePath, "overrideId"),
        `duplicate overlay-override ID ${override.overrideId}`,
      );
    }
    overrideIds.add(override.overrideId);
  }
}

function equalBlobReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function equalBinding(left: ReviewBindingV1, right: ReviewBindingV1): boolean {
  return equalBlobReference(left.evidenceContent, right.evidenceContent)
    && equalBlobReference(left.witnessContent, right.witnessContent);
}

function requireStaleBinding(
  value: unknown,
  path: string,
): asserts value is ReviewStaleBindingV1 {
  const stale = requireRecord(value, path);
  requireExactKeys(
    stale,
    ["reason", "previousBinding", "currentBinding"],
    ["reason", "previousBinding", "currentBinding"],
    path,
  );
  if (
    stale.reason !== "bound-witness-changed"
    && stale.reason !== "machine-evidence-changed"
  ) {
    fail(childPath(path, "reason"), "expected a typed stale-binding reason");
  }
  requireBinding(stale.previousBinding, childPath(path, "previousBinding"));
  requireBinding(stale.currentBinding, childPath(path, "currentBinding"));

  const witnessChanged = !equalBlobReference(
    stale.previousBinding.witnessContent,
    stale.currentBinding.witnessContent,
  );
  const evidenceChanged = !equalBlobReference(
    stale.previousBinding.evidenceContent,
    stale.currentBinding.evidenceContent,
  );
  if (stale.reason === "bound-witness-changed" && !witnessChanged) {
    fail(childPath(path, "reason"), "bound-witness-changed requires different witness content");
  }
  if (
    stale.reason === "machine-evidence-changed"
    && (witnessChanged || !evidenceChanged)
  ) {
    fail(
      childPath(path, "reason"),
      "machine-evidence-changed requires identical witness content and different evidence content",
    );
  }
}

/**
 * Validates persisted review data without accepting extensions that could mix
 * machine annotations, authorship, or timestamps into this human-owned lane.
 */
export function validateReviewState(value: unknown): asserts value is ReviewStateV1 {
  assertCanonicalSafe(value, "");
  const state = requireRecord(value, "");
  const keys = [
    "reviewStateVersion",
    "binding",
    "status",
    "notes",
    "overlayOverrides",
    "staleBinding",
  ] as const;
  requireExactKeys(state, keys, keys, "");
  if (state.reviewStateVersion !== 1) {
    fail("/reviewStateVersion", "expected review-state version 1");
  }
  requireBinding(state.binding, "/binding");
  requireStatus(state.status, "/status");
  requireNotes(state.notes, "/notes");
  requireOverlayOverrides(state.overlayOverrides, "/overlayOverrides");

  if (state.staleBinding !== null) {
    requireStaleBinding(state.staleBinding, "/staleBinding");
    if (state.status !== "changes-requested") {
      fail("/status", "a stale binding requires changes-requested status");
    }
    if (!equalBinding(state.binding, state.staleBinding.currentBinding)) {
      fail(
        "/staleBinding/currentBinding",
        "stale transition current binding must equal the state's active binding",
      );
    }
  }
}

/** Creates detached durable review data, defaulting only the initial human state. */
export function createReviewState(input: CreateReviewStateInputV1): ReviewStateV1 {
  assertCanonicalSafe(input, "");
  const record = requireRecord(input, "");
  const allowed = ["binding", "status", "notes", "overlayOverrides", "staleBinding"] as const;
  requireExactKeys(record, allowed, ["binding"], "");

  const state = {
    reviewStateVersion: 1,
    binding: record.binding,
    status: Object.hasOwn(record, "status") ? record.status : "unreviewed",
    notes: Object.hasOwn(record, "notes") ? record.notes : [],
    overlayOverrides: Object.hasOwn(record, "overlayOverrides")
      ? record.overlayOverrides
      : [],
    staleBinding: Object.hasOwn(record, "staleBinding") ? record.staleBinding : null,
  };
  validateReviewState(state);
  return canonicalCopy(state);
}

/**
 * Rebinds regenerated evidence while preserving ordered human data exactly.
 * Witness changes take precedence when both references change.
 */
export function rebindReviewState(
  state: ReviewStateV1,
  binding: ReviewBindingV1,
): ReviewStateV1 {
  validateReviewState(state);
  assertCanonicalSafe(binding, "/binding");
  requireBinding(binding, "/binding");

  const detachedState = canonicalCopy(state);
  const detachedBinding = canonicalCopy(binding);
  if (equalBinding(detachedState.binding, detachedBinding)) {
    return detachedState;
  }

  const reason: ReviewStaleBindingReasonV1 = equalBlobReference(
    detachedState.binding.witnessContent,
    detachedBinding.witnessContent,
  )
    ? "machine-evidence-changed"
    : "bound-witness-changed";
  const rebound: ReviewStateV1 = {
    ...detachedState,
    binding: detachedBinding,
    status: "changes-requested",
    staleBinding: {
      reason,
      previousBinding: detachedState.binding,
      currentBinding: detachedBinding,
    },
  };
  validateReviewState(rebound);
  return canonicalCopy(rebound);
}
