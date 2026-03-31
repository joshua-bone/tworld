import type {
  InteractiveGameGridPosition,
  InteractiveGameSessionEndCause,
  InteractiveGameSessionResultSummary,
  InteractiveGameSessionRunState,
  InteractiveGameSessionScoreSummary,
} from "@game-runtime/ports/InteractiveGameEngine";
import { MS_GRID_WIDTH, MS_TICKS_PER_SECOND, MS_TILE, msCreatureId } from "@ruleset-ms/api/tiles";

function timedSecondsElapsed(currentTime: number): number {
  return Math.floor(Math.max(currentTime, 0) / MS_TICKS_PER_SECOND);
}

export function formatInteractiveTickSeconds(tick: number): string {
  const absoluteSeconds = (Math.abs(tick) / MS_TICKS_PER_SECOND).toFixed(2);
  const trimmed =
    absoluteSeconds.replace(/\.00$/u, ".0").replace(/(\.\d*[1-9])0$/u, "$1");
  return tick < 0 ? `-${trimmed}` : trimmed;
}

export function boardPositionToGridPosition(pos: number, z = 1): InteractiveGameGridPosition {
  return {
    x: (pos % MS_GRID_WIDTH) + 1,
    y: Math.floor(pos / MS_GRID_WIDTH) + 1,
    z,
  };
}

export function describeMsActorName(tileId: number): string | null {
  switch (msCreatureId(tileId)) {
    case MS_TILE.Block:
      return "block";
    case MS_TILE.IceBlock:
      return "ice block";
    case MS_TILE.Tank:
      return "tank";
    case MS_TILE.Ball:
      return "ball";
    case MS_TILE.Glider:
      return "glider";
    case MS_TILE.Fireball:
      return "fireball";
    case MS_TILE.Walker:
      return "walker";
    case MS_TILE.Blob:
      return "blob";
    case MS_TILE.Teeth:
      return "teeth";
    case MS_TILE.Bug:
      return "bug";
    case MS_TILE.Paramecium:
      return "paramecium";
    default:
      return null;
  }
}

export function buildInteractiveSessionScoreSummary(
  levelNumber: number,
  timelimitTicks: number,
  currentTime: number,
  undoUsedCount: number,
): InteractiveGameSessionScoreSummary {
  const baseScore = levelNumber * 500;
  const timeBonus =
    timelimitTicks > 0
      ? Math.max(0, 10 * (Math.floor(timelimitTicks / MS_TICKS_PER_SECOND) - timedSecondsElapsed(currentTime)))
      : 0;
  const rawScore = baseScore + timeBonus;
  const undoPenaltyApplied = undoUsedCount > 0;

  return {
    baseScore,
    timeBonus,
    undoPenaltyApplied,
    undoPenaltyMultiplier: undoPenaltyApplied ? 0.5 : 1,
    finalScore: undoPenaltyApplied ? Math.floor(rawScore / 2) : rawScore,
  };
}

export function buildInteractiveFailureCause(params: {
  actorId?: number | null;
  actorName?: string | null;
  kind: InteractiveGameSessionEndCause["kind"];
  message: string;
  position?: InteractiveGameGridPosition | null;
  tileId?: number | null;
}): InteractiveGameSessionEndCause {
  return {
    kind: params.kind,
    message: params.message,
    position: params.position ?? null,
    actorId: params.actorId ?? null,
    actorName: params.actorName ?? null,
    tileId: params.tileId ?? null,
  };
}

export function buildCompletedRunState(
  levelNumber: number,
  timelimitTicks: number,
  currentTime: number,
  undoUsedCount: number,
  endPosition: InteractiveGameGridPosition | null,
  replayAvailable: boolean,
): InteractiveGameSessionRunState {
  return {
    undoUsedCount,
    replayAvailable,
    result: {
      outcome: undoUsedCount > 0 ? "completed-with-undo" : "completed-clean",
      endPosition,
      cause: null,
      score: buildInteractiveSessionScoreSummary(levelNumber, timelimitTicks, currentTime, undoUsedCount),
    },
  };
}

export function buildFailedRunState(
  undoUsedCount: number,
  cause: InteractiveGameSessionEndCause | null,
  endPosition: InteractiveGameGridPosition | null,
  replayAvailable: boolean,
): InteractiveGameSessionRunState {
  return {
    undoUsedCount,
    replayAvailable,
    result: {
      outcome: "failed",
      endPosition,
      cause,
      score: null,
    },
  };
}

export function buildLiveRunState(undoUsedCount: number, replayAvailable: boolean): InteractiveGameSessionRunState {
  return {
    undoUsedCount,
    replayAvailable,
    result: null,
  };
}

export function isCompletedRunResult(
  result: InteractiveGameSessionResultSummary | null,
): result is InteractiveGameSessionResultSummary & {
  outcome: "completed-clean" | "completed-with-undo";
} {
  return result?.outcome === "completed-clean" || result?.outcome === "completed-with-undo";
}
