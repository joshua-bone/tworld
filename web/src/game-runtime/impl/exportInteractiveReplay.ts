import type { ReplayTransferPort } from "@game-runtime/ports/ReplayTransfer";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { SeriesLevel } from "@content/api/series";
import { buildReplayExport } from "@game-runtime/impl/buildReplayExport";

export async function exportInteractiveReplay(
  transfer: Pick<ReplayTransferPort, "exportReplay">,
  seriesFile: string,
  level: SeriesLevel,
  session: InteractiveGameSession,
): Promise<void> {
  const artifact = buildReplayExport(seriesFile, level, session);
  if (!artifact) {
    throw new Error("no replay data is available for export yet");
  }

  await transfer.exportReplay(artifact);
}
