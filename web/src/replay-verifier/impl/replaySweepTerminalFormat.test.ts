import { describe, expect, it } from "vitest";
import {
  formatReplaySweepOutcomeBar,
  formatReplaySweepPackPrefix,
  formatReplaySweepPackProgress,
  trimReplaySweepPackName,
} from "@replay-verifier/impl/replaySweepTerminalFormat";

describe("replaySweepTerminalFormat", () => {
  it("trims known replay pack extensions", () => {
    expect(trimReplaySweepPackName("CCLP1.dac")).toBe("CCLP1");
    expect(trimReplaySweepPackName("CCLP1-MS.tws")).toBe("CCLP1-MS");
    expect(trimReplaySweepPackName("CCLP1")).toBe("CCLP1");
  });

  it("formats compact outcome bars", () => {
    expect(formatReplaySweepOutcomeBar(["-", "X", "-", "X"])).toBe("-X-X");
    expect(formatReplaySweepOutcomeBar([])).toBe("(no matches)");
  });

  it("formats pack prefixes", () => {
    expect(formatReplaySweepPackPrefix("CCLP1.dac")).toBe("CCLP1: ");
  });

  it("formats pack progress lines", () => {
    expect(formatReplaySweepPackProgress("CCLP1.dac", ["-", "-", "X"])).toBe("CCLP1: --X");
  });
});
