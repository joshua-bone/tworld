import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultBrowserPlayerKeyBindingsSettings,
  loadStoredPlayerKeyBindingsSettings,
  parseStoredPlayerKeyBindingsSettings,
  PLAYER_KEY_BINDINGS_SETTINGS_STORAGE_KEY,
  saveStoredPlayerKeyBindingsSettings,
} from "@player-web/impl/playerKeyBindingsSettings";

describe("playerKeyBindingsSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("defaults Action 1 to C and Undo to Z", () => {
    expect(createDefaultBrowserPlayerKeyBindingsSettings()).toEqual({
      action1Key: "C",
      undoKey: "Z",
    });
  });

  it("rejects colliding bindings and invalid keys", () => {
    expect(parseStoredPlayerKeyBindingsSettings({
      action1Key: "Z",
      undoKey: "Z",
    })).toEqual(createDefaultBrowserPlayerKeyBindingsSettings());

    expect(parseStoredPlayerKeyBindingsSettings({
      action1Key: "A",
      undoKey: "X",
    })).toEqual({
      action1Key: "C",
      undoKey: "X",
    });
  });

  it("round-trips stored settings through localStorage", () => {
    const getItem = vi.fn(() => JSON.stringify({ action1Key: "X", undoKey: "Y" }));
    const setItem = vi.fn();
    vi.stubGlobal("window", {
      localStorage: {
        getItem,
        setItem,
      },
    });

    expect(loadStoredPlayerKeyBindingsSettings()).toEqual({
      action1Key: "X",
      undoKey: "Y",
    });

    saveStoredPlayerKeyBindingsSettings({
      action1Key: "Y",
      undoKey: "X",
    });

    expect(setItem).toHaveBeenCalledWith(
      PLAYER_KEY_BINDINGS_SETTINGS_STORAGE_KEY,
      JSON.stringify({ action1Key: "Y", undoKey: "X" }),
    );
  });
});
