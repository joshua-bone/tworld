import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeOracleDebugFixtureRepository } from "@adapters/fixtures/NodeOracleDebugFixtureRepository";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";
import { NodeOracleDebugScenarioRepository } from "@adapters/scenarios/NodeOracleDebugScenarioRepository";
import type { OracleReplayDebugSpec } from "@application/contracts/oracleDebug";
import { compareReplayTraceDebugScenario } from "@application/engine/use-cases/compareReplayTraceDebugScenario";
import { mapOracleDebugFixtureToGameDebugTrace } from "@application/mappers/oracleDebug";

const scenarioName = process.env.TWORLD_MS_DEBUG_SCENARIO?.trim() || "cclp1-ms-level-113-teleport-block-debug";

async function main(): Promise<void> {
  const scenarioRepository = new NodeOracleDebugScenarioRepository();
  const fixtureRepository = new NodeOracleDebugFixtureRepository();
  const candidate = new TsMsGameEngineAdapter(new NodeLevelRepository());
  const scenario = (await scenarioRepository.loadSpecs()).find(
    (entry): entry is OracleReplayDebugSpec => entry.name === scenarioName && entry.command !== "input-trace-debug",
  );

  if (!scenario) {
    throw new Error(`Replay debug scenario not found: ${scenarioName}`);
  }

  const expected = mapOracleDebugFixtureToGameDebugTrace(await fixtureRepository.loadTrace(scenario.name));
  const comparison = await compareReplayTraceDebugScenario(candidate, expected, scenario);
  const first = comparison.mismatches[0];

  if (!first) {
    console.log(JSON.stringify({ scenario: scenario.name, mismatch: null }, null, 2));
    return;
  }

  const stepIndex = first.stepIndex ?? 0;
  const expectedStep = comparison.expected.steps[stepIndex];
  const actualStep = comparison.actual.steps[stepIndex];
  const phaseName = first.phaseName;
  const expectedPhase = phaseName ? expectedStep?.phases.find((phase) => phase.phase === phaseName) : null;
  const actualPhase = phaseName ? actualStep?.phases.find((phase) => phase.phase === phaseName) : null;

  console.log(
    JSON.stringify(
      {
        scenario: scenario.name,
        firstMismatch: first,
        expectedPhase,
        actualPhase,
        expectedStep,
        actualStep,
      },
      null,
      2,
    ),
  );
}

await main();
