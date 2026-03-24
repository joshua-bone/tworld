import { describe, expect, it } from "vitest";
import { isEditableKeyTarget, shouldBypassPlayerHotkeys } from "@player-web/impl/playerHotkeyFocus";

describe("player hotkey focus", () => {
  it("treats text-entry controls as editable targets", () => {
    expect(isEditableKeyTarget({ tagName: "input" })).toBe(true);
    expect(isEditableKeyTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableKeyTarget({ tagName: "select" })).toBe(true);
    expect(isEditableKeyTarget({ isContentEditable: true })).toBe(true);
  });

  it("does not treat non-editable controls as editable targets", () => {
    expect(isEditableKeyTarget({ tagName: "button" })).toBe(false);
    expect(isEditableKeyTarget({ tagName: "div" })).toBe(false);
    expect(isEditableKeyTarget(null)).toBe(false);
  });

  it("bypasses player hotkeys when the key event or active element is editable", () => {
    expect(shouldBypassPlayerHotkeys({ tagName: "input" }, { tagName: "button" })).toBe(true);
    expect(shouldBypassPlayerHotkeys({ tagName: "div" }, { tagName: "textarea" })).toBe(true);
  });

  it("keeps player hotkeys enabled for non-editable focus targets", () => {
    expect(shouldBypassPlayerHotkeys({ tagName: "button" }, { tagName: "div" })).toBe(false);
  });
});
