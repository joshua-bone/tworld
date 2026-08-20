import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  encodeArtifact,
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  P6B_NAMED_REAL_CANARIES_V1,
  P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION,
  buildP6bPortfolioCanarySuite,
  type P6bPortfolioCanaryEvidenceV1,
  type P6bPortfolioCanaryInputV1,
  type P6bPortfolioCanarySuiteV1,
} from "@tworld/ccsolver/alignment";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import {
  analyzeTworldLegacySourceValidity,
} from "../sourceValidity/analyzeTworldLegacySourceValidity";
import {
  analyzeTworldSolverSourceScope,
  TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
} from "../sourceValidity/analyzeTworldSolverSourceScope";
import {
  P1B_PHASE_A_SYNTHETIC_SOURCES,
  type P1bSyntheticSourceV1,
} from "../p1b-curriculum/curriculumManifest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverLoadedLevelSource,
  TworldSolverManualStartSource,
} from "../runtime/tworldSolverRuntimeSource";

const VALIDITY_PATH = "ccsolver/corpus/p1b-validity-report.v1.json" as const;
const MEASURED_PATH = "ccsolver/corpus/p1b-measured-corpus.v1.json" as const;
const P6A_ROOT = "ccsolver/fixtures/golden/p6a/cclp1-001" as const;
const NORMALIZATION_PROFILE = "normalization:cc1-standard-v1" as const;

type ReadBytes = (absolutePath: string) => Promise<Uint8Array>;

export interface BuildP6bPortfolioCanariesOptions {
  readonly readBytes?: ReadBytes;
}

export interface P6bPortfolioEvidencePayloadV1 {
  readonly canaryId: string;
  readonly evidenceId: string;
  readonly evidenceKind: "source-eligibility" | "semantic-rejoin";
  readonly content: BlobReferenceV1;
  readonly payload: unknown;
}

export interface P6bPortfolioCanaryCompositionV1 {
  readonly suite: P6bPortfolioCanarySuiteV1;
  readonly evidencePayloads: readonly P6bPortfolioEvidencePayloadV1[];
}

type EvidencePayloadDraft = Omit<P6bPortfolioEvidencePayloadV1, "canaryId">;

type ValiditySourceMember = {
  readonly byteLength: number;
  readonly byteOffset: number;
  readonly ordinal: number;
  readonly sha256: string;
  readonly sourcePath: string;
};

type ValidityOccurrence = {
  readonly artifactOccurrenceId: string;
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly title: string;
  readonly paired: boolean;
  readonly sourceMembers: readonly ValiditySourceMember[];
  readonly validity: {
    readonly invalidCellCount: number;
    readonly issueCount: number;
    readonly status: string;
  };
};

type MeasuredCase = {
  readonly caseId: string;
  readonly occurrenceId: string;
  readonly comparison: {
    readonly status: string;
    readonly content: BlobReferenceV1;
  };
  readonly sourceValidity: {
    readonly issueCount: number;
    readonly status: string;
  };
};

type CheckedFileEntry = {
  readonly path: string;
  readonly mediaType: string;
  readonly content: BlobReferenceV1;
};

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function sha256Digest(value: string): BlobReferenceV1["digest"] {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error(`P6B runtime emitted a non-SHA-256 fingerprint: ${value}`);
  }
  return value as BlobReferenceV1["digest"];
}

function canonical(value: unknown): CanonicalJson {
  return canonicalizeJson(value as CanonicalJsonValue);
}

async function canonicalReference(
  value: unknown,
  sha256: WebCryptoSha256,
): Promise<BlobReferenceV1> {
  return referenceCanonicalJson(canonical(value), sha256);
}

async function readCanonical<T>(
  repositoryRoot: string,
  path: string,
  readBytes: ReadBytes,
): Promise<{ readonly bytes: Uint8Array; readonly value: T }> {
  const bytes = await readBytes(resolve(repositoryRoot, path));
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new Error(`P6B checked input is not JSON: ${path}`, { cause });
  }
  if (canonical(value) !== text) {
    throw new Error(`P6B checked input is not canonical JSON: ${path}`);
  }
  return { bytes, value: value as T };
}

function occurrence(
  report: { readonly occurrences?: readonly ValidityOccurrence[] },
  occurrenceId: string,
): ValidityOccurrence {
  const matches = report.occurrences?.filter((entry) => entry.occurrenceId === occurrenceId) ?? [];
  if (matches.length !== 1) throw new Error(`P6B validity occurrence is not unique: ${occurrenceId}`);
  const value = matches[0]!;
  if (
    value.paired !== true
    || value.validity.status !== "valid"
    || value.validity.issueCount !== 0
    || value.validity.invalidCellCount !== 0
    || value.sourceMembers.length !== 1
  ) {
    throw new Error(`P6B validity occurrence is not paired, exact, and standard-eligible: ${occurrenceId}`);
  }
  return value;
}

function measuredCase(
  report: { readonly cases?: readonly MeasuredCase[] },
  occurrenceId: string,
): MeasuredCase {
  const matches = report.cases?.filter((entry) => entry.occurrenceId === occurrenceId) ?? [];
  if (matches.length !== 1) throw new Error(`P6B measured case is not unique: ${occurrenceId}`);
  const value = matches[0]!;
  if (
    value.comparison.status !== "divergent"
    || value.sourceValidity.status !== "valid"
    || value.sourceValidity.issueCount !== 0
  ) {
    throw new Error(`P6B measured comparison for ${occurrenceId} must remain divergent and valid`);
  }
  return value;
}

function evidenceBindings(evidence: readonly P6bPortfolioCanaryEvidenceV1[]) {
  return evidence.map((entry) => ({ evidenceId: entry.evidenceId, evidence: entry }));
}

function assertScopePolicyIdentity(): void {
  if (P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION !== TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION) {
    throw new Error("P6B and runtime source-scope policy revisions disagree");
  }
}

