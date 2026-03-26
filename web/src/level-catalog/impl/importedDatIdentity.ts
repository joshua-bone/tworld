export const IMPORT_RULESETS = ["MS", "Lynx"] as const;

export function stripImportedDatExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/u, "");
}

export function importedSeriesFile(
  slotName: string,
  ruleset: (typeof IMPORT_RULESETS)[number],
): string {
  const baseName = stripImportedDatExtension(slotName) || slotName;
  return `${baseName} (${ruleset})`;
}

export function sanitizeImportedDatSlotName(value: string): string {
  const trimmed = value.trim();
  const sanitized = trimmed.replace(/[\\/]/gu, "-").replace(/\s+/gu, " ");
  const normalized = sanitized === "" ? "Imported.dat" : sanitized;
  return /\.dat$/iu.test(normalized) ? normalized : `${normalized}.dat`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

export async function computeDatContentHash(datBytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", toArrayBuffer(datBytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
