import { computeDatContentHash } from "@level-catalog/impl/importedDatIdentity";
import { HYBRID_CC_V1_OUTCOME } from "@player-web/impl/hybridcc-v1/engineFacts";
import {
  HYBRIDCC_V1_ABI,
  applyHybridCcV1HintOverlay,
  decodeHybridCcV1Replay,
  verifyHybridCcV1Replay,
  type HybridCcV1ConvertedLevel,
  type HybridCcV1HintPlacement,
  type HybridCcV1WasmModule,
} from "@player-web/impl/hybridcc-v1/wasmBridge";

const datUrl = new URL("./assets/legacy_dat_sandbox.dat", import.meta.url).href;
const hintsUrl = new URL("./assets/legacy_dat_sandbox.hints.json", import.meta.url).href;
const replayIndexUrl = new URL("./assets/replay-index.json", import.meta.url).href;
const replayUrls = import.meta.glob("./assets/replays/**/*.hcr1", {
  eager: true,
  import: "default",
  query: "?url",
}) as Record<string, string>;

export const LEGACY_DAT_SANDBOX_ASSET_ID = "legacy_dat_sandbox";
export const LEGACY_DAT_SANDBOX_FILENAME = "legacy_dat_sandbox.dat";
export const LEGACY_DAT_SANDBOX_NAME = "Legacy DAT Sandbox";
export const LEGACY_DAT_SANDBOX_DAT_SHA256 =
  "cd304b8e282a8e2f84077fb5104bef030b7c84c92242618c97d19b8feaf24e18";
export const LEGACY_DAT_SANDBOX_HINTS_SHA256 =
  "9589e1ce265b040dd38e3deb661f58ae32234bad0b8636f5ebae9cb4058b9819";
export const LEGACY_DAT_SANDBOX_REPLAY_INDEX_SHA256 =
  "12415d173d8efb9b0b0c7ca2411279bb0e1d8cfec513a8ece41acf25d5336cb0";

interface HintTarget {
  kind: "tile";
  x: number;
  y: number;
}

interface HintRoom {
  roomId: string;
  message: string;
  targets: HintTarget[];
}

interface HintLevel {
  entryOrdinal: number;
  expectedNumber: number;
  expectedTitle: string;
  rooms: HintRoom[];
}

interface HintSupplement {
  datSha256: string;
  levelCount: number;
  levels: HintLevel[];
}

interface ReplayIndexEntry {
  id: string;
  scenarioIds: string[];
  entryOrdinal: number;
  levelNumber: number;
  path: string;
  byteLength: number;
  sha256: string;
  levelContentSha256: string;
  seed: number;
  finalBoundary: number;
  expectedOutcome: "win" | "loss";
}

interface ReplayIndexBoundedProof {
  id: string;
  scenarioIds: string[];
  entryId: string;
  entryOrdinal: number;
  levelNumber: number;
  inputSourceSha256: string;
  levelContentSha256: string;
  seed: number;
  verifiedThroughBoundary: number;
  expectedOutcome: "unfinished";
}

interface ReplayIndex {
  datSha256: string;
  hintSupplementSha256: string;
  ruleset: string;
  replays: ReplayIndexEntry[];
  boundedProofs: ReplayIndexBoundedProof[];
}

export interface LegacyDatSandboxReferenceReplay {
  id: string;
  levelNumber: number;
  levelName: string;
  fileName: string;
  gameplayHash: string;
  bytes: Uint8Array;
  expectedOutcome: "win" | "loss";
}

/**
 * A reviewed deterministic run that proves behavior through a finite boundary,
 * but deliberately does not claim a terminal win or loss and is not playable.
 */
export interface LegacyDatSandboxBoundedProof {
  id: string;
  scenarioIds: string[];
  entryId: string;
  entryOrdinal: number;
  levelNumber: number;
  levelName: string;
  gameplayHash: string;
  inputSourceSha256: string;
  seed: number;
  verifiedThroughBoundary: number;
  expectedOutcome: "unfinished";
}

