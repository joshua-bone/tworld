import {
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { SeriesLevel } from "@content/api/series";
import type {
  P7bLevelReplayPresentation,
  P7bReplayCombination,
  P7bReplayVariantId,
} from "@game-core/api/p7bReplayPresentation";
import type { GameRequest } from "@game-core/api/types";
import {
  buildP7TrainingBrowserReplay,
  canonicalizeP7TrainingBrowserReplay,
  type P7TrainingBrowserReplayV1,
  type P7TrainingBrowserScheduledInputV1,
} from "@game-core/api/p7TrainingBrowserReplay";
import {
  P7B_MAX_LEVELS_PER_PACK,
  P7B_MAX_REPLAY_TICKS,
  buildP7bTrainingPackSummary,
  buildP7bTrainingReplayLevel,
  type P7bReplayTargetV1,
  type P7bTrainingPackSummaryV1,
  type P7bTrainingReplayLevelV1,
} from "../p7b-training/trainingReplayContract";
import {
  P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
  P7B_HYBRIDCC_CANDIDATE_PROFILE_V1,
  parseP7bPortableDecisionTrace,
} from "../p7b-training/portableReplayProfile";
import {
  renderP7bLevelReplayPage,
  renderP7bPackIndex,
} from "../p7b-training-replays/p7bReplayPresentation";
import {
  buildP7TrainingPackProofLeaf,
  type P7TrainingPackGeneratedEvidenceSidecarsV1,
} from "./buildP7TrainingPackProofLeaf";
import type {
  P7TrainingProofDerivedSourceV1,
  P7TrainingProofExternalInputV1,
} from "./p7TrainingPackProofIndex";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  canonicalizeP7SharedPlayerGraphAttestation,
  parseP7SharedPlayerGraphAttestation,
  type P7SharedPlayerGraphAttestationV1,
} from "./p7SharedPlayerGraphAttestation";

export const P7B_TRAINING_PACK_CHECKED_PARENT =
  "ccsolver/fixtures/golden/p7b/training-packs" as const;
export const P7B_TRAINING_PACK_DIST_PARENT =
  "dev/ccsolver/training-replays" as const;
export const P7B_SHARED_PLAYER_SOURCE_ENTRY =
  "web/src/bootstrap/browser/p7bReplayPlayer.tsx" as const;
export const P7B_SHARED_PLAYER_DIST_ENTRY =
  "assets/p7b-replay-player.js" as const;
export const P7B_SHARED_PLAYER_VITE_MANIFEST_KEY =
  "src/bootstrap/browser/p7bReplayPlayer.tsx" as const;
export const P7B_SHARED_PLAYER_LEVEL_HREF =
  "../../../../../../assets/p7b-replay-player.js" as const;

export const P7B_MAX_PACK_OUTPUT_FILES = 20_000;
export const P7B_MAX_PACK_OUTPUT_FILE_BYTES = 16 * 1024 * 1024;
export const P7B_MAX_PACK_OUTPUT_TOTAL_BYTES = 512 * 1024 * 1024;
export const P7B_MAX_OUTPUT_PATH_BYTES = 1_024;
export const P7B_MAX_PLAYER_NATIVE_BOUNDARY = 100_000;

const PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const OFFICIAL_TRAINING_PACKS = new Set(["cclp1", "cclp4", "cclp5"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function buildP7bSharedPlayerLevelHref(entryContent: BlobReferenceV1): string {
  const checked = copyReference(entryContent, "shared player entry");
  return `${P7B_SHARED_PLAYER_LEVEL_HREF}?v=${checked.digest.slice("sha256:".length)}`;
}

export type P7bTrainingPackMediaType =
  | "application/json"
  | "application/octet-stream"
  | "text/html";

export interface P7bTrainingPackOutput {
  readonly path: string;
  readonly mediaType: P7bTrainingPackMediaType;
  readonly content: Uint8Array;
}

export type P7bBrowserReplayDecisionV1 = P7TrainingBrowserScheduledInputV1;
export type P7bBrowserReplayV1 = P7TrainingBrowserReplayV1;

export interface P7bTrainingBrowserTargetInput {
  readonly request: GameRequest;
  readonly display: {
    readonly seriesName: string;
    readonly mapFilename: string;
    readonly level: SeriesLevel;
  };
}

export interface P7bTrainingProcessedLevelInput {
  readonly levelNumber: number;
  readonly browserTargets: Readonly<Record<P7bReplayTargetV1, P7bTrainingBrowserTargetInput>>;
  readonly rawDonorBytes: readonly {
    readonly donorId: string;
    readonly bytes: Uint8Array;
  }[];
  readonly browserReplays: readonly {
    readonly variantId: string;
    readonly target: P7bReplayTargetV1;
    readonly replay: unknown;
  }[];
  readonly variantPayloads: readonly {
    readonly variantId: string;
    readonly kind: "portable-decision-trace";
    readonly bytes: Uint8Array;
  }[];
}

export interface P7bTrainingPackBuildInput {
  pack: {
    readonly packId: string;
    readonly title: string;
    readonly expectedLevelCount: number;
  };
  inventory: readonly P7bTrainingReplayLevelV1[];
  processedLevels: P7bTrainingProcessedLevelInput[];
  readonly sharedPlayer: {
    readonly graphAttestationPath: typeof P7_SHARED_PLAYER_GRAPH_CHECKED_PATH;
    readonly graphAttestation: P7SharedPlayerGraphAttestationV1;
  };
  readonly portableProfilePayload: {
    readonly bytes: Uint8Array;
  } | null;
  readonly proof: {
    readonly corpusRevision: string;
    readonly producerRevision: string;
    readonly externalInputs: readonly P7TrainingProofExternalInputV1[];
    readonly derivedSources: readonly P7TrainingProofDerivedSourceV1[];
    readonly generatedEvidence: P7TrainingPackGeneratedEvidenceSidecarsV1;
  };
  readonly sha256: Sha256Port;
}

export interface P7bTrainingPackManifestV1 {
  readonly artifact: "ccsolver-p7b-training-pack-manifest";
  readonly version: 1;
  readonly producerRevision: "ccsolver-p7b-training-pack-output-v1";
  readonly pack: P7bTrainingPackBuildInput["pack"];
  readonly sharedPlayer: {
    readonly graphAttestation: {
      readonly path: typeof P7_SHARED_PLAYER_GRAPH_CHECKED_PATH;
      readonly content: BlobReferenceV1;
    };
    readonly entry: {
      readonly path: typeof P7B_SHARED_PLAYER_DIST_ENTRY;
      readonly content: BlobReferenceV1;
    };
    readonly levelPageHref: string;
  };
  readonly portableProfile: {
    readonly profileId: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_ID;
    readonly profileRevision: typeof P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION;
    readonly path: string;
    readonly content: BlobReferenceV1;
  } | null;
  readonly summary: {
    readonly path: string;
    readonly content: BlobReferenceV1;
  };
  readonly proofIndex: {
    readonly path: string;
    readonly content: BlobReferenceV1;
  };
  readonly levels: readonly {
    readonly levelNumber: number;
    readonly status: "complete" | "processing" | "blocked" | "unprocessed";
    readonly rawDonorFileCount: number;
    readonly replayFileCount: number;
    readonly variantPayloadFileCount: number;
  }[];
  readonly filesOrder: "path";
  readonly files: readonly {
    readonly path: string;
    readonly mediaType: P7bTrainingPackMediaType;
    readonly content: BlobReferenceV1;
  }[];
}

export interface P7bTrainingPackBuildResult {
  readonly outputs: readonly P7bTrainingPackOutput[];
  readonly manifest: P7bTrainingPackManifestV1;
  readonly manifestContent: BlobReferenceV1;
  readonly summary: P7bTrainingPackSummaryV1;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${description} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: unknown,
  expected: readonly string[],
  description: string,
): Record<string, unknown> {
  const record = requireRecord(value, description);
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

function requireInteger(
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

function requireText(value: unknown, description: string, maximumBytes = 4_096): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\r")
    || value.includes("\n")
    || value.includes("\0")
    || utf8Length(value) > maximumBytes
  ) {
    throw new Error(`${description} is invalid`);
  }
  return value;
}

function copyReference(value: unknown, description: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], description);
  if (
    typeof record.digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(record.digest)
  ) {
    throw new Error(`${description} digest is invalid`);
  }
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: requireInteger(
      record.byteLength,
      0,
      P7B_MAX_PACK_OUTPUT_FILE_BYTES,
      `${description} byte length`,
    ),
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function levelLabel(levelNumber: number): string {
  return String(levelNumber).padStart(3, "0");
}

function rowStatus(
  level: P7bTrainingReplayLevelV1,
): "complete" | "processing" | "blocked" | "unprocessed" {
  if (level.processing.status === "complete") return "complete";
  if (level.processing.status === "blocked") return "blocked";
  return level.variants.length === 0 ? "unprocessed" : "processing";
}

function processedTargetCount(level: P7bTrainingReplayLevelV1): number {
  if (level.variants.length === 0) return 0;
  return (["ms", "lynx"] as const).filter((target) => level.variants.some((variant) => (
    variant.certifications[target].status !== "not-attempted"
  ))).length;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function jsonOutput(
  path: string,
  value: unknown,
): P7bTrainingPackOutput {
  return {
    path,
    mediaType: "application/json",
    content: encoder.encode(canonicalizeJson(value)),
  };
}

function htmlOutput(path: string, html: string): P7bTrainingPackOutput {
  return { path, mediaType: "text/html", content: encoder.encode(html) };
}

function parseCanonicalPayload(bytes: Uint8Array, description: string): unknown {
  let text: string;
  let parsed: unknown;
  try {
    text = decoder.decode(bytes);
    parsed = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${description} is not valid UTF-8 JSON`, { cause: error });
  }
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
    throw new Error(`${description} is not canonical JSON`);
  }
  return parsed;
}

function renderStaticLevelPage(input: {
  readonly level: P7bTrainingReplayLevelV1;
  readonly status: "complete" | "processing" | "blocked" | "unprocessed";
}): string {
  const { level } = input;
  const coverageRows = (["ms", "lynx"] as const).map((target) => {
    const coverage = level.donorCoverage[target];
    return `<tr><th scope="row">${target === "ms" ? "MS" : "Lynx"}</th><td>${escapeHtml(coverage.status)}</td><td>${escapeHtml(coverage.detail)}</td></tr>`;
  }).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(level.source.title)} · ${escapeHtml(level.source.packId.toUpperCase())} replay status</title></head><body><main><p>${escapeHtml(level.source.packId.toUpperCase())} ${levelLabel(level.source.levelNumber)}</p><h1>${escapeHtml(level.source.title)}</h1><p data-processing-status="${escapeHtml(input.status)}">${escapeHtml(level.processing.detail)}</p><table><caption>Replay target status</caption><thead><tr><th>Target</th><th>Donor coverage</th><th>Reason</th></tr></thead><tbody>${coverageRows}</tbody></table><p><a href="contract.json">View checked level source record</a></p></main></body></html>`;
}

function copyBrowserReplay(
  value: unknown,
  expected: {
    readonly variantId: string;
    readonly target: P7bReplayTargetV1;
    readonly replayContent: BlobReferenceV1;
    readonly transport: P7TrainingBrowserReplayV1["transport"];
    readonly executedDecisionCount: number;
    readonly nativeTickRateHz: number;
    readonly terminalNativeTick: number | null;
  },
): P7bBrowserReplayV1 {
  const replay = buildP7TrainingBrowserReplay(value);
  if (
    replay.variantId !== expected.variantId
    || replay.target !== expected.target
    || replay.transport !== expected.transport
  ) {
    throw new Error("browser replay identity or transport is invalid");
  }
  if (!sameReference(replay.sourceReplayContent, expected.replayContent)) {
    throw new Error("browser replay source does not match target execution");
  }
  if (replay.nativeTickRateHz !== expected.nativeTickRateHz) {
    throw new Error("browser replay native tick rate drifted");
  }
  const replayDecisionCount = replay.transport === "native-replay-pulses"
    ? replay.decisions.length
    : replay.changes.length;
  if (replayDecisionCount !== expected.executedDecisionCount) {
    throw new Error("browser replay executed decision count drifted from target execution");
  }
  if (
    expected.terminalNativeTick !== null
    && replay.terminalNativeTick !== expected.terminalNativeTick
  ) {
    throw new Error("browser replay terminal tick drifted from certification");
  }
  return replay;
}

function requireBoundedString(
  value: unknown,
  description: string,
  maximumBytes = 4_096,
): string {
  if (
    typeof value !== "string"
    || value.includes("\r")
    || value.includes("\n")
    || value.includes("\0")
    || utf8Length(value) > maximumBytes
  ) {
    throw new Error(`${description} is invalid`);
  }
  return value;
}

function copyBrowserTarget(
  value: unknown,
  target: P7bReplayTargetV1,
  expectedLevelNumber: number,
): P7bTrainingBrowserTargetInput {
  const descriptor = exactKeys(value, ["display", "request"], `${target} browser target`);
  const rawRequest = requireRecord(descriptor.request, `${target} browser game request`);
  const requestKeys = Object.hasOwn(rawRequest, "randomSeed")
    ? ["levelNumber", "randomSeed", "ruleset", "seriesFile"] as const
    : ["levelNumber", "ruleset", "seriesFile"] as const;
  const request = exactKeys(rawRequest, requestKeys, `${target} browser game request`);
  const levelNumber = requireInteger(
    request.levelNumber,
    1,
    P7B_MAX_LEVELS_PER_PACK,
    `${target} browser level number`,
  );
  if (levelNumber !== expectedLevelNumber) {
    throw new Error(`${target} browser game request level drifted`);
  }
  const ruleset = target === "ms" ? "MS" as const : "Lynx" as const;
  if (request.ruleset !== ruleset) {
    throw new Error(`${target} browser game request ruleset drifted`);
  }
  const copiedRequest: GameRequest = {
    seriesFile: requireText(request.seriesFile, `${target} browser series file`),
    levelNumber,
    ruleset,
    ...(request.randomSeed === undefined ? {} : {
      randomSeed: requireInteger(
        request.randomSeed,
        0,
        0xffff_ffff,
        `${target} browser random seed`,
      ),
    }),
  };

  const display = exactKeys(
    descriptor.display,
    ["level", "mapFilename", "seriesName"],
    `${target} browser display`,
  );
  const rawLevel = requireRecord(display.level, `${target} browser display level`);
  const hasSpecialTools = Object.hasOwn(rawLevel, "hasSpecialTools");
  const level = exactKeys(rawLevel, [
    "author",
    "bestTimeTicks",
    "chipsRequired",
    "gameplayHash",
    ...(hasSpecialTools ? ["hasSpecialTools"] : []),
    "hasSolution",
    "index",
    "levelHash",
    "levelSize",
    "name",
    "number",
    "password",
    "sgflags",
    "solutionSize",
    "timeLimitSeconds",
    "unsolvable",
  ], `${target} browser display level`);
  const displayLevelNumber = requireInteger(
    level.number,
    1,
    P7B_MAX_LEVELS_PER_PACK,
    `${target} display level number`,
  );
  if (displayLevelNumber !== expectedLevelNumber) {
    throw new Error(`${target} browser display level drifted`);
  }
  if (
    typeof level.hasSolution !== "boolean"
    || (hasSpecialTools && typeof level.hasSpecialTools !== "boolean")
    || (level.unsolvable !== null && typeof level.unsolvable !== "string")
  ) {
    throw new Error(`${target} browser display level flags are invalid`);
  }
  const copiedLevel: SeriesLevel = {
    index: requireInteger(level.index, 0, P7B_MAX_LEVELS_PER_PACK - 1, `${target} level index`),
    number: displayLevelNumber,
    name: requireText(level.name, `${target} level name`),
    author: requireBoundedString(level.author, `${target} level author`),
    password: requireBoundedString(level.password, `${target} level password`, 64),
    timeLimitSeconds: requireInteger(
      level.timeLimitSeconds,
      0,
      P7B_MAX_REPLAY_TICKS,
      `${target} level time limit`,
    ),
    chipsRequired: requireInteger(level.chipsRequired, 0, 65_535, `${target} chips required`),
    bestTimeTicks: requireInteger(
      level.bestTimeTicks,
      0,
      P7B_MAX_REPLAY_TICKS,
      `${target} best time`,
    ),
    levelSize: requireInteger(
      level.levelSize,
      0,
      P7B_MAX_PACK_OUTPUT_FILE_BYTES,
      `${target} level byte size`,
    ),
    solutionSize: requireInteger(
      level.solutionSize,
      0,
      P7B_MAX_PACK_OUTPUT_FILE_BYTES,
      `${target} solution byte size`,
    ),
    levelHash: requireBoundedString(level.levelHash, `${target} level hash`),
    gameplayHash: requireBoundedString(level.gameplayHash, `${target} gameplay hash`),
    hasSolution: level.hasSolution,
    sgflags: requireInteger(level.sgflags, 0, 0xffff_ffff, `${target} level flags`),
    unsolvable: level.unsolvable === null
      ? null
      : requireBoundedString(level.unsolvable, `${target} unsolvable detail`),
    ...(hasSpecialTools ? { hasSpecialTools: level.hasSpecialTools as boolean } : {}),
  };
  return {
    request: copiedRequest,
    display: {
      seriesName: requireText(display.seriesName, `${target} browser series name`),
      mapFilename: requireText(display.mapFilename, `${target} browser map filename`),
      level: copiedLevel,
    },
  };
}

function copyBrowserTargets(
  value: unknown,
  expectedLevelNumber: number,
): Readonly<Record<P7bReplayTargetV1, P7bTrainingBrowserTargetInput>> {
  const targets = exactKeys(value, ["lynx", "ms"], "browser targets");
  return {
    ms: copyBrowserTarget(targets.ms, "ms", expectedLevelNumber),
    lynx: copyBrowserTarget(targets.lynx, "lynx", expectedLevelNumber),
  };
}

function playerVariantId(value: string): P7bReplayVariantId {
  if (value !== "raw-ms" && value !== "raw-lynx" && value !== "portable") {
    throw new Error(`replay variant ${value} is unsupported by the shared player`);
  }
  return value;
}

function unavailableCertificationStatus(
  status: P7bTrainingReplayLevelV1["variants"][number]["certifications"][P7bReplayTargetV1]["status"],
): "failed" | "not-attempted" | "unavailable" {
  if (status === "failed" || status === "not-attempted" || status === "unavailable") return status;
  return "unavailable";
}

function variantLabel(id: P7bReplayVariantId): string {
  if (id === "raw-ms") return "Raw MS donor";
  if (id === "raw-lynx") return "Raw Lynx donor";
  return "Portable replay";
}

function buildLevelPresentation(input: {
  readonly level: P7bTrainingReplayLevelV1;
  readonly replayHrefs: ReadonlyMap<string, string>;
  readonly playerModuleHref: string;
}): P7bLevelReplayPresentation {
  const { level } = input;
  const variants = level.variants.map((variant) => {
    const id = playerVariantId(variant.variantId);
    return {
      id,
      label: variantLabel(id),
      description: variant.kind === "portable"
        ? `Portable candidate · ${variant.portability}`
        : `Immutable donor execution · ${variant.portability}`,
      segments: variant.segments.map((segment) => ({
        id: segment.segmentId,
        ordinal: segment.index + 1,
        title: segment.label,
      })),
    };
  });
  const executionTargets = [
    { id: "ms" as const, label: "MS engine" },
    { id: "lynx" as const, label: "Lynx engine" },
  ];
  const combinations: P7bReplayCombination[] = level.variants.flatMap((variant) => {
    const variantId = playerVariantId(variant.variantId);
    return (["ms", "lynx"] as const).map((target): P7bReplayCombination => {
      const certification = variant.certifications[target];
      const replayHref = input.replayHrefs.get(`${variant.variantId}:${target}`);
      const executable = certification.status === "certified"
        && (
          certification.execution.status === "native"
          || certification.execution.status === "compiled"
        );
      if (!executable || replayHref === undefined) {
        return {
          variant: variantId,
          executionTarget: target,
          availability: "unavailable",
          certificationStatus: unavailableCertificationStatus(certification.status),
          reason: certification.detail,
        };
      }
      const decisionProfile = certification.execution.decisionProfile;
      const nativeTickRateHz = certification.execution.nativeTickRateHz;
      const executedDecisionCount = certification.execution.executedDecisionCount;
      if (
        decisionProfile === null
        || nativeTickRateHz === null
        || executedDecisionCount === null
        || certification.terminalNativeTick === null
      ) {
        throw new Error(`certified replay ${variantId}:${target} lacks its clock contract`);
      }
      if (certification.terminalNativeTick > P7B_MAX_PLAYER_NATIVE_BOUNDARY) {
        throw new Error(`certified replay ${variantId}:${target} exceeds the player seek bound`);
      }
      return {
        variant: variantId,
        executionTarget: target,
        availability: "available",
        transport: certification.execution.browserReplayTransport!,
        replayHref,
        replayContent: certification.execution.browserReplayContent!,
        provenanceLabel: variant.kind === "raw"
          ? "Immutable raw donor"
          : "Normalized portable lineage",
        decisionProfile: {
          profileId: decisionProfile.profileId,
          clockBasis: decisionProfile.clockBasis,
          cadenceHz: decisionProfile.cadenceHz,
        },
        nativeTickRateHz,
        nativeBoundaryClock: certification.execution.nativeBoundaryClock!,
        terminalNativeTick: certification.terminalNativeTick,
        executedDecisionCount,
        segmentSpans: certification.segmentSpans.map((span) => ({
          segmentId: span.segmentId,
          startNativeTick: span.startNativeTick,
          endNativeTick: span.endNativeTick,
          ...(span.startDecisionOrdinal === null ? {} : {
            startDecisionOrdinal: span.startDecisionOrdinal,
            endDecisionOrdinal: span.endDecisionOrdinal!,
          }),
        })),
      };
    });
  });
  const initialVariant = playerVariantId(
    level.viewableVariantId ?? level.variants[0]!.variantId,
  );
  const initialTarget = combinations.find((combination) => (
    combination.variant === initialVariant && combination.availability === "available"
  ))?.executionTarget ?? "ms";
  return {
    packId: level.source.packId,
    levelNumber: level.source.levelNumber,
    title: level.source.title,
    sourceHref: "contract.json",
    levelManifestHref: "browser.json",
    playerModuleHref: input.playerModuleHref,
    initialSelection: {
      variant: initialVariant,
      executionTarget: initialTarget,
    },
    variants,
    executionTargets,
    combinations,
  };
}

function assertPackInput(input: P7bTrainingPackBuildInput): {
  readonly packId: string;
  readonly title: string;
  readonly expectedLevelCount: number;
  readonly inventory: readonly P7bTrainingReplayLevelV1[];
  readonly processedByLevel: ReadonlyMap<number, P7bTrainingProcessedLevelInput>;
} {
  const packId = requireText(input.pack.packId, "training pack id", 64);
  if (!PACK_ID_PATTERN.test(packId)) throw new Error("training pack id is unsafe");
  const title = requireText(input.pack.title, "training pack title");
  const expectedLevelCount = requireInteger(
    input.pack.expectedLevelCount,
    1,
    P7B_MAX_LEVELS_PER_PACK,
    "training pack expected level count",
  );
  if (OFFICIAL_TRAINING_PACKS.has(packId) && expectedLevelCount !== 149) {
    throw new Error("official CCLP training packs require exactly 149 inventory rows");
  }
  if (input.inventory.length !== expectedLevelCount) {
    throw new Error("training pack inventory does not match its exact denominator");
  }
  const inventory = input.inventory.map(buildP7bTrainingReplayLevel)
    .sort((left, right) => left.source.levelNumber - right.source.levelNumber);
  for (const [index, level] of inventory.entries()) {
    if (level.source.packId !== packId || level.source.levelNumber !== index + 1) {
      throw new Error(`training pack inventory must contain level ${index + 1} exactly once`);
    }
  }
  if (input.sharedPlayer.graphAttestationPath !== P7_SHARED_PLAYER_GRAPH_CHECKED_PATH) {
    throw new Error("training pack shared player contract is unsupported");
  }
  const graph = parseP7SharedPlayerGraphAttestation(
    canonicalizeP7SharedPlayerGraphAttestation(input.sharedPlayer.graphAttestation),
  );
  if (
    graph.source.entryPath !== P7B_SHARED_PLAYER_SOURCE_ENTRY
    || graph.viteManifest.key !== P7B_SHARED_PLAYER_VITE_MANIFEST_KEY
    || graph.entry.path !== P7B_SHARED_PLAYER_DIST_ENTRY
  ) throw new Error("training pack shared player contract is unsupported");
  const processedByLevel = new Map<number, P7bTrainingProcessedLevelInput>();
  for (const processed of input.processedLevels) {
    const levelNumber = requireInteger(
      processed.levelNumber,
      1,
      expectedLevelCount,
      "processed level number",
    );
    if (processedByLevel.has(levelNumber)) {
      throw new Error(`duplicate processed level ${levelNumber}`);
    }
    processedByLevel.set(levelNumber, processed);
  }
  return { packId, title, expectedLevelCount, inventory, processedByLevel };
}

async function buildLevelOutputs(input: {
  readonly root: string;
  readonly level: P7bTrainingReplayLevelV1;
  readonly processed: P7bTrainingProcessedLevelInput | undefined;
  readonly playerModuleHref: string;
  readonly sha256: Sha256Port;
}): Promise<{
  readonly outputs: readonly P7bTrainingPackOutput[];
  readonly status: "complete" | "processing" | "blocked" | "unprocessed";
  readonly rawDonorFileCount: number;
  readonly replayFileCount: number;
  readonly variantPayloadFileCount: number;
}> {
  const { level } = input;
  const playable = level.variants.flatMap((variant) => (
    (["ms", "lynx"] as const).flatMap((target) => {
      const certification = variant.certifications[target];
      return certification.status === "certified" && (
        certification.execution.status === "native"
        || certification.execution.status === "compiled"
      )
        ? [{ variant, target, certification }]
        : [];
    })
  ));
  if ((level.rawDonors.length > 0 || level.variants.length > 0) && input.processed === undefined) {
    throw new Error(`executable level ${level.source.levelNumber} lacks injected processed assets`);
  }
  const processed = input.processed ?? {
    levelNumber: level.source.levelNumber,
    browserTargets: null,
    rawDonorBytes: [],
    browserReplays: [],
    variantPayloads: [],
  };
  const levelRoot = `${input.root}/levels/${levelLabel(level.source.levelNumber)}`;
  const rawById = new Map(processed.rawDonorBytes.map((entry) => [entry.donorId, entry]));
  if (rawById.size !== processed.rawDonorBytes.length || rawById.size !== level.rawDonors.length) {
    throw new Error(`level ${level.source.levelNumber} raw donor byte set is incomplete`);
  }
  const rawOutputs: P7bTrainingPackOutput[] = [];
  for (const [index, donor] of level.rawDonors.entries()) {
    const supplied = rawById.get(donor.donorId);
    if (supplied === undefined) {
      throw new Error(`level ${level.source.levelNumber} lacks raw donor ${donor.donorId}`);
    }
    const actual = await referenceSourceBytes(supplied.bytes, input.sha256);
    if (!sameReference(actual, donor.replayContent)) {
      throw new Error("raw donor bytes disagree with immutable content");
    }
    const href = `raw/${String(index).padStart(2, "0")}-${donor.target}.tws-entry.bin`;
    rawOutputs.push({
      path: `${levelRoot}/${href}`,
      mediaType: "application/octet-stream",
      content: new Uint8Array(supplied.bytes),
    });
  }
  const replayByKey = new Map(processed.browserReplays.map((entry) => [
    `${entry.variantId}:${entry.target}`,
    entry,
  ]));
  if (
    replayByKey.size !== processed.browserReplays.length
    || replayByKey.size !== playable.length
  ) {
    throw new Error(`level ${level.source.levelNumber} browser replay set is incomplete`);
  }
  const replayHrefs = new Map<string, string>();
  const replayOutputs: P7bTrainingPackOutput[] = [];
  for (const [variantIndex, variant] of level.variants.entries()) {
    for (const target of ["ms", "lynx"] as const) {
      const certification = variant.certifications[target];
      if (
        certification.status !== "certified"
        || (
        certification.execution.status !== "native"
        && certification.execution.status !== "compiled"
        )
      ) continue;
      if (
        certification.terminalNativeTick === null
        || certification.terminalNativeTick > P7B_MAX_PLAYER_NATIVE_BOUNDARY
      ) {
        throw new Error(`certified replay ${variant.variantId}:${target} exceeds the player seek bound`);
      }
      const key = `${variant.variantId}:${target}`;
      const supplied = replayByKey.get(key);
      const executionReplay = certification.execution.replayContent;
      const browserReplayContent = certification.execution.browserReplayContent;
      const browserReplayTransport = certification.execution.browserReplayTransport;
      const executedDecisionCount = certification.execution.executedDecisionCount;
      const nativeTickRateHz = certification.execution.nativeTickRateHz;
      if (
        supplied === undefined
        || executionReplay === null
        || browserReplayContent === null
        || browserReplayTransport === null
        || executedDecisionCount === null
        || nativeTickRateHz === null
      ) {
        throw new Error(`level ${level.source.levelNumber} lacks browser replay ${key}`);
      }
      const replay = copyBrowserReplay(supplied.replay, {
        variantId: variant.variantId,
        target,
        replayContent: executionReplay,
        transport: browserReplayTransport,
        executedDecisionCount,
        nativeTickRateHz,
        terminalNativeTick: certification.terminalNativeTick,
      });
      const href = `replays/${String(variantIndex).padStart(2, "0")}-${target}.json`;
      replayHrefs.set(key, href);
      const output: P7bTrainingPackOutput = {
        path: `${levelRoot}/${href}`,
        mediaType: "application/json",
        content: encoder.encode(canonicalizeP7TrainingBrowserReplay(replay)),
      };
      const actualBrowserReplayContent = await referenceSourceBytes(output.content, input.sha256);
      if (!sameReference(actualBrowserReplayContent, browserReplayContent)) {
        throw new Error(`level ${level.source.levelNumber} browser replay envelope drifted: ${key}`);
      }
      replayOutputs.push(output);
    }
  }
  const expectedPortable = level.variants.flatMap((variant, variantIndex) => (
    variant.kind === "portable" ? [{ variant, variantIndex }] : []
  ));
  const variantPayloadById = new Map(processed.variantPayloads.map((payload) => [
    payload.variantId,
    payload,
  ]));
  if (
    variantPayloadById.size !== processed.variantPayloads.length
    || variantPayloadById.size !== expectedPortable.length
  ) {
    throw new Error(`level ${level.source.levelNumber} portable variant payload set is incomplete`);
  }
  const variantPayloadOutputs: P7bTrainingPackOutput[] = [];
  for (const { variant, variantIndex } of expectedPortable) {
    const payload = variantPayloadById.get(variant.variantId);
    if (payload === undefined || payload.kind !== "portable-decision-trace") {
      throw new Error(`level ${level.source.levelNumber} portable variant payload set is incomplete`);
    }
    const trace = parseP7bPortableDecisionTrace(decoder.decode(payload.bytes));
    if (
      variant.portableProfile === null
      || trace.profileId !== variant.portableProfile.profileId
      || trace.profileRevision !== variant.portableProfile.profileRevision
      || trace.changes.length !== variant.portableProfile.changeCount
      || trace.terminalLogicStep !== variant.portableProfile.terminalLogicStep
    ) {
      throw new Error(`level ${level.source.levelNumber} portable decision trace contract drifted`);
    }
    const actual = await referenceSourceBytes(payload.bytes, input.sha256);
    if (
      !sameReference(actual, variant.replayContent)
      || !sameReference(actual, variant.portableProfile.decisionTraceContent)
    ) {
      throw new Error(`level ${level.source.levelNumber} portable decision trace bytes drifted`);
    }
    variantPayloadOutputs.push({
      path: `${levelRoot}/portable/${String(variantIndex).padStart(2, "0")}-hybrid-candidate-10hz.json`,
      mediaType: "application/json",
      content: new Uint8Array(payload.bytes),
    });
  }
  const status = rowStatus(level);
  const presentation = level.variants.length === 0
    ? null
    : buildLevelPresentation({
        level,
        replayHrefs,
        playerModuleHref: input.playerModuleHref,
      });
  const browserTargets = level.variants.length === 0
    ? null
    : copyBrowserTargets(processed.browserTargets, level.source.levelNumber);
  const browser = presentation === null || browserTargets === null
    ? null
    : {
        artifact: "ccsolver-p7b-replay-browser-level" as const,
        version: 1 as const,
        presentation,
        targets: browserTargets,
      };
  const outputs: P7bTrainingPackOutput[] = [
    ...(browser === null ? [] : [jsonOutput(`${levelRoot}/browser.json`, browser)]),
    jsonOutput(`${levelRoot}/contract.json`, level),
    htmlOutput(
      `${levelRoot}/index.html`,
      presentation === null
        ? renderStaticLevelPage({ level, status })
        : renderP7bLevelReplayPage(presentation),
    ),
    ...rawOutputs,
    ...replayOutputs,
    ...variantPayloadOutputs,
  ];
  return {
    outputs,
    status,
    rawDonorFileCount: rawOutputs.length,
    replayFileCount: replayOutputs.length,
    variantPayloadFileCount: variantPayloadOutputs.length,
  };
}

type P7bTrainingLevelBuild = Awaited<ReturnType<typeof buildLevelOutputs>>;

function assertOutputBounds(outputs: readonly P7bTrainingPackOutput[]): void {
  if (outputs.length > P7B_MAX_PACK_OUTPUT_FILES) {
    throw new Error("training pack output file count exceeds its bound");
  }
  let total = 0;
  const paths = new Set<string>();
  for (const output of outputs) {
    if (
      utf8Length(output.path) > P7B_MAX_OUTPUT_PATH_BYTES
      || output.path.includes("\\")
      || output.path.split("/").includes("..")
    ) {
      throw new Error(`training pack output path is unsafe: ${output.path}`);
    }
    if (paths.has(output.path)) throw new Error(`duplicate training pack output: ${output.path}`);
    paths.add(output.path);
    if (output.content.byteLength > P7B_MAX_PACK_OUTPUT_FILE_BYTES) {
      throw new Error(`training pack output exceeds its file byte bound: ${output.path}`);
    }
    total += output.content.byteLength;
  }
  if (total > P7B_MAX_PACK_OUTPUT_TOTAL_BYTES) {
    throw new Error("training pack output exceeds its total byte bound");
  }
}

export async function buildP7bTrainingPackOutputs(
  input: P7bTrainingPackBuildInput,
): Promise<P7bTrainingPackBuildResult> {
  const checked = assertPackInput(input);
  const root = `${P7B_TRAINING_PACK_CHECKED_PARENT}/${checked.packId}`;
  const sharedPlayerGraphJson = canonicalizeP7SharedPlayerGraphAttestation(
    input.sharedPlayer.graphAttestation,
  );
  const sharedPlayerGraph = parseP7SharedPlayerGraphAttestation(sharedPlayerGraphJson);
  const sharedPlayerGraphContent = await referenceSourceBytes(
    encoder.encode(sharedPlayerGraphJson),
    input.sha256,
  );
  const playerModuleHref = buildP7bSharedPlayerLevelHref(sharedPlayerGraph.entry.content);
  const summary = buildP7bTrainingPackSummary(checked.inventory);
  const portableBindings = checked.inventory.flatMap((level) => (
    level.variants.flatMap((variant) => (
      variant.portableProfile === null ? [] : [variant.portableProfile]
    ))
  ));
  let portableProfile: P7bTrainingPackManifestV1["portableProfile"] = null;
  let portableProfileOutput: P7bTrainingPackOutput | null = null;
  if (portableBindings.length === 0) {
    if (input.portableProfilePayload !== null) {
      throw new Error("training pack without portable variants must omit the portable profile payload");
    }
  } else {
    if (input.portableProfilePayload === null) {
      throw new Error("training pack portable profile payload is missing");
    }
    const parsedProfile = parseCanonicalPayload(
      input.portableProfilePayload.bytes,
      "training pack portable profile payload",
    );
    if (
      canonicalizeJson(parsedProfile as CanonicalJsonValue)
      !== canonicalizeJson(P7B_HYBRIDCC_CANDIDATE_PROFILE_V1)
    ) {
      throw new Error("training pack portable profile descriptor drifted");
    }
    const content = await referenceSourceBytes(input.portableProfilePayload.bytes, input.sha256);
    if (portableBindings.some((binding) => !sameReference(binding.profileContent, content))) {
      throw new Error("portable variant profile content disagrees with the shared descriptor");
    }
    const path = `${root}/profiles/${P7B_HYBRIDCC_CANDIDATE_PROFILE_ID}.json`;
    portableProfile = {
      profileId: P7B_HYBRIDCC_CANDIDATE_PROFILE_ID,
      profileRevision: P7B_HYBRIDCC_CANDIDATE_PROFILE_REVISION,
      path,
      content,
    };
    portableProfileOutput = {
      path,
      mediaType: "application/json",
      content: new Uint8Array(input.portableProfilePayload.bytes),
    };
  }
  const levelBuilds: P7bTrainingLevelBuild[] = [];
  for (const level of checked.inventory) {
    levelBuilds.push(await buildLevelOutputs({
      root,
      level,
      processed: checked.processedByLevel.get(level.source.levelNumber),
      playerModuleHref,
      sha256: input.sha256,
    }));
  }
  const rows = checked.inventory.map((level, index) => ({
    levelNumber: level.source.levelNumber,
    title: level.source.title,
    status: levelBuilds[index]!.status,
    processedTargetCount: processedTargetCount(level),
    totalTargetCount: 2 as const,
    href: `levels/${levelLabel(level.source.levelNumber)}/`,
    browserManifestHref: level.variants.length === 0
      ? null
      : `levels/${levelLabel(level.source.levelNumber)}/browser.json`,
  }));
  const browserIndex = {
    artifact: "ccsolver-p7b-training-pack-browser-index" as const,
    version: 1 as const,
    packId: checked.packId,
    title: checked.title,
    expectedLevelCount: checked.expectedLevelCount,
    levels: rows,
  };
  const summaryPath = `${root}/pack-summary.json`;
  const basePayloads = [
    jsonOutput(`${root}/browser.json`, browserIndex),
    htmlOutput(`${root}/index.html`, renderP7bPackIndex({
      packId: checked.packId,
      title: checked.title,
      expectedLevelCount: checked.expectedLevelCount,
      levels: rows.map(({ browserManifestHref: _browserManifestHref, ...row }) => row),
    })),
    ...levelBuilds.flatMap(({ outputs }) => outputs),
    ...(portableProfileOutput === null ? [] : [portableProfileOutput]),
    jsonOutput(summaryPath, summary),
  ].sort((left, right) => compareText(left.path, right.path));
  assertOutputBounds(basePayloads);
  const proofLeaf = await buildP7TrainingPackProofLeaf({
    root,
    pack: {
      packId: checked.packId,
      expectedLevelCount: checked.expectedLevelCount,
      corpusRevision: input.proof.corpusRevision,
      producerRevision: input.proof.producerRevision,
    },
    levels: checked.inventory,
    baseOutputs: basePayloads,
    externalInputs: input.proof.externalInputs,
    derivedSources: input.proof.derivedSources,
    generatedEvidence: input.proof.generatedEvidence,
    sha256: input.sha256,
  });
  const payloads = [
    ...basePayloads,
    ...proofLeaf.evidenceOutputs,
    proofLeaf.proofOutput,
  ].sort((left, right) => compareText(left.path, right.path));
  assertOutputBounds(payloads);
  const files = await Promise.all(payloads.map(async (output) => ({
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(output.content, input.sha256),
  })));
  const summaryFile = files.find(({ path }) => path === summaryPath)!;
  const proofFile = files.find(({ path }) => path === proofLeaf.proofOutput.path)!;
  const manifest: P7bTrainingPackManifestV1 = {
    artifact: "ccsolver-p7b-training-pack-manifest",
    version: 1,
    producerRevision: "ccsolver-p7b-training-pack-output-v1",
    pack: {
      packId: checked.packId,
      title: checked.title,
      expectedLevelCount: checked.expectedLevelCount,
    },
    sharedPlayer: {
      graphAttestation: {
        path: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
        content: sharedPlayerGraphContent,
      },
      entry: {
        path: P7B_SHARED_PLAYER_DIST_ENTRY,
        content: copyReference(sharedPlayerGraph.entry.content, "shared player entry"),
      },
      levelPageHref: playerModuleHref,
    },
    portableProfile,
    summary: { path: summaryPath, content: summaryFile.content },
    proofIndex: { path: proofFile.path, content: proofFile.content },
    levels: checked.inventory.map((level, index) => ({
      levelNumber: level.source.levelNumber,
      status: levelBuilds[index]!.status,
      rawDonorFileCount: levelBuilds[index]!.rawDonorFileCount,
      replayFileCount: levelBuilds[index]!.replayFileCount,
      variantPayloadFileCount: levelBuilds[index]!.variantPayloadFileCount,
    })),
    filesOrder: "path",
    files,
  };
  const manifestJson = canonicalizeJson(manifest as unknown as CanonicalJsonValue);
  const manifestOutput = {
    path: `${root}/manifest.json`,
    mediaType: "application/json" as const,
    content: encoder.encode(manifestJson),
  };
  const outputs = [...payloads, manifestOutput]
    .sort((left, right) => compareText(left.path, right.path));
  assertOutputBounds(outputs);
  return {
    outputs,
    manifest,
    manifestContent: await referenceCanonicalJson(manifestJson, input.sha256),
    summary,
  };
}
