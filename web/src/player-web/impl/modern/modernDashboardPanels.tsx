import type {
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  Ref,
} from "react";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { buildStoredLevelProgressKey, resolveLevelProgressSummary, summarizeEntryProgress } from "@player-web/impl/levelProgress";
import type { LibrarySidebarTab } from "@player-web/impl/modern/modernDashboardNavigationController";
import type { SetFamily, SetFamilyRuleset } from "@player-web/impl/modern/curatedCatalog";
import type {
  BrowserLevelProgressSummary,
  BrowserPreferredRuleset,
  BrowserResolvedLevelProgressSummary,
} from "@player-web/ports/BrowserProfileStore";

const LIBRARY_SIDEBAR_TABS: readonly { id: LibrarySidebarTab; label: string }[] = [
  { id: "official", label: "Official" },
  { id: "curated", label: "Curated" },
  { id: "uploads", label: "Uploads" },
];

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.items).some((item) => item.kind === "file") || dataTransfer.files.length > 0;
}

function levelStatusTone(
  progress: BrowserResolvedLevelProgressSummary | null,
): "clean" | "undo" | "attempted" | "unplayed" {
  if (!progress) {
    return "unplayed";
  }

  if (progress.bestResult === "completed-clean") {
    return "clean";
  }

  if (progress.bestResult === "completed-with-undo") {
    return "undo";
  }

  return "attempted";
}

function levelStatusShortLabel(progress: BrowserResolvedLevelProgressSummary | null): string {
  switch (levelStatusTone(progress)) {
    case "clean":
      return "✓";
    case "undo":
      return "U";
    case "attempted":
      return "A";
    default:
      return "";
  }
}

function levelStatusLongLabel(progress: BrowserResolvedLevelProgressSummary | null): string {
  switch (levelStatusTone(progress)) {
    case "clean":
      return "Cleared clean";
    case "undo":
      return "Cleared with undo";
    case "attempted":
      return "Attempted";
    default:
      return "Unplayed";
  }
}

function levelNameSizeClass(name: string): string {
  if (name.length >= 36) {
    return " modern-level-row__name--micro";
  }

  if (name.length >= 32) {
    return " modern-level-row__name--compactest";
  }

  if (name.length >= 24) {
    return " modern-level-row__name--compact";
  }

  return "";
}

function formatFamilyClearedMeta(
  family: SetFamily,
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>,
): string {
  const parts = (["Lynx", "MS"] as const).flatMap((ruleset) => {
    const entry = family.launchEntries[ruleset] ?? null;
    if (!entry) {
      return [];
    }

    const progress = summarizeEntryProgress(entry, progressByKey);
    return [`${progress.completedLevels}/${entry.levels.length} (${ruleset})`];
  });

  if (parts.length === 0) {
    return `Cleared: 0/${family.levelCount}`;
  }

  return `Cleared: ${parts.join(" ")}`;
}

function RulesetToggle({
  family,
  onSelect,
  selectedRuleset,
}: {
  family: SetFamily;
  onSelect: (ruleset: SetFamilyRuleset) => void;
  selectedRuleset: SetFamilyRuleset;
}) {
  return (
    <div aria-label="Ruleset" className="modern-ruleset-toggle" role="group">
      {(["Lynx", "MS"] as const).map((ruleset) => {
        const isAvailable = family.launchEntries[ruleset] !== undefined;
        return (
          <button
            aria-pressed={selectedRuleset === ruleset}
            className={`modern-ruleset-toggle__button${selectedRuleset === ruleset ? " modern-ruleset-toggle__button--active" : ""}`}
            disabled={!isAvailable}
            key={`${family.id}:${ruleset}`}
            onClick={() => {
              if (isAvailable) {
                onSelect(ruleset);
              }
            }}
            type="button"
          >
            {family.rulesetLabels[ruleset] ?? ruleset}
          </button>
        );
      })}
    </div>
  );
}

