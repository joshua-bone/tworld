import type { BlobReferenceV1, StableIdV1 } from "../domain/artifacts/types.js";
import { canonicalizeJson } from "../domain/canonicalJson.js";
import type { SolverCoordinate, SolverResolvedRenderRegion } from "../domain/runtime/types.js";
import type { ContextualWitnessFailureV1 } from "../snippets/model.js";
import {
  SubgoalEvidenceError,
  type ActualFailureSubgoalEvidencePanelV1,
  type EndingSubgoalEvidencePanelV1,
  type ExpectedSubgoalPanelBindingV1,
  type IntendedEndingSubgoalEvidencePanelV1,
  type ObservedSubgoalPanelBindingV1,
  type StartingSubgoalEvidencePanelV1,
  type SubgoalEvidenceBasisV1,
  type SubgoalEvidenceEndingV1,
  type SubgoalEvidenceMetricV1,
  type SubgoalEvidenceOverlayV1,
  type SubgoalEvidencePanelV1,
  type SubgoalEvidenceSceneV1,
  type SubgoalEvidenceViewV1,
} from "./model.js";

type JsonRecord = Record<string, unknown>;

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;
const MAX_PANEL_CELLS = 64;
const MAX_OVERLAYS = 32;
const MAX_PANEL_OVERLAYS = 16;
const MAX_CELL_ITEMS = 8;
const MAX_PANEL_METRICS = 16;

const stratumOrder = new Map([
  ["terrain", 0],
  ["overlay", 1],
  ["pickup", 2],
  ["actor", 3],
  ["side", 4],
]);

const basisOrder = new Map<SubgoalEvidenceBasisV1, number>([
  ["regressed-requirement", 0],
  ["backward-candidate", 1],
  ["plan-intent", 2],
  ["observed-witness", 3],
  ["donor-evidence", 4],
]);

const kindOrder = new Map<SubgoalEvidenceOverlayV1["kind"], number>([
  ["point-of-interest", 0],
  ["state-change", 1],
  ["route", 2],
]);

function fail(path: string, message: string): never {
  throw new SubgoalEvidenceError("evidence.invalid-view", path, message);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): JsonRecord {
  if (!isRecord(value)) fail(path, "expected an object");
  return value;
}

function requireKeys(
  value: JsonRecord,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${path}/${key}`, "unknown object member");
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${path}/${key}`, "required object member is missing");
  }
}

function stableId(value: unknown, path: string): StableIdV1 {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    return fail(path, "expected a lowercase stable identifier of at most 128 characters");
  }
  return value;
}

function durableText(value: unknown, path: string, maximum = 2_048): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > maximum
    || value.includes("\r")
  ) {
    return fail(path, `expected nonempty durable text of at most ${maximum} Unicode scalars`);
  }
  return value;
}

function exactString(value: unknown, expected: string, path: string): void {
  if (value !== expected) fail(path, `expected ${expected}`);
}

