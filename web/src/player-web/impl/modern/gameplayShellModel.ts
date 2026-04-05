import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { SeriesLevel } from "@content/api/series";
import { formatInteractiveTickSeconds } from "@game-runtime/impl/interactiveSessionRun";
import { MS_STATUS_FLAG } from "@ruleset-ms/api/tiles";

export interface HistoryJumpOption {
  label: string;
  targetTick: number;
}

export function formatGameplayTimeLeft(session: InteractiveGameSession): string {
  const { timelimit, currentTime } = session.frame.snapshot;
  if (timelimit <= 0) {
    return "---";
  }

  const remainingTicks = Math.max(0, timelimit - Math.max(currentTime, 0));
  return String(Math.ceil(remainingTicks / 20));
}

export function describeGameplayStatus(
  session: InteractiveGameSession | null,
  isSessionLoading: boolean,
): string {
  if (isSessionLoading) {
    return "Loading";
  }
  if (!session) {
    return "Idle";
  }

  const status = session.frame.snapshot.status;
  if (status === "completed") {
    return "Completed";
  }
  if (status === "failed") {
    return "Failed";
  }
  if (session.mode === "replay") {
    return "Replay";
  }
  if (session.history.restoreMode === "restored-paused") {
    return "Rewound";
  }
  if (session.history.restoreMode === "replaying-history") {
    return "Replaying";
  }
  return "Playing";
}

export function describeGameplayHint(
  session: InteractiveGameSession | null,
  level: SeriesLevel | null,
): string | null {
  if (!session || !level) {
    return null;
  }

  const snapshot = session.frame.snapshot;
  if ((snapshot.statusFlags & MS_STATUS_FLAG.Invalid) !== 0) {
    return "This level cannot be played.";
  }
  if (snapshot.currentTime < 0 && level.unsolvable) {
    return level.unsolvable.length > 0
      ? `This level is reported to be unsolvable: ${level.unsolvable}.`
      : "This level is reported to be unsolvable.";
  }
  if ((snapshot.statusFlags & MS_STATUS_FLAG.ShowHint) !== 0 && session.hintText) {
    return session.hintText;
  }
  if (snapshot.status === "completed") {
    return "Level Completed";
  }
  if (snapshot.status === "failed") {
    return "Chip died";
  }

  return null;
}

export function activeGameplayHintOverlay(session: InteractiveGameSession | null): string | null {
  if (!session) {
    return null;
  }

  return (session.frame.snapshot.statusFlags & MS_STATUS_FLAG.ShowHint) !== 0 && session.hintText ? session.hintText : null;
}

export function buildHistoryJumpOptions(session: InteractiveGameSession | null): HistoryJumpOption[] {
  if (!session || !session.history.enabled) {
    return [];
  }

  const currentTick = session.history.currentTick;
  const uniqueTicks = [...new Set(session.history.checkpointTicks ?? [])]
    .filter((tick) => tick !== currentTick)
    .sort((left, right) => right - left);

  return uniqueTicks.map((tick) => ({
    targetTick: tick,
    label: tick === 0 ? "Start (0.0s)" : `Checkpoint ${formatInteractiveTickSeconds(tick)}s`,
  }));
}

export function parseHistoryTickInput(raw: string, latestTick: number): number | null {
  if (raw.trim().length === 0) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return Math.min(parsed, latestTick);
}
