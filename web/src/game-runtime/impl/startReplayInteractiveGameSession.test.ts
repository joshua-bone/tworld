import { describe, expect, it, vi } from "vitest";
import { startReplayInteractiveGameSession } from "@game-runtime/impl/startReplayInteractiveGameSession";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type {
  InteractiveGameEnginePort,
  InteractiveGameSession,
} from "@game-runtime/ports/InteractiveGameEngine";

const request = {
  seriesFile: "CCLP1-Hybrid.dac",
  levelNumber: 1,
  ruleset: "Hybrid",
} as const;

describe("startReplayInteractiveGameSession", () => {
  it("preserves the existing decoded TWS/TWSX path", async () => {
    const expected = {} as InteractiveGameSession;
    const replay = { randomSeed: 123 } as ReplaySolutionPayload;
    const startReplaySession = vi.fn(async () => expected);

    const actual = await startReplayInteractiveGameSession(
      { startReplaySession },
      request,
      { kind: "legacy", replay },
      { msStepping: 4 },
    );

    expect(actual).toBe(expected);
    expect(startReplaySession).toHaveBeenCalledWith(request, replay, { msStepping: 4 });
  });

  it("passes opaque replay bytes to the owning engine without decoding them", async () => {
    const expected = {} as InteractiveGameSession;
    const bytes = Uint8Array.of(0x48, 0x43, 0x52, 0x31);
    const startReplaySession = vi.fn<InteractiveGameEnginePort["startReplaySession"]>();
    const startOpaqueReplaySession = vi.fn(async () => expected);

    const actual = await startReplayInteractiveGameSession(
      { startReplaySession, startOpaqueReplaySession },
      request,
      { kind: "opaque", replay: { format: "hcr1", bytes } },
    );

    expect(actual).toBe(expected);
    expect(startReplaySession).not.toHaveBeenCalled();
    expect(startOpaqueReplaySession).toHaveBeenCalledWith(
      request,
      { format: "hcr1", bytes },
      undefined,
    );
  });

  it("rejects opaque bytes when the selected engine lacks the capability", async () => {
    await expect(
      startReplayInteractiveGameSession(
        { startReplaySession: vi.fn() },
        request,
        { kind: "opaque", replay: { format: "hcr1", bytes: Uint8Array.of(1) } },
      ),
    ).rejects.toThrow("Hybrid engine does not support hcr1 replay playback");
  });
});
