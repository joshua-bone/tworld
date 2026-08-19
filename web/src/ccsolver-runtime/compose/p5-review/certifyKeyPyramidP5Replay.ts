import type { GameTrace } from "@game-core/api/types";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
  type PlanReferenceV1,
} from "@tworld/ccsolver/domain";
import type { ExpandedSolutionData } from "@content/api/solutionDataCodec";
import {
  contractSolutionData,
  parseSolutionFile,
  serializeSolutionFile,
} from "@content/api/solution-file";
import { collectTraceMismatches } from "@replay-verifier/impl/engine/comparators/traceComparison";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { TworldSolverReplayPayload } from "../runtime/tworldSolverRuntimeSource";
import type { KeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import {
  runExactKeyPyramidNativeReplay,
  type ExactKeyPyramidNativeReplayExecutor,
} from "./runExactKeyPyramidNativeReplay";

export type KeyPyramidP5Target = "ms" | "lynx";

export type CompleteKeyPyramidSolutionFileV1 = {
  readonly bytes: Uint8Array;
  readonly audit: {
    readonly format: "tws";
    readonly entryCount: 1;
    readonly moveCount: number;
    readonly payloadRoundTripExact: true;
    readonly fullFileRoundTripExact: true;
  };
};

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) {
    return false;
  }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function canonicalTrace(trace: GameTrace) {
  // The legacy MS projection can surface IEEE -0 for the pre-tick elapsed
  // time. JSON has no distinct negative-zero value, so checked diagnostic
  // trace content uses the standard JSON normalization to 0.
  return canonicalizeJson(
    JSON.parse(JSON.stringify(trace)) as CanonicalJsonValue,
  );
}

function assertOrdinaryReplay(replay: TworldSolverReplayPayload): void {
  if (replay.modifierMasks?.some((mask) => mask !== 0)) {
    throw new Error("ordinary TWS cannot carry modifier masks");
  }
  if (
    replay.flags !== 0
    || replay.randomSeed !== 0
    || replay.randomSlideDirection !== 1
    || replay.stepping !== 0
    || replay.bestTimeTicks !== 700
    || replay.moves.length === 0
  ) {
    throw new Error("Key Pyramid P5 replay initialization drifted");
  }
}

export function buildCompleteKeyPyramidSolutionFile(
  target: KeyPyramidP5Target,
  replay: TworldSolverReplayPayload,
): CompleteKeyPyramidSolutionFileV1 {
  assertOrdinaryReplay(replay);
  const ruleset = target === "ms" ? "MS" as const : "Lynx" as const;
  const setName = target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac";
  const expandedSolution: ExpandedSolutionData = {
    flags: replay.flags,
    randomSlideDirection: replay.randomSlideDirection,
    stepping: replay.stepping,
    randomSeed: replay.randomSeed,
    moves: replay.moves.map(({ when, dir }) => ({ when, dir })),
  };
  const payload = contractSolutionData(1, "VVGF", replay.bestTimeTicks, expandedSolution);
  const bytes = serializeSolutionFile({
    ruleset,
    flags: 0,
    extraHeader: new Uint8Array(),
    setName,
    entries: [{
      levelNumber: 1,
      password: "VVGF",
      bestTimeTicks: replay.bestTimeTicks,
      solutionData: null,
      expandedSolution,
    }],
  });
  const parsed = parseSolutionFile(bytes);
  const parsedEntry = parsed.entries[0];
  if (
    parsed.ruleset !== ruleset
    || parsed.flags !== 0
    || parsed.extraHeader.byteLength !== 0
    || parsed.setName !== setName
    || parsed.entries.length !== 1
    || parsedEntry === undefined
    || parsedEntry.levelNumber !== 1
    || parsedEntry.password !== "VVGF"
    || parsedEntry.bestTimeTicks !== replay.bestTimeTicks
    || parsedEntry.solutionData === null
    || parsedEntry.expandedSolution === null
  ) {
    throw new Error(`${target} complete TWS parse audit failed`);
  }
  const reconstructedPayload = contractSolutionData(
    parsedEntry.levelNumber,
    parsedEntry.password,
    parsedEntry.bestTimeTicks,
    parsedEntry.expandedSolution,
  );
  if (!bytesEqual(payload, parsedEntry.solutionData) || !bytesEqual(payload, reconstructedPayload)) {
    throw new Error(`${target} TWS payload did not round-trip exactly`);
  }
  const reserialized = serializeSolutionFile(parsed);
  if (!bytesEqual(bytes, reserialized)) {
    throw new Error(`${target} complete TWS bytes did not round-trip exactly`);
  }
  return {
    bytes,
    audit: {
      format: "tws",
      entryCount: 1,
      moveCount: replay.moves.length,
      payloadRoundTripExact: true,
      fullFileRoundTripExact: true,
    },
  };
}

export function assertCertifiedTracePair(
  typescriptTrace: GameTrace,
  nativeTrace: GameTrace,
): {
  readonly result: "win";
  readonly terminalTick: number;
  readonly mismatchCount: 0;
} {
  if (typescriptTrace.result.status !== "completed") {
    throw new Error(`TypeScript replay did not complete: ${typescriptTrace.result.status}`);
  }
  if (nativeTrace.result.status !== "completed") {
    throw new Error(`native replay did not complete: ${nativeTrace.result.status}`);
  }
  if (typescriptTrace.result.finalTick !== nativeTrace.result.finalTick) {
    throw new Error(
      `TypeScript/native terminal ticks disagree: `
      + `${typescriptTrace.result.finalTick} != ${nativeTrace.result.finalTick}`,
    );
  }
  const mismatches: Parameters<typeof collectTraceMismatches>[3] = [];
  collectTraceMismatches(typescriptTrace, nativeTrace, "$", mismatches, 25);
  if (mismatches.length !== 0) {
    throw new Error(`TypeScript/native trace mismatch: ${JSON.stringify(mismatches[0])}`);
  }
  return {
    result: "win",
    terminalTick: typescriptTrace.result.finalTick,
    mismatchCount: 0,
  };
}

