import { describe, expect, it } from "vitest";
import {
  formatReplaySweepValue,
  matchesReplayFilter,
  matchesSubstringFilter,
  rankReplaySweepCounts,
} from "@replay-verifier/impl/replaySweepSupport";

describe("replaySweepSupport", () => {
  it("matches substring filters and explicit equality filters", () => {
    expect(matchesSubstringFilter("CC1-lynx.dac.tws", null)).toBe(true);
    expect(matchesSubstringFilter("CC1-lynx.dac.tws", "lynx")).toBe(true);
    expect(matchesSubstringFilter("CC1-lynx.dac.tws", "=CC1-lynx.dac.tws")).toBe(true);
    expect(matchesSubstringFilter("CC1-lynx.dac.tws", "=other.tws")).toBe(false);
  });

  it("matches replay filters with level suffix shorthand", () => {
    expect(matchesReplayFilter("CC1-lynx.dac.tws:54", ":54")).toBe(true);
    expect(matchesReplayFilter("CC1-lynx.dac.tws:55", ":54")).toBe(false);
    expect(matchesReplayFilter("CC1-lynx.dac.tws:54", "lynx")).toBe(true);
  });

  it("ranks replay sweep counts by frequency then key", () => {
    expect(rankReplaySweepCounts(["$engine", "$.result", "$engine"])).toEqual([
      { key: "$engine", count: 2 },
      { key: "$.result", count: 1 },
    ]);
  });

  it("formats non-string values without dumping unbounded payloads", () => {
    expect(formatReplaySweepValue("already")).toBe("already");
    expect(formatReplaySweepValue({ pos: 485 })).toBe("{\"pos\":485}");
    expect(formatReplaySweepValue({ long: "x".repeat(200) }).endsWith("...")).toBe(true);
  });
});
