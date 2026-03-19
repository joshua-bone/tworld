import { useEffect, useState } from "react";
import { createBrowserAppServices } from "@player-web/compose/createBrowserAppServices";
import type { LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import {
  pathForShellMode,
  resolveShellModeFromPathname,
} from "@player-web/impl/appPaths";
import { ModernPlayerApp } from "@player-web/impl/modern/ModernPlayerApp";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import type { BrowserUiMode } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

const services = createBrowserAppServices();
const APP_BASE_URL = import.meta.env.BASE_URL;

export function App() {
  const [shellMode, setShellMode] = useState<BrowserUiMode>(() =>
    resolveShellModeFromPathname(window.location.pathname, APP_BASE_URL),
  );
  const [classicState, setClassicState] = useState<{
    initialMode: LegacyMode;
    initialSelection: PlayableSelection | null;
    token: number;
  } | null>(null);

  useEffect(() => {
    const handlePopState = () => {
      setShellMode(resolveShellModeFromPathname(window.location.pathname, APP_BASE_URL));
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigateToShell = (nextMode: BrowserUiMode) => {
    const nextPath = pathForShellMode(nextMode, APP_BASE_URL);
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ shellMode: nextMode }, "", nextPath);
    }
    setShellMode(nextMode);
  };

  if (shellMode === "modern") {
    return (
      <ModernPlayerApp
        onOpenClassic={() => {
          setClassicState((current) => ({
            initialMode: "series-list",
            initialSelection: null,
            token: (current?.token ?? 0) + 1,
          }));
          navigateToShell("classic");
        }}
        services={services}
      />
    );
  }

  const resolvedClassicState = classicState ?? {
    initialMode: "series-list" as LegacyMode,
    initialSelection: null,
    token: 0,
  };

  return (
    <div className="modern-classic-shell">
      <div className="modern-classic-banner">
        <div>
          <p className="modern-classic-banner__eyebrow">Classic</p>
          <h1 className="modern-classic-banner__title">Original interface, still available</h1>
          <p className="modern-classic-banner__body">
            This is the preserved legacy shell. Local progress, imported DATs, and replays stay shared with Tile World Online.
          </p>
        </div>
        <div className="modern-classic-banner__controls">
          <button
            className="modern-link-button modern-link-button--light"
            onClick={() => {
              setClassicState(null);
              navigateToShell("modern");
            }}
            type="button"
          >
            Return to Tile World Online
          </button>
        </div>
      </div>
      <PlayerApp
        initialMode={resolvedClassicState.initialMode}
        initialSelection={resolvedClassicState.initialSelection}
        key={`${resolvedClassicState.token}:${resolvedClassicState.initialMode}:${resolvedClassicState.initialSelection?.seriesFile ?? "classic"}`}
        services={services}
      />
    </div>
  );
}
