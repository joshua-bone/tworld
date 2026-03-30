import { buildAppHref } from "@player-web/impl/appPaths";
import { PLAYER_BINDABLE_KEYS, type BrowserPlayerKeyBindingsSettings, type PlayerBindableKey } from "@player-web/impl/playerKeyBindingsSettings";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserProfilePreferences, BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";

const ABOUT_LINKS = {
  browserPortRepo: "https://github.com/joshua-bone/tworld",
  tileWorldRepo: "https://github.com/SicklySilverMoon/tworld",
  bitbustersClub: "https://bitbusters.club",
  bitbustersWiki: "https://wiki.bitbusters.club",
  discord: "https://discord.gg/Xd4dUY9",
  legacy: buildAppHref("/legacy", import.meta.env.BASE_URL),
  mobile: buildAppHref("/mobile", import.meta.env.BASE_URL),
} as const;

export interface LevelContextMenuState {
  levelNumber: number;
  ruleset: BrowserPreferredRuleset;
  seriesFile: string;
  x: number;
  y: number;
}

export function ModernDashboardLevelContextMenu({
  contextMenu,
  onClose,
  onCopyLink,
}: {
  contextMenu: LevelContextMenuState;
  onClose: () => void;
  onCopyLink: (state: LevelContextMenuState) => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="modern-context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        className="modern-context-menu"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="menu"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          className="modern-context-menu__item"
          onClick={() => {
            onCopyLink(contextMenu);
            onClose();
          }}
          role="menuitem"
          type="button"
        >
          Copy Link
        </button>
      </div>
    </div>
  );
}

