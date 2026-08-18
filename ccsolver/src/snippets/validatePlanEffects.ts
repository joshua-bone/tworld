import type { SolverObservation } from "../domain/runtime/types.js";
import type {
  ExpandedPlanStepV1,
  PlanningStateAxisV1,
} from "../plan/model.js";
import type { ContextualPlanEffectVerdictV1 } from "./model.js";
import { canonicalCopy, compareText } from "./support.js";

type ResourceValues = SolverObservation["inventory"] | SolverObservation["remainingRequirements"];

function effectKey(axis: PlanningStateAxisV1, resourceType: string): string {
  return `${axis}\u0000${resourceType}`;
}

function splitEffectKey(key: string): {
  readonly axis: PlanningStateAxisV1;
  readonly resourceType: string;
} {
  const separator = key.indexOf("\u0000");
  return {
    axis: key.slice(0, separator) as PlanningStateAxisV1,
    resourceType: key.slice(separator + 1),
  };
}

function counts(values: ResourceValues): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    result.set(value.resourceType, (result.get(value.resourceType) ?? 0) + value.count);
  }
  return result;
}

function observedDeltas(
  entry: SolverObservation,
  end: SolverObservation,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const [axis, beforeValues, afterValues] of [
    ["inventory", entry.inventory, end.inventory],
    ["remaining-requirement", entry.remainingRequirements, end.remainingRequirements],
  ] as const) {
    const before = counts(beforeValues);
    const after = counts(afterValues);
    for (const resourceType of new Set([...before.keys(), ...after.keys()])) {
      const delta = (after.get(resourceType) ?? 0) - (before.get(resourceType) ?? 0);
      if (delta !== 0) result.set(effectKey(axis, resourceType), delta);
    }
  }
  return result;
}

/**
 * Compares only P3A's explicit resource axes. Reachability, device behavior,
 * and other non-resource claims remain under the authored contract.
 */
export function validatePlanEffects(
  planIntent: readonly ExpandedPlanStepV1[],
  entry: SolverObservation,
  end: SolverObservation,
): readonly ContextualPlanEffectVerdictV1[] {
  const expected = new Map<string, number>();
  for (const step of planIntent) {
    for (const effect of step.stateEffects) {
      const key = effectKey(effect.axis, effect.resourceType);
      expected.set(key, (expected.get(key) ?? 0) + effect.delta);
    }
  }
  const observed = observedDeltas(entry, end);
  const keys = [...new Set([...expected.keys(), ...observed.keys()])]
    .sort((left, right) => {
      const leftEffect = splitEffectKey(left);
      const rightEffect = splitEffectKey(right);
      const axisOrder = leftEffect.axis === rightEffect.axis
        ? 0
        : leftEffect.axis === "inventory" ? -1 : 1;
      return axisOrder || compareText(leftEffect.resourceType, rightEffect.resourceType);
    });
  return canonicalCopy(keys.map((key) => {
    const { axis, resourceType } = splitEffectKey(key);
    const expectedDelta = expected.get(key) ?? 0;
    const observedDelta = observed.get(key) ?? 0;
    return {
      axis,
      resourceType,
      expectedDelta,
      observedDelta,
      passed: expectedDelta === observedDelta,
    };
  }));
}
