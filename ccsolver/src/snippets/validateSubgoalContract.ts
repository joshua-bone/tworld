import type { SolverCoordinate, SolverObservation } from "../domain/runtime/types.js";
import { evaluateObservationPredicates } from "./evaluateObservationPredicate.js";
import {
  ContextualWitnessExecutorError,
  type FootprintSelectorVerdictV1,
  type ObservationChangeSelectorV1,
  type SolverObservedChangeV1,
  type SubgoalContractV1,
  type SubgoalContractValidationV1,
  type SubgoalObservationPredicateV1,
} from "./model.js";
import {
  canonicalCopy,
  canonicalEqual,
  compareText,
  coordinateKey,
  selectorKey,
} from "./support.js";

function invalidContract(message: string): never {
  throw new ContextualWitnessExecutorError("witness.invalid-contract", message);
}

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const ACTOR_ID_PATTERN = /^actor:sha256:[0-9a-f]{64}$/u;

function assertStableId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 128
    || !STABLE_ID_PATTERN.test(value)
  ) {
    invalidContract(`${label} must use the protocol StableId grammar`);
  }
}

function assertPlacementId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !PLACEMENT_ID_PATTERN.test(value)) {
    invalidContract(`${label} must be an exact placement:sha256 identity`);
  }
}

function assertActorId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !ACTOR_ID_PATTERN.test(value)) {
    invalidContract(`${label} must be an exact actor:sha256 identity`);
  }
}

function assertRevisionId(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > 256
    || value.includes("\r")
  ) {
    invalidContract(`${label} must be a bounded revision without carriage returns`);
  }
}

function assertDurableText(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || Array.from(value).length > 2_048
    || value.includes("\r")
  ) {
    invalidContract(`${label} must be nonempty durable text of at most 2,048 Unicode scalars`);
  }
}

function assertNonnegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || Object.is(value, -0)
  ) {
    invalidContract(`${label} must be a nonnegative safe integer`);
  }
}

function assertPositiveSafeInteger(value: unknown, label: string): asserts value is number {
  assertNonnegativeSafeInteger(value, label);
  if (value === 0) invalidContract(`${label} must be positive`);
}

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidContract(`${label} must be an object`);
  }
}

function assertExactKeys(value: unknown, label: string, allowed: readonly string[]): void {
  assertObject(value, label);
  const allowedKeys = new Set(allowed);
  const extras = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (extras.length > 0) invalidContract(`${label} contains unknown field ${extras.sort()[0]}`);
}

function assertBoundedArray(value: unknown, label: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > 65_536) {
    invalidContract(`${label} must be an array with at most 65,536 entries`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      invalidContract(`${label} must not contain sparse entries`);
    }
  }
}

function assertCoordinate(value: SolverCoordinate | null, label: string): void {
  if (value === null) return;
  assertExactKeys(value, label, ["x", "y", "z"]);
  for (const axis of ["x", "y", "z"] as const) {
    const component = value[axis];
    if (
      !Number.isSafeInteger(component)
      || component < 0
      || Object.is(component, -0)
    ) {
      invalidContract(`${label}.${axis} must be a nonnegative safe integer`);
    }
  }
}

