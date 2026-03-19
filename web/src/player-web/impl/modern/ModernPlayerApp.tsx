import {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import { loadBrowserPlayableCatalog } from "@player-web/impl/loadBrowserPlayableCatalog";
import { describeLocalDatImportMessage } from "@player-web/impl/localDatImportMessaging";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import {
  buildLevelProgressIndex,
  buildStoredLevelProgressKey,
  mergeLevelProgressSummaries,
  resolveLevelProgressSummary,
  summarizeEntryProgress,
} from "@player-web/impl/levelProgress";
import {
  buildCuratedCatalogView,
  findSetFamilyById,
  findSetFamilyForSelection,
  listSetFamilyRulesets,
  resolveSetFamilyLevel,
  resolveSetFamilyRuleset,
  resolveSetFamilySelection,
  type CuratedCatalogView,
  type SetFamily,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import { describeLevelDisplayStatus } from "@player-web/impl/modern/familyActivity";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  isCompletedBrowserLevelRunResult,
  type BrowserLevelProgressSummary,
  type BrowserResolvedLevelProgressSummary,
  createDefaultBrowserProfilePreferences,
  type BrowserPreferredRuleset,
  type BrowserProfilePreferences,
} from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

type LibrarySidebarTab = "official" | "curated" | "uploads";
type ResizablePane = "sets" | "levels";

const LIBRARY_SIDEBAR_TABS: readonly { id: LibrarySidebarTab; label: string }[] = [
  { id: "official", label: "Official" },
  { id: "curated", label: "Curated" },
  { id: "uploads", label: "Uploads" },
];

interface ModernPlayerAppProps {
  services: BrowserAppServices;
  onOpenClassic: () => void;
}

const ABOUT_LINKS = {
  browserPortRepo: "https://github.com/joshua-bone/tworld",
  tileWorldRepo: "https://github.com/SicklySilverMoon/tworld",
  bitbustersClub: "https://bitbusters.club",
  bitbustersWiki: "https://wiki.bitbusters.club",
  discord: "https://discord.gg/Xd4dUY9",
  legacy: "/legacy",
} as const;

const ABOUT_REPLAY_STATUS = {
  msPassing: 2825,
  msLegacyExcluded: 12,
  lynxPassing: 1007,
} as const;

const DASHBOARD_COLLAPSED_PANE_WIDTH = 44;
const DASHBOARD_DEFAULT_SETS_PANE_WIDTH = 292;
const DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH = 276;
const DASHBOARD_MIN_SETS_PANE_WIDTH = 210;
const DASHBOARD_MAX_SETS_PANE_WIDTH = 400;
const DASHBOARD_MIN_LEVELS_PANE_WIDTH = 210;
const DASHBOARD_MAX_LEVELS_PANE_WIDTH = 400;
const MODERN_BOOTSTRAP_SERIES_FILES = ["CCLP1-MS.dac", "CCLP1-Lynx.dac"] as const;

interface DashboardStyle extends CSSProperties {
  "--modern-dashboard-sets-min-width": string;
  "--modern-dashboard-sets-width": string;
  "--modern-dashboard-levels-min-width": string;
  "--modern-dashboard-levels-width": string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function estimateSetsPaneWidth(activeFamily: SetFamily | null, visibleFamilies: readonly SetFamily[]): number {
  const longestFamilyTitle = Math.max(...visibleFamilies.map((family) => family.title.length), activeFamily?.title.length ?? 0, 14);
  const longestSidebarSummary = Math.max(
    ...visibleFamilies.map(
      (family) =>
        (family.sidebarSummary?.length ?? 0) +
        (family.yearLabel ? family.yearLabel.length + 3 : 0),
    ),
    18,
  );

  return clamp(
    Math.ceil(Math.max(268, longestFamilyTitle * 8.8 + 72, longestSidebarSummary * 6.8 + 84)),
    DASHBOARD_MIN_SETS_PANE_WIDTH,
    DASHBOARD_MAX_SETS_PANE_WIDTH,
  );
}

function estimateLevelsPaneWidth(activeEntry: SeriesCatalogEntry | null): number {
  if (!activeEntry) {
    return DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH;
  }

  const longestLevelName = Math.max(...activeEntry.levels.map((level) => level.name.length), 18);
  const densityFloor = 260;
  const sparseSetBuffer = activeEntry.levels.length <= 12 ? 0 : 12;

  return clamp(
    Math.ceil(Math.max(densityFloor, longestLevelName * 6 + 92 + sparseSetBuffer)),
    DASHBOARD_MIN_LEVELS_PANE_WIDTH,
    DASHBOARD_MAX_LEVELS_PANE_WIDTH,
  );
}

function isDatFile(file: File): boolean {
  return /\.dat$/iu.test(file.name);
}

function hasDraggedFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }

  return Array.from(dataTransfer.items).some((item) => item.kind === "file") || dataTransfer.files.length > 0;
}

