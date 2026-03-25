import { startTransition, useEffect, useState } from "react";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import { loadModernBootstrapPlayableCatalog } from "@player-web/impl/loadBrowserPlayableCatalog";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { resolveUrlLaunchSelection } from "@player-web/impl/urlLaunch";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { SeriesCatalogEntry } from "@content/api/series";

interface MobilePlayerAppProps {
  onOpenClassic: () => void;
  onOpenDesktop: () => void;
  services: BrowserAppServices;
}

interface MobileBootstrapState {
  catalog: SeriesCatalogEntry[];
  message: string | null;
  ready: boolean;
  selection: PlayableSelection | null;
}

export function MobilePlayerApp({
  onOpenClassic,
  onOpenDesktop,
  services,
}: MobilePlayerAppProps) {
  const [bootstrapState, setBootstrapState] = useState<MobileBootstrapState>({
    catalog: [],
    message: null,
    ready: false,
    selection: null,
  });

  useEffect(() => {
    let active = true;

    loadPlayableSelection(services.selectionStore)
      .then(async (storedSelection) => {
        const launch = await resolveUrlLaunchSelection(services, storedSelection);
        const catalog = await loadModernBootstrapPlayableCatalog(services, launch.selection);
        if (!active) {
          return;
        }

        startTransition(() => {
          setBootstrapState({
            catalog,
            message: launch.message,
            ready: true,
            selection: launch.selection,
          });
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setBootstrapState({
          catalog: [],
          message: error instanceof Error ? error.message : String(error),
          ready: true,
          selection: null,
        });
      });

    return () => {
      active = false;
    };
  }, [services]);

  return (
    <main className="mobile-route-shell">
      {bootstrapState.message ? (
        <section className="mobile-route-shell__notice" role="status">
          {bootstrapState.message}
        </section>
      ) : null}

      <div className="mobile-route-shell__player">
        {bootstrapState.ready ? (
          <PlayerApp
            chromeMode="mobile"
            initialCatalog={bootstrapState.catalog}
            initialMode="game"
            initialSelection={bootstrapState.selection}
            onOpenClassicShell={onOpenClassic}
            onOpenDesktopShell={onOpenDesktop}
            services={services}
          />
        ) : (
          <section className="mobile-route-shell__loading" aria-live="polite" role="status">
            <p className="modern-classic-banner__body">Loading mobile player...</p>
          </section>
        )}
      </div>
    </main>
  );
}
