import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameRequest } from "@game-core/api/types";
import { estimateSerializablePayloadBytes } from "@game-runtime/impl/estimateSerializablePayloadBytes";
import {
  applyWorkerInteractiveGameSessionUpdate,
  readWorkerInteractiveGameSessionId,
  type InteractiveGameWorkerRequest,
  type InteractiveGameWorkerResponse,
} from "@game-runtime/impl/interactiveGame.worker.protocol";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionHydrationOptions,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";

interface PendingInteractiveGameWorkerRequest {
  resolve: (response: InteractiveGameWorkerResponse) => void;
  reject: (error: unknown) => void;
}

interface SyncImportedDatRequest {
  datBytes: Uint8Array;
  datHash: string;
  filename: string;
}

const PERF_GLOBAL_KEY = "__TWORLD_PERF__";

interface PerfRuntimeGlobal {
  isDiagnosticsEnabled?: () => boolean;
  recordWorkerAdvancePayloadBytes?: (value: number) => void;
  recordWorkerAdvanceRoundTrip?: (durationMs: number) => void;
}

function runtimePerfGlobal(): PerfRuntimeGlobal | null {
  const target = globalThis as typeof globalThis & {
    [PERF_GLOBAL_KEY]?: PerfRuntimeGlobal;
  };

  return target[PERF_GLOBAL_KEY] ?? null;
}

export class WorkerBackedInteractiveGameEngine implements InteractiveGameEnginePort {
  private worker: Worker | null = null;
  private nextRequestId = 1;
  private pendingRequests = new Map<number, PendingInteractiveGameWorkerRequest>();

  private getWorker(): Worker {
    if (typeof Worker === "undefined") {
      throw new Error("Web Workers are unavailable in this environment.");
    }

    if (this.worker) {
      return this.worker;
    }

    const worker = new Worker(new URL("./interactiveGame.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<InteractiveGameWorkerResponse>) => {
      const pending = this.pendingRequests.get(event.data.id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(event.data.id);
      if (event.data.error) {
        pending.reject(new Error(event.data.error));
        return;
      }

      pending.resolve(event.data);
    };

    worker.onerror = (event) => {
      const error = event.error ?? new Error(event.message);
      for (const pending of this.pendingRequests.values()) {
        pending.reject(error);
      }
      this.pendingRequests.clear();
      worker.terminate();
      if (this.worker === worker) {
        this.worker = null;
      }
    };

    this.worker = worker;
    return worker;
  }

  private async requestSession(
    request: InteractiveGameWorkerRequest,
    previousSession?: InteractiveGameSession,
  ): Promise<InteractiveGameSession> {
    const startedAtMs = request.type === "advance-session" ? performance.now() : 0;
    const response = await this.request(request);
    if (request.type === "advance-session") {
      const perf = runtimePerfGlobal();
      perf?.recordWorkerAdvanceRoundTrip?.(performance.now() - startedAtMs);
      if (perf?.isDiagnosticsEnabled?.()) {
        perf.recordWorkerAdvancePayloadBytes?.(
          estimateSerializablePayloadBytes(response.sessionUpdate ?? response.session ?? response),
        );
      }
    }

    if (response.session) {
      return response.session;
    }

    if (response.sessionUpdate && previousSession) {
      return applyWorkerInteractiveGameSessionUpdate(previousSession, response.sessionUpdate);
    }

    throw new Error(`interactive worker response for ${request.type} did not include a session payload`);
  }

  private request(request: InteractiveGameWorkerRequest): Promise<InteractiveGameWorkerResponse> {
    const worker = this.getWorker();
    return new Promise<InteractiveGameWorkerResponse>((resolve, reject) => {
      this.pendingRequests.set(request.id, { resolve, reject });
      try {
        worker.postMessage(request);
      } catch (error: unknown) {
        this.pendingRequests.delete(request.id);
        reject(error);
      }
    });
  }

  private nextId(): number {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;
    return requestId;
  }

  warmup(): void {
    void this.request({
      id: this.nextId(),
      type: "ping",
    }).catch(() => {
      // Ignore warmup failures; gameplay will surface real worker issues later.
    });
  }

  private sessionId(session: InteractiveGameSession): number {
    const sessionId = readWorkerInteractiveGameSessionId(session.handle);
    if (sessionId === null) {
      throw new Error("interactive session is not owned by the gameplay worker");
    }
    return sessionId;
  }

  async startSession(request: GameRequest, options?: InteractiveGameSessionStartOptions): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "start-session",
      request,
      options,
    });
  }

  async startReplaySession(
    request: GameRequest,
    replay: ReplaySolutionPayload,
    options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "start-replay-session",
      request,
      replay,
      options,
    });
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: Parameters<InteractiveGameEnginePort["advanceSession"]>[1],
  ): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "advance-session",
      sessionId: this.sessionId(session),
      input,
    }, session);
  }

  async restoreSession(session: InteractiveGameSession, targetTick: number): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "restore-session",
      sessionId: this.sessionId(session),
      targetTick,
    });
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "resume-session",
      sessionId: this.sessionId(session),
    });
  }

  async hydrateSession(
    session: InteractiveGameSession,
    options: InteractiveGameSessionHydrationOptions,
  ): Promise<InteractiveGameSession> {
    return this.requestSession({
      id: this.nextId(),
      type: "hydrate-session",
      sessionId: this.sessionId(session),
      options,
    });
  }

  async disposeSession(session: InteractiveGameSession): Promise<void> {
    await this.request({
      id: this.nextId(),
      type: "dispose-session",
      sessionId: this.sessionId(session),
    });
  }

  async syncImportedDatFile({ filename, datHash, datBytes }: SyncImportedDatRequest): Promise<void> {
    await this.request({
      id: this.nextId(),
      type: "sync-imported-dat",
      filename,
      datHash,
      datBytes,
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    await this.request({
      id: this.nextId(),
      type: "delete-imported-dat",
      filename,
    });
  }
}
