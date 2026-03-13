import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { StaticCharacterizationFixtureRepository } from "@adapters/fixtures/StaticCharacterizationFixtureRepository";
import {
  hasBlockedMovementModifier,
  isFirstLevelKey,
  isHelpToggleKey,
  isSystemModifierKey,
  isLastLevelKey,
  isNextLevelKey,
  isPrevLevelKey,
  isProceedKey,
} from "@adapters/react/legacyHotkeys";
import { BrowserLevelRepository } from "@adapters/levels/BrowserLevelRepository";
import { LegacyMsInputBuffer, type DirectionInput } from "@adapters/react/legacyMsInput";
import { LegacyCanvasScreen, type LegacyMode } from "@adapters/react/components/LegacyCanvasScreen";
import { BrowserPlayableSelectionStore } from "@adapters/storage/BrowserPlayableSelectionStore";
import { advanceInteractiveGameSession } from "@application/use-cases/advanceInteractiveGameSession";
import { loadPlayableSelection } from "@application/use-cases/loadPlayableSelection";
import { loadSeriesCatalog } from "@application/use-cases/loadSeriesCatalog";
import { savePlayableSelection } from "@application/use-cases/savePlayableSelection";
import { startInteractiveGameSession } from "@application/use-cases/startInteractiveGameSession";
import type { InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { PlayableSelection } from "@application/ports/PlayableSelectionStore";
import type { GameInputName } from "@domain/game/command";
import type { SeriesCatalogEntry } from "@domain/series";

const fixtureRepository = new StaticCharacterizationFixtureRepository();
const engine = new TsMsGameEngineAdapter(new BrowserLevelRepository());
const selectionStore = new BrowserPlayableSelectionStore();
const SESSION_SEED = 123456789;

interface HelpCommand {
  keys: string;
  action: string;
}

interface HelpSection {
  title: string;
  commands: HelpCommand[];
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
      { keys: "Arrow keys / WASD", action: "move Chip" },
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

export function App() {
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
  const [reloadToken, setReloadToken] = useState(0);
  const tickingRef = useRef(false);
  const inputBufferRef = useRef(new LegacyMsInputBuffer());

  const currentSeries = catalog.find((series) => series.filebase === selectedSeriesFile) ?? null;
  const currentLevel = currentSeries?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const helpSections =
    mode === "series-list"
      ? [...SERIES_LIST_HELP, ...GLOBAL_HELP]
      : session?.frame.snapshot.status === "playing"
        ? [...GAME_PLAYING_HELP, ...GLOBAL_HELP]
        : [...GAME_ENDED_HELP, ...GLOBAL_HELP];

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
    if (series.ruleset !== "MS") {
      setMode("series-list");
      setMessage(`${series.filebase} uses ${series.ruleset}. Lynx gameplay is not ported yet.`);
      return;
    }

    let active = true;
    inputBufferRef.current.reset();
    setIsRunning(false);
    setIsSessionLoading(true);

    startInteractiveGameSession(engine, {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
      ruleset: "MS",
      randomSeed: SESSION_SEED,
    })
      .then((nextSession) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setSession(nextSession);
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
  }, [catalog, mode, reloadToken, selectedLevelNumber, selectedSeriesFile]);

  const advanceTick = useEffectEvent(async (input: GameInputName) => {
    if (mode !== "game" || !session || tickingRef.current) {
      return;
    }

    tickingRef.current = true;
    try {
      const nextSession = await advanceInteractiveGameSession(engine, session, input);
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
    if (mode !== "game" || !session || !isRunning || showHelp) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void advanceTick(inputBufferRef.current.nextTickInput());
    }, 50);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [advanceTick, isRunning, mode, session, showHelp]);

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

    selectSeries(seriesFile);
    if (series.ruleset !== "MS") {
      setMode("series-list");
      setMessage(`${series.filebase} uses ${series.ruleset}. Lynx gameplay is not ported yet.`);
      return;
    }

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

    inputBufferRef.current.reset();

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
    inputBufferRef.current.reset();
    setShowHelp((value) => !value);
  });

  const closeHelp = useEffectEvent(() => {
    inputBufferRef.current.reset();
    setShowHelp(false);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isSystemModifierKey(event.key)) {
        inputBufferRef.current.reset();
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

      if (session && session.frame.snapshot.status !== "playing" && isProceedKey(event.key)) {
        event.preventDefault();
        proceedAfterLevelEnd();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        inputBufferRef.current.reset();
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
      if (!input) {
        return;
      }

      if (hasBlockedMovementModifier(event)) {
        event.preventDefault();
        inputBufferRef.current.reset();
        return;
      }

      event.preventDefault();
      inputBufferRef.current.keyDown(input);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (mode !== "game") {
        return;
      }

      if (isSystemModifierKey(event.key)) {
        inputBufferRef.current.reset();
        return;
      }

      const input = keyToInput(event.key);
      if (input) {
        event.preventDefault();
        inputBufferRef.current.keyUp(input);
      }
    };

    const onWindowBlur = () => {
      inputBufferRef.current.reset();
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
    showHelp,
    toggleHelp,
  ]);

  return (
    <main className="legacy-shell">
      <button
        aria-label={showHelp ? "Hide keyboard help" : "Show keyboard help"}
        className="legacy-help-toggle"
        onClick={toggleHelp}
        type="button"
      >
        ?
      </button>
      <LegacyCanvasScreen
        catalog={catalog}
        currentLevel={currentLevel}
        currentSeries={currentSeries}
        isLoading={isCatalogLoading || isSessionLoading}
        message={message}
        mode={mode}
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
