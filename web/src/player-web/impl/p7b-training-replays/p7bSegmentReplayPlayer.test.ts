import { describe, expect, it, vi } from "vitest";
import {
  P7bSegmentReplayController,
  createInteractiveGameReplayPlaybackEngine,
  type P7bFullReplayPlaybackEngine,
  type P7bReplayAssetLoader,
} from "./p7bSegmentReplayPlayer";
import type {
  P7bLevelReplayPresentation,
  P7bReplaySelection,
} from "@game-core/api/p7bReplayPresentation";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

type FakeAsset = { readonly id: string };
type FakeSession = { readonly assetId: string; readonly tick: number };

function presentation(): P7bLevelReplayPresentation {
  return {
    packId: "cclp1",
    levelNumber: 1,
    title: "Key Pyramid",
    sourceHref: "source.json",
    levelManifestHref: "player-level.json",
    playerModuleHref: "player.js",
    initialSelection: { executionTarget: "ms", variant: "raw-ms" },
    variants: [
      {
        id: "raw-ms",
        label: "Original MS",
        description: "MS donor",
        segments: [
          { id: "first", ordinal: 1, title: "First segment" },
          { id: "second", ordinal: 2, title: "Second segment" },
        ],
      },
      {
        id: "portable",
        label: "Sanitized",
        description: "Portable candidate",
        segments: [
          { id: "first", ordinal: 1, title: "Shared opening" },
          { id: "portable-finish", ordinal: 2, title: "Portable finish" },
        ],
      },
    ],
    executionTargets: [
      { id: "ms", label: "MS" },
      { id: "lynx", label: "Lynx" },
    ],
    combinations: [
      {
        availability: "available",
        transport: "native-replay-pulses",
        decisionProfile: { cadenceHz: 20, clockBasis: "native-tick", profileId: "ms-native-tws" },
        executionTarget: "ms",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 6,
        authoredDecisionCount: 5,
        executedDecisionCount: 4,
        provenanceLabel: "Official donor",
        replayHref: "raw-ms-ms.json",
        replayContent: { digest: `sha256:${"0".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "first", startNativeTick: 0, endNativeTick: 2 },
          { segmentId: "second", startNativeTick: 2, endNativeTick: 6 },
        ],
        variant: "raw-ms",
      },
      {
        availability: "unavailable",
        certificationStatus: "unavailable",
        executionTarget: "lynx",
        reason: "Not certified on Lynx",
        variant: "raw-ms",
      },
      {
        availability: "available",
        transport: "manual-held-schedule",
        decisionProfile: { cadenceHz: 10, clockBasis: "portable-decision", profileId: "hybridcc-candidate-10hz-v1" },
        executionTarget: "ms",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 7,
        authoredDecisionCount: 4,
        executedDecisionCount: 4,
        provenanceLabel: "Portable candidate",
        replayHref: "portable-ms.json",
        replayContent: { digest: `sha256:${"1".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "first", startNativeTick: 0, endNativeTick: 3, startDecisionOrdinal: 0, endDecisionOrdinal: 2 },
          { segmentId: "portable-finish", startNativeTick: 3, endNativeTick: 7, startDecisionOrdinal: 2, endDecisionOrdinal: 4 },
        ],
        variant: "portable",
      },
      {
        availability: "available",
        transport: "manual-held-schedule",
        decisionProfile: { cadenceHz: 10, clockBasis: "portable-decision", profileId: "hybridcc-candidate-10hz-v1" },
        executionTarget: "lynx",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 8,
        authoredDecisionCount: 4,
        executedDecisionCount: 4,
        provenanceLabel: "Portable candidate",
        replayHref: "portable-lynx.json",
        replayContent: { digest: `sha256:${"2".repeat(64)}` as const, byteLength: 1 },
        segmentSpans: [
          { segmentId: "first", startNativeTick: 0, endNativeTick: 4, startDecisionOrdinal: 0, endDecisionOrdinal: 2 },
          { segmentId: "portable-finish", startNativeTick: 4, endNativeTick: 8, startDecisionOrdinal: 2, endDecisionOrdinal: 4 },
        ],
        variant: "portable",
      },
    ],
  };
}

