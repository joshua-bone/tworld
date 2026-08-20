import {
  type P7bAvailableReplayCombination,
  type P7bExecutionTargetId,
  type P7bLevelReplayPresentation,
  type P7bReplayDecisionProfile,
  type P7bReplaySelection,
  type P7bReplayVariantId,
  type P7bSemanticSegmentPresentation,
} from "@game-core/api/p7bReplayPresentation";
import { assertP7bLevelReplayPresentation } from "@game-core/api/p7bReplayPresentationValidation";

export interface P7bReplayAssetLoader<TAsset> {
  load(selection: P7bReplaySelection, href: string): Promise<TAsset>;
}

export interface P7bFullReplayPlaybackEngine<TAsset, TSession, TFrame> {
  startFullReplay(asset: TAsset, selection: P7bReplaySelection): Promise<TSession>;
  advanceOneTick(session: TSession): Promise<TSession>;
  currentTick(session: TSession): number;
  frame(session: TSession): TFrame;
  dispose?(session: TSession): Promise<void>;
}

export type P7bReplayPlaybackState =
  | "idle"
  | "loading"
  | "paused"
  | "playing"
  | "unavailable"
  | "error";

export type P7bSegmentReplaySnapshot<TSession, TFrame> = {
  readonly autoplay: false;
  readonly selection: P7bReplaySelection;
  readonly segment: P7bSemanticSegmentPresentation;
  readonly segmentIndex: number;
  readonly segmentCount: number;
  readonly segmentStartTick: number | null;
  readonly segmentEndTick: number | null;
  readonly segmentStartDecisionOrdinal: number | null;
  readonly segmentEndDecisionOrdinal: number | null;
  readonly decisionProfile: P7bReplayDecisionProfile | null;
  readonly nativeTickRateHz: number | null;
  readonly currentTick: number | null;
  readonly playback: P7bReplayPlaybackState;
  readonly message: string;
  /** The exact replay-owned session consumed by map-only LegacyCanvas rendering. */
  readonly session: TSession | null;
  readonly frame: TFrame | null;
};

type P7bSegmentReplayControllerOptions<TAsset, TSession, TFrame> = {
  readonly presentation: P7bLevelReplayPresentation;
  readonly loader: P7bReplayAssetLoader<TAsset>;
  readonly engine: P7bFullReplayPlaybackEngine<TAsset, TSession, TFrame>;
  readonly maximumSeekAdvanceTicks: number;
};

