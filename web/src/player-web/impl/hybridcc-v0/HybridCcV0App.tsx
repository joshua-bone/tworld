import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { computeDatContentHash } from "@level-catalog/impl/importedDatIdentity";
import { createBrowserAppServices } from "@player-web/compose/createBrowserAppServices";
import {
  buildLevelProgressIndex,
  mergeLevelProgressSummaries,
  resolveLevelProgressSummary,
  summarizeEntryProgress,
} from "@player-web/impl/levelProgress";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import type { LibrarySidebarTab } from "@player-web/impl/modern/modernDashboardNavigationController";
import {
  ModernDashboardLevelsPane,
  ModernDashboardPaneRail,
  ModernDashboardSetsPane,
  ModernDashboardSplitter,
} from "@player-web/impl/modern/modernDashboardPanels";
import {
  ModernDashboardMessageModal,
  ModernDashboardSetInfoModal,
} from "@player-web/impl/modern/modernDashboardModals";
import { useModernDashboardPaneLayout } from "@player-web/impl/modern/useModernDashboardPaneLayout";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { BrowserLevelProgressSummary } from "@player-web/ports/BrowserProfileStore";
import {
  HybridCcDatCatalog,
  type HybridCcDatCatalogEntry,
} from "./datCatalog";
import {
  HybridCcV0GameEngineAdapter,
  HybridCcV0LevelRegistry,
} from "./HybridCcV0GameEngineAdapter";
import { loadHybridCcWasm } from "./loadWasm";
import type { HybridCcNativeLevel } from "./nativeLevel";
import { hybridCcSeries } from "./renderProjection";
import {
  buildHybridCcFamilies,
  HYBRID_CC_V0_RULESET_LABEL,
  hybridCcV0SeriesFile,
} from "./uiModel";
import {
  createHybridCcEngine,
  importHybridCcDat,
  type HybridCcWasmModule,
} from "./wasmBridge";

