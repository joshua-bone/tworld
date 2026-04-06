import { interactivePerfBaseline } from "../impl/interactivePerfBaseline";
import { evaluateInteractivePerfGuard } from "../impl/interactivePerfGuard";
import { interactiveLoadPerfBaseline } from "../impl/interactiveLoadPerfBaseline";
import { evaluateInteractiveLoadPerfGuard } from "../impl/interactiveLoadPerfGuard";
import {
  benchmarkInteractiveLoadPerfScenarios,
  type InteractiveLoadPerfScenarioBenchmark,
} from "../impl/interactiveLoadPerfHarness";
import {
  benchmarkInteractivePerfScenarios,
  type InteractivePerfScenarioBenchmark,
} from "../impl/interactivePerfHarness";
import {
  interactivePerfScenarioById,
  interactivePerfScenarios,
} from "../impl/interactivePerfScenarios";

interface CliOptions {
  guard: boolean;
  json: boolean;
  scenarioIds: string[] | null;
}

function parseOptions(argv: readonly string[]): CliOptions {
  const scenarioIds = argv
    .filter((value) => value.startsWith("--scenario="))
    .flatMap((value) => value.slice("--scenario=".length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    guard: argv.includes("--guard"),
    json: argv.includes("--json"),
    scenarioIds: scenarioIds.length > 0 ? scenarioIds : null,
  };
}

function resolveScenarios(ids: string[] | null) {
  if (!ids) {
    return interactivePerfScenarios;
  }

  return ids.map((id) => {
    const scenario = interactivePerfScenarioById(id);
    if (!scenario) {
      throw new Error(`Unknown perf scenario: ${id}`);
    }
    return scenario;
  });
}

function formatMs(value: number): string {
  return value.toFixed(2).padStart(8, " ");
}

function formatHz(value: number): string {
  return value.toFixed(1).padStart(7, " ");
}

function formatBytes(value: number): string {
  return Math.round(value).toString().padStart(8, " ");
}

function printInteractiveTable(results: readonly InteractivePerfScenarioBenchmark[]): void {
  console.log("Scenario           raw ms   tick ms update ms clone ms  payload B      Hz layers ticks");
  for (const result of results) {
    const label = result.label.padEnd(16, " ");
    const layers = String(result.start.visibleLayerCount).padStart(6, " ");
    const ticks = String(result.measuredTicks).padStart(5, " ");
    console.log(
      `${label} ${formatMs(result.rawTickMs.median)} ${formatMs(result.interactiveTickMs.median)} ${formatMs(result.workerUpdateMs.median)} ${formatMs(result.cloneMs.median)} ${formatBytes(result.payloadBytes.median)} ${formatHz(result.steadyStateHz)} ${layers} ${ticks}`,
    );
  }
}

function printLoadTable(results: readonly InteractiveLoadPerfScenarioBenchmark[]): void {
  console.log("");
  console.log("Scenario          cold ms  warm ms cold load warm load cold prep warm prep cold proj warm proj");
  for (const result of results) {
    const label = result.label.padEnd(16, " ");
    console.log(
      `${label} ${formatMs(result.coldStartMs.median)} ${formatMs(result.warmStartMs.median)} ${formatMs(result.coldLevelLoadMs.median)} ${formatMs(result.warmLevelLoadMs.median)} ${formatMs(result.coldPrepareLevelMs.median)} ${formatMs(result.warmPrepareLevelMs.median)} ${formatMs(result.coldInitialProjectionMs.median)} ${formatMs(result.warmInitialProjectionMs.median)}`,
    );
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const scenarios = resolveScenarios(options.scenarioIds);
  const interactiveResults = await benchmarkInteractivePerfScenarios(scenarios);
  const loadResults = await benchmarkInteractiveLoadPerfScenarios(scenarios);
  const interactiveViolations = options.guard ? evaluateInteractivePerfGuard(interactiveResults, interactivePerfBaseline) : [];
  const loadViolations = options.guard ? evaluateInteractiveLoadPerfGuard(loadResults, interactiveLoadPerfBaseline) : [];
  const violations = [...interactiveViolations, ...loadViolations];

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          guard: {
            ok: violations.length === 0,
            interactiveViolations,
            loadViolations,
            violations,
          },
          interactiveResults,
          loadResults,
        },
        null,
        2,
      ),
    );
  } else {
    printInteractiveTable(interactiveResults);
    printLoadTable(loadResults);
    if (options.guard) {
      if (violations.length === 0) {
        console.log("");
        console.log("perf guard: ok");
      } else {
        console.log("");
        console.log("perf guard: violations");
        for (const violation of interactiveViolations) {
          console.log(
            `- interactive ${violation.scenarioId} ${violation.label}: actual=${violation.actual.toFixed(2)} baseline=${violation.baseline.toFixed(2)} allowed=${violation.allowed.toFixed(2)}`,
          );
        }
        for (const violation of loadViolations) {
          console.log(
            `- load ${violation.scenarioId} ${violation.label}: actual=${violation.actual.toFixed(2)} baseline=${violation.baseline.toFixed(2)} allowed=${violation.allowed.toFixed(2)}`,
          );
        }
      }
    }
  }

  if (options.guard && violations.length > 0) {
    process.exitCode = 1;
  }
}

await main();