type SnapshotListener<TSession, TFrame> = (
  snapshot: P7bSegmentReplaySnapshot<TSession, TFrame>,
) => void;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class P7bSegmentReplayController<TAsset, TSession, TFrame> {
  private readonly presentation: P7bLevelReplayPresentation;
  private readonly loader: P7bReplayAssetLoader<TAsset>;
  private readonly engine: P7bFullReplayPlaybackEngine<TAsset, TSession, TFrame>;
  private readonly maximumSeekAdvanceTicks: number;
  private readonly segmentsByVariant: ReadonlyMap<
    P7bReplayVariantId,
    readonly P7bSemanticSegmentPresentation[]
  >;
  private readonly assetCache = new Map<string, TAsset>();
  private readonly listeners = new Set<SnapshotListener<TSession, TFrame>>();
  private operationRevision = 0;

  private selection: P7bReplaySelection;
  private segmentIndex = 0;
  private playback: P7bReplayPlaybackState;
  private message: string;
  private session: TSession | null = null;
  private frame: TFrame | null = null;

  constructor(options: P7bSegmentReplayControllerOptions<TAsset, TSession, TFrame>) {
    if (!Number.isSafeInteger(options.maximumSeekAdvanceTicks) || options.maximumSeekAdvanceTicks < 0) {
      throw new Error("P7B maximum seek advance ticks must be a non-negative safe integer");
    }
    assertP7bLevelReplayPresentation(options.presentation);
    this.presentation = options.presentation;
    this.loader = options.loader;
    this.engine = options.engine;
    this.maximumSeekAdvanceTicks = options.maximumSeekAdvanceTicks;
    this.segmentsByVariant = new Map(options.presentation.variants.map((variant) => [
      variant.id,
      [...variant.segments].sort((left, right) => left.ordinal - right.ordinal),
    ] as const));
    this.selection = { ...options.presentation.initialSelection };
    const combination = this.selectedCombination();
    this.playback = combination.availability === "available" ? "idle" : "unavailable";
    this.message = combination.availability === "available"
      ? "Replay is ready to load on request."
      : combination.reason;
  }

  snapshot(): P7bSegmentReplaySnapshot<TSession, TFrame> {
    const combination = this.selectedCombination();
    const segments = this.selectedSegments();
    const segment = segments[this.segmentIndex]!;
    const span = combination.availability === "available"
      ? combination.segmentSpans.find((candidate) => candidate.segmentId === segment.id)!
      : null;
    const currentTick = this.session === null ? null : this.engine.currentTick(this.session);
    return {
      autoplay: false,
      selection: { ...this.selection },
      segment,
      segmentIndex: this.segmentIndex,
      segmentCount: segments.length,
      segmentStartTick: span?.startNativeTick ?? null,
      segmentEndTick: span?.endNativeTick ?? null,
      segmentStartDecisionOrdinal: span?.startDecisionOrdinal ?? null,
      segmentEndDecisionOrdinal: span?.endDecisionOrdinal ?? null,
      decisionProfile: combination.availability === "available"
        ? { ...combination.decisionProfile }
        : null,
      nativeTickRateHz: combination.availability === "available"
        ? combination.nativeTickRateHz
        : null,
      currentTick,
      playback: this.playback,
      message: this.message,
      session: this.session,
      frame: this.frame,
    };
  }

  subscribe(listener: SnapshotListener<TSession, TFrame>): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const next = this.snapshot();
    for (const listener of this.listeners) listener(next);
  }

  private selectedCombination() {
    return this.presentation.combinations.find((candidate) => (
      candidate.variant === this.selection.variant
      && candidate.executionTarget === this.selection.executionTarget
    ))!;
  }

  private selectedSegments(): readonly P7bSemanticSegmentPresentation[] {
    return this.segmentsByVariant.get(this.selection.variant)!;
  }

  private selectedAvailableCombination(): P7bAvailableReplayCombination | null {
    const combination = this.selectedCombination();
    return combination.availability === "available" ? combination : null;
  }

  private selectedSpan(combination: P7bAvailableReplayCombination) {
    const segment = this.selectedSegments()[this.segmentIndex]!;
    return combination.segmentSpans.find(({ segmentId }) => segmentId === segment.id)!;
  }

  private async disposeCurrentSession(): Promise<void> {
    const session = this.session;
    this.session = null;
    this.frame = null;
    if (session !== null) await this.engine.dispose?.(session);
  }

  private resetSelectionState(): void {
    const combination = this.selectedCombination();
    if (combination.availability === "unavailable") {
      this.playback = "unavailable";
      this.message = combination.reason;
    } else {
      this.playback = "idle";
      this.message = "Replay is ready to load on request.";
    }
    this.emit();
  }

  async selectVariant(variant: P7bReplayVariantId): Promise<void> {
    if (!this.presentation.variants.some((candidate) => candidate.id === variant)) {
      throw new Error(`unknown P7B replay variant: ${variant}`);
    }
    if (variant === this.selection.variant) return;
    const currentSegmentId = this.selectedSegments()[this.segmentIndex]!.id;
    this.operationRevision += 1;
    await this.disposeCurrentSession();
    this.selection = { ...this.selection, variant };
    const selectedSegments = this.selectedSegments();
    const preservedIndex = selectedSegments.findIndex(({ id }) => id === currentSegmentId);
    this.segmentIndex = preservedIndex < 0 ? 0 : preservedIndex;
    this.resetSelectionState();
  }

  async selectExecutionTarget(executionTarget: P7bExecutionTargetId): Promise<void> {
    if (!this.presentation.executionTargets.some((candidate) => candidate.id === executionTarget)) {
      throw new Error(`unknown P7B execution target: ${executionTarget}`);
    }
    if (executionTarget === this.selection.executionTarget) return;
    this.operationRevision += 1;
    await this.disposeCurrentSession();
    this.selection = { ...this.selection, executionTarget };
    this.resetSelectionState();
  }

  async selectSegment(segmentId: string): Promise<void> {
    const nextIndex = this.selectedSegments().findIndex((candidate) => candidate.id === segmentId);
    if (nextIndex < 0) throw new Error(`unknown P7B semantic segment: ${segmentId}`);
    if (nextIndex === this.segmentIndex) return;
    this.operationRevision += 1;
    await this.disposeCurrentSession();
    this.segmentIndex = nextIndex;
    this.resetSelectionState();
  }

  async selectAdjacentSegment(delta: -1 | 1): Promise<void> {
    const segments = this.selectedSegments();
    const nextIndex = this.segmentIndex + delta;
    if (nextIndex < 0 || nextIndex >= segments.length) return;
    await this.selectSegment(segments[nextIndex]!.id);
  }

  private async loadSelectedAsset(
    combination: P7bAvailableReplayCombination,
    selection: P7bReplaySelection,
  ): Promise<TAsset> {
    const cacheKey = `${combination.variant}:${combination.executionTarget}:${combination.replayHref}`;
    const cached = this.assetCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const asset = await this.loader.load(selection, combination.replayHref);
    this.assetCache.set(cacheKey, asset);
    return asset;
  }

  private async startCompleteReplayAt(targetTick: number): Promise<void> {
    const operationRevision = ++this.operationRevision;
    const selection = { ...this.selection };
    const combination = this.selectedAvailableCombination();
    if (combination === null) {
      const unavailable = this.selectedCombination();
      this.playback = "unavailable";
      this.message = unavailable.availability === "unavailable"
        ? unavailable.reason
        : "Replay combination is unavailable.";
      this.emit();
      return;
    }

    await this.disposeCurrentSession();
    if (operationRevision !== this.operationRevision) return;
    this.playback = "loading";
    this.message = "Loading the complete replay…";
    this.emit();

    let current: TSession | null = null;
    try {
      const asset = await this.loadSelectedAsset(combination, selection);
      if (operationRevision !== this.operationRevision) return;
      current = await this.engine.startFullReplay(asset, selection);
      if (operationRevision !== this.operationRevision) {
        await this.engine.dispose?.(current);
        return;
      }
      const initialTick = this.engine.currentTick(current);
      const requiredAdvances = targetTick - initialTick;
      if (requiredAdvances < 0) {
        throw new Error(`complete replay starts at tick ${initialTick}, after requested tick ${targetTick}`);
      }
      if (requiredAdvances > this.maximumSeekAdvanceTicks) {
        throw new Error(
          `segment start tick ${targetTick} exceeds the bounded seek budget of ${this.maximumSeekAdvanceTicks} advances`,
        );
      }

      for (let advanceCount = 0; advanceCount < requiredAdvances; advanceCount += 1) {
        const previousTick = this.engine.currentTick(current);
        const next = await this.engine.advanceOneTick(current);
        if (operationRevision !== this.operationRevision) {
          await this.engine.dispose?.(next);
          return;
        }
        const nextTick = this.engine.currentTick(next);
        if (nextTick !== previousTick + 1) {
          throw new Error(`full replay seek expected tick ${previousTick + 1}, observed ${nextTick}`);
        }
        current = next;
      }
      if (this.engine.currentTick(current) !== targetTick) {
        throw new Error(`full replay seek did not reach exact tick ${targetTick}`);
      }
      this.session = current;
      this.frame = this.engine.frame(current);
      this.playback = "paused";
      this.message = `Paused at native tick ${targetTick}.`;
      this.emit();
    } catch (error: unknown) {
      if (current !== null) await this.engine.dispose?.(current);
      if (operationRevision !== this.operationRevision) return;
      this.session = null;
      this.frame = null;
      this.playback = "error";
      this.message = errorMessage(error);
      this.emit();
      throw error;
    }
  }

  async prepareSelectedSegment(): Promise<void> {
    const combination = this.selectedAvailableCombination();
    if (combination === null) {
      this.resetSelectionState();
      return;
    }
    await this.startCompleteReplayAt(this.selectedSpan(combination).startNativeTick);
  }

  async restartSegment(): Promise<void> {
    await this.prepareSelectedSegment();
  }

  async seekWithinSegment(targetTick: number): Promise<void> {
    if (!Number.isSafeInteger(targetTick)) throw new Error("P7B replay seek tick must be a safe integer");
    const combination = this.selectedAvailableCombination();
    if (combination === null) {
      this.resetSelectionState();
      return;
    }
    const span = this.selectedSpan(combination);
    if (targetTick < span.startNativeTick || targetTick > span.endNativeTick) {
      throw new Error(`P7B replay seek tick must remain inside ${span.startNativeTick}–${span.endNativeTick}`);
    }
    await this.startCompleteReplayAt(targetTick);
  }

  async play(): Promise<void> {
    if (this.playback === "unavailable" || this.playback === "error") return;
    if (this.session === null) await this.prepareSelectedSegment();
    if (this.session === null) return;
    const combination = this.selectedAvailableCombination()!;
    const span = this.selectedSpan(combination);
    if (this.engine.currentTick(this.session) >= span.endNativeTick) {
      this.playback = "paused";
      this.message = `End of segment ${this.segmentIndex + 1} of ${this.selectedSegments().length}`;
    } else {
      this.playback = "playing";
      this.message = `Playing segment ${this.segmentIndex + 1} of ${this.selectedSegments().length}.`;
    }
    this.emit();
  }

  pause(): void {
    if (this.playback !== "playing") return;
    this.playback = "paused";
    this.message = "Replay paused.";
    this.emit();
  }

  private async advancePreparedTick(remainPlaying: boolean): Promise<void> {
    if (this.session === null) return;
    const combination = this.selectedAvailableCombination();
    if (combination === null) return;
    const span = this.selectedSpan(combination);
    const currentTick = this.engine.currentTick(this.session);
    if (currentTick >= span.endNativeTick) {
      this.playback = "paused";
      this.message = `End of segment ${this.segmentIndex + 1} of ${this.selectedSegments().length}`;
      this.emit();
      return;
    }
    const advanced = await this.engine.advanceOneTick(this.session);
    const nextTick = this.engine.currentTick(advanced);
    if (nextTick !== currentTick + 1 || nextTick > span.endNativeTick) {
      throw new Error(`segment playback expected bounded tick ${currentTick + 1}, observed ${nextTick}`);
    }
    this.session = advanced;
    this.frame = this.engine.frame(advanced);
    if (nextTick === span.endNativeTick) {
      this.playback = "paused";
      this.message = `End of segment ${this.segmentIndex + 1} of ${this.selectedSegments().length}`;
    } else {
      this.playback = remainPlaying ? "playing" : "paused";
      this.message = remainPlaying ? `Playing native tick ${nextTick}.` : `Paused at native tick ${nextTick}.`;
    }
    this.emit();
  }

  async advancePlaybackTick(): Promise<void> {
    if (this.playback !== "playing") return;
    await this.advancePreparedTick(true);
  }

  async stepOneTick(): Promise<void> {
    if (this.playback === "unavailable" || this.playback === "error") return;
    if (this.session === null) await this.prepareSelectedSegment();
    await this.advancePreparedTick(false);
  }

  async dispose(): Promise<void> {
    this.operationRevision += 1;
    await this.disposeCurrentSession();
    this.playback = "idle";
    this.message = "Replay player disposed.";
    this.emit();
    this.listeners.clear();
  }
}

