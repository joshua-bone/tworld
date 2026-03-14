export interface TraceMismatch {
  path: string;
  expected: unknown;
  actual: unknown;
}

const ROOT_TRACE_KEY_PRIORITY: Record<string, number> = {
  request: 0,
  initialState: 1,
  scheduledInputs: 2,
  steps: 3,
  result: 4,
};

function compareObjectKeys(path: string, left: string, right: string): number {
  if (path === "$") {
    const leftPriority = ROOT_TRACE_KEY_PRIORITY[left] ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = ROOT_TRACE_KEY_PRIORITY[right] ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
  }

  return left.localeCompare(right);
}

export function collectTraceMismatches(
  actual: unknown,
  expected: unknown,
  path: string,
  mismatches: TraceMismatch[],
  limit: number,
): void {
  if (mismatches.length >= limit) {
    return;
  }

  if (Array.isArray(actual) && Array.isArray(expected)) {
    const sharedLength = Math.min(actual.length, expected.length);

    for (let index = 0; index < sharedLength; index += 1) {
      collectTraceMismatches(actual[index], expected[index], `${path}[${index}]`, mismatches, limit);
      if (mismatches.length >= limit) {
        return;
      }
    }

    if (actual.length !== expected.length) {
      mismatches.push({ path: `${path}.length`, expected: expected.length, actual: actual.length });
    }
    return;
  }

  if (actual && expected && typeof actual === "object" && typeof expected === "object") {
    const actualEntries = actual as Record<string, unknown>;
    const expectedEntries = expected as Record<string, unknown>;
    const keys = Array.from(new Set([...Object.keys(actualEntries), ...Object.keys(expectedEntries)])).sort((left, right) =>
      compareObjectKeys(path, left, right),
    );

    for (const key of keys) {
      if (!(key in actualEntries) || !(key in expectedEntries)) {
        mismatches.push({
          path: `${path}.${key}`,
          expected: expectedEntries[key],
          actual: actualEntries[key],
        });
        if (mismatches.length >= limit) {
          return;
        }
        continue;
      }

      collectTraceMismatches(actualEntries[key], expectedEntries[key], `${path}.${key}`, mismatches, limit);
      if (mismatches.length >= limit) {
        return;
      }
    }
    return;
  }

  if (actual !== expected) {
    mismatches.push({ path, expected, actual });
  }
}
