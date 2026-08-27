import { afterEach, describe, expect, it, vi } from "vitest";
import type { InteractiveInput } from "@game-core/api/command";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
  HYBRID_CC_V1_OUTCOME,
} from "./engineFacts";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
} from "./HybridCcV1GameEngineAdapter";
import { testActor, testCell, testElement, testEvent, testMotionTrack, testSnapshot } from "./testFacts";
import type {
  HybridCcV1ConvertedLevel,
  HybridCcV1Engine,
  HybridCcV1Snapshot,
} from "./wasmBridge";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type {
  BrowserLevelProgressSummary,
  BrowserProfileStore,
} from "@player-web/ports/BrowserProfileStore";
import {
  persistTerminalSessionProgress,
  terminalSessionRecordKey,
} from "@player-web/impl/sessionProgressPolicy";

const reactHarness = vi.hoisted(() => ({
  cleanups: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    startTransition: (action: () => void) => action(),
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) reactHarness.cleanups.push(cleanup);
    },
    useEffectEvent: <Arguments extends unknown[], Result>(
      callback: (...args: Arguments) => Result,
    ) => callback,
    useRef: <Value>(initialValue: Value) => ({ current: initialValue }),
    useState: <Value>(initialValue: Value | (() => Value)) => {
      let current = typeof initialValue === "function"
        ? (initialValue as () => Value)()
        : initialValue;
      const setCurrent = (next: Value | ((previous: Value) => Value)) => {
        current = typeof next === "function"
          ? (next as (previous: Value) => Value)(current)
          : next;
      };
      return [current, setCurrent] as const;
    },
  };
});

import { usePlayerAppSessionController } from "@player-web/impl/usePlayerAppSessionController";
import { usePlayerAppInputController } from "@player-web/impl/usePlayerAppInputController";

class TestClockWorker {
  static readonly instances: TestClockWorker[] = [];

