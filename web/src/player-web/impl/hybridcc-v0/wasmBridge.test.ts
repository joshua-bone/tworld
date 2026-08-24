import { describe, expect, it } from "vitest";
import {
  createHybridCcEngine,
  importHybridCcDat,
  type HybridCcWasmModule,
} from "./wasmBridge";

function nativeFixture(): Uint8Array {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value & 0xff);
  const u16 = (value: number) => {
    u8(value);
    u8(value >>> 8);
  };
  const element = (id: number, direction = 4) => {
    u8(id);
    u8(0);
    u8(direction);
    u8(0);
    u16(0);
    u16(0);
  };

  bytes.push(0x48, 0x43, 0x4c, 0x56);
  u16(1);
  u16(1);
  u16(1);
  u16(1);
  u16(1);
  u16(3);
  u16(100);
  for (let index = 0; index < 4; index += 1) u16(0);
  u16(1);
  u16(0);
  element(1);
  element(0);
  element(0);
  element(41, 1);
  u8(0);
  u8(0);
  return new Uint8Array(bytes);
}

interface FakeModuleState {
  destroyedEngine: boolean;
  destroyedLevelset: boolean;
  importBytes: number[];
  lastInput: number | null;
  logicStep: number;
}

function writeElement(view: DataView, offset: number, id: number): void {
  view.setUint8(offset, id);
  view.setUint8(offset + 1, 0);
  view.setUint8(offset + 2, 4);
  view.setUint8(offset + 3, 0);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
}

function fakeModule(nativeLevel: Uint8Array): {
  module: HybridCcWasmModule;
  state: FakeModuleState;
} {
  const heap = new Uint8Array(new ArrayBuffer(128 * 1024));
  const state: FakeModuleState = {
    destroyedEngine: false,
    destroyedLevelset: false,
    importBytes: [],
    lastInput: null,
    logicStep: 0,
  };
  let nextPointer = 1024;
  const view = () => new DataView(heap.buffer);
  const writeU32 = (pointer: number, value: number) => view().setUint32(pointer, value, true);

  const module: HybridCcWasmModule = {
    HEAPU8: heap,
    _malloc: (size) => {
      const pointer = nextPointer;
      nextPointer += Math.max(1, size);
      return pointer;
    },
    _free: () => {},
    _hybridcc_v0_abi_version: () => 2,
    _hybridcc_v0_levelset_import_dat: (pointer, size, outPointer) => {
      state.importBytes = [...heap.subarray(pointer, pointer + size)];
      writeU32(outPointer, 0x1000);
      return 0;
    },
    _hybridcc_v0_levelset_destroy: (handle) => {
      expect(handle).toBe(0x1000);
      state.destroyedLevelset = true;
    },
    _hybridcc_v0_levelset_count: () => 1,
    _hybridcc_v0_levelset_native_level_size: (_handle, index, outPointer) => {
      expect(index).toBe(0);
      writeU32(outPointer, nativeLevel.length);
      return 0;
    },
    _hybridcc_v0_levelset_copy_native_level: (_handle, index, outPointer, capacity) => {
      expect(index).toBe(0);
      expect(capacity).toBe(nativeLevel.length);
      heap.set(nativeLevel, outPointer);
      return 0;
    },
    _hybridcc_v0_engine_create: (pointer, size, seed, outPointer) => {
      expect([...heap.subarray(pointer, pointer + size)]).toEqual([...nativeLevel]);
      expect(seed).toBe(17);
      writeU32(outPointer, 0x2000);
      return 0;
    },
    _hybridcc_v0_engine_destroy: (handle) => {
      expect(handle).toBe(0x2000);
      state.destroyedEngine = true;
    },
    _hybridcc_v0_engine_logic_step: (_handle, input) => {
      state.lastInput = input;
      state.logicStep += 1;
      return 0;
    },
    _hybridcc_v0_engine_logic_step_count: () => state.logicStep,
    _hybridcc_v0_engine_state_hash: () => -0x1234n,
    _hybridcc_v0_engine_event_hash: () => 0x5678n,
    _hybridcc_v0_engine_cell_count: () => 1,
    _hybridcc_v0_engine_copy_cell: (_handle, _index, pointer, capacity) => {
      expect(capacity).toBe(37);
      const target = view();
      writeElement(target, pointer, 8);
      writeElement(target, pointer + 8, 0);
      writeElement(target, pointer + 16, 22);
      target.setUint8(pointer + 24, 3);
      target.setUint8(pointer + 25, 4);
      target.setUint8(pointer + 26, 0);
      target.setUint8(pointer + 27, 0b0101);
      target.setUint32(pointer + 28, 3, true);
      target.setUint8(pointer + 32, 2);
      target.setUint32(pointer + 33, 4, true);
      return 0;
    },
    _hybridcc_v0_engine_actor_count: () => 1,
    _hybridcc_v0_engine_copy_actor: (_handle, _index, pointer, capacity) => {
      expect(capacity).toBe(59);
      const target = view();
      target.setUint32(pointer, 9, true);
      target.setUint8(pointer + 4, 41);
      target.setInt16(pointer + 5, 0, true);
      target.setInt16(pointer + 7, 0, true);
      target.setInt16(pointer + 9, 0, true);
      target.setUint8(pointer + 11, 1);
      target.setUint8(pointer + 12, 1);
      target.setUint32(pointer + 13, 2, true);
      target.setUint32(pointer + 29, 1, true);
      target.setUint8(pointer + 45, 2);
      target.setUint8(pointer + 46, 6);
      target.setUint16(pointer + 47, 19, true);
      target.setUint8(pointer + 49, 1);
      target.setUint32(pointer + 50, 12, true);
      target.setUint32(pointer + 54, (1 << 10) | (1 << 14), true);
      target.setUint8(pointer + 58, 1);
      return 0;
    },
    _hybridcc_v0_engine_signal_count: () => 1,
    _hybridcc_v0_engine_copy_signal: (_handle, _index, pointer, capacity) => {
      expect(capacity).toBe(20);
      const target = view();
      target.setUint8(pointer, 2);
      target.setUint16(pointer + 1, 19, true);
      target.setUint32(pointer + 3, 3, true);
      target.setUint32(pointer + 7, 1, true);
      target.setUint32(pointer + 11, 2, true);
      target.setUint8(pointer + 15, 2);
      target.setUint32(pointer + 16, 4, true);
      return 0;
    },
    _hybridcc_v0_engine_event_count: () => 1,
    _hybridcc_v0_engine_copy_event: (_handle, _index, pointer, capacity) => {
      expect(capacity).toBe(53);
      const target = view();
      target.setUint32(pointer, 7, true);
      target.setUint8(pointer + 4, 1);
      target.setUint8(pointer + 5, 1);
      target.setUint8(pointer + 6, 0);
      target.setUint8(pointer + 7, 41);
      target.setUint32(pointer + 8, state.logicStep, true);
      target.setUint32(pointer + 12, 9, true);
      target.setUint8(pointer + 16, 1);
      target.setInt16(pointer + 17, -1, true);
      target.setInt16(pointer + 19, 0, true);
      target.setInt16(pointer + 21, 0, true);
      target.setInt16(pointer + 23, 0, true);
      target.setInt16(pointer + 25, 0, true);
      target.setInt16(pointer + 27, 0, true);
      writeElement(target, pointer + 29, 10);
      writeElement(target, pointer + 37, 1);
      target.setUint32(pointer + 45, (1 << 10) | (1 << 14), true);
      target.setInt32(pointer + 49, 1, true);
      return 0;
    },
    _hybridcc_v0_engine_events_overflowed: () => 0,
    _hybridcc_v0_engine_copy_outcome: (_handle, pointer, capacity) => {
      expect(capacity).toBe(13);
      const target = view();
      target.setUint8(pointer, 0);
      target.setUint32(pointer + 1, state.logicStep, true);
      target.setInt16(pointer + 5, 0, true);
      target.setInt16(pointer + 7, 0, true);
      target.setInt16(pointer + 9, 0, true);
      target.setUint8(pointer + 11, 1);
      target.setUint8(pointer + 12, 0);
      return 0;
    },
    _hybridcc_v0_engine_chip_count: (_handle, color, outPointer) => {
      writeU32(outPointer, color === 0 ? 2 : 0);
      return 0;
    },
  };
  return { module, state };
}

