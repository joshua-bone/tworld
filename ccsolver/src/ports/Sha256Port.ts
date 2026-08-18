import type { CanonicalJson } from "../domain/canonicalJson.js";

export interface Sha256Port {
  digestBytes(value: Uint8Array): Promise<Uint8Array>;
  digestUtf8(value: CanonicalJson): Promise<Uint8Array>;
}
