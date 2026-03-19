import { GAME_INPUT_CODES, getGameInputCode, type GameInputName } from "@game-core/api/command";

export type DirectionInput = Exclude<GameInputName, "none" | "preserve">;

interface InputState {
  active: boolean;
  pending: boolean;
  repeatDelay: number;
  order: number;
}

// MS runs with keyboard-style arrows plus casual input handling, which
// inserts two non-repeating polls before a held key starts repeating.
const MS_REPEAT_DELAY_TICKS = 2;
const MS_ABSOLUTE_MOUSE_MOVE_FIRST = 512;
const LYNX_DIRECTION_PRIORITY: readonly DirectionInput[] = ["north", "west", "south", "east"];

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
  private order = 0;

  keyDown(input: DirectionInput): void {
    const existing = this.states.get(input);
    if (existing?.active) {
      return;
    }

    this.order += 1;
    this.states.set(input, {
      active: true,
      pending: true,
      repeatDelay: MS_REPEAT_DELAY_TICKS,
      order: this.order,
    });
  }

  keyUp(input: DirectionInput): void {
    const existing = this.states.get(input);
    if (!existing) {
      return;
    }

    if (existing.pending) {
      existing.active = false;
      return;
    }

    this.states.delete(input);
  }

  nextTickInput(): GameInputName {
    return this.nextKeyboardInput();
  }

  nextTickInputCode(): number {
    const queued = this.queuedCodes.shift();
    if (queued !== undefined) {
      return queued;
    }

    return getGameInputCode(this.nextKeyboardInput());
  }

  queueAbsoluteMouseMove(position: number): void {
    this.queuedCodes.push(
      absoluteMouseMoveCode(position),
      GAME_INPUT_CODES.preserve,
      GAME_INPUT_CODES.preserve,
      GAME_INPUT_CODES.preserve,
    );
  }

  reset(): void {
    this.states.clear();
    this.queuedCodes.length = 0;
    this.order = 0;
  }

  private nextKeyboardInput(): GameInputName {
    const pending = this.selectState(([, state]) => state.pending);
    if (pending) {
      const [input, state] = pending;
      state.pending = false;
      if (!state.active) {
        this.states.delete(input);
      }
      return input;
    }

    const active = this.selectState(([, state]) => state.active);
    if (!active) {
      return "none";
    }

    const [input, state] = active;
    if (state.repeatDelay > 0) {
      state.repeatDelay -= 1;
      return "none";
    }

    return input;
  }

  private selectState(
    predicate: (entry: [DirectionInput, InputState]) => boolean,
  ): [DirectionInput, InputState] | null {
    let selected: [DirectionInput, InputState] | null = null;
    for (const entry of this.states.entries()) {
      if (!predicate(entry)) {
        continue;
      }
      if (!selected || entry[1].order > selected[1].order) {
        selected = entry;
      }
    }
    return selected;
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

  keyUp(input: DirectionInput): void {
    const existing = this.states.get(input);
    if (!existing) {
      return;
    }

    if (existing.pending) {
      existing.active = false;
      return;
    }

    this.states.delete(input);
  }

  nextTickInputCode(): number {
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

    return code;
  }

  reset(): void {
    this.states.clear();
  }

  private composePolledInputCode(): number {
    let heldCode: number = GAME_INPUT_CODES.none;
    let struckCode: number = GAME_INPUT_CODES.none;

    for (const input of LYNX_DIRECTION_PRIORITY) {
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
