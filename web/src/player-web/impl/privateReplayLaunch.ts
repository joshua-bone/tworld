const ownerOrigin = "https://joshua-server-775718163601.us-west1.run.app";
const developmentPorts = new Set(["3000", "3107", "8080"]);
const maximumReplayBytes = 4 * 1024 * 1024;

export function hasPrivateReplayLaunch(location: Pick<Location, "hash">): boolean {
  return new URLSearchParams(location.hash.replace(/^#/, "")).has("privateReplay");
}

function trustedOrigin(value: string): boolean {
  if (value === ownerOrigin) return true;
  try {
    const url = new URL(value);
    return url.origin === value && ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1"].includes(url.hostname) && developmentPorts.has(url.port);
  } catch { return false; }
}

/** A page-scoped handshake; StrictMode's repeated bootstrap shares one listener. */
const pendingByOpener = new WeakMap<object, Map<string, Promise<unknown>>>();
export function receivePrivateReplay<T>(
  location: Pick<Location, "hash">,
  load: (bytes: Uint8Array) => Promise<T>,
): Promise<T> {
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));
  const channel = params.get("privateReplay") ?? "";
  const origin = params.get("replayOrigin") ?? "";
  const opener = window.opener as Window | null;
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(channel) || !trustedOrigin(origin) || !opener || opener.closed) {
    return Promise.reject(new Error("Private replay requires the trusted dashboard opener."));
  }
  const key = `${origin}:${channel}`;
  const pending = pendingByOpener.get(opener) ?? new Map<string, Promise<unknown>>();
  pendingByOpener.set(opener, pending);
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const promise = new Promise<T>((resolve, reject) => {
    let receiving = false;
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", receive);
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      fragment.delete("privateReplay"); fragment.delete("replayOrigin");
      url.hash = fragment.toString();
      window.history.replaceState(window.history.state, "", url);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      const message = error instanceof Error ? error.message : "Invalid private replay";
      opener.postMessage({ type: "tworld-private-replay-result", channel, ok: false, error: message }, origin);
      reject(new Error(message));
    };
    const receive = (event: MessageEvent) => {
      if (receiving || event.origin !== origin || event.source !== opener || !event.data ||
          event.data.type !== "tworld-private-replay" || event.data.channel !== channel) return;
      receiving = true;
      const bytes: unknown = event.data.bytes;
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0 || bytes.byteLength > maximumReplayBytes) {
        fail(new Error("Invalid private replay bytes.")); return;
      }
      void load(new Uint8Array(bytes)).then((result) => {
        if (settled) return;
        settled = true;
        cleanup();
        opener.postMessage({ type: "tworld-private-replay-result", channel, ok: true }, origin);
        resolve(result);
      }, fail);
    };
    const timer = setTimeout(() => fail(new Error("Private replay transfer timed out.")), 30_000);
    window.addEventListener("message", receive);
    opener.postMessage({ type: "tworld-private-replay-ready", channel }, origin);
  });
  pending.set(key, promise);
  return promise;
}
