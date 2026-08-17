import type {
  ActorIdentityDescriptorV1,
  ActorIdV1,
  ArtifactReferenceV1,
  ArtifactV1,
  CorpusCaseV1,
  CorpusTargetV1,
  LevelFactsV1,
  PlacementIdV1,
  ReplayCertificateV1,
  StaticPlacementDescriptorV1,
  StaticWiringDescriptorV1,
  WiringIdV1,
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
const WIRING_ID_PATTERN = /^wiring:sha256:[0-9a-f]{64}$/u;
const ARTIFACT_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffff_ffff;
const MAX_LOGICAL_CELLS = 65_536;
const MAX_STATIC_PLACEMENTS = MAX_LOGICAL_CELLS * 16;
const TARGET_ORDER = new Map([["ms", 0], ["lynx", 1]]);
const STRATUM_ORDER = new Map([
  ["terrain", 0],
  ["overlay", 1],
  ["pickup", 2],
  ["actor", 3],
  ["side", 4],
]);

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

function expectPlacementId(value: unknown, path: string): PlacementIdV1 {
  if (typeof value !== "string" || !PLACEMENT_ID_PATTERN.test(value)) {
    return schemaFailure(path, "expected a placement identity");
  }
  return value as PlacementIdV1;
}

function expectActorId(value: unknown, path: string): ActorIdV1 {
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) {
    return schemaFailure(path, "expected an actor identity");
  }
  return value as ActorIdV1;
}

function expectWiringId(value: unknown, path: string): WiringIdV1 {
  if (typeof value !== "string" || !WIRING_ID_PATTERN.test(value)) {
    return schemaFailure(path, "expected a static wiring identity");
  }
  return value as WiringIdV1;
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

function validateDirectionOrNull(value: unknown, path: string): void {
  if (value !== null) {
    expectEnum(value, path, ["north", "east", "south", "west"] as const);
  }
}

function validateSourceOrigin(value: unknown, path: string): void {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected a source origin object");
  }
  const kind = expectEnum(value.kind, pointer(path, "kind"), [
    "repository",
    "http",
    "synthetic",
  ] as const);
  switch (kind) {
    case "repository": {
      const record = expectObject(value, path, ["kind", "repository", "revision", "path"]);
      expectStableId(record.repository, pointer(path, "repository"));
      expectString(record.revision, pointer(path, "revision"), 256);
      const repositoryPath = expectString(record.path, pointer(path, "path"), 2048);
      const pathSegments = repositoryPath.split("/");
      if (
        repositoryPath.startsWith("/")
        || /^[a-z]:[/\\]/iu.test(repositoryPath)
        || repositoryPath.includes("\\")
        || pathSegments.some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        return schemaFailure(
          pointer(path, "path"),
          "repository source paths must be normalized relative paths without traversal",
        );
      }
      break;
    }
    case "http": {
      const record = expectObject(value, path, ["kind", "url", "revision"]);
      expectString(record.url, pointer(path, "url"), 2048);
      if (record.revision !== null) {
        expectString(record.revision, pointer(path, "revision"), 256);
      }
      break;
    }
    case "synthetic": {
      const record = expectObject(value, path, ["kind", "fixtureId"]);
      expectStableId(record.fixtureId, pointer(path, "fixtureId"));
      break;
    }
  }
}

