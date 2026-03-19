import type { ReplayTransferPort } from "@player-web/ports/ReplayTransfer";
import type { SeriesLevel } from "@content/api/series";
import { replaySolutionCodec, type DecodedReplaySolution } from "@game-core/api/codec";

export interface ImportedReplay {
  fileName: string;
  bytes: Uint8Array;
  replay: DecodedReplaySolution;
}

export async function importReplayForLevel(
  transfer: Pick<ReplayTransferPort, "importReplay">,
  level: Pick<SeriesLevel, "name" | "number" | "password">,
): Promise<ImportedReplay | null> {
  const imported = await transfer.importReplay();
  if (!imported) {
    return null;
  }

  const replay = replaySolutionCodec.inspect(imported.bytes);
  if (!replay) {
    throw new Error(`${imported.name} is not a valid raw replay payload`);
  }

  if (replay.levelNumber !== level.number || replay.password !== level.password) {
    throw new Error(`${imported.name} does not match level ${level.number}: ${level.name}`);
  }

  return {
    fileName: imported.name,
    bytes: imported.bytes,
    replay,
  };
}
