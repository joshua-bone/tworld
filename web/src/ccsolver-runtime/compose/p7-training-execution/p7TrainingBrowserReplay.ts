import {
  buildP7TrainingBrowserReplay,
  canonicalizeP7TrainingBrowserReplay as canonicalizeBrowserReplayInGameCore,
  parseP7TrainingBrowserReplay,
  p7ManualHeldInputAtNativeTick,
  P7_TRAINING_MAX_BROWSER_INPUTS,
  P7_TRAINING_MAX_BROWSER_REPLAY_BYTES,
  type P7TrainingBrowserCanonicalJsonV1,
  type P7TrainingBrowserReplayV1,
  type P7TrainingBrowserScheduledInputV1,
  type P7TrainingBrowserTargetV1,
  type P7TrainingBrowserTransportV1,
  type P7TrainingBrowserVariantIdV1,
  type P7TrainingManualHeldBrowserReplayV1,
  type P7TrainingBrowserNativeDecisionV1,
  type P7TrainingNativeBrowserReplayV1,
} from "@game-core/api/p7TrainingBrowserReplay";
import {
  type BlobReferenceV1,
  type CanonicalJson,
} from "@tworld/ccsolver/domain";
import type { P7bPortableDecisionTraceV1 } from "../p7b-training/portableReplayProfile";

const NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP = 2;

const INPUT_CODE_BY_DIRECTION = Object.freeze({
  none: 0,
  north: 1,
  west: 2,
  south: 4,
  east: 8,
} as const);

export {
  buildP7TrainingBrowserReplay,
  parseP7TrainingBrowserReplay,
  p7ManualHeldInputAtNativeTick,
  P7_TRAINING_MAX_BROWSER_INPUTS,
  P7_TRAINING_MAX_BROWSER_REPLAY_BYTES,
};
export type {
  P7TrainingBrowserCanonicalJsonV1,
  P7TrainingBrowserReplayV1,
  P7TrainingBrowserScheduledInputV1,
  P7TrainingBrowserTargetV1,
  P7TrainingBrowserTransportV1,
  P7TrainingBrowserVariantIdV1,
  P7TrainingManualHeldBrowserReplayV1,
  P7TrainingBrowserNativeDecisionV1,
  P7TrainingNativeBrowserReplayV1,
};

/** The game-core implementation is the sole canonicalization authority. */
export function canonicalizeP7TrainingBrowserReplay(value: unknown): CanonicalJson {
  return canonicalizeBrowserReplayInGameCore(value) as unknown as CanonicalJson;
}

export interface P7PortableHeldScheduleProjectionV1 {
  /** Exact sparse packet changes that occur before the observed terminal tick. */
  readonly changes: readonly P7TrainingBrowserScheduledInputV1[];
  /** Authored declarations at or after termination, retained as audit evidence only. */
  readonly omittedPostTerminalChanges: readonly P7TrainingBrowserScheduledInputV1[];
}

function packetInputCode(
  packet: P7bPortableDecisionTraceV1["changes"][number]["packet"],
): number {
  return INPUT_CODE_BY_DIRECTION[packet.primary] | INPUT_CODE_BY_DIRECTION[packet.secondary];
}

export function projectP7PortableHeldScheduleChanges(
  trace: P7bPortableDecisionTraceV1,
  terminalNativeTick: number,
): P7PortableHeldScheduleProjectionV1 {
  if (!Number.isSafeInteger(terminalNativeTick) || terminalNativeTick < 1) {
    throw new Error("portable held-schedule terminal tick must be a positive safe integer");
  }
  const authored = trace.changes.map(({ logicStep, packet }, ordinal) => ({
    ordinal,
    nativeTick: logicStep * NATIVE_TICKS_PER_PORTABLE_LOGIC_STEP,
    inputCode: packetInputCode(packet),
    modifierMask: 0 as const,
  }));
  const firstOmitted = authored.findIndex(({ nativeTick }) => nativeTick >= terminalNativeTick);
  if (firstOmitted < 0) {
    return { changes: authored, omittedPostTerminalChanges: [] };
  }
  return {
    changes: authored.slice(0, firstOmitted),
    omittedPostTerminalChanges: authored.slice(firstOmitted),
  };
}

export interface P7TrainingBrowserSegmentBoundaryEvidenceV1 {
  readonly segmentId: string;
  readonly index: number;
  readonly startNativeTick: number;
  readonly endNativeTick: number;
  readonly startBoundaryEvidence: BlobReferenceV1;
  readonly endBoundaryEvidence: BlobReferenceV1;
}

export interface P7TrainingBrowserParityReceiptV1 {
  readonly artifact: "ccsolver-p7-browser-replay-parity-receipt";
  readonly version: 1;
  readonly occurrenceId: string;
  readonly variantId: P7TrainingBrowserVariantIdV1;
  readonly target: P7TrainingBrowserTargetV1;
  readonly transport: P7TrainingBrowserTransportV1;
  readonly sourceReplayContent: BlobReferenceV1;
  readonly browserReplayContent: BlobReferenceV1;
  readonly nativeBoundaryClock: "exclusive-advance-count-v1";
  readonly portableScheduleProjection: {
    readonly authoredChangeCount: number;
    readonly executedChangeCount: number;
    readonly omittedPostTerminalChanges: readonly P7TrainingBrowserScheduledInputV1[];
  } | null;
  readonly expected: {
    readonly outcome: "won" | "loss" | "diverged" | "timeout";
    readonly terminalNativeTick: number;
    readonly segmentBoundaries: readonly P7TrainingBrowserSegmentBoundaryEvidenceV1[];
  };
  readonly observed: {
    readonly outcome: "won" | "loss" | "diverged" | "timeout";
    readonly terminalNativeTick: number;
    readonly segmentBoundaries: readonly P7TrainingBrowserSegmentBoundaryEvidenceV1[];
  };
  readonly status: "matched";
}

export interface P7TrainingBrowserReplayInputV1 {
  readonly variantId: P7TrainingBrowserVariantIdV1;
  readonly target: P7TrainingBrowserTargetV1;
  readonly replay: P7TrainingBrowserReplayV1;
  readonly canonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  readonly parity: {
    readonly receipt: P7TrainingBrowserParityReceiptV1;
    readonly evidence: BlobReferenceV1;
  };
}
