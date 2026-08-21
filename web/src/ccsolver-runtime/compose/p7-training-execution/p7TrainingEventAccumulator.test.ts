import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  assertP7TrainingEventStreamManifest,
  assertP7TrainingEventStreamDigest,
  digestP7TrainingEventStreamManifest,
  P7_TRAINING_EVENT_STREAM_LIMITS,
  P7TrainingEventAccumulator,
  type P7TrainingEventStreamChunkDescriptorV1,
  type P7TrainingNativeCausalEvent,
} from "./p7TrainingEventAccumulator";

const sha256 = new WebCryptoSha256();

function nativeEvent(input: {
  readonly kind?: P7TrainingNativeCausalEvent["kind"];
  readonly nativeTick?: number;
  readonly withinTickOrder: number;
  readonly actorSerial?: number | null;
  readonly sourcePos?: number;
  readonly targetPos?: number;
  readonly action?: string | null;
}): P7TrainingNativeCausalEvent {
  const sourcePos = input.sourcePos ?? 10;
  const targetPos = input.targetPos ?? 20;
  return {
    kind: input.kind ?? "device-activated",
    actorId: 3,
    actorSerial: input.actorSerial ?? 7,
    tileId: 0x25,
    resultingTileId: 0x26,
    sourceTileId: 0x23,
    sourcePosition: { pos: sourcePos, z: 1 },
    sourceStratum: "overlay",
    targetStratum: "terrain",
    action: input.action === undefined ? "cc1:toggle-walls-queued" : input.action,
    beforeState: "cc1:device-state-37",
    afterState: "cc1:device-state-38",
    before: { pos: targetPos, z: 1 },
    after: { pos: targetPos, z: 1 },
    nativeTick: input.nativeTick ?? 4,
    withinTickOrder: input.withinTickOrder,
    phase: "device-action",
  } as P7TrainingNativeCausalEvent;
}

async function accumulate(events: readonly P7TrainingNativeCausalEvent[]) {
  const accumulator = new P7TrainingEventAccumulator({
    occurrenceId: "cclp5/086",
    target: "lynx",
    sha256,
    maximumRetainedEvents: 32,
  });
  for (const event of events) accumulator.record(event);
  await accumulator.flushNativeTick();
  return accumulator.finish();
}

