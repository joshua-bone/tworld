import { afterEach, describe, expect, it, vi } from "vitest";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { InteractiveInput } from "@game-core/api/command";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { DirectionInput } from "@player-web/impl/legacyInput";
import type { DihedralOrientation } from "@player-web/impl/specialModesSettings";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { createEmptyCells, createLevel, createRequest, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";

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

function mountController(ruleset: "MS" | "Lynx" | "Hybrid", inputOrientation: DihedralOrientation = "identity", aiInput?: { nextInput(): number | null; takeOver(): void }, isFastForwarding = false, onAdvance?: (input: InteractiveInput) => void) {
  let nowMs = 0;
  const inputs: InteractiveInput[] = [];
  const events = new EventTarget();
  vi.stubGlobal("window", events);
  vi.stubGlobal("document", { activeElement: null });
  vi.stubGlobal("HTMLElement", class {});
  vi.stubGlobal("performance", { now: () => nowMs });
  vi.stubGlobal("Worker", TestClockWorker);
  const liveSession = session(ruleset);

  const controller = usePlayerAppInputController({
    mode: "game", selectedSeriesFile: "input-test", usesModernGameUi: true, isMobileChrome: true,
    isPaused: false, isRunning: true, isSessionLoading: false,
    showHelp: false, showSoundControls: false, showHistoryControls: false,
    showReplayMenu: false, showAdvancedMenu: false, showManageReplays: false,
    mobileSheet: null, message: null, manualRunStarted: true,
    setManualRunStarted: vi.fn(), setIsRunning: vi.fn(),
    isFastForwarding, setIsFastForwarding: vi.fn(),
    heldUndoMode: null, setHeldUndoMode: vi.fn(), undoKeyBinding: "Z", action1KeyBinding: "C",
    allowTakeoverDuringHistoricalReplay: false, canResumeOriginalTimeline: false,
    sessionStatus: "playing", liveSessionRef: { current: liveSession },
    advanceTick: async (input) => { inputs.push(input); onAdvance?.(input); },
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
  const bounds = {
    north: { left: 100, right: 180, top: 0, bottom: 80 },
    west: { left: 0, right: 80, top: 100, bottom: 180 },
    south: { left: 100, right: 180, top: 100, bottom: 180 },
    east: { left: 200, right: 280, top: 100, bottom: 180 },
  };
  const buttons = Object.entries(bounds).map(([direction, rect]) => ({
    dataset: { mobileDirection: direction },
    getBoundingClientRect: () => rect,
    closest: () => ({ querySelectorAll: () => buttons }),
    setPointerCapture() {},
  }));
  const captures = new Map<number, typeof buttons[number]>();
  const pointer = (pointerId: number, type: string, clientX = 0, clientY = 0) => ({
    pointerId, type, clientX, clientY, preventDefault() {}, stopPropagation() {}, currentTarget: captures.get(pointerId),
  }) as unknown as ReactPointerEvent<HTMLElement>;
  const elapse = async (milliseconds: number) => {
    nowMs += milliseconds;
    TestClockWorker.current.pulse();
    // advanceTick resolves immediately; yield to the clock pump continuation.
    await Promise.resolve();
  };

  return {
    liveSession,
    inputs,
    controller,
    keyDown: (key: string) => keyboard("keydown", key),
    keyUp: (key: string) => keyboard("keyup", key),
    touchDown: (direction: DirectionInput, pointerId: number) => {
      captures.set(pointerId, buttons.find((button) => button.dataset.mobileDirection === direction)!);
      controller.handleMobileDirectionPointerDown(direction, pointer(pointerId, "pointerdown"));
    },
    touchMove: (pointerId: number, x: number, y: number) => controller.handleMobileDirectionPointerMove(pointer(pointerId, "pointermove", x, y)),
    touchUp: (pointerId: number) => controller.handleMobileDirectionPointerEnd(pointer(pointerId, "pointerup")),
    touchCancel: (pointerId: number, type = "pointercancel") => controller.handleMobileDirectionPointerEnd(pointer(pointerId, type)),
    blur: () => events.dispatchEvent(new Event("blur")),
    elapse,
    async poll(count = 1) {
      for (let index = 0; index < count; index += 1) {
        await elapse((ruleset === "Hybrid" ? 25 : ruleset === "MS" ? 55 : 50) / (isFastForwarding ? 2 : 1));
      }
    },
  };
}

afterEach(() => {
  for (const cleanup of reactHarness.cleanups.splice(0).reverse()) cleanup();
  vi.unstubAllGlobals();
});

describe("shared directional input release", () => {
  it.each([9, 10, 11, 12, 13, 14, 15, 16])("takes a one-tile force-floor exit at x=%i while north is held", async (gap) => {
    const cells = createEmptyCells();
    const start = pos(7, 16);
    for (let x = 8; x < 30; x += 1) {
      cells[pos(x, 16)]!.top.id = MS_TILE.Slide_East;
      if (x !== gap) cells[pos(x, 15)]!.top.id = MS_TILE.Wall;
    }
    cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    let engine = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    engine = advanceMsInteractiveSession(engine, 8); // Enter the force floor so it is active.
    const syncFrame = () => {
      app.liveSession.frame.snapshot = engineStateToSnapshot(engine.state.engine, "tick", engine.lastInput);
      app.liveSession.frame.cells = engine.state.engine.map.cells;
    };
    const app = mountController("MS", "identity", undefined, false, (input) => {
      if (typeof input !== "number") throw new Error("Expected numeric input");
      engine = advanceMsInteractiveSession(engine, input);
      syncFrame();
    });
    syncFrame();
    app.keyDown("ArrowUp");
    await app.poll(20);
    expect(engine.state.internal.chipPos % 32).toBe(gap);
    expect(Math.floor(engine.state.internal.chipPos / 32)).toBeLessThan(16);
  });

  it.each(["keyboard", "phone"] as const)("gives a short MS %s hold one real step, then stops", async (source) => {
    const cells = createEmptyCells();
    const start = pos(8, 16);
    cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    let engine = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    const app = mountController("MS", "identity", undefined, false, (input) => {
      if (typeof input !== "number") throw new Error("Expected numeric input");
      engine = advanceMsInteractiveSession(engine, input);
    });
    if (source === "keyboard") app.keyDown("ArrowRight");
    else app.touchDown("east", 1);
    await app.poll(5); // 275 ms held; the old controls have already taken two steps.
    if (source === "keyboard") app.keyUp("ArrowRight");
    else app.touchUp(1);
    await app.poll(8);
    expect(engine.state.internal.chipPos).toBe(pos(9, 16));
  });

  it.each([[MS_TILE.Ice, 0], [MS_TILE.Slide_East, 1]])("keeps the repeat delay when boots neutralize floor %i", async (floor, boot) => {
    const cells = createEmptyCells();
    const start = pos(8, 16);
    for (let x = 8; x < 20; x += 1) cells[pos(x, 16)]!.top.id = floor;
    cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[start]!.bottom.id = floor;
    let engine = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    engine.state.engine.inventory.boots[boot] = 1;
    const syncFrame = () => {
      app.liveSession.frame.snapshot = engineStateToSnapshot(engine.state.engine, "tick", engine.lastInput);
      app.liveSession.frame.cells = engine.state.engine.map.cells;
    };
    const app = mountController("MS", "identity", undefined, false, (input) => {
      if (typeof input !== "number") throw new Error("Expected numeric input");
      engine = advanceMsInteractiveSession(engine, input);
      syncFrame();
    });
    syncFrame();
    app.keyDown("ArrowRight");
    await app.poll(6);
    expect(engine.state.internal.chipPos).toBe(pos(9, 16));
  });

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
    await app.poll(5);
    expect(app.inputs).toEqual([8, 1, 0, 0, 0, 0, 8]);
  });

  it.each(["MS", "Lynx"] as const)("continues walking while held and stops supplying input on release in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.keyDown("ArrowRight");
    await app.poll(7);
    app.keyUp("ArrowRight");
    await app.poll(2);
    expect(app.inputs).toEqual(ruleset === "MS" ? [8, 1568, 1568, 1568, 1568, 1568, 8, 0, 0] : [8, 8, 8, 8, 8, 8, 8, 0, 0]);
  });

  it("releases the mapped direction on a rotated board", async () => {
    const app = mountController("MS", "rotate-90");
    app.keyDown("ArrowLeft");
    await app.poll();
    app.keyDown("ArrowUp");
    await app.poll();
    app.keyUp("ArrowUp");
    await app.poll(5);
    app.keyUp("ArrowLeft");
    await app.poll();
    expect(app.inputs).toEqual([4, 2, 0, 0, 0, 0, 4, 0]);
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
    await app.poll(6);
    expect(app.inputs).toEqual([8, 1568, 1568, 1568, 1568, 1568, 8]);
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

describe("native ruleset clock timing", () => {
  it.each([false, true])("uses 55 ms MS ticks with AI controls present=%s", async (withAi) => {
    const app = mountController("MS", "identity", withAi ? { nextInput: () => null, takeOver() {} } : undefined);
    app.keyDown("ArrowRight");
    await app.elapse(50);
    expect(app.inputs).toEqual([]);
    await app.elapse(5);
    expect(app.inputs).toEqual([8]);
    await app.elapse(50);
    expect(app.inputs).toHaveLength(1);
    await app.elapse(5);
    expect(app.inputs).toEqual([8, 1568]);
  });

  it("keeps Lynx at 50 ms per tick", async () => {
    const app = mountController("Lynx");
    app.keyDown("ArrowRight");
    await app.elapse(49);
    expect(app.inputs).toEqual([]);
    await app.elapse(1);
    expect(app.inputs).toEqual([8]);
  });

  it("fast-forwards MS at twice its native speed", async () => {
    const app = mountController("MS", "identity", undefined, true);
    app.keyDown("ArrowRight");
    await app.elapse(25);
    expect(app.inputs).toEqual([]);
    await app.elapse(2.5);
    expect(app.inputs).toEqual([8]);
  });
});

describe("sliding phone movement", () => {
  it.each(["MS", "Lynx", "Hybrid"] as const)("stops in neutral space and resumes a held direction on re-entry in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.touchDown("east", 1);
    await app.poll(7);
    app.touchMove(1, 190, 195);
    app.inputs.length = 0;
    await app.poll(4);
    expect(app.inputs).toEqual([0, 0, 0, 0]);
    app.touchMove(1, 240, 140);
    app.inputs.length = 0;
    await app.poll(7);
    expect(app.inputs).toEqual(ruleset === "MS" ? [8, 1568, 1568, 1568, 1568, 1568, 8] : Array(7).fill(ruleset === "Hybrid" ? 2 : 8));
  });

  it.each(["MS", "Lynx"] as const)("releases the old direction when sliding to a different arrow before a poll in %s", async (ruleset) => {
    const app = mountController(ruleset);
    app.touchDown("east", 1);
    app.touchMove(1, 40, 140);
    app.touchUp(1);
    await app.poll(3);
    expect(app.inputs).toEqual([2, 0, 0]);
  });

  it("does not submit an unpolled tap when sliding off and lifting", async () => {
    const app = mountController("MS");
    app.touchDown("east", 1);
    app.touchMove(1, 190, 195);
    app.touchUp(1);
    await app.poll(4);
    expect(app.inputs).toEqual([0, 0, 0, 0]);
  });

  it("keeps a second finger holding the same arrow when the first slides off", async () => {
    const app = mountController("MS");
    app.touchDown("east", 1);
    app.touchDown("east", 2);
    await app.poll(4);
    app.touchMove(1, 190, 195);
    app.touchUp(1);
    app.inputs.length = 0;
    await app.poll(3);
    expect(app.inputs).toEqual([1568, 1568, 8]);
    app.touchUp(2);
    await app.poll();
    expect(app.inputs).toEqual([1568, 1568, 8, 0]);
  });

  it.each(["reset", "cancel", "release"])("does not re-arm a pointer after %s", async (end) => {
    const app = mountController("MS");
    app.touchDown("east", 1);
    await app.poll();
    if (end === "reset") app.controller.resetMobileDirectionalInputState();
    else if (end === "cancel") app.touchCancel(1);
    else app.touchUp(1);
    app.touchMove(1, 240, 140);
    app.inputs.length = 0;
    await app.poll(3);
    expect(app.inputs).toEqual([0, 0, 0]);
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
