import { describe, expect, it, vi } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { P7bLevelReplayPresentation } from "@game-core/api/p7bReplayPresentation";
import { canonicalizeP7TrainingBrowserReplay } from "@game-core/api/p7TrainingBrowserReplay";
import {
  P7B_NEUTRAL_REPLAY_INPUT,
  createP7bBrowserReplayAssetLoader,
  createP7bBrowserReplayPlaybackEngine,
  p7bBrowserSeriesForTarget,
  parseP7bBrowserReplayAsset,
  parseP7bReplayBrowserManifest,
  type P7bReplayBrowserManifestV1,
} from "./p7bReplayBrowserRuntime";

const checkedReplay = {
  digest: `sha256:${"0".repeat(64)}` as const,
  byteLength: 1,
};

function presentation(): P7bLevelReplayPresentation {
  return {
    packId: "cclp1",
    levelNumber: 1,
    title: "Key Pyramid",
    sourceHref: "source.json",
    levelManifestHref: "browser-level.json",
    playerModuleHref: "player.js",
    initialSelection: { executionTarget: "ms", variant: "raw-ms" },
    variants: [
      {
        id: "raw-ms",
        label: "Original MS",
        description: "Immutable donor",
        segments: [{ id: "route", ordinal: 1, title: "Reach the exit" }],
      },
      {
        id: "portable",
        label: "Sanitized",
        description: "Portable candidate",
        segments: [{ id: "route", ordinal: 1, title: "Reach the exit" }],
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
        terminalNativeTick: 3,
        authoredDecisionCount: 2,
        executedDecisionCount: 1,
        provenanceLabel: "Official donor",
        replayHref: "raw-ms-ms.json",
        replayContent: checkedReplay,
        segmentSpans: [{ segmentId: "route", startNativeTick: 0, endNativeTick: 3 }],
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
        terminalNativeTick: 3,
        authoredDecisionCount: 2,
        executedDecisionCount: 2,
        provenanceLabel: "Portable candidate",
        replayHref: "portable-ms.json",
        replayContent: checkedReplay,
        segmentSpans: [{
          segmentId: "route",
          startNativeTick: 0,
          endNativeTick: 3,
          startDecisionOrdinal: 0,
          endDecisionOrdinal: 2,
        }],
        variant: "portable",
      },
      {
        availability: "available",
        transport: "manual-held-schedule",
        decisionProfile: { cadenceHz: 10, clockBasis: "portable-decision", profileId: "hybridcc-candidate-10hz-v1" },
        executionTarget: "lynx",
        nativeTickRateHz: 20,
        nativeBoundaryClock: "exclusive-advance-count-v1",
        terminalNativeTick: 4,
        authoredDecisionCount: 2,
        executedDecisionCount: 2,
        provenanceLabel: "Portable candidate",
        replayHref: "portable-lynx.json",
        replayContent: checkedReplay,
        segmentSpans: [{
          segmentId: "route",
          startNativeTick: 0,
          endNativeTick: 4,
          startDecisionOrdinal: 0,
          endDecisionOrdinal: 2,
        }],
        variant: "portable",
      },
    ],
  };
}

function level(name: string) {
  return {
    index: 0,
    number: 1,
    name,
    author: "Chuck Sommerville",
    password: "QWER",
    timeLimitSeconds: 100,
    chipsRequired: 0,
    bestTimeTicks: 12,
    levelSize: 100,
    solutionSize: 24,
    levelHash: "level-hash",
    gameplayHash: "gameplay-hash",
    hasSolution: true,
    sgflags: 0,
    unsolvable: null,
  };
}

function manifest(): P7bReplayBrowserManifestV1 {
  return {
    artifact: "ccsolver-p7b-replay-browser-level",
    version: 1,
    presentation: presentation(),
    targets: {
      ms: {
        request: { seriesFile: "CCLP1-MS.dac", levelNumber: 1, ruleset: "MS" },
        display: { seriesName: "CCLP1 MS", mapFilename: "CCLP1.dat", level: level("Key Pyramid") },
      },
      lynx: {
        request: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1, ruleset: "Lynx" },
        display: { seriesName: "CCLP1 Lynx", mapFilename: "CCLP1.dat", level: level("Key Pyramid") },
      },
    },
  };
}

const replayText = canonicalizeP7TrainingBrowserReplay({
  artifact: "ccsolver-p7b-browser-replay",
  version: 1,
  transport: "native-replay-pulses",
  variantId: "raw-ms",
  target: "ms",
  sourceReplayContent: { digest: `sha256:${"1".repeat(64)}`, byteLength: 24 },
  nativeTickRateHz: 20,
  terminalNativeTick: 12,
  initialization: {
    flags: 0,
    randomSlideDirection: 1,
    stepping: 0,
    randomSeed: 0,
    bestTimeTicks: 12,
  },
  decisions: [{ ordinal: 0, nativeTick: 0, encodedWhen: 0, inputCode: 8, modifierMask: 0 }],
});

