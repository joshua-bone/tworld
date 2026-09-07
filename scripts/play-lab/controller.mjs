import { PLAY_MAX_OBSERVATION_AGE_MS, parsePlayDecision } from "../../web/src/player-web/ports/VisualPlayHarness.ts";

export function parseObservation(value) {
  if (!value || Object.keys(value).some((key) => !["sessionId", "id", "capturedAt", "image"].includes(key))) throw new Error("Only viewport pixels and capture identifiers are accepted.");
  const { sessionId, id, capturedAt, image } = value;
  if (typeof sessionId !== "string" || sessionId.length > 100 || !Number.isSafeInteger(id) || id < 1
    || !Number.isFinite(capturedAt) || Math.abs(Date.now() - capturedAt) > 60000
    || typeof image !== "string" || image.length > 2000000 || !image.startsWith("data:image/png;base64,")) throw new Error("Invalid viewport observation.");
  const bytes = Buffer.from(image.slice(22), "base64");
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    || bytes.readUInt32BE(16) !== 640 || bytes.readUInt32BE(20) !== 472) throw new Error("Expected the 640×472 player screen containing the 9×9 viewport and HUD.");
  return { sessionId, id, capturedAt, image };
}

export class PlayController {
  constructor(player, publish, { provider = "codex", model = "Codex default", now = Date.now } = {}) {
    this.player = player; this.publish = publish; this.now = now;
    this.state = { running: false, thinking: false, provider, model, message: "Ready for a visual play session.", decisions: 0, latencyMs: null };
    this.sessionId = null; this.frames = []; this.discovered = new Map(); this.journal = []; this.receipts = [];
    this.memory = ""; this.lastEvent = null; this.abort = null; this.generation = 0; this.startedAt = 0;
    this.waitingForReceipt = null; this.receiptRequestedAt = 0; this.lastObservationId = 0;
  }

  emitState() { this.publish("state", { ...this.state }); }
  reset(sessionId) {
    this.stop("Ready. Start the agent or play with the arrow keys.");
    this.sessionId = sessionId; this.frames = []; this.discovered.clear(); this.journal = []; this.receipts = [];
    this.memory = ""; this.lastEvent = null; this.lastObservationId = 0; this.state.decisions = 0; this.state.latencyMs = null;
    this.emitState();
  }
  observe(value) {
    const observation = parseObservation(value);
    if (observation.sessionId !== this.sessionId) throw new Error("Observation belongs to a different play session.");
    if (observation.id <= (this.frames.at(-1)?.id || 0)) throw new Error("Observation is out of order.");
    this.frames.push(observation); this.frames = this.frames.slice(-3);
  }
  start() {
    if (!this.frames.length || this.now() - this.frames.at(-1).capturedAt > 2000) throw new Error("Wait for a fresh viewport before starting.");
    this.generation += 1; this.abort?.abort(); this.abort = null; this.waitingForReceipt = null;
    this.state.thinking = false; this.startedAt = this.now(); this.runDecisions = 0;
    this.state.running = true; this.state.message = "Watching the viewport. Game time continues while I decide."; this.emitState();
  }
  stop(message = "Agent stopped. You can take over.") {
    this.generation += 1; this.abort?.abort(); this.abort = null; this.waitingForReceipt = null;
    this.state.running = false; this.state.thinking = false; this.state.message = message; this.emitState();
  }
  receipt(value) {
    if (!value || !Number.isSafeInteger(value.decisionId) || !["finished", "cancelled", "stale"].includes(value.outcome)
      || !Number.isInteger(value.executedTicks) || value.executedTicks < 0 || value.executedTicks > 40) throw new Error("Invalid input receipt.");
    if (value.decisionId !== this.waitingForReceipt) return;
    const receipt = { decisionId: value.decisionId, outcome: value.outcome, executedTicks: value.executedTicks };
    this.receipts.push(receipt); this.receipts = this.receipts.slice(-10); this.journal.push({ type: "receipt", ...receipt, at: this.now() });
    this.waitingForReceipt = null;
  }
  async pump() {
    if (!this.state.running) return;
    if (this.runDecisions >= 30 || this.now() - this.startedAt > 300000) { this.stop("Session limit reached. Start the agent again to continue."); return; }
    if (this.waitingForReceipt !== null) {
      if (this.now() - this.receiptRequestedAt > 5000) this.stop("Input confirmation was lost. Agent stopped; you can take over.");
      return;
    }
    if (this.state.thinking) return;
    const latest = this.frames.at(-1);
    if (!latest || this.now() - latest.capturedAt > 2000) { this.stop("Viewport connection lost. Agent input stopped."); return; }
    if (latest.id <= this.lastObservationId) return;
    const observations = this.frames.slice(-2);
    const recalledId = this.lastEvent?.decision.recallObservationId;
    const recalled = this.discovered.get(recalledId);
    if (recalled && !observations.some((o) => o.id === recalled.id)) observations.unshift(recalled);
    for (const o of observations) this.discovered.set(o.id, o);
    while (this.discovered.size > 120) this.discovered.delete(this.discovered.keys().next().value);
    const generation = this.generation;
    const abort = new AbortController(); this.abort = abort;
    this.state.thinking = true; this.emitState();
    const startedAt = this.now();
    this.lastObservationId = latest.id;
    try {
      const decision = parsePlayDecision(await this.player({ observations, memory: this.memory, receipts: this.receipts,
        discoveredIds: [...this.discovered.keys()] }, abort.signal));
      if (generation !== this.generation) return;
      if (decision.recallObservationId !== null && !this.discovered.has(decision.recallObservationId)) throw new Error("The player requested an undiscovered image.");
      this.memory = decision.memory; this.state.decisions += 1; this.runDecisions += 1;
      const event = { id: this.state.decisions, sessionId: this.sessionId, observation: latest,
        recall: this.discovered.get(decision.recallObservationId) || null, decision, latencyMs: this.now() - startedAt };
      this.lastEvent = event; this.state.latencyMs = event.latencyMs;
      this.journal.push({ type: "decision", ...event, observations });
      this.waitingForReceipt = event.id; this.receiptRequestedAt = this.now();
      this.state.message = decision.summary;
      this.publish("decision", event);
      if (this.now() - latest.capturedAt > PLAY_MAX_OBSERVATION_AGE_MS) this.state.message = "Decision arrived too late for movement; refreshing the viewport.";
      if (decision.explain) this.stop(decision.summary);
    } catch (error) {
      if (generation === this.generation) this.stop(error instanceof Error ? error.message : String(error));
    } finally {
      if (generation === this.generation) { this.state.thinking = false; this.abort = null; this.emitState(); }
    }
  }
  exportJournal() {
    return { format: "tworld-visual-play-v1", sessionId: this.sessionId, provider: this.state.provider, model: this.state.model,
      observationPolicy: "Rendered 9×9 viewport and normal HUD only; no engine state or level data.", entries: this.journal };
  }
}
