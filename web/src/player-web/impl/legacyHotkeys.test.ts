import { describe, expect, it } from "vitest";
import {
  hasBlockedMovementModifier,
  isFirstLevelKey,
  isHelpToggleKey,
  isSystemModifierKey,
  isLastLevelKey,
  isNextLevelKey,
  isPrevLevelKey,
  isProceedKey,
  isUndoCheckpointKey,
  isUndoKey,
} from "@player-web/impl/legacyHotkeys";

describe("legacy hotkeys", () => {
  it("recognizes proceed keys", () => {
    expect(isProceedKey("Enter")).toBe(true);
    expect(isProceedKey(" ")).toBe(true);
    expect(isProceedKey("Spacebar")).toBe(true);
    expect(isProceedKey("Escape")).toBe(false);
  });

  it("recognizes help toggle keys", () => {
    expect(isHelpToggleKey("?")).toBe(true);
    expect(isHelpToggleKey("F1")).toBe(true);
    expect(isHelpToggleKey("h")).toBe(false);
  });

  it("maps Z and Shift+Z to undo and checkpoint rewind", () => {
    expect(isUndoKey({ key: "z" })).toBe(true);
    expect(isUndoKey({ key: "Z" })).toBe(true);
    expect(isUndoKey({ key: "z", shiftKey: true })).toBe(false);
    expect(isUndoKey({ key: "z", ctrlKey: true })).toBe(false);

    expect(isUndoCheckpointKey({ key: "z", shiftKey: true })).toBe(true);
    expect(isUndoCheckpointKey({ key: "Z", shiftKey: true })).toBe(true);
    expect(isUndoCheckpointKey({ key: "z" })).toBe(false);
    expect(isUndoCheckpointKey({ key: "z", shiftKey: true, metaKey: true })).toBe(false);
  });

  it("maps plain P/N to previous and next level", () => {
    expect(isPrevLevelKey({ key: "p" })).toBe(true);
    expect(isPrevLevelKey({ key: "P" })).toBe(true);
    expect(isNextLevelKey({ key: "n" })).toBe(true);
    expect(isNextLevelKey({ key: "N" })).toBe(true);
    expect(isPrevLevelKey({ key: "p", metaKey: true })).toBe(false);
    expect(isNextLevelKey({ key: "n", ctrlKey: true })).toBe(false);
  });

  it("keeps PageUp/PageDown as previous and next level", () => {
    expect(isPrevLevelKey({ key: "PageUp" })).toBe(true);
    expect(isNextLevelKey({ key: "PageDown" })).toBe(true);
  });

  it("maps first and last level to Home/End or Cmd/Ctrl + comma/period", () => {
    expect(isFirstLevelKey({ key: "Home" })).toBe(true);
    expect(isLastLevelKey({ key: "End" })).toBe(true);
    expect(isFirstLevelKey({ key: ",", metaKey: true })).toBe(true);
    expect(isFirstLevelKey({ key: "<", ctrlKey: true })).toBe(true);
    expect(isLastLevelKey({ key: ".", metaKey: true })).toBe(true);
    expect(isLastLevelKey({ key: ">", ctrlKey: true })).toBe(true);
    expect(isFirstLevelKey({ key: ",", altKey: true, metaKey: true })).toBe(false);
    expect(isLastLevelKey({ key: ".", altKey: true, ctrlKey: true })).toBe(false);
  });

  it("blocks modified movement keys", () => {
    expect(hasBlockedMovementModifier({ key: "ArrowLeft" })).toBe(false);
    expect(hasBlockedMovementModifier({ key: "ArrowLeft", metaKey: true })).toBe(true);
    expect(hasBlockedMovementModifier({ key: "ArrowLeft", ctrlKey: true })).toBe(true);
    expect(hasBlockedMovementModifier({ key: "ArrowLeft", altKey: true })).toBe(true);
  });

  it("recognizes system modifier keys that should clear buffered movement", () => {
    expect(isSystemModifierKey("Meta")).toBe(true);
    expect(isSystemModifierKey("Control")).toBe(true);
    expect(isSystemModifierKey("Alt")).toBe(true);
    expect(isSystemModifierKey("Shift")).toBe(false);
    expect(isSystemModifierKey("ArrowLeft")).toBe(false);
  });
});
