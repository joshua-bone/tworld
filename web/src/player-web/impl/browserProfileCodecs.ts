import type {
  BitbustersCustomPackGame,
  PersistedImportedDatSource,
} from "@level-catalog/ports/ImportedDatCatalogStore";
import { normalizeLegacyRandomSeed } from "@player-web/impl/levelSeedOverrides";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";
import {
  type BrowserLevelSeedOverride,
  type BrowserLevelProgressSummary,
  type BrowserReplayEntry,
  type BrowserStoredReplaySource,
  createDefaultBrowserProfilePreferences,
  type BrowserRecentSelectionRecord,
  type BrowserProfilePreferences,
  type BrowserPreferredRuleset,
} from "@player-web/ports/BrowserProfileStore";

const MAX_RECENT_SELECTIONS = 6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBitbustersCustomPackGame(value: unknown): value is BitbustersCustomPackGame {
  return value === "CC1" || value === "CC2";
}

function isLevelRunResult(value: unknown): value is BrowserLevelProgressSummary["bestResult"] {
  return (
    value === "failed" ||
    value === "completed" ||
    value === "completed-with-undo" ||
    value === "completed-clean"
  );
}

function normalizeLevelRunResult(
  value: BrowserLevelProgressSummary["bestResult"] | "completed",
): BrowserLevelProgressSummary["bestResult"] {
  return value === "completed" ? "completed-clean" : value;
}

function isBrowserReplaySource(value: unknown): value is BrowserStoredReplaySource {
  return value === "saved-run" || value === "imported-file";
}

function isBrowserPreferredRuleset(value: unknown): value is BrowserPreferredRuleset {
  return value === "MS" || value === "Lynx" || value === "Hybrid";
}

function parseStoredReplayResult(value: unknown): BrowserLevelProgressSummary["bestResult"] | null {
  return value === null || value === undefined
    ? null
    : isLevelRunResult(value)
      ? normalizeLevelRunResult(value)
      : null;
}

function sameSelection(left: PlayableSelection, right: PlayableSelection): boolean {
  return left.seriesFile === right.seriesFile && left.levelNumber === right.levelNumber;
}

function compareRecentSelections(
  left: BrowserRecentSelectionRecord,
  right: BrowserRecentSelectionRecord,
): number {
  return right.savedAtMs - left.savedAtMs;
}

export function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

export function parseStoredImportedDatSource(value: unknown): PersistedImportedDatSource | undefined {
  if (
    !isRecord(value) ||
    value.kind !== "bitbusters-custom-pack" ||
    !isBitbustersCustomPackGame(value.game) ||
    !Number.isInteger(value.packId) ||
    Number(value.packId) <= 0
  ) {
    return undefined;
  }

  return {
    kind: "bitbusters-custom-pack",
    game: value.game,
    packId: Number(value.packId),
  };
}

export function parseStoredSelection(value: unknown): PlayableSelection | null {
  if (!isRecord(value) || typeof value.seriesFile !== "string" || !Number.isInteger(value.levelNumber)) {
    return null;
  }

  return {
    seriesFile: value.seriesFile,
    levelNumber: value.levelNumber as number,
  };
}

export function parseStoredRecentSelections(value: unknown): BrowserRecentSelectionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!isRecord(entry) || !Number.isFinite(entry.savedAtMs)) {
        return [];
      }

      const selection = parseStoredSelection(entry.selection);
      if (!selection) {
        return [];
      }

      return [
        {
          selection,
          savedAtMs: entry.savedAtMs as number,
        } satisfies BrowserRecentSelectionRecord,
      ];
    })
    .sort(compareRecentSelections);
}

export function mergeRecentSelections(
  existing: readonly BrowserRecentSelectionRecord[],
  selection: PlayableSelection,
  savedAtMs: number,
): BrowserRecentSelectionRecord[] {
  return [
    {
      selection,
      savedAtMs,
    },
    ...existing.filter((entry) => !sameSelection(entry.selection, selection)),
  ]
    .sort(compareRecentSelections)
    .slice(0, MAX_RECENT_SELECTIONS);
}

