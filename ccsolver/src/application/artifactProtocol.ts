import type {
  ActorIdentityDescriptorV1,
  ActorIdV1,
  ArtifactReferenceV1,
  ArtifactV1,
  CorpusCaseV1,
  CorpusTargetV1,
  PlacementIdV1,
  ReplayCertificateV1,
  StaticPlacementDescriptorV1,
} from "../domain/artifacts/types.js";
import {
  CanonicalJsonError,
  canonicalizeJson,
  parseCanonicalJson,
  type CanonicalJson,
} from "../domain/canonicalJson.js";
import type { Sha256Port } from "../ports/Sha256Port.js";
import {
  ArtifactProtocolError,
  identifyCanonicalJson,
} from "./artifactIdentity.js";

const PROTOCOL = "ccsolver-artifact";
const PROTOCOL_VERSION = 1;
const SCHEMA_VERSION = 1;
const ARTIFACT_ID_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;
const ARTIFACT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffff_ffff;
const TARGET_ORDER = new Map([["ms", 0], ["lynx", 1]]);

type JsonRecord = Record<string, unknown>;

function pointer(parent: string, segment: string | number): string {
  const encoded = String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${parent}/${encoded}`;
}

function schemaFailure(path: string, message: string): never {
  throw new ArtifactProtocolError("artifact.schema-invalid", path, message);
}

function invariantFailure(path: string, message: string): never {
  throw new ArtifactProtocolError("artifact.invariant-invalid", path, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectObject(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): JsonRecord {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected an object");
  }

  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return schemaFailure(pointer(path, key), "unknown object member");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      return schemaFailure(pointer(path, key), "required object member is missing");
    }
  }
  return value;
}

function expectString(value: unknown, path: string, maximumLength = 2048): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > maximumLength
  ) {
    return schemaFailure(
      path,
      `expected a non-empty string of at most ${maximumLength} Unicode scalar values`,
    );
  }
  if (value.includes("\r")) {
    return schemaFailure(path, "carriage returns are not allowed in durable text");
  }
  return value;
}

function expectStableId(value: unknown, path: string): string {
  const result = expectString(value, path, 128);
  if (!STABLE_ID_PATTERN.test(result)) {
    return schemaFailure(path, "expected a lowercase stable identifier");
  }
  return result;
}

function expectEnum<const Values extends readonly string[]>(
  value: unknown,
  path: string,
  values: Values,
): Values[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    return schemaFailure(path, `expected one of ${values.join(", ")}`);
  }
  return value as Values[number];
}

function expectInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < minimum
    || value > maximum
  ) {
    return schemaFailure(path, `expected an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function expectArray(value: unknown, path: string, maximumLength = 65_536): unknown[] {
  if (!Array.isArray(value) || value.length > maximumLength) {
    return schemaFailure(path, `expected an array with at most ${maximumLength} entries`);
  }
  return value;
}

function expectArtifactId(value: unknown, path: string): string {
  if (typeof value !== "string" || !ARTIFACT_ID_PATTERN.test(value)) {
    return schemaFailure(path, "expected sha256 followed by 64 lowercase hexadecimal digits");
  }
  return value;
}

function validateArtifactReference(
  value: unknown,
  path: string,
  expectedArtifactType?: string,
  expectedSchemaVersion?: number,
): ArtifactReferenceV1 {
  const record = expectObject(
    value,
    path,
    ["protocolVersion", "artifactType", "schemaVersion", "digest"],
  );
  if (expectInteger(record.protocolVersion, pointer(path, "protocolVersion"), 1, MAX_UINT32) !== 1) {
    return schemaFailure(pointer(path, "protocolVersion"), "artifact references require protocol version 1");
  }
  const artifactType = expectString(record.artifactType, pointer(path, "artifactType"), 128);
  if (!ARTIFACT_TYPE_PATTERN.test(artifactType)) {
    return schemaFailure(pointer(path, "artifactType"), "expected a lowercase artifact type");
  }
  if (expectedArtifactType !== undefined && artifactType !== expectedArtifactType) {
    return schemaFailure(pointer(path, "artifactType"), `expected ${expectedArtifactType}`);
  }
  const schemaVersion = expectInteger(
    record.schemaVersion,
    pointer(path, "schemaVersion"),
    1,
    MAX_UINT32,
  );
  if (expectedSchemaVersion !== undefined && schemaVersion !== expectedSchemaVersion) {
    return schemaFailure(pointer(path, "schemaVersion"), `expected ${expectedSchemaVersion}`);
  }
  expectArtifactId(record.digest, pointer(path, "digest"));
  return value as ArtifactReferenceV1;
}

function validateReferenceArray(value: unknown, path: string): ArtifactReferenceV1[] {
  const entries = expectArray(value, path).map((entry, index) => (
    validateArtifactReference(entry, pointer(path, index))
  ));
  let previous: ArtifactReferenceV1 | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry === undefined) {
      continue;
    }
    if (previous !== undefined && compareArtifactReferences(previous, entry) >= 0) {
      return invariantFailure(pointer(path, index), "artifact references must be unique and sorted");
    }
    previous = entry;
  }
  return entries;
}

