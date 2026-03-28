import type { EngineState } from "@game-core/api/model";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import { createRuntimeCommand, runtimeCommandName, type RecordedReplayMoveDecision } from "@game-core/api/playback";
import {
  decodeRuntimeInputCode,
  encodeRuntimeInputCode,
  GAME_INPUT_CODES,
  stripRuntimeInputModifiers,
} from "@game-core/api/command";
import { normalizeCardinalDirection as normalizeDirection } from "@game-core/impl/grid";
import { MS_DIRECTION, MS_GRID_HEIGHT, MS_GRID_WIDTH } from "@ruleset-ms/api/tiles";

export type MsChipFloorMovementMode = "none" | "ice" | "slide" | "teleport" | "air" | "elevator";

export interface MsChipInputState {
  chipTDir: number;
  chipHasMoved: boolean;
  currentInput: number;
  goalPos: number;
  chipPos: number;
  floorMovement: MsChipFloorMovementMode;
  chipDir: number;
}

export interface MsReplayChoiceSnapshot {
  chipHasMovedBeforeChoose: boolean;
  goalPosBeforeChoose: number;
  floorMovementBeforeChoose: MsChipFloorMovementMode;
  chipDirBeforeChoose: number;
  chipPos: number;
}

export interface MsReplayResolutionContext {
  replayCursor: number;
  previousLastMove: EngineState["lastMove"];
  currentTime: number;
  engineTime: number;
}

export interface MsManualMovementChoice {
  consumedInputCode: number;
  dir: number;
}

const MS_MOUSE_RANGE_MIN = -9;
const MS_MOUSE_RANGE = 19;
const CMD_MOUSE_MOVE_FIRST = (MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east) + 1;
const CMD_MOUSE_MOVE_LAST = CMD_MOUSE_MOVE_FIRST + MS_MOUSE_RANGE * MS_MOUSE_RANGE - 1;
const CMD_MOVE_NOP = CMD_MOUSE_MOVE_FIRST - MS_MOUSE_RANGE_MIN * (MS_MOUSE_RANGE + 1);
const CMD_ABS_MOUSE_MOVE_FIRST = 512;

function isRelativeMouseCommand(code: number): boolean {
  const normalized = stripRuntimeInputModifiers(code);
  return normalized >= CMD_MOUSE_MOVE_FIRST && normalized <= CMD_MOUSE_MOVE_LAST;
}

function isAbsoluteMouseCommand(code: number): boolean {
  const normalized = stripRuntimeInputModifiers(code);
  return normalized >= CMD_ABS_MOUSE_MOVE_FIRST && normalized < CMD_ABS_MOUSE_MOVE_FIRST + MS_GRID_WIDTH * MS_GRID_HEIGHT;
}

function makeMouseRelative(absPos: number, chipPos: number): number {
  const x = (absPos % MS_GRID_WIDTH) - (chipPos % MS_GRID_WIDTH);
  const y = Math.floor(absPos / MS_GRID_WIDTH) - Math.floor(chipPos / MS_GRID_WIDTH);
  return (y - MS_MOUSE_RANGE_MIN) * MS_MOUSE_RANGE + (x - MS_MOUSE_RANGE_MIN);
}

function makeMouseAbsolute(relPos: number, chipPos: number): number {
  const x = (relPos % MS_MOUSE_RANGE) + MS_MOUSE_RANGE_MIN;
  const y = Math.floor(relPos / MS_MOUSE_RANGE) + MS_MOUSE_RANGE_MIN;
  return chipPos + y * MS_GRID_WIDTH + x;
}

function shouldDiscardManualInput(
  floorMovement: MsChipFloorMovementMode,
  inputCode: number,
  chipDir: number,
): boolean {
  return (
    floorMovement === "ice" ||
    floorMovement === "air" ||
    floorMovement === "elevator" ||
    floorMovement === "teleport" ||
    (floorMovement === "slide" && inputCode === chipDir)
  );
}

function chipHasMovedForReplay(currentTime: number, chipHasMovedBeforeChoose: boolean): boolean {
  return (currentTime & 3) === 0 ? false : chipHasMovedBeforeChoose;
}

export function chooseMsManualMovement(
  internal: MsChipInputState,
  currentTime: number,
  resolveGoalDirection: () => number,
): MsManualMovementChoice {
  internal.chipTDir = MS_DIRECTION.none;
  if ((currentTime & 3) === 0) {
    internal.chipHasMoved = false;
  }
  if (internal.chipHasMoved) {
    if (internal.currentInput !== MS_DIRECTION.none && internal.goalPos >= 0) {
      internal.goalPos = -1;
    }
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir: MS_DIRECTION.none,
    };
  }

  const inputCode = internal.currentInput;
  const { baseCode: decodedInputCode } = decodeRuntimeInputCode(inputCode);
  internal.currentInput = MS_DIRECTION.none;
  if (shouldDiscardManualInput(internal.floorMovement, decodedInputCode, internal.chipDir)) {
    if (currentTime > 0 && (currentTime & 1) === 0) {
      internal.goalPos = -1;
    }
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir: MS_DIRECTION.none,
    };
  }

  if (decodedInputCode === MS_DIRECTION.none) {
    const dir = internal.goalPos >= 0 && (currentTime & 3) === 2 ? resolveGoalDirection() : MS_DIRECTION.none;
    internal.chipTDir = dir;
    return {
      consumedInputCode: GAME_INPUT_CODES.none,
      dir,
    };
  }

  let dir = normalizeDirection(decodedInputCode);
  if (isAbsoluteMouseCommand(decodedInputCode)) {
    internal.goalPos = decodedInputCode - CMD_ABS_MOUSE_MOVE_FIRST;
    dir = (currentTime & 3) === 2 ? resolveGoalDirection() : MS_DIRECTION.none;
  } else if (isRelativeMouseCommand(decodedInputCode)) {
    internal.goalPos = makeMouseAbsolute(decodedInputCode - CMD_MOUSE_MOVE_FIRST, internal.chipPos);
    dir = (currentTime & 3) === 2 ? resolveGoalDirection() : MS_DIRECTION.none;
  }

  internal.chipTDir = dir;
  return {
    consumedInputCode: inputCode,
    dir,
  };
}

