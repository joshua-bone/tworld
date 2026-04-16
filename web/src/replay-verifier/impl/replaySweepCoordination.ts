import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export const REPLAY_SWEEP_COORDINATED_ENV = "TWORLD_REPLAY_SWEEP_COORDINATED";
const REPLAY_SWEEP_COORDINATION_PREFIX = "@@TWORLD_REPLAY_PROGRESS@@";

export interface ReplaySweepFileStartEvent {
  type: "file-start";
  packName: string;
  solutionLabel: string;
  ruleset: SupportedReplaySweepRuleset;
  replayCount: number;
}

export interface ReplaySweepFileCompleteEvent {
  type: "file-complete";
  packName: string;
  solutionLabel: string;
  ruleset: SupportedReplaySweepRuleset;
  checked: number;
  passed: number;
  failed: number;
  tsFailed: number;
  legacyFailed: number;
  elapsedMs: number;
  failureLines: string[];
}

export interface ReplaySweepUnsupportedFileEvent {
  type: "unsupported-file";
  solutionLabel: string;
}

export type ReplaySweepCoordinationEvent =
  | ReplaySweepFileStartEvent
  | ReplaySweepFileCompleteEvent
  | ReplaySweepUnsupportedFileEvent;

export function formatReplaySweepCoordinationEvent(event: ReplaySweepCoordinationEvent): string {
  return `${REPLAY_SWEEP_COORDINATION_PREFIX}${JSON.stringify(event)}`;
}

export function parseReplaySweepCoordinationLine(line: string): ReplaySweepCoordinationEvent | null {
  if (!line.startsWith(REPLAY_SWEEP_COORDINATION_PREFIX)) {
    return null;
  }

  return JSON.parse(line.slice(REPLAY_SWEEP_COORDINATION_PREFIX.length)) as ReplaySweepCoordinationEvent;
}

export function emitReplaySweepCoordinationEvent(event: ReplaySweepCoordinationEvent): void {
  process.stdout.write(`${formatReplaySweepCoordinationEvent(event)}\n`);
}
