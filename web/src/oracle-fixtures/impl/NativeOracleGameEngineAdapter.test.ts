import { describe, expect, it } from "vitest";
import { isExpectedOracleStderrLine } from "@oracle-fixtures/impl/NativeOracleGameEngineAdapter";

describe("isExpectedOracleStderrLine", () => {
  it("accepts known legacy oracle warnings that do not invalidate replay traces", () => {
    expect(isExpectedOracleStderrLine("[/tmp/lxlogic.c:1890] Level 24: invalid cloner wiring: no button at (7 24)")).toBe(true);
    expect(isExpectedOracleStderrLine("[/tmp/lxlogic.c:1893] Level 50: disabling miswired cloner button at (29 23)")).toBe(true);
    expect(isExpectedOracleStderrLine("CHIPS.dat unavailable")).toBe(true);
    expect(isExpectedOracleStderrLine("solution file foo was recorded for a different level set")).toBe(true);
  });

  it("rejects unexpected oracle stderr lines", () => {
    expect(isExpectedOracleStderrLine("segmentation fault")).toBe(false);
    expect(isExpectedOracleStderrLine("invalid level pack")).toBe(false);
  });
});
