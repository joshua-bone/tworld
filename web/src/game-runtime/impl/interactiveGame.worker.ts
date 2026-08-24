/// <reference lib="webworker" />

import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import {
  readWorkerInteractiveGameSessionId,
  toWorkerInteractiveGameSessionUpdate,
  toWorkerInteractiveGameSessionHandle,
  type InteractiveGameWorkerRequest,
  type InteractiveGameWorkerResponse,
} from "@game-runtime/impl/interactiveGame.worker.protocol";
import type {
  InteractiveGameSession,
  InteractiveGameSessionHydrationOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { IndexedDbImportedDatCatalogStore } from "@level-catalog/impl/IndexedDbImportedDatCatalogStore";

const workerScope = self as DedicatedWorkerGlobalScope;
const levelRepository = new BrowserLevelRepository(new IndexedDbImportedDatCatalogStore());
const engines = {
  MS: new MsGameEngineAdapter(levelRepository),
  Lynx: new LynxGameEngineAdapter(levelRepository),
} as const;

let nextSessionId = 1;
const sessions = new Map<number, InteractiveGameSession>();
let requestQueue: Promise<void> = Promise.resolve();

function sessionForId(sessionId: number): InteractiveGameSession {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(`interactive session ${sessionId} is no longer available`);
  }
  return session;
}

function toClientSession(
  sessionId: number,
  session: InteractiveGameSession,
  options: InteractiveGameSessionHydrationOptions = {},
): InteractiveGameSession {
  const includeHistoryDetails = options.historyDetails === true;
  const includeReplayData = options.replayData === true;

  return {
    ...session,
    history: {
      ...session.history,
      checkpointCount: session.history.checkpointCount ?? session.history.checkpointTicks?.length,
      checkpointTicks: includeHistoryDetails ? session.history.checkpointTicks : undefined,
      recentTicks: session.history.recentTicks ? [...session.history.recentTicks] : undefined,
    },
    recordedMoveCount: session.recordedMoveCount ?? session.recordedMoves?.length,
    recordedMoves: includeReplayData ? session.recordedMoves : undefined,
    handle: toWorkerInteractiveGameSessionHandle(sessionId),
  };
}

async function handleRequest(request: InteractiveGameWorkerRequest): Promise<InteractiveGameWorkerResponse> {
  const engineFor = (ruleset: "MS" | "Lynx" | "Hybrid") => {
    if (ruleset === "Hybrid") {
      throw new Error("Hybrid sessions run in the browser host, not the legacy ruleset worker.");
    }
    return engines[ruleset];
  };
  switch (request.type) {
    case "ping":
      return { id: request.id };
    case "start-session": {
      const engine = engineFor(request.request.ruleset);
      const session = await engine.startSession(request.request, request.options);
      const sessionId = nextSessionId;
      nextSessionId += 1;
      sessions.set(sessionId, session);
      return {
        id: request.id,
        session: toClientSession(sessionId, session),
      };
    }
    case "start-replay-session": {
      const engine = engineFor(request.request.ruleset);
      const session = await engine.startReplaySession(request.request, request.replay, request.options);
      const sessionId = nextSessionId;
      nextSessionId += 1;
      sessions.set(sessionId, session);
      return {
        id: request.id,
        session: toClientSession(sessionId, session),
      };
    }
    case "advance-session": {
      const session = sessionForId(request.sessionId);
      const nextSession = await engineFor(session.request.ruleset).advanceSession(session, request.input);
      sessions.set(request.sessionId, nextSession);
      return {
        id: request.id,
        sessionUpdate: toWorkerInteractiveGameSessionUpdate(session, nextSession),
      };
    }
    case "restore-session": {
      const session = sessionForId(request.sessionId);
      const nextSession = await engineFor(session.request.ruleset).restoreSession(session, request.targetTick);
      sessions.set(request.sessionId, nextSession);
      return {
        id: request.id,
        session: toClientSession(request.sessionId, nextSession),
      };
    }
    case "resume-session": {
      const session = sessionForId(request.sessionId);
      const nextSession = await engineFor(session.request.ruleset).resumeSession(session);
      sessions.set(request.sessionId, nextSession);
      return {
        id: request.id,
        session: toClientSession(request.sessionId, nextSession),
      };
    }
    case "hydrate-session": {
      const session = sessionForId(request.sessionId);
      const hydratedSession = (await engineFor(session.request.ruleset).hydrateSession?.(session, request.options)) ?? session;
      return {
        id: request.id,
        session: toClientSession(request.sessionId, hydratedSession, request.options),
      };
    }
    case "dispose-session":
      sessions.delete(request.sessionId);
      return { id: request.id };
    case "sync-imported-dat":
      await levelRepository.importDatBytes(request.filename, request.datBytes, request.datHash, false);
      return { id: request.id };
    case "delete-imported-dat":
      await levelRepository.deleteImportedDatFile(request.filename);
      return { id: request.id };
    case "preload-level":
      levelRepository.primeLoadedLevel(request.loaded);
      return { id: request.id };
    default: {
      const exhaustiveCheck: never = request;
      return exhaustiveCheck;
    }
  }
}

workerScope.onmessage = (event: MessageEvent<InteractiveGameWorkerRequest>) => {
  const request = event.data;
  requestQueue = requestQueue
    .catch(() => {
      // Keep the worker request pipeline alive after a failed request.
    })
    .then(async () => {
      try {
        const response = await handleRequest(request);
        workerScope.postMessage(response);
      } catch (error: unknown) {
        const response: InteractiveGameWorkerResponse = {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        };
        workerScope.postMessage(response);
      }
    });
};

export {};
