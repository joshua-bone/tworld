import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import type { LynxNativeCausalEvent } from "@ruleset-lynx/impl/engine";
import type { MsNativeCausalEvent } from "@ruleset-ms/impl/engine";
import type { P7GeneratedCanonicalDigestV1 } from "./p7GeneratedEvidenceStore";

const encoder = new TextEncoder();
const FULL_STREAM_PREFIX = '{"events":[';
const FULL_STREAM_SUFFIX = '],"eventsOrder":"sequence"}';
const EMPTY_FULL_STREAM_CANONICAL_BYTES = encoder.encode(
  `${FULL_STREAM_PREFIX}${FULL_STREAM_SUFFIX}`,
).byteLength;

export const P7_TRAINING_EVENT_STREAM_LIMITS = Object.freeze({
  maximumEventsPerChunk: 4_096,
  maximumChunkCount: 256,
  maximumEventCount: 4_096 * 256,
  maximumCanonicalBytes: 256 * 1024 * 1024,
  maximumChunkCanonicalBytes: 32 * 1024 * 1024,
  maximumManifestCanonicalBytes: 32 * 1024 * 1024,
  maximumQueuedCanonicalBytes: 32 * 1024 * 1024,
  maximumTargetTranscriptCacheEntries: 16,
  maximumTargetTranscriptCacheBytes: 8 * 1024 * 1024,
});

export type P7TrainingNativeCausalEvent = MsNativeCausalEvent | LynxNativeCausalEvent;

/**
 * Compact semantic evidence for one green-button activation. Lynx records the
 * queued activation while MS records its immediate mutations; the exact raw
 * stream root remains target-specific and authoritative for applied effects.
 */
export interface P7TrainingToggleWallButtonActivationV1 {
  readonly artifact: "ccsolver-p7-toggle-wall-button-activation";
  readonly version: 1;
  readonly semanticAction: "cc1:toggle-walls";
  readonly eventCount: number;
  readonly firstWithinTickOrder: number;
  readonly lastWithinTickOrder: number;
  readonly orderedTargets: P7GeneratedCanonicalDigestV1;
}

export type P7TrainingRetainedCausalEvent = P7TrainingNativeCausalEvent & {
  readonly p7Aggregation?: P7TrainingToggleWallButtonActivationV1;
};

export interface P7TrainingEventStreamChunkDescriptorV1 {
  readonly index: number;
  readonly firstEventOrdinal: number;
  readonly eventCount: number;
  readonly firstNativeTick: number;
  readonly lastNativeTick: number;
  readonly events: P7GeneratedCanonicalDigestV1;
}

export interface P7TrainingEventStreamDigestV1 {
  readonly artifact: "ccsolver-p7-ordered-native-event-stream-digest";
  readonly version: 1;
  readonly eventsOrder: "sequence";
  readonly eventCount: number;
  readonly canonicalByteLength: number;
  readonly chunking: {
    readonly kind: "contiguous-event-count-v1";
    readonly maximumEventsPerChunk: typeof P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk;
    readonly chunkCount: number;
  };
  readonly manifest: P7GeneratedCanonicalDigestV1;
}

export interface P7TrainingAccumulatedEvents {
  readonly rawEventCount: number;
  readonly retainedEventCount: number;
  readonly events: readonly P7TrainingRetainedCausalEvent[];
  readonly fullEventStream: P7TrainingEventStreamDigestV1;
  /** Reexecution-only manifest input; receipts retain only its root digest. */
  readonly chunkManifest: readonly P7TrainingEventStreamChunkDescriptorV1[];
}

interface PendingChunk {
  readonly firstEventOrdinal: number;
  readonly firstNativeTick: number;
  readonly lastNativeTick: number;
  readonly eventCanonicalJson: readonly CanonicalJson[];
  readonly canonicalByteLength: number;
}

