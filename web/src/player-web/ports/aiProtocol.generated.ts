// Generated from joshua-bone/ai-plays-chips-challenge src/protocol.ts
// Source commit: f621f7e9219e44180d97ff8bde83753ef4063cdd
// SHA256: 667d625b014394d41fcd3d7558c2174da9bfe02216d4ed9828c57c4fabf92dca
// Versioned protocol is shared with the TWO browser adapter. No Node or engine imports.
export type Direction = "north" | "south" | "east" | "west" | "none";
export interface Identity { sessionId: string; generation: number }
export interface Observation extends Identity { version: 1; frameId: number; capturedAtMs: number; png: string }
export interface RunContext extends Identity { ruleset: "MS" | "Lynx"; mode: "strict" | "assisted" }
export interface InputCommand extends Identity { decisionId: number; frameId: number; direction: Direction; ticks: number }
export interface InputReceipt extends Identity { decisionId: number; outcome: "finished" | "cancelled" | "stale"; executedTicks: number; timing?: { firstInputAtMs: number | null; lastInputAtMs: number | null } }
export type ConsolePayload =
  | { kind: "lifecycle"; payload: { running: boolean; message: string } }
  | { kind: "decision"; payload: { command: InputCommand; summary: string; provider: "mock" | "jev" } }
  | { kind: "evaluation"; payload: Evaluation }
  | { kind: "receipt"; payload: InputReceipt };
export type ConsoleEvent = Identity & { version: 1 | 2; eventId: number; atMs: number; source: "system" | "jev" } & ConsolePayload;
export interface RunExport { version: 1 | 2; provider: "mock" | "jev"; running: boolean; truncated: boolean; context: RunContext | null; observations: Observation[]; events: ConsoleEvent[]; pendingRequests?: { requestId: string; frameId: number }[] }
export interface ProviderUsage {
  requestId: string;
  provider: "jev";
  billingMode: "api";
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: null;
  costUsdMicros: number | null;
  status: "completed" | "failed" | "aborted" | "invalid" | "budget-denied";
}
export interface Evaluation {
  sessionId: string; generation: number; requestId: string; frameId: number;
  model: string; status: "completed" | "stale" | "failed" | "cancelled" | "invalid" | "budget-denied" | "abstained";
  latencyMs: number; observationAgeMs: number; choice: string | null; confidence: number | null;
  probabilities: Record<string, number> | null; usage: ProviderUsage | null;
}
export const MAX_OBSERVATION_AGE_MS = 500;
export const MAX_PNG_LENGTH = 2_000_000;
export const DIRECTIONS: Direction[] = ["north", "south", "east", "west", "none"];

