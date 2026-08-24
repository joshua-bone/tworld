import { resolveGameInputCode, type InteractiveInput } from "@game-core/api/command";
import type { GameRequest } from "@game-core/api/types";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import {
  advanceHybridCcV0MotionTracks,
  type HybridCcV0MotionTracks,
} from "./motionProjection";
import type { HybridCcNativeLevel } from "./nativeLevel";
import { projectHybridCcSession } from "./renderProjection";
import { projectHybridCcV0SoundEffects } from "./soundProjection";
import type { HybridCcEngine, HybridCcSnapshot } from "./wasmBridge";

export interface HybridCcV0EngineFactory {
  create(level: HybridCcNativeLevel, seed: number): HybridCcEngine;
}

function levelKey(request: Pick<GameRequest, "seriesFile" | "levelNumber">): string {
  return `${request.seriesFile}\u0000${request.levelNumber}`;
}

export class HybridCcV0LevelRegistry {
  private readonly levels = new Map<string, HybridCcNativeLevel>();

  register(seriesFile: string, levels: readonly HybridCcNativeLevel[]): void {
    for (const level of levels) this.levels.set(levelKey({ seriesFile, levelNumber: level.number }), level);
  }

  unregister(seriesFile: string): void {
    const prefix = `${seriesFile}\u0000`;
    for (const key of this.levels.keys()) {
      if (key.startsWith(prefix)) this.levels.delete(key);
    }
  }

  load(request: Pick<GameRequest, "seriesFile" | "levelNumber">): HybridCcNativeLevel {
    const level = this.levels.get(levelKey(request));
    if (!level) throw new Error(`Hybrid v0 level ${request.seriesFile} #${request.levelNumber} is not loaded.`);
    return level;
  }
}

interface ActiveRuntime {
  engine: HybridCcEngine;
  level: HybridCcNativeLevel;
  snapshot: HybridCcSnapshot;
  previousSnapshot: HybridCcSnapshot;
  presentationTick: number;
  inputSampleIndex: number;
  lastInput: number;
  recordedMoveCount: number;
  soundEffects: number;
  motionTracks: HybridCcV0MotionTracks;
}

function newHandle(): InteractiveGameSessionHandle {
  return {} as InteractiveGameSessionHandle;
}

export class HybridCcV0GameEngineAdapter implements InteractiveGameEnginePort {
  private readonly runtimes = new WeakMap<InteractiveGameSessionHandle, ActiveRuntime>();

  constructor(
    private readonly levels: HybridCcV0LevelRegistry,
    private readonly factory: HybridCcV0EngineFactory,
  ) {}

  async startSession(
    request: GameRequest,
    _options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    if (request.ruleset !== "Hybrid") throw new Error("Hybrid v0 only accepts the Hybrid ruleset.");
    const level = this.levels.load(request);
    const engine = this.factory.create(level, request.randomSeed ?? 0);
    const snapshot = engine.snapshot();
    const handle = newHandle();
    const runtime: ActiveRuntime = {
      engine,
      level,
      snapshot,
      previousSnapshot: snapshot,
      presentationTick: 0,
      inputSampleIndex: 0,
      lastInput: 0,
      recordedMoveCount: 0,
      soundEffects: 0,
      motionTracks: new Map(),
    };
    this.runtimes.set(handle, runtime);
    return this.project(request, handle, runtime);
  }

  async startReplaySession(
    _request: GameRequest,
    _replay: ReplaySolutionPayload,
    _options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    throw new Error("Hybrid v0 native replay playback is not exposed in this player yet.");
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: InteractiveInput,
  ): Promise<InteractiveGameSession> {
    const runtime = this.runtime(session.handle);
    if (runtime.snapshot.outcome.kind !== 0) return session;

    const inputCode = resolveGameInputCode(input);
    const sampleIndex = runtime.inputSampleIndex;
    if (sampleIndex === 0) {
      const previousSnapshot = runtime.snapshot;
      const snapshot = runtime.engine.logicStep(inputCode);
      const presentationTick = snapshot.logicStep * 2;
      const motionTracks = advanceHybridCcV0MotionTracks(
        runtime.level,
        previousSnapshot,
        snapshot,
        presentationTick,
        runtime.motionTracks,
      );
      Object.assign(runtime, {
        snapshot,
        previousSnapshot,
        presentationTick,
        lastInput: inputCode,
        recordedMoveCount: runtime.recordedMoveCount + (inputCode === 0 ? 0 : 1),
        motionTracks,
        soundEffects: projectHybridCcV0SoundEffects(
          runtime.level,
          previousSnapshot,
          snapshot,
          inputCode,
          motionTracks,
          presentationTick,
        ),
      });
    } else if (sampleIndex === 2) {
      runtime.presentationTick = runtime.snapshot.logicStep * 2 + 1;
      runtime.soundEffects = projectHybridCcV0SoundEffects(
        runtime.level,
        runtime.previousSnapshot,
        runtime.snapshot,
        runtime.lastInput,
        runtime.motionTracks,
        runtime.presentationTick,
      );
    }
    runtime.inputSampleIndex = (sampleIndex + 1) % 4;
    return this.project(session.request, session.handle, runtime);
  }

  async restoreSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    return session;
  }

  async resumeSession(session: InteractiveGameSession): Promise<InteractiveGameSession> {
    return session;
  }

  async disposeSession(session: InteractiveGameSession): Promise<void> {
    const runtime = this.runtimes.get(session.handle);
    if (!runtime) return;
    runtime.engine.dispose();
    this.runtimes.delete(session.handle);
  }

  private runtime(handle: InteractiveGameSessionHandle): ActiveRuntime {
    const runtime = this.runtimes.get(handle);
    if (!runtime) throw new Error("Hybrid v0 session is no longer active.");
    return runtime;
  }

  private project(
    request: GameRequest,
    handle: InteractiveGameSessionHandle,
    runtime: ActiveRuntime,
  ): InteractiveGameSession {
    return {
      ...projectHybridCcSession(
        runtime.level,
        runtime.snapshot,
        request.seriesFile,
        runtime.presentationTick,
        runtime.soundEffects,
        runtime.recordedMoveCount,
        runtime.motionTracks,
      ),
      request,
      handle,
    };
  }
}
