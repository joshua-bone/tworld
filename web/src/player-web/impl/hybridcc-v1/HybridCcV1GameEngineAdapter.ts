import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { InteractiveInput } from "@game-core/api/command";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameEnginePort,
  InteractiveGameOpaqueReplay,
  InteractiveGameOpaqueReplayExport,
  InteractiveGameSession,
  InteractiveGameSessionHandle,
  InteractiveGameSessionHydrationOptions,
  InteractiveGameSessionStartOptions,
} from "@game-runtime/ports/InteractiveGameEngine";
import { HybridCcV1ActorSerialRegistry } from "./actorSerialRegistry";
import { HYBRID_CC_V1_OUTCOME } from "./engineFacts";
import {
  activeHybridCcV1LifecycleAnimations,
  collectHybridCcV1LifecycleAnimations,
  reconcileHybridCcV1LifecycleAnimations,
  type HybridCcV1LifecycleAnimationTrack,
} from "./lifecycleAnimationProjection";
import {
  hybridCcV1ActorMotionTrack,
  hybridCcV1PresentedMotion,
} from "./presentationProjection";
import { projectHybridCcV1Session } from "./sessionProjection";
import {
  projectHybridCcV1LoopSounds,
  projectHybridCcV1OneShotSounds,
} from "./soundProjection";
import type {
  HybridCcV1ConvertedLevel,
  HybridCcV1Engine,
  HybridCcV1Replay,
  HybridCcV1ReplayVerification,
  HybridCcV1Snapshot,
} from "./wasmBridge";

const HCR1_REPLAY_FORMAT = "hcr1";
const MAXIMUM_REPLAY_BOUNDARIES = 1_000_000;
const LYNX_TERMINAL_HOLD_PRESENTATION_SAMPLES = 13;

export interface HybridCcV1EngineFactory {
  create(level: HybridCcV1ConvertedLevel, seed: number): HybridCcV1Engine;
  decodeReplay?(bytes: Uint8Array): HybridCcV1Replay;
  verifyReplay?(
    level: HybridCcV1ConvertedLevel,
    bytes: Uint8Array,
  ): HybridCcV1ReplayVerification;
  compileRun?(
    level: HybridCcV1ConvertedLevel,
    seed: number,
    denseInputs: Uint8Array,
    checkpointMode: number,
  ): HybridCcV1Replay;
}

function levelKey(request: Pick<GameRequest, "seriesFile" | "levelNumber">): string {
  return `${request.seriesFile}\u0000${request.levelNumber}`;
}

export class HybridCcV1LevelRegistry {
  private readonly levels = new Map<string, HybridCcV1ConvertedLevel>();

  register(seriesFile: string, levels: readonly HybridCcV1ConvertedLevel[]): void {
    for (const level of levels) {
      this.levels.set(levelKey({
        seriesFile,
        levelNumber: level.nativeLevel.number,
      }), level);
    }
  }

  unregister(seriesFile: string): void {
    const prefix = `${seriesFile}\u0000`;
    for (const key of this.levels.keys()) {
      if (key.startsWith(prefix)) this.levels.delete(key);
    }
  }

  load(request: Pick<GameRequest, "seriesFile" | "levelNumber">): HybridCcV1ConvertedLevel {
    const level = this.levels.get(levelKey(request));
    if (!level) {
      throw new Error(`Hybrid v1 level ${request.seriesFile} #${request.levelNumber} is not loaded.`);
    }
    return level;
  }
}

interface ActiveRuntime {
  engine: HybridCcV1Engine;
  level: HybridCcV1ConvertedLevel;
  snapshot: HybridCcV1Snapshot;
  previousSnapshot: HybridCcV1Snapshot;
  presentationSample: number;
  inputSampleIndex: number;
  lastInput: number;
  denseInputs: number[];
  recordedMoveCount: number;
  soundEffects: number;
  actorSerials: HybridCcV1ActorSerialRegistry;
  lifecycleAnimations: HybridCcV1LifecycleAnimationTrack[];
  exposeTerminal: boolean;
  mode: "manual" | "replay";
  replayInputs: Uint8Array | null;
  replayInputCursor: number;
  randomSeed: number;
}

function newHandle(): InteractiveGameSessionHandle {
  return {} as InteractiveGameSessionHandle;
}

function safeBoundary(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > MAXIMUM_REPLAY_BOUNDARIES) {
    throw new Error(`${label} ${value} is outside the browser's bounded Hybrid v1 range.`);
  }
  return result;
}

