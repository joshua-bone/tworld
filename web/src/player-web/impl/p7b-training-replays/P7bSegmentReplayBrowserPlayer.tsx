import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { LegacyCanvasScreen } from "@player-web/impl/LegacyCanvasScreen";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type {
  P7bExecutionTargetId,
  P7bReplayVariantId,
} from "@game-core/api/p7bReplayPresentation";
import {
  P7bSegmentReplayController,
  type P7bSegmentReplaySnapshot,
} from "./p7bSegmentReplayPlayer";
import {
  createP7bBrowserReplayAssetLoader,
  createP7bBrowserReplayPlaybackEngine,
  p7bBrowserSeriesForTarget,
  type P7bBrowserReplayAsset,
  type P7bFetchText,
  type P7bReplayBrowserManifestV1,
} from "./p7bReplayBrowserRuntime";
import type { InteractiveGameFrame } from "@game-core/api/interactive";

const PLAYER_SPEEDS = [0.5, 1, 2, 4] as const;
const NOOP = () => undefined;

export type P7bReplayKeyboardAction =
  | "toggle-playback"
  | "restart"
  | "step"
  | "previous-segment"
  | "next-segment";

export type P7bReplayKeyboardEvent = {
  readonly key: string;
  readonly altKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly metaKey?: boolean;
  readonly shiftKey?: boolean;
  readonly targetTagName?: string;
  readonly targetIsContentEditable?: boolean;
};

export function resolveP7bReplayKeyboardAction(
  event: P7bReplayKeyboardEvent,
): P7bReplayKeyboardAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  const tagName = event.targetTagName?.toUpperCase() ?? "";
  if (
    event.targetIsContentEditable
    || tagName === "BUTTON"
    || tagName === "INPUT"
    || tagName === "SELECT"
    || tagName === "TEXTAREA"
  ) {
    return null;
  }
  switch (event.key.toLowerCase()) {
    case " ":
      return "toggle-playback";
    case ".":
      return "step";
    case "r":
      return "restart";
    case "[":
      return "previous-segment";
    case "]":
      return "next-segment";
    default:
      return null;
  }
}

export type P7bReplayMapRendererProps = {
  readonly manifest: P7bReplayBrowserManifestV1;
  readonly target: P7bExecutionTargetId;
  readonly session: InteractiveGameSession | null;
  readonly isLoading: boolean;
  readonly message: string | null;
};

export type P7bReplayMapRenderer = ComponentType<P7bReplayMapRendererProps>;

export function P7bLegacyCanvasReplayMap({
  manifest,
  target,
  session,
  isLoading,
  message,
}: P7bReplayMapRendererProps) {
  const series = useMemo(() => p7bBrowserSeriesForTarget(manifest, target), [manifest, target]);
  const liveSessionRef = useRef<InteractiveGameSession | null>(session);
  liveSessionRef.current = session;
  return (
    <LegacyCanvasScreen
      catalog={[series]}
      className="legacy-canvas p7b-replay-canvas"
      currentLevel={series.levels[0] ?? null}
      currentRuleset={series.ruleset}
      currentSeries={series}
      isLoading={isLoading}
      liveSessionRef={liveSessionRef}
      message={message}
      mode="game"
      onActivateSeries={NOOP}
      onSelectSeries={NOOP}
      presentation="map-only"
      selectedSeriesFile={series.filebase}
      session={session}
    />
  );
}

type Controller = P7bSegmentReplayController<
  P7bBrowserReplayAsset,
  InteractiveGameSession,
  InteractiveGameFrame
>;

type Snapshot = P7bSegmentReplaySnapshot<InteractiveGameSession, InteractiveGameFrame>;

export type P7bSegmentReplayBrowserPlayerProps = {
  readonly manifest: P7bReplayBrowserManifestV1;
  readonly services: Pick<BrowserAppServices, "engines" | "preloadGameRequest">;
  readonly fetchText?: P7bFetchText;
  readonly maximumSeekAdvanceTicks?: number;
  readonly MapRenderer?: P7bReplayMapRenderer;
};

