import type { SeriesCatalogEntry } from "@content/api/series";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export function interactiveEngineForRuleset(
  ruleset: SeriesCatalogEntry["ruleset"],
  engines: BrowserAppServices["engines"],
): InteractiveGameEnginePort {
  if (ruleset === "None") {
    throw new Error("This series does not declare a playable ruleset.");
  }

  const engine = engines[ruleset];
  if (!engine) {
    throw new Error(`No interactive engine is registered for ${ruleset}.`);
  }
  return engine;
}

/**
 * The classic MS/Lynx engines own the shared TWS replay contract. Hybrid
 * engines opt in only by declaring the complete native replay capability;
 * this keeps the still-playable v0 host from exposing controls its adapter
 * cannot execute while allowing v1 to use opaque HCR1 bytes.
 */
export function interactiveEngineSupportsReplay(
  ruleset: SeriesCatalogEntry["ruleset"],
  engines: BrowserAppServices["engines"],
): boolean {
  if (ruleset === "None") return false;
  if (ruleset === "MS" || ruleset === "Lynx") return true;

  const engine = engines[ruleset];
  return Boolean(
    engine?.opaqueReplayFormat &&
    engine.startOpaqueReplaySession &&
    engine.validateOpaqueReplay &&
    engine.exportOpaqueReplay,
  );
}

export async function disposePlayerAppSession(
  sessionToDispose: InteractiveGameSession | null,
  engines: BrowserAppServices["engines"],
): Promise<void> {
  if (!sessionToDispose) {
    return;
  }

  const engine = interactiveEngineForRuleset(sessionToDispose.request.ruleset, engines);
  await engine.disposeSession?.(sessionToDispose);
}

export function canResumeInteractiveHistoryTimeline(
  session: InteractiveGameSession | null,
  enableRewindAndResume: boolean,
): boolean {
  return Boolean(
    session?.history.enabled &&
      enableRewindAndResume &&
      session.history.restoreMode === "restored-paused" &&
      session.history.latestTick > session.history.currentTick,
  );
}
