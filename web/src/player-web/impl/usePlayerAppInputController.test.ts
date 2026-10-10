import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { InteractiveInput } from "@game-core/api/command";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { DirectionInput } from "@player-web/impl/legacyInput";
import type { DihedralOrientation } from "@player-web/impl/specialModesSettings";

// Exercise the real controller, input buffers, and clock pump in Node. Only
// React mounting and browser event/worker delivery are supplied by the harness.
const reactHarness = vi.hoisted(() => ({ cleanups: [] as Array<() => void> }));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => {
    const cleanup = effect();
    if (cleanup) reactHarness.cleanups.push(cleanup);
  },
  useEffectEvent: <Arguments extends unknown[], Result>(callback: (...args: Arguments) => Result) => callback,
  useRef: <Value>(initialValue: Value) => ({ current: initialValue }),
}));

import { usePlayerAppInputController } from "@player-web/impl/usePlayerAppInputController";

class TestClockWorker {
  static current: TestClockWorker;
  onmessage: ((event: MessageEvent<{ type: "pulse" }>) => void) | null = null;

  constructor() { TestClockWorker.current = this; }
  postMessage(): void {}
  terminate(): void {}
  pulse(): void { this.onmessage?.({ data: { type: "pulse" } } as MessageEvent<{ type: "pulse" }>); }
}

function session(ruleset: "MS" | "Lynx" | "Hybrid"): InteractiveGameSession {
  return {
    request: { seriesFile: "input-test", levelNumber: 1, ruleset },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick", input: "none", inputCode: 0, status: "playing",
        tick: 0, currentTime: 0, timeOffset: 0, secondsPlayed: 0, timelimit: 0,
        chipsNeeded: 0, statusFlags: 0, lastMoveCode: 0, lastMove: "none", stepping: 0,
        initRandomSlideDir: "north", replayCursor: 0,
        randomState: { main: { initial: "0", value: "0", shared: false }, lynx: { prng1: 0, prng2: 0 } },
        soundEffects: 0, view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0], tools: [] },
        chip: null, creatureCount: 0, creaturesHash: "", mapHash: "", creatures: [],
      },
      cells: [],
      currentZ: 1,
      visibleLayers: [],
      tileOverlays: [],
      render: null,
    },
    history: {
      enabled: false, initialTick: -1, currentTick: 0, latestTick: 0,
      previousTick: null, previousCheckpointTick: null, timelineId: "main", timelineCount: 1,
      restoreMode: "live", restoredFromTick: null, replayTargetTick: null,
    },
    run: { undoUsedCount: 0, replayAvailable: false, result: null },
    handle: {} as InteractiveGameSession["handle"],
  };
}

