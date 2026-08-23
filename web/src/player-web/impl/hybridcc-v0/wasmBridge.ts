import {
  decodeHybridCcNativeLevel,
  type HybridCcElement,
  type HybridCcNativeCell,
  type HybridCcNativeLevel,
} from "./nativeLevel";

const ABI_VERSION = 1;
const CELL_RECORD_SIZE = 27;
const ACTOR_RECORD_SIZE = 45;
const OUTCOME_RECORD_SIZE = 13;
const CHIP_COLOR_COUNT = 18;

export interface HybridCcWasmModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(pointer: number): void;
  _hybridcc_v0_abi_version(): number;
  _hybridcc_v0_levelset_import_dat(pointer: number, size: number, outPointer: number): number;
  _hybridcc_v0_levelset_destroy(handle: number): void;
  _hybridcc_v0_levelset_count(handle: number): number;
  _hybridcc_v0_levelset_native_level_size(
    handle: number,
    index: number,
    outPointer: number,
  ): number;
  _hybridcc_v0_levelset_copy_native_level(
    handle: number,
    index: number,
    outPointer: number,
    capacity: number,
  ): number;
  _hybridcc_v0_engine_create(
    pointer: number,
    size: number,
    seed: number,
    outPointer: number,
  ): number;
  _hybridcc_v0_engine_destroy(handle: number): void;
  _hybridcc_v0_engine_logic_step(handle: number, input: number): number;
  _hybridcc_v0_engine_logic_step_count(handle: number): number;
  _hybridcc_v0_engine_state_hash(handle: number): bigint;
  _hybridcc_v0_engine_cell_count(handle: number): number;
  _hybridcc_v0_engine_copy_cell(
    handle: number,
    index: number,
    outPointer: number,
    capacity: number,
  ): number;
  _hybridcc_v0_engine_actor_count(handle: number): number;
  _hybridcc_v0_engine_copy_actor(
    handle: number,
    index: number,
    outPointer: number,
    capacity: number,
  ): number;
  _hybridcc_v0_engine_copy_outcome(handle: number, outPointer: number, capacity: number): number;
  _hybridcc_v0_engine_chip_count(handle: number, color: number, outPointer: number): number;
}

export interface HybridCcPosition {
  x: number;
  y: number;
  z: number;
}

export interface HybridCcActor {
  id: number;
  kind: number;
  position: HybridCcPosition;
  direction: number;
  alive: boolean;
  keys: [number, number, number, number];
  tools: [number, number, number, number];
}

export interface HybridCcOutcome {
  kind: number;
  logicStep: number;
  position: HybridCcPosition;
  exitColor: number;
  lossCause: number;
}

export interface HybridCcSnapshot {
  logicStep: number;
  stateHash: bigint;
  cells: HybridCcNativeCell[];
  actors: HybridCcActor[];
  outcome: HybridCcOutcome;
  chipsCollected: number;
}

export interface HybridCcEngine {
  snapshot(): HybridCcSnapshot;
  logicStep(input: number): HybridCcSnapshot;
  dispose(): void;
}

function assertAbi(module: HybridCcWasmModule): void {
  const actual = module._hybridcc_v0_abi_version();
  if (actual !== ABI_VERSION) {
    throw new Error(`HybridCC WebAssembly ABI ${actual} is incompatible with expected ABI ${ABI_VERSION}.`);
  }
}

function assertOk(operation: string, status: number): void {
  if (status !== 0) {
    throw new Error(`${operation} failed with HybridCC status ${status}.`);
  }
}

function view(module: HybridCcWasmModule): DataView {
  return new DataView(module.HEAPU8.buffer);
}

function readU32(module: HybridCcWasmModule, pointer: number): number {
  return view(module).getUint32(pointer, true);
}

function decodeElement(record: DataView, offset: number): HybridCcElement {
  return {
    id: record.getUint8(offset),
    color: record.getUint8(offset + 1),
    direction: record.getUint8(offset + 2),
    rule: record.getUint8(offset + 3),
    channel: record.getUint16(offset + 4, true),
    count: record.getUint16(offset + 6, true),
  };
}

function decodeCell(module: HybridCcWasmModule, pointer: number): HybridCcNativeCell {
  const record = view(module);
  return {
    terrain: decodeElement(record, pointer),
    device: decodeElement(record, pointer + 8),
    pickup: decodeElement(record, pointer + 16),
    actor: { id: 0, color: 0, direction: 4, rule: 0, channel: 0, count: 0 },
    panelEdges: record.getUint8(pointer + 24),
    iceCornerEdges: record.getUint8(pointer + 25),
  };
}

function decodeActor(module: HybridCcWasmModule, pointer: number): HybridCcActor {
  const record = view(module);
  return {
    id: record.getUint32(pointer, true),
    kind: record.getUint8(pointer + 4),
    position: {
      x: record.getInt16(pointer + 5, true),
      y: record.getInt16(pointer + 7, true),
      z: record.getInt16(pointer + 9, true),
    },
    direction: record.getUint8(pointer + 11),
    alive: record.getUint8(pointer + 12) !== 0,
    keys: [
      record.getUint32(pointer + 13, true),
      record.getUint32(pointer + 17, true),
      record.getUint32(pointer + 21, true),
      record.getUint32(pointer + 25, true),
    ],
    tools: [
      record.getUint32(pointer + 29, true),
      record.getUint32(pointer + 33, true),
      record.getUint32(pointer + 37, true),
      record.getUint32(pointer + 41, true),
    ],
  };
}

function decodeOutcome(module: HybridCcWasmModule, pointer: number): HybridCcOutcome {
  const record = view(module);
  return {
    kind: record.getUint8(pointer),
    logicStep: record.getUint32(pointer + 1, true),
    position: {
      x: record.getInt16(pointer + 5, true),
      y: record.getInt16(pointer + 7, true),
      z: record.getInt16(pointer + 9, true),
    },
    exitColor: record.getUint8(pointer + 11),
    lossCause: record.getUint8(pointer + 12),
  };
}

