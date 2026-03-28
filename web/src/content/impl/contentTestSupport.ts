function encodeUint16(value: number): number[] {
  return [value & 0xff, (value >> 8) & 0xff];
}

export function encodeDatPassword(password: string): number[] {
  return Array.from(password, (char) => char.charCodeAt(0) ^ 0x99).concat(0);
}

export function encodeLatin1Text(value: string): number[] {
  return Array.from(value, (char) => char.charCodeAt(0)).concat(0);
}

export function encodeDatMetadataField(id: number, payload: readonly number[]): number[] {
  return [id, payload.length, ...payload];
}

export function buildLegacyDatLevelData(options: {
  author?: string;
  chipsRequired?: number;
  extraMetadata?: readonly number[];
  hint?: string;
  lower?: readonly number[];
  name?: string;
  number?: number;
  password?: string;
  timeLimitSeconds?: number;
  upper?: readonly number[];
} = {}): Uint8Array {
  const upper = [...(options.upper ?? [0x11, 0x22, 0x33, 0x44])];
  const lower = [...(options.lower ?? [0x55, 0x66, 0x77, 0x88])];
  const metadata = [
    encodeDatMetadataField(3, encodeLatin1Text(options.name ?? "Gameplay Hash")),
    encodeDatMetadataField(6, encodeDatPassword(options.password ?? "ABCD")),
    encodeDatMetadataField(9, encodeLatin1Text(options.author ?? "Tester")),
    encodeDatMetadataField(7, encodeLatin1Text(options.hint ?? "This hint should not matter.")),
    ...(options.extraMetadata ? [options.extraMetadata] : []),
  ].flat();

  return Uint8Array.from([
    ...encodeUint16(options.number ?? 1),
    ...encodeUint16(options.timeLimitSeconds ?? 250),
    ...encodeUint16(options.chipsRequired ?? 4),
    0,
    0,
    ...encodeUint16(upper.length),
    ...upper,
    ...encodeUint16(lower.length),
    ...lower,
    ...encodeUint16(metadata.length),
    ...metadata,
  ]);
}

export function buildSyntheticMsDatLevel(
  number: number,
  name: string,
  password = "ABCD",
  upperLayer = Uint8Array.from([1]),
): Uint8Array {
  const lowerLayer = Uint8Array.from([]);
  const metadata = Uint8Array.from([
    3,
    name.length,
    ...Array.from(name, (char) => char.charCodeAt(0)),
    6,
    password.length,
    ...Array.from(password, (char) => char.charCodeAt(0) ^ 0x99),
  ]);

  return Uint8Array.from([
    number,
    0,
    10,
    0,
    0,
    0,
    0,
    0,
    upperLayer.length,
    0,
    ...upperLayer,
    lowerLayer.length,
    0,
    ...lowerLayer,
    metadata.length,
    0,
    ...metadata,
  ]);
}

export function buildSyntheticMsDatFile(levels: Uint8Array[]): Uint8Array {
  const bytes = [0xac, 0xaa, 0x02, 0x00, levels.length, 0x00];
  for (const level of levels) {
    bytes.push(level.length & 0xff, (level.length >> 8) & 0xff, ...level);
  }
  return Uint8Array.from(bytes);
}
