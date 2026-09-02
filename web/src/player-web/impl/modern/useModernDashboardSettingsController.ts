import {
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  loadStoredVisualEnhancementsSettings,
  saveStoredVisualEnhancementsSettings,
} from "@player-web/impl/visualEnhancementsSettings";
import { applyBrowserLocalSettingsSnapshot } from "@player-web/impl/browserProfileBackup";
import {
  loadStoredPlayerKeyBindingsSettings,
  saveStoredPlayerKeyBindingsSettings,
  type BrowserPlayerKeyBindingsSettings,
  type PlayerBindableKey,
} from "@player-web/impl/playerKeyBindingsSettings";
import {
  loadStoredViewportSettings,
  saveStoredViewportSettings,
  type BrowserViewportSettings,
} from "@player-web/impl/viewportSettings";
import {
  createSpecialModesPreset,
  loadStoredSpecialModesPresets,
  loadStoredSpecialModesSettings,
  saveStoredSpecialModesPresets,
  saveStoredSpecialModesSettings,
  type BrowserSpecialModesPreset,
  type BrowserSpecialModesSettings,
} from "@player-web/impl/specialModesSettings";
import { prepareModernProfileBackupDownload, importModernProfileBackup } from "@player-web/impl/modern/modernDashboardTransferController";
import {
  createDefaultBrowserProfilePreferences,
  type BrowserPreferredRuleset,
  type BrowserProfilePreferences,
  type BrowserProfileStore,
} from "@player-web/ports/BrowserProfileStore";

interface UseModernDashboardSettingsControllerOptions {
  closeSettings: () => void;
  profileStore: Pick<BrowserProfileStore, "exportProfileSnapshot" | "importProfileSnapshot" | "savePreferences">;
  reloadPage?: () => void;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setRequestedRuleset: Dispatch<SetStateAction<BrowserPreferredRuleset>>;
}

interface UseModernDashboardSettingsControllerResult {
  applyPlayerKeyBindings: (settings: BrowserPlayerKeyBindingsSettings) => void;
  downloadProfileBackup: () => Promise<void>;
  importProfileBackupFile: (file: File) => Promise<void>;
  isProfileTransferBusy: boolean;
  persistPreferences: (patch: Partial<BrowserProfilePreferences>) => void;
  playerKeyBindings: BrowserPlayerKeyBindingsSettings;
  preferences: BrowserProfilePreferences;
  preferencesRef: MutableRefObject<BrowserProfilePreferences>;
  setAction1Key: (key: PlayerBindableKey) => void;
  setAutoDownloadReplaysOnSave: (enabled: boolean) => void;
  setAutoSaveWinningHighScoreReplays: (enabled: boolean) => void;
  setDebugModeEnabled: (enabled: boolean) => void;
  setStoredPreferences: (preferences: BrowserProfilePreferences) => void;
  setUndoKey: (key: PlayerBindableKey) => void;
  setVisualEnhancementsEnabled: (enabled: boolean) => void;
  setViewportRadius: (radius: number) => void;
  setViewportSettingsEnabled: (enabled: boolean) => void;
  setSpecialModesSettings: (settings: BrowserSpecialModesSettings) => void;
  saveSpecialModesPreset: (name: string) => void;
  loadSpecialModesPreset: (preset: BrowserSpecialModesPreset) => void;
  deleteSpecialModesPreset: (id: string) => void;
  specialModesSettings: BrowserSpecialModesSettings;
  specialModePresets: BrowserSpecialModesPreset[];
  visualEnhancementsEnabled: boolean;
  viewportSettings: BrowserViewportSettings;
}