function mountController(ruleset: "MS" | "Lynx" | "Hybrid", inputOrientation: DihedralOrientation = "identity", aiInput?: { nextInput(): number | null; takeOver(): void }) {
  let nowMs = 0;
  const inputs: InteractiveInput[] = [];
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", { activeElement: null });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("performance", { now: () => nowMs });
  vi.stubGlobal("Worker", TestClockWorker);

  const controller = usePlayerAppInputController({
    mode: "game", selectedSeriesFile: "input-test", usesModernGameUi: true, isMobileChrome: true,
    isPaused: false, isRunning: true, isSessionLoading: false,
    showHelp: false, showSoundControls: false, showHistoryControls: false,
    showReplayMenu: false, showAdvancedMenu: false, showManageReplays: false,
    mobileSheet: null, message: null, manualRunStarted: true,
    setManualRunStarted: vi.fn(), setIsRunning: vi.fn(),
    isFastForwarding: false, setIsFastForwarding: vi.fn(),
    heldUndoMode: null, setHeldUndoMode: vi.fn(), undoKeyBinding: "Z", action1KeyBinding: "C",
    allowTakeoverDuringHistoricalReplay: false, canResumeOriginalTimeline: false,
    sessionStatus: "playing", liveSessionRef: { current: session(ruleset) },
    advanceTick: async (input) => { inputs.push(input); },
    performModernUndo: () => false,
    resumeOriginalTimelineFromSpace: vi.fn(), resumeLivePlayFromRestore: vi.fn(), toggleModernPause: vi.fn(),
    undoPreviousCheckpoint: vi.fn(), undoPreviousTick: vi.fn(), undoPreviousTickBurst: vi.fn(),
    activateSeries: vi.fn(), changeSelectedSeriesBy: vi.fn(), jumpSelectedSeries: vi.fn(),
    proceedAfterLevelEnd: vi.fn(), restartCurrentLevel: vi.fn(), exitCurrentGame: vi.fn(),
    changeLevelBy: vi.fn(), jumpLevel: vi.fn(), toggleHelp: vi.fn(), closeHelp: vi.fn(),
    closeSoundControls: vi.fn(), closeHistoryControls: vi.fn(), setShowReplayMenu: vi.fn(),
    setShowAdvancedMenu: vi.fn(), focusGameplaySurface: vi.fn(), unlockSound: vi.fn(), inputOrientation, aiInput,
  });

  const keyboard = (type: "keydown" | "keyup", key: string) => {
    events.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), {
      key, code: key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, repeat: false,
    }));
  };
  const pointer = (pointerId: number, type: string) => ({
    pointerId, type, preventDefault() {}, stopPropagation() {}, currentTarget: { setPointerCapture() {} },
  }) as unknown as ReactPointerEvent<HTMLElement>;

  return {
    inputs,
    controller,
    keyDown: (key: string) => keyboard("keydown", key),
    keyUp: (key: string) => keyboard("keyup", key),
    touchDown: (direction: DirectionInput, pointerId: number) => controller.handleMobileDirectionPointerDown(direction, pointer(pointerId, "pointerdown")),
    touchUp: (pointerId: number) => controller.handleMobileDirectionPointerEnd(pointer(pointerId, "pointerup")),
    touchCancel: (pointerId: number, type = "pointercancel") => controller.handleMobileDirectionPointerEnd(pointer(pointerId, type)),
    blur: () => events.dispatchEvent(new Event("blur")),
    async poll(count = 1) {
      for (let index = 0; index < count; index += 1) {
        nowMs += ruleset === "Hybrid" ? 25 : 50;
        TestClockWorker.current.pulse();
        // advanceTick resolves immediately; yield to the clock pump continuation.
        await Promise.resolve();
      }
    },
  };
}