function hybridInputCode(input: InteractiveInput): number {
  if (typeof input === "number") {
    if (Number.isInteger(input) && input >= 0 && input <= 12) return input;
    throw new Error(`Hybrid v1 input ${input} is outside ABI v1.`);
  }
  switch (input) {
    case "none": case "preserve": return 0;
    case "north": return 1;
    case "east": return 2;
    case "south": return 3;
    case "west": return 4;
  }
}

function assertCompleteSnapshot(snapshot: HybridCcV1Snapshot): void {
  if (snapshot.header.eventsOverflowed || snapshot.header.droppedEventCount !== 0) {
    throw new Error(
      `Hybrid v1 event journal overflow dropped ${snapshot.header.droppedEventCount} event(s).`,
    );
  }
}

function terminalPresentationIsActive(runtime: ActiveRuntime): boolean {
  const outcome = runtime.snapshot.header.outcome;
  if (outcome.kind === HYBRID_CC_V1_OUTCOME.unfinished) return false;
  const terminalStartSample = safeBoundary(
    outcome.logicBoundary,
    "Hybrid v1 terminal boundary",
  ) * 2;
  const terminalMotionSamples = outcome.kind === HYBRID_CC_V1_OUTCOME.loss
    ? runtime.snapshot.presentation.terminalMotion?.presentationSampleCount ?? 0
    : 0;
  return runtime.presentationSample
    < terminalStartSample + terminalMotionSamples + LYNX_TERMINAL_HOLD_PRESENTATION_SAMPLES;
}

function activeMotionTracks(snapshot: HybridCcV1Snapshot) {
  const tracks = snapshot.actors.flatMap((actor) => {
    const track = hybridCcV1ActorMotionTrack(actor);
    return track ? [track] : [];
  });
  const playerTrack = snapshot.presentation.playerMotion ?? snapshot.presentation.terminalMotion;
  if (playerTrack && !tracks.some((track) => track.actorId === playerTrack.actorId)) {
    tracks.push(playerTrack);
  }
  return tracks;
}

function replayDenseInputs(replay: HybridCcV1Replay): Uint8Array {
  const finalBoundary = safeBoundary(replay.header.finalBoundary, "Hybrid v1 replay boundary");
  const dense = new Uint8Array(finalBoundary);
  let currentInput = 0;
  let changeIndex = 0;
  for (let boundary = 1; boundary <= finalBoundary; boundary += 1) {
    const change = replay.changes[changeIndex];
    if (change && safeBoundary(change.logicBoundary, "Hybrid v1 replay change") === boundary) {
      currentInput = change.input;
      changeIndex += 1;
    }
    dense[boundary - 1] = currentInput;
  }
  if (changeIndex !== replay.changes.length) {
    throw new Error("Hybrid v1 replay contains a change beyond its final boundary.");
  }
  return dense;
}

function replayFilename(level: HybridCcV1ConvertedLevel): string {
  const base = level.nativeLevel.title
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .toLocaleLowerCase() || `level-${level.nativeLevel.number}`;
  return `${base}.hcr1`;
}

export class HybridCcV1GameEngineAdapter implements InteractiveGameEnginePort {
  readonly opaqueReplayFormat = HCR1_REPLAY_FORMAT;
  private readonly runtimes = new WeakMap<InteractiveGameSessionHandle, ActiveRuntime>();

  constructor(
    private readonly levels: HybridCcV1LevelRegistry,
    private readonly factory: HybridCcV1EngineFactory,
  ) {}

  async startSession(
    request: GameRequest,
    _options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    this.assertHybridRequest(request);
    const level = this.levels.load(request);
    const randomSeed = request.randomSeed ?? 0;
    return this.start(request, level, randomSeed, "manual", null);
  }

  async startReplaySession(
    _request: GameRequest,
    _replay: ReplaySolutionPayload,
    _options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    throw new Error("Hybrid v1 accepts native HCR1 replays, not legacy MS/Lynx replay payloads.");
  }

  async startOpaqueReplaySession(
    request: GameRequest,
    opaqueReplay: InteractiveGameOpaqueReplay,
    _options?: InteractiveGameSessionStartOptions,
  ): Promise<InteractiveGameSession> {
    const level = this.validateOpaqueReplayNow(request, opaqueReplay);
    if (!this.factory.decodeReplay) throw new Error("Hybrid v1 replay services are unavailable.");
    const replay = this.factory.decodeReplay(opaqueReplay.bytes);
    return this.start(
      { ...request, randomSeed: replay.header.randomSeed },
      level,
      replay.header.randomSeed,
      "replay",
      replayDenseInputs(replay),
    );
  }

