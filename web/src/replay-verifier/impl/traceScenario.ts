import type { ReplayTraceSpec, TraceSpec } from "@oracle-fixtures/impl/contracts/characterizationContract";
import type { InputTraceScenario, ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import { getGameInputCode, normalizeGameInputName } from "@game-core/api/command";
import type { GameCommand } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

function compareCommands(left: GameCommand, right: GameCommand): number {
  if (left.tick !== right.tick) {
    return left.tick - right.tick;
  }
  return left.inputCode - right.inputCode;
}

export function parseTraceCommandSpec(spec: string): GameCommand[] {
  const text = spec.trim();
  if (text === "" || text === "-") {
    return [];
  }

  return text
    .split(",")
    .map((token) => {
      const [tickText, inputText] = token.split(":", 2);
      if (tickText === undefined || inputText === undefined) {
        throw new Error(`invalid trace token: ${token}`);
      }

      const tick = Number.parseInt(tickText, 10);
      const inputName = normalizeGameInputName(inputText);
      if (!Number.isInteger(tick) || tick < 0 || inputName === null) {
        throw new Error(`invalid trace token: ${token}`);
      }

      return {
        tick,
        inputCode: getGameInputCode(inputName),
        inputName,
      };
    })
    .sort(compareCommands);
}

export function formatTraceCommandSpec(commands: GameCommand[]): string {
  if (commands.length === 0) {
    return "-";
  }

  return [...commands]
    .sort(compareCommands)
    .map((command) => `${command.tick}:${command.inputName}`)
    .join(",");
}

export function parseReplayMoveSpec(spec: string): SolutionMove[] {
  const text = spec.trim();
  if (text === "" || text === "-") {
    return [];
  }

  return text.split(",").map((token) => {
    const [whenText, dirText] = token.split(":", 2);
    const when = Number.parseInt(whenText ?? "", 10);
    const dir = Number.parseInt(dirText ?? "", 10);
    if (!Number.isInteger(when) || when < 0 || !Number.isInteger(dir) || dir < 0) {
      throw new Error(`invalid replay move token: ${token}`);
    }

    return { when, dir };
  });
}

export function mapTraceSpecToInputTraceScenario(spec: TraceSpec): InputTraceScenario {
  const commands = parseTraceCommandSpec(spec.inputs);
  return {
    name: spec.name,
    commandSpec: formatTraceCommandSpec(commands),
    request: {
      seriesFile: spec.series,
      levelNumber: spec.levelNumber,
      ruleset: spec.ruleset,
      randomSeed: spec.randomSeed,
    },
    commands,
    maxTicks: spec.maxTicks,
  };
}

export function mapReplayTraceSpecToScenario(spec: ReplayTraceSpec): ReplayTraceScenario {
  return {
    name: spec.name,
    request: {
      seriesFile: spec.series,
      levelNumber: spec.levelNumber,
      ruleset: spec.ruleset,
      randomSeed: spec.replay.randomSeed,
    },
    replay: {
      bestTimeTicks: spec.replay.bestTimeTicks,
      flags: spec.replay.flags,
      randomSlideDirection: spec.replay.randomSlideDirection,
      stepping: spec.replay.stepping,
      randomSeed: spec.replay.randomSeed,
      moves: parseReplayMoveSpec(spec.replay.moves),
      movesSpec: spec.replay.moves,
    },
    maxTicks: spec.maxTicks,
  };
}
