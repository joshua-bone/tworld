import { expect, it, vi } from "vitest";
import { captureObservation } from "./captureObservation";
const pixels = "data:image/png;base64,visible-pixels";
function screen(hidden: unknown, width = 640) {
  return { width, height: 472, hidden, getBoundingClientRect: () => ({ width: 640, height: 472 }), toDataURL: vi.fn(() => pixels) } as unknown as HTMLCanvasElement;
}
it("sends only the displayed pixels regardless of hidden state", () => {
  const a = captureObservation(screen({ tiles: [1], random: 42 }), { sessionId: "s", generation: 1 }, 1, 1000);
  const b = captureObservation(screen({ tiles: [99], random: 77 }), { sessionId: "s", generation: 1 }, 1, 1000);
  expect(a).toEqual(b);
  expect(a).toEqual({ version: 1, sessionId: "s", generation: 1, frameId: 1, capturedAtMs: 1000, png: pixels });
});
it("refuses an absent, hidden or alternate-size screen", () => {
  expect(() => captureObservation(null, { sessionId: "s", generation: 1 }, 1, 1000)).toThrow();
  expect(() => captureObservation(screen(null, 1024), { sessionId: "s", generation: 1 }, 1, 1000)).toThrow();
  const canvas = screen(null); canvas.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
  expect(() => captureObservation(canvas, { sessionId: "s", generation: 1 }, 1, 1000)).toThrow();
});
