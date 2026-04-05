export function estimateSerializablePayloadBytes(value: unknown, seen = new Set<object>()): number {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "boolean") {
    return 4;
  }

  if (typeof value === "number") {
    return 8;
  }

  if (typeof value === "string") {
    return value.length * 2;
  }

  if (typeof value !== "object") {
    return 0;
  }

  if (seen.has(value)) {
    return 0;
  }

  seen.add(value);

  if (ArrayBuffer.isView(value)) {
    return value.byteLength;
  }

  if (value instanceof ArrayBuffer) {
    return value.byteLength;
  }

  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + estimateSerializablePayloadBytes(entry, seen), 0);
  }

  return Object.entries(value as Record<string, unknown>).reduce(
    (total, [key, entry]) => total + key.length * 2 + estimateSerializablePayloadBytes(entry, seen),
    0,
  );
}
