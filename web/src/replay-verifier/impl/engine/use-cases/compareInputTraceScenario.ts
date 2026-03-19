import type { InputTraceScenario } from "@replay-verifier/impl/scenario";
import type { TraceMismatch } from "@replay-verifier/impl/engine/comparators/traceComparison";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { TraceOracle } from "@replay-verifier/ports/TraceOracle";
import type { GameTrace } from "@game-core/api/types";
import { collectTraceMismatches } from "@replay-verifier/impl/engine/comparators/traceComparison";

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
