import { useState } from "react";
import { DIRECTIONS, type Direction } from "@player-web/ports/aiProtocol.generated";
import { useAiHarness, type AiHost } from "./useAiHarness";
import "./ai.css";

export default function AiPanel({ host }: { host: AiHost }) {
  const ai = useAiHarness(host);
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<Direction>("east");
  return <section className="ai-panel" aria-label="AI play harness">
    <div><h2>AI play lab <span>Mock · $0 model calls</span></h2>
      <p>Load a level below. Start sends one two-tick action through the normal controls. Jev and Astra are not connected yet.</p>
      <p>Classic 9×9 view + HUD only. Normal speed, no undo. This testing page does not save scores, progress, or replays.</p></div>
    <div className="ai-panel__controls">
      {!ai.connected && <><label>Companion pairing token<input aria-label="Companion pairing token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
        <button disabled={ai.connecting || !token.trim()} onClick={() => { void ai.connect(token); setToken(""); }}>Connect</button></>}
      {ai.connected && <>
        <label>Mock direction<select value={direction} onChange={(event) => setDirection(event.target.value as Direction)}>{DIRECTIONS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <button disabled={!host.ready || !ai.fresh || ai.running} onClick={() => void ai.start(direction)}>Start AI</button>
        <button onClick={ai.stop}>Stop</button><button onClick={ai.stop}>Take over</button>
        <button onClick={() => void ai.exportRun()}>Export run</button><button onClick={() => ai.disconnect()}>Disconnect</button>
      </>}
    </div>
    <p role="status">{ai.status}</p>
    {ai.connected && !host.ready && <p>Start is available during an unpaused, live MS or Lynx game. Close help to continue.</p>}
    <ol className="ai-panel__events" aria-label="AI events">{ai.events.map((event) => <li key={event.eventId}><strong>System</strong> {event.kind === "decision" ? event.payload.summary : event.kind === "receipt" ? `${event.payload.outcome}: ${event.payload.executedTicks} ticks executed` : event.payload.message}</li>)}</ol>
  </section>;
}
