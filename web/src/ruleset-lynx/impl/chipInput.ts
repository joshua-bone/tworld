import { decodeRuntimeInputCode } from "@game-core/api/command";
import { isDiagonalInput, isDirectionalInput } from "@game-core/impl/grid";
import type { LynxMoveKind } from "@ruleset-lynx/impl/verticalMovement";

export interface LynxChipMoveProbe {
  canMove: boolean;
  pushBlockPos: number | null;
}

export interface LynxChipInputDirectionResolver {
  probeMove(dir: number): LynxChipMoveProbe;
  isDormantBlockAt(pos: number): boolean;
}

export interface LynxForcedMoveSelection {
  dir: number;
  discardInput: boolean;
  moveKind?: LynxMoveKind;
}

export interface LynxChipMoveSelectionRequest {
  chipPos: number;
  chipZ: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  floorBeforeMove: number;
  currentInputCode: number;
  queuedReplayInputCode: number;
  queuedChipInputCode: number;
  forcedMove: LynxForcedMoveSelection;
  resolveInputDirection(inputCode: number): number;
}

export type LynxChipMoveSelection = {
  chipPos: number;
  chipZ: number;
  chipDir: number;
  chipMoving: number;
  endGameTicksElapsed: number | null;
  floorBeforeMove: number;
  rawRequestedInputCode: number;
  requestedInputCode: number;
  chosenInputCode: number;
  forcedInputCode: number;
  startInputCode: number;
  startAirMove: boolean;
  startElevatorMove: boolean;
};

export function resolveLynxChipInputDirection(
  chipDir: number,
  inputCode: number,
  resolver: LynxChipInputDirectionResolver,
): number {
  const { baseCode } = decodeRuntimeInputCode(inputCode);
  if (!isDirectionalInput(baseCode)) {
    return 0;
  }

  if (!isDiagonalInput(baseCode)) {
    return baseCode;
  }

  if ((chipDir & baseCode) !== 0) {
    const sameDir = chipDir;
    const otherDir = baseCode ^ chipDir;
    const sameProbe = resolver.probeMove(sameDir);
    const otherProbe = resolver.probeMove(otherDir);
    if (!sameProbe.canMove && otherProbe.canMove) {
      return otherDir;
    }
    return sameDir;
  }

  const horizontalDir = baseCode & (2 | 8);
  if (horizontalDir !== 0) {
    const horizontalProbe = resolver.probeMove(horizontalDir);
    if (horizontalProbe.pushBlockPos !== null && resolver.isDormantBlockAt(horizontalProbe.pushBlockPos)) {
      return inputCode & (1 | 4);
    }
    if (horizontalProbe.canMove) {
      return horizontalDir;
    }
  }

  return baseCode & (1 | 4);
}

export function selectLynxChipMoveForTick(request: LynxChipMoveSelectionRequest): LynxChipMoveSelection {
  const chipInEndGame = request.endGameTicksElapsed !== null;
  const rawRequestedInputCode = request.chipMoving === 0 ? request.queuedReplayInputCode || request.currentInputCode : 0;
  const requestedInputCode =
    request.chipMoving === 0 && !chipInEndGame && !request.forcedMove.discardInput ? rawRequestedInputCode : 0;
  const chosenInputCode =
    request.chipMoving === 0 && requestedInputCode !== 0
      ? request.queuedChipInputCode || request.resolveInputDirection(requestedInputCode)
      : 0;

  return {
    chipPos: request.chipPos,
    chipZ: request.chipZ,
    chipDir: request.chipDir,
    chipMoving: request.chipMoving,
    endGameTicksElapsed: request.endGameTicksElapsed,
    floorBeforeMove: request.floorBeforeMove,
    rawRequestedInputCode,
    requestedInputCode,
    chosenInputCode,
    forcedInputCode: request.forcedMove.dir,
    startInputCode: request.chipMoving === 0 ? chosenInputCode || request.forcedMove.dir : 0,
    startAirMove: request.chipMoving === 0 && chosenInputCode === 0 && request.forcedMove.moveKind === "air",
    startElevatorMove: request.chipMoving === 0 && chosenInputCode === 0 && request.forcedMove.moveKind === "elevator",
  };
}

export function shouldSuppressLynxChipMoveSelectionForHeldTrapArrival(
  chipMoving: number,
  chipArrivedOnHeldTrapThisTick: boolean,
  chipOnTrap: boolean,
): boolean {
  return chipArrivedOnHeldTrapThisTick && chipMoving === 0 && chipOnTrap;
}

export function suppressLynxChipMoveSelectionForHeldTrapArrival(
  selection: LynxChipMoveSelection,
): LynxChipMoveSelection {
  return {
    ...selection,
    requestedInputCode: 0,
    chosenInputCode: 0,
    forcedInputCode: 0,
    startInputCode: 0,
    startAirMove: false,
    startElevatorMove: false,
  };
}

export function previewInputCodeForLynxChipMoveSelection(
  selection: LynxChipMoveSelection,
  isSlideFloor: (floorId: number) => boolean,
  shouldPreviewForcedSlidePush: (inputCode: number) => boolean,
): number {
  if (selection.requestedInputCode !== 0) {
    return selection.requestedInputCode;
  }

  if (
    selection.forcedInputCode !== 0 &&
    isSlideFloor(selection.floorBeforeMove) &&
    shouldPreviewForcedSlidePush(selection.startInputCode)
  ) {
    return selection.startInputCode;
  }

  return 0;
}
