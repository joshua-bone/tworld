import type { ReplayTraceScenario } from "@application/contracts/scenario";
import type { TraceMismatch } from "@application/engine/comparators/traceComparison";
import type { GameEnginePort } from "@application/ports/GameEngine";
import type { TraceOracle } from "@application/ports/TraceOracle";
import type { GameTrace } from "@domain/game/types";
import { collectTraceMismatches } from "@application/engine/comparators/traceComparison";

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