export interface LoadedLegacyDatSandbox {
  levels: HybridCcV1ConvertedLevel[];
  gameplayHashes: string[];
  referenceReplays: LegacyDatSandboxReferenceReplay[];
  boundedProofs: LegacyDatSandboxBoundedProof[];
}

export interface LegacyDatSandboxAssetSource {
  readonly assetId: typeof LEGACY_DAT_SANDBOX_ASSET_ID;
  loadDatBytes(): Promise<Uint8Array>;
  loadHintBytes(): Promise<Uint8Array>;
  loadReplayIndexBytes(): Promise<Uint8Array>;
  loadReplayBytes(path: string): Promise<Uint8Array>;
}

type AssetFetcher = (input: string | URL | Request) => Promise<Response>;

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}.`);
  }
  return value as number;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function sha256(value: unknown, label: string): string {
  const hash = string(value, label);
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return hash;
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error: unknown) {
    throw new Error(`${label} is not valid UTF-8 JSON.`, { cause: error });
  }
}

export function parseLegacyDatSandboxHints(bytes: Uint8Array): HintSupplement {
  const root = record(parseJson(bytes, "Legacy DAT Sandbox hints"), "Legacy DAT Sandbox hints");
  if (root.format !== "hybridcc.legacy-dat-sandbox-hints" || root.version !== 1) {
    throw new Error("Legacy DAT Sandbox hints use an unsupported format or version.");
  }
  const dat = record(root.dat, "Legacy DAT Sandbox hints.dat");
  if (dat.assetId !== LEGACY_DAT_SANDBOX_ASSET_ID || dat.file !== LEGACY_DAT_SANDBOX_FILENAME) {
    throw new Error("Legacy DAT Sandbox hints name a different built-in asset.");
  }
  const levelCount = integer(dat.levelCount, "Legacy DAT Sandbox hints level count", 1);
  const levels = array(root.levels, "Legacy DAT Sandbox hint levels").map((value, levelIndex): HintLevel => {
    const level = record(value, `Legacy DAT Sandbox hint level ${levelIndex}`);
    const rooms = array(level.rooms, `Legacy DAT Sandbox hint level ${levelIndex} rooms`)
      .map((roomValue, roomIndex): HintRoom => {
        const room = record(roomValue, `Legacy DAT Sandbox hint room ${levelIndex}:${roomIndex}`);
        const targets = array(room.targets, `Legacy DAT Sandbox hint room ${levelIndex}:${roomIndex} targets`)
          .map((targetValue, targetIndex): HintTarget => {
            const target = record(
              targetValue,
              `Legacy DAT Sandbox hint target ${levelIndex}:${roomIndex}:${targetIndex}`,
            );
            if (target.kind !== "tile") {
              throw new Error("Legacy DAT Sandbox currently supports tile hint targets only.");
            }
            return {
              kind: "tile",
              x: integer(target.x, "Legacy DAT Sandbox hint x"),
              y: integer(target.y, "Legacy DAT Sandbox hint y"),
            };
          });
        if (targets.length === 0) {
          throw new Error(`Legacy DAT Sandbox room ${string(room.roomId, "room id")} has no hint targets.`);
        }
        return {
          roomId: string(room.roomId, "Legacy DAT Sandbox room id"),
          message: string(room.message, "Legacy DAT Sandbox room message"),
          targets,
        };
      });
    if (rooms.length === 0) throw new Error("Legacy DAT Sandbox hint levels must contain rooms.");
    return {
      entryOrdinal: integer(level.entryOrdinal, "Legacy DAT Sandbox hint entry ordinal", 1),
      expectedNumber: integer(level.expectedNumber, "Legacy DAT Sandbox expected level number", 1),
      expectedTitle: string(level.expectedTitle, "Legacy DAT Sandbox expected level title"),
      rooms,
    };
  });
  if (levels.length !== levelCount) {
    throw new Error(`Legacy DAT Sandbox hints declare ${levelCount} levels but contain ${levels.length}.`);
  }
  return {
    datSha256: sha256(dat.sha256, "Legacy DAT Sandbox DAT hash"),
    levelCount,
    levels,
  };
}

export function parseLegacyDatSandboxReplayIndex(bytes: Uint8Array): ReplayIndex {
  const root = record(parseJson(bytes, "Legacy DAT Sandbox replay index"), "Legacy DAT Sandbox replay index");
  if (root.schema !== "hybridcc.legacy-dat-sandbox.replay-index.v2") {
    throw new Error("Legacy DAT Sandbox replay index uses an unsupported schema.");
  }
  const parseScenarioIds = (value: unknown, label: string): string[] => {
    const scenarioIds = array(value, `${label} scenario IDs`).map((scenarioValue, scenarioIndex) => {
      const id = string(scenarioValue, `${label} scenario ID ${scenarioIndex}`);
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(id)) {
        throw new Error(`Legacy DAT Sandbox scenario ID is unsafe or unsupported: ${id}`);
      }
      return id;
    });
    if (scenarioIds.length === 0) {
      throw new Error(`${label} has no scenario IDs.`);
    }
    if (new Set(scenarioIds).size !== scenarioIds.length) {
      throw new Error(`${label} contains duplicate scenario IDs.`);
    }
    return scenarioIds;
  };
  const replays = array(root.replays, "Legacy DAT Sandbox replay index entries")
    .map((value, index): ReplayIndexEntry => {
      const replay = record(value, `Legacy DAT Sandbox replay ${index}`);
      const path = string(replay.path, `Legacy DAT Sandbox replay ${index} path`);
      if (!/^replays\/[0-9]+\.[0-9]+\.[0-9]+\/[a-z0-9][a-z0-9-]*\.hcr1$/u.test(path)) {
        throw new Error(`Legacy DAT Sandbox replay path is unsafe or unsupported: ${path}`);
      }
      if (replay.expectedOutcome !== "win" && replay.expectedOutcome !== "loss") {
        throw new Error(`Legacy DAT Sandbox replay ${index} has an invalid expected outcome.`);
      }
      const scenarioIds = parseScenarioIds(
        replay.scenarioIds,
        `Legacy DAT Sandbox replay ${index}`,
      );
      return {
        id: string(replay.id, `Legacy DAT Sandbox replay ${index} id`),
        scenarioIds,
        entryOrdinal: integer(replay.entryOrdinal, `Legacy DAT Sandbox replay ${index} entry ordinal`, 1),
        levelNumber: integer(replay.levelNumber, `Legacy DAT Sandbox replay ${index} level number`, 1),
        path,
        byteLength: integer(replay.byteLength, `Legacy DAT Sandbox replay ${index} byte length`, 1),
        sha256: sha256(replay.sha256, `Legacy DAT Sandbox replay ${index} hash`),
        levelContentSha256: sha256(
          replay.levelContentSha256,
          `Legacy DAT Sandbox replay ${index} level hash`,
        ),
        seed: integer(replay.seed, `Legacy DAT Sandbox replay ${index} seed`),
        finalBoundary: integer(
          replay.finalBoundary,
          `Legacy DAT Sandbox replay ${index} final boundary`,
          1,
        ),
        expectedOutcome: replay.expectedOutcome,
      };
    });
  const boundedProofs = array(
    root.boundedProofs,
    "Legacy DAT Sandbox bounded proof index entries",
  ).map((value, index): ReplayIndexBoundedProof => {
    const proof = record(value, `Legacy DAT Sandbox bounded proof ${index}`);
    if (proof.expectedOutcome !== "unfinished") {
      throw new Error(`Legacy DAT Sandbox bounded proof ${index} must have unfinished outcome.`);
    }
    if ("path" in proof) {
      throw new Error(`Legacy DAT Sandbox bounded proof ${index} must not name an HCR1 path.`);
    }
    return {
      id: string(proof.id, `Legacy DAT Sandbox bounded proof ${index} id`),
      scenarioIds: parseScenarioIds(
        proof.scenarioIds,
        `Legacy DAT Sandbox bounded proof ${index}`,
      ),
      entryId: string(proof.entryId, `Legacy DAT Sandbox bounded proof ${index} entry id`),
      entryOrdinal: integer(
        proof.entryOrdinal,
        `Legacy DAT Sandbox bounded proof ${index} entry ordinal`,
        1,
      ),
      levelNumber: integer(
        proof.levelNumber,
        `Legacy DAT Sandbox bounded proof ${index} level number`,
        1,
      ),
      inputSourceSha256: sha256(
        proof.inputSourceSha256,
        `Legacy DAT Sandbox bounded proof ${index} input-source hash`,
      ),
      levelContentSha256: sha256(
        proof.levelContentSha256,
        `Legacy DAT Sandbox bounded proof ${index} level hash`,
      ),
      seed: integer(proof.seed, `Legacy DAT Sandbox bounded proof ${index} seed`),
      verifiedThroughBoundary: integer(
        proof.verifiedThroughBoundary,
        `Legacy DAT Sandbox bounded proof ${index} verified boundary`,
      ),
      expectedOutcome: "unfinished",
    };
  });
  const replayIds = [...replays, ...boundedProofs].map((replay) => replay.id);
  const replayPaths = replays.map((replay) => replay.path);
  if (new Set(replayIds).size !== replayIds.length) {
    throw new Error("Legacy DAT Sandbox replay index contains duplicate proof IDs.");
  }
  if (new Set(replayPaths).size !== replayPaths.length) {
    throw new Error("Legacy DAT Sandbox replay index contains duplicate replay paths.");
  }
  return {
    datSha256: sha256(root.datSha256, "Legacy DAT Sandbox replay-index DAT hash"),
    hintSupplementSha256: sha256(
      root.hintSupplementSha256,
      "Legacy DAT Sandbox replay-index hint hash",
    ),
    ruleset: string(root.ruleset, "Legacy DAT Sandbox replay-index ruleset"),
    replays,
    boundedProofs,
  };
}

async function fetchBytes(fetcher: AssetFetcher, url: string, label: string): Promise<Uint8Array> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Could not load ${label} (${response.status}).`);
  return new Uint8Array(await response.arrayBuffer());
}

