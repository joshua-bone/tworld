import type { CanonicalJson } from "../domain/canonicalJson.js";

export interface Sha256Port {
  digestUtf8(value: CanonicalJson): Promise<Uint8Array>;
}