function compareArtifactReferences(
  left: ArtifactReferenceV1,
  right: ArtifactReferenceV1,
): number {
  if (left.artifactType < right.artifactType) {
    return -1;
  }
  if (left.artifactType > right.artifactType) {
    return 1;
  }
  if (left.schemaVersion !== right.schemaVersion) {
    return left.schemaVersion - right.schemaVersion;
  }
  return left.digest < right.digest ? -1 : left.digest > right.digest ? 1 : 0;
}

function validateBlobReference(value: unknown, path: string): void {
  const record = expectObject(value, path, ["digest", "byteLength"]);
  expectArtifactId(record.digest, pointer(path, "digest"));
  expectInteger(record.byteLength, pointer(path, "byteLength"), 0, Number.MAX_SAFE_INTEGER);
}

function validateReplayReference(value: unknown, path: string): void {
  const record = expectObject(value, path, ["format", "content"]);
  if (record.format !== "tws") {
    return schemaFailure(pointer(path, "format"), "P0B replay references require TWS format");
  }
  validateBlobReference(record.content, pointer(path, "content"));
}

function validateLevelIdentity(value: unknown, path: string): void {
  const record = expectObject(
    value,
    path,
    ["occurrenceId", "normalizationProfile", "normalizedGameplayDigest"],
  );
  expectStableId(record.occurrenceId, pointer(path, "occurrenceId"));
  expectStableId(record.normalizationProfile, pointer(path, "normalizationProfile"));
  expectArtifactId(record.normalizedGameplayDigest, pointer(path, "normalizedGameplayDigest"));
}

function validatePlanReference(value: unknown, path: string): void {
  const record = expectObject(value, path, ["artifact", "goalId", "subgoalId"]);
  validateArtifactReference(record.artifact, pointer(path, "artifact"), "expanded-plan");
  for (const key of ["goalId", "subgoalId"] as const) {
    const entry = record[key];
    if (entry !== null) {
      expectStableId(entry, pointer(path, key));
    }
  }
}

function validateAttemptContext(value: unknown, path: string): void {
  const record = expectObject(value, path, [
    "donorAvailability",
    "donorExposure",
    "constructionMethod",
    "evaluationCohort",
    "budgetRevision",
    "solverRevision",
    "searchSeed",
  ]);
  expectEnum(record.donorAvailability, pointer(path, "donorAvailability"), [
    "paired",
    "single-ruleset",
    "none",
  ] as const);
  expectEnum(record.donorExposure, pointer(path, "donorExposure"), [
    "blind",
    "terminal-only",
    "semantic-guided",
    "full-input",
  ] as const);
  expectEnum(record.constructionMethod, pointer(path, "constructionMethod"), [
    "from-scratch",
    "tactic-composed",
    "semantic-guided",
    "input-translated",
    "manual-assisted",
  ] as const);
  if (record.evaluationCohort !== null) {
    expectStableId(record.evaluationCohort, pointer(path, "evaluationCohort"));
  }
  expectString(record.budgetRevision, pointer(path, "budgetRevision"), 256);
  expectString(record.solverRevision, pointer(path, "solverRevision"), 256);
  if (record.searchSeed !== null) {
    expectInteger(record.searchSeed, pointer(path, "searchSeed"), 0, MAX_UINT32);
  }
}

