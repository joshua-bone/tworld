import {
  useEffect,
  useEffectEvent,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { isFastForwardModifierActive } from "@player-web/impl/fastForward";
import {
  hasBlockedMovementModifier,
  isAction1Key,
  isFineUndoKey,
  isFirstLevelKey,
  isHelpToggleKey,
  isLastLevelKey,
  isNextLevelKey,
  isPauseToggleKey,
  isPrevLevelKey,
  isProceedKey,
  isRestartLevelKey,
  isSystemModifierKey,
  isUndoCheckpointKey,
  isUndoKey,
} from "@player-web/impl/legacyHotkeys";
import {
  LegacyLynxInputBuffer,
  LegacyMsInputBuffer,
  type DirectionInput,
} from "@player-web/impl/legacyInput";
import { MobileDirectionalInputTracker } from "@player-web/impl/mobileDirectionalInput";
import { isEditableKeyTarget, shouldBypassPlayerHotkeys } from "@player-web/impl/playerHotkeyFocus";
import { recordPerfMeasurement } from "@player-web/impl/runtimePerf";
import type { InteractiveInput } from "@game-core/api/command";
import { GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import type { PlayerBindableKey } from "@player-web/impl/playerKeyBindingsSettings";

const LEGACY_FAST_TICK_MS = 25;
const LEGACY_NORMAL_TICK_MS = 50;
const UNDO_HOLD_REPEAT_DELAY_MS = 160;
const UNDO_HOLD_REPEAT_INTERVAL_MS = 40;

type HeldUndoMode = "coarse" | "fine" | "checkpoint" | null;

function keyToInput(key: string): DirectionInput | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "north";
    case "ArrowLeft":
    case "a":
    case "A":
      return "west";
    case "ArrowDown":
    case "s":
    case "S":
      return "south";
    case "ArrowRight":
    case "d":
    case "D":
      return "east";
    default:
      return null;
  }
}

function isBrowserScrollKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === " " ||
    key === "Spacebar"
  );
}

interface UsePlayerAppInputControllerOptions {
  mode: LegacyMode;
  selectedSeriesFile: string | null;
  usesModernGameUi: boolean;
  isMobileChrome: boolean;
  isPaused: boolean;
  isRunning: boolean;
  isSessionLoading: boolean;
  showHelp: boolean;
  showSoundControls: boolean;
  showHistoryControls: boolean;
  showReplayMenu: boolean;
  showAdvancedMenu: boolean;
  showManageReplays: boolean;
  mobileSheet: "levels" | "menu" | "sets" | null;
  message: string | null;
  manualRunStarted: boolean;
  setManualRunStarted: Dispatch<SetStateAction<boolean>>;
  setIsRunning: Dispatch<SetStateAction<boolean>>;
  isFastForwarding: boolean;
  setIsFastForwarding: Dispatch<SetStateAction<boolean>>;
  heldUndoMode: HeldUndoMode;
  setHeldUndoMode: Dispatch<SetStateAction<HeldUndoMode>>;
  undoKeyBinding: PlayerBindableKey;
  action1KeyBinding: PlayerBindableKey;
  allowTakeoverDuringHistoricalReplay: boolean;
  canResumeOriginalTimeline: boolean;
  sessionStatus: InteractiveGameSession["frame"]["snapshot"]["status"] | null | undefined;
  liveSessionRef: Readonly<MutableRefObject<InteractiveGameSession | null>>;
  advanceTick: (input: InteractiveInput) => Promise<void>;
  performModernUndo: (forHeldRepeat?: boolean) => boolean;
  resumeOriginalTimelineFromSpace: () => void;
  resumeLivePlayFromRestore: () => void;
  toggleModernPause: () => void;
  undoPreviousCheckpoint: () => void;
  undoPreviousTick: () => void;
  undoPreviousTickBurst: () => void;
  activateSeries: (seriesFile: string) => void;
  changeSelectedSeriesBy: (delta: number) => void;
  jumpSelectedSeries: (position: "first" | "last") => void;
  proceedAfterLevelEnd: () => void;
  restartCurrentLevel: () => void;
  exitCurrentGame: () => void;
  changeLevelBy: (delta: number) => void;
  jumpLevel: (position: "first" | "last") => void;
  toggleHelp: () => void;
  closeHelp: () => void;
  closeSoundControls: () => void;
  closeHistoryControls: () => void;
  setShowReplayMenu: Dispatch<SetStateAction<boolean>>;
  setShowAdvancedMenu: Dispatch<SetStateAction<boolean>>;
  focusGameplaySurface: () => void;
  unlockSound: () => void;
}