export function importHybridCcDat(
  module: HybridCcWasmModule,
  datBytes: Uint8Array,
): HybridCcNativeLevel[] {
  assertAbi(module);
  const inputPointer = module._malloc(datBytes.length);
  const handlePointer = module._malloc(4);
  let levelsetHandle = 0;

  try {
    module.HEAPU8.set(datBytes, inputPointer);
    view(module).setUint32(handlePointer, 0, true);
    assertOk(
      "HybridCC DAT conversion",
      module._hybridcc_v0_levelset_import_dat(inputPointer, datBytes.length, handlePointer),
    );
    levelsetHandle = readU32(module, handlePointer);
    if (levelsetHandle === 0) {
      throw new Error("HybridCC DAT conversion returned an empty levelset handle.");
    }

    return Array.from(
      { length: module._hybridcc_v0_levelset_count(levelsetHandle) },
      (_, index) => {
        assertOk(
          "HybridCC native level size query",
          module._hybridcc_v0_levelset_native_level_size(levelsetHandle, index, handlePointer),
        );
        const size = readU32(module, handlePointer);
        const levelPointer = module._malloc(size);
        try {
          assertOk(
            "HybridCC native level copy",
            module._hybridcc_v0_levelset_copy_native_level(
              levelsetHandle,
              index,
              levelPointer,
              size,
            ),
          );
          return decodeHybridCcNativeLevel(module.HEAPU8.slice(levelPointer, levelPointer + size));
        } finally {
          module._free(levelPointer);
        }
      },
    );
  } finally {
    if (levelsetHandle !== 0) {
      module._hybridcc_v0_levelset_destroy(levelsetHandle);
    }
    module._free(handlePointer);
    module._free(inputPointer);
  }
}

class WasmHybridCcEngine implements HybridCcEngine {
  private disposed = false;

  constructor(
    private readonly module: HybridCcWasmModule,
    private readonly handle: number,
  ) {}

  snapshot(): HybridCcSnapshot {
    this.assertUsable();
    const cellPointer = this.module._malloc(CELL_RECORD_SIZE);
    const actorPointer = this.module._malloc(ACTOR_RECORD_SIZE);
    const outcomePointer = this.module._malloc(OUTCOME_RECORD_SIZE);
    const countPointer = this.module._malloc(4);

    try {
      const cells = Array.from(
        { length: this.module._hybridcc_v0_engine_cell_count(this.handle) },
        (_, index) => {
          assertOk(
            "HybridCC cell snapshot",
            this.module._hybridcc_v0_engine_copy_cell(
              this.handle,
              index,
              cellPointer,
              CELL_RECORD_SIZE,
            ),
          );
          return decodeCell(this.module, cellPointer);
        },
      );
      const actors = Array.from(
        { length: this.module._hybridcc_v0_engine_actor_count(this.handle) },
        (_, index) => {
          assertOk(
            "HybridCC actor snapshot",
            this.module._hybridcc_v0_engine_copy_actor(
              this.handle,
              index,
              actorPointer,
              ACTOR_RECORD_SIZE,
            ),
          );
          return decodeActor(this.module, actorPointer);
        },
      );
      assertOk(
        "HybridCC outcome snapshot",
        this.module._hybridcc_v0_engine_copy_outcome(
          this.handle,
          outcomePointer,
          OUTCOME_RECORD_SIZE,
        ),
      );

      let chipsCollected = 0;
      for (let color = 0; color < CHIP_COLOR_COUNT; color += 1) {
        assertOk(
          "HybridCC chip-count snapshot",
          this.module._hybridcc_v0_engine_chip_count(this.handle, color, countPointer),
        );
        chipsCollected += readU32(this.module, countPointer);
      }

      return {
        logicStep: this.module._hybridcc_v0_engine_logic_step_count(this.handle),
        stateHash: BigInt.asUintN(
          64,
          this.module._hybridcc_v0_engine_state_hash(this.handle),
        ),
        cells,
        actors,
        outcome: decodeOutcome(this.module, outcomePointer),
        chipsCollected,
      };
    } finally {
      this.module._free(countPointer);
      this.module._free(outcomePointer);
      this.module._free(actorPointer);
      this.module._free(cellPointer);
    }
  }

  logicStep(input: number): HybridCcSnapshot {
    this.assertUsable();
    assertOk("HybridCC logic step", this.module._hybridcc_v0_engine_logic_step(this.handle, input));
    return this.snapshot();
  }

  dispose(): void {
    if (!this.disposed) {
      this.module._hybridcc_v0_engine_destroy(this.handle);
      this.disposed = true;
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error("HybridCC engine has been disposed.");
    }
  }
}

export function createHybridCcEngine(
  module: HybridCcWasmModule,
  level: HybridCcNativeLevel,
  seed: number,
): HybridCcEngine {
  assertAbi(module);
  const inputPointer = module._malloc(level.encoded.length);
  const handlePointer = module._malloc(4);
  try {
    module.HEAPU8.set(level.encoded, inputPointer);
    view(module).setUint32(handlePointer, 0, true);
    assertOk(
      "HybridCC engine creation",
      module._hybridcc_v0_engine_create(
        inputPointer,
        level.encoded.length,
        seed >>> 0,
        handlePointer,
      ),
    );
    const handle = readU32(module, handlePointer);
    if (handle === 0) {
      throw new Error("HybridCC engine creation returned an empty handle.");
    }
    return new WasmHybridCcEngine(module, handle);
  } finally {
    module._free(handlePointer);
    module._free(inputPointer);
  }
}