function validateAttemptResult(value: unknown, path: string): string {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected an attempt result object");
  }
  const kind = expectEnum(value.kind, pointer(path, "kind"), [
    "candidate-generated",
    "certified",
    "failed",
  ] as const);

  switch (kind) {
    case "candidate-generated": {
      const record = expectObject(value, path, ["kind", "replay"]);
      validateReplayReference(record.replay, pointer(path, "replay"));
      break;
    }
    case "certified": {
      const record = expectObject(value, path, ["kind", "replay", "certificate"]);
      validateReplayReference(record.replay, pointer(path, "replay"));
      validateArtifactReference(
        record.certificate,
        pointer(path, "certificate"),
        "replay-certificate",
        1,
      );
      break;
    }
    case "failed": {
      const record = expectObject(value, path, ["kind", "category", "evidence", "nextAction"]);
      expectEnum(record.category, pointer(path, "category"), [
        "import",
        "runtime-oracle",
        "observation",
        "decomposition",
        "local-repair-exhausted",
        "route-replan-exhausted",
        "ruleset-divergence",
        "fixture",
        "reviewed-nonportable",
        "cancelled",
      ] as const);
      validateReferenceArray(record.evidence, pointer(path, "evidence"));
      expectString(record.nextAction, pointer(path, "nextAction"), 2048);
      break;
    }
  }
  return kind;
}

function validateAttempt(value: unknown, path: string): { attemptId: string; resultKind: string } {
  const record = expectObject(value, path, ["attemptId", "sequence", "context", "plan", "result"]);
  const attemptId = expectStableId(record.attemptId, pointer(path, "attemptId"));
  expectInteger(record.sequence, pointer(path, "sequence"), 1, MAX_UINT32);
  validateAttemptContext(record.context, pointer(path, "context"));
  if (record.plan !== null) {
    validatePlanReference(record.plan, pointer(path, "plan"));
  }
  return {
    attemptId,
    resultKind: validateAttemptResult(record.result, pointer(path, "result")),
  };
}

function validateTargetState(value: unknown, path: string): { status: string; attemptId?: string } {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected a target state object");
  }
  const status = expectEnum(value.status, pointer(path, "status"), [
    "awaiting-import",
    "import-blocked",
    "ready",
    "analyzed",
    "candidate-generated",
    "needs-local-repair",
    "needs-route-replan",
    "solved-current",
    "needs-reverify",
    "excluded-reviewed",
  ] as const);

  switch (status) {
    case "awaiting-import":
    case "ready":
      expectObject(value, path, ["status"]);
      return { status };
    case "import-blocked": {
      const record = expectObject(value, path, ["status", "reason", "evidence"]);
      expectString(record.reason, pointer(path, "reason"), 2048);
      validateReferenceArray(record.evidence, pointer(path, "evidence"));
      return { status };
    }
    case "analyzed": {
      const record = expectObject(value, path, ["status", "levelFacts"]);
      validateArtifactReference(record.levelFacts, pointer(path, "levelFacts"), "level-facts");
      return { status };
    }
    case "candidate-generated":
    case "needs-local-repair":
    case "needs-route-replan":
    case "solved-current": {
      const record = expectObject(value, path, ["status", "attemptId"]);
      return {
        status,
        attemptId: expectStableId(record.attemptId, pointer(path, "attemptId")),
      };
    }
    case "needs-reverify": {
      const record = expectObject(value, path, ["status", "attemptId", "reason"]);
      expectString(record.reason, pointer(path, "reason"), 2048);
      return {
        status,
        attemptId: expectStableId(record.attemptId, pointer(path, "attemptId")),
      };
    }
    case "excluded-reviewed": {
      const record = expectObject(
        value,
        path,
        ["status", "reason", "evidence", "reviewRevision"],
      );
      expectString(record.reason, pointer(path, "reason"), 2048);
      validateReferenceArray(record.evidence, pointer(path, "evidence"));
      expectString(record.reviewRevision, pointer(path, "reviewRevision"), 256);
      return { status };
    }
  }
}

