import type { PlayableSelection, PlayableSelectionStore } from "@application/ports/PlayableSelectionStore";

export async function loadPlayableSelection(
  store: Pick<PlayableSelectionStore, "loadSelection">,
): Promise<PlayableSelection | null> {
  return store.loadSelection();
}