describe("HybridCC v0 WebAssembly bridge", () => {
  it("converts DAT to independent canonical native levels and releases the converter handle", () => {
    const encoded = nativeFixture();
    const { module, state } = fakeModule(encoded);
    const dat = new Uint8Array([0xac, 0xaa, 0x02, 0x00]);

    const levels = importHybridCcDat(module, dat);

    expect(state.importBytes).toEqual([...dat]);
    expect(state.destroyedLevelset).toBe(true);
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ number: 1, requiredChips: 3, timeLimitSeconds: 100 });
  });

  it("creates the engine from native bytes and decodes canonical state records", () => {
    const encoded = nativeFixture();
    const { module, state } = fakeModule(encoded);
    const level = importHybridCcDat(module, new Uint8Array([1]))[0]!;
    const engine = createHybridCcEngine(module, level, 17);

    const initial = engine.snapshot();
    expect(initial).toMatchObject({
      logicStep: 0,
      stateHash: BigInt.asUintN(64, -0x1234n),
      eventHash: 0x5678n,
      chipsCollected: 2,
    });
    expect(initial.cells[0]).toMatchObject({
      terrain: { id: 8 },
      pickup: { id: 22 },
      panelEdges: 3,
      iceCornerEdges: 4,
      dynamicState: 0b0101,
      signal: 3,
      dpadDirection: 2,
      dpadSignal: 4,
    });
    expect(initial.actors[0]).toMatchObject({
      id: 9,
      kind: 41,
      position: { x: 0, y: 0, z: 0 },
      direction: 1,
      alive: true,
      keys: [2, 0, 0, 0],
      tools: [1, 0, 0, 0],
      color: 2,
      rule: 6,
      channel: 19,
      hasLastMoveStep: true,
      lastMoveStep: 12,
      stateFlags: (1 << 10) | (1 << 14),
      forcedDirection: 1,
    });
    expect(initial.signals).toEqual([{
      color: 2,
      channel: 19,
      signal: 3,
      holdOneCount: 1,
      holdAllCount: 2,
      dpadDirection: 2,
      dpadSignal: 4,
    }]);
    expect(initial.events).toMatchObject([{
      sequence: 7,
      kind: 1,
      interaction: 1,
      actorKind: 41,
      actorId: 9,
      origin: { x: -1, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      subject: { id: 10 },
      replacement: { id: 1 },
      actorStateFlags: (1 << 10) | (1 << 14),
      amount: 1,
    }]);
    expect(initial.eventsOverflowed).toBe(false);

    const stepped = engine.logicStep(5);
    expect(state.lastInput).toBe(5);
    expect(stepped.logicStep).toBe(1);

    engine.dispose();
    expect(state.destroyedEngine).toBe(true);
    expect(() => engine.snapshot()).toThrow("disposed");
  });
});