afterEach(() => {
  for (const cleanup of reactHarness.cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
});

describe("shared directional input release", () => {
  it.each(["MS", "Lynx"] as const)("preserves a between-poll keyboard tap in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.keyDown("ArrowRight");
    app.keyUp("ArrowRight");
    await app.poll(2);
    expect(app.inputs).toEqual([8, 0]);
  });

  it.each(["MS", "Lynx"] as const)("preserves a between-poll phone tap in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.touchDown("east", 1);
    app.touchUp(1);
    await app.poll(2);
    expect(app.inputs).toEqual([8, 0]);
  });

  it.each(["keyboard", "phone"] as const)("does not restart MS repeat timing when releasing an overlapping %s direction", async (source) => {
    const app = mountController("MS");
    if (source === "keyboard") app.keyDown("ArrowRight");
    else app.touchDown("east", 1);
    await app.poll();
    if (source === "keyboard") app.keyDown("ArrowUp");
    else app.touchDown("north", 2);
    await app.poll();
    if (source === "keyboard") app.keyUp("ArrowUp");
    else app.touchUp(2);
    await app.poll(4);
    expect(app.inputs).toEqual([8, 1, 0, 0, 8, 8]);
  });

  it.each(["MS", "Lynx"] as const)("continues walking while held and stops supplying input on release in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.keyDown("ArrowRight");
    await app.poll(7);
    app.keyUp("ArrowRight");
    await app.poll(2);
    expect(app.inputs).toEqual(ruleset === "MS" ? [8, 0, 0, 8, 8, 8, 8, 0, 0] : [8, 8, 8, 8, 8, 8, 8, 0, 0]);
  });

  it("releases the mapped direction on a rotated board", async () => {
    const app = mountController("MS", "rotate-90");
    app.keyDown("ArrowLeft");
    await app.poll();
    app.keyDown("ArrowUp");
    await app.poll();
    app.keyUp("ArrowUp");
    await app.poll(3);
    app.keyUp("ArrowLeft");
    await app.poll();
    expect(app.inputs).toEqual([4, 2, 0, 0, 4, 0]);
  });

  it("preserves the Hybrid sample window across a phone release", async () => {
    const app = mountController("Hybrid");
    await app.poll(2);
    app.touchDown("east", 1);
    app.touchUp(1);
    await app.poll(7);
    expect(app.inputs).toEqual([0, 0, 2, 2, 2, 2, 2, 2, 0]);
  });

  it.each(["MS", "Lynx", "Hybrid"] as const)("discards pending taps on focus loss in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.touchDown("east", 1);
    app.keyDown("ArrowUp");
    app.blur();
    await app.poll(5);
    expect(app.inputs).toEqual([0, 0, 0, 0, 0]);
  });

  describe.each(["MS", "Lynx", "Hybrid"] as const)("%s phone cancellation", (ruleset) => {
    it("discards an unpolled touch when a sheet resets mobile input", async () => {
      const app = mountController(ruleset);
      app.touchDown("east", 1);
      app.controller.resetMobileDirectionalInputState();
      await app.poll(5);
      expect(app.inputs).toEqual([0, 0, 0, 0, 0]);
    });

    it.each(["pointercancel", "lostpointercapture"])("discards an active touch on %s", async (type) => {
      const app = mountController(ruleset);
      app.touchDown("east", 1);
      app.touchCancel(1, type);
      await app.poll(5);
      expect(app.inputs).toEqual([0, 0, 0, 0, 0]);
    });

    it("keeps a completed tap when pointer capture is lost after pointerup", async () => {
      const app = mountController(ruleset);
      app.touchDown("east", 1);
      app.touchUp(1);
      app.touchCancel(1, "lostpointercapture");
      await app.poll(5);
      expect(app.inputs).toEqual(ruleset === "Hybrid" ? [2, 2, 2, 2, 0] : [8, 0, 0, 0, 0]);
    });
  });

  it("keeps the remaining MS hold's repeat timing when a touch is canceled", async () => {
    const app = mountController("MS");
    app.touchDown("east", 1);
    await app.poll();
    app.touchDown("north", 2);
    app.touchCancel(2);
    await app.poll(3);
    expect(app.inputs).toEqual([8, 0, 0, 8]);
  });

  it("removes a canceled Hybrid direction from the pending logic window", async () => {
    const app = mountController("Hybrid");
    await app.poll(2);
    app.touchDown("east", 1);
    await app.poll();
    app.touchCancel(1);
    await app.poll(6);
    expect(app.inputs).toEqual([0, 0, 2, 0, 0, 0, 0, 0, 0]);
  });

  it("preserves the other Hybrid direction and sample phase during cancellation", async () => {
    const app = mountController("Hybrid");
    await app.poll(2);
    app.touchDown("north", 1);
    await app.poll();
    app.touchDown("east", 2);
    await app.poll();
    app.touchCancel(2);
    await app.poll();
    app.touchUp(1);
    await app.poll(4);
    expect(app.inputs).toEqual([0, 0, 1, 5, 1, 1, 1, 1, 0]);
  });
});


describe("AI ownership at the actual player clock", () => {
  it.each(["keyboard", "phone", "blur"] as const)("releases AI input before %s takeover", async (source) => {
    let owned = true;
    const app = mountController("Lynx", "identity", {
      nextInput: () => owned ? 8 : null,
      takeOver: () => { owned = false; },
    });
    await app.poll();
    expect(app.inputs).toEqual([8]);
    if (source === "keyboard") app.keyDown("ArrowUp");
    else if (source === "phone") app.touchDown("north", 1);
    else app.blur();
    await app.poll();
    expect(app.inputs).toEqual([8, source === "blur" ? 0 : 1]);
  });
});
