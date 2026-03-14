import type { EngineTimer } from "@domain/game/model";

export function timerSecondsPlayed(timer: EngineTimer, ticksPerSecond: number): number {
  return Math.trunc((timer.currentTime + timer.timeOffset) / ticksPerSecond);
}

export function syncTimerSecondsPlayed(timer: EngineTimer, ticksPerSecond: number): EngineTimer {
  return {
    ...timer,
    secondsPlayed: timerSecondsPlayed(timer, ticksPerSecond),
  };
}

export function advanceTimer(timer: EngineTimer, tickDelta: number, ticksPerSecond: number): EngineTimer {
  return syncTimerSecondsPlayed(
    {
      ...timer,
      tick: timer.tick + tickDelta,
      currentTime: timer.currentTime + tickDelta,
    },
    ticksPerSecond,
  );
}