const manualReplayText = canonicalizeP7TrainingBrowserReplay({
  artifact: "ccsolver-p7b-browser-replay",
  version: 1,
  transport: "manual-held-schedule",
  variantId: "portable",
  target: "ms",
  sourceReplayContent: { digest: `sha256:${"2".repeat(64)}`, byteLength: 48 },
  nativeTickRateHz: 20,
  terminalNativeTick: 3,
  initialization: {
    flags: 0,
    randomSlideDirection: 1,
    stepping: 0,
    randomSeed: 123,
    bestTimeTicks: 3,
  },
  changes: [
    { ordinal: 0, nativeTick: 0, inputCode: 8, modifierMask: 0 },
    { ordinal: 1, nativeTick: 2, inputCode: 0, modifierMask: 0 },
  ],
});

async function replayTextReference(text = replayText) {
  const bytes = new TextEncoder().encode(text);
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  return {
    digest: `sha256:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}` as const,
    byteLength: bytes.byteLength,
  };
}

describe("P7B replay browser runtime", () => {
  it("parses a compact level manifest and rejects embedded frame histories", () => {
    expect(parseP7bReplayBrowserManifest(JSON.stringify(manifest())).targets.ms.request.ruleset)
      .toBe("MS");
    expect(() => parseP7bReplayBrowserManifest(JSON.stringify({
      ...manifest(),
      frames: [{ tick: 0 }],
    }))).toThrow("must not embed replay frame histories");
  });

  it("validates each certification cell against its selected variant's segments", () => {
    const value = manifest();
    const rawMs = value.presentation.variants.find(({ id }) => id === "raw-ms")!;
    expect(() => parseP7bReplayBrowserManifest(JSON.stringify({
      ...value,
      presentation: {
        ...value.presentation,
        variants: value.presentation.variants.map((variant) => (
          variant.id === "raw-ms"
            ? { ...rawMs, segments: [{ id: "different-route", ordinal: 1, title: "Different route" }] }
            : variant
        )),
      },
    }))).toThrow("segment spans must follow stable semantic order");
  });

  it("strictly parses compact replay decisions rather than pre-rendered frames", () => {
    expect(parseP7bBrowserReplayAsset(replayText)).toMatchObject({
      transport: "native-replay-pulses",
      decisions: [{ nativeTick: 0, encodedWhen: 0, inputCode: 8 }],
    });
    expect(() => parseP7bBrowserReplayAsset(JSON.stringify({
      ...JSON.parse(replayText),
      frames: [],
    }))).toThrow("must not embed replay frame histories");
    expect(() => parseP7bBrowserReplayAsset(replayText, {
      executionTarget: "lynx",
      variant: "raw-ms",
    })).toThrow("identity does not match the requested selection");
  });

  it("fetches and preloads only after the controller requests one selected replay", async () => {
    const fetchText = vi.fn(async () => replayText);
    const preloadGameRequest = vi.fn(async () => undefined);
    const checkedManifest = manifest();
    Object.assign(
      checkedManifest.presentation.combinations.find(({ variant, executionTarget }) => (
        variant === "raw-ms" && executionTarget === "ms"
      ))!,
      { replayContent: await replayTextReference() },
    );
    const loader = createP7bBrowserReplayAssetLoader({
      manifest: checkedManifest,
      services: {
        engines: {} as BrowserAppServices["engines"],
        preloadGameRequest,
      },
      fetchText,
    });

    expect(fetchText).not.toHaveBeenCalled();
    expect(preloadGameRequest).not.toHaveBeenCalled();

    const asset = await loader.load({ executionTarget: "ms", variant: "raw-ms" }, "raw-ms-ms.json");

    expect(fetchText).toHaveBeenCalledWith("raw-ms-ms.json");
    expect(preloadGameRequest).toHaveBeenCalledWith(checkedManifest.targets.ms.request);
    expect(asset.request.ruleset).toBe("MS");
    expect(asset.transport).toBe("native-replay-pulses");
    if (asset.transport !== "native-replay-pulses") throw new Error("expected native asset");
    expect(asset.replay.moves).toHaveLength(1);
    expect(asset.replay.bestTimeTicks).toBe(12);

    const driftedLoader = createP7bBrowserReplayAssetLoader({
      manifest: checkedManifest,
      services: { engines: {} as BrowserAppServices["engines"] },
      fetchText: async () => `${replayText} `,
    });
    await expect(driftedLoader.load(
      { executionTarget: "ms", variant: "raw-ms" },
      "raw-ms-ms.json",
    )).rejects.toThrow("does not match its checked manifest reference");
  });

  it("loads a portable held schedule with the envelope seed on the exact manual request", async () => {
    const checkedManifest = manifest();
    Object.assign(
      checkedManifest.presentation.combinations.find(({ variant, executionTarget }) => (
        variant === "portable" && executionTarget === "ms"
      ))!,
      { replayContent: await replayTextReference(manualReplayText) },
    );
    const preloadGameRequest = vi.fn(async () => undefined);
    const loader = createP7bBrowserReplayAssetLoader({
      manifest: checkedManifest,
      services: {
        engines: {} as BrowserAppServices["engines"],
        preloadGameRequest,
      },
      fetchText: async () => manualReplayText,
    });

    const asset = await loader.load(
      { executionTarget: "ms", variant: "portable" },
      "portable-ms.json",
    );

    expect(asset).toMatchObject({
      transport: "manual-held-schedule",
      request: { ruleset: "MS", randomSeed: 123 },
      initialization: { randomSeed: 123, bestTimeTicks: 3, stepping: 0 },
      options: { msStepping: 0 },
      replay: {
        transport: "manual-held-schedule",
        changes: [
          { nativeTick: 0, inputCode: 8 },
          { nativeTick: 2, inputCode: 0 },
        ],
      },
    });
    expect(preloadGameRequest).toHaveBeenCalledWith(expect.objectContaining({ randomSeed: 123 }));

    const combination = checkedManifest.presentation.combinations.find(({ variant, executionTarget }) => (
      variant === "portable" && executionTarget === "ms"
    ))!;
    if (combination.availability !== "available") throw new Error("expected available fixture");
    Object.assign(combination, { transport: "native-replay-pulses" });
    await expect(loader.load(
      { executionTarget: "ms", variant: "portable" },
      "portable-ms.json",
    )).rejects.toThrow("transport does not match");
  });

  it("dispatches native pulses to replay mode and held schedules to manual mode", async () => {
    const initial = {
      request: { seriesFile: "CCLP1-MS.dac", levelNumber: 1, ruleset: "MS" },
      history: { currentTick: -1 },
      frame: { snapshot: { currentTime: -1 } },
    } as unknown as InteractiveGameSession;
    const msEngine = {
      startSession: vi.fn(async () => initial),
      startReplaySession: vi.fn(async () => initial),
      advanceSession: vi.fn(async (session: InteractiveGameSession, _input: unknown) => ({
        ...session,
        history: { ...session.history, currentTick: session.history.currentTick + 1 },
      }) as InteractiveGameSession),
      disposeSession: vi.fn(async () => undefined),
    };
    const lynxEngine = {
      startSession: vi.fn(),
      startReplaySession: vi.fn(),
      advanceSession: vi.fn(),
      disposeSession: vi.fn(),
    };
    const playback = createP7bBrowserReplayPlaybackEngine({
      engines: { MS: msEngine, Lynx: lynxEngine },
    } as unknown as Pick<BrowserAppServices, "engines" | "preloadGameRequest">);
    const envelope = parseP7bBrowserReplayAsset(replayText);
    if (envelope.transport !== "native-replay-pulses") throw new Error("expected native fixture");
    const replay = {
      ...envelope.initialization,
      moves: envelope.decisions.map(({ encodedWhen, inputCode }) => ({
        when: encodedWhen,
        dir: inputCode,
      })),
      modifierMasks: envelope.decisions.map(({ modifierMask }) => modifierMask),
    };

    const session = await playback.startFullReplay({
      transport: "native-replay-pulses",
      request: initial.request,
      replay,
      initialization: envelope.initialization,
    }, {
      executionTarget: "ms",
      variant: "raw-ms",
    });
    const next = await playback.advanceOneTick(session);

    expect(P7B_NEUTRAL_REPLAY_INPUT).toBe("none");
    expect(playback.currentTick(session)).toBe(0);
    expect(msEngine.startReplaySession).toHaveBeenCalledWith(initial.request, replay, undefined);
    expect(msEngine.advanceSession).toHaveBeenCalledWith(session, "none");
    expect(msEngine.startSession).not.toHaveBeenCalled();
    expect(lynxEngine.advanceSession).not.toHaveBeenCalled();
    expect(playback.currentTick(next)).toBe(1);

    msEngine.advanceSession.mockClear();
    const manualEnvelope = parseP7bBrowserReplayAsset(manualReplayText);
    if (manualEnvelope.transport !== "manual-held-schedule") {
      throw new Error("expected manual fixture");
    }
    let manual = await playback.startFullReplay({
      transport: "manual-held-schedule",
      request: { ...initial.request, randomSeed: manualEnvelope.initialization.randomSeed },
      replay: manualEnvelope,
      initialization: manualEnvelope.initialization,
      options: { msStepping: 0 },
    }, {
      executionTarget: "ms",
      variant: "portable",
    });
    manual = await playback.advanceOneTick(manual);
    manual = await playback.advanceOneTick(manual);
    manual = await playback.advanceOneTick(manual);

    expect(msEngine.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ randomSeed: 123 }),
      { msStepping: 0 },
    );
    expect(msEngine.startReplaySession).toHaveBeenCalledTimes(1);
    expect(msEngine.advanceSession.mock.calls.map(([, input]) => input)).toEqual([8, 8, 0]);
    expect(playback.currentTick(manual)).toBe(3);
  });

  it("projects only the metadata LegacyCanvas needs for map-only rendering", () => {
    const series = p7bBrowserSeriesForTarget(manifest(), "lynx");
    expect(series).toMatchObject({
      filebase: "CCLP1-Lynx.dac",
      mapfilename: "CCLP1.dat",
      ruleset: "Lynx",
    });
    expect(series.levels).toEqual([level("Key Pyramid")]);
  });
});
