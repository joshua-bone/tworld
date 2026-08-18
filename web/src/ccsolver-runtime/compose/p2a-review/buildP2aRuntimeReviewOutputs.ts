import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  encodeArtifact,
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJson,
  type RulesetTargetV1,
} from "@tworld/ccsolver/domain";
import { parseSolutionFile, type SolutionFileEntry } from "@content/api/solution-file";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "../runtime/tworldSolverRuntimeSource";
import {
  buildIntro8RuntimeReviewPacket,
  buildKeyPyramidRuntimeReviewPacket,
  renderP2aRuntimeReviewMarkdown,
  type P2aDonorSource,
  type P2aRuntimeReviewPacket,
  type P2aRuntimeReviewSource,
} from "./buildP2aRuntimeReviewPacket";

const SOURCE_REVISION = "42c78d0db343621f887fefce581315479d9a8be3";
const ENGINE_REVISION = "49cf63da3dda99e65dff5136fbabd0f7a09ce72f";
const P2A_PRODUCER_REVISION = "ccsolver:p2a-runtime-review-v1";
const RUNTIME_ADAPTER_REVISIONS = {
  ms: "ccsolver:tworld-ms-solver-runtime:p2a-v1",
  lynx: "ccsolver:tworld-lynx-solver-runtime:p2a-v1",
} as const;
const KEY_PYRAMID_MAXIMUM_RESOURCE_TICKS = {
  ms: 1,
  lynx: 4,
} as const;
const INTRO_8_MAXIMUM_FOLLOWUP_TICKS = 4;
const MAXIMUM_PACKET_BYTES = 8 * 1_024 * 1_024;

const EXPECTED_LEVEL_FACTS = {
  "cclp1-001:ms": {
    digest: "sha256:2aef48efbebea5fca02e319b664ca24659167bf9a46eb46d8b1d8037b3ef1d08",
    byteLength: 643_247,
  },
  "cclp1-001:lynx": {
    digest: "sha256:ba94884e23d4b6921019b6161a3c14d28afc5a1ba277da2cb16151eabaf39673",
    byteLength: 647_864,
  },
  "intro-008:ms": {
    digest: "sha256:7e47dad913090cde1749a6200d54c3802a686656b6f5f1d2dfb250f4c84a5e28",
    byteLength: 695_871,
  },
  "intro-008:lynx": {
    digest: "sha256:9a637173bb6a29c9e6cbaa1b26fc0670dde0eba1e729e927c0c0cf76fb85002b",
    byteLength: 700_855,
  },
} as const;

const EXPECTED_SOURCE_FILES = {
  "cclp1-001:ms": {
    mapContent: {
      digest: "sha256:46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e",
      byteLength: 111_772,
    },
    seriesContent: {
      digest: "sha256:d0b660cadb896307c8e232874d0d332b1c19f481ea313115bab0b953a8423258",
      byteLength: 40,
    },
  },
  "cclp1-001:lynx": {
    mapContent: {
      digest: "sha256:46cc0aaa862c7cc5a63aea542eedf86836d6232b1180b3aece64d4de238cae5e",
      byteLength: 111_772,
    },
    seriesContent: {
      digest: "sha256:bc19e89be402c875659394f42e369d0f3615c1268e2300323a7a59991d61b86c",
      byteLength: 42,
    },
  },
  "intro-008:ms": {
    mapContent: {
      digest: "sha256:0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6",
      byteLength: 3_415,
    },
    seriesContent: {
      digest: "sha256:b358359609485c0a66ca33cbcaa9461fbfc2c5d10dc06a352dc363afc1c0c75e",
      byteLength: 26,
    },
  },
  "intro-008:lynx": {
    mapContent: {
      digest: "sha256:0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6",
      byteLength: 3_415,
    },
    seriesContent: {
      digest: "sha256:383ca01bf1c97b40330c3014577d6f37bd3397e070be09a80b8154e566ed0e95",
      byteLength: 28,
    },
  },
} as const;

const EXPECTED_KEY_PYRAMID_DONORS = {
  ms: {
    repositoryPath: "save/CCLP1.dac.tws",
    fileDigest: "sha256:2ace452b2857b9a9a74b3895c50396e4885641a9fbf2e19b0667d4fb75bde12f",
    fileByteLength: 46_980,
    entryDigest: "sha256:e51673644f7689900b590b8cecd864563039cfe93a490bf0296a925be7f10e7c",
    entryByteLength: 72,
    replayRandomSeed: 1_496_659_129,
    bestTimeNativeTicks: 644,
  },
  lynx: {
    repositoryPath: "save/CCLP1-lynx.dac.tws",
    fileDigest: "sha256:5bda2f73f3be57d93761aa891a361f57c71f34be03fc364a3f718b9b3339c109",
    fileByteLength: 101_014,
    entryDigest: "sha256:e4cafdf60950a7bfd05d2760ff63cebd460ba28fae41f97217b79921628d87a2",
    entryByteLength: 72,
    replayRandomSeed: 2_011_157_566,
    bestTimeNativeTicks: 648,
  },
} as const;

