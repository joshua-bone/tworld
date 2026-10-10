// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAiHarness, type AiHost } from "./useAiHarness";
const remote = vi.hoisted(() => ({ post: vi.fn(), calls: [] as string[] }));
vi.mock("./aiTransport", () => ({ AiTransport: class {
  async pair() { return "s"; }
  post(path: string, body: unknown) { remote.calls.push(path); return remote.post(path, body); }
  stream() { return new Promise(() => {}); }
} }));
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let root: Root;
let api: ReturnType<typeof useAiHarness>;
let host: AiHost;
let id = 0;
let frameId = 0;
let generation = 1;
function result() { return { command: { sessionId: "s", generation, frameId, decisionId: ++id, direction: "east", ticks: 2 } }; }
function Harness() { api = useAiHarness(host); return null; }
async function flush() { await act(async () => {}); }
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(1000); id = 0; frameId = 0; generation = 1; remote.calls = [];
  remote.post.mockReset().mockImplementation(async (path, body) => {
    if (path === "observe") frameId = body.frameId;
    if (path === "reset") generation = body.generation;
    return path === "start" ? result() : {};
  });
  const screen = document.createElement("div"); screen.innerHTML = '<div class="legacy-canvas-shell"><canvas width="640" height="472"></canvas></div>';
  const canvas = screen.querySelector("canvas")!;
  canvas.getBoundingClientRect = () => ({ width: 640, height: 472 }) as DOMRect;
  canvas.toDataURL = () => "data:image/png;base64,fixture";
  host = { runKey: "level-1", ruleset: "Lynx", ready: true, screen: { current: screen }, input: { current: null }, startGame: vi.fn() };
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
  await act(async () => api.connect("p"));
  await flush();
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });
it("coalesces an in-flight screen capture before starting the clock", async () => {
  const pending = deferred<unknown>();
  remote.post.mockImplementation(async (path, body) => {
    if (path === "observe") { frameId = body.frameId; return pending.promise; }
    return path === "start" ? result() : {};
  });
  await act(async () => { await vi.advanceTimersByTimeAsync(150); });
  let started!: Promise<void>;
  await act(async () => { started = api.start("east"); await Promise.resolve(); });
  expect(host.startGame).not.toHaveBeenCalled();
  await act(async () => { pending.resolve({}); await started; });
  expect(host.startGame).toHaveBeenCalledOnce();
  act(() => { expect(host.input.current!.nextInput()).toBe(8); });
});
it("an old Start failure cannot stop a newer action", async () => {
  const old = deferred<unknown>(); let starts = 0;
  remote.post.mockImplementation(async (path, body) => {
    if (path === "observe") frameId = body.frameId;
    if (path === "start") return ++starts === 1 ? old.promise : result();
    return {};
  });
  let first!: Promise<void>;
  await act(async () => { first = api.start("east"); await Promise.resolve(); });
  await act(async () => api.stop());
  await act(async () => api.start("east"));
  act(() => { expect(host.input.current!.nextInput()).toBe(8); });
  await act(async () => { old.reject(new Error("old failure")); await first; });
  act(() => { expect(host.input.current!.nextInput()).toBe(8); });
});
it("an old receipt failure cannot cancel a new action", async () => {
  const receipt = deferred<unknown>();
  remote.post.mockImplementation(async (path, body) => {
    if (path === "observe") frameId = body.frameId;
    if (path === "receipt") return receipt.promise;
    return path === "start" ? result() : {};
  });
  await act(async () => api.start("east"));
  await act(async () => { host.input.current!.nextInput(); host.input.current!.nextInput(); });
  await act(async () => api.start("east"));
  act(() => { expect(host.input.current!.nextInput()).toBe(8); });
  await act(async () => { receipt.reject(new Error("old receipt")); await Promise.resolve(); });
  act(() => { expect(host.input.current!.nextInput()).toBe(8); });
});
it("takeover during capture prevents a delayed Start", async () => {
  const pending = deferred<unknown>();
  remote.post.mockImplementation(async (path) => path === "observe" ? pending.promise : {});
  let started!: Promise<void>;
  await act(async () => { started = api.start("east"); await Promise.resolve(); });
  await act(async () => host.input.current!.takeOver());
  await act(async () => { pending.resolve({}); await started; });
  expect(remote.calls).not.toContain("start");
  act(() => { expect(host.input.current!.nextInput()).toBe(null); });
});
