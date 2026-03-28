import { startTransition, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { loadBrowserPlayableCatalog } from "@player-web/impl/loadBrowserPlayableCatalog";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { resolveInitialSelection } from "@player-web/impl/playerAppSelectionController";
import { savePlayableSelection } from "@player-web/impl/savePlayableSelection";
import { shouldSyncEmbeddedPlayerCatalog } from "@player-web/impl/playerAppCatalogSync";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { BrowserLevelProgressSummary, BrowserReplayEntry } from "@player-web/ports/BrowserProfileStore";
import type { BrowserLevelSeedOverride } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { SeriesCatalogEntry } from "@content/api/series";

interface UsePlayerAppCatalogControllerOptions {
  chromeMode: "legacy" | "modern" | "modern-embedded" | "mobile";
  services: Pick<BrowserAppServices, "profileStore" | "selectionStore"> & BrowserAppServices;
  initialCatalog: SeriesCatalogEntry[];
  initialLevelSeedOverrides: BrowserLevelSeedOverride[];
  initialMode: "series-list" | "game";
  initialReplayEntries: BrowserReplayEntry[];
  initialSelection: PlayableSelection | null;
  catalog: SeriesCatalogEntry[];
  isCatalogLoading: boolean;
  mode: "series-list" | "game";
  selectedSeriesFile: string | null;
  selectedLevelNumber: number | null;
  currentSelectionRef: Readonly<MutableRefObject<PlayableSelection | null>>;
  notifiedSelectionKeyRef: MutableRefObject<string | null>;
  commitLevelSeedOverrides: (nextOverrides: BrowserLevelSeedOverride[]) => void;
  setCatalog: Dispatch<SetStateAction<SeriesCatalogEntry[]>>;
  setLevelProgressSummaries: Dispatch<SetStateAction<BrowserLevelProgressSummary[]>>;
  setSavedReplayEntries: Dispatch<SetStateAction<BrowserReplayEntry[]>>;
  setSelectedSeriesFile: Dispatch<SetStateAction<string | null>>;
  setSelectedLevelNumber: Dispatch<SetStateAction<number | null>>;
  setMode: Dispatch<SetStateAction<"series-list" | "game">>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setIsCatalogLoading: Dispatch<SetStateAction<boolean>>;
  onSelectionChange?: ((selection: PlayableSelection) => void) | undefined;
}

export function usePlayerAppCatalogController({
  chromeMode,
  services,
  initialCatalog,
  initialLevelSeedOverrides,
  initialMode,
  initialReplayEntries,
  initialSelection,
  catalog,
  isCatalogLoading,
  mode,
  selectedSeriesFile,
  selectedLevelNumber,
  currentSelectionRef,
  notifiedSelectionKeyRef,
  commitLevelSeedOverrides,
  setCatalog,
  setLevelProgressSummaries,
  setSavedReplayEntries,
  setSelectedSeriesFile,
  setSelectedLevelNumber,
  setMode,
  setMessage,
  setIsCatalogLoading,
  onSelectionChange,
}: UsePlayerAppCatalogControllerOptions): void {
  const initialCatalogRef = useRef(initialCatalog);
  const initialLevelSeedOverridesRef = useRef(initialLevelSeedOverrides);
  const initialModeRef = useRef(initialMode);
  const initialReplayEntriesRef = useRef(initialReplayEntries);
  const initialSelectionRef = useRef(initialSelection);
  const isEmbeddedModernChrome = chromeMode === "modern-embedded";

  useEffect(() => {
    if (!isEmbeddedModernChrome) {
      return;
    }

    setCatalog((current) => (
      shouldSyncEmbeddedPlayerCatalog(current, initialCatalog)
        ? initialCatalog
        : current
    ));
  }, [initialCatalog, isEmbeddedModernChrome, setCatalog]);

  useEffect(() => {
    let active = true;

    if (initialCatalogRef.current.length > 0) {
      const resolvedSelection = resolveInitialSelection(initialCatalogRef.current, initialSelectionRef.current);
      startTransition(() => {
        setCatalog(initialCatalogRef.current);
        commitLevelSeedOverrides(initialLevelSeedOverridesRef.current);
        setSavedReplayEntries(initialReplayEntriesRef.current);
        setSelectedSeriesFile(resolvedSelection?.seriesFile ?? null);
        setSelectedLevelNumber(resolvedSelection?.levelNumber ?? null);
        setMode(initialModeRef.current === "game" && resolvedSelection ? "game" : "series-list");
        setMessage(null);
        setIsCatalogLoading(false);
      });
    }

    Promise.all([
      loadBrowserPlayableCatalog(services),
      loadPlayableSelection(services.selectionStore),
      services.profileStore.loadLevelProgressSummaries(),
      services.profileStore.loadReplayEntries(),
      services.profileStore.loadLevelSeedOverrides(),
    ])
      .then(([nextCatalog, storedSelection, storedLevelProgressSummaries, storedReplayEntries, storedLevelSeedOverrides]) => {
        if (!active) {
          return;
        }

        const preferredSelection = currentSelectionRef.current ?? initialSelectionRef.current ?? storedSelection;
        const resolvedSelection = resolveInitialSelection(nextCatalog, preferredSelection);
        startTransition(() => {
          setCatalog(nextCatalog);
          setLevelProgressSummaries(storedLevelProgressSummaries);
          commitLevelSeedOverrides(storedLevelSeedOverrides);
          setSavedReplayEntries(storedReplayEntries);
          setSelectedSeriesFile(resolvedSelection?.seriesFile ?? null);
          setSelectedLevelNumber(resolvedSelection?.levelNumber ?? null);
          setMode(initialModeRef.current === "game" && resolvedSelection ? "game" : "series-list");
          setMessage(null);
        });
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (active) {
          setIsCatalogLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    services,
    setCatalog,
    setIsCatalogLoading,
    setLevelProgressSummaries,
    setMessage,
    setMode,
    setSavedReplayEntries,
    setSelectedLevelNumber,
    setSelectedSeriesFile,
  ]);

  useEffect(() => {
    if (!selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    void savePlayableSelection(services.selectionStore, {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [selectedLevelNumber, selectedSeriesFile, services.selectionStore, setMessage]);

  useEffect(() => {
    if (!selectedSeriesFile || !selectedLevelNumber || !onSelectionChange) {
      return;
    }

    const nextSelectionKey = `${selectedSeriesFile}:${selectedLevelNumber}`;
    if (notifiedSelectionKeyRef.current === nextSelectionKey) {
      return;
    }
    notifiedSelectionKeyRef.current = nextSelectionKey;

    onSelectionChange({
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
    });
  }, [onSelectionChange, selectedLevelNumber, selectedSeriesFile]);
}