async function eligibilityEvidence(input: {
  readonly evidenceId: string;
  readonly authority: "synthetic-fixture" | "checked-eligibility";
  readonly sourceContent: BlobReferenceV1;
  readonly validityValue: unknown;
  readonly scopeReport: ReturnType<typeof analyzeTworldSolverSourceScope>;
  readonly sha256: WebCryptoSha256;
  readonly evidencePayloads: EvidencePayloadDraft[];
}): Promise<P6bPortfolioCanaryEvidenceV1> {
  assertScopePolicyIdentity();
  if (input.scopeReport.status !== "eligible" || input.scopeReport.issues.length !== 0) {
    throw new Error(`P6B source eligibility is excluded: ${input.evidenceId}`);
  }
  const validityContent = await canonicalReference(input.validityValue, input.sha256);
  const scopeReportContent = await canonicalReference(input.scopeReport, input.sha256);
  const sourceEligibility = {
    kind: "standard-source-eligibility" as const,
    sourceContent: input.sourceContent,
    validityContent,
    scopeReportContent,
    scopePolicyRevision: P6B_STANDARD_SOURCE_SCOPE_POLICY_REVISION,
    status: "eligible" as const,
    expandedTileIssueCount: 0 as const,
    targetRulesets: ["ms", "lynx"] as const,
  };
  const payload = {
    receiptType: "p6b-standard-source-eligibility-receipt" as const,
    receiptVersion: 1 as const,
    sourceContent: input.sourceContent,
    validity: input.validityValue,
    scopeReport: input.scopeReport,
    receipt: sourceEligibility,
  };
  const content = await canonicalReference(payload, input.sha256);
  input.evidencePayloads.push({
    evidenceId: input.evidenceId,
    evidenceKind: "source-eligibility",
    content,
    payload,
  });
  return {
    evidenceId: input.evidenceId,
    evidenceKind: "source-eligibility",
    target: "cross-ruleset",
    authority: input.authority,
    content,
    sourceEligibility,
    semanticRejoin: null,
  };
}

function scope(eligibilityEvidenceId: string) {
  return {
    rulesets: ["ms", "lynx"] as const,
    vocabulary: "cc1-standard" as const,
    expandedTiles: "excluded" as const,
    eligibilityEvidenceId,
    normalizationProfile: NORMALIZATION_PROFILE,
  };
}

async function syntheticReferences(
  sourceId: string,
  sha256: WebCryptoSha256,
): Promise<{
  readonly source: P1bSyntheticSourceV1;
  readonly sourceContent: BlobReferenceV1;
  readonly datBytes: Uint8Array;
  readonly legacyValidity: ReturnType<typeof analyzeTworldLegacySourceValidity>;
  readonly scopeReport: ReturnType<typeof analyzeTworldSolverSourceScope>;
}> {
  const sources = P1B_PHASE_A_SYNTHETIC_SOURCES.filter((entry) => entry.sourceId === sourceId);
  if (sources.length !== 1) throw new Error(`P6B frozen synthetic source is not unique: ${sourceId}`);
  const source = sources[0]!;
  if (source.sourceId !== "source-phase-a-fork-rejoin") {
    throw new Error(`P6B synthetic DAT compiler is not frozen for ${source.sourceId}`);
  }
  const datBytes = buildForkRejoinDatBytes();
  const sourceContent = await referenceSourceBytes(datBytes, sha256);
  const legacyValidity = analyzeTworldLegacySourceValidity({ layerData: [datBytes] });
  const scopeReport = analyzeTworldSolverSourceScope({ layerData: [datBytes] });
  if (legacyValidity.status !== "valid" || scopeReport.status !== "eligible") {
    throw new Error("P6B fork/rejoin source failed actual standard eligibility");
  }
  return {
    source,
    sourceContent,
    datBytes,
    legacyValidity,
    scopeReport,
  };
}

function uint16(value: number): readonly [number, number] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function fileCodeForTile(tileId: number): number {
  const registration = msRegisteredLevelDecodeEntries.find((entry) => entry.tileId === tileId);
  if (registration === undefined) throw new Error(`P6B DAT compiler lacks tile ${tileId}`);
  return registration.fileCode;
}

function encodedPlane(overrides: ReadonlyMap<number, number>): readonly number[] {
  const fileCodes = Array.from({ length: 1_024 }, (_, position) => (
    fileCodeForTile(overrides.get(position) ?? MS_TILE.Empty)
  ));
  const encoded: number[] = [];
  for (let start = 0; start < fileCodes.length;) {
    const code = fileCodes[start]!;
    let count = 1;
    while (count < 255 && fileCodes[start + count] === code) count += 1;
    if (count === 1) encoded.push(code);
    else encoded.push(0xff, count, code);
    start += count;
  }
  return encoded;
}

/** Exact standard DAT for the frozen `.../P#E/...` fork/rejoin canary. */
export function buildP6bForkRejoinDatBytes(): Uint8Array {
  const upper = encodedPlane(new Map([
    [32, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
    [33, MS_TILE.Wall],
    [34, MS_TILE.Exit],
  ]));
  const lower = encodedPlane(new Map());
  const creaturePayload = [...uint16(32)];
  const metadata = [10, creaturePayload.length, ...creaturePayload];
  return Uint8Array.from([
    ...uint16(1), ...uint16(0), ...uint16(0), 0, 0,
    ...uint16(upper.length), ...upper,
    ...uint16(lower.length), ...lower,
    ...uint16(metadata.length), ...metadata,
  ]);
}

function buildForkRejoinDatBytes(): Uint8Array {
  return buildP6bForkRejoinDatBytes();
}

async function buildForkRuntimeSource(
  repositoryRoot: string,
  target: "ms" | "lynx",
  datBytes: Uint8Array,
  sha256: WebCryptoSha256,
): Promise<TworldSolverManualStartSource> {
  const template = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: target === "ms" ? "intro-ms.dac" : "intro-lynx.dac",
    levelNumber: 1,
    ruleset: target === "ms" ? "MS" : "Lynx",
    randomSeed: 0x1234_5678,
  });
  const loaded: TworldSolverLoadedLevelSource = {
    ...template,
    levelData: datBytes,
    layerData: [datBytes],
  };
  const common = {
    occurrenceId: "tworld:synthetic:source-phase-a-fork-rejoin",
    producerRevision: "ccsolver:p6b-fork-rejoin-v1",
    repository: "tworld",
    repositoryRevision: "ccsolver:p6b-fork-rejoin-v1",
    sourcePath: "synthetic:source-phase-a-fork-rejoin.dat",
    adapterRevision: "ccsolver:p6b-fork-rejoin-facts-v1",
    importProfileRevision: "ccsolver:p6b-fork-rejoin-import-v1",
    analyzerRevision: "ccsolver:p6b-fork-rejoin-analysis-v1",
    catalogRevision: "ccsolver:p6b-fork-rejoin-catalog-v1",
    containerBytes: datBytes,
    loaded,
  } as const;
  const levelFacts = target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  return {
    loaded,
    levelFacts,
    levelFactsContent: await referenceCanonicalJson(encodeArtifact(levelFacts.facts), sha256),
    provenance: {
      adapterId: target === "ms" ? "tworld-ms-solver-runtime" : "tworld-lynx-solver-runtime",
      adapterRevision: "ccsolver:p6b-fork-rejoin-runtime-v1",
      engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
      engineRevision: "ccsolver:p6b-fork-rejoin-engine-v1",
    },
    manualOptions: { stepping: target === "ms" ? 0 : null },
  };
}