function assertPredicate(predicate: SubgoalObservationPredicateV1, label: string): void {
  assertObject(predicate, label);
  assertStableId(predicate.predicateId, `${label}.predicateId`);
  switch (predicate.kind) {
    case "player-coordinate":
      assertExactKeys(predicate, label, ["predicateId", "kind", "coordinate"]);
      assertCoordinate(predicate.coordinate, `${label}.coordinate`);
      return;
    case "inventory-count":
    case "remaining-requirement-count":
      assertExactKeys(predicate, label, [
        "predicateId", "kind", "resourceType", "comparison", "count",
      ]);
      assertStableId(predicate.resourceType, `${label}.resourceType`);
      assertNonnegativeSafeInteger(predicate.count, `${label}.count`);
      if (!(<readonly string[]>["equals", "at-least", "at-most"]).includes(predicate.comparison)) {
        invalidContract(`${label}.comparison is unknown`);
      }
      return;
    case "placement-presence":
      assertExactKeys(predicate, label, ["predicateId", "kind", "placementId", "present"]);
      assertPlacementId(predicate.placementId, `${label}.placementId`);
      if (typeof predicate.present !== "boolean") invalidContract(`${label}.present must be boolean`);
      return;
    case "actor-state":
      assertExactKeys(predicate, label, ["predicateId", "kind", "actorId", "property", "value"]);
      assertActorId(predicate.actorId, `${label}.actorId`);
      if (predicate.property === "coordinate") {
        assertCoordinate(predicate.value, `${label}.value`);
      } else if (predicate.property === "lifecycle") {
        if (!(<readonly unknown[]>["active", "contained", "dormant", "destroyed"]).includes(predicate.value)) {
          invalidContract(`${label}.value is not an actor lifecycle`);
        }
      } else if (predicate.property === "facing") {
        if (predicate.value !== null && !(<readonly unknown[]>["north", "east", "south", "west"]).includes(predicate.value)) {
          invalidContract(`${label}.value is not a facing direction or null`);
        }
      } else if (predicate.property === "movement") {
        if (!(<readonly unknown[]>[
          "stationary", "moving", "forced", "sliding", "teleporting", "trapped",
        ]).includes(predicate.value)) {
          invalidContract(`${label}.value is not an actor movement state`);
        }
      } else {
        invalidContract(`${label}.property is unknown`);
      }
      return;
    case "device-state":
      assertExactKeys(predicate, label, ["predicateId", "kind", "placementId", "state"]);
      assertPlacementId(predicate.placementId, `${label}.placementId`);
      assertStableId(predicate.state, `${label}.state`);
      return;
    case "terminal-state":
      if (!(<readonly unknown[]>["running", "won", "lost", "timed-out"]).includes(predicate.terminalKind)) {
        invalidContract(`${label}.terminalKind is unknown`);
      }
      if (predicate.terminalKind === "won") {
        assertExactKeys(predicate, label, ["predicateId", "kind", "terminalKind", "exitPlacementId"]);
        if (predicate.exitPlacementId !== null) {
          assertPlacementId(predicate.exitPlacementId, `${label}.exitPlacementId`);
        }
      } else if (predicate.terminalKind === "lost") {
        assertExactKeys(predicate, label, ["predicateId", "kind", "terminalKind", "cause"]);
        if (predicate.cause !== null) assertStableId(predicate.cause, `${label}.cause`);
      } else {
        assertExactKeys(predicate, label, ["predicateId", "kind", "terminalKind"]);
      }
      return;
    case "native-state-fingerprint":
      assertExactKeys(predicate, label, ["predicateId", "kind", "stateId", "fingerprint"]);
      assertStableId(predicate.stateId, `${label}.stateId`);
      assertStableId(predicate.fingerprint, `${label}.fingerprint`);
      return;
    default:
      invalidContract(`${label}.kind is unknown`);
  }
}

function normalizePredicates(
  predicates: readonly SubgoalObservationPredicateV1[],
  label: string,
): readonly SubgoalObservationPredicateV1[] {
  assertBoundedArray(predicates, label);
  const result = predicates.map((predicate, index) => {
    assertPredicate(predicate, `${label}[${index}]`);
    return canonicalCopy(predicate);
  }).sort((left, right) => compareText(left.predicateId, right.predicateId));
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1]!.predicateId === result[index]!.predicateId) {
      invalidContract(`${label} contains duplicate predicateId ${result[index]!.predicateId}`);
    }
  }
  return result;
}

function assertSelector(selector: ObservationChangeSelectorV1, label: string): void {
  assertObject(selector, label);
  switch (selector.kind) {
    case "inventory-resource":
    case "remaining-requirement":
      assertExactKeys(selector, label, ["kind", "resourceType"]);
      assertStableId(selector.resourceType, `${label}.resourceType`);
      return;
    case "actor":
      assertExactKeys(selector, label, ["kind", "actorId"]);
      assertActorId(selector.actorId, `${label}.actorId`);
      return;
    case "device":
    case "placement":
      assertExactKeys(selector, label, ["kind", "placementId"]);
      assertPlacementId(selector.placementId, `${label}.placementId`);
      return;
    case "cell":
      assertExactKeys(selector, label, ["kind", "coordinate"]);
      assertCoordinate(selector.coordinate, `${label}.coordinate`);
      return;
    case "timing":
    case "input":
    case "randomness":
    case "player":
    case "inventory-order":
    case "actor-order":
    case "terminal":
      assertExactKeys(selector, label, ["kind"]);
      return;
    default:
      invalidContract(`${label}.kind is unknown`);
  }
}

