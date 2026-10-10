import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { resolveUrlLaunchSelection } from "@player-web/impl/urlLaunch";
import { aiHarnessEnabled, withoutAiFlag } from "@player-web/impl/ai/aiRunPolicy";
import { useEffect, useState } from "react";
import { createBrowserAppServices } from "@player-web/compose/createBrowserAppServices";
import { prewarmLegacyTileset, type LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import {
  pathForShellMode,
  resolveShellModeFromPathname,
  type AppShellMode,
} from "@player-web/impl/appPaths";
import {
  MOBILE_UI_DESKTOP_OVERRIDE_STORAGE_KEY,
  readBrowserMobileShellHeuristics,
  resolveMobileShellRedirect,
  stripMobileShellQueryOverride,
} from "@player-web/impl/mobileShell";
import { MobilePlayerApp } from "@player-web/impl/mobile/MobilePlayerApp";
import { ModernPlayerApp } from "@player-web/impl/modern/ModernPlayerApp";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

const services = createBrowserAppServices();
const APP_BASE_URL = import.meta.env.BASE_URL;

interface AppRouteState {
  hash: string;
  pathname: string;
  search: string;
  shellMode: AppShellMode;
}

function currentRouteState(): AppRouteState {
  return {
    hash: window.location.hash,
    pathname: window.location.pathname,
    search: window.location.search,
    shellMode: resolveShellModeFromPathname(window.location.pathname, APP_BASE_URL),
  };
}

function hasDesktopMobileRedirectOverride(): boolean {
  try {
    return window.localStorage.getItem(MOBILE_UI_DESKTOP_OVERRIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function saveDesktopMobileRedirectOverride(enabled: boolean): void {
  try {
    if (enabled) {
      window.localStorage.setItem(MOBILE_UI_DESKTOP_OVERRIDE_STORAGE_KEY, "1");
      return;
    }
    window.localStorage.removeItem(MOBILE_UI_DESKTOP_OVERRIDE_STORAGE_KEY);
  } catch {
    // Ignore storage failures; the shell should still navigate.
  }
}

export function App() {
  const [routeState, setRouteState] = useState<AppRouteState>(() => currentRouteState());
  const aiEnabled = aiHarnessEnabled(routeState.search);
  const [aiLaunchReady, setAiLaunchReady] = useState(false);
  const [aiLaunchMessage, setAiLaunchMessage] = useState<string | null>(null);
  const [classicState, setClassicState] = useState<{
    initialMode: LegacyMode;
    initialSelection: PlayableSelection | null;
    token: number;
  } | null>(null);

  useEffect(() => {
    if (!aiEnabled) { setAiLaunchReady(false); return; }
    let active = true;
    setAiLaunchReady(false);
    void loadPlayableSelection(services.selectionStore)
      .then((selection) => resolveUrlLaunchSelection(services, selection))
      .then((launch) => {
        if (!active) return;
        setClassicState((previous) => ({ initialMode: launch.overrideApplied ? "game" : "series-list", initialSelection: launch.selection, token: (previous?.token ?? 0) + 1 }));
        setAiLaunchMessage(launch.message); setAiLaunchReady(true);
      }).catch(() => { if (active) { setAiLaunchMessage("Could not restore the launch link. Use the levelset picker below."); setAiLaunchReady(true); } });
    return () => { active = false; };
  }, [aiEnabled, routeState.search, routeState.hash]);

  useEffect(() => {
    const handlePopState = () => {
      setRouteState(currentRouteState());
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    prewarmLegacyTileset("Lynx");
    prewarmLegacyTileset("MS");
  }, []);

  const navigateToShell = (nextMode: AppShellMode, options: { replace?: boolean } = {}) => {
    const nextPath = pathForShellMode(nextMode, APP_BASE_URL);
    const nextSearch = stripMobileShellQueryOverride(window.location.search);
    const nextHash = window.location.hash;
    if (
      window.location.pathname !== nextPath ||
      window.location.search !== nextSearch ||
      window.location.hash !== nextHash
    ) {
      const nextUrl = `${nextPath}${nextSearch}${nextHash}`;
      if (options.replace) {
        window.history.replaceState({ shellMode: nextMode }, "", nextUrl);
      } else {
        window.history.pushState({ shellMode: nextMode }, "", nextUrl);
      }
    }
    setRouteState(currentRouteState());
  };

  useEffect(() => {
    if (aiEnabled) return;
    const redirect = resolveMobileShellRedirect({
      baseUrl: APP_BASE_URL,
      desktopOverride: hasDesktopMobileRedirectOverride(),
      heuristics: readBrowserMobileShellHeuristics(window),
      pathname: routeState.pathname,
      search: routeState.search,
    });
    if (!redirect) {
      return;
    }

    const nextPath = pathForShellMode(redirect.mode, APP_BASE_URL);
    const nextSearch = stripMobileShellQueryOverride(window.location.search);
    if (
      window.location.pathname === nextPath &&
      window.location.search === nextSearch
    ) {
      return;
    }

    if (redirect.mode === "modern") {
      setClassicState(null);
    }
    navigateToShell(redirect.mode, { replace: true });
  }, [routeState.hash, routeState.pathname, routeState.search]);

  const openClassicShell = () => {
    setClassicState((current) => ({
      initialMode: "series-list",
      initialSelection: null,
      token: (current?.token ?? 0) + 1,
    }));
    navigateToShell("classic");
  };

  const openMobileShell = () => {
    saveDesktopMobileRedirectOverride(false);
    setClassicState(null);
    navigateToShell("mobile");
  };

  const openDesktopShell = () => {
    saveDesktopMobileRedirectOverride(true);
    setClassicState(null);
    navigateToShell("modern");
  };

  const openClassicShellFromMobile = () => {
    saveDesktopMobileRedirectOverride(true);
    openClassicShell();
  };

  if (!aiEnabled && routeState.shellMode === "modern") {
    return (
      <ModernPlayerApp
        onOpenClassic={openClassicShell}
        onOpenMobile={openMobileShell}
        services={services}
      />
    );
  }

  if (!aiEnabled && routeState.shellMode === "mobile") {
    return (
      <MobilePlayerApp
        onOpenClassic={openClassicShellFromMobile}
        onOpenDesktop={openDesktopShell}
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
    <div className={`modern-classic-shell${aiEnabled ? " modern-classic-shell--ai" : ""}`}>
      <div className="modern-classic-banner">
        <div>
          {!aiEnabled && <p className="modern-classic-banner__eyebrow">Classic</p>}
          <h1 className="modern-classic-banner__title">{aiEnabled ? "AI play lab" : "Original interface, still available"}</h1>
          <p className="modern-classic-banner__body">
            {aiEnabled ? "Load a level normally, then start the AI. Escape opens the levelset picker." : "This is the preserved legacy shell. Local progress, imported DATs, and replays stay shared with Tile World Online."}
          </p>
        </div>
        <div className="modern-classic-banner__controls">
          {!aiEnabled && <button
            className="modern-link-button"
            onClick={openMobileShell}
            type="button"
          >
            Open Mobile UI
          </button>}
          <button
            className="modern-link-button modern-link-button--light"
            onClick={() => {
              if (aiEnabled) window.location.href = withoutAiFlag(window.location.href); else openDesktopShell();
            }}
            type="button"
          >
            Return to Tile World Online
          </button>
        </div>
      </div>
      {aiLaunchMessage && aiEnabled ? <p role="status">{aiLaunchMessage}</p> : null}
      {aiEnabled && !aiLaunchReady ? <p>Loading level selection…</p> : <PlayerApp
        initialMode={resolvedClassicState.initialMode}
        initialSelection={resolvedClassicState.initialSelection}
        key={`${resolvedClassicState.token}:${resolvedClassicState.initialMode}:${resolvedClassicState.initialSelection?.seriesFile ?? "classic"}`}
        services={services}
        aiHarnessEnabled={aiEnabled}
        debugModeEnabled={aiEnabled ? false : undefined}
        visualEnhancementsEnabled={aiEnabled ? false : undefined}
        inventoryKeyCountLabelsEnabled={aiEnabled ? false : undefined}
      />}
    </div>
  );
}