async function executeSettledPath(input: {
  readonly target: "ms" | "lynx";
  readonly source: TworldSolverManualStartSource;
  readonly directions: readonly number[];
  readonly expected: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly continuation: readonly number[];
  readonly continuationExpected: readonly { readonly x: number; readonly y: number; readonly z: number }[];
  readonly sha256: WebCryptoSha256;
}) {
  const options = {
    sha256: input.sha256,
    adapterRevision: "ccsolver:p6b-fork-rejoin-runtime-v1",
    engineRevision: "ccsolver:p6b-fork-rejoin-engine-v1",
    maximumLiveRuns: 1,
    maximumLiveCheckpoints: 1,
  } as const;
  const runtime = input.target === "ms"
    ? createTworldMsSolverRuntimeAdapter(options)
    : createTworldLynxSolverRuntimeAdapter(options);
  const run = await runtime.startManual(input.source);
  const settle = async (
    direction: number,
    expected: { readonly x: number; readonly y: number; readonly z: number },
    transcript: { readonly kind: "manual-poll"; readonly inputCode: number }[],
  ) => {
    const directionRequest = { kind: "manual-poll" as const, inputCode: direction };
    transcript.push(directionRequest);
    await runtime.advanceTick(run, directionRequest);
    for (let polls = 0; polls < 8; polls += 1) {
      const observation = await runtime.observe(run);
      if (
        observation.player.coordinate?.x === expected.x
        && observation.player.coordinate.y === expected.y
        && observation.player.coordinate.z === expected.z
        && (observation.player.movement === "stationary" || observation.terminal.kind !== "running")
      ) return observation;
      const settleRequest = { kind: "manual-poll" as const, inputCode: GAME_INPUT_CODES.none };
      transcript.push(settleRequest);
      await runtime.advanceTick(run, settleRequest);
    }
    throw new Error(`${input.target} fork/rejoin move did not settle at ${expected.x},${expected.y}`);
  };
  try {
    const branchTranscript: { readonly kind: "manual-poll"; readonly inputCode: number }[] = [];
    const continuationTranscript: { readonly kind: "manual-poll"; readonly inputCode: number }[] = [];
    let boundary = await runtime.observe(run);
    for (let index = 0; index < input.directions.length; index += 1) {
      boundary = await settle(input.directions[index]!, input.expected[index]!, branchTranscript);
    }
    if (boundary.terminal.kind !== "running") {
      throw new Error(`${input.target} fork branch reached terminal before its rejoin`);
    }
    const rejoin = boundary;
    for (let index = 0; index < input.continuation.length; index += 1) {
      boundary = await settle(
        input.continuation[index]!,
        input.continuationExpected[index]!,
        continuationTranscript,
      );
    }
    if (boundary.terminal.kind !== "won") {
      throw new Error(`${input.target} fork continuation did not win`);
    }
    return { rejoin, terminal: boundary, branchTranscript, continuationTranscript };
  } finally {
    await runtime.disposeRun(run);
  }
}

