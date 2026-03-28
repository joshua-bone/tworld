import {
  startTransition,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { advanceInteractiveGameSession } from "@game-runtime/impl/advanceInteractiveGameSession";
import {
  previousInteractiveGameSessionCheckpointTick,
  previousInteractiveGameSessionTick,
  previousInteractiveGameSessionTickByCount,
} from "@game-runtime/impl/interactiveHistoryNavigation";
import { restoreInteractiveGameSession } from "@game-runtime/impl/restoreInteractiveGameSession";
import { resumeInteractiveGameSession } from "@game-runtime/impl/resumeInteractiveGameSession";
import { startInteractiveGameSession } from "@game-runtime/impl/startInteractiveGameSession";
import { startReplayInteractiveGameSession } from "@game-runtime/impl/startReplayInteractiveGameSession";
import {
  nextModernUndoTarget,
} from "@player-web/impl/playerAppGameplay";
import {
  canResumeInteractiveHistoryTimeline,
  disposePlayerAppSession,
  interactiveEngineForRuleset,
} from "@player-web/impl/playerAppRuntime";
import { resolveLegacySessionRandomSeed } from "@player-web/impl/legacySharedRandomSeed";
import { findLevelSeedOverride } from "@player-web/impl/levelSeedOverrides";
import { measurePerfAsync } from "@player-web/impl/runtimePerf";
import type { BrowserLevelSeedOverride } from "@player-web/ports/BrowserProfileStore";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { InteractiveInput } from "@game-core/api/command";
import type {
  InteractiveGameSession,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { LegacyMode } from "@player-web/impl/LegacyCanvasScreen";

const SESSION_UI_SYNC_INTERVAL_MS = 125;

interface ReplayLaunchRequest {
  levelNumber: number;
  replay: ReplaySolutionPayload;
  replayName: string;
  seriesFile: string;
  token: number;
}

interface UsePlayerAppSessionControllerOptions {
  engines: BrowserAppServices["engines"];
  profileStore: BrowserAppServices["profileStore"];
  mode: LegacyMode;
  setMode: Dispatch<SetStateAction<LegacyMode>>;
  currentSeriesRuleset: "MS" | "Lynx" | "None" | null;
  currentLevelExists: boolean;
  currentManualMsStepping: 0 | 4;
  replayLaunchRequest: ReplayLaunchRequest | null;
  reloadToken: number;
  selectedSeriesFile: string | null;
  selectedLevelNumber: number | null;
  levelSeedOverridesRef: Readonly<MutableRefObject<BrowserLevelSeedOverride[]>>;
  undoStartOptionsRef: Readonly<MutableRefObject<InteractiveGameSessionStartOptions>>;
  isPaused: boolean;
  enableRewindAndResume: boolean;
  prepareForSessionTransition: () => void;
  clearGameplayInputs: () => void;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  setIsPaused: Dispatch<SetStateAction<boolean>>;
  setManualRunStarted: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  syncSoundForSession: (nextSession: InteractiveGameSession | null) => void;
}

interface UsePlayerAppSessionControllerResult {
  session: InteractiveGameSession | null;
  isSessionLoading: boolean;
  liveSessionRef: Readonly<MutableRefObject<InteractiveGameSession | null>>;
  sessionStartedFromReplayRef: Readonly<MutableRefObject<boolean>>;
  advanceTick: (input: InteractiveInput) => Promise<void>;
  performModernUndo: (forHeldRepeat?: boolean) => boolean;
  restoreToTick: (targetTick: number | null) => void;
  resumeLivePlayFromRestore: () => void;
  resumeOriginalTimeline: () => void;
  resumeOriginalTimelineFromSpace: () => void;
  toggleModernPause: () => void;
  undoPreviousCheckpoint: () => void;
  undoPreviousTick: () => void;
  undoPreviousTickBurst: () => void;
}

export function usePlayerAppSessionController({
  engines,
  profileStore,
  mode,
  setMode,
  currentSeriesRuleset,
  currentLevelExists,
  currentManualMsStepping,
  replayLaunchRequest,
  reloadToken,
  selectedSeriesFile,
  selectedLevelNumber,
  levelSeedOverridesRef,
  undoStartOptionsRef,
  isPaused,
  enableRewindAndResume,
  prepareForSessionTransition,
  clearGameplayInputs,
  setIsRunning,
  setIsPaused,
  setManualRunStarted,
  setMessage,
  syncSoundForSession,
}: UsePlayerAppSessionControllerOptions): UsePlayerAppSessionControllerResult {
  const [session, setSession] = useState<InteractiveGameSession | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const historyNavigationRef = useRef(false);
  const liveSessionRef = useRef<InteractiveGameSession | null>(null);
  const pendingSessionUiSyncRef = useRef<number | null>(null);
  const lastSessionUiSyncAtRef = useRef(0);
  const sessionStartedFromReplayRef = useRef(false);
  const tickingRef = useRef(false);

  const flushSessionUiSync = useEffectEvent((nextSession: InteractiveGameSession | null) => {
    if (pendingSessionUiSyncRef.current !== null) {
      window.clearTimeout(pendingSessionUiSyncRef.current);
      pendingSessionUiSyncRef.current = null;
    }
    lastSessionUiSyncAtRef.current = performance.now();
    startTransition(() => {
      setSession(nextSession);
    });
  });

  const scheduleSessionUiSync = useEffectEvent((
    nextSession: InteractiveGameSession | null,
    options: { immediate?: boolean } = {},
  ) => {
    liveSessionRef.current = nextSession;

    if (!nextSession || options.immediate) {
      flushSessionUiSync(nextSession);
      return;
    }

    const now = performance.now();
    const dueAt = lastSessionUiSyncAtRef.current + SESSION_UI_SYNC_INTERVAL_MS;
    if (now >= dueAt) {
      flushSessionUiSync(nextSession);
      return;
    }

    if (pendingSessionUiSyncRef.current !== null) {
      return;
    }

    pendingSessionUiSyncRef.current = window.setTimeout(() => {
      pendingSessionUiSyncRef.current = null;
      flushSessionUiSync(liveSessionRef.current);
    }, Math.max(0, dueAt - now));
  });

  const syncSessionState = useEffectEvent((nextSession: InteractiveGameSession) => {
    scheduleSessionUiSync(nextSession, { immediate: true });
    syncSoundForSession(nextSession);
    startTransition(() => {
      setIsPaused(false);
      setIsRunning(
        nextSession.frame.snapshot.status === "playing" && nextSession.history.restoreMode !== "restored-paused",
      );
      setMessage(null);
    });
  });

  useEffect(() => {
    return () => {
      if (pendingSessionUiSyncRef.current !== null) {
        window.clearTimeout(pendingSessionUiSyncRef.current);
        pendingSessionUiSyncRef.current = null;
      }

      void disposePlayerAppSession(liveSessionRef.current, engines).catch(() => {
        // Ignore disposal failures during teardown.
      });
    };
  }, [engines]);

  useEffect(() => {
    if (mode !== "game" || !selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    if (!currentSeriesRuleset || !currentLevelExists) {
      return;
    }

    if (currentSeriesRuleset === "None") {
      setMode("series-list");
      setMessage(`${selectedSeriesFile} does not declare a playable ruleset.`);
      return;
    }

    let active = true;
    const queuedReplay =
      replayLaunchRequest &&
      replayLaunchRequest.seriesFile === selectedSeriesFile &&
      replayLaunchRequest.levelNumber === selectedLevelNumber
        ? replayLaunchRequest
        : null;
    prepareForSessionTransition();
    setIsSessionLoading(true);

    const manualSeedOverride =
      queuedReplay
        ? null
        : findLevelSeedOverride(levelSeedOverridesRef.current, {
            seriesFile: selectedSeriesFile,
            levelNumber: selectedLevelNumber,
            ruleset: currentSeriesRuleset,
          })?.randomSeed ?? null;

    const request = {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
      ruleset: currentSeriesRuleset,
      randomSeed: resolveLegacySessionRandomSeed(queuedReplay?.replay.randomSeed, Date.now(), manualSeedOverride),
    } as const;
    const manualSessionStartOptions =
      currentSeriesRuleset === "MS"
        ? {
            ...undoStartOptionsRef.current,
            msStepping: currentManualMsStepping,
          }
        : undoStartOptionsRef.current;

    const sessionPromise = queuedReplay
      ? measurePerfAsync("sessionLoadMs", () =>
          startReplayInteractiveGameSession(
            interactiveEngineForRuleset(currentSeriesRuleset, engines),
            request,
            queuedReplay.replay,
            undoStartOptionsRef.current,
          ),
        )
      : measurePerfAsync("sessionLoadMs", () =>
          startInteractiveGameSession(
            interactiveEngineForRuleset(currentSeriesRuleset, engines),
            request,
            manualSessionStartOptions,
          ),
        );

    sessionPromise
      .then((nextSession) => {
        if (!active) {
          void disposePlayerAppSession(nextSession, engines).catch(() => {
            // Ignore disposal failures after session startup races.
          });
          return;
        }

        void profileStore.recordRecentSelection({
          seriesFile: selectedSeriesFile,
          levelNumber: selectedLevelNumber,
        });
        sessionStartedFromReplayRef.current = Boolean(queuedReplay) || nextSession.mode === "replay";
        void disposePlayerAppSession(liveSessionRef.current, engines).catch(() => {
          // Ignore disposal failures; session lifetime should not block gameplay.
        });
        scheduleSessionUiSync(nextSession, { immediate: true });
        syncSoundForSession(nextSession);

        startTransition(() => {
          setManualRunStarted(nextSession.mode === "replay");
          setIsRunning(nextSession.frame.snapshot.status === "playing");
          setMessage(null);
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) {
          setIsSessionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    currentLevelExists,
    currentManualMsStepping,
    currentSeriesRuleset,
    engines,
    mode,
    profileStore,
    reloadToken,
    replayLaunchRequest,
    selectedLevelNumber,
    selectedSeriesFile,
    setMode,
  ]);

  const advanceTick = useEffectEvent(async (input: InteractiveInput) => {
    const activeSession = liveSessionRef.current;
    if (mode !== "game" || !activeSession || tickingRef.current || isPaused) {
      return;
    }

    tickingRef.current = true;
    try {
      const nextSession = await measurePerfAsync("tickMs", () =>
        advanceInteractiveGameSession(
          interactiveEngineForRuleset(activeSession.request.ruleset, engines),
          activeSession,
          input,
        ),
      );
      if (liveSessionRef.current !== activeSession) {
        return;
      }
      scheduleSessionUiSync(nextSession, {
        immediate:
          nextSession.frame.snapshot.status !== "playing" || nextSession.history.restoreMode !== "live",
      });
      syncSoundForSession(nextSession);
      if (nextSession.frame.snapshot.status !== "playing") {
        setIsRunning(false);
      }
    } catch (error: unknown) {
      if (liveSessionRef.current !== activeSession) {
        return;
      }
      setIsRunning(false);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      tickingRef.current = false;
    }
  });

  const restoreToTick = useEffectEvent((targetTick: number | null) => {
    const activeSession = liveSessionRef.current;
    if (
      targetTick === null ||
      mode !== "game" ||
      !activeSession ||
      historyNavigationRef.current ||
      targetTick === activeSession.history.currentTick
    ) {
      return;
    }

    historyNavigationRef.current = true;
    clearGameplayInputs();
    setIsPaused(false);

    void restoreInteractiveGameSession(
      interactiveEngineForRuleset(activeSession.request.ruleset, engines),
      activeSession,
      targetTick,
    )
      .then((nextSession) => {
        if (liveSessionRef.current !== activeSession) {
          return;
        }

        syncSessionState(nextSession);
      })
      .catch((error: unknown) => {
        if (liveSessionRef.current !== activeSession) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const undoPreviousTick = useEffectEvent(() => {
    const activeSession = liveSessionRef.current;
    restoreToTick(activeSession ? previousInteractiveGameSessionTick(activeSession) : null);
  });

  const undoPreviousTickBurst = useEffectEvent(() => {
    const activeSession = liveSessionRef.current;
    restoreToTick(activeSession ? previousInteractiveGameSessionTickByCount(activeSession, 4) : null);
  });

  const undoPreviousCheckpoint = useEffectEvent(() => {
    const activeSession = liveSessionRef.current;
    restoreToTick(activeSession ? previousInteractiveGameSessionCheckpointTick(activeSession) : null);
  });

  const performModernUndo = useEffectEvent((forHeldRepeat = false): boolean => {
    const activeSession = liveSessionRef.current;
    if (mode !== "game" || !activeSession || historyNavigationRef.current) {
      return false;
    }

    const nextTarget = nextModernUndoTarget(activeSession);
    if (!nextTarget) {
      return false;
    }

    restoreToTick(nextTarget.targetTick);
    return !forHeldRepeat && nextTarget.mode === "smooth" && nextTarget.continueHolding;
  });

  const resumeOriginalTimeline = useEffectEvent(() => {
    const activeSession = liveSessionRef.current;
    if (
      mode !== "game" ||
      !activeSession ||
      historyNavigationRef.current ||
      !canResumeInteractiveHistoryTimeline(activeSession, enableRewindAndResume)
    ) {
      return;
    }

    historyNavigationRef.current = true;
    clearGameplayInputs();
    setIsPaused(false);

    void resumeInteractiveGameSession(
      interactiveEngineForRuleset(activeSession.request.ruleset, engines),
      activeSession,
    )
      .then((nextSession) => {
        if (liveSessionRef.current !== activeSession) {
          return;
        }

        syncSessionState(nextSession);
      })
      .catch((error: unknown) => {
        if (liveSessionRef.current !== activeSession) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const resumeOriginalTimelineFromSpace = useEffectEvent(() => {
    setIsPaused(false);
    setIsRunning(true);
    resumeOriginalTimeline();
  });

  const resumeLivePlayFromRestore = useEffectEvent(() => {
    setIsPaused(false);
    setIsRunning(true);
  });

  const toggleModernPause = useEffectEvent(() => {
    const activeSession = liveSessionRef.current;
    if (!activeSession || isSessionLoading || (!isPaused && activeSession.frame.snapshot.status !== "playing")) {
      return;
    }

    clearGameplayInputs();
    setIsPaused((current) => !current);
  });

  return {
    session,
    isSessionLoading,
    liveSessionRef,
    sessionStartedFromReplayRef,
    advanceTick,
    performModernUndo,
    restoreToTick,
    resumeLivePlayFromRestore,
    resumeOriginalTimeline,
    resumeOriginalTimelineFromSpace,
    toggleModernPause,
    undoPreviousCheckpoint,
    undoPreviousTick,
    undoPreviousTickBurst,
  };
}