function validateCorpusTarget(value: unknown, path: string): CorpusTargetV1 {
  const record = expectObject(value, path, ["target", "attempts", "state"]);
  expectEnum(record.target, pointer(path, "target"), ["ms", "lynx"] as const);
  const attempts = expectArray(record.attempts, pointer(path, "attempts"));
  const attemptKinds = new Map<string, string>();

  for (let index = 0; index < attempts.length; index += 1) {
    const attemptPath = pointer(pointer(path, "attempts"), index);
    const result = validateAttempt(attempts[index], attemptPath);
    const attempt = attempts[index] as JsonRecord;
    if (attempt.sequence !== index + 1) {
      return invariantFailure(
        pointer(attemptPath, "sequence"),
        "attempt sequence numbers must be contiguous and one-based",
      );
    }
    if (attemptKinds.has(result.attemptId)) {
      return invariantFailure(pointer(attemptPath, "attemptId"), "attempt IDs must be unique");
    }
    attemptKinds.set(result.attemptId, result.resultKind);
  }

  const statePath = pointer(path, "state");
  const state = validateTargetState(record.state, statePath);
  if (state.attemptId !== undefined) {
    const resultKind = attemptKinds.get(state.attemptId);
    const attemptIdPath = pointer(statePath, "attemptId");
    if (resultKind === undefined) {
      return invariantFailure(attemptIdPath, "target state references an unknown attempt");
    }
    if (state.status === "candidate-generated" && resultKind !== "candidate-generated") {
      return invariantFailure(attemptIdPath, "candidate state must reference a candidate attempt");
    }
    if (
      (state.status === "needs-local-repair" || state.status === "needs-route-replan")
      && resultKind !== "failed"
    ) {
      return invariantFailure(attemptIdPath, "repair state must reference a failed attempt");
    }
    if (
      (state.status === "solved-current" || state.status === "needs-reverify")
      && resultKind !== "certified"
    ) {
      return invariantFailure(attemptIdPath, "solved state must reference a certified attempt");
    }
  }

  return value as CorpusTargetV1;
}

function validateCorpusCase(value: JsonRecord): CorpusCaseV1 {
  const payloadPath = "/payload";
  const payload = expectObject(
    value.payload,
    payloadPath,
    ["producerRevision", "previous", "caseId", "level", "targets"],
  );
  expectString(payload.producerRevision, pointer(payloadPath, "producerRevision"), 256);
  if (payload.previous !== null) {
    validateArtifactReference(
      payload.previous,
      pointer(payloadPath, "previous"),
      "corpus-case",
      1,
    );
  }
  expectStableId(payload.caseId, pointer(payloadPath, "caseId"));
  validateLevelIdentity(payload.level, pointer(payloadPath, "level"));

  const targetsPath = pointer(payloadPath, "targets");
  const targets = expectArray(payload.targets, targetsPath, 2);
  if (targets.length === 0) {
    return schemaFailure(targetsPath, "a corpus case requires at least one target");
  }
  let previousRank = -1;
  for (let index = 0; index < targets.length; index += 1) {
    const target = validateCorpusTarget(targets[index], pointer(targetsPath, index));
    const rank = TARGET_ORDER.get(target.target);
    if (rank === undefined || rank <= previousRank) {
      return invariantFailure(targetsPath, "targets must be unique and ordered ms, then lynx");
    }
    previousRank = rank;
  }
  return value as unknown as CorpusCaseV1;
}

