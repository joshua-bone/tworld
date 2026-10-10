import { useState } from "react";
import { DIRECTIONS, type ConsoleEvent, type Direction, type Observation } from "@player-web/ports/aiProtocol.generated";
import { useAiHarness, type AiHost } from "./useAiHarness";
import "./ai.css";
import { isStrategicInsight } from "./strategicInsights";

function eventText(event: ConsoleEvent): string {
  if (event.kind === "strategy") {
    return event.payload.goal ? `${event.payload.goal.objective}. ${event.payload.message}` : event.payload.message;
  }
  if (event.kind === "feedback") return event.payload.hudChanges.join(". ");
  return "";
}

function PlanDetails({ event, inspect }: { event: ConsoleEvent & { kind: "strategy" }; inspect(event: ConsoleEvent): Promise<Observation[]> }) {
  const [frames, setFrames] = useState<Observation[] | null>(null);
  const [loading, setLoading] = useState(false);
  const source = event.source === "luna" ? "Luna" : "Astra";
  let output = event.payload.publicOutput ?? "No completed public response was returned.";
  try { output = JSON.stringify(JSON.parse(output), null, 2); } catch { /* Preserve invalid public output for inspection. */ }
  return <details className="ai-panel__inspection" onToggle={e => {
    if (e.currentTarget.open && frames === null && !loading) {
      setLoading(true); void inspect(event).then(setFrames).catch(() => setFrames([])).finally(() => setLoading(false));
    }
  }}>
    <summary aria-label={`Inspect ${source} response`} title={`Inspect ${source} response`}>ⓘ</summary>
    <div className="ai-panel__inspection-body">
      <p>{source} · {event.payload.status} · {event.payload.latencyMs} ms</p>
      <p>{event.payload.message}</p>
      <pre>{output}</pre>
      <p>Evidence frames: {event.payload.evidenceIds.join(", ")}</p>
      {frames?.map(frame => <figure key={frame.frameId}><img src={frame.png} alt={`Observed screen, frame ${frame.frameId}`} /><figcaption>Frame {frame.frameId}</figcaption></figure>)}
      {loading ? <p>Loading screenshots…</p> : frames !== null && frames.length < event.payload.evidenceIds.length && <p>Some screenshots are outside the recent export window; the companion journal retains them.</p>}
      <p>Request: {event.payload.requestId}</p>
    </div>
  </details>;
}

export default function AiPanel({ host }: { host: AiHost }) {
  const ai = useAiHarness(host);
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<Direction>("east");
  return <aside className="ai-panel" aria-label="AI play harness">
    <div><h2>AI controls <span>{ai.provider === "jev" ? "Jev · paid API" : "Mock · $0 model calls"}</span></h2>
      <p>{ai.provider === "jev" ? ai.strategy === "off" ? "Jev only. No active strategy." : `Astra → Luna planning · ${ai.strategy === "subscription" ? "ChatGPT plan" : "paid API"}. Jev executes; Astra returns when stuck.` : "Start sends one two-tick mock action."}</p>
      <p>Visible 9×9 view and HUD only. Normal speed, no undo or saved scores.</p></div>
    <div className="ai-panel__controls">
      {!ai.connected && <><label>Companion pairing token<input aria-label="Companion pairing token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
        <button disabled={ai.connecting || !token.trim()} onClick={() => { void ai.connect(token); setToken(""); }}>Connect</button></>}
      {ai.connected && <>
        {ai.provider === "mock" && <label>Mock direction<select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>{DIRECTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>}
        <button disabled={!host.ready || !ai.fresh || ai.running} onClick={() => void ai.start(direction)}>Start AI</button>
        <button onClick={ai.stop}>Stop</button><button onClick={ai.stop}>Take over</button>
        <button onClick={() => void ai.exportRun()}>Export run</button><button onClick={() => ai.disconnect()}>Disconnect</button>
      </>}
    </div>
    <p role="status">{ai.status}</p>
    {ai.goal && <div className="ai-panel__goal" aria-label="Current goal"><strong>{ai.goalSource} goal</strong><p>{ai.goal.objective}</p>
      {ai.goal.constraints.length > 0 && <p>{ai.goal.constraints.join(" ")}</p>}</div>}
    {ai.connected && !host.ready && <p>Start is available during an unpaused, live MS or Lynx game. Close help to continue.</p>}
    <h3>Strategic insights</h3>
    <ol className="ai-panel__events" aria-label="Strategic insights">{ai.events.filter(isStrategicInsight).map((event) => <li key={event.eventId}><strong data-source={event.source}>{event.source === "astra" ? "Astra" : event.source === "luna" ? "Luna" : event.source === "jev" ? "Jev" : "System"}</strong> {eventText(event)}
      {event.kind === "strategy" && event.payload.status !== "planning" && <PlanDetails event={event} inspect={ai.inspectPlan} />}
    </li>)}</ol>
  </aside>;
}
