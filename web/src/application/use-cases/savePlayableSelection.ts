import type { PlayableSelection, PlayableSelectionStore } from "@application/ports/PlayableSelectionStore";

export async function savePlayableSelection(
  store: Pick<PlayableSelectionStore, "saveSelection">,
  selection: PlayableSelection,
): Promise<void> {
  await store.saveSelection(selection);
}