interface ToggleWallTargetV1 {
  readonly withinTickOrder: number;
  readonly tileId: number | null;
  readonly resultingTileId: number | null;
  readonly targetStratum: "terrain" | "pickup" | "overlay" | null;
  readonly beforeState: string | null;
  readonly afterState: string | null;
  readonly before: P7TrainingNativeCausalEvent["before"];
  readonly after: P7TrainingNativeCausalEvent["after"];
}

interface PendingToggleWallButtonActivation {
  readonly kind: "toggle-wall-button-activation";
  readonly key: string;
  readonly representative: P7TrainingNativeCausalEvent;
  readonly targets: ToggleWallTargetV1[];
  readonly targetIdentities: Set<string>;
}

interface PendingPlainEvent {
  readonly kind: "plain";
  readonly event: P7TrainingNativeCausalEvent;
}

type PendingRetainedEvent = PendingToggleWallButtonActivation | PendingPlainEvent;

function jsonSafe(value: unknown): CanonicalJsonValue {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("P7 native causal event is not JSON representable");
  return JSON.parse(json) as CanonicalJsonValue;
}

async function digestCanonicalJson(
  canonicalJson: CanonicalJson,
  sha256: Sha256Port,
  maximumBytes: number,
  label: string,
): Promise<P7GeneratedCanonicalDigestV1> {
  const byteLength = encoder.encode(canonicalJson).byteLength;
  if (byteLength > maximumBytes) {
    throw new Error(`${label} is ${byteLength} bytes, exceeding its ${maximumBytes}-byte cap`);
  }
  const content = await referenceCanonicalJson(canonicalJson, sha256);
  return {
    algorithm: "sha256",
    canonicalization: "tworld-canonical-json-v1",
    digest: content.digest,
    byteLength,
  };
}

function toggleWallFanoutKey(event: P7TrainingNativeCausalEvent): string {
  return JSON.stringify([
    event.nativeTick,
    event.actorId,
    event.actorSerial,
    event.actorRuntimeKey ?? null,
    event.sourceTileId ?? null,
    event.sourcePosition?.pos ?? null,
    event.sourcePosition?.z ?? null,
    event.sourceStratum ?? null,
    event.action ?? null,
  ]);
}

function isToggleWallFanout(
  target: "ms" | "lynx",
  event: P7TrainingNativeCausalEvent,
): boolean {
  return (
    (target === "lynx"
      && event.kind === "device-activated"
      && event.action === "cc1:toggle-walls-queued")
    || (target === "ms"
      && event.kind === "device-state-changed"
      && event.action === "cc1:toggle-walls")
  )
    && event.sourcePosition != null;
}

function retainPlainEvent(event: P7TrainingNativeCausalEvent): boolean {
  return event.kind === "movement-started"
    || event.kind === "movement-blocked"
    || event.kind === "complete-level"
    || event.kind === "collect"
    || event.kind === "teleport"
    || event.kind === "device-activated"
    || event.kind === "open-socket"
    || event.kind === "open-door";
}

function toggleWallTarget(event: P7TrainingNativeCausalEvent): ToggleWallTargetV1 {
  return {
    withinTickOrder: event.withinTickOrder,
    tileId: event.tileId,
    resultingTileId: event.resultingTileId ?? null,
    targetStratum: event.targetStratum ?? null,
    beforeState: event.beforeState ?? null,
    afterState: event.afterState ?? null,
    before: event.before === null ? null : { ...event.before },
    after: event.after === null ? null : { ...event.after },
  };
}

function toggleWallTargetIdentity(target: ToggleWallTargetV1): string {
  return JSON.stringify([
    target.targetStratum,
    target.before?.z ?? target.after?.z ?? null,
    target.before?.pos ?? target.after?.pos ?? null,
  ]);
}

function copyNativeEvent<Event extends P7TrainingRetainedCausalEvent>(event: Event): Event {
  return jsonSafe(event) as unknown as Event;
}

function fullStreamByteLength(chunks: readonly P7TrainingEventStreamChunkDescriptorV1[]): number {
  if (chunks.length === 0) return EMPTY_FULL_STREAM_CANONICAL_BYTES;
  return EMPTY_FULL_STREAM_CANONICAL_BYTES
    + chunks.reduce((sum, chunk) => sum + chunk.events.byteLength - 2, 0)
    + chunks.length - 1;
}

