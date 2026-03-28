import { describe, expect, it } from "vitest";
import {
  actorBlockedMoveKeepsDirection,
  actorBlockedMoveRevertsPortable,
  actorCollectionAllowsSlot,
  actorCollectsChips,
  actorThiefStealsBootsAndTools,
  actorUsesChipSupport,
} from "@game-core/api/actorCapabilities";

describe("actorCapabilities", () => {
  it("classifies collection and progress capabilities", () => {
    expect(actorCollectionAllowsSlot("keys-boots-tools", "tools")).toBe(true);
    expect(actorCollectionAllowsSlot("keys-boots", "tools")).toBe(false);
    expect(actorCollectsChips("collect-chips")).toBe(true);
    expect(actorCollectsChips("none")).toBe(false);
  });

  it("classifies blocked-move, thief, and support hooks", () => {
    expect(actorBlockedMoveKeepsDirection("hold-direction")).toBe(true);
    expect(actorBlockedMoveKeepsDirection("stay")).toBe(false);
    expect(actorBlockedMoveRevertsPortable("revert-portable")).toBe(true);
    expect(actorBlockedMoveRevertsPortable("stay")).toBe(false);
    expect(actorThiefStealsBootsAndTools("steal-boots-tools")).toBe(true);
    expect(actorThiefStealsBootsAndTools("none")).toBe(false);
    expect(actorUsesChipSupport("chip-support")).toBe(true);
    expect(actorUsesChipSupport("non-chip-support")).toBe(false);
  });
});
