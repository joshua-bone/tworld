import { LegacyLynxInputBuffer, LegacyMsInputBuffer } from "@player-web/impl/legacyInput";
import type { PlayAction, PlayDirection, PlayReceipt } from "@player-web/ports/VisualPlayHarness";

export class PlayInputQueue {
  private buffer: LegacyLynxInputBuffer | LegacyMsInputBuffer;
  private actions: PlayAction[] = [];
  private held: PlayDirection = "none";
  private decisionId: number | null = null;
  private executedTicks = 0;

  constructor(ruleset: "MS" | "Lynx", private receipt: (receipt: PlayReceipt) => void) {
    this.buffer = ruleset === "MS" ? new LegacyMsInputBuffer() : new LegacyLynxInputBuffer();
  }

  enqueue(decisionId: number, actions: PlayAction[]): void {
    this.clear();
    this.decisionId = decisionId;
    this.actions = actions.map((action) => ({ ...action }));
    this.executedTicks = 0;
  }

  clear(): void {
    if (this.decisionId !== null) this.receipt({ decisionId: this.decisionId, outcome: "cancelled", executedTicks: this.executedTicks });
    this.decisionId = null;
    this.actions = [];
    this.held = "none";
    this.buffer.reset();
  }

  nextInput(): number {
    const action = this.actions[0];
    const direction = action?.direction ?? "none";
    if (direction !== this.held) {
      if (this.held !== "none") this.buffer.keyUp(this.held);
      if (direction !== "none") this.buffer.keyDown(direction);
      this.held = direction;
    }
    const input = this.buffer.nextTickInputCode();
    if (action) {
      this.executedTicks += 1;
      action.ticks -= 1;
      if (action.ticks === 0) this.actions.shift();
    }
    if (!this.actions.length && this.decisionId !== null) {
      this.receipt({ decisionId: this.decisionId, outcome: "finished", executedTicks: this.executedTicks });
      this.decisionId = null;
    }
    return input;
  }
}