function normalizeSelectors(
  selectors: readonly ObservationChangeSelectorV1[],
  label: string,
): readonly ObservationChangeSelectorV1[] {
  assertBoundedArray(selectors, label);
  const result = selectors.map((selector, index) => {
    assertSelector(selector, `${label}[${index}]`);
    return canonicalCopy(selector);
  }).sort((left, right) => compareText(selectorKey(left), selectorKey(right)));
  for (let index = 1; index < result.length; index += 1) {
    if (selectorKey(result[index - 1]!) === selectorKey(result[index]!)) {
      invalidContract(`${label} contains duplicate selector ${selectorKey(result[index]!)}`);
    }
  }
  return result;
}

export function normalizeSubgoalContract(contract: SubgoalContractV1): SubgoalContractV1 {
  assertExactKeys(contract, "contract", [
    "contractVersion",
    "contractId",
    "title",
    "description",
    "target",
    "planSegment",
    "requires",
    "ensures",
    "invariants",
    "stop",
    "maximumAdvanceTicks",
    "footprint",
    "forbiddenObservedChanges",
    "provenance",
  ]);
  if (contract.contractVersion !== 1) invalidContract("contractVersion must be 1");
  assertStableId(contract.contractId, "contractId");
  assertDurableText(contract.title, "title");
  assertDurableText(contract.description, "description");
  if (contract.target !== "ms" && contract.target !== "lynx") {
    invalidContract("target must be ms or lynx");
  }
  assertPositiveSafeInteger(contract.maximumAdvanceTicks, "maximumAdvanceTicks");
  assertPredicate(contract.stop, "stop");
  assertExactKeys(contract.planSegment, "planSegment", [
    "planId", "rootId", "startStepOrder", "endStepOrder", "operatorIds",
  ]);
  assertStableId(contract.planSegment.planId, "planSegment.planId");
  assertStableId(contract.planSegment.rootId, "planSegment.rootId");
  assertNonnegativeSafeInteger(contract.planSegment.startStepOrder, "planSegment.startStepOrder");
  assertNonnegativeSafeInteger(contract.planSegment.endStepOrder, "planSegment.endStepOrder");
  if (contract.planSegment.endStepOrder < contract.planSegment.startStepOrder) {
    invalidContract("planSegment step range must be ascending");
  }
  assertBoundedArray(contract.planSegment.operatorIds, "planSegment.operatorIds");
  contract.planSegment.operatorIds.forEach((operatorId, index) => (
    assertStableId(operatorId, `planSegment.operatorIds[${index}]`)
  ));
  assertExactKeys(contract.footprint, "footprint", ["mustChange", "mayChange", "mustNotChange"]);
  assertExactKeys(contract.provenance, "provenance", [
    "derivation", "derivationRevision", "review",
  ]);
  if (!(<readonly unknown[]>[
    "authored",
    "forward-derived",
    "backward-regressed",
    "bidirectional-joined",
    "donor-inferred",
  ]).includes(contract.provenance.derivation)) {
    invalidContract("provenance.derivation is unknown");
  }
  assertRevisionId(contract.provenance.derivationRevision, "provenance.derivationRevision");
  assertObject(contract.provenance.review, "review");
  if (
    contract.provenance.review.status !== "unreviewed"
    && contract.provenance.review.status !== "reviewed"
  ) {
    invalidContract("review.status must be unreviewed or reviewed");
  }
  if (contract.provenance.review.status === "reviewed") {
    assertExactKeys(contract.provenance.review, "review", ["status", "reviewRevision"]);
    assertRevisionId(contract.provenance.review.reviewRevision, "review.reviewRevision");
  } else {
    assertExactKeys(contract.provenance.review, "review", ["status"]);
  }

  assertBoundedArray(contract.requires, "requires");
  assertBoundedArray(contract.ensures, "ensures");
  assertBoundedArray(contract.invariants, "invariants");
  assertBoundedArray(contract.footprint.mustChange, "footprint.mustChange");
  assertBoundedArray(contract.footprint.mayChange, "footprint.mayChange");
  assertBoundedArray(contract.footprint.mustNotChange, "footprint.mustNotChange");
  assertBoundedArray(contract.forbiddenObservedChanges, "forbiddenObservedChanges");

  const requires = normalizePredicates(contract.requires, "requires");
  const ensures = normalizePredicates(contract.ensures, "ensures");
  const invariants = normalizePredicates(contract.invariants, "invariants");
  const mustChange = normalizeSelectors(contract.footprint.mustChange, "footprint.mustChange");
  const mayChange = normalizeSelectors(contract.footprint.mayChange, "footprint.mayChange");
  const mustNotChange = normalizeSelectors(
    contract.footprint.mustNotChange,
    "footprint.mustNotChange",
  );
  const forbiddenObservedChanges = normalizeSelectors(
    contract.forbiddenObservedChanges,
    "forbiddenObservedChanges",
  );
  const footprintKeys = new Map<string, string>();
  for (const [category, selectors] of [
    ["mustChange", mustChange],
    ["mayChange", mayChange],
    ["mustNotChange", mustNotChange],
  ] as const) {
    for (const selector of selectors) {
      const key = selectorKey(selector);
      const previous = footprintKeys.get(key);
      if (previous !== undefined) {
        invalidContract(`footprint selector ${key} appears in both ${previous} and ${category}`);
      }
      footprintKeys.set(key, category);
    }
  }

  return canonicalCopy({
    ...contract,
    requires,
    ensures,
    invariants,
    stop: contract.stop,
    footprint: { mustChange, mayChange, mustNotChange },
    forbiddenObservedChanges,
  });
}

