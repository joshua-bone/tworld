export const HYBRIDCC_V1_ABI = {
  version: 2,
  snapshotRecordVersion: 2,
  ruleset: { major: 1, minor: 0, tweak: 13 },
  logicStepsPerSecond: 10,
  presentationSamplesPerSecond: 20,
} as const;

export const HYBRIDCC_V1_INPUT = {
  none: 0,
  north: 1,
  east: 2,
  south: 3,
  west: 4,
  northEast: 5,
  northWest: 6,
  eastNorth: 7,
  eastSouth: 8,
  southEast: 9,
  southWest: 10,
  westSouth: 11,
  westNorth: 12,
} as const;

export const HYBRIDCC_V1_RECORD_SIZES = {
  channel: 12,
  position: 12,
  element: 60,
  outcome: 32,
  movement: 60,
  motionTrack: 72,
  inventory: 24,
  actor: 564,
  layerSignal: 32,
  cell: 788,
  signal: 44,
  event: 268,
  playerPush: 56,
  presentation: 240,
  runtime: 64,
  stepResult: 72,
  snapshotHeader: 136,
  engineCreateDiagnostic: 24,
  nativeLevelMetadata: 44,
  hintOverlay: 12,
  datFile: 12,
  datEntry: 20,
  datDiagnostic: 32,
  replayCheckpoint: 24,
  replayChange: 12,
  replayHeader: 104,
  replayDivergence: 60,
  replayVerification: 100,
} as const;

const STATUS_OK = 0;
const STATUS_OUT_OF_MEMORY = 2;
const FIRST_STEP_OPERATION_STATUS = 48;
const LAST_STEP_OPERATION_STATUS = 53;
const MAXIMUM_DAT_INPUT_BYTES = 268_439_558;
const MAXIMUM_NATIVE_LEVEL_INPUT_BYTES = 40_174_642;
const MAXIMUM_HINT_OVERLAY_PLACEMENTS = 65_536;
const MAXIMUM_HINT_OVERLAY_TEXT_BYTES_PER_PLACEMENT = 256;
const MAXIMUM_HINT_OVERLAY_TEXT_BYTES = 16_777_216;
const MAXIMUM_REPLAY_INPUT_BYTES = 24_589_940;
const MAXIMUM_REPLAY_BOUNDARIES = 1_000_000;
const MAXIMUM_SIDES_PER_CELL = 8;
const MAXIMUM_LIFECYCLE_RECEIPT_ENTRIES = 5;
const NO_ACTOR_ID = 0xffff_ffff_ffff_ffffn;
const COPY_PAGE_RECORDS = 256;

const STATUS_NAMES: Readonly<Record<number, string>> = {
  0: "ok",
  1: "invalid argument",
  2: "out of memory",
  3: "no captured snapshot",
  4: "index out of range",
  5: "internal error",
  6: "limit exceeded",
  16: "invalid native level",
  17: "truncated native level",
  18: "bad native-level magic",
  19: "unsupported native-level version",
  20: "invalid native-level enum",
  21: "invalid native-level value",
  22: "native-level text too long",
  23: "native-level trailing bytes",
  24: "too many hint placements",
  25: "too many hint texts",
  26: "hint target out of range",
  27: "duplicate hint target",
  28: "hint target is not hint terrain",
  29: "invalid hint UTF-8",
  30: "overlapping hint text",
  31: "truncated hint text",
  32: "invalid engine level",
  33: "unsupported engine depth",
  34: "unsupported engine capability",
  35: "missing player",
  36: "multiple players",
  37: "engine capacity exhausted",
  48: "step already terminal",
  49: "step counter exhausted",
  50: "step capacity exhausted",
  51: "step command overflow",
  52: "step event overflow",
  53: "step invariant failure",
  64: "invalid replay",
  65: "truncated replay",
  66: "bad replay magic",
  67: "unsupported replay version",
  68: "invalid replay reserved field",
  69: "unsupported replay ruleset",
  70: "too many replay boundaries",
  71: "too many replay changes",
  72: "invalid replay input",
  73: "non-increasing replay changes",
  74: "redundant replay change",
  75: "invalid replay checkpoint count",
  76: "invalid replay outcome",
  77: "replay trailing bytes",
  96: "replay compile invalid level",
  97: "replay compile too many boundaries",
  98: "replay compile too many changes",
  99: "replay compile engine creation failed",
  100: "replay compile invalid input",
  101: "replay compile invalid checkpoint mode",
  102: "replay compile step failed",
  103: "replay became terminal before its final boundary",
  104: "replay did not become terminal",
  105: "solution replay ended in loss",
};

type Pointer = number;
type CopyRecordsFunction = (
  handle: Pointer,
  first: number,
  outRecords: Pointer,
  capacity: number,
  outCopied: Pointer,
) => number;

