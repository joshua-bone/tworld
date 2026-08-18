import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type {
  P1bCorpusOccurrenceV1,
  P1bCorpusValidityReportV1,
} from "./corpusValidityReport";
import {
  assembleP1bMeasuredCorpusReport,
  selectP1bValidPairedCorpusOccurrences,
  type P1bCorpusMeasurementV1,
  type P1bMeasuredCorpusReportAnalysisRevisionsV1,
  type P1bMeasuredCorpusReportBundle,
} from "./measuredCorpusReport";

export const P1B_MAX_MEASUREMENT_PROCESSES = 8;

export interface P1bMeasuredCorpusShardInput {
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
  readonly measurement: P1bCorpusMeasurementV1;
  readonly signal: AbortSignal;
}

export interface BuildP1bMeasuredCorpusReportShardedInput {
  readonly validityReport: P1bCorpusValidityReportV1;
  readonly sha256: Sha256Port;
  readonly analysisRevisions: P1bMeasuredCorpusReportAnalysisRevisionsV1;
  readonly maxWorkers: number;
  /**
   * The production runner starts one process here. Tests can supply an in-process
   * adapter to prove that sharding changes scheduling, never report bytes.
   */
  readonly runShard: (
    input: P1bMeasuredCorpusShardInput,
  ) => Promise<readonly P1bMeasuredCorpusCaseV1[]>;
}

function requireWorkerCount(value: number): number {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > P1B_MAX_MEASUREMENT_PROCESSES
  ) {
    throw new Error(
      `max workers must be an integer from 1 through ${P1B_MAX_MEASUREMENT_PROCESSES}`,
    );
  }
  return value;
}

function partitionContiguously<T>(
  values: readonly T[],
  maximumPartitions: number,
): readonly (readonly T[])[] {
  const partitionCount = Math.min(maximumPartitions, values.length);
  return Array.from({ length: partitionCount }, (_, index) => {
    const start = Math.floor(index * values.length / partitionCount);
    const end = Math.floor((index + 1) * values.length / partitionCount);
    return values.slice(start, end);
  });
}

/**
 * Fans measurement out without giving workers the full validity report. The
 * parent validates and canonically assembles all compact case results only
 * after every shard has succeeded.
 */
export async function buildP1bMeasuredCorpusReportSharded(
  input: BuildP1bMeasuredCorpusReportShardedInput,
): Promise<P1bMeasuredCorpusReportBundle> {
  const maximumWorkers = requireWorkerCount(input.maxWorkers);
  const eligible = selectP1bValidPairedCorpusOccurrences(input.validityReport);
  const shards = partitionContiguously(eligible, maximumWorkers);
  const abortController = new AbortController();
  let firstFailure: { readonly error: unknown } | undefined;
  const measurement: P1bCorpusMeasurementV1 = {
    corpusRevision: input.validityReport.source.corpusRevision,
    artifactRepositoryId: input.validityReport.source.artifactRepositoryId,
    analysisRevisions: input.analysisRevisions,
  };
  const pending = shards.map(async (occurrences, shardIndex) => {
    try {
      return await input.runShard({
        shardIndex,
        shardCount: shards.length,
        occurrences,
        measurement,
        signal: abortController.signal,
      });
    } catch (error) {
      if (firstFailure === undefined) {
        firstFailure = { error };
        abortController.abort(error);
      }
      throw error;
    }
  });
  const settled = await Promise.allSettled(pending);
  if (firstFailure !== undefined) throw firstFailure.error;

  const cases = settled.flatMap((result) => {
    if (result.status !== "fulfilled") {
      throw result.reason;
    }
    return result.value;
  });
  return assembleP1bMeasuredCorpusReport({
    validityReport: input.validityReport,
    sha256: input.sha256,
    analysisRevisions: input.analysisRevisions,
    cases,
  });
}
