import type { InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { SeriesLevel } from "@domain/series";
import { getGameInputCode, normalizeGameInputName } from "@domain/game/command";
import { replaySolutionCodec } from "@domain/game/codec";

export interface ReplayExportArtifact {
  bytes: Uint8Array;
  filename: string;
}

export function buildReplayExport(
  seriesFile: string,
  level: SeriesLevel,
  session: InteractiveGameSession,
): ReplayExportArtifact | null {
  if (session.recordedMoves.length === 0) {
    return null;
  }

  const randomSlideInput = normalizeGameInputName(session.frame.snapshot.initRandomSlideDir) ?? "north";
  const bytes = replaySolutionCodec.encode(level.number, level.password, Math.max(session.frame.snapshot.currentTime, 0), {
    flags: 0,
    randomSlideDirection: getGameInputCode(randomSlideInput),
    stepping: session.frame.snapshot.stepping,
    randomSeed: Number(session.frame.snapshot.randomState.main.initial),
    moves: session.recordedMoves.map((move) => ({ ...move })),
  });

  return {
    bytes,
    filename: `${seriesFile.replace(/\.dac$/i, "")}-level-${level.number}.tws.bin`,
  };
}
