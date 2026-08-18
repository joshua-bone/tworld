import { canonicalizeJson } from "../domain/canonicalJson.js";
import type {
  RulesetTargetV1,
  StableIdV1,
} from "../domain/artifacts/types.js";
import type {
  BackwardTraceActionV1,
  BackwardTraceProvenanceV1,
  BackwardTraceStepV1,
  ExpandedPlanPreviewV1,
  ExpandedPlanStepV1,
  GoalGraphGoalNodeV1,
  GoalGraphOperatorNodeV1,
  GoalGraphRootV1,
  GoalResolutionV1,
  PlanGoalIdV1,
  PlanOperatorNodeIdV1,
  PlanPredicateKindV1,
  PlanPredicateV1,
  PlanRootIdV1,
  PlanningDiagnosticCodeV1,
  PlanningDiagnosticV1,
  PlanningFactStatusV1,
  PlanningStateAxisV1,
  PlanningStateEffectV1,
  PlanningStateLedgerEntryV1,
  PlanningUnresolvedObligationV1,
  PlanningUnresolvedReasonV1,
  TerminalFirstPlanningInputV1,
  TerminalFirstPlanningLimitsV1,
  TerminalFirstPlanningResultV1,
} from "./model.js";

const MAX_INPUT_ITEMS = 65_536;
const MAX_DURABLE_STRING_LENGTH = 128;
const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;

const IMPLEMENTATION_MAX_LIMITS: TerminalFirstPlanningLimitsV1 = {
  maxDepth: 256,
  maxPlansPerExit: 1_024,
  maxTraceSteps: 16_384,
  maxDiagnostics: 1_024,
};

const DEFAULT_LIMITS: TerminalFirstPlanningLimitsV1 = {
  maxDepth: 128,
  maxPlansPerExit: 256,
  maxTraceSteps: 8_192,
  maxDiagnostics: 256,
};

export type TerminalFirstPlanningErrorCode =
  | "planning.input-invalid"
  | "planning.invariant-invalid";

export class TerminalFirstPlanningError extends Error {
  override readonly name = "TerminalFirstPlanningError";

  constructor(
    readonly code: TerminalFirstPlanningErrorCode,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

interface NormalizedExit {
  readonly target: RulesetTargetV1;
  readonly exitId: StableIdV1;
  readonly evidenceIds: readonly StableIdV1[];
}

interface NormalizedFact {
  readonly predicate: PlanPredicateV1;
  readonly status: PlanningFactStatusV1;
  readonly evidenceIds: readonly StableIdV1[];
}

interface NormalizedOperator {
  readonly operatorId: StableIdV1;
  readonly target: RulesetTargetV1;
  readonly kind: PlanPredicateKindV1;
  readonly achieves: PlanPredicateV1;
  readonly prerequisites: readonly PlanPredicateV1[];
  readonly stateEffects: readonly PlanningStateEffectV1[];
  readonly evidenceIds: readonly StableIdV1[];
}

interface NormalizedInitialStateEntry {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: StableIdV1;
  readonly amount: number;
}

interface NormalizedInput {
  readonly target: RulesetTargetV1;
  readonly exits: readonly NormalizedExit[];
  readonly factsByGoal: ReadonlyMap<string, NormalizedFact>;
  readonly operatorsByGoal: ReadonlyMap<string, readonly NormalizedOperator[]>;
  readonly operatorsById: ReadonlyMap<StableIdV1, NormalizedOperator>;
  readonly predicatesByGoal: ReadonlyMap<string, PlanPredicateV1>;
  readonly initialState: ReadonlyMap<string, NormalizedInitialStateEntry>;
  readonly limits: TerminalFirstPlanningLimitsV1;
}

interface NormalizedRoot extends GoalGraphRootV1 {
  readonly rootOrder: number;
  readonly goalKey: string;
}

interface RawDiagnostic {
  readonly code: PlanningDiagnosticCodeV1;
  readonly target: RulesetTargetV1;
  readonly rootId: PlanRootIdV1;
  readonly goalId: PlanGoalIdV1;
  readonly operatorId: StableIdV1 | null;
  readonly pathGoalIds: readonly PlanGoalIdV1[];
  readonly detail: string;
}

interface PartialPlan {
  readonly operators: readonly NormalizedOperator[];
  readonly unresolved: readonly PlanningUnresolvedObligationV1[];
}

interface MutableLedgerEntry {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: StableIdV1;
  readonly initial: number;
  increased: number;
  decreased: number;
  remaining: number;
}

function fail(
  code: TerminalFirstPlanningErrorCode,
  path: string,
  message: string,
): never {
  throw new TerminalFirstPlanningError(code, path, message);
}

function compareText(left: string, right: string): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftCode = left.charCodeAt(index);
    const rightCode = right.charCodeAt(index);
    if (leftCode !== rightCode) {
      return leftCode - rightCode;
    }
  }
  return left.length - right.length;
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return -1;
  }
  if (right === null) {
    return 1;
  }
  return compareText(left, right);
}

function childPath(path: string, token: string | number): string {
  const escaped = String(token).replaceAll("~", "~0").replaceAll("/", "~1");
  return `${path}/${escaped}`;
}

function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("planning.input-invalid", path, "expected an object");
  }
}

function assertArray(value: unknown, path: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("planning.input-invalid", path, "expected an array");
  }
  if (value.length > MAX_INPUT_ITEMS) {
    fail(
      "planning.input-invalid",
      path,
      `expected at most ${MAX_INPUT_ITEMS} entries`,
    );
  }
}

function durableString(value: unknown, path: string): StableIdV1 {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > MAX_DURABLE_STRING_LENGTH
    || !STABLE_ID_PATTERN.test(value)
  ) {
    fail(
      "planning.input-invalid",
      path,
      "expected a protocol StableId of at most 128 lowercase ASCII characters",
    );
  }
  return value;
}

function target(value: unknown, path: string): RulesetTargetV1 {
  if (value !== "ms" && value !== "lynx") {
    fail("planning.input-invalid", path, "expected target ms or lynx");
  }
  return value;
}

function positiveSafeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value <= 0
  ) {
    fail("planning.input-invalid", path, "expected a positive safe integer");
  }
  return value;
}

function nonnegativeSafeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value < 0
  ) {
    fail("planning.input-invalid", path, "expected a nonnegative safe integer");
  }
  return value;
}

