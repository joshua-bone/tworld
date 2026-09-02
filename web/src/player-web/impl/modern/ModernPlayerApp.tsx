import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SeriesCatalogEntry } from "@content/api/series";
import { PlayerApp } from "@player-web/impl/PlayerApp";
import { copyTextToClipboard } from "@player-web/impl/clipboard";
import {
  loadBrowserPlayableCatalog,
  loadModernBootstrapPlayableCatalog,
  resolveModernBootstrapCatalogOptions,
  resolveModernDeferredCatalogBatches,
} from "@player-web/impl/loadBrowserPlayableCatalog";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import { measurePerfAsync } from "@player-web/impl/runtimePerf";
import { savePlayableSelection } from "@player-web/impl/savePlayableSelection";
import { resolveUrlLaunchSelection } from "@player-web/impl/urlLaunch";
import {
  buildStoredLevelProgressKey,
  mergeLevelProgressSummaries,
} from "@player-web/impl/levelProgress";
import {
  buildCuratedCatalogView,
  findSetFamilyById,
  findSetFamilyForSelection,
  resolveSetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import {
  ModernDashboardLevelsPane,
  ModernDashboardPaneRail,
  ModernDashboardSetsPane,
  ModernDashboardSplitter,
} from "@player-web/impl/modern/modernDashboardPanels";
import {
  buildModernDashboardNavigationModel,
  resolveEmbeddedSelectionIntent,
  resolveFamilySelectionIntent,
  tabForFamily,
  type LibrarySidebarTab,
} from "@player-web/impl/modern/modernDashboardNavigationController";
import {
  LevelContextMenuState,
  ModernDashboardAboutModal,
  ModernDashboardLevelContextMenu,
  ModernDashboardMessageModal,
  ModernDashboardSetInfoModal,
  ModernDashboardSettingsModal,
} from "@player-web/impl/modern/modernDashboardModals";
import {
  buildModernLevelLink,
  discardModernUploadedFamily,
  importModernLocalDatFiles,
} from "@player-web/impl/modern/modernDashboardTransferController";
import { useModernDashboardPaneLayout } from "@player-web/impl/modern/useModernDashboardPaneLayout";
import { useModernDashboardSettingsController } from "@player-web/impl/modern/useModernDashboardSettingsController";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  isCompletedBrowserLevelRunResult,
  type BrowserLevelSeedOverride,
  type BrowserLevelProgressSummary,
  type BrowserPreferredRuleset,
} from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

interface ModernPlayerAppProps {
  services: BrowserAppServices;
  onOpenClassic: () => void;
  onOpenMobile?: (() => void) | undefined;
}

type IdleCallbackHandle = number;
type IdleDeadline = {
  didTimeout: boolean;
  timeRemaining: () => number;
};

function waitForBrowserIdle(timeoutMs = 120): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  const windowWithIdleCallback = window as Window & {
    cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
    requestIdleCallback?: (
      callback: (deadline: IdleDeadline) => void,
      options?: { timeout: number },
    ) => IdleCallbackHandle;
  };

  if (typeof windowWithIdleCallback.requestIdleCallback === "function") {
    return new Promise((resolve) => {
      windowWithIdleCallback.requestIdleCallback?.(() => {
        resolve();
      }, { timeout: timeoutMs });
    });
  }

  return new Promise((resolve) => {
    window.setTimeout(resolve, 16);
  });
}

