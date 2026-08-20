import {
  canonicalizeJson,
  parseCanonicalJson,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";

export const P7B_HYBRIDCC_CANDIDATE_PROFILE_ID =
  "hybridcc-candidate-10hz-v1" as const;
export const P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION =
  "ccsolver-p7b-hybridcc-candidate-profile-v1" as const;
export const P7B_PORTABLE_DECISION_TRACE_ARTIFACT =
  "ccsolver-p7b-portable-decision-trace" as const;
export const P7B_MAX_PORTABLE_LOGIC_STEP = 100_000_000;
export const P7B_MAX_PORTABLE_CHANGES = 1_000_000;
export const P7B_MAX_PORTABLE_TRACE_BYTES = 8 * 1024 * 1024;

export type P7bPortableDirectionV1 =
  | "none"
  | "north"
  | "east"
  | "south"
  | "west";

export interface P7bPortableDecisionPacketV1 {
  readonly primary: P7bPortableDirectionV1;
  readonly secondary: P7bPortableDirectionV1;
}

export interface P7bPortableDecisionChangeV1 {
  readonly logicStep: number;
  readonly packet: P7bPortableDecisionPacketV1;
}

export interface P7bPortableDecisionTraceV1 {
  readonly artifact: typeof P7B_PORTABLE_DECISION_TRACE_ARTIFACT;
  readonly version: 1;
  readonly profileId: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_ID;
  readonly profileRevision: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION;
  readonly terminalLogicStep: number;
  readonly changes: readonly P7bPortableDecisionChangeV1[];
}

const CANONICAL_PACKETS = [
  { primary: "none", secondary: "none" },
  { primary: "north", secondary: "none" },
  { primary: "east", secondary: "none" },
  { primary: "south", secondary: "none" },
  { primary: "west", secondary: "none" },
  { primary: "north", secondary: "east" },
  { primary: "east", secondary: "north" },
  { primary: "east", secondary: "south" },
  { primary: "south", secondary: "east" },
  { primary: "south", secondary: "west" },
  { primary: "west", secondary: "south" },
  { primary: "west", secondary: "north" },
  { primary: "north", secondary: "west" },
] as const satisfies readonly P7bPortableDecisionPacketV1[];

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

export const P7B_HYBRIDCC_CANDIDATE_PROFILE_V1 = deepFreeze({
  profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  classification: "candidate-external-contract" as const,
  upstream: {
    repository: "HybridCC2026" as const,
    headRevision: "34eeeb571a1bb1a33596e95fe8d783b744aefa44" as const,
    timingHeader: {
      path: "include/hybridcc/timing.hpp" as const,
      sha256: "844e821cc8a3f33f37135c977460c9a956380b706d4d754e2c99e97ce876078a" as const,
    },
    replayDocumentation: {
      path: "docs/replays-and-solving.md" as const,
      sha256: "955963e2f98d9496892b8468b9f0af2edb67485004651b59a5d0711e6dfa5445" as const,
    },
  },
  logicStepsPerSecond: 10 as const,
  stepOrigin: 0 as const,
  normalMoveLogicSteps: 2 as const,
  packetSemantics: "held-primary-secondary-until-change" as const,
  changePolicy: "sparse-strictly-increasing-nonredundant" as const,
  canonicalPackets: CANONICAL_PACKETS,
});

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  description: string,
): Record<string, unknown> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || (
      Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null
    )
  ) {
    throw new Error(`${description} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (
    actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${description} has an unsupported shape`);
  }
  return record;
}

function requireSafeInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  description: string,
): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) {
    throw new Error(`${description} is out of bounds`);
  }
  return value as number;
}

function packetKey(packet: P7bPortableDecisionPacketV1): string {
  return `${packet.primary}+${packet.secondary}`;
}

const PACKET_KEYS = new Set(CANONICAL_PACKETS.map(packetKey));
const RELEASE_PACKET_KEY = packetKey(CANONICAL_PACKETS[0]);