async function executeCrossRulesetRejoin(
  repositoryRoot: string,
  datBytes: Uint8Array,
  sha256: WebCryptoSha256,
) {
  const gameplayState = (observation: any) => ({
    target: observation.target,
    level: observation.level,
    player: observation.player,
    actors: observation.actors,
    inventory: observation.inventory,
    remainingRequirements: observation.remainingRequirements,
    devices: observation.devices,
    terminal: observation.terminal,
  });
  const proofs = await Promise.all((["ms", "lynx"] as const).map(async (target) => {
    const runtimeSource = await buildForkRuntimeSource(repositoryRoot, target, datBytes, sha256);
    const commonContinuation = [GAME_INPUT_CODES.east, GAME_INPUT_CODES.east, GAME_INPUT_CODES.south];
    const continuationExpected = [
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
    ];
    const [left, right] = await Promise.all([
      executeSettledPath({
        target,
        source: runtimeSource,
        directions: [GAME_INPUT_CODES.north, GAME_INPUT_CODES.south, GAME_INPUT_CODES.north],
        expected: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }],
        continuation: commonContinuation,
        continuationExpected,
        sha256,
      }),
      executeSettledPath({
        target,
        source: runtimeSource,
        directions: [GAME_INPUT_CODES.south, GAME_INPUT_CODES.north, GAME_INPUT_CODES.north],
        expected: [{ x: 0, y: 2, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }],
        continuation: commonContinuation,
        continuationExpected,
        sha256,
      }),
    ]);
    const leftBoundaryGameplay = gameplayState(left.rejoin);
    const rightBoundaryGameplay = gameplayState(right.rejoin);
    const leftContinuationGameplay = gameplayState(left.terminal);
    const rightContinuationGameplay = gameplayState(right.terminal);
    if (canonical(leftBoundaryGameplay) !== canonical(rightBoundaryGameplay)) {
      throw new Error(`${target} executed fork branches did not rejoin at the same gameplay state: ${canonical({
        left: {
          tick: left.rejoin.boundary.nativeTick,
          exact: left.rejoin.fingerprints.exact,
          semantic: left.rejoin.fingerprints.semantic,
          player: left.rejoin.player,
          input: left.rejoin.input,
          randomness: left.rejoin.randomness,
        },
        right: {
          tick: right.rejoin.boundary.nativeTick,
          exact: right.rejoin.fingerprints.exact,
          semantic: right.rejoin.fingerprints.semantic,
          player: right.rejoin.player,
          input: right.rejoin.input,
          randomness: right.rejoin.randomness,
        },
      })}`);
    }
    if (left.rejoin.fingerprints.semantic !== right.rejoin.fingerprints.semantic) {
      throw new Error(`${target} executed fork branches did not have the same semantic fingerprint`);
    }
    if (canonical(leftContinuationGameplay) !== canonical(rightContinuationGameplay)) {
      throw new Error(`${target} executed common continuations did not reach the same gameplay terminal`);
    }
    const sourceContent = await referenceSourceBytes(datBytes, sha256);
    const boundary = async (
      observation: typeof left.rejoin,
      branch: "left" | "right",
      gameplayObservation: ReturnType<typeof gameplayState>,
      manualPollTranscript: readonly { readonly kind: "manual-poll"; readonly inputCode: number }[],
    ) => ({
      target,
      branch,
      directionWaypoints: branch === "left" ? ["north", "south", "north"] : ["south", "north", "north"],
      settlePolicy: { maximumZeroInputPollsPerWaypoint: 8, stop: "stationary-or-terminal" },
      manualPollTranscript,
      advanceCalls: manualPollTranscript.length,
      sourceContent,
      gameplayContent: await canonicalReference(gameplayObservation, sha256),
      gameplayObservation,
      semanticFingerprint: sha256Digest(observation.fingerprints.semantic),
      nativeExactFingerprint: sha256Digest(observation.fingerprints.exact),
      nativeTick: observation.boundary.nativeTick,
      coordinate: observation.player.coordinate,
      facing: observation.player.facing,
      terminal: observation.terminal,
    });
    const continuation = async (
      observation: typeof left.terminal,
      branch: "left" | "right",
      gameplayObservation: ReturnType<typeof gameplayState>,
      manualPollTranscript: readonly { readonly kind: "manual-poll"; readonly inputCode: number }[],
    ) => ({
      target,
      branch,
      directionWaypoints: ["east", "east", "south"],
      settlePolicy: { maximumZeroInputPollsPerWaypoint: 8, stop: "stationary-or-terminal" },
      manualPollTranscript,
      advanceCalls: manualPollTranscript.length,
      sourceContent,
      gameplayContent: await canonicalReference(gameplayObservation, sha256),
      gameplayObservation,
      semanticFingerprint: sha256Digest(observation.fingerprints.semantic),
      nativeExactFingerprint: sha256Digest(observation.fingerprints.exact),
      nativeTick: observation.boundary.nativeTick,
      terminal: observation.terminal,
    });
    const leftBoundary = await boundary(
      left.rejoin,
      "left",
      leftBoundaryGameplay,
      left.branchTranscript,
    );
    const rightBoundary = await boundary(
      right.rejoin,
      "right",
      rightBoundaryGameplay,
      right.branchTranscript,
    );
    const leftContinuation = await continuation(
      left.terminal,
      "left",
      leftContinuationGameplay,
      left.continuationTranscript,
    );
    const rightContinuation = await continuation(
      right.terminal,
      "right",
      rightContinuationGameplay,
      right.continuationTranscript,
    );
    if (
      !sameReference(leftBoundary.gameplayContent, rightBoundary.gameplayContent)
      || !sameReference(leftContinuation.gameplayContent, rightContinuation.gameplayContent)
    ) {
      throw new Error(`${target} canonical gameplay evidence did not remain byte-identical`);
    }
    return {
      targetEvidence: {
        target,
        leftBoundary: leftBoundary.gameplayContent,
        rightBoundary: rightBoundary.gameplayContent,
        boundariesEqual: true as const,
        leftSemanticFingerprint: leftBoundary.semanticFingerprint,
        rightSemanticFingerprint: rightBoundary.semanticFingerprint,
        semanticFingerprintsEqual: true as const,
        leftNativeExactFingerprint: leftBoundary.nativeExactFingerprint,
        rightNativeExactFingerprint: rightBoundary.nativeExactFingerprint,
        nativeExactFingerprintsEqual: (
          leftBoundary.nativeExactFingerprint === rightBoundary.nativeExactFingerprint
        ),
        leftContinuation: leftContinuation.gameplayContent,
        rightContinuation: rightContinuation.gameplayContent,
        continuationsEqual: true as const,
      },
      receipt: {
        target,
        sourceContent,
        branches: {
          left: { boundary: leftBoundary, continuation: leftContinuation },
          right: { boundary: rightBoundary, continuation: rightContinuation },
        },
        comparison: {
          boundaryGameplayEqual: true,
          boundarySemanticFingerprintsEqual: true,
          nativeExactFingerprintsEqual: (
            leftBoundary.nativeExactFingerprint === rightBoundary.nativeExactFingerprint
          ),
          executedContinuationGameplayEqual: true,
        },
      },
    };
  }));
  if (
    proofs[0]?.targetEvidence.target !== "ms"
    || proofs[0].targetEvidence.nativeExactFingerprintsEqual !== true
    || proofs[1]?.targetEvidence.target !== "lynx"
    || proofs[1].targetEvidence.nativeExactFingerprintsEqual !== false
  ) {
    throw new Error("P6B fork/rejoin target-native history pattern drifted (expected MS equal, Lynx divergent)");
  }
  return {
    targets: [proofs[0].targetEvidence, proofs[1].targetEvidence] as const,
    receipt: {
      proofKind: "real-engine-executed-cross-ruleset-semantic-rejoin",
      semanticBoundaryDefinition: "source-bound-canonical-dynamic-gameplay-projection-plus-semantic-fingerprint",
      branchDirectionWaypoints: {
        left: ["north", "south", "north"],
        right: ["south", "north", "north"],
      },
      continuationDirectionWaypoints: ["east", "east", "south"],
      completeManualPollTranscriptsPublished: true,
      anyNativeHistoryDivergence: proofs.some(({ targetEvidence }) => (
        !targetEvidence.nativeExactFingerprintsEqual
      )),
      targets: proofs.map(({ receipt }) => receipt),
    },
  };
}