export function useModernDashboardSettingsController({
  closeSettings,
  profileStore,
  reloadPage = () => {
    window.location.reload();
  },
  setMessage,
  setRequestedRuleset,
}: UseModernDashboardSettingsControllerOptions): UseModernDashboardSettingsControllerResult {
  const [isProfileTransferBusy, setIsProfileTransferBusy] = useState(false);
  const [visualEnhancementsEnabled, setVisualEnhancementsEnabledState] = useState(
    () => loadStoredVisualEnhancementsSettings().enabled,
  );
  const [playerKeyBindings, setPlayerKeyBindingsState] = useState<BrowserPlayerKeyBindingsSettings>(
    () => loadStoredPlayerKeyBindingsSettings(),
  );
  const [viewportSettings, setViewportSettingsState] = useState<BrowserViewportSettings>(
    () => loadStoredViewportSettings(),
  );
  const [specialModesSettings, setSpecialModesSettingsState] = useState<BrowserSpecialModesSettings>(
    () => loadStoredSpecialModesSettings(),
  );
  const [specialModePresets, setSpecialModePresets] = useState<BrowserSpecialModesPreset[]>(
    () => loadStoredSpecialModesPresets(),
  );
  const [preferences, setPreferences] = useState<BrowserProfilePreferences>(
    createDefaultBrowserProfilePreferences(),
  );
  const preferencesRef = useRef<BrowserProfilePreferences>(createDefaultBrowserProfilePreferences());

  const setStoredPreferences = useEffectEvent((storedPreferences: BrowserProfilePreferences) => {
    preferencesRef.current = storedPreferences;
    setPreferences(storedPreferences);
  });

  const applyPlayerKeyBindings = useEffectEvent((settings: BrowserPlayerKeyBindingsSettings) => {
    setPlayerKeyBindingsState(settings);
    saveStoredPlayerKeyBindingsSettings(settings);
  });

  const setVisualEnhancementsEnabled = useEffectEvent((enabled: boolean) => {
    setVisualEnhancementsEnabledState(enabled);
    saveStoredVisualEnhancementsSettings({ enabled });
  });

  const applyViewportSettings = useEffectEvent((settings: BrowserViewportSettings) => {
    setViewportSettingsState(settings);
    saveStoredViewportSettings(settings);
  });

  const setViewportSettingsEnabled = useEffectEvent((enabled: boolean) => {
    applyViewportSettings({
      ...viewportSettings,
      enabled,
    });
  });

  const setViewportRadius = useEffectEvent((radius: number) => {
    applyViewportSettings({
      ...viewportSettings,
      radius,
    });
  });

  const setSpecialModesSettings = useEffectEvent((settings: BrowserSpecialModesSettings) => {
    setSpecialModesSettingsState(settings);
    saveStoredSpecialModesSettings(settings);
  });

  const saveSpecialModesPreset = useEffectEvent((name: string) => {
    const preset = createSpecialModesPreset(name, {
      viewport: viewportSettings,
      specialModes: specialModesSettings,
    });
    const nextPresets = [preset, ...specialModePresets.filter((entry) => entry.name.toLocaleLowerCase() !== preset.name.toLocaleLowerCase())];
    setSpecialModePresets(nextPresets);
    saveStoredSpecialModesPresets(nextPresets);
  });

  const loadSpecialModesPreset = useEffectEvent((preset: BrowserSpecialModesPreset) => {
    applyViewportSettings(preset.configuration.viewport);
    setSpecialModesSettings(preset.configuration.specialModes);
  });

  const deleteSpecialModesPreset = useEffectEvent((id: string) => {
    const nextPresets = specialModePresets.filter((entry) => entry.id !== id);
    setSpecialModePresets(nextPresets);
    saveStoredSpecialModesPresets(nextPresets);
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

  const setAction1Key = useEffectEvent((key: PlayerBindableKey) => {
    applyPlayerKeyBindings({
      ...playerKeyBindings,
      action1Key: key,
    });
  });

  const setUndoKey = useEffectEvent((key: PlayerBindableKey) => {
    applyPlayerKeyBindings({
      ...playerKeyBindings,
      undoKey: key,
    });
  });

  const setAutoSaveWinningHighScoreReplays = useEffectEvent((enabled: boolean) => {
    persistPreferences({ autoSaveWinningHighScoreReplays: enabled });
  });

  const setAutoDownloadReplaysOnSave = useEffectEvent((enabled: boolean) => {
    persistPreferences({ autoDownloadReplaysOnSave: enabled });
  });

  const setDebugModeEnabled = useEffectEvent((enabled: boolean) => {
    persistPreferences({ debugModeEnabled: enabled });
  });

  const downloadProfileBackup = useEffectEvent(async () => {
    if (typeof document === "undefined") {
      setMessage("Profile download requires a browser document context.");
      return;
    }

    setIsProfileTransferBusy(true);
    try {
      const backup = await prepareModernProfileBackupDownload(profileStore);
      const url = URL.createObjectURL(new Blob([backup.payload], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = backup.filename;
      anchor.rel = "noopener";
      anchor.click();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 0);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsProfileTransferBusy(false);
    }
  });

  const importProfileBackupFile = useEffectEvent(async (file: File) => {
    setIsProfileTransferBusy(true);
    try {
      const localSettings = await importModernProfileBackup(profileStore, file);
      applyBrowserLocalSettingsSnapshot(localSettings);
      setVisualEnhancementsEnabledState(
        localSettings?.visualEnhancements?.enabled ?? loadStoredVisualEnhancementsSettings().enabled,
      );
      setPlayerKeyBindingsState(
        localSettings?.playerKeyBindings ?? loadStoredPlayerKeyBindingsSettings(),
      );
      setViewportSettingsState(
        localSettings?.viewport ?? loadStoredViewportSettings(),
      );
      setSpecialModesSettingsState(
        localSettings?.specialModes ?? loadStoredSpecialModesSettings(),
      );
      setSpecialModePresets(
        localSettings?.specialModePresets ?? loadStoredSpecialModesPresets(),
      );
      closeSettings();
      reloadPage();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
      setIsProfileTransferBusy(false);
    }
  });

  return {
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
    setSpecialModesSettings,
    saveSpecialModesPreset,
    loadSpecialModesPreset,
    deleteSpecialModesPreset,
    specialModesSettings,
    specialModePresets,
    visualEnhancementsEnabled,
    viewportSettings,
  };
}
