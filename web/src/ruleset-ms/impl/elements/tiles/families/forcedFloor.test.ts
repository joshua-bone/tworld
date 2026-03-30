import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  isMsIceForcedFloor,
  msEntryRevealsForcedFloor,
} from "@ruleset-ms/impl/elements/tiles/families/forcedFloor";

describe("ms forced-floor family helpers", () => {
  it("detects ice and revealed forced floors through the family helper", () => {
    expect(isMsIceForcedFloor(MS_TILE.Ice)).toBe(true);
    expect(isMsIceForcedFloor(MS_TILE.Slide_East)).toBe(false);
    expect(msEntryRevealsForcedFloor(MS_TILE.Empty, MS_TILE.Slide_East)).toBe(true);
    expect(msEntryRevealsForcedFloor(MS_TILE.Empty, MS_TILE.Empty)).toBe(false);
  });
});
