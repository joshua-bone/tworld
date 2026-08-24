import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LegacyCanvasScreen, LegacyInventoryStrip } from "@player-web/impl/LegacyCanvasScreen";
import type { LibrarySidebarTab } from "@player-web/impl/modern/modernDashboardNavigationController";
import {
  ModernDashboardLevelsPane,
  ModernDashboardPaneRail,
  ModernDashboardSetsPane,
  ModernDashboardSplitter,
} from "@player-web/impl/modern/modernDashboardPanels";
import {
  ModernDashboardMessageModal,
  ModernDashboardSetInfoModal,
} from "@player-web/impl/modern/modernDashboardModals";
import { useModernDashboardPaneLayout } from "@player-web/impl/modern/useModernDashboardPaneLayout";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";
import {
  HybridCcDatCatalog,
  type HybridCcDatCatalogEntry,
} from "./datCatalog";
import {
  HybridCcV0InputCollector,
  replayInputForDirections,
  type HybridCcDirection,
} from "./inputCollector";
import { loadHybridCcWasm } from "./loadWasm";
import type { HybridCcNativeLevel } from "./nativeLevel";
import {
  hybridCcSeriesLevel,
  projectHybridCcSession,
} from "./renderProjection";
import {
  buildHybridCcFamilies,
  buildHybridCcSeriesByEntryId,
  HYBRID_CC_V0_RULESET_LABEL,
  hybridCcV0FamilyProgressLabel,
  shouldAdvanceHybridCcV0Runtime,
} from "./uiModel";
import {
  createHybridCcEngine,
  importHybridCcDat,
  type HybridCcEngine,
  type HybridCcSnapshot,
  type HybridCcWasmModule,
} from "./wasmBridge";

interface ActiveRuntime {
  engine: HybridCcEngine;
  level: HybridCcNativeLevel;
  snapshot: HybridCcSnapshot;
  lastInput: number;
}

const DIRECTION_KEYS: Readonly<Record<string, HybridCcDirection | undefined>> = {
  ArrowUp: "north",
  KeyW: "north",
  ArrowRight: "east",
  KeyD: "east",
  ArrowDown: "south",
  KeyS: "south",
  ArrowLeft: "west",
  KeyA: "west",
  w: "north",
  W: "north",
  d: "east",
  D: "east",
  s: "south",
  S: "south",
  a: "west",
  A: "west",
};

const EMPTY_PROGRESS = new Map<string, BrowserLevelProgressSummary>();
const EMPTY_LEVELS: readonly HybridCcNativeLevel[] = [];