type CaseId = P2aRuntimeReviewPacket["caseId"];
type Operation = "check" | "write";

export type P2aRuntimeReviewOutput = {
  readonly path: string;
  readonly content: string;
  readonly mediaType: "application/json" | "text/markdown";
};

type SourceSpec = {
  readonly caseId: CaseId;
  readonly occurrenceId: string;
  readonly target: RulesetTargetV1;
  readonly mapPath: string;
  readonly seriesFile: string;
  readonly levelNumber: number;
  readonly randomSeed: number;
  readonly producerRevision: string;
  readonly factsAdapterRevision: string;
};

type LoadedSource = {
  readonly manualSource: TworldSolverManualStartSource;
  readonly summary: P2aRuntimeReviewSource;
};

const sha256 = new WebCryptoSha256();

function runtimeProvenance(target: RulesetTargetV1) {
  return {
    adapterId: target === "ms"
      ? "tworld-ms-solver-runtime"
      : "tworld-lynx-solver-runtime",
    adapterRevision: RUNTIME_ADAPTER_REVISIONS[target],
    engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
    engineRevision: ENGINE_REVISION,
  } as const;
}

function runtimeFor(target: RulesetTargetV1) {
  const revisionOptions = {
    sha256,
    adapterRevision: RUNTIME_ADAPTER_REVISIONS[target],
    engineRevision: ENGINE_REVISION,
    maximumLiveRuns: 2,
    maximumLiveCheckpoints: 1,
  };
  return target === "ms"
    ? createTworldMsSolverRuntimeAdapter(revisionOptions)
    : createTworldLynxSolverRuntimeAdapter(revisionOptions);
}

async function loadManualSource(
  repositoryRoot: string,
  spec: SourceSpec,
  randomSeedSemantics: P2aRuntimeReviewSource["randomSeedSemantics"],
): Promise<LoadedSource> {
  const ruleset = spec.target === "ms" ? "MS" : "Lynx";
  const repository = new NodeLevelRepository(repositoryRoot);
  const [loaded, containerBuffer, seriesBuffer] = await Promise.all([
    repository.loadLevel({
      seriesFile: spec.seriesFile,
      levelNumber: spec.levelNumber,
      ruleset,
      randomSeed: spec.randomSeed,
    }),
    readFile(resolve(repositoryRoot, spec.mapPath)),
    readFile(resolve(repositoryRoot, "sets", spec.seriesFile)),
  ]);
  const containerBytes = new Uint8Array(containerBuffer);
  const seriesBytes = new Uint8Array(seriesBuffer);
  const common = {
    occurrenceId: spec.occurrenceId,
    producerRevision: spec.producerRevision,
    repository: "tworld",
    repositoryRevision: SOURCE_REVISION,
    sourcePath: spec.mapPath,
    adapterRevision: spec.factsAdapterRevision,
    importProfileRevision: "tworld-legacy-dat-static:v1",
    analyzerRevision: "ccsolver-static-level-facts:p0c1-v1",
    catalogRevision: SOURCE_REVISION,
    containerBytes,
    loaded,
  } as const;
  const levelFacts = spec.target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  const levelFactsContent = await referenceCanonicalJson(
    encodeArtifact(levelFacts.facts),
    sha256,
  );
  const [mapContent, seriesContent] = await Promise.all([
    referenceSourceBytes(containerBytes, sha256),
    referenceSourceBytes(seriesBytes, sha256),
  ]);
  const expectedSource = EXPECTED_SOURCE_FILES[
    `${spec.caseId}:${spec.target}` as keyof typeof EXPECTED_SOURCE_FILES
  ];
  if (
    mapContent.digest !== expectedSource.mapContent.digest
    || mapContent.byteLength !== expectedSource.mapContent.byteLength
    || seriesContent.digest !== expectedSource.seriesContent.digest
    || seriesContent.byteLength !== expectedSource.seriesContent.byteLength
  ) {
    throw new Error(`${spec.caseId}/${spec.target} exact source files drifted`);
  }
  const expected = EXPECTED_LEVEL_FACTS[`${spec.caseId}:${spec.target}` as keyof typeof EXPECTED_LEVEL_FACTS];
  if (
    expected !== undefined
    && (levelFactsContent.digest !== expected.digest || levelFactsContent.byteLength !== expected.byteLength)
  ) {
    throw new Error(
      `${spec.caseId}/${spec.target} LevelFacts drifted from its checked authority: `
      + `${levelFactsContent.digest}/${levelFactsContent.byteLength}`,
    );
  }

  return {
    manualSource: {
      loaded,
      levelFacts,
      levelFactsContent,
      provenance: runtimeProvenance(spec.target),
      manualOptions: { stepping: spec.target === "ms" ? 0 : null },
    },
    summary: {
      repositoryRevision: SOURCE_REVISION,
      mapPath: spec.mapPath,
      mapContent,
      seriesFile: spec.seriesFile,
      seriesContent,
      levelNumber: spec.levelNumber,
      randomSeed: spec.randomSeed,
      randomSeedSemantics,
    },
  };
}

