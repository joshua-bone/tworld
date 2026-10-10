import type { Identity, Observation } from "@player-web/ports/aiProtocol.generated";

// This boundary accepts the displayed canvas, never a game session or renderer.
export function captureObservation(canvas: HTMLCanvasElement | null, identity: Identity, frameId: number, capturedAtMs: number): Observation {
  if (!canvas || canvas.width !== 640 || canvas.height !== 472) throw new Error("Waiting for the classic 640×472 screen.");
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("The game screen must be visible.");
  return { version: 1, sessionId: identity.sessionId, generation: identity.generation, frameId, capturedAtMs, png: canvas.toDataURL("image/png") };
}
