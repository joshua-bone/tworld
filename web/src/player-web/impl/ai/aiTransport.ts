import { parseConsoleEvent, type ConsoleEvent } from "@player-web/ports/aiProtocol.generated";
const BASE = "http://127.0.0.1:5175/v1/";

export class AiTransport {
  private token: string | null = null;
  private commands: Promise<unknown> = Promise.resolve();
  constructor(private fetcher: typeof fetch = fetch) {}
  private async request(path: string, body?: unknown, signal = AbortSignal.timeout(4000)): Promise<Response> {
    const response = await this.fetcher.call(undefined, BASE + path, {
      method: body === undefined ? "GET" : "POST", signal, cache: "no-store", credentials: "omit",
      headers: { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Companion rejected the request (${response.status}). Restart it to get a fresh pairing token.`);
    return response;
  }
  async pair(pairingToken: string): Promise<{ sessionId: string; provider: "mock" | "jev"; strategy: "off" | "subscription" | "api" }> {
    const result = await (await this.request("pair", { version: 3, pairingToken })).json();
    if (result.version !== 3 || !["mock", "jev"].includes(result.provider) || !["off", "subscription", "api"].includes(result.strategy) || typeof result.token !== "string" || typeof result.sessionId !== "string") throw new Error("Incompatible companion protocol; update both projects.");
    this.token = result.token;
    return { sessionId: result.sessionId, provider: result.provider, strategy: result.strategy };
  }
  post(path: string, body: unknown): Promise<unknown> {
    // Preserve mutation order across Stop/Start, reset, frames and receipts.
    const result = this.commands.then(async () => (await this.request(path, body)).json());
    this.commands = result.catch(() => undefined);
    return result;
  }
  async exportRun(): Promise<unknown> { return (await this.request("journal")).json(); }
  async stream(receive: (event: ConsoleEvent) => void, signal: AbortSignal): Promise<void> {
    const response = await this.request("events", undefined, signal);
    if (!response.body) throw new Error("Missing event stream.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) throw new Error("Companion disconnected; AI inputs released.");
        buffer += decoder.decode(result.value, { stream: true });
        if (buffer.length > 64_000) throw new Error("Invalid companion stream.");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (block.startsWith("data: ")) receive(parseConsoleEvent(JSON.parse(block.slice(6))));
        }
      }
    } finally { await reader.cancel().catch(() => {}); }
  }
}
