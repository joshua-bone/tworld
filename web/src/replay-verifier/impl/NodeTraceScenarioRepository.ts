import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReplayTraceSpec, TraceSpec } from "@oracle-fixtures/impl/contracts/characterizationContract";
import { mapReplayTraceSpecToScenario, mapTraceSpecToInputTraceScenario } from "@replay-verifier/impl/traceScenario";
import type { TraceScenarioRepository } from "@replay-verifier/ports/TraceScenarioRepository";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultTraceSpecPath = resolve(currentDir, "../../../../scripts/characterization_trace_specs.json");
const defaultReplayTraceSpecPath = resolve(currentDir, "../../../../scripts/characterization_replay_specs.json");

export class NodeTraceScenarioRepository implements TraceScenarioRepository {
  constructor(
    private readonly traceSpecPath = defaultTraceSpecPath,
    private readonly replayTraceSpecPath = defaultReplayTraceSpecPath,
  ) {}

  async loadInputTraceScenarios() {
    const payload = JSON.parse(await readFile(this.traceSpecPath, "utf-8")) as TraceSpec[];
    return payload.map(mapTraceSpecToInputTraceScenario);
  }

  async loadReplayTraceScenarios() {
    const payload = JSON.parse(await readFile(this.replayTraceSpecPath, "utf-8")) as ReplayTraceSpec[];
    return payload.map(mapReplayTraceSpecToScenario);
  }
}