export function objectWithKeys(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object.");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== keys.length || keys.some((key) => !Object.hasOwn(record, key))) throw new Error("Unexpected or missing fields.");
  return record;
}
function integer(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error("Invalid integer.");
}
function identity(record: Record<string, unknown>): Identity {
  if (typeof record.sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(record.sessionId)) throw new Error("Invalid session identity.");
  integer(record.generation);
  return { sessionId: record.sessionId, generation: record.generation };
}
export function parseDirection(value: unknown): Direction {
  if (!DIRECTIONS.includes(value as Direction)) throw new Error("Invalid direction.");
  return value as Direction;
}
export function parseObservation(value: unknown): Observation {
  const r = objectWithKeys(value, ["version", "sessionId", "generation", "frameId", "capturedAtMs", "png"]);
  const id = identity(r); integer(r.frameId); integer(r.capturedAtMs, 0);
  if (r.version !== 1 || typeof r.png !== "string" || r.png.length > MAX_PNG_LENGTH || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(r.png)) throw new Error("Invalid screen capture.");
  const bytes = atob(r.png.slice(22));
  const header = Uint8Array.from(bytes.slice(0, 24), (c) => c.charCodeAt(0));
  if (bytes.length < 33 || Array.from(header.slice(0, 8)).join() !== "137,80,78,71,13,10,26,10"
    || bytes.slice(12, 16) !== "IHDR" || new DataView(header.buffer).getUint32(16) !== 640 || new DataView(header.buffer).getUint32(20) !== 472) throw new Error("Expected the displayed 640x472 classic screen.");
  return { ...id, version: 1, frameId: r.frameId, capturedAtMs: r.capturedAtMs, png: r.png };
}
export function parseRunContext(value: unknown): RunContext {
  const r = objectWithKeys(value, ["sessionId", "generation", "ruleset", "mode"]);
  if (!["MS", "Lynx"].includes(r.ruleset as string) || !["strict", "assisted"].includes(r.mode as string)) throw new Error("Unsupported run context.");
  return { ...identity(r), ruleset: r.ruleset as RunContext["ruleset"], mode: r.mode as RunContext["mode"] };
}
export function parseInputCommand(value: unknown): InputCommand {
  const r = objectWithKeys(value, ["sessionId", "generation", "decisionId", "frameId", "direction", "ticks"]);
  integer(r.decisionId); integer(r.frameId); integer(r.ticks, 1, 4);
  return { ...identity(r), decisionId: r.decisionId, frameId: r.frameId, direction: parseDirection(r.direction), ticks: r.ticks };
}
export function parseReceipt(value: unknown): InputReceipt {
  const timed = Boolean(value && typeof value === "object" && Object.hasOwn(value, "timing"));
  const r = objectWithKeys(value, ["sessionId", "generation", "decisionId", "outcome", "executedTicks", ...(timed ? ["timing"] : [])]);
  integer(r.decisionId); integer(r.executedTicks, 0, 4);
  if (!["finished", "cancelled", "stale"].includes(r.outcome as string)) throw new Error("Invalid receipt.");
  let timing: InputReceipt["timing"];
  if (timed) {
    const t = objectWithKeys(r.timing, ["firstInputAtMs", "lastInputAtMs"]);
    if (r.executedTicks === 0) { if (t.firstInputAtMs !== null || t.lastInputAtMs !== null) throw new Error("Unexpected input times."); }
    else { integer(t.firstInputAtMs, 0); integer(t.lastInputAtMs, t.firstInputAtMs); }
    timing = t as InputReceipt["timing"];
  }
  return { ...(timing ? { timing } : {}), ...identity(r), decisionId: r.decisionId, outcome: r.outcome as InputReceipt["outcome"], executedTicks: r.executedTicks };
}
export function parseConsoleEvent(value: unknown): ConsoleEvent {
  const r = objectWithKeys(value, ["version", "sessionId", "generation", "eventId", "atMs", "source", "kind", "payload"]);
  const id = identity(r); integer(r.eventId); integer(r.atMs, 0);
  if (![1, 2].includes(r.version as number) || !["system", "jev"].includes(r.source as string) || (r.version === 1 && r.source !== "system")) throw new Error("Unsupported console event.");
  const base = { ...id, version: r.version as 1 | 2, eventId: r.eventId, atMs: r.atMs, source: r.source as "system" | "jev" };
  if (r.kind === "evaluation") {
    if (r.version !== 2 || r.source !== "jev") throw new Error("Invalid evaluation source.");
    const payload = parseEvaluation(r.payload);
    if (payload.sessionId !== id.sessionId || payload.generation !== id.generation) throw new Error("Evaluation identity differs.");
    return { ...base, kind: "evaluation", payload };
  }
  if (r.source !== "system" && r.kind !== "decision") throw new Error("Invalid event source.");
  if (r.kind === "receipt") return { ...base, kind: "receipt", payload: parseReceipt(r.payload) };
  if (r.kind === "decision") {
    const p = objectWithKeys(r.payload, ["command", "summary", "provider"]);
    if (!(["mock", "jev"].includes(p.provider as string)) || (p.provider === "jev" ? r.version !== 2 || r.source !== "jev" : r.source !== "system") || typeof p.summary !== "string" || p.summary.length > 500) throw new Error("Invalid decision event.");
    return { ...base, kind: "decision", payload: { command: parseInputCommand(p.command), summary: p.summary, provider: p.provider as "mock" | "jev" } };
  }
  if (r.kind === "lifecycle") {
    const p = objectWithKeys(r.payload, ["running", "message"]);
    if (typeof p.running !== "boolean" || typeof p.message !== "string" || p.message.length > 500) throw new Error("Invalid lifecycle event.");
    return { ...base, kind: "lifecycle", payload: { running: p.running, message: p.message } };
  }
  throw new Error("Unsupported event kind.");
}

function parseEvaluation(value: unknown): Evaluation {
  const p = objectWithKeys(value, ["sessionId", "generation", "requestId", "frameId", "model", "status", "latencyMs", "observationAgeMs", "choice", "confidence", "probabilities", "usage"]);
  identity(p); integer(p.frameId); integer(p.latencyMs, 0); integer(p.observationAgeMs, 0);
  if (typeof p.requestId !== "string" || p.requestId.length > 200 || typeof p.model !== "string" || p.model.length > 80
    || !["completed", "stale", "failed", "cancelled", "invalid", "budget-denied", "abstained"].includes(p.status as string)
    || (p.choice !== null && (typeof p.choice !== "string" || p.choice.length > 80))) throw new Error("Invalid evaluation.");
  const probability = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
  if (p.confidence !== null && !probability(p.confidence)) throw new Error("Invalid confidence.");
  if (p.probabilities !== null && (typeof p.probabilities !== "object" || Array.isArray(p.probabilities)
    || Object.entries(p.probabilities).length > 20 || Object.entries(p.probabilities).some(([k, v]) => k.length > 80 || !probability(v)))) throw new Error("Invalid probabilities.");
  if (p.usage !== null) {
    const u = objectWithKeys(p.usage, ["requestId", "provider", "billingMode", "inputTokens", "outputTokens", "reasoningTokens", "costUsdMicros", "status"]);
    if (u.requestId !== p.requestId || u.provider !== "jev" || u.billingMode !== "api" || u.reasoningTokens !== null
      || !["completed", "failed", "aborted", "invalid", "budget-denied"].includes(u.status as string)) throw new Error("Invalid usage.");
    for (const key of ["inputTokens", "outputTokens", "costUsdMicros"]) if (u[key] !== null) integer(u[key], 0);
  }
  return p as unknown as Evaluation;
}
