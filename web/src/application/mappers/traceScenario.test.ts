import { describe, expect, it } from "vitest";
import { formatTraceCommandSpec, parseTraceCommandSpec } from "@application/mappers/traceScenario";

describe("trace scenario mappers", () => {
  it("normalizes trace commands into the oracle's canonical string form", () => {
    const commands = parseTraceCommandSpec("4:right,0:e,0:hold,2:left");

    expect(commands).toEqual([
      { tick: 0, inputCode: 8, inputName: "east" },
      { tick: 0, inputCode: 1568, inputName: "preserve" },
      { tick: 2, inputCode: 2, inputName: "west" },
      { tick: 4, inputCode: 8, inputName: "east" },
    ]);
    expect(formatTraceCommandSpec(commands)).toBe("0:east,0:preserve,2:west,4:east");
  });

  it("treats empty trace specs as having no scheduled commands", () => {
    expect(parseTraceCommandSpec("-")).toEqual([]);
    expect(formatTraceCommandSpec([])).toBe("-");
  });
});