async function buildLocalRouteCanary(
  sha256: WebCryptoSha256,
  evidencePayloads: EvidencePayloadDraft[],
): Promise<P6bPortfolioCanaryInputV1> {
  const source = await syntheticReferences("source-phase-a-fork-rejoin", sha256);
  const eligibilityId = "evidence:p6b:local-route:eligibility";
  const contract = {
    contractId: "contract:p6b:local-route:reach-exit",
    ensures: { coordinate: { x: 2, y: 1, z: 0 }, kind: "reach" },
    source: source.source.sourceId,
  };
  const msRoute = [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }];
  const lynxRoute = [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 1 }];
  const evidence: P6bPortfolioCanaryEvidenceV1[] = [
    await eligibilityEvidence({
      evidenceId: eligibilityId,
      authority: "synthetic-fixture",
      sourceContent: source.sourceContent,
      validityValue: source.legacyValidity,
      scopeReport: source.scopeReport,
      sha256,
      evidencePayloads,
    }),
    {
      evidenceId: "evidence:p6b:local-route:source",
      evidenceKind: "level-source",
      target: "cross-ruleset",
      authority: "synthetic-fixture",
      content: source.sourceContent,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:local-route:contract",
      evidenceKind: "subgoal-contract",
      target: "cross-ruleset",
      authority: "synthetic-fixture",
      content: await canonicalReference(contract, sha256),
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:local-route:route-ms",
      evidenceKind: "route",
      target: "ms",
      authority: "synthetic-fixture",
      content: await canonicalReference({ route: msRoute, routeRole: "upper-lane" }, sha256),
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:local-route:route-lynx",
      evidenceKind: "route",
      target: "lynx",
      authority: "synthetic-fixture",
      content: await canonicalReference({ route: lynxRoute, routeRole: "lower-lane" }, sha256),
      sourceEligibility: null,
      semanticRejoin: null,
    },
  ];
  return {
    canaryId: "canary:p6b:synthetic-local-route",
    case: {
      kind: "synthetic",
      caseId: "case:p6b:phase-a-local-route",
      occurrenceId: "phase-a/local-route",
      title: "Phase-A local-route variance",
      source: {
        kind: "synthetic",
        fixtureId: "fixture:phase-a-local-route",
        content: source.sourceContent,
      },
    },
    targetScope: scope(eligibilityId),
    expectedRelationship: "shared-subgoal-different-local-route",
    proposal: {
      familyId: "family:p6b:shared-reach-local-route",
      title: "Shared reach subgoal with target-local route realization",
    },
    evidence,
    dependencies: [{
      dependencyId: "dependency:p6b:local-route",
      kind: "local-route",
      targetRulesets: ["ms", "lynx"],
      evidenceIds: [
        "evidence:p6b:local-route:contract",
        "evidence:p6b:local-route:route-ms",
        "evidence:p6b:local-route:route-lynx",
      ],
    }],
    confidence: {
      level: "medium",
      basisEvidenceIds: [
        "evidence:p6b:local-route:contract",
        "evidence:p6b:local-route:route-ms",
        "evidence:p6b:local-route:route-lynx",
      ],
    },
    unresolvedGaps: [{
      gapId: "gap:p6b:local-route:synthetic-only",
      kind: "single-context-only",
      targetRulesets: ["ms", "lynx"],
      description: "This relationship canary is intentionally bounded to an authored synthetic source.",
    }],
    reviewState: { status: "unreviewed", evidenceBindings: evidenceBindings(evidence) },
  };
}

async function buildRejoinCanary(
  repositoryRoot: string,
  sha256: WebCryptoSha256,
  evidencePayloads: EvidencePayloadDraft[],
): Promise<P6bPortfolioCanaryInputV1> {
  const source = await syntheticReferences("source-phase-a-fork-rejoin", sha256);
  const eligibilityId = "evidence:p6b:fork-rejoin:eligibility";
  const executed = await executeCrossRulesetRejoin(repositoryRoot, source.datBytes, sha256);
  const evidence: P6bPortfolioCanaryEvidenceV1[] = [
    await eligibilityEvidence({
      evidenceId: eligibilityId,
      authority: "synthetic-fixture",
      sourceContent: source.sourceContent,
      validityValue: source.legacyValidity,
      scopeReport: source.scopeReport,
      sha256,
      evidencePayloads,
    }),
    {
      evidenceId: "evidence:p6b:fork-rejoin:source",
      evidenceKind: "level-source",
      target: "cross-ruleset",
      authority: "synthetic-fixture",
      content: source.sourceContent,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:fork-rejoin:routes",
      evidenceKind: "route",
      target: "cross-ruleset",
      authority: "synthetic-fixture",
      content: await canonicalReference({
        branches: {
          left: ["north", "south", "north"],
          right: ["south", "north", "north"],
        },
        continuation: ["east", "east", "south"],
      }, sha256),
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:fork-rejoin:semantic",
      evidenceKind: "rejoin-boundary",
      target: "cross-ruleset",
      authority: "authoritative",
      content: await canonicalReference(executed.receipt, sha256),
      sourceEligibility: null,
      semanticRejoin: {
        kind: "semantic-state-and-executed-continuation",
        targets: executed.targets,
      },
    },
  ];
  const semanticEvidence = evidence.find(({ evidenceId }) => (
    evidenceId === "evidence:p6b:fork-rejoin:semantic"
  ))!;
  evidencePayloads.push({
    evidenceId: semanticEvidence.evidenceId,
    evidenceKind: "semantic-rejoin",
    content: semanticEvidence.content,
    payload: executed.receipt,
  });
  return {
    canaryId: "canary:p6b:synthetic-proven-rejoin",
    case: {
      kind: "synthetic",
      caseId: "case:p6b:phase-a-fork-rejoin",
      occurrenceId: "phase-a/fork-rejoin",
      title: "Phase-A executed semantic fork rejoin",
      source: {
        kind: "synthetic",
        fixtureId: "fixture:phase-a-fork-rejoin",
        content: source.sourceContent,
      },
    },
    targetScope: scope(eligibilityId),
    expectedRelationship: "alternative-branches-proven-rejoin",
    proposal: {
      familyId: "family:p6b:equivalent-branch-rejoin",
      title: "Alternative branches with a shared gameplay-state rejoin",
    },
    evidence,
    dependencies: [{
      dependencyId: "dependency:p6b:fork-rejoin:semantic",
      kind: "branch-rejoin",
      targetRulesets: ["ms", "lynx"],
      evidenceIds: ["evidence:p6b:fork-rejoin:semantic", "evidence:p6b:fork-rejoin:routes"],
    }],
    confidence: {
      level: "medium",
      basisEvidenceIds: ["evidence:p6b:fork-rejoin:semantic"],
    },
    unresolvedGaps: [{
      gapId: "gap:p6b:fork-rejoin:synthetic-only",
      kind: "single-context-only",
      targetRulesets: ["ms", "lynx"],
      description: "Gameplay-state rejoin and equal executed continuation are proven only for the bounded synthetic fixture; target-native exact histories may differ.",
    }],
    reviewState: { status: "unreviewed", evidenceBindings: evidenceBindings(evidence) },
  };
}

