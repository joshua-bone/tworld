// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import AiPanel from "./AiPanel";
const state = vi.hoisted(() => ({ value: {} as any }));
vi.mock("./useAiHarness", () => ({ useAiHarness: () => state.value }));

it("shows strategic insights and the active goal without per-action telemetry", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.value = { provider: "jev", strategy: "subscription", connected: true, running: true, fresh: true, status: "Running",
    goalSource: "Astra", goal: { id: "g", objective: "Reach the north corridor", constraints: ["Avoid repeating east"], explanation: "East attempts did not advance" },
    events: [
      { eventId: 1, source: "astra", kind: "strategy", payload: { requestId: "request-1", evidenceIds: [7], publicOutput: '{"objective":"Reach the north corridor"}', status: "accepted", goal: { objective: "Reach the north corridor" }, message: "Astra revised the goal", usage: { billingMode: "subscription", inputTokens: 100, outputTokens: 200, costUsdMicros: null } } },
      { eventId: 2, source: "jev", kind: "decision", payload: { summary: "Jev: north, 1 normal tick." } },
      { eventId: 3, source: "system", kind: "feedback", payload: { message: "north: observed movement." } },
    ] };
  const element = document.createElement("div"), root = createRoot(element);
  await act(async () => root.render(<AiPanel host={{ ready: true } as any} />));
  expect(element.querySelector('[aria-label="Current goal"]')?.textContent).toContain("Reach the north corridor");
  expect(element.textContent).toContain("Avoid repeating east");
  expect([...element.querySelectorAll("li strong")].map(e => e.textContent)).toEqual(["Astra"]);
  expect(element.textContent).toContain("ChatGPT plan"); expect(element.textContent).not.toContain("$0");
  expect(element.textContent).not.toContain("north: observed movement");
  expect(element.textContent).not.toContain("1 normal tick");
  expect(element.querySelector('[aria-label="Strategic insights"]')?.textContent).toContain("Astra revised the goal");
  expect(element.querySelector('summary[aria-label="Inspect Astra response"]')?.textContent).toBe("ⓘ");
  expect(element.querySelector("details")?.open).toBe(false);
  expect(element.querySelector("pre")?.textContent).toContain('"objective": "Reach the north corridor"');
  await act(async () => root.unmount());
});
