import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { parseInputCommand, type ConsoleEvent, type Direction, type Identity } from "@player-web/ports/aiProtocol.generated";
import { AiInputOwnership, type AiInputPort } from "./aiInputOwnership";
import { AiTransport } from "./aiTransport";
import { captureObservation } from "./captureObservation";

export interface AiHost {
  runKey: string;
  ruleset: "MS" | "Lynx" | null;
  ready: boolean;
  screen: RefObject<HTMLElement | null>;
  input: MutableRefObject<AiInputPort | null>;
  startGame(): void;
}
interface Connected { transport: AiTransport; sessionId: string; provider: "mock" | "jev"; abort: AbortController }
interface Configured { runKey: string; identity: Identity; owner: AiInputOwnership; clockStarted: boolean }

export function useAiHarness(host: AiHost) {
  const current = useRef(host); current.current = host;
  const connection = useRef<Connected | null>(null);
  const configured = useRef<Configured | null>(null);
  const epoch = useRef(0);
  const operation = useRef(0);
  const generation = useRef(0);
  const frameId = useRef(0);
  const capturePending = useRef<{ target: Configured; promise: Promise<boolean> } | null>(null);
  const [connected, setConnected] = useState<Connected | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [running, setRunning] = useState(false);
  const active = useRef(false);
  const markRunning = useCallback((value: boolean) => { active.current = value; setRunning(value); }, []);
  const [resetSerial, setResetSerial] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [status, setStatus] = useState("Start the local companion, then paste its pairing token.");
  const [events, setEvents] = useState<ConsoleEvent[]>([]);

  const stop = useCallback(() => {
    operation.current += 1;
    configured.current?.owner.stop();
    markRunning(false); setStatus("AI stopped; keys released.");
    if (connection.current) void connection.current.transport.post("stop", {}).catch(() => {});
    if (configured.current) { configured.current = null; setFresh(false); setResetSerial(value => value + 1); }
  }, []);
  const disconnect = useCallback((message = "Disconnected. Restart the companion for a fresh pairing token.") => {
    epoch.current += 1;
    operation.current += 1;
    configured.current?.owner.stop(); configured.current = null;
    const old = connection.current; connection.current = null;
    if (old) { void old.transport.post("disconnect", {}).catch(() => {}); old.abort.abort(); }
    setConnected(null); setConnecting(false); setFresh(false); markRunning(false); setStatus(message);
  }, []);
  const capture = useCallback((): Promise<boolean> => {
    const target = configured.current;
    const conn = connection.current;
    const view = current.current;
    if (!target || !conn || !view.ready || target.runKey !== view.runKey || document.hidden) return Promise.resolve(false);
    if (capturePending.current?.target === target) return capturePending.current.promise;
    const pending = { target, promise: Promise.resolve(false) };
    pending.promise = (async () => {
      try {
        const canvas = view.screen.current?.querySelector<HTMLCanvasElement>(".legacy-canvas-shell canvas") ?? null;
        const frame = captureObservation(canvas, target.identity, ++frameId.current, Date.now());
        target.owner.observe(frame.frameId, frame.capturedAtMs);
        await conn.transport.post("observe", frame);
        if (configured.current !== target) return false;
        const isFresh = Date.now() - frame.capturedAtMs <= 500;
        setFresh(isFresh);
        return isFresh;
      } finally { if (capturePending.current === pending) capturePending.current = null; }
    })();
    capturePending.current = pending;
    return pending.promise;
  }, []);

  const connect = async (token: string) => {
    const attempt = ++epoch.current;
    setConnecting(true); setStatus("Connecting to this computer…");
    const transport = new AiTransport();
    try {
      const { sessionId, provider } = await transport.pair(token.trim());
      if (attempt !== epoch.current) { void transport.post("disconnect", {}).catch(() => {}); return; }
      const conn = { transport, sessionId, provider, abort: new AbortController() };
      connection.current = conn; setConnected(conn); setEvents([]); setConnecting(false);
      setStatus("Connected. Load an MS or Lynx level normally.");
      let lastEvent = 0;
      void transport.stream((event) => {
        if (connection.current !== conn || event.sessionId !== sessionId || event.generation !== configured.current?.identity.generation) return;
        if (event.eventId <= lastEvent) return; lastEvent = event.eventId;
        setEvents((previous) => [...previous.slice(-99), event]);
        if (event.kind === "lifecycle") {
          if (!event.payload.running && active.current) stop();
          setStatus(event.payload.message);
        }
        if (event.kind === "decision" && provider === "jev" && active.current) {
          const target = configured.current;
          if (!target || !current.current.ready || document.hidden || target.runKey !== current.current.runKey) { stop(); return; }
          if (!target.owner.accept(event.payload.command, Date.now())) { stop(); setStatus("Jev action rejected: stale screen or invalid identity. Start again when ready."); }
          else if (!target.clockStarted) { target.clockStarted = true; current.current.startGame(); }
        }
      }, conn.abort.signal).catch(() => {
        if (connection.current === conn) disconnect("Connection lost. AI keys released. Restart the companion to reconnect.");
      });
    } catch (error) {
      if (attempt !== epoch.current) return;
      setConnecting(false);
      setStatus(error instanceof TypeError ? "Cannot reach the companion. Check it is running and allow this site's local-network permission in Chrome, then retry." : (error as Error).message);
    }
  };

  useEffect(() => {
    operation.current += 1;
    configured.current?.owner.stop(); configured.current = null;
    setFresh(false); markRunning(false);
    if (!connected || !host.ruleset) return;
    const identity = { sessionId: connected.sessionId, generation: ++generation.current };
    const target: Configured = { identity, runKey: host.runKey, clockStarted: false, owner: new AiInputOwnership(host.ruleset, identity, (receipt) => {
      if (configured.current !== target) return;
      if (connected.provider === "mock") markRunning(false);
      const receiptOperation = operation.current;
      void connected.transport.post("receipt", receipt).catch(() => {
        if (configured.current === target && operation.current === receiptOperation) stop();
      });
    }) };
    let cancelled = false;
    void connected.transport.post("reset", { ...identity, ruleset: host.ruleset, mode: "strict" }).then(() => {
      if (!cancelled && connection.current === connected) configured.current = target;
    }).catch(() => { if (!cancelled) disconnect("Could not initialize the run. Restart the companion and reconnect."); });
    return () => { cancelled = true; target.owner.stop(); if (configured.current === target) configured.current = null; };
  }, [connected, host.runKey, host.ruleset, resetSerial, disconnect, stop]);

  useEffect(() => {
    host.input.current = {
      nextInput: () => {
        const target = configured.current;
        if (!current.current.ready || target?.runKey !== current.current.runKey || document.hidden) { target?.owner.stop(); return null; }
        return target?.owner.nextInput(Date.now()) ?? null;
      },
      takeOver: stop,
    };
    const release = () => { stop(); setFresh(false); };
    const visibility = () => { if (document.hidden) release(); };
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", visibility);
    return () => { host.input.current = null; window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", visibility); disconnect(); };
  }, [host.input, stop, disconnect]);

  useEffect(() => {
    if (!host.ready) { stop(); setFresh(false); }
  }, [host.ready, stop]);

  useEffect(() => {
    if (!connected) return;
    let pingPending = false;
    const screens = window.setInterval(() => {
      const target = configured.current;
      void capture().catch(() => { if (connection.current === connected && configured.current === target) disconnect("Capture or connection failed. AI keys released; check the displayed screen and companion."); });
    }, 150);
    const heartbeat = window.setInterval(() => {
      if (pingPending) return;
      pingPending = true;
      void connected.transport.post("ping", {}).catch(() => {
        if (connection.current === connected) disconnect("Companion disconnected. AI keys released.");
      }).finally(() => { pingPending = false; });
    }, 3000);
    return () => { clearInterval(screens); clearInterval(heartbeat); };
  }, [connected, capture, disconnect]);

  const start = async (direction: Direction) => {
    const target = configured.current; const conn = connection.current;
    if (!target || !conn || !current.current.ready || target.runKey !== current.current.runKey) return;
    const attempt = ++operation.current;
    const isCurrent = () => attempt === operation.current && configured.current === target && connection.current === conn
      && current.current.ready && current.current.runKey === target.runKey && !document.hidden;
    target.clockStarted = false; target.owner.start(conn.provider === "jev"); markRunning(true);
    try {
      const captured = await capture();
      if (!isCurrent()) return;
      if (!captured) { stop(); setStatus("Waiting for a fresh screen. Try Start again."); return; }
      const response = await conn.transport.post("start", { direction }) as { command: unknown };
      if (!isCurrent()) return;
      if (conn.provider === "jev") {
        if (response.command !== null) throw new Error("Unexpected live start response.");
        return;
      }
      if (!target.owner.accept(parseInputCommand(response.command), Date.now())) {
        stop(); setStatus("Action rejected because its screen was stale. Try again.");
      } else current.current.startGame();
    } catch { if (isCurrent()) { stop(); setStatus("AI start failed. Check the connection and try again."); } }
  };

  const exportRun = async () => {
    try {
      if (!connection.current) return;
      const data = await connection.current.transport.exportRun();
      if ((data as { truncated?: boolean }).truncated) setStatus("Exported the recent evidence window. Earlier records remain in the companion’s local journal.");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "chips-ai-run.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setStatus("Run export failed. Check the companion connection."); }
  };
  return { connect, disconnect, start, stop, exportRun, connected: Boolean(connected), connecting, running, fresh, status, events, provider: connected?.provider ?? "mock" };
}
