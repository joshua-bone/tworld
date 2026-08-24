import {
  decodeHybridCcNativeLevel,
  type HybridCcElement,
  type HybridCcNativeCell,
  type HybridCcNativeLevel,
} from "./nativeLevel";

const ABI_VERSION = 2;
const CELL_RECORD_SIZE = 37;
const ACTOR_RECORD_SIZE = 59;
const OUTCOME_RECORD_SIZE = 13;
const SIGNAL_RECORD_SIZE = 20;
const EVENT_RECORD_SIZE = 53;
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
  _hybridcc_v0_engine_event_hash(handle: number): bigint;
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
  _hybridcc_v0_engine_signal_count(handle: number): number;
  _hybridcc_v0_engine_copy_signal(
    handle: number,
    index: number,
    outPointer: number,
    capacity: number,
  ): number;
  _hybridcc_v0_engine_event_count(handle: number): number;
  _hybridcc_v0_engine_copy_event(
    handle: number,
    index: number,
    outPointer: number,
    capacity: number,
  ): number;
  _hybridcc_v0_engine_events_overflowed(handle: number): number;
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
  color: number;
  rule: number;
  channel: number;
  hasLastMoveStep: boolean;
  lastMoveStep: number;
  stateFlags: number;
  forcedDirection: number;
}

export interface HybridCcSignal {
  color: number;
  channel: number;
  signal: number;
  holdOneCount: number;
  holdAllCount: number;
  dpadDirection: number;
  dpadSignal: number;
}

export interface HybridCcEngineEvent {
  sequence: number;
  kind: number;
  interaction: number;
  lossCause: number;
  actorKind: number;
  logicStep: number;
  actorId: number;
  direction: number;
  origin: HybridCcPosition;
  position: HybridCcPosition;
  subject: HybridCcElement;
  replacement: HybridCcElement;
  actorStateFlags: number;
  amount: number;
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
  eventHash: bigint;
  cells: HybridCcNativeCell[];
  actors: HybridCcActor[];
  signals: HybridCcSignal[];
  events: HybridCcEngineEvent[];
  eventsOverflowed: boolean;
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
    dynamicState: record.getUint8(pointer + 27),
    signal: record.getUint32(pointer + 28, true),
    dpadDirection: record.getUint8(pointer + 32),
    dpadSignal: record.getUint32(pointer + 33, true),
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
    color: record.getUint8(pointer + 45),
    rule: record.getUint8(pointer + 46),
    channel: record.getUint16(pointer + 47, true),
    hasLastMoveStep: record.getUint8(pointer + 49) !== 0,
    lastMoveStep: record.getUint32(pointer + 50, true),
    stateFlags: record.getUint32(pointer + 54, true),
    forcedDirection: record.getUint8(pointer + 58),
  };
}

function decodeSignal(module: HybridCcWasmModule, pointer: number): HybridCcSignal {
  const record = view(module);
  return {
    color: record.getUint8(pointer),
    channel: record.getUint16(pointer + 1, true),
    signal: record.getUint32(pointer + 3, true),
    holdOneCount: record.getUint32(pointer + 7, true),
    holdAllCount: record.getUint32(pointer + 11, true),
    dpadDirection: record.getUint8(pointer + 15),
    dpadSignal: record.getUint32(pointer + 16, true),
  };
}

function decodePosition(record: DataView, pointer: number): HybridCcPosition {
  return {
    x: record.getInt16(pointer, true),
    y: record.getInt16(pointer + 2, true),
    z: record.getInt16(pointer + 4, true),
  };
}

function decodeEvent(module: HybridCcWasmModule, pointer: number): HybridCcEngineEvent {
  const record = view(module);
  return {
    sequence: record.getUint32(pointer, true),
    kind: record.getUint8(pointer + 4),
    interaction: record.getUint8(pointer + 5),
    lossCause: record.getUint8(pointer + 6),
    actorKind: record.getUint8(pointer + 7),
    logicStep: record.getUint32(pointer + 8, true),
    actorId: record.getUint32(pointer + 12, true),
    direction: record.getUint8(pointer + 16),
    origin: decodePosition(record, pointer + 17),
    position: decodePosition(record, pointer + 23),
    subject: decodeElement(record, pointer + 29),
    replacement: decodeElement(record, pointer + 37),
    actorStateFlags: record.getUint32(pointer + 45, true),
    amount: record.getInt32(pointer + 49, true),
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
    const signalPointer = this.module._malloc(SIGNAL_RECORD_SIZE);
    const eventPointer = this.module._malloc(EVENT_RECORD_SIZE);
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
      const signals = Array.from(
        { length: this.module._hybridcc_v0_engine_signal_count(this.handle) },
        (_, index) => {
          assertOk(
            "HybridCC signal snapshot",
            this.module._hybridcc_v0_engine_copy_signal(
              this.handle,
              index,
              signalPointer,
              SIGNAL_RECORD_SIZE,
            ),
          );
          return decodeSignal(this.module, signalPointer);
        },
      );
      const events = Array.from(
        { length: this.module._hybridcc_v0_engine_event_count(this.handle) },
        (_, index) => {
          assertOk(
            "HybridCC event snapshot",
            this.module._hybridcc_v0_engine_copy_event(
              this.handle,
              index,
              eventPointer,
              EVENT_RECORD_SIZE,
            ),
          );
          return decodeEvent(this.module, eventPointer);
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
        eventHash: BigInt.asUintN(
          64,
          this.module._hybridcc_v0_engine_event_hash(this.handle),
        ),
        cells,
        actors,
        signals,
        events,
        eventsOverflowed: this.module._hybridcc_v0_engine_events_overflowed(this.handle) !== 0,
        outcome: decodeOutcome(this.module, outcomePointer),
        chipsCollected,
      };
    } finally {
      this.module._free(countPointer);
      this.module._free(outcomePointer);
      this.module._free(actorPointer);
      this.module._free(eventPointer);
      this.module._free(signalPointer);
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