function validateVerification(value: unknown, path: string): number {
  const record = expectObject(value, path, ["toolRevision", "result", "terminalTick"]);
  expectString(record.toolRevision, pointer(path, "toolRevision"), 256);
  if (record.result !== "win") {
    return schemaFailure(pointer(path, "result"), "replay certificates require a winning result");
  }
  return expectInteger(record.terminalTick, pointer(path, "terminalTick"), 0, MAX_UINT32);
}

function validateReplayCertificate(value: JsonRecord): ReplayCertificateV1 {
  const payloadPath = "/payload";
  const payload = expectObject(value.payload, payloadPath, [
    "producerRevision",
    "caseId",
    "level",
    "target",
    "attemptId",
    "replay",
    "plan",
    "verifications",
    "lineage",
  ]);
  expectString(payload.producerRevision, pointer(payloadPath, "producerRevision"), 256);
  expectStableId(payload.caseId, pointer(payloadPath, "caseId"));
  validateLevelIdentity(payload.level, pointer(payloadPath, "level"));
  expectEnum(payload.target, pointer(payloadPath, "target"), ["ms", "lynx"] as const);
  expectStableId(payload.attemptId, pointer(payloadPath, "attemptId"));
  validateReplayReference(payload.replay, pointer(payloadPath, "replay"));
  if (payload.plan !== null) {
    validatePlanReference(payload.plan, pointer(payloadPath, "plan"));
  }
  const verificationPath = pointer(payloadPath, "verifications");
  const verifications = expectObject(
    payload.verifications,
    verificationPath,
    ["typescript", "nativeOracle"],
  );
  const typescriptTick = validateVerification(
    verifications.typescript,
    pointer(verificationPath, "typescript"),
  );
  const nativeTick = validateVerification(
    verifications.nativeOracle,
    pointer(verificationPath, "nativeOracle"),
  );
  if (nativeTick !== typescriptTick) {
    return invariantFailure(
      pointer(pointer(verificationPath, "nativeOracle"), "terminalTick"),
      "TypeScript and native verification must agree on the terminal tick",
    );
  }
  validateReferenceArray(payload.lineage, pointer(payloadPath, "lineage"));
  return value as unknown as ReplayCertificateV1;
}

function envelopeFailure(path: string, message: string): never {
  throw new ArtifactProtocolError("artifact.invalid-envelope", path, message);
}

function validateEnvelope(value: unknown): ArtifactV1 {
  if (!isRecord(value)) {
    return envelopeFailure("", "an artifact must be a JSON object");
  }

  const required = [
    "protocol",
    "protocolVersion",
    "artifactType",
    "schemaVersion",
    "payload",
  ] as const;
  const allowed = new Set<string>(required);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return envelopeFailure(pointer("", key), "unknown artifact envelope member");
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      return envelopeFailure(pointer("", key), "required artifact envelope member is missing");
    }
  }

  if (typeof value.protocol !== "string") {
    return envelopeFailure("/protocol", "artifact protocol must be a string");
  }
  if (value.protocol !== PROTOCOL) {
    throw new ArtifactProtocolError(
      "artifact.unsupported-protocol",
      "/protocol",
      `unsupported artifact protocol: ${value.protocol}`,
    );
  }

  if (!Number.isSafeInteger(value.protocolVersion) || Object.is(value.protocolVersion, -0)) {
    return envelopeFailure("/protocolVersion", "artifact protocol version must be an integer");
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    throw new ArtifactProtocolError(
      "artifact.unsupported-protocol-version",
      "/protocolVersion",
      `unsupported artifact protocol version: ${String(value.protocolVersion)}`,
    );
  }

  if (typeof value.artifactType !== "string") {
    return envelopeFailure("/artifactType", "artifact type must be a string");
  }
  if (value.artifactType !== "corpus-case" && value.artifactType !== "replay-certificate") {
    throw new ArtifactProtocolError(
      "artifact.unknown-artifact-type",
      "/artifactType",
      `unknown artifact type: ${value.artifactType}`,
    );
  }

  if (!Number.isSafeInteger(value.schemaVersion) || Object.is(value.schemaVersion, -0)) {
    return envelopeFailure("/schemaVersion", "artifact schema version must be an integer");
  }
  if (value.schemaVersion !== SCHEMA_VERSION) {
    throw new ArtifactProtocolError(
      "artifact.unsupported-schema-version",
      "/schemaVersion",
      `unsupported ${value.artifactType} schema version: ${String(value.schemaVersion)}`,
    );
  }

  return value.artifactType === "corpus-case"
    ? validateCorpusCase(value)
    : validateReplayCertificate(value);
}

