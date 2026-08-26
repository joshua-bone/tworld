import { describe, expect, it } from "vitest";
import { buildInteractiveReplayExport } from "@game-runtime/impl/buildInteractiveReplayExport";
import { importInteractiveReplayForLevel } from "@game-runtime/impl/importInteractiveReplayForLevel";
import { startReplayInteractiveGameSession } from "@game-runtime/impl/startReplayInteractiveGameSession";
import type { SeriesLevel } from "@content/api/series";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
  type HybridCcV1EngineFactory,
} from "./HybridCcV1GameEngineAdapter";
import {
  HYBRIDCC_V1_INPUT,
  compileHybridCcV1Run,
  createHybridCcV1Engine,
  decodeHybridCcV1Replay,
  inspectHybridCcV1NativeLevel,
  verifyHybridCcV1Replay,
  type HybridCcV1ConvertedLevel,
  type HybridCcV1WasmModule,
} from "./wasmBridge";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";

const SERIES_FILE = "ROUNDTRIP-Hybrid-v1";

async function loadModule(): Promise<HybridCcV1WasmModule> {
  const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

function winningNativeLevel(number: number, title: string): Uint8Array {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >>> 8);
  };
  const u32 = (value: number) => {
    u16(value);
    u16(value >>> 16);
  };
  const text = (value: string) => {
    const encoded = new TextEncoder().encode(value);
    u32(encoded.length);
    bytes.push(...encoded);
  };
  const element = (id: number, direction = 4) => {
    u16(id);
    u8(5);
    u8(direction);
    u8(1);
    u16(0);
    u8(0);
    u8(0);
    u8(0);
    u8(1);
    u8(0);
    u32(0);
    u32(0);
    u8(0);
    u32(0xffff_ffff);
    u32(0);
  };
  const cell = (terrain: number, actor = 0, actorDirection = 4) => {
    element(terrain);
    element(0);
    element(0);
    element(actor, actorDirection);
    u8(0);
  };

  bytes.push(0x48, 0x43, 0x4c, 0x56);
  u16(4);
  u32(2);
  u32(1);
  u32(1);
  u32(number);
  u32(20);
  text(title);
  text("HybridCC2026");
  text("");
  text("ABCD");
  u32(0);
  u32(1);
  u32(0);
  cell(2, 51, 1);
  cell(4);
  return Uint8Array.from(bytes);
}

function convertedLevel(module: HybridCcV1WasmModule, number: number, title: string): HybridCcV1ConvertedLevel {
  return {
    status: 0,
    entryOrdinal: number,
    requiredChips: 0,
    diagnosticCount: 0,
    nativeLevel: inspectHybridCcV1NativeLevel(module, winningNativeLevel(number, title)),
  };
}

function engineFactory(module: HybridCcV1WasmModule): HybridCcV1EngineFactory {
  return {
    create: (level, seed) => createHybridCcV1Engine(module, level.nativeLevel, seed),
    decodeReplay: (bytes) => decodeHybridCcV1Replay(module, bytes),
    verifyReplay: (level, bytes) => verifyHybridCcV1Replay(module, level.nativeLevel, bytes),
    compileRun: (level, seed, inputs, checkpointMode) => (
      compileHybridCcV1Run(module, level.nativeLevel, seed, inputs, checkpointMode)
    ),
  };
}

function seriesLevel(level: HybridCcV1ConvertedLevel): SeriesLevel {
  return {
    index: level.entryOrdinal - 1,
    number: level.nativeLevel.number,
    name: level.nativeLevel.title,
    author: level.nativeLevel.author,
    password: level.nativeLevel.password,
    timeLimitSeconds: level.nativeLevel.timeLimitSeconds,
    chipsRequired: level.requiredChips,
    bestTimeTicks: 0,
    levelSize: level.nativeLevel.encoded.byteLength,
    solutionSize: 0,
    levelHash: "real-wasm-round-trip",
    gameplayHash: "real-wasm-round-trip",
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  };
}

function recordBoundary(
  session: InteractiveGameSession,
  trace: Array<{ boundary: number; stateHash: string }>,
): void {
  const boundary = session.frame.snapshot.replayCursor;
  if (trace.at(-1)?.boundary === boundary) return;
  trace.push({
    boundary,
    stateHash: session.frame.snapshot.randomState.main.value,
  });
}

