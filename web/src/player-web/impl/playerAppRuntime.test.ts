import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";
import {
  interactiveEngineSupportsReplay,
} from "@player-web/impl/playerAppRuntime";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

function engine(overrides: Partial<InteractiveGameEnginePort> = {}): InteractiveGameEnginePort {
  return {
    startSession: vi.fn(),
    startReplaySession: vi.fn(),
    advanceSession: vi.fn(),
    restoreSession: vi.fn(),
    resumeSession: vi.fn(),
    ...overrides,
  };
}

function engines(hybrid: InteractiveGameEnginePort): BrowserAppServices["engines"] {
  return {
    MS: engine(),
    Lynx: engine(),
    Hybrid: hybrid,
  };
}

describe("interactiveEngineSupportsReplay", () => {
  it("preserves shared legacy replay support for MS and Lynx", () => {
    const available = engines(engine());

    expect(interactiveEngineSupportsReplay("MS", available)).toBe(true);
    expect(interactiveEngineSupportsReplay("Lynx", available)).toBe(true);
  });

  it("keeps Hybrid v0 replay controls unavailable without a native replay capability", () => {
    expect(interactiveEngineSupportsReplay("Hybrid", engines(engine()))).toBe(false);
  });

  it("enables Hybrid v1 only when its full HCR1 lifecycle is present", () => {
    const partial = engines(engine({
      opaqueReplayFormat: "hcr1",
      startOpaqueReplaySession: vi.fn(),
      validateOpaqueReplay: vi.fn(),
    }));
    const complete = engines(engine({
      opaqueReplayFormat: "hcr1",
      startOpaqueReplaySession: vi.fn(),
      validateOpaqueReplay: vi.fn(),
      exportOpaqueReplay: vi.fn(),
    }));

    expect(interactiveEngineSupportsReplay("Hybrid", partial)).toBe(false);
    expect(interactiveEngineSupportsReplay("Hybrid", complete)).toBe(true);
  });

  it("gates replay import without disabling ordinary level navigation", async () => {
    const source = await readFile(new URL("./PlayerApp.tsx", import.meta.url), "utf8");

    expect(source).toMatch(
      /disabled=\{!currentLevel \|\| !currentSeries\}[\s\S]{0,180}changeLevelBy\(-1\)/u,
    );
    expect(source).toMatch(
      /disabled=\{!currentLevel \|\| !currentSeries\}[\s\S]{0,180}changeLevelBy\(1\)/u,
    );
    expect(source).toMatch(
      /disabled=\{!replaysSupported \|\| !currentLevel \|\| !currentSeries\}[\s\S]{0,220}importReplayForCurrentLevel\(\)/u,
    );
  });
});