function translateCanonicalError(error: unknown): never {
  if (!(error instanceof CanonicalJsonError)) {
    throw error;
  }

  if (error.code === "canonical.invalid-json") {
    throw new ArtifactProtocolError(
      "artifact.invalid-json",
      error.path,
      error.message,
      { cause: error },
    );
  }
  if (error.code === "canonical.non-canonical") {
    throw new ArtifactProtocolError(
      "artifact.non-canonical-json",
      error.path,
      error.message,
      { cause: error },
    );
  }
  throw new ArtifactProtocolError(
    "artifact.invalid-json-value",
    error.path,
    error.message,
    { cause: error },
  );
}

export function decodeCanonicalArtifact(source: string): ArtifactV1 {
  let value: unknown;
  try {
    value = parseCanonicalJson(source);
  } catch (error) {
    return translateCanonicalError(error);
  }
  return validateEnvelope(value);
}

export function encodeArtifact(value: ArtifactV1): CanonicalJson {
  let canonical: CanonicalJson;
  try {
    canonical = canonicalizeJson(value);
  } catch (error) {
    return translateCanonicalError(error);
  }
  // Validate a data-only copy derived from the exact bytes being returned.
  // This also ensures validation never evaluates accessors on caller objects.
  validateEnvelope(parseCanonicalJson(canonical));
  return canonical;
}