async function checkedP6aReferences(
  repositoryRoot: string,
  readBytes: ReadBytes,
  sha256: WebCryptoSha256,
): Promise<ReadonlyMap<string, BlobReferenceV1>> {
  const manifest = await readCanonical<{
    readonly caseId: string;
    readonly files: readonly CheckedFileEntry[];
  }>(repositoryRoot, `${P6A_ROOT}/manifest.json`, readBytes);
  if (manifest.value.caseId !== "cclp1-001" || !Array.isArray(manifest.value.files)) {
    throw new Error("P6B checked P6A manifest identity drifted");
  }
  const required = [
    `${P6A_ROOT}/alignment.json`,
    `${P6A_ROOT}/lynx/causal-journal.json`,
    `${P6A_ROOT}/ms/causal-journal.json`,
    `${P6A_ROOT}/portfolio.json`,
  ];
  const references = new Map<string, BlobReferenceV1>();
  const values = new Map<string, any>();
  for (const path of required) {
    const entries = manifest.value.files.filter((entry) => entry.path === path);
    if (entries.length !== 1 || entries[0]!.mediaType !== "application/json") {
      throw new Error(`P6B checked P6A manifest lacks ${path}`);
    }
    const loaded = await readCanonical<any>(repositoryRoot, path, readBytes);
    const actual = await referenceSourceBytes(loaded.bytes, sha256);
    if (!sameReference(actual, entries[0]!.content)) {
      throw new Error(`P6B checked P6A evidence drifted: ${path}`);
    }
    if (path.endsWith("/alignment.json")) {
      const summary = loaded.value?.summary;
      if (
        loaded.value?.status !== "aligned"
        || !Number.isSafeInteger(summary?.nativeTimingDifferences)
        || summary.nativeTimingDifferences <= 0
        || summary.terminalAnchorsMatched !== true
        || summary.primaryMilestonesMatched !== 29
        || summary.divergentHardAnchors !== 0
        || summary.unmatchedHardAnchors !== 0
        || summary.divergentSpans !== 0
        || summary.unmatchedLeftEvents !== 0
        || summary.unmatchedRightEvents !== 0
        || summary.attributionGaps !== 0
        || loaded.value?.caseId !== "cclp1-001"
        || loaded.value?.leftTarget !== "ms"
        || loaded.value?.rightTarget !== "lynx"
      ) {
        throw new Error("P6B Key Pyramid alignment lacks complete shared-plan timing evidence");
      }
    }
    if (path.endsWith("/portfolio.json")) {
      const families = loaded.value?.families;
      const family = Array.isArray(families) && families.length === 1 ? families[0] : null;
      const targetEvidence = family?.targetEvidence;
      if (
        loaded.value?.preferredFamilyId !== "strategy:key-pyramid:checked-route"
        || family?.familyId !== "strategy:key-pyramid:checked-route"
        || family?.planShape !== "shared-plan"
        || family?.resolution !== "partially-verified"
        || family?.resolutionReason !== "aligned-causal-terminals"
        || canonical(family?.targetRulesets) !== canonical(["ms", "lynx"])
        || !Array.isArray(targetEvidence)
        || targetEvidence.length !== 2
        || targetEvidence[0]?.target !== "ms"
        || targetEvidence[0]?.terminalReached !== true
        || targetEvidence[1]?.target !== "lynx"
        || targetEvidence[1]?.terminalReached !== true
      ) {
        throw new Error("P6B Key Pyramid portfolio lacks its checked shared-plan semantics");
      }
    }
    references.set(path, actual);
    values.set(path, loaded.value);
  }
  const journals = (["ms", "lynx"] as const).map((target) => {
    const value = values.get(`${P6A_ROOT}/${target}/causal-journal.json`);
    if (
      value?.caseId !== "cclp1-001"
      || value?.target !== target
      || value?.mode !== "replay"
      || value?.terminal?.kind !== "won"
      || value?.checkpointRestoreSuffixEqual !== true
      || value?.deterministicRerunEqual !== true
      || value?.observerGameplayParity !== true
      || value?.integrity?.kind !== "complete"
      || value?.integrity?.overflow !== null
      || value?.proof?.donorReplayRead !== false
    ) {
      throw new Error(`P6B ${target} causal journal lacks complete independent checked semantics`);
    }
    return value;
  });
  if (
    canonical(journals[0].terminal.coordinate) !== canonical(journals[1].terminal.coordinate)
    || journals[0].terminal.exitPlacementId !== journals[1].terminal.exitPlacementId
    || journals[0].terminal.nativeTick === journals[1].terminal.nativeTick
  ) {
    throw new Error("P6B Key Pyramid journals do not close on one exit with target-native timing");
  }
  return references;
}

async function corpusSourceReference(
  repositoryRoot: string,
  member: ValiditySourceMember,
  readBytes: ReadBytes,
  sha256: WebCryptoSha256,
): Promise<{ readonly content: BlobReferenceV1; readonly bytes: Uint8Array }> {
  if (
    !Number.isSafeInteger(member.byteOffset)
    || !Number.isSafeInteger(member.byteLength)
    || member.byteOffset < 0
    || member.byteLength <= 0
    || !member.sourcePath.startsWith("data/")
  ) {
    throw new Error(`P6B source member metadata is invalid: ${member.sourcePath}`);
  }
  const container = await readBytes(resolve(repositoryRoot, member.sourcePath));
  const end = member.byteOffset + member.byteLength;
  if (end > container.byteLength) throw new Error(`P6B source member escapes its DAT: ${member.sourcePath}`);
  const bytes = container.slice(member.byteOffset, end);
  const actual = await referenceSourceBytes(bytes, sha256);
  const expected = { digest: `sha256:${member.sha256}`, byteLength: member.byteLength } as BlobReferenceV1;
  if (!sameReference(actual, expected)) throw new Error(`P6B source member identity drifted: ${member.sourcePath}`);
  return { content: actual, bytes };
}