function placementChanged(change: SolverObservedChangeV1, placementId: string): boolean {
  if (change.kind !== "cell-elements") return false;
  const elements = [...change.before, ...change.after].filter((element) => (
    element.identity.kind === "placement" && element.identity.placementId === placementId
  ));
  if (elements.length === 0) return false;
  const before = change.before.filter((element) => (
    element.identity.kind === "placement" && element.identity.placementId === placementId
  ));
  const after = change.after.filter((element) => (
    element.identity.kind === "placement" && element.identity.placementId === placementId
  ));
  return !canonicalEqual(before, after);
}

export function observationChangeMatchesSelector(
  change: SolverObservedChangeV1,
  selector: ObservationChangeSelectorV1,
): boolean {
  switch (selector.kind) {
    case "timing": return change.kind === "timing-state";
    case "input": return change.kind === "input-state";
    case "randomness": return change.kind === "randomness-state";
    case "player": return change.kind === "player-state";
    case "inventory-resource":
      return change.kind === "inventory-count" && change.resourceType === selector.resourceType;
    case "inventory-order": return change.kind === "inventory-order";
    case "remaining-requirement":
      return change.kind === "remaining-requirement-count"
        && change.resourceType === selector.resourceType;
    case "actor": return change.kind === "actor-state" && change.actorId === selector.actorId;
    case "actor-order": return change.kind === "actor-order";
    case "device":
      return change.kind === "device-state" && change.placementId === selector.placementId;
    case "cell":
      return change.kind === "cell-elements"
        && coordinateKey(change.coordinate) === coordinateKey(selector.coordinate);
    case "placement": return placementChanged(change, selector.placementId);
    case "terminal": return change.kind === "terminal-state";
  }
}

function selectorVerdicts(
  selectors: readonly ObservationChangeSelectorV1[],
  changes: readonly SolverObservedChangeV1[],
  expectedMatch: boolean,
): readonly FootprintSelectorVerdictV1[] {
  return selectors.map((selector) => {
    const matchedChangeOrders = changes.flatMap((change, index) => (
      observationChangeMatchesSelector(change, selector) ? [index] : []
    ));
    return {
      selector: canonicalCopy(selector),
      passed: expectedMatch ? matchedChangeOrders.length > 0 : matchedChangeOrders.length === 0,
      matchedChangeOrders,
    };
  });
}

export function validateSubgoalContract(
  contract: SubgoalContractV1,
  entry: SolverObservation,
  end: SolverObservation,
  changes: readonly SolverObservedChangeV1[],
): SubgoalContractValidationV1 {
  const mustChange = selectorVerdicts(contract.footprint.mustChange, changes, true);
  const mustNotChange = selectorVerdicts(contract.footprint.mustNotChange, changes, false);
  const forbiddenObservedChanges = selectorVerdicts(
    contract.forbiddenObservedChanges,
    changes,
    false,
  );
  const accountedSelectors = [
    ...contract.footprint.mustChange,
    ...contract.footprint.mayChange,
  ];
  const unaccountedChangeOrders = changes.flatMap((change, index) => (
    accountedSelectors.some((selector) => observationChangeMatchesSelector(change, selector))
      ? []
      : [index]
  ));
  return canonicalCopy({
    requires: evaluateObservationPredicates(contract.requires, entry),
    ensures: evaluateObservationPredicates(contract.ensures, end),
    invariantsAtEntry: evaluateObservationPredicates(contract.invariants, entry),
    mustChange,
    mustNotChange,
    forbiddenObservedChanges,
    unaccountedChangeOrders,
  });
}
