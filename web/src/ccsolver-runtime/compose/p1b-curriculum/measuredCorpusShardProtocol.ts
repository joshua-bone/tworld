import type { P1bMeasuredCorpusCaseV1 } from "./curriculumManifest";
import type { P1bCorpusOccurrenceV1 } from "./corpusValidityReport";
import type { P1bCorpusMeasurementV1 } from "./measuredCorpusReport";

export const P1B_SHARD_REQUEST_ARTIFACT =
  "ccsolver-p1b-measurement-shard-request";
export const P1B_SHARD_RESULT_ARTIFACT =
  "ccsolver-p1b-measurement-shard-result";

export interface P1bMeasurementShardRequestV1 {
  readonly artifact: typeof P1B_SHARD_REQUEST_ARTIFACT;
  readonly version: 1;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly measurement: P1bCorpusMeasurementV1;
  readonly occurrences: readonly P1bCorpusOccurrenceV1[];
}

export interface P1bMeasurementShardResultV1 {
  readonly artifact: typeof P1B_SHARD_RESULT_ARTIFACT;
  readonly version: 1;
  readonly shardIndex: number;
  readonly shardCount: number;
  readonly cases: readonly P1bMeasuredCorpusCaseV1[];
  /** Process diagnostics are deliberately outside every checked artifact. */
  readonly diagnostics: {
    readonly elapsedMilliseconds: number;
    readonly maxRssKibibytes: number;
  };
}