function directionForEvent(event: KeyboardEvent): HybridCcDirection | undefined {
  return DIRECTION_KEYS[event.code] ?? DIRECTION_KEYS[event.key];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTime(level: HybridCcNativeLevel, snapshot: HybridCcSnapshot): string {
  if (level.timeLimitSeconds === 0) {
    return "---";
  }
  return String(Math.max(0, level.timeLimitSeconds - Math.floor(snapshot.logicStep / 10)));
}

function familyMatchesSearch(title: string, summary: string | null, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized.length === 0
    || title.toLocaleLowerCase().includes(normalized)
    || summary?.toLocaleLowerCase().includes(normalized) === true;
}

function ChainLinkIcon() {
  return (
    <svg aria-hidden="true" className="modern-link-icon-button__icon" viewBox="0 0 16 16">
      <path
        d="M6.2 9.8 4.6 11.4a2.2 2.2 0 1 1-3.1-3.1L3.8 6M9.8 6.2l1.6-1.6a2.2 2.2 0 1 1 3.1 3.1L12.2 10M5.6 10.4l4.8-4.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function HybridCcV0App() {
  const datCatalog = useMemo(() => new HybridCcDatCatalog(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const moduleRef = useRef<HybridCcWasmModule | null>(null);
  const runtimeRef = useRef<ActiveRuntime | null>(null);
  const heldDirectionsRef = useRef<HybridCcDirection[]>([]);
  const activeLevelRowRef = useRef<HTMLButtonElement | null>(null);
  const gameplayFocusRef = useRef<HTMLElement | null>(null);
  const [entries, setEntries] = useState<HybridCcDatCatalogEntry[]>([]);
  const [levelsByEntryId, setLevelsByEntryId] = useState<ReadonlyMap<string, readonly HybridCcNativeLevel[]>>(
    () => new Map(),
  );
  const [loadErrorByEntryId, setLoadErrorByEntryId] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedLevelIndex, setSelectedLevelIndex] = useState(0);
  const [runtime, setRuntime] = useState<ActiveRuntime | null>(null);
  const [activeTab, setActiveTab] = useState<LibrarySidebarTab>("official");
  const [searchQuery, setSearchQuery] = useState("");
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(true);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [setInfoFamilyId, setSetInfoFamilyId] = useState<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "HybridCC v0 · Tile World Online";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  const disposeRuntime = useCallback(() => {
    runtimeRef.current?.engine.dispose();
    runtimeRef.current = null;
    setRuntime(null);
  }, []);

  const startLevel = useCallback((level: HybridCcNativeLevel) => {
    const module = moduleRef.current;
    if (!module) {
      return;
    }
    runtimeRef.current?.engine.dispose();
    const engine = createHybridCcEngine(module, level, 0);
    const next = { engine, level, snapshot: engine.snapshot(), lastInput: 0 };
    runtimeRef.current = next;
    heldDirectionsRef.current = [];
    setRuntime(next);
    setStarted(false);
    setPaused(false);
    setMessage(null);
    window.requestAnimationFrame(() => {
      gameplayFocusRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadHybridCcWasm(), datCatalog.list()])
      .then(async ([module, availableEntries]) => {
        moduleRef.current = module;
        const loaded = await Promise.all(availableEntries.map(async (entry) => {
          try {
            const levels = importHybridCcDat(module, await entry.loadBytes());
            return { entry, levels, error: null };
          } catch (error: unknown) {
            return { entry, levels: null, error };
          }
        }));
        if (cancelled) {
          return;
        }
        const nextLevels = new Map<string, readonly HybridCcNativeLevel[]>();
        const nextErrors = new Map<string, string>();
        for (const result of loaded) {
          if (result.levels && result.levels.length > 0) {
            nextLevels.set(result.entry.id, result.levels);
          } else if (result.error !== null) {
            nextErrors.set(result.entry.id, errorMessage(result.error));
          }
        }
        setEntries(availableEntries);
        setLevelsByEntryId(nextLevels);
        setLoadErrorByEntryId(nextErrors);
        const firstPlayable = availableEntries.find((entry) => nextLevels.has(entry.id));
        setSelectedEntryId((current) => current ?? firstPlayable?.id ?? null);
        if (!firstPlayable) {
          const firstFailure = loaded.find((result) => result.error !== null);
          setMessage(firstFailure
            ? `${firstFailure.entry.filename}: ${errorMessage(firstFailure.error)}`
            : "No playable DAT sets are available.");
        }
        setBusy(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMessage(errorMessage(error));
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datCatalog]);

  const selectedLevels = selectedEntryId ? levelsByEntryId.get(selectedEntryId) ?? EMPTY_LEVELS : EMPTY_LEVELS;
  const selectedEntryFilename = entries.find((entry) => entry.id === selectedEntryId)?.filename ?? null;
  const selectedLoadError = selectedEntryId ? loadErrorByEntryId.get(selectedEntryId) ?? null : null;

  useEffect(() => {
    disposeRuntime();
    if (selectedLevels.length === 0) {
      if (selectedEntryFilename) {
        setMessage(`${selectedEntryFilename}: ${selectedLoadError ?? "This DAT contains no playable levels."}`);
      }
      return;
    }
    setSelectedLevelIndex(0);
    startLevel(selectedLevels[0]!);
  }, [disposeRuntime, selectedEntryFilename, selectedLevels, selectedLoadError, startLevel]);

  useEffect(() => () => {
    runtimeRef.current?.engine.dispose();
  }, []);

  const selectLevel = useCallback((index: number) => {
    if (selectedLevels.length === 0) return;
    const wrapped = (index + selectedLevels.length) % selectedLevels.length;
    setSelectedLevelIndex(wrapped);
    startLevel(selectedLevels[wrapped]!);
  }, [selectedLevels, startLevel]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const direction = directionForEvent(event);
      if (direction) {
        event.preventDefault();
        setStarted(true);
        if (!heldDirectionsRef.current.includes(direction)) {
          heldDirectionsRef.current = [...heldDirectionsRef.current, direction];
        }
        return;
      }
      if (event.repeat) return;
      if (event.code === "Space" || event.code === "Backspace" || event.code === "Delete") {
        event.preventDefault();
        setPaused((current) => !current);
      } else if (event.code === "KeyR" && runtimeRef.current) {
        event.preventDefault();
        startLevel(runtimeRef.current.level);
      } else if (event.code === "KeyP" || event.code === "PageUp") {
        event.preventDefault();
        selectLevel(selectedLevelIndex - 1);
      } else if (event.code === "KeyN" || event.code === "PageDown") {
        event.preventDefault();
        selectLevel(selectedLevelIndex + 1);
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      const direction = directionForEvent(event);
      if (!direction) return;
      event.preventDefault();
      heldDirectionsRef.current = heldDirectionsRef.current.filter((held) => held !== direction);
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [selectLevel, selectedLevelIndex, startLevel]);

  useEffect(() => {
    if (!runtime || !shouldAdvanceHybridCcV0Runtime(started, paused, runtime.snapshot.outcome.kind)) return;
    const collector = new HybridCcV0InputCollector();
    let sampleIndex = 0;
    const interval = window.setInterval(() => {
      const active = runtimeRef.current;
      if (!active) return;
      const collected = collector.capture(heldDirectionsRef.current);
      if (sampleIndex === 0) {
        try {
          const lastInput = replayInputForDirections(collected);
          const snapshot = active.engine.logicStep(lastInput);
          const next = { ...active, snapshot, lastInput };
          runtimeRef.current = next;
          setRuntime(next);
        } catch (error: unknown) {
          setMessage(errorMessage(error));
          setPaused(true);
        }
      }
      sampleIndex = (sampleIndex + 1) % 4;
    }, 25);
    return () => window.clearInterval(interval);
  }, [paused, runtime?.engine, runtime?.snapshot.outcome.kind, started]);

  const importFiles = useCallback(async (files: readonly File[]) => {
    const module = moduleRef.current;
    if (!module || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const imported: { entry: HybridCcDatCatalogEntry; levels: HybridCcNativeLevel[] }[] = [];
      for (const file of files) {
        const levels = importHybridCcDat(module, new Uint8Array(await file.arrayBuffer()));
        const entry = await datCatalog.save(file);
        imported.push({ entry, levels });
      }
      const availableEntries = await datCatalog.list();
      setEntries(availableEntries);
      setLevelsByEntryId((current) => {
        const next = new Map(current);
        for (const result of imported) {
          next.set(result.entry.id, result.levels);
        }
        return next;
      });
      setLoadErrorByEntryId((current) => {
        const next = new Map(current);
        for (const result of imported) {
          next.delete(result.entry.id);
        }
        return next;
      });
      setActiveTab("uploads");
      setSelectedEntryId(imported.at(-1)!.entry.id);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [datCatalog]);

  const seriesByEntryId = useMemo(
    () => buildHybridCcSeriesByEntryId(entries, levelsByEntryId),
    [entries, levelsByEntryId],
  );
  const families = useMemo(
    () => buildHybridCcFamilies(entries, seriesByEntryId),
    [entries, seriesByEntryId],
  );
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchActive = deferredSearchQuery.trim().length > 0;
  const visibleFamilies = useMemo(() => families.filter((family) => {
    if (isSearchActive) {
      return familyMatchesSearch(family.title, family.sidebarSummary, deferredSearchQuery);
    }
    if (activeTab === "official") return family.section === "official";
    if (activeTab === "uploads") return family.section === "local";
    return false;
  }), [activeTab, deferredSearchQuery, families, isSearchActive]);
  const activeFamily = families.find((family) => family.id === selectedEntryId) ?? null;
  const activeEntry = selectedEntryId ? seriesByEntryId.get(selectedEntryId) ?? null : null;
  const activeLevel = activeEntry?.levels[selectedLevelIndex] ?? null;
  const setInfoFamily = setInfoFamilyId
    ? families.find((family) => family.id === setInfoFamilyId) ?? null
    : null;
  const {
    dashboardStyle,
    expandLevelsPane,
    expandSetsPane,
    isLevelsPaneCollapsed,
    isSetsPaneCollapsed,
    startPaneResize,
    toggleLevelsPaneCollapsed,
    toggleSetsPaneCollapsed,
  } = useModernDashboardPaneLayout({
    activeEntry,
    activeFamily,
    isCatalogLoading: busy,
    visibleFamilies,
  });

  useEffect(() => {
    activeLevelRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeEntry?.filebase, activeLevel?.number]);

  const discardUploadedFamily = useCallback(async (familyId: string) => {
    const entry = entries.find((candidate) => candidate.id === familyId && candidate.source === "imported");
    if (!entry) return;
    try {
      await datCatalog.delete(entry.filename);
      const nextEntries = entries.filter((candidate) => candidate.id !== familyId);
      setEntries(nextEntries);
      setLevelsByEntryId((current) => {
        const next = new Map(current);
        next.delete(familyId);
        return next;
      });
      setLoadErrorByEntryId((current) => {
        const next = new Map(current);
        next.delete(familyId);
        return next;
      });
      if (selectedEntryId === familyId) {
        const nextEntry = nextEntries.find((candidate) => candidate.source === "imported")
          ?? nextEntries.find((candidate) => candidate.source === "official")
          ?? null;
        setSelectedEntryId(nextEntry?.id ?? null);
        setActiveTab(nextEntry?.source === "imported" ? "uploads" : "official");
      }
      setMessage(`${entry.filename} was removed from this browser.`);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    }
  }, [datCatalog, entries, selectedEntryId]);

  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null;
  const series = activeEntry;
  const level = runtime ? hybridCcSeriesLevel(runtime.level) : null;
  const session = runtime && selectedEntry
    ? projectHybridCcSession(runtime.level, runtime.snapshot, selectedEntry.filename)
    : null;
  const status = busy
    ? "Loading"
    : runtime?.snapshot.outcome.kind === 1
      ? "Level complete"
      : runtime?.snapshot.outcome.kind === 2
        ? "Chip died"
        : paused
          ? "Paused"
          : !started
            ? "Ready"
            : "Playing";

  return (
    <main className="modern-shell modern-shell--dashboard hybridcc-v0">
      <input
        accept=".dat,.DAT"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) void importFiles(files);
        }}
        ref={fileInputRef}
        type="file"
      />

      <div className="modern-dashboard" style={dashboardStyle}>
        <div className="modern-dashboard__pane modern-dashboard__pane--sets">
          {isSetsPaneCollapsed ? (
            <ModernDashboardPaneRail label="Sets" onExpand={expandSetsPane} />
          ) : (
            <ModernDashboardSetsPane
              activeFamilyId={activeFamily?.id ?? null}
              activeTab={activeTab}
              dragDepthRef={dragDepthRef}
              emptySearchQuery={deferredSearchQuery}
              familyMeta={(family) => hybridCcV0FamilyProgressLabel(family.levelCount)}
              isDropTargetActive={isDropTargetActive}
              isImporting={busy}
              isSearchActive={isSearchActive}
              onDropDatFiles={(files) => { void importFiles(files); }}
              onOpenAbout={() => {
                setMessage("HybridCC v0 is the C++ port of the earlier HybridCC engine, presented in the Tile World Online player shell.");
              }}
              onOpenDatPicker={() => { fileInputRef.current?.click(); }}
              onOpenSettings={() => {
                setMessage("Hybrid v0 uses the fixed Lynx artwork presentation and the HybridCC v0 input profile.");
              }}
              onSelectFamily={(familyId) => {
                const family = families.find((candidate) => candidate.id === familyId);
                setSelectedEntryId(familyId);
                if (family) setActiveTab(family.section === "local" ? "uploads" : "official");
              }}
              onSelectTab={setActiveTab}
              onSetDropTargetActive={setIsDropTargetActive}
              onShowFamilyInfo={setSetInfoFamilyId}
              onUploadedFamilyAction={(familyId) => { void discardUploadedFamily(familyId); }}
              progressByKey={EMPTY_PROGRESS}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              visibleFamilies={visibleFamilies}
            />
          )}
        </div>

        <ModernDashboardSplitter
          isCollapsed={isSetsPaneCollapsed}
          label="sets"
          onPointerDown={(event) => {
            if (event.button !== 0 || isSetsPaneCollapsed || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            startPaneResize("sets", event.clientX);
          }}
          onToggleCollapse={toggleSetsPaneCollapsed}
        />

        <div className="modern-dashboard__pane modern-dashboard__pane--levels">
          {isLevelsPaneCollapsed ? (
            <ModernDashboardPaneRail label="Levels" onExpand={expandLevelsPane} />
          ) : (
            <ModernDashboardLevelsPane
              activeEntry={activeEntry}
              activeEntryProgress={{ completedLevels: 0 }}
              activeFamily={activeFamily}
              activeLevel={activeLevel}
              activeLevelProgress={null}
              activeLevelRowRef={activeLevelRowRef}
              activeRuleset={activeEntry ? "Lynx" : null}
              animatedLevelBadgeKey={null}
              onLevelContextMenu={() => {}}
              onSelectLevel={(levelNumber) => {
                const index = activeEntry?.levels.findIndex((candidate) => candidate.number === levelNumber) ?? -1;
                if (index >= 0) selectLevel(index);
              }}
              onSelectRuleset={() => {}}
              progressByKey={EMPTY_PROGRESS}
            />
          )}
        </div>

        <ModernDashboardSplitter
          isCollapsed={isLevelsPaneCollapsed}
          label="levels"
          onPointerDown={(event) => {
            if (event.button !== 0 || isLevelsPaneCollapsed || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            startPaneResize("levels", event.clientX);
          }}
          onToggleCollapse={toggleLevelsPaneCollapsed}
        />

        <section className="modern-dashboard__player">
          <section className="modern-embedded-player">
            <header className="modern-embedded-player__header">
              <div className="modern-embedded-player__copy">
                <div className="modern-game-header__meta modern-game-header__meta--status-only">
                  <p className="modern-section__eyebrow modern-game-header__state">{status}</p>
                </div>
                <div className="modern-game-header__title-row">
                  <h1 className="modern-embedded-player__title">
                    {runtime ? `Level ${runtime.level.number}: ${runtime.level.title}` : "HybridCC v0"}
                  </h1>
                  <div className="modern-game-header__title-action">
                    <button
                      aria-label="Copy link to this level"
                      className="modern-link-icon-button"
                      disabled={!runtime}
                      onClick={() => setMessage("Shareable Hybrid v0 level links are not available yet.")}
                      title="Copy link to this level"
                      type="button"
                    >
                      <ChainLinkIcon />
                    </button>
                  </div>
                </div>
                <p className="modern-game-header__subtitle">
                  {runtime
                    ? `${runtime.level.author || "Unknown author"}  ·  ${runtime.level.timeLimitSeconds > 0 ? `${runtime.level.timeLimitSeconds}s` : "Untimed"}`
                    : "C++ engine · 10 logic steps per second"}
                </p>
              </div>
              <div className="modern-game-header__toolbar">
                <div aria-label="Primary controls" className="modern-game-header__toolbar-group" role="group">
                  <button className="modern-button modern-button--secondary modern-button--compact" disabled={!runtime} onClick={() => runtime && startLevel(runtime.level)} type="button">
                    <span>Restart</span><span className="modern-game-header__shortcut">R</span>
                  </button>
                  <button className="modern-button modern-button--secondary modern-button--compact" disabled={!runtime || runtime.snapshot.outcome.kind !== 0} onClick={() => setPaused((current) => !current)} type="button">
                    <span>{paused ? "Resume" : "Pause"}</span><span className="modern-game-header__shortcut">Bksp</span>
                  </button>
                  <button className="modern-button modern-button--secondary modern-button--compact" disabled={selectedLevels.length === 0} onClick={() => selectLevel(selectedLevelIndex - 1)} type="button">
                    <span>Previous</span><span className="modern-game-header__shortcut">P</span>
                  </button>
                  <button className="modern-button modern-button--secondary modern-button--compact" disabled={selectedLevels.length === 0} onClick={() => selectLevel(selectedLevelIndex + 1)} type="button">
                    <span>Next</span><span className="modern-game-header__shortcut">N</span>
                  </button>
                </div>
                <div aria-label="Replay, advanced, and help" className="modern-game-header__toolbar-group modern-game-header__toolbar-group--right" role="group">
                  <button className="modern-button modern-button--secondary modern-button--compact" onClick={() => setMessage("Native HybridCC replay controls are not available in v0 yet.")} type="button">
                    <span>Replays</span><span aria-hidden="true" className="modern-toolbar-menu__caret">▾</span>
                  </button>
                  <button className="modern-button modern-button--secondary modern-button--compact" onClick={() => setMessage("Hybrid v0 has no advanced runtime controls yet.")} type="button">
                    <span>Advanced</span><span aria-hidden="true" className="modern-toolbar-menu__caret">▾</span>
                  </button>
                  <button className="modern-button modern-button--secondary modern-button--compact" onClick={() => setMessage("Move with the arrow keys or WASD. Pause with Backspace, Delete, or Space. Restart with R; change levels with P and N.")} type="button">
                    <span>Help</span><span className="modern-game-header__shortcut">H</span>
                  </button>
                </div>
              </div>
            </header>

            <div className="modern-embedded-player__body">
              <section className="modern-game-board modern-game-board--with-rails" ref={gameplayFocusRef} tabIndex={-1}>
                <div className="modern-game-board__frame modern-game-board__frame--embedded">
                  <div className="modern-game-stage modern-game-stage--embedded">
                    <aside className="modern-game-rail modern-game-rail--left">
                      <section className="modern-game-rail__panel modern-game-rail__panel--ruleset">
                        <div aria-label="Ruleset" className="modern-ruleset-toggle modern-ruleset-toggle--stacked" role="group">
                          <button aria-pressed="true" className="modern-ruleset-toggle__button modern-ruleset-toggle__button--active" type="button">
                            {HYBRID_CC_V0_RULESET_LABEL}
                          </button>
                          <button aria-pressed="false" className="modern-ruleset-toggle__button" disabled type="button">MS</button>
                        </div>
                      </section>
                      <section className="modern-game-rail__panel">
                        <p className="modern-section__eyebrow">Runtime</p>
                        <div className="modern-game-rail__stats">
                          <div className={`modern-game-stat${session?.frame.snapshot.chipsNeeded === 0 ? " modern-game-stat--good" : ""}`}>
                            <span className="modern-game-stat__label">Chips</span>
                            <strong className="modern-game-stat__value">{session?.frame.snapshot.chipsNeeded ?? "---"}</strong>
                          </div>
                          <div className="modern-game-stat">
                            <span className="modern-game-stat__label">Time</span>
                            <strong className="modern-game-stat__value">{runtime ? formatTime(runtime.level, runtime.snapshot) : "---"}</strong>
                          </div>
                          <div className="modern-game-stat">
                            <span className="modern-game-stat__label">Undo Used</span>
                            <strong className="modern-game-stat__value">0</strong>
                          </div>
                        </div>
                      </section>
                    </aside>

                    <div className="modern-game-board__viewport">
                      {paused ? (
                        <div aria-live="polite" aria-label="Paused" className="modern-game-board__paused modern-game-board__paused--embedded" role="status">
                          <p className="modern-game-board__paused-title">PAUSED</p>
                          <p className="modern-game-board__paused-copy">Press Backspace/Delete or use Resume to continue.</p>
                        </div>
                      ) : (
                        <LegacyCanvasScreen
                          catalog={series ? [series] : []}
                          className="modern-gameboard__canvas modern-gameboard__canvas--embedded"
                          currentLevel={level}
                          currentRuleset="Lynx"
                          currentSeries={series}
                          isLoading={busy}
                          message={null}
                          mode="game"
                          onActivateSeries={() => {}}
                          onSelectSeries={() => {}}
                          presentation="map-only"
                          selectedSeriesFile={series?.filebase ?? null}
                          session={session}
                          visualEnhancementsEnabled={false}
                        />
                      )}
                    </div>

                    <aside className="modern-game-inventory-strip">
                      <div className="modern-game-inventory-strip__group">
                        <p className="modern-game-inventory-strip__label">Keys</p>
                        <LegacyInventoryStrip className="modern-game-inventory-strip__canvas" currentRuleset="Lynx" inventory={session?.frame.snapshot.inventory ?? null} kind="keys" visualEnhancementsEnabled={false} />
                      </div>
                      <div className="modern-game-inventory-strip__group">
                        <p className="modern-game-inventory-strip__label">Boots</p>
                        <LegacyInventoryStrip className="modern-game-inventory-strip__canvas" currentRuleset="Lynx" inventory={session?.frame.snapshot.inventory ?? null} kind="boots" visualEnhancementsEnabled={false} />
                      </div>
                    </aside>

                    <section className="modern-game-undo-panel">
                      <div className="modern-game-undo-panel__actions">
                        <button className="modern-button modern-button--secondary modern-game-undo-panel__button" disabled type="button">Undo</button>
                        <button className="modern-button modern-button--secondary modern-game-undo-panel__button" disabled type="button">Continue with Replay</button>
                      </div>
                    </section>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </section>
      </div>

      {message ? <ModernDashboardMessageModal message={message} onClose={() => setMessage(null)} /> : null}
      {setInfoFamily ? <ModernDashboardSetInfoModal family={setInfoFamily} onClose={() => setSetInfoFamilyId(null)} /> : null}
    </main>
  );
}
