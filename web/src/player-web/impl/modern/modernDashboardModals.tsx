import { useState } from "react";
import { buildAppHref } from "@player-web/impl/appPaths";
import { PLAYER_BINDABLE_KEYS, type BrowserPlayerKeyBindingsSettings, type PlayerBindableKey } from "@player-web/impl/playerKeyBindingsSettings";
import {
  MAX_VIEWPORT_RADIUS,
  MIN_VIEWPORT_RADIUS,
  viewportTileCountForSettings,
  type BrowserViewportSettings,
} from "@player-web/impl/viewportSettings";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserProfilePreferences, BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";
import {
  DIHEDRAL_TRANSFORMS,
  MAX_LANTERN_RADIUS,
  MAX_MONSTER_RIPPLE_REVEAL_RADIUS,
  MAX_TRANSFORM_INTERVAL_SECONDS,
  MIN_LANTERN_RADIUS,
  MIN_MONSTER_RIPPLE_REVEAL_RADIUS,
  MIN_TRANSFORM_INTERVAL_SECONDS,
  SPECIAL_MODE_SEED_MAX,
  createRandomSpecialModeSeed,
  type BrowserSpecialModesPreset,
  type BrowserSpecialModesSettings,
  type DihedralTransform,
} from "@player-web/impl/specialModesSettings";

const DIHEDRAL_LABELS: Readonly<Record<DihedralTransform, string>> = {
  "rotate-90": "Rotate 90°",
  "rotate-180": "Rotate 180°",
  "rotate-270": "Rotate 270°",
  "flip-horizontal": "Flip horizontal",
  "flip-vertical": "Flip vertical",
  "flip-rising-diagonal": "Flip rising diagonal",
  "flip-falling-diagonal": "Flip falling diagonal",
};

