import type { EngineTimer } from "@game-core/api/model";
import type { GameSnapshot } from "@game-core/api/types";

export function createInitialEngineTimer(timeLimit: number): EngineTimer {
  return {
    tick: -1,
    currentTime: -1,
    timeOffset: 0,
    secondsPlayed: 0,
    timeLimit,
  };
}

export function snapshotToEngineTimer(snapshot: GameSnapshot): EngineTimer {
  return {
    tick: snapshot.tick,
    currentTime: snapshot.currentTime,
    timeOffset: snapshot.timeOffset,
    secondsPlayed: snapshot.secondsPlayed,
    timeLimit: snapshot.timelimit,
  };
}

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
