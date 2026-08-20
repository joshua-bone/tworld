import type {
  PlacementIdV1,
  RulesetTargetV1,
  SolverCoordinate,
  SolverObservation,
  StableIdV1,
} from "@tworld/ccsolver/domain";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type {
  CollectPredicateV1,
  ReachPredicateV1,
  UnlockPredicateV1,
} from "@tworld/ccsolver/plan";
import type {
  SolverAdvanceRequest,
  SolverCheckpointHandle,
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import {
  deriveObservationDelta,
  evaluateObservationPredicate,
  evaluateObservationPredicates,
  normalizeSubgoalContract,
  validateSubgoalContract,
  type ObservationPredicateVerdictV1,
  type SubgoalContractV1,
  type SubgoalContractValidationV1,
  type SubgoalObservationPredicateV1,
} from "@tworld/ccsolver/snippets";
import { GAME_INPUT_CODES } from "@game-core/api/command";

export const STANDARD_TACTIC_INPUT_CODES = [
  GAME_INPUT_CODES.north,
  GAME_INPUT_CODES.west,
  GAME_INPUT_CODES.south,
  GAME_INPUT_CODES.east,
  GAME_INPUT_CODES.none,
] as const;

const CARDINAL_INPUTS = [
  { inputCode: GAME_INPUT_CODES.north, dx: 0, dy: -1, fixedRank: 0 },
  { inputCode: GAME_INPUT_CODES.west, dx: -1, dy: 0, fixedRank: 1 },
  { inputCode: GAME_INPUT_CODES.south, dx: 0, dy: 1, fixedRank: 2 },
  { inputCode: GAME_INPUT_CODES.east, dx: 1, dy: 0, fixedRank: 3 },
] as const;

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;
const PLACEMENT_ID_PATTERN = /^placement:sha256:[0-9a-f]{64}$/u;
const HARD_MAXIMUM_BRANCHES = 65_536;
const HARD_MAXIMUM_ADVANCES = 1_000_000;
const HARD_MAXIMUM_TICKS = 65_536;
const HARD_MAXIMUM_FRONTIER = 65_536;

export type StandardReachTacticIntentV1 = {
  readonly kind: "reach";
  readonly goal: ReachPredicateV1;
  readonly destination: SolverCoordinate;
};

export type StandardCollectTacticIntentV1 = {
  readonly kind: "collect";
  readonly goal: CollectPredicateV1 & { readonly sourcePlacementId: PlacementIdV1 };
};

export type StandardUnlockTacticIntentV1 = {
  readonly kind: "unlock";
  readonly goal: UnlockPredicateV1 & { readonly gateId: PlacementIdV1 };
};

export type StandardWaitUntilTacticIntentV1 = {
  readonly kind: "wait-until";
  readonly predicate: SubgoalObservationPredicateV1;
};

export type StandardTacticIntentV1 =
  | StandardReachTacticIntentV1
  | StandardCollectTacticIntentV1
  | StandardUnlockTacticIntentV1
  | StandardWaitUntilTacticIntentV1;

export interface StandardTacticV1 {
  readonly tacticVersion: 1;
  readonly tacticId: StableIdV1;
  readonly target: RulesetTargetV1;
  readonly intent: StandardTacticIntentV1;
  readonly contract: SubgoalContractV1;
  readonly command: {
    readonly commandIdStem: StableIdV1;
    readonly planId: StableIdV1 | null;
  };
}

export interface StandardTacticBoundsV1 {
  readonly maximumCandidateBranches: number;
  readonly maximumAdvanceCalls: number;
  readonly maximumTicksPerBranch: number;
  readonly maximumFrontierEntries: number;
}

export type StandardTacticAdvanceRequestV1 = Extract<
  SolverAdvanceRequest,
  { readonly kind: "manual-poll" }
> & {
  readonly causalContext: {
    readonly commandId: StableIdV1;
    readonly planId: StableIdV1 | null;
  };
};

export interface StandardTacticDecisionBoundaryV1 {
  readonly nativeTick: number;
  readonly exactFingerprint: StableIdV1;
}

export interface StandardTacticDecisionV1 {
  readonly decisionOrder: number;
  readonly candidateRank: number;
  readonly request: StandardTacticAdvanceRequestV1;
  readonly entry: StandardTacticDecisionBoundaryV1;
  readonly exit: StandardTacticDecisionBoundaryV1;
  readonly result: "continue" | "stop-satisfied";
}

export interface StandardTacticStatisticsV1 {
  readonly attemptedBranches: number;
  readonly advanceCalls: number;
  readonly frontierPeak: number;
  readonly selectedTicks: number;
}

export interface StandardTacticWitnessV1 {
  readonly witnessVersion: 1;
  readonly target: RulesetTargetV1;
  readonly tacticId: StableIdV1;
  readonly entryObservation: SolverObservation;
  readonly exitObservation: SolverObservation;
  readonly entryExactFingerprint: StableIdV1;
  readonly exitExactFingerprint: StableIdV1;
  readonly entryNativeTick: number;
  readonly exitNativeTick: number;
  readonly selectedDecisions: readonly StandardTacticDecisionV1[];
  readonly contractValidation: SubgoalContractValidationV1;
  readonly statistics: StandardTacticStatisticsV1;
}

export type StandardTacticExhaustionCodeV1 =
  | "precondition"
  | "branch-budget"
  | "work-budget"
  | "tick-budget"
  | "frontier-budget"
  | "frontier-empty"
  | "input-blocked"
  | "terminal-before-stop";

export interface StandardTacticExhaustionDiagnosticV1 {
  readonly code: StandardTacticExhaustionCodeV1;
  readonly firstUnmetPredicateId: StableIdV1 | null;
  readonly attemptedBranches: number;
  readonly advanceCalls: number;
  readonly frontierPeak: number;
  readonly best: {
    readonly nativeTick: number;
    readonly exactFingerprint: StableIdV1;
    readonly distance: number | null;
  } | null;
}

export type StandardTacticEvaluationV1 =
  | {
      readonly status: "succeeded";
      readonly witness: StandardTacticWitnessV1;
    }
  | {
      readonly status: "exhausted";
      readonly diagnostic: StandardTacticExhaustionDiagnosticV1;
    };

export interface EvaluateStandardTacticInputV1<TManualSource, TReplaySource> {
  readonly runtime: SolverRuntimePort<TManualSource, TReplaySource>;
  /** Caller-owned manual run. It is never advanced or disposed by this operation. */
  readonly entryRun: SolverRunHandle;
  readonly tactic: StandardTacticV1;
  readonly bounds: StandardTacticBoundsV1;
}

export interface StandardInjectedSequenceFailureV1 {
  readonly status: "failed";
  readonly firstUnmetPredicateId: StableIdV1 | null;
  readonly exitObservation: SolverObservation;
  readonly decisionBoundaries: readonly Omit<StandardTacticDecisionV1, "candidateRank" | "result">[];
}

export type StandardTacticSuffixRepairV1 =
  | {
      readonly status: "repaired";
      readonly join: "replanned-join";
      readonly injectedDecisionOrder: number;
      readonly injectedFailure: StandardInjectedSequenceFailureV1;
      readonly retainedPrefix: readonly StandardTacticDecisionV1[];
      readonly replacedSuffix: readonly StandardTacticAdvanceRequestV1[];
      readonly repairedSuffix: readonly StandardTacticDecisionV1[];
      readonly compiledDecisions: readonly StandardTacticAdvanceRequestV1[];
      readonly witness: StandardTacticWitnessV1;
    }
  | {
      readonly status: "exhausted";
      readonly join: "replanned-join";
      readonly injectedDecisionOrder: number;
      readonly injectedFailure: StandardInjectedSequenceFailureV1;
      readonly retainedPrefix: readonly StandardTacticDecisionV1[];
      readonly replacedSuffix: readonly StandardTacticAdvanceRequestV1[];
      readonly diagnostic: StandardTacticExhaustionDiagnosticV1;
    };

export interface RepairStandardTacticSuffixInputV1<TManualSource, TReplaySource> {
  readonly runtime: SolverRuntimePort<TManualSource, TReplaySource>;
  /** Caller-owned original contract entry. It is never advanced or disposed. */
  readonly entryRun: SolverRunHandle;
  readonly tactic: StandardTacticV1;
  readonly originalWitness: StandardTacticWitnessV1;
  readonly injectedDecisions: readonly StandardTacticAdvanceRequestV1[];
  readonly injectedDecisionOrder: number;
  readonly bounds: StandardTacticBoundsV1;
}

export type StandardTacticErrorCodeV1 =
  | "tactic.invalid-input"
  | "tactic.invalid-contract"
  | "tactic.runtime-drift"
  | "tactic.invalid-repair";

export class StandardTacticError extends Error {
  override readonly name = "StandardTacticError";

  constructor(
    readonly code: StandardTacticErrorCodeV1,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

interface NormalizedTactic {
  readonly tactic: StandardTacticV1;
  readonly contract: SubgoalContractV1;
}

interface CandidatePath {
  readonly requests: readonly StandardTacticAdvanceRequestV1[];
  readonly candidateRanks: readonly number[];
  /** Already observed/verified prefix; replay rechecks its exact final boundary. */
  readonly prefixDecisions: readonly StandardTacticDecisionV1[];
  readonly estimatedDistance: number | null;
  readonly enqueueOrder: number;
}

interface SearchStatistics {
  attemptedBranches: number;
  advanceCalls: number;
  frontierPeak: number;
}

interface BestBoundary {
  readonly observation: SolverObservation;
  readonly distance: number | null;
  readonly firstUnmetPredicateId: StableIdV1 | null;
}

interface EvaluatedPath {
  readonly observation: SolverObservation;
  readonly decisions: readonly StandardTacticDecisionV1[];
  readonly firstFailedInvariant: ObservationPredicateVerdictV1 | null;
  readonly terminalBeforeStop: boolean;
}

interface SearchFromCheckpointInput<TManualSource, TReplaySource> {
  readonly runtime: SolverRuntimePort<TManualSource, TReplaySource>;
  readonly checkpoint: SolverCheckpointHandle;
  readonly searchEntry: SolverObservation;
  readonly contractEntry: SolverObservation;
  readonly normalized: NormalizedTactic;
  readonly bounds: StandardTacticBoundsV1;
  readonly targetCoordinate: SolverCoordinate | null;
  readonly decisionOrderOffset: number;
  readonly skipContractRequires: boolean;
  readonly initialAdvanceCalls?: number;
}

function canonicalCopy<T>(value: T): T {
  return JSON.parse(canonicalizeJson(value)) as T;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function invalidInput(message: string): never {
  throw new StandardTacticError("tactic.invalid-input", message);
}

function invalidContract(message: string): never {
  throw new StandardTacticError("tactic.invalid-contract", message);
}

function assertPositiveBound(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    invalidInput(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
}

function normalizeBounds(
  bounds: StandardTacticBoundsV1,
  contract: SubgoalContractV1,
): StandardTacticBoundsV1 {
  assertPositiveBound(
    bounds.maximumCandidateBranches,
    HARD_MAXIMUM_BRANCHES,
    "maximumCandidateBranches",
  );
  assertPositiveBound(bounds.maximumAdvanceCalls, HARD_MAXIMUM_ADVANCES, "maximumAdvanceCalls");
  assertPositiveBound(bounds.maximumTicksPerBranch, HARD_MAXIMUM_TICKS, "maximumTicksPerBranch");
  assertPositiveBound(
    bounds.maximumFrontierEntries,
    HARD_MAXIMUM_FRONTIER,
    "maximumFrontierEntries",
  );
  if (bounds.maximumTicksPerBranch > contract.maximumAdvanceTicks) {
    invalidInput("maximumTicksPerBranch cannot exceed contract.maximumAdvanceTicks");
  }
  return canonicalCopy(bounds);
}

function assertStableId(value: string, label: string): void {
  if (!STABLE_ID_PATTERN.test(value)) invalidInput(`${label} must use the StableId grammar`);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertPlacementId(value: string, label: string): asserts value is PlacementIdV1 {
  if (!PLACEMENT_ID_PATTERN.test(value)) {
    invalidContract(`${label} must identify one exact placement`);
  }
}

function semanticPredicateEqual(
  left: SubgoalObservationPredicateV1,
  right: SubgoalObservationPredicateV1,
): boolean {
  return canonicalEqual(left, right);
}

function coordinateEqual(left: SolverCoordinate | null, right: SolverCoordinate): boolean {
  return left !== null && left.x === right.x && left.y === right.y && left.z === right.z;
}

function finalPredicates(contract: SubgoalContractV1): readonly SubgoalObservationPredicateV1[] {
  return [contract.stop, ...contract.ensures];
}

function hasPlacementPredicate(
  predicates: readonly SubgoalObservationPredicateV1[],
  placementId: PlacementIdV1,
  present: boolean,
): boolean {
  return predicates.some((predicate) => (
    predicate.kind === "placement-presence"
    && predicate.placementId === placementId
    && predicate.present === present
  ));
}

function hasCountPredicate(
  predicates: readonly SubgoalObservationPredicateV1[],
  kind: "inventory-count" | "remaining-requirement-count",
  resourceType: StableIdV1,
  count: number,
  comparisons: readonly ("equals" | "at-least" | "at-most")[],
): boolean {
  return predicates.some((predicate) => (
    predicate.kind === kind
    && predicate.resourceType === resourceType
    && predicate.count === count
    && comparisons.includes(predicate.comparison)
  ));
}

function resourceCount(
  values: readonly { readonly resourceType: StableIdV1; readonly count: number }[],
  resourceType: StableIdV1,
): number {
  return values.reduce((total, value) => (
    value.resourceType === resourceType ? total + value.count : total
  ), 0);
}

function placementCoordinate(
  observation: SolverObservation,
  placementId: PlacementIdV1,
): SolverCoordinate | null {
  const matches = observation.cells.filter((cell) => cell.elements.some((element) => (
    element.identity.kind === "placement" && element.identity.placementId === placementId
  )));
  if (matches.length > 1) {
    throw new StandardTacticError(
      "tactic.runtime-drift",
      `placement ${placementId} appears at more than one observed coordinate`,
    );
  }
  return matches[0]?.coordinate ?? null;
}

function validateIntentAtEntry(
  tactic: StandardTacticV1,
  contract: SubgoalContractV1,
  entry: SolverObservation,
): SolverCoordinate | null {
  const intent = tactic.intent;
  const finals = finalPredicates(contract);
  switch (intent.kind) {
    case "reach": {
      if (
        contract.stop.kind !== "player-coordinate"
        || !coordinateEqual(contract.stop.coordinate, intent.destination)
      ) {
        invalidContract("Reach must stop at its exact destination coordinate");
      }
      return canonicalCopy(intent.destination);
    }
    case "wait-until": {
      if (!semanticPredicateEqual(contract.stop, intent.predicate)) {
        invalidContract("WaitUntil predicate must be the contract stop predicate");
      }
      return null;
    }
    case "collect": {
      const goal = intent.goal;
      assertPlacementId(goal.sourcePlacementId, "Collect sourcePlacementId");
      if (!Number.isSafeInteger(goal.amount) || goal.amount <= 0) {
        invalidContract("Collect amount must be a positive safe integer");
      }
      if (!hasPlacementPredicate(contract.requires, goal.sourcePlacementId, true)) {
        invalidContract("Collect requires must prove the exact source placement is present");
      }
      if (!hasPlacementPredicate(finals, goal.sourcePlacementId, false)) {
        invalidContract("Collect stop/ensures must prove the exact source placement is absent");
      }
      const entryCount = resourceCount(entry.inventory, goal.resourceType);
      if (!hasCountPredicate(contract.requires, "inventory-count", goal.resourceType, entryCount, ["equals"])) {
        invalidContract("Collect requires must bind the exact entry inventory count");
      }
      if (!hasCountPredicate(finals, "inventory-count", goal.resourceType, entryCount + goal.amount, ["equals"])) {
        invalidContract("Collect stop/ensures must bind the exact collected inventory count");
      }
      const coordinate = placementCoordinate(entry, goal.sourcePlacementId);
      if (coordinate === null) invalidContract("Collect source placement is absent at entry");
      return coordinate;
    }
    case "unlock": {
      const goal = intent.goal;
      assertPlacementId(goal.gateId, "Unlock gateId");
      if (!hasPlacementPredicate(contract.requires, goal.gateId, true)) {
        invalidContract("Unlock requires must prove the exact gate placement is present");
      }
      if (!hasPlacementPredicate(finals, goal.gateId, false)) {
        invalidContract("Unlock stop/ensures must prove the exact gate placement is absent");
      }
      const requirement = goal.requirement;
      if (
        "amount" in requirement
        && (!Number.isSafeInteger(requirement.amount) || requirement.amount <= 0)
      ) {
        invalidContract("Unlock inventory amount must be a positive safe integer");
      }
      if (requirement.kind === "remaining-zero") {
        if (
          !hasCountPredicate(contract.requires, "remaining-requirement-count", requirement.resourceType, 0, ["equals"])
          || !hasCountPredicate(finals, "remaining-requirement-count", requirement.resourceType, 0, ["equals"])
        ) {
          invalidContract("remaining-zero Unlock must bind zero outstanding requirements");
        }
      } else {
        const entryCount = resourceCount(entry.inventory, requirement.resourceType);
        if (entryCount < requirement.amount) {
          invalidContract("Unlock entry inventory does not satisfy its requirement");
        }
        if (!hasCountPredicate(contract.requires, "inventory-count", requirement.resourceType, entryCount, ["equals"])) {
          invalidContract("Unlock requires must bind the exact entry inventory count");
        }
        const expectedEnd = requirement.kind === "consume-inventory"
          ? entryCount - requirement.amount
          : entryCount;
        if (!hasCountPredicate(finals, "inventory-count", requirement.resourceType, expectedEnd, ["equals"])) {
          invalidContract("Unlock stop/ensures must bind the exact post-gate inventory count");
        }
      }
      const coordinate = placementCoordinate(entry, goal.gateId);
      if (coordinate === null) invalidContract("Unlock gate placement is absent at entry");
      return coordinate;
    }
  }
}

function normalizeTactic(tactic: StandardTacticV1): NormalizedTactic {
  if (tactic.tacticVersion !== 1) invalidInput("tacticVersion must be 1");
  assertStableId(tactic.tacticId, "tacticId");
  assertStableId(tactic.command.commandIdStem, "commandIdStem");
  if (tactic.command.planId !== null) assertStableId(tactic.command.planId, "planId");
  if (tactic.target !== "ms" && tactic.target !== "lynx") invalidInput("target must be ms or lynx");
  let contract: SubgoalContractV1;
  try {
    contract = normalizeSubgoalContract(tactic.contract);
  } catch (error) {
    throw new StandardTacticError(
      "tactic.invalid-contract",
      error instanceof Error ? error.message : "invalid subgoal contract",
      { cause: error },
    );
  }
  if (contract.target !== tactic.target) invalidContract("tactic and contract targets must match");
  return { tactic: canonicalCopy({ ...tactic, contract }), contract };
}

function commandId(tactic: StandardTacticV1, decisionOrder: number): StableIdV1 {
  const result = `${tactic.command.commandIdStem}:${decisionOrder}`;
  assertStableId(result, `derived commandId for decision ${decisionOrder}`);
  return result;
}

function manualRequest(
  tactic: StandardTacticV1,
  decisionOrder: number,
  inputCode: number,
): StandardTacticAdvanceRequestV1 {
  return {
    kind: "manual-poll",
    inputCode,
    causalContext: {
      commandId: commandId(tactic, decisionOrder),
      planId: tactic.command.planId,
    },
  };
}

function assertStandardRequest(
  value: unknown,
  tactic: StandardTacticV1,
  decisionOrder: number,
  label: string,
): asserts value is StandardTacticAdvanceRequestV1 {
  if (!isPlainRecord(value) || !hasExactKeys(value, ["kind", "inputCode", "causalContext"])) {
    throw new StandardTacticError("tactic.invalid-repair", `${label} must be an exact manual request`);
  }
  if (value.kind !== "manual-poll") {
    throw new StandardTacticError("tactic.invalid-repair", `${label} must be a manual-poll request`);
  }
  if (
    typeof value.inputCode !== "number"
    || !(STANDARD_TACTIC_INPUT_CODES as readonly number[]).includes(value.inputCode)
  ) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      `${label} must use a standard cardinal or zero-input code`,
    );
  }
  if (
    !isPlainRecord(value.causalContext)
    || !hasExactKeys(value.causalContext, ["commandId", "planId"])
    || value.causalContext.commandId !== commandId(tactic, decisionOrder)
    || value.causalContext.planId !== tactic.command.planId
  ) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      `${label} must use the tactic's exact decision-indexed causal context`,
    );
  }
}

function boundary(observation: SolverObservation): StandardTacticDecisionBoundaryV1 {
  return {
    nativeTick: observation.boundary.nativeTick,
    exactFingerprint: observation.fingerprints.exact,
  };
}

function firstFailed(
  verdicts: readonly ObservationPredicateVerdictV1[],
): ObservationPredicateVerdictV1 | null {
  return verdicts.find(({ passed }) => !passed) ?? null;
}

function contractValidationPassed(validation: SubgoalContractValidationV1): boolean {
  return firstFailed(validation.requires) === null
    && firstFailed(validation.ensures) === null
    && firstFailed(validation.invariantsAtEntry) === null
    && validation.mustChange.every(({ passed }) => passed)
    && validation.mustNotChange.every(({ passed }) => passed)
    && validation.forbiddenObservedChanges.every(({ passed }) => passed)
    && validation.unaccountedChangeOrders.length === 0;
}

function contractAtEnd(
  contract: SubgoalContractV1,
  contractEntry: SolverObservation,
  end: SolverObservation,
): { readonly passed: boolean; readonly validation: SubgoalContractValidationV1 } {
  const validation = validateSubgoalContract(
    contract,
    contractEntry,
    end,
    deriveObservationDelta(contractEntry, end),
  );
  const stop = evaluateObservationPredicate(contract.stop, end);
  return { passed: stop.passed && contractValidationPassed(validation), validation };
}

function firstUnmetAt(
  contract: SubgoalContractV1,
  contractEntry: SolverObservation,
  observation: SolverObservation,
): StableIdV1 | null {
  const invariant = firstFailed(evaluateObservationPredicates(contract.invariants, observation));
  if (invariant !== null) return invariant.predicateId;
  const stop = evaluateObservationPredicate(contract.stop, observation);
  if (!stop.passed) return stop.predicateId;
  const validation = validateSubgoalContract(
    contract,
    contractEntry,
    observation,
    deriveObservationDelta(contractEntry, observation),
  );
  return firstFailed(validation.ensures)?.predicateId
    ?? firstFailed(validation.mustChange.map((verdict, index) => ({
      predicateId: `footprint:must-change:${index}`,
      passed: verdict.passed,
      actual: verdict.matchedChangeOrders.length,
    })))?.predicateId
    ?? firstFailed(validation.mustNotChange.map((verdict, index) => ({
      predicateId: `footprint:must-not-change:${index}`,
      passed: verdict.passed,
      actual: verdict.matchedChangeOrders.length,
    })))?.predicateId
    ?? firstFailed(validation.forbiddenObservedChanges.map((verdict, index) => ({
      predicateId: `footprint:forbidden:${index}`,
      passed: verdict.passed,
      actual: verdict.matchedChangeOrders.length,
    })))?.predicateId
    ?? (validation.unaccountedChangeOrders.length === 0 ? null : "footprint:unaccounted");
}

function manhattanDistance(
  coordinate: SolverCoordinate | null,
  target: SolverCoordinate | null,
): number | null {
  if (coordinate === null || target === null || coordinate.z !== target.z) return null;
  return Math.abs(coordinate.x - target.x) + Math.abs(coordinate.y - target.y);
}

function diagnosticBest(best: BestBoundary | null): StandardTacticExhaustionDiagnosticV1["best"] {
  return best === null ? null : {
    nativeTick: best.observation.boundary.nativeTick,
    exactFingerprint: best.observation.fingerprints.exact,
    distance: best.distance,
  };
}

function isBetterBest(candidate: BestBoundary, current: BestBoundary | null): boolean {
  if (current === null) return true;
  if (candidate.distance === null) return false;
  if (current.distance === null) return true;
  return candidate.distance < current.distance;
}

function candidateInputs(
  observation: SolverObservation,
  target: SolverCoordinate | null,
  waitOnly: boolean,
): readonly number[] {
  if (waitOnly || observation.player.inputInfluence === "in-transit") {
    return [GAME_INPUT_CODES.none];
  }
  if (observation.player.inputInfluence !== "eligible") return [];
  const coordinate = observation.player.coordinate;
  if (coordinate === null || target === null) return [GAME_INPUT_CODES.none];
  const ranked = CARDINAL_INPUTS.map((candidate) => ({
    ...candidate,
    distance: Math.abs(coordinate.x + candidate.dx - target.x)
      + Math.abs(coordinate.y + candidate.dy - target.y)
      + Math.abs(coordinate.z - target.z),
  })).sort((left, right) => left.distance - right.distance || left.fixedRank - right.fixedRank);
  return [...ranked.map(({ inputCode }) => inputCode), GAME_INPUT_CODES.none];
}

function estimatedDistanceAfterInput(
  observation: SolverObservation,
  target: SolverCoordinate | null,
  inputCode: number,
): number | null {
  const coordinate = observation.player.coordinate;
  if (coordinate === null || target === null) return null;
  const cardinal = CARDINAL_INPUTS.find((candidate) => candidate.inputCode === inputCode);
  return manhattanDistance(cardinal === undefined ? coordinate : {
    x: coordinate.x + cardinal.dx,
    y: coordinate.y + cardinal.dy,
    z: coordinate.z,
  }, target);
}

function compareCandidatePath(left: CandidatePath, right: CandidatePath): number {
  if (left.estimatedDistance === null && right.estimatedDistance !== null) return 1;
  if (left.estimatedDistance !== null && right.estimatedDistance === null) return -1;
  if (
    left.estimatedDistance !== null
    && right.estimatedDistance !== null
    && left.estimatedDistance !== right.estimatedDistance
  ) {
    return left.estimatedDistance - right.estimatedDistance;
  }
  if (left.requests.length !== right.requests.length) {
    return left.requests.length - right.requests.length;
  }
  return left.enqueueOrder - right.enqueueOrder;
}

async function evaluatePath<TManualSource, TReplaySource>(
  runtime: SolverRuntimePort<TManualSource, TReplaySource>,
  checkpoint: SolverCheckpointHandle,
  expectedEntry: SolverObservation,
  contract: SubgoalContractV1,
  path: CandidatePath,
): Promise<EvaluatedPath> {
  const run = await runtime.restoreCheckpoint(checkpoint);
  try {
    const finalIndex = path.requests.length - 1;
    if (finalIndex < 0 || path.prefixDecisions.length !== finalIndex) {
      throw new StandardTacticError("tactic.runtime-drift", "candidate prefix evidence is malformed");
    }
    for (let index = 0; index < finalIndex; index += 1) {
      await runtime.advanceTick(run, path.requests[index]!);
    }
    let observation = await runtime.observe(run);
    const expectedBoundary = path.prefixDecisions.at(-1)?.exit ?? boundary(expectedEntry);
    if (
      observation.fingerprints.exact !== expectedBoundary.exactFingerprint
      || observation.boundary.nativeTick !== expectedBoundary.nativeTick
    ) {
      throw new StandardTacticError(
        "tactic.runtime-drift",
        "replayed candidate prefix does not match its exact observed boundary",
      );
    }
    const request = path.requests[finalIndex]!;
    const entry = observation;
    await runtime.advanceTick(run, request);
    observation = await runtime.observe(run);
    const decisions: StandardTacticDecisionV1[] = [...path.prefixDecisions, {
      decisionOrder: Number(request.causalContext.commandId.split(":").at(-1)),
      candidateRank: path.candidateRanks[finalIndex]!,
      request: canonicalCopy(request),
      entry: boundary(entry),
      exit: boundary(observation),
      result: "continue",
    }];
    const failedInvariant = firstFailed(evaluateObservationPredicates(contract.invariants, observation));
    if (failedInvariant !== null) {
      return {
        observation,
        decisions,
        firstFailedInvariant: failedInvariant,
        terminalBeforeStop: false,
      };
    }
    const stop = evaluateObservationPredicate(contract.stop, observation);
    if (observation.terminal.kind !== "running" && !stop.passed) {
      return {
        observation,
        decisions,
        firstFailedInvariant: null,
        terminalBeforeStop: true,
      };
    }
    return {
      observation,
      decisions,
      firstFailedInvariant: null,
      terminalBeforeStop: false,
    };
  } finally {
    await runtime.disposeRun(run);
  }
}

function exhausted(
  code: StandardTacticExhaustionCodeV1,
  firstUnmetPredicateId: StableIdV1 | null,
  statistics: SearchStatistics,
  best: BestBoundary | null,
): StandardTacticEvaluationV1 {
  return canonicalCopy({
    status: "exhausted",
    diagnostic: {
      code,
      firstUnmetPredicateId,
      attemptedBranches: statistics.attemptedBranches,
      advanceCalls: statistics.advanceCalls,
      frontierPeak: statistics.frontierPeak,
      best: diagnosticBest(best),
    },
  });
}

async function searchFromCheckpoint<TManualSource, TReplaySource>(
  input: SearchFromCheckpointInput<TManualSource, TReplaySource>,
): Promise<StandardTacticEvaluationV1> {
  const { runtime, checkpoint, searchEntry, contractEntry, normalized, targetCoordinate } = input;
  const bounds = normalizeBounds(input.bounds, normalized.contract);
  const statistics: SearchStatistics = {
    attemptedBranches: 0,
    advanceCalls: input.initialAdvanceCalls ?? 0,
    frontierPeak: 1,
  };
  if (!input.skipContractRequires) {
    const unmetRequire = firstFailed(evaluateObservationPredicates(
      normalized.contract.requires,
      searchEntry,
    ));
    const unmetEntryInvariant = firstFailed(evaluateObservationPredicates(
      normalized.contract.invariants,
      searchEntry,
    ));
    const unmet = unmetRequire ?? unmetEntryInvariant;
    if (unmet !== null) {
      return exhausted("precondition", unmet.predicateId, statistics, {
        observation: searchEntry,
        distance: manhattanDistance(searchEntry.player.coordinate, targetCoordinate),
        firstUnmetPredicateId: unmet.predicateId,
      });
    }
  } else {
    const unmetEntryInvariant = firstFailed(evaluateObservationPredicates(
      normalized.contract.invariants,
      searchEntry,
    ));
    if (unmetEntryInvariant !== null) {
      return exhausted("precondition", unmetEntryInvariant.predicateId, statistics, {
        observation: searchEntry,
        distance: manhattanDistance(searchEntry.player.coordinate, targetCoordinate),
        firstUnmetPredicateId: unmetEntryInvariant.predicateId,
      });
    }
  }

  let best: BestBoundary | null = {
    observation: searchEntry,
    distance: manhattanDistance(searchEntry.player.coordinate, targetCoordinate),
    firstUnmetPredicateId: firstUnmetAt(normalized.contract, contractEntry, searchEntry),
  };
  const entryContract = contractAtEnd(normalized.contract, contractEntry, searchEntry);
  if (entryContract.passed) {
    return canonicalCopy({
      status: "succeeded",
      witness: {
        witnessVersion: 1,
        target: normalized.tactic.target,
        tacticId: normalized.tactic.tacticId,
        entryObservation: contractEntry,
        exitObservation: searchEntry,
        entryExactFingerprint: contractEntry.fingerprints.exact,
        exitExactFingerprint: searchEntry.fingerprints.exact,
        entryNativeTick: contractEntry.boundary.nativeTick,
        exitNativeTick: searchEntry.boundary.nativeTick,
        selectedDecisions: [],
        contractValidation: entryContract.validation,
        statistics: { ...statistics, selectedTicks: 0 },
      },
    });
  }

  if (searchEntry.mode !== "manual") {
    return exhausted("input-blocked", best.firstUnmetPredicateId, statistics, best);
  }
  if (searchEntry.terminal.kind !== "running") {
    return exhausted("terminal-before-stop", best.firstUnmetPredicateId, statistics, best);
  }
  if (searchEntry.player.inputInfluence === "blocked") {
    return exhausted("input-blocked", best.firstUnmetPredicateId, statistics, best);
  }

  const frontier: CandidatePath[] = [{
    requests: [],
    candidateRanks: [],
    prefixDecisions: [],
    estimatedDistance: manhattanDistance(searchEntry.player.coordinate, targetCoordinate),
    enqueueOrder: 0,
  }];
  let nextEnqueueOrder = 1;
  let sawTickLimit = false;
  let sawTerminal = false;
  let sawBlocked = false;
  while (frontier.length > 0) {
    frontier.sort(compareCandidatePath);
    const parent = frontier.shift()!;
    let parentObservation = searchEntry;
    let parentDecisions: readonly StandardTacticDecisionV1[] = [];
    if (parent.requests.length > 0) {
      if (statistics.attemptedBranches >= bounds.maximumCandidateBranches) {
        return exhausted("branch-budget", best.firstUnmetPredicateId, statistics, best);
      }
      if (statistics.advanceCalls + parent.requests.length > bounds.maximumAdvanceCalls) {
        return exhausted("work-budget", best.firstUnmetPredicateId, statistics, best);
      }
      statistics.attemptedBranches += 1;
      statistics.advanceCalls += parent.requests.length;
      const evaluated = await evaluatePath(
        runtime,
        checkpoint,
        searchEntry,
        normalized.contract,
        parent,
      );
      parentObservation = evaluated.observation;
      parentDecisions = evaluated.decisions;
      const candidateBest: BestBoundary = {
        observation: parentObservation,
        distance: manhattanDistance(parentObservation.player.coordinate, targetCoordinate),
        firstUnmetPredicateId: evaluated.firstFailedInvariant?.predicateId
          ?? firstUnmetAt(normalized.contract, contractEntry, parentObservation),
      };
      if (isBetterBest(candidateBest, best)) best = candidateBest;
      if (evaluated.firstFailedInvariant !== null) continue;
      if (evaluated.terminalBeforeStop) {
        sawTerminal = true;
        continue;
      }
      const verdict = contractAtEnd(normalized.contract, contractEntry, parentObservation);
      if (verdict.passed) {
        const selectedDecisions = parentDecisions.map((decision, index) => (
          index === parentDecisions.length - 1
            ? { ...decision, result: "stop-satisfied" as const }
            : decision
        ));
        return canonicalCopy({
          status: "succeeded",
          witness: {
            witnessVersion: 1,
            target: normalized.tactic.target,
            tacticId: normalized.tactic.tacticId,
            entryObservation: contractEntry,
            exitObservation: parentObservation,
            entryExactFingerprint: contractEntry.fingerprints.exact,
            exitExactFingerprint: parentObservation.fingerprints.exact,
            entryNativeTick: contractEntry.boundary.nativeTick,
            exitNativeTick: parentObservation.boundary.nativeTick,
            selectedDecisions,
            contractValidation: verdict.validation,
            statistics: {
              ...statistics,
              selectedTicks: parent.requests.length,
            },
          },
        });
      }
    }

    if (parent.requests.length >= bounds.maximumTicksPerBranch) {
      sawTickLimit = true;
      continue;
    }
    if (parentObservation.terminal.kind !== "running") {
      sawTerminal = true;
      continue;
    }
    const stopAlreadySatisfied = evaluateObservationPredicate(
      normalized.contract.stop,
      parentObservation,
    ).passed;
    const inputs = candidateInputs(
      parentObservation,
      targetCoordinate,
      normalized.tactic.intent.kind === "wait-until" || stopAlreadySatisfied,
    );
    if (inputs.length === 0) {
      sawBlocked = true;
      continue;
    }
    if (frontier.length + inputs.length > bounds.maximumFrontierEntries) {
      return exhausted("frontier-budget", best.firstUnmetPredicateId, statistics, best);
    }
    const decisionOrder = input.decisionOrderOffset + parent.requests.length;
    inputs.forEach((inputCode, candidateRank) => {
      frontier.push({
        requests: [...parent.requests, manualRequest(normalized.tactic, decisionOrder, inputCode)],
        candidateRanks: [...parent.candidateRanks, candidateRank],
        prefixDecisions: parentDecisions,
        estimatedDistance: estimatedDistanceAfterInput(
          parentObservation,
          targetCoordinate,
          inputCode,
        ),
        enqueueOrder: nextEnqueueOrder,
      });
      nextEnqueueOrder += 1;
    });
    statistics.frontierPeak = Math.max(statistics.frontierPeak, frontier.length);
  }

  const code: StandardTacticExhaustionCodeV1 = sawTerminal
    ? "terminal-before-stop"
    : sawBlocked
      ? "input-blocked"
      : sawTickLimit
        ? "tick-budget"
        : "frontier-empty";
  return exhausted(code, best?.firstUnmetPredicateId ?? null, statistics, best);
}

function assertRuntimeEntry(
  observation: SolverObservation,
  normalized: NormalizedTactic,
): void {
  if (observation.target !== normalized.tactic.target) {
    invalidInput("entry run target does not match the tactic target");
  }
  if (observation.mode !== "manual") {
    invalidInput("standard tactics require a manual runtime run");
  }
}

export async function evaluateStandardTactic<TManualSource, TReplaySource>(
  input: EvaluateStandardTacticInputV1<TManualSource, TReplaySource>,
): Promise<StandardTacticEvaluationV1> {
  const normalized = normalizeTactic(input.tactic);
  const entry = await input.runtime.observe(input.entryRun);
  assertRuntimeEntry(entry, normalized);
  const bounds = normalizeBounds(input.bounds, normalized.contract);
  const targetCoordinate = validateIntentAtEntry(normalized.tactic, normalized.contract, entry);
  const checkpoint = await input.runtime.captureCheckpoint(input.entryRun);
  try {
    return await searchFromCheckpoint({
      runtime: input.runtime,
      checkpoint: checkpoint.handle,
      searchEntry: entry,
      contractEntry: entry,
      normalized,
      bounds,
      targetCoordinate,
      decisionOrderOffset: 0,
      skipContractRequires: false,
    });
  } finally {
    await input.runtime.disposeCheckpoint(checkpoint.handle);
  }
}

interface FixedSequenceEvaluation {
  readonly satisfied: boolean;
  readonly firstUnmetPredicateId: StableIdV1 | null;
  readonly exitObservation: SolverObservation;
  readonly decisionBoundaries: readonly Omit<StandardTacticDecisionV1, "candidateRank" | "result">[];
}

async function evaluateFixedSequence<TManualSource, TReplaySource>(
  runtime: SolverRuntimePort<TManualSource, TReplaySource>,
  checkpoint: SolverCheckpointHandle,
  entry: SolverObservation,
  contract: SubgoalContractV1,
  requests: readonly StandardTacticAdvanceRequestV1[],
): Promise<FixedSequenceEvaluation> {
  const run = await runtime.restoreCheckpoint(checkpoint);
  try {
    let observation = await runtime.observe(run);
    if (observation.fingerprints.exact !== entry.fingerprints.exact) {
      throw new StandardTacticError("tactic.runtime-drift", "fixed sequence restore drifted");
    }
    const decisions: Array<Omit<StandardTacticDecisionV1, "candidateRank" | "result">> = [];
    let failed: StableIdV1 | null = null;
    for (let index = 0; index < requests.length; index += 1) {
      const before = observation;
      const request = requests[index]!;
      await runtime.advanceTick(run, request);
      observation = await runtime.observe(run);
      decisions.push({
        decisionOrder: index,
        request: canonicalCopy(request),
        entry: boundary(before),
        exit: boundary(observation),
      });
      failed = firstFailed(evaluateObservationPredicates(contract.invariants, observation))?.predicateId
        ?? null;
      if (failed !== null) break;
      const stop = evaluateObservationPredicate(contract.stop, observation);
      if (observation.terminal.kind !== "running" && !stop.passed) {
        failed = stop.predicateId;
        break;
      }
      const intermediateVerdict = contractAtEnd(contract, entry, observation);
      if (intermediateVerdict.passed) {
        return {
          satisfied: true,
          firstUnmetPredicateId: null,
          exitObservation: canonicalCopy(observation),
          decisionBoundaries: canonicalCopy(decisions),
        };
      }
    }
    const verdict = contractAtEnd(contract, entry, observation);
    return {
      satisfied: failed === null && verdict.passed,
      firstUnmetPredicateId: failed ?? firstUnmetAt(contract, entry, observation),
      exitObservation: canonicalCopy(observation),
      decisionBoundaries: canonicalCopy(decisions),
    };
  } finally {
    await runtime.disposeRun(run);
  }
}

function assertOriginalWitness(
  witness: StandardTacticWitnessV1,
  tactic: StandardTacticV1,
  contract: SubgoalContractV1,
  entry: SolverObservation,
): void {
  if (
    witness.witnessVersion !== 1
    || witness.target !== tactic.target
    || witness.tacticId !== tactic.tacticId
    || witness.entryExactFingerprint !== entry.fingerprints.exact
    || witness.entryNativeTick !== entry.boundary.nativeTick
    || !canonicalEqual(witness.entryObservation, entry)
  ) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "original witness does not bind the supplied tactic entry",
    );
  }
  if (
    witness.exitExactFingerprint !== witness.exitObservation.fingerprints.exact
    || witness.exitNativeTick !== witness.exitObservation.boundary.nativeTick
    || witness.selectedDecisions.length < 2
  ) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "suffix repair requires a successful witness with a nonempty retainable prefix",
    );
  }
  const validation = contractAtEnd(contract, entry, witness.exitObservation);
  if (!validation.passed || !canonicalEqual(validation.validation, witness.contractValidation)) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "original witness does not carry a successful exact contract validation",
    );
  }
  let expectedBoundary = boundary(entry);
  witness.selectedDecisions.forEach((decision, index) => {
    assertStandardRequest(decision.request, tactic, index, `original decision ${index}`);
    if (
      decision.decisionOrder !== index
      || !Number.isSafeInteger(decision.candidateRank)
      || decision.candidateRank < 0
      || !canonicalEqual(decision.entry, expectedBoundary)
      || (index === witness.selectedDecisions.length - 1
        ? decision.result !== "stop-satisfied"
        : decision.result !== "continue")
    ) {
      throw new StandardTacticError(
        "tactic.invalid-repair",
        `original decision ${index} is not a contiguous successful witness decision`,
      );
    }
    expectedBoundary = decision.exit;
  });
  if (!canonicalEqual(expectedBoundary, boundary(witness.exitObservation))) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "original witness decision chain does not bind its exit boundary",
    );
  }
}

