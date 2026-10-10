// @vitest-environment jsdom
import { act, type PointerEvent as ReactPointerEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import { createEmptyCells, createLevel, createRequest, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { usePlayerAppInputController } from "./usePlayerAppInputController";

// Keep React's real render/effect lifecycle. Only the clock worker is driven
// manually, so UI refreshes can be interleaved with actual MS engine ticks.
class ClockWorker {
  static current: ClockWorker;
  onmessage: ((event: MessageEvent) => void) | null = null;
  constructor() { ClockWorker.current = this; }
  postMessage() {}
  terminate() {}
  pulse() { this.onmessage?.({ data: { type: "pulse" } } as MessageEvent); }
}

let root: Root | null = null;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function mountGame() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("Worker", ClockWorker);
  let now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const cells = createEmptyCells();
  const start = pos(8, 16);
  cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
  const request = createRequest();
  let engine = createMsInteractiveSession(request, createLevel({ cells, creaturePositions: [start] }));
  const liveSessionRef: { current: InteractiveGameSession } = { current: {
    request, mode: "manual", hintText: null, frame: projectMsInteractiveFrame(engine, "initial"),
    history: {
      enabled: false, initialTick: -1, currentTick: 0, latestTick: 0,
      previousTick: null, previousCheckpointTick: null, timelineId: "main", timelineCount: 1,
      restoreMode: "live", restoredFromTick: null, replayTargetTick: null,
    },
    run: { undoUsedCount: 0, replayAvailable: false, result: null },
    handle: {} as InteractiveGameSession["handle"],
  } };
  const moves: number[] = [];
  const options: Parameters<typeof usePlayerAppInputController>[0] = {
    mode: "game", selectedSeriesFile: "input-test", usesModernGameUi: true, isMobileChrome: true,
    isPaused: false, isRunning: true, isSessionLoading: false,
    showHelp: false, showSoundControls: false, showHistoryControls: false,
    showReplayMenu: false, showAdvancedMenu: false, showManageReplays: false,
    mobileSheet: null, message: null, manualRunStarted: true,
    setManualRunStarted: vi.fn(), setIsRunning: vi.fn(),
    isFastForwarding: false, setIsFastForwarding: vi.fn(),
    heldUndoMode: null, setHeldUndoMode: vi.fn(), undoKeyBinding: "Z", action1KeyBinding: "C",
    allowTakeoverDuringHistoricalReplay: false, canResumeOriginalTimeline: false,
    sessionStatus: "playing", liveSessionRef,
    advanceTick: async (input) => {
      if (typeof input !== "number") throw new Error("Expected MS input");
      const before = engine.state.internal.chipPos;
      engine = advanceMsInteractiveSession(engine, input);
      liveSessionRef.current = { ...liveSessionRef.current, frame: projectMsInteractiveFrame(engine, "tick") };
      if (engine.state.internal.chipPos !== before) moves.push(now);
    },
    performModernUndo: () => false,
    resumeOriginalTimelineFromSpace: vi.fn(), resumeLivePlayFromRestore: vi.fn(), toggleModernPause: vi.fn(),
    undoPreviousCheckpoint: vi.fn(), undoPreviousTick: vi.fn(), undoPreviousTickBurst: vi.fn(),
    activateSeries: vi.fn(), changeSelectedSeriesBy: vi.fn(), jumpSelectedSeries: vi.fn(),
    proceedAfterLevelEnd: vi.fn(), restartCurrentLevel: vi.fn(), exitCurrentGame: vi.fn(),
    changeLevelBy: vi.fn(), jumpLevel: vi.fn(), toggleHelp: vi.fn(), closeHelp: vi.fn(),
    closeSoundControls: vi.fn(), closeHistoryControls: vi.fn(), setShowReplayMenu: vi.fn(),
    setShowAdvancedMenu: vi.fn(), focusGameplaySurface: vi.fn(), unlockSound: vi.fn(),
  };
  let controller!: ReturnType<typeof usePlayerAppInputController>;
  function Game() { controller = usePlayerAppInputController(options); return null; }
  root = createRoot(document.createElement("div"));
  const render = async () => { await act(async () => root!.render(<Game />)); };
  await render();
  const keyboard = (type: string) => window.dispatchEvent(new KeyboardEvent(type, { key: "ArrowRight", bubbles: true }));
  const pointer = (type: string) => ({
    pointerId: 1, type, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {} },
  }) as unknown as ReactPointerEvent<HTMLElement>;
  return {
    moves, options, render,
    position: () => engine.state.internal.chipPos,
    press(source: "keyboard" | "phone") {
      act(() => {
        if (source === "keyboard") keyboard("keydown");
        else controller.handleMobileDirectionPointerDown("east", pointer("pointerdown"));
      });
    },
    release(source: "keyboard" | "phone") {
      act(() => {
        if (source === "keyboard") keyboard("keyup");
        else controller.handleMobileDirectionPointerEnd(pointer("pointerup"));
      });
    },
    async runUntil(end: number) {
      // Real app state is published to React every 125 ms, independently of
      // its 55 ms simulation ticks. Renders must never become new presses.
      while (now < end) {
        now += 1;
        if (now % 55 === 0) await act(async () => ClockWorker.current.pulse());
        if (now % 125 === 0) await render();
      }
    },
  };
}

it.each(["keyboard", "phone"] as const)("keeps a short %s hold to one tile across real React updates", async (source) => {
  const game = await mountGame();
  game.press(source);
  await game.runUntil(275);
  game.release(source);
  await game.runUntil(700);
  expect(game.position()).toBe(pos(9, 16));
  expect(game.moves).toEqual([55]);
});

it.each(["keyboard", "phone"] as const)("preserves continuous %s repeat timing through React updates", async (source) => {
  const game = await mountGame();
  game.press(source);
  await game.runUntil(1100);
  game.release(source);
  await game.runUntil(1500);
  expect(game.moves).toEqual([55, 385, 605, 825, 1045]);
});

it.each(["keyboard", "phone"] as const)("does not erase a quick %s tap when React renders before the next tick", async (source) => {
  const game = await mountGame();
  game.press(source);
  game.release(source);
  await game.render();
  await game.runUntil(500);
  expect(game.position()).toBe(pos(9, 16));
});

it("still remaps a held direction when the board orientation actually changes", async () => {
  const game = await mountGame();
  game.press("keyboard");
  await game.runUntil(220);
  game.options.inputOrientation = "rotate-180";
  await game.render();
  await game.runUntil(440);
  game.release("keyboard");
  expect(game.position()).toBe(pos(8, 16));
});

it("still releases and restores a held direction when input is frozen and unfrozen", async () => {
  const game = await mountGame();
  game.press("keyboard");
  await game.runUntil(55);
  game.options.inputFrozen = true;
  await game.render();
  await game.runUntil(440);
  expect(game.position()).toBe(pos(9, 16));
  game.options.inputFrozen = false;
  await game.render();
  await game.runUntil(495);
  game.release("keyboard");
  expect(game.position()).toBe(pos(10, 16));
});