describe("P7 native causal event accumulation", () => {
  it("binds the exact empty stream without inventing a chunk", async () => {
    const accumulator = new P7TrainingEventAccumulator({
      occurrenceId: "empty",
      target: "ms",
      sha256,
      maximumRetainedEvents: 1,
    });
    await accumulator.flushNativeTick();
    const accumulated = await accumulator.finish();

    expect(accumulated).toMatchObject({
      rawEventCount: 0,
      retainedEventCount: 0,
      events: [],
      chunkManifest: [],
      fullEventStream: {
        eventCount: 0,
        canonicalByteLength: new TextEncoder().encode(
          '{"events":[],"eventsOrder":"sequence"}',
        ).byteLength,
        chunking: { chunkCount: 0 },
      },
    });
    expect(() => assertP7TrainingEventStreamDigest(accumulated.fullEventStream)).not.toThrow();
  });

  it("hashes every raw event while coalescing one exact Lynx toggle-wall fanout", async () => {
    const events = [
      nativeEvent({ withinTickOrder: 0, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 1, targetPos: 21 }),
      nativeEvent({
        kind: "collect",
        withinTickOrder: 2,
        targetPos: 30,
        action: null,
      }),
    ];
    const accumulated = await accumulate(events);

    expect(accumulated.rawEventCount).toBe(3);
    expect(accumulated.retainedEventCount).toBe(2);
    expect(accumulated.events[0]!.p7Aggregation).toMatchObject({
      artifact: "ccsolver-p7-toggle-wall-button-activation",
      semanticAction: "cc1:toggle-walls",
      eventCount: 2,
      firstWithinTickOrder: 0,
      lastWithinTickOrder: 1,
      orderedTargets: {
        algorithm: "sha256",
        canonicalization: "tworld-canonical-json-v1",
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
    });
    expect(accumulated.events[1]!.kind).toBe("collect");
    expect(accumulated.fullEventStream).toMatchObject({
      artifact: "ccsolver-p7-ordered-native-event-stream-digest",
      eventCount: 3,
      chunking: { maximumEventsPerChunk: 4_096, chunkCount: 1 },
    });
    expect(accumulated.chunkManifest).toHaveLength(1);
    expect(accumulated.chunkManifest[0]).toMatchObject({
      firstEventOrdinal: 0,
      eventCount: 3,
      firstNativeTick: 4,
      lastNativeTick: 4,
    });
    const expectedCanonicalByteLength = new TextEncoder().encode(canonicalizeJson({
      events,
      eventsOrder: "sequence",
    } as unknown as CanonicalJsonValue)).byteLength;
    expect(accumulated.fullEventStream.canonicalByteLength).toBe(expectedCanonicalByteLength);
  });

  it("binds toggle-wall target identity, order, and count independently of the selected anchor", async () => {
    const original = await accumulate([
      nativeEvent({ withinTickOrder: 0, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 1, targetPos: 21 }),
    ]);
    const changedTarget = await accumulate([
      nativeEvent({ withinTickOrder: 0, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 1, targetPos: 22 }),
    ]);
    const changedOrder = await accumulate([
      nativeEvent({ withinTickOrder: 0, targetPos: 21 }),
      nativeEvent({ withinTickOrder: 1, targetPos: 20 }),
    ]);
    const changedCount = await accumulate([
      nativeEvent({ withinTickOrder: 0, targetPos: 20 }),
    ]);
    const aggregateDigest = (value: Awaited<ReturnType<typeof accumulate>>) => (
      value.events[0]!.p7Aggregation!.orderedTargets.digest
    );

    expect(new Set([
      aggregateDigest(original),
      aggregateDigest(changedTarget),
      aggregateDigest(changedOrder),
      aggregateDigest(changedCount),
    ])).toHaveLength(4);
    expect(new Set([
      original.fullEventStream.manifest.digest,
      changedTarget.fullEventStream.manifest.digest,
      changedOrder.fullEventStream.manifest.digest,
      changedCount.fullEventStream.manifest.digest,
    ])).toHaveLength(4);
    expect(changedCount.events[0]!.p7Aggregation!.eventCount).toBe(1);
  });

  it("keeps distinct and parity-cancelling button activations separate", async () => {
    const separated = await accumulate([
      nativeEvent({ withinTickOrder: 0, actorSerial: 7, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 1, actorSerial: 7, targetPos: 21 }),
      nativeEvent({ withinTickOrder: 2, actorSerial: 8, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 3, actorSerial: 8, targetPos: 21 }),
    ]);
    expect(separated.events).toHaveLength(2);
    expect(separated.events.map(({ p7Aggregation }) => p7Aggregation?.eventCount)).toEqual([2, 2]);

    const parityCancelling = await accumulate([
      nativeEvent({ withinTickOrder: 0, actorSerial: 7, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 1, actorSerial: 7, targetPos: 21 }),
      nativeEvent({ withinTickOrder: 2, actorSerial: 7, targetPos: 20 }),
      nativeEvent({ withinTickOrder: 3, actorSerial: 7, targetPos: 21 }),
    ]);
    expect(parityCancelling.events).toHaveLength(2);
    expect(parityCancelling.events.map(({ p7Aggregation }) => ({
      artifact: p7Aggregation?.artifact,
      eventCount: p7Aggregation?.eventCount,
      first: p7Aggregation?.firstWithinTickOrder,
      last: p7Aggregation?.lastWithinTickOrder,
    }))).toEqual([
      {
        artifact: "ccsolver-p7-toggle-wall-button-activation",
        eventCount: 2,
        first: 0,
        last: 1,
      },
      {
        artifact: "ccsolver-p7-toggle-wall-button-activation",
        eventCount: 2,
        first: 2,
        last: 3,
      },
    ]);
  });

  it("preflights retained capacity and exact native order before mutating state", async () => {
    const ordered = new P7TrainingEventAccumulator({
      occurrenceId: "order",
      target: "lynx",
      sha256,
      maximumRetainedEvents: 3,
    });
    ordered.record(nativeEvent({ kind: "collect", withinTickOrder: 0, action: null }));
    expect(() => ordered.record(nativeEvent({
      kind: "open-door",
      withinTickOrder: 2,
      action: null,
    }))).toThrow("native event order is not exact and monotonic");
    ordered.record(nativeEvent({ kind: "open-door", withinTickOrder: 1, action: null }));
    await ordered.flushNativeTick();
    expect(() => ordered.record(nativeEvent({
      kind: "open-socket",
      nativeTick: 4,
      withinTickOrder: 0,
      action: null,
    }))).toThrow("native event order is not exact and monotonic");
    ordered.record(nativeEvent({
      kind: "open-socket",
      nativeTick: 5,
      withinTickOrder: 0,
      action: null,
    }));
    await ordered.flushNativeTick();
    expect((await ordered.finish()).rawEventCount).toBe(3);

    const bounded = new P7TrainingEventAccumulator({
      occurrenceId: "overflow",
      target: "lynx",
      sha256,
      maximumRetainedEvents: 1,
    });
    bounded.record(nativeEvent({ kind: "collect", withinTickOrder: 0, action: null }));
    expect(() => bounded.record(nativeEvent({
      kind: "open-door",
      withinTickOrder: 1,
      action: null,
    }))).toThrow("retained causal event capacity exhausted");
    await bounded.flushNativeTick();
    expect(await bounded.finish()).toMatchObject({
      rawEventCount: 1,
      retainedEventCount: 1,
    });
  });

  it("does not reserve another open chunk when finalizing at the unhashed-byte cap", async () => {
    const base = {
      ...nativeEvent({ kind: "collect", withinTickOrder: 0, action: null }),
      p7TestPadding: "",
    };
    const baseByteLength = new TextEncoder().encode(canonicalizeJson(
      base as unknown as CanonicalJsonValue,
    )).byteLength;
    const eventByteLength = P7_TRAINING_EVENT_STREAM_LIMITS.maximumQueuedCanonicalBytes - 2;
    const event = {
      ...base,
      p7TestPadding: "x".repeat(eventByteLength - baseByteLength),
    } as unknown as P7TrainingNativeCausalEvent;
    expect(new TextEncoder().encode(canonicalizeJson(
      event as unknown as CanonicalJsonValue,
    )).byteLength).toBe(eventByteLength);
    const accumulator = new P7TrainingEventAccumulator({
      occurrenceId: "final-chunk-cap",
      target: "lynx",
      sha256,
      maximumRetainedEvents: 1,
    });
    accumulator.record(event);
    await accumulator.flushNativeTick();
    await expect(accumulator.finish()).resolves.toMatchObject({
      rawEventCount: 1,
      fullEventStream: {
        chunking: { chunkCount: 1 },
      },
    });
  });

  it("binds deterministic chunk boundaries and rejects manifest overflow or drift", async () => {
    const accumulator = new P7TrainingEventAccumulator({
      occurrenceId: "chunk-boundary",
      target: "ms",
      sha256,
      maximumRetainedEvents: P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk + 1,
    });
    for (
      let ordinal = 0;
      ordinal <= P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk;
      ordinal += 1
    ) {
      accumulator.record(nativeEvent({
        kind: "collect",
        withinTickOrder: ordinal,
        action: null,
      }));
    }
    await accumulator.flushNativeTick();
    const accumulated = await accumulator.finish();
    expect(accumulated.chunkManifest.map(({ firstEventOrdinal, eventCount }) => ({
      firstEventOrdinal,
      eventCount,
    }))).toEqual([
      { firstEventOrdinal: 0, eventCount: 4_096 },
      { firstEventOrdinal: 4_096, eventCount: 1 },
    ]);
    expect(accumulated.chunkManifest.map(({ firstNativeTick, lastNativeTick }) => ({
      firstNativeTick,
      lastNativeTick,
    }))).toEqual([
      { firstNativeTick: 4, lastNativeTick: 4 },
      { firstNativeTick: 4, lastNativeTick: 4 },
    ]);
    expect(() => assertP7TrainingEventStreamDigest(accumulated.fullEventStream)).not.toThrow();
    expect(() => assertP7TrainingEventStreamDigest({
      ...accumulated.fullEventStream,
      manifest: {
        ...accumulated.fullEventStream.manifest,
        digest: "sha256:not-a-digest",
      },
    })).toThrow("manifest is invalid");

    const driftedBoundary = structuredClone(accumulated.chunkManifest) as P7TrainingEventStreamChunkDescriptorV1[];
    driftedBoundary[0] = { ...driftedBoundary[0]!, eventCount: 4_095 };
    expect(() => assertP7TrainingEventStreamManifest({
      eventCount: accumulated.rawEventCount,
      canonicalByteLength: accumulated.fullEventStream.canonicalByteLength,
      chunks: driftedBoundary,
    })).toThrow("chunk 0 is invalid");

    const driftedRoot = structuredClone(accumulated.chunkManifest) as P7TrainingEventStreamChunkDescriptorV1[];
    driftedRoot[1] = {
      ...driftedRoot[1]!,
      events: { ...driftedRoot[1]!.events, digest: `sha256:${"f".repeat(64)}` },
    };
    const changedRoot = await digestP7TrainingEventStreamManifest({
      eventCount: accumulated.rawEventCount,
      canonicalByteLength: accumulated.fullEventStream.canonicalByteLength,
      chunks: driftedRoot,
    }, sha256);
    expect(changedRoot.digest).not.toBe(accumulated.fullEventStream.manifest.digest);

    const tooManyChunks = Array.from({
      length: P7_TRAINING_EVENT_STREAM_LIMITS.maximumChunkCount + 1,
    }, (_, index): P7TrainingEventStreamChunkDescriptorV1 => ({
      index,
      firstEventOrdinal: index * P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk,
      eventCount: P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventsPerChunk,
      firstNativeTick: index,
      lastNativeTick: index,
      events: {
        algorithm: "sha256",
        canonicalization: "tworld-canonical-json-v1",
        digest: `sha256:${"0".repeat(64)}`,
        byteLength: 2,
      },
    }));
    expect(() => assertP7TrainingEventStreamManifest({
      eventCount: P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventCount,
      canonicalByteLength: 1,
      chunks: tooManyChunks,
    })).toThrow("published bounds");
  });
});
