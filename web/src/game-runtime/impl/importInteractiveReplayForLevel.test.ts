import { describe, expect, it, vi } from "vitest";
import { replaySolutionCodec } from "@game-core/api/codec";
import { importInteractiveReplayForLevel } from "@game-runtime/impl/importInteractiveReplayForLevel";
import type { InteractiveGameEnginePort } from "@game-runtime/ports/InteractiveGameEngine";

const level = {
  name: "Key Pyramid",
  number: 1,
  password: "ACBD",
};

describe("importInteractiveReplayForLevel", () => {
  it("preserves TWS/TWSX decoding and selected-level validation", async () => {
    const bytes = replaySolutionCodec.encode(1, "ACBD", 10, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [{ when: 0, dir: 8 }],
    });

    const imported = await importInteractiveReplayForLevel(
      { startReplaySession: vi.fn() },
      { importReplay: async () => ({ name: "CCLP1-MS-1.tws", bytes }) },
      level,
      {
        request: {
          seriesFile: "CCLP1-MS.dac",
          levelNumber: 1,
          ruleset: "MS",
        },
      },
    );

    expect(imported?.format).toBeUndefined();
    expect(imported?.launch.kind).toBe("legacy");
    expect(imported?.launch.kind === "legacy" ? imported.launch.replay.moves : []).toEqual([
      { when: 0, dir: 8 },
    ]);
  });

  it("keeps Hybrid v0 import on the legacy codec when the engine has no native replay format", async () => {
    const bytes = replaySolutionCodec.encode(1, "ACBD", 10, {
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 123,
      moves: [{ when: 0, dir: 8 }],
    });
    const importReplay = vi.fn(async () => ({ name: "hybrid-v0-Hybrid-1.tws", bytes }));

    const imported = await importInteractiveReplayForLevel(
      { startReplaySession: vi.fn() },
      { importReplay },
      level,
      {
        request: {
          seriesFile: "hybrid-v0:official:CCLP1.dat",
          levelNumber: 1,
          ruleset: "Hybrid",
        },
      },
    );

    expect(imported?.format).toBeUndefined();
    expect(imported?.launch).toMatchObject({
      kind: "legacy",
      replay: { moves: [{ when: 0, dir: 8 }] },
    });
    expect(importReplay).toHaveBeenCalledOnce();
  });

  it("keeps native replay bytes opaque and tags them with the engine-owned format", async () => {
    const bytes = Uint8Array.of(0x48, 0x43, 0x52, 0x31, 0, 0xff);
    const importReplay = vi.fn(async () => ({ name: "CCLP1-Hybrid-1.hcr1", bytes }));
    const validateOpaqueReplay = vi.fn(async () => undefined);
    const engine = {
      opaqueReplayFormat: "hcr1",
      startReplaySession: vi.fn(),
      startOpaqueReplaySession: vi.fn(),
      validateOpaqueReplay,
    } satisfies Pick<
      InteractiveGameEnginePort,
      "opaqueReplayFormat" | "startReplaySession" | "startOpaqueReplaySession" | "validateOpaqueReplay"
    >;

    const imported = await importInteractiveReplayForLevel(
      engine,
      { importReplay },
      level,
      {
        request: {
          seriesFile: "CCLP1-Hybrid.dac",
          levelNumber: 1,
          ruleset: "Hybrid",
        },
      },
    );

    expect(imported).toEqual({
      fileName: "CCLP1-Hybrid-1.hcr1",
      bytes,
      format: "hcr1",
      launch: {
        kind: "opaque",
        replay: { format: "hcr1", bytes },
      },
    });
    expect(validateOpaqueReplay).toHaveBeenCalledWith(
      {
        seriesFile: "CCLP1-Hybrid.dac",
        levelNumber: 1,
        ruleset: "Hybrid",
      },
      { format: "hcr1", bytes },
    );
    expect(engine.startOpaqueReplaySession).not.toHaveBeenCalled();
  });

  it("rejects an engine that declares a native format without the complete native replay capability", async () => {
    await expect(
      importInteractiveReplayForLevel(
        { opaqueReplayFormat: "hcr1", startReplaySession: vi.fn() },
        { importReplay: vi.fn() },
        level,
        {
          request: {
            seriesFile: "CCLP1-Hybrid.dac",
            levelNumber: 1,
            ruleset: "Hybrid",
          },
        },
      ),
    ).rejects.toThrow("Hybrid engine does not support native replay import");
  });

  it("rejects invalid opaque bytes before returning them for persistence", async () => {
    const bytes = Uint8Array.of(0x48, 0x43, 0x52, 0x31, 0xff);
    const validateOpaqueReplay = vi.fn(async () => {
      throw new Error("invalid native replay");
    });

    await expect(
      importInteractiveReplayForLevel(
        {
          opaqueReplayFormat: "hcr1",
          startReplaySession: vi.fn(),
          startOpaqueReplaySession: vi.fn(),
          validateOpaqueReplay,
        },
        { importReplay: async () => ({ name: "bad.hcr1", bytes }) },
        level,
        {
          request: {
            seriesFile: "CCLP1-Hybrid.dac",
            levelNumber: 1,
            ruleset: "Hybrid",
          },
        },
      ),
    ).rejects.toThrow("invalid native replay");
    expect(validateOpaqueReplay).toHaveBeenCalledOnce();
  });
});
