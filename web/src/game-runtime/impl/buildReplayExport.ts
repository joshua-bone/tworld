import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { SeriesLevel } from "@content/api/series";
import { getGameInputCode, normalizeGameInputName } from "@game-core/api/command";
import { replayTransferCodec } from "@game-core/api/replayTransferCodec";
import { formatInteractiveTickSeconds } from "@game-runtime/impl/interactiveSessionRun";

export interface ReplayExportArtifact {
  bytes: Uint8Array;
  filename: string;
}

function buildReplaySetLabel(seriesFile: string): string {
  return seriesFile.replace(/\.dac$/iu, "").replace(/(?:\.dat)?-(ms|lynx)$/iu, "");
}

function buildReplayOutcomeLabel(session: InteractiveGameSession): string {
  const outcome = session.run.result?.outcome;
  if (outcome === "completed-clean" || outcome === "completed-with-undo") {
    return "win";
  }

  if (outcome === "failed") {
    return "lose";
  }

  return "live";
}

export function buildReplayExport(
  seriesFile: string,
  level: SeriesLevel,
  session: InteractiveGameSession,
): ReplayExportArtifact | null {
  const recordedMoves = session.recordedMoves ?? [];
  if (recordedMoves.length === 0) {
    return null;
  }

  const randomSlideInput = normalizeGameInputName(session.frame.snapshot.initRandomSlideDir) ?? "north";
  const encoded = replayTransferCodec.encode(level.number, level.password, Math.max(session.frame.snapshot.currentTime, 0), {
    flags: 0,
    randomSlideDirection: getGameInputCode(randomSlideInput),
    stepping: session.frame.snapshot.stepping,
    randomSeed: Number(session.frame.snapshot.randomState.main.initial),
    moves: recordedMoves.map((move) => ({ when: move.when, dir: move.dir })),
    modifierMasks: recordedMoves.map((move) => move.modifierMask ?? 0),
  });

  return {
    bytes: encoded.bytes,
    filename: `${buildReplaySetLabel(seriesFile)}-${session.request.ruleset}-${level.number}-${buildReplayOutcomeLabel(session)}-${formatInteractiveTickSeconds(Math.max(session.frame.snapshot.currentTime, 0))}.${encoded.extension}`,
  };
}
