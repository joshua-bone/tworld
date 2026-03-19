import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { BrowserSoundEffectsPlayer } from "@player-web/impl/BrowserSoundEffectsPlayer";
import { shouldAutoSaveWinningHighScoreReplay } from "@player-web/impl/autoSaveReplayPolicy";
import { isFastForwardModifierActive } from "@player-web/impl/fastForward";
import {
  isFineUndoKey,
  hasBlockedMovementModifier,
  isFirstLevelKey,
  isHelpToggleKey,
  isSystemModifierKey,
  isLastLevelKey,
  isNextLevelKey,
  isPauseToggleKey,
  isPrevLevelKey,
  isProceedKey,
  isUndoCheckpointKey,
  isUndoKey,
} from "@player-web/impl/legacyHotkeys";
import {
  LegacyLynxInputBuffer,
  LegacyMsInputBuffer,
  type DirectionInput,
} from "@player-web/impl/legacyInput";
import { LegacyCanvasScreen, LegacyInventoryStrip, type LegacyMode } from "@player-web/impl/LegacyCanvasScreen";
import {
  buildCuratedCatalogView,
  findSetFamilyForSelection,
  listSetFamilyRulesets,
  resolveSetFamilySelection,
} from "@player-web/impl/modern/curatedCatalog";
import {
  activeGameplayHintOverlay,
  describeGameplayStatus,
  formatGameplayTimeLeft,
} from "@player-web/impl/modern/gameplayShellModel";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import { advanceInteractiveGameSession } from "@game-runtime/impl/advanceInteractiveGameSession";
import { buildReplayExport } from "@game-runtime/impl/buildReplayExport";
import { importReplayForLevel } from "@game-runtime/impl/importReplayForLevel";
import {
  previousInteractiveGameSessionExponentialCheckpointTick,
  previousInteractiveGameSessionCheckpointTick,
  previousInteractiveGameSessionTickByCount,
  previousInteractiveGameSessionTick,
} from "@game-runtime/impl/interactiveHistoryNavigation";
import { formatInteractiveTickSeconds } from "@game-runtime/impl/interactiveSessionRun";
import { loadBrowserPlayableCatalog } from "@player-web/impl/loadBrowserPlayableCatalog";
import {
  observeLegacySharedRandomSeed,
  resolveLegacySessionRandomSeed,
} from "@player-web/impl/legacySharedRandomSeed";
import { describeLocalDatImportMessage } from "@player-web/impl/localDatImportMessaging";
import { loadPlayableSelection } from "@player-web/impl/loadPlayableSelection";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import { resolveReplayActionContext } from "@player-web/impl/replayContext";
import { selectResultHeadline } from "@player-web/impl/resultHeadlines";
import { shouldPersistLevelProgress } from "@player-web/impl/sessionProgressPolicy";
import { restoreInteractiveGameSession } from "@game-runtime/impl/restoreInteractiveGameSession";
import { resumeInteractiveGameSession } from "@game-runtime/impl/resumeInteractiveGameSession";
import { savePlayableSelection } from "@player-web/impl/savePlayableSelection";
import { startInteractiveGameSession } from "@game-runtime/impl/startInteractiveGameSession";
import { startReplayInteractiveGameSession } from "@game-runtime/impl/startReplayInteractiveGameSession";
import type { InteractiveGameEnginePort, InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import type { InteractiveInput } from "@game-core/api/command";
import { replaySolutionCodec, type ReplaySolutionPayload } from "@game-core/api/codec";
import type { SeriesCatalogEntry } from "@content/api/series";
import { describeReplayEntry, listReplaysForCurrentLevel, listReplaysForSeriesLevel } from "@player-web/impl/modern/replayLibrary";
import {
  type BrowserLevelProgressSummary,
  type BrowserReplayEntry,
  createDefaultBrowserProfilePreferences,
} from "@player-web/ports/BrowserProfileStore";
import {
  loadStoredUndoSettings,
  saveStoredUndoSettings,
  toUndoSessionStartOptions,
  type BrowserUndoSettings,
} from "@player-web/impl/undoSettings";

const SOUND_MUTED_STORAGE_KEY = "tworld.sound-muted";
const SOUND_VOLUME_STORAGE_KEY = "tworld.sound-volume";
const LEGACY_FAST_TICK_MS = 25;
const LEGACY_NORMAL_TICK_MS = 50;
const GAME_TICKS_PER_SECOND = 20;
const UNDO_HOLD_REPEAT_DELAY_MS = 160;
const UNDO_HOLD_REPEAT_INTERVAL_MS = 40;
const MODERN_UNDO_STEP_TICK_COUNT = 4;
const MODERN_UNDO_SMOOTH_LIMIT_SECONDS = 8;
const MODERN_UNDO_SMOOTH_LIMIT_TICKS = MODERN_UNDO_SMOOTH_LIMIT_SECONDS * GAME_TICKS_PER_SECOND;
const MODERN_UNDO_CHECKPOINT_BASE_TICKS = GAME_TICKS_PER_SECOND;
const LOW_TIME_WARNING_TICKS = 10 * GAME_TICKS_PER_SECOND;

interface HelpCommand {
  keys: string;
  action: string;
}

interface HelpSection {
  title: string;
  commands: HelpCommand[];
}

function loadStoredMuted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_MUTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function loadStoredVolume(): number {
  try {
    const stored = Number(window.localStorage.getItem(SOUND_VOLUME_STORAGE_KEY));
    if (!Number.isFinite(stored)) {
      return 0.7;
    }
    return Math.max(0, Math.min(1, stored));
  } catch {
    return 0.7;
  }
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

interface ModernUndoTarget {
  continueHolding: boolean;
  mode: "checkpoint" | "smooth";
  targetTick: number;
}

function gameplayTimeRemainingTicks(session: InteractiveGameSession): number {
  return Math.max(0, session.frame.snapshot.timelimit - Math.max(session.frame.snapshot.currentTime, 0));
}

function nextModernUndoTarget(session: InteractiveGameSession): ModernUndoTarget | null {
  if (!session.history.enabled) {
    return null;
  }

  const currentAgeTicks = Math.max(0, session.history.latestTick - session.history.currentTick);
  if (currentAgeTicks < MODERN_UNDO_SMOOTH_LIMIT_TICKS) {
    const previousStepTick = previousInteractiveGameSessionTickByCount(session, MODERN_UNDO_STEP_TICK_COUNT);
    if (previousStepTick === null) {
      return null;
    }

    const smoothLimitTick = Math.max(
      session.history.initialTick,
      session.history.latestTick - MODERN_UNDO_SMOOTH_LIMIT_TICKS,
    );
    const targetTick = Math.max(previousStepTick, smoothLimitTick);
    return {
      continueHolding: targetTick > smoothLimitTick,
      mode: "smooth",
      targetTick,
    };
  }

  const checkpointTick = previousInteractiveGameSessionExponentialCheckpointTick(
    session,
    MODERN_UNDO_CHECKPOINT_BASE_TICKS,
  );
  if (checkpointTick === null) {
    return null;
  }

  return {
    continueHolding: false,
    mode: "checkpoint",
    targetTick: checkpointTick,
  };
}

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

function interactiveEngineForRuleset(
  ruleset: SeriesCatalogEntry["ruleset"],
  engines: BrowserAppServices["engines"],
): InteractiveGameEnginePort {
  if (ruleset === "None") {
    throw new Error("This series does not declare a playable ruleset.");
  }

  return engines[ruleset];
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

const GAME_PLAYING_HELP: HelpSection[] = [
  {
    title: "While Playing",
    commands: [
      { keys: "Arrow keys / WASD", action: "move Chip and start the clock" },
      { keys: "Mouse click (MS)", action: "set a mouse goal on the clicked map tile" },
      { keys: "Hold Shift", action: "run the game clock at 2x speed" },
      { keys: "Space", action: "start the clock without moving, or resume the original timeline after a restore" },
      { keys: "Z / hold Z", action: "rewind 4 ticks at a time and keep rewinding while held when undo history is enabled" },
      { keys: "Cmd/Ctrl + Z", action: "rewind 1 tick at a time" },
      { keys: "Shift + Z", action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GAME_PLAYING_HELP_MODERN: HelpSection[] = [
  {
    title: "While Playing",
    commands: [
      { keys: "Arrow keys / WASD", action: "move Chip and start the clock" },
      { keys: "Mouse click (MS)", action: "set a mouse goal on the clicked map tile" },
      { keys: "Hold Shift", action: "run the game clock at 2x speed" },
      { keys: "Space", action: "start the clock without moving, or resume the original timeline after a restore" },
      { keys: "Z / hold Z", action: "rewind 4 ticks at a time, then jump through 1s/2s/4s/8s checkpoints" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "Bkspc / Delete", action: "pause or resume the modern play view" },
      { keys: "P / PageUp", action: "go to the previous level" },
      { keys: "N / PageDown", action: "go to the next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GAME_ENDED_HELP: HelpSection[] = [
  {
    title: "After A Level Ends",
    commands: [
      { keys: "Enter", action: "continue: next level after a win, retry after a loss" },
      { keys: "Space", action: "resume the original timeline after a restore, or continue when no rewind is active" },
      { keys: "Z / hold Z", action: "rewind 4 ticks at a time and keep rewinding while held when undo history is enabled" },
      { keys: "Cmd/Ctrl + Z", action: "rewind 1 tick at a time" },
      { keys: "Shift + Z", action: "rewind to the previous checkpoint and keep rewinding checkpoints while held" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "P / N or PageUp / PageDown", action: "go to the previous or next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GAME_ENDED_HELP_MODERN: HelpSection[] = [
  {
    title: "After A Level Ends",
    commands: [
      { keys: "Enter", action: "continue: next level after a win, retry after a loss" },
      { keys: "Space", action: "resume the original timeline after a restore, or continue when no rewind is active" },
      { keys: "Z / hold Z", action: "rewind 4 ticks at a time, then jump through 1s/2s/4s/8s checkpoints" },
      { keys: "History button", action: "open undo settings and resume the original timeline after a restore" },
      { keys: "R", action: "restart the current level" },
      { keys: "PageUp", action: "go to the previous level" },
      { keys: "N / PageDown", action: "go to the next level" },
      { keys: "Cmd/Ctrl + < / >", action: "jump to the first or last level in the current set" },
      { keys: "Home / End", action: "also jump to the first or last level when available" },
      { keys: "Escape", action: "return to the series list" },
    ],
  },
];

const GLOBAL_HELP: HelpSection[] = [
  {
    title: "Help",
    commands: [
      { keys: "? / F1 / button", action: "toggle this help overlay" },
    ],
  },
];

function keyToInput(key: string): DirectionInput | null {
  switch (key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "north";
    case "ArrowLeft":
    case "a":
    case "A":
      return "west";
    case "ArrowDown":
    case "s":
    case "S":
      return "south";
    case "ArrowRight":
    case "d":
    case "D":
      return "east";
    default:
      return null;
  }
}

function clampIndex(value: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(count - 1, value));
}

function resolveInitialSelection(
  catalog: SeriesCatalogEntry[],
  stored: PlayableSelection | null,
): PlayableSelection | null {
  if (catalog.length === 0) {
    return null;
  }

  if (stored) {
    const series = catalog.find((candidate) => candidate.filebase === stored.seriesFile);
    const level = series?.levels.find((candidate) => candidate.number === stored.levelNumber);
    if (series && level) {
      return stored;
    }
  }

  const fallbackSeries = catalog[0]!;
  return {
    seriesFile: fallbackSeries.filebase,
    levelNumber: fallbackSeries.levels[0]?.number ?? 1,
  };
}

function pickLevelNumber(series: SeriesCatalogEntry | null, requested: number | null): number | null {
  if (!series) {
    return null;
  }

  if (requested !== null && series.levels.some((level) => level.number === requested)) {
    return requested;
  }

  return series.levels[0]?.number ?? null;
}

function isDatFile(file: File): boolean {
  return /\.dat$/iu.test(file.name);
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

interface PlayerAppProps {
  autoDownloadReplaysOnSave?: boolean;
  autoSaveWinningHighScoreReplays?: boolean;
  services: BrowserAppServices;
  chromeMode?: "legacy" | "modern" | "modern-embedded";
  initialCatalog?: SeriesCatalogEntry[];
  initialMode?: LegacyMode;
  initialReplayEntries?: BrowserReplayEntry[];
  initialSelection?: PlayableSelection | null;
  knownLevelProgressSummary?: BrowserLevelProgressSummary | null;
  onExitGame?: () => void;
  onLevelProgressSaved?: (summary: BrowserLevelProgressSummary) => void;
  onSelectionChange?: (selection: PlayableSelection) => void;
}

export function PlayerApp({
  autoDownloadReplaysOnSave = createDefaultBrowserProfilePreferences().autoDownloadReplaysOnSave,
  autoSaveWinningHighScoreReplays = createDefaultBrowserProfilePreferences().autoSaveWinningHighScoreReplays,
  services,
  chromeMode = "legacy",
  initialCatalog = [],
  initialMode = "series-list",
  initialReplayEntries = [],
  initialSelection = null,
  knownLevelProgressSummary = null,
  onExitGame,
  onLevelProgressSaved,
  onSelectionChange,
}: PlayerAppProps) {
  const { engines, importDatFile, profileStore, replayTransfer, selectionStore } = services;
  const initialCatalogRef = useRef<SeriesCatalogEntry[]>(initialCatalog);
  const initialModeRef = useRef<LegacyMode>(initialMode);
  const initialReplayEntriesRef = useRef<BrowserReplayEntry[]>(initialReplayEntries);
  const initialSelectionRef = useRef<PlayableSelection | null>(initialSelection);
  const levelAttemptCountsRef = useRef<Map<string, number>>(new Map());
  const undoSettingsSeedRef = useRef<BrowserUndoSettings | null>(null);
  if (undoSettingsSeedRef.current === null) {
    undoSettingsSeedRef.current = loadStoredUndoSettings();
  }
  const [mode, setMode] = useState<LegacyMode>(initialModeRef.current);
  const [catalog, setCatalog] = useState<SeriesCatalogEntry[]>([]);
  const [savedReplayEntries, setSavedReplayEntries] = useState<BrowserReplayEntry[]>([]);
  const [selectedSeriesFile, setSelectedSeriesFile] = useState<string | null>(null);
  const [selectedLevelNumber, setSelectedLevelNumber] = useState<number | null>(null);
  const [session, setSession] = useState<InteractiveGameSession | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showReplayMenu, setShowReplayMenu] = useState(false);
  const [showSoundControls, setShowSoundControls] = useState(false);
  const [showHistoryControls, setShowHistoryControls] = useState(false);
  const [showManageReplays, setShowManageReplays] = useState(false);
  const [pendingReplayEntryId, setPendingReplayEntryId] = useState<string | null>(null);
  const [selectedManagedReplayId, setSelectedManagedReplayId] = useState<string | null>(null);
  const [replaySaveNotice, setReplaySaveNotice] = useState<string | null>(null);
  const [soundMuted, setSoundMuted] = useState(() => loadStoredMuted());
  const [soundVolume, setSoundVolume] = useState(() => loadStoredVolume());
  const [undoSettings, setUndoSettings] = useState<BrowserUndoSettings>(undoSettingsSeedRef.current);
  const [manualRunStarted, setManualRunStarted] = useState(false);
  const [isFastForwarding, setIsFastForwarding] = useState(false);
  const [heldUndoMode, setHeldUndoMode] = useState<"coarse" | "fine" | "checkpoint" | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [replayLaunchRequest, setReplayLaunchRequest] = useState<{
    levelNumber: number;
    replay: ReplaySolutionPayload;
    replayName: string;
    seriesFile: string;
    token: number;
  } | null>(null);
  const tickingRef = useRef(false);
  const historyNavigationRef = useRef(false);
  const msInputBufferRef = useRef(new LegacyMsInputBuffer());
  const lynxInputBufferRef = useRef(new LegacyLynxInputBuffer());
  const soundPlayerRef = useRef<BrowserSoundEffectsPlayer | null>(null);
  const undoStartOptionsRef = useRef(toUndoSessionStartOptions(undoSettingsSeedRef.current));
  const datFileInputRef = useRef<HTMLInputElement | null>(null);
  const replayMenuRef = useRef<HTMLDivElement | null>(null);
  const recordedTerminalSessionRef = useRef<string | null>(null);
  const notifiedSelectionKeyRef = useRef<string | null>(null);
  const appliedInitialSelectionKeyRef = useRef<string | null>(null);
  const currentSelectionRef = useRef<PlayableSelection | null>(initialSelection);
  const sessionStartedFromReplayRef = useRef(false);

  const currentSeries = catalog.find((series) => series.filebase === selectedSeriesFile) ?? null;
  const currentLevel = currentSeries?.levels.find((level) => level.number === selectedLevelNumber) ?? null;
  const currentRuleset = session?.request.ruleset ?? (currentSeries?.ruleset === "None" ? null : currentSeries?.ruleset ?? null);
  const currentSelection =
    selectedSeriesFile && selectedLevelNumber
      ? {
          seriesFile: selectedSeriesFile,
          levelNumber: selectedLevelNumber,
        }
      : null;
  const currentFamily = findSetFamilyForSelection(buildCuratedCatalogView(catalog, currentSelection), currentSelection);
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
  const familyRulesets = currentFamily ? listSetFamilyRulesets(currentFamily) : [];
  const previousHistoryTick = session ? previousInteractiveGameSessionTick(session) : null;
  const previousCoarseHistoryTick = session ? previousInteractiveGameSessionTickByCount(session, MODERN_UNDO_STEP_TICK_COUNT) : null;
  const previousHistoryCheckpointTick = session ? previousInteractiveGameSessionCheckpointTick(session) : null;
  const modernUndoTarget = session ? nextModernUndoTarget(session) : null;
  const canUseModernUndo = Boolean(session?.history.enabled && modernUndoTarget !== null);
  const canUndoToPreviousTick = Boolean(session?.history.enabled && previousHistoryTick !== null);
  const canUndoToPreviousCheckpoint = Boolean(
    session?.history.enabled && previousHistoryCheckpointTick !== null,
  );
  const canResumeOriginalTimeline = Boolean(
    session?.history.enabled &&
      undoSettings.enableRewindAndResume &&
      session?.history.restoreMode === "restored-paused" &&
      session.history.latestTick > session.history.currentTick,
  );
  const historyStatusMessage =
    mode !== "game" || !session || !session.history.enabled || session.history.restoreMode === "live"
      ? null
      : session.history.restoreMode === "restored-paused"
        ? `Restored to ${formatInteractiveTickSeconds(session.history.currentTick)}s. ${
            canResumeOriginalTimeline
              ? `Press Space or use Continue with Replay to replay forward to ${formatInteractiveTickSeconds(session.history.latestTick)}s.`
              : chromeMode === "modern" || chromeMode === "modern-embedded"
                ? "Use Z to keep rewinding, or take over with a live move."
                : "Use Z, Cmd/Ctrl+Z, or Shift+Z to keep rewinding, or take over with a live move."
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
      ? `${session.request.seriesFile}:${session.request.levelNumber}:${runResult.outcome}:${session.frame.snapshot.tick}:${session.run.undoUsedCount}`
      : null;
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
            String(session.frame.snapshot.tick),
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
  const previousKnownLevelProgress =
    session && knownLevelProgressSummary && knownLevelProgressSummary.seriesFile === session.request.seriesFile &&
      knownLevelProgressSummary.levelNumber === session.request.levelNumber
      ? knownLevelProgressSummary
      : null;
  const canSaveReplay = Boolean(session?.run.replayAvailable && replayContextLevel && replayContextSeries);
  const currentLevelReplayEntries = session
    ? listReplaysForSeriesLevel(
        savedReplayEntries,
        session.request.seriesFile,
        session.request.levelNumber,
        session.request.ruleset,
      )
    : listReplaysForCurrentLevel(
        savedReplayEntries,
        currentFamily,
        currentLevel?.number ?? null,
        currentRuleset,
      );
  const latestCurrentReplayEntry = currentLevelReplayEntries[0] ?? null;
  const continueReplayEntry =
    currentLevelReplayEntries.find((entry) => entry.id === pendingReplayEntryId) ?? latestCurrentReplayEntry;
  const canContinueFromReplay = continueReplayEntry !== null;
  const currentReplayCountLabel =
    currentLevelReplayEntries.length === 1 ? "1 replay" : `${currentLevelReplayEntries.length} replays`;
  const modernGameplaySubtitle = formatModernGameplaySubtitle(replayContextSeries?.filebase, replayContextLevel);
  const currentLevelReplayRows = useMemo(
    () =>
      currentLevelReplayEntries.map((entry) => {
        const replayDescription = describeReplayEntry(entry);
        const inspection = replaySolutionCodec.inspect(entry.bytes);
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
    currentLevelReplayRows.find((row) => row.entry.id === selectedManagedReplayId) ?? currentLevelReplayRows[0] ?? null;
  const replayModeNote =
    session?.mode === "replay"
      ? "This session is replaying recorded moves. Restart returns to live play; rewinding and taking over can branch a new timeline where history settings allow it."
      : session?.history.restoreMode === "replaying-history"
        ? "The original timeline is replaying forward. Any live move can fork a new run when historical takeover is enabled."
        : null;
  const isModernChrome = chromeMode === "modern" || chromeMode === "modern-embedded";
  const isEmbeddedModernChrome = chromeMode === "modern-embedded";
  const canTogglePause = Boolean(session && !isSessionLoading && (isPaused || session.frame.snapshot.status === "playing"));
  const helpSections =
    mode === "series-list"
      ? [...SERIES_LIST_HELP, ...GLOBAL_HELP]
      : session?.frame.snapshot.status === "playing"
        ? [...(isModernChrome ? GAME_PLAYING_HELP_MODERN : GAME_PLAYING_HELP), ...GLOBAL_HELP]
        : [...(isModernChrome ? GAME_ENDED_HELP_MODERN : GAME_ENDED_HELP), ...GLOBAL_HELP];

  useEffect(() => {
    const player = new BrowserSoundEffectsPlayer();
    soundPlayerRef.current = player;
    player.setMuted(soundMuted);
    player.setVolume(soundVolume);

    return () => {
      player.dispose();
      soundPlayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOUND_MUTED_STORAGE_KEY, soundMuted ? "1" : "0");
    } catch {
      // Ignore storage failures and keep in-memory settings.
    }
    soundPlayerRef.current?.setMuted(soundMuted);
  }, [soundMuted]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SOUND_VOLUME_STORAGE_KEY, String(soundVolume));
    } catch {
      // Ignore storage failures and keep in-memory settings.
    }
    soundPlayerRef.current?.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    if (mode !== "game") {
      setIsFastForwarding(false);
    }
  }, [mode]);

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
    let active = true;

    if (initialCatalogRef.current.length > 0) {
      const resolvedSelection = resolveInitialSelection(initialCatalogRef.current, initialSelectionRef.current);
      startTransition(() => {
        setCatalog(initialCatalogRef.current);
        setSavedReplayEntries(initialReplayEntriesRef.current);
        setSelectedSeriesFile(resolvedSelection?.seriesFile ?? null);
        setSelectedLevelNumber(resolvedSelection?.levelNumber ?? null);
        setMode(initialModeRef.current === "game" && resolvedSelection ? "game" : "series-list");
        setMessage(null);
        setIsCatalogLoading(false);
      });
    }

    Promise.all([loadBrowserPlayableCatalog(services), loadPlayableSelection(selectionStore), profileStore.loadReplayEntries()])
      .then(([nextCatalog, storedSelection, storedReplayEntries]) => {
        if (!active) {
          return;
        }

        const preferredSelection = currentSelectionRef.current ?? initialSelectionRef.current ?? storedSelection;
        const resolvedSelection = resolveInitialSelection(nextCatalog, preferredSelection);
        startTransition(() => {
          setCatalog(nextCatalog);
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
  }, []);

  useEffect(() => {
    if (!selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    void savePlayableSelection(selectionStore, {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
    }).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : String(error));
    });
  }, [selectedLevelNumber, selectedSeriesFile]);

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
    if (
      !shouldPersistLevelProgress({
        hasResult: Boolean(session?.run.result),
        mode,
        sessionMode: session?.mode ?? null,
        sessionStartedFromReplay: sessionStartedFromReplayRef.current,
      }) ||
      !session
    ) {
      return;
    }

    const result = session.run.result!;

    const recordKey = `${session.request.seriesFile}:${session.request.levelNumber}:${result.outcome}:${session.frame.snapshot.tick}:${session.run.undoUsedCount}`;
    if (recordedTerminalSessionRef.current === recordKey) {
      return;
    }
    recordedTerminalSessionRef.current = recordKey;
    const attemptKey = `${session.request.seriesFile}:${String(session.request.levelNumber)}`;
    levelAttemptCountsRef.current.set(attemptKey, (levelAttemptCountsRef.current.get(attemptKey) ?? 0) + 1);

    const progressSummary: BrowserLevelProgressSummary = {
      seriesFile: session.request.seriesFile,
      levelNumber: session.request.levelNumber,
      lastPlayedAtMs: Date.now(),
      lastResult: result.outcome,
      bestResult: result.outcome,
      lastScore: result.score?.finalScore ?? 0,
      bestScore: result.score?.finalScore ?? 0,
      lastUndoUsedCount: session.run.undoUsedCount,
      bestUndoUsedCount: session.run.undoUsedCount,
    };

    onLevelProgressSaved?.(progressSummary);
    void profileStore.saveLevelProgressSummary(progressSummary);

    if (
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
    session,
  ]);

  useEffect(() => {
    if (mode !== "game" || !selectedSeriesFile || !selectedLevelNumber) {
      return;
    }

    const series = catalog.find((candidate) => candidate.filebase === selectedSeriesFile);
    if (!series) {
      return;
    }
    if (series.ruleset === "None") {
      setMode("series-list");
      setMessage(`${series.filebase} does not declare a playable ruleset.`);
      return;
    }
    let active = true;
    const queuedReplay =
      replayLaunchRequest &&
      replayLaunchRequest.seriesFile === selectedSeriesFile &&
      replayLaunchRequest.levelNumber === selectedLevelNumber
        ? replayLaunchRequest
        : null;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setIsPaused(false);
    setIsSessionLoading(true);

    const request = {
      seriesFile: selectedSeriesFile,
      levelNumber: selectedLevelNumber,
      ruleset: series.ruleset,
      randomSeed: resolveLegacySessionRandomSeed(queuedReplay?.replay.randomSeed),
    } as const;

    const sessionPromise = queuedReplay
      ? startReplayInteractiveGameSession(
          interactiveEngineForRuleset(series.ruleset, engines),
          request,
          queuedReplay.replay,
          undoStartOptionsRef.current,
        )
      : startInteractiveGameSession(
          interactiveEngineForRuleset(series.ruleset, engines),
          request,
          undoStartOptionsRef.current,
        );

    sessionPromise
      .then((nextSession) => {
        if (!active) {
          return;
        }

        void profileStore.recordRecentSelection({
          seriesFile: selectedSeriesFile,
          levelNumber: selectedLevelNumber,
        });
        sessionStartedFromReplayRef.current = Boolean(queuedReplay) || nextSession.mode === "replay";

        startTransition(() => {
          setSession(nextSession);
          setManualRunStarted(nextSession.mode === "replay");
          setIsRunning(nextSession.frame.snapshot.status === "playing");
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
          setIsSessionLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [catalog, engines, mode, replayLaunchRequest, reloadToken, selectedLevelNumber, selectedSeriesFile]);

  useEffect(() => {
    if (
      mode !== "game" ||
      !session ||
      session.mode !== "manual" ||
      session.history.restoreMode !== "live"
    ) {
      return;
    }

    observeLegacySharedRandomSeed(session.frame.snapshot.randomState.main.value);
  }, [mode, session]);

  const advanceTick = useEffectEvent(async (input: InteractiveInput) => {
    if (mode !== "game" || !session || tickingRef.current || isPaused) {
      return;
    }

    tickingRef.current = true;
    try {
      const nextSession = await advanceInteractiveGameSession(
        interactiveEngineForRuleset(session.request.ruleset, engines),
        session,
        input,
      );
      startTransition(() => {
        setSession(nextSession);
      });
      if (nextSession.frame.snapshot.status !== "playing") {
        setIsRunning(false);
      }
    } catch (error: unknown) {
      setIsRunning(false);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      tickingRef.current = false;
    }
  });

  const syncSessionState = useEffectEvent((nextSession: InteractiveGameSession) => {
    startTransition(() => {
      setSession(nextSession);
      setIsPaused(false);
      setIsRunning(
        nextSession.frame.snapshot.status === "playing" && nextSession.history.restoreMode !== "restored-paused",
      );
      setMessage(null);
    });
  });

  const addSavedReplayEntry = useEffectEvent((entry: BrowserReplayEntry) => {
    startTransition(() => {
      setSavedReplayEntries((current) =>
        [entry, ...current.filter((existing) => existing.id !== entry.id)].sort((left, right) => right.savedAtMs - left.savedAtMs),
      );
    });
  });

  const dismissMessage = useEffectEvent(() => {
    setMessage(null);
  });

  const saveReplayArtifactToLibrary = useEffectEvent(
    async (
      artifact: { bytes: Uint8Array; filename: string },
      source: BrowserReplayEntry["source"],
      options: {
        finalScore?: number | null;
        result?: BrowserReplayEntry["result"];
        undoUsedCount?: number | null;
      } = {},
    ) => {
      if (
        !replayContextLevel ||
        !replayContextSeries ||
        (replayContextSeries.ruleset !== "MS" && replayContextSeries.ruleset !== "Lynx")
      ) {
        return null;
      }

      const storedEntry = await profileStore.saveReplayEntry({
        fileName: artifact.filename,
        seriesFile: replayContextSeries.filebase,
        levelNumber: replayContextLevel.number,
        levelName: replayContextLevel.name,
        ruleset: replayContextSeries.ruleset,
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

  const launchReplayForSelection = useEffectEvent((selection: PlayableSelection, replay: ReplaySolutionPayload, replayName: string) => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setIsPaused(false);
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    stopHeldUndo();
    setReplayLaunchRequest({
      levelNumber: selection.levelNumber,
      replay,
      replayName,
      seriesFile: selection.seriesFile,
      token: Date.now(),
    });
    setSelectedSeriesFile(selection.seriesFile);
    setSelectedLevelNumber(selection.levelNumber);
    setMode("game");
  });

  const watchSavedReplayEntry = useEffectEvent((entry: BrowserReplayEntry) => {
    const decodedReplay = replaySolutionCodec.inspect(entry.bytes);
    if (!decodedReplay) {
      setMessage(`${entry.fileName} is no longer a valid replay payload.`);
      return;
    }

    launchReplayForSelection(
      {
        seriesFile: entry.seriesFile,
        levelNumber: entry.levelNumber,
      },
      decodedReplay.payload,
      entry.fileName,
    );
  });

  const importReplayForCurrentLevel = useEffectEvent(async () => {
    if (
      !replayContextLevel ||
      !replayContextSeries ||
      (replayContextSeries.ruleset !== "MS" && replayContextSeries.ruleset !== "Lynx")
    ) {
      return;
    }

    try {
      const imported = await importReplayForLevel(replayTransfer, replayContextLevel);
      if (!imported) {
        return;
      }

      const storedEntry = await saveReplayArtifactToLibrary(
        {
          bytes: imported.bytes,
          filename: imported.fileName,
        },
        "imported-file",
      );
      setPendingReplayEntryId(storedEntry?.id ?? null);
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

  const restoreToTick = useEffectEvent((targetTick: number | null) => {
    if (
      targetTick === null ||
      mode !== "game" ||
      !session ||
      historyNavigationRef.current ||
      targetTick === session.history.currentTick
    ) {
      return;
    }

    historyNavigationRef.current = true;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsPaused(false);

    void restoreInteractiveGameSession(
      interactiveEngineForRuleset(session.request.ruleset, engines),
      session,
      targetTick,
    )
      .then(syncSessionState)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const undoPreviousTick = useEffectEvent(() => {
    restoreToTick(previousHistoryTick);
  });

  const undoPreviousTickBurst = useEffectEvent(() => {
    restoreToTick(previousCoarseHistoryTick);
  });

  const undoPreviousCheckpoint = useEffectEvent(() => {
    restoreToTick(previousHistoryCheckpointTick);
  });

  const performModernUndo = useEffectEvent((forHeldRepeat = false): boolean => {
    if (mode !== "game" || !session || historyNavigationRef.current) {
      return false;
    }

    const nextTarget = nextModernUndoTarget(session);
    if (!nextTarget) {
      return false;
    }

    if (forHeldRepeat && nextTarget.mode !== "smooth") {
      stopHeldUndo();
      return false;
    }

    if (forHeldRepeat && !nextTarget.continueHolding) {
      stopHeldUndo();
    }

    restoreToTick(nextTarget.targetTick);
    return !forHeldRepeat && nextTarget.mode === "smooth" && nextTarget.continueHolding;
  });

  const resumeOriginalTimeline = useEffectEvent(() => {
    if (!canResumeOriginalTimeline || mode !== "game" || !session || historyNavigationRef.current) {
      return;
    }

    historyNavigationRef.current = true;
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsPaused(false);

    void resumeInteractiveGameSession(
      interactiveEngineForRuleset(session.request.ruleset, engines),
      session,
    )
      .then(syncSessionState)
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        historyNavigationRef.current = false;
      });
  });

  const stopHeldUndo = useEffectEvent(() => {
    setHeldUndoMode(null);
  });

  const stepHeldUndo = useEffectEvent((nextMode: "coarse" | "fine" | "checkpoint") => {
    if (isModernChrome) {
      performModernUndo(true);
      return;
    }

    if (nextMode === "checkpoint") {
      undoPreviousCheckpoint();
      return;
    }

    if (nextMode === "fine") {
      undoPreviousTick();
      return;
    }

    undoPreviousTickBurst();
  });

  const resumeOriginalTimelineFromSpace = useEffectEvent(() => {
    setIsPaused(false);
    setIsRunning(true);
    resumeOriginalTimeline();
  });

  const resumeLivePlayFromRestore = useEffectEvent(() => {
    setIsPaused(false);
    setIsRunning(true);
  });

  const toggleModernPause = useEffectEvent(() => {
    if (!canTogglePause) {
      return;
    }

    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    stopHeldUndo();
    setIsFastForwarding(false);
    setIsPaused((current) => !current);
  });

  useEffect(() => {
    if (
      mode !== "game" ||
      !session ||
      !isRunning ||
      isPaused ||
      showHelp ||
      (session.mode === "manual" && !manualRunStarted)
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const inputCode =
        session.request.ruleset === "Lynx"
          ? lynxInputBufferRef.current.nextTickInputCode()
          : msInputBufferRef.current.nextTickInputCode();
      void advanceTick(inputCode);
    }, isFastForwarding ? LEGACY_FAST_TICK_MS : LEGACY_NORMAL_TICK_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [advanceTick, isFastForwarding, isPaused, isRunning, manualRunStarted, mode, session, showHelp]);

  useEffect(() => {
    if (mode !== "game" || heldUndoMode === null || showHelp) {
      return;
    }

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        stepHeldUndo(heldUndoMode);
      }, UNDO_HOLD_REPEAT_INTERVAL_MS);
    }, UNDO_HOLD_REPEAT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [heldUndoMode, mode, showHelp, stepHeldUndo]);

  useEffect(() => {
    if (!isModernChrome || !message) {
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
  }, [dismissMessage, isModernChrome, message]);

  useEffect(() => {
    if (!isModernChrome || !showManageReplays) {
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
  }, [isModernChrome, showManageReplays]);

  const selectSeries = useEffectEvent((seriesFile: string) => {
    const series = catalog.find((candidate) => candidate.filebase === seriesFile) ?? null;
    setReplayLaunchRequest(null);
    setSelectedSeriesFile(seriesFile);
    setSelectedLevelNumber((current) => pickLevelNumber(series, current));
    setIsPaused(false);
    setMessage(null);
  });

  const exitCurrentGame = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setIsPaused(false);
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    stopHeldUndo();
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
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setIsPaused(false);
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    stopHeldUndo();
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
  }, [catalog, initialSelection, isCatalogLoading, launchSelection, mode, selectedLevelNumber, selectedSeriesFile]);

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
    if (catalog.length === 0) {
      return;
    }

    const currentIndex = catalog.findIndex((series) => series.filebase === selectedSeriesFile);
    const nextIndex = clampIndex((currentIndex >= 0 ? currentIndex : 0) + delta, catalog.length);
    selectSeries(catalog[nextIndex]!.filebase);
  });

  const jumpSelectedSeries = useEffectEvent((position: "first" | "last") => {
    if (catalog.length === 0) {
      return;
    }

    selectSeries(position === "first" ? catalog[0]!.filebase : catalog[catalog.length - 1]!.filebase);
  });

  const changeLevelBy = useEffectEvent((delta: number) => {
    if (!currentSeries || !currentLevel) {
      return;
    }

    const currentIndex = currentSeries.levels.findIndex((level) => level.number === currentLevel.number);
    const nextIndex = clampIndex(currentIndex + delta, currentSeries.levels.length);
    const nextLevel = currentSeries.levels[nextIndex];
    if (!nextLevel || nextLevel.number === currentLevel.number) {
      return;
    }

    setReplayLaunchRequest(null);
    setIsPaused(false);
    setSelectedLevelNumber(nextLevel.number);
  });

  const jumpLevel = useEffectEvent((position: "first" | "last") => {
    if (!currentSeries || currentSeries.levels.length === 0) {
      return;
    }

    const nextLevel = position === "first" ? currentSeries.levels[0] : currentSeries.levels[currentSeries.levels.length - 1];
    if (!nextLevel) {
      return;
    }

    setReplayLaunchRequest(null);
    setIsPaused(false);
    setSelectedLevelNumber(nextLevel.number);
  });

  const restartCurrentLevel = useEffectEvent(() => {
    setReplayLaunchRequest(null);
    setIsPaused(false);
    setReloadToken((value) => value + 1);
  });

  const proceedAfterLevelEnd = useEffectEvent(() => {
    if (!session || !currentSeries || !currentLevel) {
      return;
    }

    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsPaused(false);

    if (session.frame.snapshot.status === "completed") {
      const currentIndex = currentSeries.levels.findIndex((level) => level.number === currentLevel.number);
      const nextLevel = currentSeries.levels[currentIndex + 1];
      if (nextLevel) {
        setReplayLaunchRequest(null);
        setSelectedLevelNumber(nextLevel.number);
        setMessage(null);
        return;
      }

      if (isModernChrome) {
        restartCurrentLevel();
        return;
      }

      setMode("series-list");
      setMessage(`${currentSeries.filebase} completed.`);
      return;
    }

    if (session.frame.snapshot.status === "failed") {
      restartCurrentLevel();
    }
  });

  const saveReplayForCurrentRun = useEffectEvent(async (options: { autoTriggered?: boolean } = {}) => {
    if (!session || !replayContextLevel || !replayContextSeries) {
      return;
    }

    try {
      const artifact = buildReplayExport(replayContextSeries.filebase, replayContextLevel, session);
      if (!artifact) {
        throw new Error("no replay data is available for export yet");
      }

      const storedEntry = await saveReplayArtifactToLibrary(artifact, "saved-run", {
        finalScore: session.run.result?.score?.finalScore ?? null,
        result: session.run.result?.outcome ?? null,
        undoUsedCount: session.run.undoUsedCount,
      });
      const downloadedCopy = autoDownloadReplaysOnSave;
      if (downloadedCopy) {
        await replayTransfer.exportReplay(artifact);
      }
      if (session.run.result) {
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
    setSelectedManagedReplayId(continueReplayEntry?.id ?? currentLevelReplayEntries[0]?.id ?? null);
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
      setSelectedManagedReplayId(null);
      return;
    }

    if (!selectedManagedReplayId || !currentLevelReplayEntries.some((entry) => entry.id === selectedManagedReplayId)) {
      setSelectedManagedReplayId(currentLevelReplayEntries[0]?.id ?? null);
    }
  }, [currentLevelReplayEntries, selectedManagedReplayId, showManageReplays]);

  useEffect(() => {
    if (pendingReplayEntryId && !currentLevelReplayEntries.some((entry) => entry.id === pendingReplayEntryId)) {
      setPendingReplayEntryId(null);
    }
  }, [currentLevelReplayEntries, pendingReplayEntryId]);

  const loadManagedReplay = useEffectEvent(() => {
    if (!selectedManagedReplayRow) {
      return;
    }

    setPendingReplayEntryId(selectedManagedReplayRow.entry.id);
    setShowManageReplays(false);
    setReplayLaunchRequest(null);
    setIsPaused(false);
    setReloadToken((value) => value + 1);
  });

  const downloadReplayEntry = useEffectEvent(async (entry: BrowserReplayEntry) => {
    try {
      await replayTransfer.exportReplay({
        bytes: entry.bytes,
        filename: entry.fileName,
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const deleteReplayEntryFromLibrary = useEffectEvent(async (entry: BrowserReplayEntry) => {
    try {
      await profileStore.deleteReplayEntry(entry.id);
      startTransition(() => {
        setSavedReplayEntries((current) => current.filter((existing) => existing.id !== entry.id));
      });
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  });

  const toggleHelp = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setShowReplayMenu(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    setShowHelp((value) => !value);
  });

  const closeHelp = useEffectEvent(() => {
    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    stopHeldUndo();
    setShowHelp(false);
  });

  const toggleSoundControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowHistoryControls(false);
    setShowSoundControls((value) => !value);
  });

  const closeSoundControls = useEffectEvent(() => {
    stopHeldUndo();
    setShowSoundControls(false);
  });

  const toggleHistoryControls = useEffectEvent(() => {
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls((value) => !value);
  });

  const closeHistoryControls = useEffectEvent(() => {
    stopHeldUndo();
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

    msInputBufferRef.current.reset();
    lynxInputBufferRef.current.reset();
    setIsRunning(false);
    setShowHelp(false);
    setShowSoundControls(false);
    setShowHistoryControls(false);
    setReplayLaunchRequest(null);

    const results = await Promise.allSettled(
      candidates.map(async (file) => ({
        file,
        entries: await importDatFile(file),
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
      currentRuleset ?? (currentSeries?.ruleset === "MS" || currentSeries?.ruleset === "Lynx" ? currentSeries.ruleset : "MS");
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

  const openDatPicker = useEffectEvent(() => {
    datFileInputRef.current?.click();
  });

  useEffect(() => {
    if (showHelp) {
      setShowSoundControls(false);
      setShowHistoryControls(false);
    }
  }, [showHelp]);

  useEffect(() => {
    const player = soundPlayerRef.current;
    if (!player) {
      return;
    }

    if (mode !== "game" || !session || showHelp || isPaused) {
      player.reset();
      return;
    }

    player.syncFrame(
      `${session.request.seriesFile}:${session.request.levelNumber}:${session.request.ruleset}`,
      session.request.ruleset,
      session.frame.snapshot.tick,
      session.frame.snapshot.soundEffects,
    );
  }, [isPaused, mode, session, showHelp]);

  useEffect(() => {
    if (mode !== "game" || !session || session.frame.snapshot.status !== "playing") {
      setIsPaused(false);
    }
  }, [mode, session]);

  useEffect(() => {
    if (mode !== "game") {
      setShowReplayMenu(false);
    }
  }, [mode]);

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      setIsFastForwarding(isFastForwardModifierActive(mode, event));

      if (isSystemModifierKey(event.key)) {
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
      }

      if (isHelpToggleKey(event)) {
        event.preventDefault();
        toggleHelp();
        return;
      }

      if (showHelp) {
        if (event.key === "Escape") {
          event.preventDefault();
          closeHelp();
        } else if (event.key !== "Tab") {
          event.preventDefault();
        }
        return;
      }

      if (showSoundControls && event.key === "Escape") {
        event.preventDefault();
        closeSoundControls();
        return;
      }

      if (showHistoryControls && event.key === "Escape") {
        event.preventDefault();
        closeHistoryControls();
        return;
      }

      if (showReplayMenu && event.key === "Escape") {
        event.preventDefault();
        setShowReplayMenu(false);
        return;
      }

      if (mode === "series-list") {
        switch (event.key) {
          case "ArrowUp":
            event.preventDefault();
            changeSelectedSeriesBy(-1);
            return;
          case "ArrowDown":
            event.preventDefault();
            changeSelectedSeriesBy(1);
            return;
          case "PageUp":
            event.preventDefault();
            changeSelectedSeriesBy(-10);
            return;
          case "PageDown":
            event.preventDefault();
            changeSelectedSeriesBy(10);
            return;
          case "Home":
            event.preventDefault();
            jumpSelectedSeries("first");
            return;
          case "End":
            event.preventDefault();
            jumpSelectedSeries("last");
            return;
          case "Enter":
          case " ":
          case "Spacebar":
            event.preventDefault();
            if (selectedSeriesFile) {
              activateSeries(selectedSeriesFile);
            }
            return;
          default:
            return;
        }
      }

      if (mode !== "game") {
        return;
      }

      if (isModernChrome && !isEditableKeyTarget(event.target) && isPauseToggleKey(event)) {
        event.preventDefault();
        toggleModernPause();
        return;
      }

      if (isPaused) {
        if (event.key === "Escape") {
          event.preventDefault();
          exitCurrentGame();
          return;
        }

        if (event.key !== "Tab") {
          event.preventDefault();
        }
        return;
      }

      if (isModernChrome && session?.history.enabled && isUndoKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        const continueHolding = performModernUndo(false);
        setHeldUndoMode(continueHolding ? "coarse" : null);
        return;
      }

      if (!isModernChrome && session?.history.enabled && isUndoCheckpointKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("checkpoint");
        undoPreviousCheckpoint();
        return;
      }

      if (!isModernChrome && session?.history.enabled && isFineUndoKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("fine");
        undoPreviousTick();
        return;
      }

      if (!isModernChrome && session?.history.enabled && isUndoKey(event)) {
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        setHeldUndoMode("coarse");
        undoPreviousTickBurst();
        return;
      }

      if (canResumeOriginalTimeline && (event.key === " " || event.key === "Spacebar")) {
        event.preventDefault();
        resumeOriginalTimelineFromSpace();
        return;
      }

      const startClockKey =
        session?.mode === "manual" &&
        !manualRunStarted &&
        (event.key === " " || event.key === "Spacebar" || keyToInput(event.key) !== null);
      if (startClockKey) {
        event.preventDefault();
        setManualRunStarted(true);
      }

      if (session && session.frame.snapshot.status !== "playing" && isProceedKey(event.key)) {
        event.preventDefault();
        proceedAfterLevelEnd();
        return;
      }

      if (isModernChrome && session && session.frame.snapshot.status !== "playing" && event.key === "Escape") {
        event.preventDefault();
        restartCurrentLevel();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        exitCurrentGame();
        return;
      }

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        restartCurrentLevel();
        return;
      }

      if (isPrevLevelKey(event)) {
        event.preventDefault();
        changeLevelBy(-1);
        return;
      }

      if (isNextLevelKey(event)) {
        event.preventDefault();
        changeLevelBy(1);
        return;
      }

      if (isFirstLevelKey(event)) {
        event.preventDefault();
        jumpLevel("first");
        return;
      }

      if (isLastLevelKey(event)) {
        event.preventDefault();
        jumpLevel("last");
        return;
      }

      const input = keyToInput(event.key);
      if (
        session?.history.restoreMode === "replaying-history" &&
        !undoSettings.allowTakeoverDuringHistoricalReplay &&
        (input !== null || event.key === " " || event.key === "Spacebar")
      ) {
        event.preventDefault();
        return;
      }
      if ((event.key === " " || event.key === "Spacebar") && session?.mode === "manual") {
        event.preventDefault();
        if (session.history.restoreMode === "restored-paused") {
          resumeLivePlayFromRestore();
        }
        return;
      }
      if (!input) {
        return;
      }

      if (hasBlockedMovementModifier(event)) {
        event.preventDefault();
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
        return;
      }

      event.preventDefault();
      if (session?.request.ruleset === "Lynx") {
        lynxInputBufferRef.current.keyDown(input);
      } else {
        msInputBufferRef.current.keyDown(input);
      }
      if (session?.history.restoreMode === "restored-paused") {
        resumeLivePlayFromRestore();
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      setIsFastForwarding(isFastForwardModifierActive(mode, event));

      if (mode !== "game") {
        return;
      }

      if (isSystemModifierKey(event.key)) {
        msInputBufferRef.current.reset();
        lynxInputBufferRef.current.reset();
        return;
      }

      if (isPaused) {
        return;
      }

      if (event.key === "z" || event.key === "Z") {
        stopHeldUndo();
      }

      const input = keyToInput(event.key);
      if (input) {
        event.preventDefault();
        if (session?.request.ruleset === "Lynx") {
          lynxInputBufferRef.current.keyUp(input);
        } else {
          msInputBufferRef.current.keyUp(input);
        }
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      setIsFastForwarding(isFastForwardModifierActive(mode, event));
    };

    const onWindowBlur = () => {
      setIsFastForwarding(false);
      stopHeldUndo();
      msInputBufferRef.current.reset();
      lynxInputBufferRef.current.reset();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    activateSeries,
    canTogglePause,
    canResumeOriginalTimeline,
    changeLevelBy,
    changeSelectedSeriesBy,
    closeHelp,
    exitCurrentGame,
    closeHistoryControls,
    jumpLevel,
    jumpSelectedSeries,
    isModernChrome,
    isPaused,
    mode,
    proceedAfterLevelEnd,
    resumeLivePlayFromRestore,
    resumeOriginalTimelineFromSpace,
    selectedSeriesFile,
    session,
    showHistoryControls,
    showReplayMenu,
    showSoundControls,
    showHelp,
    closeSoundControls,
    stopHeldUndo,
    stepHeldUndo,
    toggleHelp,
    toggleModernPause,
    undoPreviousCheckpoint,
    undoPreviousTickBurst,
    undoPreviousTick,
    undoSettings.allowTakeoverDuringHistoricalReplay,
  ]);

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
    isModernChrome && session && currentLevel && currentSeries && runResult && runResultHeadline ? (
      <div className="modern-result-sheet__backdrop">
        <section aria-label="Level result" className="modern-result-sheet">
          <div className="modern-result-sheet__header">
            <p className="modern-section__eyebrow">Level {currentLevel.number}: {currentLevel.name}</p>
            <h2 className="modern-result-sheet__title">{runResultHeadline}</h2>
          </div>

          <section className="modern-result-sheet__panel modern-result-sheet__panel--summary">
            <div className="modern-result-sheet__rows modern-result-sheet__rows--summary">
              <div className="modern-result-sheet__row">
                <span>Ruleset</span>
                <strong>{session.request.ruleset}</strong>
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
                <strong>{session.recordedMoves.length}</strong>
              </div>
              {runResult.score?.undoPenaltyApplied ? (
                <div className="modern-result-sheet__row">
                  <span>Undo penalty</span>
                  <strong>x0.5</strong>
                </div>
              ) : null}
            </div>
          </section>

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
            <button className="modern-button modern-button--secondary" onClick={restartCurrentLevel} type="button">
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
              Undo (Z)
            </button>
            {runResult.outcome !== "failed" ? (
              <button className="modern-button" onClick={proceedAfterLevelEnd} type="button">
                Next Level (N)
              </button>
            ) : null}
          </div>
          {replaySaveNotice ? <p className="modern-result-sheet__notice">{replaySaveNotice}</p> : null}
        </section>
      </div>
    ) : null;

  const modernMessageModal =
    isModernChrome && message ? (
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
    isModernChrome && showManageReplays ? (
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
                {[currentLevel?.name ?? null, currentRuleset ?? null, currentReplayCountLabel].filter(Boolean).join("  ·  ")}
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
                    selectedManagedReplayRow?.entry.id === row.entry.id ? " modern-replay-manager__entry--selected" : ""
                  }`}
                  key={row.entry.id}
                >
                  <button
                    className="modern-replay-manager__select"
                    onClick={() => {
                      setSelectedManagedReplayId(row.entry.id);
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

  const selectedRulesetSelections =
    currentFamily && currentLevel
      ? {
          MS: resolveSetFamilySelection(currentFamily, "MS", currentLevel.number),
          Lynx: resolveSetFamilySelection(currentFamily, "Lynx", currentLevel.number),
        }
      : { MS: null, Lynx: null };
  const handleModernMapClick = useEffectEvent((position: number) => {
    if (
      mode !== "game" ||
      !session ||
      isPaused ||
      session.mode !== "manual" ||
      session.request.ruleset !== "MS" ||
      session.frame.snapshot.status !== "playing" ||
      (session.history.restoreMode === "replaying-history" && !undoSettings.allowTakeoverDuringHistoricalReplay)
    ) {
      return;
    }

    msInputBufferRef.current.queueAbsoluteMouseMove(position);
    if (!manualRunStarted) {
      setManualRunStarted(true);
    }
    if (!isRunning) {
      setIsRunning(true);
    }
  });
  const renderModernRulesetToggle = (keyPrefix: string) => (
    <div className="modern-ruleset-toggle modern-ruleset-toggle--stacked" role="group" aria-label="Ruleset">
      {(["MS", "Lynx"] as const).map((ruleset) => {
        const selection = selectedRulesetSelections[ruleset];
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
            {ruleset}
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
          <div className="modern-game-stat">
            <span className="modern-game-stat__label">Chips</span>
            <strong
              className={`modern-game-stat__value${
                session && session.frame.snapshot.chipsNeeded === 0 ? " modern-game-stat__value--good" : ""
              }`}
            >
              {session ? session.frame.snapshot.chipsNeeded : "---"}
            </strong>
          </div>
          <div className="modern-game-stat">
            <span className="modern-game-stat__label">Time</span>
            <strong
              className={`modern-game-stat__value${
                session && session.frame.snapshot.timelimit > 0 && gameplayTimeRemainingTicks(session) < LOW_TIME_WARNING_TICKS
                  ? " modern-game-stat__value--danger"
                  : ""
              }`}
            >
              {session ? formatGameplayTimeLeft(session) : "---"}
            </strong>
          </div>
          <div className="modern-game-stat">
            <span className="modern-game-stat__label">Undo Used</span>
            <strong
              className={`modern-game-stat__value ${
                (session?.run.undoUsedCount ?? 0) > 0 ? "modern-game-stat__value--danger" : "modern-game-stat__value--good"
              }`}
            >
              {session?.run.undoUsedCount ?? 0}
            </strong>
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
          kind="keys"
        />
      </div>
      <div className="modern-game-inventory-strip__group">
        <p className="modern-game-inventory-strip__label">Boots</p>
        <LegacyInventoryStrip
          className="modern-game-inventory-strip__canvas"
          currentRuleset={currentRuleset}
          inventory={session?.frame.snapshot.inventory ?? null}
          kind="boots"
        />
      </div>
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

      <div aria-label="Replay and help" className="modern-game-header__toolbar-group modern-game-header__toolbar-group--right" role="group">
        <div className="modern-toolbar-menu" ref={replayMenuRef}>
          <button
            aria-expanded={showReplayMenu}
            aria-haspopup="menu"
            className="modern-button modern-button--secondary modern-button--compact"
            onClick={() => {
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
                disabled={!currentLevel || !currentSeries}
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
        <button className="modern-button modern-button--secondary modern-button--compact" onClick={toggleHelp} type="button">
          <span>Help</span>
          <span className="modern-game-header__shortcut">H</span>
        </button>
      </div>
    </div>
  );
  const renderModernBoardPanel = (embedded: boolean, keyPrefix: string) => (
    <section className="modern-game-board modern-game-board--with-rails">
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
                catalog={catalog}
                className={`modern-gameboard__canvas${embedded ? " modern-gameboard__canvas--embedded" : ""}`}
                currentLevel={currentLevel}
                currentSeries={currentSeries}
                currentRuleset={currentRuleset}
                isLoading={isCatalogLoading || isSessionLoading}
                message={message}
                mode="game"
                onMapClick={handleModernMapClick}
                onActivateSeries={activateSeries}
                onSelectSeries={selectSeries}
                presentation="map-only"
                selectedSeriesFile={selectedSeriesFile}
                session={session}
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
            <h1 className="modern-embedded-player__title">
              {replayContextLevel
                ? `Level ${replayContextLevel.number}: ${replayContextLevel.name}`
                : replayContextSeries?.filebase ?? "Loading level"}
            </h1>
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
              <h1 className="modern-game-header__title">
                {replayContextLevel
                  ? `Level ${replayContextLevel.number}: ${replayContextLevel.name}`
                  : replayContextSeries?.filebase ?? "Loading level"}
              </h1>
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
                  Saved and imported replay files for this level appear here.
                </p>
                {replayModeNote ? <p className="modern-level-focus__body">{replayModeNote}</p> : null}
                {currentLevelReplayEntries.length > 0 ? (
                  <div className="modern-replay-library">
                    {currentLevelReplayEntries.slice(0, 5).map((entry) => {
                      const replayDetails = describeReplayEntry(entry);
                      return (
                        <div className="modern-replay-library__entry" key={entry.id}>
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
                    No saved replays for this level in {currentRuleset ?? "the current ruleset"} yet.
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
                  Undo (Z)
                </button>
                <button
                  className="legacy-history__action"
                  disabled={!canUndoToPreviousCheckpoint}
                  onClick={undoPreviousCheckpoint}
                  type="button"
                >
                  Rewind (Shift+Z)
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
        catalog={catalog}
        currentLevel={currentLevel}
        currentSeries={currentSeries}
        currentRuleset={currentRuleset}
        isLoading={isCatalogLoading || isSessionLoading}
        message={message}
        mode={mode}
        onMapClick={(position) => {
          if (
            mode !== "game" ||
            !session ||
            session.mode !== "manual" ||
            session.request.ruleset !== "MS" ||
            session.frame.snapshot.status !== "playing" ||
            (session.history.restoreMode === "replaying-history" &&
              !undoSettings.allowTakeoverDuringHistoricalReplay)
          ) {
            return;
          }

          msInputBufferRef.current.queueAbsoluteMouseMove(position);
          if (!manualRunStarted) {
            setManualRunStarted(true);
          }
          if (!isRunning) {
            setIsRunning(true);
          }
        }}
        onActivateSeries={activateSeries}
        onDatDrop={(files) => {
          void importLocalDatFiles(files);
        }}
        onSelectSeries={selectSeries}
        selectedSeriesFile={selectedSeriesFile}
        session={session}
      />
      {helpOverlay}
    </main>
  );
}
