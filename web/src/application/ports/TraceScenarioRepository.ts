import type { InputTraceScenario, ReplayTraceScenario } from "@application/contracts/scenario";

export interface TraceScenarioRepository {
  loadInputTraceScenarios(): Promise<InputTraceScenario[]>;
  loadReplayTraceScenarios(): Promise<ReplayTraceScenario[]>;
}
