import { importReplayForLevel } from "@game-runtime/impl/importReplayForLevel";
import type { SeriesLevel } from "@content/api/series";
import type { GameRequest } from "@game-core/api/types";
import type {
  InteractiveGameEnginePort,
  InteractiveGameReplayLaunch,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { ReplayTransferPort } from "@game-runtime/ports/ReplayTransfer";

export interface ImportedInteractiveReplay {
  fileName: string;
  bytes: Uint8Array;
  format?: string;
  launch: InteractiveGameReplayLaunch;
}

export async function importInteractiveReplayForLevel(
  engine: Pick<
    InteractiveGameEnginePort,
    "opaqueReplayFormat" | "startReplaySession" | "startOpaqueReplaySession" | "validateOpaqueReplay"
  >,
  transfer: Pick<ReplayTransferPort, "importReplay">,
  level: Pick<SeriesLevel, "name" | "number" | "password">,
  options: {
    request: GameRequest;
  },
): Promise<ImportedInteractiveReplay | null> {
  if (!engine.opaqueReplayFormat) {
    const legacyRuleset = options.request.ruleset === "MS" || options.request.ruleset === "Lynx"
      ? options.request.ruleset
      : undefined;
    const imported = await importReplayForLevel(
      transfer,
      level,
      legacyRuleset ? { ruleset: legacyRuleset } : {},
    );
    if (!imported) {
      return null;
    }

    return {
      fileName: imported.fileName,
      bytes: imported.bytes,
      launch: {
        kind: "legacy",
        replay: imported.replay.payload,
      },
    };
  }

  if (!engine.startOpaqueReplaySession || !engine.validateOpaqueReplay) {
    throw new Error(`${options.request.ruleset} engine does not support native replay import`);
  }

  const imported = await transfer.importReplay();
  if (!imported) {
    return null;
  }

  const replay = {
    format: engine.opaqueReplayFormat,
    bytes: imported.bytes,
  };
  await engine.validateOpaqueReplay(options.request, replay);

  return {
    fileName: imported.name,
    bytes: imported.bytes,
    format: engine.opaqueReplayFormat,
    launch: {
      kind: "opaque",
      replay,
    },
  };
}