export function ModernPlayerApp({
  services,
  onOpenClassic,
  onOpenMobile,
}: ModernPlayerAppProps) {
  const { deleteImportedDatFile, importDatFile, profileStore, selectionStore } = services;
  const datFileInputRef = useRef<HTMLInputElement | null>(null);
  const profileFileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);
  const [activeTab, setActiveTab] = useState<LibrarySidebarTab>("official");
  const [activeFamilyId, setActiveFamilyId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<SeriesCatalogEntry[]>([]);
  const [lastSelection, setLastSelection] = useState<PlayableSelection | null>(null);
  const [levelProgressSummaries, setLevelProgressSummaries] = useState<BrowserLevelProgressSummary[]>([]);
  const [levelSeedOverrides, setLevelSeedOverrides] = useState<BrowserLevelSeedOverride[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isDropTargetActive, setIsDropTargetActive] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [setInfoFamilyId, setSetInfoFamilyId] = useState<string | null>(null);
  const [requestedRuleset, setRequestedRuleset] = useState<BrowserPreferredRuleset>("Lynx");
  const [requestedLevelsByFamily, setRequestedLevelsByFamily] = useState<Record<string, number>>({});
  const [levelContextMenu, setLevelContextMenu] = useState<LevelContextMenuState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const badgeAnimationTimeoutRef = useRef<number | null>(null);

  const dismissMessage = useEffectEvent(() => {
    setMessage(null);
  });
  const {
    applyPlayerKeyBindings,
    downloadProfileBackup,
    importProfileBackupFile,
    isProfileTransferBusy,
    persistPreferences,
    playerKeyBindings,
    preferences,
    preferencesRef,
    setAction1Key,
    setAutoDownloadReplaysOnSave,
    setAutoSaveWinningHighScoreReplays,
    setDebugModeEnabled,
    setStoredPreferences,
    setUndoKey,
    setVisualEnhancementsEnabled,
    setViewportRadius,
    setViewportSettingsEnabled,
    visualEnhancementsEnabled,
    viewportSettings,
  } = useModernDashboardSettingsController({
    closeSettings: () => {
      setIsSettingsOpen(false);
    },
    profileStore,
    setMessage,
    setRequestedRuleset,
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
      loadPlayableSelection(selectionStore),
      profileStore.loadPreferences(),
      profileStore.loadLevelProgressSummaries(),
      profileStore.loadLevelSeedOverrides(),
    ])
      .then(async ([storedSelection, storedPreferences, storedLevelProgressSummaries, storedLevelSeedOverrides]) => {
        const launch = await resolveUrlLaunchSelection(services, storedSelection);
        const initialSelection = launch.selection;
        const bootstrapOptions = resolveModernBootstrapCatalogOptions(initialSelection);
        const deferredCatalogBatches = resolveModernDeferredCatalogBatches(initialSelection);
        const bootstrapCatalog = await measurePerfAsync("catalogBootstrapMs", () =>
          loadModernBootstrapPlayableCatalog(services, initialSelection),
        );
        if (!active) {
          return;
        }

        const bootstrapCurated = buildCuratedCatalogView(bootstrapCatalog, initialSelection);
        const bootstrapFamily = initialSelection
          ? findSetFamilyForSelection(bootstrapCurated, initialSelection)
          : null;
        const bootstrapTab = bootstrapFamily ? tabForFamily(bootstrapFamily) ?? "official" : "official";
        const bootstrapRuleset =
          bootstrapFamily && initialSelection
            ? resolveSetFamilyRuleset(bootstrapFamily, initialSelection) ?? storedPreferences.defaultRuleset
            : storedPreferences.defaultRuleset;

        startTransition(() => {
          setCatalog(bootstrapCatalog);
          setLastSelection(initialSelection);
          setStoredPreferences(storedPreferences);
          setRequestedRuleset(bootstrapRuleset);
          setActiveFamilyId(bootstrapFamily?.id ?? null);
          setActiveTab(bootstrapTab);
          setRequestedLevelsByFamily(
            bootstrapFamily && initialSelection
              ? {
                  [bootstrapFamily.id]: initialSelection.levelNumber,
                }
              : {},
          );
          setLevelProgressSummaries(storedLevelProgressSummaries);
          setLevelSeedOverrides(storedLevelSeedOverrides);
          setMessage(launch.message);
          setIsCatalogLoading(false);
        });

        void (async () => {
          try {
            if (!bootstrapOptions.includeImported) {
              await waitForBrowserIdle();
              if (!active) {
                return;
              }

              const importedEntries = await measurePerfAsync("catalogImportedMs", () =>
                loadBrowserPlayableCatalog(services, {
                  includeImported: true,
                  seriesFiles: [],
                }),
              );
              if (!active) {
                return;
              }
              if (importedEntries.length > 0) {
                startTransition(() => {
                  setCatalog((current) => mergeSeriesCatalogEntries(current, importedEntries));
                });
              }
            }

            for (const batch of deferredCatalogBatches) {
              await waitForBrowserIdle();
              if (!active) {
                return;
              }

              const nextCatalogBatch = await measurePerfAsync("catalogHydrationBatchMs", () =>
                loadBrowserPlayableCatalog(services, {
                  includeImported: false,
                  ignoreBuiltinLoadErrors: true,
                  seriesFiles: batch,
                }),
              );
              if (!active || nextCatalogBatch.length === 0) {
                continue;
              }

              startTransition(() => {
                setCatalog((current) => mergeSeriesCatalogEntries(current, nextCatalogBatch));
              });
            }
          } catch (error: unknown) {
            if (active) {
              console.warn("Deferred modern catalog hydration failed.", error);
            }
          }
        })();
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
        setIsCatalogLoading(false);
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

  useEffect(() => {
    if (!levelContextMenu) {
      return;
    }

    const dismiss = () => {
      setLevelContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [levelContextMenu]);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const {
    activeEntry,
    activeEntryProgress,
    activeFamily,
    activeLevel,
    activeLevelProgress,
    activeRuleset,
    activeSelection,
    curated,
    fallbackFamily,
    isSearchActive,
    progressByKey,
    visibleFamilies,
  } = useMemo(
    () =>
      buildModernDashboardNavigationModel({
        activeFamilyId,
        activeTab,
        catalog,
        deferredSearchQuery,
        lastSelection,
        levelProgressSummaries,
        requestedLevelsByFamily,
        requestedRuleset,
      }),
    [
      activeFamilyId,
      activeTab,
      catalog,
      deferredSearchQuery,
      lastSelection,
      levelProgressSummaries,
      requestedLevelsByFamily,
      requestedRuleset,
    ],
  );
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
    isCatalogLoading,
    visibleFamilies,
  });

  useEffect(() => {
    if (isCatalogLoading || activeFamilyId || !fallbackFamily) {
      return;
    }

    setActiveFamilyId(fallbackFamily.id);
  }, [activeFamilyId, fallbackFamily, isCatalogLoading]);

  useEffect(() => {
    if (!activeSelection) {
      return;
    }

    void savePlayableSelection(selectionStore, activeSelection).catch((error: unknown) => {
      setMessage((current) => current ?? (error instanceof Error ? error.message : String(error)));
    });
  }, [activeSelection, selectionStore]);

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

  const importLocalDatFiles = useEffectEvent(async (files: readonly File[]) => {
    setIsImporting(true);
    try {
      const result = await importModernLocalDatFiles({
        catalog,
        files: [...files],
        importDatFile,
        requestedRuleset,
      });

      startTransition(() => {
        if (result.nextCatalog) {
          setCatalog(result.nextCatalog);
        }
        if (result.nextActiveTab) {
          setActiveTab(result.nextActiveTab);
        }
        if (result.nextActiveFamilyId && result.nextRequestedLevelNumber !== null) {
          setActiveFamilyId(result.nextActiveFamilyId);
          setRequestedLevelsByFamily((current) => ({
            ...current,
            [result.nextActiveFamilyId!]: result.nextRequestedLevelNumber!,
          }));
        }
        setMessage(result.message);
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsImporting(false);
    }
  });

  const discardUploadedFamily = useEffectEvent(async (familyId: string) => {
    try {
      const result = await discardModernUploadedFamily({
        activeFamilyId: activeFamily?.id ?? null,
        activeTab,
        catalog,
        deleteImportedDatFile,
        familyId,
        lastSelection,
      });
      if (!result) {
        return;
      }

      startTransition(() => {
        setCatalog(result.nextCatalog);
        setRequestedLevelsByFamily((current) => {
          const next = { ...current };
          delete next[result.removedFamilyId];
          return next;
        });
        setActiveFamilyId(result.nextActiveFamilyId);
        setActiveTab(result.nextActiveTab);
        setMessage(result.message);
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const copyLevelLink = useEffectEvent(async (seriesFile: string, ruleset: BrowserPreferredRuleset, levelNumber: number) => {
    try {
      const href = await buildModernLevelLink({
        levelNumber,
        profileStore,
        ruleset,
        seriesFile,
      });
      await copyTextToClipboard(href);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const handleSelectFamily = useEffectEvent((familyId: string) => {
    const intent = resolveFamilySelectionIntent({
      curated,
      deferredSearchQuery,
      familyId,
      requestedRuleset,
    });

    setActiveFamilyId(intent.activeFamilyId);
    if (intent.activeTab) {
      setActiveTab(intent.activeTab);
    }

    setRequestedLevelsByFamily((current) => {
      if (intent.requestedLevelNumber !== null) {
        if (current[familyId] === intent.requestedLevelNumber) {
          return current;
        }

        return {
          ...current,
          [familyId]: intent.requestedLevelNumber,
        };
      }

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
    const intent = resolveEmbeddedSelectionIntent({
      currentLastSelection: lastSelection,
      curated,
      selection,
    });

    if (intent.selectionChanged) {
      setLastSelection(intent.nextLastSelection);
    }
    if (!intent.activeFamilyId || !intent.activeTab) {
      return;
    }

    const nextFamilyId = intent.activeFamilyId;
    const nextTab = intent.activeTab;
    const nextRequestedLevelNumber = intent.requestedLevelNumber;

    setActiveFamilyId((current) => (current === nextFamilyId ? current : nextFamilyId));
    setActiveTab((current) => (current === nextTab ? current : nextTab));
    setRequestedLevelsByFamily((current) => {
      if (nextRequestedLevelNumber === null || current[nextFamilyId] === nextRequestedLevelNumber) {
        return current;
      }

      return {
        ...current,
        [nextFamilyId]: nextRequestedLevelNumber,
      };
    });

    const nextRuleset = intent.requestedRuleset;
    if (nextRuleset) {
      setRequestedRuleset((current) => (current === nextRuleset ? current : nextRuleset));
      if (preferencesRef.current.defaultRuleset !== nextRuleset) {
        persistPreferences({ defaultRuleset: nextRuleset });
      }
    }
  });

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
      <input
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          event.currentTarget.value = "";
          if (file) {
            void importProfileBackupFile(file);
          }
        }}
        ref={profileFileInputRef}
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
              isImporting={isImporting}
              isSearchActive={isSearchActive}
              onDropDatFiles={(files) => {
                void importLocalDatFiles(files);
              }}
              onOpenAbout={() => {
                setIsSettingsOpen(false);
                setSetInfoFamilyId(null);
                setIsAboutOpen(true);
              }}
              onOpenDatPicker={() => {
                datFileInputRef.current?.click();
              }}
              onOpenSettings={() => {
                setIsAboutOpen(false);
                setSetInfoFamilyId(null);
                setIsSettingsOpen(true);
              }}
              onSelectFamily={handleSelectFamily}
              onSelectTab={setActiveTab}
              onSetDropTargetActive={setIsDropTargetActive}
              onShowFamilyInfo={(familyId) => {
                setIsAboutOpen(false);
                setSetInfoFamilyId(familyId);
              }}
              onUploadedFamilyAction={(familyId) => {
                void discardUploadedFamily(familyId);
              }}
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
            if (event.button !== 0 || isSetsPaneCollapsed || (event.target as HTMLElement).closest("button")) {
              return;
            }
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
              activeRuleset={activeRuleset}
              animatedLevelBadgeKey={animatedLevelBadgeKey}
              onLevelContextMenu={(event, levelNumber) => {
                if (activeEntry?.ruleset !== "MS" && activeEntry?.ruleset !== "Lynx") {
                  return;
                }

                event.preventDefault();
                setLevelContextMenu({
                  levelNumber,
                  ruleset: activeEntry.ruleset,
                  seriesFile: activeEntry.filebase,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onSelectLevel={(levelNumber) => {
                if (!activeFamily) {
                  return;
                }

                setRequestedLevelsByFamily((current) => ({
                  ...current,
                  [activeFamily.id]: levelNumber,
                }));
              }}
              onSelectRuleset={(ruleset) => {
                setRequestedRuleset(ruleset);
                persistPreferences({ defaultRuleset: ruleset });
              }}
              progressByKey={progressByKey}
            />
          )}
        </div>

        <ModernDashboardSplitter
          isCollapsed={isLevelsPaneCollapsed}
          label="levels"
          onPointerDown={(event) => {
            if (event.button !== 0 || isLevelsPaneCollapsed || (event.target as HTMLElement).closest("button")) {
              return;
            }
            event.preventDefault();
            startPaneResize("levels", event.clientX);
          }}
          onToggleCollapse={toggleLevelsPaneCollapsed}
        />

        <section className="modern-dashboard__player">
          {activeSelection ? (
            <PlayerApp
              autoDownloadReplaysOnSave={preferences.autoDownloadReplaysOnSave}
              autoSaveWinningHighScoreReplays={preferences.autoSaveWinningHighScoreReplays}
              chromeMode="modern-embedded"
              initialCatalog={catalog}
              initialLevelSeedOverrides={levelSeedOverrides}
              initialMode="game"
              initialSelection={activeSelection}
              knownLevelProgressSummary={activeLevelProgress}
              onLevelProgressSaved={handleLevelProgressSaved}
              onPlayerKeyBindingsChange={applyPlayerKeyBindings}
              onSelectionChange={handleEmbeddedSelectionChange}
              playerKeyBindings={playerKeyBindings}
              services={services}
              debugModeEnabled={preferences.debugModeEnabled}
              visualEnhancementsEnabled={visualEnhancementsEnabled}
              viewportSettings={viewportSettings}
            />
          ) : (
            <div className="modern-empty-state modern-dashboard__player-empty">
              {isCatalogLoading ? "Loading the default set..." : "No playable level is available for the current selection."}
            </div>
          )}
        </section>
      </div>

      {levelContextMenu ? (
        <ModernDashboardLevelContextMenu
          contextMenu={levelContextMenu}
          onClose={() => {
            setLevelContextMenu(null);
          }}
          onCopyLink={(state) => {
            void copyLevelLink(
              state.seriesFile,
              state.ruleset,
              state.levelNumber,
            );
          }}
        />
      ) : null}

      {message ? (
        <ModernDashboardMessageModal
          message={message}
          onClose={dismissMessage}
        />
      ) : null}

      {setInfoFamily ? (
        <ModernDashboardSetInfoModal
          family={setInfoFamily}
          onClose={() => {
            setSetInfoFamilyId(null);
          }}
        />
      ) : null}

      {isSettingsOpen ? (
        <ModernDashboardSettingsModal
          isProfileTransferBusy={isProfileTransferBusy}
          onClose={() => {
            setIsSettingsOpen(false);
          }}
          onDownloadProfile={() => {
            void downloadProfileBackup();
          }}
          onOpenProfileUpload={() => {
            profileFileInputRef.current?.click();
          }}
          onSelectAction1Key={setAction1Key}
          onSelectUndoKey={setUndoKey}
          onSetAutoDownloadReplaysOnSave={setAutoDownloadReplaysOnSave}
          onSetAutoSaveWinningHighScoreReplays={setAutoSaveWinningHighScoreReplays}
          onSetDebugModeEnabled={setDebugModeEnabled}
          onSetVisualEnhancementsEnabled={setVisualEnhancementsEnabled}
          onSetViewportRadius={setViewportRadius}
          onSetViewportSettingsEnabled={setViewportSettingsEnabled}
          playerKeyBindings={playerKeyBindings}
          preferences={preferences}
          visualEnhancementsEnabled={visualEnhancementsEnabled}
          viewportSettings={viewportSettings}
        />
      ) : null}

      {isAboutOpen ? (
        <ModernDashboardAboutModal
          onClose={() => {
            setIsAboutOpen(false);
          }}
          onOpenClassic={onOpenClassic}
          onOpenMobile={onOpenMobile}
        />
      ) : null}
    </main>
  );
}
