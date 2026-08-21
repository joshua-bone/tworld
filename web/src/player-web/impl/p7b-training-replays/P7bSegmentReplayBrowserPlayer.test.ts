import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  P7bSegmentReplayBrowserPlayer,
  resolveP7bReplayKeyboardAction,
} from "./P7bSegmentReplayBrowserPlayer";
import type { P7bReplayBrowserManifestV1 } from "./p7bReplayBrowserRuntime";

function manifest(): P7bReplayBrowserManifestV1 {
  const level = {
    index: 0,
    number: 1,
    name: "Key Pyramid",
    author: "",
    password: "QWER",
    timeLimitSeconds: 100,
    chipsRequired: 0,
    bestTimeTicks: 10,
    levelSize: 1,
    solutionSize: 1,
    levelHash: "level",
    gameplayHash: "gameplay",
    hasSolution: true,
    sgflags: 0,
    unsolvable: null,
  };
  const portable = (executionTarget: "ms" | "lynx") => ({
    availability: "available" as const,
    transport: "manual-held-schedule" as const,
    decisionProfile: {
      cadenceHz: 10,
      clockBasis: "portable-decision" as const,
      profileId: "hybridcc-candidate-10hz-v1",
    },
    executionTarget,
    nativeTickRateHz: 20,
    nativeBoundaryClock: "exclusive-advance-count-v1" as const,
    terminalNativeTick: 3,
    authoredDecisionCount: 3,
    executedDecisionCount: 2,
    provenanceLabel: "Portable candidate",
    replayHref: `portable-${executionTarget}.json`,
    replayContent: { digest: `sha256:${"0".repeat(64)}` as const, byteLength: 1 },
    segmentSpans: [{
      segmentId: "route",
      startNativeTick: 0,
      endNativeTick: 3,
      startDecisionOrdinal: 0,
      endDecisionOrdinal: 2,
    }],
    variant: "portable" as const,
  });
  return {
    artifact: "ccsolver-p7b-replay-browser-level",
    version: 1,
    presentation: {
      packId: "cclp1",
      levelNumber: 1,
      title: "Key Pyramid",
      sourceHref: "source.json",
      levelManifestHref: "browser-level.json",
      playerModuleHref: "player.js",
      initialSelection: { executionTarget: "ms", variant: "portable" },
      variants: [{
        id: "portable",
        label: "Sanitized",
        description: "Portable candidate",
        segments: [{ id: "route", ordinal: 1, title: "Reach the exit" }],
      }],
      executionTargets: [{ id: "ms", label: "MS" }, { id: "lynx", label: "Lynx" }],
      combinations: [portable("ms"), portable("lynx")],
    },
    targets: {
      ms: {
        request: { seriesFile: "CCLP1-MS.dac", levelNumber: 1, ruleset: "MS" },
        display: { seriesName: "CCLP1 MS", mapFilename: "CCLP1.dat", level },
      },
      lynx: {
        request: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1, ruleset: "Lynx" },
        display: { seriesName: "CCLP1 Lynx", mapFilename: "CCLP1.dat", level },
      },
    },
  };
}

function manifestWithUnavailableRawVariant(): P7bReplayBrowserManifestV1 {
  const base = manifest();
  return {
    ...base,
    presentation: {
      ...base.presentation,
      variants: [
        ...base.presentation.variants,
        {
          id: "raw-ms",
          label: "Raw MS",
          description: "Original MS replay",
          segments: [],
        },
      ],
      combinations: [
        ...base.presentation.combinations,
        {
          availability: "unavailable",
          certificationStatus: "failed",
          executionTarget: "ms",
          reason: "MS certification failed",
          variant: "raw-ms",
        },
        {
          availability: "unavailable",
          certificationStatus: "failed",
          executionTarget: "lynx",
          reason: "Lynx certification failed",
          variant: "raw-ms",
        },
      ],
    },
  };
}

describe("P7B mounted replay player", () => {
  it("renders the real control wiring without fetching or autoplaying during mount", () => {
    const fetchText = vi.fn();
    const html = renderToStaticMarkup(createElement(P7bSegmentReplayBrowserPlayer, {
      manifest: manifest(),
      services: {
        engines: {} as BrowserAppServices["engines"],
        preloadGameRequest: vi.fn(),
      },
      fetchText,
      MapRenderer: () => createElement("div", { "data-fake-map": true }, "map"),
    }));

    expect(fetchText).not.toHaveBeenCalled();
    expect(html).toContain('data-autoplay="false"');
    expect(html).toContain('data-p7b-replay-player-mounted="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="Play replay segment"');
    expect(html).toContain('aria-label="Advance one native tick"');
    expect(html).toContain('type="range"');
    expect(html).toContain("hybridcc-candidate-10hz-v1");
    expect(html).toContain("Portable decisions · 10 Hz; native execution · 20 Hz");
    expect(html).toContain("Decision counts");
    expect(html).toContain("Authored decisions: 3 · Executed decisions: 2");
    expect(html).toContain("Focus this player");
    expect(html).toContain('data-fake-map="true"');
  });

  it("disables variants without certified semantic segments", () => {
    const html = renderToStaticMarkup(createElement(P7bSegmentReplayBrowserPlayer, {
      manifest: manifestWithUnavailableRawVariant(),
      services: {
        engines: {} as BrowserAppServices["engines"],
        preloadGameRequest: vi.fn(),
      },
      fetchText: vi.fn(),
      MapRenderer: () => createElement("div", { "data-fake-map": true }, "map"),
    }));

    expect(html).toMatch(
      /<input(?=[^>]*disabled="")(?=[^>]*type="radio")(?=[^>]*value="raw-ms")[^>]*>/u,
    );
    expect(html).toContain("Original MS replay · No certified segments");
  });

  it("scopes keyboard shortcuts away from editable and native-control targets", () => {
    expect(resolveP7bReplayKeyboardAction({ key: " ", targetTagName: "CANVAS" }))
      .toBe("toggle-playback");
    expect(resolveP7bReplayKeyboardAction({ key: ".", targetTagName: "DIV" })).toBe("step");
    expect(resolveP7bReplayKeyboardAction({ key: "]", targetTagName: "DIV" })).toBe("next-segment");
    expect(resolveP7bReplayKeyboardAction({ key: " ", targetTagName: "BUTTON" })).toBeNull();
    expect(resolveP7bReplayKeyboardAction({ key: "r", targetTagName: "INPUT" })).toBeNull();
    expect(resolveP7bReplayKeyboardAction({ key: "r", targetIsContentEditable: true })).toBeNull();
    expect(resolveP7bReplayKeyboardAction({ key: "r", ctrlKey: true })).toBeNull();
  });
});
