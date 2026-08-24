export interface HybridCcElement {
  id: number;
  color: number;
  direction: number;
  rule: number;
  channel: number;
  count: number;
}

export interface HybridCcNativeCell {
  terrain: HybridCcElement;
  device: HybridCcElement;
  pickup: HybridCcElement;
  actor: HybridCcElement;
  panelEdges: number;
  iceCornerEdges: number;
  /** Runtime-only ABI v2 facts. Canonical native-map cells omit these fields. */
  dynamicState?: number;
  signal?: number;
  dpadDirection?: number;
  dpadSignal?: number;
}

export interface HybridCcNativeLevel {
  width: number;
  height: number;
  depth: number;
  number: number;
  requiredChips: number;
  timeLimitSeconds: number;
  title: string;
  author: string;
  hint: string;
  password: string;
  actorOrder: number[];
  cells: HybridCcNativeCell[];
  encoded: Uint8Array;
}

const NATIVE_LEVEL_MAGIC = [0x48, 0x43, 0x4c, 0x56] as const;
const NATIVE_LEVEL_VERSION = 1;
const MAXIMUM_LOGICAL_CELLS = 65_536;

class NativeLevelReader {
  private offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  u8(): number {
    this.require(1);
    return this.bytes[this.offset++]!;
  }

  u16(): number {
    this.require(2);
    const value = this.bytes[this.offset]! | (this.bytes[this.offset + 1]! << 8);
    this.offset += 2;
    return value;
  }

  text(): string {
    const size = this.u16();
    this.require(size);
    const value = new TextDecoder("utf-8", { fatal: true }).decode(
      this.bytes.subarray(this.offset, this.offset + size),
    );
    this.offset += size;
    return value;
  }

  assertFinished(): void {
    if (this.offset !== this.bytes.length) {
      throw new Error("HybridCC native level has trailing bytes.");
    }
  }

  private require(size: number): void {
    if (this.bytes.length - this.offset < size) {
      throw new Error("HybridCC native level is truncated.");
    }
  }
}

function decodeElement(reader: NativeLevelReader): HybridCcElement {
  const element = {
    id: reader.u8(),
    color: reader.u8(),
    direction: reader.u8(),
    rule: reader.u8(),
    channel: reader.u16(),
    count: reader.u16(),
  };

  if (element.id > 42 || element.color > 17 || element.direction > 4 || element.rule > 22) {
    throw new Error("HybridCC native level contains an invalid element enum.");
  }
  return element;
}

export function decodeHybridCcNativeLevel(encoded: Uint8Array): HybridCcNativeLevel {
  const reader = new NativeLevelReader(encoded);
  for (const expected of NATIVE_LEVEL_MAGIC) {
    if (reader.u8() !== expected) {
      throw new Error("HybridCC native level has an invalid magic value.");
    }
  }

  if (reader.u16() !== NATIVE_LEVEL_VERSION) {
    throw new Error("HybridCC native level uses an unsupported version.");
  }

  const width = reader.u16();
  const height = reader.u16();
  const depth = reader.u16();
  const number = reader.u16();
  const requiredChips = reader.u16();
  const timeLimitSeconds = reader.u16();
  const title = reader.text();
  const author = reader.text();
  const hint = reader.text();
  const password = reader.text();
  const cellCount = width * height * depth;

  if (width === 0 || height === 0 || depth === 0 || cellCount > MAXIMUM_LOGICAL_CELLS) {
    throw new Error("HybridCC native level has invalid dimensions.");
  }

  const actorOrderCount = reader.u16();
  const actorOrder = Array.from({ length: actorOrderCount }, () => reader.u16());
  const cells = Array.from({ length: cellCount }, (): HybridCcNativeCell => ({
    terrain: decodeElement(reader),
    device: decodeElement(reader),
    pickup: decodeElement(reader),
    actor: decodeElement(reader),
    panelEdges: reader.u8(),
    iceCornerEdges: reader.u8(),
  }));
  reader.assertFinished();

  return {
    width,
    height,
    depth,
    number,
    requiredChips,
    timeLimitSeconds,
    title,
    author,
    hint,
    password,
    actorOrder,
    cells,
    encoded: new Uint8Array(encoded),
  };
}