async function buildKeyPyramidCanary(input: {
  readonly repositoryRoot: string;
  readonly validity: { readonly occurrences?: readonly ValidityOccurrence[] };
  readonly p6a: ReadonlyMap<string, BlobReferenceV1>;
  readonly readBytes: ReadBytes;
  readonly sha256: WebCryptoSha256;
  readonly evidencePayloads: EvidencePayloadDraft[];
}): Promise<P6bPortfolioCanaryInputV1> {
  const occurrenceValue = occurrence(input.validity, "cclp1/001");
  const member = occurrenceValue.sourceMembers[0]!;
  const validityContent = await canonicalReference(occurrenceValue, input.sha256);
  if (
    occurrenceValue.artifactOccurrenceId !== "tworld:cclp1:001"
    || occurrenceValue.caseId !== "case:sha256:35751e31472d608d0285a1cbdb9966b0920e92da6a250a40de33b65c8976719f"
    || occurrenceValue.occurrenceId !== "cclp1/001"
    || occurrenceValue.title !== "Key Pyramid"
    || member.sourcePath !== "data/CCLP1.dat"
    || member.ordinal !== 0
    || member.sha256 !== "888d46dc1e6863694579b5f34106cf84b267b7b2a837ec11f42cd2f6e0655071"
    || member.byteLength !== 424
    || !sameReference(validityContent, {
      digest: "sha256:3555b649b96ee4c03f1b335f17eef6d3215b474be4fcaaddbb15aa06a7bab121",
      byteLength: 603,
    })
  ) {
    throw new Error("P6B Key Pyramid P1B source/validity identity drifted from checked P6A evidence");
  }
  const sourceMember = await corpusSourceReference(
    input.repositoryRoot,
    member,
    input.readBytes,
    input.sha256,
  );
  const sourceContent = sourceMember.content;
  const scopeReport = analyzeTworldSolverSourceScope({ layerData: [sourceMember.bytes] });
  const eligibilityId = "evidence:p6b:key-pyramid:eligibility";
  const evidence: P6bPortfolioCanaryEvidenceV1[] = [
    await eligibilityEvidence({
      evidenceId: eligibilityId,
      authority: "checked-eligibility",
      sourceContent,
      validityValue: occurrenceValue,
      scopeReport,
      sha256: input.sha256,
      evidencePayloads: input.evidencePayloads,
    }),
    {
      evidenceId: "evidence:p6b:key-pyramid:source",
      evidenceKind: "level-source",
      target: "cross-ruleset",
      authority: "identity-only",
      content: sourceContent,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:key-pyramid:alignment",
      evidenceKind: "semantic-alignment",
      target: "cross-ruleset",
      authority: "checked-preview",
      content: input.p6a.get(`${P6A_ROOT}/alignment.json`)!,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: "evidence:p6b:key-pyramid:portfolio",
      evidenceKind: "strategy-portfolio",
      target: "cross-ruleset",
      authority: "checked-preview",
      content: input.p6a.get(`${P6A_ROOT}/portfolio.json`)!,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    ...(["ms", "lynx"] as const).map((target): P6bPortfolioCanaryEvidenceV1 => ({
      evidenceId: `evidence:p6b:key-pyramid:journal-${target}`,
      evidenceKind: "causal-journal",
      target,
      authority: "checked-preview",
      content: input.p6a.get(`${P6A_ROOT}/${target}/causal-journal.json`)!,
      sourceEligibility: null,
      semanticRejoin: null,
    })),
  ];
  return {
    canaryId: "canary:p6b:cclp1-001-key-pyramid",
    case: {
      kind: "corpus",
      caseId: occurrenceValue.caseId,
      occurrenceId: occurrenceValue.occurrenceId,
      title: occurrenceValue.title,
      source: {
        kind: "repository-level-member",
        path: member.sourcePath,
        ordinal: member.ordinal,
        content: sourceContent,
      },
    },
    targetScope: scope(eligibilityId),
    expectedRelationship: "shared-plan-different-timing",
    proposal: {
      familyId: "family:p6b:key-pyramid:shared-plan",
      title: "Shared semantic plan with target-native timing",
    },
    evidence,
    dependencies: [{
      dependencyId: "dependency:p6b:key-pyramid:timing",
      kind: "timing",
      targetRulesets: ["ms", "lynx"],
      evidenceIds: [
        "evidence:p6b:key-pyramid:alignment",
        "evidence:p6b:key-pyramid:journal-ms",
        "evidence:p6b:key-pyramid:journal-lynx",
      ],
    }],
    confidence: {
      level: "high",
      basisEvidenceIds: [
        "evidence:p6b:key-pyramid:alignment",
        "evidence:p6b:key-pyramid:portfolio",
        "evidence:p6b:key-pyramid:journal-ms",
        "evidence:p6b:key-pyramid:journal-lynx",
      ],
    },
    unresolvedGaps: [{
      gapId: "gap:p6b:key-pyramid:donor-support",
      kind: "donor-only-support",
      targetRulesets: ["ms", "lynx"],
      description: "The checked route remains paired full-input donor evidence, not donor-blind discovery.",
    }],
    reviewState: { status: "unreviewed", evidenceBindings: evidenceBindings(evidence) },
  };
}

async function buildNamedRealCanary(input: {
  readonly named: typeof P6B_NAMED_REAL_CANARIES_V1[keyof typeof P6B_NAMED_REAL_CANARIES_V1];
  readonly repositoryRoot: string;
  readonly validity: { readonly occurrences?: readonly ValidityOccurrence[] };
  readonly measured: { readonly cases?: readonly MeasuredCase[] };
  readonly readBytes: ReadBytes;
  readonly sha256: WebCryptoSha256;
  readonly evidencePayloads: EvidencePayloadDraft[];
}): Promise<P6bPortfolioCanaryInputV1> {
  const occurrenceValue = occurrence(input.validity, input.named.occurrenceId);
  const measuredValue = measuredCase(input.measured, input.named.occurrenceId);
  const member = occurrenceValue.sourceMembers[0]!;
  const sourceMember = await corpusSourceReference(
    input.repositoryRoot,
    member,
    input.readBytes,
    input.sha256,
  );
  const sourceContent = sourceMember.content;
  const scopeReport = analyzeTworldSolverSourceScope({ layerData: [sourceMember.bytes] });
  const validityContent = await canonicalReference(occurrenceValue, input.sha256);
  if (
    occurrenceValue.caseId !== input.named.caseId
    || occurrenceValue.title !== input.named.title
    || member.sourcePath !== input.named.sourceMember.path
    || member.ordinal !== input.named.sourceMember.ordinal
    || !sameReference(sourceContent, input.named.sourceMember.content)
    || !sameReference(validityContent, input.named.validityOccurrenceContent)
    || measuredValue.caseId !== input.named.caseId
    || !sameReference(measuredValue.comparison.content, input.named.staticComparisonContent)
  ) {
    throw new Error(`P6B named corpus identity drifted: ${input.named.occurrenceId}`);
  }
  const stem = input.named.occurrenceId.replace("/", "-");
  const eligibilityId = `evidence:p6b:${stem}:eligibility`;
  const staticId = `evidence:p6b:${stem}:static-comparison`;
  const evidence: P6bPortfolioCanaryEvidenceV1[] = [
    await eligibilityEvidence({
      evidenceId: eligibilityId,
      authority: "checked-eligibility",
      sourceContent,
      validityValue: occurrenceValue,
      scopeReport,
      sha256: input.sha256,
      evidencePayloads: input.evidencePayloads,
    }),
    {
      evidenceId: `evidence:p6b:${stem}:source`,
      evidenceKind: "level-source",
      target: "cross-ruleset",
      authority: "identity-only",
      content: sourceContent,
      sourceEligibility: null,
      semanticRejoin: null,
    },
    {
      evidenceId: staticId,
      evidenceKind: "static-comparison",
      target: "cross-ruleset",
      authority: "diagnostic-only",
      content: measuredValue.comparison.content,
      sourceEligibility: null,
      semanticRejoin: null,
    },
  ];
  return {
    canaryId: input.named.canaryId,
    case: {
      kind: "corpus",
      caseId: input.named.caseId,
      occurrenceId: input.named.occurrenceId,
      title: input.named.title,
      source: {
        kind: "repository-level-member",
        path: input.named.sourceMember.path,
        ordinal: input.named.sourceMember.ordinal,
        content: input.named.sourceMember.content,
      },
    },
    targetScope: scope(eligibilityId),
    expectedRelationship: "genuinely-different-plan",
    proposal: {
      familyId: `family:p6b:${stem}:different-plan`,
      title: `${input.named.title}: possible target-specific plans`,
    },
    evidence,
    dependencies: [{
      dependencyId: `dependency:p6b:${stem}:ruleset-plan`,
      kind: "ruleset-plan",
      targetRulesets: ["ms", "lynx"],
      evidenceIds: [staticId],
    }],
    confidence: { level: "low", basisEvidenceIds: [eligibilityId, staticId] },
    unresolvedGaps: [{
      gapId: `gap:p6b:${stem}:causal-evidence`,
      kind: "missing-independent-causal-evidence",
      targetRulesets: ["ms", "lynx"],
      description: "Static divergence is diagnostic; independent causal executions are still required before accepting a different-plan classification.",
    }],
    reviewState: { status: "unreviewed", evidenceBindings: evidenceBindings(evidence) },
  };
}

/** Builds P6B proposals plus the exact payloads behind their inspectable receipt references. */
export async function buildP6bPortfolioCanaryComposition(
  repositoryRoot: string,
  options: BuildP6bPortfolioCanariesOptions = {},
): Promise<P6bPortfolioCanaryCompositionV1> {
  const readBytes: ReadBytes = options.readBytes ?? (async (path) => (
    new Uint8Array(await readFile(path))
  ));
  const sha256 = new WebCryptoSha256();
  const evidencePayloads: EvidencePayloadDraft[] = [];
  const [validityInput, measuredInput, p6a] = await Promise.all([
    readCanonical<{ readonly occurrences?: readonly ValidityOccurrence[] }>(
      repositoryRoot,
      VALIDITY_PATH,
      readBytes,
    ),
    readCanonical<{ readonly cases?: readonly MeasuredCase[] }>(
      repositoryRoot,
      MEASURED_PATH,
      readBytes,
    ),
    checkedP6aReferences(repositoryRoot, readBytes, sha256),
  ]);
  const canaries = await Promise.all([
    buildKeyPyramidCanary({
      repositoryRoot,
      validity: validityInput.value,
      p6a,
      readBytes,
      sha256,
      evidencePayloads,
    }),
    buildLocalRouteCanary(sha256, evidencePayloads),
    buildRejoinCanary(repositoryRoot, sha256, evidencePayloads),
    buildNamedRealCanary({
      named: P6B_NAMED_REAL_CANARIES_V1.cclp3Level16,
      repositoryRoot,
      validity: validityInput.value,
      measured: measuredInput.value,
      readBytes,
      sha256,
      evidencePayloads,
    }),
    buildNamedRealCanary({
      named: P6B_NAMED_REAL_CANARIES_V1.cclp1Level67,
      repositoryRoot,
      validity: validityInput.value,
      measured: measuredInput.value,
      readBytes,
      sha256,
      evidencePayloads,
    }),
  ]);
  const suite = buildP6bPortfolioCanarySuite({
    suiteVersion: 1,
    suiteId: "suite:p6b:standard-portfolio-canaries",
    canaries,
  });
  const inspectable = evidencePayloads.map((payload) => {
    const matches = suite.canaries.filter((canary) => (
      canary.evidence.some(({ evidenceId, content }) => (
        evidenceId === payload.evidenceId && sameReference(content, payload.content)
      ))
    ));
    if (matches.length !== 1) {
      throw new Error(`P6B inspectable evidence payload is not bound once: ${payload.evidenceId}`);
    }
    return { canaryId: matches[0]!.canaryId, ...payload };
  }).sort((left, right) => (
    left.canaryId.localeCompare(right.canaryId) || left.evidenceId.localeCompare(right.evidenceId)
  ));
  if (
    inspectable.filter(({ evidenceKind }) => evidenceKind === "source-eligibility").length !== 5
    || inspectable.filter(({ evidenceKind }) => evidenceKind === "semantic-rejoin").length !== 1
  ) {
    throw new Error("P6B inspectable evidence payload coverage is incomplete");
  }
  return { suite, evidencePayloads: inspectable };
}

/** Builds P6B proposals only after rechecking every real evidence binding. */
export async function buildP6bPortfolioCanaries(
  repositoryRoot: string,
  options: BuildP6bPortfolioCanariesOptions = {},
): Promise<P6bPortfolioCanarySuiteV1> {
  return (await buildP6bPortfolioCanaryComposition(repositoryRoot, options)).suite;
}
