export function readUint8(data: Uint8Array, offset: number): number {
  if (offset >= data.length) {
    throw new Error("unexpected end of file while reading uint8");
  }
  return data[offset]!;
}

export function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error("unexpected end of file while reading uint16");
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

export function readUint32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error("unexpected end of file while reading uint32");
  }
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}

export function decodeLatin1(data: Uint8Array): string {
  return Array.from(data, (value) => String.fromCharCode(value)).join("");
}

export function encodeLatin1(text: string): number[] {
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (code > 0xff) {
      throw new Error(`non-Latin1 character in solution payload: ${char}`);
    }
    return code;
  });
}

export function trimNulls(value: string): string {
  return value.replace(/\0+$/g, "");
}
