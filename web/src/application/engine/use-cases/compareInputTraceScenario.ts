import type { InputTraceScenario } from "@application/contracts/scenario";
import type { TraceMismatch } from "@application/engine/comparators/traceComparison";
import type { GameEnginePort } from "@application/ports/GameEngine";
import type { TraceOracle } from "@application/ports/TraceOracle";
import type { GameTrace } from "@domain/game/types";
import { collectTraceMismatches } from "@application/engine/comparators/traceComparison";

export interface InputTraceComparison {
  scenario: InputTraceScenario;
  expected: GameTrace;
  actual: GameTrace;
  mismatches: TraceMismatch[];
}

export type { TraceMismatch };

export async function compareInputTraceScenario(
  candidate: Pick<GameEnginePort, "runInputTrace">,
  oracle: Pick<TraceOracle, "runInputTrace">,
  scenario: InputTraceScenario,
): Promise<InputTraceComparison> {
  const [actual, expected] = await Promise.all([
    candidate.runInputTrace(scenario.request, scenario.commands, scenario.maxTicks),
    oracle.runInputTrace(scenario.request, scenario.commands, scenario.maxTicks),
  ]);

  const mismatches: TraceMismatch[] = [];
  collectTraceMismatches(actual, expected, "$", mismatches, 25);

  return {
    scenario,
    expected,
    actual,
    mismatches,
  };
}
