import { replayTransferCodec } from "@game-core/api/replayTransferCodec";
import type { RulesetName } from "@content/api/ruleset";
import type {
  InteractiveGameEnginePort,
  InteractiveGameReplayLaunch,
} from "@game-runtime/ports/InteractiveGameEngine";

interface StoredInteractiveReplay {
  fileName: string;
  ruleset: Exclude<RulesetName, "None">;
  replayFormat?: string;
  bytes: Uint8Array;
}

export function buildInteractiveReplayLaunch(
  engine: Pick<InteractiveGameEnginePort, "opaqueReplayFormat" | "startReplaySession" | "startOpaqueReplaySession">,
  stored: StoredInteractiveReplay,
): InteractiveGameReplayLaunch {
  if (stored.replayFormat !== undefined) {
    const expectedFormat = engine.opaqueReplayFormat;
    if (!expectedFormat || !engine.startOpaqueReplaySession) {
      throw new Error(`${stored.ruleset} engine does not support native replay playback`);
    }

    const actualFormat = stored.replayFormat;
    if (actualFormat !== expectedFormat) {
      throw new Error(
        `${stored.fileName} uses ${actualFormat}, but the ${stored.ruleset} engine accepts ${expectedFormat}`,
      );
    }

    return {
      kind: "opaque",
      replay: {
        format: actualFormat,
        bytes: stored.bytes,
      },
    };
  }

  const decoded = replayTransferCodec.inspect(stored.bytes);
  if (!decoded) {
    throw new Error(`${stored.fileName} is no longer a valid replay payload.`);
  }

  return {
    kind: "legacy",
    replay: decoded.payload,
  };
}
