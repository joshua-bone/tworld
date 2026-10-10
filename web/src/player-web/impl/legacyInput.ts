import {
  encodeRuntimeInputCode,
  GAME_INPUT_CODES,
  getGameInputCode,
  type GameInputName,
} from "@game-core/api/command";

export type DirectionInput = Exclude<GameInputName, "none" | "preserve">;

interface InputState {
  active: boolean;
  pending: boolean;
  repeatDelay: number;
}

// legacy_c/generic/in.c's default casual keyboard mode preserves an
// unconsumed command for two polls before a held arrow starts repeating.
const MS_REPEAT_DELAY_TICKS = 2;
const MS_ABSOLUTE_MOUSE_MOVE_FIRST = 512;
const LEGACY_DIRECTION_PRIORITY: readonly DirectionInput[] = ["north", "west", "south", "east"];

interface LynxInputState {
  active: boolean;
  pending: boolean;
}

export function absoluteMouseMoveCode(position: number): number {
  return MS_ABSOLUTE_MOUSE_MOVE_FIRST + position;
}

export class LegacyMsInputBuffer {
  private readonly states = new Map<DirectionInput, InputState>();
  private readonly queuedCodes: number[] = [];

  keyDown(input: DirectionInput): void {
    const existing = this.states.get(input);
    if (existing?.active) {
      return;
    }

    this.states.set(input, {
      active: true,
      pending: true,
      repeatDelay: MS_REPEAT_DELAY_TICKS,
    });
  }

  keyUp(input: DirectionInput, discardPending = false): void {
    const existing = this.states.get(input);
    if (!existing) {
      return;
    }

    if (existing.pending && !discardPending) {
      existing.active = false;
      return;
    }

    this.states.delete(input);
  }

  nextTickInput(): GameInputName {
    return this.nextKeyboardInput();
  }

  nextTickInputCode(modifierMask = 0): number {
    const queued = this.queuedCodes.shift();
    if (queued !== undefined) {
      return queued;
    }

    return encodeRuntimeInputCode(getGameInputCode(this.nextKeyboardInput()), modifierMask);
  }

  queueAbsoluteMouseMove(position: number, modifierMask = 0): void {
    this.queuedCodes.push(
      encodeRuntimeInputCode(absoluteMouseMoveCode(position), modifierMask),
      GAME_INPUT_CODES.preserve,
      GAME_INPUT_CODES.preserve,
      GAME_INPUT_CODES.preserve,
    );
  }

  reset(): void {
    this.states.clear();
    this.queuedCodes.length = 0;
  }

  private nextKeyboardInput(): GameInputName {
    let held: DirectionInput | null = null;
    let struck: DirectionInput | null = null;
    let preserve = false;
    for (const input of LEGACY_DIRECTION_PRIORITY) {
      const state = this.states.get(input);
      if (!state) {
        continue;
      }

      // Native MS selects the first pressed/repeating arrow in key-map order.
      // A struck (already released) key only wins if no held arrow is ready.
      if (state.active && (state.pending || state.repeatDelay === 0)) {
        held ??= input;
      } else if (state.pending) {
        struck = input;
      } else {
        preserve = true;
      }

      // Age every key on every poll, even when another arrow wins priority.
      if (!state.active) {
        this.states.delete(input);
      } else if (state.pending) {
        state.pending = false;
      } else if (state.repeatDelay > 0) {
        state.repeatDelay -= 1;
      }
    }
    return held ?? struck ?? (preserve ? "preserve" : "none");
  }
}

export class LegacyLynxInputBuffer {
  private readonly states = new Map<DirectionInput, LynxInputState>();

  keyDown(input: DirectionInput): void {
    const existing = this.states.get(input);
    if (existing?.active) {
      return;
    }

    this.states.set(input, {
      active: true,
      pending: true,
    });
  }

  keyUp(input: DirectionInput, discardPending = false): void {
    const existing = this.states.get(input);
    if (!existing) {
      return;
    }

    if (existing.pending && !discardPending) {
      existing.active = false;
      return;
    }

    this.states.delete(input);
  }

  nextTickInputCode(modifierMask = 0): number {
    const code = this.composePolledInputCode();

    for (const [input, state] of this.states) {
      if (state.pending && state.active) {
        state.pending = false;
        continue;
      }
      if (state.pending && !state.active) {
        this.states.delete(input);
      }
    }

    return encodeRuntimeInputCode(code, modifierMask);
  }

  reset(): void {
    this.states.clear();
  }

  private composePolledInputCode(): number {
    let heldCode: number = GAME_INPUT_CODES.none;
    let struckCode: number = GAME_INPUT_CODES.none;

    for (const input of LEGACY_DIRECTION_PRIORITY) {
      const state = this.states.get(input);
      if (!state) {
        continue;
      }

      const inputCode = getGameInputCode(input);
      if (state.active) {
        if (heldCode === GAME_INPUT_CODES.none) {
          heldCode = inputCode;
          continue;
        }

        const hasVertical = (heldCode & (GAME_INPUT_CODES.north | GAME_INPUT_CODES.south)) !== 0;
        const hasHorizontal = (heldCode & (GAME_INPUT_CODES.west | GAME_INPUT_CODES.east)) !== 0;
        const isVertical = (inputCode & (GAME_INPUT_CODES.north | GAME_INPUT_CODES.south)) !== 0;
        const isHorizontal = (inputCode & (GAME_INPUT_CODES.west | GAME_INPUT_CODES.east)) !== 0;

        if ((hasVertical && isHorizontal) || (hasHorizontal && isVertical)) {
          return heldCode | inputCode;
        }
        continue;
      }

      if (state.pending) {
        struckCode = inputCode;
      }
    }

    return heldCode !== GAME_INPUT_CODES.none ? heldCode : struckCode;
  }
}