function requireDonorEntry(
  path: string,
  target: RulesetTargetV1,
  entries: readonly SolutionFileEntry[],
): SolutionFileEntry & {
  readonly bestTimeTicks: number;
  readonly solutionData: Uint8Array;
  readonly expandedSolution: NonNullable<SolutionFileEntry["expandedSolution"]>;
} {
  const matches = entries.filter(({ levelNumber }) => levelNumber === 1);
  if (matches.length !== 1) {
    throw new Error(`${path} must contain exactly one donor entry for level 1`);
  }
  const entry = matches[0]!;
  if (entry.bestTimeTicks === null || entry.solutionData === null || entry.expandedSolution === null) {
    throw new Error(`${path} level 1 does not contain an expanded ${target} replay`);
  }
  return entry as ReturnType<typeof requireDonorEntry>;
}

async function loadKeyPyramidDonor(repositoryRoot: string, target: RulesetTargetV1): Promise<{
  readonly donor: P2aDonorSource;
  readonly randomSeed: number;
  readonly replay: TworldSolverReplayStartSource["replay"];
}> {
  const expected = EXPECTED_KEY_PYRAMID_DONORS[target];
  const repositoryPath = expected.repositoryPath;
  const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, repositoryPath)));
  const parsed = parseSolutionFile(bytes);
  const expectedRuleset = target === "ms" ? "MS" : "Lynx";
  if (parsed.ruleset !== expectedRuleset) {
    throw new Error(`${repositoryPath} ruleset mismatch: expected ${expectedRuleset}`);
  }
  const entry = requireDonorEntry(repositoryPath, target, parsed.entries);
  const [fileContent, entryContent] = await Promise.all([
    referenceSourceBytes(bytes, sha256),
    referenceSourceBytes(entry.solutionData, sha256),
  ]);
  if (
    fileContent.digest !== expected.fileDigest
    || fileContent.byteLength !== expected.fileByteLength
    || entryContent.digest !== expected.entryDigest
    || entryContent.byteLength !== expected.entryByteLength
    || entry.password !== "VVGF"
    || entry.bestTimeTicks !== expected.bestTimeNativeTicks
    || entry.expandedSolution.randomSeed !== expected.replayRandomSeed
    || entry.expandedSolution.moves.length !== 162
  ) {
    throw new Error(`${repositoryPath} level 1 drifted from the pinned Key Pyramid donor`);
  }
  const randomSeed = entry.expandedSolution.randomSeed & 0x7fff_ffff;
  return {
    donor: {
      repositoryPath,
      fileContent,
      entryContent,
      bestTimeNativeTicks: entry.bestTimeTicks,
      replayRandomSeed: entry.expandedSolution.randomSeed,
      replayRandomSeedSemantics: "exact-donor-replay-uint32",
    },
    randomSeed,
    replay: {
      ...entry.expandedSolution,
      bestTimeTicks: entry.bestTimeTicks,
      modifierMasks: [],
    },
  };
}

function sourceSpec(
  caseId: CaseId,
  target: RulesetTargetV1,
  randomSeed: number,
): SourceSpec {
  if (caseId === "cclp1-001") {
    return {
      caseId,
      occurrenceId: "tworld:cclp1:001",
      target,
      mapPath: "data/CCLP1.dat",
      seriesFile: target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac",
      levelNumber: 1,
      randomSeed,
      producerRevision: "ccsolver:p1b-cross-ruleset-topology-v1",
      factsAdapterRevision: target === "ms"
        ? "tworld-ms-level-facts:p0c1-v1"
        : "tworld-lynx-level-facts:p1b-v1",
    };
  }
  return {
    caseId,
    occurrenceId: "tworld:intro:8",
    target,
    mapPath: "data/intro.dat",
    seriesFile: target === "ms" ? "intro-ms.dac" : "intro-lynx.dac",
    levelNumber: 8,
    randomSeed,
    producerRevision: target === "ms"
      ? "ccsolver:p1a-static-analysis-v1"
      : P2A_PRODUCER_REVISION,
    factsAdapterRevision: target === "ms"
      ? "tworld-ms-level-facts:p0c1-v1"
      : "tworld-lynx-level-facts:p1b-v1",
  };
}