  onmessage: ((event: MessageEvent<{ nowMs: number; type: "pulse" }>) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  constructor() {
    TestClockWorker.instances.push(this);
  }

  pulse(nowMs: number): void {
    this.onmessage?.({ data: { nowMs, type: "pulse" } } as MessageEvent<{
      nowMs: number;
      type: "pulse";
    }>);
  }
}

function convertedLevel(): HybridCcV1ConvertedLevel {
  return {
    status: 0,
    entryOrdinal: 0,
    requiredChips: 0,
    diagnosticCount: 0,
    nativeLevel: {
      width: 2,
      height: 1,
      depth: 1,
      number: 1,
      timeLimitSeconds: 100,
      title: "Post-death host acceptance",
      author: "Test",
      hint: "",
      password: "ABCD",
      titleBytes: new Uint8Array(),
      authorBytes: new Uint8Array(),
      hintBytes: new Uint8Array(),
      passwordBytes: new Uint8Array(),
      texts: [],
      textBytes: [],
      encoded: new Uint8Array([1]),
    },
  };
}

const terminalOutcome = {
  kind: HYBRID_CC_V1_OUTCOME.loss,
  logicBoundary: 1n,
  position: { x: 1, y: 0, z: 0 },
  exitColor: 0,
  lossCause: HYBRID_CC_V1_LOSS.fire,
};

function snapshotAt(boundary: number): HybridCcV1Snapshot {
  if (boundary === 0) {
    return testSnapshot({
      header: {
        ...testSnapshot().header,
        width: 2,
        cellCount: 2,
      },
      cells: [testCell(), testCell()],
    });
  }

  const originX = boundary % 2;
  const destinationX = 1 - originX;
  const monsterMotion = testMotionTrack({
    actorId: 2n,
    actorKind: HYBRID_CC_V1_ELEMENT.blob,
    origin: { x: originX, y: 0, z: 0 },
    destination: { x: destinationX, y: 0, z: 0 },
    startBoundary: BigInt(boundary),
    completionBoundary: BigInt(boundary + 2),
    owner: HYBRID_CC_V1_MOVEMENT_OWNER.actorAi,
  });
  return testSnapshot({
    header: {
      ...testSnapshot().header,
      width: 2,
      cellCount: 2,
      logicBoundary: BigInt(boundary),
      outcome: terminalOutcome,
      eventCount: boundary === 1 || boundary === 2 ? 1 : 0,
      stateHash: BigInt(boundary + 1),
    },
    cells: [testCell(), testCell()],
    actors: [testActor({
      id: 2n,
      kind: HYBRID_CC_V1_ELEMENT.blob,
      logicalPosition: monsterMotion.destination,
      hasMovement: true,
      movement: {
        origin: monsterMotion.origin,
        destination: monsterMotion.destination,
        direction: monsterMotion.direction,
        slapDirection: 4,
        startBoundary: monsterMotion.startBoundary,
        completionBoundary: monsterMotion.completionBoundary,
        owner: monsterMotion.owner,
        movementClass: monsterMotion.movementClass,
        discontinuous: monsterMotion.discontinuous,
      },
    })],
    events: boundary === 1
      ? [testEvent({
          kind: HYBRID_CC_V1_EVENT.terminal,
          lossCause: HYBRID_CC_V1_LOSS.fire,
          logicBoundary: 1n,
          destination: terminalOutcome.position,
        })]
      : boundary === 2
        ? [testEvent({
            kind: HYBRID_CC_V1_EVENT.interaction,
            interaction: HYBRID_CC_V1_INTERACTION.activate,
            actorId: 2n,
            actorKind: HYBRID_CC_V1_ELEMENT.blob,
            logicBoundary: 2n,
            subject: testElement({ id: HYBRID_CC_V1_ELEMENT.button }),
          })]
        : [],
    presentation: {
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: null,
      terminalMotion: boundary === 1
        ? testMotionTrack({ presentationSampleCount: 2, completionBoundary: 2n })
        : null,
      playerPush: null,
      activeHint: null,
    },
  });
}

function postDeathEngine() {
  let boundary = 0;
  const inputs: number[] = [];
  const engine: HybridCcV1Engine = {
    runtime: () => ({
      logicBoundary: BigInt(boundary),
      outcome: snapshotAt(boundary).header.outcome,
      stateHash: BigInt(boundary + 1),
      eventHash: 2n,
      presentationHash: 3n,
    }),
    snapshot: () => snapshotAt(boundary),
    logicStep: (input) => {
      inputs.push(input);
      boundary += 1;
      const snapshot = snapshotAt(boundary);
      return {
        operationStatus: 0,
        stepStatus: 0,
        stateChanged: true,
        runtime: {
          logicBoundary: snapshot.header.logicBoundary,
          outcome: snapshot.header.outcome,
          stateHash: snapshot.header.stateHash,
          eventHash: snapshot.header.eventHash,
          presentationHash: snapshot.header.presentationHash,
        },
      };
    },
    invariantStatus: () => 0,
    dispose: vi.fn(),
  };
  return { engine, inputs };
}

function profileStore(): BrowserProfileStore {
  return {
    recordRecentSelection: vi.fn().mockResolvedValue(undefined),
    saveLevelProgressSummary: vi.fn().mockResolvedValue(undefined),
  } as unknown as BrowserProfileStore;
}

afterEach(() => {
  for (const cleanup of reactHarness.cleanups.splice(0).reverse()) cleanup();
  TestClockWorker.instances.splice(0);
  vi.unstubAllGlobals();
});

describe("Hybrid v1 post-death host acceptance", () => {
  it("keeps the browser clock and terminal persistence alive after the result sheet becomes visible", async () => {
    let clockNowMs = 0;
    vi.stubGlobal("window", {
      addEventListener: vi.fn(),
      clearInterval: globalThis.clearInterval.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      removeEventListener: vi.fn(),
      setInterval: globalThis.setInterval.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    });
    vi.stubGlobal("performance", { now: () => clockNowMs });
    vi.stubGlobal("Worker", TestClockWorker);

    const native = postDeathEngine();
    const levels = new HybridCcV1LevelRegistry();
    levels.register("POST-DEATH-Hybrid-v1", [convertedLevel()]);
    const hybrid = new HybridCcV1GameEngineAdapter(levels, { create: () => native.engine });
    const store = profileStore();
    const setIsRunning = vi.fn();
    const controller = usePlayerAppSessionController({
      engines: { Hybrid: hybrid, Lynx: hybrid, MS: hybrid },
      profileStore: store,
      mode: "game",
      setMode: vi.fn(),
      currentSeriesRuleset: "Hybrid",
      currentLevelExists: true,
      currentManualMsStepping: 0,
      replayLaunchRequest: null,
      reloadToken: 0,
      selectedSeriesFile: "POST-DEATH-Hybrid-v1",
      selectedLevelNumber: 1,
      levelSeedOverridesRef: { current: [] },
      undoStartOptionsRef: { current: {} },
      isPaused: false,
      enableRewindAndResume: false,
      prepareForSessionTransition: vi.fn(),
      clearGameplayInputs: vi.fn(),
      setIsRunning,
      setIsPaused: vi.fn(),
      setManualRunStarted: vi.fn(),
      setMessage: vi.fn(),
      syncSoundForSession: vi.fn(),
    });

    await vi.waitFor(() => expect(controller.liveSessionRef.current).not.toBeNull());
    expect(setIsRunning).toHaveBeenCalledWith(true);
    await controller.advanceTick(2);
    expect(native.inputs).toEqual([2]);
    expect(controller.liveSessionRef.current?.recordedMoveCount).toBe(1);
    expect(
      controller.liveSessionRef.current!.frame.snapshot.soundEffects & (1 << LYNX_SOUND.ChipLoses),
    ).not.toBe(0);

    const recordedSession = { current: null as string | null };
    const attemptCounts = new Map<string, number>();
    const saveProgress = vi.fn((summary: BrowserLevelProgressSummary) => {
      void store.saveLevelProgressSummary(summary);
    });
    const persistFrame = (current: InteractiveGameSession) =>
      persistTerminalSessionProgress({
        attemptCounts,
        gameplayHash: "post-death-gameplay-hash",
        mode: "game",
        nowMs: clockNowMs,
        recordedSession,
        save: saveProgress,
        session: current,
        sessionStartedFromReplay: false,
      });
    persistFrame(controller.liveSessionRef.current!);

    const observerFrames: InteractiveGameSession[] = [];
    const terminalFrames: InteractiveGameSession[] = [];
    const automaticAdvanceTick = vi.fn(async (input: InteractiveInput) => {
      await controller.advanceTick(input);
      const current = controller.liveSessionRef.current!;
      observerFrames.push(current);
      if (current.run.result) terminalFrames.push(current);
      persistFrame(current);
    });
    usePlayerAppInputController({
      mode: "game",
      selectedSeriesFile: "POST-DEATH-Hybrid-v1",
      usesModernGameUi: true,
      isMobileChrome: false,
      isPaused: false,
      isRunning: true,
      isSessionLoading: false,
      showHelp: false,
      showSoundControls: false,
      showHistoryControls: false,
      showReplayMenu: false,
      showAdvancedMenu: false,
      showManageReplays: false,
      mobileSheet: null,
      message: null,
      manualRunStarted: true,
      setManualRunStarted: vi.fn(),
      setIsRunning,
      isFastForwarding: false,
      setIsFastForwarding: vi.fn(),
      heldUndoMode: null,
      setHeldUndoMode: vi.fn(),
      undoKeyBinding: "Z",
      action1KeyBinding: "C",
      allowTakeoverDuringHistoricalReplay: false,
      canResumeOriginalTimeline: false,
      sessionStatus: "failed",
      liveSessionRef: controller.liveSessionRef,
      advanceTick: automaticAdvanceTick,
      performModernUndo: vi.fn(() => false),
      resumeOriginalTimelineFromSpace: vi.fn(),
      resumeLivePlayFromRestore: vi.fn(),
      toggleModernPause: vi.fn(),
      undoPreviousCheckpoint: vi.fn(),
      undoPreviousTick: vi.fn(),
      undoPreviousTickBurst: vi.fn(),
      activateSeries: vi.fn(),
      changeSelectedSeriesBy: vi.fn(),
      jumpSelectedSeries: vi.fn(),
      proceedAfterLevelEnd: vi.fn(),
      restartCurrentLevel: vi.fn(),
      exitCurrentGame: vi.fn(),
      changeLevelBy: vi.fn(),
      jumpLevel: vi.fn(),
      toggleHelp: vi.fn(),
      closeHelp: vi.fn(),
      closeSoundControls: vi.fn(),
      closeHistoryControls: vi.fn(),
      setShowReplayMenu: vi.fn(),
      setShowAdvancedMenu: vi.fn(),
      focusGameplaySurface: vi.fn(),
      unlockSound: vi.fn(),
    });

    expect(TestClockWorker.instances).toHaveLength(1);
    const clockWorker = TestClockWorker.instances[0]!;
    expect(clockWorker.postMessage).toHaveBeenCalledWith({
      heartbeatMs: 8,
      type: "start",
    });

    let observedMovingMonster = false;
    let observedPostDeathButtonSound = false;
    let terminalSoundSampleCount = 1;
    for (let sample = 0; sample < 48; sample += 1) {
      clockNowMs += 25;
      clockWorker.pulse(clockNowMs);
      await vi.waitFor(
        () => expect(observerFrames).toHaveLength(sample + 1),
        { interval: 1, timeout: 1_000 },
      );
      const current = observerFrames[sample]!;
      observedMovingMonster ||= current.frame.render?.actors.some((actor) => actor.moving !== 0) ?? false;
      observedPostDeathButtonSound ||= (
        current.frame.snapshot.soundEffects & (1 << LYNX_SOUND.ButtonPushed)
      ) !== 0;
      if ((current.frame.snapshot.soundEffects & (1 << LYNX_SOUND.ChipLoses)) !== 0) {
        terminalSoundSampleCount += 1;
      }
    }

    expect(automaticAdvanceTick.mock.calls.every(([input]) => input === 0)).toBe(true);
    expect(native.inputs.length).toBeGreaterThan(2);
    expect(native.inputs.slice(1).every((input) => input === 0)).toBe(true);
    expect(observedMovingMonster).toBe(true);
    expect(observedPostDeathButtonSound).toBe(true);
    expect(terminalSoundSampleCount).toBe(1);
    expect(terminalFrames.length).toBeGreaterThan(1);
    const visibleResultFrame = observerFrames.findIndex((frame) => frame.run.result !== null);
    expect(visibleResultFrame).toBeGreaterThanOrEqual(0);
    expect(visibleResultFrame).toBeLessThan(observerFrames.length - 1);
    expect(terminalFrames.every((frame) => frame.run.result?.outcome === "failed")).toBe(true);
    expect(new Set(terminalFrames.map((frame) => frame.frame.snapshot.currentTime))).toEqual(new Set([2]));
    expect(new Set(terminalFrames.map((frame) => frame.recordedMoveCount))).toEqual(new Set([1]));
    expect(terminalFrames.every((frame) => frame.run.replayAvailable === false)).toBe(true);
    expect(terminalFrames.every((frame) => frame.run.continuesAfterResult === true)).toBe(true);
    expect(setIsRunning).not.toHaveBeenCalledWith(false);

    const terminalKeys = terminalFrames.map((frame) => terminalSessionRecordKey(frame));
    expect(terminalKeys.every((key) => key !== null)).toBe(true);
    expect(new Set(terminalKeys).size).toBe(1);
    expect(saveProgress).toHaveBeenCalledTimes(1);
    expect(store.saveLevelProgressSummary).toHaveBeenCalledTimes(1);
    expect(attemptCounts.get("POST-DEATH-Hybrid-v1:1")).toBe(1);
  });
});