function validateLevelProvenance(
  value: unknown,
  path: string,
  level: JsonRecord,
): readonly { readonly memberIndex: number; readonly z: number }[] {
  const record = expectObject(
    value,
    path,
    ["source", "occurrence", "importProfile", "normalizedMap"],
  );

  const sourcePath = pointer(path, "source");
  const source = expectObject(record.source, sourcePath, ["format", "origin", "content"]);
  expectStableId(source.format, pointer(sourcePath, "format"));
  validateSourceOrigin(source.origin, pointer(sourcePath, "origin"));
  validateBlobReference(source.content, pointer(sourcePath, "content"));

  const occurrencePath = pointer(path, "occurrence");
  const occurrence = expectObject(record.occurrence, occurrencePath, ["occurrenceId", "members"]);
  const occurrenceId = expectStableId(
    occurrence.occurrenceId,
    pointer(occurrencePath, "occurrenceId"),
  );
  if (occurrenceId !== level.occurrenceId) {
    return invariantFailure(
      pointer(occurrencePath, "occurrenceId"),
      "source occurrence must match the normalized level identity",
    );
  }
  const membersPath = pointer(occurrencePath, "members");
  const members = expectArray(occurrence.members, membersPath);
  if (members.length === 0) {
    return schemaFailure(membersPath, "a source occurrence requires at least one member");
  }
  const memberLayers: { memberIndex: number; z: number }[] = [];
  let previousOrdinal = -1;
  for (let index = 0; index < members.length; index += 1) {
    const memberPath = pointer(membersPath, index);
    const member = expectObject(members[index], memberPath, ["ordinal", "role", "z", "content"]);
    const ordinal = expectInteger(
      member.ordinal,
      pointer(memberPath, "ordinal"),
      0,
      Number.MAX_SAFE_INTEGER,
    );
    if (ordinal <= previousOrdinal) {
      return invariantFailure(
        pointer(memberPath, "ordinal"),
        "source member ordinals must be unique and ascending",
      );
    }
    previousOrdinal = ordinal;
    expectEnum(member.role, pointer(memberPath, "role"), ["level", "layer", "metadata"] as const);
    if (member.z !== null) {
      memberLayers.push({
        memberIndex: index,
        z: expectInteger(member.z, pointer(memberPath, "z"), 0, MAX_UINT16),
      });
    }
    validateBlobReference(member.content, pointer(memberPath, "content"));
  }

  const importPath = pointer(path, "importProfile");
  const importProfile = expectObject(record.importProfile, importPath, [
    "profileId",
    "profileRevision",
    "adapterId",
    "adapterRevision",
    "normalizationProfile",
  ]);
  expectStableId(importProfile.profileId, pointer(importPath, "profileId"));
  expectString(importProfile.profileRevision, pointer(importPath, "profileRevision"), 256);
  expectStableId(importProfile.adapterId, pointer(importPath, "adapterId"));
  expectString(importProfile.adapterRevision, pointer(importPath, "adapterRevision"), 256);
  const normalizationProfile = expectStableId(
    importProfile.normalizationProfile,
    pointer(importPath, "normalizationProfile"),
  );
  if (normalizationProfile !== level.normalizationProfile) {
    return invariantFailure(
      pointer(importPath, "normalizationProfile"),
      "import profile must match the normalized level identity",
    );
  }

  const normalizedPath = pointer(path, "normalizedMap");
  const normalized = expectObject(record.normalizedMap, normalizedPath, [
    "format",
    "formatVersion",
    "content",
  ]);
  if (normalized.format !== "ccsolver-normalized-gameplay-map") {
    return schemaFailure(
      pointer(normalizedPath, "format"),
      "expected CCSolver normalized gameplay map format",
    );
  }
  if (normalized.formatVersion !== 1) {
    return schemaFailure(pointer(normalizedPath, "formatVersion"), "expected format version 1");
  }
  validateBlobReference(normalized.content, pointer(normalizedPath, "content"));
  const normalizedContent = normalized.content as JsonRecord;
  if (normalizedContent.digest !== level.normalizedGameplayDigest) {
    return invariantFailure(
      pointer(pointer(normalizedPath, "content"), "digest"),
      "normalized map digest must match the normalized level identity",
    );
  }
  return memberLayers;
}

