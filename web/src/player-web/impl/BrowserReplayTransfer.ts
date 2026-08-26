import type { ImportedReplayFile, ReplayTransferArtifact, ReplayTransferPort } from "@player-web/ports/ReplayTransfer";

export class BrowserReplayTransfer implements ReplayTransferPort {
  async exportReplay(artifact: ReplayTransferArtifact): Promise<void> {
    if (typeof document === "undefined") {
      throw new Error("browser replay export requires a document context");
    }

    const payload = new ArrayBuffer(artifact.bytes.byteLength);
    new Uint8Array(payload).set(artifact.bytes);
    const url = URL.createObjectURL(new Blob([payload], { type: artifact.mimeType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = artifact.filename;
    anchor.rel = "noopener";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async importReplay(): Promise<ImportedReplayFile | null> {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return null;
    }

    return new Promise<ImportedReplayFile | null>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".bin,.tws,.twsx,.hcr1,.dat,application/octet-stream";
      input.style.display = "none";

      let settled = false;
      const cleanup = () => {
        window.removeEventListener("focus", onFocus, true);
        input.removeEventListener("change", onChange);
        input.remove();
      };
      const settle = (value: ImportedReplayFile | null, error: unknown = null) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      };
      const onChange = () => {
        const file = input.files?.[0];
        if (!file) {
          settle(null);
          return;
        }

        void file
          .arrayBuffer()
          .then((buffer) => {
            settle({
              name: file.name,
              bytes: new Uint8Array(buffer),
            });
          })
          .catch((error: unknown) => {
            settle(null, error);
          });
      };
      const onFocus = () => {
        window.setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            settle(null);
          }
        }, 0);
      };

      document.body.appendChild(input);
      input.addEventListener("change", onChange);
      window.addEventListener("focus", onFocus, true);
      input.click();
    });
  }
}
