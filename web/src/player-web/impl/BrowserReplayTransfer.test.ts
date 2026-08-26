import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserReplayTransfer } from "@player-web/impl/BrowserReplayTransfer";

describe("BrowserReplayTransfer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves an engine-owned replay MIME type and filename on download", async () => {
    const click = vi.fn();
    const anchor = {
      click,
      download: "",
      href: "",
      rel: "",
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
    });
    vi.stubGlobal("window", {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:hcr1");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    await new BrowserReplayTransfer().exportReplay({
      bytes: Uint8Array.of(0x48, 0x43, 0x52, 0x31),
      filename: "CCLP1-Hybrid-1.hcr1",
      format: "hcr1",
      mimeType: "application/x-hybridcc-replay",
    });

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe("application/x-hybridcc-replay");
    expect(anchor).toMatchObject({
      href: "blob:hcr1",
      download: "CCLP1-Hybrid-1.hcr1",
      rel: "noopener",
    });
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:hcr1");
  });
});