export function resolveMsReplayLastMoveAfterChoose(
  context: MsReplayResolutionContext,
  inputCode: number,
  snapshot: MsReplayChoiceSnapshot,
  toolActionTriggered: boolean,
): EngineState["lastMove"] {
  const { previousLastMove, replayCursor, currentTime, engineTime } = context;
  const { baseCode, modifierMask } = decodeRuntimeInputCode(inputCode);

  if (replayCursor < 0) {
    return { code: MS_DIRECTION.none, name: "none" };
  }

  if (chipHasMovedForReplay(currentTime, snapshot.chipHasMovedBeforeChoose) && !toolActionTriggered) {
    if (inputCode !== MS_DIRECTION.none && snapshot.goalPosBeforeChoose >= 0) {
      const runtimeMove = createRuntimeCommand(CMD_MOVE_NOP, engineTime + 1);
      return {
        code: runtimeMove.inputCode,
        name: runtimeMove.inputName,
      };
    }
    return previousLastMove;
  }

  if (shouldDiscardManualInput(snapshot.floorMovementBeforeChoose, baseCode, snapshot.chipDirBeforeChoose) && !toolActionTriggered) {
    return previousLastMove;
  }

  if (isAbsoluteMouseCommand(baseCode)) {
    const goalPos = baseCode - CMD_ABS_MOUSE_MOVE_FIRST;
    const move = createRuntimeCommand(
      encodeRuntimeInputCode(CMD_MOUSE_MOVE_FIRST + makeMouseRelative(goalPos, snapshot.chipPos), modifierMask),
      engineTime + 1,
    );
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  if (isRelativeMouseCommand(baseCode)) {
    const move = createRuntimeCommand(encodeRuntimeInputCode(baseCode, modifierMask), engineTime + 1);
    return {
      code: move.inputCode,
      name: move.inputName,
    };
  }

  const dir = normalizeDirection(baseCode);
  const runtimeMove = createRuntimeCommand(dir, engineTime + 1);
  return {
    code: encodeRuntimeInputCode(runtimeMove.inputCode, modifierMask),
    name: runtimeCommandName(encodeRuntimeInputCode(runtimeMove.inputCode, modifierMask)),
  };
}

export function resolveMsRecordedReplayMoveAfterChoose(
  replayCursor: number,
  currentTime: number,
  inputCode: number,
  snapshot: MsReplayChoiceSnapshot,
  toolActionTriggered: boolean,
): RecordedReplayMoveDecision | null {
  const { baseCode, modifierMask } = decodeRuntimeInputCode(inputCode);
  if (replayCursor >= 0 || (baseCode === MS_DIRECTION.none && (!toolActionTriggered || modifierMask === 0))) {
    return null;
  }

  if (chipHasMovedForReplay(currentTime, snapshot.chipHasMovedBeforeChoose) && !toolActionTriggered) {
    return snapshot.goalPosBeforeChoose >= 0
      ? {
          when: currentTime,
          dir: CMD_MOVE_NOP,
          modifierMask,
        }
      : null;
  }

  if (shouldDiscardManualInput(snapshot.floorMovementBeforeChoose, baseCode, snapshot.chipDirBeforeChoose) && !toolActionTriggered) {
    return null;
  }

  if (isAbsoluteMouseCommand(baseCode)) {
    const goalPos = baseCode - CMD_ABS_MOUSE_MOVE_FIRST;
    return {
      when: currentTime,
      dir: CMD_MOUSE_MOVE_FIRST + makeMouseRelative(goalPos, snapshot.chipPos),
      modifierMask,
    };
  }

  if (isRelativeMouseCommand(baseCode)) {
    return {
      when: currentTime,
      dir: baseCode,
      modifierMask,
    };
  }

  return {
    when: currentTime,
    dir: normalizeDirection(baseCode),
    modifierMask,
  };
}

export function replayBestTimeTicks(replay: ReplaySolutionPayload): number | undefined {
  const replayWithBestTime = replay as ReplaySolutionPayload & {
    bestTimeTicks?: number;
  };
  return typeof replayWithBestTime.bestTimeTicks === "number" ? replayWithBestTime.bestTimeTicks : undefined;
}

function isMouseGoalInputCode(inputCode: number): boolean {
  const normalized = stripRuntimeInputModifiers(inputCode);
  return normalized === CMD_MOVE_NOP || isAbsoluteMouseCommand(normalized) || isRelativeMouseCommand(normalized);
}

export function latchCurrentMsInput(replayCursor: number, currentInput: number, incomingInput: number): number {
  if (replayCursor >= 0) {
    return incomingInput !== MS_DIRECTION.none ? incomingInput : currentInput;
  }

  const { baseCode, modifierMask } = decodeRuntimeInputCode(incomingInput);
  return isMouseGoalInputCode(incomingInput)
    ? incomingInput
    : encodeRuntimeInputCode(normalizeDirection(baseCode), modifierMask);
}