function createController(props: P7bSegmentReplayBrowserPlayerProps): Controller {
  return new P7bSegmentReplayController({
    presentation: props.manifest.presentation,
    loader: createP7bBrowserReplayAssetLoader({
      manifest: props.manifest,
      services: props.services,
      fetchText: props.fetchText,
    }),
    engine: createP7bBrowserReplayPlaybackEngine(props.services),
    maximumSeekAdvanceTicks: props.maximumSeekAdvanceTicks ?? 100_000,
  });
}

function runControllerAction(
  controller: Controller,
  action: P7bReplayKeyboardAction,
): Promise<void> | void {
  switch (action) {
    case "toggle-playback":
      if (controller.snapshot().playback === "playing") {
        controller.pause();
        return;
      }
      return controller.play();
    case "restart":
      return controller.restartSegment();
    case "step":
      return controller.stepOneTick();
    case "previous-segment":
      return controller.selectAdjacentSegment(-1);
    case "next-segment":
      return controller.selectAdjacentSegment(1);
  }
}

export function P7bSegmentReplayBrowserPlayer(props: P7bSegmentReplayBrowserPlayerProps) {
  const controller = useMemo(() => createController(props), [
    props.fetchText,
    props.manifest,
    props.maximumSeekAdvanceTicks,
    props.services,
  ]);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => controller.snapshot());
  const [speed, setSpeed] = useState<number>(1);
  const [uiError, setUiError] = useState<string | null>(null);
  const MapRenderer = props.MapRenderer ?? P7bLegacyCanvasReplayMap;

  useEffect(() => {
    setSnapshot(controller.snapshot());
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      void controller.dispose();
    };
  }, [controller]);

  const perform = (operation: () => Promise<void> | void): void => {
    setUiError(null);
    Promise.resolve(operation()).catch((error: unknown) => {
      controller.pause();
      setUiError(error instanceof Error ? error.message : String(error));
    });
  };

  useEffect(() => {
    if (snapshot.playback !== "playing") return;
    const nativeTickRateHz = snapshot.nativeTickRateHz ?? 20;
    const timeout = window.setTimeout(() => {
      perform(() => controller.advancePlaybackTick());
    }, Math.max(1, Math.round(1_000 / nativeTickRateHz / speed)));
    return () => window.clearTimeout(timeout);
  }, [controller, snapshot.currentTick, snapshot.nativeTickRateHz, snapshot.playback, speed]);

  const selectedVariant = snapshot.selection.variant;
  const selectedTarget = snapshot.selection.executionTarget;
  const selectedSegments = props.manifest.presentation.variants
    .find(({ id }) => id === selectedVariant)!
    .segments
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal);
  const isUnavailable = snapshot.playback === "unavailable" || snapshot.playback === "error";
  const isLoading = snapshot.playback === "loading";
  const currentTick = snapshot.currentTick ?? snapshot.segmentStartTick ?? 0;
  const statusMessage = uiError ?? snapshot.message;
  const profile = snapshot.decisionProfile;
  const selectedCombination = props.manifest.presentation.combinations.find((combination) => (
    combination.variant === selectedVariant
    && combination.executionTarget === selectedTarget
  ));
  const selectedDecisionCounts = selectedCombination?.availability === "available"
    ? selectedCombination
    : null;

  const keyboard = (event: ReactKeyboardEvent<HTMLElement>): void => {
    const target = event.target as HTMLElement | null;
    const action = resolveP7bReplayKeyboardAction({
      key: event.key,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      targetTagName: target?.tagName,
      targetIsContentEditable: target?.isContentEditable,
    });
    if (action === null) return;
    event.preventDefault();
    perform(() => runControllerAction(controller, action));
  };

  return (
    <section
      className="player"
      data-autoplay="false"
      data-p7b-replay-player-mounted="true"
      onKeyDown={keyboard}
      tabIndex={0}
    >
      <aside className="player-controls">
        <fieldset data-replay-variant-axis>
          <legend>Replay variant</legend>
          {props.manifest.presentation.variants.map((variant) => (
            <label key={variant.id}>
              <input
                checked={selectedVariant === variant.id}
                disabled={variant.segments.length === 0}
                name="replay-variant"
                onChange={() => perform(() => controller.selectVariant(variant.id))}
                type="radio"
                value={variant.id}
              />
              <span>
                <strong>{variant.label}</strong>
                <small>
                  {variant.description}
                  {variant.segments.length === 0 && " · No certified segments"}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <label htmlFor="execution-target">Execution engine</label>
          <select
            data-execution-target-axis
            id="execution-target"
            onChange={(event) => perform(() => controller.selectExecutionTarget(
              event.target.value as P7bExecutionTargetId,
            ))}
            value={selectedTarget}
          >
            {props.manifest.presentation.executionTargets.map((target) => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
        </div>
        <div className="control-row" aria-label="Replay transport">
          <button
            aria-label="Play replay segment"
            disabled={isUnavailable || isLoading || snapshot.playback === "playing"}
            onClick={() => perform(() => controller.play())}
            type="button"
          >Play</button>
          <button
            aria-label="Pause replay segment"
            disabled={snapshot.playback !== "playing"}
            onClick={() => controller.pause()}
            type="button"
          >Pause</button>
          <button
            aria-label="Restart replay segment"
            disabled={isUnavailable || isLoading}
            onClick={() => perform(() => controller.restartSegment())}
            type="button"
          >Restart</button>
          <button
            aria-label="Advance one native tick"
            disabled={isUnavailable || isLoading || snapshot.playback === "playing"}
            onClick={() => perform(() => controller.stepOneTick())}
            type="button"
          >Step</button>
        </div>
        <div>
          <label htmlFor="replay-position">Replay position</label>
          <input
            disabled={isUnavailable || isLoading || snapshot.segmentStartTick === null}
            id="replay-position"
            max={snapshot.segmentEndTick ?? 0}
            min={snapshot.segmentStartTick ?? 0}
            onChange={(event) => perform(() => controller.seekWithinSegment(Number(event.target.value)))}
            step="1"
            type="range"
            value={currentTick}
          />
        </div>
        <div>
          <label htmlFor="replay-speed">Playback speed</label>
          <select
            id="replay-speed"
            onChange={(event) => setSpeed(Number(event.target.value))}
            value={speed}
          >
            {PLAYER_SPEEDS.map((value) => <option key={value} value={value}>{value}×</option>)}
          </select>
        </div>
        <p className="status" role="status" aria-live="polite">{statusMessage}</p>
        {profile && (
          <p className="clock-readout">
            <strong>{profile.profileId}</strong><br />
            {profile.clockBasis === "portable-decision" ? "Portable decisions" : "Native inputs"}
            {` · ${profile.cadenceHz} Hz; native execution · ${snapshot.nativeTickRateHz} Hz`}
          </p>
        )}
        {selectedDecisionCounts && (
          <p className="decision-count-readout">
            <strong>Decision counts</strong><br />
            {`Authored decisions: ${selectedDecisionCounts.authoredDecisionCount} · Executed decisions: ${selectedDecisionCounts.executedDecisionCount}`}
          </p>
        )}
        <p className="keyboard-hint">
          Focus this player: Space play/pause · . step · R restart · [ / ] segments
        </p>
      </aside>
      <section className="player-stage" aria-labelledby="player-stage-title">
        <h2 id="player-stage-title">{snapshot.segment.title}</h2>
        <div className="player-canvas">
          <MapRenderer
            isLoading={isLoading}
            manifest={props.manifest}
            message={uiError}
            session={snapshot.session}
            target={selectedTarget}
          />
        </div>
        <nav className="segment-list" aria-label="Semantic replay segments">
          {selectedSegments.map((segment) => (
            <button
              aria-current={snapshot.segment.id === segment.id ? "step" : undefined}
              key={segment.id}
              onClick={() => perform(() => controller.selectSegment(segment.id))}
              type="button"
            >
              <span>{segment.ordinal}</span>{segment.title}
              {snapshot.segment.id === segment.id && snapshot.segmentStartTick !== null && (
                <small>{`native ${snapshot.segmentStartTick}–${snapshot.segmentEndTick}`}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="control-row">
          <button
            aria-label="Previous replay segment"
            disabled={snapshot.segmentIndex === 0}
            onClick={() => perform(() => controller.selectAdjacentSegment(-1))}
            type="button"
          >Previous segment</button>
          <button
            aria-label="Next replay segment"
            disabled={snapshot.segmentIndex === snapshot.segmentCount - 1}
            onClick={() => perform(() => controller.selectAdjacentSegment(1))}
            type="button"
          >Next segment</button>
        </div>
      </section>
    </section>
  );
}
