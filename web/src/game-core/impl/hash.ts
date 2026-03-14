import type { EngineMapCell } from "@game-core/api/model";

export function hashByte(hash: bigint, value: number): bigint {
  return ((hash ^ BigInt(value & 0xff)) * 1099511628211n) & 0xffffffffffffffffn;
}

export function hashInt(hash: bigint, value: number): bigint {
  let next = hash;
  for (let shift = 0; shift < 32; shift += 8) {
    next = hashByte(next, (value >> shift) & 0xff);
  }
  return next;
}

export function hashHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

export function mapHash(cells: readonly EngineMapCell[]): string {
  let hash = 1469598103934665603n;
  for (const cell of cells) {
    hash = hashByte(hash, cell.top.id);
    hash = hashByte(hash, cell.top.state);
    hash = hashByte(hash, cell.bottom.id);
    hash = hashByte(hash, cell.bottom.state);
  }
  return hashHex(hash);
}
