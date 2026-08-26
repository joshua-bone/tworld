import { describe, expect, it, vi } from "vitest";
import { buildInteractiveReplayExport } from "@game-runtime/impl/buildInteractiveReplayExport";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";

describe("buildInteractiveReplayExport", () => {
  it("uses an engine-owned opaque encoder without interpreting its bytes", async () => {
    const bytes = Uint8Array.of(0x48, 0x43, 0x52, 0x31, 0xff);
    const session = {} as InteractiveGameSession;
    const exportOpaqueReplay = vi.fn(async () => ({
      format: "hcr1",
      bytes,
      suggestedFilename: "CCLP1-Hybrid-1-live.hcr1",
      mimeType: "application/x-hybridcc-replay",
    }));
    const engine = {
      exportOpaqueReplay,
    } as Pick<InteractiveGameEnginePort, "exportOpaqueReplay">;

    const artifact = await buildInteractiveReplayExport(
      engine,
      "CCLP1-Hybrid.dac",
      { number: 1 } as never,
      session,
    );

    expect(exportOpaqueReplay).toHaveBeenCalledWith(session);
    expect(artifact).toEqual({
      format: "hcr1",
      bytes,
      filename: "CCLP1-Hybrid-1-live.hcr1",
      mimeType: "application/x-hybridcc-replay",
    });
  });

  it("does not fall back to TWS encoding when an opaque encoder reports no replay", async () => {
    const artifact = await buildInteractiveReplayExport(
      { exportOpaqueReplay: vi.fn(async () => null) },
      "CCLP1-Hybrid.dac",
      { number: 1 } as never,
      { recordedMoves: [{ when: 0, dir: 8 }] } as InteractiveGameSession,
    );

    expect(artifact).toBeNull();
  });
});
