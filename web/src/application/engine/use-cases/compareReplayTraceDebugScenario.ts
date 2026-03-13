import type { OracleReplayDebugSpec } from "@application/contracts/oracleDebug";
import type { DebugTraceMismatch } from "@application/engine/comparators/debugTraceComparison";
import { collectDebugTraceMismatches } from "@application/engine/comparators/debugTraceComparison";
import type { DebugGameEnginePort } from "@application/ports/DebugGameEngine";
import type { GameDebugTrace } from "@domain/game/debug";

function parseReplayMoves(value: string) {
  if (value === "-" || value.trim() === "") {
    return [];
  }

  return value.split(",").map((entry) => {
    const [whenText, dirText] = entry.split(":");
    return {
      when: Number.parseInt(whenText ?? "0", 10),
      dir: Number.parseInt(dirText ?? "0", 10),
    };
  });
}

export interface ReplayTraceDebugComparison {
  scenario: OracleReplayDebugSpec;
  expected: GameDebugTrace;
  actual: GameDebugTrace;
  mismatches: DebugTraceMismatch[];
}

export async function compareReplayTraceDebugScenario(
  candidate: Pick<DebugGameEnginePort, "runReplayTraceDebug">,
  expected: GameDebugTrace,
  scenario: OracleReplayDebugSpec,
): Promise<ReplayTraceDebugComparison> {
  const actual = await candidate.runReplayTraceDebug(
    {
      seriesFile: scenario.series,
      levelNumber: scenario.levelNumber,
      ruleset: scenario.ruleset,
      randomSeed: scenario.replay.randomSeed,
    },
    {
      bestTimeTicks: scenario.replay.bestTimeTicks,
      flags: scenario.replay.flags,
      randomSlideDirection: scenario.replay.randomSlideDirection,
      stepping: scenario.replay.stepping,
      randomSeed: scenario.replay.randomSeed,
      moves: parseReplayMoves(scenario.replay.moves),
    },
    scenario.maxTicks,
  );

  return {
    scenario,
    expected,
    actual,
    mismatches: collectDebugTraceMismatches(actual, expected),
  };
}
