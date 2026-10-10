import { describe, expect, it } from "vitest";
import { AiInputOwnership } from "./aiInputOwnership";
import type { InputCommand, InputReceipt } from "@player-web/ports/aiProtocol.generated";
const identity = { sessionId: "session", generation: 1 };
const command: InputCommand = { ...identity, decisionId: 1, frameId: 1, direction: "east", ticks: 2 };
function setup(ruleset: "MS" | "Lynx" = "Lynx") {
  const receipts: InputReceipt[] = [];
  const owner = new AiInputOwnership(ruleset, identity, (receipt) => receipts.push(receipt));
  owner.observe(1, 1000);
  return { owner, receipts };
}
describe("AI input ownership", () => {
  it.each(["MS", "Lynx"] as const)("runs bounded normal %s input and releases it", (ruleset) => {
    const { owner, receipts } = setup(ruleset);
    owner.start();
    expect(owner.accept(command, 1000)).toBe(true);
    expect([owner.nextInput(1000), owner.nextInput(1055), owner.nextInput(1110)]).toEqual(ruleset === "MS" ? [8, 1568, null] : [8, 8, null]);
    expect(receipts).toEqual([{ ...identity, decisionId: 1, outcome: "finished", executedTicks: 2 }]);
  });
  it("takes over immediately and rejects a late command without rearming", () => {
    const { owner, receipts } = setup();
    owner.start(); owner.accept(command, 1000); owner.nextInput(1000); owner.stop();
    expect(owner.nextInput(1000)).toBe(null);
    expect(owner.accept({ ...command, decisionId: 2 }, 1000)).toBe(false);
    expect(receipts[0].outcome).toBe("cancelled");
    expect(receipts[0].executedTicks).toBe(1);
  });
  it("rejects stale, unknown, future, duplicate and previous-generation actions", () => {
    for (const [candidate, now] of [[command, 1501], [command, 999], [{ ...command, frameId: 2 }, 1000], [{ ...command, generation: 2 }, 1000]] as const) {
      const { owner } = setup(); owner.start();
      expect(owner.accept(candidate, now)).toBe(false);
      expect(owner.nextInput(now)).toBe(null);
    }
    const { owner } = setup(); owner.start(); expect(owner.accept(command, 1500)).toBe(true);
    expect(owner.accept(command, 1500)).toBe(false);
  });
  it("rechecks age at execution when the game clock was delayed", () => {
    const { owner, receipts } = setup(); owner.start(); owner.accept(command, 1000);
    expect(owner.nextInput(1501)).toBe(null);
    expect(receipts[0].outcome).toBe("stale");
  });
});
it("reports ticks already executed when the next sample expires", () => {
  const { owner, receipts } = setup(); owner.start(); owner.accept(command, 1000); owner.nextInput(1490);
  owner.nextInput(1540);
  expect(receipts).toEqual([{ ...identity, decisionId: 1, outcome: "stale", executedTicks: 1 }]);
});
