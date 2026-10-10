import { PlayInputQueue } from "@player-web/impl/play-lab/PlayInputQueue";
import { MAX_OBSERVATION_AGE_MS, parseInputCommand, type Identity, type InputCommand, type InputReceipt } from "@player-web/ports/aiProtocol.generated";

export interface AiInputPort {
  nextInput(): number | null;
  takeOver(): void;
}

export class AiInputOwnership {
  private queue: PlayInputQueue;
  private frames = new Map<number, number>();
  private active = false;
  private pending: InputCommand | null = null;
  private lastDecision = 0;
  constructor(ruleset: "MS" | "Lynx", private identity: Identity, private receipt: (receipt: InputReceipt) => void) {
    this.queue = new PlayInputQueue(ruleset, (result) => {
      if (!this.pending) return;
      this.pending = null;
      this.active = false;
      this.receipt({ ...this.identity, ...result });
    });
  }
  observe(frameId: number, time: number): void {
    this.frames.set(frameId, time);
    if (this.frames.size > 64) this.frames.delete(this.frames.keys().next().value!);
  }
  start(): void { this.stop(); this.active = true; }
  accept(value: InputCommand, now: number): boolean {
    const command = parseInputCommand(value);
    if (!this.active || this.pending || command.decisionId <= this.lastDecision) return false;
    const time = this.frames.get(command.frameId);
    if (command.sessionId !== this.identity.sessionId || command.generation !== this.identity.generation
      || time === undefined || now < time || now - time > MAX_OBSERVATION_AGE_MS) {
      this.stop();
      return false;
    }
    this.lastDecision = command.decisionId;
    this.pending = command;
    this.queue.enqueue(command.decisionId, [{ direction: command.direction, ticks: command.ticks }]);
    return true;
  }
  nextInput(now: number): number | null {
    if (!this.active) return null;
    if (this.pending) {
      const time = this.frames.get(this.pending.frameId)!;
      if (now < time || now - time > MAX_OBSERVATION_AGE_MS) {
        const command = this.pending;
        const executedTicks = this.executedTicks;
        this.pending = null;
        this.stop();
        this.receipt({ ...this.identity, decisionId: command.decisionId, outcome: "stale", executedTicks });
        this.executedTicks = 0;
        return null;
      }
    }
    if (!this.pending) return 0;
    this.executedTicks += 1;
    const input = this.queue.nextInput();
    if (!this.active) { this.queue.clear(); this.executedTicks = 0; }
    return input;
  }
  private executedTicks = 0;
  stop(): void { this.queue.clear(); this.pending = null; this.active = false; this.executedTicks = 0; }
}
