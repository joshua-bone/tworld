import type { GameDebugTrace } from "@domain/game/debug";
import type { TraceMismatch } from "@application/engine/comparators/traceComparison";
import { collectTraceMismatches } from "@application/engine/comparators/traceComparison";

export interface DebugTraceMismatch extends TraceMismatch {
  stepIndex: number | null;
  phaseName: string | null;
}

function toDebugMismatch(
  mismatch: TraceMismatch,
  expected: Pick<GameDebugTrace, "steps">,
): DebugTraceMismatch {
  if (mismatch.path.startsWith("$.initialDebugState")) {
    return {
      ...mismatch,
      stepIndex: null,
      phaseName: "initial",
    };
  }

  const match = mismatch.path.match(/^\$\.steps\[(\d+)\]\.phases\[(\d+)\]/);
  if (!match) {
    return {
      ...mismatch,
      stepIndex: null,
      phaseName: null,
    };
  }

  const stepIndex = Number.parseInt(match[1]!, 10);
  const phaseIndex = Number.parseInt(match[2]!, 10);
  return {
    ...mismatch,
    stepIndex,
    phaseName: expected.steps[stepIndex]?.phases[phaseIndex]?.phase ?? null,
  };
}

function comparePhaseArrays(
  actual: GameDebugTrace["steps"][number]["phases"],
  expected: GameDebugTrace["steps"][number]["phases"],
  path: string,
  mismatches: TraceMismatch[],
  limit: number,
): void {
  const sharedLength = Math.min(actual.length, expected.length);

  for (let index = 0; index < sharedLength; index += 1) {
    collectTraceMismatches(actual[index], expected[index], `${path}[${index}]`, mismatches, limit);
    if (mismatches.length >= limit) {
      return;
    }
  }

  if (actual.length !== expected.length) {
    mismatches.push({
      path: `${path}.length`,
      expected: expected.length,
      actual: actual.length,
    });
  }
}

export function collectDebugTraceMismatches(
  actual: GameDebugTrace,
  expected: GameDebugTrace,
  limit = 25,
): DebugTraceMismatch[] {
  const raw: TraceMismatch[] = [];
  collectTraceMismatches(actual.request, expected.request, "$.request", raw, limit);
  collectTraceMismatches(actual.initialState, expected.initialState, "$.initialState", raw, limit);
  collectTraceMismatches(actual.initialDebugState, expected.initialDebugState, "$.initialDebugState", raw, limit);

  const sharedLength = Math.min(actual.steps.length, expected.steps.length);
  for (let index = 0; index < sharedLength && raw.length < limit; index += 1) {
    comparePhaseArrays(actual.steps[index]!.phases, expected.steps[index]!.phases, `$.steps[${index}].phases`, raw, limit);
    if (raw.length >= limit) {
      break;
    }

    const { phases: actualPhases, ...actualStep } = actual.steps[index]!;
    const { phases: expectedPhases, ...expectedStep } = expected.steps[index]!;
    void actualPhases;
    void expectedPhases;
    collectTraceMismatches(actualStep, expectedStep, `$.steps[${index}]`, raw, limit);
  }

  if (raw.length < limit && actual.steps.length !== expected.steps.length) {
    raw.push({
      path: "$.steps.length",
      expected: expected.steps.length,
      actual: actual.steps.length,
    });
  }

  if (raw.length < limit) {
    collectTraceMismatches(actual.result, expected.result, "$.result", raw, limit);
  }

  return raw.map((mismatch) => toDebugMismatch(mismatch, expected));
}
