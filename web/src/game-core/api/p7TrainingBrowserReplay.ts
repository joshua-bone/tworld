export const P7_TRAINING_MAX_BROWSER_INPUTS = 32_768;
export const P7_TRAINING_MAX_BROWSER_REPLAY_BYTES = 2 * 1024 * 1024;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const NATIVE_REPLAY_TICK_MASK = 0x7f_ffff;
const PORTABLE_INPUT_CODES = new Set([0, 1, 2, 3, 4, 6, 8, 9, 12]);

export type P7TrainingBrowserTargetV1 = "ms" | "lynx";
export type P7TrainingBrowserVariantIdV1 = "raw-ms" | "raw-lynx" | "portable";
export type P7TrainingBrowserTransportV1 =
  | "native-replay-pulses"
  | "manual-held-schedule";

export interface P7TrainingBrowserContentReferenceV1 {
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
}

export interface P7TrainingBrowserScheduledInputV1 {
  readonly ordinal: number;
  readonly nativeTick: number;
  readonly inputCode: number;
  readonly modifierMask: 0;
}

export interface P7TrainingBrowserNativeDecisionV1
  extends P7TrainingBrowserScheduledInputV1 {
  /** Exact unsigned TWS action word; high bits are retained as raw evidence. */
  readonly encodedWhen: number;
}

export interface P7TrainingBrowserInitializationV1 {
  readonly flags: number;
  readonly randomSeed: number;
  readonly randomSlideDirection: number;
  readonly stepping: number;
  readonly bestTimeTicks: number;
}

interface P7TrainingBrowserReplayBaseV1 {
  readonly artifact: "ccsolver-p7b-browser-replay";
  readonly version: 1;
  readonly variantId: P7TrainingBrowserVariantIdV1;
  readonly target: P7TrainingBrowserTargetV1;
  readonly sourceReplayContent: P7TrainingBrowserContentReferenceV1;
  readonly nativeTickRateHz: 20;
  readonly terminalNativeTick: number;
  readonly initialization: P7TrainingBrowserInitializationV1;
}

export interface P7TrainingNativeBrowserReplayV1 extends P7TrainingBrowserReplayBaseV1 {
  readonly transport: "native-replay-pulses";
  readonly variantId: "raw-ms" | "raw-lynx";
  readonly decisions: readonly P7TrainingBrowserNativeDecisionV1[];
}

export interface P7TrainingManualHeldBrowserReplayV1 extends P7TrainingBrowserReplayBaseV1 {
  readonly transport: "manual-held-schedule";
  readonly variantId: "portable";
  readonly changes: readonly P7TrainingBrowserScheduledInputV1[];
}

export type P7TrainingBrowserReplayV1 =
  | P7TrainingNativeBrowserReplayV1
  | P7TrainingManualHeldBrowserReplayV1;

