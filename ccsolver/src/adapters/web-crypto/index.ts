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

  async digestUtf8(value: CanonicalJson): Promise<Uint8Array> {
    const bytes = this.encoder.encode(value);
    const digest = await this.cryptoProvider.subtle.digest("SHA-256", toArrayBuffer(bytes));
    return new Uint8Array(digest);
  }
}
