import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  transformTransitionDurationSeconds,
  type BrowserSpecialModesSettings,
  type DihedralOrientation,
} from "@player-web/impl/specialModesSettings";
import {
  composeDihedralOrientation,
  seededTransformAt,
  transformGameplayRate,
  transformTransitionPhaseAt,
  type TransformTransitionPhase,
} from "@player-web/impl/specialModesTransform";

const GAME_TICKS_PER_SECOND = 20;
const WARNING_SECONDS = [3, 2, 1] as const;
const WARNING_SHAKE_DURATION_MS = 360;

export interface SpecialModesTransitionPresentation {
  from: DihedralOrientation;
  to: DihedralOrientation;
  progress: number;
  phase: TransformTransitionPhase;
  phaseProgress: number;
}

export interface SpecialModesRuntimeSnapshot {
  orientation: DihedralOrientation;
  transition: SpecialModesTransitionPresentation | null;
  warningSeconds: number | null;
  warningShakeOffsetPx: number;
  revision: number;
}

interface ActiveTransition {
  from: DihedralOrientation;
  to: DihedralOrientation;
  startedAtMs: number;
  durationMs: number;
  switched: boolean;
}

interface UseSpecialModesRuntimeOptions {
  enabled: boolean;
  isActiveGameplay: boolean;
  liveSessionRef: Readonly<MutableRefObject<InteractiveGameSession | null>>;
  settings: BrowserSpecialModesSettings["transform"];
}

interface UseSpecialModesRuntimeResult {
  gameplayRateRef: Readonly<MutableRefObject<number>>;
  inputOrientation: DihedralOrientation;
  inputOrientationEpoch: number;
  inputFrozen: boolean;
  runtimeRef: Readonly<MutableRefObject<SpecialModesRuntimeSnapshot>>;
}

function warningShakeOffset(nowMs: number, startedAtMs: number): number {
  const progress = (nowMs - startedAtMs) / WARNING_SHAKE_DURATION_MS;
  if (progress < 0 || progress >= 1) {
    return 0;
  }
  return Math.sin(progress * Math.PI * 6) * 5 * (1 - progress);
}

