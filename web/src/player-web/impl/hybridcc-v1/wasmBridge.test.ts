import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import {
  HYBRIDCC_V1_INPUT,
  compileHybridCcV1Run,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  decodeHybridCcV1Replay,
  inspectHybridCcV1NativeLevel,
  verifyHybridCcV1Replay,
} from "./wasmBridge";

const SIX_PACK_CONVERSION_TIMEOUT_MS = 20_000;

async function loadModule() {
  const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

function winningNativeLevel(): Uint8Array {
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
    u8(5); // white
    u8(direction);
    u8(1); // normal speed
    u16(0); // no rule
    u8(0); // normal impact
    u8(0); // no movement rule
    u8(0); // no orientation
    u8(1); // no channel
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
  u32(7);
  u32(20);
  text("Bridge Exit");
  text("HybridCC2026");
  text("");
  text("ABCD");
  u32(0); // text table
  u32(1); // actor order
  u32(0);
  cell(2, 51, 1);
  cell(4);
  return Uint8Array.from(bytes);
}

describe("HybridCC v1 WebAssembly bridge", () => {
  it("preserves per-entry DAT recovery and canonical native metadata", async () => {
    const module = await loadModule();
    const conversions = new Map<string, ReturnType<typeof convertHybridCcV1Dat>>();
    for (const filename of [
      "CCLP1.dat",
      "CCLP2.dat",
      "CCLP3.dat",
      "CCLP4.dat",
      "CCLP5.dat",
      "CCLXP2.dat",
    ]) {
      const datBytes = new Uint8Array(
        await readFile(new URL(`../../../../../data/${filename}`, import.meta.url)),
      );
      conversions.set(filename, convertHybridCcV1Dat(module, datBytes));
    }
    const conversion = conversions.get("CCLP2.dat");
    if (!conversion) throw new Error("CCLP2 conversion was not recorded");
    const successes = conversion.entries.filter((entry) => entry.status === 0);
    const failures = conversion.entries.filter((entry) => entry.status !== 0);

    expect([...conversions.values()].reduce(
      (sum, result) => sum + result.entries.filter((entry) => entry.status === 0).length,
      0,
    )).toBe(892);
    expect([...conversions.values()].reduce((sum, result) => sum + result.entries.length, 0))
      .toBe(894);
    expect(conversion.fileStatus).toBe(0);
    expect(conversion.entries).toHaveLength(149);
    expect(successes).toHaveLength(147);
    expect(failures.map((entry) => [entry.entryOrdinal, entry.status])).toEqual([
      [78, 4],
      [131, 4],
    ]);
    expect(conversion.diagnostics.filter((diagnostic) => diagnostic.severity === 2))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          entryOrdinal: 78,
          code: "dat.unsupported_composition.multiple_pickup",
        }),
        expect.objectContaining({
          entryOrdinal: 131,
          code: "dat.unsupported_composition.multiple_device",
        }),
      ]));

    const first = successes[0];
    expect(first?.nativeLevel).toMatchObject({
      number: 1,
      width: 32,
      height: 32,
      depth: 1,
    });
    expect(first?.nativeLevel.encoded.slice(0, 6)).toEqual(
      Uint8Array.from([0x48, 0x43, 0x4c, 0x56, 4, 0]),
    );
  }, SIX_PACK_CONVERSION_TIMEOUT_MS);

  it("decodes metadata and advances the actual deterministic engine", async () => {
    const module = await loadModule();
    const level = inspectHybridCcV1NativeLevel(module, winningNativeLevel());
    expect(level).toMatchObject({
      number: 7,
      title: "Bridge Exit",
      author: "HybridCC2026",
      password: "ABCD",
      width: 2,
      height: 1,
      depth: 1,
      timeLimitSeconds: 20,
    });

    const engine = createHybridCcV1Engine(module, level, 17);
    const initial = engine.snapshot();
    expect(initial.header).toMatchObject({
      recordVersion: 2,
      abiVersion: 2,
      ruleset: { major: 1, minor: 0, tweak: 9 },
      width: 2,
      height: 1,
      depth: 1,
      logicBoundary: 0n,
      randomSeed: 17,
    });
    expect(initial.actors).toEqual([
      expect.objectContaining({
        id: 0x1_0000_0000n,
        kind: 51,
        direction: 1,
        logicalPosition: { x: 0, y: 0, z: 0 },
      }),
    ]);

    const started = engine.logicStep(HYBRIDCC_V1_INPUT.east);
    expect(started).toMatchObject({ stepStatus: 0, stateChanged: true });
    expect(started.runtime.logicBoundary).toBe(1n);
    const moving = engine.snapshot();
    expect(moving.actors[0]).toMatchObject({
      hasMovement: true,
      movement: {
        origin: { x: 0, y: 0, z: 0 },
        destination: { x: 1, y: 0, z: 0 },
        startBoundary: 1n,
        completionBoundary: 3n,
      },
    });
    expect(moving.presentation).toMatchObject({
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: { presentationSampleCount: 4 },
    });

    engine.logicStep(HYBRIDCC_V1_INPUT.none);
    const completed = engine.logicStep(HYBRIDCC_V1_INPUT.none);
    expect(completed.runtime.outcome).toMatchObject({ kind: 1, logicBoundary: 3n });
    expect(engine.invariantStatus()).toBe(0);
    engine.dispose();
    expect(() => engine.runtime()).toThrow(/disposed/i);
  });

  it("round-trips and verifies a canonical HCR1 run", async () => {
    const module = await loadModule();
    const level = winningNativeLevel();
    const replay = compileHybridCcV1Run(
      module,
      level,
      17,
      Uint8Array.from([
        HYBRIDCC_V1_INPUT.east,
        HYBRIDCC_V1_INPUT.none,
        HYBRIDCC_V1_INPUT.none,
      ]),
      1,
    );

    expect(replay.encoded.slice(0, 4)).toEqual(Uint8Array.from([0x48, 0x43, 0x52, 0x31]));
    expect(replay.header).toMatchObject({
      ruleset: { major: 1, minor: 0, tweak: 9 },
      randomSeed: 17,
      finalBoundary: 3n,
      checkpointMode: 1,
      expectedOutcome: { kind: 1 },
    });
    expect(replay.checkpoints).toHaveLength(4);

    const decoded = decodeHybridCcV1Replay(module, replay.encoded);
    expect(decoded).toEqual(replay);
    expect(verifyHybridCcV1Replay(module, level, replay.encoded)).toMatchObject({
      verifyStatus: 0,
      hasDivergence: false,
      actualOutcome: { kind: 1, logicBoundary: 3n },
    });
  });
});