export type P7bInteractiveReplayAsset<TRequest, TReplay, TOptions> = {
  readonly request: TRequest;
  readonly replay: TReplay;
  readonly options?: TOptions;
};

type InteractiveReplaySession<TFrame> = {
  readonly history: { readonly currentTick: number };
  readonly frame: TFrame;
};

type InteractiveReplayEnginePort<TRequest, TReplay, TOptions, TSession> = {
  startReplaySession(request: TRequest, replay: TReplay, options?: TOptions): Promise<TSession>;
  advanceSession(session: TSession, input: "none"): Promise<TSession>;
  disposeSession?(session: TSession): Promise<void>;
};

/**
 * Bridges P7B playback to WorkerBackedInteractiveGameEngine without creating a
 * second simulator. The returned session can be handed directly to
 * LegacyCanvasScreen with `presentation="map-only"`.
 */
export function createInteractiveGameReplayPlaybackEngine<
  TRequest,
  TReplay,
  TOptions,
  TFrame,
  TSession extends InteractiveReplaySession<TFrame>,
>(
  engine: InteractiveReplayEnginePort<TRequest, TReplay, TOptions, TSession>,
): P7bFullReplayPlaybackEngine<
  P7bInteractiveReplayAsset<TRequest, TReplay, TOptions>,
  TSession,
  TFrame
> {
  return {
    startFullReplay: (asset) => engine.startReplaySession(asset.request, asset.replay, asset.options),
    advanceOneTick: (session) => engine.advanceSession(session, "none"),
    currentTick: (session) => session.history.currentTick,
    frame: (session) => session.frame,
    dispose: async (session) => engine.disposeSession?.(session),
  };
}
