import {
  startTransition,
  useEffect,
  useEffectEvent,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { buildInteractiveReplayExport } from "@game-runtime/impl/buildInteractiveReplayExport";
import { buildInteractiveReplayLaunch } from "@game-runtime/impl/buildInteractiveReplayLaunch";
import { hydrateInteractiveGameSession } from "@game-runtime/impl/hydrateInteractiveGameSession";
import { importInteractiveReplayForLevel } from "@game-runtime/impl/importInteractiveReplayForLevel";
import { describeLocalDatImportMessage } from "@player-web/impl/localDatImportMessaging";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import { replayEntryKey } from "@player-web/impl/modern/replayLibrary";
import { interactiveEngineForRuleset } from "@player-web/impl/playerAppRuntime";
import { buildUrlLaunchHref } from "@player-web/impl/urlLaunch";
import { copyTextToClipboard } from "@player-web/impl/clipboard";
import type { RulesetName } from "@content/api/ruleset";
import type { SeriesCatalogEntry } from "@content/api/series";
import type {
  InteractiveGameReplayLaunch,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";
import type {
  BrowserReplayEntry,
  BrowserStoredReplaySource,
} from "@player-web/ports/BrowserProfileStore";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { LegacyMode } from "@player-web/impl/LegacyCanvasScreen";

interface ReplayLaunchRequest {
  levelNumber: number;
  launch: InteractiveGameReplayLaunch;
  replayName: string;
  seriesFile: string;
  token: number;
}

function isDatFile(file: File): boolean {
  return /\.dat$/iu.test(file.name);
}

interface UsePlayerAppReplayControllerOptions {
  autoDownloadReplaysOnSave: boolean;
  services: Pick<BrowserAppServices, "engines" | "importDatFile" | "profileStore" | "replayTransfer">;
  catalog: SeriesCatalogEntry[];
  currentSeries: SeriesCatalogEntry | null;
  currentLevel: SeriesCatalogEntry["levels"][number] | null;
  currentRuleset: Exclude<RulesetName, "None"> | null;
  replayContextSeries: SeriesCatalogEntry | null;
  replayContextLevel: SeriesCatalogEntry["levels"][number] | null;
  currentLevelReplayEntries: BrowserReplayEntry[];
  latestCurrentReplayEntry: BrowserReplayEntry | null;
  continueReplayEntry: BrowserReplayEntry | null;
  selectedManagedReplayKey: string | null;
  setSelectedManagedReplayKey: Dispatch<SetStateAction<string | null>>;
  pendingReplayEntryKey: string | null;
  setPendingReplayEntryKey: Dispatch<SetStateAction<string | null>>;
  setSavedReplayEntries: Dispatch<SetStateAction<BrowserReplayEntry[]>>;
  setCatalog: Dispatch<SetStateAction<SeriesCatalogEntry[]>>;
  setMode: Dispatch<SetStateAction<LegacyMode>>;
  setSelectedSeriesFile: Dispatch<SetStateAction<string | null>>;
  setSelectedLevelNumber: Dispatch<SetStateAction<number | null>>;
  setReplayLaunchRequest: Dispatch<SetStateAction<ReplayLaunchRequest | null>>;
  setIsPaused: Dispatch<SetStateAction<boolean>>;
  setReloadToken: Dispatch<SetStateAction<number>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setReplaySaveNotice: Dispatch<SetStateAction<string | null>>;
  showManageReplays: boolean;
  setShowManageReplays: Dispatch<SetStateAction<boolean>>;
  setShowReplayMenu: Dispatch<SetStateAction<boolean>>;
  setShowAdvancedMenu: Dispatch<SetStateAction<boolean>>;
  session: InteractiveGameSession | null;
  canResumeOriginalTimeline: boolean;
  resumeOriginalTimeline: () => void;
  prepareForSessionTransition: () => void;
  currentLevelLinkTargetKeyRef: Readonly<MutableRefObject<string | null>>;
  currentLevelLinkCopyButtonRef: Readonly<MutableRefObject<HTMLButtonElement | null>>;
  clearCurrentLevelLinkCopyFeedback: () => void;
  setShowCurrentLevelLinkCopied: Dispatch<SetStateAction<boolean>>;
  currentLevelLinkCopyTimeoutRef: MutableRefObject<number | null>;
  currentLevelLinkCopyFeedbackMs: number;
}

interface UsePlayerAppReplayControllerResult {
  continueFromReplay: () => void;
  copyCurrentLevelLink: () => Promise<void>;
  deleteReplayEntryFromLibrary: (entry: BrowserReplayEntry) => Promise<void>;
  downloadReplayEntry: (entry: BrowserReplayEntry) => Promise<void>;
  importLocalDatFiles: (files: readonly File[]) => Promise<void>;
  importReplayForCurrentLevel: () => Promise<void>;
  importReplayForCurrentLevelFromMenu: () => Promise<void>;
  loadManagedReplay: () => void;
  openManageReplays: () => void;
  saveReplayForCurrentRun: (options?: { autoTriggered?: boolean }) => Promise<void>;
  saveReplayForCurrentRunFromMenu: () => Promise<void>;
  watchLatestReplayFromMenu: () => void;
  watchSavedReplayEntry: (entry: BrowserReplayEntry) => void;
  closeManageReplays: () => void;
}

export function usePlayerAppReplayController({
  autoDownloadReplaysOnSave,
  services,
  catalog,
  currentSeries,
  currentLevel,
  currentRuleset,
  replayContextSeries,
  replayContextLevel,
  currentLevelReplayEntries,
  latestCurrentReplayEntry,
  continueReplayEntry,
  selectedManagedReplayKey,
  setSelectedManagedReplayKey,
  pendingReplayEntryKey,
  setPendingReplayEntryKey,
  setSavedReplayEntries,
  setCatalog,
  setMode,
  setSelectedSeriesFile,
  setSelectedLevelNumber,
  setReplayLaunchRequest,
  setIsPaused,
  setReloadToken,
  setMessage,
  setReplaySaveNotice,
  showManageReplays,
  setShowManageReplays,
  setShowReplayMenu,
  setShowAdvancedMenu,
  session,
  canResumeOriginalTimeline,
  resumeOriginalTimeline,
  prepareForSessionTransition,
  currentLevelLinkTargetKeyRef,
  currentLevelLinkCopyButtonRef,
  clearCurrentLevelLinkCopyFeedback,
  setShowCurrentLevelLinkCopied,
  currentLevelLinkCopyTimeoutRef,
  currentLevelLinkCopyFeedbackMs,
}: UsePlayerAppReplayControllerOptions): UsePlayerAppReplayControllerResult {
  const selectedManagedReplayRow =
    currentLevelReplayEntries.find((entry) => replayEntryKey(entry) === selectedManagedReplayKey)
    ?? currentLevelReplayEntries[0]
    ?? null;

  const addSavedReplayEntry = useEffectEvent((entry: BrowserReplayEntry) => {
    startTransition(() => {
      setSavedReplayEntries((current) =>
        [entry, ...current.filter((existing) => replayEntryKey(existing) !== replayEntryKey(entry))]
          .sort((left, right) => right.savedAtMs - left.savedAtMs),
      );
    });
  });

  const launchReplayForSelection = useEffectEvent((
    selection: PlayableSelection,
    launch: InteractiveGameReplayLaunch,
    replayName: string,
  ) => {
    prepareForSessionTransition();
    setReplayLaunchRequest({
      levelNumber: selection.levelNumber,
      launch,
      replayName,
      seriesFile: selection.seriesFile,
      token: Date.now(),
    });
    setSelectedSeriesFile(selection.seriesFile);
    setSelectedLevelNumber(selection.levelNumber);
    setMode("game");
  });

  const saveReplayArtifactToLibrary = useEffectEvent(
    async (
      artifact: { bytes: Uint8Array; filename: string },
      source: BrowserStoredReplaySource,
      options: {
        finalScore?: number | null;
        result?: BrowserReplayEntry["result"];
        replayFormat?: string;
        undoUsedCount?: number | null;
      } = {},
    ) => {
      if (
        !replayContextLevel ||
        !replayContextSeries ||
        replayContextSeries.ruleset === "None"
      ) {
        return null;
      }

      const storedEntry = await services.profileStore.saveReplayEntry({
        fileName: artifact.filename,
        seriesFile: replayContextSeries.filebase,
        levelNumber: replayContextLevel.number,
        levelName: replayContextLevel.name,
        ruleset: replayContextSeries.ruleset,
        replayFormat: options.replayFormat,
        gameplayHash: replayContextLevel.gameplayHash,
        source,
        result: options.result ?? null,
        finalScore: options.finalScore ?? null,
        undoUsedCount: options.undoUsedCount ?? null,
        bytes: artifact.bytes,
      });
      addSavedReplayEntry(storedEntry);
      return storedEntry;
    },
  );

  const watchSavedReplayEntry = useEffectEvent((entry: BrowserReplayEntry) => {
    let launch: InteractiveGameReplayLaunch;
    try {
      launch = buildInteractiveReplayLaunch(
        interactiveEngineForRuleset(entry.ruleset, services.engines),
        entry,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }

    launchReplayForSelection(
      {
        seriesFile: entry.seriesFile,
        levelNumber: entry.levelNumber,
      },
      launch,
      entry.fileName,
    );
  });

  const importReplayForCurrentLevel = useEffectEvent(async () => {
    if (
      !replayContextLevel ||
      !replayContextSeries ||
      replayContextSeries.ruleset === "None"
    ) {
      return;
    }

    try {
      const imported = await importInteractiveReplayForLevel(
        interactiveEngineForRuleset(replayContextSeries.ruleset, services.engines),
        services.replayTransfer,
        replayContextLevel,
        {
          request: {
            seriesFile: replayContextSeries.filebase,
            levelNumber: replayContextLevel.number,
            ruleset: replayContextSeries.ruleset,
          },
        },
      );
      if (!imported) {
        return;
      }

      const storedEntry = await saveReplayArtifactToLibrary(
        {
          bytes: imported.bytes,
          filename: imported.fileName,
        },
        "imported-file",
        { replayFormat: imported.format },
      );
      setPendingReplayEntryKey(storedEntry ? replayEntryKey(storedEntry) : null);
      setReplayLaunchRequest(null);
      setIsPaused(false);
      setReloadToken((value) => value + 1);
      setMessage(
        storedEntry
          ? `Imported replay ${storedEntry.fileName}. Use Continue with Replay to watch it.`
          : `Imported replay ${imported.fileName}. Use Continue with Replay to watch it.`,
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const continueFromReplay = useEffectEvent(() => {
    if (continueReplayEntry) {
      watchSavedReplayEntry(continueReplayEntry);
      return;
    }

    if (canResumeOriginalTimeline) {
      resumeOriginalTimeline();
    }
  });

  const saveReplayForCurrentRun = useEffectEvent(async (options: { autoTriggered?: boolean } = {}) => {
    if (!session || !replayContextLevel || !replayContextSeries) {
      return;
    }

    try {
      const replaySession = await hydrateInteractiveGameSession(
        interactiveEngineForRuleset(session.request.ruleset, services.engines),
        session,
        { replayData: true },
      );
      const artifact = await buildInteractiveReplayExport(
        interactiveEngineForRuleset(session.request.ruleset, services.engines),
        replayContextSeries.filebase,
        replayContextLevel,
        replaySession,
      );
      if (!artifact) {
        if (options.autoTriggered) {
          return;
        }
        throw new Error("no replay data is available for export yet");
      }

      const storedEntry = await saveReplayArtifactToLibrary(artifact, "saved-run", {
        finalScore: replaySession.run.result?.score?.finalScore ?? null,
        replayFormat: artifact.format,
        result: replaySession.run.result?.outcome ?? null,
        undoUsedCount: replaySession.run.undoUsedCount,
      });
      const downloadedCopy = autoDownloadReplaysOnSave;
      if (downloadedCopy) {
        await services.replayTransfer.exportReplay(artifact);
      }
      if (replaySession.run.result) {
        setReplaySaveNotice(
          storedEntry
            ? `${
                options.autoTriggered ? "Auto-saved" : "Saved"
              } replay as ${storedEntry.fileName}. Added to the library${downloadedCopy ? " and downloaded a copy" : ""}.`
            : `Saved replay as ${artifact.filename}.`,
        );
      } else {
        setMessage(
          storedEntry
            ? `Saved replay ${storedEntry.fileName} to the library${downloadedCopy ? " and downloaded a copy" : ""}.`
            : `Saved replay for Level ${replayContextLevel.number}.`,
        );
      }
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const saveReplayForCurrentRunFromMenu = useEffectEvent(async () => {
    setShowReplayMenu(false);
    await saveReplayForCurrentRun();
  });

  const importReplayForCurrentLevelFromMenu = useEffectEvent(async () => {
    setShowReplayMenu(false);
    await importReplayForCurrentLevel();
  });

  const watchLatestReplayFromMenu = useEffectEvent(() => {
    setShowReplayMenu(false);
    if (latestCurrentReplayEntry) {
      watchSavedReplayEntry(latestCurrentReplayEntry);
    }
  });

  const openManageReplays = useEffectEvent(() => {
    if (currentLevelReplayEntries.length === 0) {
      return;
    }

    setShowReplayMenu(false);
    setShowAdvancedMenu(false);
    const initialEntry = continueReplayEntry ?? currentLevelReplayEntries[0] ?? null;
    setSelectedManagedReplayKey(initialEntry ? replayEntryKey(initialEntry) : null);
    setShowManageReplays(true);
  });

  const closeManageReplays = useEffectEvent(() => {
    setShowManageReplays(false);
  });

  useEffect(() => {
    if (!showManageReplays) {
      return;
    }

    if (currentLevelReplayEntries.length === 0) {
      setShowManageReplays(false);
      setSelectedManagedReplayKey(null);
      return;
    }

    if (
      !selectedManagedReplayKey
      || !currentLevelReplayEntries.some((entry) => replayEntryKey(entry) === selectedManagedReplayKey)
    ) {
      setSelectedManagedReplayKey(
        currentLevelReplayEntries[0] ? replayEntryKey(currentLevelReplayEntries[0]) : null,
      );
    }
  }, [
    currentLevelReplayEntries,
    selectedManagedReplayKey,
    setSelectedManagedReplayKey,
    setShowManageReplays,
    showManageReplays,
  ]);

  useEffect(() => {
    if (
      pendingReplayEntryKey
      && !currentLevelReplayEntries.some((entry) => replayEntryKey(entry) === pendingReplayEntryKey)
    ) {
      setPendingReplayEntryKey(null);
    }
  }, [currentLevelReplayEntries, pendingReplayEntryKey, setPendingReplayEntryKey]);

  const loadManagedReplay = useEffectEvent(() => {
    if (!selectedManagedReplayRow) {
      return;
    }

    setPendingReplayEntryKey(replayEntryKey(selectedManagedReplayRow));
    setShowManageReplays(false);
    setReplayLaunchRequest(null);
    setIsPaused(false);
    setReloadToken((value) => value + 1);
  });

  const downloadReplayEntry = useEffectEvent(async (entry: BrowserReplayEntry) => {
    try {
      await services.replayTransfer.exportReplay({
        bytes: entry.bytes,
        filename: entry.fileName,
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const deleteReplayEntryFromLibrary = useEffectEvent(async (entry: BrowserReplayEntry) => {
    if (entry.source === "reference") {
      setMessage("Bundled reference replays are read-only.");
      return;
    }
    try {
      await services.profileStore.deleteReplayEntry(entry.id);
      startTransition(() => {
        setSavedReplayEntries((current) => current.filter(
          (existing) => replayEntryKey(existing) !== replayEntryKey(entry),
        ));
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

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

    prepareForSessionTransition();
    setReplayLaunchRequest(null);

    const results = await Promise.allSettled(
      candidates.map(async (file) => ({
        file,
        entries: await services.importDatFile(file),
      })),
    );

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
    const preferredRuleset =
      currentRuleset ?? (currentSeries?.ruleset === "None" ? "Lynx" : currentSeries?.ruleset ?? "Lynx");
    const selectedImport =
      successes[0]?.entries.find((entry) => entry.ruleset === preferredRuleset) ?? successes[0]?.entries[0] ?? null;

    startTransition(() => {
      setCatalog((current) => mergeSeriesCatalogEntries(current, importedEntries));
      setMode("series-list");
      setSelectedSeriesFile(selectedImport?.filebase ?? null);
      setSelectedLevelNumber(selectedImport?.levels[0]?.number ?? null);
      setMessage(
        describeLocalDatImportMessage({
          existingFilenames,
          failureMessages: failures,
          successfulFilenames: successes.map(({ file }) => file.name),
          variant: "classic",
        }),
      );
    });
  });

  const copyCurrentLevelLink = useEffectEvent(async () => {
    if (!currentSeries || !currentLevel || !currentRuleset) {
      return;
    }

    const copiedTargetKey = currentLevelLinkTargetKeyRef.current;
    try {
      const importedDatFiles = await services.profileStore.listImportedDatFiles();
      const href = await buildUrlLaunchHref({
        importedDatFiles,
        levelNumber: currentLevel.number,
        ruleset: currentRuleset,
        seriesFile: currentSeries.filebase,
      });
      await copyTextToClipboard(href);
      if (!copiedTargetKey || currentLevelLinkTargetKeyRef.current !== copiedTargetKey) {
        return;
      }
      clearCurrentLevelLinkCopyFeedback();
      setShowCurrentLevelLinkCopied(true);
      currentLevelLinkCopyTimeoutRef.current = window.setTimeout(() => {
        currentLevelLinkCopyTimeoutRef.current = null;
        setShowCurrentLevelLinkCopied(false);
      }, currentLevelLinkCopyFeedbackMs);
      if (!currentLevelLinkCopyButtonRef.current) {
        setMessage("Copied current level URL.");
      }
      currentLevelLinkCopyButtonRef.current?.animate?.(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.9)" },
          { transform: "scale(1.14)" },
          { transform: "scale(1)" },
        ],
        {
          duration: 380,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        },
      );
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  return {
    continueFromReplay,
    copyCurrentLevelLink,
    deleteReplayEntryFromLibrary,
    downloadReplayEntry,
    importLocalDatFiles,
    importReplayForCurrentLevel,
    importReplayForCurrentLevelFromMenu,
    loadManagedReplay,
    openManageReplays,
    saveReplayForCurrentRun,
    saveReplayForCurrentRunFromMenu,
    watchLatestReplayFromMenu,
    watchSavedReplayEntry,
    closeManageReplays,
  };
}
