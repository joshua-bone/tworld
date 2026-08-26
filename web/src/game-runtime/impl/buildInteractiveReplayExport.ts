import { buildReplayExport } from "@game-runtime/impl/buildReplayExport";
import type { SeriesLevel } from "@content/api/series";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { ReplayTransferArtifact } from "@game-runtime/ports/ReplayTransfer";

export async function buildInteractiveReplayExport(
  engine: Pick<InteractiveGameEnginePort, "exportOpaqueReplay">,
  seriesFile: string,
  level: SeriesLevel,
  session: InteractiveGameSession,
): Promise<ReplayTransferArtifact | null> {
  if (!engine.exportOpaqueReplay) {
    return buildReplayExport(seriesFile, level, session);
  }

  const artifact = await engine.exportOpaqueReplay(session);
  if (!artifact) {
    return null;
  }

  return {
    format: artifact.format,
    bytes: artifact.bytes,
    filename: artifact.suggestedFilename,
    mimeType: artifact.mimeType,
  };
}