interface LoadedEntry {
  entry: HybridCcDatCatalogEntry;
  levels: HybridCcNativeLevel[];
  hashes: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function familyMatchesSearch(title: string, summary: string | null, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized.length === 0
    || title.toLocaleLowerCase().includes(normalized)
    || summary?.toLocaleLowerCase().includes(normalized) === true;
}

async function loadEntry(
  module: HybridCcWasmModule,
  entry: HybridCcDatCatalogEntry,
): Promise<LoadedEntry> {
  const levels = importHybridCcDat(module, await entry.loadBytes());
  const hashes = await Promise.all(levels.map((level) => computeDatContentHash(level.encoded)));
  return { entry, levels, hashes };
}

export function HybridCcV0App() {
  const datCatalog = useMemo(() => new HybridCcDatCatalog(), []);
  const levelRegistry = useMemo(() => new HybridCcV0LevelRegistry(), []);
  const moduleRef = useRef<HybridCcWasmModule | null>(null);
  const baseServices = useMemo(() => createBrowserAppServices(), []);
  const services = useMemo<BrowserAppServices>(() => {
    const hybridEngine = new HybridCcV0GameEngineAdapter(levelRegistry, {
      create(level, seed) {
        const module = moduleRef.current;
        if (!module) throw new Error("Hybrid v0 WebAssembly is not loaded.");
        return createHybridCcEngine(module, level, seed);
      },
    });
    return {
      ...baseServices,
      engines: { ...baseServices.engines, Hybrid: hybridEngine },
      preloadGameRequest: async (request) => {
        if (request.ruleset === "Hybrid") {
          levelRegistry.load(request);
          return;
        }
        await baseServices.preloadGameRequest?.(request);
      },
    };
  }, [baseServices, levelRegistry]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const activeLevelRowRef = useRef<HTMLButtonElement | null>(null);
  const [entries, setEntries] = useState<HybridCcDatCatalogEntry[]>([]);
  const [seriesByEntryId, setSeriesByEntryId] = useState<ReadonlyMap<string, ReturnType<typeof hybridCcSeries>>>(
    () => new Map(),
  );
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [selectedLevelNumber, setSelectedLevelNumber] = useState<number | null>(null);
  const [progressSummaries, setProgressSummaries] = useState<BrowserLevelProgressSummary[]>([]);
  const [activeTab, setActiveTab] = useState<LibrarySidebarTab>("official");
  const [searchQuery, setSearchQuery] = useState("");
  const [busy, setBusy] = useState(true);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [setInfoFamilyId, setSetInfoFamilyId] = useState<string | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "HybridCC v0 · Tile World Online";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadHybridCcWasm(),
      datCatalog.list(),
      services.profileStore.loadLevelProgressSummaries(),
    ])
      .then(async ([module, availableEntries, storedProgress]) => {
        moduleRef.current = module;
        const results = await Promise.allSettled(availableEntries.map((entry) => loadEntry(module, entry)));
        if (!active) return;
        const nextSeries = new Map<string, ReturnType<typeof hybridCcSeries>>();
        const failures: string[] = [];
        for (const result of results) {
          if (result.status === "rejected") {
            failures.push(errorMessage(result.reason));
            continue;
          }
          const { entry, hashes, levels } = result.value;
          const seriesFile = hybridCcV0SeriesFile(entry);
          levelRegistry.register(seriesFile, levels);
          nextSeries.set(entry.id, hybridCcSeries(seriesFile, entry.name, levels, hashes));
        }
        setEntries(availableEntries);
        setSeriesByEntryId(nextSeries);
        setProgressSummaries(storedProgress);
        const firstPlayable = availableEntries.find((entry) => nextSeries.has(entry.id)) ?? null;
        setSelectedEntryId(firstPlayable?.id ?? null);
        setSelectedLevelNumber(firstPlayable ? nextSeries.get(firstPlayable.id)?.levels[0]?.number ?? null : null);
        if (!firstPlayable || failures.length > 0) setMessage(failures[0] ?? "No playable DAT sets are available.");
        setBusy(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMessage(errorMessage(error));
        setBusy(false);
      });
    return () => { active = false; };
  }, [datCatalog, levelRegistry, services.profileStore]);

  const families = useMemo(
    () => buildHybridCcFamilies(entries, seriesByEntryId),
    [entries, seriesByEntryId],
  );
  const progressByKey = useMemo(() => buildLevelProgressIndex(progressSummaries), [progressSummaries]);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const isSearchActive = deferredSearchQuery.trim().length > 0;
  const visibleFamilies = useMemo(() => families.filter((family) => {
    if (isSearchActive) return familyMatchesSearch(family.title, family.sidebarSummary, deferredSearchQuery);
    if (activeTab === "official") return family.section === "official";
    if (activeTab === "uploads") return family.section === "local";
    return false;
  }), [activeTab, deferredSearchQuery, families, isSearchActive]);
  const activeFamily = families.find((family) => family.id === selectedEntryId) ?? null;
  const activeEntry = selectedEntryId ? seriesByEntryId.get(selectedEntryId) ?? null : null;
  const activeLevel = activeEntry?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const activeEntryProgress = activeEntry
    ? summarizeEntryProgress(activeEntry, progressByKey)
    : { completedLevels: 0 };
  const activeLevelProgress = activeLevel
    ? resolveLevelProgressSummary(activeLevel, "Hybrid", progressByKey)
    : null;
  const setInfoFamily = setInfoFamilyId
    ? families.find((family) => family.id === setInfoFamilyId) ?? null
    : null;
  const {
    dashboardStyle,
    expandLevelsPane,
    expandSetsPane,
    isLevelsPaneCollapsed,
    isSetsPaneCollapsed,
    startPaneResize,
    toggleLevelsPaneCollapsed,
    toggleSetsPaneCollapsed,
  } = useModernDashboardPaneLayout({
    activeEntry,
    activeFamily,
    isCatalogLoading: busy,
    visibleFamilies,
  });

  useEffect(() => {
    activeLevelRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeEntry?.filebase, activeLevel?.number]);

  const selectFamily = (familyId: string) => {
    const family = families.find((candidate) => candidate.id === familyId);
    const series = seriesByEntryId.get(familyId);
    setSelectedEntryId(familyId);
    setSelectedLevelNumber(series?.levels[0]?.number ?? null);
    if (family) setActiveTab(family.section === "local" ? "uploads" : "official");
  };

  const importFiles = async (files: readonly File[]) => {
    const module = moduleRef.current;
    if (!module || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const imported: LoadedEntry[] = [];
      for (const file of files) {
        const entry = await datCatalog.save(file);
        imported.push(await loadEntry(module, entry));
      }
      const availableEntries = await datCatalog.list();
      const nextSeries = new Map(seriesByEntryId);
      for (const { entry, hashes, levels } of imported) {
        const seriesFile = hybridCcV0SeriesFile(entry);
        levelRegistry.register(seriesFile, levels);
        nextSeries.set(entry.id, hybridCcSeries(seriesFile, entry.name, levels, hashes));
      }
      setEntries(availableEntries);
      setSeriesByEntryId(nextSeries);
      const selected = imported.at(-1)!;
      setActiveTab("uploads");
      setSelectedEntryId(selected.entry.id);
      setSelectedLevelNumber(selected.levels[0]?.number ?? null);
    } catch (error: unknown) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const discardUploadedFamily = async (familyId: string) => {
    const entry = entries.find((candidate) => candidate.id === familyId && candidate.source === "imported");
    if (!entry) return;
    await datCatalog.delete(entry.filename);
    levelRegistry.unregister(hybridCcV0SeriesFile(entry));
    const nextEntries = entries.filter((candidate) => candidate.id !== familyId);
    const nextSeries = new Map(seriesByEntryId);
    nextSeries.delete(familyId);
    setEntries(nextEntries);
    setSeriesByEntryId(nextSeries);
    if (selectedEntryId === familyId) {
      const fallback = nextEntries.find((candidate) => nextSeries.has(candidate.id)) ?? null;
      setSelectedEntryId(fallback?.id ?? null);
      setSelectedLevelNumber(fallback ? nextSeries.get(fallback.id)?.levels[0]?.number ?? null : null);
    }
  };

  const activeSelection = activeEntry && activeLevel
    ? { seriesFile: activeEntry.filebase, levelNumber: activeLevel.number }
    : null;

  return (
    <main className="modern-shell modern-shell--dashboard hybridcc-v0">
      <input
        accept=".dat,.DAT"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length > 0) void importFiles(files);
        }}
        ref={fileInputRef}
        type="file"
      />

      <div className="modern-dashboard" style={dashboardStyle}>
        <div className="modern-dashboard__pane modern-dashboard__pane--sets">
          {isSetsPaneCollapsed ? (
            <ModernDashboardPaneRail label="Sets" onExpand={expandSetsPane} />
          ) : (
            <ModernDashboardSetsPane
              activeFamilyId={activeFamily?.id ?? null}
              activeTab={activeTab}
              dragDepthRef={dragDepthRef}
              emptySearchQuery={deferredSearchQuery}
              isDropTargetActive={isDropTargetActive}
              isImporting={busy}
              isSearchActive={isSearchActive}
              onDropDatFiles={(files) => { void importFiles(files); }}
              onOpenAbout={() => setMessage("HybridCC v0 is the C++ port of the earlier HybridCC engine in Tile World Online's shared player.")}
              onOpenDatPicker={() => fileInputRef.current?.click()}
              onOpenSettings={() => setMessage("Player settings, sound controls, and keyboard help are available from the shared game toolbar.")}
              onSelectFamily={selectFamily}
              onSelectTab={setActiveTab}
              onSetDropTargetActive={setIsDropTargetActive}
              onShowFamilyInfo={setSetInfoFamilyId}
              onUploadedFamilyAction={(familyId) => { void discardUploadedFamily(familyId); }}
              progressByKey={progressByKey}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              visibleFamilies={visibleFamilies}
            />
          )}
        </div>

        <ModernDashboardSplitter
          isCollapsed={isSetsPaneCollapsed}
          label="sets"
          onPointerDown={(event) => {
            if (event.button !== 0 || isSetsPaneCollapsed || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            startPaneResize("sets", event.clientX);
          }}
          onToggleCollapse={toggleSetsPaneCollapsed}
        />

        <div className="modern-dashboard__pane modern-dashboard__pane--levels">
          {isLevelsPaneCollapsed ? (
            <ModernDashboardPaneRail label="Levels" onExpand={expandLevelsPane} />
          ) : (
            <ModernDashboardLevelsPane
              activeEntry={activeEntry}
              activeEntryProgress={activeEntryProgress}
              activeFamily={activeFamily}
              activeLevel={activeLevel}
              activeLevelProgress={activeLevelProgress}
              activeLevelRowRef={activeLevelRowRef}
              activeRuleset={activeEntry ? "Hybrid" : null}
              animatedLevelBadgeKey={null}
              onLevelContextMenu={() => {}}
              onSelectLevel={setSelectedLevelNumber}
              onSelectRuleset={() => {}}
              progressByKey={progressByKey}
            />
          )}
        </div>

        <ModernDashboardSplitter
          isCollapsed={isLevelsPaneCollapsed}
          label="levels"
          onPointerDown={(event) => {
            if (event.button !== 0 || isLevelsPaneCollapsed || (event.target as HTMLElement).closest("button")) return;
            event.preventDefault();
            startPaneResize("levels", event.clientX);
          }}
          onToggleCollapse={toggleLevelsPaneCollapsed}
        />

        <section className="modern-dashboard__player">
          {activeSelection ? (
            <PlayerApp
              catalogSource="provided"
              chromeMode="modern-embedded"
              initialCatalog={[...seriesByEntryId.values()]}
              initialMode="game"
              initialSelection={activeSelection}
              key={`${activeSelection.seriesFile}:${activeSelection.levelNumber}`}
              knownLevelProgressSummary={activeLevelProgress}
              onLevelProgressSaved={(summary) => {
                setProgressSummaries((current) => mergeLevelProgressSummaries(current, summary));
              }}
              onSelectionChange={(selection) => {
                const nextEntry = [...seriesByEntryId.entries()].find(([, series]) => series.filebase === selection.seriesFile);
                if (nextEntry) setSelectedEntryId(nextEntry[0]);
                setSelectedLevelNumber(selection.levelNumber);
              }}
              rulesetLabel={(ruleset) => ruleset === "Hybrid" ? HYBRID_CC_V0_RULESET_LABEL : ruleset}
              rulesetOptions={["Hybrid"]}
              services={services}
              visualEnhancementsEnabled={false}
            />
          ) : (
            <div className="modern-empty-state modern-dashboard__player-empty">
              {busy ? "Loading the default set..." : "No playable Hybrid v0 level is available."}
            </div>
          )}
        </section>
      </div>

      {message ? <ModernDashboardMessageModal message={message} onClose={() => setMessage(null)} /> : null}
      {setInfoFamily ? <ModernDashboardSetInfoModal family={setInfoFamily} onClose={() => setSetInfoFamilyId(null)} /> : null}
    </main>
  );
}