function harness(maximumSeekAdvanceTicks = 20) {
  const calls: string[] = [];
  const loader: P7bReplayAssetLoader<FakeAsset> = {
    async load(selection, href) {
      calls.push(`load:${selection.variant}:${selection.executionTarget}:${href}`);
      return { id: href };
    },
  };
  const engine: P7bFullReplayPlaybackEngine<FakeAsset, FakeSession, string> = {
    async startFullReplay(asset, selection) {
      calls.push(`start-full:${selection.variant}:${selection.executionTarget}:${asset.id}`);
      return { assetId: asset.id, tick: -1 };
    },
    async advanceOneTick(session) {
      calls.push(`advance:${session.tick + 1}`);
      return { ...session, tick: session.tick + 1 };
    },
    currentTick: (session) => session.tick + 1,
    frame: (session) => `frame:${session.assetId}:${session.tick}`,
    async dispose(session) {
      calls.push(`dispose:${session.assetId}:${session.tick}`);
    },
  };
  return {
    calls,
    controller: new P7bSegmentReplayController({
      engine,
      loader,
      maximumSeekAdvanceTicks,
      presentation: presentation(),
    }),
  };
}

describe("P7B segment replay controller", () => {
  it("does not load or start a replay until the viewer explicitly prepares it", async () => {
    const { calls, controller } = harness();

    expect(controller.snapshot().playback).toBe("idle");
    expect(controller.snapshot().autoplay).toBe(false);
    expect(calls).toEqual([]);

    await controller.prepareSelectedSegment();

    expect(calls).toEqual([
      "load:raw-ms:ms:raw-ms-ms.json",
      "start-full:raw-ms:ms:raw-ms-ms.json",
    ]);
    expect(controller.snapshot().playback).toBe("paused");
    expect(controller.snapshot().currentTick).toBe(0);
  });

  it("does not publish a stale replay when an axis changes during lazy loading", async () => {
    let resolveAsset: ((asset: FakeAsset) => void) | undefined;
    const load = vi.fn(() => new Promise<FakeAsset>((resolve) => {
      resolveAsset = resolve;
    }));
    const startFullReplay = vi.fn(async (asset: FakeAsset) => ({ assetId: asset.id, tick: -1 }));
    const controller = new P7bSegmentReplayController({
      presentation: presentation(),
      loader: { load },
      engine: {
        startFullReplay,
        advanceOneTick: async (session: FakeSession) => ({ ...session, tick: session.tick + 1 }),
        currentTick: (session: FakeSession) => session.tick,
        frame: (session: FakeSession) => `frame:${session.tick}`,
      },
      maximumSeekAdvanceTicks: 20,
    });

    const preparing = controller.prepareSelectedSegment();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await controller.selectExecutionTarget("lynx");
    resolveAsset?.({ id: "late-raw-ms" });
    await preparing;

    expect(startFullReplay).not.toHaveBeenCalled();
    expect(controller.snapshot().selection.executionTarget).toBe("lynx");
    expect(controller.snapshot().playback).toBe("unavailable");
    expect(controller.snapshot().session).toBeNull();
  });

  it("keeps replay variant and execution target independent and reports missing combinations without loading", async () => {
    const { calls, controller } = harness();

    await controller.selectExecutionTarget("lynx");

    expect(controller.snapshot().selection).toEqual<P7bReplaySelection>({
      executionTarget: "lynx",
      variant: "raw-ms",
    });
    expect(controller.snapshot().playback).toBe("unavailable");
    expect(controller.snapshot().message).toBe("Not certified on Lynx");
    expect(calls).toEqual([]);

    await controller.selectVariant("portable");
    expect(controller.snapshot().selection).toEqual({
      executionTarget: "lynx",
      variant: "portable",
    });
    expect(controller.snapshot().playback).toBe("idle");
    expect(controller.snapshot().decisionProfile).toEqual({
      cadenceHz: 10,
      clockBasis: "portable-decision",
      profileId: "hybridcc-candidate-10hz-v1",
    });
    expect(controller.snapshot().nativeTickRateHz).toBe(20);
    expect(controller.snapshot().segmentStartDecisionOrdinal).toBe(0);
    expect(controller.snapshot().segmentEndDecisionOrdinal).toBe(2);
    expect(calls).toEqual([]);
  });

  it("switches to variant-local segments, preserving a shared ID and otherwise resetting to the first", async () => {
    const { controller } = harness();

    expect(controller.snapshot().segment.id).toBe("first");
    await controller.selectVariant("portable");
    expect(controller.snapshot().segment.id).toBe("first");
    expect(controller.snapshot().segment.title).toBe("Shared opening");

    await controller.selectVariant("raw-ms");
    await controller.selectSegment("second");
    await controller.selectVariant("portable");

    expect(controller.snapshot().segment.id).toBe("first");
    expect(controller.snapshot().segmentIndex).toBe(0);
    expect(controller.snapshot().segmentCount).toBe(2);
    expect(controller.snapshot().segmentStartTick).toBe(0);
  });

  it("always starts the complete replay before seeking to a later segment boundary", async () => {
    const { calls, controller } = harness();

    await controller.selectSegment("second");
    await controller.prepareSelectedSegment();

    expect(calls).toEqual([
      "load:raw-ms:ms:raw-ms-ms.json",
      "start-full:raw-ms:ms:raw-ms-ms.json",
      "advance:0",
      "advance:1",
    ]);
    expect(controller.snapshot().currentTick).toBe(2);
    expect(controller.snapshot().frame).toBe("frame:raw-ms-ms.json:1");
    expect(controller.snapshot().playback).toBe("paused");
  });

  it("bounds full-replay fast-forward rather than seeking indefinitely", async () => {
    const { calls, controller } = harness(1);

    await controller.selectSegment("second");
    await expect(controller.prepareSelectedSegment()).rejects.toThrow(
      "segment start tick 2 exceeds the bounded seek budget of 1 advances",
    );
    expect(calls).toEqual([
      "load:raw-ms:ms:raw-ms-ms.json",
      "start-full:raw-ms:ms:raw-ms-ms.json",
      "dispose:raw-ms-ms.json:-1",
    ]);
    expect(controller.snapshot().playback).toBe("error");
  });

  it("steps only inside the selected segment and pauses exactly at its ending boundary", async () => {
    const { controller } = harness();

    await controller.prepareSelectedSegment();
    await controller.play();
    expect(controller.snapshot().playback).toBe("playing");

    await controller.advancePlaybackTick();
    await controller.advancePlaybackTick();
    await controller.advancePlaybackTick();

    expect(controller.snapshot().currentTick).toBe(2);
    expect(controller.snapshot().playback).toBe("paused");
    expect(controller.snapshot().message).toBe("End of segment 1 of 2");

    await controller.advancePlaybackTick();
    expect(controller.snapshot().currentTick).toBe(2);
  });
});

