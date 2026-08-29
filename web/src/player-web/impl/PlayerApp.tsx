import {
  startTransition,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { BrowserSoundEffectsPlayer } from "@player-web/impl/BrowserSoundEffectsPlayer";
import { shouldAutoSaveWinningHighScoreReplay } from "@player-web/impl/autoSaveReplayPolicy";
import {
  isHelpToggleKey,
} from "@player-web/impl/legacyHotkeys";
import type { DirectionInput } from "@player-web/impl/legacyInput";
import {
  legacyMapPixelsForTileSize,
} from "@player-web/impl/legacyRenderPresets";
import { LegacyCanvasScreen, LegacyInventoryStrip, type LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import { TWORLD_BUILD_COMMIT } from "@player-web/impl/buildInfo";
import {
  buildLevelProgressIndex,
  mergeLevelProgressSummaries,
  resolveLevelProgressSummary,
  summarizeEntryProgress,
} from "@player-web/impl/levelProgress";
import {
  buildCuratedCatalogView,
  findSetFamilyForSelection,
  resolveSetFamilyRuleset,
  resolveSetFamilySelection,
  type SetFamily,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import {
  formatMobileFamilyBrowseMeta,
  listMobileLibraryFamilies,
  mobileLibrarySectionForFamily,
  mobileLevelStatusClassName,
  mobileLevelStatusDescription,
  mobileLevelStatusLabel,
  MOBILE_LIBRARY_SECTIONS,
  shiftMobileLibrarySection,
  type MobileLibrarySection,
} from "@player-web/impl/mobile/mobileCatalog";
import {
  loadStoredMobileControlsSettings,
  saveStoredMobileControlsSettings,
  type BrowserMobileControlProfile,
} from "@player-web/impl/mobileControlsSettings";
import {
  PLAYER_BINDABLE_KEYS,
  loadStoredPlayerKeyBindingsSettings,
  saveStoredPlayerKeyBindingsSettings,
  type BrowserPlayerKeyBindingsSettings,
  type PlayerBindableKey,
} from "@player-web/impl/playerKeyBindingsSettings";
import {
  activeGameplayHintOverlay,
  describeGameplayStatus,
  formatGameplayTimeLeft,
} from "@player-web/impl/modern/gameplayShellModel";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  previousInteractiveGameSessionCheckpointTick,
  previousInteractiveGameSessionTickByCount,
  previousInteractiveGameSessionTick,
} from "@game-runtime/impl/interactiveHistoryNavigation";
import { formatInteractiveTickSeconds } from "@game-runtime/impl/interactiveSessionRun";
import {
  createRandomLegacyRandomSeed,
  findLevelSeedOverride,
  normalizeLegacyRandomSeed,
} from "@player-web/impl/levelSeedOverrides";
import { resolveReplayActionContext } from "@player-web/impl/replayContext";
import { selectResultHeadline } from "@player-web/impl/resultHeadlines";
import { measurePerfAsync } from "@player-web/impl/runtimePerf";
import {
  persistTerminalSessionProgress,
  terminalSessionRecordKey,
} from "@player-web/impl/sessionProgressPolicy";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  jumpLevelSelection,
  jumpSeriesSelection,
  resolveFamilySelection,
  resolveInitialSelection,
  resolveLevelSelection,
  resolveProceedAction,
  resolveSeriesSelection,
  shiftLevelSelection,
  shiftSeriesSelection,
} from "@player-web/impl/playerAppSelectionController";
import { gameplayTimeRemainingTicks, nextModernUndoTarget } from "@player-web/impl/playerAppGameplay";
import {
  canResumeInteractiveHistoryTimeline,
  interactiveEngineSupportsReplay,
} from "@player-web/impl/playerAppRuntime";
import {
  defaultPlayerRulesetLabel,
  formatPlayerRulesetLabel,
} from "@player-web/impl/playerRulesetLabel";
import { usePlayerAppCatalogController } from "@player-web/impl/usePlayerAppCatalogController";
import { usePlayerAppInputController } from "@player-web/impl/usePlayerAppInputController";
import { usePlayerAppReplayController } from "@player-web/impl/usePlayerAppReplayController";
import { usePlayerAppSessionController } from "@player-web/impl/usePlayerAppSessionController";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import { encodeRuntimeInputCode } from "@game-core/api/command";
import type { InteractiveGameReplayLaunch } from "@game-runtime/ports/InteractiveGameEngine";
import { replayTransferCodec } from "@game-core/api/replayTransferCodec";
import type { SeriesCatalogEntry } from "@content/api/series";
import {
  describeReplayEntry,
  listReplaysForCurrentLevel,
  listReplaysForSeriesLevel,
  replayEntryKey,
} from "@player-web/impl/modern/replayLibrary";
import {
  type BrowserLevelSeedOverride,
  type BrowserLevelProgressSummary,
  type BrowserResolvedLevelProgressSummary,
  type BrowserReplayEntry,
  createDefaultBrowserProfilePreferences,
} from "@player-web/ports/BrowserProfileStore";
import {
  loadStoredUndoSettings,
  saveStoredUndoSettings,
  toUndoSessionStartOptions,
  type BrowserUndoSettings,
} from "@player-web/impl/undoSettings";
import {
  loadStoredSoundSettings,
  saveStoredSoundSettings,
} from "@player-web/impl/soundSettings";
import { loadStoredVisualEnhancementsSettings } from "@player-web/impl/visualEnhancementsSettings";
const GAME_TICKS_PER_SECOND = 20;
const LOW_TIME_WARNING_TICKS = 10 * GAME_TICKS_PER_SECOND;
const LEGACY_RANDOM_SEED_MAX = 0x7fffffff;
const CURRENT_LEVEL_LINK_COPY_FEEDBACK_MS = 2800;
const MOBILE_PORTRAIT_MARGIN_PX = 132;
const MOBILE_LANDSCAPE_MARGIN_PX = 216;
const MS_MANUAL_STEP_STEPPING = {
  even: 0,
  odd: 4,
} as const;

interface HelpCommand {
  keys: string;
  action: string;
}

interface HelpSection {
  title: string;
  commands: HelpCommand[];
}

function formatModernLevelTimerLabel(level: SeriesCatalogEntry["levels"][number] | null | undefined): string | null {
  if (!level) {
    return null;
  }

  return level.timeLimitSeconds > 0 ? `${level.timeLimitSeconds}s` : "Untimed";
}

const MODERN_SERIES_AUTHOR_FALLBACKS: Readonly<Record<string, string>> = {
  "po100t-MS.dac": "Andrew Menzies",
  "po100t-Lynx.dac": "Andrew Menzies",
  "to100t-MS.dac": "Andrew Menzies",
  "to100t-Lynx.dac": "Andrew Menzies",
  "JBLP1-MS.dac": "J. B. Lewis",
  "JBLP1-Lynx.dac": "J. B. Lewis",
  "JCCLP3.1-MS.dac": "Josh Lee",
  "JCCLP3.1-Lynx.dac": "Josh Lee",
  "JoshL0-MS.dac": "Josh Lee",
  "JoshL0-Lynx.dac": "Josh Lee",
  "TS0-MS.dac": "Tyler Sontag",
  "TS0-Lynx.dac": "Tyler Sontag",
};

function formatModernGameplaySubtitle(
  seriesFile: string | null | undefined,
  level: SeriesCatalogEntry["levels"][number] | null | undefined,
): string {
  const parts: string[] = [];

  if (level?.author) {
    parts.push(level.author);
  } else if (seriesFile && MODERN_SERIES_AUTHOR_FALLBACKS[seriesFile]) {
    parts.push(MODERN_SERIES_AUTHOR_FALLBACKS[seriesFile]);
  }

  const timerLabel = formatModernLevelTimerLabel(level);
  if (timerLabel) {
    parts.push(timerLabel);
  }

  return parts.length > 0 ? parts.join("  ·  ") : "Starting session";
}

function formatSeriesDisplayTitle(seriesFile: string | null | undefined): string | null {
  if (!seriesFile) {
    return null;
  }

  let next = seriesFile.trim().replace(/^public_/u, "");
  next = next.replace(/\.dac$/iu, "");
  next = next.replace(/\.dat$/iu, "");
  next = next.replace(/(?:\.dat)?[-_. ](?:ms|lynx)\s*$/iu, "");
  next = next.replace(/[-_. ]+$/u, "").trim();
  return next === "" ? null : next;
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg aria-hidden="true" className="legacy-toolbar__icon" viewBox="0 0 16 16">
      <path
        d="M2 6h3l4-3v10L5 10H2z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      {muted ? (
        <path d="M11 5l3 6M14 5l-3 6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <>
          <path d="M11 6c1 .5 1.5 1.2 1.5 2S12 9.5 11 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12.5 4.5C14 5.4 15 6.6 15 8s-1 2.6-2.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg aria-hidden="true" className="legacy-toolbar__icon" viewBox="0 0 16 16">
      <path
        d="M3 4v4h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path
        d="M4 8a4.5 4.5 0 1 0 1-3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path d="M8 5v3l2 1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg aria-hidden="true" className="legacy-toolbar__icon" viewBox="0 0 16 16">
      <path
        d="M1.5 4.5h4l1.5 2h7v6.5h-12z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path
        d="M8 9V2.5M5.5 5L8 2.5 10.5 5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className="modern-icon-button__icon" viewBox="0 0 16 16">
      <path
        d="M8 2.5v7M5.5 7.5 8 10l2.5-2.5M3 11.5h10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" className="modern-icon-button__icon" viewBox="0 0 16 16">
      <path
        d="M3.5 4.5h9M6 4.5v7M10 4.5v7M5 2.5h6M4.5 4.5l.5 8h6l.5-8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ChainLinkIcon() {
  return (
    <svg aria-hidden="true" className="modern-link-icon-button__icon" viewBox="0 0 16 16">
      <path
        d="M6.2 9.8 4.6 11.4a2.2 2.2 0 1 1-3.1-3.1L3.8 6M9.8 6.2l1.6-1.6a2.2 2.2 0 1 1 3.1 3.1L12.2 10M5.6 10.4l4.8-4.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="modern-icon-button__icon" viewBox="0 0 16 16">
      <path
        d="M10 2.75h2.75"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path
        d="M12.75 2.75 9.9 5.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="square"
        strokeLinejoin="miter"
        strokeWidth="1.5"
      />
      <path
        d="M12.75 2.75a5.5 5.5 0 1 0 1.05 5.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const SERIES_LIST_HELP: HelpSection[] = [
  {
    title: "Series List",
    commands: [
      { keys: "Up / Down", action: "move the series selection" },
      { keys: "PageUp / PageDown", action: "jump backward or forward by 10 series" },
      { keys: "Home / End", action: "jump to the first or last series" },
      { keys: "Enter / Space", action: "start the selected series" },
      { keys: "Mouse click", action: "select a series; click the selected row again to start it" },
      { keys: "Mouse wheel", action: "scroll the series list by moving the selection" },
      { keys: "Open button / drag DAT", action: "import a local DAT file as MS and Lynx playable entries" },
    ],
  },
];

function undoHoldHelpKeys(undoKey: PlayerBindableKey): string {
  return `${undoKey} / hold ${undoKey}`;
}

function buildGamePlayingHelp(undoKey: PlayerBindableKey, action1Key: PlayerBindableKey, modern: boolean): HelpSection[] {
  return [
    {
      title: "While Playing",
      commands: [
        { keys: "Arrow keys / WASD", action: "move Chip and start the clock" },
        { keys: "Mouse click (MS)", action: "set a mouse goal on the clicked map tile" },
        { keys: `Hold ${action1Key}`, action: "apply Action 1 to movement or mouse-goal inputs while held" },
        { keys: "Hold Shift", action: "run the game clock at 2x speed" },
        { keys: "Space", action: "start the clock without moving, or resume the original timeline after a restore" },
        {
          keys: undoHoldHelpKeys(undoKey),
          action: modern
            ? "rewind 4 ticks at a time, then jump through 1s/2s/4s/8s checkpoints"
            : "rewind 4 ticks at a time and keep rewinding while held when undo history is enabled",
        },
        ...(modern ? [] : [
          { keys: `Cmd/Ctrl + ${undoKey}`, action: "rewind 1 tick at a time" },
          { keys: `Shift + ${undoKey}`, action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
        ]),
        { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
        { keys: "R", action: "restart the current level" },
        ...(modern
          ? [
              { keys: "Bkspc / Delete", action: "pause or resume the modern play view" },
              { keys: "P / PageUp", action: "go to the previous level" },
              { keys: "N / PageDown", action: "go to the next level" },
            ]
          : [{ keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" }]),
        { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
        { keys: "Home / End", action: "also jump to the first or last level when available" },
        { keys: "Escape", action: "return to the series list" },
      ],
    },
  ];
}

function buildGameEndedHelp(undoKey: PlayerBindableKey, action1Key: PlayerBindableKey, modern: boolean): HelpSection[] {
  return [
    {
      title: "After A Level Ends",
      commands: [
        { keys: "Enter", action: "continue: next level after a win, retry after a loss" },
        { keys: "Space", action: "resume the original timeline after a restore, or continue when no rewind is active" },
        { keys: `Hold ${action1Key}`, action: "apply Action 1 to movement or mouse-goal inputs while held" },
        {
          keys: undoHoldHelpKeys(undoKey),
          action: modern
            ? "rewind 4 ticks at a time, then jump through 1s/2s/4s/8s checkpoints"
            : "rewind 4 ticks at a time and keep rewinding while held when undo history is enabled",
        },
        ...(modern ? [] : [
          { keys: `Cmd/Ctrl + ${undoKey}`, action: "rewind 1 tick at a time" },
          { keys: `Shift + ${undoKey}`, action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
        ]),
        { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
        { keys: "R", action: "restart the current level" },
        ...(modern
          ? [
              { keys: "PageUp", action: "go to the previous level" },
              { keys: "N / PageDown", action: "go to the next level" },
            ]
          : [{ keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" }]),
        { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
        { keys: "Home / End", action: "also jump to the first or last level when available" },
        { keys: "Escape", action: "return to the series list" },
      ],
    },
  ];
}

const GLOBAL_HELP: HelpSection[] = [
  {
    title: "Help",
    commands: [
      { keys: "? / F1 / button", action: "toggle this help overlay" },
    ],
  },
];

interface PlayerAppProps {
  autoDownloadReplaysOnSave?: boolean;
  autoSaveWinningHighScoreReplays?: boolean;
  services: BrowserAppServices;
  chromeMode?: "legacy" | "modern" | "modern-embedded" | "mobile";
  initialCatalog?: SeriesCatalogEntry[];
  initialLevelSeedOverrides?: BrowserLevelSeedOverride[];
  initialMode?: LegacyMode;
  initialReplayEntries?: BrowserReplayEntry[];
  initialSelection?: PlayableSelection | null;
  knownLevelProgressSummary?: BrowserResolvedLevelProgressSummary | null;
  onOpenClassicShell?: () => void;
  onOpenDesktopShell?: () => void;
  onExitGame?: () => void;
  onLevelProgressSaved?: (summary: BrowserLevelProgressSummary) => void;
  onPlayerKeyBindingsChange?: (settings: BrowserPlayerKeyBindingsSettings) => void;
  onSelectionChange?: (selection: PlayableSelection) => void;
  playerKeyBindings?: BrowserPlayerKeyBindingsSettings;
  inventoryKeyCountLabelsEnabled?: boolean;
  visualEnhancementsEnabled?: boolean;
  debugModeEnabled?: boolean;
  catalogSource?: "browser" | "provided";
  rulesetOptions?: readonly SetFamilyRuleset[];
  rulesetLabel?: (ruleset: SetFamilyRuleset) => string;
}

export function PlayerApp({
  autoDownloadReplaysOnSave = createDefaultBrowserProfilePreferences().autoDownloadReplaysOnSave,
  autoSaveWinningHighScoreReplays = createDefaultBrowserProfilePreferences().autoSaveWinningHighScoreReplays,
  services,
  chromeMode = "legacy",
  initialCatalog = [],
  initialLevelSeedOverrides = [],
  initialMode = "series-list",
  initialReplayEntries = [],
  initialSelection = null,
  knownLevelProgressSummary = null,
  onOpenClassicShell,
  onOpenDesktopShell,
  onExitGame,
  onLevelProgressSaved,
  onPlayerKeyBindingsChange,
  onSelectionChange,
  playerKeyBindings: playerKeyBindingsProp,
  inventoryKeyCountLabelsEnabled: inventoryKeyCountLabelsEnabledProp,
  visualEnhancementsEnabled: visualEnhancementsEnabledProp,
  debugModeEnabled = createDefaultBrowserProfilePreferences().debugModeEnabled,
  catalogSource = "browser",
  rulesetOptions = ["Lynx", "MS"],
  rulesetLabel = defaultPlayerRulesetLabel,
}: PlayerAppProps) {
  const { engines, profileStore } = services;
  const levelAttemptCountsRef = useRef<Map<string, number>>(new Map());
  const undoSettingsSeedRef = useRef<BrowserUndoSettings | null>(null);
  if (undoSettingsSeedRef.current === null) {
    undoSettingsSeedRef.current = loadStoredUndoSettings();
  }
  const playerKeyBindingsSeedRef = useRef<BrowserPlayerKeyBindingsSettings | null>(null);
  if (playerKeyBindingsSeedRef.current === null) {
    playerKeyBindingsSeedRef.current = playerKeyBindingsProp ?? loadStoredPlayerKeyBindingsSettings();
  }
  const visualEnhancementsEnabledSeedRef = useRef(loadStoredVisualEnhancementsSettings().enabled);
  const [mode, setMode] = useState<LegacyMode>(initialMode);
  const [catalog, setCatalog] = useState<SeriesCatalogEntry[]>([]);
  const [levelProgressSummaries, setLevelProgressSummaries] = useState<BrowserLevelProgressSummary[]>([]);
  const [savedReplayEntries, setSavedReplayEntries] = useState<BrowserReplayEntry[]>([]);
  const [levelSeedOverrides, setLevelSeedOverrides] = useState<BrowserLevelSeedOverride[]>(initialLevelSeedOverrides);
  const [selectedSeriesFile, setSelectedSeriesFile] = useState<string | null>(null);
  const [selectedLevelNumber, setSelectedLevelNumber] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [showCurrentLevelLinkCopied, setShowCurrentLevelLinkCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showReplayMenu, setShowReplayMenu] = useState(false);
  const [showAdvancedMenu, setShowAdvancedMenu] = useState(false);
  const [showSoundControls, setShowSoundControls] = useState(false);
  const [showHistoryControls, setShowHistoryControls] = useState(false);
  const [showManageReplays, setShowManageReplays] = useState(false);
  const [mobileSetSection, setMobileSetSection] = useState<MobileLibrarySection>("official");
  const [mobileSheet, setMobileSheet] = useState<"levels" | "menu" | "sets" | null>(null);
  const [pendingReplayEntryKey, setPendingReplayEntryKey] = useState<string | null>(null);
  const [selectedManagedReplayKey, setSelectedManagedReplayKey] = useState<string | null>(null);
  const [replaySaveNotice, setReplaySaveNotice] = useState<string | null>(null);
  const [seedInputValue, setSeedInputValue] = useState("");
  const [soundMuted, setSoundMuted] = useState(() => loadStoredSoundSettings().muted);
  const [soundVolume, setSoundVolume] = useState(() => loadStoredSoundSettings().volume);
  const [undoSettings, setUndoSettings] = useState<BrowserUndoSettings>(undoSettingsSeedRef.current);
  const [playerKeyBindingsState, setPlayerKeyBindingsState] = useState<BrowserPlayerKeyBindingsSettings>(
    playerKeyBindingsSeedRef.current,
  );
  const [mobileControlProfile, setMobileControlProfile] = useState<BrowserMobileControlProfile>(
    () => loadStoredMobileControlsSettings().profile,
  );
  const [manualMsStepParity, setManualMsStepParity] = useState<"even" | "odd">("even");
  const [manualRunStarted, setManualRunStarted] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [heldUndoMode, setHeldUndoMode] = useState<"coarse" | "fine" | "checkpoint" | null>(null);
  const [isMobileLandscape, setIsMobileLandscape] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth > window.innerHeight : false,
  );
  const [mobileBoardSizePx, setMobileBoardSizePx] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [replayLaunchRequest, setReplayLaunchRequest] = useState<{
    levelNumber: number;
    launch: InteractiveGameReplayLaunch;
    replayName: string;
    seriesFile: string;
    token: number;
  } | null>(null);
  const soundPlayerRef = useRef<BrowserSoundEffectsPlayer | null>(null);
  const undoStartOptionsRef = useRef(toUndoSessionStartOptions(undoSettingsSeedRef.current));
  const datFileInputRef = useRef<HTMLInputElement | null>(null);
  const gameplayFocusRef = useRef<HTMLElement | null>(null);
  const mobileShellRef = useRef<HTMLElement | null>(null);
  const mobileBoardViewportRef = useRef<HTMLDivElement | null>(null);
  const replayMenuRef = useRef<HTMLDivElement | null>(null);
  const advancedMenuRef = useRef<HTMLDivElement | null>(null);
  const recordedTerminalSessionRef = useRef<string | null>(null);
  const notifiedSelectionKeyRef = useRef<string | null>(null);
  const appliedInitialSelectionKeyRef = useRef<string | null>(null);
  const currentSelectionRef = useRef<PlayableSelection | null>(initialSelection);
  const levelSeedOverridesRef = useRef<BrowserLevelSeedOverride[]>(initialLevelSeedOverrides);
  const resetGameplayInputBuffersRef = useRef<() => void>(() => {});
  const stopHeldUndoRef = useRef<() => void>(() => {});
  const currentLevelLinkCopyButtonRef = useRef<HTMLButtonElement | null>(null);
  const currentLevelLinkCopyTimeoutRef = useRef<number | null>(null);
  const currentLevelLinkTargetKeyRef = useRef<string | null>(null);
  const resultSheetBestScoreSnapshotRef = useRef<{ bestScore: number | null; recordKey: string } | null>(null);
  const mobileSetSheetSwipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const playerKeyBindings = playerKeyBindingsProp ?? playerKeyBindingsState;
  const undoKeyBinding = playerKeyBindings.undoKey;
  const action1KeyBinding = playerKeyBindings.action1Key;
  const availableAction1BindingKeys = PLAYER_BINDABLE_KEYS.filter((key) => key !== undoKeyBinding);
  const availableUndoBindingKeys = PLAYER_BINDABLE_KEYS.filter((key) => key !== action1KeyBinding);

  const commitLevelSeedOverrides = useEffectEvent((nextOverrides: BrowserLevelSeedOverride[]) => {
    levelSeedOverridesRef.current = nextOverrides;
    setLevelSeedOverrides(nextOverrides);
  });

  const prepareForSessionTransition = useEffectEvent(() => {
    resetGameplayInputBuffersRef.current();
    setIsRunning(false);
    setIsPaused(false);
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    stopHeldUndoRef.current();
    setIsFastForwarding(false);
  });

  const clearGameplayInputs = useEffectEvent(() => {
    resetGameplayInputBuffersRef.current();
    stopHeldUndoRef.current();
    setIsFastForwarding(false);
  });

  const syncSoundForSession = useEffectEvent((nextSession: InteractiveGameSession | null) => {
    const player = soundPlayerRef.current;
    if (!player) {
      return;
    }

    if (mode !== "game" || !nextSession || showHelp || isPaused) {
      player.reset();
      return;
    }

    player.syncFrame(
      `${nextSession.request.seriesFile}:${nextSession.request.levelNumber}:${nextSession.request.ruleset}`,
      nextSession.request.ruleset,
      nextSession.frame.snapshot.tick,
      nextSession.frame.snapshot.soundEffects,
    );
  });

  usePlayerAppCatalogController({
    catalogSource,
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
  });

  const currentSeries = catalog.find((series) => series.filebase === selectedSeriesFile) ?? null;
  const currentLevel = currentSeries?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const showToolsInventory = currentLevel?.hasSpecialTools === true;
  const currentSeriesRuleset = currentSeries?.ruleset ?? null;
  const currentManualMsStepping = MS_MANUAL_STEP_STEPPING[manualMsStepParity];
  const currentLevelExists = currentLevel !== null;
  const {
    session,
    isSessionLoading,
    liveSessionRef,
    sessionStartedFromReplayRef,
    advanceTick,
    performModernUndo,
    resumeLivePlayFromRestore,
    resumeOriginalTimeline,
    resumeOriginalTimelineFromSpace,
    toggleModernPause,
    undoPreviousCheckpoint,
    undoPreviousTick,
    undoPreviousTickBurst,
  } = usePlayerAppSessionController({
    engines,
    profileStore,
    mode,
    setMode,
    currentSeriesRuleset,
    currentLevelExists,
    currentManualMsStepping,
    replayLaunchRequest,
    reloadToken,
    selectedSeriesFile,
    selectedLevelNumber,
    levelSeedOverridesRef,
    undoStartOptionsRef,
    isPaused,
    enableRewindAndResume: undoSettings.enableRewindAndResume,
    prepareForSessionTransition,
    clearGameplayInputs,
    setIsRunning,
    setIsPaused,
    setManualRunStarted,
    setMessage,
    syncSoundForSession,
  });
  const currentRuleset = session?.request.ruleset ?? (currentSeries?.ruleset === "None" ? null : currentSeries?.ruleset ?? null);
  const currentRulesetDisplayLabel = formatPlayerRulesetLabel(currentRuleset, rulesetLabel);
  const replaysSupported = currentRuleset !== null && interactiveEngineSupportsReplay(currentRuleset, engines);
  const replayRuleset = replaysSupported ? currentRuleset : null;
  const showManualMsStepToggle =
    currentSeriesRuleset === "MS" &&
    replayLaunchRequest === null &&
    session?.mode !== "replay";
  const currentLevelSeedTarget =
    selectedSeriesFile && selectedLevelNumber && currentRuleset
      ? {
          seriesFile: selectedSeriesFile,
          levelNumber: selectedLevelNumber,
          ruleset: currentRuleset,
        }
      : null;
  const currentLevelSeedOverride = findLevelSeedOverride(levelSeedOverrides, currentLevelSeedTarget);
  const isLevelSeedLocked = currentLevelSeedOverride !== null;
  const visualEnhancementsEnabled = visualEnhancementsEnabledProp ?? visualEnhancementsEnabledSeedRef.current;
  const inventoryKeyCountLabelsEnabled = inventoryKeyCountLabelsEnabledProp ?? visualEnhancementsEnabled;
  const activeRandomSeed = session ? Number.parseInt(session.frame.snapshot.randomState.main.initial, 10) : null;
  const parsedSeedInput = seedInputValue.trim() === "" ? null : Number.parseInt(seedInputValue.trim(), 10);
  const isSeedInputValid =
    parsedSeedInput !== null &&
    Number.isInteger(parsedSeedInput) &&
    parsedSeedInput >= 0 &&
    parsedSeedInput <= LEGACY_RANDOM_SEED_MAX;
  const canApplyLevelSeedOverride =
    Boolean(currentLevelSeedTarget) &&
    isSeedInputValid &&
    normalizeLegacyRandomSeed(parsedSeedInput!) !== currentLevelSeedOverride?.randomSeed;
  const canClearLevelSeedOverride = isLevelSeedLocked;
  const canToggleLevelSeedOverride = isLevelSeedLocked ? canClearLevelSeedOverride : canApplyLevelSeedOverride;
  const currentSelection =
    selectedSeriesFile && selectedLevelNumber
      ? {
          seriesFile: selectedSeriesFile,
          levelNumber: selectedLevelNumber,
        }
      : null;
  const curatedCatalogView = useMemo(
    () => buildCuratedCatalogView(catalog, currentSelection),
    [catalog, currentSelection],
  );
  const progressByKey = useMemo(
    () => buildLevelProgressIndex(levelProgressSummaries),
    [levelProgressSummaries],
  );
  const currentFamily = findSetFamilyForSelection(curatedCatalogView, currentSelection);
  const currentFamilyRuleset = currentFamily ? resolveSetFamilyRuleset(currentFamily, currentSelection) : null;
  const currentPreferredRuleset = currentRuleset ?? currentFamilyRuleset;
  const currentFamilyEntry =
    currentFamily && currentFamilyRuleset ? currentFamily.launchEntries[currentFamilyRuleset] ?? null : currentSeries;
  const currentFamilyProgress = currentFamilyEntry ? summarizeEntryProgress(currentFamilyEntry, progressByKey) : null;
  const currentResolvedLevelProgressSummary =
    knownLevelProgressSummary ?? resolveLevelProgressSummary(currentLevel, currentPreferredRuleset, progressByKey);
  const mobileVisibleFamilies = useMemo(
    () => listMobileLibraryFamilies(curatedCatalogView, mobileSetSection),
    [curatedCatalogView, mobileSetSection],
  );
  const replayActionContext = resolveReplayActionContext(
    catalog,
    {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
    },
    session
      ? {
          seriesFile: session.request.seriesFile,
          levelNumber: session.request.levelNumber,
        }
      : null,
  );
  const replayContextSeries = replayActionContext.series;
  const replayContextLevel = replayActionContext.level;
  const previousHistoryTick = session ? previousInteractiveGameSessionTick(session) : null;
  const previousCoarseHistoryTick = session ? previousInteractiveGameSessionTickByCount(session, 4) : null;
  const previousHistoryCheckpointTick = session ? previousInteractiveGameSessionCheckpointTick(session) : null;
  const modernUndoTarget = session ? nextModernUndoTarget(session) : null;
  const canUseModernUndo = Boolean(session?.history.enabled && modernUndoTarget !== null);
  const canUndoToPreviousTick = Boolean(session?.history.enabled && previousHistoryTick !== null);
  const canUndoToPreviousCheckpoint = Boolean(
    session?.history.enabled && previousHistoryCheckpointTick !== null,
  );
  const canResumeOriginalTimeline = canResumeInteractiveHistoryTimeline(
    session,
    undoSettings.enableRewindAndResume,
  );
  const isMobileChrome = chromeMode === "mobile";
  const isModernChrome = chromeMode === "modern" || chromeMode === "modern-embedded";
  const usesModernGameUi = isModernChrome || isMobileChrome;
  const mobileRenderTileSize = 48;
  const mobileRenderedBoardSizePx = legacyMapPixelsForTileSize(mobileRenderTileSize);
  const mobileCanvasFrameSizePx = mobileBoardSizePx > 0
    ? Math.min(mobileBoardSizePx, mobileRenderedBoardSizePx)
    : mobileRenderedBoardSizePx;
  const historyStatusMessage =
    mode !== "game" || !session || !session.history.enabled || session.history.restoreMode === "live"
      ? null
      : session.history.restoreMode === "restored-paused"
        ? `Restored to ${formatInteractiveTickSeconds(session.history.currentTick)}s. ${
            canResumeOriginalTimeline
              ? `Press Space or use Continue with Replay to replay forward to ${formatInteractiveTickSeconds(session.history.latestTick)}s.`
              : usesModernGameUi
                ? `Use ${undoKeyBinding} to keep rewinding, or take over with a live move.`
                : `Use ${undoKeyBinding}, Cmd/Ctrl+${undoKeyBinding}, or Shift+${undoKeyBinding} to keep rewinding, or take over with a live move.`
          }`
        : `Replaying the original timeline from ${formatInteractiveTickSeconds(session.history.currentTick)}s to ${formatInteractiveTickSeconds(session.history.replayTargetTick ?? session.history.latestTick)}s. ${
            undoSettings.allowTakeoverDuringHistoricalReplay
              ? "Any live input will fork a new timeline."
              : "Live takeover is disabled in history settings."
          }`;
  const modernStatusLabel =
    isPaused
      ? "Paused"
      : session?.mode === "manual" &&
          session.frame.snapshot.status === "playing" &&
          !manualRunStarted &&
          !isSessionLoading
        ? "Ready"
        : describeGameplayStatus(session, isSessionLoading);
  const modernHintOverlayText = activeGameplayHintOverlay(session);
  const runResult = session?.run.result ?? null;
  const currentLevelAttemptKey =
    session && runResult ? `${session.request.seriesFile}:${String(session.request.levelNumber)}` : null;
  const currentTerminalRecordKey =
    session && runResult && mode === "game" && session.mode !== "replay"
      ? terminalSessionRecordKey(session)
      : null;
  if (currentTerminalRecordKey === null) {
    resultSheetBestScoreSnapshotRef.current = null;
  } else if (resultSheetBestScoreSnapshotRef.current?.recordKey !== currentTerminalRecordKey) {
    resultSheetBestScoreSnapshotRef.current = {
      bestScore: currentResolvedLevelProgressSummary?.bestScore ?? null,
      recordKey: currentTerminalRecordKey,
    };
  }
  const currentResultAttemptCount =
    currentLevelAttemptKey === null
      ? 1
      : (levelAttemptCountsRef.current.get(currentLevelAttemptKey) ?? 0) +
        (currentTerminalRecordKey !== null && recordedTerminalSessionRef.current !== currentTerminalRecordKey ? 1 : 0);
  const runResultHeadline =
    runResult && session
      ? selectResultHeadline({
          attemptCount: currentResultAttemptCount,
          entropyKey: [
            session.request.seriesFile,
            String(session.request.levelNumber),
            session.request.ruleset,
            runResult.outcome,
            String(session.frame.snapshot.currentTime),
            String(session.run.undoUsedCount),
            runResult.cause?.kind ?? "none",
            runResult.cause?.actorName ?? "none",
            String(runResult.cause?.position?.x ?? 0),
            String(runResult.cause?.position?.y ?? 0),
            String(currentResultAttemptCount),
          ].join(":"),
          result: runResult,
        })
      : null;
  const runResultScore = runResult?.score ?? null;
  const previousBestScoreBeforeCurrentResult = resultSheetBestScoreSnapshotRef.current?.bestScore ?? null;
  const runResultScoreRecordMeta =
    runResultScore === null
      ? null
      : previousBestScoreBeforeCurrentResult === null || runResultScore.finalScore > previousBestScoreBeforeCurrentResult
        ? {
            detail: "New record!",
            kind: "new-record" as const,
          }
        : runResultScore.finalScore === previousBestScoreBeforeCurrentResult
          ? {
              detail: "Tied record!",
              kind: "tied-record" as const,
            }
          : {
              detail: `Record: ${previousBestScoreBeforeCurrentResult} pts`,
              kind: "below-record" as const,
            };
  const previousKnownLevelProgress = currentResolvedLevelProgressSummary;
  const canSaveReplay = Boolean(
    replaysSupported && session?.run.replayAvailable && replayContextLevel && replayContextSeries,
  );
  const currentLevelReplayEntries = replaysSupported
    ? session
      ? listReplaysForSeriesLevel(
          savedReplayEntries,
          session.request.seriesFile,
          session.request.levelNumber,
          session.request.ruleset,
          replayContextLevel?.gameplayHash ?? null,
        )
      : listReplaysForCurrentLevel(
          savedReplayEntries,
          currentFamily,
          currentLevel?.number ?? null,
          currentRuleset,
          currentLevel?.gameplayHash ?? null,
        )
    : [];
  const latestCurrentReplayEntry = currentLevelReplayEntries[0] ?? null;
  const continueReplayEntry =
    currentLevelReplayEntries.find((entry) => replayEntryKey(entry) === pendingReplayEntryKey)
    ?? latestCurrentReplayEntry;
  const canContinueFromReplay = continueReplayEntry !== null;
  const currentReplayCountLabel =
    currentLevelReplayEntries.length === 1 ? "1 replay" : `${currentLevelReplayEntries.length} replays`;
  const modernGameplaySubtitle = formatModernGameplaySubtitle(replayContextSeries?.filebase, replayContextLevel);
  const canCopyCurrentLevelLink = Boolean(currentSeries && currentLevel && currentRuleset);
  const mobileSeriesLabel = currentFamily?.title ?? formatSeriesDisplayTitle(currentSeries?.filebase ?? currentSeries?.name ?? replayContextSeries?.filebase);
  const currentLevelLinkTargetKey =
    currentSeries !== null && currentLevel !== null && currentRuleset !== null
      ? `${currentSeries.filebase}:${currentLevel.number}:${currentRuleset}`
      : null;
  const modernLevelTitle = replayContextLevel
    ? `Level ${replayContextLevel.number}: ${replayContextLevel.name}`
    : replayContextSeries?.filebase ?? "Loading level";
  currentLevelLinkTargetKeyRef.current = currentLevelLinkTargetKey;
  const currentLevelReplayRows = useMemo(
    () =>
      currentLevelReplayEntries.map((entry) => {
        const replayDescription = describeReplayEntry(entry);
        const inspection = entry.replayFormat ? null : replayTransferCodec.inspect(entry.bytes);
        return {
          entry,
          replayDescription,
          moveCount: inspection?.payload.moves.length ?? null,
          secondsLabel: inspection ? `${formatInteractiveTickSeconds(Math.max(inspection.bestTimeTicks, 0))}s` : "Unknown",
        };
      }),
    [currentLevelReplayEntries],
  );
  const selectedManagedReplayRow =
    currentLevelReplayRows.find((row) => replayEntryKey(row.entry) === selectedManagedReplayKey)
    ?? currentLevelReplayRows[0]
    ?? null;
  const replayModeNote =
    session?.mode === "replay"
      ? "This session is replaying recorded moves. Restart returns to live play; rewinding and taking over can branch a new timeline where history settings allow it."
      : session?.history.restoreMode === "replaying-history"
        ? "The original timeline is replaying forward. Any live move can fork a new run when historical takeover is enabled."
        : null;
  const isEmbeddedModernChrome = chromeMode === "modern-embedded";
  const canTogglePause = Boolean(session && !isSessionLoading && (isPaused || session.frame.snapshot.status === "playing"));
  const mobileMovementControlsDisabled =
    !isMobileChrome ||
    mode !== "game" ||
    !session ||
    isSessionLoading ||
    isPaused ||
    showHelp ||
    showManageReplays ||
    mobileSheet !== null ||
    message !== null ||
    session.frame.snapshot.status !== "playing" ||
    (
      session.history.restoreMode === "replaying-history" &&
      !undoSettings.allowTakeoverDuringHistoricalReplay
    );
  const helpSections =
    mode === "series-list"
      ? [...SERIES_LIST_HELP, ...GLOBAL_HELP]
      : session?.frame.snapshot.status === "playing"
        ? [...buildGamePlayingHelp(undoKeyBinding, action1KeyBinding, usesModernGameUi), ...GLOBAL_HELP]
        : [...buildGameEndedHelp(undoKeyBinding, action1KeyBinding, usesModernGameUi), ...GLOBAL_HELP];

  const clearCurrentLevelLinkCopyFeedback = () => {
    if (currentLevelLinkCopyTimeoutRef.current !== null) {
      window.clearTimeout(currentLevelLinkCopyTimeoutRef.current);
      currentLevelLinkCopyTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    const player = new BrowserSoundEffectsPlayer();
    soundPlayerRef.current = player;
    player.setMuted(soundMuted);
    player.setVolume(soundVolume);
    player.prewarm();

    return () => {
      player.dispose();
      soundPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearCurrentLevelLinkCopyFeedback();
    };
  }, []);

  useEffect(() => {
    clearCurrentLevelLinkCopyFeedback();
    setShowCurrentLevelLinkCopied(false);
  }, [currentLevelLinkTargetKey]);

  useEffect(() => {
    saveStoredSoundSettings({
      muted: soundMuted,
      volume: soundVolume,
    });
    soundPlayerRef.current?.setMuted(soundMuted);
    soundPlayerRef.current?.setVolume(soundVolume);
  }, [soundMuted, soundVolume]);

  useEffect(() => {
    saveStoredMobileControlsSettings({
      profile: mobileControlProfile,
    });
  }, [mobileControlProfile]);

  const applyPlayerKeyBindings = useEffectEvent((settings: BrowserPlayerKeyBindingsSettings) => {
    saveStoredPlayerKeyBindingsSettings(settings);
    setPlayerKeyBindingsState(settings);
    onPlayerKeyBindingsChange?.(settings);
  });

  useEffect(() => {
    if (mode !== "game") {
      return;
    }

    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "game") {
      return;
    }

    gameplayFocusRef.current?.focus({ preventScroll: true });
  }, [mode, selectedLevelNumber, selectedSeriesFile]);

  useLayoutEffect(() => {
    if (!isMobileChrome || mode !== "game") {
      return;
    }

    const shell = mobileShellRef.current;
    if (!shell) {
      return;
    }

    let animationFrameId = 0;
    const measure = () => {
      animationFrameId = 0;
      const bounds = shell.getBoundingClientRect();
      const isLandscape = bounds.width > bounds.height;
      setIsMobileLandscape((current) => (current === isLandscape ? current : isLandscape));
      const availableWidth = Math.max(
        0,
        bounds.width - (isLandscape ? MOBILE_LANDSCAPE_MARGIN_PX * 2 : 0),
      );
      const availableHeight = Math.max(
        0,
        bounds.height - (isLandscape ? 0 : MOBILE_PORTRAIT_MARGIN_PX * 2),
      );
      const nextSize = Math.max(0, Math.floor(Math.min(availableWidth, availableHeight)));
      setMobileBoardSizePx((current) => (current === nextSize ? current : nextSize));
    };
    const scheduleMeasure = () => {
      if (animationFrameId !== 0) {
        return;
      }
      animationFrameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    let resizeObserver: ResizeObserver | null = null;
    if ("ResizeObserver" in window) {
      resizeObserver = new ResizeObserver(() => {
        scheduleMeasure();
      });
      resizeObserver.observe(shell);
    }
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
      if (animationFrameId !== 0) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isMobileChrome, mode]);

  useEffect(() => {
    undoStartOptionsRef.current = toUndoSessionStartOptions(undoSettings);
    saveStoredUndoSettings(undoSettings);
  }, [undoSettings]);

  useEffect(() => {
    currentSelectionRef.current =
      selectedSeriesFile && selectedLevelNumber
        ? {
            seriesFile: selectedSeriesFile,
            levelNumber: selectedLevelNumber,
          }
        : null;
  }, [selectedLevelNumber, selectedSeriesFile]);

  useEffect(() => {
    if (mode !== "game" || !session || session.frame.snapshot.status === "playing") {
      recordedTerminalSessionRef.current = null;
    }
  }, [mode, session]);

  useEffect(() => {
    if (!runResult) {
      setReplaySaveNotice(null);
    }
  }, [runResult]);

  useEffect(() => {
    const progressSummary = persistTerminalSessionProgress({
      attemptCounts: levelAttemptCountsRef.current,
      gameplayHash: currentLevel?.gameplayHash ?? null,
      mode,
      nowMs: Date.now(),
      recordedSession: recordedTerminalSessionRef,
      save: (summary) => {
        onLevelProgressSaved?.(summary);
        setLevelProgressSummaries((current) => mergeLevelProgressSummaries(current, summary));
        void profileStore.saveLevelProgressSummary(summary);
      },
      session,
      sessionStartedFromReplay: sessionStartedFromReplayRef.current,
    });
    if (!progressSummary || !session || !session.run.result) {
      return;
    }

    const result = session.run.result;

    if (
      session.run.replayAvailable &&
      shouldAutoSaveWinningHighScoreReplay({
        enabled: autoSaveWinningHighScoreReplays,
        previousProgress: previousKnownLevelProgress,
        result: result.outcome,
        score: result.score?.finalScore ?? null,
      })
    ) {
      void saveReplayForCurrentRun({ autoTriggered: true });
    }
  }, [
    autoSaveWinningHighScoreReplays,
    mode,
    onLevelProgressSaved,
    previousKnownLevelProgress,
    profileStore,
    currentLevel,
    session,
  ]);

  const dismissMessage = useEffectEvent(() => {
    setMessage(null);
  });

  useEffect(() => {
    if (!usesModernGameUi || !message) {
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
  }, [dismissMessage, message, usesModernGameUi]);

  useEffect(() => {
    if (!usesModernGameUi || !showManageReplays) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowManageReplays(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showManageReplays, usesModernGameUi]);

  useEffect(() => {
    if (!isMobileChrome || mobileSheet === null) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSheet(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileChrome, mobileSheet]);

  const applySelection = useEffectEvent((selection: PlayableSelection) => {
    setReplayLaunchRequest(null);
    setSelectedSeriesFile(selection.seriesFile);
    setSelectedLevelNumber(selection.levelNumber);
    setIsPaused(false);
    setMessage(null);
  });

  const selectSeries = useEffectEvent((seriesFile: string) => {
    const nextSelection = resolveSeriesSelection(catalog, seriesFile, selectedLevelNumber);
    if (!nextSelection) {
      return;
    }

    applySelection(nextSelection);
  });

  const selectLevel = useEffectEvent((levelNumber: number) => {
    const nextSelection = resolveLevelSelection(currentSeries, levelNumber);
    if (!nextSelection) {
      return;
    }

    applySelection(nextSelection);
  });

  const selectSetFamily = useEffectEvent((family: SetFamily) => {
    const nextSelection = resolveFamilySelection(
      family,
      currentPreferredRuleset,
      currentFamily?.id ?? null,
      currentLevel?.number ?? null,
    );
    if (!nextSelection) {
      return;
    }

    applySelection(nextSelection);
  });

  const toggleMobileSheet = useEffectEvent((nextSheet: "levels" | "menu" | "sets") => {
    setShowReplayMenu(false);
    setShowAdvancedMenu(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    if (nextSheet === "sets") {
      setMobileSetSection(mobileLibrarySectionForFamily(currentFamily));
    }
    setMobileSheet((current) => (current === nextSheet ? null : nextSheet));
  });

  const closeMobileSheet = useEffectEvent(() => {
    setMobileSheet(null);
  });

  const exitCurrentGame = useEffectEvent(() => {
    prepareForSessionTransition();
    setReplayLaunchRequest(null);

    if (isEmbeddedModernChrome) {
      setMessage(null);
      return;
    }

    if (chromeMode === "modern" && onExitGame) {
      onExitGame();
      return;
    }

    setMode("series-list");
  });

  const launchSelection = useEffectEvent((selection: PlayableSelection) => {
    prepareForSessionTransition();
    setReplayLaunchRequest(null);
    setSelectedSeriesFile(selection.seriesFile);
    setSelectedLevelNumber(selection.levelNumber);
    setMode("game");
    setMessage(null);
  });

  useEffect(() => {
    if (isCatalogLoading || !initialSelection) {
      return;
    }

    const resolvedSelection = resolveInitialSelection(catalog, initialSelection);
    if (!resolvedSelection) {
      return;
    }

    const nextSelectionKey = `${resolvedSelection.seriesFile}:${resolvedSelection.levelNumber}`;
    const currentSelectionKey =
      selectedSeriesFile && selectedLevelNumber ? `${selectedSeriesFile}:${selectedLevelNumber}` : null;

    if (mode === "game" && currentSelectionKey === nextSelectionKey) {
      appliedInitialSelectionKeyRef.current = nextSelectionKey;
      return;
    }

    if (appliedInitialSelectionKeyRef.current === nextSelectionKey) {
      return;
    }

    appliedInitialSelectionKeyRef.current = nextSelectionKey;
    launchSelection(resolvedSelection);
  }, [catalog, initialSelection, isCatalogLoading, mode, selectedLevelNumber, selectedSeriesFile]);

  const activateSeries = useEffectEvent((seriesFile: string) => {
    const series = catalog.find((candidate) => candidate.filebase === seriesFile) ?? null;
    if (!series) {
      return;
    }
    if (series.ruleset === "None") {
      setMode("series-list");
      setMessage(`${series.filebase} does not declare a playable ruleset.`);
      return;
    }

    selectSeries(seriesFile);
    setMode("game");
  });

  const changeSelectedSeriesBy = useEffectEvent((delta: number) => {
    const nextSelection = shiftSeriesSelection(catalog, selectedSeriesFile, selectedLevelNumber, delta);
    if (!nextSelection) {
      return;
    }

    applySelection(nextSelection);
  });

  const jumpSelectedSeries = useEffectEvent((position: "first" | "last") => {
    const nextSelection = jumpSeriesSelection(catalog, selectedLevelNumber, position);
    if (!nextSelection) {
      return;
    }

    applySelection(nextSelection);
  });

  const changeLevelBy = useEffectEvent((delta: number) => {
    const nextLevelNumber = shiftLevelSelection(currentSeries, currentLevel?.number ?? null, delta);
    if (nextLevelNumber === null) {
      return;
    }

    setReplayLaunchRequest(null);
    setIsPaused(false);
    setSelectedLevelNumber(nextLevelNumber);
  });

  const jumpLevel = useEffectEvent((position: "first" | "last") => {
    const nextLevelNumber = jumpLevelSelection(currentSeries, position);
    if (nextLevelNumber === null) {
      return;
    }

    setReplayLaunchRequest(null);
    setIsPaused(false);
    setSelectedLevelNumber(nextLevelNumber);
  });

  const restartCurrentLevel = useEffectEvent(() => {
    setReplayLaunchRequest(null);
    setIsPaused(false);
    setReloadToken((value) => value + 1);
  });

  const proceedAfterLevelEnd = useEffectEvent(() => {
    if (!session) {
      return;
    }

    resetGameplayInputBuffersRef.current();
    setIsPaused(false);

    const nextAction = resolveProceedAction(
      session.frame.snapshot.status,
      currentSeries,
      currentLevel?.number ?? null,
      usesModernGameUi,
    );
    if (!nextAction) {
      return;
    }

    switch (nextAction.kind) {
      case "select-level":
        setReplayLaunchRequest(null);
        setSelectedLevelNumber(nextAction.levelNumber);
        setMessage(null);
        return;
      case "series-list":
        setMode("series-list");
        setMessage(nextAction.message);
        return;
      default:
        restartCurrentLevel();
    }
  });
  const {
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
  } = usePlayerAppReplayController({
    autoDownloadReplaysOnSave,
    services,
    catalog,
    currentSeries,
    currentLevel,
    currentRuleset: replayRuleset,
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
    currentLevelLinkCopyFeedbackMs: CURRENT_LEVEL_LINK_COPY_FEEDBACK_MS,
  });

  const applyLevelSeedOverride = useEffectEvent(async () => {
    if (!currentLevelSeedTarget || !isSeedInputValid) {
      return;
    }

    const nextOverride = {
      ...currentLevelSeedTarget,
      randomSeed: normalizeLegacyRandomSeed(parsedSeedInput!),
    } satisfies BrowserLevelSeedOverride;
    const nextOverrides = [
      nextOverride,
      ...levelSeedOverridesRef.current.filter(
        (entry) =>
          !(
            entry.seriesFile === nextOverride.seriesFile &&
            entry.levelNumber === nextOverride.levelNumber &&
            entry.ruleset === nextOverride.ruleset
          ),
      ),
    ];

    commitLevelSeedOverrides(nextOverrides);
    await profileStore.saveLevelSeedOverride(nextOverride);
    setShowAdvancedMenu(false);
    restartCurrentLevel();
  });

  const clearLevelSeedOverride = useEffectEvent(async () => {
    if (!currentLevelSeedTarget || !currentLevelSeedOverride) {
      return;
    }

    const nextOverrides = levelSeedOverridesRef.current.filter(
      (entry) =>
        !(
          entry.seriesFile === currentLevelSeedTarget.seriesFile &&
          entry.levelNumber === currentLevelSeedTarget.levelNumber &&
          entry.ruleset === currentLevelSeedTarget.ruleset
        ),
    );

    commitLevelSeedOverrides(nextOverrides);
    await profileStore.deleteLevelSeedOverride(currentLevelSeedTarget);
    setShowAdvancedMenu(false);
    restartCurrentLevel();
  });

  const renderCurrentLevelLinkButton = () => (
    <div className="modern-game-header__title-action">
      <button
        aria-label="Copy link to this level"
        className={`modern-link-icon-button${showCurrentLevelLinkCopied ? " modern-link-icon-button--copied" : ""}`}
        disabled={!canCopyCurrentLevelLink}
        onClick={() => {
          void copyCurrentLevelLink();
        }}
        ref={currentLevelLinkCopyButtonRef}
        title="Copy link to this level"
        type="button"
      >
        <ChainLinkIcon />
      </button>
      <span
        aria-live="polite"
        className={`modern-link-copy-feedback${showCurrentLevelLinkCopied ? " modern-link-copy-feedback--visible" : ""}`}
        role="status"
      >
        {showCurrentLevelLinkCopied ? "Copied URL" : ""}
      </span>
    </div>
  );


  const toggleHelp = useEffectEvent(() => {
    resetGameplayInputBuffersRef.current();
    setMobileSheet(null);
    setShowReplayMenu(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    setShowHelp((value) => !value);
  });

  const closeHelp = useEffectEvent(() => {
    resetGameplayInputBuffersRef.current();
    stopHeldUndoRef.current();
    setShowHelp(false);
  });

  const handleMobileSetSheetTouchStart = useEffectEvent((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }

    mobileSetSheetSwipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
    };
  });

  const handleMobileSetSheetTouchEnd = useEffectEvent((event: ReactTouchEvent<HTMLDivElement>) => {
    const start = mobileSetSheetSwipeStartRef.current;
    const touch = event.changedTouches[0];
    mobileSetSheetSwipeStartRef.current = null;
    if (!start || !touch) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) {
      return;
    }

    setMobileSetSection((current) => shiftMobileLibrarySection(current, deltaX > 0 ? -1 : 1));
  });

  const toggleSoundControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowHistoryControls(false);
    setShowSoundControls((value) => !value);
  });

  const closeSoundControls = useEffectEvent(() => {
    stopHeldUndoRef.current();
    setShowSoundControls(false);
  });

  const toggleHistoryControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls((value) => !value);
  });

  const closeHistoryControls = useEffectEvent(() => {
    stopHeldUndoRef.current();
    setShowHistoryControls(false);
  });

  const toggleMuted = useEffectEvent(() => {
    if (soundMuted || soundVolume <= 0) {
      setSoundMuted(false);
      if (soundVolume <= 0) {
        setSoundVolume(0.7);
      }
      return;
    }

    setSoundMuted(true);
  });

  const openDatPicker = useEffectEvent(() => {
    datFileInputRef.current?.click();
  });

  const {
    handleMobileDirectionPointerDown,
    handleMobileDirectionPointerEnd,
    handleModernMapClick,
    preventMobileTouchDefault,
    resetGameplayInputBuffers,
    resetMobileDirectionalInputState,
    stopHeldUndo,
  } = usePlayerAppInputController({
    mode,
    selectedSeriesFile,
    usesModernGameUi,
    isMobileChrome,
    isPaused,
    isRunning,
    isSessionLoading,
    showHelp,
    showSoundControls,
    showHistoryControls,
    showReplayMenu,
    showAdvancedMenu,
    showManageReplays,
    mobileSheet,
    message,
    manualRunStarted,
    setManualRunStarted,
    setIsRunning,
    isFastForwarding,
    setIsFastForwarding,
    heldUndoMode,
    setHeldUndoMode,
    undoKeyBinding,
    action1KeyBinding,
    allowTakeoverDuringHistoricalReplay: undoSettings.allowTakeoverDuringHistoricalReplay,
    canResumeOriginalTimeline,
    sessionStatus: session?.frame.snapshot.status,
    liveSessionRef,
    advanceTick,
    performModernUndo,
    resumeOriginalTimelineFromSpace,
    resumeLivePlayFromRestore,
    toggleModernPause,
    undoPreviousCheckpoint,
    undoPreviousTick,
    undoPreviousTickBurst,
    activateSeries,
    changeSelectedSeriesBy,
    jumpSelectedSeries,
    proceedAfterLevelEnd,
    restartCurrentLevel,
    exitCurrentGame,
    changeLevelBy,
    jumpLevel,
    toggleHelp,
    closeHelp,
    closeSoundControls,
    closeHistoryControls,
    setShowReplayMenu,
    setShowAdvancedMenu,
    focusGameplaySurface: () => {
      gameplayFocusRef.current?.focus({ preventScroll: true });
    },
    unlockSound: () => {
      soundPlayerRef.current?.unlock();
    },
  });
  resetGameplayInputBuffersRef.current = resetGameplayInputBuffers;
  stopHeldUndoRef.current = stopHeldUndo;

  useEffect(() => {
    if (showHelp) {
      setShowSoundControls(false);
      setShowHistoryControls(false);
      setShowReplayMenu(false);
      setShowAdvancedMenu(false);
    }
  }, [showHelp]);

  useEffect(() => {
    if (mode !== "game" || showHelp || isPaused) {
      soundPlayerRef.current?.reset();
      return;
    }

    syncSoundForSession(liveSessionRef.current);
  }, [isPaused, mode, showHelp, syncSoundForSession]);

  useEffect(() => {
    if (mode !== "game" || !session || session.frame.snapshot.status !== "playing") {
      setIsPaused(false);
    }
  }, [mode, session]);

  useEffect(() => {
    if (mode !== "game") {
      setShowReplayMenu(false);
      setShowAdvancedMenu(false);
    }
  }, [mode]);

  useEffect(() => {
    if (
      !isMobileChrome ||
      (
        mode === "game" &&
        !isPaused &&
        !showHelp &&
        !showManageReplays &&
        mobileSheet === null &&
        message === null &&
        session?.frame.snapshot.status === "playing"
      )
    ) {
      return;
    }

    resetMobileDirectionalInputState();
  }, [
    isMobileChrome,
    isPaused,
    message,
    mobileSheet,
    mode,
    resetMobileDirectionalInputState,
    session?.frame.snapshot.status,
    showHelp,
    showManageReplays,
  ]);

  useEffect(() => {
    if (!showReplayMenu) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (replayMenuRef.current?.contains(target)) {
        return;
      }

      setShowReplayMenu(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showReplayMenu]);

  useEffect(() => {
    if (!showAdvancedMenu) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (advancedMenuRef.current?.contains(target)) {
        return;
      }

      setShowAdvancedMenu(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showAdvancedMenu]);

  useEffect(() => {
    if (!showAdvancedMenu) {
      return;
    }

    if (currentLevelSeedOverride) {
      setSeedInputValue(String(currentLevelSeedOverride.randomSeed));
      return;
    }

    if (activeRandomSeed !== null && Number.isFinite(activeRandomSeed)) {
      setSeedInputValue(String(activeRandomSeed));
      return;
    }

    setSeedInputValue("");
  }, [activeRandomSeed, currentLevelSeedOverride, showAdvancedMenu]);

  useEffect(() => {
    if (!showSoundControls && !showHistoryControls) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".legacy-toolbar")) {
        return;
      }

      setShowSoundControls(false);
      setShowHistoryControls(false);
      stopHeldUndo();
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [showHistoryControls, showSoundControls]);

  const helpOverlay = showHelp ? (
    <div
      className="legacy-help-backdrop"
      onClick={closeHelp}
      role="presentation"
    >
      <section
        aria-label="Keyboard help"
        className="legacy-help"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="legacy-help__header">
          <h2 className="legacy-help__title">Controls</h2>
          <button className="legacy-help__close" onClick={closeHelp} type="button">
            Close
          </button>
        </div>
        <p className="legacy-help__note">Listed commands are the ones currently wired in the browser build.</p>
        {helpSections.map((section) => (
          <section className="legacy-help__section" key={section.title}>
            <h3 className="legacy-help__section-title">{section.title}</h3>
            <div className="legacy-help__table">
              {section.commands.map((command) => (
                <div className="legacy-help__row" key={`${section.title}-${command.keys}`}>
                  <span className="legacy-help__keys">{command.keys}</span>
                  <span className="legacy-help__action">{command.action}</span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  ) : null;

  const modernResultSheet =
    usesModernGameUi && session && currentLevel && currentSeries && runResult && runResultHeadline ? (
      <div className="modern-result-sheet__backdrop">
        <section aria-label="Level result" className="modern-result-sheet">
          <div className="modern-result-sheet__header">
            <p className="modern-section__eyebrow">Level {currentLevel.number}: {currentLevel.name}</p>
            <h2 className="modern-result-sheet__title">{runResultHeadline}</h2>
          </div>

          {isMobileChrome ? (
            <>
              <div className="modern-result-sheet__actions">
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canSaveReplay}
                  onClick={() => {
                    void saveReplayForCurrentRun();
                  }}
                  type="button"
                >
                  Save Replay
                </button>
                <button
                  className={runResult.outcome === "failed" ? "modern-button" : "modern-button modern-button--secondary"}
                  onClick={restartCurrentLevel}
                  type="button"
                >
                  Retry
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canUseModernUndo}
                  onClick={() => {
                    void performModernUndo(false);
                  }}
                  type="button"
                >
                  Undo
                </button>
                {runResult.outcome !== "failed" ? (
                  <button className="modern-button" onClick={proceedAfterLevelEnd} type="button">
                    Next Level
                  </button>
                ) : null}
              </div>

              {replaySaveNotice ? <p className="modern-result-sheet__notice">{replaySaveNotice}</p> : null}
            </>
          ) : null}

          {runResultScore ? (
            <section aria-label="Score calculation" className="modern-result-sheet__score">
              <p className="modern-result-sheet__score-title">Score</p>
              <div className="modern-result-sheet__score-equation">
                <div className="modern-result-sheet__score-term">
                  <span className="modern-result-sheet__score-term-label">Base</span>
                  <strong>{runResultScore.baseScore}</strong>
                </div>
                <span aria-hidden="true" className="modern-result-sheet__score-operator">
                  +
                </span>
                <div className="modern-result-sheet__score-term">
                  <span className="modern-result-sheet__score-term-label">Time bonus</span>
                  <strong>{runResultScore.timeBonus}</strong>
                </div>
                <span aria-hidden="true" className="modern-result-sheet__score-operator">
                  x
                </span>
                <div className="modern-result-sheet__score-term">
                  <span className="modern-result-sheet__score-term-label">
                    {runResultScore.undoPenaltyApplied ? "Undo penalty" : "Clean run"}
                  </span>
                  <strong>{runResultScore.undoPenaltyMultiplier.toFixed(1)}</strong>
                </div>
                <span aria-hidden="true" className="modern-result-sheet__score-operator">
                  =
                </span>
                <div
                  className={`modern-result-sheet__score-term modern-result-sheet__score-term--final${
                    runResultScoreRecordMeta ? ` modern-result-sheet__score-term--${runResultScoreRecordMeta.kind}` : ""
                  }`}
                >
                  <span className="modern-result-sheet__score-term-label">Final</span>
                  <div className="modern-result-sheet__score-final-line">
                    <strong>{runResultScore.finalScore} pts</strong>
                    {runResultScoreRecordMeta ? (
                      <span className="modern-result-sheet__score-record-note">({runResultScoreRecordMeta.detail})</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <section className="modern-result-sheet__panel modern-result-sheet__panel--summary">
            <div className="modern-result-sheet__rows modern-result-sheet__rows--summary">
              <div className="modern-result-sheet__row">
                <span>Ruleset</span>
                <strong>{formatPlayerRulesetLabel(session.request.ruleset, rulesetLabel)}</strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Time elapsed</span>
                <strong>{formatInteractiveTickSeconds(Math.max(session.frame.snapshot.currentTime, 0))}s</strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Time remaining</span>
                <strong>
                  {session.frame.snapshot.timelimit > 0
                    ? `${formatInteractiveTickSeconds(gameplayTimeRemainingTicks(session))}s`
                    : "Untimed"}
                </strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Undo used</span>
                <strong>{session.run.undoUsedCount}</strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Result</span>
                <strong>
                  {runResult.outcome === "completed-clean"
                    ? "Cleared clean"
                    : runResult.outcome === "completed-with-undo"
                      ? "Cleared with undo"
                      : "Failed"}
                </strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Cause</span>
                <strong>{runResult.outcome === "failed" ? runResult.cause?.message ?? "Unknown failure" : "Cleared"}</strong>
              </div>
              <div className="modern-result-sheet__row">
                <span>Moves</span>
                <strong>{session.recordedMoveCount ?? session.recordedMoves?.length ?? 0}</strong>
              </div>
            </div>
          </section>

          {!isMobileChrome ? (
            <>
              <div className="modern-result-sheet__actions">
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canSaveReplay}
                  onClick={() => {
                    void saveReplayForCurrentRun();
                  }}
                  type="button"
                >
                  Save Replay
                </button>
                <button
                  className={runResult.outcome === "failed" ? "modern-button" : "modern-button modern-button--secondary"}
                  onClick={restartCurrentLevel}
                  type="button"
                >
                  Retry (R)
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canUseModernUndo}
                  onClick={() => {
                    void performModernUndo(false);
                  }}
                  type="button"
                >
                  {`Undo (${undoKeyBinding})`}
                </button>
                {runResult.outcome !== "failed" ? (
                  <button className="modern-button" onClick={proceedAfterLevelEnd} type="button">
                    Next Level (N)
                  </button>
                ) : null}
              </div>

              {replaySaveNotice ? <p className="modern-result-sheet__notice">{replaySaveNotice}</p> : null}
            </>
          ) : null}
        </section>
      </div>
    ) : null;

  const modernMessageModal =
    usesModernGameUi && message ? (
      <div
        aria-hidden="true"
        className="modern-message-modal"
        onClick={dismissMessage}
      >
        <div
          aria-labelledby="modern-message-title"
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
              <h2 className="modern-dashboard__panel-title" id="modern-message-title">
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
    ) : null;

  const manageReplaysModal =
    usesModernGameUi && showManageReplays ? (
      <div
        aria-hidden="true"
        className="modern-about-modal modern-replay-manager-modal"
        onClick={closeManageReplays}
      >
        <div
          aria-labelledby="modern-manage-replays-title"
          aria-modal="true"
          className="modern-about-modal__dialog modern-replay-manager-modal__dialog"
          onClick={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="modern-about-modal__header">
            <div>
              <p className="modern-section__eyebrow">Replay Library</p>
              <h2 className="modern-dashboard__panel-title" id="modern-manage-replays-title">
                {replayContextLevel ? `Manage Replays: Level ${replayContextLevel.number}` : "Manage Replays"}
              </h2>
              <p className="modern-dashboard__copy">
                {[currentLevel?.name ?? null, currentRulesetDisplayLabel, currentReplayCountLabel].filter(Boolean).join("  ·  ")}
              </p>
            </div>
            <button
              aria-label="Close replay manager"
              className="modern-dashboard__about-button modern-dashboard__about-button--close"
              onClick={closeManageReplays}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="modern-about-modal__body">
            <div className="modern-replay-manager">
              {currentLevelReplayRows.map((row) => (
                <div
                  className={`modern-replay-manager__entry${
                    selectedManagedReplayRow
                    && replayEntryKey(selectedManagedReplayRow.entry) === replayEntryKey(row.entry)
                      ? " modern-replay-manager__entry--selected"
                      : ""
                  }`}
                  key={replayEntryKey(row.entry)}
                >
                  <button
                    className="modern-replay-manager__select"
                    onClick={() => {
                      setSelectedManagedReplayKey(replayEntryKey(row.entry));
                    }}
                    type="button"
                  >
                    <div className="modern-replay-manager__title-row">
                      <strong className="modern-replay-manager__name">{row.entry.fileName}</strong>
                      <span className="modern-replay-manager__result">{row.replayDescription.resultLabel}</span>
                    </div>
                    <p className="modern-replay-manager__meta">
                      {row.replayDescription.savedAtLabel}  ·  {row.secondsLabel}  ·  {row.moveCount ?? "?"} moves
                      {row.entry.finalScore !== null ? `  ·  ${row.entry.finalScore} pts` : ""}
                    </p>
                  </button>
                  <div className="modern-replay-manager__row-actions">
                    <button
                      aria-label={`Download ${row.entry.fileName}`}
                      className="modern-icon-button"
                      onClick={() => {
                        void downloadReplayEntry(row.entry);
                      }}
                      type="button"
                    >
                      <DownloadIcon />
                    </button>
                    {row.entry.source !== "reference" ? (
                      <button
                        aria-label={`Delete ${row.entry.fileName}`}
                        className="modern-icon-button modern-icon-button--danger"
                        onClick={() => {
                          void deleteReplayEntryFromLibrary(row.entry);
                        }}
                        type="button"
                      >
                        <TrashIcon />
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modern-message-modal__actions modern-replay-manager__footer">
            <button
              className="modern-button"
              disabled={!selectedManagedReplayRow}
              onClick={loadManagedReplay}
              type="button"
            >
              Load
            </button>
            <button className="modern-button modern-button--secondary" onClick={closeManageReplays} type="button">
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const mobileSetSelectorSheet =
    isMobileChrome && mobileSheet === "sets" ? (
      <div className="modern-about-modal mobile-sheet" onClick={closeMobileSheet}>
        <div
          aria-labelledby="mobile-set-selector-title"
          aria-modal="true"
          className="modern-about-modal__dialog mobile-sheet__dialog"
          onClick={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="modern-about-modal__header">
            <div>
              <p className="modern-section__eyebrow">Set Selector</p>
              <h2 className="modern-dashboard__panel-title" id="mobile-set-selector-title">
                Choose a set
              </h2>
            </div>
            <button
              aria-label="Close set selector"
              className="modern-dashboard__about-button modern-dashboard__about-button--close"
              onClick={closeMobileSheet}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="modern-about-modal__body mobile-sheet__body">
            <div aria-label="Set categories" className="mobile-sheet__tabs" role="tablist">
              {MOBILE_LIBRARY_SECTIONS.map((section) => (
                <button
                  aria-selected={mobileSetSection === section.id}
                  className={`mobile-sheet__tab${mobileSetSection === section.id ? " mobile-sheet__tab--active" : ""}`}
                  key={section.id}
                  onClick={() => {
                    setMobileSetSection(section.id);
                  }}
                  role="tab"
                  type="button"
                >
                  {section.label}
                </button>
              ))}
            </div>
            <div
              className="mobile-sheet__swipe-surface"
              onTouchEnd={handleMobileSetSheetTouchEnd}
              onTouchStart={handleMobileSetSheetTouchStart}
            >
              {mobileVisibleFamilies.length > 0 ? (
                <div className="mobile-sheet__list">
                  {mobileVisibleFamilies.map((family) => (
                    <button
                      className={`mobile-sheet__list-item${family.id === currentFamily?.id ? " mobile-sheet__list-item--selected" : ""}`}
                      key={family.id}
                      onClick={() => {
                        selectSetFamily(family);
                        closeMobileSheet();
                      }}
                      type="button"
                    >
                      <div className="mobile-sheet__list-copy">
                        <strong className="mobile-sheet__list-title">{family.title}</strong>
                        {family.sidebarSummary ? (
                          <p className="mobile-sheet__list-meta">
                            {family.sidebarSummary}
                            {family.yearLabel ? ` (${family.yearLabel})` : ""}
                          </p>
                        ) : null}
                        <p className="mobile-sheet__list-meta">{formatMobileFamilyBrowseMeta(family, progressByKey)}</p>
                      </div>
                      {family.id === currentFamily?.id ? (
                        <span className="mobile-sheet__list-badge">Current</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="modern-dashboard__copy">
                  {isCatalogLoading
                    ? mobileSetSection === "uploads"
                      ? "Loading uploaded sets..."
                      : mobileSetSection === "curated"
                        ? "Loading curated sets..."
                        : "Loading official sets..."
                    : mobileSetSection === "uploads"
                      ? "No uploaded sets yet."
                      : mobileSetSection === "curated"
                        ? "No curated sets are available right now."
                        : "No official sets are available right now."}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null;

  const mobileLevelSelectorSheet =
    isMobileChrome && mobileSheet === "levels" ? (
      <div className="modern-about-modal mobile-sheet" onClick={closeMobileSheet}>
        <div
          aria-labelledby="mobile-level-selector-title"
          aria-modal="true"
          className="modern-about-modal__dialog mobile-sheet__dialog"
          onClick={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="modern-about-modal__header">
            <div>
              <p className="modern-section__eyebrow">Level Selector</p>
              <h2 className="modern-dashboard__panel-title" id="mobile-level-selector-title">
                {currentFamily?.title ?? currentSeries?.name ?? "Choose a level"}
              </h2>
            </div>
            <button
              aria-label="Close level selector"
              className="modern-dashboard__about-button modern-dashboard__about-button--close"
              onClick={closeMobileSheet}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="modern-about-modal__body mobile-sheet__body">
            {currentFamilyEntry && currentFamilyRuleset ? (
              <>
                <p className="mobile-sheet__section-copy">
                  {`${formatPlayerRulesetLabel(currentFamilyRuleset, rulesetLabel)}  ·  ${currentFamilyEntry.levels.length} levels  ·  ${currentFamilyProgress?.completedLevels ?? 0}/${currentFamilyEntry.levels.length} cleared`}
                </p>
                <div className="mobile-sheet__list">
                  {currentFamilyEntry.levels.map((level) => {
                    const progress = resolveLevelProgressSummary(level, currentFamilyRuleset, progressByKey);
                    const statusLabel = mobileLevelStatusLabel(progress);
                    return (
                      <button
                        className={`mobile-sheet__list-item${level.number === currentLevel?.number ? " mobile-sheet__list-item--selected" : ""}`}
                        key={level.number}
                        onClick={() => {
                          selectLevel(level.number);
                          closeMobileSheet();
                        }}
                        type="button"
                      >
                        <div className="mobile-sheet__list-copy">
                          <strong className="mobile-sheet__list-title">Level {level.number}</strong>
                          <p className="mobile-sheet__list-meta">{level.name}</p>
                        </div>
                        <div className="mobile-sheet__list-side">
                          {statusLabel ? (
                            <span
                              aria-label={mobileLevelStatusDescription(progress)}
                              className={`modern-level-chip__badge modern-level-chip__badge--${mobileLevelStatusClassName(progress)}`}
                              title={mobileLevelStatusDescription(progress)}
                            >
                              {statusLabel}
                            </span>
                          ) : null}
                          {level.number === currentLevel?.number ? (
                            <span className="mobile-sheet__list-badge">Current</span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : currentSeries ? (
              <div className="mobile-sheet__list">
                {currentSeries.levels.map((level) => (
                  <button
                    className={`mobile-sheet__list-item${level.number === currentLevel?.number ? " mobile-sheet__list-item--selected" : ""}`}
                    key={level.number}
                    onClick={() => {
                      selectLevel(level.number);
                      closeMobileSheet();
                    }}
                    type="button"
                  >
                    <div className="mobile-sheet__list-copy">
                      <strong className="mobile-sheet__list-title">Level {level.number}</strong>
                      <p className="mobile-sheet__list-meta">{level.name}</p>
                    </div>
                    {level.number === currentLevel?.number ? (
                      <span className="mobile-sheet__list-badge">Current</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <p className="modern-dashboard__copy">Load a set to browse levels.</p>
            )}
          </div>
        </div>
      </div>
    ) : null;

  const mobileOverflowSheet =
    isMobileChrome && mobileSheet === "menu" ? (
      <div className="modern-about-modal mobile-sheet" onClick={closeMobileSheet}>
        <div
          aria-labelledby="mobile-overflow-title"
          aria-modal="true"
          className="modern-about-modal__dialog mobile-sheet__dialog"
          onClick={(event) => {
            event.stopPropagation();
          }}
          role="dialog"
        >
          <div className="modern-about-modal__header">
            <div>
              <p className="modern-section__eyebrow">Mobile Menu</p>
              <h2 className="modern-dashboard__panel-title" id="mobile-overflow-title">
                Game controls
              </h2>
            </div>
            <button
              aria-label="Close mobile menu"
              className="modern-dashboard__about-button modern-dashboard__about-button--close"
              onClick={closeMobileSheet}
              type="button"
            >
              ×
            </button>
          </div>
          <div className="modern-about-modal__body mobile-sheet__body">
            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Navigation</p>
                <p className="mobile-sheet__section-copy">Browse sets and levels without cluttering the board.</p>
              </div>
              <div className="mobile-sheet__button-grid">
                <button
                  className="modern-button modern-button--secondary"
                  onClick={() => {
                    setMobileSetSection(mobileLibrarySectionForFamily(currentFamily));
                    setMobileSheet("sets");
                  }}
                  type="button"
                >
                  Choose Set
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!currentSeries}
                  onClick={() => {
                    setMobileSheet("levels");
                  }}
                  type="button"
                >
                  Choose Level
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!currentLevel || !currentSeries}
                  onClick={() => {
                    closeMobileSheet();
                    changeLevelBy(-1);
                  }}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!currentLevel || !currentSeries}
                  onClick={() => {
                    closeMobileSheet();
                    changeLevelBy(1);
                  }}
                  type="button"
                >
                  Next
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canCopyCurrentLevelLink}
                  onClick={() => {
                    closeMobileSheet();
                    void copyCurrentLevelLink();
                  }}
                  type="button"
                >
                  Copy Link
                </button>
                <button className="modern-button modern-button--secondary" onClick={toggleHelp} type="button">
                  Help
                </button>
              </div>
            </section>

            {onOpenDesktopShell || onOpenClassicShell ? (
              <section className="modern-settings-modal__section mobile-sheet__section">
                <div className="mobile-sheet__section-header">
                  <p className="modern-section__eyebrow">Shell</p>
                  <p className="mobile-sheet__section-copy">Switch to the desktop or legacy interface.</p>
                </div>
                <div className="mobile-sheet__button-grid">
                  {onOpenDesktopShell ? (
                    <button
                      className="modern-button modern-button--secondary"
                      onClick={() => {
                        closeMobileSheet();
                        onOpenDesktopShell();
                      }}
                      type="button"
                    >
                      Desktop UI
                    </button>
                  ) : null}
                  {onOpenClassicShell ? (
                    <button
                      className="modern-button modern-button--secondary"
                      onClick={() => {
                        closeMobileSheet();
                        onOpenClassicShell();
                      }}
                      type="button"
                    >
                      Legacy UI
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Gameplay</p>
                <p className="mobile-sheet__section-copy">
                  Quick actions that used to live in the desktop header.
                </p>
              </div>
              <div className="mobile-sheet__button-grid">
                <button
                  className="modern-button modern-button--secondary"
                  onClick={() => {
                    closeMobileSheet();
                    restartCurrentLevel();
                  }}
                  type="button"
                >
                  Restart
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canTogglePause}
                  onClick={() => {
                    closeMobileSheet();
                    toggleModernPause();
                  }}
                  type="button"
                >
                  {isPaused ? "Resume" : "Pause"}
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canUseModernUndo}
                  onClick={() => {
                    closeMobileSheet();
                    void performModernUndo(false);
                  }}
                  type="button"
                >
                  Undo
                </button>
              </div>
            </section>

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Controls</p>
                <p className="mobile-sheet__section-copy">
                  Choose how touch arrows are arranged on mobile.
                </p>
              </div>
              <div className="mobile-sheet__button-grid">
                <button
                  className={mobileControlProfile === "wasd-cluster" ? "modern-button" : "modern-button modern-button--secondary"}
                  onClick={() => {
                    setMobileControlProfile("wasd-cluster");
                  }}
                  type="button"
                >
                  WASD Cluster
                </button>
                <button
                  className={mobileControlProfile === "right-bottom" ? "modern-button" : "modern-button modern-button--secondary"}
                  onClick={() => {
                    setMobileControlProfile("right-bottom");
                  }}
                  type="button"
                >
                  Right + Bottom
                </button>
                <button
                  className={mobileControlProfile === "screen-edges" ? "modern-button" : "modern-button modern-button--secondary"}
                  onClick={() => {
                    setMobileControlProfile("screen-edges");
                  }}
                  type="button"
                >
                  Screen Edges
                </button>
              </div>
            </section>

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Keyboard</p>
                <p className="mobile-sheet__section-copy">Choose the Action 1 and Undo keys without conflicting with other controls.</p>
              </div>
              <div className="mobile-sheet__settings-fields">
                <label className="mobile-sheet__field">
                  <span>Action 1 Key</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      applyPlayerKeyBindings({
                        ...playerKeyBindings,
                        action1Key: event.currentTarget.value as PlayerBindableKey,
                      });
                    }}
                    value={action1KeyBinding}
                  >
                    {availableAction1BindingKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mobile-sheet__field">
                  <span>Undo Key</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      applyPlayerKeyBindings({
                        ...playerKeyBindings,
                        undoKey: event.currentTarget.value as PlayerBindableKey,
                      });
                    }}
                    value={undoKeyBinding}
                  >
                    {availableUndoBindingKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Replays</p>
                <p className="mobile-sheet__section-copy">Save, import, or inspect the current level&apos;s replay library.</p>
              </div>
              <div className="mobile-sheet__button-grid">
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!canSaveReplay}
                  onClick={() => {
                    closeMobileSheet();
                    void saveReplayForCurrentRun();
                  }}
                  type="button"
                >
                  Save Replay
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!replaysSupported || !currentLevel || !currentSeries}
                  onClick={() => {
                    closeMobileSheet();
                    void importReplayForCurrentLevel();
                  }}
                  type="button"
                >
                  Import Replay
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={!latestCurrentReplayEntry}
                  onClick={() => {
                    closeMobileSheet();
                    watchLatestReplayFromMenu();
                  }}
                  type="button"
                >
                  Watch Latest
                </button>
                <button
                  className="modern-button modern-button--secondary"
                  disabled={currentLevelReplayEntries.length === 0}
                  onClick={() => {
                    closeMobileSheet();
                    openManageReplays();
                  }}
                  type="button"
                >
                  Manage Replays
                </button>
              </div>
            </section>

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">Sound</p>
                <p className="mobile-sheet__section-copy">Adjust audio without leaving the board.</p>
              </div>
              <div className="mobile-sheet__button-grid mobile-sheet__button-grid--compact">
                <button className="modern-button modern-button--secondary" onClick={toggleMuted} type="button">
                  {soundMuted || soundVolume <= 0 ? "Enable Sound" : "Mute Sound"}
                </button>
              </div>
              <label className="mobile-sheet__field" htmlFor="mobile-sound-volume">
                <span>Volume {Math.round(soundVolume * 100)}%</span>
                <input
                  className="modern-game-sound__slider"
                  id="mobile-sound-volume"
                  max="1"
                  min="0"
                  onChange={(event) => {
                    const nextVolume = Number(event.currentTarget.value);
                    setSoundVolume(Number.isFinite(nextVolume) ? nextVolume : 0.7);
                    if (nextVolume > 0 && soundMuted) {
                      setSoundMuted(false);
                    }
                  }}
                  step="0.05"
                  type="range"
                  value={soundVolume}
                />
              </label>
            </section>

            <section className="modern-settings-modal__section mobile-sheet__section">
              <div className="mobile-sheet__section-header">
                <p className="modern-section__eyebrow">History Settings</p>
                <p className="mobile-sheet__section-copy">These settings apply on the next level load or restart.</p>
              </div>
              <div className="mobile-sheet__settings">
                <label className="mobile-sheet__checkbox">
                  <input
                    checked={undoSettings.enabled}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enabled: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Undo History</span>
                </label>
                <label className="mobile-sheet__checkbox">
                  <input
                    checked={undoSettings.enableRewindAndResume}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enableRewindAndResume: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Rewind And Resume</span>
                </label>
                <label className="mobile-sheet__checkbox">
                  <input
                    checked={undoSettings.allowTakeoverDuringHistoricalReplay}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        allowTakeoverDuringHistoricalReplay: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Allow Takeover During Historical Replay</span>
                </label>
                <label className="mobile-sheet__checkbox">
                  <input
                    checked={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        retainUnlimitedHistory: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Keep Unlimited History</span>
                </label>
              </div>
              <div className="mobile-sheet__settings-fields">
                <label className="mobile-sheet__field">
                  <span>Checkpoint Density</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      const nextDensity = event.currentTarget.value as BrowserUndoSettings["checkpointDensity"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointDensity: nextDensity,
                      }));
                    }}
                    value={undoSettings.checkpointDensity}
                  >
                    <option value="dense">Dense</option>
                    <option value="standard">Standard</option>
                    <option value="sparse">Sparse</option>
                  </select>
                </label>
                <label className="mobile-sheet__field">
                  <span>History Retention Mode</span>
                  <select
                    className="modern-history-dock__select"
                    onChange={(event) => {
                      const nextMode = event.currentTarget.value as BrowserUndoSettings["checkpointRetentionMode"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointRetentionMode: nextMode,
                      }));
                    }}
                    value={undoSettings.checkpointRetentionMode}
                  >
                    <option value="dense-recent-exponential">Dense recent + exponential</option>
                    <option value="dense-recent">Dense recent only</option>
                  </select>
                </label>
                <label className="mobile-sheet__field">
                  <span>Bounded History Window</span>
                  <select
                    className="modern-history-dock__select"
                    disabled={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      const nextWindow = Number(event.currentTarget.value) as BrowserUndoSettings["maximumRetainedHistoryMinutes"];
                      setUndoSettings((current) => ({
                        ...current,
                        maximumRetainedHistoryMinutes: nextWindow,
                      }));
                    }}
                    value={undoSettings.maximumRetainedHistoryMinutes}
                  >
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    ) : null;

  const renderModernRulesetToggle = (keyPrefix: string) => (
    <div className="modern-ruleset-toggle modern-ruleset-toggle--stacked" role="group" aria-label="Ruleset">
      {rulesetOptions.map((ruleset) => {
        const selection = currentFamily && currentLevel
          ? resolveSetFamilySelection(currentFamily, ruleset, currentLevel.number)
          : null;
        return (
          <button
            aria-pressed={currentRuleset === ruleset}
            className={`modern-ruleset-toggle__button${currentRuleset === ruleset ? " modern-ruleset-toggle__button--active" : ""}`}
            disabled={selection === null}
            key={`${keyPrefix}:${ruleset}`}
            onClick={() => {
              if (selection) {
                launchSelection(selection);
              }
            }}
            type="button"
          >
            {rulesetLabel(ruleset)}
          </button>
        );
      })}
    </div>
  );
  const renderModernGameplayRail = (keyPrefix: string) => (
    <aside className="modern-game-rail modern-game-rail--left">
      <section className="modern-game-rail__panel modern-game-rail__panel--ruleset">
        {renderModernRulesetToggle(keyPrefix)}
      </section>

      <section className="modern-game-rail__panel">
        <p className="modern-section__eyebrow">Runtime</p>
        <div className="modern-game-rail__stats">
          <div className={`modern-game-stat${session && session.frame.snapshot.chipsNeeded === 0 ? " modern-game-stat--good" : ""}`}>
            <span className="modern-game-stat__label">Chips</span>
            <strong className="modern-game-stat__value">{session ? session.frame.snapshot.chipsNeeded : "---"}</strong>
          </div>
          <div
            className={`modern-game-stat${
              session && session.frame.snapshot.timelimit > 0 && gameplayTimeRemainingTicks(session) < LOW_TIME_WARNING_TICKS
                ? " modern-game-stat--danger"
                : ""
            }`}
          >
            <span className="modern-game-stat__label">Time</span>
            <strong className="modern-game-stat__value">{session ? formatGameplayTimeLeft(session) : "---"}</strong>
          </div>
          <div className="modern-game-stat">
            <span className="modern-game-stat__label">Undo Used</span>
            <strong className="modern-game-stat__value">{session?.run.undoUsedCount ?? 0}</strong>
          </div>
        </div>
      </section>
    </aside>
  );
  const renderModernInventoryRail = () => (
    <aside className="modern-game-inventory-strip">
      <div className="modern-game-inventory-strip__group">
        <p className="modern-game-inventory-strip__label">Keys</p>
        <LegacyInventoryStrip
          className="modern-game-inventory-strip__canvas"
          currentRuleset={currentRuleset}
          inventory={session?.frame.snapshot.inventory ?? null}
          inventoryKeyCountLabelsEnabled={inventoryKeyCountLabelsEnabled}
          kind="keys"
          visualEnhancementsEnabled={visualEnhancementsEnabled}
        />
      </div>
      <div className="modern-game-inventory-strip__group">
        <p className="modern-game-inventory-strip__label">Boots</p>
        <LegacyInventoryStrip
          className="modern-game-inventory-strip__canvas"
          currentRuleset={currentRuleset}
          inventory={session?.frame.snapshot.inventory ?? null}
          kind="boots"
          visualEnhancementsEnabled={visualEnhancementsEnabled}
        />
      </div>
      {showToolsInventory ? (
        <div className="modern-game-inventory-strip__group">
          <p className="modern-game-inventory-strip__label">Tools</p>
          <LegacyInventoryStrip
            className="modern-game-inventory-strip__canvas"
            currentRuleset={currentRuleset}
            inventory={session?.frame.snapshot.inventory ?? null}
            inventoryRender={session?.frame.inventoryRender ?? null}
            kind="tools"
            visualEnhancementsEnabled={visualEnhancementsEnabled}
          />
        </div>
      ) : null}
    </aside>
  );
  const renderModernUndoPanel = () => (
    <section className="modern-game-undo-panel">
      {historyStatusMessage ? (
        <div className="modern-game-undo-panel__status" role="status">
          {historyStatusMessage}
        </div>
      ) : null}
      <div className="modern-game-undo-panel__actions">
        <button
          className="modern-button modern-button--secondary modern-game-undo-panel__button"
          disabled={!canUseModernUndo}
          onClick={() => {
            void performModernUndo(false);
          }}
          type="button"
        >
          Undo
        </button>
        <button
          className="modern-button modern-button--secondary modern-game-undo-panel__button"
          disabled={!canContinueFromReplay && !canResumeOriginalTimeline}
          onClick={continueFromReplay}
          type="button"
        >
          Continue with Replay
        </button>
      </div>
    </section>
  );
  const renderMobileTouchButton = (direction: DirectionInput, label: string, modifierClassName: string, arrow: string) => (
    <div
      aria-hidden="true"
      className={`mobile-game-shell__touch-button ${modifierClassName}${mobileMovementControlsDisabled ? " mobile-game-shell__touch-button--disabled" : ""}`}
      data-label={label}
      draggable={false}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onLostPointerCapture={handleMobileDirectionPointerEnd}
      onPointerCancel={handleMobileDirectionPointerEnd}
      onPointerDown={(event) => {
        handleMobileDirectionPointerDown(direction, event);
      }}
      onPointerUp={handleMobileDirectionPointerEnd}
      onTouchCancel={preventMobileTouchDefault}
      onTouchEnd={preventMobileTouchDefault}
      onTouchMove={preventMobileTouchDefault}
      onTouchStart={preventMobileTouchDefault}
      tabIndex={-1}
    >
      <span className="mobile-game-shell__touch-button-arrow">{arrow}</span>
    </div>
  );
  const renderMobileTouchControls = () => (
    <div
      aria-label="Touch movement controls"
      className={`mobile-game-shell__touch-controls mobile-game-shell__touch-controls--${mobileControlProfile}`}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      role="group"
    >
      {renderMobileTouchButton("north", "Move up", "mobile-game-shell__touch-button--north", "▲")}
      {renderMobileTouchButton("west", "Move left", "mobile-game-shell__touch-button--west", "◀")}
      {renderMobileTouchButton("south", "Move down", "mobile-game-shell__touch-button--south", "▼")}
      {renderMobileTouchButton("east", "Move right", "mobile-game-shell__touch-button--east", "▶")}
    </div>
  );
  const renderMobileRuntimePanel = () => {
    const selectedRulesetSelections = currentFamily && currentLevel
      ? {
          MS: resolveSetFamilySelection(currentFamily, "MS", currentLevel.number),
          Lynx: resolveSetFamilySelection(currentFamily, "Lynx", currentLevel.number),
        }
      : { MS: null, Lynx: null };
    const nextRulesetSelection =
      currentRuleset === "MS"
        ? selectedRulesetSelections.Lynx
        : currentRuleset === "Lynx"
          ? selectedRulesetSelections.MS
          : selectedRulesetSelections.Lynx ?? selectedRulesetSelections.MS;
    const nextRuleset = nextRulesetSelection ? currentRuleset === "MS" ? "Lynx" : "MS" : null;

    return (
      <section className="mobile-game-shell__runtime" aria-label="Runtime">
        <div className={`mobile-game-shell__stat${session && session.frame.snapshot.chipsNeeded === 0 ? " mobile-game-shell__stat--good" : ""}`}>
          <span className="mobile-game-shell__stat-label">Chips</span>
          <strong className="mobile-game-shell__stat-value">{session ? session.frame.snapshot.chipsNeeded : "---"}</strong>
        </div>
        <div
          className={`mobile-game-shell__stat${
            session && session.frame.snapshot.timelimit > 0 && gameplayTimeRemainingTicks(session) < LOW_TIME_WARNING_TICKS
              ? " mobile-game-shell__stat--danger"
              : ""
          }`}
        >
          <span className="mobile-game-shell__stat-label">Time</span>
          <strong className="mobile-game-shell__stat-value">{session ? formatGameplayTimeLeft(session) : "---"}</strong>
        </div>
        <div className="mobile-game-shell__stat">
          <span className="mobile-game-shell__stat-label">Undo</span>
          <strong className="mobile-game-shell__stat-value">{session?.run.undoUsedCount ?? 0}</strong>
        </div>
        {nextRulesetSelection ? (
          <button
            aria-label={`Switch ruleset from ${currentRulesetDisplayLabel ?? "---"} to ${formatPlayerRulesetLabel(nextRuleset, rulesetLabel) ?? "---"}`}
            className="mobile-game-shell__stat mobile-game-shell__stat--button"
            onClick={() => {
              launchSelection(nextRulesetSelection);
            }}
            title={nextRuleset ? `Tap to switch to ${formatPlayerRulesetLabel(nextRuleset, rulesetLabel)}` : undefined}
            type="button"
          >
            <span className="mobile-game-shell__stat-label">Ruleset</span>
            <strong className="mobile-game-shell__stat-value">{currentRulesetDisplayLabel ?? "---"}</strong>
          </button>
        ) : (
          <div className="mobile-game-shell__stat">
            <span className="mobile-game-shell__stat-label">Ruleset</span>
            <strong className="mobile-game-shell__stat-value">{currentRulesetDisplayLabel ?? "---"}</strong>
          </div>
        )}
      </section>
    );
  };
  const renderMobileInventoryPanel = () => (
    <section
      className={`mobile-game-shell__inventory${
        isMobileLandscape ? " mobile-game-shell__inventory--vertical" : " mobile-game-shell__inventory--horizontal"
      }`}
      aria-label="Inventory"
    >
      <div className="mobile-game-shell__inventory-group">
        <p className="mobile-game-shell__inventory-label">Keys</p>
        <LegacyInventoryStrip
          className="mobile-game-shell__inventory-strip"
          currentRuleset={currentRuleset}
          direction={isMobileLandscape ? "vertical" : "horizontal"}
          inventory={session?.frame.snapshot.inventory ?? null}
          inventoryKeyCountLabelsEnabled={inventoryKeyCountLabelsEnabled}
          kind="keys"
          renderTileSize={mobileRenderTileSize}
          visualEnhancementsEnabled={visualEnhancementsEnabled}
        />
      </div>
      <div className="mobile-game-shell__inventory-group">
        <p className="mobile-game-shell__inventory-label">Boots</p>
        <LegacyInventoryStrip
          className="mobile-game-shell__inventory-strip"
          currentRuleset={currentRuleset}
          direction={isMobileLandscape ? "vertical" : "horizontal"}
          inventory={session?.frame.snapshot.inventory ?? null}
          kind="boots"
          renderTileSize={mobileRenderTileSize}
          visualEnhancementsEnabled={visualEnhancementsEnabled}
        />
      </div>
      {showToolsInventory ? (
        <div className="mobile-game-shell__inventory-group">
          <p className="mobile-game-shell__inventory-label">Tools</p>
          <LegacyInventoryStrip
            className="mobile-game-shell__inventory-strip"
            currentRuleset={currentRuleset}
            direction={isMobileLandscape ? "vertical" : "horizontal"}
            inventory={session?.frame.snapshot.inventory ?? null}
            inventoryRender={session?.frame.inventoryRender ?? null}
            kind="tools"
            renderTileSize={mobileRenderTileSize}
            visualEnhancementsEnabled={visualEnhancementsEnabled}
          />
        </div>
      ) : null}
    </section>
  );
  const renderMobileHud = () => (
    <div className="mobile-game-shell__hud">
      <section className="mobile-game-shell__actions" aria-label="Gameplay controls">
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={restartCurrentLevel} type="button">
          Restart
        </button>
        <button
          className="modern-button modern-button--secondary modern-button--compact"
          disabled={!canUseModernUndo}
          onClick={() => {
            void performModernUndo(false);
          }}
          type="button"
        >
          Undo
        </button>
      </section>
      {renderMobileRuntimePanel()}
    </div>
  );
  const renderMobilePrimaryMargin = () => (
    <aside className="mobile-game-shell__margin mobile-game-shell__margin--primary">
      <section className="mobile-game-shell__meta" aria-label="Level information">
        <div className="mobile-game-shell__meta-header">
          <div className="mobile-game-shell__meta-copy">
            <h1 className="mobile-game-shell__title">{modernLevelTitle}</h1>
            <p className="mobile-game-shell__subtitle">
              {[mobileSeriesLabel, modernGameplaySubtitle].filter(Boolean).join("  ·  ")}
            </p>
          </div>
          <button
            aria-haspopup="dialog"
            className="mobile-game-shell__menu-button"
            onClick={() => {
              toggleMobileSheet("menu");
            }}
            type="button"
          >
            <span aria-hidden="true">⋯</span>
            <span className="mobile-game-shell__menu-button-copy">Menu</span>
          </button>
        </div>
      </section>
      {renderMobileHud()}
    </aside>
  );
  const renderMobileSecondaryMargin = () => (
    <aside className="mobile-game-shell__margin mobile-game-shell__margin--secondary">
      {renderMobileInventoryPanel()}
      {mobileControlProfile === "wasd-cluster" ? (
        <div className="mobile-game-shell__controls-slot">
          {renderMobileTouchControls()}
        </div>
      ) : null}
    </aside>
  );
  const renderModernHeaderToolbar = () => (
    <div className="modern-game-header__toolbar">
      <div aria-label="Primary controls" className="modern-game-header__toolbar-group" role="group">
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={restartCurrentLevel} type="button">
          <span>Restart</span>
          <span className="modern-game-header__shortcut">R</span>
        </button>
        <button
          className="modern-button modern-button--secondary modern-button--compact"
          disabled={!canTogglePause}
          onClick={toggleModernPause}
          type="button"
        >
          <span>{isPaused ? "Resume" : "Pause"}</span>
          <span className="modern-game-header__shortcut">Bksp</span>
        </button>
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={() => changeLevelBy(-1)} type="button">
          <span>Previous</span>
          <span className="modern-game-header__shortcut">P</span>
        </button>
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={() => changeLevelBy(1)} type="button">
          <span>Next</span>
          <span className="modern-game-header__shortcut">N</span>
        </button>
      </div>

      <div aria-label="Replay, advanced, and help" className="modern-game-header__toolbar-group modern-game-header__toolbar-group--right" role="group">
        <div className="modern-toolbar-menu" ref={replayMenuRef}>
          <button
            aria-expanded={showReplayMenu}
            aria-haspopup="menu"
            className="modern-button modern-button--secondary modern-button--compact"
            disabled={!replaysSupported}
            onClick={() => {
              setShowAdvancedMenu(false);
              setShowReplayMenu((current) => !current);
            }}
            type="button"
          >
            <span>Replays</span>
            <span aria-hidden="true" className="modern-toolbar-menu__caret">
              {showReplayMenu ? "▴" : "▾"}
            </span>
          </button>
          {showReplayMenu ? (
            <div aria-label="Replay actions" className="modern-toolbar-menu__panel" role="menu">
              <button className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item" disabled={!canSaveReplay} onClick={() => void saveReplayForCurrentRunFromMenu()} role="menuitem" type="button">
                Save Replay
              </button>
              <button
                className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item"
                disabled={!replaysSupported || !currentLevel || !currentSeries}
                onClick={() => {
                  void importReplayForCurrentLevelFromMenu();
                }}
                role="menuitem"
                type="button"
              >
                Import Replay
              </button>
              <button
                className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item"
                disabled={!latestCurrentReplayEntry}
                onClick={watchLatestReplayFromMenu}
                role="menuitem"
                type="button"
              >
                Watch Latest
              </button>
              <button
                className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item"
                disabled={currentLevelReplayEntries.length === 0}
                onClick={openManageReplays}
                role="menuitem"
                type="button"
              >
                Manage Replays
              </button>
            </div>
          ) : null}
        </div>
        <div className="modern-toolbar-menu" ref={advancedMenuRef}>
          <button
            aria-expanded={showAdvancedMenu}
            aria-haspopup="dialog"
            className="modern-button modern-button--secondary modern-button--compact"
            onClick={() => {
              setShowReplayMenu(false);
              setShowAdvancedMenu((current) => !current);
            }}
            type="button"
          >
            <span>Advanced</span>
            <span aria-hidden="true" className="modern-toolbar-menu__caret">
              {showAdvancedMenu ? "▴" : "▾"}
            </span>
          </button>
          {showAdvancedMenu ? (
            <div aria-label="Advanced gameplay options" className="modern-toolbar-menu__panel modern-toolbar-menu__panel--form" role="dialog">
              <div className="modern-toolbar-menu__section">
                {showManualMsStepToggle ? (
                  <button
                    className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item"
                    onClick={() => {
                      setManualMsStepParity((current) => (current === "even" ? "odd" : "even"));
                    }}
                    type="button"
                  >
                    Step: {manualMsStepParity === "even" ? "Even" : "Odd"}
                  </button>
                ) : null}
                <div className="modern-toolbar-menu__row">
                  <span>Current seed</span>
                  <strong>{activeRandomSeed !== null && Number.isFinite(activeRandomSeed) ? activeRandomSeed : "Loading..."}</strong>
                </div>
                <div className="modern-toolbar-menu__row">
                  <span>Seed lock</span>
                  <strong>{currentLevelSeedOverride ? currentLevelSeedOverride.randomSeed : "Off"}</strong>
                </div>
              </div>
              {showManualMsStepToggle ? (
                <p className="modern-toolbar-menu__copy">
                  Applies only to manual MS play and restarts the current level. Replay playback still uses the replay&apos;s recorded step.
                </p>
              ) : null}
              <label className="modern-toolbar-menu__field">
                <span className="modern-toolbar-menu__field-label">
                  Manual Seed{isLevelSeedLocked ? " (Locked)" : ""}
                </span>
                <div className="modern-toolbar-menu__input-row">
                  <input
                    className="modern-toolbar-menu__input"
                    disabled={isLevelSeedLocked}
                    inputMode="numeric"
                    max={LEGACY_RANDOM_SEED_MAX}
                    min={0}
                    onChange={(event) => {
                      setSeedInputValue(event.currentTarget.value);
                    }}
                    placeholder="0-2147483647"
                    type="text"
                    value={seedInputValue}
                  />
                  <button
                    aria-label="Generate a random seed"
                    className="modern-icon-button modern-toolbar-menu__refresh"
                    disabled={isLevelSeedLocked}
                    onClick={() => {
                      setSeedInputValue(String(createRandomLegacyRandomSeed()));
                    }}
                    type="button"
                  >
                    <RefreshIcon />
                  </button>
                </div>
              </label>
              <p className="modern-toolbar-menu__copy">
                The lock applies to this set, level, and ruleset, and toggling it restarts the current level. Replay playback still uses the replay&apos;s recorded seed.
              </p>
              {!isSeedInputValid && seedInputValue.trim() !== "" ? (
                <p className="modern-toolbar-menu__copy modern-toolbar-menu__copy--danger">
                  Seed must be an integer from 0 to 2147483647.
                </p>
              ) : null}
              <div className="modern-toolbar-menu__actions">
                <button
                  className="modern-button modern-button--secondary modern-button--compact modern-toolbar-menu__item"
                  disabled={!canToggleLevelSeedOverride}
                  onClick={() => {
                    void (isLevelSeedLocked ? clearLevelSeedOverride() : applyLevelSeedOverride());
                  }}
                  type="button"
                >
                  {isLevelSeedLocked ? "Unlock" : "Lock"}
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={toggleHelp} type="button">
          <span>Help</span>
          <span className="modern-game-header__shortcut">H</span>
        </button>
      </div>
    </div>
  );
  const renderModernBoardPanel = (embedded: boolean, keyPrefix: string) => (
    <section
      className="modern-game-board modern-game-board--with-rails"
      ref={gameplayFocusRef}
      tabIndex={-1}
    >
      <div className={`modern-game-board__frame${embedded ? " modern-game-board__frame--embedded" : ""}`}>
        <div className={`modern-game-stage${embedded ? " modern-game-stage--embedded" : ""}`}>
          {renderModernGameplayRail(keyPrefix)}
          <div className="modern-game-board__viewport">
            {isPaused ? (
              <div
                aria-live="polite"
                aria-label="Paused"
                className={`modern-game-board__paused${embedded ? " modern-game-board__paused--embedded" : ""}`}
                role="status"
              >
                <p className="modern-game-board__paused-title">PAUSED</p>
                <p className="modern-game-board__paused-copy">Press Backspace/Delete or use Resume to continue.</p>
              </div>
            ) : (
              <LegacyCanvasScreen
                buildCommitHash={TWORLD_BUILD_COMMIT}
                catalog={catalog}
                className={`modern-gameboard__canvas${embedded ? " modern-gameboard__canvas--embedded" : ""}`}
                currentLevel={currentLevel}
                currentSeries={currentSeries}
                currentRuleset={currentRuleset}
                inventoryKeyCountLabelsEnabled={inventoryKeyCountLabelsEnabled}
                isLoading={isCatalogLoading || isSessionLoading}
                liveSessionRef={liveSessionRef}
                message={message}
                mode="game"
                onMapClick={handleModernMapClick}
                onActivateSeries={activateSeries}
                onSelectSeries={selectSeries}
                presentation="map-only"
                selectedSeriesFile={selectedSeriesFile}
                session={session}
                debugModeEnabled={debugModeEnabled}
                visualEnhancementsEnabled={visualEnhancementsEnabled}
              />
            )}
            {!isPaused && modernHintOverlayText ? (
              <div className="modern-game-board__hint-overlay" role="status" aria-live="polite">
                <p className="modern-game-board__hint-overlay-copy">{modernHintOverlayText}</p>
              </div>
            ) : null}
            {modernResultSheet}
          </div>
          {renderModernInventoryRail()}
          {renderModernUndoPanel()}
        </div>
      </div>
    </section>
  );

  if (chromeMode === "modern-embedded") {
    return (
      <section className="modern-embedded-player">
        <header className="modern-embedded-player__header">
          <div className="modern-embedded-player__copy">
            <div className="modern-game-header__meta modern-game-header__meta--status-only">
              <p className="modern-section__eyebrow modern-game-header__state">{modernStatusLabel}</p>
            </div>
            <div className="modern-game-header__title-row">
              <h1 className="modern-embedded-player__title">{modernLevelTitle}</h1>
              {renderCurrentLevelLinkButton()}
            </div>
            <p className="modern-game-header__subtitle">
              <span>{modernGameplaySubtitle}</span>
              {currentLevelReplayEntries.length > 0 ? (
                <>
                  <span className="modern-game-header__subtitle-separator">·</span>
                  <button className="modern-game-header__subtitle-link" onClick={openManageReplays} type="button">
                    {currentReplayCountLabel}
                  </button>
                </>
              ) : null}
            </p>
          </div>
          {renderModernHeaderToolbar()}
        </header>

        <div className="modern-embedded-player__body">
          {renderModernBoardPanel(true, "embedded")}
        </div>
        {modernMessageModal}
        {manageReplaysModal}
        {helpOverlay}
      </section>
    );
  }

  if (chromeMode === "mobile") {
    return (
      <section
        className={`mobile-game-shell${isMobileLandscape ? " mobile-game-shell--landscape" : " mobile-game-shell--portrait"}`}
        ref={mobileShellRef}
      >
        {renderMobilePrimaryMargin()}
        <section
          className="mobile-game-shell__board"
          ref={gameplayFocusRef}
          tabIndex={-1}
        >
          <div className="mobile-game-shell__viewport" ref={mobileBoardViewportRef}>
            {isPaused ? (
              <div
                aria-live="polite"
                aria-label="Paused"
                className="mobile-game-shell__paused"
                role="status"
              >
                <p className="mobile-game-shell__paused-title">PAUSED</p>
                <p className="mobile-game-shell__paused-copy">Use Resume to continue.</p>
              </div>
            ) : (
              <div
                className="mobile-game-shell__canvas-frame"
                style={{
                  height: `${mobileCanvasFrameSizePx}px`,
                  width: `${mobileCanvasFrameSizePx}px`,
                }}
              >
                <LegacyCanvasScreen
                  buildCommitHash={TWORLD_BUILD_COMMIT}
                  catalog={catalog}
                  className="mobile-gameboard__canvas"
                  currentLevel={currentLevel}
                  currentSeries={currentSeries}
                  currentRuleset={currentRuleset}
                  inventoryKeyCountLabelsEnabled={inventoryKeyCountLabelsEnabled}
                  isLoading={isCatalogLoading || isSessionLoading}
                  liveSessionRef={liveSessionRef}
                  message={message}
                  mode="game"
                  onActivateSeries={activateSeries}
                  onSelectSeries={selectSeries}
                  presentation="map-only"
                  renderTileSize={mobileRenderTileSize}
                  selectedSeriesFile={selectedSeriesFile}
                  session={session}
                  debugModeEnabled={debugModeEnabled}
                  visualEnhancementsEnabled={visualEnhancementsEnabled}
                />
              </div>
            )}
            {!isPaused && modernHintOverlayText ? (
              <div className="modern-game-board__hint-overlay" role="status" aria-live="polite">
                <p className="modern-game-board__hint-overlay-copy">{modernHintOverlayText}</p>
              </div>
            ) : null}
            {modernResultSheet}
            {mobileControlProfile === "wasd-cluster" ? null : renderMobileTouchControls()}
          </div>
        </section>
        {renderMobileSecondaryMargin()}

        {modernMessageModal}
        {manageReplaysModal}
        {mobileSetSelectorSheet}
        {mobileLevelSelectorSheet}
        {mobileOverflowSheet}
        {helpOverlay}
      </section>
    );
  }

  if (chromeMode === "modern") {
    return (
      <main className="modern-shell modern-shell--game">
        <div className="modern-shell__inner modern-game-shell">
          <header className="modern-game-header">
            <div className="modern-game-header__copy">
              <div className="modern-game-header__meta">
                <div className="modern-set-hub__breadcrumbs">
                  <button className="modern-link-button" onClick={exitCurrentGame} type="button">
                    Back to Library
                  </button>
                  <span className="modern-set-hub__breadcrumb-separator">/</span>
                  <span className="modern-set-hub__breadcrumb-current">{currentFamily?.title ?? replayContextSeries?.filebase ?? "Current Set"}</span>
                </div>
                <p className="modern-section__eyebrow modern-game-header__state">{modernStatusLabel}</p>
              </div>
              <div className="modern-game-header__title-row">
                <h1 className="modern-game-header__title">{modernLevelTitle}</h1>
                {renderCurrentLevelLinkButton()}
              </div>
              <p className="modern-game-header__subtitle">
                <span>{modernGameplaySubtitle}</span>
                {currentLevelReplayEntries.length > 0 ? (
                  <>
                    <span className="modern-game-header__subtitle-separator">·</span>
                    <button className="modern-game-header__subtitle-link" onClick={openManageReplays} type="button">
                      {currentReplayCountLabel}
                    </button>
                  </>
                ) : null}
              </p>
            </div>
            {renderModernHeaderToolbar()}
          </header>

          <div className="modern-game-layout">
            {renderModernBoardPanel(false, "gameplay")}

            <aside className="modern-game-sidebar">
              <section className="modern-level-focus modern-level-focus--sidebar">
                <div className="modern-level-focus__header">
                  <div>
                    <p className="modern-section__eyebrow">Audio</p>
                    <h2 className="modern-level-focus__title">Sound</h2>
                  </div>
                </div>
                <div className="modern-game-sound">
                  <button className="modern-link-button" onClick={toggleMuted} type="button">
                    {soundMuted || soundVolume <= 0 ? "Enable Sound" : "Mute Sound"}
                  </button>
                  <label className="modern-game-sound__label" htmlFor="modern-sound-volume">
                    Volume {Math.round(soundVolume * 100)}%
                  </label>
                  <input
                    className="modern-game-sound__slider"
                    id="modern-sound-volume"
                    max="1"
                    min="0"
                    onChange={(event) => {
                      const nextVolume = Number(event.currentTarget.value);
                      setSoundVolume(Number.isFinite(nextVolume) ? nextVolume : 0.7);
                      if (nextVolume > 0 && soundMuted) {
                        setSoundMuted(false);
                      }
                    }}
                    step="0.05"
                    type="range"
                    value={soundVolume}
                  />
                </div>
              </section>

              <section className="modern-level-focus modern-level-focus--sidebar">
                <div className="modern-level-focus__header">
                  <div>
                    <p className="modern-section__eyebrow">Replay Library</p>
                    <h2 className="modern-level-focus__title">Current level and ruleset</h2>
                  </div>
                </div>
                <p className="modern-level-focus__body">
                  {currentLevelReplayEntries.some((entry) => entry.source === "reference")
                    ? "Saved, imported, and bundled reference replay files for this level appear here."
                    : "Saved and imported replay files for this level appear here."}
                </p>
                {replayModeNote ? <p className="modern-level-focus__body">{replayModeNote}</p> : null}
                {currentLevelReplayEntries.length > 0 ? (
                  <div className="modern-replay-library">
                    {currentLevelReplayEntries.slice(0, 5).map((entry) => {
                      const replayDetails = describeReplayEntry(entry);
                      return (
                        <div className="modern-replay-library__entry" key={replayEntryKey(entry)}>
                          <div>
                            <strong className="modern-replay-library__name">{entry.fileName}</strong>
                            <p className="modern-replay-library__meta">{replayDetails.summaryLabel}</p>
                          </div>
                          <button
                            className="modern-link-button"
                            onClick={() => {
                              watchSavedReplayEntry(entry);
                            }}
                            type="button"
                          >
                            Watch
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="modern-level-focus__body">
                    No saved replays for this level in {currentRulesetDisplayLabel ?? "the current ruleset"} yet.
                  </p>
                )}
              </section>
            </aside>
          </div>
          {modernMessageModal}
          {manageReplaysModal}
          {helpOverlay}
        </div>
      </main>
    );
  }

  return (
    <main className="legacy-shell">
      <input
        accept=".dat,.DAT"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (files.length === 0) {
            return;
          }

          void importLocalDatFiles(files);
        }}
        ref={datFileInputRef}
        type="file"
      />
      <div className="legacy-toolbar">
        <button
          aria-label="Import DAT files from local storage"
          className="legacy-toolbar__button"
          onClick={openDatPicker}
          type="button"
        >
          <OpenIcon />
        </button>
        <div className="legacy-sound">
          <button
            aria-expanded={showSoundControls}
            aria-label={soundMuted ? "Sound muted; open sound controls" : "Open sound controls"}
            className="legacy-toolbar__button"
            onClick={toggleSoundControls}
            type="button"
          >
            <SoundIcon muted={soundMuted || soundVolume <= 0} />
          </button>
          {showSoundControls ? (
            <section
              aria-label="Sound controls"
              className="legacy-sound__panel"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="legacy-sound__header">
                <span className="legacy-sound__title">Sound</span>
                <button className="legacy-sound__mute" onClick={toggleMuted} type="button">
                  {soundMuted || soundVolume <= 0 ? "Enable" : "Mute"}
                </button>
              </div>
              <label className="legacy-sound__label" htmlFor="legacy-sound-volume">
                Volume
              </label>
              <input
                className="legacy-sound__slider"
                id="legacy-sound-volume"
                max="1"
                min="0"
                onChange={(event) => {
                  const nextVolume = Number(event.currentTarget.value);
                  setSoundVolume(Number.isFinite(nextVolume) ? nextVolume : 0.7);
                  if (nextVolume > 0 && soundMuted) {
                    setSoundMuted(false);
                  }
                }}
                step="0.05"
                type="range"
                value={soundVolume}
              />
              <div className="legacy-sound__footer">
                <span>{Math.round(soundVolume * 100)}%</span>
                <button className="legacy-sound__close" onClick={closeSoundControls} type="button">
                  Close
                </button>
              </div>
            </section>
          ) : null}
        </div>
        <div className="legacy-history">
          <button
            aria-expanded={showHistoryControls}
            aria-label="Open undo and rewind controls"
            className="legacy-toolbar__button"
            onClick={toggleHistoryControls}
            type="button"
          >
            <HistoryIcon />
          </button>
          {showHistoryControls ? (
            <section
              aria-label="Undo and rewind controls"
              className="legacy-history__panel"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="legacy-history__header">
                <span className="legacy-history__title">History</span>
                <button className="legacy-history__close" onClick={closeHistoryControls} type="button">
                  Close
                </button>
              </div>
              {mode === "game" && session ? (
                <div className="legacy-history__summary">
                  <div className="legacy-history__summary-row">
                    <span>Time</span>
                    <span>
                      {formatInteractiveTickSeconds(session.history.currentTick)}s / {formatInteractiveTickSeconds(session.history.latestTick)}s
                    </span>
                  </div>
                  <div className="legacy-history__summary-row">
                    <span>Timeline</span>
                    <span>
                      {session.history.timelineId} ({session.history.timelineCount})
                    </span>
                  </div>
                  <div className="legacy-history__summary-row">
                    <span>State</span>
                    <span>{session.history.restoreMode}</span>
                  </div>
                </div>
              ) : (
                <p className="legacy-history__note">Start a level to use undo, rewind, and resume.</p>
              )}
              <div className="legacy-history__actions">
                <button
                  className="legacy-history__action"
                  disabled={!canUndoToPreviousTick}
                  onClick={undoPreviousTick}
                  type="button"
                >
                  {`Undo (${undoKeyBinding})`}
                </button>
                <button
                  className="legacy-history__action"
                  disabled={!canUndoToPreviousCheckpoint}
                  onClick={undoPreviousCheckpoint}
                  type="button"
                >
                  {`Rewind (Shift+${undoKeyBinding})`}
                </button>
                <button
                  className="legacy-history__action"
                  disabled={!canResumeOriginalTimeline}
                  onClick={resumeOriginalTimeline}
                  type="button"
                >
                  Continue with Replay
                </button>
              </div>
              <div className="legacy-history__settings">
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.enabled}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enabled: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Undo History</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.enableRewindAndResume}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        enableRewindAndResume: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Enable Rewind And Resume</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.allowTakeoverDuringHistoricalReplay}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        allowTakeoverDuringHistoricalReplay: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Allow Takeover During Historical Replay</span>
                </label>
                <label className="legacy-history__checkbox">
                  <input
                    checked={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      setUndoSettings((current) => ({
                        ...current,
                        retainUnlimitedHistory: event.currentTarget.checked,
                      }));
                    }}
                    type="checkbox"
                  />
                  <span>Keep Unlimited History</span>
                </label>
                <label className="legacy-history__field">
                  <span>Action 1 Key</span>
                  <select
                    onChange={(event) => {
                      applyPlayerKeyBindings({
                        ...playerKeyBindings,
                        action1Key: event.currentTarget.value as PlayerBindableKey,
                      });
                    }}
                    value={action1KeyBinding}
                  >
                    {availableAction1BindingKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>Undo Key</span>
                  <select
                    onChange={(event) => {
                      applyPlayerKeyBindings({
                        ...playerKeyBindings,
                        undoKey: event.currentTarget.value as PlayerBindableKey,
                      });
                    }}
                    value={undoKeyBinding}
                  >
                    {availableUndoBindingKeys.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>Checkpoint Density</span>
                  <select
                    onChange={(event) => {
                      const nextDensity = event.currentTarget.value as BrowserUndoSettings["checkpointDensity"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointDensity: nextDensity,
                      }));
                    }}
                    value={undoSettings.checkpointDensity}
                  >
                    <option value="dense">Dense</option>
                    <option value="standard">Standard</option>
                    <option value="sparse">Sparse</option>
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>History Retention Mode</span>
                  <select
                    onChange={(event) => {
                      const nextMode = event.currentTarget.value as BrowserUndoSettings["checkpointRetentionMode"];
                      setUndoSettings((current) => ({
                        ...current,
                        checkpointRetentionMode: nextMode,
                      }));
                    }}
                    value={undoSettings.checkpointRetentionMode}
                  >
                    <option value="dense-recent-exponential">Dense recent + exponential</option>
                    <option value="dense-recent">Dense recent only</option>
                  </select>
                </label>
                <label className="legacy-history__field">
                  <span>Bounded History Window</span>
                  <select
                    disabled={undoSettings.retainUnlimitedHistory}
                    onChange={(event) => {
                      const nextWindow = Number(event.currentTarget.value) as BrowserUndoSettings["maximumRetainedHistoryMinutes"];
                      setUndoSettings((current) => ({
                        ...current,
                        maximumRetainedHistoryMinutes: nextWindow,
                      }));
                    }}
                    value={undoSettings.maximumRetainedHistoryMinutes}
                  >
                    <option value="5">5 minutes</option>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="60">60 minutes</option>
                  </select>
                </label>
              </div>
              <p className="legacy-history__note">
                New history settings apply on the next level load or restart.
              </p>
            </section>
          ) : null}
        </div>
        <button
          aria-label={showHelp ? "Hide keyboard help" : "Show keyboard help"}
          className="legacy-toolbar__button"
          onClick={toggleHelp}
          type="button"
        >
          ?
        </button>
      </div>
      {historyStatusMessage ? (
        <div className="legacy-history__status" role="status">
          {historyStatusMessage}
        </div>
      ) : null}
      <LegacyCanvasScreen
        buildCommitHash={TWORLD_BUILD_COMMIT}
        catalog={catalog}
        currentLevel={currentLevel}
        currentSeries={currentSeries}
        currentRuleset={currentRuleset}
        inventoryKeyCountLabelsEnabled={inventoryKeyCountLabelsEnabled}
        isLoading={isCatalogLoading || isSessionLoading}
        liveSessionRef={liveSessionRef}
        message={message}
        mode={mode}
        onMapClick={handleModernMapClick}
        onActivateSeries={activateSeries}
        onDatDrop={(files) => {
          void importLocalDatFiles(files);
        }}
        onSelectSeries={selectSeries}
        selectedSeriesFile={selectedSeriesFile}
        session={session}
        debugModeEnabled={debugModeEnabled}
        visualEnhancementsEnabled={visualEnhancementsEnabled}
      />
      {helpOverlay}
    </main>
  );
}