export function ModernDashboardMessageModal({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="modern-message-modal"
      onClick={onClose}
    >
      <div
        aria-labelledby="modern-dashboard-message-title"
        aria-modal="true"
        className="modern-message-modal__dialog"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <div className="modern-message-modal__header">
          <div>
            <p className="modern-section__eyebrow">Notice</p>
            <h2 className="modern-dashboard__panel-title" id="modern-dashboard-message-title">
              Tile World Online
            </h2>
          </div>
          <button
            aria-label="Close notice"
            className="modern-dashboard__about-button modern-dashboard__about-button--close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modern-message-modal__body">
          <p className="modern-dashboard__copy">{message}</p>
        </div>
        <div className="modern-message-modal__actions">
          <button className="modern-button modern-button--secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function ModernDashboardSetInfoModal({
  family,
  onClose,
}: {
  family: SetFamily;
  onClose: () => void;
}) {
  return (
    <div
      aria-hidden="true"
      className="modern-about-modal"
      onClick={onClose}
    >
      <div
        aria-labelledby="modern-set-info-title"
        aria-modal="true"
        className="modern-about-modal__dialog"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <div className="modern-about-modal__header">
          <div>
            <p className="modern-section__eyebrow">Set Info</p>
            <h2 className="modern-dashboard__panel-title" id="modern-set-info-title">
              {family.title}
            </h2>
          </div>
          <button
            aria-label={`Close ${family.title} info`}
            className="modern-dashboard__about-button modern-dashboard__about-button--close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="modern-about-modal__body">
          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Overview</p>
            <p className="modern-dashboard__copy">{family.description}</p>
            {family.context ? <p className="modern-dashboard__copy">{family.context}</p> : null}
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Pack Status</p>
            <p className="modern-dashboard__copy">
              {family.levelCount} levels
              {family.yearLabel ? `  ·  ${family.yearLabel}` : ""}
              {family.sidebarSummary ? `  ·  ${family.sidebarSummary}` : ""}
            </p>
          </section>

          {family.links.length ? (
            <section className="modern-about-modal__section">
              <p className="modern-preference-block__label">Links</p>
              <div className="modern-set-card__links modern-about-modal__links">
                {family.links.map((link) => (
                  <a className="modern-inline-link" href={link.href} key={`${family.id}:${link.href}`} rel="noreferrer" target="_blank">
                    {link.label}
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ModernDashboardSettingsModal({
  isProfileTransferBusy,
  onClose,
  onDownloadProfile,
  onOpenProfileUpload,
  onSelectAction1Key,
  onSelectUndoKey,
  onSetAutoDownloadReplaysOnSave,
  onSetAutoSaveWinningHighScoreReplays,
  onSetDebugModeEnabled,
  onSetVisualEnhancementsEnabled,
  playerKeyBindings,
  preferences,
  visualEnhancementsEnabled,
}: {
  isProfileTransferBusy: boolean;
  onClose: () => void;
  onDownloadProfile: () => void;
  onOpenProfileUpload: () => void;
  onSelectAction1Key: (key: PlayerBindableKey) => void;
  onSelectUndoKey: (key: PlayerBindableKey) => void;
  onSetAutoDownloadReplaysOnSave: (enabled: boolean) => void;
  onSetAutoSaveWinningHighScoreReplays: (enabled: boolean) => void;
  onSetDebugModeEnabled: (enabled: boolean) => void;
  onSetVisualEnhancementsEnabled: (enabled: boolean) => void;
  playerKeyBindings: BrowserPlayerKeyBindingsSettings;
  preferences: BrowserProfilePreferences;
  visualEnhancementsEnabled: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="modern-about-modal"
      onClick={onClose}
    >
      <div
        aria-labelledby="modern-settings-title"
        aria-modal="true"
        className="modern-about-modal__dialog modern-settings-modal__dialog"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <div className="modern-about-modal__header">
          <div>
            <p className="modern-section__eyebrow">Settings</p>
            <h2 className="modern-dashboard__panel-title" id="modern-settings-title">
              Settings
            </h2>
          </div>
          <button
            aria-label="Close settings dialog"
            className="modern-dashboard__about-button modern-dashboard__about-button--close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="modern-about-modal__body modern-settings-modal">
          <label className="modern-settings-modal__option">
            <input
              checked={visualEnhancementsEnabled}
              onChange={(event) => {
                onSetVisualEnhancementsEnabled(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <div>
              <strong>Enable Visual Enhancements</strong>
              <p className="modern-dashboard__copy">
                E.g. visual aids for trap state, key count, etc. which may not be scoreboard legal
              </p>
            </div>
          </label>

          <section className="modern-about-modal__section modern-settings-modal__section">
            <p className="modern-preference-block__label">Keyboard</p>
            <p className="modern-dashboard__copy">
              Remap Action 1 and Undo without colliding with movement or other keyboard controls.
            </p>
            <div className="modern-settings-modal__actions">
              <label className="modern-settings-modal__field">
                <span>Action 1 Key</span>
                <select
                  className="modern-history-dock__select"
                  onChange={(event) => {
                    onSelectAction1Key(event.currentTarget.value as PlayerBindableKey);
                  }}
                  value={playerKeyBindings.action1Key}
                >
                  {PLAYER_BINDABLE_KEYS.filter((key) => key !== playerKeyBindings.undoKey).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
              <label className="modern-settings-modal__field">
                <span>Undo Key</span>
                <select
                  className="modern-history-dock__select"
                  onChange={(event) => {
                    onSelectUndoKey(event.currentTarget.value as PlayerBindableKey);
                  }}
                  value={playerKeyBindings.undoKey}
                >
                  {PLAYER_BINDABLE_KEYS.filter((key) => key !== playerKeyBindings.action1Key).map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <label className="modern-settings-modal__option">
            <input
              checked={preferences.autoSaveWinningHighScoreReplays}
              onChange={(event) => {
                onSetAutoSaveWinningHighScoreReplays(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <div>
              <strong>Auto save winning high scores</strong>
              <p className="modern-dashboard__copy">
                Automatically save winning replays when they match or beat the current best score for that level.
              </p>
            </div>
          </label>

          <label className="modern-settings-modal__option">
            <input
              checked={preferences.autoDownloadReplaysOnSave}
              onChange={(event) => {
                onSetAutoDownloadReplaysOnSave(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <div>
              <strong>Auto-download replays on save</strong>
              <p className="modern-dashboard__copy">
                Download a local `.tws` or `.twsx` copy whenever a replay is saved to the browser library.
              </p>
            </div>
          </label>

          <label className="modern-settings-modal__option">
            <input
              checked={preferences.debugModeEnabled}
              onChange={(event) => {
                onSetDebugModeEnabled(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            <div>
              <strong>Enable Debug Mode</strong>
              <p className="modern-dashboard__copy">
                Show a live hover inspector over the board with projected tile, layer, overlay, and actor data.
              </p>
            </div>
          </label>

          <section className="modern-about-modal__section modern-settings-modal__section">
            <p className="modern-preference-block__label">Profile Backup</p>
            <p className="modern-dashboard__copy">
              Download a structured backup of local sets, replays, progress, selection, and browser settings. Uploading a backup replaces the current local profile and reloads the page.
            </p>
            <div className="modern-settings-modal__actions">
              <button
                className="modern-button modern-button--secondary"
                disabled={isProfileTransferBusy}
                onClick={onDownloadProfile}
                type="button"
              >
                Download Profile
              </button>
              <button
                className="modern-button modern-button--secondary"
                disabled={isProfileTransferBusy}
                onClick={onOpenProfileUpload}
                type="button"
              >
                Upload Profile
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function ModernDashboardAboutModal({
  onClose,
  onOpenClassic,
  onOpenMobile,
}: {
  onClose: () => void;
  onOpenClassic: () => void;
  onOpenMobile?: (() => void) | undefined;
}) {
  return (
    <div
      aria-hidden="true"
      className="modern-about-modal"
      onClick={onClose}
    >
      <div
        aria-labelledby="modern-about-title"
        aria-modal="true"
        className="modern-about-modal__dialog"
        onClick={(event) => {
          event.stopPropagation();
        }}
        role="dialog"
      >
        <div className="modern-about-modal__header">
          <div>
            <p className="modern-section__eyebrow">About</p>
            <h2 className="modern-dashboard__panel-title" id="modern-about-title">
              Tile World Online
            </h2>
          </div>
          <button
            aria-label="Close about dialog"
            className="modern-dashboard__about-button modern-dashboard__about-button--close"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="modern-about-modal__body">
          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Project</p>
            <p className="modern-dashboard__copy">
              Tile World Online is a Typescript port of Tile World that brings the classic MS and Lynx rulesets into a modern browser UI. It includes rich features like improved level browsing and progress tracking, undo history, replay tools, ruleset switching, and even 3D levels. Tile World Online is a static website; all progress, scores and replays are saved locally.
            </p>
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Engine Parity</p>
            <p className="modern-dashboard__copy">
              Core gameplay logic has been verified on over 2,500 replays per ruleset in an attempt to ensure exact behavior parity with legacy Tile World. That being said, the Typescript port runs in a fundamentally different runtime environment than the original C implementation, and there are likely to be subtle differences between the engines. There may also be outright bugs remaining in the code that may be uncovered as playtesting progresses.
            </p>
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">License And Credits</p>
            <p className="modern-dashboard__copy">
              Tile World Online (TWO) is a browser based TypeScript port of Tile World / Tile World 2, and includes code derived from the original Tile World codebase.
            </p>
            <p className="modern-dashboard__copy">
              Copyright © 2026 Joshua Bone
              <br />
              Portions Copyright © 2001-2025 Brian Raiter, Madhav Shanbhag, and Eric Schmidt
            </p>
            <p className="modern-dashboard__copy">
              Released under the GNU General Public License, version 2 or later.
            </p>
            <p className="modern-dashboard__copy">
              Original Tile World was written by Brian Raiter. Tile World 2 was developed by Madhav Shanbhag, with later releases and maintenance by Eric Schmidt, Michael Hansen (Zrax), ChosenID, David Stolp (pieguy), A Sickly Silver Moon, G lander, and Eevee. Chip&apos;s Challenge was designed by Chuck Sommerville.
            </p>
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Links</p>
            <div className="modern-set-card__links modern-about-modal__links">
              <a className="modern-inline-link" href={ABOUT_LINKS.browserPortRepo} rel="noreferrer" target="_blank">
                Tile World Online repo
              </a>
              <span aria-hidden="true">|</span>
              <a className="modern-inline-link" href={ABOUT_LINKS.tileWorldRepo} rel="noreferrer" target="_blank">
                Tile World repo
              </a>
              <span aria-hidden="true">|</span>
              <a className="modern-inline-link" href={ABOUT_LINKS.bitbustersClub} rel="noreferrer" target="_blank">
                Bit Busters Club
              </a>
              <span aria-hidden="true">|</span>
              <a className="modern-inline-link" href={ABOUT_LINKS.bitbustersWiki} rel="noreferrer" target="_blank">
                Chip Wiki
              </a>
              <span aria-hidden="true">|</span>
              <a className="modern-inline-link" href={ABOUT_LINKS.discord} rel="noreferrer" target="_blank">
                Discord server
              </a>
              <span aria-hidden="true">|</span>
              <a
                className="modern-inline-link"
                href={ABOUT_LINKS.legacy}
                onClick={(event) => {
                  event.preventDefault();
                  onClose();
                  onOpenClassic();
                }}
              >
                TWO Legacy UI
              </a>
              {onOpenMobile ? (
                <>
                  <span aria-hidden="true">|</span>
                  <a
                    className="modern-inline-link"
                    href={ABOUT_LINKS.mobile}
                    onClick={(event) => {
                      event.preventDefault();
                      onClose();
                      onOpenMobile();
                    }}
                  >
                    TWO Mobile UI
                  </a>
                </>
              ) : null}
            </div>
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">URL Launches</p>
            <p className="modern-dashboard__copy">
              Built-in sets can be opened with URLs like <code>?set=CCLP1&amp;level=3&amp;ruleset=Lynx</code>.
              Custom DAT packs can be embedded directly with <code>#dat=&lt;base64url-gzip-dat&gt;</code>,
              plus optional <code>level</code>, <code>ruleset</code>, and <code>slot</code> parameters.
            </p>
            <p className="modern-dashboard__copy">
              Example: <code>?level=3&amp;ruleset=MS&amp;slot=3D_CHIPS.dat#dat=...</code>. The
              <code>slot</code> name controls overwrite-by-name behavior for local work-in-progress packs.
            </p>
          </section>

          <section className="modern-about-modal__section">
            <p className="modern-preference-block__label">Bug Reports</p>
            <p className="modern-dashboard__copy">
              If you hit a browser-port bug, report it to jbone in the Bit Busters Discord so it can be reproduced against the current modern UI and replay corpus.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