describe("interactive game replay playback adapter", () => {
  it("uses replay mode, advances with neutral input, and exposes the live session for LegacyCanvas map-only rendering", async () => {
    const sessions = [
      { history: { currentTick: -1 }, frame: { id: "initial" } },
      { history: { currentTick: 0 }, frame: { id: "tick-0" } },
    ] as unknown as InteractiveGameSession[];
    const engine = {
      advanceSession: vi.fn(async () => sessions[1]!),
      disposeSession: vi.fn(async () => undefined),
      startReplaySession: vi.fn(async () => sessions[0]!),
    };
    const playback = createInteractiveGameReplayPlaybackEngine(engine);
    const asset = {
      request: { ruleset: "MS" },
      replay: { moves: [] },
    } as unknown as Parameters<typeof playback.startFullReplay>[0];

    const initial = await playback.startFullReplay(asset, {
      executionTarget: "ms",
      variant: "raw-ms",
    });
    const advanced = await playback.advanceOneTick(initial);

    expect(engine.startReplaySession).toHaveBeenCalledWith(asset.request, asset.replay, undefined);
    expect(engine.advanceSession).toHaveBeenCalledWith(initial, "none");
    expect(playback.currentTick(advanced)).toBe(0);
    expect(playback.frame(advanced)).toBe(sessions[1]!.frame);
    await playback.dispose?.(advanced);
    expect(engine.disposeSession).toHaveBeenCalledWith(advanced);
  });
});
