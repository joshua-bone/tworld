import type { CanonicalJsonValue } from "../domain/canonicalJson.js";
import type {
  SolverCheckpointMetadata,
  SolverObservation,
  SolverRenderProjection,
  SolverRenderRegionRequest,
  SolverTerminalResult,
} from "../domain/runtime/index.js";

declare const solverRunHandleBrand: unique symbol;
declare const solverCheckpointHandleBrand: unique symbol;

/** Opaque live-run authority. It is never canonical artifact content. */
export type SolverRunHandle = {
  readonly [solverRunHandleBrand]: "SolverRunHandle";
};

/** Opaque exact-checkpoint authority. It is never canonical artifact content. */
export type SolverCheckpointHandle = {
  readonly [solverCheckpointHandleBrand]: "SolverCheckpointHandle";
};

export type SolverCheckpoint = {
  readonly handle: SolverCheckpointHandle;
  readonly metadata: SolverCheckpointMetadata;
};

export type SolverAdvanceRequest =
  | {
      /** One native manual input poll. The adapter owns input-code interpretation. */
      readonly kind: "manual-poll";
      readonly inputCode: number;
    }
  | {
      /** No external input: the run's replay stream owns this native tick. */
      readonly kind: "replay-tick";
    };

export type SolverRuntimeOperation =
  | "startManual"
  | "startReplay"
  | "advanceTick"
  | "observe"
  | "terminal"
  | "captureCheckpoint"
  | "cloneCheckpoint"
  | "restoreCheckpoint"
  | "projectRender"
  | "disposeRun"
  | "disposeCheckpoint";

export type SolverRuntimeErrorCode =
  | "runtime.invalid-request"
  | "runtime.level-not-found"
  | "runtime.invalid-replay"
  | "runtime.unsupported-option"
  | "runtime.unsupported-input"
  | "runtime.input-not-allowed-in-replay"
  | "runtime.mode-mismatch"
  | "runtime.run-not-found"
  | "runtime.run-disposed"
  | "runtime.run-owner-mismatch"
  | "runtime.checkpoint-not-found"
  | "runtime.checkpoint-disposed"
  | "runtime.checkpoint-owner-mismatch"
  | "runtime.checkpoint-target-mismatch"
  | "runtime.target-mismatch"
  | "runtime.capacity-exhausted"
  | "runtime.budget-exhausted"
  | "runtime.unsupported"
  | "runtime.adapter-failure"
  | "runtime.invalid-observation"
  | "runtime.invalid-projection"
  | "runtime.invalid-checkpoint";

export class SolverRuntimeError extends Error {
  override readonly name = "SolverRuntimeError";

  constructor(
    readonly code: SolverRuntimeErrorCode,
    readonly operation: SolverRuntimeOperation,
    message: string,
    readonly details?: CanonicalJsonValue,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

/** Compatibility name spelling the boundary role called out by the design. */
export { SolverRuntimeError as RuntimePortError };
export type RuntimePortErrorCode = SolverRuntimeErrorCode;
export type RuntimePortOperation = SolverRuntimeOperation;

export type SolverRuntimeResult<T> = T | Promise<T>;

/**
 * Target-neutral authority over one concrete runtime adapter.
 *
 * Start sources are generic so Tile World can retain its typed level/replay
 * requests without leaking those web-side types into the solver package.
 */
export interface SolverRuntimePort<TManualSource, TReplaySource> {
  startManual(source: TManualSource): SolverRuntimeResult<SolverRunHandle>;
  startReplay(source: TReplaySource): SolverRuntimeResult<SolverRunHandle>;
  advanceTick(
    run: SolverRunHandle,
    request: SolverAdvanceRequest,
  ): SolverRuntimeResult<void>;
  observe(run: SolverRunHandle): SolverRuntimeResult<SolverObservation>;
  terminal(run: SolverRunHandle): SolverRuntimeResult<SolverTerminalResult>;
  captureCheckpoint(run: SolverRunHandle): SolverRuntimeResult<SolverCheckpoint>;
  cloneCheckpoint(checkpoint: SolverCheckpointHandle): SolverRuntimeResult<SolverCheckpoint>;
  /** Restoring creates a new independent live run and leaves the checkpoint intact. */
  restoreCheckpoint(checkpoint: SolverCheckpointHandle): SolverRuntimeResult<SolverRunHandle>;
  projectRender(
    run: SolverRunHandle,
    region: SolverRenderRegionRequest,
  ): SolverRuntimeResult<SolverRenderProjection>;
  disposeRun(run: SolverRunHandle): SolverRuntimeResult<void>;
  disposeCheckpoint(checkpoint: SolverCheckpointHandle): SolverRuntimeResult<void>;
}
