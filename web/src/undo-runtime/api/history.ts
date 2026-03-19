import type { SessionDigest } from "@undo-runtime/api/sessionDigest";
import type { RulesetName } from "@content/api/ruleset";

export type UndoRuleset = Exclude<RulesetName, "None">;
export type UndoTimelineId = string;

export interface UndoTickEvent {
  tick: number;
  inputCode: number;
  inputKind: "runtime";
  source: "manual" | "replay" | "resume";
  timelineId: UndoTimelineId;
}

export interface UndoTimeline {
  id: UndoTimelineId;
  parentTimelineId: UndoTimelineId | null;
  forkTick: number | null;
}

export interface UndoBranchMetadata {
  currentTimelineId: UndoTimelineId;
  timelines: UndoTimeline[];
}

export interface UndoSettingsSnapshot {
  enabled: boolean;
  checkpointIntervalTicks: number;
  retainUnlimitedHistory: boolean;
  checkpointRetentionMode: "dense-recent" | "dense-recent-exponential";
  recentCheckpointWindowTicks: number;
  checkpointExponentialBase: number;
  maximumRetainedHistoryTicks: number | null;
}

export interface UndoCheckpoint<TSession> {
  tick: number;
  ruleset: UndoRuleset;
  timelineId: UndoTimelineId;
  sessionToken: TSession;
  stateDigest: SessionDigest;
}

export interface UndoHistory<TSession> {
  initialCheckpoint: UndoCheckpoint<TSession>;
  events: UndoTickEvent[];
  checkpoints: UndoCheckpoint<TSession>[];
  branchMetadata: UndoBranchMetadata;
  settingsSnapshot: UndoSettingsSnapshot;
}

export interface RestoreUndoHistoryOptions<TSession> {
  restoreCheckpoint(checkpoint: UndoCheckpoint<TSession>): TSession;
  advance(session: TSession, inputCode: number): TSession;
}

export interface RestoreUndoHistoryResult<TSession> {
  session: TSession;
  checkpointTick: number;
  replayedEventCount: number;
}
