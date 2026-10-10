// Generated from joshua-bone/ai-plays-chips-challenge src/protocol.ts
// Source commit: 72fc19752d0c23f5c05f5a3e260b8f232e7ab5b2
// SHA256: e515ce52662024e186ae3f4d9f3e825c5e50aa596cc9704b833ae479b85b2517
// Protocol v1 is shared with the TWO browser adapter. No Node or engine imports.
export type Direction = "north" | "south" | "east" | "west" | "none";
export interface Identity { sessionId: string; generation: number }
export interface Observation extends Identity { version: 1; frameId: number; capturedAtMs: number; png: string }
export interface RunContext extends Identity { ruleset: "MS" | "Lynx"; mode: "strict" | "assisted" }
export interface InputCommand extends Identity { decisionId: number; frameId: number; direction: Direction; ticks: number }
export interface InputReceipt extends Identity { decisionId: number; outcome: "finished" | "cancelled" | "stale"; executedTicks: number }
export type ConsolePayload =
  | { kind: "lifecycle"; payload: { running: boolean; message: string } }
  | { kind: "decision"; payload: { command: InputCommand; summary: string; provider: "mock" } }
  | { kind: "receipt"; payload: InputReceipt };
export type ConsoleEvent = Identity & { version: 1; eventId: number; atMs: number; source: "system" } & ConsolePayload;
export interface RunExport { version: 1; provider: "mock"; running: boolean; context: RunContext | null; observations: Observation[]; events: ConsoleEvent[] }
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
  const r = objectWithKeys(value, ["sessionId", "generation", "decisionId", "outcome", "executedTicks"]);
  integer(r.decisionId); integer(r.executedTicks, 0, 4);
  if (!["finished", "cancelled", "stale"].includes(r.outcome as string)) throw new Error("Invalid receipt.");
  return { ...identity(r), decisionId: r.decisionId, outcome: r.outcome as InputReceipt["outcome"], executedTicks: r.executedTicks };
}
export function parseConsoleEvent(value: unknown): ConsoleEvent {
  const r = objectWithKeys(value, ["version", "sessionId", "generation", "eventId", "atMs", "source", "kind", "payload"]);
  const id = identity(r); integer(r.eventId); integer(r.atMs, 0);
  if (r.version !== 1 || r.source !== "system") throw new Error("Unsupported console event.");
  const base = { ...id, version: 1 as const, eventId: r.eventId, atMs: r.atMs, source: "system" as const };
  if (r.kind === "receipt") return { ...base, kind: "receipt", payload: parseReceipt(r.payload) };
  if (r.kind === "decision") {
    const p = objectWithKeys(r.payload, ["command", "summary", "provider"]);
    if (p.provider !== "mock" || typeof p.summary !== "string" || p.summary.length > 500) throw new Error("Invalid decision event.");
    return { ...base, kind: "decision", payload: { command: parseInputCommand(p.command), summary: p.summary, provider: "mock" } };
  }
  if (r.kind === "lifecycle") {
    const p = objectWithKeys(r.payload, ["running", "message"]);
    if (typeof p.running !== "boolean" || typeof p.message !== "string" || p.message.length > 500) throw new Error("Invalid lifecycle event.");
    return { ...base, kind: "lifecycle", payload: { running: p.running, message: p.message } };
  }
  throw new Error("Unsupported event kind.");
}
