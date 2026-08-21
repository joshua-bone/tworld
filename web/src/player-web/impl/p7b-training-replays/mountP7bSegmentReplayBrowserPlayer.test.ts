import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  P7bSegmentReplayBrowserPlayer,
  type P7bSegmentReplayBrowserPlayerProps,
} from "./P7bSegmentReplayBrowserPlayer";
import { mountP7bSegmentReplayBrowserPlayer } from "./mountP7bSegmentReplayBrowserPlayer";
import type { P7bReplayBrowserManifestV1 } from "./p7bReplayBrowserRuntime";

const reactRoot = vi.hoisted(() => ({
  createRoot: vi.fn(),
  render: vi.fn(),
  unmount: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: reactRoot.createRoot,
}));

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
  const available = (executionTarget: "ms" | "lynx") => ({
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
    authoredDecisionCount: 2,
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
      playerModuleHref: "../../assets/p7b-replay-player.js",
      initialSelection: { executionTarget: "ms", variant: "portable" },
      variants: [{
        id: "portable",
        label: "Sanitized",
        description: "Portable candidate",
        segments: [{ id: "route", ordinal: 1, title: "Reach the exit" }],
      }],
      executionTargets: [{ id: "ms", label: "MS" }, { id: "lynx", label: "Lynx" }],
      combinations: [available("ms"), available("lynx")],
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

const originalDocument = globalThis.document;

afterEach(() => {
  reactRoot.createRoot.mockReset();
  reactRoot.render.mockReset();
  reactRoot.unmount.mockReset();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("P7B replay browser mount", () => {
  it("loads only compact metadata, replaces the static shell, and renders the real player component", async () => {
    reactRoot.createRoot.mockReturnValue({
      render: reactRoot.render,
      unmount: reactRoot.unmount,
    });
    const status = { textContent: "Replay assets are not loaded." } as HTMLElement;
    const root = {
      getAttribute: vi.fn(() => "levels/001/browser-level.json"),
      querySelector: vi.fn(() => status),
      replaceWith: vi.fn(),
    } as unknown as HTMLElement;
    const host = { setAttribute: vi.fn() } as unknown as HTMLElement;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: vi.fn(() => host) },
    });
    const fetchText = vi.fn(async () => JSON.stringify(manifest()));

    const mounted = await mountP7bSegmentReplayBrowserPlayer({
      root,
      services: {
        engines: {} as BrowserAppServices["engines"],
        preloadGameRequest: vi.fn(),
      },
      fetchText,
    });

    expect(fetchText).toHaveBeenCalledTimes(1);
    expect(fetchText).toHaveBeenCalledWith("levels/001/browser-level.json");
    expect(status.textContent).toBe("Loading compact replay metadata…");
    expect(host.setAttribute).toHaveBeenCalledWith("data-p7b-replay-react-root", "true");
    expect(root.replaceWith).toHaveBeenCalledWith(host);
    expect(reactRoot.createRoot).toHaveBeenCalledWith(host);
    const element = reactRoot.render.mock.calls[0]![0] as ReactElement<
      P7bSegmentReplayBrowserPlayerProps
    >;
    expect(element.type).toBe(P7bSegmentReplayBrowserPlayer);
    expect(element.props.manifest.presentation.variants[0].segments[0].id).toBe("route");
    expect(mounted.manifestHref).toBe("levels/001/browser-level.json");

    mounted.unmount();
    expect(reactRoot.unmount).toHaveBeenCalledOnce();
  });
});
