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
  const [classicState, setClassicState] = useState<{
    initialMode: LegacyMode;
    initialSelection: PlayableSelection | null;
    token: number;
  } | null>(null);

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

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(() => {
        prewarmLegacyTileset("MS");
      });
      return () => {
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = globalThis.setTimeout(() => {
      prewarmLegacyTileset("MS");
    }, 500);
    return () => {
      globalThis.clearTimeout(timeoutId);
    };
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

  if (routeState.shellMode === "modern") {
    return (
      <ModernPlayerApp
        onOpenClassic={openClassicShell}
        onOpenMobile={openMobileShell}
        services={services}
      />
    );
  }

  if (routeState.shellMode === "mobile") {
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
            className="modern-link-button"
            onClick={openMobileShell}
            type="button"
          >
            Open Mobile UI
          </button>
          <button
            className="modern-link-button modern-link-button--light"
            onClick={() => {
              openDesktopShell();
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