function record(value: unknown, label: string): Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  const result = record(value, label);
  const actual = Object.keys(result).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new Error(`${label} has an unsupported shape`);
  return result;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a safe integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function contentReference(
  value: unknown,
  label: string,
): P7TrainingBrowserContentReferenceV1 {
  const source = exactKeys(value, ["byteLength", "digest"], label);
  if (typeof source.digest !== "string" || !SHA256_PATTERN.test(source.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  return {
    digest: source.digest as `sha256:${string}`,
    byteLength: integer(source.byteLength, 0, 64 * 1024 * 1024, `${label} byte length`),
  };
}

function scheduledInputs(input: {
  readonly value: unknown;
  readonly terminalNativeTick: number;
  readonly strictlyIncreasing: boolean;
  readonly portable: boolean;
  readonly preserveNativeEncoding: true;
  readonly label: string;
}): P7TrainingBrowserNativeDecisionV1[];
function scheduledInputs(input: {
  readonly value: unknown;
  readonly terminalNativeTick: number;
  readonly strictlyIncreasing: boolean;
  readonly portable: boolean;
  readonly preserveNativeEncoding: false;
  readonly label: string;
}): P7TrainingBrowserScheduledInputV1[];
function scheduledInputs(input: {
  readonly value: unknown;
  readonly terminalNativeTick: number;
  readonly strictlyIncreasing: boolean;
  readonly portable: boolean;
  readonly preserveNativeEncoding: boolean;
  readonly label: string;
}): Array<P7TrainingBrowserScheduledInputV1 | P7TrainingBrowserNativeDecisionV1> {
  if (!Array.isArray(input.value) || input.value.length > P7_TRAINING_MAX_BROWSER_INPUTS) {
    throw new Error(`${input.label} exceeds its input-count cap`);
  }
  let previousTick = -1;
  let previousInputCode: number | null = null;
  const copied = input.value.map((entry, ordinal):
    P7TrainingBrowserScheduledInputV1 | P7TrainingBrowserNativeDecisionV1 => {
    const scheduled = exactKeys(
      entry,
      input.preserveNativeEncoding
        ? ["encodedWhen", "inputCode", "modifierMask", "nativeTick", "ordinal"]
        : ["inputCode", "modifierMask", "nativeTick", "ordinal"],
      `${input.label} ${ordinal}`,
    );
    if (scheduled.ordinal !== ordinal) {
      throw new Error(`${input.label} ordinals must be contiguous from zero`);
    }
    const nativeTick = integer(
      scheduled.nativeTick,
      0,
      input.terminalNativeTick - 1,
      `${input.label} ${ordinal} native tick`,
    );
    if (input.strictlyIncreasing ? nativeTick <= previousTick : nativeTick < previousTick) {
      throw new Error(`${input.label} native ticks are not ordered`);
    }
    previousTick = nativeTick;
    if (scheduled.modifierMask !== 0) {
      throw new Error(`${input.label} modifier mask is unsupported`);
    }
    const inputCode = integer(
      scheduled.inputCode,
      0,
      0xffff_ffff,
      `${input.label} ${ordinal} input code`,
    );
    if (input.portable && !PORTABLE_INPUT_CODES.has(inputCode)) {
      throw new Error(`${input.label} input code is not a canonical portable packet`);
    }
    if (input.portable && inputCode === previousInputCode) {
      throw new Error(`${input.label} must not repeat the held input packet`);
    }
    previousInputCode = inputCode;
    if (!input.preserveNativeEncoding) {
      return { ordinal, nativeTick, inputCode, modifierMask: 0 as const };
    }
    const encodedWhen = integer(
      scheduled.encodedWhen,
      0,
      Number.MAX_SAFE_INTEGER,
      `${input.label} ${ordinal} encoded action word`,
    );
    if ((encodedWhen % (NATIVE_REPLAY_TICK_MASK + 1)) !== nativeTick) {
      throw new Error(`${input.label} encoded action word does not match its native tick`);
    }
    return { ordinal, nativeTick, encodedWhen, inputCode, modifierMask: 0 as const };
  });
  if (input.portable && (copied.length === 0 || copied[0]!.inputCode === 0)) {
    throw new Error(`${input.label} must begin with a nonzero input packet`);
  }
  return copied;
}

declare const p7TrainingBrowserCanonicalJsonBrand: unique symbol;

export type P7TrainingBrowserCanonicalJsonV1 = string & {
  readonly [p7TrainingBrowserCanonicalJsonBrand]: "P7TrainingBrowserCanonicalJsonV1";
};

function canonicalScheduledInput(
  input: P7TrainingBrowserScheduledInputV1 | P7TrainingBrowserNativeDecisionV1,
): Record<string, number> {
  const common = {
    inputCode: input.inputCode,
    modifierMask: input.modifierMask,
    nativeTick: input.nativeTick,
    ordinal: input.ordinal,
  };
  return "encodedWhen" in input
    ? { encodedWhen: input.encodedWhen, ...common }
    : common;
}

function canonicalReplayValue(replay: P7TrainingBrowserReplayV1): Record<string, unknown> {
  const common = {
    initialization: {
      bestTimeTicks: replay.initialization.bestTimeTicks,
      flags: replay.initialization.flags,
      randomSeed: replay.initialization.randomSeed,
      randomSlideDirection: replay.initialization.randomSlideDirection,
      stepping: replay.initialization.stepping,
    },
    nativeTickRateHz: replay.nativeTickRateHz,
    sourceReplayContent: {
      byteLength: replay.sourceReplayContent.byteLength,
      digest: replay.sourceReplayContent.digest,
    },
    target: replay.target,
    terminalNativeTick: replay.terminalNativeTick,
    transport: replay.transport,
    variantId: replay.variantId,
    version: replay.version,
  };
  return replay.transport === "native-replay-pulses"
    ? {
        artifact: replay.artifact,
        decisions: replay.decisions.map(canonicalScheduledInput),
        ...common,
      }
    : {
        artifact: replay.artifact,
        changes: replay.changes.map(canonicalScheduledInput),
        ...common,
      };
}

function encodedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/** Canonicalizes only after applying the exact browser replay schema. */
export function canonicalizeP7TrainingBrowserReplay(
  value: unknown,
): P7TrainingBrowserCanonicalJsonV1 {
  const canonical = JSON.stringify(canonicalReplayValue(buildP7TrainingBrowserReplay(value)));
  if (encodedByteLength(canonical) > P7_TRAINING_MAX_BROWSER_REPLAY_BYTES) {
    throw new Error("P7 browser replay exceeds its canonical byte cap");
  }
  return canonical as P7TrainingBrowserCanonicalJsonV1;
}

/** Parses the exact canonical bytes consumed by the browser transport. */
export function parseP7TrainingBrowserReplay(text: string): P7TrainingBrowserReplayV1 {
  if (encodedByteLength(text) > P7_TRAINING_MAX_BROWSER_REPLAY_BYTES) {
    throw new Error("P7 browser replay exceeds its canonical byte cap");
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error("P7 browser replay is not valid JSON", { cause: error });
  }
  const replay = buildP7TrainingBrowserReplay(value);
  if (canonicalizeP7TrainingBrowserReplay(replay) !== text) {
    throw new Error("P7 browser replay is not canonical JSON");
  }
  return replay;
}

/** Resolves the full held packet used for an actually executed native tick. */
export function p7ManualHeldInputAtNativeTick(
  replay: P7TrainingManualHeldBrowserReplayV1,
  nativeTick: number,
): number {
  let inputCode = 0;
  for (const change of replay.changes) {
    if (change.nativeTick > nativeTick) break;
    inputCode = change.inputCode;
  }
  return inputCode;
}

export function buildP7TrainingBrowserReplay(value: unknown): P7TrainingBrowserReplayV1 {
  const candidate = record(value, "P7 browser replay");
  const transport = candidate.transport;
  if (transport !== "native-replay-pulses" && transport !== "manual-held-schedule") {
    throw new Error("P7 browser replay transport is unsupported");
  }
  const inputField = transport === "native-replay-pulses" ? "decisions" : "changes";
  const replay = exactKeys(candidate, [
    "artifact",
    inputField,
    "initialization",
    "nativeTickRateHz",
    "sourceReplayContent",
    "target",
    "terminalNativeTick",
    "transport",
    "variantId",
    "version",
  ], "P7 browser replay");
  if (replay.artifact !== "ccsolver-p7b-browser-replay" || replay.version !== 1) {
    throw new Error("P7 browser replay identity is unsupported");
  }
  if (replay.target !== "ms" && replay.target !== "lynx") {
    throw new Error("P7 browser replay target is unsupported");
  }
  const target = replay.target as P7TrainingBrowserTargetV1;
  if (replay.nativeTickRateHz !== 20) {
    throw new Error("P7 browser native tick rate must be 20 Hz");
  }
  const terminalNativeTick = integer(
    replay.terminalNativeTick,
    1,
    100_000_000,
    "P7 browser terminal native tick",
  );
  const rawInitialization = exactKeys(replay.initialization, [
    "bestTimeTicks",
    "flags",
    "randomSeed",
    "randomSlideDirection",
    "stepping",
  ], "P7 browser initialization");
  const initialization: P7TrainingBrowserInitializationV1 = {
    flags: integer(rawInitialization.flags, 0, 0xffff_ffff, "P7 browser flags"),
    randomSeed: integer(rawInitialization.randomSeed, 0, 0xffff_ffff, "P7 browser random seed"),
    randomSlideDirection: integer(
      rawInitialization.randomSlideDirection,
      0,
      0xff,
      "P7 browser random slide direction",
    ),
    stepping: integer(rawInitialization.stepping, 0, 0xff, "P7 browser stepping"),
    bestTimeTicks: integer(
      rawInitialization.bestTimeTicks,
      0,
      100_000_000,
      "P7 browser best time",
    ),
  };
  const base = {
    artifact: "ccsolver-p7b-browser-replay" as const,
    version: 1 as const,
    target,
    sourceReplayContent: contentReference(replay.sourceReplayContent, "P7 browser source replay"),
    nativeTickRateHz: 20 as const,
    terminalNativeTick,
    initialization,
  };
  if (transport === "native-replay-pulses") {
    if (
      (replay.variantId !== "raw-ms" || replay.target !== "ms")
      && (replay.variantId !== "raw-lynx" || replay.target !== "lynx")
    ) {
      throw new Error("P7 native browser replay variant does not match its target");
    }
    return {
      ...base,
      transport,
      variantId: replay.variantId,
      decisions: scheduledInputs({
        value: replay.decisions,
        terminalNativeTick,
        strictlyIncreasing: false,
        portable: false,
        preserveNativeEncoding: true,
        label: "P7 browser replay decisions",
      }),
    };
  }
  if (replay.variantId !== "portable") {
    throw new Error("P7 manual browser replay requires the portable variant");
  }
  if (
    initialization.flags !== 0
    || initialization.randomSlideDirection !== 1
    || initialization.stepping !== 0
    || initialization.randomSeed > 0x7fff_ffff
  ) {
    throw new Error("P7 portable browser initialization violates its candidate profile");
  }
  return {
    ...base,
    transport,
    variantId: "portable",
    changes: scheduledInputs({
      value: replay.changes,
      terminalNativeTick,
      strictlyIncreasing: true,
      portable: true,
      preserveNativeEncoding: false,
      label: "P7 browser held-schedule changes",
    }),
  };
}