function nonzeroSafeInteger(value: unknown, path: string): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || Object.is(value, -0)
    || value === 0
  ) {
    fail("planning.input-invalid", path, "expected a nonzero safe integer");
  }
  return value;
}

function normalizeEvidenceIds(value: unknown, path: string): readonly StableIdV1[] {
  assertArray(value, path);
  const ids = new Set<StableIdV1>();
  for (let index = 0; index < value.length; index += 1) {
    ids.add(durableString(value[index], childPath(path, index)));
  }
  return [...ids].sort(compareText);
}

function normalizePredicate(value: unknown, path: string): PlanPredicateV1 {
  assertRecord(value, path);
  switch (value.kind) {
    case "reach-exit":
      return {
        kind: "reach-exit",
        exitId: durableString(value.exitId, childPath(path, "exitId")),
      };
    case "reach":
      return {
        kind: "reach",
        regionId: durableString(value.regionId, childPath(path, "regionId")),
      };
    case "collect":
      return {
        kind: "collect",
        resourceType: durableString(
          value.resourceType,
          childPath(path, "resourceType"),
        ),
        amount: positiveSafeInteger(value.amount, childPath(path, "amount")),
        collectionOccurrenceId: durableString(
          value.collectionOccurrenceId,
          childPath(path, "collectionOccurrenceId"),
        ),
        sourcePlacementId: value.sourcePlacementId === null
          ? null
          : (() => {
            const placementId = durableString(
              value.sourcePlacementId,
              childPath(path, "sourcePlacementId"),
            );
            if (!PLACEMENT_ID_PATTERN.test(placementId)) {
              fail(
                "planning.input-invalid",
                childPath(path, "sourcePlacementId"),
                "expected placement:sha256 followed by 64 lowercase hexadecimal digits",
              );
            }
            return placementId as `placement:sha256:${string}`;
          })(),
      };
    case "unlock": {
      const requirementPath = childPath(path, "requirement");
      const requirement = value.requirement;
      assertRecord(requirement, requirementPath);
      const resourceType = durableString(
        requirement.resourceType,
        childPath(requirementPath, "resourceType"),
      );
      if (requirement.kind === "remaining-zero") {
        return {
          kind: "unlock",
          gateId: durableString(value.gateId, childPath(path, "gateId")),
          requirement: { kind: "remaining-zero", resourceType },
        };
      }
      if (
        requirement.kind !== "consume-inventory"
        && requirement.kind !== "possess-inventory"
      ) {
        fail(
          "planning.input-invalid",
          childPath(requirementPath, "kind"),
          "expected gate requirement consume-inventory, possess-inventory, or remaining-zero",
        );
      }
      return {
        kind: "unlock",
        gateId: durableString(value.gateId, childPath(path, "gateId")),
        requirement: {
          kind: requirement.kind,
          resourceType,
          amount: positiveSafeInteger(
            requirement.amount,
            childPath(requirementPath, "amount"),
          ),
        },
      };
    }
    default:
      fail(
        "planning.input-invalid",
        childPath(path, "kind"),
        "expected predicate kind reach-exit, reach, collect, or unlock",
      );
  }
}

/** Collision-free internal map key; never crosses the public planning boundary. */
function canonicalPlanPredicateKey(predicate: PlanPredicateV1): string {
  return canonicalizeJson(predicate);
}

function stateKey(axis: PlanningStateAxisV1, resourceType: StableIdV1): string {
  return canonicalizeJson({ axis, resourceType });
}

function normalizeEffects(value: unknown, path: string): readonly PlanningStateEffectV1[] {
  assertArray(value, path);
  const deltas = new Map<string, PlanningStateEffectV1>();
  for (let index = 0; index < value.length; index += 1) {
    const effectPath = childPath(path, index);
    const effect = value[index];
    assertRecord(effect, effectPath);
    if (effect.axis !== "inventory" && effect.axis !== "remaining-requirement") {
      fail(
        "planning.input-invalid",
        childPath(effectPath, "axis"),
        "expected state axis inventory or remaining-requirement",
      );
    }
    const resourceType = durableString(
      effect.resourceType,
      childPath(effectPath, "resourceType"),
    );
    const delta = nonzeroSafeInteger(effect.delta, childPath(effectPath, "delta"));
    const key = stateKey(effect.axis, resourceType);
    const combined = (deltas.get(key)?.delta ?? 0) + delta;
    if (!Number.isSafeInteger(combined)) {
      fail(
        "planning.input-invalid",
        childPath(effectPath, "delta"),
        "combined resource delta exceeds the safe integer range",
      );
    }
    deltas.set(key, { axis: effect.axis, resourceType, delta: combined });
  }
  return [...deltas.values()]
    .filter(({ delta }) => delta !== 0)
    .sort((left, right) => compareText(left.axis, right.axis)
      || compareText(left.resourceType, right.resourceType));
}

function normalizeLimits(value: unknown): TerminalFirstPlanningLimitsV1 {
  if (value === undefined) {
    return { ...DEFAULT_LIMITS };
  }
  assertRecord(value, "/limits");
  const positive = (name: keyof TerminalFirstPlanningLimitsV1): number => (
    value[name] === undefined
      ? DEFAULT_LIMITS[name]
      : positiveSafeInteger(value[name], childPath("/limits", name))
  );
  const limits: TerminalFirstPlanningLimitsV1 = {
    maxDepth: positive("maxDepth"),
    maxPlansPerExit: positive("maxPlansPerExit"),
    maxTraceSteps: positive("maxTraceSteps"),
    maxDiagnostics: positive("maxDiagnostics"),
  };
  for (const name of Object.keys(limits) as (keyof TerminalFirstPlanningLimitsV1)[]) {
    if (limits[name] > IMPLEMENTATION_MAX_LIMITS[name]) {
      fail(
        "planning.input-invalid",
        childPath("/limits", name),
        `${name} must not exceed implementation maximum ${IMPLEMENTATION_MAX_LIMITS[name]}`,
      );
    }
  }
  return limits;
}

function mergeEvidence(
  left: readonly StableIdV1[],
  right: readonly StableIdV1[],
): readonly StableIdV1[] {
  return [...new Set([...left, ...right])].sort(compareText);
}