export type KeyPyramidP5ReplayCertificationV1 = {
  readonly certificationType: "p5-key-pyramid-replay-certification";
  readonly certificationVersion: 1;
  readonly target: KeyPyramidP5Target;
  readonly plan: PlanReferenceV1;
  readonly replay: {
    readonly format: "tws";
    readonly content: BlobReferenceV1;
    readonly setName: "CCLP1-MS.dac" | "CCLP1-Lynx.dac";
    readonly levelNumber: 1;
    readonly password: "VVGF";
    readonly bestTimeTicks: 700;
    readonly moveCount: number;
    readonly payloadRoundTripExact: true;
    readonly fullFileRoundTripExact: true;
  };
  readonly verification: {
    readonly typescript: {
      readonly toolRevision: "tworld-typescript-replay:p5-v1";
      readonly traceContent: BlobReferenceV1;
      readonly result: "win";
      readonly terminalTick: number;
    };
    readonly nativeOracle: {
      readonly toolRevision: "tworld-native-oracle-exact-file:p5-v1";
      readonly traceContent: BlobReferenceV1;
      readonly result: "win";
      readonly terminalTick: number;
      readonly isolatedSaveDirectory: true;
      readonly solutionFilename: string;
      readonly exactInputBytesRead: true;
    };
    readonly exactTraceParity: true;
    readonly mismatchCount: 0;
  };
};

export async function certifyKeyPyramidP5Replay(input: {
  readonly repositoryRoot: string;
  readonly oraclePath: string;
  readonly source: KeyPyramidRuntimeSource;
  readonly replay: TworldSolverReplayPayload;
  readonly plan: PlanReferenceV1;
  readonly nativeExecute?: ExactKeyPyramidNativeReplayExecutor;
  readonly sha256?: WebCryptoSha256;
}): Promise<{
  readonly twsBytes: Uint8Array;
  readonly report: KeyPyramidP5ReplayCertificationV1;
}> {
  const sha256 = input.sha256 ?? new WebCryptoSha256();
  if (
    input.plan.artifact.protocolVersion !== 1
    || input.plan.artifact.artifactType !== "expanded-plan"
    || input.plan.artifact.schemaVersion !== 1
    || input.plan.goalId === null
    || input.plan.subgoalId !== null
  ) {
    throw new Error(`${input.source.target} P5 certification requires one expanded-plan root`);
  }
  const built = buildCompleteKeyPyramidSolutionFile(input.source.target, input.replay);
  const parsed = parseSolutionFile(built.bytes);
  const entry = parsed.entries[0];
  if (entry?.expandedSolution === null || entry?.bestTimeTicks === null) {
    throw new Error(`${input.source.target} generated TWS has no complete replay entry`);
  }
  const request = {
    seriesFile: input.source.seriesFile,
    levelNumber: 1,
    ruleset: input.source.target === "ms" ? "MS" as const : "Lynx" as const,
    randomSeed: entry.expandedSolution.randomSeed,
  };
  const replay = {
    ...entry.expandedSolution,
    bestTimeTicks: entry.bestTimeTicks,
    modifierMasks: [],
  };
  const candidate = input.source.target === "ms"
    ? new MsGameEngineAdapter(new NodeLevelRepository(input.repositoryRoot))
    : new LynxGameEngineAdapter(new NodeLevelRepository(input.repositoryRoot));
  const [typescriptTrace, nativeResult] = await Promise.all([
    candidate.runReplayTrace(request, replay, 740),
    runExactKeyPyramidNativeReplay({
      repositoryRoot: input.repositoryRoot,
      oraclePath: input.oraclePath,
      target: input.source.target,
      twsBytes: built.bytes,
      maximumTicks: 740,
      execute: input.nativeExecute,
    }),
  ]);
  const verification = assertCertifiedTracePair(typescriptTrace, nativeResult.trace);
  const [content, typescriptTraceContent, nativeTraceContent] = await Promise.all([
    referenceSourceBytes(built.bytes, sha256),
    referenceCanonicalJson(canonicalTrace(typescriptTrace), sha256),
    referenceCanonicalJson(canonicalTrace(nativeResult.trace), sha256),
  ]);
  return {
    twsBytes: built.bytes,
    report: {
      certificationType: "p5-key-pyramid-replay-certification",
      certificationVersion: 1,
      target: input.source.target,
      plan: input.plan,
      replay: {
        format: "tws",
        content,
        setName: input.source.seriesFile,
        levelNumber: 1,
        password: "VVGF",
        bestTimeTicks: 700,
        moveCount: input.replay.moves.length,
        payloadRoundTripExact: true,
        fullFileRoundTripExact: true,
      },
      verification: {
        typescript: {
          toolRevision: "tworld-typescript-replay:p5-v1",
          traceContent: typescriptTraceContent,
          result: "win",
          terminalTick: verification.terminalTick,
        },
        nativeOracle: {
          toolRevision: "tworld-native-oracle-exact-file:p5-v1",
          traceContent: nativeTraceContent,
          result: "win",
          terminalTick: verification.terminalTick,
          isolatedSaveDirectory: nativeResult.audit.isolatedSaveDirectory,
          solutionFilename: nativeResult.audit.solutionFilename,
          exactInputBytesRead: nativeResult.audit.exactInputBytesRead,
        },
        exactTraceParity: true,
        mismatchCount: verification.mismatchCount,
      },
    },
  };
}