export async function repairStandardTacticSuffix<TManualSource, TReplaySource>(
  input: RepairStandardTacticSuffixInputV1<TManualSource, TReplaySource>,
): Promise<StandardTacticSuffixRepairV1> {
  const normalized = normalizeTactic(input.tactic);
  const entry = await input.runtime.observe(input.entryRun);
  assertRuntimeEntry(entry, normalized);
  const bounds = normalizeBounds(input.bounds, normalized.contract);
  const targetCoordinate = validateIntentAtEntry(normalized.tactic, normalized.contract, entry);
  assertOriginalWitness(input.originalWitness, normalized.tactic, normalized.contract, entry);
  const injection = input.injectedDecisionOrder;
  if (
    !Number.isSafeInteger(injection)
    || injection <= 0
    || injection >= input.originalWitness.selectedDecisions.length
    || injection >= input.injectedDecisions.length
  ) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "injectedDecisionOrder must select an existing decision after a nonempty retained prefix",
    );
  }
  if (input.injectedDecisions.length !== input.originalWitness.selectedDecisions.length) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "injected decision sequence must be complete and match the original witness length",
    );
  }
  if (input.injectedDecisions.length > bounds.maximumTicksPerBranch) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "injected decision sequence exceeds maximumTicksPerBranch",
    );
  }
  input.injectedDecisions.forEach((request, index) => {
    assertStandardRequest(request, normalized.tactic, index, `injected decision ${index}`);
    const matchesOriginal = canonicalEqual(
      request,
      input.originalWitness.selectedDecisions[index]?.request,
    );
    if (index === injection ? matchesOriginal : !matchesOriginal) {
      throw new StandardTacticError(
        "tactic.invalid-repair",
        index === injection
          ? "injected decision must differ from the original compiled decision"
          : "injected sequence may change only injectedDecisionOrder",
      );
    }
  });
  const preparationAdvances = input.originalWitness.selectedDecisions.length
    + input.injectedDecisions.length
    + injection;
  if (preparationAdvances >= bounds.maximumAdvanceCalls) {
    throw new StandardTacticError(
      "tactic.invalid-repair",
      "repair preparation consumes the entire advance-call budget",
    );
  }

  let rootCheckpoint: SolverCheckpointHandle | null = null;
  let prefixCheckpoint: SolverCheckpointHandle | null = null;
  let prefixRun: SolverRunHandle | null = null;
  try {
    rootCheckpoint = (await input.runtime.captureCheckpoint(input.entryRun)).handle;
    const original = await evaluateFixedSequence(
      input.runtime,
      rootCheckpoint,
      entry,
      normalized.contract,
      input.originalWitness.selectedDecisions.map(({ request }) => request),
    );
    const expectedOriginalBoundaries = input.originalWitness.selectedDecisions.map((decision) => ({
      decisionOrder: decision.decisionOrder,
      request: decision.request,
      entry: decision.entry,
      exit: decision.exit,
    }));
    if (
      !original.satisfied
      || !canonicalEqual(original.exitObservation, input.originalWitness.exitObservation)
      || !canonicalEqual(original.decisionBoundaries, expectedOriginalBoundaries)
    ) {
      throw new StandardTacticError(
        "tactic.invalid-repair",
        "original witness did not replay as the exact successful contract witness",
      );
    }
    const injected = await evaluateFixedSequence(
      input.runtime,
      rootCheckpoint,
      entry,
      normalized.contract,
      input.injectedDecisions,
    );
    if (injected.satisfied) {
      throw new StandardTacticError(
        "tactic.invalid-repair",
        "injected sequence still satisfies the tactic contract",
      );
    }
    const injectedFailure: StandardInjectedSequenceFailureV1 = canonicalCopy({
      status: "failed",
      firstUnmetPredicateId: injected.firstUnmetPredicateId,
      exitObservation: injected.exitObservation,
      decisionBoundaries: injected.decisionBoundaries,
    });

    prefixRun = await input.runtime.restoreCheckpoint(rootCheckpoint);
    for (let index = 0; index < injection; index += 1) {
      const expected = input.originalWitness.selectedDecisions[index]!;
      const before = await input.runtime.observe(prefixRun);
      if (
        before.boundary.nativeTick !== expected.entry.nativeTick
        || before.fingerprints.exact !== expected.entry.exactFingerprint
      ) {
        throw new StandardTacticError("tactic.runtime-drift", "retained prefix entry drifted");
      }
      await input.runtime.advanceTick(prefixRun, expected.request);
      const after = await input.runtime.observe(prefixRun);
      if (
        after.boundary.nativeTick !== expected.exit.nativeTick
        || after.fingerprints.exact !== expected.exit.exactFingerprint
      ) {
        throw new StandardTacticError("tactic.runtime-drift", "retained prefix exit drifted");
      }
    }
    const prefixEntry = await input.runtime.observe(prefixRun);
    await input.runtime.disposeCheckpoint(rootCheckpoint);
    rootCheckpoint = null;
    prefixCheckpoint = (await input.runtime.captureCheckpoint(prefixRun)).handle;
    await input.runtime.disposeRun(prefixRun);
    prefixRun = null;

    const remainingBounds: StandardTacticBoundsV1 = {
      ...bounds,
      maximumTicksPerBranch: bounds.maximumTicksPerBranch - injection,
    };
    if (remainingBounds.maximumTicksPerBranch <= 0) {
      return canonicalCopy({
        status: "exhausted",
        join: "replanned-join",
        injectedDecisionOrder: injection,
        injectedFailure,
        retainedPrefix: input.originalWitness.selectedDecisions.slice(0, injection),
        replacedSuffix: input.injectedDecisions.slice(injection),
        diagnostic: {
          code: "tick-budget",
          firstUnmetPredicateId: firstUnmetAt(normalized.contract, entry, prefixEntry),
          attemptedBranches: 0,
          advanceCalls: preparationAdvances,
          frontierPeak: 1,
          best: {
            nativeTick: prefixEntry.boundary.nativeTick,
            exactFingerprint: prefixEntry.fingerprints.exact,
            distance: manhattanDistance(prefixEntry.player.coordinate, targetCoordinate),
          },
        },
      });
    }
    const repaired = await searchFromCheckpoint({
      runtime: input.runtime,
      checkpoint: prefixCheckpoint,
      searchEntry: prefixEntry,
      contractEntry: entry,
      normalized,
      bounds: remainingBounds,
      targetCoordinate,
      decisionOrderOffset: injection,
      skipContractRequires: true,
      initialAdvanceCalls: preparationAdvances,
    });
    const retainedPrefix = input.originalWitness.selectedDecisions.slice(0, injection);
    const replacedSuffix = input.injectedDecisions.slice(injection);
    if (repaired.status === "exhausted") {
      return canonicalCopy({
        status: "exhausted",
        join: "replanned-join",
        injectedDecisionOrder: injection,
        injectedFailure,
        retainedPrefix,
        replacedSuffix,
        diagnostic: repaired.diagnostic,
      });
    }
    const repairedSuffix = repaired.witness.selectedDecisions;
    const selectedDecisions = [...retainedPrefix, ...repairedSuffix];
    const witness: StandardTacticWitnessV1 = canonicalCopy({
      ...repaired.witness,
      selectedDecisions,
      statistics: {
        ...repaired.witness.statistics,
        selectedTicks: selectedDecisions.length,
      },
    });
    return canonicalCopy({
      status: "repaired",
      join: "replanned-join",
      injectedDecisionOrder: injection,
      injectedFailure,
      retainedPrefix,
      replacedSuffix,
      repairedSuffix,
      compiledDecisions: selectedDecisions.map(({ request }) => request),
      witness,
    });
  } finally {
    if (prefixRun !== null) await input.runtime.disposeRun(prefixRun);
    if (prefixCheckpoint !== null) await input.runtime.disposeCheckpoint(prefixCheckpoint);
    if (rootCheckpoint !== null) await input.runtime.disposeCheckpoint(rootCheckpoint);
  }
}