function normalizeInput(input: TerminalFirstPlanningInputV1): NormalizedInput {
  assertRecord(input, "");
  if (input.planningVersion !== 1) {
    fail("planning.input-invalid", "/planningVersion", "expected planningVersion 1");
  }
  const inputTarget = target(input.target, "/target");
  const limits = normalizeLimits(input.limits);

  assertArray(input.exits, "/exits");
  const exitsById = new Map<StableIdV1, NormalizedExit>();
  for (let index = 0; index < input.exits.length; index += 1) {
    const exitPath = childPath("/exits", index);
    const candidate = input.exits[index];
    assertRecord(candidate, exitPath);
    const exitTarget = target(candidate.target, childPath(exitPath, "target"));
    if (exitTarget !== inputTarget) {
      fail(
        "planning.input-invalid",
        childPath(exitPath, "target"),
        "exit target must match the planning target",
      );
    }
    const exitId = durableString(candidate.exitId, childPath(exitPath, "exitId"));
    const evidenceIds = normalizeEvidenceIds(
      candidate.evidenceIds,
      childPath(exitPath, "evidenceIds"),
    );
    const existing = exitsById.get(exitId);
    exitsById.set(exitId, {
      target: exitTarget,
      exitId,
      evidenceIds: existing === undefined
        ? evidenceIds
        : mergeEvidence(existing.evidenceIds, evidenceIds),
    });
  }
  const exits = [...exitsById.values()].sort(
    (left, right) => compareText(left.exitId, right.exitId),
  );

  const predicatesByGoal = new Map<string, PlanPredicateV1>();
  const collectionGoalsByOccurrence = new Map<StableIdV1, string>();
  const collectionOccurrencesByPlacement = new Map<string, StableIdV1>();
  const registerPredicate = (predicate: PlanPredicateV1): string => {
    const goalId = canonicalPlanPredicateKey(predicate);
    if (predicate.kind === "collect") {
      const existingGoal = collectionGoalsByOccurrence.get(
        predicate.collectionOccurrenceId,
      );
      if (existingGoal !== undefined && existingGoal !== goalId) {
        fail(
          "planning.invariant-invalid",
          "/predicates",
          `collection occurrence ${predicate.collectionOccurrenceId} identifies conflicting goals`,
        );
      }
      collectionGoalsByOccurrence.set(predicate.collectionOccurrenceId, goalId);
      if (predicate.sourcePlacementId !== null) {
        const existingOccurrence = collectionOccurrencesByPlacement.get(
          predicate.sourcePlacementId,
        );
        if (
          existingOccurrence !== undefined
          && existingOccurrence !== predicate.collectionOccurrenceId
        ) {
          fail(
            "planning.invariant-invalid",
            "/predicates",
            `source placement ${predicate.sourcePlacementId} cannot be collected twice`,
          );
        }
        collectionOccurrencesByPlacement.set(
          predicate.sourcePlacementId,
          predicate.collectionOccurrenceId,
        );
      }
    }
    predicatesByGoal.set(goalId, predicate);
    return goalId;
  };
  for (const exit of exits) {
    registerPredicate({ kind: "reach-exit", exitId: exit.exitId });
  }

  assertArray(input.facts, "/facts");
  const factsByGoal = new Map<string, NormalizedFact>();
  for (let index = 0; index < input.facts.length; index += 1) {
    const factPath = childPath("/facts", index);
    const candidate = input.facts[index];
    assertRecord(candidate, factPath);
    const predicate = normalizePredicate(
      candidate.predicate,
      childPath(factPath, "predicate"),
    );
    const goalId = registerPredicate(predicate);
    if (
      candidate.status !== "satisfied"
      && candidate.status !== "unknown"
      && candidate.status !== "dynamic"
    ) {
      fail(
        "planning.input-invalid",
        childPath(factPath, "status"),
        "expected fact status satisfied, unknown, or dynamic",
      );
    }
    const evidenceIds = normalizeEvidenceIds(
      candidate.evidenceIds,
      childPath(factPath, "evidenceIds"),
    );
    const existing = factsByGoal.get(goalId);
    if (existing !== undefined && existing.status !== candidate.status) {
      fail(
        "planning.invariant-invalid",
        childPath(factPath, "status"),
        `predicate ${goalId} has conflicting fact statuses`,
      );
    }
    factsByGoal.set(goalId, {
      predicate,
      status: candidate.status,
      evidenceIds: existing === undefined
        ? evidenceIds
        : mergeEvidence(existing.evidenceIds, evidenceIds),
    });
  }

  assertArray(input.operators, "/operators");
  const operatorsByScopedId = new Map<string, NormalizedOperator>();
  const targetOperatorsById = new Map<StableIdV1, NormalizedOperator>();
  for (let index = 0; index < input.operators.length; index += 1) {
    const operatorPath = childPath("/operators", index);
    const candidate = input.operators[index];
    assertRecord(candidate, operatorPath);
    const operatorIdValue = durableString(
      candidate.operatorId,
      childPath(operatorPath, "operatorId"),
    );
    const operatorTarget = target(candidate.target, childPath(operatorPath, "target"));
    if (
      candidate.kind !== "reach-exit"
      && candidate.kind !== "reach"
      && candidate.kind !== "collect"
      && candidate.kind !== "unlock"
    ) {
      fail(
        "planning.input-invalid",
        childPath(operatorPath, "kind"),
        "expected operator kind reach-exit, reach, collect, or unlock",
      );
    }
    const achieves = normalizePredicate(
      candidate.achieves,
      childPath(operatorPath, "achieves"),
    );
    if (achieves.kind !== candidate.kind) {
      fail(
        "planning.invariant-invalid",
        childPath(operatorPath, "achieves/kind"),
        "operator kind must equal its achieved predicate kind",
      );
    }
    assertArray(candidate.prerequisites, childPath(operatorPath, "prerequisites"));
    const prerequisitesByGoal = new Map<string, PlanPredicateV1>();
    for (let prerequisiteIndex = 0;
      prerequisiteIndex < candidate.prerequisites.length;
      prerequisiteIndex += 1) {
      const predicate = normalizePredicate(
        candidate.prerequisites[prerequisiteIndex],
        childPath(childPath(operatorPath, "prerequisites"), prerequisiteIndex),
      );
      if (predicate.kind === "reach-exit") {
        fail(
          "planning.invariant-invalid",
          childPath(
            childPath(childPath(operatorPath, "prerequisites"), prerequisiteIndex),
            "kind",
          ),
          "reach-exit is terminal and cannot be an operator prerequisite",
        );
      }
      prerequisitesByGoal.set(canonicalPlanPredicateKey(predicate), predicate);
    }
    const prerequisites = [...prerequisitesByGoal]
      .sort(([left], [right]) => compareText(left, right))
      .map(([, predicate]) => predicate);
    const explicitStateEffects = normalizeEffects(
      candidate.stateEffects,
      childPath(operatorPath, "stateEffects"),
    );
    if (
      achieves.kind === "collect"
      && !explicitStateEffects.some((effect) => (
        effect.resourceType === achieves.resourceType
        && (
          (effect.axis === "inventory" && effect.delta === achieves.amount)
          || (
            effect.axis === "remaining-requirement"
            && effect.delta === -achieves.amount
          )
        )
      ))
    ) {
      fail(
        "planning.invariant-invalid",
        childPath(operatorPath, "stateEffects"),
        "collect operator must establish its exact inventory or remaining-requirement amount",
      );
    }
    const consumingRequirement = achieves.kind === "unlock"
      && achieves.requirement.kind === "consume-inventory"
      ? achieves.requirement
      : null;
    if (
      consumingRequirement !== null
      && explicitStateEffects.some(
        (effect) => effect.axis === "inventory"
          && effect.resourceType === consumingRequirement.resourceType,
      )
    ) {
      fail(
        "planning.invariant-invalid",
        childPath(operatorPath, "stateEffects"),
        "a consume-inventory gate derives its own inventory effect",
      );
    }
    const possessRequirement = achieves.kind === "unlock"
      && achieves.requirement.kind === "possess-inventory"
      ? achieves.requirement
      : null;
    if (
      possessRequirement !== null
      && explicitStateEffects.some(
        (effect) => effect.axis === "inventory"
          && effect.resourceType === possessRequirement.resourceType,
      )
    ) {
      fail(
        "planning.invariant-invalid",
        childPath(operatorPath, "stateEffects"),
        "a possess-inventory gate cannot change the possessed resource",
      );
    }
    const stateEffects = consumingRequirement === null
      ? explicitStateEffects
      : normalizeEffects([
        ...explicitStateEffects,
        {
          axis: "inventory",
          resourceType: consumingRequirement.resourceType,
          delta: -consumingRequirement.amount,
        },
      ], childPath(operatorPath, "stateEffects"));
    const normalized: NormalizedOperator = {
      operatorId: operatorIdValue,
      target: operatorTarget,
      kind: candidate.kind,
      achieves,
      prerequisites,
      stateEffects,
      evidenceIds: normalizeEvidenceIds(
        candidate.evidenceIds,
        childPath(operatorPath, "evidenceIds"),
      ),
    };
    const scopedId = canonicalizeJson({
      operatorId: operatorIdValue,
      target: operatorTarget,
    });
    if (operatorsByScopedId.has(scopedId)) {
      fail(
        "planning.invariant-invalid",
        childPath(operatorPath, "operatorId"),
        "operator identity must be unique within a target",
      );
    }
    operatorsByScopedId.set(scopedId, normalized);
    if (operatorTarget === inputTarget) {
      registerPredicate(achieves);
      for (const prerequisite of prerequisites) {
        registerPredicate(prerequisite);
      }
      targetOperatorsById.set(operatorIdValue, normalized);
    }
  }

  const groupedOperators = new Map<string, NormalizedOperator[]>();
  for (const candidate of targetOperatorsById.values()) {
    const goalId = canonicalPlanPredicateKey(candidate.achieves);
    const group = groupedOperators.get(goalId) ?? [];
    group.push(candidate);
    groupedOperators.set(goalId, group);
  }
  const operatorsByGoal = new Map<string, readonly NormalizedOperator[]>();
  for (const [goalId, group] of groupedOperators) {
    operatorsByGoal.set(
      goalId,
      group.sort((left, right) => compareText(left.operatorId, right.operatorId)),
    );
  }

  assertRecord(input.initialState, "/initialState");
  const initialState = new Map<string, NormalizedInitialStateEntry>();
  const addInitialEntries = (
    rawEntries: unknown,
    path: string,
    axis: PlanningStateAxisV1,
  ): void => {
    assertArray(rawEntries, path);
    for (let index = 0; index < rawEntries.length; index += 1) {
      const resourcePath = childPath(path, index);
      const candidate = rawEntries[index];
      assertRecord(candidate, resourcePath);
      const resourceType = durableString(
        candidate.resourceType,
        childPath(resourcePath, "resourceType"),
      );
      const amount = nonnegativeSafeInteger(
        candidate.amount,
        childPath(resourcePath, "amount"),
      );
      const key = stateKey(axis, resourceType);
      const combined = (initialState.get(key)?.amount ?? 0) + amount;
      if (!Number.isSafeInteger(combined)) {
        fail(
          "planning.input-invalid",
          childPath(resourcePath, "amount"),
          "combined initial state amount exceeds the safe integer range",
        );
      }
      initialState.set(key, { axis, resourceType, amount: combined });
    }
  };
  addInitialEntries(input.initialState.inventory, "/initialState/inventory", "inventory");
  addInitialEntries(
    input.initialState.remainingRequirements,
    "/initialState/remainingRequirements",
    "remaining-requirement",
  );

  return {
    target: inputTarget,
    exits,
    factsByGoal,
    operatorsByGoal,
    operatorsById: targetOperatorsById,
    predicatesByGoal,
    initialState,
    limits,
  };
}

