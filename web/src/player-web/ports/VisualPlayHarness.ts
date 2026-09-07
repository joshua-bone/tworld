// The vision player receives pixels and its own input receipts, never engine state.
export type PlayDirection = "north" | "south" | "west" | "east" | "none";
export interface PlayAction { direction: PlayDirection; ticks: number }
export interface PlayMark { x: number; y: number; label: string }
export interface PlayDecision {
  summary: string;
  memory: string;
  actions: PlayAction[];
  marks: PlayMark[];
  explain: boolean;
  recallObservationId: number | null;
}
export interface PlayObservation {
  sessionId: string;
  id: number;
  capturedAt: number;
  image: string;
}
export interface PlayReceipt {
  decisionId: number;
  outcome: "finished" | "cancelled" | "stale";
  executedTicks: number;
}
export interface PlayDecisionEvent {
  id: number;
  sessionId: string;
  observation: PlayObservation;
  recall: PlayObservation | null;
  decision: PlayDecision;
  latencyMs: number;
}
export interface PlayRunnerState {
  running: boolean;
  thinking: boolean;
  provider: string;
  model: string;
  message: string;
  decisions: number;
  latencyMs: number | null;
}

export const PLAY_MAX_ACTION_TICKS = 40;
export const PLAY_MAX_OBSERVATION_AGE_MS = 15000;
export const PLAY_DECISION_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    summary: { type: "string" }, memory: { type: "string" },
    actions: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { direction: { type: "string", enum: ["north", "south", "west", "east", "none"] }, ticks: { type: "integer" } },
      required: ["direction", "ticks"] } },
    marks: { type: "array", items: { type: "object", additionalProperties: false,
      properties: { x: { type: "integer" }, y: { type: "integer" }, label: { type: "string" } },
      required: ["x", "y", "label"] } },
    explain: { type: "boolean" }, recallObservationId: { type: ["integer", "null"] },
  },
  required: ["summary", "memory", "actions", "marks", "explain", "recallObservationId"],
} as const;

export function parsePlayDecision(value: unknown): PlayDecision {
  if (!value || typeof value !== "object") throw new Error("Invalid player decision.");
  const d = value as PlayDecision;
  if (typeof d.summary !== "string" || d.summary.length > 500 || typeof d.memory !== "string" || d.memory.length > 5000
    || typeof d.explain !== "boolean" || !(d.recallObservationId === null || Number.isSafeInteger(d.recallObservationId))
    || !Array.isArray(d.actions) || d.actions.length > 6 || !Array.isArray(d.marks) || d.marks.length > 6) {
    throw new Error("Invalid player decision fields.");
  }
  let ticks = 0;
  for (const a of d.actions) {
    if (!a || !["north", "south", "west", "east", "none"].includes(a.direction)
      || !Number.isInteger(a.ticks) || a.ticks < 1 || a.ticks > 20) throw new Error("Invalid directional input.");
    ticks += a.ticks;
  }
  if (ticks > PLAY_MAX_ACTION_TICKS) throw new Error("Input sequence exceeds two seconds.");
  if (d.explain && d.actions.length) throw new Error("Explanation pauses cannot include moves.");
  for (const m of d.marks) {
    if (!m || !Number.isInteger(m.x) || !Number.isInteger(m.y) || m.x < 0 || m.x > 8 || m.y < 0 || m.y > 8
      || typeof m.label !== "string" || m.label.length > 80) throw new Error("Annotation lies outside the viewport.");
  }
  return {
    summary: d.summary, memory: d.memory, explain: d.explain, recallObservationId: d.recallObservationId,
    actions: d.actions.map(({ direction, ticks: duration }) => ({ direction, ticks: duration })),
    marks: d.marks.map(({ x, y, label }) => ({ x, y, label })),
  };
}