async function finishSession(
  adapter: HybridCcV1GameEngineAdapter,
  initial: InteractiveGameSession,
  manual: boolean,
): Promise<{
  session: InteractiveGameSession;
  trace: Array<{ boundary: number; stateHash: string }>;
}> {
  let session = initial;
  const trace: Array<{ boundary: number; stateHash: string }> = [];
  recordBoundary(session, trace);
  for (let hostSample = 0; hostSample < 100 && session.frame.snapshot.status === "playing"; hostSample += 1) {
    const boundary = session.frame.snapshot.replayCursor;
    const input = manual && boundary === 0 ? HYBRIDCC_V1_INPUT.east : HYBRIDCC_V1_INPUT.none;
    session = await adapter.advanceSession(session, input);
    recordBoundary(session, trace);
  }
  if (session.frame.snapshot.status === "playing") {
    throw new Error("real-Wasm round-trip did not become terminal within 100 host samples");
  }
  return { session, trace };
}

describe("Hybrid v1 real-Wasm replay acceptance", () => {
  it("exports a manual terminal run and reproduces every boundary state hash in a fresh adapter", async () => {
    const module = await loadModule();
    const level = convertedLevel(module, 7, "Replay Exit");
    const registry = new HybridCcV1LevelRegistry();
    registry.register(SERIES_FILE, [level]);
    const manualAdapter = new HybridCcV1GameEngineAdapter(registry, engineFactory(module));
    const request = {
      seriesFile: SERIES_FILE,
      levelNumber: 7,
      ruleset: "Hybrid" as const,
      randomSeed: 17,
    };

    const manual = await finishSession(
      manualAdapter,
      await manualAdapter.startSession(request),
      true,
    );
    const artifact = await buildInteractiveReplayExport(
      manualAdapter,
      SERIES_FILE,
      seriesLevel(level),
      manual.session,
    );
    expect(artifact).toMatchObject({ format: "hcr1", mimeType: "application/vnd.hybridcc.hcr1" });
    expect(artifact?.bytes.slice(0, 4)).toEqual(Uint8Array.of(0x48, 0x43, 0x52, 0x31));

    const playbackRegistry = new HybridCcV1LevelRegistry();
    playbackRegistry.register(SERIES_FILE, [level]);
    const playbackAdapter = new HybridCcV1GameEngineAdapter(playbackRegistry, engineFactory(module));
    const imported = await importInteractiveReplayForLevel(
      playbackAdapter,
      {
        importReplay: async () => ({
          name: artifact!.filename,
          bytes: artifact!.bytes,
        }),
      },
      seriesLevel(level),
      { request },
    );
    expect(imported?.launch.kind).toBe("opaque");

    const playback = await finishSession(
      playbackAdapter,
      await startReplayInteractiveGameSession(
        playbackAdapter,
        request,
        imported!.launch,
      ),
      false,
    );

    expect(manual.trace.map(({ boundary }) => boundary)).toEqual([0, 1, 2, 3]);
    expect(playback.trace).toEqual(manual.trace);
    expect(playback.session.frame.snapshot.status).toBe(manual.session.frame.snapshot.status);
    expect(playback.session.run.result?.outcome).toBe(manual.session.run.result?.outcome);
    expect(playback.session.run.result?.endPosition).toEqual(manual.session.run.result?.endPosition);

    await manualAdapter.disposeSession(manual.session);
    await playbackAdapter.disposeSession(playback.session);
  });

  it("rejects corrupt and wrong-level HCR1 before returning an import for persistence", async () => {
    const module = await loadModule();
    const level = convertedLevel(module, 7, "Replay Exit");
    const wrongLevel = convertedLevel(module, 8, "Different Exit");
    const registry = new HybridCcV1LevelRegistry();
    registry.register(SERIES_FILE, [level, wrongLevel]);
    const adapter = new HybridCcV1GameEngineAdapter(registry, engineFactory(module));
    const replay = compileHybridCcV1Run(
      module,
      level.nativeLevel,
      17,
      Uint8Array.of(HYBRIDCC_V1_INPUT.east, HYBRIDCC_V1_INPUT.none, HYBRIDCC_V1_INPUT.none),
      1,
    );
    const corrupt = replay.encoded.slice();
    corrupt[0] = 0;

    await expect(importInteractiveReplayForLevel(
      adapter,
      { importReplay: async () => ({ name: "corrupt.hcr1", bytes: corrupt }) },
      seriesLevel(level),
      {
        request: { seriesFile: SERIES_FILE, levelNumber: 7, ruleset: "Hybrid" },
      },
    )).rejects.toThrow(/bad replay magic|replay decode/iu);

    await expect(importInteractiveReplayForLevel(
      adapter,
      { importReplay: async () => ({ name: "wrong-level.hcr1", bytes: replay.encoded }) },
      seriesLevel(wrongLevel),
      {
        request: { seriesFile: SERIES_FILE, levelNumber: 8, ruleset: "Hybrid" },
      },
    )).rejects.toThrow(/verification failed/iu);
  });
});