function copyPacket(value: unknown): P7bPortableDecisionPacketV1 {
  const record = exactKeys(value, ["primary", "secondary"], "portable decision packet");
  const packet = {
    primary: record.primary,
    secondary: record.secondary,
  } as P7bPortableDecisionPacketV1;
  if (!PACKET_KEYS.has(packetKey(packet))) {
    throw new Error("portable decision packet is not one of the 13 canonical shapes");
  }
  return packet;
}

function copyTrace(value: unknown): P7bPortableDecisionTraceV1 {
  const record = exactKeys(value, [
    "artifact",
    "changes",
    "profileId",
    "profileRevision",
    "terminalLogicStep",
    "version",
  ], "portable decision trace");
  if (
    record.artifact !== P7B_PORTABLE_DECISION_TRACE_ARTIFACT
    || record.version !== 1
    || record.profileId !== P7B_HYBRIDCC_CANDIDATE_PROFILE_ID
    || record.profileRevision !== P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION
  ) {
    throw new Error("portable decision trace profile is unsupported");
  }
  const terminalLogicStep = requireSafeInteger(
    record.terminalLogicStep,
    0,
    P7B_MAX_PORTABLE_LOGIC_STEP,
    "portable decision terminal logic step",
  );
  if (
    !Array.isArray(record.changes)
    || record.changes.length > P7B_MAX_PORTABLE_CHANGES
  ) {
    throw new Error("portable decision change count is out of bounds");
  }
  const changes = record.changes.map((value): P7bPortableDecisionChangeV1 => {
    const change = exactKeys(value, ["logicStep", "packet"], "portable decision change");
    return {
      logicStep: requireSafeInteger(
        change.logicStep,
        P7B_HYBRIDCC_CANDIDATE_PROFILE_V1.stepOrigin,
        terminalLogicStep,
        "portable decision change logic step",
      ),
      packet: copyPacket(change.packet),
    };
  });
  for (let index = 0; index < changes.length; index += 1) {
    const current = changes[index]!;
    if (index === 0) {
      if (packetKey(current.packet) === RELEASE_PACKET_KEY) {
        throw new Error(
          "portable decision trace cannot begin with the already-held release packet",
        );
      }
      continue;
    }
    const previous = changes[index - 1]!;
    if (current.logicStep <= previous.logicStep) {
      throw new Error("portable decision changes must be strictly increasing");
    }
    if (packetKey(current.packet) === packetKey(previous.packet)) {
      throw new Error("portable decision changes must not repeat the held packet");
    }
  }
  return {
    artifact: P7B_PORTABLE_DECISION_TRACE_ARTIFACT,
    version: 1,
    profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
    profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
    terminalLogicStep,
    changes,
  };
}

export function buildP7bPortableDecisionTrace(
  value: unknown,
): P7bPortableDecisionTraceV1 {
  const copied = copyTrace(value);
  if (utf8Length(canonicalizeJson(copied)) > P7B_MAX_PORTABLE_TRACE_BYTES) {
    throw new Error("portable decision trace is oversized");
  }
  return deepFreeze(copied);
}

export function canonicalizeP7bPortableDecisionTrace(value: unknown): CanonicalJson {
  return canonicalizeJson(buildP7bPortableDecisionTrace(value));
}

export function parseP7bPortableDecisionTrace(
  canonicalJson: string,
): P7bPortableDecisionTraceV1 {
  if (
    typeof canonicalJson !== "string"
    || utf8Length(canonicalJson) > P7B_MAX_PORTABLE_TRACE_BYTES
  ) {
    throw new Error("portable decision trace is oversized");
  }
  let parsed: unknown;
  try {
    parsed = parseCanonicalJson(canonicalJson);
  } catch (error) {
    throw new Error("portable decision trace is not canonical JSON", { cause: error });
  }
  return buildP7bPortableDecisionTrace(parsed);
}
