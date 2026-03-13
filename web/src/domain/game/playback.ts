import { GAME_INPUT_CODES, getGameInputNameFromCode } from "@domain/game/command";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import type { GameCommand, GameRuntimeCommand } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

export interface ReplayPlan {
  cursor: number;
  moves: SolutionMove[];
  randomSeed: number;
  stepping: number;
  randomSlideDirection: number;
}

const REPLAY_MOVE_TICK_MASK = 0x7fffff;

function compareCommands(left: Pick<GameCommand, "tick" | "inputCode">, right: Pick<GameCommand, "tick" | "inputCode">): number {
  if (left.tick !== right.tick) {
    return left.tick - right.tick;
  }

  return left.inputCode - right.inputCode;
}

export function runtimeCommandName(code: number): string {
  return getGameInputNameFromCode(code) ?? `cmd-${code}`;
}

export function createRuntimeCommand(inputCode: number, tick: number): GameRuntimeCommand {
  return {
    tick,
    inputCode,
    inputName: runtimeCommandName(inputCode),
  };
}

export function scheduledInputForTick(commands: GameCommand[], tick: number): GameRuntimeCommand {
  let selected = createRuntimeCommand(GAME_INPUT_CODES.none, tick);

  for (const command of [...commands].sort(compareCommands)) {
    if (command.tick === tick) {
      selected = {
        tick,
        inputCode: command.inputCode,
        inputName: command.inputName,
      };
    }
  }

  return selected;
}

export function resolveManualInput(previous: GameRuntimeCommand, scheduled: GameRuntimeCommand): GameRuntimeCommand {
  if (scheduled.inputCode === GAME_INPUT_CODES.preserve) {
    return {
      ...previous,
      tick: scheduled.tick,
    };
  }

  return scheduled;
}

export function createReplayPlan(payload: ReplaySolutionPayload): ReplayPlan {
  return {
    cursor: 0,
    // Native replays store `when` in a 23-bit action bitfield.
    moves: payload.moves.map((move) => ({
      ...move,
      when: move.when & REPLAY_MOVE_TICK_MASK,
    })),
    randomSeed: payload.randomSeed,
    stepping: payload.stepping,
    randomSlideDirection: payload.randomSlideDirection,
  };
}

export function plannedReplayInput(plan: ReplayPlan, tick: number): {
  input: GameRuntimeCommand;
  plan: ReplayPlan;
} {
  const currentMove = plan.moves[plan.cursor];
  if (!currentMove || currentMove.when !== tick) {
    return {
      input: createRuntimeCommand(GAME_INPUT_CODES.none, tick),
      plan,
    };
  }

  return {
    input: createRuntimeCommand(currentMove.dir, tick),
    plan: {
      ...plan,
      cursor: plan.cursor + 1,
    },
  };
}

export function recordManualMove(
  recordedMoves: SolutionMove[],
  currentTime: number,
  replayCursor: number,
  moveCode: number,
): SolutionMove[] {
  if (replayCursor >= 0 || moveCode === GAME_INPUT_CODES.none) {
    return recordedMoves;
  }

  return [
    ...recordedMoves,
    {
      when: currentTime,
      dir: moveCode,
    },
  ];
}