function replayAssetUrl(path: string): string {
  const key = `./assets/${path}`;
  const url = replayUrls[key];
  if (!url) throw new Error(`Legacy DAT Sandbox replay asset is not bundled: ${path}`);
  return url;
}

export function createLegacyDatSandboxAssetSource(
  fetcher: AssetFetcher = globalThis.fetch.bind(globalThis),
): LegacyDatSandboxAssetSource {
  return {
    assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
    loadDatBytes: () => fetchBytes(fetcher, datUrl, LEGACY_DAT_SANDBOX_FILENAME),
    loadHintBytes: () => fetchBytes(fetcher, hintsUrl, "Legacy DAT Sandbox hints"),
    loadReplayIndexBytes: () => fetchBytes(fetcher, replayIndexUrl, "Legacy DAT Sandbox replay index"),
    loadReplayBytes: (path) => fetchBytes(fetcher, replayAssetUrl(path), `Legacy DAT Sandbox ${path}`),
  };
}

function rulesetVersion(): string {
  const { major, minor, tweak } = HYBRIDCC_V1_ABI.ruleset;
  return `${major}.${minor}.${tweak}`;
}

function placementsForLevel(
  converted: HybridCcV1ConvertedLevel,
  hints: HintLevel,
): HybridCcV1HintPlacement[] {
  const native = converted.nativeLevel;
  if (
    converted.entryOrdinal !== hints.entryOrdinal
    || native.number !== hints.expectedNumber
    || native.title !== hints.expectedTitle
  ) {
    throw new Error(
      `Legacy DAT Sandbox hint identity does not match converted entry ${converted.entryOrdinal}.`,
    );
  }
  return hints.rooms.flatMap((room) => room.targets.map((target): HybridCcV1HintPlacement => {
    if (target.x >= native.width || target.y >= native.height) {
      throw new Error(
        `Legacy DAT Sandbox hint ${room.roomId} targets (${target.x},${target.y}) outside the level.`,
      );
    }
    return {
      cellIndex: target.y * native.width + target.x,
      text: room.message,
    };
  }));
}

