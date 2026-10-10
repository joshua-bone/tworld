import { expect, it, vi } from "vitest";
import { AiTransport } from "./aiTransport";
it("does not connect until asked and sends credentials only in headers/body", async () => {
  const fetcher = vi.fn(async (_url: string, _options: RequestInit) => new Response(JSON.stringify({ version: 3, sessionId: "s", token: "t", provider: "mock", strategy: "off" }), { status: 200 }));
  const transport = new AiTransport(fetcher as typeof fetch);
  expect(fetcher).not.toHaveBeenCalled();
  await transport.pair("pair-token");
  await transport.post("stop", {});
  expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:5175/v1/pair");
  expect(JSON.parse(fetcher.mock.calls[0][1].body as string)).toEqual({ version: 3, pairingToken: "pair-token" });
  expect(fetcher.mock.calls[1][1].headers).toMatchObject({ Authorization: "Bearer t" });
  expect(fetcher.mock.calls.every(([url]) => !url.includes("token"))).toBe(true);
});
it("rejects incompatible pairing responses", async () => {
  const transport = new AiTransport((async () => new Response(JSON.stringify({ version: 3, sessionId: "s", token: "t" }))) as typeof fetch);
  await expect(transport.pair("p")).rejects.toThrow(/protocol/i);
});
it("parses split stream messages and reports stream loss", async () => {
  const event = { version: 1, sessionId: "s", generation: 1, eventId: 1, atMs: 1000, source: "system", kind: "lifecycle", payload: { running: false, message: "Ready" } };
  const text = `data: ${JSON.stringify(event)}\n\n`;
  let calls = 0;
  const transport = new AiTransport((async () => ++calls === 1 ? new Response(JSON.stringify({ version: 3, sessionId: "s", token: "t", provider: "mock", strategy: "off" })) : new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode(text.slice(0, 15)));
    controller.enqueue(new TextEncoder().encode(text.slice(15))); controller.close();
  } }))) as typeof fetch);
  await transport.pair("p"); const events: unknown[] = [];
  await expect(transport.stream((event) => events.push(event), new AbortController().signal)).rejects.toThrow(/disconnected/i);
  expect(events).toEqual([event]);
});
it("calls browser fetch without an incompatible receiver", async () => {
  const transport = new AiTransport((async function(this: unknown) {
    if (this !== undefined) throw new TypeError("Illegal invocation");
    return new Response(JSON.stringify({ version: 3, sessionId: "s", token: "t", provider: "mock", strategy: "off" }));
  }) as typeof fetch);
  expect(await transport.pair("p")).toEqual({ sessionId: "s", provider: "mock", strategy: "off" });
});
it("orders Stop before a subsequent Start even with delayed responses", async () => {
  let finish!: () => void;
  const paths: string[] = [];
  const transport = new AiTransport((async (url: string) => {
    paths.push(url);
    if (url.endsWith("stop")) await new Promise<void>((resolve) => { finish = resolve; });
    return new Response("{}");
  }) as typeof fetch);
  const stop = transport.post("stop", {});
  await Promise.resolve();
  const start = transport.post("start", { direction: "east" });
  await Promise.resolve();
  expect(paths).toEqual(["http://127.0.0.1:5175/v1/stop"]);
  finish(); await Promise.all([stop, start]);
  expect(paths).toEqual(["http://127.0.0.1:5175/v1/stop", "http://127.0.0.1:5175/v1/start"]);
});
it("negotiates strategy-capable protocol and exposes the chosen billing mode before Start", async () => {
  let sent: any;
  const transport = new AiTransport((async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return Response.json({ version: 3, sessionId: "s", token: "t", provider: "jev", strategy: "subscription" });
  }) as typeof fetch);
  expect(await transport.pair("p")).toEqual({ sessionId: "s", provider: "jev", strategy: "subscription" });
  expect(sent.version).toBe(3);
});