function canonicalValuesEqual(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function bundleFailure(path: string, message: string): never {
  throw new ArtifactProtocolError("artifact.bundle-mismatch", path, message);
}

export async function verifyCertificateBundle(
  corpusInput: CorpusCaseV1,
  certificateInput: ReplayCertificateV1,
  sha256: Sha256Port,
): Promise<void> {
  const corpus = decodeCanonicalArtifact(encodeArtifact(corpusInput));
  const certificate = decodeCanonicalArtifact(encodeArtifact(certificateInput));
  if (corpus.artifactType !== "corpus-case") {
    return bundleFailure("/artifactType", "expected a corpus-case artifact");
  }
  if (certificate.artifactType !== "replay-certificate") {
    return bundleFailure("/artifactType", "expected a replay-certificate artifact");
  }

  if (certificate.payload.caseId !== corpus.payload.caseId) {
    return bundleFailure("/payload/caseId", "certificate case does not match the corpus case");
  }
  if (!canonicalValuesEqual(certificate.payload.level, corpus.payload.level)) {
    return bundleFailure("/payload/level", "certificate level does not match the corpus case");
  }

  const targetIndex = corpus.payload.targets.findIndex((entry) => (
    entry.target === certificate.payload.target
  ));
  if (targetIndex < 0) {
    return bundleFailure("/payload/target", "certificate target is absent from the corpus case");
  }
  const target = corpus.payload.targets[targetIndex];
  if (target === undefined) {
    return bundleFailure("/payload/target", "certificate target lookup failed");
  }
  const attemptIndex = target.attempts.findIndex((entry) => (
    entry.attemptId === certificate.payload.attemptId
  ));
  if (attemptIndex < 0) {
    const belongsToAnotherTarget = corpus.payload.targets.some((entry) => (
      entry.target !== certificate.payload.target
      && entry.attempts.some((candidate) => (
        candidate.attemptId === certificate.payload.attemptId
      ))
    ));
    return bundleFailure(
      belongsToAnotherTarget ? "/payload/target" : "/payload/attemptId",
      belongsToAnotherTarget
        ? "certificate attempt belongs to a different corpus target"
        : "certificate attempt was not found in its corpus target",
    );
  }
  const attempt = target.attempts[attemptIndex];
  if (attempt === undefined) {
    return bundleFailure("/payload/attemptId", "certificate attempt lookup failed");
  }
  if (attempt.result.kind !== "certified") {
    return bundleFailure("/payload/attemptId", "certificate attempt is not certified");
  }
  if (!canonicalValuesEqual(certificate.payload.replay, attempt.result.replay)) {
    return bundleFailure("/payload/replay", "certificate replay does not match its corpus attempt");
  }
  if (!canonicalValuesEqual(certificate.payload.plan, attempt.plan)) {
    return bundleFailure("/payload/plan", "certificate plan does not match its corpus attempt");
  }

  const certificateId = await identifyCanonicalJson(encodeArtifact(certificate), sha256);
  if (certificateId !== attempt.result.certificate.digest) {
    const attemptPath = pointer(
      pointer(pointer("/payload/targets", targetIndex), "attempts"),
      attemptIndex,
    );
    return bundleFailure(
      pointer(pointer(pointer(attemptPath, "result"), "certificate"), "digest"),
      "certified attempt does not reference the supplied certificate bytes",
    );
  }
}

export async function verifyCorpusSuccessor(
  previousInput: CorpusCaseV1,
  currentInput: CorpusCaseV1,
  sha256: Sha256Port,
): Promise<void> {
  const previousArtifact = decodeCanonicalArtifact(encodeArtifact(previousInput));
  const currentArtifact = decodeCanonicalArtifact(encodeArtifact(currentInput));
  if (previousArtifact.artifactType !== "corpus-case") {
    return bundleFailure("/artifactType", "expected a previous corpus-case artifact");
  }
  if (currentArtifact.artifactType !== "corpus-case") {
    return bundleFailure("/artifactType", "expected a current corpus-case artifact");
  }

  const previousRef = currentArtifact.payload.previous;
  if (previousRef === null) {
    return bundleFailure("/payload/previous", "successor does not reference its predecessor");
  }
  const previousId = await identifyCanonicalJson(encodeArtifact(previousArtifact), sha256);
  if (previousRef.digest !== previousId) {
    return bundleFailure(
      "/payload/previous/digest",
      "successor does not reference the supplied predecessor bytes",
    );
  }
  if (currentArtifact.payload.caseId !== previousArtifact.payload.caseId) {
    return bundleFailure("/payload/caseId", "successor changes the corpus case identity");
  }
  if (!canonicalValuesEqual(currentArtifact.payload.level, previousArtifact.payload.level)) {
    return bundleFailure("/payload/level", "successor changes the normalized level identity");
  }

  for (const previousTarget of previousArtifact.payload.targets) {
    const currentTargetIndex = currentArtifact.payload.targets.findIndex((target) => (
      target.target === previousTarget.target
    ));
    if (currentTargetIndex < 0) {
      return bundleFailure("/payload/targets", "successor drops a predecessor target");
    }
    const currentTarget = currentArtifact.payload.targets[currentTargetIndex];
    if (currentTarget === undefined) {
      return bundleFailure("/payload/targets", "successor target lookup failed");
    }
    if (currentTarget.attempts.length < previousTarget.attempts.length) {
      return bundleFailure(
        pointer(pointer("/payload/targets", currentTargetIndex), "attempts"),
        "successor drops predecessor attempts",
      );
    }
    for (let index = 0; index < previousTarget.attempts.length; index += 1) {
      if (!canonicalValuesEqual(previousTarget.attempts[index], currentTarget.attempts[index])) {
        return bundleFailure(
          pointer(
            pointer(pointer("/payload/targets", currentTargetIndex), "attempts"),
            index,
          ),
          "successor rewrites a predecessor attempt",
        );
      }
    }
  }
}

function validateCoordinate(value: unknown, path: string): void {
  const record = expectObject(value, path, ["x", "y", "z"]);
  expectInteger(record.x, pointer(path, "x"), 0, MAX_UINT16);
  expectInteger(record.y, pointer(path, "y"), 0, MAX_UINT16);
  expectInteger(record.z, pointer(path, "z"), 0, MAX_UINT16);
}

function validateStaticPlacement(
  value: unknown,
  path = "",
): StaticPlacementDescriptorV1 {
  const record = expectObject(value, path, [
    "identityType",
    "identityVersion",
    "levelDigest",
    "coordinate",
    "stratum",
    "semanticType",
    "discriminator",
  ]);
  if (record.identityType !== "static-placement") {
    return schemaFailure(pointer(path, "identityType"), "expected static-placement identity");
  }
  if (record.identityVersion !== 1) {
    return schemaFailure(pointer(path, "identityVersion"), "expected identity version 1");
  }
  expectArtifactId(record.levelDigest, pointer(path, "levelDigest"));
  validateCoordinate(record.coordinate, pointer(path, "coordinate"));
  expectEnum(record.stratum, pointer(path, "stratum"), [
    "terrain",
    "overlay",
    "pickup",
    "actor",
    "side",
  ] as const);
  expectStableId(record.semanticType, pointer(path, "semanticType"));
  expectInteger(record.discriminator, pointer(path, "discriminator"), 0, MAX_UINT16);
  return value as unknown as StaticPlacementDescriptorV1;
}

function validateActorIdentity(value: unknown, path = ""): ActorIdentityDescriptorV1 {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected an actor identity descriptor");
  }
  const kind = expectEnum(value.kind, pointer(path, "kind"), ["initial", "clone"] as const);
  if (kind === "initial") {
    const record = expectObject(value, path, [
      "identityType",
      "identityVersion",
      "kind",
      "placementId",
      "sourceActorOrder",
    ]);
    if (record.identityType !== "actor" || record.identityVersion !== 1) {
      return schemaFailure(path, "expected actor identity version 1");
    }
    if (typeof record.placementId !== "string" || !PLACEMENT_ID_PATTERN.test(record.placementId)) {
      return schemaFailure(pointer(path, "placementId"), "expected a placement identity");
    }
    expectInteger(record.sourceActorOrder, pointer(path, "sourceActorOrder"), 0, MAX_UINT16);
  } else {
    const record = expectObject(value, path, [
      "identityType",
      "identityVersion",
      "kind",
      "parentActorId",
      "sourcePlacementId",
      "cloneOrdinal",
    ]);
    if (record.identityType !== "actor" || record.identityVersion !== 1) {
      return schemaFailure(path, "expected actor identity version 1");
    }
    if (typeof record.parentActorId !== "string" || !ACTOR_ID_PATTERN.test(record.parentActorId)) {
      return schemaFailure(pointer(path, "parentActorId"), "expected an actor identity");
    }
    if (
      typeof record.sourcePlacementId !== "string"
      || !PLACEMENT_ID_PATTERN.test(record.sourcePlacementId)
    ) {
      return schemaFailure(pointer(path, "sourcePlacementId"), "expected a placement identity");
    }
    expectInteger(record.cloneOrdinal, pointer(path, "cloneOrdinal"), 1, MAX_UINT32);
  }
  return value as unknown as ActorIdentityDescriptorV1;
}

export async function identifyStaticPlacement(
  descriptor: StaticPlacementDescriptorV1,
  sha256: Sha256Port,
): Promise<PlacementIdV1> {
  let canonical: CanonicalJson;
  try {
    canonical = canonicalizeJson(descriptor);
  } catch (error) {
    return translateCanonicalError(error);
  }
  validateStaticPlacement(parseCanonicalJson(canonical));
  const digest = await identifyCanonicalJson(canonical, sha256);
  return `placement:${digest}` as PlacementIdV1;
}

export async function identifyActor(
  descriptor: ActorIdentityDescriptorV1,
  sha256: Sha256Port,
): Promise<ActorIdV1> {
  let canonical: CanonicalJson;
  try {
    canonical = canonicalizeJson(descriptor);
  } catch (error) {
    return translateCanonicalError(error);
  }
  validateActorIdentity(parseCanonicalJson(canonical));
  const digest = await identifyCanonicalJson(canonical, sha256);
  return `actor:${digest}` as ActorIdV1;
}
