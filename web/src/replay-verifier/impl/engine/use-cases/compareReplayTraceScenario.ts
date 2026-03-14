import type { ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import type { TraceMismatch } from "@replay-verifier/impl/engine/comparators/traceComparison";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { TraceOracle } from "@replay-verifier/ports/TraceOracle";
import type { GameTrace } from "@game-core/api/types";
import { collectTraceMismatches } from "@replay-verifier/impl/engine/comparators/traceComparison";

export interface ReplayTraceComparison {
  scenario: ReplayTraceScenario;
  expected: GameTrace;
  actual: GameTrace;
  mismatches: TraceMismatch[];
}

export async function compareReplayTraceScenario(
  candidate: Pick<GameEnginePort, "runReplayTrace">,
  oracle: Pick<TraceOracle, "runReplayTrace">,
  scenario: ReplayTraceScenario,
): Promise<ReplayTraceComparison> {
  const [actual, expected] = await Promise.all([
    candidate.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks),
    oracle.runReplayTrace(scenario.request, scenario.replay, scenario.maxTicks),
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
