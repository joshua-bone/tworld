import { describe, expect, it } from "vitest";
import { PlayInputQueue } from "./PlayInputQueue";
import type { PlayReceipt } from "@player-web/ports/VisualPlayHarness";

describe("visual play input execution", () => {
  it("holds a Lynx key for the requested ticks, then releases it without pausing the clock", () => {
    const receipts: PlayReceipt[] = [];
    const queue = new PlayInputQueue("Lynx", (receipt) => receipts.push(receipt));
    queue.enqueue(1, [{ direction: "east", ticks: 4 }, { direction: "none", ticks: 2 }]);
    expect(Array.from({ length: 8 }, () => queue.nextInput())).toEqual([8, 8, 8, 8, 0, 0, 0, 0]);
    expect(receipts).toEqual([{ decisionId: 1, outcome: "finished", executedTicks: 6 }]);
  });
  it("takeover immediately clears held and queued keys and reports partial execution", () => {
    const receipts: PlayReceipt[] = [];
    const queue = new PlayInputQueue("MS", (receipt) => receipts.push(receipt));
    queue.enqueue(2, [{ direction: "west", ticks: 20 }, { direction: "south", ticks: 20 }]);
    queue.nextInput(); queue.clear();
    expect(queue.nextInput()).toBe(0);
    expect(receipts).toEqual([{ decisionId: 2, outcome: "cancelled", executedTicks: 1 }]);
  });
  it("preserves the existing MS keyboard repeat delay", () => {
    const queue = new PlayInputQueue("MS", () => {});
    queue.enqueue(3, [{ direction: "east", ticks: 5 }]);
    expect(Array.from({ length: 6 }, () => queue.nextInput())).toEqual([8, 0, 0, 8, 8, 0]);
  });
});