function resolveDefaultLandingFamily(view: CuratedCatalogView): SetFamily | null {
  return (
    findSetFamilyById(view, "official:cclp1") ??
    view.officialFamilies[0] ??
    view.introFamilies[0] ??
    view.localFamilies[0] ??
    null
  );
}

function listFamiliesForTab(view: CuratedCatalogView, tab: LibrarySidebarTab): SetFamily[] {
  switch (tab) {
    case "official":
      return view.officialFamilies;
    case "curated":
      return view.introFamilies;
    case "uploads":
      return view.localFamilies;
  }
}

function tabForFamily(family: SetFamily): LibrarySidebarTab | null {
  if (family.section === "official") {
    return "official";
  }

  if (family.section === "intro") {
    return "curated";
  }

  if (family.section === "local") {
    return "uploads";
  }

  return null;
}

function resolveFamilyRuleset(
  family: SetFamily,
  requestedRuleset: BrowserPreferredRuleset,
): SetFamilyRuleset | null {
  if (family.launchEntries[requestedRuleset]) {
    return requestedRuleset;
  }

  return listSetFamilyRulesets(family)[0] ?? null;
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
  const parts = (["MS", "Lynx"] as const).flatMap((ruleset) => {
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
      {(["MS", "Lynx"] as const).map((ruleset) => {
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
  onSelect,
  progress,
}: {
  animatedBadge: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  isActive: boolean;
  level: SeriesLevel;
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

function PaneRail({
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

function DashboardSplitter({
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

export function ModernPlayerApp({
  services,
  onOpenClassic,
}: ModernPlayerAppProps) {
  const { deleteImportedDatFile, importDatFile, profileStore, selectionStore } = services;
  const datFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const setsPaneManualRef = useRef(false);
  const levelsPaneManualRef = useRef(false);
  const setsPaneWidthRef = useRef(DASHBOARD_DEFAULT_SETS_PANE_WIDTH);
  const levelsPaneWidthRef = useRef(DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH);
  const [activeTab, setActiveTab] = useState<LibrarySidebarTab>("official");
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>("official:cclp1");
  const [catalog, setCatalog] = useState<SeriesCatalogEntry[]>([]);
  const [lastSelection, setLastSelection] = useState<PlayableSelection | null>(null);
  const [levelProgressSummaries, setLevelProgressSummaries] = useState<BrowserLevelProgressSummary[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [setInfoFamilyId, setSetInfoFamilyId] = useState<string | null>(null);
  const [isSetsPaneCollapsed, setIsSetsPaneCollapsed] = useState(false);
  const [isLevelsPaneCollapsed, setIsLevelsPaneCollapsed] = useState(false);
  const [setsPaneWidth, setSetsPaneWidth] = useState(DASHBOARD_DEFAULT_SETS_PANE_WIDTH);
  const [levelsPaneWidth, setLevelsPaneWidth] = useState(DASHBOARD_DEFAULT_LEVELS_PANE_WIDTH);
  const [requestedRuleset, setRequestedRuleset] = useState<BrowserPreferredRuleset>("MS");
  const [requestedLevelsByFamily, setRequestedLevelsByFamily] = useState<Record<string, number>>({
    "official:cclp1": 1,
  });
  const [preferences, setPreferences] = useState<BrowserProfilePreferences>(
    createDefaultBrowserProfilePreferences(),
  );
  const preferencesRef = useRef<BrowserProfilePreferences>(createDefaultBrowserProfilePreferences());
  const badgeAnimationTimeoutRef = useRef<number | null>(null);

  const dismissMessage = useEffectEvent(() => {
    setMessage(null);
  });

  const persistPreferences = useEffectEvent((patch: Partial<BrowserProfilePreferences>) => {
    const nextPreferences = {
      ...preferencesRef.current,
      ...patch,
    };
    preferencesRef.current = nextPreferences;
    setPreferences(nextPreferences);
    if (patch.defaultRuleset) {
      setRequestedRuleset(patch.defaultRuleset);
    }
    void profileStore.savePreferences(nextPreferences);
  });

  useEffect(() => {
    return () => {
      if (badgeAnimationTimeoutRef.current !== null) {
        window.clearTimeout(badgeAnimationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    Promise.all([
      loadBrowserPlayableCatalog(services, {
        includeImported: false,
        seriesFiles: [...MODERN_BOOTSTRAP_SERIES_FILES],
      }),
      profileStore.loadPreferences(),
      profileStore.loadLevelProgressSummaries(),
    ])
      .then(([bootstrapCatalog, storedPreferences, storedLevelProgressSummaries]) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setCatalog(bootstrapCatalog);
          preferencesRef.current = storedPreferences;
          setPreferences(storedPreferences);
          setRequestedRuleset(storedPreferences.defaultRuleset);
          setLevelProgressSummaries(storedLevelProgressSummaries);
          setMessage(null);
          setIsCatalogLoading(false);
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
        setIsCatalogLoading(false);
      });

    Promise.all([loadBrowserPlayableCatalog(services), loadPlayableSelection(selectionStore)])
      .then(([nextCatalog, storedSelection]) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setCatalog(nextCatalog);
          setLastSelection(storedSelection);
          setMessage(null);
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isAboutOpen && !isSettingsOpen && !setInfoFamilyId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAboutOpen(false);
        setIsSettingsOpen(false);
        setSetInfoFamilyId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAboutOpen, isSettingsOpen, setInfoFamilyId]);

  useEffect(() => {
    if (!message) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissMessage();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dismissMessage, message]);

  const curated = useMemo(() => buildCuratedCatalogView(catalog, lastSelection), [catalog, lastSelection]);
  const fallbackFamily = resolveDefaultLandingFamily(curated);
  const requestedActiveFamily = activeFamilyId ? findSetFamilyById(curated, activeFamilyId) : null;
  const activeFamily = requestedActiveFamily && tabForFamily(requestedActiveFamily) ? requestedActiveFamily : fallbackFamily;
  const activeRuleset = activeFamily ? resolveFamilyRuleset(activeFamily, requestedRuleset) : null;
  const activeEntry = activeFamily && activeRuleset ? activeFamily.launchEntries[activeRuleset] ?? null : null;
  const requestedLevelNumber = activeFamily ? requestedLevelsByFamily[activeFamily.id] ?? 1 : 1;
  const activeLevel =
    activeFamily && activeRuleset ? resolveSetFamilyLevel(activeFamily, activeRuleset, requestedLevelNumber) ?? activeEntry?.levels[0] ?? null : null;
  const activeSelection =
    activeFamily && activeRuleset && activeLevel ? resolveSetFamilySelection(activeFamily, activeRuleset, activeLevel.number) : null;
  const progressByKey = useMemo(() => buildLevelProgressIndex(levelProgressSummaries), [levelProgressSummaries]);
  const activeLevelProgress =
    activeLevel && activeRuleset ? resolveLevelProgressSummary(activeLevel, activeRuleset, progressByKey) : null;
  const activeLevelStatus = activeLevel ? describeLevelDisplayStatus(activeLevel, activeLevelProgress) : null;
  const activeEntryProgress = summarizeEntryProgress(activeEntry, progressByKey);
  const visibleFamilies = useMemo(() => listFamiliesForTab(curated, activeTab), [curated, activeTab]);
  const setInfoFamily = setInfoFamilyId ? findSetFamilyById(curated, setInfoFamilyId) : null;
  const [animatedLevelBadgeKey, setAnimatedLevelBadgeKey] = useState<string | null>(null);
  const activeLevelRowRef = useRef<HTMLButtonElement | null>(null);

  const triggerCompletedLevelBadgeAnimation = useEffectEvent((summary: BrowserLevelProgressSummary) => {
    const key = buildStoredLevelProgressKey(summary);
    setAnimatedLevelBadgeKey(key);
    if (badgeAnimationTimeoutRef.current !== null) {
      window.clearTimeout(badgeAnimationTimeoutRef.current);
    }
    badgeAnimationTimeoutRef.current = window.setTimeout(() => {
      setAnimatedLevelBadgeKey((current) => (current === key ? null : current));
      badgeAnimationTimeoutRef.current = null;
    }, 900);
  });

  const handleLevelProgressSaved = useEffectEvent((summary: BrowserLevelProgressSummary) => {
    setLevelProgressSummaries((current) => mergeLevelProgressSummaries(current, summary));
    if (isCompletedBrowserLevelRunResult(summary.lastResult)) {
      triggerCompletedLevelBadgeAnimation(summary);
    }
  });

  useEffect(() => {
    setsPaneWidthRef.current = setsPaneWidth;
  }, [setsPaneWidth]);

  useEffect(() => {
    levelsPaneWidthRef.current = levelsPaneWidth;
  }, [levelsPaneWidth]);

  useEffect(() => {
    if (isCatalogLoading || activeFamilyId || !fallbackFamily) {
      return;
    }

    setActiveFamilyId(fallbackFamily.id);
  }, [activeFamilyId, fallbackFamily, isCatalogLoading]);

  useEffect(() => {
    if (!activeFamily || !activeLevel) {
      return;
    }

    setRequestedLevelsByFamily((current) => {
      if (current[activeFamily.id] === activeLevel.number) {
        return current;
      }

      return {
        ...current,
        [activeFamily.id]: activeLevel.number,
      };
    });
  }, [activeFamily, activeLevel]);

  useEffect(() => {
    activeLevelRowRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [activeEntry?.filebase, activeLevel?.number]);

  useLayoutEffect(() => {
    if (isCatalogLoading) {
      return;
    }

    if (!setsPaneManualRef.current) {
      const nextSetsWidth = estimateSetsPaneWidth(activeFamily, visibleFamilies);
      if (nextSetsWidth > setsPaneWidthRef.current) {
        setsPaneWidthRef.current = nextSetsWidth;
        setSetsPaneWidth(nextSetsWidth);
      }
    }

    if (!levelsPaneManualRef.current) {
      const nextLevelsWidth = estimateLevelsPaneWidth(activeEntry);
      if (nextLevelsWidth !== levelsPaneWidthRef.current) {
        levelsPaneWidthRef.current = nextLevelsWidth;
        setLevelsPaneWidth(nextLevelsWidth);
      }
    }
  }, [activeEntry, activeFamily, isCatalogLoading, visibleFamilies]);

  const importLocalDatFiles = useEffectEvent(async (files: readonly File[]) => {
    const candidates = files.filter(isDatFile);
    if (candidates.length === 0) {
      setMessage("Only .dat files can be imported from local storage.");
      return;
    }

    const existingFilenames = new Set(
      catalog
        .filter((entry) => entry.mapfilename.startsWith("local:"))
        .map((entry) => entry.mapfilename.slice("local:".length)),
    );

    setIsImporting(true);
    const results = await Promise.allSettled(
      candidates.map(async (file) => ({
        file,
        entries: await importDatFile(file),
      })),
    );
    setIsImporting(false);

    const successes = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failures = results.flatMap((result) =>
      result.status === "rejected"
        ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
        : [],
    );

    if (successes.length === 0) {
      setMessage(failures[0] ?? "Failed to import the selected DAT file.");
      return;
    }

    const importedEntries = successes.flatMap(({ entries }) => entries);
    const mergedCatalog = mergeSeriesCatalogEntries(catalog, importedEntries);
    const preferredImportedEntry =
      importedEntries.find((entry) => entry.ruleset === requestedRuleset) ?? importedEntries[0] ?? null;
    const preferredImportedSelection =
      preferredImportedEntry && preferredImportedEntry.levels[0]
        ? {
            seriesFile: preferredImportedEntry.filebase,
            levelNumber: preferredImportedEntry.levels[0].number,
          }
        : null;
    const importedFamily = preferredImportedSelection
      ? findSetFamilyForSelection(buildCuratedCatalogView(mergedCatalog, preferredImportedSelection), preferredImportedSelection)
      : null;

    startTransition(() => {
      setCatalog(mergedCatalog);
      setActiveTab("uploads");
      if (importedFamily && preferredImportedSelection) {
        setActiveFamilyId(importedFamily.id);
        setRequestedLevelsByFamily((current) => ({
          ...current,
          [importedFamily.id]: preferredImportedSelection.levelNumber,
        }));
      }
      setMessage(
        describeLocalDatImportMessage({
          existingFilenames,
          failureMessages: failures,
          successfulFilenames: successes.map(({ file }) => file.name),
          variant: "modern",
        }),
      );
    });
  });

  const discardUploadedFamily = useEffectEvent(async (familyId: string) => {
    const family = findSetFamilyById(curated, familyId);
    const filename = family?.section === "local" ? family.entries[0]?.mapfilename.slice("local:".length) ?? null : null;
    if (!family || !filename) {
      return;
    }

    try {
      await deleteImportedDatFile(filename);
      const nextCatalog = catalog.filter((entry) => entry.mapfilename !== `local:${filename}`);
      const nextCurated = buildCuratedCatalogView(nextCatalog, lastSelection);
      const nextActiveFamily =
        activeFamily?.id === familyId
          ? (nextCurated.localFamilies[0] ?? resolveDefaultLandingFamily(nextCurated))
          : activeFamily;

      startTransition(() => {
        setCatalog(nextCatalog);
        setRequestedLevelsByFamily((current) => {
          const next = { ...current };
          delete next[familyId];
          return next;
        });
        if (activeFamily?.id === familyId) {
          setActiveFamilyId(nextActiveFamily?.id ?? null);
          setActiveTab(nextActiveFamily ? (tabForFamily(nextActiveFamily) ?? "official") : "official");
        } else if (activeTab === "uploads" && nextCurated.localFamilies.length === 0) {
          const fallbackFamily = resolveDefaultLandingFamily(nextCurated);
          setActiveFamilyId(fallbackFamily?.id ?? null);
          setActiveTab(fallbackFamily ? (tabForFamily(fallbackFamily) ?? "official") : "official");
        }
        setMessage(`Discarded local set ${filename}.`);
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const handleSelectFamily = useEffectEvent((familyId: string) => {
    const family = findSetFamilyById(curated, familyId);
    setActiveFamilyId(familyId);
    if (!family) {
      return;
    }

    const familyTab = tabForFamily(family);
    if (familyTab) {
      setActiveTab(familyTab);
    }

    setRequestedLevelsByFamily((current) => {
      if (current[familyId]) {
        return current;
      }

      return {
        ...current,
        [familyId]: 1,
      };
    });
  });

  const handleEmbeddedSelectionChange = useEffectEvent((selection: PlayableSelection) => {
    setLastSelection((current) => {
      if (
        current &&
        current.seriesFile === selection.seriesFile &&
        current.levelNumber === selection.levelNumber
      ) {
        return current;
      }

      return selection;
    });
    const family = findSetFamilyForSelection(curated, selection);
    if (!family) {
      return;
    }

    const familyTab = tabForFamily(family);
    if (!familyTab) {
      return;
    }

    setActiveFamilyId((current) => (current === family.id ? current : family.id));
    setActiveTab((current) => (current === familyTab ? current : familyTab));
    setRequestedLevelsByFamily((current) => {
      if (current[family.id] === selection.levelNumber) {
        return current;
      }

      return {
        ...current,
        [family.id]: selection.levelNumber,
      };
    });

    const nextRuleset = resolveSetFamilyRuleset(family, selection);
    if (nextRuleset) {
      setRequestedRuleset((current) => (current === nextRuleset ? current : nextRuleset));
      if (preferencesRef.current.defaultRuleset !== nextRuleset) {
        persistPreferences({ defaultRuleset: nextRuleset });
      }
    }
  });

  const startPaneResize = useEffectEvent((pane: ResizablePane, originX: number) => {
    const startWidth = pane === "sets" ? setsPaneWidthRef.current : levelsPaneWidthRef.current;
    const minWidth = pane === "sets" ? DASHBOARD_MIN_SETS_PANE_WIDTH : DASHBOARD_MIN_LEVELS_PANE_WIDTH;
    const maxWidth = pane === "sets" ? DASHBOARD_MAX_SETS_PANE_WIDTH : DASHBOARD_MAX_LEVELS_PANE_WIDTH;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const handlePointerMove = (event: PointerEvent) => {
      const nextWidth = clamp(startWidth + (event.clientX - originX), minWidth, maxWidth);
      if (pane === "sets") {
        setsPaneManualRef.current = true;
        setIsSetsPaneCollapsed(false);
        setSetsPaneWidth(nextWidth);
        return;
      }

      levelsPaneManualRef.current = true;
      setIsLevelsPaneCollapsed(false);
      setLevelsPaneWidth(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  });

  const dashboardStyle: DashboardStyle = {
    "--modern-dashboard-sets-min-width": `${isSetsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : DASHBOARD_MIN_SETS_PANE_WIDTH}px`,
    "--modern-dashboard-sets-width": `${isSetsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : setsPaneWidth}px`,
    "--modern-dashboard-levels-min-width": `${isLevelsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : DASHBOARD_MIN_LEVELS_PANE_WIDTH}px`,
    "--modern-dashboard-levels-width": `${isLevelsPaneCollapsed ? DASHBOARD_COLLAPSED_PANE_WIDTH : levelsPaneWidth}px`,
  };

  return (
    <main className="modern-shell modern-shell--dashboard">
      <input
        accept=".dat,.DAT"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) {
            void importLocalDatFiles(files);
          }
        }}
        ref={datFileInputRef}
        type="file"
      />

      <div className="modern-dashboard" style={dashboardStyle}>
        <div className="modern-dashboard__pane modern-dashboard__pane--sets">
          {isSetsPaneCollapsed ? (
            <PaneRail
              label="Sets"
              onExpand={() => {
                setIsSetsPaneCollapsed(false);
              }}
            />
          ) : (
            <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--sets">
              <section className="modern-dashboard__panel modern-dashboard__panel--brand">
                <div className="modern-dashboard__brand-bar">
                  <div className="modern-dashboard__brand-lockup">
                    <div aria-hidden="true" className="modern-dashboard__brand-logo">
                      <span className="modern-dashboard__brand-logo-letter">T</span>
                      <span className="modern-dashboard__brand-logo-letter">W</span>
                      <span className="modern-dashboard__brand-logo-letter">O</span>
                    </div>
                    <h1 className="modern-dashboard__title modern-dashboard__title--brand">TILE WORLD ONLINE</h1>
                  </div>
                  <div className="modern-dashboard__brand-actions">
                    <button
                      aria-label="Replay and save settings"
                      className="modern-dashboard__brand-action-button"
                      onClick={() => {
                        setIsAboutOpen(false);
                        setSetInfoFamilyId(null);
                        setIsSettingsOpen(true);
                      }}
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
                      onClick={() => {
                        setIsSettingsOpen(false);
                        setSetInfoFamilyId(null);
                        setIsAboutOpen(true);
                      }}
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
                <SidebarCategoryPicker
                  activeTab={activeTab}
                  onSelect={(tab) => {
                    setActiveTab(tab);
                  }}
                />

                {visibleFamilies.length > 0 ? (
                  <div className="modern-library__family-list">
                    {visibleFamilies.map((family) => {
                      return (
                        <SidebarFamilyButton
                          actionKind={family.section === "local" ? "discard" : "info"}
                          family={family}
                          isActive={activeFamily?.id === family.id}
                          key={family.id}
                          meta={formatFamilyClearedMeta(family, progressByKey)}
                          onAction={discardUploadedFamily}
                          onSelect={handleSelectFamily}
                          onShowInfo={(familyId) => {
                            setIsAboutOpen(false);
                            setSetInfoFamilyId(familyId);
                          }}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="modern-empty-state modern-dashboard__empty-panel">
                    {activeTab === "uploads"
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
                    setIsDropTargetActive(true);
                  }}
                  onDragLeave={(event) => {
                    if (!hasDraggedFiles(event.dataTransfer)) {
                      return;
                    }
                    event.preventDefault();
                    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
                    if (dragDepthRef.current === 0) {
                      setIsDropTargetActive(false);
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
                    setIsDropTargetActive(false);
                    const files = Array.from(event.dataTransfer.files ?? []);
                    if (files.length > 0) {
                      void importLocalDatFiles(files);
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
                    onClick={() => {
                      datFileInputRef.current?.click();
                    }}
                    type="button"
                  >
                    {isImporting ? "Importing..." : "Open Local DAT"}
                  </button>
                </section>
              </section>
            </aside>
          )}
        </div>

        <DashboardSplitter
          isCollapsed={isSetsPaneCollapsed}
          label="sets"
          onPointerDown={(event) => {
            if (event.button !== 0 || isSetsPaneCollapsed || (event.target as HTMLElement).closest("button")) {
              return;
            }
            event.preventDefault();
            startPaneResize("sets", event.clientX);
          }}
          onToggleCollapse={() => {
            setIsSetsPaneCollapsed((current) => !current);
          }}
        />

        <div className="modern-dashboard__pane modern-dashboard__pane--levels">
          {isLevelsPaneCollapsed ? (
            <PaneRail
              label="Levels"
              onExpand={() => {
                setIsLevelsPaneCollapsed(false);
              }}
            />
          ) : (
            <aside className="modern-dashboard__sidebar modern-dashboard__sidebar--levels">
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
                      onSelect={(ruleset) => {
                        setRequestedRuleset(ruleset);
                        persistPreferences({ defaultRuleset: ruleset });
                      }}
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
                  <div className="modern-level-sidebar" role="list">
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
                          onSelect={(levelNumber) => {
                            if (!activeFamily) {
                              return;
                            }

                            setRequestedLevelsByFamily((current) => ({
                              ...current,
                              [activeFamily.id]: levelNumber,
                            }));
                          }}
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
          )}
        </div>

        <DashboardSplitter
          isCollapsed={isLevelsPaneCollapsed}
          label="levels"
          onPointerDown={(event) => {
            if (event.button !== 0 || isLevelsPaneCollapsed || (event.target as HTMLElement).closest("button")) {
              return;
            }
            event.preventDefault();
            startPaneResize("levels", event.clientX);
          }}
          onToggleCollapse={() => {
            setIsLevelsPaneCollapsed((current) => !current);
          }}
        />

        <section className="modern-dashboard__player">
          {activeSelection ? (
            <PlayerApp
              autoDownloadReplaysOnSave={preferences.autoDownloadReplaysOnSave}
              autoSaveWinningHighScoreReplays={preferences.autoSaveWinningHighScoreReplays}
              chromeMode="modern-embedded"
              initialCatalog={catalog}
              initialMode="game"
              initialSelection={activeSelection}
              knownLevelProgressSummary={activeLevelProgress}
              onLevelProgressSaved={handleLevelProgressSaved}
              onSelectionChange={handleEmbeddedSelectionChange}
              services={services}
            />
          ) : (
            <div className="modern-empty-state modern-dashboard__player-empty">
              {isCatalogLoading ? "Loading the default set..." : "No playable level is available for the current selection."}
            </div>
          )}
        </section>
      </div>

      {message ? (
        <div
          aria-hidden="true"
          className="modern-message-modal"
          onClick={dismissMessage}
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
                onClick={dismissMessage}
                type="button"
              >
                ×
              </button>
            </div>
            <div className="modern-message-modal__body">
              <p className="modern-dashboard__copy">{message}</p>
            </div>
            <div className="modern-message-modal__actions">
              <button className="modern-button modern-button--secondary" onClick={dismissMessage} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {setInfoFamily ? (
        <div
          aria-hidden="true"
          className="modern-about-modal"
          onClick={() => {
            setSetInfoFamilyId(null);
          }}
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
                  {setInfoFamily.title}
                </h2>
              </div>
              <button
                aria-label={`Close ${setInfoFamily.title} info`}
                className="modern-dashboard__about-button modern-dashboard__about-button--close"
                onClick={() => {
                  setSetInfoFamilyId(null);
                }}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="modern-about-modal__body">
              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">Overview</p>
                <p className="modern-dashboard__copy">{setInfoFamily.description}</p>
                {setInfoFamily.context ? <p className="modern-dashboard__copy">{setInfoFamily.context}</p> : null}
              </section>

              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">Pack Status</p>
                <p className="modern-dashboard__copy">
                  {setInfoFamily.levelCount} levels
                  {setInfoFamily.yearLabel ? `  ·  ${setInfoFamily.yearLabel}` : ""}
                  {setInfoFamily.sidebarSummary ? `  ·  ${setInfoFamily.sidebarSummary}` : ""}
                </p>
              </section>

              {setInfoFamily.links.length ? (
                <section className="modern-about-modal__section">
                  <p className="modern-preference-block__label">Links</p>
                  <div className="modern-set-card__links modern-about-modal__links">
                    {setInfoFamily.links.map((link) => (
                      <a className="modern-inline-link" href={link.href} key={`${setInfoFamily.id}:${link.href}`} rel="noreferrer" target="_blank">
                        {link.label}
                      </a>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isSettingsOpen ? (
        <div
          aria-hidden="true"
          className="modern-about-modal"
          onClick={() => {
            setIsSettingsOpen(false);
          }}
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
                  Replay Saving
                </h2>
              </div>
              <button
                aria-label="Close settings dialog"
                className="modern-dashboard__about-button modern-dashboard__about-button--close"
                onClick={() => {
                  setIsSettingsOpen(false);
                }}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="modern-about-modal__body modern-settings-modal">
              <label className="modern-settings-modal__option">
                <input
                  checked={preferences.autoSaveWinningHighScoreReplays}
                  onChange={(event) => {
                    persistPreferences({
                      autoSaveWinningHighScoreReplays: event.currentTarget.checked,
                    });
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
                    persistPreferences({
                      autoDownloadReplaysOnSave: event.currentTarget.checked,
                    });
                  }}
                  type="checkbox"
                />
                <div>
                  <strong>Auto-download replays on save</strong>
                  <p className="modern-dashboard__copy">
                    Download a local `.tws.bin` copy whenever a replay is saved to the browser library.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {isAboutOpen ? (
        <div
          aria-hidden="true"
          className="modern-about-modal"
          onClick={() => {
            setIsAboutOpen(false);
          }}
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
                onClick={() => {
                  setIsAboutOpen(false);
                }}
                type="button"
              >
                ×
              </button>
            </div>

            <div className="modern-about-modal__body">
              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">Project</p>
                <p className="modern-dashboard__copy">
                  Tile World Online is a browser conversion of Tile World that keeps the legacy player intact while moving level browsing, replay tools, undo history, and ruleset switching into a modern web UI.
                </p>
              </section>

              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">Replay Status</p>
                <p className="modern-dashboard__copy">
                  The current MS conversion is green on {ABOUT_REPLAY_STATUS.msPassing.toLocaleString()} local replays, assuming the current {ABOUT_REPLAY_STATUS.msLegacyExcluded} native-invalid legacy failures stay excluded. The tracked local Lynx frontier is green on {ABOUT_REPLAY_STATUS.lynxPassing.toLocaleString()} replays.
                </p>
              </section>

              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">License And Credits</p>
                <p className="modern-dashboard__copy">
                  Tile World is free software under the GNU GPL, version 2 or later. Copyright © 2001-2025 Brian Raiter, Madhav Shanbhag, and Eric Schmidt.
                </p>
                <p className="modern-dashboard__copy">
                  Original Tile World was written by Brian Raiter. Tile World 2 was developed by Madhav Shanbhag, with later releases and maintenance by Eric Schmidt, Michael Hansen (Zrax), ChosenID, David Stolp, A Sickly Silver Moon, G lander, and Eevee. Chip&apos;s Challenge itself was designed by Chuck Sommerville.
                </p>
              </section>

              <section className="modern-about-modal__section">
                <p className="modern-preference-block__label">Links</p>
                <div className="modern-set-card__links modern-about-modal__links">
                  <a className="modern-inline-link" href={ABOUT_LINKS.browserPortRepo} rel="noreferrer" target="_blank">
                    Browser conversion repo
                  </a>
                  <a className="modern-inline-link" href={ABOUT_LINKS.tileWorldRepo} rel="noreferrer" target="_blank">
                    Tile World repo
                  </a>
                  <a className="modern-inline-link" href={ABOUT_LINKS.bitbustersClub} rel="noreferrer" target="_blank">
                    Bit Busters Club
                  </a>
                  <a className="modern-inline-link" href={ABOUT_LINKS.bitbustersWiki} rel="noreferrer" target="_blank">
                    Chip Wiki
                  </a>
                  <a className="modern-inline-link" href={ABOUT_LINKS.discord} rel="noreferrer" target="_blank">
                    Discord server
                  </a>
                  <a
                    className="modern-inline-link"
                    href={ABOUT_LINKS.legacy}
                    onClick={(event) => {
                      event.preventDefault();
                      setIsAboutOpen(false);
                      onOpenClassic();
                    }}
                  >
                    Legacy experience
                  </a>
                </div>
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
      ) : null}
    </main>
  );
}
