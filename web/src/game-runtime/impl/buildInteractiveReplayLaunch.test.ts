import { describe, expect, it, vi } from "vitest";
import { replaySolutionCodec } from "@game-core/api/codec";
import { buildInteractiveReplayLaunch } from "@game-runtime/impl/buildInteractiveReplayLaunch";

describe("buildInteractiveReplayLaunch", () => {
  it("decodes a classic replay for MS and Lynx engines", () => {
    const bytes = replaySolutionCodec.encode(1, "ACBD", 10, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [{ when: 0, dir: 8 }],
    });

    const launch = buildInteractiveReplayLaunch(
      { startReplaySession: vi.fn() },
      { fileName: "CCLP1-MS-1.tws", ruleset: "MS", bytes },
    );

    expect(launch.kind).toBe("legacy");
  });

  it("keeps Hybrid v0 replays on the legacy codec when no native format is stored", () => {
    const bytes = replaySolutionCodec.encode(1, "ACBD", 10, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [{ when: 0, dir: 8 }],
    });

    const launch = buildInteractiveReplayLaunch(
      { startReplaySession: vi.fn() },
      { fileName: "hybrid-v0-Hybrid-1.tws", ruleset: "Hybrid", bytes },
    );

    expect(launch).toMatchObject({
      kind: "legacy",
      replay: { moves: [{ when: 0, dir: 8 }] },
    });
  });

  it("restores an opaque replay without passing it through the TWS codec", () => {
    const bytes = Uint8Array.of(0x48, 0x43, 0x52, 0x31, 0xff);
    const launch = buildInteractiveReplayLaunch(
      {
        opaqueReplayFormat: "hcr1",
        startReplaySession: vi.fn(),
        startOpaqueReplaySession: vi.fn(),
      },
      {
        fileName: "CCLP1-Hybrid-1.hcr1",
        ruleset: "Hybrid",
        replayFormat: "hcr1",
        bytes,
      },
    );

    expect(launch).toEqual({
      kind: "opaque",
      replay: { format: "hcr1", bytes },
    });
  });

  it("rejects stored opaque bytes tagged for a different engine format", () => {
    expect(() =>
      buildInteractiveReplayLaunch(
        {
          opaqueReplayFormat: "hcr1",
          startReplaySession: vi.fn(),
          startOpaqueReplaySession: vi.fn(),
        },
        {
          fileName: "wrong.native",
          ruleset: "Hybrid",
          replayFormat: "other-v1",
          bytes: Uint8Array.of(1),
        },
      ),
    ).toThrow("wrong.native uses other-v1, but the Hybrid engine accepts hcr1");
  });
});
