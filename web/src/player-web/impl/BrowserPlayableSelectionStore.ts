import type { PlayableSelection, PlayableSelectionStore } from "@application/ports/PlayableSelectionStore";

const STORAGE_KEY = "tworld:web:selection";

export class BrowserPlayableSelectionStore implements PlayableSelectionStore {
  async loadSelection(): Promise<PlayableSelection | null> {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as Partial<PlayableSelection>;
      if (typeof parsed.seriesFile !== "string" || !Number.isInteger(parsed.levelNumber)) {
        return null;
      }

      return {
        seriesFile: parsed.seriesFile,
        levelNumber: parsed.levelNumber as number,
      };
    } catch {
      return null;
    }
  }

  async saveSelection(selection: PlayableSelection): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  }
}