function assertPacketBindings(
  packet: P2aRuntimeReviewPacket,
  expectedOccurrenceId: string,
): void {
  if (packet.reviewPoints.length !== 3) {
    throw new Error(`${packet.caseId}/${packet.target} must expose exactly three review points`);
  }
  for (const point of packet.reviewPoints) {
    if (point.observation.level.occurrenceId !== expectedOccurrenceId) {
      throw new Error(`${packet.caseId}/${packet.target} occurrence binding drifted`);
    }
    if (point.observation.levelFacts.digest !== packet.levelFacts.digest) {
      throw new Error(`${packet.caseId}/${packet.target} LevelFacts binding drifted between points`);
    }
    if (point.observation.cells.length !== 1_024 || point.render.cells.length !== 1_024) {
      throw new Error(`${packet.caseId}/${packet.target} full-map review must contain 1,024 cells`);
    }
  }
  if (packet.donor !== null) {
    const replayStart = packet.reviewPoints.find(({ reviewPointId }) => (
      reviewPointId === "donor-replay-start"
    ));
    if (replayStart?.observation.input.replayBestTimeTicks !== packet.donor.bestTimeNativeTicks) {
      throw new Error(`${packet.caseId}/${packet.target} donor deadline binding drifted`);
    }
    if (packet.reviewPoints.slice(1).some(({ evidenceRole }) => (
      evidenceRole !== "donor-runtime-characterization"
    ))) {
      throw new Error(`${packet.caseId}/${packet.target} donor point is mislabeled`);
    }
  }
}

async function buildKeyPyramidPacket(
  repositoryRoot: string,
  target: RulesetTargetV1,
): Promise<P2aRuntimeReviewPacket> {
  const donor = await loadKeyPyramidDonor(repositoryRoot, target);
  const source = await loadManualSource(
    repositoryRoot,
    sourceSpec("cclp1-001", target, donor.randomSeed),
    "manual-source-derived-from-donor-replay-uint31",
  );
  const packet = await buildKeyPyramidRuntimeReviewPacket({
    target,
    runtime: runtimeFor(target),
    manualSource: source.manualSource,
    replaySource: { level: source.manualSource, replay: donor.replay },
    source: source.summary,
    donor: donor.donor,
    maximumResourceSearchTicks: KEY_PYRAMID_MAXIMUM_RESOURCE_TICKS[target],
  });
  assertPacketBindings(packet, "tworld:cclp1:001");
  return packet;
}

async function buildIntro8Packet(
  repositoryRoot: string,
  target: RulesetTargetV1,
): Promise<P2aRuntimeReviewPacket> {
  const randomSeed = target === "ms" ? 123_456_789 : 362_436_069;
  const source = await loadManualSource(
    repositoryRoot,
    sourceSpec("intro-008", target, randomSeed),
    "manual-source-fixed-characterization",
  );
  const packet = await buildIntro8RuntimeReviewPacket({
    target,
    runtime: runtimeFor(target),
    manualSource: source.manualSource,
    source: source.summary,
    eastInputCode: GAME_INPUT_CODES.east,
    noInputCode: GAME_INPUT_CODES.none,
    maximumFollowupTicks: INTRO_8_MAXIMUM_FOLLOWUP_TICKS,
  });
  assertPacketBindings(packet, "tworld:intro:8");
  return packet;
}

function canonicalPacket(packet: P2aRuntimeReviewPacket): CanonicalJson {
  const canonical = canonicalizeJson(packet);
  const byteLength = new TextEncoder().encode(canonical).byteLength;
  if (byteLength > MAXIMUM_PACKET_BYTES) {
    throw new Error(
      `${packet.caseId}/${packet.target} packet exceeds ${MAXIMUM_PACKET_BYTES} bytes`,
    );
  }
  if (/(?:checkpointHandle|sessionToken|createdAt|generatedAt|\/Users\/)/u.test(canonical)) {
    throw new Error(`${packet.caseId}/${packet.target} packet leaked forbidden runtime metadata`);
  }
  return canonical;
}