export function parseStoredLevelProgressSummaries(value: unknown): BrowserLevelProgressSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (
        !isRecord(entry) ||
        !isBrowserPreferredRuleset(entry.ruleset) ||
        typeof entry.gameplayHash !== "string" ||
        !Number.isFinite(entry.lastPlayedAtMs) ||
        !isLevelRunResult(entry.lastResult) ||
        !isLevelRunResult(entry.bestResult) ||
        !Number.isFinite(entry.lastElapsedTicks) ||
        !Number.isFinite(entry.bestElapsedTicks)
      ) {
        return [];
      }

      return [
        {
          ruleset: entry.ruleset,
          gameplayHash: entry.gameplayHash,
          modeFingerprint: typeof entry.modeFingerprint === "string" && entry.modeFingerprint.length > 0
            ? entry.modeFingerprint
            : undefined,
          scoresDisabled: entry.scoresDisabled === true ? true : undefined,
          lastPlayedAtMs: entry.lastPlayedAtMs as number,
          lastResult: normalizeLevelRunResult(entry.lastResult),
          bestResult: normalizeLevelRunResult(entry.bestResult),
          lastElapsedTicks: Number(entry.lastElapsedTicks),
          bestElapsedTicks: Number(entry.bestElapsedTicks),
          lastUndoUsedCount: Number.isInteger(entry.lastUndoUsedCount) ? Number(entry.lastUndoUsedCount) : 0,
          bestUndoUsedCount: Number.isInteger(entry.bestUndoUsedCount) ? Number(entry.bestUndoUsedCount) : 0,
        } satisfies BrowserLevelProgressSummary,
      ];
    })
    .sort((left, right) => right.lastPlayedAtMs - left.lastPlayedAtMs);
}

export function parseStoredLevelSeedOverrides(value: unknown): BrowserLevelSeedOverride[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.seriesFile !== "string" ||
      !Number.isInteger(entry.levelNumber) ||
      !isBrowserPreferredRuleset(entry.ruleset) ||
      !Number.isFinite(entry.randomSeed)
    ) {
      return [];
    }

    return [
      {
        seriesFile: entry.seriesFile,
        levelNumber: Number(entry.levelNumber),
        ruleset: entry.ruleset,
        randomSeed: normalizeLegacyRandomSeed(Number(entry.randomSeed)),
      } satisfies BrowserLevelSeedOverride,
    ];
  });
}

export function parseStoredReplayEntries(
  value: unknown,
): Array<BrowserReplayEntry & { source: BrowserStoredReplaySource }> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        typeof entry.fileName !== "string" ||
        typeof entry.seriesFile !== "string" ||
        !Number.isInteger(entry.levelNumber) ||
        typeof entry.levelName !== "string" ||
        !isBrowserPreferredRuleset(entry.ruleset) ||
        !Number.isFinite(entry.savedAtMs) ||
        !isBrowserReplaySource(entry.source)
      ) {
        return [];
      }

      const bytes =
        entry.bytes instanceof Uint8Array
          ? cloneBytes(entry.bytes)
          : Array.isArray(entry.bytes)
            ? Uint8Array.from(entry.bytes.flatMap((raw) => (Number.isInteger(raw) ? [Number(raw)] : [])))
            : entry.bytes instanceof ArrayBuffer
              ? new Uint8Array(entry.bytes)
              : null;
      if (!bytes) {
        return [];
      }

      return [
        {
          id: entry.id,
          fileName: entry.fileName,
          seriesFile: entry.seriesFile,
          levelNumber: entry.levelNumber as number,
          levelName: entry.levelName,
          ruleset: entry.ruleset,
          replayFormat: typeof entry.replayFormat === "string" ? entry.replayFormat : undefined,
          gameplayHash: typeof entry.gameplayHash === "string" && entry.gameplayHash.length > 0
            ? entry.gameplayHash
            : undefined,
          savedAtMs: entry.savedAtMs as number,
          source: entry.source,
          result: parseStoredReplayResult(entry.result),
          finalScore: Number.isFinite(entry.finalScore) ? Number(entry.finalScore) : null,
          undoUsedCount: Number.isInteger(entry.undoUsedCount) ? Number(entry.undoUsedCount) : null,
          bytes,
        } satisfies BrowserReplayEntry & { source: BrowserStoredReplaySource },
      ];
    })
    .sort((left, right) => right.savedAtMs - left.savedAtMs);
}

export function parseStoredBrowserProfilePreferences(value: unknown): BrowserProfilePreferences {
  const defaults = createDefaultBrowserProfilePreferences();
  if (!isRecord(value)) {
    return defaults;
  }

  return {
    uiMode: value.uiMode === "classic" ? "classic" : defaults.uiMode,
    defaultRuleset: value.defaultRuleset === "Lynx" ? "Lynx" : defaults.defaultRuleset,
    autoSaveWinningHighScoreReplays:
      typeof value.autoSaveWinningHighScoreReplays === "boolean"
        ? value.autoSaveWinningHighScoreReplays
        : defaults.autoSaveWinningHighScoreReplays,
    autoDownloadReplaysOnSave:
      typeof value.autoDownloadReplaysOnSave === "boolean"
        ? value.autoDownloadReplaysOnSave
        : defaults.autoDownloadReplaysOnSave,
    debugModeEnabled:
      typeof value.debugModeEnabled === "boolean"
        ? value.debugModeEnabled
        : defaults.debugModeEnabled,
  };
}