interface ValidatedGeometry {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

function validateGeometry(value: unknown, path: string): ValidatedGeometry {
  const geometry = expectObject(value, path, ["width", "height", "depth"]);
  const width = expectInteger(geometry.width, pointer(path, "width"), 1, MAX_LOGICAL_CELLS);
  const height = expectInteger(geometry.height, pointer(path, "height"), 1, MAX_LOGICAL_CELLS);
  const depth = expectInteger(geometry.depth, pointer(path, "depth"), 1, MAX_LOGICAL_CELLS);
  if (
    width > Math.floor(MAX_LOGICAL_CELLS / height)
    || width * height > Math.floor(MAX_LOGICAL_CELLS / depth)
  ) {
    return invariantFailure(path, `level geometry exceeds ${MAX_LOGICAL_CELLS} logical cells`);
  }
  return { width, height, depth };
}

function comparePlacementDescriptors(
  left: StaticPlacementDescriptorV1,
  right: StaticPlacementDescriptorV1,
): number {
  const leftCoordinate = left.coordinate;
  const rightCoordinate = right.coordinate;
  if (leftCoordinate.z !== rightCoordinate.z) return leftCoordinate.z - rightCoordinate.z;
  if (leftCoordinate.y !== rightCoordinate.y) return leftCoordinate.y - rightCoordinate.y;
  if (leftCoordinate.x !== rightCoordinate.x) return leftCoordinate.x - rightCoordinate.x;
  const leftStratum = STRATUM_ORDER.get(left.stratum) ?? Number.MAX_SAFE_INTEGER;
  const rightStratum = STRATUM_ORDER.get(right.stratum) ?? Number.MAX_SAFE_INTEGER;
  if (leftStratum !== rightStratum) return leftStratum - rightStratum;
  if (left.semanticType < right.semanticType) return -1;
  if (left.semanticType > right.semanticType) return 1;
  return left.discriminator - right.discriminator;
}

function placementDescriptorKey(descriptor: StaticPlacementDescriptorV1): string {
  const { coordinate } = descriptor;
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}:${descriptor.stratum}:${descriptor.discriminator}:${descriptor.semanticType}`;
}

function validatePlacementFacts(
  value: unknown,
  path: string,
  levelDigest: unknown,
  geometry: ValidatedGeometry,
): Map<PlacementIdV1, JsonRecord> {
  const entries = expectArray(value, path, MAX_STATIC_PLACEMENTS);
  const byId = new Map<PlacementIdV1, JsonRecord>();
  const descriptorKeys = new Set<string>();
  let previousDescriptor: StaticPlacementDescriptorV1 | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, [
      "placementId",
      "descriptor",
      "sourceElement",
      "interpretation",
      "facing",
      "initialState",
    ]);
    const placementId = expectPlacementId(entry.placementId, pointer(entryPath, "placementId"));
    const descriptorPath = pointer(entryPath, "descriptor");
    const descriptor = validateStaticPlacement(entry.descriptor, descriptorPath);
    if (descriptor.levelDigest !== levelDigest) {
      return invariantFailure(
        pointer(descriptorPath, "levelDigest"),
        "placement descriptor must use the normalized level digest",
      );
    }
    if (descriptor.coordinate.x >= geometry.width) {
      return invariantFailure(
        pointer(pointer(descriptorPath, "coordinate"), "x"),
        "placement x coordinate is outside its layer",
      );
    }
    if (descriptor.coordinate.y >= geometry.height) {
      return invariantFailure(
        pointer(pointer(descriptorPath, "coordinate"), "y"),
        "placement y coordinate is outside its layer",
      );
    }
    if (descriptor.coordinate.z >= geometry.depth) {
      return invariantFailure(
        pointer(pointer(descriptorPath, "coordinate"), "z"),
        "placement z coordinate is outside the level depth",
      );
    }
    if (byId.has(placementId)) {
      return invariantFailure(pointer(entryPath, "placementId"), "placement IDs must be unique");
    }
    const descriptorKey = placementDescriptorKey(descriptor);
    if (descriptorKeys.has(descriptorKey)) {
      return invariantFailure(descriptorPath, "placement descriptors must be unique");
    }
    if (previousDescriptor !== undefined && comparePlacementDescriptors(previousDescriptor, descriptor) >= 0) {
      return invariantFailure(entryPath, "placements must be unique and ordered by coordinate and stratum");
    }
    previousDescriptor = descriptor;
    descriptorKeys.add(descriptorKey);

    const sourcePath = pointer(entryPath, "sourceElement");
    const source = expectObject(entry.sourceElement, sourcePath, [
      "catalogId",
      "catalogRevision",
      "elementToken",
    ]);
    expectStableId(source.catalogId, pointer(sourcePath, "catalogId"));
    expectString(source.catalogRevision, pointer(sourcePath, "catalogRevision"), 256);
    expectString(source.elementToken, pointer(sourcePath, "elementToken"), 256);
    expectEnum(entry.interpretation, pointer(entryPath, "interpretation"), ["known", "unknown"] as const);
    validateDirectionOrNull(entry.facing, pointer(entryPath, "facing"));
    if (entry.initialState !== null) {
      expectStableId(entry.initialState, pointer(entryPath, "initialState"));
    }
    byId.set(placementId, entry);
  }
  return byId;
}

function requirePlacement(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): PlacementIdV1 {
  const placementId = expectPlacementId(value, path);
  if (!placements.has(placementId)) {
    return invariantFailure(path, "feature references an unknown placement");
  }
  return placementId;
}

function validateActorFacts(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  const actorIds = new Set<ActorIdV1>();
  const actorPlacements = new Set<PlacementIdV1>();
  const declaredOrders: { actorIndex: number; order: number }[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, [
      "actorId",
      "descriptor",
      "semanticType",
      "disposition",
      "facing",
      "declaredSourceOrder",
    ]);
    const actorId = expectActorId(entry.actorId, pointer(entryPath, "actorId"));
    if (actorIds.has(actorId)) {
      return invariantFailure(pointer(entryPath, "actorId"), "actor IDs must be unique");
    }
    actorIds.add(actorId);
    const descriptorPath = pointer(entryPath, "descriptor");
    const descriptor = validateActorIdentity(entry.descriptor, descriptorPath);
    if (descriptor.kind !== "initial") {
      return schemaFailure(pointer(descriptorPath, "kind"), "level facts contain only initial actors");
    }
    if (descriptor.sourceActorOrder !== index) {
      return invariantFailure(
        pointer(descriptorPath, "sourceActorOrder"),
        "source actor order must be contiguous, zero-based, and authoritative",
      );
    }
    const placementId = requirePlacement(
      descriptor.placementId,
      pointer(descriptorPath, "placementId"),
      placements,
    );
    if (actorPlacements.has(placementId)) {
      return invariantFailure(pointer(descriptorPath, "placementId"), "actor placements must be unique");
    }
    actorPlacements.add(placementId);
    const placement = placements.get(placementId);
    const placementDescriptor = placement?.descriptor as StaticPlacementDescriptorV1 | undefined;
    if (placementDescriptor?.stratum !== "actor") {
      return invariantFailure(pointer(descriptorPath, "placementId"), "actor identity must reference an actor placement");
    }
    const semanticType = expectStableId(entry.semanticType, pointer(entryPath, "semanticType"));
    if (semanticType !== placementDescriptor.semanticType) {
      return invariantFailure(pointer(entryPath, "semanticType"), "actor and placement semantic types must match");
    }
    expectEnum(entry.disposition, pointer(entryPath, "disposition"), ["active", "contained", "dormant"] as const);
    validateDirectionOrNull(entry.facing, pointer(entryPath, "facing"));
    if (entry.facing !== placement?.facing) {
      return invariantFailure(pointer(entryPath, "facing"), "actor and placement facing must match");
    }
    if (entry.declaredSourceOrder !== null) {
      declaredOrders.push({
        actorIndex: index,
        order: expectInteger(
          entry.declaredSourceOrder,
          pointer(entryPath, "declaredSourceOrder"),
          0,
          MAX_UINT16,
        ),
      });
    }
  }

  declaredOrders.sort((left, right) => left.order - right.order);
  for (let index = 0; index < declaredOrders.length; index += 1) {
    const declaredOrder = declaredOrders[index];
    if (declaredOrder !== undefined && declaredOrder.order !== index) {
      return invariantFailure(
        pointer(pointer(path, declaredOrder.actorIndex), "declaredSourceOrder"),
        "declared source actor order must be unique and contiguous when present",
      );
    }
  }

  for (const [placementId, placement] of placements) {
    const descriptor = placement.descriptor as StaticPlacementDescriptorV1;
    if (descriptor.stratum === "actor" && !actorPlacements.has(placementId)) {
      return invariantFailure(path, "every actor placement requires an actor identity record");
    }
  }
}

function validateTimeLimit(value: unknown, path: string): void {
  if (!isRecord(value)) {
    return schemaFailure(path, "expected a time limit object");
  }
  const kind = expectEnum(value.kind, pointer(path, "kind"), ["untimed", "bounded"] as const);
  if (kind === "untimed") {
    expectObject(value, path, ["kind"]);
    return;
  }
  const record = expectObject(value, path, ["kind", "seconds"]);
  expectInteger(record.seconds, pointer(path, "seconds"), 1, MAX_UINT32);
}

function requireStrictlyAscendingKey(
  previous: string | undefined,
  current: string,
  path: string,
  message: string,
): string {
  if (previous !== undefined && previous >= current) {
    return invariantFailure(path, message);
  }
  return current;
}

function validateResourceRequirements(value: unknown, path: string): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, ["resourceType", "amount"]);
    const resourceType = expectStableId(entry.resourceType, pointer(entryPath, "resourceType"));
    expectInteger(entry.amount, pointer(entryPath, "amount"), 1, MAX_UINT32);
    previous = requireStrictlyAscendingKey(
      previous,
      resourceType,
      entryPath,
      "resource requirements must be unique and sorted by resource type",
    );
  }
}

function validateResourceSources(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, ["placementId", "resourceType", "amount"]);
    const placementId = requirePlacement(entry.placementId, pointer(entryPath, "placementId"), placements);
    const resourceType = expectStableId(entry.resourceType, pointer(entryPath, "resourceType"));
    expectInteger(entry.amount, pointer(entryPath, "amount"), 1, MAX_UINT32);
    previous = requireStrictlyAscendingKey(
      previous,
      `${placementId}\0${resourceType}`,
      entryPath,
      "resource sources must be unique and sorted",
    );
  }
}

function validateResourceGates(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = entries[index];
    if (!isRecord(entry)) return schemaFailure(entryPath, "expected a resource gate object");
    const kind = expectEnum(entry.kind, pointer(entryPath, "kind"), [
      "consume",
      "possess",
      "remaining-zero",
    ] as const);
    const record = kind === "remaining-zero"
      ? expectObject(entry, entryPath, ["kind", "placementId", "resourceType"])
      : expectObject(entry, entryPath, ["kind", "placementId", "resourceType", "amount"]);
    const placementId = requirePlacement(record.placementId, pointer(entryPath, "placementId"), placements);
    const resourceType = expectStableId(record.resourceType, pointer(entryPath, "resourceType"));
    if (kind !== "remaining-zero") {
      expectInteger(record.amount, pointer(entryPath, "amount"), 1, MAX_UINT32);
    }
    previous = requireStrictlyAscendingKey(
      previous,
      `${placementId}\0${resourceType}\0${kind}`,
      entryPath,
      "resource gates must be unique and sorted",
    );
  }
}

function validatePlacementIdSet(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const placementId = requirePlacement(entries[index], entryPath, placements);
    previous = requireStrictlyAscendingKey(
      previous,
      placementId,
      entryPath,
      "placement references must be unique and sorted",
    );
  }
}

function compareWiringDescriptors(
  left: StaticWiringDescriptorV1,
  right: StaticWiringDescriptorV1,
): number {
  if (left.kind < right.kind) return -1;
  if (left.kind > right.kind) return 1;
  if (left.sourceOrder !== right.sourceOrder) return left.sourceOrder - right.sourceOrder;
  if (left.sourcePlacementId < right.sourcePlacementId) return -1;
  if (left.sourcePlacementId > right.sourcePlacementId) return 1;
  if (left.targetPlacementId < right.targetPlacementId) return -1;
  if (left.targetPlacementId > right.targetPlacementId) return 1;
  return left.discriminator - right.discriminator;
}

function validateWiringFacts(
  value: unknown,
  path: string,
  levelDigest: unknown,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  const wiringIds = new Set<WiringIdV1>();
  const sourceOrders = new Set<string>();
  let previous: StaticWiringDescriptorV1 | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, ["wiringId", "descriptor"]);
    const wiringId = expectWiringId(entry.wiringId, pointer(entryPath, "wiringId"));
    if (wiringIds.has(wiringId)) {
      return invariantFailure(pointer(entryPath, "wiringId"), "wiring IDs must be unique");
    }
    wiringIds.add(wiringId);
    const descriptorPath = pointer(entryPath, "descriptor");
    const descriptor = validateStaticWiring(entry.descriptor, descriptorPath);
    const sourceOrderKey = `${descriptor.kind}\0${descriptor.sourceOrder}`;
    if (sourceOrders.has(sourceOrderKey)) {
      return invariantFailure(
        pointer(descriptorPath, "sourceOrder"),
        "wiring source order must be unique within its kind",
      );
    }
    sourceOrders.add(sourceOrderKey);
    if (descriptor.levelDigest !== levelDigest) {
      return invariantFailure(
        pointer(descriptorPath, "levelDigest"),
        "wiring descriptor must use the normalized level digest",
      );
    }
    requirePlacement(
      descriptor.sourcePlacementId,
      pointer(descriptorPath, "sourcePlacementId"),
      placements,
    );
    requirePlacement(
      descriptor.targetPlacementId,
      pointer(descriptorPath, "targetPlacementId"),
      placements,
    );
    if (previous !== undefined && compareWiringDescriptors(previous, descriptor) >= 0) {
      return invariantFailure(entryPath, "wiring facts must be unique and sorted");
    }
    previous = descriptor;
  }
}

function validateTransports(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, ["networkId", "kind", "members", "routingPolicy"]);
    const networkId = expectStableId(entry.networkId, pointer(entryPath, "networkId"));
    previous = requireStrictlyAscendingKey(
      previous,
      networkId,
      entryPath,
      "transport networks must have unique sorted IDs",
    );
    expectStableId(entry.kind, pointer(entryPath, "kind"));
    expectStableId(entry.routingPolicy, pointer(entryPath, "routingPolicy"));
    const membersPath = pointer(entryPath, "members");
    const members = expectArray(entry.members, membersPath);
    if (members.length === 0) {
      return schemaFailure(membersPath, "transport networks require at least one member");
    }
    const seen = new Set<PlacementIdV1>();
    for (let memberIndex = 0; memberIndex < members.length; memberIndex += 1) {
      const memberPath = pointer(membersPath, memberIndex);
      const placementId = requirePlacement(members[memberIndex], memberPath, placements);
      if (seen.has(placementId)) {
        return invariantFailure(memberPath, "transport members must be unique");
      }
      seen.add(placementId);
    }
  }
}

function validateForcedSurfaces(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, ["placementId", "motion", "direction", "turn"]);
    const placementId = requirePlacement(entry.placementId, pointer(entryPath, "placementId"), placements);
    previous = requireStrictlyAscendingKey(
      previous,
      placementId,
      entryPath,
      "forced surfaces must reference unique sorted placements",
    );
    expectEnum(entry.motion, pointer(entryPath, "motion"), ["force", "ice"] as const);
    validateDirectionOrNull(entry.direction, pointer(entryPath, "direction"));
    if (entry.turn !== null) {
      expectEnum(entry.turn, pointer(entryPath, "turn"), ["left", "right", "reverse"] as const);
    }
  }
}

function validateSortedStableIds(value: unknown, path: string): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const stableId = expectStableId(entries[index], entryPath);
    previous = requireStrictlyAscendingKey(
      previous,
      stableId,
      entryPath,
      "stable identifiers must be unique and sorted",
    );
  }
}

function validateHazards(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = expectObject(entries[index], entryPath, [
      "placementId",
      "hazardType",
      "persistence",
      "protectionResources",
    ]);
    const placementId = requirePlacement(entry.placementId, pointer(entryPath, "placementId"), placements);
    const hazardType = expectStableId(entry.hazardType, pointer(entryPath, "hazardType"));
    previous = requireStrictlyAscendingKey(
      previous,
      `${placementId}\0${hazardType}`,
      entryPath,
      "hazards must be unique and sorted",
    );
    expectEnum(entry.persistence, pointer(entryPath, "persistence"), ["persistent", "single-use"] as const);
    validateSortedStableIds(entry.protectionResources, pointer(entryPath, "protectionResources"));
  }
}

function validateCoordinateWithinGeometry(
  value: unknown,
  path: string,
  geometry: ValidatedGeometry,
): void {
  validateCoordinate(value, path);
  const coordinate = value as JsonRecord;
  if ((coordinate.x as number) >= geometry.width) {
    return invariantFailure(pointer(path, "x"), "coordinate x is outside the level geometry");
  }
  if ((coordinate.y as number) >= geometry.height) {
    return invariantFailure(pointer(path, "y"), "coordinate y is outside the level geometry");
  }
  if ((coordinate.z as number) >= geometry.depth) {
    return invariantFailure(pointer(path, "z"), "coordinate z is outside the level geometry");
  }
}

function validateCoordinateArray(
  value: unknown,
  path: string,
  geometry: ValidatedGeometry,
): void {
  const entries = expectArray(value, path);
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    validateCoordinateWithinGeometry(entries[index], entryPath, geometry);
    const coordinate = entries[index] as JsonRecord;
    const key = `${String(coordinate.z).padStart(5, "0")}:${String(coordinate.y).padStart(5, "0")}:${String(coordinate.x).padStart(5, "0")}`;
    previous = requireStrictlyAscendingKey(
      previous,
      key,
      entryPath,
      "coordinates must be unique and sorted",
    );
  }
}

function validateUnknownFacts(
  value: unknown,
  path: string,
  placements: ReadonlyMap<PlacementIdV1, JsonRecord>,
  geometry: ValidatedGeometry,
): void {
  const entries = expectArray(value, path);
  const unknownCatalogPlacements = new Set<PlacementIdV1>();
  let previous: string | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entryPath = pointer(path, index);
    const entry = entries[index];
    if (!isRecord(entry)) return schemaFailure(entryPath, "expected an unknown static fact object");
    const kind = expectEnum(entry.kind, pointer(entryPath, "kind"), [
      "unknown-catalog-element",
      "unresolved-wiring",
      "unsupported-source-feature",
      "invalid-source-condition",
    ] as const);
    const unknownId = expectStableId(entry.unknownId, pointer(entryPath, "unknownId"));
    previous = requireStrictlyAscendingKey(
      previous,
      unknownId,
      entryPath,
      "unknown facts must have unique sorted IDs",
    );
    switch (kind) {
      case "unknown-catalog-element": {
        const record = expectObject(entry, entryPath, [
          "unknownId",
          "kind",
          "placementId",
          "catalogId",
          "sourceToken",
          "reason",
        ]);
        const placementId = requirePlacement(
          record.placementId,
          pointer(entryPath, "placementId"),
          placements,
        );
        expectStableId(record.catalogId, pointer(entryPath, "catalogId"));
        expectString(record.sourceToken, pointer(entryPath, "sourceToken"), 256);
        expectString(record.reason, pointer(entryPath, "reason"), 2048);
        const placement = placements.get(placementId);
        if (placement?.interpretation !== "unknown") {
          return invariantFailure(
            pointer(entryPath, "placementId"),
            "unknown catalog fact must reference an unknown placement",
          );
        }
        if (unknownCatalogPlacements.has(placementId)) {
          return invariantFailure(
            pointer(entryPath, "placementId"),
            "an unknown placement must have exactly one catalog uncertainty fact",
          );
        }
        unknownCatalogPlacements.add(placementId);
        const sourceElement = placement.sourceElement as JsonRecord;
        if (record.catalogId !== sourceElement.catalogId) {
          return invariantFailure(
            pointer(entryPath, "catalogId"),
            "unknown fact catalog must match its placement source catalog",
          );
        }
        if (record.sourceToken !== sourceElement.elementToken) {
          return invariantFailure(
            pointer(entryPath, "sourceToken"),
            "unknown fact token must match its placement source token",
          );
        }
        break;
      }
      case "unresolved-wiring": {
        const record = expectObject(entry, entryPath, [
          "unknownId",
          "kind",
          "wiringKind",
          "source",
          "target",
          "reason",
        ]);
        expectStableId(record.wiringKind, pointer(entryPath, "wiringKind"));
        validateCoordinateWithinGeometry(record.source, pointer(entryPath, "source"), geometry);
        validateCoordinateWithinGeometry(record.target, pointer(entryPath, "target"), geometry);
        expectString(record.reason, pointer(entryPath, "reason"), 2048);
        break;
      }
      case "unsupported-source-feature": {
        const record = expectObject(entry, entryPath, [
          "unknownId",
          "kind",
          "sourceToken",
          "coordinates",
          "reason",
        ]);
        expectString(record.sourceToken, pointer(entryPath, "sourceToken"), 256);
        validateCoordinateArray(record.coordinates, pointer(entryPath, "coordinates"), geometry);
        expectString(record.reason, pointer(entryPath, "reason"), 2048);
        break;
      }
      case "invalid-source-condition": {
        const record = expectObject(entry, entryPath, ["unknownId", "kind", "coordinates", "reason"]);
        validateCoordinateArray(record.coordinates, pointer(entryPath, "coordinates"), geometry);
        expectString(record.reason, pointer(entryPath, "reason"), 2048);
        break;
      }
    }
  }

  for (const [placementId, placement] of placements) {
    if (placement.interpretation === "unknown" && !unknownCatalogPlacements.has(placementId)) {
      return invariantFailure(
        path,
        "every unknown placement requires exactly one matching catalog uncertainty fact",
      );
    }
  }
}

function validateLevelFacts(value: JsonRecord): LevelFactsV1 {
  const payloadPath = "/payload";
  const payload = expectObject(value.payload, payloadPath, [
    "producerRevision",
    "target",
    "level",
    "analyzer",
    "provenance",
    "geometry",
    "placements",
    "actors",
    "timeLimit",
    "requiredCollectibles",
    "resourceSources",
    "resourceGates",
    "exits",
    "wiring",
    "transports",
    "forcedSurfaces",
    "hazards",
    "unknowns",
  ]);
  expectString(payload.producerRevision, pointer(payloadPath, "producerRevision"), 256);
  expectEnum(payload.target, pointer(payloadPath, "target"), ["ms", "lynx"] as const);
  const levelPath = pointer(payloadPath, "level");
  validateLevelIdentity(payload.level, levelPath);
  const level = payload.level as JsonRecord;

  const analyzerPath = pointer(payloadPath, "analyzer");
  const analyzer = expectObject(payload.analyzer, analyzerPath, [
    "analyzerId",
    "analyzerRevision",
    "analysisProfile",
  ]);
  expectStableId(analyzer.analyzerId, pointer(analyzerPath, "analyzerId"));
  expectString(analyzer.analyzerRevision, pointer(analyzerPath, "analyzerRevision"), 256);
  expectStableId(analyzer.analysisProfile, pointer(analyzerPath, "analysisProfile"));

  const provenancePath = pointer(payloadPath, "provenance");
  const memberLayers = validateLevelProvenance(payload.provenance, provenancePath, level);
  const geometryPath = pointer(payloadPath, "geometry");
  const geometry = validateGeometry(payload.geometry, geometryPath);
  for (const memberLayer of memberLayers) {
    if (memberLayer.z >= geometry.depth) {
      return invariantFailure(
        pointer(
          pointer(
            pointer(pointer(provenancePath, "occurrence"), "members"),
            memberLayer.memberIndex,
          ),
          "z",
        ),
        "source member z must resolve to a geometry layer",
      );
    }
  }

  const placements = validatePlacementFacts(
    payload.placements,
    pointer(payloadPath, "placements"),
    level.normalizedGameplayDigest,
    geometry,
  );
  validateActorFacts(payload.actors, pointer(payloadPath, "actors"), placements);
  validateTimeLimit(payload.timeLimit, pointer(payloadPath, "timeLimit"));
  validateResourceRequirements(
    payload.requiredCollectibles,
    pointer(payloadPath, "requiredCollectibles"),
  );
  validateResourceSources(payload.resourceSources, pointer(payloadPath, "resourceSources"), placements);
  validateResourceGates(payload.resourceGates, pointer(payloadPath, "resourceGates"), placements);
  validatePlacementIdSet(payload.exits, pointer(payloadPath, "exits"), placements);
  validateWiringFacts(
    payload.wiring,
    pointer(payloadPath, "wiring"),
    level.normalizedGameplayDigest,
    placements,
  );
  validateTransports(payload.transports, pointer(payloadPath, "transports"), placements);
  validateForcedSurfaces(payload.forcedSurfaces, pointer(payloadPath, "forcedSurfaces"), placements);
  validateHazards(payload.hazards, pointer(payloadPath, "hazards"), placements);
  validateUnknownFacts(payload.unknowns, pointer(payloadPath, "unknowns"), placements, geometry);
  return value as unknown as LevelFactsV1;
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
      validateArtifactReference(record.levelFacts, pointer(path, "levelFacts"), "level-facts", 1);
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
  if (
    value.artifactType !== "corpus-case"
    && value.artifactType !== "replay-certificate"
    && value.artifactType !== "level-facts"
  ) {
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

  if (value.artifactType === "corpus-case") {
    return validateCorpusCase(value);
  }
  return value.artifactType === "replay-certificate"
    ? validateReplayCertificate(value)
    : validateLevelFacts(value);
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

function validateStaticWiring(
  value: unknown,
  path = "",
): StaticWiringDescriptorV1 {
  const record = expectObject(value, path, [
    "identityType",
    "identityVersion",
    "levelDigest",
    "kind",
    "sourceOrder",
    "sourcePlacementId",
    "targetPlacementId",
    "discriminator",
  ]);
  if (record.identityType !== "static-wiring") {
    return schemaFailure(pointer(path, "identityType"), "expected static-wiring identity");
  }
  if (record.identityVersion !== 1) {
    return schemaFailure(pointer(path, "identityVersion"), "expected identity version 1");
  }
  expectArtifactId(record.levelDigest, pointer(path, "levelDigest"));
  expectStableId(record.kind, pointer(path, "kind"));
  expectInteger(record.sourceOrder, pointer(path, "sourceOrder"), 0, MAX_UINT32);
  expectPlacementId(record.sourcePlacementId, pointer(path, "sourcePlacementId"));
  expectPlacementId(record.targetPlacementId, pointer(path, "targetPlacementId"));
  expectInteger(record.discriminator, pointer(path, "discriminator"), 0, MAX_UINT16);
  return value as unknown as StaticWiringDescriptorV1;
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

export async function identifyStaticWiring(
  descriptor: StaticWiringDescriptorV1,
  sha256: Sha256Port,
): Promise<WiringIdV1> {
  let canonical: CanonicalJson;
  try {
    canonical = canonicalizeJson(descriptor);
  } catch (error) {
    return translateCanonicalError(error);
  }
  validateStaticWiring(parseCanonicalJson(canonical));
  const digest = await identifyCanonicalJson(canonical, sha256);
  return `wiring:${digest}` as WiringIdV1;
}

function identityMismatch(path: string, identityKind: string): never {
  throw new ArtifactProtocolError(
    "artifact.digest-mismatch",
    path,
    `${identityKind} does not match its canonical descriptor`,
  );
}

export async function verifyLevelFactsIdentities(
  input: LevelFactsV1,
  sha256: Sha256Port,
): Promise<void> {
  const artifact = decodeCanonicalArtifact(encodeArtifact(input));
  if (artifact.artifactType !== "level-facts") {
    return bundleFailure("/artifactType", "expected a level-facts artifact");
  }

  for (let index = 0; index < artifact.payload.placements.length; index += 1) {
    const placement = artifact.payload.placements[index];
    if (placement === undefined) continue;
    const expected = await identifyStaticPlacement(placement.descriptor, sha256);
    if (placement.placementId !== expected) {
      return identityMismatch(
        pointer(pointer("/payload/placements", index), "placementId"),
        "placement identity",
      );
    }
  }

  for (let index = 0; index < artifact.payload.actors.length; index += 1) {
    const actor = artifact.payload.actors[index];
    if (actor === undefined) continue;
    const expected = await identifyActor(actor.descriptor, sha256);
    if (actor.actorId !== expected) {
      return identityMismatch(
        pointer(pointer("/payload/actors", index), "actorId"),
        "actor identity",
      );
    }
  }

  for (let index = 0; index < artifact.payload.wiring.length; index += 1) {
    const wiring = artifact.payload.wiring[index];
    if (wiring === undefined) continue;
    const expected = await identifyStaticWiring(wiring.descriptor, sha256);
    if (wiring.wiringId !== expected) {
      return identityMismatch(
        pointer(pointer("/payload/wiring", index), "wiringId"),
        "wiring identity",
      );
    }
  }
}
