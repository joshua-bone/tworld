import type { ReplayTransferPort } from "@application/ports/ReplayTransfer";
import type { InteractiveGameSession } from "@application/ports/InteractiveGameEngine";
import type { SeriesLevel } from "@domain/series";
import { buildReplayExport } from "@application/use-cases/buildReplayExport";

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