function resolutionForGoal(
  goalKey: string,
  input: NormalizedInput,
): GoalResolutionV1 {
  const fact = input.factsByGoal.get(goalKey);
  const hasAchiever = (input.operatorsByGoal.get(goalKey)?.length ?? 0) > 0;
  if (fact?.status === "satisfied") {
    return "satisfied";
  }
  if (fact?.status === "unknown") {
    return hasAchiever ? "regressed-with-unknown" : "unresolved-unknown";
  }
  if (fact?.status === "dynamic") {
    return hasAchiever ? "regressed-with-dynamic" : "unresolved-dynamic";
  }
  return hasAchiever ? "regressed" : "unresolved-no-achiever";
}

function diagnosticCodeForReason(
  reason: Exclude<PlanningUnresolvedReasonV1, "resource-inconsistent">,
): PlanningDiagnosticCodeV1 {
  switch (reason) {
    case "unknown":
      return "planning.unknown";
    case "dynamic":
      return "planning.dynamic";
    case "no-achiever":
      return "planning.no-achiever";
    case "cycle":
      return "planning.cycle";
    case "limit":
      return "planning.limit";
  }
}

function detailForReason(reason: PlanningUnresolvedReasonV1): string {
  switch (reason) {
    case "unknown":
      return "static evidence marks this prerequisite unknown";
    case "dynamic":
      return "static evidence marks this prerequisite dynamic";
    case "no-achiever":
      return "no target-scoped operator or satisfied fact achieves this prerequisite";
    case "cycle":
      return "backward regression revisited a goal on the active prerequisite path";
    case "limit":
      return "backward regression reached a configured planning bound";
    case "resource-inconsistent":
      return "forward resource accounting would consume more than is available";
  }
}

