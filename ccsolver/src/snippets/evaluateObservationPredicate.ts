import type { SolverObservation } from "../domain/runtime/types.js";
import {
  ContextualWitnessExecutorError,
  type CountComparisonV1,
  type ObservationPredicateVerdictV1,
  type SubgoalObservationPredicateV1,
} from "./model.js";
import { canonicalCopy, canonicalEqual } from "./support.js";

function resourceCount(
  values: readonly { readonly resourceType: string; readonly count: number }[],
  resourceType: string,
): number {
  return values.reduce((total, value) => (
    value.resourceType === resourceType ? total + value.count : total
  ), 0);
}

function compareCount(actual: number, comparison: CountComparisonV1, expected: number): boolean {
  switch (comparison) {
    case "equals": return actual === expected;
    case "at-least": return actual >= expected;
    case "at-most": return actual <= expected;
  }
}

export function evaluateObservationPredicate(
  predicate: SubgoalObservationPredicateV1,
  observation: SolverObservation,
): ObservationPredicateVerdictV1 {
  switch (predicate.kind) {
    case "player-coordinate": {
      const actual = observation.player.coordinate;
      return {
        predicateId: predicate.predicateId,
        passed: canonicalEqual(actual, predicate.coordinate),
        actual: canonicalCopy(actual),
      };
    }
    case "inventory-count": {
      const actual = resourceCount(observation.inventory, predicate.resourceType);
      return {
        predicateId: predicate.predicateId,
        passed: compareCount(actual, predicate.comparison, predicate.count),
        actual,
      };
    }
    case "remaining-requirement-count": {
      const actual = resourceCount(observation.remainingRequirements, predicate.resourceType);
      return {
        predicateId: predicate.predicateId,
        passed: compareCount(actual, predicate.comparison, predicate.count),
        actual,
      };
    }
    case "placement-presence": {
      const actual = observation.cells.some((cell) => cell.elements.some((element) => (
        element.identity.kind === "placement"
        && element.identity.placementId === predicate.placementId
      )));
      return {
        predicateId: predicate.predicateId,
        passed: actual === predicate.present,
        actual,
      };
    }
    case "actor-state": {
      const actor = observation.player.actorId === predicate.actorId
        ? observation.player
        : observation.actors.find(({ actorId }) => actorId === predicate.actorId);
      const actual = actor === undefined ? null : actor[predicate.property];
      return {
        predicateId: predicate.predicateId,
        passed: actor !== undefined && canonicalEqual(actual, predicate.value),
        actual: canonicalCopy(actual),
      };
    }
    case "device-state": {
      const actual = observation.devices.find(({ placementId }) => (
        placementId === predicate.placementId
      ))?.state ?? null;
      return {
        predicateId: predicate.predicateId,
        passed: actual === predicate.state,
        actual,
      };
    }
    case "terminal-state": {
      const terminal = observation.terminal;
      let passed = terminal.kind === predicate.terminalKind;
      if (passed && terminal.kind === "won" && predicate.terminalKind === "won") {
        passed = terminal.exitPlacementId === predicate.exitPlacementId;
      }
      if (passed && terminal.kind === "lost" && predicate.terminalKind === "lost") {
        passed = terminal.cause === predicate.cause;
      }
      const actual = terminal.kind === "won"
        ? `${terminal.kind}:${terminal.exitPlacementId ?? "null"}`
        : terminal.kind === "lost"
          ? `${terminal.kind}:${terminal.cause}`
          : terminal.kind;
      return { predicateId: predicate.predicateId, passed, actual };
    }
    case "native-state-fingerprint": {
      const actual = observation.randomness.nativeStateFingerprints.find(({ stateId }) => (
        stateId === predicate.stateId
      ))?.fingerprint ?? null;
      return {
        predicateId: predicate.predicateId,
        passed: actual === predicate.fingerprint,
        actual,
      };
    }
    default:
      throw new ContextualWitnessExecutorError(
        "witness.invalid-contract",
        "the subgoal contract contains an unknown observation predicate",
      );
  }
}

export function evaluateObservationPredicates(
  predicates: readonly SubgoalObservationPredicateV1[],
  observation: SolverObservation,
): readonly ObservationPredicateVerdictV1[] {
  return predicates.map((predicate) => evaluateObservationPredicate(predicate, observation));
}