export function assertP7TrainingEventStreamManifest(input: {
  readonly eventCount: number;
  readonly canonicalByteLength: number;
  readonly chunks: readonly P7TrainingEventStreamChunkDescriptorV1[];
}): void {
  if (
    !Number.isSafeInteger(input.eventCount)
    || input.eventCount < 0
    || input.eventCount > P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventCount
    || !Number.isSafeInteger(input.canonicalByteLength)
    || input.canonicalByteLength < EMPTY_FULL_STREAM_CANONICAL_BYTES
    || input.canonicalByteLength > P7_TRAINING_EVENT_STREAM_LIMITS.maximumCanonicalBytes
    || input.chunks.length > P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCount
  ) throw new Error("P7 native event-stream manifest exceeds its published bounds");
  let nextOrdinal = 0;
  let priorLastNativeTick = -1;
  for (const [index, chunk] of input.chunks.entries()) {
    if (
      chunk.index !== index
      || chunk.firstEventOrdinal !== nextOrdinal
      || !Number.isSafeInteger(chunk.eventCount)
      || chunk.eventCount < 1
      || chunk.eventCount > P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk
      || (index < input.chunks.length - 1
        && chunk.eventCount !== P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk)
      || !Number.isSafeInteger(chunk.firstNativeTick)
      || !Number.isSafeInteger(chunk.lastNativeTick)
      || chunk.firstNativeTick < priorLastNativeTick
      || chunk.lastNativeTick < chunk.firstNativeTick
      || chunk.events.algorithm !== "sha256"
      || chunk.events.canonicalization !== "tworld-canonical-json-v1"
      || !/^sha256:[0-9a-f]{64}$/u.test(chunk.events.digest)
      || !Number.isSafeInteger(chunk.events.byteLength)
      || chunk.events.byteLength < 2
      || chunk.events.byteLength > P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCanonicalBytes
    ) throw new Error(`P7 native event-stream chunk ${index} is invalid`);
    nextOrdinal += chunk.eventCount;
    priorLastNativeTick = chunk.lastNativeTick;
  }
  if (
    nextOrdinal !== input.eventCount
    || fullStreamByteLength(input.chunks) !== input.canonicalByteLength
    || (input.eventCount === 0) !== (input.chunks.length === 0)
  ) throw new Error("P7 native event-stream manifest totals drifted");
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has invalid keys`);
  }
  return record;
}

function assertedCanonicalDigest(
  value: unknown,
  maximumBytes: number,
  label: string,
): P7GeneratedCanonicalDigestV1 {
  const record = exactRecord(
    value,
    ["algorithm", "byteLength", "canonicalization", "digest"],
    label,
  );
  if (
    record.algorithm !== "sha256"
    || record.canonicalization !== "tworld-canonical-json-v1"
    || typeof record.digest !== "string"
    || !/^sha256:[0-9a-f]{64}$/u.test(record.digest)
    || !Number.isSafeInteger(record.byteLength)
    || (record.byteLength as number) < 1
    || (record.byteLength as number) > maximumBytes
  ) throw new Error(`${label} is invalid`);
  return record as unknown as P7GeneratedCanonicalDigestV1;
}

export function assertP7TrainingEventStreamDigest(
  value: unknown,
  label = "P7 native event-stream digest",
): P7TrainingEventStreamDigestV1 {
  const record = exactRecord(value, [
    "artifact",
    "canonicalByteLength",
    "chunking",
    "eventCount",
    "eventsOrder",
    "manifest",
    "version",
  ], label);
  const chunking = exactRecord(
    record.chunking,
    ["chunkCount", "kind", "maximumEventsPerChunk"],
    `${label} chunking`,
  );
  if (
    record.artifact !== "ccsolver-p7-ordered-native-event-stream-digest"
    || record.version !== 1
    || record.eventsOrder !== "sequence"
    || !Number.isSafeInteger(record.eventCount)
    || (record.eventCount as number) < 0
    || (record.eventCount as number) > P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventCount
    || !Number.isSafeInteger(record.canonicalByteLength)
    || (record.canonicalByteLength as number) < EMPTY_FULL_STREAM_CANONICAL_BYTES
    || (record.canonicalByteLength as number) > P7_TRAINING_EVENT_STREAM_LIMITS.maximumCanonicalBytes
    || chunking.kind !== "contiguous-event-count-v1"
    || chunking.maximumEventsPerChunk !== P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk
    || !Number.isSafeInteger(chunking.chunkCount)
    || (chunking.chunkCount as number) < 0
    || (chunking.chunkCount as number) > P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCount
    || (chunking.chunkCount as number) !== Math.ceil(
      (record.eventCount as number) / P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk,
    )
    || ((record.eventCount as number) === 0
      && (record.canonicalByteLength as number) !== EMPTY_FULL_STREAM_CANONICAL_BYTES)
  ) throw new Error(`${label} is invalid`);
  assertedCanonicalDigest(
    record.manifest,
    P7_TRAINING_EVENT_STREAM_LIMITS.maximumManifestCanonicalBytes,
    `${label} manifest`,
  );
  return record as unknown as P7TrainingEventStreamDigestV1;
}

export async function digestP7TrainingEventStreamManifest(
  input: {
    readonly eventCount: number;
    readonly canonicalByteLength: number;
    readonly chunks: readonly P7TrainingEventStreamChunkDescriptorV1[];
  },
  sha256: Sha256Port,
): Promise<P7GeneratedCanonicalDigestV1> {
  assertP7TrainingEventStreamManifest(input);
  return digestCanonicalJson(
    canonicalizeJson({
      artifact: "ccsolver-p7-ordered-native-event-stream-manifest",
      version: 1,
      eventsOrder: "sequence",
      eventCount: input.eventCount,
      canonicalByteLength: input.canonicalByteLength,
      chunks: input.chunks,
    } as unknown as CanonicalJsonValue),
    sha256,
    P7_TRAINING_EVENT_STREAM_LIMITS.maximumManifestCanonicalBytes,
    "P7 native event-stream manifest",
  );
}

export class P7TrainingEventAccumulator {
  readonly #occurrenceId: string;
  readonly #target: "ms" | "lynx";
  readonly #sha256: Sha256Port;
  readonly #maximumRetainedEvents: number;
  readonly #chunks: P7TrainingEventStreamChunkDescriptorV1[] = [];
  readonly #pendingChunks: PendingChunk[] = [];
  readonly #openChunkEvents: CanonicalJson[] = [];
  readonly #retainedEvents: P7TrainingRetainedCausalEvent[] = [];
  readonly #pendingRetainedEvents: PendingRetainedEvent[] = [];
  readonly #targetTranscriptDigestCache = new Map<string, P7GeneratedCanonicalDigestV1>();
  #targetTranscriptDigestCacheByteLength = 0;
  #openChunkFirstEventOrdinal = 0;
  #openChunkFirstNativeTick = -1;
  #openChunkLastNativeTick = -1;
  #openChunkCanonicalByteLength = 2;
  #queuedCanonicalByteLength = 2;
  #canonicalByteLength = EMPTY_FULL_STREAM_CANONICAL_BYTES;
  #eventCount = 0;
  #currentNativeTick: number | null = null;
  #lastNativeTick = -1;
  #lastWithinTickOrder = -1;
  #finished = false;

  constructor(input: {
    readonly occurrenceId: string;
    readonly target: "ms" | "lynx";
    readonly sha256: Sha256Port;
    readonly maximumRetainedEvents: number;
  }) {
    if (
      input.occurrenceId.trim() === ""
      || !Number.isSafeInteger(input.maximumRetainedEvents)
      || input.maximumRetainedEvents < 1
    ) throw new Error("P7 event accumulator configuration is invalid");
    this.#occurrenceId = input.occurrenceId;
    this.#target = input.target;
    this.#sha256 = input.sha256;
    this.#maximumRetainedEvents = input.maximumRetainedEvents;
  }

  readonly causalEventSink = (event: P7TrainingNativeCausalEvent): void => {
    this.record(event);
  };

  record(event: P7TrainingNativeCausalEvent): void {
    if (this.#finished) throw new Error(`${this.#occurrenceId}/${this.#target} event stream is finalized`);
    if (
      !Number.isSafeInteger(event.nativeTick)
      || event.nativeTick < 0
      || !Number.isSafeInteger(event.withinTickOrder)
      || event.withinTickOrder < 0
    ) throw new Error(`${this.#occurrenceId}/${this.#target} emitted invalid native event order`);
    if (
      (this.#currentNativeTick === null && (
        event.nativeTick <= this.#lastNativeTick
        || event.withinTickOrder !== 0
      ))
      || (this.#currentNativeTick !== null && (
        event.nativeTick !== this.#currentNativeTick
        || event.withinTickOrder !== this.#lastWithinTickOrder + 1
      ))
    ) {
      throw new Error(
        `${this.#occurrenceId}/${this.#target} native event order is not exact and monotonic`,
      );
    }
    if (this.#eventCount >= P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventCount) {
      throw new Error(`${this.#occurrenceId}/${this.#target} raw causal event capacity exhausted`);
    }
    const safeEvent = jsonSafe(event);
    const canonicalEvent = canonicalizeJson(safeEvent);
    const eventByteLength = encoder.encode(canonicalEvent).byteLength;
    const separatorByteLength = this.#eventCount === 0 ? 0 : 1;
    const chunkSeparatorByteLength = this.#openChunkEvents.length === 0 ? 0 : 1;
    const closesChunk = this.#openChunkEvents.length + 1
      === P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk;
    if (
      this.#canonicalByteLength + separatorByteLength + eventByteLength
      > P7_TRAINING_EVENT_STREAM_LIMITS.maximumCanonicalBytes
    ) throw new Error(`${this.#occurrenceId}/${this.#target} raw causal stream byte capacity exhausted`);
    if (
      this.#openChunkCanonicalByteLength + chunkSeparatorByteLength + eventByteLength
      > P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCanonicalBytes
    ) throw new Error(`${this.#occurrenceId}/${this.#target} raw causal event exceeds its chunk byte cap`);
    if (
      closesChunk
      && this.#chunks.length + this.#pendingChunks.length
        >= P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCount
    ) throw new Error(`${this.#occurrenceId}/${this.#target} causal event chunk capacity exhausted`);

    const detachedEvent = safeEvent as unknown as P7TrainingNativeCausalEvent;
    const toggleTarget = isToggleWallFanout(this.#target, detachedEvent)
      ? toggleWallTarget(detachedEvent)
      : null;
    const toggleKey = toggleTarget === null ? null : toggleWallFanoutKey(detachedEvent);
    const toggleIdentity = toggleTarget === null ? null : toggleWallTargetIdentity(toggleTarget);
    const prior = this.#pendingRetainedEvents.at(-1);
    const extendsPriorActivation = toggleTarget !== null
      && prior?.kind === "toggle-wall-button-activation"
      && prior.key === toggleKey
      && !prior.targetIdentities.has(toggleIdentity!)
      && toggleTarget.withinTickOrder === prior.targets.at(-1)!.withinTickOrder + 1;
    const addsRetainedEvent = toggleTarget !== null
      ? !extendsPriorActivation
      : retainPlainEvent(detachedEvent);
    if (
      addsRetainedEvent
      && this.#retainedEvents.length + this.#pendingRetainedEvents.length
        >= this.#maximumRetainedEvents
    ) throw new Error(`${this.#occurrenceId}/${this.#target} retained causal event capacity exhausted`);

    const queuedCanonicalByteLength = this.#queuedCanonicalByteLength
      + chunkSeparatorByteLength
      + eventByteLength
      + (closesChunk ? 2 : 0);
    if (queuedCanonicalByteLength > P7_TRAINING_EVENT_STREAM_LIMITS.maximumQueuedCanonicalBytes) {
      throw new Error(`${this.#occurrenceId}/${this.#target} unhashed causal bytes exceed their cap`);
    }
    this.#currentNativeTick = event.nativeTick;
    this.#lastNativeTick = event.nativeTick;
    this.#lastWithinTickOrder = event.withinTickOrder;
    if (this.#openChunkEvents.length === 0) {
      this.#openChunkFirstEventOrdinal = this.#eventCount;
      this.#openChunkFirstNativeTick = event.nativeTick;
    }
    this.#openChunkLastNativeTick = event.nativeTick;
    this.#openChunkEvents.push(canonicalEvent);
    this.#openChunkCanonicalByteLength += chunkSeparatorByteLength + eventByteLength;
    this.#queuedCanonicalByteLength += chunkSeparatorByteLength + eventByteLength;
    this.#canonicalByteLength += separatorByteLength + eventByteLength;
    this.#eventCount += 1;
    if (closesChunk) this.#closeOpenChunk(true);

    if (toggleTarget !== null) {
      if (extendsPriorActivation && prior?.kind === "toggle-wall-button-activation") {
        prior.targets.push(toggleTarget);
        prior.targetIdentities.add(toggleIdentity!);
      } else {
        this.#pendingRetainedEvents.push({
          kind: "toggle-wall-button-activation",
          key: toggleKey!,
          representative: detachedEvent,
          targets: [toggleTarget],
          targetIdentities: new Set([toggleIdentity!]),
        });
      }
    } else if (retainPlainEvent(detachedEvent)) {
      this.#pendingRetainedEvents.push({ kind: "plain", event: detachedEvent });
    }
  }

  async flushNativeTick(): Promise<void> {
    if (this.#finished) throw new Error(`${this.#occurrenceId}/${this.#target} event stream is finalized`);
    for (const pending of this.#pendingRetainedEvents) {
      if (pending.kind === "plain") {
        this.#retainedEvents.push(pending.event);
        continue;
      }
      const firstWithinTickOrder = pending.targets[0]!.withinTickOrder;
      if (pending.targets.some(({ withinTickOrder }, index) => (
        withinTickOrder !== firstWithinTickOrder + index
      ))) {
        throw new Error(
          `${this.#occurrenceId}/${this.#target} toggle-wall fanout order is not contiguous`,
        );
      }
      const targetDetails = pending.targets.map(({ withinTickOrder: _order, ...target }) => target);
      const cacheKey = JSON.stringify(targetDetails);
      let orderedTargets = this.#targetTranscriptDigestCache.get(cacheKey);
      if (orderedTargets === undefined) {
        const targetTranscriptCanonicalJson = canonicalizeJson({
          targetsOrder: "event-order",
          targets: targetDetails,
        } as unknown as CanonicalJsonValue);
        orderedTargets = await digestCanonicalJson(
          targetTranscriptCanonicalJson,
          this.#sha256,
          P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCanonicalBytes,
          `${this.#occurrenceId}/${this.#target} toggle-wall target transcript`,
        );
        const cacheEntryByteLength = encoder.encode(cacheKey).byteLength
          + encoder.encode(canonicalizeJson(
            orderedTargets as unknown as CanonicalJsonValue,
          )).byteLength;
        if (
          this.#targetTranscriptDigestCache.size
            < P7_TRAINING_EVENT_STREAM_LIMITS.maximumTargetTranscriptCacheEntries
          && this.#targetTranscriptDigestCacheByteLength + cacheEntryByteLength
            <= P7_TRAINING_EVENT_STREAM_LIMITS.maximumTargetTranscriptCacheBytes
        ) {
          this.#targetTranscriptDigestCache.set(cacheKey, orderedTargets);
          this.#targetTranscriptDigestCacheByteLength += cacheEntryByteLength;
        }
      }
      this.#retainedEvents.push({
        ...copyNativeEvent(pending.representative),
        p7Aggregation: {
          artifact: "ccsolver-p7-toggle-wall-button-activation",
          version: 1,
          semanticAction: "cc1:toggle-walls",
          eventCount: pending.targets.length,
          firstWithinTickOrder,
          lastWithinTickOrder: pending.targets.at(-1)!.withinTickOrder,
          orderedTargets,
        },
      });
    }
    this.#pendingRetainedEvents.length = 0;
    this.#currentNativeTick = null;
    this.#lastWithinTickOrder = -1;
    await this.#flushPendingChunks();
  }

  async finish(): Promise<P7TrainingAccumulatedEvents> {
    if (this.#finished) throw new Error(`${this.#occurrenceId}/${this.#target} event stream is finalized`);
    if (this.#currentNativeTick !== null || this.#pendingRetainedEvents.length !== 0) {
      throw new Error(`${this.#occurrenceId}/${this.#target} event stream ended before its tick flush`);
    }
    this.#closeOpenChunk(false);
    await this.#flushPendingChunks();
    const manifestInput = {
      eventCount: this.#eventCount,
      canonicalByteLength: this.#canonicalByteLength,
      chunks: this.#chunks,
    };
    const manifest = await digestP7TrainingEventStreamManifest(manifestInput, this.#sha256);
    this.#finished = true;
    return {
      rawEventCount: this.#eventCount,
      retainedEventCount: this.#retainedEvents.length,
      events: this.#retainedEvents.map(copyNativeEvent),
      chunkManifest: this.#chunks.map((chunk) => ({
        ...chunk,
        events: { ...chunk.events },
      })),
      fullEventStream: {
        artifact: "ccsolver-p7-ordered-native-event-stream-digest",
        version: 1,
        eventsOrder: "sequence",
        eventCount: this.#eventCount,
        canonicalByteLength: this.#canonicalByteLength,
        chunking: {
          kind: "contiguous-event-count-v1",
          maximumEventsPerChunk: P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk,
          chunkCount: this.#chunks.length,
        },
        manifest,
      },
    };
  }

  #closeOpenChunk(reserveNextOpenChunk: boolean): void {
    if (this.#openChunkEvents.length === 0) return;
    if (this.#chunks.length + this.#pendingChunks.length >= P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCount) {
      throw new Error(`${this.#occurrenceId}/${this.#target} causal event chunk capacity exhausted`);
    }
    this.#pendingChunks.push({
      firstEventOrdinal: this.#openChunkFirstEventOrdinal,
      firstNativeTick: this.#openChunkFirstNativeTick,
      lastNativeTick: this.#openChunkLastNativeTick,
      eventCanonicalJson: this.#openChunkEvents.splice(0),
      canonicalByteLength: this.#openChunkCanonicalByteLength,
    });
    this.#openChunkCanonicalByteLength = reserveNextOpenChunk ? 2 : 0;
    if (reserveNextOpenChunk) this.#queuedCanonicalByteLength += 2;
    this.#openChunkFirstNativeTick = -1;
    this.#openChunkLastNativeTick = -1;
  }

  async #flushPendingChunks(): Promise<void> {
    for (const pending of this.#pendingChunks.splice(0)) {
      const canonicalJson = `[${pending.eventCanonicalJson.join(",")}]` as CanonicalJson;
      const events = await digestCanonicalJson(
        canonicalJson,
        this.#sha256,
        P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCanonicalBytes,
        `${this.#occurrenceId}/${this.#target} native event chunk`,
      );
      if (events.byteLength !== pending.canonicalByteLength) {
        throw new Error(`${this.#occurrenceId}/${this.#target} native event chunk bytes drifted`);
      }
      this.#chunks.push({
        index: this.#chunks.length,
        firstEventOrdinal: pending.firstEventOrdinal,
        eventCount: pending.eventCanonicalJson.length,
        firstNativeTick: pending.firstNativeTick,
        lastNativeTick: pending.lastNativeTick,
        events,
      });
      this.#queuedCanonicalByteLength -= pending.canonicalByteLength;
    }
  }
}