export function useSpecialModesRuntime({
  enabled,
  isActiveGameplay,
  liveSessionRef,
  settings,
}: UseSpecialModesRuntimeOptions): UseSpecialModesRuntimeResult {
  const gameplayRateRef = useRef(1);
  const runtimeRef = useRef<SpecialModesRuntimeSnapshot>({
    orientation: "identity",
    transition: null,
    warningSeconds: null,
    warningShakeOffsetPx: 0,
    revision: 0,
  });
  const [inputOrientation, setInputOrientation] = useState<DihedralOrientation>("identity");
  const [inputOrientationEpoch, setInputOrientationEpoch] = useState(0);
  const [inputFrozen, setInputFrozen] = useState(false);
  const nextTransformTickRef = useRef<number | null>(null);
  const transformIndexRef = useRef(0);
  const transitionRef = useRef<ActiveTransition | null>(null);
  const warningShakeStartedAtRef = useRef<number | null>(null);
  const lastWarningSecondsRef = useRef<number | null>(null);

  const resetRuntime = useEffectEvent(() => {
    gameplayRateRef.current = 1;
    nextTransformTickRef.current = null;
    transformIndexRef.current = 0;
    transitionRef.current = null;
    warningShakeStartedAtRef.current = null;
    lastWarningSecondsRef.current = null;
    runtimeRef.current = {
      orientation: "identity",
      transition: null,
      warningSeconds: null,
      warningShakeOffsetPx: 0,
      revision: runtimeRef.current.revision + 1,
    };
    setInputOrientation("identity");
    setInputFrozen(false);
    setInputOrientationEpoch((current) => current + 1);
  });

  useEffect(() => {
    resetRuntime();
  }, [
    enabled,
    liveSessionRef.current?.handle,
    settings.allowedRandomTransforms.join(","),
    settings.intervalSeconds,
    settings.seed,
    settings.strategy,
    settings.transitionSpeed,
  ]);

  useEffect(() => {
    if (!enabled) {
      gameplayRateRef.current = 1;
      return;
    }

    let animationFrameId = 0;
    const update = (nowMs: number) => {
      const session = liveSessionRef.current;
      const active = Boolean(
        isActiveGameplay &&
        session?.mode === "manual" &&
        session.frame.snapshot.status === "playing",
      );
      const currentTick = session?.frame.snapshot.tick ?? 0;
      let transition = transitionRef.current;

      if (!active && !transition) {
        gameplayRateRef.current = 1;
        nextTransformTickRef.current = null;
      } else if (!transition) {
        if (nextTransformTickRef.current === null) {
          nextTransformTickRef.current = currentTick + settings.intervalSeconds * GAME_TICKS_PER_SECOND;
        }

        const remainingTicks = Math.max(0, nextTransformTickRef.current - currentTick);
        const warningSeconds = Math.ceil(remainingTicks / GAME_TICKS_PER_SECOND);
        if (
          WARNING_SECONDS.includes(warningSeconds as typeof WARNING_SECONDS[number]) &&
          warningSeconds !== lastWarningSecondsRef.current
        ) {
          warningShakeStartedAtRef.current = nowMs;
          lastWarningSecondsRef.current = warningSeconds;
        }

        if (currentTick >= nextTransformTickRef.current) {
          const operation = settings.strategy === "random"
            ? seededTransformAt(
                settings.seed,
                transformIndexRef.current,
                settings.allowedRandomTransforms,
              )
            : settings.strategy;
          const from = runtimeRef.current.orientation;
          const to = composeDihedralOrientation(from, operation);
          transition = {
            from,
            to,
            startedAtMs: nowMs,
            durationMs: transformTransitionDurationSeconds(settings.transitionSpeed) * 1000,
            switched: false,
          };
          transformIndexRef.current += 1;
          transitionRef.current = transition;
          warningShakeStartedAtRef.current = null;
          lastWarningSecondsRef.current = null;
        }
      }

      let transitionPresentation: SpecialModesTransitionPresentation | null = null;
      if (transition) {
        const progress = Math.max(0, Math.min(1, (nowMs - transition.startedAtMs) / transition.durationMs));
        const { phase, phaseProgress } = transformTransitionPhaseAt(progress);
        transitionPresentation = {
          from: transition.from,
          to: transition.to,
          progress,
          phase,
          phaseProgress,
        };
        gameplayRateRef.current = transformGameplayRate(progress);
        if ((phase === "viewport-transform" || phase === "artwork-normalize") && !transition.switched) {
          setInputFrozen(true);
        }
        if (phase === "speed-up" && !transition.switched) {
          transition.switched = true;
          runtimeRef.current.orientation = transition.to;
          setInputOrientation(transition.to);
          setInputFrozen(false);
          setInputOrientationEpoch((current) => current + 1);
        }

        if (progress >= 1) {
          gameplayRateRef.current = 1;
          transitionRef.current = null;
          transitionPresentation = null;
          nextTransformTickRef.current = currentTick + settings.intervalSeconds * GAME_TICKS_PER_SECOND;
        }
      }

      const shakeStartedAt = warningShakeStartedAtRef.current;
      const shakeOffset = shakeStartedAt === null ? 0 : warningShakeOffset(nowMs, shakeStartedAt);
      if (shakeStartedAt !== null && nowMs - shakeStartedAt >= WARNING_SHAKE_DURATION_MS) {
        warningShakeStartedAtRef.current = null;
      }
      const nextWarningSeconds = nextTransformTickRef.current === null || transitionPresentation
        ? null
        : Math.ceil(Math.max(0, nextTransformTickRef.current - currentTick) / GAME_TICKS_PER_SECOND);
      const previousRuntime = runtimeRef.current;
      const needsAnimatedRedraw =
        transitionPresentation !== null ||
        previousRuntime.transition !== null ||
        shakeStartedAt !== null;
      runtimeRef.current = {
        orientation: previousRuntime.orientation,
        transition: transitionPresentation,
        warningSeconds: WARNING_SECONDS.includes(nextWarningSeconds as typeof WARNING_SECONDS[number])
          ? nextWarningSeconds
          : null,
        warningShakeOffsetPx: shakeOffset,
        revision: previousRuntime.revision + (needsAnimatedRedraw ? 1 : 0),
      };

      animationFrameId = window.requestAnimationFrame(update);
    };

    animationFrameId = window.requestAnimationFrame(update);
    return () => {
      window.cancelAnimationFrame(animationFrameId);
      gameplayRateRef.current = 1;
    };
  }, [enabled, isActiveGameplay, liveSessionRef, settings]);

  return {
    gameplayRateRef,
    inputOrientation,
    inputOrientationEpoch,
    inputFrozen,
    runtimeRef,
  };
}
