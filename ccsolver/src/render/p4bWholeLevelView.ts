import type {
  BlobReferenceV1,
  PlacementIdV1,
  PlacementStratumV1,
  StableIdV1,
} from "../domain/artifacts/types.js";
import { CanonicalJsonError, canonicalizeJson } from "../domain/canonicalJson.js";
import type { SolverCoordinate, SolverRenderCell } from "../domain/runtime/types.js";
import {
  P4B_WHOLE_LEVEL_LIMITS,
  P4bWholeLevelError,
  type P4bEvidenceBasisV1,
  type P4bWholeLevelOverlayV1,
  type P4bWholeLevelViewV1,
} from "./p4bWholeLevelModel.js";

type JsonRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;
const WIRING_ID_PATTERN = /^wiring:sha256:[0-9a-f]{64}$/u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

const STRATA = ["terrain", "overlay", "pickup", "actor", "side"] as const;
const DIRECTIONS = ["north", "east", "south", "west"] as const;
const BASIS_ORDER = new Map<P4bEvidenceBasisV1, number>([
  ["source-fact", 0],
  ["static-topology", 1],
  ["plan-intent", 2],
  ["observed-witness", 3],
]);
const STRATUM_ORDER = new Map<string, number>(STRATA.map((stratum, index) => [stratum, index]));

function fail(path: string, message: string, cause?: unknown): never {
  throw new P4bWholeLevelError(
    "p4b.invalid-view",
    path,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function canonicalCopy(value: unknown): unknown {
  try {
    return JSON.parse(canonicalizeJson(value)) as unknown;
  } catch (error) {
    const path = error instanceof CanonicalJsonError ? error.path : "";
    return fail(path, "whole-level view must be canonical JSON safe", error);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) fail(path, "expected an object");
  return value;
}

function requireKeys(value: JsonRecord, path: string, required: readonly string[]): void {
  const allowed = new Set(required);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}/${key}`, "unknown object member");
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}/${key}`, "required object member is missing");
  }
}

function exactString(value: unknown, expected: string, path: string): void {
  if (value !== expected) fail(path, `expected ${expected}`);
}

function oneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    return fail(path, `expected one of ${choices.join(", ")}`);
  }
  return value as T;
}

function stableId(value: unknown, path: string): StableIdV1 {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    return fail(path, "expected a lowercase stable identifier of at most 128 characters");
  }
  return value;
}

function placementId(value: unknown, path: string): PlacementIdV1 {
  if (typeof value !== "string" || !PLACEMENT_ID_PATTERN.test(value)) {
    return fail(path, "expected an exact placement identity");
  }
  return value as PlacementIdV1;
}