export async function buildP2aRuntimeReviewOutputs(
  repositoryRoot: string,
): Promise<readonly P2aRuntimeReviewOutput[]> {
  const [keyMs, keyLynx, introMs, introLynx] = await Promise.all([
    buildKeyPyramidPacket(repositoryRoot, "ms"),
    buildKeyPyramidPacket(repositoryRoot, "lynx"),
    buildIntro8Packet(repositoryRoot, "ms"),
    buildIntro8Packet(repositoryRoot, "lynx"),
  ]);
  const packets = [keyMs, keyLynx, introMs, introLynx] as const;
  const outputs: P2aRuntimeReviewOutput[] = packets.map((packet) => ({
    path: `ccsolver/fixtures/golden/p2a/${packet.caseId}/${packet.target}/runtime-review.json`,
    content: canonicalPacket(packet),
    mediaType: "application/json",
  }));
  outputs.push(
    {
      path: "ccsolver/fixtures/golden/p2a/cclp1-001/review.md",
      content: renderP2aRuntimeReviewMarkdown([keyMs, keyLynx]),
      mediaType: "text/markdown",
    },
    {
      path: "ccsolver/fixtures/golden/p2a/intro-008/review.md",
      content: renderP2aRuntimeReviewMarkdown([introMs, introLynx]),
      mediaType: "text/markdown",
    },
  );
  return outputs.sort((left, right) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  ));
}

function outputPath(repositoryRoot: string, path: string): string {
  const resolved = resolve(repositoryRoot, path);
  const withinRoot = relative(repositoryRoot, resolved);
  if (
    withinRoot.length === 0
    || withinRoot === ".."
    || withinRoot.startsWith("../")
    || withinRoot.startsWith("..\\")
    || isAbsolute(withinRoot)
  ) {
    throw new Error(`P2A output escapes the repository root: ${path}`);
  }
  return resolved;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function writeOutputsTransactionally(
  repositoryRoot: string,
  outputs: readonly P2aRuntimeReviewOutput[],
): Promise<void> {
  const targets = outputs.map((output) => outputPath(repositoryRoot, output.path));
  if (new Set(targets).size !== targets.length) {
    throw new Error("P2A runtime review outputs contain duplicate paths");
  }
  const stagingDirectory = await mkdtemp(resolve(repositoryRoot, ".p2a-review-output-"));
  const staged: string[] = [];
  const backups = new Map<number, string>();
  const promoted = new Set<number>();
  let preserveStagingDirectory = false;
  try {
    for (let index = 0; index < outputs.length; index += 1) {
      const stagedPath = resolve(stagingDirectory, "new", String(index));
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, outputs[index]!.content, "utf8");
      staged.push(stagedPath);
    }

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]!;
      const backup = resolve(stagingDirectory, "old", String(index));
      await mkdir(dirname(target), { recursive: true });
      await mkdir(dirname(backup), { recursive: true });
      try {
        await rename(target, backup);
        backups.set(index, backup);
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
      await rename(staged[index]!, target);
      promoted.add(index);
    }
  } catch (error) {
    const rollbackFailures: unknown[] = [];
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      try {
        if (promoted.has(index)) await rm(targets[index]!, { force: true });
        const backup = backups.get(index);
        if (backup !== undefined) await rename(backup, targets[index]!);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError);
      }
    }
    if (rollbackFailures.length > 0) {
      preserveStagingDirectory = true;
      throw new AggregateError(
        [error, ...rollbackFailures],
        `P2A output transaction and rollback failed; recovery data remains at ${stagingDirectory}`,
      );
    }
    throw error;
  } finally {
    if (!preserveStagingDirectory) {
      await rm(stagingDirectory, { recursive: true, force: true });
    }
  }
}

export async function applyP2aRuntimeReviewOutputs(
  repositoryRoot: string,
  operation: Operation,
  outputs: readonly P2aRuntimeReviewOutput[],
): Promise<void> {
  if (operation === "write") {
    await writeOutputsTransactionally(repositoryRoot, outputs);
    return;
  }
  for (const output of outputs) {
    const path = outputPath(repositoryRoot, output.path);
    let checked: string;
    try {
      checked = await readFile(path, "utf8");
    } catch (error) {
      throw new Error(`checked P2A runtime review output is missing: ${output.path}`, {
        cause: error,
      });
    }
    if (checked !== output.content) {
      throw new Error(`checked P2A runtime review output is stale: ${output.path}`);
    }
  }
}

export const P2A_RUNTIME_REVIEW_BOUNDS = Object.freeze({
  keyPyramidMaximumResourceTicks: KEY_PYRAMID_MAXIMUM_RESOURCE_TICKS,
  intro8MaximumFollowupTicks: INTRO_8_MAXIMUM_FOLLOWUP_TICKS,
});
