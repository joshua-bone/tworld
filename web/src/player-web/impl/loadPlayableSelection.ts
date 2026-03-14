import type { PlayableSelection, PlayableSelectionStore } from "@player-web/ports/PlayableSelectionStore";

export async function loadPlayableSelection(
  store: Pick<PlayableSelectionStore, "loadSelection">,
): Promise<PlayableSelection | null> {
  return store.loadSelection();
}
