import { parseSolutionFile } from "@content/api/solution-file";
import type { SeriesCatalogEntry } from "@content/api/series";
import { importReplayForLevel } from "@game-runtime/impl/importReplayForLevel";
import type { InteractiveGameReplayLaunch } from "@game-runtime/ports/InteractiveGameEngine";
import { buildAppHref } from "@player-web/impl/appPaths";
import type { UrlLaunchResolution } from "@player-web/impl/urlLaunch";
import { parseUrlLaunchRequest } from "@player-web/impl/urlLaunchRequest";

export interface UrlReplayLaunch {
  seriesFile: string;
  levelNumber: number;
  replayName: string;
  launch: InteractiveGameReplayLaunch;
  token: number;
}

/** Resolve a full native TWS after the URL's catalog selection is available. */
export async function resolveUrlReplayLaunch(
  resolution: UrlLaunchResolution,
  catalog: readonly SeriesCatalogEntry[],
  {
    location = window.location,
    baseUrl = import.meta.env.BASE_URL,
  }: {
    location?: Pick<Location, "hash" | "search" | "origin">;
    baseUrl?: string;
  } = {},
): Promise<{ replay: UrlReplayLaunch | null; message: string | null }> {
  const request = parseUrlLaunchRequest(location);
  if (!request?.replayUrl || !resolution.overrideApplied || !resolution.selection) {
    return { replay: null, message: resolution.message };
  }

  try {
    const selection = resolution.selection;
    const series = catalog.find((entry) => entry.filebase === selection.seriesFile);
    const level = series?.levels.find((entry) => entry.number === selection.levelNumber);
    if (!series || !level) {
      throw new Error(`Level ${selection.levelNumber} was not found in the requested set.`);
    }
    if (series.ruleset !== request.ruleset || (series.ruleset !== "MS" && series.ruleset !== "Lynx")) {
      throw new Error(`The requested replay ruleset ${request.ruleset} does not match ${series.ruleset}.`);
    }

    // Resolve relative assets consistently from both / and /mobile routes.
    const url = new URL(request.replayUrl, new URL(buildAppHref("/", baseUrl), location.origin));
    if (url.origin !== location.origin || !["http:", "https:"].includes(url.protocol)) {
      throw new Error("Replay URLs must use the same origin as the player.");
    }
    const response = await fetch(url.toString(), { redirect: "error", signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Failed to download replay: ${response.status}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const file = parseSolutionFile(bytes);
    if (file.ruleset !== series.ruleset) {
      throw new Error(`Replay uses ${file.ruleset}, but the requested level is ${series.ruleset}.`);
    }
    const entry = file.entries.find((candidate) => candidate.levelNumber === level.number && candidate.password === level.password);
    if (!entry?.solutionData || !entry.expandedSolution) {
      throw new Error(`Replay does not match level ${level.number}: ${level.name}, or has no recorded moves.`);
    }
    const replayName = url.pathname.split("/").at(-1) || "Replay.tws";
    const imported = await importReplayForLevel(
      { importReplay: async () => ({ name: replayName, bytes: entry.solutionData! }) },
      level,
      { ruleset: series.ruleset },
    );
    if (!imported) {
      throw new Error("Replay could not be loaded.");
    }
    return {
      message: null,
      replay: { ...selection, replayName, token: 0, launch: { kind: "legacy", replay: imported.replay.payload } },
    };
  } catch (error: unknown) {
    return { replay: null, message: `Unable to open replay: ${error instanceof Error ? error.message : String(error)}` };
  }
}