function SidebarCategoryPicker({
  activeTab,
  onSelect,
}: {
  activeTab: LibrarySidebarTab;
  onSelect: (tab: LibrarySidebarTab) => void;
}) {
  const activeIndex = LIBRARY_SIDEBAR_TABS.findIndex((option) => option.id === activeTab);
  const previousOption =
    LIBRARY_SIDEBAR_TABS[(activeIndex - 1 + LIBRARY_SIDEBAR_TABS.length) % LIBRARY_SIDEBAR_TABS.length]!;
  const nextOption = LIBRARY_SIDEBAR_TABS[(activeIndex + 1) % LIBRARY_SIDEBAR_TABS.length]!;

  return (
    <div className="modern-dashboard__category-picker">
      <button
        aria-label={`Previous category: ${previousOption.label}`}
        className="modern-dashboard__category-nav"
        onClick={() => {
          onSelect(previousOption.id);
        }}
        type="button"
      >
        <span aria-hidden="true" className="modern-dashboard__category-nav-icon">
          ‹
        </span>
      </button>
      <label className="modern-dashboard__category-select-wrap">
        <select
          aria-label="Set category"
          className="modern-dashboard__category-select"
          onChange={(event) => {
            onSelect(event.currentTarget.value as LibrarySidebarTab);
          }}
          value={activeTab}
        >
          {LIBRARY_SIDEBAR_TABS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span aria-hidden="true" className="modern-dashboard__category-select-caret">
          ▾
        </span>
      </label>
      <button
        aria-label={`Next category: ${nextOption.label}`}
        className="modern-dashboard__category-nav"
        onClick={() => {
          onSelect(nextOption.id);
        }}
        type="button"
      >
        <span aria-hidden="true" className="modern-dashboard__category-nav-icon">
          ›
        </span>
      </button>
    </div>
  );
}

function SidebarSearchField({
  query,
  onChange,
}: {
  query: string;
  onChange: (query: string) => void;
}) {
  return (
    <label className="modern-dashboard__search">
      <span aria-hidden="true" className="modern-dashboard__search-icon">
        <svg className="modern-dashboard__action-icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
      </span>
      <input
        aria-label="Search sets"
        autoCapitalize="off"
        autoCorrect="off"
        className="modern-dashboard__search-input"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        placeholder="Search..."
        spellCheck={false}
        type="search"
        value={query}
      />
    </label>
  );
}

function SidebarFamilyButton({
  actionKind,
  family,
  isActive,
  meta,
  onAction,
  onSelect,
  onShowInfo,
}: {
  actionKind: "discard" | "info" | null;
  family: SetFamily;
  isActive: boolean;
  meta: string;
  onAction: (familyId: string) => void;
  onSelect: (familyId: string) => void;
  onShowInfo: (familyId: string) => void;
}) {
  const isDiscardAction = actionKind === "discard";
  return (
    <div className="modern-library__family-card">
      <button
        aria-pressed={isActive}
        className={`modern-library__family${isActive ? " modern-library__family--active" : ""}`}
        onClick={() => {
          onSelect(family.id);
        }}
        type="button"
      >
        <span className="modern-library__family-title">{family.title}</span>
        {family.sidebarSummary ? (
          <span className="modern-library__family-summary">
            {family.sidebarSummary}
            {family.yearLabel ? ` (${family.yearLabel})` : ""}
          </span>
        ) : null}
        <span className="modern-library__family-meta">{meta}</span>
      </button>
      {actionKind ? (
        <button
          aria-label={isDiscardAction ? `Discard ${family.title}` : `About ${family.title}`}
          className={`modern-library__family-info${isDiscardAction ? " modern-library__family-info--trash" : ""}`}
          onClick={(event) => {
            event.stopPropagation();
            if (isDiscardAction) {
              onAction(family.id);
              return;
            }
            onShowInfo(family.id);
          }}
          type="button"
        >
          {isDiscardAction ? (
            <svg aria-hidden="true" className="modern-library__family-action-icon" viewBox="0 0 16 16">
              <path d="M3.5 4.5h9M6 2.5h4M5.5 4.5v8m5-8v8M4.5 4.5l.6 9h5.8l.6-9" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
            </svg>
          ) : (
            "?"
          )}
        </button>
      ) : null}
    </div>
  );
}

function LevelRow({
  animatedBadge,
  buttonRef,
  isActive,
  level,
  onContextMenu,
  onSelect,
  progress,
}: {
  animatedBadge: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  isActive: boolean;
  level: SeriesLevel;
  onContextMenu?: (event: ReactMouseEvent<HTMLButtonElement>, levelNumber: number) => void;
  onSelect: (levelNumber: number) => void;
  progress: BrowserResolvedLevelProgressSummary | null;
}) {
  const medalTone = levelStatusTone(progress);
  return (
    <button
      aria-pressed={isActive}
      className={`modern-level-row${isActive ? " modern-level-row--active" : ""}`}
      ref={buttonRef}
      onClick={(event) => {
        onSelect(level.number);
        if (event.detail > 0) {
          event.currentTarget.blur();
        }
      }}
      onContextMenu={(event) => {
        onContextMenu?.(event, level.number);
      }}
      type="button"
    >
      <span className="modern-level-row__number">{level.number}</span>
      <span
        aria-label={levelStatusLongLabel(progress)}
        className={`modern-level-row__medal modern-level-row__medal--${medalTone}${animatedBadge ? " modern-level-row__medal--celebrate" : ""}`}
        title={levelStatusLongLabel(progress)}
      >
        {levelStatusShortLabel(progress)}
      </span>
      <span className={`modern-level-row__name${levelNameSizeClass(level.name)}`}>{level.name}</span>
    </button>
  );
}

export function ModernDashboardPaneRail({
  label,
  onExpand,
}: {
  label: string;
  onExpand: () => void;
}) {
  return (
    <button
      aria-label={`Expand ${label} pane`}
      className="modern-dashboard__collapsed-rail"
      onClick={onExpand}
      type="button"
    >
      <span className="modern-dashboard__collapsed-rail-label">{label}</span>
    </button>
  );
}

export function ModernDashboardSplitter({
  isCollapsed,
  label,
  onPointerDown,
  onToggleCollapse,
}: {
  isCollapsed: boolean;
  label: string;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onToggleCollapse: () => void;
}) {
  return (
    <div
      aria-label={`Resize ${label} pane`}
      className="modern-dashboard__splitter"
      onPointerDown={onPointerDown}
      role="separator"
    >
      <button
        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${label} pane`}
        className="modern-dashboard__splitter-toggle"
        onClick={(event) => {
          event.stopPropagation();
          onToggleCollapse();
        }}
        type="button"
      >
        <span aria-hidden="true" className="modern-dashboard__splitter-toggle-icon">
          {isCollapsed ? "›" : "‹"}
        </span>
      </button>
    </div>
  );
}

interface ModernDashboardSetsPaneProps {
  activeFamilyId: string | null;
  activeTab: LibrarySidebarTab;
  dragDepthRef: MutableRefObject<number>;
  emptySearchQuery: string;
  familyMeta?: ((family: SetFamily) => string) | undefined;
  isDropTargetActive: boolean;
  isImporting: boolean;
  isSearchActive: boolean;
  onDropDatFiles: (files: readonly File[]) => void;
  onOpenAbout: () => void;
  onOpenDatPicker: () => void;
  onOpenSettings: () => void;
  onSelectFamily: (familyId: string) => void;
  onSelectTab: (tab: LibrarySidebarTab) => void;
  onSetDropTargetActive: (active: boolean) => void;
  onShowFamilyInfo: (familyId: string) => void;
  onUploadedFamilyAction: (familyId: string) => void;
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  visibleFamilies: readonly SetFamily[];
}

export function ModernDashboardSetsPane({
  activeFamilyId,
  activeTab,
  dragDepthRef,
  emptySearchQuery,
  familyMeta,
  isDropTargetActive,
  isImporting,
  isSearchActive,
  onDropDatFiles,
  onOpenAbout,
  onOpenDatPicker,
  onOpenSettings,
  onSelectFamily,
  onSelectTab,
  onSetDropTargetActive,
  onShowFamilyInfo,
  onUploadedFamilyAction,
  progressByKey,
  searchQuery,
  setSearchQuery,
  visibleFamilies,
}: ModernDashboardSetsPaneProps) {
  return (
    <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--sets" tabIndex={-1}>
      <section className="modern-dashboard__panel modern-dashboard__panel--brand">
        <div className="modern-dashboard__brand-bar">
          <div className="modern-dashboard__brand-lockup">
            <div aria-hidden="true" className="modern-dashboard__brand-logo">
              <span className="modern-dashboard__brand-logo-letter">T</span>
              <span className="modern-dashboard__brand-logo-letter">W</span>
              <span className="modern-dashboard__brand-logo-letter">O</span>
            </div>
            <h1 className="modern-dashboard__title modern-dashboard__title--brand">
              <span className="modern-dashboard__title-line">TILE WORLD</span>
              <span className="modern-dashboard__title-line">ONLINE</span>
            </h1>
          </div>
          <div className="modern-dashboard__brand-actions">
            <button
              aria-label="Replay and save settings"
              className="modern-dashboard__brand-action-button"
              onClick={onOpenSettings}
              type="button"
            >
              <svg aria-hidden="true" className="modern-dashboard__action-icon" viewBox="0 0 24 24">
                <path d="M20 7h-9" />
                <path d="M14 17H5" />
                <circle cx="17" cy="7" r="3" />
                <circle cx="8" cy="17" r="3" />
              </svg>
            </button>
            <button
              aria-label="About Tile World Online"
              className="modern-dashboard__brand-action-button"
              onClick={onOpenAbout}
              type="button"
            >
              <svg aria-hidden="true" className="modern-dashboard__action-icon" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      <section className="modern-dashboard__panel modern-dashboard__panel--fill">
        <div className="modern-dashboard__library-tools">
          <SidebarSearchField
            onChange={setSearchQuery}
            query={searchQuery}
          />
          {!isSearchActive ? (
            <SidebarCategoryPicker
              activeTab={activeTab}
              onSelect={onSelectTab}
            />
          ) : null}
        </div>

        {visibleFamilies.length > 0 ? (
          <div className="modern-library__family-list" tabIndex={-1}>
            {visibleFamilies.map((family) => (
              <SidebarFamilyButton
                actionKind={family.section === "local" ? "discard" : "info"}
                family={family}
                isActive={activeFamilyId === family.id}
                key={family.id}
                meta={familyMeta?.(family) ?? formatFamilyClearedMeta(family, progressByKey)}
                onAction={onUploadedFamilyAction}
                onSelect={onSelectFamily}
                onShowInfo={onShowFamilyInfo}
              />
            ))}
          </div>
        ) : (
          <div className="modern-empty-state modern-dashboard__empty-panel">
            {isSearchActive
              ? `No sets match "${emptySearchQuery.trim()}".`
              : activeTab === "uploads"
                ? "No uploaded sets yet. Open a DAT file and it will stay available in this browser."
                : activeTab === "curated"
                  ? "No curated sets are available right now."
                  : "No official sets are available right now."}
          </div>
        )}

        <section
          className={`modern-dashboard__upload modern-import-dropzone${isDropTargetActive ? " modern-import-dropzone--active" : ""}`}
          onDragEnter={(event) => {
            if (!hasDraggedFiles(event.dataTransfer)) {
              return;
            }
            event.preventDefault();
            dragDepthRef.current += 1;
            onSetDropTargetActive(true);
          }}
          onDragLeave={(event) => {
            if (!hasDraggedFiles(event.dataTransfer)) {
              return;
            }
            event.preventDefault();
            dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
            if (dragDepthRef.current === 0) {
              onSetDropTargetActive(false);
            }
          }}
          onDragOver={(event) => {
            if (!hasDraggedFiles(event.dataTransfer)) {
              return;
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            if (!hasDraggedFiles(event.dataTransfer)) {
              return;
            }
            event.preventDefault();
            dragDepthRef.current = 0;
            onSetDropTargetActive(false);
            const files = Array.from(event.dataTransfer.files ?? []);
            if (files.length > 0) {
              onDropDatFiles(files);
            }
          }}
        >
          <div>
            <p className="modern-preference-block__label">Local DAT</p>
            <p className="modern-dashboard__copy modern-dashboard__copy--compact">
              Upload a DAT from disk or drag one onto this panel.
            </p>
          </div>
          <button
            className="modern-button modern-button--secondary"
            onClick={onOpenDatPicker}
            type="button"
          >
            {isImporting ? "Importing..." : "Open Local DAT"}
          </button>
        </section>
      </section>
    </aside>
  );
}

interface ModernDashboardLevelsPaneProps {
  activeEntry: SeriesCatalogEntry | null;
  activeEntryProgress: { completedLevels: number };
  activeFamily: SetFamily | null;
  activeLevel: SeriesLevel | null;
  activeLevelProgress: BrowserResolvedLevelProgressSummary | null;
  activeLevelRowRef: Ref<HTMLButtonElement>;
  activeRuleset: SetFamilyRuleset | null;
  animatedLevelBadgeKey: string | null;
  onLevelContextMenu: (event: ReactMouseEvent<HTMLButtonElement>, levelNumber: number) => void;
  onSelectLevel: (levelNumber: number) => void;
  onSelectRuleset: (ruleset: SetFamilyRuleset) => void;
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>;
}

export function ModernDashboardLevelsPane({
  activeEntry,
  activeEntryProgress,
  activeFamily,
  activeLevel,
  activeLevelProgress,
  activeLevelRowRef,
  activeRuleset,
  animatedLevelBadgeKey,
  onLevelContextMenu,
  onSelectLevel,
  onSelectRuleset,
  progressByKey,
}: ModernDashboardLevelsPaneProps) {
  return (
    <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--levels" tabIndex={-1}>
      <section className="modern-dashboard__panel modern-dashboard__panel--compact modern-dashboard__panel--level-summary">
        <div className="modern-dashboard__section-header">
          <p className="modern-section__eyebrow">Level Selector</p>
          <p className="modern-dashboard__meta-note">
            {activeEntry ? `${activeEntryProgress.completedLevels}/${activeEntry.levels.length} cleared` : "No level data"}
          </p>
        </div>

        <div className="modern-dashboard__level-header">
          <div>
            <h2 className="modern-dashboard__panel-title">{activeFamily?.title ?? "No set selected"}</h2>
            <p className="modern-dashboard__copy modern-dashboard__copy--compact">
              {activeLevel ? `Level ${activeLevel.number}: ${activeLevel.name}` : "Choose a playable level."}
            </p>
          </div>
          {activeFamily && activeRuleset ? (
            <RulesetToggle
              family={activeFamily}
              onSelect={onSelectRuleset}
              selectedRuleset={activeRuleset}
            />
          ) : null}
        </div>

        <div className="modern-dashboard__level-inline-meta">
          <span className="modern-dashboard__level-inline-meta-label">Best Score</span>
          <strong>{activeLevelProgress ? activeLevelProgress.bestScore : 0}</strong>
        </div>
      </section>

      <section className="modern-dashboard__panel modern-dashboard__panel--fill">
        <div className="modern-dashboard__section-header">
          <p className="modern-section__eyebrow">Levels</p>
          <p className="modern-dashboard__meta-note">{activeEntry ? `${activeEntry.levels.length} total` : "Unavailable"}</p>
        </div>

        {activeEntry ? (
          <div className="modern-level-sidebar" role="list" tabIndex={-1}>
            {activeEntry.levels.map((level) => {
              const progress =
                activeEntry.ruleset === "MS" || activeEntry.ruleset === "Lynx"
                  ? resolveLevelProgressSummary(level, activeEntry.ruleset, progressByKey)
                  : null;
              return (
                <LevelRow
                  animatedBadge={
                    progress !== null && animatedLevelBadgeKey === buildStoredLevelProgressKey(progress)
                  }
                  buttonRef={activeLevel?.number === level.number ? activeLevelRowRef : undefined}
                  isActive={activeLevel?.number === level.number}
                  key={`${activeEntry.filebase}:${level.number}`}
                  level={level}
                  onContextMenu={onLevelContextMenu}
                  onSelect={onSelectLevel}
                  progress={progress}
                />
              );
            })}
          </div>
        ) : (
          <div className="modern-empty-state modern-dashboard__empty-panel">
            The selected family does not expose a playable entry for this ruleset.
          </div>
        )}
      </section>
    </aside>
  );
}