export async function loadLegacyDatSandbox(
  module: HybridCcV1WasmModule,
  source: LegacyDatSandboxAssetSource,
  datBytes: Uint8Array,
  convertedLevels: readonly HybridCcV1ConvertedLevel[],
): Promise<LoadedLegacyDatSandbox> {
  if (source.assetId !== LEGACY_DAT_SANDBOX_ASSET_ID) {
    throw new Error("Legacy DAT Sandbox overlay rejected an unknown asset identity.");
  }
  const [hintBytes, replayIndexBytes, datHash] = await Promise.all([
    source.loadHintBytes(),
    source.loadReplayIndexBytes(),
    computeDatContentHash(datBytes),
  ]);
  const [hints, replayIndex, hintHash, replayIndexHash] = await Promise.all([
    Promise.resolve(parseLegacyDatSandboxHints(hintBytes)),
    Promise.resolve(parseLegacyDatSandboxReplayIndex(replayIndexBytes)),
    computeDatContentHash(hintBytes),
    computeDatContentHash(replayIndexBytes),
  ]);
  if (
    datHash !== LEGACY_DAT_SANDBOX_DAT_SHA256
    || hintHash !== LEGACY_DAT_SANDBOX_HINTS_SHA256
    || replayIndexHash !== LEGACY_DAT_SANDBOX_REPLAY_INDEX_SHA256
  ) {
    throw new Error("Legacy DAT Sandbox built-in assets do not match their pinned SHA-256 identities.");
  }
  if (datHash !== hints.datSha256 || datHash !== replayIndex.datSha256) {
    throw new Error("Legacy DAT Sandbox DAT bytes do not match their SHA-bound supplements.");
  }
  if (hintHash !== replayIndex.hintSupplementSha256) {
    throw new Error("Legacy DAT Sandbox hint JSON does not match its replay index.");
  }
  if (replayIndex.ruleset !== rulesetVersion()) {
    throw new Error(
      `Legacy DAT Sandbox replays target ruleset ${replayIndex.ruleset}; this player runs ${rulesetVersion()}.`,
    );
  }
  if (convertedLevels.length !== hints.levelCount) {
    throw new Error(
      `Legacy DAT Sandbox converted ${convertedLevels.length} levels; its hint supplement declares ${hints.levelCount}.`,
    );
  }

  const hintsByOrdinal = new Map(hints.levels.map((level) => [level.entryOrdinal, level]));
  const levels = convertedLevels.map((converted) => {
    const hintLevel = hintsByOrdinal.get(converted.entryOrdinal);
    if (!hintLevel) {
      throw new Error(`Legacy DAT Sandbox has no hints for entry ${converted.entryOrdinal}.`);
    }
    return {
      ...converted,
      nativeLevel: applyHybridCcV1HintOverlay(
        module,
        converted.nativeLevel,
        placementsForLevel(converted, hintLevel),
      ),
    };
  });
  const gameplayHashes = await Promise.all(
    levels.map((level) => computeDatContentHash(level.nativeLevel.encoded)),
  );
  const levelsByOrdinal = new Map(levels.map((level, index) => [
    level.entryOrdinal,
    { level, gameplayHash: gameplayHashes[index]! },
  ]));

  const referenceReplays = await Promise.all(replayIndex.replays.map(async (indexed) => {
    const matched = levelsByOrdinal.get(indexed.entryOrdinal);
    if (!matched || matched.level.nativeLevel.number !== indexed.levelNumber) {
      throw new Error(`Legacy DAT Sandbox replay ${indexed.id} names an unknown converted level.`);
    }
    if (matched.gameplayHash !== indexed.levelContentSha256) {
      throw new Error(
        `Legacy DAT Sandbox replay ${indexed.id} is not attached to the enriched canonical HCLV level.`,
      );
    }
    const bytes = await source.loadReplayBytes(indexed.path);
    if (bytes.byteLength !== indexed.byteLength || await computeDatContentHash(bytes) !== indexed.sha256) {
      throw new Error(`Legacy DAT Sandbox replay ${indexed.id} failed its byte identity check.`);
    }
    const decoded = decodeHybridCcV1Replay(module, bytes);
    if (
      decoded.header.randomSeed !== indexed.seed
      || decoded.header.finalBoundary !== BigInt(indexed.finalBoundary)
    ) {
      throw new Error(`Legacy DAT Sandbox replay ${indexed.id} disagrees with its index metadata.`);
    }
    const expectedOutcome = indexed.expectedOutcome === "win"
      ? HYBRID_CC_V1_OUTCOME.win
      : HYBRID_CC_V1_OUTCOME.loss;
    if (decoded.header.expectedOutcome.kind !== expectedOutcome) {
      throw new Error(`Legacy DAT Sandbox replay ${indexed.id} has the wrong terminal outcome.`);
    }
    const verification = verifyHybridCcV1Replay(module, matched.level.nativeLevel, bytes);
    if (verification.verifyStatus !== 0 || verification.hasDivergence) {
      throw new Error(
        `Legacy DAT Sandbox replay ${indexed.id} failed HCR1 verification (${verification.verifyStatus}).`,
      );
    }
    return {
      id: indexed.id,
      levelNumber: indexed.levelNumber,
      levelName: matched.level.nativeLevel.title,
      fileName: indexed.path.split("/").at(-1)!,
      gameplayHash: matched.gameplayHash,
      bytes,
      expectedOutcome: indexed.expectedOutcome,
    } satisfies LegacyDatSandboxReferenceReplay;
  }));

  const boundedProofs = replayIndex.boundedProofs.map((indexed): LegacyDatSandboxBoundedProof => {
    const matched = levelsByOrdinal.get(indexed.entryOrdinal);
    if (!matched || matched.level.nativeLevel.number !== indexed.levelNumber) {
      throw new Error(`Legacy DAT Sandbox bounded proof ${indexed.id} names an unknown converted level.`);
    }
    if (matched.gameplayHash !== indexed.levelContentSha256) {
      throw new Error(
        `Legacy DAT Sandbox bounded proof ${indexed.id} is not attached to the enriched canonical HCLV level.`,
      );
    }
    return {
      id: indexed.id,
      scenarioIds: indexed.scenarioIds,
      entryId: indexed.entryId,
      entryOrdinal: indexed.entryOrdinal,
      levelNumber: indexed.levelNumber,
      levelName: matched.level.nativeLevel.title,
      gameplayHash: matched.gameplayHash,
      inputSourceSha256: indexed.inputSourceSha256,
      seed: indexed.seed,
      verifiedThroughBoundary: indexed.verifiedThroughBoundary,
      expectedOutcome: indexed.expectedOutcome,
    };
  });

  for (const level of levels) {
    if (!referenceReplays.some((replay) => replay.levelNumber === level.nativeLevel.number)) {
      throw new Error(`Legacy DAT Sandbox level ${level.nativeLevel.number} has no reference replay.`);
    }
  }
  return { levels, gameplayHashes, referenceReplays, boundedProofs };
}
