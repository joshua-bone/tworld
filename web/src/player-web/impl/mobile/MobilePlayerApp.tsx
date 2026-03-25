import { ModernPlayerApp } from "@player-web/impl/modern/ModernPlayerApp";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

interface MobilePlayerAppProps {
  onOpenClassic: () => void;
  onOpenDesktop: () => void;
  services: BrowserAppServices;
}

export function MobilePlayerApp({
  onOpenClassic,
  onOpenDesktop,
  services,
}: MobilePlayerAppProps) {
  return (
    <div className="mobile-route-shell">
      <section className="mobile-route-banner">
        <div className="mobile-route-banner__copy">
          <p className="modern-classic-banner__eyebrow">Mobile Route</p>
          <h1 className="modern-classic-banner__title">Mobile entry is now wired up</h1>
          <p className="modern-classic-banner__body">
            The dedicated touch-first shell is landing in follow-up PRs. For now, this route opens the existing browser UI so mobile users can be redirected safely without losing access to the current player.
          </p>
        </div>
        <div className="mobile-route-banner__controls">
          <button className="modern-link-button" onClick={onOpenDesktop} type="button">
            Use Desktop UI
          </button>
          <button className="modern-link-button modern-link-button--light" onClick={onOpenClassic} type="button">
            Use Legacy UI
          </button>
        </div>
      </section>

      <ModernPlayerApp onOpenClassic={onOpenClassic} services={services} />
    </div>
  );
}
