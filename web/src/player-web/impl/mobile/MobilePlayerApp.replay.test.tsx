// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { serializeSolutionFile } from "@content/api/solution-file";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import { MobilePlayerApp } from "./MobilePlayerApp";

const fixtures = vi.hoisted(() => ({
  selection: { seriesFile: "Jacques-MS.dac", levelNumber: 937 },
  player: vi.fn(),
}));
vi.mock("@player-web/impl/PlayerApp", () => ({ PlayerApp: (props: unknown) => { fixtures.player(props); return null; } }));
vi.mock("@player-web/impl/loadPlayableSelection", () => ({ loadPlayableSelection: async () => null }));
vi.mock("@player-web/impl/urlLaunch", () => ({ resolveUrlLaunchSelection: async () => ({ selection: fixtures.selection, overrideApplied: true, message: null }) }));
vi.mock("@player-web/impl/loadBrowserPlayableCatalog", () => ({ loadModernBootstrapPlayableCatalog: async () => [{ filebase: "Jacques-MS.dac", ruleset: "MS", levels: [{ number: 937, password: "ABCD", name: "The Bomb Squad" }] }] }));
let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  fixtures.player.mockClear();
  vi.unstubAllGlobals();
});

it("passes the validated replay into the mobile player on its first mount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/mobile?set=Jacques&ruleset=MS&level=937&replay=dev/937.tws");
  const bytes = serializeSolutionFile({ ruleset: "MS", flags: 0, extraHeader: new Uint8Array(), setName: null, entries: [{ levelNumber: 937, password: "ABCD", bestTimeTicks: 4, solutionData: null, expandedSolution: { flags: 0, randomSlideDirection: 1, stepping: 2, randomSeed: 42, moves: [{ when: 0, dir: 8 }] } }] });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => bytes.buffer })));
  root = createRoot(document.createElement("div"));
  await act(async () => root!.render(<MobilePlayerApp services={{ selectionStore: {} } as BrowserAppServices} onOpenClassic={() => {}} onOpenDesktop={() => {}} />));
  expect(fixtures.player).toHaveBeenCalled();
  expect(fixtures.player.mock.calls[0]?.[0]).toMatchObject({ initialMode: "game", initialSelection: fixtures.selection, initialReplayLaunch: { ...fixtures.selection, launch: { kind: "legacy", replay: { stepping: 2, randomSeed: 42 } } } });
});
