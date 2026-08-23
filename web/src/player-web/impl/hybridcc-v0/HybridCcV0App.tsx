import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LegacyCanvasScreen } from "@player-web/impl/LegacyCanvasScreen";
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
  hybridCcSeries,
  hybridCcSeriesLevel,
  projectHybridCcSession,
} from "./renderProjection";
import {
  createHybridCcEngine,
  importHybridCcDat,
  type HybridCcEngine,
  type HybridCcSnapshot,
  type HybridCcWasmModule,
} from "./wasmBridge";
import "./hybridCcV0.css";

interface LoadedPack {
  entry: HybridCcDatCatalogEntry;
  levels: HybridCcNativeLevel[];
}

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

export function HybridCcV0App() {
  const datCatalog = useMemo(() => new HybridCcDatCatalog(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const moduleRef = useRef<HybridCcWasmModule | null>(null);
  const runtimeRef = useRef<ActiveRuntime | null>(null);
  const heldDirectionsRef = useRef<HybridCcDirection[]>([]);
  const [entries, setEntries] = useState<HybridCcDatCatalogEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [pack, setPack] = useState<LoadedPack | null>(null);
  const [selectedLevelIndex, setSelectedLevelIndex] = useState(0);
  const [runtime, setRuntime] = useState<ActiveRuntime | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

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
    setPaused(false);
    setMessage(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadHybridCcWasm(), datCatalog.list()])
      .then(([module, availableEntries]) => {
        if (cancelled) return;
        moduleRef.current = module;
        setEntries(availableEntries);
        setSelectedEntryId((current) => current ?? availableEntries[0]?.id ?? null);
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

  useEffect(() => {
    const entry = entries.find((candidate) => candidate.id === selectedEntryId);
    const module = moduleRef.current;
    if (!entry || !module) return;

    let cancelled = false;
    setBusy(true);
    setMessage(null);
    disposeRuntime();
    entry.loadBytes()
      .then((bytes) => importHybridCcDat(module, bytes))
      .then((levels) => {
        if (cancelled) return;
        if (levels.length === 0) {
          throw new Error(`${entry.filename} contains no levels.`);
        }
        setPack({ entry, levels });
        setSelectedLevelIndex(0);
        startLevel(levels[0]!);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setPack(null);
        setMessage(`${entry.filename}: ${errorMessage(error)}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [disposeRuntime, entries, selectedEntryId, startLevel]);

  useEffect(() => () => {
    runtimeRef.current?.engine.dispose();
  }, []);

  const selectLevel = useCallback((index: number) => {
    if (!pack || pack.levels.length === 0) return;
    const wrapped = (index + pack.levels.length) % pack.levels.length;
    setSelectedLevelIndex(wrapped);
    startLevel(pack.levels[wrapped]!);
  }, [pack, startLevel]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      const direction = directionForEvent(event);
      if (direction) {
        event.preventDefault();
        if (!heldDirectionsRef.current.includes(direction)) {
          heldDirectionsRef.current = [...heldDirectionsRef.current, direction];
        }
        return;
      }
      if (event.repeat) return;
      if (event.code === "Space") {
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
    if (!runtime || paused || runtime.snapshot.outcome.kind !== 0) return;
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
          if (snapshot.outcome.kind !== 0) {
            setPaused(true);
          }
        } catch (error: unknown) {
          setMessage(errorMessage(error));
          setPaused(true);
        }
      }
      sampleIndex = (sampleIndex + 1) % 4;
    }, 25);
    return () => window.clearInterval(interval);
  }, [paused, runtime?.engine, runtime?.snapshot.outcome.kind]);

  const importFile = useCallback(async (file: File) => {
    setBusy(true);
    setMessage(null);
    try {
      const entry = await datCatalog.save(file);
      const availableEntries = await datCatalog.list();
      setEntries(availableEntries);
      setSelectedEntryId(entry.id);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }, [datCatalog]);

  const series = pack ? hybridCcSeries(pack.entry.filename, pack.entry.name, pack.levels) : null;
  const level = runtime ? hybridCcSeriesLevel(runtime.level) : null;
  const session = runtime && pack
    ? projectHybridCcSession(runtime.level, runtime.snapshot, pack.entry.filename)
    : null;
  const officialEntries = entries.filter((entry) => entry.source === "official");
  const importedEntries = entries.filter((entry) => entry.source === "imported");
  const player = runtime?.snapshot.actors.find((actor) => actor.kind === 41 && actor.alive) ?? null;
  const status = busy
    ? "Loading"
    : runtime?.snapshot.outcome.kind === 1
      ? "Level complete"
      : runtime?.snapshot.outcome.kind === 2
        ? "Chip died"
        : paused
          ? "Paused"
          : "Playing · HybridCC v0";

  return (
    <main className="modern-shell modern-shell--dashboard hybridcc-v0">
      <div className="modern-dashboard hybridcc-v0__dashboard">
        <div className="modern-dashboard__pane">
          <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--sets">
            <section className="modern-dashboard__panel modern-dashboard__panel--brand">
              <div className="modern-dashboard__brand-lockup">
                <div aria-hidden="true" className="modern-dashboard__brand-logo">
                  <span className="modern-dashboard__brand-logo-letter">H</span>
                  <span className="modern-dashboard__brand-logo-letter">C</span>
                  <span className="modern-dashboard__brand-logo-letter">C</span>
                </div>
                <h1 className="modern-dashboard__title modern-dashboard__title--brand">
                  <span className="modern-dashboard__title-line">HYBRIDCC</span>
                  <span className="modern-dashboard__title-line">VERSION 0</span>
                </h1>
              </div>
            </section>

            <section className="modern-dashboard__panel modern-dashboard__panel--fill">
              <div className="modern-dashboard__section-header">
                <p className="modern-section__eyebrow">Official sets</p>
                <p className="modern-dashboard__meta-note">Hybrid rules</p>
              </div>
              <div className="modern-library__family-list">
                {officialEntries.map((entry) => (
                  <button
                    aria-pressed={entry.id === selectedEntryId}
                    className={`modern-library__family${entry.id === selectedEntryId ? " modern-library__family--active" : ""}`}
                    key={entry.id}
                    onClick={() => setSelectedEntryId(entry.id)}
                    type="button"
                  >
                    <span className="modern-library__family-title">{entry.name}</span>
                    <span className="modern-library__family-meta">{entry.filename}</span>
                  </button>
                ))}
                {importedEntries.length > 0 ? (
                  <p className="modern-section__eyebrow hybridcc-v0__uploads-heading">Uploaded sets</p>
                ) : null}
                {importedEntries.map((entry) => (
                  <button
                    aria-pressed={entry.id === selectedEntryId}
                    className={`modern-library__family${entry.id === selectedEntryId ? " modern-library__family--active" : ""}`}
                    key={entry.id}
                    onClick={() => setSelectedEntryId(entry.id)}
                    type="button"
                  >
                    <span className="modern-library__family-title">{entry.name}</span>
                    <span className="modern-library__family-meta">Local DAT</span>
                  </button>
                ))}
              </div>

              <section
                className="modern-dashboard__upload modern-import-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) void importFile(file);
                }}
              >
                <div>
                  <p className="modern-preference-block__label">Local DAT</p>
                  <p className="modern-dashboard__copy modern-dashboard__copy--compact">
                    Uses the same saved DAT library as Tile World Online.
                  </p>
                </div>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  Open Local DAT
                </button>
                <input
                  accept=".dat,application/octet-stream"
                  className="hybridcc-v0__file-input"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void importFile(file);
                    event.currentTarget.value = "";
                  }}
                  ref={fileInputRef}
                  type="file"
                />
              </section>
            </section>
          </aside>
        </div>

        <div aria-hidden="true" className="modern-dashboard__splitter" />

        <div className="modern-dashboard__pane modern-dashboard__pane--levels">
          <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--levels">
            <section className="modern-dashboard__panel modern-dashboard__panel--compact modern-dashboard__panel--level-summary">
              <div className="modern-dashboard__section-header">
                <p className="modern-section__eyebrow">Level Selector</p>
                <p className="modern-dashboard__meta-note">{pack ? `${pack.levels.length} levels` : "No level data"}</p>
              </div>
              <div className="modern-dashboard__level-header">
                <div>
                  <h2 className="modern-dashboard__panel-title">{pack?.entry.name ?? "No set selected"}</h2>
                  <p className="modern-dashboard__copy modern-dashboard__copy--compact">
                    {runtime ? `Level ${runtime.level.number}: ${runtime.level.title}` : "Choose a playable DAT set."}
                  </p>
                </div>
                <span className="hybridcc-v0__ruleset-pill">Hybrid</span>
              </div>
            </section>

            <section className="modern-dashboard__panel modern-dashboard__panel--fill">
              <div className="modern-dashboard__section-header">
                <p className="modern-section__eyebrow">Levels</p>
                <p className="modern-dashboard__meta-note">{pack ? `${pack.levels.length} total` : "Unavailable"}</p>
              </div>
              <div className="modern-level-sidebar" role="list">
                {pack?.levels.map((candidate, index) => (
                  <button
                    aria-pressed={index === selectedLevelIndex}
                    className={`modern-level-row${index === selectedLevelIndex ? " modern-level-row--active" : ""}`}
                    key={`${candidate.number}:${index}`}
                    onClick={() => selectLevel(index)}
                    type="button"
                  >
                    <span className="modern-level-row__number">{candidate.number}</span>
                    <span className="modern-level-row__medal modern-level-row__medal--unplayed">·</span>
                    <span className="modern-level-row__name">{candidate.title}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <div aria-hidden="true" className="modern-dashboard__splitter" />

        <section className="modern-dashboard__player">
          <section className="modern-embedded-player">
            <header className="modern-embedded-player__header">
              <div className="modern-embedded-player__copy">
                <div className="modern-game-header__meta modern-game-header__meta--status-only">
                  <p className="modern-section__eyebrow modern-game-header__state">{status}</p>
                </div>
                <h1 className="modern-embedded-player__title">
                  {runtime ? `Level ${runtime.level.number}: ${runtime.level.title}` : "HybridCC v0"}
                </h1>
                <p className="modern-game-header__subtitle">
                  {runtime ? `${runtime.level.author || "Unknown author"} · ${pack?.entry.filename ?? "DAT"}` : "C++ engine · 10 logic steps per second"}
                </p>
              </div>
              <div className="hybridcc-v0__toolbar">
                <button className="modern-button modern-button--secondary" disabled={!runtime} onClick={() => setPaused((current) => !current)} type="button">
                  {paused ? "Resume" : "Pause"} <span className="modern-game-header__shortcut">Space</span>
                </button>
                <button className="modern-button modern-button--secondary" disabled={!runtime} onClick={() => runtime && startLevel(runtime.level)} type="button">
                  Restart <span className="modern-game-header__shortcut">R</span>
                </button>
                <button className="modern-button modern-button--secondary" disabled={!pack} onClick={() => selectLevel(selectedLevelIndex - 1)} type="button">Previous</button>
                <button className="modern-button modern-button--secondary" disabled={!pack} onClick={() => selectLevel(selectedLevelIndex + 1)} type="button">Next</button>
              </div>
            </header>

            <div className="modern-embedded-player__body">
              {message ? <div className="hybridcc-v0__message" role="alert">{message}</div> : null}
              <div className="hybridcc-v0__stage">
                <div className="modern-game-board__frame modern-game-board__frame--embedded">
                  <div className="modern-game-board__viewport">
                    <LegacyCanvasScreen
                      catalog={series ? [series] : []}
                      className="modern-gameboard__canvas modern-gameboard__canvas--embedded"
                      currentLevel={level}
                      currentRuleset="Lynx"
                      currentSeries={series}
                      isLoading={busy}
                      message={message}
                      mode="game"
                      onActivateSeries={() => {}}
                      onSelectSeries={() => {}}
                      presentation="map-only"
                      renderTileSize={48}
                      selectedSeriesFile={series?.filebase ?? null}
                      session={session}
                      visualEnhancementsEnabled={false}
                    />
                    {paused && runtime?.snapshot.outcome.kind === 0 ? (
                      <div className="hybridcc-v0__pause-overlay">
                        <strong>PAUSED</strong>
                        <span>Press Space or Resume</span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <aside className="hybridcc-v0__stats">
                  <div><span>Chips</span><strong>{session?.frame.snapshot.chipsNeeded ?? "---"}</strong></div>
                  <div><span>Time</span><strong>{runtime ? formatTime(runtime.level, runtime.snapshot) : "---"}</strong></div>
                  <div><span>Step</span><strong>{runtime?.snapshot.logicStep ?? 0}</strong></div>
                  <div><span>Input</span><strong>{runtime?.lastInput ?? 0}</strong></div>
                  <div><span>Position</span><strong>{player ? `${player.position.x}, ${player.position.y}` : "---"}</strong></div>
                  <div><span>State hash</span><code>{runtime ? runtime.snapshot.stateHash.toString(16).padStart(16, "0") : "----------------"}</code></div>
                </aside>
              </div>
              <p className="hybridcc-v0__controls">
                Move with arrow keys or WASD. HybridCC v0 samples input four times per 100 ms logic step, matching the earlier HybridCC players.
              </p>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