export interface HybridCcV1WasmModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): Pointer;
  _free(pointer: Pointer): void;
  _hybridcc_v1_abi_version(): number;
  _hybridcc_v1_native_level_decode(bytes: Pointer, count: number, outLevel: Pointer): number;
  _hybridcc_v1_native_level_destroy(level: Pointer): void;
  _hybridcc_v1_native_level_metadata(level: Pointer, outMetadata: Pointer): number;
  _hybridcc_v1_native_level_metadata_text_size(
    level: Pointer,
    textKind: number,
    outCount: Pointer,
  ): number;
  _hybridcc_v1_native_level_copy_metadata_text(
    level: Pointer,
    textKind: number,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_native_level_text_size(
    level: Pointer,
    textIndex: number,
    outCount: Pointer,
  ): number;
  _hybridcc_v1_native_level_copy_text(
    level: Pointer,
    textIndex: number,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_native_level_encoded_size(level: Pointer, outCount: Pointer): number;
  _hybridcc_v1_native_level_copy_encoded(
    level: Pointer,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_native_level_apply_hint_overlay(
    nativeBytes: Pointer,
    nativeCount: number,
    records: Pointer,
    recordCount: number,
    textBlob: Pointer,
    textByteCount: number,
    outLevel: Pointer,
  ): number;
  _hybridcc_v1_dat_conversion_create(bytes: Pointer, count: number, outConversion: Pointer): number;
  _hybridcc_v1_dat_conversion_destroy(conversion: Pointer): void;
  _hybridcc_v1_dat_conversion_file(conversion: Pointer, outFile: Pointer): number;
  _hybridcc_v1_dat_conversion_copy_entries: CopyRecordsFunction;
  _hybridcc_v1_dat_conversion_copy_diagnostics: CopyRecordsFunction;
  _hybridcc_v1_dat_conversion_diagnostic_text_size(
    conversion: Pointer,
    diagnosticIndex: number,
    textKind: number,
    outCount: Pointer,
  ): number;
  _hybridcc_v1_dat_conversion_copy_diagnostic_text(
    conversion: Pointer,
    diagnosticIndex: number,
    textKind: number,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_dat_conversion_entry_native_size(
    conversion: Pointer,
    entryIndex: number,
    outCount: Pointer,
  ): number;
  _hybridcc_v1_dat_conversion_copy_entry_native(
    conversion: Pointer,
    entryIndex: number,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_replay_decode(bytes: Pointer, count: number, outReplay: Pointer): number;
  _hybridcc_v1_replay_compile_run(
    nativeBytes: Pointer,
    nativeCount: number,
    seed: number,
    inputs: Pointer,
    inputCount: number,
    checkpointMode: number,
    outReplay: Pointer,
  ): number;
  _hybridcc_v1_replay_compile_solution(
    nativeBytes: Pointer,
    nativeCount: number,
    seed: number,
    inputs: Pointer,
    inputCount: number,
    checkpointMode: number,
    outReplay: Pointer,
  ): number;
  _hybridcc_v1_replay_destroy(replay: Pointer): void;
  _hybridcc_v1_replay_header(replay: Pointer, outHeader: Pointer): number;
  _hybridcc_v1_replay_copy_changes: CopyRecordsFunction;
  _hybridcc_v1_replay_copy_checkpoints: CopyRecordsFunction;
  _hybridcc_v1_replay_encoded_size(replay: Pointer, outCount: Pointer): number;
  _hybridcc_v1_replay_copy_encoded(
    replay: Pointer,
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ): number;
  _hybridcc_v1_replay_verify(
    nativeBytes: Pointer,
    nativeCount: number,
    replay: Pointer,
    outVerification: Pointer,
  ): number;
  _hybridcc_v1_engine_create(
    nativeBytes: Pointer,
    nativeCount: number,
    seed: number,
    outEngine: Pointer,
  ): number;
  _hybridcc_v1_engine_create_detailed(
    nativeBytes: Pointer,
    nativeCount: number,
    seed: number,
    outEngine: Pointer,
    outDiagnostic: Pointer,
  ): number;
  _hybridcc_v1_engine_destroy(engine: Pointer): void;
  _hybridcc_v1_engine_logic_step(
    engine: Pointer,
    input: number,
    outResult: Pointer,
  ): number;
  _hybridcc_v1_engine_runtime(engine: Pointer, outRuntime: Pointer): number;
  _hybridcc_v1_engine_capture_snapshot(engine: Pointer): number;
  _hybridcc_v1_engine_snapshot_header(engine: Pointer, outHeader: Pointer): number;
  _hybridcc_v1_engine_copy_cells: CopyRecordsFunction;
  _hybridcc_v1_engine_copy_actors: CopyRecordsFunction;
  _hybridcc_v1_engine_copy_inventory: CopyRecordsFunction;
  _hybridcc_v1_engine_copy_signals: CopyRecordsFunction;
  _hybridcc_v1_engine_copy_events: CopyRecordsFunction;
  _hybridcc_v1_engine_copy_presentation(engine: Pointer, outPresentation: Pointer): number;
  _hybridcc_v1_engine_invariant_status(engine: Pointer, outInvariant: Pointer): number;
}

export interface HybridCcV1RulesetVersion {
  major: number;
  minor: number;
  tweak: number;
}

export interface HybridCcV1Channel {
  bytes: Uint8Array;
  isNone: boolean;
}

export interface HybridCcV1Position {
  x: number;
  y: number;
  z: number;
}

export interface HybridCcV1Element {
  id: number;
  color: number;
  direction: number;
  speed: number;
  rule: number;
  impactRule: number;
  movementRule: number;
  orientation: number;
  channel: HybridCcV1Channel;
  count: number;
  countIsUnlimited: boolean;
  textIndex: number;
  timeLimitSeconds: number;
}

export interface HybridCcV1Outcome {
  kind: number;
  logicBoundary: bigint;
  position: HybridCcV1Position;
  exitColor: number;
  lossCause: number;
}

export interface HybridCcV1Movement {
  origin: HybridCcV1Position;
  destination: HybridCcV1Position;
  direction: number;
  slapDirection: number;
  startBoundary: bigint;
  completionBoundary: bigint;
  owner: number;
  movementClass: number;
  discontinuous: boolean;
}

export interface HybridCcV1MotionTrack {
  actorId: bigint;
  actorKind: number;
  origin: HybridCcV1Position;
  destination: HybridCcV1Position;
  direction: number;
  startBoundary: bigint;
  completionBoundary: bigint;
  presentationSampleCount: number;
  owner: number;
  movementClass: number;
  discontinuous: boolean;
}

export interface HybridCcV1InventoryIdentity {
  kind: number;
  color: number;
  rule: number;
}

export interface HybridCcV1InventoryQuantity {
  count: bigint;
  unlimited: boolean;
}

export interface HybridCcV1InventoryEntry {
  identity: HybridCcV1InventoryIdentity;
  quantity: HybridCcV1InventoryQuantity;
}

export interface HybridCcV1LifecycleReceiptEntry {
  stage: number;
  layer: number;
  cellIndex: number;
  element: HybridCcV1Element;
}

export interface HybridCcV1PlayerMomentum {
  forceOverrideAvailable: boolean;
  forceOverrideEligibleBoundary: bigint;
  /** Host name for the ABI's `speed_boost_available` field. */
  exitCreditAvailable: boolean;
  /** Host name for the ABI's `speed_boost_eligible_boundary` field. */
  exitCreditEligibleBoundary: bigint;
  sourceTerrain: number;
  sourceDirection: number;
}

export interface HybridCcV1Actor {
  id: bigint;
  kind: number;
  /** Current logical cell, including throughout an unfinished movement. */
  logicalPosition: HybridCcV1Position;
  direction: number;
  color: number;
  speed: number;
  rule: number;
  impactRule: number;
  movementRule: number;
  channel: HybridCcV1Channel;
  alive: boolean;
  hasMovement: boolean;
  movement: HybridCcV1Movement;
  lifecycleReceipt: HybridCcV1LifecycleReceiptEntry[];
  controlOwner: number;
  terrainOwner: number;
  idleReason: number;
  nextOrdinaryBoundary: bigint;
  playerMomentum: HybridCcV1PlayerMomentum;
  observedControlSignalValue: bigint;
  observedActorSignalValue: bigint;
  pendingFacing: number;
}

export interface HybridCcV1LayerSignal {
  participates: boolean;
  color: number;
  channel: HybridCcV1Channel;
  value: bigint;
  active: boolean;
}

export interface HybridCcV1Cell {
  terrain: HybridCcV1Element;
  device: HybridCcV1Element;
  pickup: HybridCcV1Element;
  sides: HybridCcV1Element[];
  occupant: bigint | null;
  terrainSignal: HybridCcV1LayerSignal;
  deviceSignal: HybridCcV1LayerSignal;
  pickupSignal: HybridCcV1LayerSignal;
  trapOpen: boolean;
  toggleWallOpen: boolean;
  bombArmed: boolean;
}

export interface HybridCcV1Signal {
  color: number;
  channel: HybridCcV1Channel;
  toggleCount: bigint;
  holdOneCount: number;
  holdAllCount: number;
  directionalPad: number;
  directionalPadSignal: bigint;
}

export interface HybridCcV1Event {
  sequence: number;
  kind: number;
  interaction: number;
  lossCause: number;
  logicBoundary: bigint;
  actorId: bigint | null;
  actorKind: number;
  origin: HybridCcV1Position;
  destination: HybridCcV1Position;
  direction: number;
  slapDirection: number;
  owner: number;
  movementClass: number;
  reason: number;
  subject: HybridCcV1Element;
  replacement: HybridCcV1Element;
  inventoryIdentity: HybridCcV1InventoryIdentity;
  inventoryBefore: HybridCcV1InventoryQuantity;
  inventoryAfter: HybridCcV1InventoryQuantity;
  signalColor: number;
  signalChannel: HybridCcV1Channel;
  signalBefore: bigint;
  signalAfter: bigint;
}

export interface HybridCcV1ActiveHint {
  position: HybridCcV1Position;
  textIndex: number;
}

export interface HybridCcV1PlayerPush {
  direction: number;
  origin: HybridCcV1Position;
  contact: HybridCcV1Position;
  blockActorId: bigint | null;
  moving: boolean;
  startBoundary: bigint;
  completionBoundary: bigint;
}

export interface HybridCcV1Presentation {
  recordVersion: number;
  samplesPerSecond: number;
  playerMotion: HybridCcV1MotionTrack | null;
  terminalMotion: HybridCcV1MotionTrack | null;
  playerPush: HybridCcV1PlayerPush | null;
  activeHint: HybridCcV1ActiveHint | null;
}

export interface HybridCcV1Runtime {
  logicBoundary: bigint;
  outcome: HybridCcV1Outcome;
  stateHash: bigint;
  eventHash: bigint;
  presentationHash: bigint;
}

export interface HybridCcV1StepResult {
  operationStatus: number;
  stepStatus: number;
  stateChanged: boolean;
  runtime: HybridCcV1Runtime;
}

export interface HybridCcV1SnapshotHeader {
  recordVersion: number;
  abiVersion: number;
  ruleset: HybridCcV1RulesetVersion;
  width: number;
  height: number;
  depth: number;
  logicBoundary: bigint;
  randomSeed: number;
  timeLimitSeconds: number;
  timeRemainingLogicSteps: number;
  outcome: HybridCcV1Outcome;
  cellCount: number;
  actorCount: number;
  inventoryCount: number;
  signalCount: number;
  eventCount: number;
  eventsOverflowed: boolean;
  droppedEventCount: number;
  stateHash: bigint;
  eventHash: bigint;
  presentationHash: bigint;
}

export interface HybridCcV1Snapshot {
  header: HybridCcV1SnapshotHeader;
  cells: HybridCcV1Cell[];
  actors: HybridCcV1Actor[];
  inventory: HybridCcV1InventoryEntry[];
  signals: HybridCcV1Signal[];
  events: HybridCcV1Event[];
  presentation: HybridCcV1Presentation;
}

export interface HybridCcV1EngineCreateDiagnostic {
  nativeStatus: number;
  engineStatus: number;
  capabilityCode: number;
  cellIndex: number;
  layer: number;
  element: number;
}

export interface HybridCcV1NativeLevel {
  width: number;
  height: number;
  depth: number;
  number: number;
  timeLimitSeconds: number;
  title: string;
  author: string;
  hint: string;
  password: string;
  titleBytes: Uint8Array;
  authorBytes: Uint8Array;
  hintBytes: Uint8Array;
  passwordBytes: Uint8Array;
  texts: string[];
  textBytes: Uint8Array[];
  encoded: Uint8Array;
}

export interface HybridCcV1HintPlacement {
  cellIndex: number;
  text: string;
}

export type HybridCcV1DatEntryFailureStatus = 1 | 2 | 3 | 4 | 5;

interface HybridCcV1DatEntryBase {
  entryOrdinal: number;
  requiredChips: number;
  diagnosticCount: number;
}

export interface HybridCcV1ConvertedLevel extends HybridCcV1DatEntryBase {
  status: 0;
  nativeLevel: HybridCcV1NativeLevel;
}

export interface HybridCcV1FailedDatEntry extends HybridCcV1DatEntryBase {
  status: HybridCcV1DatEntryFailureStatus;
  nativeLevel?: never;
}

export type HybridCcV1DatEntry = HybridCcV1ConvertedLevel | HybridCcV1FailedDatEntry;

export interface HybridCcV1DatDiagnostic {
  severity: number;
  entryOrdinal: number;
  levelNumber: number;
  cellIndex: number;
  tileCode: number;
  sourceLayer: number;
  code: string;
  message: string;
  codeBytes: Uint8Array;
  messageBytes: Uint8Array;
}

export interface HybridCcV1DatConversionResult {
  fileStatus: number;
  entries: HybridCcV1DatEntry[];
  diagnostics: HybridCcV1DatDiagnostic[];
}

export interface HybridCcV1ReplayCheckpoint {
  stateHash: bigint;
  eventHash: bigint;
  presentationHash: bigint;
}

export interface HybridCcV1ReplayChange {
  logicBoundary: bigint;
  input: number;
}

export interface HybridCcV1ReplayHeader {
  ruleset: HybridCcV1RulesetVersion;
  levelContentHash: Uint8Array;
  randomSeed: number;
  finalBoundary: bigint;
  expectedOutcome: HybridCcV1Outcome;
  checkpointMode: number;
  changeCount: number;
  checkpointCount: number;
  encodedByteCount: number;
}

export interface HybridCcV1Replay {
  header: HybridCcV1ReplayHeader;
  changes: HybridCcV1ReplayChange[];
  checkpoints: HybridCcV1ReplayCheckpoint[];
  encoded: Uint8Array;
}

export interface HybridCcV1ReplayDivergence {
  logicBoundary: bigint;
  differingStreams: number;
  expected: HybridCcV1ReplayCheckpoint;
  actual: HybridCcV1ReplayCheckpoint;
}

export interface HybridCcV1ReplayVerification {
  verifyStatus: number;
  actualOutcome: HybridCcV1Outcome;
  hasDivergence: boolean;
  divergence: HybridCcV1ReplayDivergence | null;
}

export interface HybridCcV1Engine {
  runtime(): HybridCcV1Runtime;
  snapshot(): HybridCcV1Snapshot;
  logicStep(input: number): HybridCcV1StepResult;
  invariantStatus(): number;
  dispose(): void;
}

export class HybridCcV1BridgeError extends Error {
  readonly name = "HybridCcV1BridgeError";

  constructor(
    readonly operation: string,
    readonly status: number,
    readonly diagnostic?: HybridCcV1EngineCreateDiagnostic,
  ) {
    const statusName = STATUS_NAMES[status] ?? "unknown status";
    const detail = diagnostic === undefined
      ? ""
      : ` (native=${diagnostic.nativeStatus}, engine=${diagnostic.engineStatus}, `
        + `capability=${diagnostic.capabilityCode}, cell=${diagnostic.cellIndex}, `
        + `layer=${diagnostic.layer}, element=${diagnostic.element})`;
    super(`${operation} failed with HybridCC status ${status} (${statusName})${detail}.`);
  }
}

function assertAbi(module: HybridCcV1WasmModule): void {
  const actual = module._hybridcc_v1_abi_version();
  if (actual !== HYBRIDCC_V1_ABI.version) {
    throw new Error(
      `HybridCC WebAssembly ABI ${actual} is incompatible with expected ABI ${HYBRIDCC_V1_ABI.version}.`,
    );
  }
}

function assertOk(operation: string, status: number): void {
  if (status !== STATUS_OK) {
    throw new HybridCcV1BridgeError(operation, status);
  }
}

function assertByteLength(operation: string, bytes: Uint8Array, maximum: number): void {
  if (bytes.byteLength > maximum) {
    throw new RangeError(`${operation} exceeds the ${maximum}-byte HybridCC limit.`);
  }
}

function assertU32(operation: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${operation} must be an unsigned 32-bit integer.`);
  }
  return value;
}

function allocate(module: HybridCcV1WasmModule, size: number, operation: string): Pointer {
  assertU32(`${operation} allocation size`, size);
  const pointer = module._malloc(Math.max(1, size));
  if (pointer === 0) {
    throw new HybridCcV1BridgeError(`${operation} allocation`, STATUS_OUT_OF_MEMORY);
  }
  return pointer;
}

function memoryView(module: HybridCcV1WasmModule): DataView {
  // Emscripten replaces HEAPU8 when memory grows. Never retain a DataView across
  // a Wasm call or allocation.
  return new DataView(module.HEAPU8.buffer);
}

function readU32(module: HybridCcV1WasmModule, pointer: Pointer): number {
  return memoryView(module).getUint32(pointer, true);
}

function writeU32(module: HybridCcV1WasmModule, pointer: Pointer, value: number): void {
  memoryView(module).setUint32(pointer, value, true);
}

function withInputBytes<T>(
  module: HybridCcV1WasmModule,
  bytes: Uint8Array,
  operation: string,
  callback: (pointer: Pointer) => T,
): T {
  const pointer = allocate(module, bytes.byteLength, operation);
  try {
    module.HEAPU8.set(bytes, pointer);
    return callback(pointer);
  } finally {
    module._free(pointer);
  }
}

function pointerValue(value: bigint): bigint | null {
  return value === NO_ACTOR_ID ? null : value;
}

function bool32(view: DataView, offset: number): boolean {
  return view.getUint32(offset, true) !== 0;
}

function decodeChannel(view: DataView, offset: number): HybridCcV1Channel {
  const length = view.getUint32(offset + 4, true);
  if (length > 4) {
    throw new Error(`HybridCC channel record declares invalid length ${length}.`);
  }
  return {
    bytes: new Uint8Array(view.buffer, view.byteOffset + offset, length).slice(),
    isNone: bool32(view, offset + 8),
  };
}

function decodePosition(view: DataView, offset: number): HybridCcV1Position {
  return {
    x: view.getInt32(offset, true),
    y: view.getInt32(offset + 4, true),
    z: view.getInt32(offset + 8, true),
  };
}

function decodeElement(view: DataView, offset: number): HybridCcV1Element {
  return {
    id: view.getUint32(offset, true),
    color: view.getUint32(offset + 4, true),
    direction: view.getUint32(offset + 8, true),
    speed: view.getUint32(offset + 12, true),
    rule: view.getUint32(offset + 16, true),
    impactRule: view.getUint32(offset + 20, true),
    movementRule: view.getUint32(offset + 24, true),
    orientation: view.getUint32(offset + 28, true),
    channel: decodeChannel(view, offset + 32),
    count: view.getUint32(offset + 44, true),
    countIsUnlimited: bool32(view, offset + 48),
    textIndex: view.getUint32(offset + 52, true),
    timeLimitSeconds: view.getUint32(offset + 56, true),
  };
}

function decodeOutcome(view: DataView, offset: number): HybridCcV1Outcome {
  return {
    kind: view.getUint32(offset, true),
    logicBoundary: view.getBigUint64(offset + 4, true),
    position: decodePosition(view, offset + 12),
    exitColor: view.getUint32(offset + 24, true),
    lossCause: view.getUint32(offset + 28, true),
  };
}

function decodeMovement(view: DataView, offset: number): HybridCcV1Movement {
  return {
    origin: decodePosition(view, offset),
    destination: decodePosition(view, offset + 12),
    direction: view.getUint32(offset + 24, true),
    slapDirection: view.getUint32(offset + 28, true),
    startBoundary: view.getBigUint64(offset + 32, true),
    completionBoundary: view.getBigUint64(offset + 40, true),
    owner: view.getUint32(offset + 48, true),
    movementClass: view.getUint32(offset + 52, true),
    discontinuous: bool32(view, offset + 56),
  };
}

function decodeMotionTrack(view: DataView, offset: number): HybridCcV1MotionTrack {
  return {
    actorId: view.getBigUint64(offset, true),
    actorKind: view.getUint32(offset + 8, true),
    origin: decodePosition(view, offset + 12),
    destination: decodePosition(view, offset + 24),
    direction: view.getUint32(offset + 36, true),
    startBoundary: view.getBigUint64(offset + 40, true),
    completionBoundary: view.getBigUint64(offset + 48, true),
    presentationSampleCount: view.getUint32(offset + 56, true),
    owner: view.getUint32(offset + 60, true),
    movementClass: view.getUint32(offset + 64, true),
    discontinuous: bool32(view, offset + 68),
  };
}

function decodeInventoryIdentity(
  view: DataView,
  offset: number,
): HybridCcV1InventoryIdentity {
  return {
    kind: view.getUint32(offset, true),
    color: view.getUint32(offset + 4, true),
    rule: view.getUint32(offset + 8, true),
  };
}

function decodeInventoryQuantity(
  view: DataView,
  offset: number,
): HybridCcV1InventoryQuantity {
  return {
    count: view.getBigUint64(offset, true),
    unlimited: bool32(view, offset + 8),
  };
}

function decodeInventory(view: DataView, offset: number): HybridCcV1InventoryEntry {
  return {
    identity: decodeInventoryIdentity(view, offset),
    quantity: decodeInventoryQuantity(view, offset + 12),
  };
}

function decodeActor(view: DataView, offset: number): HybridCcV1Actor {
  const receiptCount = view.getUint32(offset + 488, true);
  if (receiptCount > MAXIMUM_LIFECYCLE_RECEIPT_ENTRIES) {
    throw new Error(`HybridCC actor record declares ${receiptCount} lifecycle entries.`);
  }
  const lifecycleReceipt = Array.from({ length: receiptCount }, (_, index) => {
    const entryOffset = offset + 128 + index * 72;
    return {
      stage: view.getUint32(entryOffset, true),
      layer: view.getUint32(entryOffset + 4, true),
      cellIndex: view.getUint32(entryOffset + 8, true),
      element: decodeElement(view, entryOffset + 12),
    };
  });
  return {
    id: view.getBigUint64(offset, true),
    kind: view.getUint32(offset + 8, true),
    logicalPosition: decodePosition(view, offset + 12),
    direction: view.getUint32(offset + 24, true),
    color: view.getUint32(offset + 28, true),
    speed: view.getUint32(offset + 32, true),
    rule: view.getUint32(offset + 36, true),
    impactRule: view.getUint32(offset + 40, true),
    movementRule: view.getUint32(offset + 44, true),
    channel: decodeChannel(view, offset + 48),
    alive: bool32(view, offset + 60),
    hasMovement: bool32(view, offset + 64),
    movement: decodeMovement(view, offset + 68),
    lifecycleReceipt,
    controlOwner: view.getUint32(offset + 492, true),
    terrainOwner: view.getUint32(offset + 496, true),
    idleReason: view.getUint32(offset + 500, true),
    nextOrdinaryBoundary: view.getBigUint64(offset + 504, true),
    playerMomentum: {
      forceOverrideAvailable: bool32(view, offset + 512),
      forceOverrideEligibleBoundary: view.getBigUint64(offset + 516, true),
      exitCreditAvailable: bool32(view, offset + 524),
      exitCreditEligibleBoundary: view.getBigUint64(offset + 528, true),
      sourceTerrain: view.getUint32(offset + 536, true),
      sourceDirection: view.getUint32(offset + 540, true),
    },
    observedControlSignalValue: view.getBigUint64(offset + 544, true),
    observedActorSignalValue: view.getBigUint64(offset + 552, true),
    pendingFacing: view.getUint32(offset + 560, true),
  };
}

function decodeLayerSignal(view: DataView, offset: number): HybridCcV1LayerSignal {
  return {
    participates: bool32(view, offset),
    color: view.getUint32(offset + 4, true),
    channel: decodeChannel(view, offset + 8),
    value: view.getBigUint64(offset + 20, true),
    active: bool32(view, offset + 28),
  };
}

function decodeCell(view: DataView, offset: number): HybridCcV1Cell {
  const sideCount = view.getUint32(offset + 660, true);
  if (sideCount > MAXIMUM_SIDES_PER_CELL) {
    throw new Error(`HybridCC cell record declares ${sideCount} side elements.`);
  }
  const compatibilityReservation = pointerValue(view.getBigUint64(offset + 672, true));
  if (compatibilityReservation !== null) {
    throw new Error("HybridCC ABI-2 cell published a nonempty compatibility reservation.");
  }
  return {
    terrain: decodeElement(view, offset),
    device: decodeElement(view, offset + 60),
    pickup: decodeElement(view, offset + 120),
    sides: Array.from(
      { length: sideCount },
      (_, index) => decodeElement(view, offset + 180 + index * 60),
    ),
    occupant: pointerValue(view.getBigUint64(offset + 664, true)),
    terrainSignal: decodeLayerSignal(view, offset + 680),
    deviceSignal: decodeLayerSignal(view, offset + 712),
    pickupSignal: decodeLayerSignal(view, offset + 744),
    trapOpen: bool32(view, offset + 776),
    toggleWallOpen: bool32(view, offset + 780),
    bombArmed: bool32(view, offset + 784),
  };
}

function decodeSignal(view: DataView, offset: number): HybridCcV1Signal {
  return {
    color: view.getUint32(offset, true),
    channel: decodeChannel(view, offset + 4),
    toggleCount: view.getBigUint64(offset + 16, true),
    holdOneCount: view.getUint32(offset + 24, true),
    holdAllCount: view.getUint32(offset + 28, true),
    directionalPad: view.getUint32(offset + 32, true),
    directionalPadSignal: view.getBigUint64(offset + 36, true),
  };
}

function decodeEvent(view: DataView, offset: number): HybridCcV1Event {
  return {
    sequence: view.getUint32(offset, true),
    kind: view.getUint32(offset + 4, true),
    interaction: view.getUint32(offset + 8, true),
    lossCause: view.getUint32(offset + 12, true),
    logicBoundary: view.getBigUint64(offset + 16, true),
    actorId: pointerValue(view.getBigUint64(offset + 24, true)),
    actorKind: view.getUint32(offset + 32, true),
    origin: decodePosition(view, offset + 36),
    destination: decodePosition(view, offset + 48),
    direction: view.getUint32(offset + 60, true),
    slapDirection: view.getUint32(offset + 64, true),
    owner: view.getUint32(offset + 68, true),
    movementClass: view.getUint32(offset + 72, true),
    reason: view.getUint32(offset + 76, true),
    subject: decodeElement(view, offset + 80),
    replacement: decodeElement(view, offset + 140),
    inventoryIdentity: decodeInventoryIdentity(view, offset + 200),
    inventoryBefore: decodeInventoryQuantity(view, offset + 212),
    inventoryAfter: decodeInventoryQuantity(view, offset + 224),
    signalColor: view.getUint32(offset + 236, true),
    signalChannel: decodeChannel(view, offset + 240),
    signalBefore: view.getBigUint64(offset + 252, true),
    signalAfter: view.getBigUint64(offset + 260, true),
  };
}

function decodePresentation(view: DataView, offset: number): HybridCcV1Presentation {
  return {
    recordVersion: view.getUint32(offset, true),
    samplesPerSecond: view.getUint32(offset + 4, true),
    playerMotion: bool32(view, offset + 8) ? decodeMotionTrack(view, offset + 12) : null,
    terminalMotion: bool32(view, offset + 84) ? decodeMotionTrack(view, offset + 88) : null,
    playerPush: bool32(view, offset + 160)
      ? {
          direction: view.getUint32(offset + 164, true),
          origin: decodePosition(view, offset + 168),
          contact: decodePosition(view, offset + 180),
          blockActorId: pointerValue(view.getBigUint64(offset + 192, true)),
          moving: bool32(view, offset + 200),
          startBoundary: view.getBigUint64(offset + 204, true),
          completionBoundary: view.getBigUint64(offset + 212, true),
        }
      : null,
    activeHint: bool32(view, offset + 220)
      ? {
          position: decodePosition(view, offset + 224),
          textIndex: view.getUint32(offset + 236, true),
        }
      : null,
  };
}

function decodeRuntime(view: DataView, offset: number): HybridCcV1Runtime {
  return {
    logicBoundary: view.getBigUint64(offset, true),
    outcome: decodeOutcome(view, offset + 8),
    stateHash: view.getBigUint64(offset + 40, true),
    eventHash: view.getBigUint64(offset + 48, true),
    presentationHash: view.getBigUint64(offset + 56, true),
  };
}

function decodeSnapshotHeader(view: DataView, offset: number): HybridCcV1SnapshotHeader {
  return {
    recordVersion: view.getUint32(offset, true),
    abiVersion: view.getUint32(offset + 4, true),
    ruleset: {
      major: view.getUint32(offset + 8, true),
      minor: view.getUint32(offset + 12, true),
      tweak: view.getUint32(offset + 16, true),
    },
    width: view.getUint32(offset + 20, true),
    height: view.getUint32(offset + 24, true),
    depth: view.getUint32(offset + 28, true),
    logicBoundary: view.getBigUint64(offset + 32, true),
    randomSeed: view.getUint32(offset + 40, true),
    timeLimitSeconds: view.getUint32(offset + 44, true),
    timeRemainingLogicSteps: view.getUint32(offset + 48, true),
    outcome: decodeOutcome(view, offset + 52),
    cellCount: view.getUint32(offset + 84, true),
    actorCount: view.getUint32(offset + 88, true),
    inventoryCount: view.getUint32(offset + 92, true),
    signalCount: view.getUint32(offset + 96, true),
    eventCount: view.getUint32(offset + 100, true),
    eventsOverflowed: bool32(view, offset + 104),
    droppedEventCount: view.getUint32(offset + 108, true),
    stateHash: view.getBigUint64(offset + 112, true),
    eventHash: view.getBigUint64(offset + 120, true),
    presentationHash: view.getBigUint64(offset + 128, true),
  };
}

function decodeEngineCreateDiagnostic(
  view: DataView,
  offset: number,
): HybridCcV1EngineCreateDiagnostic {
  return {
    nativeStatus: view.getUint32(offset, true),
    engineStatus: view.getUint32(offset + 4, true),
    capabilityCode: view.getUint32(offset + 8, true),
    cellIndex: view.getUint32(offset + 12, true),
    layer: view.getUint32(offset + 16, true),
    element: view.getUint32(offset + 20, true),
  };
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function copyBytes(
  module: HybridCcV1WasmModule,
  byteCount: number,
  operation: string,
  copier: (
    first: number,
    outBytes: Pointer,
    capacity: number,
    outCopied: Pointer,
  ) => number,
): Uint8Array {
  assertU32(`${operation} byte count`, byteCount);
  if (byteCount === 0) return new Uint8Array();

  const result = new Uint8Array(byteCount);
  const capacity = Math.min(byteCount, 1024 * 1024);
  const outputPointer = allocate(module, capacity, operation);
  const copiedPointer = allocate(module, 4, `${operation} copied count`);
  try {
    for (let first = 0; first < byteCount;) {
      const requested = Math.min(capacity, byteCount - first);
      writeU32(module, copiedPointer, 0);
      assertOk(operation, copier(first, outputPointer, requested, copiedPointer));
      const copied = readU32(module, copiedPointer);
      if (copied === 0 || copied > requested || first + copied > byteCount) {
        throw new Error(`${operation} returned invalid copied-byte count ${copied}.`);
      }
      result.set(module.HEAPU8.subarray(outputPointer, outputPointer + copied), first);
      first += copied;
    }
    return result;
  } finally {
    module._free(copiedPointer);
    module._free(outputPointer);
  }
}

function copyRecords<T>(
  module: HybridCcV1WasmModule,
  handle: Pointer,
  count: number,
  recordSize: number,
  operation: string,
  copier: CopyRecordsFunction,
  decoder: (view: DataView, offset: number) => T,
): T[] {
  assertU32(`${operation} record count`, count);
  if (count === 0) return [];

  const capacity = Math.min(count, COPY_PAGE_RECORDS);
  const recordsPointer = allocate(module, capacity * recordSize, operation);
  const copiedPointer = allocate(module, 4, `${operation} copied count`);
  const records: T[] = [];
  try {
    for (let first = 0; first < count;) {
      const requested = Math.min(capacity, count - first);
      writeU32(module, copiedPointer, 0);
      assertOk(
        operation,
        copier(handle, first, recordsPointer, requested, copiedPointer),
      );
      const copied = readU32(module, copiedPointer);
      if (copied === 0 || copied > requested || first + copied > count) {
        throw new Error(`${operation} returned invalid copied-record count ${copied}.`);
      }
      const view = memoryView(module);
      for (let index = 0; index < copied; index += 1) {
        records.push(decoder(view, recordsPointer + index * recordSize));
      }
      first += copied;
    }
    return records;
  } finally {
    module._free(copiedPointer);
    module._free(recordsPointer);
  }
}

function metadataText(
  module: HybridCcV1WasmModule,
  level: Pointer,
  textKind: number,
  operation: string,
): Uint8Array {
  const sizePointer = allocate(module, 4, `${operation} size`);
  try {
    assertOk(
      `${operation} size`,
      module._hybridcc_v1_native_level_metadata_text_size(level, textKind, sizePointer),
    );
    return copyBytes(module, readU32(module, sizePointer), operation, (...args) => (
      module._hybridcc_v1_native_level_copy_metadata_text(level, textKind, ...args)
    ));
  } finally {
    module._free(sizePointer);
  }
}

function indexedNativeText(
  module: HybridCcV1WasmModule,
  level: Pointer,
  textIndex: number,
): Uint8Array {
  const sizePointer = allocate(module, 4, "HybridCC native text size");
  try {
    assertOk(
      "HybridCC native text size",
      module._hybridcc_v1_native_level_text_size(level, textIndex, sizePointer),
    );
    return copyBytes(
      module,
      readU32(module, sizePointer),
      "HybridCC native text copy",
      (...args) => module._hybridcc_v1_native_level_copy_text(level, textIndex, ...args),
    );
  } finally {
    module._free(sizePointer);
  }
}

export function inspectHybridCcV1NativeLevel(
  module: HybridCcV1WasmModule,
  nativeBytes: Uint8Array,
): HybridCcV1NativeLevel {
  assertAbi(module);
  assertByteLength(
    "HybridCC native-level decode",
    nativeBytes,
    MAXIMUM_NATIVE_LEVEL_INPUT_BYTES,
  );
  return withInputBytes(module, nativeBytes, "HybridCC native-level input", (inputPointer) => {
    const handlePointer = allocate(module, 4, "HybridCC native-level handle");
    const metadataPointer = allocate(
      module,
      HYBRIDCC_V1_RECORD_SIZES.nativeLevelMetadata,
      "HybridCC native-level metadata",
    );
    let handle = 0;
    try {
      writeU32(module, handlePointer, 0);
      assertOk(
        "HybridCC native-level decode",
        module._hybridcc_v1_native_level_decode(
          inputPointer,
          nativeBytes.byteLength,
          handlePointer,
        ),
      );
      handle = readU32(module, handlePointer);
      if (handle === 0) {
        throw new Error("HybridCC native-level decode returned an empty handle.");
      }
      assertOk(
        "HybridCC native-level metadata",
        module._hybridcc_v1_native_level_metadata(handle, metadataPointer),
      );
      const metadata = memoryView(module);
      const width = metadata.getUint32(metadataPointer, true);
      const height = metadata.getUint32(metadataPointer + 4, true);
      const depth = metadata.getUint32(metadataPointer + 8, true);
      const number = metadata.getUint32(metadataPointer + 12, true);
      const timeLimitSeconds = metadata.getUint32(metadataPointer + 16, true);
      const expectedMetadataSizes = [20, 24, 28, 32].map(
        (offset) => metadata.getUint32(metadataPointer + offset, true),
      );
      const textCount = metadata.getUint32(metadataPointer + 36, true);
      const encodedByteCount = metadata.getUint32(metadataPointer + 40, true);
      const metadataBytes = [0, 1, 2, 3].map((textKind) => (
        metadataText(module, handle, textKind, "HybridCC native metadata text")
      ));
      metadataBytes.forEach((bytes, index) => {
        if (bytes.byteLength !== expectedMetadataSizes[index]) {
          throw new Error("HybridCC native metadata size and copy results disagree.");
        }
      });
      const textBytes = Array.from(
        { length: textCount },
        (_, textIndex) => indexedNativeText(module, handle, textIndex),
      );
      const encoded = copyBytes(
        module,
        encodedByteCount,
        "HybridCC canonical native-level copy",
        (...args) => module._hybridcc_v1_native_level_copy_encoded(handle, ...args),
      );
      return {
        width,
        height,
        depth,
        number,
        timeLimitSeconds,
        title: decodeUtf8(metadataBytes[0]!),
        author: decodeUtf8(metadataBytes[1]!),
        hint: decodeUtf8(metadataBytes[2]!),
        password: decodeUtf8(metadataBytes[3]!),
        titleBytes: metadataBytes[0]!,
        authorBytes: metadataBytes[1]!,
        hintBytes: metadataBytes[2]!,
        passwordBytes: metadataBytes[3]!,
        texts: textBytes.map(decodeUtf8),
        textBytes,
        encoded,
      };
    } finally {
      if (handle !== 0) module._hybridcc_v1_native_level_destroy(handle);
      module._free(metadataPointer);
      module._free(handlePointer);
    }
  });
}

/**
 * Adds native per-cell hint text to an already converted HCLV level. DAT
 * conversion remains the only import path; this explicit operation returns a
 * new canonical native level and never mutates the converted source bytes.
 */
export function applyHybridCcV1HintOverlay(
  module: HybridCcV1WasmModule,
  level: HybridCcV1NativeLevel | Uint8Array,
  placements: readonly HybridCcV1HintPlacement[],
): HybridCcV1NativeLevel {
  assertAbi(module);
  const nativeBytes = nativeLevelBytes(level);
  assertByteLength(
    "HybridCC hint overlay native level",
    nativeBytes,
    MAXIMUM_NATIVE_LEVEL_INPUT_BYTES,
  );
  assertU32("HybridCC hint overlay placement count", placements.length);
  if (placements.length > MAXIMUM_HINT_OVERLAY_PLACEMENTS) {
    throw new RangeError(
      `HybridCC hint overlay exceeds the ${MAXIMUM_HINT_OVERLAY_PLACEMENTS}-placement limit.`,
    );
  }

  const encoder = new TextEncoder();
  const encodedTexts = placements.map((placement, index) => {
    assertU32(`HybridCC hint overlay placement ${index} cell`, placement.cellIndex);
    const bounded = new Uint8Array(MAXIMUM_HINT_OVERLAY_TEXT_BYTES_PER_PLACEMENT + 1);
    const result = encoder.encodeInto(placement.text, bounded);
    if (
      result.read !== placement.text.length
      || result.written > MAXIMUM_HINT_OVERLAY_TEXT_BYTES_PER_PLACEMENT
    ) {
      throw new RangeError(
        `HybridCC hint overlay placement ${index} exceeds the ${MAXIMUM_HINT_OVERLAY_TEXT_BYTES_PER_PLACEMENT}-byte text limit.`,
      );
    }
    return bounded.slice(0, result.written);
  });
  const textByteCount = encodedTexts.reduce((total, bytes) => total + bytes.byteLength, 0);
  assertU32("HybridCC hint overlay text byte count", textByteCount);
  if (textByteCount > MAXIMUM_HINT_OVERLAY_TEXT_BYTES) {
    throw new RangeError(
      `HybridCC hint overlay exceeds the ${MAXIMUM_HINT_OVERLAY_TEXT_BYTES}-byte limit.`,
    );
  }

  const textBlob = new Uint8Array(textByteCount);
  const offsets: number[] = [];
  let textOffset = 0;
  for (const bytes of encodedTexts) {
    offsets.push(textOffset);
    textBlob.set(bytes, textOffset);
    textOffset += bytes.byteLength;
  }

  const encoded = withInputBytes(
    module,
    nativeBytes,
    "HybridCC hint overlay native input",
    (nativePointer) => withInputBytes(
      module,
      textBlob,
      "HybridCC hint overlay text input",
      (textPointer) => {
        const recordsByteCount = assertU32(
          "HybridCC hint overlay records byte count",
          placements.length * HYBRIDCC_V1_RECORD_SIZES.hintOverlay,
        );
        let recordsPointer = 0;
        let handlePointer = 0;
        let sizePointer = 0;
        let handle = 0;
        try {
          recordsPointer = allocate(
            module,
            recordsByteCount,
            "HybridCC hint overlay records",
          );
          handlePointer = allocate(module, 4, "HybridCC hint overlay handle");
          sizePointer = allocate(module, 4, "HybridCC hint overlay encoded size");
          for (let index = 0; index < placements.length; index += 1) {
            const recordPointer = recordsPointer + index * HYBRIDCC_V1_RECORD_SIZES.hintOverlay;
            writeU32(module, recordPointer, placements[index]!.cellIndex);
            writeU32(module, recordPointer + 4, offsets[index]!);
            writeU32(module, recordPointer + 8, encodedTexts[index]!.byteLength);
          }
          writeU32(module, handlePointer, 0);
          assertOk(
            "HybridCC native hint overlay",
            module._hybridcc_v1_native_level_apply_hint_overlay(
              nativePointer,
              nativeBytes.byteLength,
              recordsPointer,
              placements.length,
              textPointer,
              textBlob.byteLength,
              handlePointer,
            ),
          );
          handle = readU32(module, handlePointer);
          if (handle === 0) {
            throw new Error("HybridCC native hint overlay returned an empty handle.");
          }
          assertOk(
            "HybridCC native hint overlay encoded size",
            module._hybridcc_v1_native_level_encoded_size(handle, sizePointer),
          );
          return copyBytes(
            module,
            readU32(module, sizePointer),
            "HybridCC native hint overlay encoded copy",
            (...args) => module._hybridcc_v1_native_level_copy_encoded(handle, ...args),
          );
        } finally {
          if (handle !== 0) module._hybridcc_v1_native_level_destroy(handle);
          if (sizePointer !== 0) module._free(sizePointer);
          if (handlePointer !== 0) module._free(handlePointer);
          if (recordsPointer !== 0) module._free(recordsPointer);
        }
      },
    ),
  );

  return inspectHybridCcV1NativeLevel(module, encoded);
}

interface RawDatEntry {
  entryOrdinal: number;
  status: number;
  requiredChips: number;
  nativeByteCount: number;
  diagnosticCount: number;
}

interface RawDatDiagnostic {
  severity: number;
  entryOrdinal: number;
  levelNumber: number;
  cellIndex: number;
  tileCode: number;
  sourceLayer: number;
  codeByteCount: number;
  messageByteCount: number;
}

function diagnosticText(
  module: HybridCcV1WasmModule,
  conversion: Pointer,
  diagnosticIndex: number,
  textKind: number,
): Uint8Array {
  const sizePointer = allocate(module, 4, "HybridCC DAT diagnostic text size");
  try {
    assertOk(
      "HybridCC DAT diagnostic text size",
      module._hybridcc_v1_dat_conversion_diagnostic_text_size(
        conversion,
        diagnosticIndex,
        textKind,
        sizePointer,
      ),
    );
    return copyBytes(
      module,
      readU32(module, sizePointer),
      "HybridCC DAT diagnostic text copy",
      (...args) => module._hybridcc_v1_dat_conversion_copy_diagnostic_text(
        conversion,
        diagnosticIndex,
        textKind,
        ...args,
      ),
    );
  } finally {
    module._free(sizePointer);
  }
}

export function convertHybridCcV1Dat(
  module: HybridCcV1WasmModule,
  datBytes: Uint8Array,
): HybridCcV1DatConversionResult {
  assertAbi(module);
  assertByteLength("HybridCC DAT conversion", datBytes, MAXIMUM_DAT_INPUT_BYTES);
  return withInputBytes(module, datBytes, "HybridCC DAT input", (inputPointer) => {
    const handlePointer = allocate(module, 4, "HybridCC DAT conversion handle");
    const filePointer = allocate(
      module,
      HYBRIDCC_V1_RECORD_SIZES.datFile,
      "HybridCC DAT file record",
    );
    let handle = 0;
    try {
      writeU32(module, handlePointer, 0);
      assertOk(
        "HybridCC DAT conversion",
        module._hybridcc_v1_dat_conversion_create(
          inputPointer,
          datBytes.byteLength,
          handlePointer,
        ),
      );
      handle = readU32(module, handlePointer);
      if (handle === 0) {
        throw new Error("HybridCC DAT conversion returned an empty handle.");
      }
      assertOk(
        "HybridCC DAT file record",
        module._hybridcc_v1_dat_conversion_file(handle, filePointer),
      );
      const fileView = memoryView(module);
      const fileStatus = fileView.getUint32(filePointer, true);
      const entryCount = fileView.getUint32(filePointer + 4, true);
      const diagnosticCount = fileView.getUint32(filePointer + 8, true);
      const rawEntries = copyRecords<RawDatEntry>(
        module,
        handle,
        entryCount,
        HYBRIDCC_V1_RECORD_SIZES.datEntry,
        "HybridCC DAT entry records",
        module._hybridcc_v1_dat_conversion_copy_entries,
        (view, offset) => ({
          entryOrdinal: view.getUint32(offset, true),
          status: view.getUint32(offset + 4, true),
          requiredChips: view.getUint32(offset + 8, true),
          nativeByteCount: view.getUint32(offset + 12, true),
          diagnosticCount: view.getUint32(offset + 16, true),
        }),
      );
      const rawDiagnostics = copyRecords<RawDatDiagnostic>(
        module,
        handle,
        diagnosticCount,
        HYBRIDCC_V1_RECORD_SIZES.datDiagnostic,
        "HybridCC DAT diagnostic records",
        module._hybridcc_v1_dat_conversion_copy_diagnostics,
        (view, offset) => ({
          severity: view.getUint32(offset, true),
          entryOrdinal: view.getUint32(offset + 4, true),
          levelNumber: view.getUint32(offset + 8, true),
          cellIndex: view.getUint32(offset + 12, true),
          tileCode: view.getUint32(offset + 16, true),
          sourceLayer: view.getUint32(offset + 20, true),
          codeByteCount: view.getUint32(offset + 24, true),
          messageByteCount: view.getUint32(offset + 28, true),
        }),
      );
      const diagnostics = rawDiagnostics.map((raw, diagnosticIndex) => {
        const codeBytes = diagnosticText(module, handle, diagnosticIndex, 0);
        const messageBytes = diagnosticText(module, handle, diagnosticIndex, 1);
        if (
          codeBytes.byteLength !== raw.codeByteCount
          || messageBytes.byteLength !== raw.messageByteCount
        ) {
          throw new Error("HybridCC DAT diagnostic size and copy results disagree.");
        }
        return {
          ...raw,
          code: decodeUtf8(codeBytes),
          message: decodeUtf8(messageBytes),
          codeBytes,
          messageBytes,
        };
      });
      const sizePointer = allocate(module, 4, "HybridCC converted native-level size");
      try {
        const entries = rawEntries.map((entry, entryIndex): HybridCcV1DatEntry => {
          if (entry.status !== 0) {
            if (entry.status < 1 || entry.status > 5 || entry.nativeByteCount !== 0) {
              throw new Error(`HybridCC DAT entry ${entry.entryOrdinal} has an invalid result record.`);
            }
            return {
              entryOrdinal: entry.entryOrdinal,
              status: entry.status as HybridCcV1DatEntryFailureStatus,
              requiredChips: entry.requiredChips,
              diagnosticCount: entry.diagnosticCount,
            };
          }
          assertOk(
            "HybridCC converted native-level size",
            module._hybridcc_v1_dat_conversion_entry_native_size(
              handle,
              entryIndex,
              sizePointer,
            ),
          );
          const nativeByteCount = readU32(module, sizePointer);
          if (nativeByteCount === 0 || nativeByteCount !== entry.nativeByteCount) {
            throw new Error(`HybridCC DAT entry ${entry.entryOrdinal} has inconsistent native bytes.`);
          }
          const encoded = copyBytes(
            module,
            nativeByteCount,
            "HybridCC converted native-level copy",
            (...args) => module._hybridcc_v1_dat_conversion_copy_entry_native(
              handle,
              entryIndex,
              ...args,
            ),
          );
          return {
            entryOrdinal: entry.entryOrdinal,
            status: 0,
            requiredChips: entry.requiredChips,
            diagnosticCount: entry.diagnosticCount,
            nativeLevel: inspectHybridCcV1NativeLevel(module, encoded),
          };
        });
        return { fileStatus, entries, diagnostics };
      } finally {
        module._free(sizePointer);
      }
    } finally {
      if (handle !== 0) module._hybridcc_v1_dat_conversion_destroy(handle);
      module._free(filePointer);
      module._free(handlePointer);
    }
  });
}

export function isHybridCcV1ConvertedLevel(
  entry: HybridCcV1DatEntry,
): entry is HybridCcV1ConvertedLevel {
  return entry.status === 0;
}

export function hybridCcV1DatConversionDiagnostic(
  result: HybridCcV1DatConversionResult,
): string {
  const lines: string[] = [];
  if (result.fileStatus !== 0) {
    lines.push(`DAT file status ${result.fileStatus}.`);
  }
  for (const diagnostic of result.diagnostics) {
    const severity = ["note", "warning", "error"][diagnostic.severity]
      ?? `severity ${diagnostic.severity}`;
    const location = diagnostic.entryOrdinal === 0
      ? "file"
      : `entry ${diagnostic.entryOrdinal}${diagnostic.levelNumber === 0 ? "" : ` (level ${diagnostic.levelNumber})`}`;
    lines.push(`[${severity}] ${location}: ${diagnostic.code}: ${diagnostic.message}`);
  }
  if (lines.length === 0) {
    const failed = result.entries.filter((entry) => entry.status !== 0).length;
    return failed === 0
      ? "DAT conversion completed without diagnostics."
      : `DAT conversion rejected ${failed} entries without converter diagnostics.`;
  }
  return lines.join("\n");
}

class WasmHybridCcV1Engine implements HybridCcV1Engine {
  private disposed = false;
  private readonly stepPointer: Pointer;
  private readonly runtimePointer: Pointer;
  private readonly headerPointer: Pointer;
  private readonly presentationPointer: Pointer;
  private readonly invariantPointer: Pointer;

  constructor(
    private readonly module: HybridCcV1WasmModule,
    private readonly handle: Pointer,
  ) {
    const allocations: Pointer[] = [];
    try {
      this.stepPointer = allocate(
        module,
        HYBRIDCC_V1_RECORD_SIZES.stepResult,
        "HybridCC engine step record",
      );
      allocations.push(this.stepPointer);
      this.runtimePointer = allocate(
        module,
        HYBRIDCC_V1_RECORD_SIZES.runtime,
        "HybridCC engine runtime record",
      );
      allocations.push(this.runtimePointer);
      this.headerPointer = allocate(
        module,
        HYBRIDCC_V1_RECORD_SIZES.snapshotHeader,
        "HybridCC snapshot header record",
      );
      allocations.push(this.headerPointer);
      this.presentationPointer = allocate(
        module,
        HYBRIDCC_V1_RECORD_SIZES.presentation,
        "HybridCC presentation record",
      );
      allocations.push(this.presentationPointer);
      this.invariantPointer = allocate(module, 4, "HybridCC invariant record");
      allocations.push(this.invariantPointer);
    } catch (error) {
      for (const pointer of allocations.reverse()) module._free(pointer);
      throw error;
    }
  }

  runtime(): HybridCcV1Runtime {
    this.assertUsable();
    assertOk(
      "HybridCC runtime read",
      this.module._hybridcc_v1_engine_runtime(this.handle, this.runtimePointer),
    );
    return decodeRuntime(memoryView(this.module), this.runtimePointer);
  }

  snapshot(): HybridCcV1Snapshot {
    this.assertUsable();
    assertOk(
      "HybridCC snapshot capture",
      this.module._hybridcc_v1_engine_capture_snapshot(this.handle),
    );
    assertOk(
      "HybridCC snapshot header",
      this.module._hybridcc_v1_engine_snapshot_header(this.handle, this.headerPointer),
    );
    const header = decodeSnapshotHeader(memoryView(this.module), this.headerPointer);
    if (
      header.recordVersion !== HYBRIDCC_V1_ABI.snapshotRecordVersion
      || header.abiVersion !== HYBRIDCC_V1_ABI.version
      || header.ruleset.major !== HYBRIDCC_V1_ABI.ruleset.major
      || header.ruleset.minor !== HYBRIDCC_V1_ABI.ruleset.minor
      || header.ruleset.tweak !== HYBRIDCC_V1_ABI.ruleset.tweak
    ) {
      throw new Error("HybridCC snapshot header does not match the pinned v1 record contract.");
    }
    const expectedCellCount = header.width * header.height * header.depth;
    if (!Number.isSafeInteger(expectedCellCount) || expectedCellCount !== header.cellCount) {
      throw new Error("HybridCC snapshot dimensions and cell count disagree.");
    }

    const cells = copyRecords(
      this.module,
      this.handle,
      header.cellCount,
      HYBRIDCC_V1_RECORD_SIZES.cell,
      "HybridCC cell snapshot",
      this.module._hybridcc_v1_engine_copy_cells,
      decodeCell,
    );
    const actors = copyRecords(
      this.module,
      this.handle,
      header.actorCount,
      HYBRIDCC_V1_RECORD_SIZES.actor,
      "HybridCC actor snapshot",
      this.module._hybridcc_v1_engine_copy_actors,
      decodeActor,
    );
    const inventory = copyRecords(
      this.module,
      this.handle,
      header.inventoryCount,
      HYBRIDCC_V1_RECORD_SIZES.inventory,
      "HybridCC inventory snapshot",
      this.module._hybridcc_v1_engine_copy_inventory,
      decodeInventory,
    );
    const signals = copyRecords(
      this.module,
      this.handle,
      header.signalCount,
      HYBRIDCC_V1_RECORD_SIZES.signal,
      "HybridCC signal snapshot",
      this.module._hybridcc_v1_engine_copy_signals,
      decodeSignal,
    );
    const events = copyRecords(
      this.module,
      this.handle,
      header.eventCount,
      HYBRIDCC_V1_RECORD_SIZES.event,
      "HybridCC event snapshot",
      this.module._hybridcc_v1_engine_copy_events,
      decodeEvent,
    );
    assertOk(
      "HybridCC presentation snapshot",
      this.module._hybridcc_v1_engine_copy_presentation(
        this.handle,
        this.presentationPointer,
      ),
    );
    const presentation = decodePresentation(
      memoryView(this.module),
      this.presentationPointer,
    );
    if (
      presentation.recordVersion !== HYBRIDCC_V1_ABI.snapshotRecordVersion
      || presentation.samplesPerSecond !== HYBRIDCC_V1_ABI.presentationSamplesPerSecond
    ) {
      throw new Error("HybridCC presentation record does not match the pinned v1 contract.");
    }
    return { header, cells, actors, inventory, signals, events, presentation };
  }

  logicStep(input: number): HybridCcV1StepResult {
    this.assertUsable();
    assertU32("HybridCC logic-step input", input);
    if (input > HYBRIDCC_V1_INPUT.westNorth) {
      throw new RangeError(`HybridCC logic-step input ${input} is not defined by ABI v1.`);
    }
    const operationStatus = this.module._hybridcc_v1_engine_logic_step(
      this.handle,
      input,
      this.stepPointer,
    );
    if (
      operationStatus !== STATUS_OK
      && (operationStatus < FIRST_STEP_OPERATION_STATUS
        || operationStatus > LAST_STEP_OPERATION_STATUS)
    ) {
      throw new HybridCcV1BridgeError("HybridCC logic step", operationStatus);
    }
    const view = memoryView(this.module);
    return {
      operationStatus,
      stepStatus: view.getUint32(this.stepPointer, true),
      stateChanged: bool32(view, this.stepPointer + 4),
      runtime: decodeRuntime(view, this.stepPointer + 8),
    };
  }

  invariantStatus(): number {
    this.assertUsable();
    assertOk(
      "HybridCC invariant diagnostic",
      this.module._hybridcc_v1_engine_invariant_status(
        this.handle,
        this.invariantPointer,
      ),
    );
    return readU32(this.module, this.invariantPointer);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.module._hybridcc_v1_engine_destroy(this.handle);
    this.module._free(this.invariantPointer);
    this.module._free(this.presentationPointer);
    this.module._free(this.headerPointer);
    this.module._free(this.runtimePointer);
    this.module._free(this.stepPointer);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("HybridCC v1 engine has been disposed.");
  }
}

function nativeLevelBytes(level: HybridCcV1NativeLevel | Uint8Array): Uint8Array {
  return level instanceof Uint8Array ? level : level.encoded;
}

export function createHybridCcV1Engine(
  module: HybridCcV1WasmModule,
  level: HybridCcV1NativeLevel | Uint8Array,
  randomSeed: number,
): HybridCcV1Engine {
  assertAbi(module);
  const bytes = nativeLevelBytes(level);
  assertByteLength("HybridCC engine creation", bytes, MAXIMUM_NATIVE_LEVEL_INPUT_BYTES);
  assertU32("HybridCC random seed", randomSeed);
  return withInputBytes(module, bytes, "HybridCC engine native input", (inputPointer) => {
    const handlePointer = allocate(module, 4, "HybridCC engine handle");
    const diagnosticPointer = allocate(
      module,
      HYBRIDCC_V1_RECORD_SIZES.engineCreateDiagnostic,
      "HybridCC engine diagnostic",
    );
    let handle = 0;
    try {
      writeU32(module, handlePointer, 0);
      const status = module._hybridcc_v1_engine_create_detailed(
        inputPointer,
        bytes.byteLength,
        randomSeed,
        handlePointer,
        diagnosticPointer,
      );
      const diagnostic = decodeEngineCreateDiagnostic(
        memoryView(module),
        diagnosticPointer,
      );
      if (status !== STATUS_OK) {
        throw new HybridCcV1BridgeError("HybridCC engine creation", status, diagnostic);
      }
      handle = readU32(module, handlePointer);
      if (handle === 0) {
        throw new Error("HybridCC engine creation returned an empty handle.");
      }
      const engine = new WasmHybridCcV1Engine(module, handle);
      handle = 0;
      return engine;
    } finally {
      if (handle !== 0) module._hybridcc_v1_engine_destroy(handle);
      module._free(diagnosticPointer);
      module._free(handlePointer);
    }
  });
}

function decodeReplayCheckpoint(
  view: DataView,
  offset: number,
): HybridCcV1ReplayCheckpoint {
  return {
    stateHash: view.getBigUint64(offset, true),
    eventHash: view.getBigUint64(offset + 8, true),
    presentationHash: view.getBigUint64(offset + 16, true),
  };
}

function decodeReplayChange(view: DataView, offset: number): HybridCcV1ReplayChange {
  return {
    logicBoundary: view.getBigUint64(offset, true),
    input: view.getUint32(offset + 8, true),
  };
}

function decodeReplayHeader(view: DataView, offset: number): HybridCcV1ReplayHeader {
  return {
    ruleset: {
      major: view.getUint32(offset, true),
      minor: view.getUint32(offset + 4, true),
      tweak: view.getUint32(offset + 8, true),
    },
    levelContentHash: new Uint8Array(
      view.buffer,
      view.byteOffset + offset + 12,
      32,
    ).slice(),
    randomSeed: view.getUint32(offset + 44, true),
    finalBoundary: view.getBigUint64(offset + 48, true),
    expectedOutcome: decodeOutcome(view, offset + 56),
    checkpointMode: view.getUint32(offset + 88, true),
    changeCount: view.getUint32(offset + 92, true),
    checkpointCount: view.getUint32(offset + 96, true),
    encodedByteCount: view.getUint32(offset + 100, true),
  };
}

function decodeReplayDivergence(
  view: DataView,
  offset: number,
): HybridCcV1ReplayDivergence {
  return {
    logicBoundary: view.getBigUint64(offset, true),
    differingStreams: view.getUint32(offset + 8, true),
    expected: decodeReplayCheckpoint(view, offset + 12),
    actual: decodeReplayCheckpoint(view, offset + 36),
  };
}

function detachReplay(
  module: HybridCcV1WasmModule,
  replay: Pointer,
): HybridCcV1Replay {
  const headerPointer = allocate(
    module,
    HYBRIDCC_V1_RECORD_SIZES.replayHeader,
    "HybridCC replay header",
  );
  const sizePointer = allocate(module, 4, "HybridCC replay encoded size");
  try {
    assertOk(
      "HybridCC replay header",
      module._hybridcc_v1_replay_header(replay, headerPointer),
    );
    const header = decodeReplayHeader(memoryView(module), headerPointer);
    if (header.finalBoundary > BigInt(MAXIMUM_REPLAY_BOUNDARIES)) {
      throw new Error("HybridCC replay header exceeds the pinned boundary limit.");
    }
    const changes = copyRecords(
      module,
      replay,
      header.changeCount,
      HYBRIDCC_V1_RECORD_SIZES.replayChange,
      "HybridCC replay changes",
      module._hybridcc_v1_replay_copy_changes,
      decodeReplayChange,
    );
    const checkpoints = copyRecords(
      module,
      replay,
      header.checkpointCount,
      HYBRIDCC_V1_RECORD_SIZES.replayCheckpoint,
      "HybridCC replay checkpoints",
      module._hybridcc_v1_replay_copy_checkpoints,
      decodeReplayCheckpoint,
    );
    assertOk(
      "HybridCC replay encoded size",
      module._hybridcc_v1_replay_encoded_size(replay, sizePointer),
    );
    const encodedByteCount = readU32(module, sizePointer);
    if (encodedByteCount !== header.encodedByteCount) {
      throw new Error("HybridCC replay header and encoded-size query disagree.");
    }
    const encoded = copyBytes(
      module,
      encodedByteCount,
      "HybridCC replay encoded copy",
      (...args) => module._hybridcc_v1_replay_copy_encoded(replay, ...args),
    );
    return { header, changes, checkpoints, encoded };
  } finally {
    module._free(sizePointer);
    module._free(headerPointer);
  }
}

function withDecodedReplay<T>(
  module: HybridCcV1WasmModule,
  replayBytes: Uint8Array,
  callback: (replay: Pointer) => T,
): T {
  assertByteLength("HybridCC replay decode", replayBytes, MAXIMUM_REPLAY_INPUT_BYTES);
  return withInputBytes(module, replayBytes, "HybridCC replay input", (inputPointer) => {
    const handlePointer = allocate(module, 4, "HybridCC replay handle");
    let handle = 0;
    try {
      writeU32(module, handlePointer, 0);
      assertOk(
        "HybridCC replay decode",
        module._hybridcc_v1_replay_decode(
          inputPointer,
          replayBytes.byteLength,
          handlePointer,
        ),
      );
      handle = readU32(module, handlePointer);
      if (handle === 0) throw new Error("HybridCC replay decode returned an empty handle.");
      return callback(handle);
    } finally {
      if (handle !== 0) module._hybridcc_v1_replay_destroy(handle);
      module._free(handlePointer);
    }
  });
}

export function decodeHybridCcV1Replay(
  module: HybridCcV1WasmModule,
  replayBytes: Uint8Array,
): HybridCcV1Replay {
  assertAbi(module);
  return withDecodedReplay(module, replayBytes, (replay) => detachReplay(module, replay));
}

function compileReplay(
  module: HybridCcV1WasmModule,
  operation: string,
  compiler: HybridCcV1WasmModule["_hybridcc_v1_replay_compile_run"],
  level: HybridCcV1NativeLevel | Uint8Array,
  randomSeed: number,
  denseInputs: Uint8Array,
  checkpointMode: number,
): HybridCcV1Replay {
  assertAbi(module);
  const nativeBytes = nativeLevelBytes(level);
  assertByteLength(operation, nativeBytes, MAXIMUM_NATIVE_LEVEL_INPUT_BYTES);
  assertU32("HybridCC replay random seed", randomSeed);
  if (denseInputs.byteLength > MAXIMUM_REPLAY_BOUNDARIES) {
    throw new RangeError(`${operation} exceeds ${MAXIMUM_REPLAY_BOUNDARIES} input boundaries.`);
  }
  if (checkpointMode !== 0 && checkpointMode !== 1) {
    throw new RangeError("HybridCC replay checkpoint mode must be 0 or 1.");
  }
  return withInputBytes(module, nativeBytes, "HybridCC replay native input", (nativePointer) => (
    withInputBytes(module, denseInputs, "HybridCC replay dense inputs", (inputsPointer) => {
      const handlePointer = allocate(module, 4, "HybridCC compiled replay handle");
      let handle = 0;
      try {
        writeU32(module, handlePointer, 0);
        assertOk(
          operation,
          compiler(
            nativePointer,
            nativeBytes.byteLength,
            randomSeed,
            inputsPointer,
            denseInputs.byteLength,
            checkpointMode,
            handlePointer,
          ),
        );
        handle = readU32(module, handlePointer);
        if (handle === 0) throw new Error(`${operation} returned an empty handle.`);
        return detachReplay(module, handle);
      } finally {
        if (handle !== 0) module._hybridcc_v1_replay_destroy(handle);
        module._free(handlePointer);
      }
    })
  ));
}

export function compileHybridCcV1Run(
  module: HybridCcV1WasmModule,
  level: HybridCcV1NativeLevel | Uint8Array,
  randomSeed: number,
  denseInputs: Uint8Array,
  checkpointMode: number,
): HybridCcV1Replay {
  return compileReplay(
    module,
    "HybridCC run replay compile",
    module._hybridcc_v1_replay_compile_run,
    level,
    randomSeed,
    denseInputs,
    checkpointMode,
  );
}

export function compileHybridCcV1Solution(
  module: HybridCcV1WasmModule,
  level: HybridCcV1NativeLevel | Uint8Array,
  randomSeed: number,
  denseInputs: Uint8Array,
  checkpointMode: number,
): HybridCcV1Replay {
  return compileReplay(
    module,
    "HybridCC solution replay compile",
    module._hybridcc_v1_replay_compile_solution,
    level,
    randomSeed,
    denseInputs,
    checkpointMode,
  );
}

export function verifyHybridCcV1Replay(
  module: HybridCcV1WasmModule,
  level: HybridCcV1NativeLevel | Uint8Array,
  replayBytes: Uint8Array,
): HybridCcV1ReplayVerification {
  assertAbi(module);
  const nativeBytes = nativeLevelBytes(level);
  assertByteLength(
    "HybridCC replay verification",
    nativeBytes,
    MAXIMUM_NATIVE_LEVEL_INPUT_BYTES,
  );
  return withDecodedReplay(module, replayBytes, (replay) => (
    withInputBytes(module, nativeBytes, "HybridCC replay verification level", (nativePointer) => {
      const verificationPointer = allocate(
        module,
        HYBRIDCC_V1_RECORD_SIZES.replayVerification,
        "HybridCC replay verification record",
      );
      try {
        assertOk(
          "HybridCC replay verification",
          module._hybridcc_v1_replay_verify(
            nativePointer,
            nativeBytes.byteLength,
            replay,
            verificationPointer,
          ),
        );
        const view = memoryView(module);
        const hasDivergence = bool32(view, verificationPointer + 36);
        return {
          verifyStatus: view.getUint32(verificationPointer, true),
          actualOutcome: decodeOutcome(view, verificationPointer + 4),
          hasDivergence,
          divergence: hasDivergence
            ? decodeReplayDivergence(view, verificationPointer + 40)
            : null,
        };
      } finally {
        module._free(verificationPointer);
      }
    })
  ));
}