function unresolvedObligation(
  goalId: PlanGoalIdV1,
  predicate: PlanPredicateV1,
  reason: PlanningUnresolvedReasonV1,
  viaOperatorId: StableIdV1 | null,
  evidenceIds: readonly StableIdV1[],
  pathGoalIds: readonly PlanGoalIdV1[],
): PlanningUnresolvedObligationV1 {
  return {
    goalId,
    predicate,
    reason,
    viaOperatorId,
    evidenceIds: [...evidenceIds],
    pathGoalIds: [...pathGoalIds],
  };
}

function compareUnresolved(
  left: PlanningUnresolvedObligationV1,
  right: PlanningUnresolvedObligationV1,
): number {
  return compareText(left.reason, right.reason)
    || compareText(left.goalId, right.goalId)
    || compareNullableText(left.viaOperatorId, right.viaOperatorId)
    || compareText(
      canonicalizeJson(left.pathGoalIds),
      canonicalizeJson(right.pathGoalIds),
    );
}

function deduplicateUnresolved(
  values: readonly PlanningUnresolvedObligationV1[],
): readonly PlanningUnresolvedObligationV1[] {
  const byIdentity = new Map<string, PlanningUnresolvedObligationV1>();
  for (const value of values) {
    const key = canonicalizeJson({
      goalId: value.goalId,
      pathGoalIds: value.pathGoalIds,
      reason: value.reason,
      viaOperatorId: value.viaOperatorId,
    });
    byIdentity.set(key, value);
  }
  return [...byIdentity.values()].sort(compareUnresolved);
}

function comparePartialPlans(left: PartialPlan, right: PartialPlan): number {
  const leftKey = canonicalizeJson({
    operators: left.operators.map(({ operatorId }) => operatorId),
    unresolved: left.unresolved.map(({ goalId, pathGoalIds, reason, viaOperatorId }) => ({
      goalId,
      pathGoalIds,
      reason,
      viaOperatorId,
    })),
  });
  const rightKey = canonicalizeJson({
    operators: right.operators.map(({ operatorId }) => operatorId),
    unresolved: right.unresolved.map(({ goalId, pathGoalIds, reason, viaOperatorId }) => ({
      goalId,
      pathGoalIds,
      reason,
      viaOperatorId,
    })),
  });
  return compareText(leftKey, rightKey);
}

function mergeOperators(
  left: readonly NormalizedOperator[],
  right: readonly NormalizedOperator[],
): readonly NormalizedOperator[] {
  const seen = new Set(left.map(({ operatorId }) => operatorId));
  const merged = [...left];
  for (const candidate of right) {
    if (!seen.has(candidate.operatorId)) {
      seen.add(candidate.operatorId);
      merged.push(candidate);
    }
  }
  return merged;
}

function diagnosticTupleKey(value: RawDiagnostic): string {
  return canonicalizeJson([
    value.code,
    value.rootId,
    value.goalId,
    value.operatorId,
    value.pathGoalIds,
  ]);
}

function ordinalSuffix(value: string): number {
  const separator = value.lastIndexOf(":");
  return Number(value.slice(separator + 1));
}

function compareOrdinalIds(left: string, right: string): number {
  return ordinalSuffix(left) - ordinalSuffix(right);
}

function compareGoalPaths(
  left: readonly PlanGoalIdV1[],
  right: readonly PlanGoalIdV1[],
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftGoal = left[index];
    const rightGoal = right[index];
    if (leftGoal !== undefined && rightGoal !== undefined) {
      const comparison = compareOrdinalIds(leftGoal, rightGoal);
      if (comparison !== 0) {
        return comparison;
      }
    }
  }
  return left.length - right.length;
}

function compareDiagnostics(left: RawDiagnostic, right: RawDiagnostic): number {
  return compareText(left.code, right.code)
    || compareOrdinalIds(left.rootId, right.rootId)
    || compareOrdinalIds(left.goalId, right.goalId)
    || compareNullableText(left.operatorId, right.operatorId)
    || compareGoalPaths(left.pathGoalIds, right.pathGoalIds);
}

function traceProvenance(action: BackwardTraceActionV1): BackwardTraceProvenanceV1 {
  if (action === "root") {
    return "authored";
  }
  if (action === "satisfied") {
    return "forward-derived";
  }
  return "backward-regressed";
}

/**
 * Builds a target-scoped terminal-first AND/OR explanation and provisional
 * forward ordering. Dynamic claims remain obligations for P3B; this function
 * never imports or executes a gameplay runtime.
 */
