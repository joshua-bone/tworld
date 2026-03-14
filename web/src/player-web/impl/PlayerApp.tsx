import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { BrowserSoundEffectsPlayer } from "@player-web/impl/BrowserSoundEffectsPlayer";
import {
  hasBlockedMovementModifier,
  isFirstLevelKey,
  isHelpToggleKey,
  isSystemModifierKey,
  isLastLevelKey,
  isNextLevelKey,
  isPrevLevelKey,
  isProceedKey,
  isUndoCheckpointKey,
  isUndoKey,
} from "@player-web/impl/legacyHotkeys";
import {
  LegacyLynxInputBuffer,
  LegacyMsInputBuffer,
  type DirectionInput,
} from "@player-web/impl/legacyInput";
import { LegacyCanvasScreen, type LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import { advanceInteractiveGameSession } from "@game-runtime/impl/advanceInteractiveGameSession";
import {
  previousInteractiveGameSessionCheckpointTick,
  previousInteractiveGameSessionTick,
} from "@game-runtime/impl/interactiveHistoryNavigation";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import { restoreInteractiveGameSession } from "@game-runtime/impl/restoreInteractiveGameSession";
import { resumeInteractiveGameSession } from "@game-runtime/impl/resumeInteractiveGameSession";
import { savePlayableSelection } from "@player-web/impl/savePlayableSelection";
import { startInteractiveGameSession } from "@game-runtime/impl/startInteractiveGameSession";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { InteractiveInput } from "@game-core/api/command";
import type { SeriesCatalogEntry } from "@content/api/series";
import {
  loadStoredUndoSettings,
  saveStoredUndoSettings,
  toUndoSessionStartOptions,
  type BrowserUndoSettings,
} from "@player-web/impl/undoSettings";

const SESSION_SEED = 123456789;
const SOUND_MUTED_STORAGE_KEY = "tworld.sound-muted";
const SOUND_VOLUME_STORAGE_KEY = "tworld.sound-volume";
const LEGACY_FAST_TICK_MS = 25;
const LEGACY_NORMAL_TICK_MS = 50;
const UNDO_HOLD_REPEAT_DELAY_MS = 160;
const UNDO_HOLD_REPEAT_INTERVAL_MS = 40;

interface HelpCommand {
  keys: string;
  action: string;
}

interface HelpSection {
  title: string;
  commands: HelpCommand[];
}

function loadStoredMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadStoredVolume(): number {
  try {
    const stored = Number(window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
      return 0.7;
    }
    return Math.max(0, Math.min(1, stored));
  } catch {
    return 0.7;
  }
}

function interactiveEngineForRuleset(
  ruleset: SeriesCatalogEntry["ruleset"],
  engines: BrowserAppServices["engines"],
): InteractiveGameEnginePort {
  if (ruleset === "None") {
    throw new Error("This series does not declare a playable ruleset.");
  }

  return engines[ruleset];
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" className="legacy-toolbar__icon" viewBox="0 0 16 16">
      <path
        d="M2 6h3l4-3v10L5 10H2z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      {muted ? (
        <path d="M11 5l3 6M14 5l-3 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <>
          <path d="M11 6c1 .5 1.5 1.2 1.5 2S12 9.5 11 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.5 4.5C14 5.4 15 6.6 15 8s-1 2.6-2.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg aria-hidden="true" className="legacy-toolbar__icon" viewBox="0 0 16 16">
      <path
        d="M3 4v4h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path
        d="M4 8a4.5 4.5 0 1 0 1-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path d="M8 5v3l2 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const SERIES_LIST_HELP: HelpSection[] = [
  {
    title: "Series List",
    commands: [
      { keys: "Up / Down", action: "move the series selection" },
      { keys: "PageUp / PageDown", action: "jump backward or forward by 10 series" },
      { keys: "Home / End", action: "jump to the first or last series" },
      { keys: "Enter / Space", action: "start the selected series" },
      { keys: "Mouse click", action: "select a series; click the selected row again to start it" },
    ],
  },
];

const GAME_PLAYING_HELP: HelpSection[] = [
  {
    title: "While Playing",
    commands: [
      { keys: "Arrow keys / WASD", action: "move Chip and start the clock" },
      { keys: "Mouse click (MS)", action: "set a mouse goal on the clicked map tile" },
      { keys: "Hold Shift", action: "run the game clock at 2x speed" },
      { keys: "Space", action: "start the clock without moving" },
      { keys: "Z / hold Z", action: "restore the previous tick and keep rewinding while held when undo history is enabled" },
      { keys: "Shift + Z", action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GAME_ENDED_HELP: HelpSection[] = [
  {
    title: "After A Level Ends",
    commands: [
      { keys: "Enter / Space", action: "continue: next level after a win, retry after a loss" },
      { keys: "Z / hold Z", action: "restore the previous tick and keep rewinding while held when undo history is enabled" },
      { keys: "Shift + Z", action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GLOBAL_HELP: HelpSection[] = [
  {
    title: "Help",
    commands: [
      { keys: "? / F1 / button", action: "toggle this help overlay" },
    ],
  },
];

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

function clampIndex(value: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(count - 1, value));
}

function resolveInitialSelection(
  catalog: SeriesCatalogEntry[],
  stored: PlayableSelection | null,
): PlayableSelection | null {
  if (catalog.length === 0) {
    return null;
  }

  if (stored) {
    const series = catalog.find((candidate) => candidate.filebase === stored.seriesFile);
    const level = series?.levels.find((candidate) => candidate.number === stored.levelNumber);
    if (series && level) {
      return stored;
    }
  }

  const fallbackSeries = catalog[0]!;
  return {
    seriesFile: fallbackSeries.filebase,
    levelNumber: fallbackSeries.levels[0]?.number ?? 1,
  };
}

function pickLevelNumber(series: SeriesCatalogEntry | null, requested: number | null): number | null {
  if (!series) {
    return null;
  }

  if (requested !== null && series.levels.some((level) => level.number === requested)) {
    return requested;
  }

  return series.levels[0]?.number ?? null;
}

interface PlayerAppProps {
  services: BrowserAppServices;
}

export function PlayerApp({ services }: PlayerAppProps) {
  const { engines, fixtureRepository, selectionStore } = services;
  const undoSettingsSeedRef = useRef<BrowserUndoSettings | null>(null);
  if (undoSettingsSeedRef.current === null) {
    undoSettingsSeedRef.current = loadStoredUndoSettings();
  }
  const [mode, setMode] = useState<LegacyMode>("series-list");
  const [catalog, setCatalog] = useState<SeriesCatalogEntry[]>([]);
  const [selectedSeriesFile, setSelectedSeriesFile] = useState<string | null>(null);
  const [selectedLevelNumber, setSelectedLevelNumber] = useState<number | null>(null);
  const [session, setSession] = useState<InteractiveGameSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSoundControls, setShowSoundControls] = useState(false);
  const [showHistoryControls, setShowHistoryControls] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => loadStoredMuted());
  const [soundVolume, setSoundVolume] = useState(() => loadStoredVolume());
  const [undoSettings, setUndoSettings] = useState<BrowserUndoSettings>(undoSettingsSeedRef.current);
  const [manualRunStarted, setManualRunStarted] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [heldUndoMode, setHeldUndoMode] = useState<"tick" | "checkpoint" | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const tickingRef = useRef(false);
  const historyNavigationRef = useRef(false);
  const msInputBufferRef = useRef(new LegacyMsInputBuffer());
  const lynxInputBufferRef = useRef(new LegacyLynxInputBuffer());
  const soundPlayerRef = useRef<BrowserSoundEffectsPlayer | null>(null);
  const undoStartOptionsRef = useRef(toUndoSessionStartOptions(undoSettingsSeedRef.current));

  const currentSeries = catalog.find((series) => series.filebase === selectedSeriesFile) ?? null;
  const currentLevel = currentSeries?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const currentRuleset = session?.request.ruleset ?? (currentSeries?.ruleset === "None" ? null : currentSeries?.ruleset ?? null);
  const previousHistoryTick = session ? previousInteractiveGameSessionTick(session) : null;
  const previousHistoryCheckpointTick = session ? previousInteractiveGameSessionCheckpointTick(session) : null;
  const canUndoToPreviousTick = Boolean(session?.history.enabled && previousHistoryTick !== null);
  const canUndoToPreviousCheckpoint = Boolean(
    session?.history.enabled && previousHistoryCheckpointTick !== null,
  );
  const canResumeOriginalTimeline = Boolean(
    session?.history.enabled &&
      undoSettings.enableRewindAndResume &&
      session?.history.restoreMode === "restored-paused" &&
      session.history.latestTick > session.history.currentTick,
  );
  const historyStatusMessage =
    mode !== "game" || !session || !session.history.enabled || session.history.restoreMode === "live"
      ? null
      : session.history.restoreMode === "restored-paused"
        ? `Restored to tick ${session.history.currentTick}. ${
            canResumeOriginalTimeline
              ? `Use Resume Original Timeline to replay forward to tick ${session.history.latestTick}.`
              : "Use Z or Shift+Z to keep rewinding, or take over with a live move."
          }`
        : `Replaying the original timeline from tick ${session.history.currentTick} to tick ${session.history.replayTargetTick}. ${
            undoSettings.allowTakeoverDuringHistoricalReplay
              ? "Any live input will fork a new timeline."
              : "Live takeover is disabled in history settings."
          }`;
  const helpSections =
    mode === "series-list"
      ? [...SERIES_LIST_HELP, ...GLOBAL_HELP]
      : session?.frame.snapshot.status === "playing"
        ? [...GAME_PLAYING_HELP, ...GLOBAL_HELP]
        : [...GAME_ENDED_HELP, ...GLOBAL_HELP];

  useEffect(() => {
    const player = new BrowserSoundEffectsPlayer();
    soundPlayerRef.current = player;
    player.setMuted(soundMuted);
    player.setVolume(soundVolume);

    return () => {
      player.dispose();
      soundPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, soundMuted ? "1" : "0");
    } catch {
      // Ignore storage failures and keep in-memory settings.
    }
    soundPlayerRef.current?.setMuted(soundMuted);
  }, [soundMuted]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolume));
    } catch {
      // Ignore storage failures and keep in-memory settings.
    }
    soundPlayerRef.current?.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    if (mode !== "game") {
      setIsFastForwarding(false);
    }
  }, [mode]);

  useEffect(() => {
    undoStartOptionsRef.current = toUndoSessionStartOptions(undoSettings);
    saveStoredUndoSettings(undoSettings);
  }, [undoSettings]);

  useEffect(() => {
    let active = true;

    Promise.all([loadSeriesCatalog(fixtureRepository), loadPlayableSelection(selectionStore)])
      .then(([nextCatalog, storedSelection]) => {
        if (!active) {
          return;
        }

        const initialSelection = resolveInitialSelection(nextCatalog, storedSelection);
        startTransition(() => {
          setCatalog(nextCatalog);
          setSelectedSeriesFile(initialSelection?.seriesFile ?? null);
          setSelectedLevelNumber(initialSelection?.levelNumber ?? null);
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
          setIsCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    void savePlayableSelection(selectionStore, {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [selectedLevelNumber, selectedSeriesFile]);

  useEffect(() => {
    if (mode !== "game" || !selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    const series = catalog.find((candidate) => candidate.filebase === selectedSeriesFile);
    if (!series) {
      return;
    }
    if (series.ruleset === "None") {
      setMode("series-list");
      setMessage(`${series.filebase} does not declare a playable ruleset.`);
      return;
    }
    let active = true;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setIsSessionLoading(true);

    startInteractiveGameSession(interactiveEngineForRuleset(series.ruleset, engines), {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
      ruleset: series.ruleset,
      randomSeed: SESSION_SEED,
    }, undoStartOptionsRef.current)
      .then((nextSession) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSession(nextSession);
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
  }, [catalog, engines, mode, reloadToken, selectedLevelNumber, selectedSeriesFile]);

  const advanceTick = useEffectEvent(async (input: InteractiveInput) => {
    if (mode !== "game" || !session || tickingRef.current) {
      return;
    }

    tickingRef.current = true;
    try {
      const nextSession = await advanceInteractiveGameSession(
        interactiveEngineForRuleset(session.request.ruleset, engines),
        session,
        input,
      );
      startTransition(() => {
        setSession(nextSession);
      });
      if (nextSession.frame.snapshot.status !== "playing") {
        setIsRunning(false);
      }
    } catch (error: unknown) {
      setIsRunning(false);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      tickingRef.current = false;
    }
  });

  const syncSessionState = useEffectEvent((nextSession: InteractiveGameSession) => {
    startTransition(() => {
      setSession(nextSession);
      setIsRunning(
        nextSession.frame.snapshot.status === "playing" && nextSession.history.restoreMode !== "restored-paused",
      );
      setMessage(null);
    });
  });

  const restoreToTick = useEffectEvent((targetTick: number | null) => {
    if (targetTick === null || mode !== "game" || !session || historyNavigationRef.current) {
      return;
    }

    historyNavigationRef.current = true;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();

    void restoreInteractiveGameSession(
      interactiveEngineForRuleset(session.request.ruleset, engines),
      session,
      targetTick,
    )
      .then(syncSessionState)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const undoPreviousTick = useEffectEvent(() => {
    restoreToTick(previousHistoryTick);
  });

  const undoPreviousCheckpoint = useEffectEvent(() => {
    restoreToTick(previousHistoryCheckpointTick);
  });

  const resumeOriginalTimeline = useEffectEvent(() => {
    if (!canResumeOriginalTimeline || mode !== "game" || !session || historyNavigationRef.current) {
      return;
    }

    historyNavigationRef.current = true;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();

    void resumeInteractiveGameSession(
      interactiveEngineForRuleset(session.request.ruleset, engines),
      session,
    )
      .then(syncSessionState)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const stopHeldUndo = useEffectEvent(() => {
    setHeldUndoMode(null);
  });

  const stepHeldUndo = useEffectEvent((nextMode: "tick" | "checkpoint") => {
    if (nextMode === "checkpoint") {
      undoPreviousCheckpoint();
      return;
    }

    undoPreviousTick();
  });

  useEffect(() => {
    if (
      mode !== "game" ||
      !session ||
      !isRunning ||
      showHelp ||
      (session.mode === "manual" && !manualRunStarted)
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const inputCode =
        session.request.ruleset === "Lynx"
          ? lynxInputBufferRef.current.nextTickInputCode()
          : msInputBufferRef.current.nextTickInputCode();
      void advanceTick(inputCode);
    }, isFastForwarding ? LEGACY_FAST_TICK_MS : LEGACY_NORMAL_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [advanceTick, isFastForwarding, isRunning, manualRunStarted, mode, session, showHelp]);

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

  const selectSeries = useEffectEvent((seriesFile: string) => {
    const series = catalog.find((candidate) => candidate.filebase === seriesFile) ?? null;
    setSelectedSeriesFile(seriesFile);
    setSelectedLevelNumber((current) => pickLevelNumber(series, current));
    setMessage(null);
  });

  const activateSeries = useEffectEvent((seriesFile: string) => {
    const series = catalog.find((candidate) => candidate.filebase === seriesFile) ?? null;
    if (!series) {
      return;
    }
    if (series.ruleset === "None") {
      setMode("series-list");
      setMessage(`${series.filebase} does not declare a playable ruleset.`);
      return;
    }

    selectSeries(seriesFile);
    setMode("game");
  });

  const changeSelectedSeriesBy = useEffectEvent((delta: number) => {
    if (catalog.length === 0) {
      return;
    }

    const currentIndex = catalog.findIndex((series) => series.filebase === selectedSeriesFile);
    const nextIndex = clampIndex((currentIndex >= 0 ? currentIndex : 0) + delta, catalog.length);
    selectSeries(catalog[nextIndex]!.filebase);
  });

  const jumpSelectedSeries = useEffectEvent((position: "first" | "last") => {
    if (catalog.length === 0) {
      return;
    }

    selectSeries(position === "first" ? catalog[0]!.filebase : catalog[catalog.length - 1]!.filebase);
  });

  const changeLevelBy = useEffectEvent((delta: number) => {
    if (!currentSeries || !currentLevel) {
      return;
    }

    const currentIndex = currentSeries.levels.findIndex((level) => level.number === currentLevel.number);
    const nextIndex = clampIndex(currentIndex + delta, currentSeries.levels.length);
    const nextLevel = currentSeries.levels[nextIndex];
    if (!nextLevel || nextLevel.number === currentLevel.number) {
      return;
    }

    setSelectedLevelNumber(nextLevel.number);
  });

  const jumpLevel = useEffectEvent((position: "first" | "last") => {
    if (!currentSeries || currentSeries.levels.length === 0) {
      return;
    }

    const nextLevel = position === "first" ? currentSeries.levels[0] : currentSeries.levels[currentSeries.levels.length - 1];
    if (!nextLevel) {
      return;
    }

    setSelectedLevelNumber(nextLevel.number);
  });

  const proceedAfterLevelEnd = useEffectEvent(() => {
    if (!session || !currentSeries || !currentLevel) {
      return;
    }

    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();

    if (session.frame.snapshot.status === "completed") {
      const currentIndex = currentSeries.levels.findIndex((level) => level.number === currentLevel.number);
      const nextLevel = currentSeries.levels[currentIndex + 1];
      if (nextLevel) {
        setSelectedLevelNumber(nextLevel.number);
        setMessage(null);
        return;
      }

      setMode("series-list");
      setMessage(`${currentSeries.filebase} completed.`);
      return;
    }

    if (session.frame.snapshot.status === "failed") {
      setReloadToken((value) => value + 1);
    }
  });

  const toggleHelp = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setShowSoundControls(false);
    setShowHistoryControls(false);
    setShowHelp((value) => !value);
  });

  const closeHelp = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    stopHeldUndo();
    setShowHelp(false);
  });

  const toggleSoundControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowHistoryControls(false);
    setShowSoundControls((value) => !value);
  });

  const closeSoundControls = useEffectEvent(() => {
    stopHeldUndo();
    setShowSoundControls(false);
  });

  const toggleHistoryControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls((value) => !value);
  });

  const closeHistoryControls = useEffectEvent(() => {
    stopHeldUndo();
    setShowHistoryControls(false);
  });

  const toggleMuted = useEffectEvent(() => {
    if (soundMuted || soundVolume <= 0) {
      setSoundMuted(false);
      if (soundVolume <= 0) {
        setSoundVolume(0.7);
      }
      return;
    }

    setSoundMuted(true);
  });

  useEffect(() => {
    if (showHelp) {
      setShowSoundControls(false);
      setShowHistoryControls(false);
    }
  }, [showHelp]);

  useEffect(() => {
    const player = soundPlayerRef.current;
    if (!player) {
      return;
    }

    if (mode !== "game" || !session || showHelp) {
      player.reset();
      return;
    }

    player.syncFrame(
      `${session.request.seriesFile}:${session.request.levelNumber}:${session.request.ruleset}`,
      session.request.ruleset,
      session.frame.snapshot.tick,
      session.frame.snapshot.soundEffects,
    );
  }, [mode, session, showHelp]);

  useEffect(() => {
    if (!showSoundControls && !showHistoryControls) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".legacy-toolbar")) {
        return;
      }

      setShowSoundControls(false);
      setShowHistoryControls(false);
      stopHeldUndo();
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showHistoryControls, showSoundControls]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        if (mode === "game") {
          setIsFastForwarding(true);
        }
        return;
      }

      if (isSystemModifierKey(event.key)) {
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
      }

      if (isHelpToggleKey(event.key)) {
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

      if (session?.history.enabled && isUndoCheckpointKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("checkpoint");
        undoPreviousCheckpoint();
        return;
      }

      if (session?.history.enabled && isUndoKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("tick");
        undoPreviousTick();
        return;
      }

      const startClockKey =
        session?.mode === "manual" &&
        !manualRunStarted &&
        (event.key === " " || event.key === "Spacebar" || keyToInput(event.key) !== null);
      if (startClockKey) {
        event.preventDefault();
        setManualRunStarted(true);
      }

      if (session && session.frame.snapshot.status !== "playing" && isProceedKey(event.key)) {
        event.preventDefault();
        proceedAfterLevelEnd();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
        setIsRunning(false);
        setMode("series-list");
        return;
      }

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        setReloadToken((value) => value + 1);
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
        session?.history.restoreMode === "replaying-history" &&
        !undoSettings.allowTakeoverDuringHistoricalReplay &&
        (input !== null || event.key === " " || event.key === "Spacebar")
      ) {
        event.preventDefault();
        return;
      }
      if ((event.key === " " || event.key === "Spacebar") && session?.mode === "manual") {
        event.preventDefault();
        if (session.history.restoreMode === "restored-paused") {
          setIsRunning(true);
        }
        return;
      }
      if (!input) {
        return;
      }

      if (hasBlockedMovementModifier(event)) {
        event.preventDefault();
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
        return;
      }

      event.preventDefault();
      if (session?.request.ruleset === "Lynx") {
        lynxInputBufferRef.current.keyDown(input);
      } else {
        msInputBufferRef.current.keyDown(input);
      }
      if (session?.history.restoreMode === "restored-paused") {
        setIsRunning(true);
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Shift") {
        setIsFastForwarding(false);
        return;
      }

      if (mode !== "game") {
        return;
      }

      if (isSystemModifierKey(event.key)) {
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
        return;
      }

      if (event.key === "z" || event.key === "Z") {
        stopHeldUndo();
      }

      const input = keyToInput(event.key);
      if (input) {
        event.preventDefault();
        if (session?.request.ruleset === "Lynx") {
          lynxInputBufferRef.current.keyUp(input);
        } else {
          msInputBufferRef.current.keyUp(input);
        }
      }
    };

    const onWindowBlur = () => {
      setIsFastForwarding(false);
      stopHeldUndo();
      msInputBufferRef.current.reset();
      lynxInputBufferRef.current.reset();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    activateSeries,
    changeLevelBy,
    changeSelectedSeriesBy,
    closeHelp,
    closeHistoryControls,
    jumpLevel,
    jumpSelectedSeries,
    mode,
    proceedAfterLevelEnd,
    selectedSeriesFile,
    session,
    showHistoryControls,
    showSoundControls,
    showHelp,
    closeSoundControls,
    stopHeldUndo,
    stepHeldUndo,
    toggleHelp,
    undoPreviousCheckpoint,
    undoPreviousTick,
    undoSettings.allowTakeoverDuringHistoricalReplay,
  ]);

  return (
    <main className="legacy-shell">
      <div className="legacy-toolbar">
        <div className="legacy-sound">
          <button
            aria-expanded={showSoundControls}
            aria-label={soundMuted ? "Sound muted; open sound controls" : "Open sound controls"}
            className="legacy-toolbar__button"
            onClick={toggleSoundControls}
            type="button"
          >
            <SoundIcon muted={soundMuted || soundVolume <= 0} />
          </button>
          {showSoundControls ? (
            <section
              aria-label="Sound controls"
              className="legacy-sound__panel"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="legacy-sound__header">
                <span className="legacy-sound__title">Sound</span>
                <button className="legacy-sound__mute" onClick={toggleMuted} type="button">
                  {soundMuted || soundVolume <= 0 ? "Enable" : "Mute"}
                </button>
              </div>
              <label className="legacy-sound__label" htmlFor="legacy-sound-volume">
                Volume
              </label>
              <input
                className="legacy-sound__slider"
                id="legacy-sound-volume"
                max="1"
                min="0"
                onChange={(event) => {
                  const nextVolume = Number(event.currentTarget.value);
                  setSoundVolume(Number.isFinite(nextVolume) ? nextVolume : 0.7);
                  if (nextVolume > 0 && soundMuted) {
                    setSoundMuted(false);
                  }
                }}
                step="0.05"
                type="range"
                value={soundVolume}
              />
              <div className="legacy-sound__footer">
                <span>{Math.round(soundVolume * 100)}%</span>
                <button className="legacy-sound__close" onClick={closeSoundControls} type="button">
                  Close
                </button>
              </div>
            </section>
          ) : null}
        </div>
        <div className="legacy-history">
          <button
            aria-expanded={showHistoryControls}
            aria-label="Open undo and rewind controls"
            className="legacy-toolbar__button"
            onClick={toggleHistoryControls}
            type="button"
          >
            <HistoryIcon />
          </button>
          {showHistoryControls ? (
            <section
              aria-label="Undo and rewind controls"
              className="legacy-history__panel"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="legacy-history__header">
                <span className="legacy-history__title">History</span>
                <button className="legacy-history__close" onClick={closeHistoryControls} type="button">
                  Close
                </button>
              </div>
              {mode === "game" && session ? (
                <div className="legacy-history__summary">
                  <div className="legacy-history__summary-row">
                    <span>Tick</span>
                    <span>
                      {session.history.currentTick} / {session.history.latestTick}
                    </span>
                  </div>
                  <div className="legacy-history__summary-row">
                    <span>Timeline</span>
                    <span>
                      {session.history.timelineId} ({session.history.timelineCount})
                    </span>
                  </div>
                  <div className="legacy-history__summary-row">
                    <span>State</span>
                    <span>{session.history.restoreMode}</span>
                  </div>
                </div>
              ) : (
                <p className="legacy-history__note">Start a level to use undo, rewind, and resume.</p>
              )}
              <div className="legacy-history__actions">
                <button
                  className="legacy-history__action"
                  disabled={!canUndoToPreviousTick}
                  onClick={undoPreviousTick}
                  type="button"
                >
                  Undo (Z)
                </button>
                <button
                  className="legacy-history__action"
                  disabled={!canUndoToPreviousCheckpoint}
                  onClick={undoPreviousCheckpoint}
                  type="button"
                >
                  Rewind (Shift+Z)
                </button>
                <button
                  className="legacy-history__action"
                  disabled={!canResumeOriginalTimeline}
                  onClick={resumeOriginalTimeline}
                  type="button"
                >
                  Resume Original Timeline
                </button>
              </div>
              <div className="legacy-history__settings">
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.enabled}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enabled: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Undo History</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.enableRewindAndResume}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enableRewindAndResume: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Rewind And Resume</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.allowTakeoverDuringHistoricalReplay}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        allowTakeoverDuringHistoricalReplay: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Allow Takeover During Historical Replay</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        retainUnlimitedHistory: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Keep Unlimited History</span>
                </label>
                <label className="legacy-history__field">
                  <span>Checkpoint Density</span>
                  <select
                    onChange={(event) => {
                      const nextDensity = event.currentTarget.value as BrowserUndoSettings["checkpointDensity"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointDensity: nextDensity,
                      }));
                    }}
                    value={undoSettings.checkpointDensity}
                  >
                    <option value="dense">Dense</option>
                    <option value="standard">Standard</option>
                    <option value="sparse">Sparse</option>
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>History Retention Mode</span>
                  <select
                    onChange={(event) => {
                      const nextMode = event.currentTarget.value as BrowserUndoSettings["checkpointRetentionMode"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointRetentionMode: nextMode,
                      }));
                    }}
                    value={undoSettings.checkpointRetentionMode}
                  >
                    <option value="dense-recent-exponential">Dense recent + exponential</option>
                    <option value="dense-recent">Dense recent only</option>
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>Bounded History Window</span>
                  <select
                    disabled={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      const nextWindow = Number(event.currentTarget.value) as BrowserUndoSettings["maximumRetainedHistoryMinutes"];
                      setUndoSettings((current) => ({
                        ...current,
                        maximumRetainedHistoryMinutes: nextWindow,
                      }));
                    }}
                    value={undoSettings.maximumRetainedHistoryMinutes}
                  >
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </label>
              </div>
              <p className="legacy-history__note">
                New history settings apply on the next level load or restart.
              </p>
            </section>
          ) : null}
        </div>
        <button
          aria-label={showHelp ? "Hide keyboard help" : "Show keyboard help"}
          className="legacy-toolbar__button"
          onClick={toggleHelp}
          type="button"
        >
          ?
        </button>
      </div>
      {historyStatusMessage ? (
        <div className="legacy-history__status" role="status">
          {historyStatusMessage}
        </div>
      ) : null}
      <LegacyCanvasScreen
        catalog={catalog}
        currentLevel={currentLevel}
        currentSeries={currentSeries}
        currentRuleset={currentRuleset}
        isLoading={isCatalogLoading || isSessionLoading}
        message={message}
        mode={mode}
        onMapClick={(position) => {
          if (
            mode !== "game" ||
            !session ||
            session.mode !== "manual" ||
            session.request.ruleset !== "MS" ||
            session.frame.snapshot.status !== "playing" ||
            (session.history.restoreMode === "replaying-history" &&
              !undoSettings.allowTakeoverDuringHistoricalReplay)
          ) {
            return;
          }

          msInputBufferRef.current.queueAbsoluteMouseMove(position);
          if (!manualRunStarted) {
            setManualRunStarted(true);
          }
          if (!isRunning) {
            setIsRunning(true);
          }
        }}
        onActivateSeries={activateSeries}
        onSelectSeries={selectSeries}
        selectedSeriesFile={selectedSeriesFile}
        session={session}
      />
      {showHelp ? (
        <div
          className="legacy-help-backdrop"
          onClick={closeHelp}
          role="presentation"
        >
          <section
            aria-label="Keyboard help"
            className="legacy-help"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="legacy-help__header">
              <h2 className="legacy-help__title">Controls</h2>
              <button className="legacy-help__close" onClick={closeHelp} type="button">
                Close
              </button>
            </div>
            <p className="legacy-help__note">Listed commands are the ones currently wired in the browser build.</p>
            {helpSections.map((section) => (
              <section className="legacy-help__section" key={section.title}>
                <h3 className="legacy-help__section-title">{section.title}</h3>
                <div className="legacy-help__table">
                  {section.commands.map((command) => (
                    <div className="legacy-help__row" key={`${section.title}-${command.keys}`}>
                      <span className="legacy-help__keys">{command.keys}</span>
                      <span className="legacy-help__action">{command.action}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </section>
        </div>
      ) : null}
    </main>
  );
}
