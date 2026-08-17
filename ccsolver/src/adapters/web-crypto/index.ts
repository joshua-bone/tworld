import type { CanonicalJson } from "../../domain/canonicalJson.js";
import type { Sha256Port } from "../../ports/Sha256Port.js";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export class WebCryptoSha256 implements Sha256Port {
  constructor(
    private readonly cryptoProvider: Pick<Crypto, "subtle"> = globalThis.crypto,
    private readonly encoder: Pick<TextEncoder, "encode"> = new TextEncoder(),
  ) {}

  async digestBytes(value: Uint8Array): Promise<Uint8Array> {
    const digest = await this.cryptoProvider.subtle.digest("SHA-256", toArrayBuffer(value));
    return new Uint8Array(digest);
  }

  async digestUtf8(value: CanonicalJson): Promise<Uint8Array> {
    return this.digestBytes(this.encoder.encode(value));
  }
}
