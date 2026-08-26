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
  collectHybridCcV1UnavailableDatEntries,
  HybridCcV1DatCatalog,
  loadHybridCcV1DatCatalogEntries,
  type HybridCcV1DatCatalogEntry,
  type HybridCcV1UnavailableDatEntry,
} from "./datCatalog";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
} from "./HybridCcV1GameEngineAdapter";
import { loadHybridCcV1Wasm } from "./loadWasm";
import { hybridCcV1Series } from "./renderProjection";
import {
  buildHybridCcV1Families,
  HYBRID_CC_V1_RULESET_LABEL,
  hybridCcV1InitialCatalogMessage,
  hybridCcV1SeriesFile,
} from "./uiModel";
import {
  compileHybridCcV1Run,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  decodeHybridCcV1Replay,
  type HybridCcV1ConvertedLevel,
  type HybridCcV1DatConversionResult,
  type HybridCcV1WasmModule,
  verifyHybridCcV1Replay,
} from "./wasmBridge";

interface LoadedEntry {
  entry: HybridCcV1DatCatalogEntry;
  levels: HybridCcV1ConvertedLevel[];
  hashes: string[];
  unavailableEntries: HybridCcV1UnavailableDatEntry[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function diagnosticMessage(diagnostic: unknown): string | null {
  if (typeof diagnostic === "string") return diagnostic;
  if (diagnostic && typeof diagnostic === "object") {
    const message = Reflect.get(diagnostic, "message");
    if (typeof message === "string") return message;
    try {
      return JSON.stringify(diagnostic);
    } catch {
      return String(diagnostic);
    }
  }
  return diagnostic == null ? null : String(diagnostic);
}

function conversionErrorMessage(
  entry: HybridCcV1DatCatalogEntry,
  conversion: HybridCcV1DatConversionResult,
): string {
  const diagnostics = conversion.diagnostics
    .map((diagnostic) => diagnosticMessage(diagnostic))
    .filter((message): message is string => Boolean(message));
  return diagnostics.length > 0
    ? diagnostics.join("; ")
    : `${entry.filename} contains no levels playable by Hybrid v1.`;
}

function familyMatchesSearch(title: string, summary: string | null, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized.length === 0
    || title.toLocaleLowerCase().includes(normalized)
    || summary?.toLocaleLowerCase().includes(normalized) === true;
}

async function loadEntry(
  module: HybridCcV1WasmModule,
  entry: HybridCcV1DatCatalogEntry,
  bytes: Uint8Array,
): Promise<LoadedEntry> {
  const conversion = convertHybridCcV1Dat(module, bytes);
  const levels = conversion.entries.filter(
    (candidate): candidate is HybridCcV1ConvertedLevel => candidate.status === 0,
  );
  if (levels.length === 0) {
    throw new Error(conversionErrorMessage(entry, conversion));
  }
  const hashes = await Promise.all(
    levels.map((level) => computeDatContentHash(level.nativeLevel.encoded)),
  );
  const unavailableEntries = collectHybridCcV1UnavailableDatEntries(conversion);
  return { entry, levels, hashes, unavailableEntries };
}

export function HybridCcV1App() {
  const datCatalog = useMemo(() => new HybridCcV1DatCatalog(), []);
  const levelRegistry = useMemo(() => new HybridCcV1LevelRegistry(), []);
  const moduleRef = useRef<HybridCcV1WasmModule | null>(null);
  const baseServices = useMemo(() => createBrowserAppServices(), []);
  const services = useMemo<BrowserAppServices>(() => {
    const hybridEngine = new HybridCcV1GameEngineAdapter(levelRegistry, {
      create(level, seed) {
        const module = moduleRef.current;
        if (!module) throw new Error("Hybrid v1 WebAssembly is not loaded.");
        return createHybridCcV1Engine(module, level.nativeLevel, seed);
      },
      decodeReplay(bytes) {
        const module = moduleRef.current;
        if (!module) throw new Error("Hybrid v1 WebAssembly is not loaded.");
        return decodeHybridCcV1Replay(module, bytes);
      },
      verifyReplay(level, bytes) {
        const module = moduleRef.current;
        if (!module) throw new Error("Hybrid v1 WebAssembly is not loaded.");
        return verifyHybridCcV1Replay(module, level.nativeLevel, bytes);
      },
      compileRun(level, seed, denseInputs, checkpointMode) {
        const module = moduleRef.current;
        if (!module) throw new Error("Hybrid v1 WebAssembly is not loaded.");
        return compileHybridCcV1Run(
          module,
          level.nativeLevel,
          seed,
          denseInputs,
          checkpointMode,
        );
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
  const [entries, setEntries] = useState<HybridCcV1DatCatalogEntry[]>([]);
  const [seriesByEntryId, setSeriesByEntryId] = useState<ReadonlyMap<string, ReturnType<typeof hybridCcV1Series>>>(
    () => new Map(),
  );
  const [loadErrorsByEntryId, setLoadErrorsByEntryId] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const [unavailableEntriesByEntryId, setUnavailableEntriesByEntryId] = useState<ReadonlyMap<
    string,
    readonly HybridCcV1UnavailableDatEntry[]
  >>(() => new Map());
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
    document.title = "HybridCC v1 · Tile World Online";
    return () => { document.title = previousTitle; };
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      loadHybridCcV1Wasm(),
      datCatalog.list(),
      services.profileStore.loadLevelProgressSummaries(),
    ])
      .then(async ([module, availableEntries, storedProgress]) => {
        moduleRef.current = module;
        const results = await loadHybridCcV1DatCatalogEntries(
          availableEntries,
          (entry, bytes) => loadEntry(module, entry, bytes),
        );
        if (!active) return;
        const nextSeries = new Map<string, ReturnType<typeof hybridCcV1Series>>();
        const nextLoadErrors = new Map<string, string>();
        const nextUnavailableEntries = new Map<string, readonly HybridCcV1UnavailableDatEntry[]>();
        for (const result of results) {
          if (result.status === "unavailable") {
            nextLoadErrors.set(result.entry.id, result.diagnostic);
            continue;
          }
          const { entry, hashes, levels, unavailableEntries } = result.value;
          const seriesFile = hybridCcV1SeriesFile(entry);
          levelRegistry.register(seriesFile, levels);
          nextSeries.set(entry.id, hybridCcV1Series(seriesFile, entry.name, levels, hashes));
          if (unavailableEntries.length > 0) {
            nextUnavailableEntries.set(entry.id, unavailableEntries);
          }
        }
        setEntries(availableEntries);
        setSeriesByEntryId(nextSeries);
        setLoadErrorsByEntryId(nextLoadErrors);
        setUnavailableEntriesByEntryId(nextUnavailableEntries);
        setProgressSummaries(storedProgress);
        const firstPlayable = availableEntries.find((entry) => nextSeries.has(entry.id)) ?? null;
        setSelectedEntryId(firstPlayable?.id ?? null);
        setSelectedLevelNumber(firstPlayable ? nextSeries.get(firstPlayable.id)?.levels[0]?.number ?? null : null);
        setMessage(hybridCcV1InitialCatalogMessage(nextSeries.size, nextLoadErrors, nextUnavailableEntries));
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
    () => buildHybridCcV1Families(entries, seriesByEntryId, loadErrorsByEntryId, unavailableEntriesByEntryId),
    [entries, loadErrorsByEntryId, seriesByEntryId, unavailableEntriesByEntryId],
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
    if (!series) {
      setMessage(loadErrorsByEntryId.get(familyId) ?? "This DAT set has no playable Hybrid v1 levels.");
      return;
    }
    setSelectedEntryId(familyId);
    setSelectedLevelNumber(series.levels[0]?.number ?? null);
    if (family) setActiveTab(family.section === "local" ? "uploads" : "official");
    const unavailableEntries = unavailableEntriesByEntryId.get(familyId) ?? [];
    if (unavailableEntries.length > 0) {
      setMessage(hybridCcV1InitialCatalogMessage(
        1,
        new Map(),
        new Map([[familyId, unavailableEntries]]),
      ));
    }
  };

  const importFiles = async (files: readonly File[]) => {
    const module = moduleRef.current;
    if (!module || files.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const saveResults = await Promise.allSettled(files.map((file) => datCatalog.save(file)));
      const savedEntries = saveResults.flatMap((result) => (
        result.status === "fulfilled" ? [result.value] : []
      ));
      const conversionResults = await loadHybridCcV1DatCatalogEntries(
        savedEntries,
        (entry, bytes) => loadEntry(module, entry, bytes),
      );
      const availableEntries = await datCatalog.list();
      const nextSeries = new Map(seriesByEntryId);
      const nextLoadErrors = new Map(loadErrorsByEntryId);
      const nextUnavailableEntries = new Map(unavailableEntriesByEntryId);
      const imported: LoadedEntry[] = [];
      for (const result of conversionResults) {
        if (result.status === "unavailable") {
          nextLoadErrors.set(result.entry.id, result.diagnostic);
          nextUnavailableEntries.delete(result.entry.id);
          continue;
        }
        const { entry, hashes, levels, unavailableEntries } = result.value;
        const seriesFile = hybridCcV1SeriesFile(entry);
        levelRegistry.register(seriesFile, levels);
        nextSeries.set(entry.id, hybridCcV1Series(seriesFile, entry.name, levels, hashes));
        nextLoadErrors.delete(entry.id);
        if (unavailableEntries.length > 0) {
          nextUnavailableEntries.set(entry.id, unavailableEntries);
        } else {
          nextUnavailableEntries.delete(entry.id);
        }
        imported.push(result.value);
      }
      setEntries(availableEntries);
      setSeriesByEntryId(nextSeries);
      setLoadErrorsByEntryId(nextLoadErrors);
      setUnavailableEntriesByEntryId(nextUnavailableEntries);
      const selected = imported.at(-1);
      if (selected) {
        setActiveTab("uploads");
        setSelectedEntryId(selected.entry.id);
        setSelectedLevelNumber(selected.levels[0]?.nativeLevel.number ?? null);
      }
      const saveFailure = saveResults.find((result) => result.status === "rejected");
      const conversionFailure = conversionResults.find((result) => result.status === "unavailable");
      if (saveFailure?.status === "rejected") {
        setMessage(errorMessage(saveFailure.reason));
      } else if (conversionFailure?.status === "unavailable") {
        setMessage(conversionFailure.diagnostic);
      } else {
        const importedUnavailableEntries = new Map(imported.flatMap(({ entry, unavailableEntries }) => (
          unavailableEntries.length > 0 ? [[entry.id, unavailableEntries] as const] : []
        )));
        setMessage(hybridCcV1InitialCatalogMessage(nextSeries.size, nextLoadErrors, importedUnavailableEntries));
      }
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
    levelRegistry.unregister(hybridCcV1SeriesFile(entry));
    const nextEntries = entries.filter((candidate) => candidate.id !== familyId);
    const nextSeries = new Map(seriesByEntryId);
    nextSeries.delete(familyId);
    const nextUnavailableEntries = new Map(unavailableEntriesByEntryId);
    nextUnavailableEntries.delete(familyId);
    setEntries(nextEntries);
    setSeriesByEntryId(nextSeries);
    setUnavailableEntriesByEntryId(nextUnavailableEntries);
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
    <main className="modern-shell modern-shell--dashboard hybridcc-v1">
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
              onOpenAbout={() => setMessage("Hybrid v1 is the deterministic 10 Hz HybridCC engine in Tile World Online's shared player.")}
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
              rulesetLabel={(ruleset) => ruleset === "Hybrid" ? HYBRID_CC_V1_RULESET_LABEL : ruleset}
              rulesetOptions={["Hybrid"]}
              services={services}
              visualEnhancementsEnabled={false}
            />
          ) : (
            <div className="modern-empty-state modern-dashboard__player-empty">
              {busy ? "Loading the default set..." : "No playable Hybrid v1 level is available."}
            </div>
          )}
        </section>
      </div>

      {message ? <ModernDashboardMessageModal message={message} onClose={() => setMessage(null)} /> : null}
      {setInfoFamily ? <ModernDashboardSetInfoModal family={setInfoFamily} onClose={() => setSetInfoFamilyId(null)} /> : null}
    </main>
  );
}
