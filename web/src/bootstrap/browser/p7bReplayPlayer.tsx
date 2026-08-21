import { createP7bReplayPlayerServices } from "@player-web/compose/createP7bReplayPlayerServices";
import { prewarmLegacyTileset } from "@player-web/impl/LegacyCanvasScreen";
import { mountP7bSegmentReplayBrowserPlayer } from "@player-web/impl/p7b-training-replays/mountP7bSegmentReplayBrowserPlayer";

async function mount(): Promise<void> {
  const root = document.querySelector<HTMLElement>("[data-p7b-replay-player]");
  if (!root) return;
  const status = root.querySelector<HTMLElement>("[data-player-status]");
  try {
    prewarmLegacyTileset("MS");
    prewarmLegacyTileset("Lynx");
    await mountP7bSegmentReplayBrowserPlayer({
      root,
      services: createP7bReplayPlayerServices(),
    });
  } catch (error: unknown) {
    if (status) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  }
}

void mount();
