import type {
  SolverCausalEventPageV1,
  SolverCausalEventReadRequestV1,
  SolverCausalEventRetentionV1,
  SolverCausalEventV1,
  SolverCausalJournalCheckpointV1,
} from "@tworld/ccsolver/events";
import { identifySolverCausalEventOccurrenceAnchorV1 } from "@tworld/ccsolver/events";
import type {
  SolverLevelFactsReference,
  SolverRuntimeLevelIdentity,
  SolverRuntimeMode,
  SolverRuntimeProvenance,
} from "@tworld/ccsolver/domain";

export const DEFAULT_TWORLD_CAUSAL_EVENT_CAPACITY = 4_096;
export const MAXIMUM_TWORLD_CAUSAL_EVENT_CAPACITY = 65_536;

export interface TworldCausalJournalBinding {
  readonly target: "ms" | "lynx";
  readonly mode: SolverRuntimeMode;
  readonly level: SolverRuntimeLevelIdentity;
  readonly levelFacts: SolverLevelFactsReference;
  readonly provenance: SolverRuntimeProvenance;
}

export interface TworldCausalCommandLink {
  readonly sequence: number;
  readonly commandId: string;
  readonly planId: string | null;
}

export interface TworldCausalJournal {
  readonly maximumEvents: number;
  readonly events: SolverCausalEventV1[];
  readonly occurrenceByAnchor: Map<string, number>;
  readonly spawnOrdinalBySource: Map<string, number>;
  pendingPlayerCommand: TworldCausalCommandLink | null;
  nextSequence: number;
  retention: SolverCausalEventRetentionV1;
}

type UnsequencedSolverCausalEventV1 = Omit<
  SolverCausalEventV1,
  "sequence" | "occurrenceOrdinal"
>;

export function assertTworldCausalEventCapacity(value: number | undefined): number {
  const capacity = value ?? DEFAULT_TWORLD_CAUSAL_EVENT_CAPACITY;
  if (
    !Number.isSafeInteger(capacity)
    || capacity < 1
    || capacity > MAXIMUM_TWORLD_CAUSAL_EVENT_CAPACITY
  ) {
    throw new RangeError(
      `maximumCausalEvents must be a safe integer from 1 through ${MAXIMUM_TWORLD_CAUSAL_EVENT_CAPACITY}`,
    );
  }
  return capacity;
}

export function createTworldCausalJournal(maximumEvents: number): TworldCausalJournal {
  return {
    maximumEvents,
    events: [],
    occurrenceByAnchor: new Map(),
    spawnOrdinalBySource: new Map(),
    pendingPlayerCommand: null,
    nextSequence: 0,
    retention: { status: "complete" },
  };
}

export function cloneTworldCausalJournal(
  journal: TworldCausalJournal,
): TworldCausalJournal {
  return {
    maximumEvents: journal.maximumEvents,
    events: structuredClone(journal.events),
    occurrenceByAnchor: new Map(journal.occurrenceByAnchor),
    spawnOrdinalBySource: new Map(journal.spawnOrdinalBySource),
    pendingPlayerCommand: journal.pendingPlayerCommand === null
      ? null
      : { ...journal.pendingPlayerCommand },
    nextSequence: journal.nextSequence,
    retention: structuredClone(journal.retention),
  };
}

export function allocateTworldCausalSpawnOrdinal(
  journal: TworldCausalJournal,
  sourcePlacementId: string,
): number | null {
  if (journal.events.length >= journal.maximumEvents) return null;
  const ordinal = (journal.spawnOrdinalBySource.get(sourcePlacementId) ?? 0) + 1;
  journal.spawnOrdinalBySource.set(sourcePlacementId, ordinal);
  return ordinal;
}

export function appendTworldCausalEvent(
  journal: TworldCausalJournal,
  event: UnsequencedSolverCausalEventV1,
): number {
  const sequence = journal.nextSequence;
  journal.nextSequence += 1;

  if (journal.events.length < journal.maximumEvents) {
    const anchor = identifySolverCausalEventOccurrenceAnchorV1({
      ...event,
      sequence,
      occurrenceOrdinal: 0,
    } as SolverCausalEventV1);
    const occurrenceOrdinal = journal.occurrenceByAnchor.get(anchor) ?? 0;
    journal.occurrenceByAnchor.set(anchor, occurrenceOrdinal + 1);
    journal.events.push(structuredClone({
      ...event,
      sequence,
      occurrenceOrdinal,
    } as SolverCausalEventV1));
    return sequence;
  }

  journal.retention = journal.retention.status === "complete"
    ? {
        status: "overflow",
        reason: "capacity-exhausted",
        firstOmittedSequence: sequence,
        omittedEventCount: 1,
      }
    : {
        ...journal.retention,
        omittedEventCount: journal.retention.omittedEventCount + 1,
      };
  return sequence;
}

export function tworldCausalJournalCheckpoint(
  journal: TworldCausalJournal,
): SolverCausalJournalCheckpointV1 {
  return {
    nextSequence: journal.nextSequence,
    retainedEventCount: journal.events.length,
    retention: structuredClone(journal.retention),
  };
}

export function tworldCausalJournalFingerprintValue(
  journal: TworldCausalJournal,
): readonly unknown[] {
  return [
    journal.maximumEvents,
    journal.nextSequence,
    journal.events,
    journal.retention,
    [...journal.occurrenceByAnchor].sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )),
    [...journal.spawnOrdinalBySource].sort(([left], [right]) => (
      left < right ? -1 : left > right ? 1 : 0
    )),
    journal.pendingPlayerCommand,
  ];
}

export function readTworldCausalEventPage(
  journal: TworldCausalJournal,
  binding: TworldCausalJournalBinding,
  request: SolverCausalEventReadRequestV1,
): SolverCausalEventPageV1 {
  const startSequence = request.afterSequence === null
    ? 0
    : request.afterSequence >= journal.events.length
      ? journal.events.length
      : request.afterSequence + 1;
  const events = structuredClone(
    journal.events.slice(startSequence, startSequence + request.maximumEvents),
  );
  const availableThroughSequence = journal.events.length === 0
    ? null
    : journal.events.length - 1;
  const firstReturnedSequence = events[0]?.sequence ?? null;
  const lastReturnedSequence = events.at(-1)?.sequence ?? null;
  const hasMore = lastReturnedSequence !== null
    && availableThroughSequence !== null
    && lastReturnedSequence < availableThroughSequence;
  return structuredClone({
    journalVersion: 1,
    target: binding.target,
    mode: binding.mode,
    level: binding.level,
    levelFacts: binding.levelFacts,
    provenance: binding.provenance,
    requested: request,
    eventsOrder: "sequence",
    events,
    window: {
      firstAvailableSequence: availableThroughSequence === null ? null : 0,
      availableThroughSequence,
      firstReturnedSequence,
      lastReturnedSequence,
      nextAfterSequence: lastReturnedSequence ?? request.afterSequence,
      status: hasMore ? "maximum-events-reached" : "complete",
    },
    retention: journal.retention,
  });
}
