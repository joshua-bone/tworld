import type { GameInputName } from "@domain/game/command";

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

export class LegacyMsInputBuffer {
  private readonly states = new Map<DirectionInput, InputState>();
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

  reset(): void {
    this.states.clear();
    this.order = 0;
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