const ABOUT_LINKS = {
  browserPortRepo: "https://github.com/joshua-bone/tworld",
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
  onSetViewportRadius,
  onSetViewportSettingsEnabled,
  playerKeyBindings,
  preferences,
  visualEnhancementsEnabled,
  viewportSettings,
  specialModesSettings,
  specialModePresets,
  onSpecialModesSettingsChange,
  onSaveSpecialModesPreset,
  onLoadSpecialModesPreset,
  onDeleteSpecialModesPreset,
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
  onSetViewportRadius: (radius: number) => void;
  onSetViewportSettingsEnabled: (enabled: boolean) => void;
  playerKeyBindings: BrowserPlayerKeyBindingsSettings;
  preferences: BrowserProfilePreferences;
  visualEnhancementsEnabled: boolean;
  viewportSettings: BrowserViewportSettings;
  specialModesSettings: BrowserSpecialModesSettings;
  specialModePresets: BrowserSpecialModesPreset[];
  onSpecialModesSettingsChange: (settings: BrowserSpecialModesSettings) => void;
  onSaveSpecialModesPreset: (name: string) => void;
  onLoadSpecialModesPreset: (preset: BrowserSpecialModesPreset) => void;
  onDeleteSpecialModesPreset: (id: string) => void;
}) {
  const viewportTileCount = viewportTileCountForSettings(viewportSettings);
  const maximumMonsterRippleRevealRadius = Math.min(
    MAX_MONSTER_RIPPLE_REVEAL_RADIUS,
    viewportTileCount >= 32 ? 16 : Math.floor(viewportTileCount / 2),
  );
  const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);
  const [presetName, setPresetName] = useState("");

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
            <p className="modern-preference-block__label">Special Modes</p>
            <p className="modern-dashboard__copy">
              Special Modes use separate progress for every configuration and disable scores, replays, and undo.
              Changing a configuration restarts the current level.
            </p>
            <label className="modern-settings-modal__option">
              <input
                checked={viewportSettings.enabled}
                onChange={(event) => {
                  onSetViewportSettingsEnabled(event.currentTarget.checked);
                }}
                type="checkbox"
              />
              <div>
                <strong>Modify viewport size</strong>
                <p className="modern-dashboard__copy">
                  Keep the board frame fixed while showing more or fewer tiles around Chip.
                </p>
              </div>
            </label>
            <label className="modern-settings-modal__field">
              <span>Tiles visible in each direction</span>
              <input
                className="modern-settings-modal__number-input"
                disabled={!viewportSettings.enabled}
                inputMode="numeric"
                max={MAX_VIEWPORT_RADIUS}
                min={MIN_VIEWPORT_RADIUS}
                onChange={(event) => {
                  const radius = Number(event.currentTarget.value);
                  if (
                    Number.isInteger(radius) &&
                    radius >= MIN_VIEWPORT_RADIUS &&
                    radius <= MAX_VIEWPORT_RADIUS
                  ) {
                    onSetViewportRadius(radius);
                  }
                }}
                step="1"
                type="number"
                value={viewportSettings.radius}
              />
            </label>
            <p className="modern-dashboard__copy">
              {viewportTileCount === 32
                ? "Current view: entire 32×32 board."
                : `Current view: ${viewportTileCount}×${viewportTileCount} tiles.`}
            </p>

            <label className="modern-settings-modal__field">
              <span>Visibility</span>
              <select
                className="modern-history-dock__select"
                onChange={(event) => {
                  onSpecialModesSettingsChange({
                    ...specialModesSettings,
                    visibility: {
                      ...specialModesSettings.visibility,
                      mode: event.currentTarget.value as BrowserSpecialModesSettings["visibility"]["mode"],
                    },
                  });
                }}
                value={specialModesSettings.visibility.mode}
              >
                <option value="normal">Normal</option>
                <option value="flashlight">Flashlight</option>
                <option value="flashlight-fog">Flashlight fog</option>
                <option value="lantern">Lantern</option>
                <option value="lantern-fog">Lantern fog</option>
                <option value="line-of-sight">Line of Sight</option>
                <option value="line-of-sight-fog">Line of Sight fog</option>
              </select>
            </label>
            {specialModesSettings.visibility.mode === "lantern" || specialModesSettings.visibility.mode === "lantern-fog" ? (
              <label className="modern-settings-modal__field">
                <span>Lantern radius</span>
                <input
                  className="modern-settings-modal__number-input"
                  max={MAX_LANTERN_RADIUS}
                  min={MIN_LANTERN_RADIUS}
                  onChange={(event) => {
                    const lanternRadius = Number(event.currentTarget.value);
                    if (Number.isInteger(lanternRadius) && lanternRadius >= MIN_LANTERN_RADIUS && lanternRadius <= MAX_LANTERN_RADIUS) {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        visibility: { ...specialModesSettings.visibility, lanternRadius },
                      });
                    }
                  }}
                  type="number"
                  value={specialModesSettings.visibility.lanternRadius}
                />
              </label>
            ) : null}

            <label className="modern-settings-modal__option">
              <input
                checked={specialModesSettings.monsterMadness.enabled}
                onChange={(event) => {
                  onSpecialModesSettingsChange({
                    ...specialModesSettings,
                    monsterMadness: {
                      ...specialModesSettings.monsterMadness,
                      enabled: event.currentTarget.checked,
                    },
                  });
                }}
                type="checkbox"
              />
              <div>
                <strong>Monster Madness</strong>
                <p className="modern-dashboard__copy">Shuffle complete monster animation families with a seeded derangement.</p>
              </div>
            </label>
            {specialModesSettings.monsterMadness.enabled ? (
              <div className="modern-settings-modal__actions modern-settings-modal__actions--wrap">
                <label className="modern-settings-modal__option">
                  <input
                    checked={specialModesSettings.monsterMadness.includePlayer}
                    onChange={(event) => {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        monsterMadness: {
                          ...specialModesSettings.monsterMadness,
                          includePlayer: event.currentTarget.checked,
                        },
                      });
                    }}
                    type="checkbox"
                  />
                  <span>Include Player?</span>
                </label>
                <label className="modern-settings-modal__field">
                  <span>Artwork seed</span>
                  <input
                    className="modern-settings-modal__seed-input"
                    max={SPECIAL_MODE_SEED_MAX}
                    min="0"
                    onChange={(event) => {
                      const seed = Number(event.currentTarget.value);
                      if (Number.isInteger(seed) && seed >= 0 && seed <= SPECIAL_MODE_SEED_MAX) {
                        onSpecialModesSettingsChange({
                          ...specialModesSettings,
                          monsterMadness: { ...specialModesSettings.monsterMadness, seed },
                        });
                      }
                    }}
                    type="number"
                    value={specialModesSettings.monsterMadness.seed}
                  />
                </label>
                <button
                  className="modern-button modern-button--secondary"
                  onClick={() => {
                    onSpecialModesSettingsChange({
                      ...specialModesSettings,
                      monsterMadness: {
                        ...specialModesSettings.monsterMadness,
                        seed: createRandomSpecialModeSeed(),
                      },
                    });
                  }}
                  type="button"
                >
                  Randomize seed
                </button>
              </div>
            ) : null}

            <label className="modern-settings-modal__option">
              <input
                checked={specialModesSettings.monsterRipples.enabled}
                onChange={(event) => {
                  onSpecialModesSettingsChange({
                    ...specialModesSettings,
                    monsterRipples: {
                      ...specialModesSettings.monsterRipples,
                      enabled: event.currentTarget.checked,
                    },
                  });
                }}
                type="checkbox"
              />
              <div>
                <strong>Monster Ripples</strong>
                <p className="modern-dashboard__copy">
                  Hide distant monster artwork while animated ripples reveal monster positions.
                </p>
              </div>
            </label>
            {specialModesSettings.monsterRipples.enabled ? (
              <label className="modern-settings-modal__field">
                <span>Monster artwork reveal radius</span>
                <input
                  className="modern-settings-modal__number-input"
                  max={maximumMonsterRippleRevealRadius}
                  min={MIN_MONSTER_RIPPLE_REVEAL_RADIUS}
                  onChange={(event) => {
                    const revealRadius = Number(event.currentTarget.value);
                    if (
                      Number.isInteger(revealRadius) &&
                      revealRadius >= MIN_MONSTER_RIPPLE_REVEAL_RADIUS &&
                      revealRadius <= maximumMonsterRippleRevealRadius
                    ) {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        monsterRipples: { ...specialModesSettings.monsterRipples, revealRadius },
                      });
                    }
                  }}
                  type="number"
                  value={specialModesSettings.monsterRipples.revealRadius}
                />
              </label>
            ) : null}

            <label className="modern-settings-modal__field">
              <span>Transform mode</span>
              <select
                className="modern-history-dock__select"
                onChange={(event) => {
                  onSpecialModesSettingsChange({
                    ...specialModesSettings,
                    transform: {
                      ...specialModesSettings.transform,
                      mode: event.currentTarget.value as BrowserSpecialModesSettings["transform"]["mode"],
                    },
                  });
                }}
                value={specialModesSettings.transform.mode}
              >
                <option value="off">Off</option>
                <option value="static">Transform</option>
                <option value="timed">Transform every N seconds</option>
              </select>
            </label>
            {specialModesSettings.transform.mode === "static" ? (
              <div className="modern-settings-modal__special-grid">
                <label className="modern-settings-modal__field">
                  <span>Transform</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        transform: {
                          ...specialModesSettings.transform,
                          staticOrientation: event.currentTarget.value as BrowserSpecialModesSettings["transform"]["staticOrientation"],
                        },
                      });
                    }}
                    value={specialModesSettings.transform.staticOrientation}
                  >
                    {DIHEDRAL_TRANSFORMS.map((transform) => (
                      <option key={transform} value={transform}>{DIHEDRAL_LABELS[transform]}</option>
                    ))}
                  </select>
                </label>
                <p className="modern-dashboard__copy">
                  Keep the selected orientation for the whole level. Inputs remain screen-relative.
                </p>
              </div>
            ) : null}
            {specialModesSettings.transform.mode === "timed" ? (
              <div className="modern-settings-modal__special-grid">
                <p className="modern-dashboard__copy">
                  Shake at 3, 2, and 1 seconds, slow to a stop, transform the viewport, ripple each cell upright, then speed back up.
                </p>
                <label className="modern-settings-modal__field">
                  <span>Interval (seconds)</span>
                  <input
                    className="modern-settings-modal__number-input"
                    max={MAX_TRANSFORM_INTERVAL_SECONDS}
                    min={MIN_TRANSFORM_INTERVAL_SECONDS}
                    onChange={(event) => {
                      const intervalSeconds = Number(event.currentTarget.value);
                      if (Number.isInteger(intervalSeconds) && intervalSeconds >= MIN_TRANSFORM_INTERVAL_SECONDS && intervalSeconds <= MAX_TRANSFORM_INTERVAL_SECONDS) {
                        onSpecialModesSettingsChange({
                          ...specialModesSettings,
                          transform: { ...specialModesSettings.transform, intervalSeconds },
                        });
                      }
                    }}
                    type="number"
                    value={specialModesSettings.transform.intervalSeconds}
                  />
                </label>
                <label className="modern-settings-modal__field">
                  <span>Transition speed</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        transform: {
                          ...specialModesSettings.transform,
                          transitionSpeed: event.currentTarget.value as BrowserSpecialModesSettings["transform"]["transitionSpeed"],
                        },
                      });
                    }}
                    value={specialModesSettings.transform.transitionSpeed}
                  >
                    <option value="slow">Slow · 3 seconds</option>
                    <option value="medium">Medium · 2 seconds</option>
                    <option value="fast">Fast · 1 second</option>
                  </select>
                </label>
                <label className="modern-settings-modal__field">
                  <span>Transform</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      onSpecialModesSettingsChange({
                        ...specialModesSettings,
                        transform: {
                          ...specialModesSettings.transform,
                          strategy: event.currentTarget.value as BrowserSpecialModesSettings["transform"]["strategy"],
                        },
                      });
                    }}
                    value={specialModesSettings.transform.strategy}
                  >
                    <option value="random">Random</option>
                    {DIHEDRAL_TRANSFORMS.map((transform) => (
                      <option key={transform} value={transform}>{DIHEDRAL_LABELS[transform]}</option>
                    ))}
                  </select>
                </label>
                <label className="modern-settings-modal__field">
                  <span>Transform seed</span>
                  <span className="modern-settings-modal__inline-field">
                    <input
                      className="modern-settings-modal__seed-input"
                      max={SPECIAL_MODE_SEED_MAX}
                      min="0"
                      onChange={(event) => {
                        const seed = Number(event.currentTarget.value);
                        if (Number.isInteger(seed) && seed >= 0 && seed <= SPECIAL_MODE_SEED_MAX) {
                          onSpecialModesSettingsChange({
                            ...specialModesSettings,
                            transform: { ...specialModesSettings.transform, seed },
                          });
                        }
                      }}
                      type="number"
                      value={specialModesSettings.transform.seed}
                    />
                    <button
                      className="modern-button modern-button--secondary"
                      onClick={() => {
                        onSpecialModesSettingsChange({
                          ...specialModesSettings,
                          transform: { ...specialModesSettings.transform, seed: createRandomSpecialModeSeed() },
                        });
                      }}
                      type="button"
                    >
                      Randomize
                    </button>
                  </span>
                </label>
                {specialModesSettings.transform.strategy === "random" ? (
                  <fieldset className="modern-settings-modal__transform-list">
                    <legend>Allowed random transforms</legend>
                    {DIHEDRAL_TRANSFORMS.map((transform) => {
                      const checked = specialModesSettings.transform.allowedRandomTransforms.includes(transform);
                      return (
                        <label className="modern-settings-modal__compact-option" key={transform}>
                          <input
                            checked={checked}
                            disabled={checked && specialModesSettings.transform.allowedRandomTransforms.length === 1}
                            onChange={(event) => {
                              const allowedRandomTransforms = event.currentTarget.checked
                                ? [...specialModesSettings.transform.allowedRandomTransforms, transform]
                                : specialModesSettings.transform.allowedRandomTransforms.filter((entry) => entry !== transform);
                              onSpecialModesSettingsChange({
                                ...specialModesSettings,
                                transform: { ...specialModesSettings.transform, allowedRandomTransforms },
                              });
                            }}
                            type="checkbox"
                          />
                          <span>{DIHEDRAL_LABELS[transform]}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                ) : null}
              </div>
            ) : null}

            <div className="modern-settings-modal__preset-actions">
              <button
                className="modern-button modern-button--secondary"
                onClick={() => {
                  setPresetName("");
                  setIsSavePresetOpen(true);
                }}
                type="button"
              >
                Save configuration
              </button>
            </div>
            {specialModePresets.length > 0 ? (
              <div className="modern-settings-modal__preset-list">
                {specialModePresets.map((preset) => (
                  <div className="modern-settings-modal__preset-row" key={preset.id}>
                    <strong>{preset.name}</strong>
                    <div className="modern-settings-modal__actions">
                      <button className="modern-button modern-button--secondary" onClick={() => onLoadSpecialModesPreset(preset)} type="button">Load</button>
                      <button className="modern-button modern-button--secondary" onClick={() => onDeleteSpecialModesPreset(preset.id)} type="button">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="modern-dashboard__copy">No saved Special Modes configurations yet.</p>
            )}
          </section>

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
      {isSavePresetOpen ? (
        <div
          aria-hidden="true"
          className="modern-message-modal modern-settings-modal__save-preset-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            setIsSavePresetOpen(false);
          }}
        >
          <form
            aria-labelledby="special-modes-save-title"
            aria-modal="true"
            className="modern-message-modal__dialog"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (!presetName.trim()) return;
              onSaveSpecialModesPreset(presetName);
              setIsSavePresetOpen(false);
              setPresetName("");
            }}
            role="dialog"
          >
            <div className="modern-message-modal__header">
              <div>
                <p className="modern-section__eyebrow">Special Modes</p>
                <h2 className="modern-dashboard__panel-title" id="special-modes-save-title">Save configuration</h2>
              </div>
            </div>
            <div className="modern-message-modal__body">
              <label className="modern-settings-modal__field">
                <span>Configuration name</span>
                <input
                  autoFocus
                  className="modern-settings-modal__text-input"
                  maxLength={60}
                  onChange={(event) => setPresetName(event.currentTarget.value)}
                  placeholder="e.g. Foggy Madness"
                  type="text"
                  value={presetName}
                />
              </label>
            </div>
            <div className="modern-message-modal__actions">
              <button className="modern-button modern-button--secondary" onClick={() => setIsSavePresetOpen(false)} type="button">Cancel</button>
              <button className="modern-button" disabled={!presetName.trim()} type="submit">Save</button>
            </div>
          </form>
        </div>
      ) : null}
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