function durableText(value: unknown, path: string, maximum = 2_048): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || Array.from(value).length > maximum
    || value.includes("\r")
    || CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    return fail(path, `expected nonempty durable text of at most ${maximum} Unicode scalars`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, minimum = 0, maximum?: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < minimum
    || (maximum !== undefined && value > maximum)
  ) {
    return fail(
      path,
      maximum === undefined
        ? `expected a safe integer greater than or equal to ${minimum}`
        : `expected a safe integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

function blobReference(value: unknown, path: string): BlobReferenceV1 {
  const result = record(value, path);
  requireKeys(result, path, ["digest", "byteLength"]);
  if (typeof result.digest !== "string" || !DIGEST_PATTERN.test(result.digest)) {
    fail(`${path}/digest`, "expected a lowercase SHA-256 digest");
  }
  safeInteger(result.byteLength, `${path}/byteLength`);
  return value as BlobReferenceV1;
}

function optionalBlobReference(value: unknown, path: string): BlobReferenceV1 | null {
  return value === null ? null : blobReference(value, path);
}

function coordinate(
  value: unknown,
  path: string,
  geometry: { readonly width: number; readonly height: number; readonly depth: number },
): SolverCoordinate {
  const result = record(value, path);
  requireKeys(result, path, ["x", "y", "z"]);
  const x = safeInteger(result.x, `${path}/x`);
  const y = safeInteger(result.y, `${path}/y`);
  const z = safeInteger(result.z, `${path}/z`);
  if (x >= geometry.width || y >= geometry.height || z >= geometry.depth) {
    fail(path, "coordinate is outside the supplied whole-level geometry");
  }
  return { x, y, z };
}

function coordinateKey(value: SolverCoordinate): string {
  return `${value.z}:${value.y}:${value.x}`;
}

function compareString(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateIdentity(value: unknown, path: string): void {
  const identity = record(value, path);
  if (identity.kind === "placement") {
    requireKeys(identity, path, ["kind", "placementId"]);
    placementId(identity.placementId, `${path}/placementId`);
  } else if (identity.kind === "actor") {
    requireKeys(identity, path, ["kind", "actorId"]);
    if (typeof identity.actorId !== "string" || !ACTOR_ID_PATTERN.test(identity.actorId)) {
      fail(`${path}/actorId`, "expected an exact actor identity");
    }
  } else if (identity.kind === "semantic") {
    requireKeys(identity, path, ["kind", "semanticId"]);
    stableId(identity.semanticId, `${path}/semanticId`);
  } else {
    fail(`${path}/kind`, "unknown semantic item identity kind");
  }
}

interface SceneIndex {
  readonly cells: readonly SolverRenderCell[];
  readonly cellsByOrdinal: ReadonlyMap<number, SolverRenderCell>;
  readonly placementCoordinates: ReadonlyMap<PlacementIdV1, SolverCoordinate>;
}

function validateCells(
  value: unknown,
  path: string,
  geometry: { readonly width: number; readonly height: number; readonly depth: number },
): SceneIndex {
  if (!Array.isArray(value)) fail(path, "expected an array");
  const expectedCount = geometry.width * geometry.height * geometry.depth;
  if (value.length !== expectedCount) {
    fail(path, "whole-level cells must cover every supplied coordinate exactly once");
  }

  const placementCoordinates = new Map<PlacementIdV1, SolverCoordinate>();
  for (let cellIndex = 0; cellIndex < value.length; cellIndex += 1) {
    const cellPath = `${path}/${cellIndex}`;
    const cell = record(value[cellIndex], cellPath);
    requireKeys(cell, cellPath, ["cellOrdinal", "coordinate", "itemsOrder", "items"]);
    const ordinal = safeInteger(cell.cellOrdinal, `${cellPath}/cellOrdinal`);
    if (ordinal !== cellIndex) {
      fail(`${cellPath}/cellOrdinal`, "cell ordinal must equal its canonical z-y-x array position");
    }
    const cellCoordinate = coordinate(cell.coordinate, `${cellPath}/coordinate`, geometry);
    const expectedX = cellIndex % geometry.width;
    const expectedY = Math.floor(cellIndex / geometry.width) % geometry.height;
    const expectedZ = Math.floor(cellIndex / (geometry.width * geometry.height));
    if (
      cellCoordinate.x !== expectedX
      || cellCoordinate.y !== expectedY
      || cellCoordinate.z !== expectedZ
    ) {
      fail(`${cellPath}/coordinate`, "cell coordinate must equal its canonical z-y-x array position");
    }
    exactString(cell.itemsOrder, "stratum-then-identity", `${cellPath}/itemsOrder`);
    if (!Array.isArray(cell.items)) fail(`${cellPath}/items`, "expected an array");
    if (cell.items.length > P4B_WHOLE_LEVEL_LIMITS.maximumItemsPerCell) {
      fail(
        `${cellPath}/items`,
        `cells may contain at most ${P4B_WHOLE_LEVEL_LIMITS.maximumItemsPerCell} semantic items`,
      );
    }

    let previousItemKey = "";
    for (let itemIndex = 0; itemIndex < cell.items.length; itemIndex += 1) {
      const itemPath = `${cellPath}/items/${itemIndex}`;
      const renderItem = record(cell.items[itemIndex], itemPath);
      requireKeys(renderItem, itemPath, [
        "identity",
        "semanticType",
        "stratum",
        "facing",
        "state",
        "projectionOrder",
        "source",
      ]);
      validateIdentity(renderItem.identity, `${itemPath}/identity`);
      stableId(renderItem.semanticType, `${itemPath}/semanticType`);
      const stratum = oneOf(renderItem.stratum, STRATA, `${itemPath}/stratum`);
      if (renderItem.facing !== null) {
        oneOf(renderItem.facing, DIRECTIONS, `${itemPath}/facing`);
      }
      if (renderItem.state !== null) stableId(renderItem.state, `${itemPath}/state`);
      const projectionOrder = safeInteger(renderItem.projectionOrder, `${itemPath}/projectionOrder`);
      if (projectionOrder !== itemIndex) {
        fail(`${itemPath}/projectionOrder`, "projection order must equal the semantic item array index");
      }
      oneOf(
        renderItem.source,
        ["observation-element", "runtime-overlay"] as const,
        `${itemPath}/source`,
      );

      const itemKey = `${STRATUM_ORDER.get(stratum)}:${canonicalizeJson(renderItem.identity as never)}`;
      if (itemIndex > 0 && previousItemKey >= itemKey) {
        fail(itemPath, "semantic items must be strictly ordered by stratum, then identity");
      }
      previousItemKey = itemKey;

      const identity = renderItem.identity as JsonRecord;
      if (identity.kind === "placement") {
        const id = identity.placementId as PlacementIdV1;
        if (placementCoordinates.has(id)) {
          fail(`${itemPath}/identity/placementId`, "placement identity appears in more than one cell");
        }
        placementCoordinates.set(id, cellCoordinate);
      }
    }
  }

  return {
    cells: value as unknown as readonly SolverRenderCell[],
    cellsByOrdinal: new Map(
      (value as unknown as readonly SolverRenderCell[]).map((cell) => [cell.cellOrdinal, cell]),
    ),
    placementCoordinates,
  };
}

function sameCoordinate(left: SolverCoordinate, right: SolverCoordinate): boolean {
  return coordinateKey(left) === coordinateKey(right);
}

function requirePlacementAt(
  idValue: unknown,
  coordinateValue: unknown,
  path: string,
  geometry: { readonly width: number; readonly height: number; readonly depth: number },
  scene: SceneIndex,
): void {
  const id = placementId(idValue, `${path}/placementId`);
  const at = coordinate(coordinateValue, `${path}/coordinate`, geometry);
  const supplied = scene.placementCoordinates.get(id);
  if (supplied === undefined || !sameCoordinate(supplied, at)) {
    fail(path, "overlay placement must identify an exact supplied semantic item at this coordinate");
  }
}

function validateCellOrdinals(
  value: unknown,
  path: string,
  scene: SceneIndex,
): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return fail(path, "expected at least one cell ordinal");
  }
  if (value.length > P4B_WHOLE_LEVEL_LIMITS.maximumOverlayMembers) {
    fail(path, `overlay membership may contain at most ${P4B_WHOLE_LEVEL_LIMITS.maximumOverlayMembers} cells`);
  }
  let previous = -1;
  return value.map((entry, index) => {
    const ordinal = safeInteger(entry, `${path}/${index}`);
    if (!scene.cellsByOrdinal.has(ordinal)) fail(`${path}/${index}`, "cell ordinal is outside the scene");
    if (ordinal <= previous) fail(`${path}/${index}`, "cell ordinals must be strictly increasing");
    previous = ordinal;
    return ordinal;
  });
}

function validateRoute(
  value: unknown,
  path: string,
  geometry: { readonly width: number; readonly height: number; readonly depth: number },
): void {
  if (!Array.isArray(value) || value.length < 2) {
    fail(path, "routes require at least two supplied coordinates");
  }
  if (value.length > P4B_WHOLE_LEVEL_LIMITS.maximumRouteCoordinates) {
    fail(path, `routes may contain at most ${P4B_WHOLE_LEVEL_LIMITS.maximumRouteCoordinates} coordinates`);
  }
  value.forEach((entry, index) => coordinate(entry, `${path}/${index}`, geometry));
}

function validateOverlayBase(
  overlay: JsonRecord,
  path: string,
  expectedKind: P4bWholeLevelOverlayV1["kind"],
  allowedBases: readonly P4bEvidenceBasisV1[],
): P4bEvidenceBasisV1 {
  exactString(overlay.kind, expectedKind, `${path}/kind`);
  stableId(overlay.overlayId, `${path}/overlayId`);
  const basis = oneOf(overlay.basis, allowedBases, `${path}/basis`);
  durableText(overlay.label, `${path}/label`, 128);
  durableText(overlay.textEquivalent, `${path}/textEquivalent`);
  return basis;
}

function validateOverlay(
  value: unknown,
  path: string,
  geometry: { readonly width: number; readonly height: number; readonly depth: number },
  scene: SceneIndex,
): P4bWholeLevelOverlayV1 {
  const overlay = record(value, path);
  const common = ["overlayId", "kind", "basis", "label", "textEquivalent"];

  switch (overlay.kind) {
    case "source-stratum": {
      requireKeys(overlay, path, [...common, "stratum", "cellOrdinalsOrder", "cellOrdinals"]);
      validateOverlayBase(overlay, path, "source-stratum", ["source-fact"]);
      const stratum = oneOf(overlay.stratum, STRATA, `${path}/stratum`);
      exactString(overlay.cellOrdinalsOrder, "cell-ordinal", `${path}/cellOrdinalsOrder`);
      const ordinals = validateCellOrdinals(overlay.cellOrdinals, `${path}/cellOrdinals`, scene);
      ordinals.forEach((ordinal, index) => {
        const cell = scene.cellsByOrdinal.get(ordinal);
        if (!cell?.items.some((entry) => (
          entry.stratum === stratum && entry.source === "observation-element"
        ))) {
          fail(
            `${path}/cellOrdinals/${index}`,
            "source-stratum membership must match a supplied observation item of that stratum",
          );
        }
      });
      break;
    }
    case "region":
      requireKeys(overlay, path, [...common, "regionId", "cellOrdinalsOrder", "cellOrdinals"]);
      validateOverlayBase(overlay, path, "region", ["static-topology"]);
      stableId(overlay.regionId, `${path}/regionId`);
      exactString(overlay.cellOrdinalsOrder, "cell-ordinal", `${path}/cellOrdinalsOrder`);
      validateCellOrdinals(overlay.cellOrdinals, `${path}/cellOrdinals`, scene);
      break;
    case "resource-source":
      requireKeys(overlay, path, [...common, "placementId", "resourceType", "amount", "coordinate"]);
      validateOverlayBase(overlay, path, "resource-source", ["source-fact"]);
      stableId(overlay.resourceType, `${path}/resourceType`);
      safeInteger(overlay.amount, `${path}/amount`, 1);
      requirePlacementAt(overlay.placementId, overlay.coordinate, path, geometry, scene);
      break;
    case "resource-gate": {
      requireKeys(overlay, path, [
        ...common,
        "placementId",
        "resourceType",
        "gateKind",
        "amount",
        "coordinate",
      ]);
      validateOverlayBase(overlay, path, "resource-gate", ["source-fact"]);
      stableId(overlay.resourceType, `${path}/resourceType`);
      const gateKind = oneOf(
        overlay.gateKind,
        ["consume", "possess", "remaining-zero"] as const,
        `${path}/gateKind`,
      );
      if (gateKind === "remaining-zero") {
        if (overlay.amount !== null) fail(`${path}/amount`, "remaining-zero gates require null amount");
      } else {
        safeInteger(overlay.amount, `${path}/amount`, 1);
      }
      requirePlacementAt(overlay.placementId, overlay.coordinate, path, geometry, scene);
      break;
    }
    case "plan-intent-route":
      requireKeys(overlay, path, [...common, "routeId", "coordinatesOrder", "coordinates"]);
      validateOverlayBase(overlay, path, "plan-intent-route", ["plan-intent"]);
      stableId(overlay.routeId, `${path}/routeId`);
      exactString(overlay.coordinatesOrder, "route-order", `${path}/coordinatesOrder`);
      validateRoute(overlay.coordinates, `${path}/coordinates`, geometry);
      break;
    case "observed-route":
      requireKeys(overlay, path, [...common, "routeId", "coordinatesOrder", "coordinates"]);
      validateOverlayBase(overlay, path, "observed-route", ["observed-witness"]);
      stableId(overlay.routeId, `${path}/routeId`);
      exactString(overlay.coordinatesOrder, "route-order", `${path}/coordinatesOrder`);
      validateRoute(overlay.coordinates, `${path}/coordinates`, geometry);
      break;
    case "subgoal-span":
      requireKeys(overlay, path, [...common, "subgoalId", "subgoalOrder", "start", "end"]);
      validateOverlayBase(overlay, path, "subgoal-span", ["plan-intent", "observed-witness"]);
      stableId(overlay.subgoalId, `${path}/subgoalId`);
      safeInteger(overlay.subgoalOrder, `${path}/subgoalOrder`);
      coordinate(overlay.start, `${path}/start`, geometry);
      coordinate(overlay.end, `${path}/end`, geometry);
      break;
    case "wiring": {
      requireKeys(overlay, path, [
        ...common,
        "wiringId",
        "wiringKind",
        "source",
        "target",
        "claim",
      ]);
      validateOverlayBase(overlay, path, "wiring", ["source-fact"]);
      if (typeof overlay.wiringId !== "string" || !WIRING_ID_PATTERN.test(overlay.wiringId)) {
        fail(`${path}/wiringId`, "expected an exact wiring identity");
      }
      stableId(overlay.wiringKind, `${path}/wiringKind`);
      const source = record(overlay.source, `${path}/source`);
      requireKeys(source, `${path}/source`, ["placementId", "coordinate"]);
      requirePlacementAt(source.placementId, source.coordinate, `${path}/source`, geometry, scene);
      const target = record(overlay.target, `${path}/target`);
      requireKeys(target, `${path}/target`, ["placementId", "coordinate"]);
      requirePlacementAt(target.placementId, target.coordinate, `${path}/target`, geometry, scene);
      exactString(overlay.claim, "declared-connection-only", `${path}/claim`);
      break;
    }
    case "transport": {
      requireKeys(overlay, path, [
        ...common,
        "networkId",
        "transportKind",
        "routingPolicy",
        "membersOrder",
        "members",
        "claim",
      ]);
      validateOverlayBase(overlay, path, "transport", ["source-fact"]);
      stableId(overlay.networkId, `${path}/networkId`);
      stableId(overlay.transportKind, `${path}/transportKind`);
      stableId(overlay.routingPolicy, `${path}/routingPolicy`);
      exactString(overlay.membersOrder, "source-order", `${path}/membersOrder`);
      if (!Array.isArray(overlay.members) || overlay.members.length === 0) {
        fail(`${path}/members`, "transport overlays require at least one supplied member");
      }
      if (overlay.members.length > P4B_WHOLE_LEVEL_LIMITS.maximumOverlayMembers) {
        fail(`${path}/members`, "transport overlay has too many members");
      }
      const memberIds = new Set<string>();
      overlay.members.forEach((entry, index) => {
        const memberPath = `${path}/members/${index}`;
        const member = record(entry, memberPath);
        requireKeys(member, memberPath, ["placementId", "coordinate"]);
        const id = placementId(member.placementId, `${memberPath}/placementId`);
        if (memberIds.has(id)) fail(`${memberPath}/placementId`, "duplicate transport member");
        memberIds.add(id);
        requirePlacementAt(member.placementId, member.coordinate, memberPath, geometry, scene);
      });
      exactString(overlay.claim, "declared-network-membership-only", `${path}/claim`);
      break;
    }
    case "forced-surface":
      requireKeys(overlay, path, [
        ...common,
        "placementId",
        "coordinate",
        "motionKind",
        "direction",
        "turn",
        "claim",
      ]);
      validateOverlayBase(overlay, path, "forced-surface", ["source-fact"]);
      requirePlacementAt(overlay.placementId, overlay.coordinate, path, geometry, scene);
      oneOf(overlay.motionKind, ["force", "ice"] as const, `${path}/motionKind`);
      if (overlay.direction !== null) oneOf(overlay.direction, DIRECTIONS, `${path}/direction`);
      if (overlay.turn !== null) {
        oneOf(overlay.turn, ["left", "right", "reverse"] as const, `${path}/turn`);
      }
      exactString(overlay.claim, "declared-motion-semantics-only", `${path}/claim`);
      break;
    default:
      fail(`${path}/kind`, "unknown whole-level overlay kind");
  }

  return overlay as unknown as P4bWholeLevelOverlayV1;
}

function compareOverlay(left: P4bWholeLevelOverlayV1, right: P4bWholeLevelOverlayV1): number {
  return (BASIS_ORDER.get(left.basis) ?? 99) - (BASIS_ORDER.get(right.basis) ?? 99)
    || compareString(left.kind, right.kind)
    || compareString(left.overlayId, right.overlayId);
}

function validateInternal(value: unknown, normalizeOverlayOrder: boolean): P4bWholeLevelViewV1 {
  const input = record(value, "");
  requireKeys(input, "", [
    "viewType",
    "viewVersion",
    "viewId",
    "caseId",
    "title",
    "target",
    "level",
    "geometry",
    "bindings",
    "cellsOrder",
    "cells",
    "overlaysOrder",
    "overlays",
    "accessibleText",
    "correctness",
  ]);
  exactString(input.viewType, "p4b-whole-level-view", "/viewType");
  if (input.viewVersion !== 1) fail("/viewVersion", "expected version 1");
  stableId(input.viewId, "/viewId");
  stableId(input.caseId, "/caseId");
  durableText(input.title, "/title", 256);
  oneOf(input.target, ["ms", "lynx"] as const, "/target");

  const level = record(input.level, "/level");
  requireKeys(level, "/level", ["occurrenceId", "normalizationProfile", "normalizedGameplayDigest"]);
  stableId(level.occurrenceId, "/level/occurrenceId");
  stableId(level.normalizationProfile, "/level/normalizationProfile");
  if (
    typeof level.normalizedGameplayDigest !== "string"
    || !DIGEST_PATTERN.test(level.normalizedGameplayDigest)
  ) {
    fail("/level/normalizedGameplayDigest", "expected a lowercase SHA-256 digest");
  }

  const geometryValue = record(input.geometry, "/geometry");
  requireKeys(geometryValue, "/geometry", ["width", "height", "depth"]);
  const width = safeInteger(
    geometryValue.width,
    "/geometry/width",
    1,
    P4B_WHOLE_LEVEL_LIMITS.maximumDimension,
  );
  const height = safeInteger(
    geometryValue.height,
    "/geometry/height",
    1,
    P4B_WHOLE_LEVEL_LIMITS.maximumDimension,
  );
  const depth = safeInteger(
    geometryValue.depth,
    "/geometry/depth",
    1,
    P4B_WHOLE_LEVEL_LIMITS.maximumDimension,
  );
  if (depth !== 1) fail("/geometry/depth", "the bounded P4B SVG slice supports exactly one map layer");
  if (width * height * depth > P4B_WHOLE_LEVEL_LIMITS.maximumCells) {
    fail("/geometry", `whole-level views may contain at most ${P4B_WHOLE_LEVEL_LIMITS.maximumCells} cells`);
  }
  const geometry = { width, height, depth };

  const bindings = record(input.bindings, "/bindings");
  requireKeys(bindings, "/bindings", [
    "levelFactsContent",
    "sceneContent",
    "staticAnalysisContent",
    "planContent",
    "witnessContent",
  ]);
  blobReference(bindings.levelFactsContent, "/bindings/levelFactsContent");
  blobReference(bindings.sceneContent, "/bindings/sceneContent");
  const staticAnalysisContent = optionalBlobReference(
    bindings.staticAnalysisContent,
    "/bindings/staticAnalysisContent",
  );
  const planContent = optionalBlobReference(bindings.planContent, "/bindings/planContent");
  const witnessContent = optionalBlobReference(bindings.witnessContent, "/bindings/witnessContent");

  exactString(input.cellsOrder, "z-y-x", "/cellsOrder");
  const scene = validateCells(input.cells, "/cells", geometry);

  exactString(input.overlaysOrder, "basis-kind-id", "/overlaysOrder");
  if (!Array.isArray(input.overlays)) fail("/overlays", "expected an array");
  if (input.overlays.length > P4B_WHOLE_LEVEL_LIMITS.maximumOverlays) {
    fail("/overlays", `whole-level views may contain at most ${P4B_WHOLE_LEVEL_LIMITS.maximumOverlays} overlays`);
  }
  const overlays = input.overlays.map((entry, index) => (
    validateOverlay(entry, `/overlays/${index}`, geometry, scene)
  ));
  const overlayIds = new Set<string>();
  overlays.forEach((entry, index) => {
    if (overlayIds.has(entry.overlayId)) fail(`/overlays/${index}/overlayId`, "duplicate overlay ID");
    overlayIds.add(entry.overlayId);
    if (entry.basis === "static-topology" && staticAnalysisContent === null) {
      fail(`/overlays/${index}/basis`, "static-topology overlays require a static-analysis content binding");
    }
    if (entry.basis === "plan-intent" && planContent === null) {
      fail(`/overlays/${index}/basis`, "plan-intent overlays require a plan content binding");
    }
    if (entry.basis === "observed-witness" && witnessContent === null) {
      fail(`/overlays/${index}/basis`, "observed-witness overlays require a witness content binding");
    }
  });

  if (normalizeOverlayOrder) {
    overlays.sort(compareOverlay);
  } else {
    for (let index = 1; index < overlays.length; index += 1) {
      const previous = overlays[index - 1];
      const current = overlays[index];
      if (previous !== undefined && current !== undefined && compareOverlay(previous, current) >= 0) {
        fail(`/overlays/${index}`, "overlays must be strictly ordered by basis, kind, then overlay ID");
      }
    }
  }

  durableText(input.accessibleText, "/accessibleText", 8_192);
  const correctness = record(input.correctness, "/correctness");
  requireKeys(correctness, "/correctness", [
    "suppliedCellsAreAuthoritative",
    "rendererInventsNoTiles",
    "overlaysDoNotEstablishCausality",
  ]);
  if (correctness.suppliedCellsAreAuthoritative !== true) {
    fail("/correctness/suppliedCellsAreAuthoritative", "supplied cell authority must remain explicit");
  }
  if (correctness.rendererInventsNoTiles !== true) {
    fail("/correctness/rendererInventsNoTiles", "the no-invented-tiles invariant must remain explicit");
  }
  if (correctness.overlaysDoNotEstablishCausality !== true) {
    fail(
      "/correctness/overlaysDoNotEstablishCausality",
      "the non-causal overlay invariant must remain explicit",
    );
  }

  return { ...input, overlays } as unknown as P4bWholeLevelViewV1;
}

/**
 * Creates a detached canonical-safe presentation view. Only the declared
 * basis-kind-ID overlay order is normalized; route and source orders are kept exact.
 */
export function createP4bWholeLevelView(value: unknown): P4bWholeLevelViewV1 {
  const safeInput = canonicalCopy(value);
  return canonicalCopy(validateInternal(safeInput, true)) as P4bWholeLevelViewV1;
}

/** Validates stored output without repairing its canonical overlay ordering. */
export function validateP4bWholeLevelView(value: unknown): P4bWholeLevelViewV1 {
  const safeInput = canonicalCopy(value);
  return canonicalCopy(validateInternal(safeInput, false)) as P4bWholeLevelViewV1;
}
