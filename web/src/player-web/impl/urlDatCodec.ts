function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return fromBase64(padded);
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    totalLength += value.length;
  }

  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

async function transformBytes(
  bytes: Uint8Array,
  streamFactory: () => CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const stream = new Blob([buffer]).stream().pipeThrough(streamFactory());
  return readStream(stream);
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return transformBytes(bytes, () => new CompressionStream("gzip"));
}

export async function gunzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return transformBytes(bytes, () => new DecompressionStream("gzip"));
}

export async function encodeDatUrlPayload(datBytes: Uint8Array): Promise<string> {
  return toBase64Url(await gzipBytes(datBytes));
}

export async function decodeDatUrlPayload(payload: string): Promise<Uint8Array> {
  return gunzipBytes(fromBase64Url(payload));
}