export function buildTerminalFirstPlan(
  rawInput: TerminalFirstPlanningInputV1,
): TerminalFirstPlanningResultV1 {
  const input = normalizeInput(rawInput);
  const rootSeeds = input.exits.map((exit) => {
    const predicate: PlanPredicateV1 = { kind: "reach-exit", exitId: exit.exitId };
    return {
      exit,
      goalKey: canonicalPlanPredicateKey(predicate),
      evidenceIds: [...exit.evidenceIds],
    };
  });

  const discoveredGoals = new Set<string>();
  const discoveredOperators = new Set<StableIdV1>();
  const goalsToDiscover = rootSeeds.map(({ goalKey }) => goalKey).reverse();
  while (goalsToDiscover.length > 0) {
    const goalId = goalsToDiscover.pop();
    if (goalId === undefined) {
      continue;
    }
    if (discoveredGoals.has(goalId)) {
      continue;
    }
    discoveredGoals.add(goalId);
    if (input.factsByGoal.get(goalId)?.status === "satisfied") {
      continue;
    }
    for (const candidate of input.operatorsByGoal.get(goalId) ?? []) {
      discoveredOperators.add(candidate.operatorId);
      for (let index = candidate.prerequisites.length - 1; index >= 0; index -= 1) {
        const prerequisite = candidate.prerequisites[index];
        if (prerequisite !== undefined) {
          goalsToDiscover.push(canonicalPlanPredicateKey(prerequisite));
        }
      }
    }
  }

  const orderedGoalKeys = [...discoveredGoals].sort(compareText);
  const goalIdsByKey = new Map<string, PlanGoalIdV1>(
    orderedGoalKeys.map((goalKey, index) => [goalKey, `goal:${index}`]),
  );
  const goalIdForKey = (goalKey: string): PlanGoalIdV1 => {
    const goalId = goalIdsByKey.get(goalKey);
    if (goalId === undefined) {
      fail(
        "planning.invariant-invalid",
        "/graph/goals",
        "goal key was not assigned a graph-local identity",
      );
    }
    return goalId;
  };
  const orderedOperatorIds = [...discoveredOperators].sort(compareText);
  const operatorNodeIdsById = new Map<StableIdV1, PlanOperatorNodeIdV1>(
    orderedOperatorIds.map((operatorIdValue, index) => [
      operatorIdValue,
      `operator-node:${index}`,
    ]),
  );
  const operatorNodeIdFor = (operatorIdValue: StableIdV1): PlanOperatorNodeIdV1 => {
    const nodeId = operatorNodeIdsById.get(operatorIdValue);
    if (nodeId === undefined) {
      fail(
        "planning.invariant-invalid",
        "/graph/operators",
        "operator was not assigned a graph-local node identity",
      );
    }
    return nodeId;
  };
  const roots: NormalizedRoot[] = rootSeeds.map((seed, rootOrder) => ({
    rootOrder,
    goalKey: seed.goalKey,
    rootId: `root:${rootOrder}`,
    target: input.target,
    exitId: seed.exit.exitId,
    goalId: goalIdForKey(seed.goalKey),
    evidenceIds: seed.evidenceIds,
  }));

  const goalNodes: GoalGraphGoalNodeV1[] = orderedGoalKeys.map((goalKey) => {
      const predicate = input.predicatesByGoal.get(goalKey);
      if (predicate === undefined) {
        fail(
          "planning.invariant-invalid",
          "/graph/goals",
          "missing registered predicate for a discovered goal",
        );
      }
      const fact = input.factsByGoal.get(goalKey);
      return {
        nodeType: "goal",
        goalId: goalIdForKey(goalKey),
        predicate,
        resolution: resolutionForGoal(goalKey, input),
        evidenceIds: fact === undefined ? [] : [...fact.evidenceIds],
        achieverNodeIds: fact?.status !== "satisfied"
          ? (input.operatorsByGoal.get(goalKey) ?? []).map(
            ({ operatorId }) => operatorNodeIdFor(operatorId),
          )
          : [],
      };
    });
  const operatorNodes: GoalGraphOperatorNodeV1[] = orderedOperatorIds
    .map((operatorIdValue) => {
      const candidate = input.operatorsById.get(operatorIdValue);
      if (candidate === undefined) {
        fail(
          "planning.invariant-invalid",
          "/graph/operators",
          `missing registered operator ${operatorIdValue}`,
        );
      }
      return {
        nodeType: "operator" as const,
        operatorNodeId: operatorNodeIdFor(candidate.operatorId),
        operatorId: candidate.operatorId,
        target: candidate.target,
        kind: candidate.kind,
        achievesGoalId: goalIdForKey(canonicalPlanPredicateKey(candidate.achieves)),
        prerequisiteGoalIds: candidate.prerequisites.map(
          (predicate) => goalIdForKey(canonicalPlanPredicateKey(predicate)),
        ),
        stateEffects: candidate.stateEffects.map((effect) => ({ ...effect })),
        evidenceIds: [...candidate.evidenceIds],
      };
    })
    .sort((left, right) => compareText(left.operatorNodeId, right.operatorNodeId));

  const rawDiagnostics: RawDiagnostic[] = [];
  const addDiagnostic = (
    code: PlanningDiagnosticCodeV1,
    root: NormalizedRoot,
    goalKey: string,
    operatorIdValue: StableIdV1 | null,
    pathGoalKeys: readonly string[],
    detail: string,
  ): void => {
    rawDiagnostics.push({
      code,
      target: input.target,
      rootId: root.rootId,
      goalId: goalIdForKey(goalKey),
      operatorId: operatorIdValue,
      pathGoalIds: pathGoalKeys.map(goalIdForKey),
      detail,
    });
  };
  const makeUnresolved = (
    goalKey: string,
    predicate: PlanPredicateV1,
    reason: PlanningUnresolvedReasonV1,
    viaOperatorId: StableIdV1 | null,
    evidenceIds: readonly StableIdV1[],
    pathGoalKeys: readonly string[],
  ): PlanningUnresolvedObligationV1 => unresolvedObligation(
    goalIdForKey(goalKey),
    predicate,
    reason,
    viaOperatorId,
    evidenceIds,
    pathGoalKeys.map(goalIdForKey),
  );

  const trace: BackwardTraceStepV1[] = [];
  let traceTruncated = false;
  const addTrace = (
    root: NormalizedRoot,
    depth: number,
    action: BackwardTraceActionV1,
    goalKey: string,
    predicate: PlanPredicateV1,
    viaOperatorId: StableIdV1 | null,
    evidenceIds: readonly StableIdV1[],
  ): void => {
    if (trace.length >= input.limits.maxTraceSteps) {
      if (!traceTruncated) {
        addDiagnostic(
          "planning.limit",
          root,
          goalKey,
          viaOperatorId,
          [],
          "backward trace exceeded maxTraceSteps",
        );
      }
      traceTruncated = true;
      return;
    }
    trace.push({
      traceOrder: trace.length,
      rootId: root.rootId,
      depth,
      action,
      provenance: traceProvenance(action),
      goalId: goalIdForKey(goalKey),
      predicate,
      viaOperatorId,
      evidenceIds: [...evidenceIds],
    });
  };

  const walkTrace = (
    root: NormalizedRoot,
    goalKey: string,
    depth: number,
    pathGoalKeys: readonly string[],
    viaOperatorId: StableIdV1 | null,
  ): void => {
    if (traceTruncated) {
      return;
    }
    const predicate = input.predicatesByGoal.get(goalKey);
    if (predicate === undefined) {
      fail("planning.invariant-invalid", "/trace", "missing predicate for trace goal");
    }
    if (depth > input.limits.maxDepth) {
      const path = [...pathGoalKeys, goalKey];
      addTrace(root, depth, "limit", goalKey, predicate, viaOperatorId, []);
      addDiagnostic(
        "planning.limit",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("limit"),
      );
      return;
    }
    if (pathGoalKeys.includes(goalKey)) {
      const path = [...pathGoalKeys, goalKey];
      addTrace(root, depth, "cycle", goalKey, predicate, viaOperatorId, []);
      addDiagnostic(
        "planning.cycle",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("cycle"),
      );
      return;
    }
    const fact = input.factsByGoal.get(goalKey);
    const achievers = input.operatorsByGoal.get(goalKey) ?? [];
    if (fact !== undefined) {
      if (fact.status === "satisfied") {
        addTrace(root, depth, "satisfied", goalKey, predicate, viaOperatorId, fact.evidenceIds);
        return;
      }
      const reason = fact.status;
      const path = [...pathGoalKeys, goalKey];
      addTrace(root, depth, "unresolved", goalKey, predicate, viaOperatorId, fact.evidenceIds);
      addDiagnostic(
        diagnosticCodeForReason(reason),
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason(reason),
      );
      if (achievers.length === 0) {
        return;
      }
    }
    if (achievers.length === 0) {
      const path = [...pathGoalKeys, goalKey];
      addTrace(root, depth, "unresolved", goalKey, predicate, viaOperatorId, []);
      addDiagnostic(
        "planning.no-achiever",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("no-achiever"),
      );
      return;
    }
    for (const candidate of achievers) {
      addTrace(
        root,
        depth,
        "regress",
        goalKey,
        predicate,
        candidate.operatorId,
        candidate.evidenceIds,
      );
      const nextPath = [...pathGoalKeys, goalKey];
      for (const prerequisite of candidate.prerequisites) {
        walkTrace(
          root,
          canonicalPlanPredicateKey(prerequisite),
          depth + 1,
          nextPath,
          candidate.operatorId,
        );
      }
    }
  };

  for (const root of roots) {
    const rootPredicate = input.predicatesByGoal.get(root.goalKey);
    if (rootPredicate === undefined) {
      fail("planning.invariant-invalid", "/trace", `missing root predicate ${root.goalId}`);
    }
    addTrace(root, 0, "root", root.goalKey, rootPredicate, null, root.evidenceIds);
    walkTrace(root, root.goalKey, 0, [], null);
  }

  let expandedPlansTruncated = false;
  const expandGoal = (
    root: NormalizedRoot,
    goalKey: string,
    depth: number,
    pathGoalKeys: readonly string[],
    viaOperatorId: StableIdV1 | null,
  ): readonly PartialPlan[] => {
    const predicate = input.predicatesByGoal.get(goalKey);
    if (predicate === undefined) {
      fail("planning.invariant-invalid", "/expandedPlans", "missing expanded-plan predicate");
    }
    if (depth > input.limits.maxDepth) {
      const path = [...pathGoalKeys, goalKey];
      addDiagnostic(
        "planning.limit",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("limit"),
      );
      return [{
        operators: [],
        unresolved: [makeUnresolved(
          goalKey,
          predicate,
          "limit",
          viaOperatorId,
          [],
          path,
        )],
      }];
    }
    if (pathGoalKeys.includes(goalKey)) {
      const path = [...pathGoalKeys, goalKey];
      addDiagnostic(
        "planning.cycle",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("cycle"),
      );
      return [{
        operators: [],
        unresolved: [makeUnresolved(
          goalKey,
          predicate,
          "cycle",
          viaOperatorId,
          [],
          path,
        )],
      }];
    }
    const fact = input.factsByGoal.get(goalKey);
    const achievers = input.operatorsByGoal.get(goalKey) ?? [];
    const alternatives: PartialPlan[] = [];
    if (fact !== undefined) {
      if (fact.status === "satisfied") {
        return [{ operators: [], unresolved: [] }];
      }
      const path = [...pathGoalKeys, goalKey];
      addDiagnostic(
        diagnosticCodeForReason(fact.status),
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason(fact.status),
      );
      alternatives.push({
        operators: [],
        unresolved: [makeUnresolved(
          goalKey,
          predicate,
          fact.status,
          viaOperatorId,
          fact.evidenceIds,
          path,
        )],
      });
      if (achievers.length === 0) {
        return alternatives;
      }
    }
    if (achievers.length === 0) {
      const path = [...pathGoalKeys, goalKey];
      addDiagnostic(
        "planning.no-achiever",
        root,
        goalKey,
        viaOperatorId,
        path,
        detailForReason("no-achiever"),
      );
      return [{
        operators: [],
        unresolved: [makeUnresolved(
          goalKey,
          predicate,
          "no-achiever",
          viaOperatorId,
          [],
          path,
        )],
      }];
    }

    for (const candidate of achievers) {
      let combinations: PartialPlan[] = [{ operators: [], unresolved: [] }];
      const nextPath = [...pathGoalKeys, goalKey];
      for (const prerequisite of candidate.prerequisites) {
        const prerequisitePlans = expandGoal(
          root,
          canonicalPlanPredicateKey(prerequisite),
          depth + 1,
          nextPath,
          candidate.operatorId,
        );
        const nextCombinations: PartialPlan[] = [];
        for (const prefix of combinations) {
          for (const suffix of prerequisitePlans) {
            nextCombinations.push({
              operators: mergeOperators(prefix.operators, suffix.operators),
              unresolved: deduplicateUnresolved([
                ...prefix.unresolved,
                ...suffix.unresolved,
              ]),
            });
          }
        }
        nextCombinations.sort(comparePartialPlans);
        if (nextCombinations.length > input.limits.maxPlansPerExit) {
          expandedPlansTruncated = true;
          combinations = nextCombinations.slice(0, input.limits.maxPlansPerExit);
          addDiagnostic(
            "planning.limit",
            root,
            goalKey,
            candidate.operatorId,
            nextPath,
            "AND/OR expansion exceeded maxPlansPerExit",
          );
        } else {
          combinations = nextCombinations;
        }
      }
      alternatives.push(...combinations.map((combination) => ({
        operators: mergeOperators(combination.operators, [candidate]),
        unresolved: combination.unresolved,
      })));
      alternatives.sort(comparePartialPlans);
      if (alternatives.length > input.limits.maxPlansPerExit) {
        expandedPlansTruncated = true;
        alternatives.length = input.limits.maxPlansPerExit;
        addDiagnostic(
          "planning.limit",
          root,
          goalKey,
          candidate.operatorId,
          nextPath,
          "OR expansion exceeded maxPlansPerExit",
        );
      }
    }
    return alternatives;
  };

  const expandedPlans: ExpandedPlanPreviewV1[] = [];
  for (const root of roots) {
    const partials = [...expandGoal(root, root.goalKey, 0, [], null)]
      .sort(comparePartialPlans);
    for (let planIndex = 0; planIndex < partials.length; planIndex += 1) {
      const partial = partials[planIndex];
      if (partial === undefined) {
        continue;
      }
      const steps: ExpandedPlanStepV1[] = partial.operators.map((candidate, stepOrder) => ({
        stepOrder,
        operatorId: candidate.operatorId,
        kind: candidate.kind,
        achieves: candidate.achieves,
        prerequisites: candidate.prerequisites.map((predicate) => ({ ...predicate })),
        stateEffects: candidate.stateEffects.map((effect) => ({ ...effect })),
        evidenceIds: [...candidate.evidenceIds],
      }));
      const ledger = new Map<string, MutableLedgerEntry>();
      for (const [key, initial] of input.initialState) {
        ledger.set(key, {
          axis: initial.axis,
          resourceType: initial.resourceType,
          initial: initial.amount,
          increased: 0,
          decreased: 0,
          remaining: initial.amount,
        });
      }
      const resourceUnresolved: PlanningUnresolvedObligationV1[] = [];
      for (const step of steps) {
        if (step.achieves.kind === "unlock") {
          const requirement = step.achieves.requirement;
          const requirementAxis = requirement.kind === "remaining-zero"
            ? "remaining-requirement"
            : "inventory";
          const requirementKey = stateKey(requirementAxis, requirement.resourceType);
          const available = ledger.get(requirementKey)?.remaining ?? 0;
          const requirementSatisfied = requirement.kind === "remaining-zero"
            ? available === 0
            : available >= requirement.amount;
          if (!requirementSatisfied) {
            const goalKey = canonicalPlanPredicateKey(step.achieves);
            addDiagnostic(
              "planning.resource-inconsistent",
              root,
              goalKey,
              step.operatorId,
              [],
              `${detailForReason("resource-inconsistent")}: ${requirement.kind} ${requirement.resourceType}`,
            );
            resourceUnresolved.push(makeUnresolved(
              goalKey,
              step.achieves,
              "resource-inconsistent",
              step.operatorId,
              step.evidenceIds,
              [],
            ));
          }
        }
        for (const effect of step.stateEffects) {
          const key = stateKey(effect.axis, effect.resourceType);
          const entry = ledger.get(key) ?? {
            axis: effect.axis,
            resourceType: effect.resourceType,
            initial: 0,
            increased: 0,
            decreased: 0,
            remaining: 0,
          };
          if (effect.delta > 0) {
            entry.increased += effect.delta;
          } else {
            entry.decreased += -effect.delta;
          }
          entry.remaining += effect.delta;
          if (
            !Number.isSafeInteger(entry.increased)
            || !Number.isSafeInteger(entry.decreased)
            || !Number.isSafeInteger(entry.remaining)
          ) {
            fail(
              "planning.invariant-invalid",
              "/expandedPlans/stateLedger",
              "resource ledger exceeded the safe integer range",
            );
          }
          ledger.set(key, entry);
          if (entry.remaining < 0) {
            const goalKey = canonicalPlanPredicateKey(step.achieves);
            addDiagnostic(
              "planning.resource-inconsistent",
              root,
              goalKey,
              step.operatorId,
              [],
              `${detailForReason("resource-inconsistent")}: ${effect.resourceType}`,
            );
            resourceUnresolved.push(makeUnresolved(
              goalKey,
              step.achieves,
              "resource-inconsistent",
              step.operatorId,
              step.evidenceIds,
              [],
            ));
          }
        }
      }
      const unresolved = deduplicateUnresolved([
        ...partial.unresolved,
        ...resourceUnresolved,
      ]);
      const stateLedger: PlanningStateLedgerEntryV1[] = [...ledger.values()]
        .sort((left, right) => compareText(left.axis, right.axis)
          || compareText(left.resourceType, right.resourceType))
        .map((entry) => ({ ...entry }));
      expandedPlans.push({
        previewVersion: 1,
        planId: `plan:${root.rootOrder}:${planIndex}`,
        target: input.target,
        rootId: root.rootId,
        exitId: root.exitId,
        status: unresolved.length === 0 ? "candidate" : "unresolved",
        stepsOrder: "forward-prerequisite-first",
        steps,
        unresolvedOrder: "reason-goal-path",
        unresolved,
        stateLedgerOrder: "axis-resource-type",
        stateLedger,
      });
    }
  }

  const diagnosticsByIdentity = new Map<
    string,
    { readonly diagnostic: RawDiagnostic; readonly details: Set<string> }
  >();
  for (const diagnostic of rawDiagnostics) {
    const key = diagnosticTupleKey(diagnostic);
    const existing = diagnosticsByIdentity.get(key);
    if (existing === undefined) {
      diagnosticsByIdentity.set(key, {
        diagnostic,
        details: new Set([diagnostic.detail]),
      });
    } else {
      existing.details.add(diagnostic.detail);
    }
  }
  const allDiagnostics = [...diagnosticsByIdentity.values()]
    .map(({ diagnostic, details }) => ({
      ...diagnostic,
      detail: [...details].sort(compareText).join("; "),
    }))
    .sort(compareDiagnostics);
  const keptDiagnostics = allDiagnostics.slice(0, input.limits.maxDiagnostics);
  const diagnostics: PlanningDiagnosticV1[] = keptDiagnostics.map((diagnostic, index) => ({
    diagnosticId: `diagnostic:${index}`,
    ...diagnostic,
  }));

  return {
    planningVersion: 1,
    target: input.target,
    limits: { ...input.limits },
    graph: {
      graphVersion: 1,
      target: input.target,
      rootsOrder: "exit-id",
      roots: roots.map(({ rootId: id, target: rootTarget, exitId, goalId, evidenceIds }) => ({
        rootId: id,
        target: rootTarget,
        exitId,
        goalId,
        evidenceIds,
      })),
      goalsOrder: "goal-id",
      goals: goalNodes,
      operatorsOrder: "operator-node-id",
      operators: operatorNodes,
    },
    traceOrder: "regression-preorder",
    trace,
    expandedPlansOrder: "exit-id-plan-id",
    expandedPlans,
    diagnosticsOrder: "code-root-goal-operator-path",
    diagnostics,
    truncation: {
      traceTruncated,
      expandedPlansTruncated,
      diagnosticsOmitted: allDiagnostics.length - keptDiagnostics.length,
    },
  };
}