function safeInteger(value: unknown, path: string, minimum = 0): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < minimum
  ) {
    return fail(path, `expected a safe integer greater than or equal to ${minimum}`);
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

function sameBlob(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function coordinate(value: unknown, path: string): SolverCoordinate {
  const result = record(value, path);
  requireKeys(result, path, ["x", "y", "z"]);
  const x = safeInteger(result.x, `${path}/x`);
  const y = safeInteger(result.y, `${path}/y`);
  const z = safeInteger(result.z, `${path}/z`);
  if (x > 0xffff || y > 0xffff || z > 0xffff) {
    fail(path, "coordinates must fit unsigned 16-bit values");
  }
  return { x, y, z };
}

function coordinateKey(value: SolverCoordinate): string {
  return `${value.z}:${value.y}:${value.x}`;
}

function compareCoordinate(left: SolverCoordinate, right: SolverCoordinate): number {
  return left.z - right.z || left.y - right.y || left.x - right.x;
}

function region(value: unknown, path: string): SolverResolvedRenderRegion {
  const result = record(value, path);
  requireKeys(result, path, ["kind", "minimum", "maximum"]);
  if (result.kind !== "box" && result.kind !== "full-map") {
    fail(`${path}/kind`, "expected box or full-map");
  }
  const minimum = coordinate(result.minimum, `${path}/minimum`);
  const maximum = coordinate(result.maximum, `${path}/maximum`);
  if (minimum.x > maximum.x || minimum.y > maximum.y || minimum.z > maximum.z) {
    fail(path, "region minimum must not exceed maximum");
  }
  const cellCount = (maximum.x - minimum.x + 1)
    * (maximum.y - minimum.y + 1)
    * (maximum.z - minimum.z + 1);
  if (!Number.isSafeInteger(cellCount) || cellCount > MAX_PANEL_CELLS) {
    fail(path, `panel regions may contain at most ${MAX_PANEL_CELLS} cells`);
  }
  return { kind: result.kind, minimum, maximum };
}

function sameRegion(left: SolverResolvedRenderRegion, right: SolverResolvedRenderRegion): boolean {
  return left.kind === right.kind
    && coordinateKey(left.minimum) === coordinateKey(right.minimum)
    && coordinateKey(left.maximum) === coordinateKey(right.maximum);
}

function coordinateInRegion(value: SolverCoordinate, valueRegion: SolverResolvedRenderRegion): boolean {
  return value.x >= valueRegion.minimum.x && value.x <= valueRegion.maximum.x
    && value.y >= valueRegion.minimum.y && value.y <= valueRegion.maximum.y
    && value.z >= valueRegion.minimum.z && value.z <= valueRegion.maximum.z;
}

function scene(value: unknown, path: string, viewport: SolverResolvedRenderRegion): SubgoalEvidenceSceneV1 {
  const result = record(value, path);
  requireKeys(result, path, ["region", "cellsOrder", "cells"]);
  exactString(result.cellsOrder, "z-y-x", `${path}/cellsOrder`);
  const sceneRegion = region(result.region, `${path}/region`);
  if (!sameRegion(sceneRegion, viewport)) {
    fail(`${path}/region`, "panel scene region must equal the fixed evidence viewport");
  }
  if (!Array.isArray(result.cells)) fail(`${path}/cells`, "expected an array");
  const expectedCount = (viewport.maximum.x - viewport.minimum.x + 1)
    * (viewport.maximum.y - viewport.minimum.y + 1)
    * (viewport.maximum.z - viewport.minimum.z + 1);
  if (result.cells.length !== expectedCount) {
    fail(`${path}/cells`, "panel scene must cover every viewport cell exactly once");
  }
  let previous: SolverCoordinate | undefined;
  const keys = new Set<string>();
  for (let index = 0; index < result.cells.length; index += 1) {
    const cellPath = `${path}/cells/${index}`;
    const cell = record(result.cells[index], cellPath);
    requireKeys(cell, cellPath, ["cellOrdinal", "coordinate", "itemsOrder", "items"]);
    safeInteger(cell.cellOrdinal, `${cellPath}/cellOrdinal`);
    const cellCoordinate = coordinate(cell.coordinate, `${cellPath}/coordinate`);
    if (!coordinateInRegion(cellCoordinate, viewport)) {
      fail(`${cellPath}/coordinate`, "cell coordinate is outside the fixed viewport");
    }
    if (previous !== undefined && compareCoordinate(previous, cellCoordinate) >= 0) {
      fail(`${cellPath}/coordinate`, "cells must be strictly ordered by z, y, then x");
    }
    previous = cellCoordinate;
    const key = coordinateKey(cellCoordinate);
    if (keys.has(key)) fail(`${cellPath}/coordinate`, "duplicate cell coordinate");
    keys.add(key);
    exactString(cell.itemsOrder, "stratum-then-identity", `${cellPath}/itemsOrder`);
    if (!Array.isArray(cell.items)) fail(`${cellPath}/items`, "expected an array");
    if (cell.items.length > MAX_CELL_ITEMS) {
      fail(`${cellPath}/items`, `cells may contain at most ${MAX_CELL_ITEMS} semantic items`);
    }
    let previousItemKey = "";
    for (let itemIndex = 0; itemIndex < cell.items.length; itemIndex += 1) {
      const itemPath = `${cellPath}/items/${itemIndex}`;
      const item = record(cell.items[itemIndex], itemPath);
      requireKeys(item, itemPath, [
        "identity",
        "semanticType",
        "stratum",
        "facing",
        "state",
        "projectionOrder",
        "source",
      ]);
      const identity = record(item.identity, `${itemPath}/identity`);
      if (identity.kind === "placement") {
        requireKeys(identity, `${itemPath}/identity`, ["kind", "placementId"]);
        if (typeof identity.placementId !== "string" || !PLACEMENT_ID_PATTERN.test(identity.placementId)) {
          fail(`${itemPath}/identity/placementId`, "expected an exact placement identity");
        }
      } else if (identity.kind === "actor") {
        requireKeys(identity, `${itemPath}/identity`, ["kind", "actorId"]);
        if (typeof identity.actorId !== "string" || !ACTOR_ID_PATTERN.test(identity.actorId)) {
          fail(`${itemPath}/identity/actorId`, "expected an exact actor identity");
        }
      } else if (identity.kind === "semantic") {
        requireKeys(identity, `${itemPath}/identity`, ["kind", "semanticId"]);
        stableId(identity.semanticId, `${itemPath}/identity/semanticId`);
      } else {
        fail(`${itemPath}/identity/kind`, "unknown semantic item identity kind");
      }
      stableId(item.semanticType, `${itemPath}/semanticType`);
      if (!["terrain", "overlay", "pickup", "actor", "side"].includes(item.stratum as string)) {
        fail(`${itemPath}/stratum`, "unknown semantic item stratum");
      }
      const itemKey = `${stratumOrder.get(item.stratum as string)}:${canonicalizeJson(identity)}`;
      if (itemIndex > 0 && previousItemKey >= itemKey) {
        fail(itemPath, "semantic items must be strictly ordered by stratum, then identity");
      }
      previousItemKey = itemKey;
      if (item.facing !== null && !["north", "east", "south", "west"].includes(item.facing as string)) {
        fail(`${itemPath}/facing`, "expected null or a cardinal direction");
      }
      if (item.state !== null) stableId(item.state, `${itemPath}/state`);
      const projectionOrder = safeInteger(item.projectionOrder, `${itemPath}/projectionOrder`);
      if (projectionOrder !== itemIndex) {
        fail(`${itemPath}/projectionOrder`, "projection order must equal the semantic item array index");
      }
      if (item.source !== "observation-element" && item.source !== "runtime-overlay") {
        fail(`${itemPath}/source`, "unknown semantic item source");
      }
    }
  }
  return value as SubgoalEvidenceSceneV1;
}

function observedBinding(value: unknown, path: string): ObservedSubgoalPanelBindingV1 {
  const result = record(value, path);
  exactString(result.kind, "observed", `${path}/kind`);
  requireKeys(result, path, [
    "kind",
    "nativeTick",
    "exactFingerprint",
    "observationContent",
    "renderContent",
  ]);
  safeInteger(result.nativeTick, `${path}/nativeTick`, -1);
  if (typeof result.exactFingerprint !== "string" || !DIGEST_PATTERN.test(result.exactFingerprint)) {
    fail(`${path}/exactFingerprint`, "expected an exact SHA-256 runtime fingerprint");
  }
  blobReference(result.observationContent, `${path}/observationContent`);
  blobReference(result.renderContent, `${path}/renderContent`);
  return value as ObservedSubgoalPanelBindingV1;
}

function expectedBinding(
  value: unknown,
  path: string,
  contract: BlobReferenceV1,
): ExpectedSubgoalPanelBindingV1 {
  const result = record(value, path);
  exactString(result.kind, "expected", `${path}/kind`);
  requireKeys(result, path, ["kind", "contractContent", "predicateIdsOrder", "predicateIds"]);
  const contractContent = blobReference(result.contractContent, `${path}/contractContent`);
  if (!sameBlob(contractContent, contract)) {
    fail(`${path}/contractContent`, "expected panel must bind the evidence view contract");
  }
  exactString(result.predicateIdsOrder, "predicate-id", `${path}/predicateIdsOrder`);
  if (!Array.isArray(result.predicateIds) || result.predicateIds.length === 0) {
    fail(`${path}/predicateIds`, "expected at least one intended-ending predicate");
  }
  let previous = "";
  for (let index = 0; index < result.predicateIds.length; index += 1) {
    const id = stableId(result.predicateIds[index], `${path}/predicateIds/${index}`);
    if (index > 0 && previous >= id) {
      fail(`${path}/predicateIds/${index}`, "predicate IDs must be strictly ordered");
    }
    previous = id;
  }
  return value as ExpectedSubgoalPanelBindingV1;
}

function metric(value: unknown, path: string): SubgoalEvidenceMetricV1 {
  const result = record(value, path);
  requireKeys(result, path, ["metricId", "label", "value"]);
  return {
    metricId: stableId(result.metricId, `${path}/metricId`),
    label: durableText(result.label, `${path}/label`, 128),
    value: durableText(result.value, `${path}/value`, 256),
  };
}

function validatePanelBase(
  value: unknown,
  path: string,
  expectedKind: SubgoalEvidencePanelV1["panelKind"],
  viewport: SolverResolvedRenderRegion,
  overlaysById: ReadonlyMap<string, SubgoalEvidenceOverlayV1>,
): JsonRecord {
  const result = record(value, path);
  requireKeys(result, path, [
    "panelId",
    "panelKind",
    "title",
    "binding",
    "scene",
    "overlayIdsOrder",
    "overlayIds",
    "metricsOrder",
    "metrics",
    "accessibleText",
  ]);
  stableId(result.panelId, `${path}/panelId`);
  exactString(result.panelKind, expectedKind, `${path}/panelKind`);
  durableText(result.title, `${path}/title`, 128);
  durableText(result.accessibleText, `${path}/accessibleText`);
  scene(result.scene, `${path}/scene`, viewport);
  exactString(result.overlayIdsOrder, "basis-kind-id", `${path}/overlayIdsOrder`);
  if (!Array.isArray(result.overlayIds)) fail(`${path}/overlayIds`, "expected an array");
  if (result.overlayIds.length > MAX_PANEL_OVERLAYS) {
    fail(`${path}/overlayIds`, `panels may reference at most ${MAX_PANEL_OVERLAYS} overlays`);
  }
  const seenOverlayIds = new Set<string>();
  for (let index = 0; index < result.overlayIds.length; index += 1) {
    const id = stableId(result.overlayIds[index], `${path}/overlayIds/${index}`);
    if (!overlaysById.has(id)) fail(`${path}/overlayIds/${index}`, "overlay ID is not declared by the view");
    if (seenOverlayIds.has(id)) fail(`${path}/overlayIds/${index}`, "duplicate panel overlay ID");
    seenOverlayIds.add(id);
  }
  exactString(result.metricsOrder, "metric-id", `${path}/metricsOrder`);
  if (!Array.isArray(result.metrics)) fail(`${path}/metrics`, "expected an array");
  if (result.metrics.length > MAX_PANEL_METRICS) {
    fail(`${path}/metrics`, `panels may declare at most ${MAX_PANEL_METRICS} metrics`);
  }
  const metricIds = new Set<string>();
  for (let index = 0; index < result.metrics.length; index += 1) {
    const parsed = metric(result.metrics[index], `${path}/metrics/${index}`);
    if (metricIds.has(parsed.metricId)) fail(`${path}/metrics/${index}/metricId`, "duplicate metric ID");
    metricIds.add(parsed.metricId);
  }
  return result;
}

function normalizePanel<T extends SubgoalEvidencePanelV1>(
  value: T,
  overlayIndexes: ReadonlyMap<string, number>,
): T {
  return {
    ...value,
    overlayIds: [...value.overlayIds].sort((left, right) => (
      (overlayIndexes.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (overlayIndexes.get(right) ?? Number.MAX_SAFE_INTEGER)
    )),
    metrics: [...value.metrics].sort((left, right) => (
      left.metricId < right.metricId ? -1 : left.metricId > right.metricId ? 1 : 0
    )),
  };
}

function pointInViewport(value: unknown, path: string, viewport: SolverResolvedRenderRegion): SolverCoordinate {
  const result = coordinate(value, path);
  if (!coordinateInRegion(result, viewport)) fail(path, "overlay coordinate is outside the fixed viewport");
  return result;
}

function overlay(
  value: unknown,
  path: string,
  target: "ms" | "lynx",
  viewport: SolverResolvedRenderRegion,
): SubgoalEvidenceOverlayV1 {
  const result = record(value, path);
  const baseKeys = ["overlayId", "kind", "basis", "target", "label", "textEquivalent"];
  const kind = result.kind;
  if (kind === "route") {
    requireKeys(result, path, [...baseKeys, "coordinates", "actorId"]);
  } else if (kind === "point-of-interest") {
    requireKeys(result, path, [...baseKeys, "coordinate", "role", "placementId"]);
  } else if (kind === "state-change") {
    requireKeys(result, path, [
      ...baseKeys,
      "coordinate",
      "beforeSemanticTypes",
      "afterSemanticTypes",
    ]);
  } else {
    fail(`${path}/kind`, "expected route, point-of-interest, or state-change");
  }
  stableId(result.overlayId, `${path}/overlayId`);
  if (!basisOrder.has(result.basis as SubgoalEvidenceBasisV1)) {
    fail(`${path}/basis`, "unknown evidence basis");
  }
  exactString(result.target, target, `${path}/target`);
  durableText(result.label, `${path}/label`, 128);
  durableText(result.textEquivalent, `${path}/textEquivalent`);
  if (kind === "route") {
    if (!Array.isArray(result.coordinates) || result.coordinates.length < 2 || result.coordinates.length > 256) {
      fail(`${path}/coordinates`, "route overlays require 2 through 256 coordinates");
    }
    result.coordinates.forEach((entry, index) => {
      pointInViewport(entry, `${path}/coordinates/${index}`, viewport);
    });
    if (result.actorId !== null && (
      typeof result.actorId !== "string" || !ACTOR_ID_PATTERN.test(result.actorId)
    )) {
      fail(`${path}/actorId`, "expected null or an exact actor identity");
    }
  } else if (kind === "point-of-interest") {
    pointInViewport(result.coordinate, `${path}/coordinate`, viewport);
    if (![
      "route-start",
      "route-end",
      "selected-target",
      "retained-alternative",
      "later-gate",
      "changed-cell",
      "failure-site",
    ].includes(result.role as string)) {
      fail(`${path}/role`, "unknown point-of-interest role");
    }
    if (result.placementId !== null && (
      typeof result.placementId !== "string" || !PLACEMENT_ID_PATTERN.test(result.placementId)
    )) {
      fail(`${path}/placementId`, "expected null or an exact placement identity");
    }
  } else {
    if (result.basis !== "observed-witness") {
      fail(`${path}/basis`, "state changes must be observed-witness evidence");
    }
    pointInViewport(result.coordinate, `${path}/coordinate`, viewport);
    for (const [key, entries] of [
      ["beforeSemanticTypes", result.beforeSemanticTypes],
      ["afterSemanticTypes", result.afterSemanticTypes],
    ] as const) {
      if (!Array.isArray(entries)) fail(`${path}/${key}`, "expected an array");
      entries.forEach((entry, index) => stableId(entry, `${path}/${key}/${index}`));
    }
  }
  return value as SubgoalEvidenceOverlayV1;
}

function compareOverlay(left: SubgoalEvidenceOverlayV1, right: SubgoalEvidenceOverlayV1): number {
  return (basisOrder.get(left.basis)! - basisOrder.get(right.basis)!)
    || (kindOrder.get(left.kind)! - kindOrder.get(right.kind)!)
    || (left.overlayId < right.overlayId ? -1 : left.overlayId > right.overlayId ? 1 : 0);
}

function failure(value: unknown, path: string): void {
  const result = record(value, path);
  requireKeys(result, path, ["code", "boundaryNativeTick", "predicateId", "decisionOrder", "detail"]);
  if (![
    "witness.precondition",
    "witness.invariant",
    "witness.decision-exhausted",
    "witness.budget-exhausted",
    "witness.terminal-before-stop",
    "witness.postcondition",
    "witness.must-change",
    "witness.must-not-change",
    "witness.forbidden-change",
    "witness.unaccounted-change",
    "witness.plan-effect",
    "witness.join-broken",
  ].includes(result.code as string)) {
    fail(`${path}/code`, "unknown contextual witness failure code");
  }
  safeInteger(result.boundaryNativeTick, `${path}/boundaryNativeTick`, -1);
  if (result.predicateId !== null) stableId(result.predicateId, `${path}/predicateId`);
  if (result.decisionOrder !== null) safeInteger(result.decisionOrder, `${path}/decisionOrder`);
  durableText(result.detail, `${path}/detail`);
}

function validateTopLevel(value: unknown): JsonRecord {
  const result = record(value, "");
  requireKeys(result, "", [
    "viewType",
    "viewVersion",
    "viewId",
    "caseId",
    "target",
    "level",
    "levelFacts",
    "plan",
    "contract",
    "witness",
    "subgoal",
    "renderer",
    "viewport",
    "overlaysOrder",
    "overlays",
    "starting",
    "ending",
    "correctness",
    "motion",
  ]);
  return result;
}

export function createSubgoalEvidenceView(value: unknown): SubgoalEvidenceViewV1 {
  const input = validateTopLevel(value);
  exactString(input.viewType, "subgoal-evidence-view", "/viewType");
  if (input.viewVersion !== 1) fail("/viewVersion", "expected version 1");
  stableId(input.viewId, "/viewId");
  stableId(input.caseId, "/caseId");
  if (input.target !== "ms" && input.target !== "lynx") fail("/target", "expected ms or lynx");
  const target = input.target;

  const level = record(input.level, "/level");
  requireKeys(level, "/level", ["occurrenceId", "normalizationProfile", "normalizedGameplayDigest"]);
  stableId(level.occurrenceId, "/level/occurrenceId");
  stableId(level.normalizationProfile, "/level/normalizationProfile");
  if (typeof level.normalizedGameplayDigest !== "string" || !DIGEST_PATTERN.test(level.normalizedGameplayDigest)) {
    fail("/level/normalizedGameplayDigest", "expected a lowercase SHA-256 digest");
  }
  blobReference(input.levelFacts, "/levelFacts");
  blobReference(input.plan, "/plan");
  const contract = blobReference(input.contract, "/contract");
  blobReference(input.witness, "/witness");

  const subgoal = record(input.subgoal, "/subgoal");
  requireKeys(subgoal, "/subgoal", ["subgoalId", "title", "description"]);
  stableId(subgoal.subgoalId, "/subgoal/subgoalId");
  durableText(subgoal.title, "/subgoal/title", 128);
  durableText(subgoal.description, "/subgoal/description");

  const renderer = record(input.renderer, "/renderer");
  requireKeys(renderer, "/renderer", ["rendererId", "rendererRevision"]);
  stableId(renderer.rendererId, "/renderer/rendererId");
  durableText(renderer.rendererRevision, "/renderer/rendererRevision", 256);
  const viewport = region(input.viewport, "/viewport");

  exactString(input.overlaysOrder, "basis-kind-id", "/overlaysOrder");
  if (!Array.isArray(input.overlays)) fail("/overlays", "expected an array");
  if (input.overlays.length > MAX_OVERLAYS) {
    fail("/overlays", `evidence views may declare at most ${MAX_OVERLAYS} overlays`);
  }
  const overlays = input.overlays.map((entry, index) => (
    overlay(entry, `/overlays/${index}`, target, viewport)
  )).sort(compareOverlay);
  const overlaysById = new Map<string, SubgoalEvidenceOverlayV1>();
  overlays.forEach((entry, index) => {
    if (overlaysById.has(entry.overlayId)) fail(`/overlays/${index}/overlayId`, "duplicate overlay ID");
    overlaysById.set(entry.overlayId, entry);
  });
  const overlayIndexes = new Map(overlays.map((entry, index) => [entry.overlayId, index]));

  const starting = validatePanelBase(
    input.starting,
    "/starting",
    "starting-state",
    viewport,
    overlaysById,
  );
  observedBinding(starting.binding, "/starting/binding");

  const ending = record(input.ending, "/ending");
  if (ending.kind === "verified") {
    requireKeys(ending, "/ending", ["kind", "observed"]);
    const observed = validatePanelBase(
      ending.observed,
      "/ending/observed",
      "ending-state",
      viewport,
      overlaysById,
    );
    observedBinding(observed.binding, "/ending/observed/binding");
  } else if (ending.kind === "failed") {
    requireKeys(ending, "/ending", ["kind", "expected", "actual", "firstFailure"]);
    const expected = validatePanelBase(
      ending.expected,
      "/ending/expected",
      "intended-ending",
      viewport,
      overlaysById,
    );
    expectedBinding(expected.binding, "/ending/expected/binding", contract);
    const actual = validatePanelBase(
      ending.actual,
      "/ending/actual",
      "actual-failure",
      viewport,
      overlaysById,
    );
    observedBinding(actual.binding, "/ending/actual/binding");
    failure(ending.firstFailure, "/ending/firstFailure");
  } else {
    fail("/ending/kind", "expected verified or failed");
  }

  const correctness = record(input.correctness, "/correctness");
  requireKeys(correctness, "/correctness", [
    "fullWorldWitnessIsAuthority",
    "croppedPanelsAreReviewOnly",
  ]);
  if (correctness.fullWorldWitnessIsAuthority !== true) {
    fail("/correctness/fullWorldWitnessIsAuthority", "full-world witness authority must remain explicit");
  }
  if (correctness.croppedPanelsAreReviewOnly !== true) {
    fail("/correctness/croppedPanelsAreReviewOnly", "cropped panels must be labeled as review-only");
  }
  if (input.motion !== null) {
    const motion = record(input.motion, "/motion");
    requireKeys(motion, "/motion", ["kind", "reason"]);
    if (motion.kind !== "recommended" && motion.kind !== "not-recommended") {
      fail("/motion/kind", "expected recommended or not-recommended");
    }
    durableText(motion.reason, "/motion/reason");
  }

  const normalizedEnding: SubgoalEvidenceEndingV1 = ending.kind === "verified"
    ? {
        kind: "verified",
        observed: normalizePanel(
          ending.observed as unknown as EndingSubgoalEvidencePanelV1,
          overlayIndexes,
        ),
      }
    : {
        kind: "failed",
        expected: normalizePanel(
          ending.expected as unknown as IntendedEndingSubgoalEvidencePanelV1,
          overlayIndexes,
        ),
        actual: normalizePanel(
          ending.actual as unknown as ActualFailureSubgoalEvidencePanelV1,
          overlayIndexes,
        ),
        firstFailure: ending.firstFailure as unknown as ContextualWitnessFailureV1,
      };

  try {
    return JSON.parse(canonicalizeJson({
      ...input,
      overlays,
      starting: normalizePanel(
        input.starting as StartingSubgoalEvidencePanelV1,
        overlayIndexes,
      ),
      ending: normalizedEnding,
    })) as SubgoalEvidenceViewV1;
  } catch (error) {
    if (error instanceof SubgoalEvidenceError) throw error;
    return fail("", "evidence view must be canonical JSON safe");
  }
}
