import { createRoot, type Root } from "react-dom/client";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import {
  P7bSegmentReplayBrowserPlayer,
  type P7bReplayMapRenderer,
} from "./P7bSegmentReplayBrowserPlayer";
import {
  browserFetchText,
  parseP7bReplayBrowserManifest,
  type P7bFetchText,
} from "./p7bReplayBrowserRuntime";

export type MountedP7bSegmentReplayBrowserPlayer = {
  readonly manifestHref: string;
  unmount(): void;
};

export async function mountP7bSegmentReplayBrowserPlayer(input: {
  readonly root: HTMLElement;
  readonly services: Pick<BrowserAppServices, "engines" | "preloadGameRequest">;
  readonly fetchText?: P7bFetchText;
  readonly maximumSeekAdvanceTicks?: number;
  readonly MapRenderer?: P7bReplayMapRenderer;
}): Promise<MountedP7bSegmentReplayBrowserPlayer> {
  const manifestHref = input.root.getAttribute("data-level-manifest-href")?.trim() ?? "";
  if (manifestHref === "") {
    throw new Error("P7B replay player root is missing data-level-manifest-href");
  }
  const status = input.root.querySelector<HTMLElement>("[data-player-status]");
  if (status) status.textContent = "Loading compact replay metadata…";
  const fetchText = input.fetchText ?? browserFetchText;
  const manifest = parseP7bReplayBrowserManifest(await fetchText(manifestHref));

  const host = document.createElement("div");
  host.setAttribute("data-p7b-replay-react-root", "true");
  input.root.replaceWith(host);
  const reactRoot: Root = createRoot(host);
  reactRoot.render(
    <P7bSegmentReplayBrowserPlayer
      MapRenderer={input.MapRenderer}
      fetchText={fetchText}
      manifest={manifest}
      maximumSeekAdvanceTicks={input.maximumSeekAdvanceTicks}
      services={input.services}
    />,
  );
  return {
    manifestHref,
    unmount: () => reactRoot.unmount(),
  };
}
