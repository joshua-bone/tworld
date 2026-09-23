import { useEffect, useRef, useState } from "react";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { createBrowserAppServices } from "@player-web/compose/createBrowserAppServices";
import { loadBrowserSeriesCatalogEntries, listBrowserSeriesCatalogFiles } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import { LegacyCanvasScreen } from "@player-web/impl/LegacyCanvasScreen";
import { LegacyLynxInputBuffer, LegacyMsInputBuffer, type DirectionInput } from "@player-web/impl/legacyInput";
import { PlayInputQueue } from "./PlayInputQueue";
import { PLAY_MAX_OBSERVATION_AGE_MS, parsePlayDecision, type PlayDecisionEvent, type PlayMark, type PlayObservation, type PlayRunnerState } from "@player-web/ports/VisualPlayHarness";
import "./playLab.css";

const services = createBrowserAppServices();
const seriesFiles = listBrowserSeriesCatalogFiles().sort();
const KEY_DIRECTIONS: Record<string, DirectionInput> = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
const INITIAL_RUNNER: PlayRunnerState = { running: false, thinking: false, provider: "codex", model: "Codex default", message: "Connecting to the local vision player…", decisions: 0, latencyMs: null };

async function post(path: string, data: unknown = {}): Promise<void> {
  const response = await fetch(`/__play/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error || `Play Lab returned HTTP ${response.status}.`);
  }
}

function AnnotatedObservation({ observation, marks = [] }: { observation: PlayObservation; marks?: PlayMark[] }) {
  return <div className="play-observed-image">
    <img src={observation.image} alt={`Previously observed player screen ${observation.id}`} />
    {marks.map((mark, index) => <div key={index} className="play-mark" style={{ left: `${(8 + mark.x * 48) / 6.4}%`, top: `${(8 + mark.y * 48) / 4.72}%`, width: "7.5%", height: `${4800 / 472}%` }}>
      <span className="play-mark-number">{index + 1}</span>
    </div>)}
  </div>;
}

export function PlayLabApp() {
  const [file, setFile] = useState(seriesFiles.includes("intro-lynx.dac") ? "intro-lynx.dac" : seriesFiles[0] || "");
  const [series, setSeries] = useState<SeriesCatalogEntry | null>(null);
  const [levelNumber, setLevelNumber] = useState(1);
  const [session, setSession] = useState<InteractiveGameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [paused, setPaused] = useState(true);
  const [runner, setRunner] = useState(INITIAL_RUNNER);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PlayDecisionEvent[]>([]);
  const [selected, setSelected] = useState<PlayDecisionEvent | null>(null);
  const [explanation, setExplanation] = useState<PlayDecisionEvent | null>(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [inputLabel, setInputLabel] = useState("Released");
  const [starting, setStarting] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const liveSessionRef = useRef<InteractiveGameSession | null>(null);
  const sessionIdRef = useRef("");
  const pausedRef = useRef(true);
  const agentRef = useRef(false);
  const queueRef = useRef<PlayInputQueue | null>(null);
  const manualRef = useRef<LegacyLynxInputBuffer | LegacyMsInputBuffer>(new LegacyLynxInputBuffer());
  const lastDecisionRef = useRef(0);
  const epochRef = useRef(0);

  const pause = (value: boolean) => {
    pausedRef.current = value; setPaused(value);
    queueRef.current?.clear(); manualRef.current.reset(); setInputLabel("Released");
  };
  const stop = () => {
    agentRef.current = false; queueRef.current?.clear(); setInputLabel("Released");
    void post("stop").catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setSeries(null);
    void loadBrowserSeriesCatalogEntries({ seriesFiles: [file] }).then((entries) => {
      if (cancelled) return;
      const entry = entries.find((candidate) => candidate.ruleset === "MS" || candidate.ruleset === "Lynx");
      if (!entry) throw new Error("Choose an MS or Lynx level set for this MVP.");
      setSeries(entry);
    }).catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [file]);

  useEffect(() => {
    if (!series || (series.ruleset !== "MS" && series.ruleset !== "Lynx")) return;
    const epoch = ++epochRef.current;
    const engine = services.engines[series.ruleset];
    const oldSession = liveSessionRef.current;
    liveSessionRef.current = null; setSession(null); setLoading(true); setError(null); pause(true); agentRef.current = false;
    setHistory([]); setSelected(null); setExplanation(null); setCaptureCount(0); lastDecisionRef.current = 0;
    const sessionId = crypto.randomUUID(); sessionIdRef.current = sessionId;
    manualRef.current = series.ruleset === "MS" ? new LegacyMsInputBuffer() : new LegacyLynxInputBuffer();
    queueRef.current = new PlayInputQueue(series.ruleset, (receipt) => { void post("receipt", receipt).catch(() => {}); });
    void (async () => {
      await post("reset", { sessionId });
      if (oldSession) await services.engines[oldSession.request.ruleset as "MS" | "Lynx"].disposeSession?.(oldSession);
      const next = await engine.startSession({ seriesFile: series.filebase, levelNumber, ruleset: series.ruleset as "MS" | "Lynx" }, { undoSettings: { enabled: false } });
      if (epoch !== epochRef.current) { await engine.disposeSession?.(next); return; }
      liveSessionRef.current = next; setSession(next); setLoading(false);
    })().catch((e: Error) => { if (epoch === epochRef.current) { setError(e.message); setLoading(false); } });
    return () => { epochRef.current += 1; };
  }, [series, levelNumber, reload]);

  useEffect(() => {
    const events = new EventSource("/__play/events");
    events.addEventListener("state", (event: MessageEvent<string>) => {
      setConnected(true);
      const state = JSON.parse(event.data) as PlayRunnerState;
      setRunner(state);
      if (!state.running) { agentRef.current = false; queueRef.current?.clear(); }
    });
    events.addEventListener("decision", (event: MessageEvent<string>) => {
      const next = JSON.parse(event.data) as PlayDecisionEvent;
      if (!agentRef.current || next.sessionId !== sessionIdRef.current || next.id <= lastDecisionRef.current) return;
      try { next.decision = parsePlayDecision(next.decision); } catch { stop(); setError("Invalid vision-player decision rejected."); return; }
      lastDecisionRef.current = next.id;
      setHistory((items) => [...items, next].slice(-30)); setSelected(next);
      if (next.decision.explain) {
        pause(true); setExplanation(next); agentRef.current = false;
      } else if (pausedRef.current || Date.now() - next.observation.capturedAt > PLAY_MAX_OBSERVATION_AGE_MS) {
        void post("receipt", { decisionId: next.id, outcome: "stale", executedTicks: 0 }).catch(() => {});
      } else queueRef.current?.enqueue(next.id, next.decision.actions);
    });
    events.onerror = () => { setConnected(false); agentRef.current = false; queueRef.current?.clear(); };
    return () => events.close();
  }, []);

  useEffect(() => {
    const clock = new Worker(new URL("../gameClock.worker.ts", import.meta.url), { type: "module" });
    let pumping = false;
    let last = performance.now();
    let accumulated = 0;
    let cancelled = false;
    clock.onmessage = () => {
      const now = performance.now();
      accumulated = Math.min(200, accumulated + now - last); last = now;
      if (pausedRef.current || !liveSessionRef.current) { accumulated = 0; return; }
      if (pumping || accumulated < 50) return;
      pumping = true;
      void (async () => {
        while (!cancelled && !pausedRef.current && accumulated >= 50) {
          const active = liveSessionRef.current;
          if (!active || active.frame.snapshot.status === "failed" || active.frame.snapshot.status === "completed") break;
          const input = agentRef.current ? queueRef.current?.nextInput() || 0 : manualRef.current.nextTickInputCode();
          const labels: Record<number, string> = { 0: "Released", 1: "↑ North", 2: "← West", 4: "↓ South", 8: "→ East" };
          setInputLabel(labels[input] || "Released");
          const next = await services.engines[active.request.ruleset as "MS" | "Lynx"].advanceSession(active, input);
          accumulated -= 50;
          if (liveSessionRef.current !== active) break;
          liveSessionRef.current = next; setSession(next);
          if (next.frame.snapshot.status === "failed" || next.frame.snapshot.status === "completed") {
            stop(); pause(true); break;
          }
        }
      })().catch((e: Error) => { stop(); pause(true); setError(e.message); }).finally(() => { pumping = false; });
    };
    clock.postMessage({ type: "start", heartbeatMs: 8 });
    return () => { cancelled = true; clock.terminate(); };
  }, []);

  useEffect(() => {
    if (!session || loading) return;
    const sessionId = sessionIdRef.current;
    let id = 0;
    let sending = false;
    const capture = async () => {
      if (sending || sessionId !== sessionIdRef.current) return;
      const canvas = screenRef.current?.querySelector(".legacy-canvas-shell > canvas");
      if (!(canvas instanceof HTMLCanvasElement) || canvas.width !== 640 || canvas.height !== 472) return;
      sending = true;
      try {
        const observation: PlayObservation = { sessionId, id: ++id, capturedAt: Date.now(), image: canvas.toDataURL("image/png") };
        await post("observe", observation); setCaptureCount(id);
      } catch (e) { setConnected(false); agentRef.current = false; queueRef.current?.clear(); setError(e instanceof Error ? e.message : String(e)); }
      finally { sending = false; }
    };
    const interval = window.setInterval(() => void capture(), 500);
    // Let the renderer paint the newly loaded level before the first observation.
    const frame = requestAnimationFrame(() => void capture());
    return () => { window.clearInterval(interval); cancelAnimationFrame(frame); };
  }, [loading, session?.request.seriesFile, session?.request.levelNumber, reload]);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.matches("input,select,textarea") || event.target.isContentEditable)) return;
      const direction = KEY_DIRECTIONS[event.key];
      if (!direction) return;
      event.preventDefault();
      if (agentRef.current) stop();
      pausedRef.current = false; setPaused(false); setExplanation(null);
      manualRef.current.keyDown(direction);
    };
    const keyUp = (event: KeyboardEvent) => { const direction = KEY_DIRECTIONS[event.key]; if (direction) { event.preventDefault(); manualRef.current.keyUp(direction); } };
    const blur = () => manualRef.current.reset();
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); };
  }, []);

  const startAgent = async () => {
    setStarting(true); setError(null); setExplanation(null); manualRef.current.reset();
    try {
      await post("start"); agentRef.current = true; pause(false);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setStarting(false); }
  };
  const currentLevel = series?.levels.find((level) => level.number === levelNumber) || null;
  const terminal = session?.frame.snapshot.status === "failed" || session?.frame.snapshot.status === "completed";
  const displayEvent = explanation || selected;
  const reference = displayEvent?.recall || displayEvent?.observation;

  return <main className="play-lab">
    <header className="play-lab-header">
      <div><p className="play-eyebrow">TILE WORLD · LOCAL EXPERIMENT</p><h1>Play Lab<span className="play-dot" /></h1><p>One viewport. A world to discover.</p></div>
      <div className="play-connection"><span className={connected ? "play-status-light" : "play-status-light offline"} />{connected ? "Vision player connected" : "Connecting…"}<small>{runner.provider} · {runner.model}</small></div>
    </header>
    <div className="play-layout">
      <section className="play-main-panel" aria-label="Live game">
        <div className="play-stage-heading"><span className="play-eyebrow">{paused ? terminal ? "LEVEL ENDED" : "PAUSED" : "LIVE · NORMAL SPEED"}</span><span>9 × 9 viewport</span></div>
        <div className="play-screen" ref={screenRef} tabIndex={0} aria-label="Game keyboard controls">
          <LegacyCanvasScreen mode="game" catalog={series ? [series] : []} currentSeries={series} currentLevel={currentLevel}
            selectedSeriesFile={series?.filebase || null} currentRuleset={series?.ruleset || null} session={session} liveSessionRef={liveSessionRef}
            isLoading={loading} message={null} onSelectSeries={() => {}} onActivateSeries={() => {}} visualEnhancementsEnabled={false} debugModeEnabled={false} />
        </div>
        <div className="play-transport">
          <button className="play-primary" disabled={loading || !connected || captureCount === 0 || starting || runner.running || terminal} onClick={() => void startAgent()}>{starting ? "Starting…" : runner.running ? "Agent playing" : "Start agent"}</button>
          <button disabled={loading || terminal} onClick={() => { stop(); const nextPaused = !pausedRef.current; pause(nextPaused); setExplanation(nextPaused ? selected : null); }}>{paused ? "Resume game" : "Pause & explain"}</button>
          <button disabled={loading} onClick={() => { stop(); manualRef.current.reset(); screenRef.current?.focus(); }}>Take over</button>
          <button disabled={loading} onClick={() => { stop(); pause(true); setReload((value) => value + 1); }}>Restart</button>
        </div>
        <div className="play-understage"><span>Input <strong>{inputLabel}</strong></span><span>{runner.thinking ? "Considering the latest view…" : paused ? "Paused explicitly" : "The world keeps moving"}</span></div>
        <p className="play-help">Arrow keys take control immediately. The timer and creatures keep moving while the agent decides. Pauses are explicit.</p>
        <details className="play-level-picker"><summary>Choose a level · {series?.name || "Loading"}</summary><div>
          <label>Level set<select aria-label="Level set" value={file} onChange={(event) => { stop(); pause(true); setFile(event.target.value); setLevelNumber(1); }}>{seriesFiles.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          <label>Level<select aria-label="Level" value={levelNumber} onChange={(event) => { stop(); pause(true); setLevelNumber(Number(event.target.value)); }}>{series?.levels.map((level) => <option key={level.number} value={level.number}>{level.number}. {level.name}</option>)}</select></label>
        </div></details>
        {error && <p className="play-error" role="alert">{error}</p>}
      </section>
      <aside className="play-observer-panel" aria-label="Agent observations and commentary">
        <div className="play-intent"><p className="play-eyebrow">{explanation ? "EXPLANATION PAUSE" : "CURRENT INTENT"}</p><h2>{displayEvent?.decision.summary || "Let’s see what’s out there."}</h2><p>{runner.message}</p></div>
        {reference ? <div className="play-reference">
          <div className="play-stage-heading"><span>Observed frame #{reference.id}</span><span>{displayEvent && (displayEvent.latencyMs / 1000).toFixed(1)}s decision</span></div>
          <AnnotatedObservation observation={reference} marks={displayEvent?.decision.marks} />
          <p className="play-reference-caption">Annotations refer to this captured view.</p>
          {!!displayEvent?.decision.marks.length && <ol className="play-mark-legend">{displayEvent.decision.marks.map((mark, index) => <li key={index}>{mark.label}</li>)}</ol>}
        </div> : <div className="play-empty-reference"><span>01</span><h3>Observe. Act. Discover.</h3><p>The agent’s annotated observations will appear here as it explores.</p></div>}
        <div className="play-notebook"><p className="play-eyebrow">OBSERVATION NOTEBOOK</p><p>{displayEvent?.decision.memory || "Only places seen through the viewport belong here. Everything else remains unknown."}</p></div>
      </aside>
    </div>
    <section className="play-history"><div className="play-history-heading"><div><p className="play-eyebrow">DISCOVERED VIEWS</p><h2>A trail of observations</h2></div><a href="/__play/journal" download>Export session</a></div>
      {history.length ? <div className="play-history-strip">{history.map((event) => <button key={event.id} className={selected?.id === event.id ? "selected" : ""} onClick={() => { setSelected(event); setExplanation(null); }}><img src={event.observation.image} alt={`Review observed frame ${event.observation.id}`} /><span>#{event.observation.id} · {event.decision.actions.map((a) => ({ north: "↑", south: "↓", west: "←", east: "→", none: "·" }[a.direction])).join(" ") || "Explain"}</span></button>)}</div> : <p className="play-history-empty">Your first shared exploration starts above.</p>}
    </section>
  </main>;
}
