import {
  GAME_INPUT_CODES,
  decodeRuntimeInputCode,
  encodeRuntimeInputCode,
  getGameInputNameFromCode,
} from "@game-core/api/command";
import {
  normalizeReplayModifierMasks,
  type ReplayRecordedMove,
  type ReplaySolutionPayload,
} from "@game-core/api/codec";
import type { GameCommand, GameRuntimeCommand } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

export interface ReplayPlan {
  cursor: number;
  moves: SolutionMove[];
  modifierMasks: number[];
  randomSeed: number;
  stepping: number;
  randomSlideDirection: number;
}

export interface RecordedReplayMoveDecision extends ReplayRecordedMove {}

const REPLAY_MOVE_TICK_MASK = 0x7fffff;

function compareCommands(left: Pick<GameCommand, "tick" | "inputCode">, right: Pick<GameCommand, "tick" | "inputCode">): number {
  if (left.tick !== right.tick) {
    return left.tick - right.tick;
  }

  return left.inputCode - right.inputCode;
}

export function runtimeCommandName(code: number): string {
  const { baseCode, modifierMask } = decodeRuntimeInputCode(code);
  const baseName = getGameInputNameFromCode(baseCode) ?? `cmd-${baseCode}`;
  if (modifierMask === 0) {
    return baseName;
  }

  const modifiers: string[] = [];
  if ((modifierMask & 1) !== 0) {
    modifiers.push("action1");
  }

  return `${modifiers.join("+")}+${baseName}`;
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
    modifierMasks: normalizeReplayModifierMasks(payload.moves.length, payload.modifierMasks),
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
    input: createRuntimeCommand(
      encodeRuntimeInputCode(currentMove.dir, plan.modifierMasks[plan.cursor] ?? 0),
      tick,
    ),
    plan: {
      ...plan,
      cursor: plan.cursor + 1,
    },
  };
}

export function recordManualMove(
  recordedMoves: ReplayRecordedMove[],
  currentTime: number,
  replayCursor: number,
  moveCode: number,
): ReplayRecordedMove[] {
  const { baseCode, modifierMask } = decodeRuntimeInputCode(moveCode);
  return appendRecordedReplayMove(
    recordedMoves,
    replayCursor,
    baseCode === GAME_INPUT_CODES.none
      ? null
      : {
          when: currentTime,
          dir: baseCode,
          modifierMask,
        },
  );
}

export function appendRecordedReplayMove(
  recordedMoves: ReplayRecordedMove[],
  replayCursor: number,
  move: RecordedReplayMoveDecision | null,
): ReplayRecordedMove[] {
  if (replayCursor >= 0 || move === null) {
    return recordedMoves;
  }

  return [
    ...recordedMoves,
    { ...move },
  ];
}
