import type { SessionDigest } from "@undo-runtime/api/sessionDigest";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";

type CanonicalDigestValue =
  | null
  | boolean
  | number
  | string
  | CanonicalDigestValue[]
  | { [key: string]: CanonicalDigestValue };

function canonicalizeNumber(value: number): CanonicalDigestValue {
  if (Object.is(value, -0)) {
    return {
      $type: "number",
      value: "-0",
    };
  }

  if (Number.isFinite(value)) {
    return value;
  }

  return {
    $type: "number",
    value: String(value),
  };
}

function canonicalizeMapEntryKey(value: unknown): string {
  return JSON.stringify(canonicalizeDigestValue(value));
}

function canonicalizeDigestValue(value: unknown): CanonicalDigestValue {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "boolean":
    case "string":
      return value;
    case "number":
      return canonicalizeNumber(value);
    case "bigint":
      return {
        $type: "bigint",
        value: value.toString(),
      };
    case "undefined":
      return {
        $type: "undefined",
      };
    case "object":
      break;
    default:
      throw new Error(`unsupported undo digest value: ${typeof value}`);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeDigestValue(entry));
  }

  if (value instanceof Map) {
    return {
      $type: "map",
      entries: Array.from(value.entries())
        .sort(([left], [right]) => canonicalizeMapEntryKey(left).localeCompare(canonicalizeMapEntryKey(right)))
        .map(([key, entryValue]) => ({
          key: canonicalizeDigestValue(key),
          value: canonicalizeDigestValue(entryValue),
        })),
    };
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entries.map(([key, entryValue]) => [key, canonicalizeDigestValue(entryValue)]));
}

function digestUndoValue(value: unknown): SessionDigest {
  return JSON.stringify(canonicalizeDigestValue(value)) as SessionDigest;
}

export function digestMsInteractiveSession(session: MsInteractiveSessionState): SessionDigest {
  return digestUndoValue(session);
}

export function digestLynxInteractiveSession(session: LynxInteractiveSessionState): SessionDigest {
  return digestUndoValue(session);
}

export function msInteractiveSessionsEqual(left: MsInteractiveSessionState, right: MsInteractiveSessionState): boolean {
  return digestMsInteractiveSession(left) === digestMsInteractiveSession(right);
}

export function lynxInteractiveSessionsEqual(left: LynxInteractiveSessionState, right: LynxInteractiveSessionState): boolean {
  return digestLynxInteractiveSession(left) === digestLynxInteractiveSession(right);
}
