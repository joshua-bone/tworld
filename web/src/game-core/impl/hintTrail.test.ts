import { describe, expect, it } from "vitest";
import { createTestEngineState } from "./testEngineState";
import { hintTrailOverlays, recordHintTrail } from "./hintTrail";

describe("permanent hint trails", () => {
  it("writes spaces, loops the hint, and preserves marked tiles without advancing", () => {
    const state = createTestEngineState([], "MS");
    state.inventory.boots.push(1);
    for (const pos of [1, 2, 2, 3, 4]) recordHintTrail(state, "A B", pos);
    expect(state.hintTrail).toEqual({ nextIndex: 1, marks: [
      { pos: 1, z: 1, text: "A" }, { pos: 2, z: 1, text: " " },
      { pos: 3, z: 1, text: "B" }, { pos: 4, z: 1, text: "A" },
    ] });
  });

  it("keeps old state immutable and distinguishes board layers", () => {
    const state = createTestEngineState([], "Lynx");
    state.inventory.boots.push(1);
    recordHintTrail(state, "AB", 1, 1);
    const previous = state.hintTrail;
    recordHintTrail(state, "AB", 1, 2);
    expect(previous).toEqual({ nextIndex: 1, marks: [{ pos: 1, z: 1, text: "A" }] });
    expect(state.hintTrail?.marks[1]).toEqual({ pos: 1, z: 2, text: "B" });
  });

  it("does not write without boots or for an empty hint and handles Unicode characters", () => {
    const state = createTestEngineState([], "MS");
    recordHintTrail(state, "A", 1);
    expect(state.hintTrail).toBeUndefined();
    state.inventory.boots.push(1);
    recordHintTrail(state, "", 1);
    expect(state.hintTrail).toBeUndefined();
    recordHintTrail(state, "😀?", 1);
    recordHintTrail(state, "😀?", 2);
    expect(state.hintTrail?.marks.map((mark) => mark.text)).toEqual(["😀", "?"]);
  });

  it("projects persistent letters as translucent overlays without terrain changes", () => {
    expect(hintTrailOverlays({ nextIndex: 0, marks: [{ pos: 42, z: 2, text: "H" }] })).toEqual([
      { pos: 42, z: 2, kind: "hint-letter", render: { mode: "hint-letter", text: "H", alpha: 0.6 } },
    ]);
    expect(hintTrailOverlays(undefined)).toEqual([]);
  });
});