  async validateOpaqueReplay(
    request: GameRequest,
    opaqueReplay: InteractiveGameOpaqueReplay,
  ): Promise<void> {
    this.validateOpaqueReplayNow(request, opaqueReplay);
  }

  async exportOpaqueReplay(
    session: InteractiveGameSession,
  ): Promise<InteractiveGameOpaqueReplayExport | null> {
    const runtime = this.runtime(session.handle);
    if (
      runtime.snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.unfinished
      || !runtime.exposeTerminal
    ) {
      return null;
    }
    if (!this.factory.compileRun) throw new Error("Hybrid v1 replay compiler is unavailable.");
    const replay = this.factory.compileRun(
      runtime.level,
      runtime.randomSeed,
      Uint8Array.from(runtime.denseInputs),
      1,
    );
    return {
      format: HCR1_REPLAY_FORMAT,
      bytes: replay.encoded,
      suggestedFilename: replayFilename(runtime.level),
      mimeType: "application/vnd.hybridcc.hcr1",
    };
  }

  async advanceSession(
    session: InteractiveGameSession,
    input: InteractiveInput,
  ): Promise<InteractiveGameSession> {
    const runtime = this.runtime(session.handle);
    if (runtime.exposeTerminal) return session;

    const sampleIndex = runtime.inputSampleIndex;
    if (runtime.snapshot.header.outcome.kind !== HYBRID_CC_V1_OUTCOME.unfinished) {
      if (sampleIndex === 0 || sampleIndex === 2) runtime.presentationSample += 1;
      runtime.soundEffects = 0;
      runtime.lifecycleAnimations = activeHybridCcV1LifecycleAnimations(
        runtime.lifecycleAnimations,
        runtime.presentationSample,
      );
      runtime.exposeTerminal = !terminalPresentationIsActive(runtime);
    } else if (sampleIndex === 0) {
      const inputCode = runtime.mode === "replay"
        ? this.nextReplayInput(runtime)
        : hybridInputCode(input);
      const previousSnapshot = runtime.snapshot;
      const previousBoundary = safeBoundary(
        previousSnapshot.header.logicBoundary,
        "Hybrid v1 logic boundary",
      );
      const step = runtime.engine.logicStep(inputCode);
      if (step.operationStatus !== 0 || step.stepStatus !== 0) {
        throw new Error(
          `Hybrid v1 logic step failed (operation ${step.operationStatus}, step ${step.stepStatus}).`,
        );
      }
      if (runtime.engine.invariantStatus() !== 0) {
        throw new Error("Hybrid v1 invariant check failed after a logic step.");
      }
      const snapshot = runtime.engine.snapshot();
      assertCompleteSnapshot(snapshot);
      const boundary = safeBoundary(snapshot.header.logicBoundary, "Hybrid v1 logic boundary");
      if (boundary !== previousBoundary + 1) {
        throw new Error(
          `Hybrid v1 advanced from boundary ${previousBoundary} to ${boundary}; expected exactly one step.`,
        );
      }
      runtime.previousSnapshot = previousSnapshot;
      runtime.snapshot = snapshot;
      runtime.presentationSample = boundary * 2;
      runtime.lastInput = inputCode;
      runtime.denseInputs.push(inputCode);
      if (inputCode !== 0) runtime.recordedMoveCount += 1;
      const tracks = activeMotionTracks(snapshot);
      const loops = snapshot.header.outcome.kind === HYBRID_CC_V1_OUTCOME.unfinished
        ? projectHybridCcV1LoopSounds(
            snapshot,
            tracks,
            runtime.presentationSample,
            previousSnapshot,
          )
        : 0;
      runtime.lifecycleAnimations = activeHybridCcV1LifecycleAnimations(
        reconcileHybridCcV1LifecycleAnimations(runtime.lifecycleAnimations, snapshot),
        runtime.presentationSample,
      );
      runtime.soundEffects = loops | projectHybridCcV1OneShotSounds(snapshot);
      if (snapshot.header.outcome.kind !== HYBRID_CC_V1_OUTCOME.unfinished) {
        runtime.exposeTerminal = !terminalPresentationIsActive(runtime);
      }
    } else {
      if (sampleIndex === 2) runtime.presentationSample += 1;
      runtime.lifecycleAnimations = activeHybridCcV1LifecycleAnimations(
        runtime.lifecycleAnimations,
        runtime.presentationSample,
      );
      runtime.soundEffects = projectHybridCcV1LoopSounds(
        runtime.snapshot,
        activeMotionTracks(runtime.snapshot),
        runtime.presentationSample,
        runtime.previousSnapshot,
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

  async hydrateSession(
    session: InteractiveGameSession,
    _options: InteractiveGameSessionHydrationOptions,
  ): Promise<InteractiveGameSession> {
    return session;
  }

  async disposeSession(session: InteractiveGameSession): Promise<void> {
    const runtime = this.runtimes.get(session.handle);
    if (!runtime) return;
    runtime.engine.dispose();
    this.runtimes.delete(session.handle);
  }

  private start(
    request: GameRequest,
    level: HybridCcV1ConvertedLevel,
    randomSeed: number,
    mode: "manual" | "replay",
    replayInputs: Uint8Array | null,
  ): InteractiveGameSession {
    const engine = this.factory.create(level, randomSeed);
    try {
      if (engine.invariantStatus() !== 0) {
        throw new Error("Hybrid v1 invariant check failed at session start.");
      }
      const snapshot = engine.snapshot();
      assertCompleteSnapshot(snapshot);
      const boundary = safeBoundary(snapshot.header.logicBoundary, "Hybrid v1 initial boundary");
      const handle = newHandle();
      const runtime: ActiveRuntime = {
        engine,
        level,
        snapshot,
        previousSnapshot: snapshot,
        presentationSample: boundary * 2,
        inputSampleIndex: 0,
        lastInput: 0,
        denseInputs: [],
        recordedMoveCount: 0,
        soundEffects: 0,
        actorSerials: new HybridCcV1ActorSerialRegistry(),
        lifecycleAnimations: collectHybridCcV1LifecycleAnimations(snapshot),
        exposeTerminal: false,
        mode,
        replayInputs,
        replayInputCursor: 0,
        randomSeed,
      };
      this.runtimes.set(handle, runtime);
      return this.project(request, handle, runtime);
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }

  private nextReplayInput(runtime: ActiveRuntime): number {
    const input = runtime.replayInputs?.[runtime.replayInputCursor];
    if (input === undefined) {
      throw new Error("Hybrid v1 replay exhausted before the engine became terminal.");
    }
    runtime.replayInputCursor += 1;
    return input;
  }

  private assertHybridRequest(request: GameRequest): void {
    if (request.ruleset !== "Hybrid") {
      throw new Error("Hybrid v1 only accepts the Hybrid ruleset.");
    }
  }

  private validateOpaqueReplayNow(
    request: GameRequest,
    opaqueReplay: InteractiveGameOpaqueReplay,
  ): HybridCcV1ConvertedLevel {
    this.assertHybridRequest(request);
    if (opaqueReplay.format !== HCR1_REPLAY_FORMAT) {
      throw new Error(`Hybrid v1 cannot open replay format ${opaqueReplay.format}.`);
    }
    if (!this.factory.verifyReplay) {
      throw new Error("Hybrid v1 replay services are unavailable.");
    }
    const level = this.levels.load(request);
    const verification = this.factory.verifyReplay(level, opaqueReplay.bytes);
    if (verification.verifyStatus !== 0 || verification.hasDivergence) {
      throw new Error(`Hybrid v1 replay verification failed with status ${verification.verifyStatus}.`);
    }
    return level;
  }

  private runtime(handle: InteractiveGameSessionHandle): ActiveRuntime {
    const runtime = this.runtimes.get(handle);
    if (!runtime) throw new Error("Hybrid v1 session is no longer active.");
    return runtime;
  }

  private project(
    request: GameRequest,
    handle: InteractiveGameSessionHandle,
    runtime: ActiveRuntime,
  ): InteractiveGameSession {
    return {
      ...projectHybridCcV1Session({
        actorSerials: runtime.actorSerials,
        exposeTerminal: runtime.exposeTerminal,
        lastInput: runtime.lastInput,
        level: runtime.level,
        lifecycleAnimations: runtime.lifecycleAnimations,
        mode: runtime.mode,
        presentationSample: runtime.presentationSample,
        recordedBoundaryCount: runtime.recordedMoveCount,
        replayAvailable: runtime.exposeTerminal && runtime.mode === "manual",
        snapshot: runtime.snapshot,
        soundEffects: runtime.soundEffects,
      }),
      request,
      handle,
    };
  }
}
