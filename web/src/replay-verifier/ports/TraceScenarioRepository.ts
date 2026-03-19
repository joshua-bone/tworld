import type { InputTraceScenario, ReplayTraceScenario } from "@replay-verifier/impl/scenario";

export interface TraceScenarioRepository {
  loadInputTraceScenarios(): Promise<InputTraceScenario[]>;
  loadReplayTraceScenarios(): Promise<ReplayTraceScenario[]>;
}