interface UsePlayerAppInputControllerResult {
  handleMobileDirectionPointerDown: (
    direction: DirectionInput,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  handleMobileDirectionPointerEnd: (event: ReactPointerEvent<HTMLElement>) => void;
  handleModernMapClick: (position: number) => void;
  preventMobileTouchDefault: (event: ReactTouchEvent<HTMLElement>) => void;
  resetGameplayInputBuffers: () => void;
  resetMobileDirectionalInputState: () => void;
  stopHeldUndo: () => void;
}

export function usePlayerAppInputController({
  mode,
  selectedSeriesFile,
  usesModernGameUi,
  isMobileChrome,
  isPaused,
  isRunning,
  isSessionLoading,
  showHelp,
  showSoundControls,
  showHistoryControls,
  showReplayMenu,
  showAdvancedMenu,
  showManageReplays,
  mobileSheet,
  message,
  manualRunStarted,
  setManualRunStarted,
  setIsRunning,
  isFastForwarding,
  setIsFastForwarding,
  heldUndoMode,
  setHeldUndoMode,
  undoKeyBinding,
  action1KeyBinding,
  allowTakeoverDuringHistoricalReplay,
  canResumeOriginalTimeline,
  sessionStatus,
  liveSessionRef,
  advanceTick,
  performModernUndo,
  resumeOriginalTimelineFromSpace,
  resumeLivePlayFromRestore,
  toggleModernPause,
  undoPreviousCheckpoint,
  undoPreviousTick,
  undoPreviousTickBurst,
  activateSeries,
  changeSelectedSeriesBy,
  jumpSelectedSeries,
  proceedAfterLevelEnd,
  restartCurrentLevel,
  exitCurrentGame,
  changeLevelBy,
  jumpLevel,
  toggleHelp,
  closeHelp,
  closeSoundControls,
  closeHistoryControls,
  setShowReplayMenu,
  setShowAdvancedMenu,
  focusGameplaySurface,
  unlockSound,
}: UsePlayerAppInputControllerOptions): UsePlayerAppInputControllerResult {
  const action1ActiveRef = useRef(false);
  const msInputBufferRef = useRef(new LegacyMsInputBuffer());
  const lynxInputBufferRef = useRef(new LegacyLynxInputBuffer());
  const mobileDirectionalInputRef = useRef(new MobileDirectionalInputTracker());

  const resetGameplayInputBuffers = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
  });

  const stopHeldUndo = useEffectEvent(() => {
    setHeldUndoMode(null);
  });

  const currentActionModifierMask = useEffectEvent(() =>
    action1ActiveRef.current ? GAME_INPUT_MODIFIER_MASKS.action1 : 0,
  );

  const resetAction1Input = useEffectEvent(() => {
    action1ActiveRef.current = false;
  });

  const applyDirectionalInputPress = useEffectEvent((input: DirectionInput) => {
    const activeSession = liveSessionRef.current;
    if (!activeSession || mode !== "game" || isPaused) {
      return;
    }

    if (
      activeSession.history.restoreMode === "replaying-history" &&
      !allowTakeoverDuringHistoricalReplay
    ) {
      return;
    }

    if (activeSession.request.ruleset === "Lynx") {
      lynxInputBufferRef.current.keyDown(input);
    } else {
      msInputBufferRef.current.keyDown(input);
    }

    if (activeSession.mode === "manual" && !manualRunStarted) {
      setManualRunStarted(true);
    }

    if (activeSession.history.restoreMode === "restored-paused") {
      resumeLivePlayFromRestore();
    }
  });

  const applyDirectionalInputRelease = useEffectEvent((input: DirectionInput) => {
    const activeSession = liveSessionRef.current;
    if (!activeSession || mode !== "game") {
      return;
    }

    if (activeSession.request.ruleset === "Lynx") {
      lynxInputBufferRef.current.keyUp(input);
    } else {
      msInputBufferRef.current.keyUp(input);
    }
  });

  const applyMobileDirectionalInputChanges = useEffectEvent(
    (changes: { pressed: DirectionInput[]; released: DirectionInput[] }) => {
      for (const input of changes.released) {
        applyDirectionalInputRelease(input);
      }

      for (const input of changes.pressed) {
        applyDirectionalInputPress(input);
      }
    },
  );

  const resetMobileDirectionalInputState = useEffectEvent(() => {
    applyMobileDirectionalInputChanges(mobileDirectionalInputRef.current.reset());
  });

  const stepHeldUndo = useEffectEvent((nextMode: Exclude<HeldUndoMode, null>) => {
    if (usesModernGameUi) {
      if (!performModernUndo(true)) {
        stopHeldUndo();
      }
      return;
    }

    if (nextMode === "checkpoint") {
      undoPreviousCheckpoint();
      return;
    }

    if (nextMode === "fine") {
      undoPreviousTick();
      return;
    }

    undoPreviousTickBurst();
  });

  useEffect(() => {
    if (mode !== "game") {
      setIsFastForwarding(false);
      resetAction1Input();
    }
  }, [mode, resetAction1Input, setIsFastForwarding]);

  useEffect(() => {
    if (
      mode !== "game" ||
      !liveSessionRef.current ||
      !isRunning ||
      isPaused ||
      showHelp ||
      (liveSessionRef.current.mode === "manual" && !manualRunStarted)
    ) {
      return;
    }

    const tickIntervalMs = isFastForwarding ? LEGACY_FAST_TICK_MS : LEGACY_NORMAL_TICK_MS;
    let nextExpectedTickAtMs = performance.now() + tickIntervalMs;

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const driftMs = Math.max(0, now - nextExpectedTickAtMs);
      recordPerfMeasurement("loopDriftMs", driftMs);
      nextExpectedTickAtMs += tickIntervalMs;
      if (driftMs > tickIntervalMs * 4) {
        nextExpectedTickAtMs = now + tickIntervalMs;
      }

      const activeSession = liveSessionRef.current;
      if (!activeSession) {
        return;
      }

      const inputCode =
        activeSession.request.ruleset === "Lynx"
          ? lynxInputBufferRef.current.nextTickInputCode(currentActionModifierMask())
          : msInputBufferRef.current.nextTickInputCode(currentActionModifierMask());
      void advanceTick(inputCode);
    }, tickIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    advanceTick,
    currentActionModifierMask,
    isFastForwarding,
    isPaused,
    isRunning,
    liveSessionRef,
    manualRunStarted,
    mode,
    showHelp,
  ]);

  useEffect(() => {
    if (mode !== "game" || heldUndoMode === null || showHelp) {
      return;
    }

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        stepHeldUndo(heldUndoMode);
      }, UNDO_HOLD_REPEAT_INTERVAL_MS);
    }, UNDO_HOLD_REPEAT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [heldUndoMode, mode, showHelp, stepHeldUndo]);

  useEffect(() => {
    if (
      !isMobileChrome ||
      (
        mode === "game" &&
        !isPaused &&
        !showHelp &&
        !showManageReplays &&
        mobileSheet === null &&
        message === null &&
        sessionStatus === "playing"
      )
    ) {
      return;
    }

    resetMobileDirectionalInputState();
  }, [
    isMobileChrome,
    isPaused,
    message,
    mobileSheet,
    mode,
    resetMobileDirectionalInputState,
    sessionStatus,
    showHelp,
    showManageReplays,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const activeSession = liveSessionRef.current;
      const editableKeyboardFocus = shouldBypassPlayerHotkeys(event.target, document.activeElement);
      unlockSound();
      setIsFastForwarding(isFastForwardModifierActive(mode, event));

      if (editableKeyboardFocus) {
        stopHeldUndo();
        resetAction1Input();
        resetGameplayInputBuffers();
        return;
      }

      if (isSystemModifierKey(event.key)) {
        resetAction1Input();
        resetGameplayInputBuffers();
      }

      const hasBrowserShortcutModifier = event.altKey || event.ctrlKey || event.metaKey;
      const isReservedModifiedHotkey =
        isFineUndoKey(event, undoKeyBinding) || isFirstLevelKey(event) || isLastLevelKey(event);
      if (hasBrowserShortcutModifier && !isReservedModifiedHotkey) {
        return;
      }

      if (isHelpToggleKey(event)) {
        event.preventDefault();
        toggleHelp();
        return;
      }

      if (showHelp) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeHelp();
        } else if (event.key !== "Tab") {
          event.preventDefault();
        }
        return;
      }

      if (showSoundControls && event.key === "Escape") {
        event.preventDefault();
        closeSoundControls();
        return;
      }

      if (showHistoryControls && event.key === "Escape") {
        event.preventDefault();
        closeHistoryControls();
        return;
      }

      if (showReplayMenu && event.key === "Escape") {
        event.preventDefault();
        setShowReplayMenu(false);
        return;
      }

      if (showAdvancedMenu && event.key === "Escape") {
        event.preventDefault();
        setShowAdvancedMenu(false);
        return;
      }

      if (mode === "series-list") {
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            changeSelectedSeriesBy(-1);
            return;
          case "ArrowDown":
            event.preventDefault();
            changeSelectedSeriesBy(1);
            return;
          case "PageUp":
            event.preventDefault();
            changeSelectedSeriesBy(-10);
            return;
          case "PageDown":
            event.preventDefault();
            changeSelectedSeriesBy(10);
            return;
          case "Home":
            event.preventDefault();
            jumpSelectedSeries("first");
            return;
          case "End":
            event.preventDefault();
            jumpSelectedSeries("last");
            return;
          case "Enter":
          case " ":
          case "Spacebar":
            event.preventDefault();
            if (selectedSeriesFile) {
              activateSeries(selectedSeriesFile);
            }
            return;
          default:
            return;
        }
      }

      if (mode !== "game") {
        return;
      }

      if (
        !isEditableKeyTarget(event.target) &&
        !hasBlockedMovementModifier(event) &&
        (isBrowserScrollKey(event.key) || keyToInput(event.key) !== null)
      ) {
        const activeElement = document.activeElement;
        if (
          activeElement instanceof HTMLElement &&
          activeElement !== document.body &&
          activeElement !== document.documentElement &&
          !isEditableKeyTarget(activeElement)
        ) {
          activeElement.blur();
        }

        focusGameplaySurface();
      }

      if (!isEditableKeyTarget(event.target) && !hasBlockedMovementModifier(event) && isBrowserScrollKey(event.key)) {
        event.preventDefault();
      }

      if (usesModernGameUi && !isEditableKeyTarget(event.target) && isPauseToggleKey(event)) {
        event.preventDefault();
        toggleModernPause();
        return;
      }

      if (isPaused) {
        if (event.key === "Escape") {
          event.preventDefault();
          exitCurrentGame();
          return;
        }

        if (isAction1Key(event, action1KeyBinding)) {
          event.preventDefault();
          action1ActiveRef.current = true;
          return;
        }

        if (event.key !== "Tab") {
          event.preventDefault();
        }
        return;
      }

      if (usesModernGameUi && activeSession?.history.enabled && isUndoKey(event, undoKeyBinding)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        const continueHolding = performModernUndo(false);
        setHeldUndoMode(continueHolding ? "coarse" : null);
        return;
      }

      if (!usesModernGameUi && activeSession?.history.enabled && isUndoCheckpointKey(event, undoKeyBinding)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("checkpoint");
        undoPreviousCheckpoint();
        return;
      }

      if (!usesModernGameUi && activeSession?.history.enabled && isFineUndoKey(event, undoKeyBinding)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("fine");
        undoPreviousTick();
        return;
      }

      if (!usesModernGameUi && activeSession?.history.enabled && isUndoKey(event, undoKeyBinding)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("coarse");
        undoPreviousTickBurst();
        return;
      }

      if (canResumeOriginalTimeline && (event.key === " " || event.key === "Spacebar")) {
        event.preventDefault();
        resumeOriginalTimelineFromSpace();
        return;
      }

      const startClockKey =
        activeSession?.mode === "manual" &&
        !manualRunStarted &&
        !hasBlockedMovementModifier(event) &&
        (event.key === " " || event.key === "Spacebar" || keyToInput(event.key) !== null);
      if (startClockKey) {
        event.preventDefault();
        setManualRunStarted(true);
      }

      if (activeSession && activeSession.frame.snapshot.status !== "playing" && isProceedKey(event.key)) {
        event.preventDefault();
        proceedAfterLevelEnd();
        return;
      }

      if (usesModernGameUi && activeSession && activeSession.frame.snapshot.status !== "playing" && event.key === "Escape") {
        event.preventDefault();
        restartCurrentLevel();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        exitCurrentGame();
        return;
      }

      if (isRestartLevelKey(event)) {
        event.preventDefault();
        restartCurrentLevel();
        return;
      }

      if (isPrevLevelKey(event)) {
        event.preventDefault();
        changeLevelBy(-1);
        return;
      }

      if (isNextLevelKey(event)) {
        event.preventDefault();
        changeLevelBy(1);
        return;
      }

      if (isFirstLevelKey(event)) {
        event.preventDefault();
        jumpLevel("first");
        return;
      }

      if (isLastLevelKey(event)) {
        event.preventDefault();
        jumpLevel("last");
        return;
      }

      const input = keyToInput(event.key);
      if (
        activeSession?.history.restoreMode === "replaying-history" &&
        !allowTakeoverDuringHistoricalReplay &&
        (input !== null || event.key === " " || event.key === "Spacebar")
      ) {
        event.preventDefault();
        return;
      }
      if ((event.key === " " || event.key === "Spacebar") && activeSession?.mode === "manual") {
        event.preventDefault();
        if (activeSession.history.restoreMode === "restored-paused") {
          resumeLivePlayFromRestore();
        }
        return;
      }

      if (isAction1Key(event, action1KeyBinding)) {
        event.preventDefault();
        action1ActiveRef.current = true;
        return;
      }

      if (!input) {
        return;
      }

      if (hasBlockedMovementModifier(event)) {
        event.preventDefault();
        resetAction1Input();
        resetGameplayInputBuffers();
        return;
      }

      event.preventDefault();
      applyDirectionalInputPress(input);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const editableKeyboardFocus = shouldBypassPlayerHotkeys(event.target, document.activeElement);
      setIsFastForwarding(isFastForwardModifierActive(mode, event));

      if (mode !== "game") {
        return;
      }

      if (editableKeyboardFocus) {
        stopHeldUndo();
        resetAction1Input();
        resetGameplayInputBuffers();
        return;
      }

      if (isSystemModifierKey(event.key)) {
        resetAction1Input();
        resetGameplayInputBuffers();
        return;
      }

      if (isAction1Key(event, action1KeyBinding)) {
        action1ActiveRef.current = false;
      }

      if (isPaused) {
        return;
      }

      if (isUndoKey(event, undoKeyBinding) || isUndoCheckpointKey(event, undoKeyBinding) || isFineUndoKey(event, undoKeyBinding)) {
        stopHeldUndo();
      }

      const input = keyToInput(event.key);
      if (input) {
        event.preventDefault();
        applyDirectionalInputRelease(input);
      }
    };

    const onKeyPress = (event: KeyboardEvent) => {
      if (mode !== "game") {
        return;
      }

      if (!shouldBypassPlayerHotkeys(event.target, document.activeElement) && !hasBlockedMovementModifier(event) && isBrowserScrollKey(event.key)) {
        event.preventDefault();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      unlockSound();
      setIsFastForwarding(isFastForwardModifierActive(mode, event));
    };

    const onWindowBlur = () => {
      setIsFastForwarding(false);
      stopHeldUndo();
      resetAction1Input();
      resetMobileDirectionalInputState();
      resetGameplayInputBuffers();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keypress", onKeyPress, { capture: true });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keypress", onKeyPress, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    action1KeyBinding,
    activateSeries,
    advanceTick,
    allowTakeoverDuringHistoricalReplay,
    applyDirectionalInputPress,
    applyDirectionalInputRelease,
    canResumeOriginalTimeline,
    changeLevelBy,
    changeSelectedSeriesBy,
    closeHelp,
    closeHistoryControls,
    closeSoundControls,
    exitCurrentGame,
    isPaused,
    jumpLevel,
    jumpSelectedSeries,
    liveSessionRef,
    manualRunStarted,
    mode,
    performModernUndo,
    proceedAfterLevelEnd,
    resetAction1Input,
    resetGameplayInputBuffers,
    resetMobileDirectionalInputState,
    restartCurrentLevel,
    resumeLivePlayFromRestore,
    resumeOriginalTimelineFromSpace,
    selectedSeriesFile,
    setHeldUndoMode,
    setIsFastForwarding,
    setManualRunStarted,
    setShowAdvancedMenu,
    setShowReplayMenu,
    showAdvancedMenu,
    focusGameplaySurface,
    showHelp,
    showHistoryControls,
    showReplayMenu,
    showSoundControls,
    stepHeldUndo,
    stopHeldUndo,
    toggleHelp,
    toggleModernPause,
    undoKeyBinding,
    undoPreviousCheckpoint,
    undoPreviousTick,
    undoPreviousTickBurst,
    unlockSound,
    usesModernGameUi,
  ]);

  const handleModernMapClick = useEffectEvent((position: number) => {
    const activeSession = liveSessionRef.current;
    if (
      mode !== "game" ||
      !activeSession ||
      isPaused ||
      activeSession.mode !== "manual" ||
      activeSession.request.ruleset !== "MS" ||
      activeSession.frame.snapshot.status !== "playing" ||
      (activeSession.history.restoreMode === "replaying-history" && !allowTakeoverDuringHistoricalReplay)
    ) {
      return;
    }

    msInputBufferRef.current.queueAbsoluteMouseMove(position, currentActionModifierMask());
    if (!manualRunStarted) {
      setManualRunStarted(true);
    }
    if (!isRunning) {
      setIsRunning(true);
    }
  });

  const handleMobileDirectionPointerDown = useEffectEvent((
    direction: DirectionInput,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    applyMobileDirectionalInputChanges(
      mobileDirectionalInputRef.current.assignPointer(event.pointerId, direction),
    );
  });

  const handleMobileDirectionPointerEnd = useEffectEvent((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    applyMobileDirectionalInputChanges(
      mobileDirectionalInputRef.current.releasePointer(event.pointerId),
    );
  });

  const preventMobileTouchDefault = useEffectEvent((event: ReactTouchEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
  });

  return {
    handleMobileDirectionPointerDown,
    handleMobileDirectionPointerEnd,
    handleModernMapClick,
    preventMobileTouchDefault,
    resetGameplayInputBuffers,
    resetMobileDirectionalInputState,
    stopHeldUndo,
  };
}
