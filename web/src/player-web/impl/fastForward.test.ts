import { describe, expect, it } from "vitest";
import { isFastForwardModifierActive } from "@player-web/impl/fastForward";

describe("fastForward", () => {
  it("enables fast-forward only for plain Shift during gameplay", () => {
    expect(isFastForwardModifierActive("game", { shiftKey: true })).toBe(true);
    expect(isFastForwardModifierActive("game", { shiftKey: true, metaKey: true })).toBe(false);
    expect(isFastForwardModifierActive("game", { shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isFastForwardModifierActive("game", { shiftKey: true, altKey: true })).toBe(false);
  });

  it("disables fast-forward outside gameplay or when Shift is not active", () => {
    expect(isFastForwardModifierActive("series-list", { shiftKey: true })).toBe(false);
    expect(isFastForwardModifierActive("game", { shiftKey: false })).toBe(false);
    expect(isFastForwardModifierActive("game", {})).toBe(false);
  });
});
