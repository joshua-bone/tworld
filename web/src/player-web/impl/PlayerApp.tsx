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
} from "@player-web/impl/legacyHotkeys";
import {
  LegacyLynxInputBuffer,
  LegacyMsInputBuffer,
  type DirectionInput,
} from "@player-web/impl/legacyInput";
import { LegacyCanvasScreen, type LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import { advanceInteractiveGameSession } from "@application/use-cases/advanceInteractiveGameSession";
import { loadPlayableSelection } from "@application/use-cases/loadPlayableSelection";
import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import { savePlayableSelection } from "@application/use-cases/savePlayableSelection";
import { startInteractiveGameSession } from "@application/use-cases/startInteractiveGameSession";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { PlayableSelection } from "@application/ports/PlayableSelectionStore";
import type { InteractiveInput } from "@domain/game/command";
import type { SeriesCatalogEntry } from "@domain/series";

const SESSION_SEED = 123456789;
const SOUND_MUTED_STORAGE_KEY = "tworld.sound-muted";
const SOUND_VOLUME_STORAGE_KEY = "tworld.sound-volume";
const LEGACY_FAST_TICK_MS = 25;
const LEGACY_NORMAL_TICK_MS = 50;

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
  const [soundMuted, setSoundMuted] = useState(() => loadStoredMuted());
  const [soundVolume, setSoundVolume] = useState(() => loadStoredVolume());
  const [manualRunStarted, setManualRunStarted] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const tickingRef = useRef(false);
  const msInputBufferRef = useRef(new LegacyMsInputBuffer());
  const lynxInputBufferRef = useRef(new LegacyLynxInputBuffer());
  const soundPlayerRef = useRef<BrowserSoundEffectsPlayer | null>(null);

  const currentSeries = catalog.find((series) => series.filebase === selectedSeriesFile) ?? null;
  const currentLevel = currentSeries?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const currentRuleset = session?.request.ruleset ?? (currentSeries?.ruleset === "None" ? null : currentSeries?.ruleset ?? null);
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
    })
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
    setShowHelp((value) => !value);
  });

  const closeHelp = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setShowHelp(false);
  });

  const toggleSoundControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowSoundControls((value) => !value);
  });

  const closeSoundControls = useEffectEvent(() => {
    setShowSoundControls(false);
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
    if (!showSoundControls) {
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
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showSoundControls]);

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
      if ((event.key === " " || event.key === "Spacebar") && session?.mode === "manual") {
        event.preventDefault();
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
    jumpLevel,
    jumpSelectedSeries,
    mode,
    proceedAfterLevelEnd,
    selectedSeriesFile,
    session,
    showSoundControls,
    showHelp,
    closeSoundControls,
    toggleHelp,
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
        <button
          aria-label={showHelp ? "Hide keyboard help" : "Show keyboard help"}
          className="legacy-toolbar__button"
          onClick={toggleHelp}
          type="button"
        >
          ?
        </button>
      </div>
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
            session.frame.snapshot.status !== "playing"
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
