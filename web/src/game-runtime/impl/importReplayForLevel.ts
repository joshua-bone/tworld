import type { ReplayTransferPort } from "@player-web/ports/ReplayTransfer";
import type { SeriesLevel } from "@content/api/series";
import { replaySolutionCodec, type DecodedReplaySolution } from "@game-core/api/codec";

export interface ImportedReplay {
  fileName: string;
  bytes: Uint8Array;
  replay: DecodedReplaySolution;
}

function exportedReplayRulesetHint(fileName: string): "MS" | "Lynx" | null {
  const match = fileName.match(/-(MS|Lynx)-\d+(?:-|\.tws\.bin$)/u);
  const ruleset = match?.[1];
  return ruleset === "MS" || ruleset === "Lynx" ? ruleset : null;
}

export async function importReplayForLevel(
  transfer: Pick<ReplayTransferPort, "importReplay">,
  level: Pick<SeriesLevel, "name" | "number" | "password">,
  options: {
    ruleset?: "MS" | "Lynx";
  } = {},
): Promise<ImportedReplay | null> {
  const imported = await transfer.importReplay();
  if (!imported) {
    return null;
  }

  const replay = replaySolutionCodec.inspect(imported.bytes);
  if (!replay) {
    throw new Error(`${imported.name} is not a valid raw replay payload`);
  }

  const rulesetHint = exportedReplayRulesetHint(imported.name);
  if (rulesetHint && options.ruleset && rulesetHint !== options.ruleset) {
    throw new Error(`${imported.name} was exported for ${rulesetHint}, but the current level is ${options.ruleset}`);
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
