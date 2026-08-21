import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  advanceLynxInteractiveSession,
  createLynxReplaySession,
} from "@ruleset-lynx/impl/engine";
import { lynxElementFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import { expect, it } from "vitest";
import { CCLP1_FOUNDATION_LIMITS } from "../p7b-cohort/cclp1FoundationCohort";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import {
  materializeDetachedLevelSource,
  materializeDetachedReplaySolution,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import { processP7TrainingLevel } from "./p7TrainingLevelProcessor";
import {
  P7_TRAINING_EVENT_STREAM_LIMITS,
  P7TrainingEventAccumulator,
} from "./p7TrainingEventAccumulator";
import { validateAndPersistP7TrainingLevelProcessOutput } from "./p7TrainingShardProtocol";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sha256 = new WebCryptoSha256();

async function loadCanary() {
  const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot, sha256);
  const source = inventory.packs
    .flatMap(({ levels }) => levels)
    .find(({ occurrenceId }) => occurrenceId === "cclp5/086");
  if (source === undefined) throw new Error("missing exact CCLP5 event-capacity canary");
  return source;
}

it("processes the exact CCLP5 event-capacity canary within its published bounds", async () => {
  const source = await loadCanary();
  const output = await processP7TrainingLevel(source, sha256);
  const rawLynx = output.trainingReplayLevel.variants.find(({ variantId }) => (
    variantId === "raw-lynx"
  ))!;
  const evidenceReference = rawLynx.certifications.lynx.evidence!;
  const evidenceBlob = output.generatedEvidence.blobs.find(({ content }) => (
    content.digest === evidenceReference.digest
    && content.byteLength === evidenceReference.byteLength
  ))!;
  const receipt = JSON.parse(new TextDecoder().decode(evidenceBlob.bytes)) as {
    readonly eventCount: number;
    readonly fullEventStream: {
      readonly eventCount: number;
      readonly canonicalByteLength: number;
      readonly chunking: { readonly chunkCount: number };
    };
  };

  expect(output.status).toBe("complete");
  expect(receipt).toMatchObject({
    eventCount: 494_330,
    fullEventStream: {
      eventCount: 494_330,
      canonicalByteLength: 192_636_537,
      chunking: { chunkCount: 121 },
    },
  });
  expect(output.browserReplays.length).toBeGreaterThanOrEqual(3);
  for (const replay of output.browserReplays) {
    expect(replay.parity.receipt.observed.eventCount)
      .toBe(replay.parity.receipt.expected.eventCount);
    expect(replay.parity.receipt.observed.fullEventStream)
      .toEqual(replay.parity.receipt.expected.fullEventStream);
  }
  await expect(validateAndPersistP7TrainingLevelProcessOutput(
    source,
    output,
    sha256,
    repositoryRoot,
    async () => undefined,
  )).resolves.toBeDefined();
}, 300_000);

it("measures the exact CCLP5 Lynx event stream without retaining the raw stream", async () => {
  const source = await loadCanary();
  const target = source.targets.find((entry) => entry.target === "lynx")!;
  const candidate = target.donorCandidates[0]!;
  const detached = materializeDetachedLevelSource(source.source);
  const expanded = materializeDetachedReplaySolution(candidate.replay);
  const prepared = lynxElementFamilyRegistration.levelLoadRegistration.prepareLoadedLevel({
    levelData: new Uint8Array(detached.levelData),
    layerData: detached.layerData.map((bytes) => new Uint8Array(bytes)),
  });
  const replay = {
    ...structuredClone(expanded),
    bestTimeTicks: candidate.replay.bestTimeTicks,
    modifierMasks: [],
  };
  let session = createLynxReplaySession({
    seriesFile: target.execution.request.seriesFile,
    levelNumber: source.levelNumber,
    ruleset: "Lynx",
    randomSeed: expanded.randomSeed & 0x7fff_ffff,
  }, prepared, replay);
  const accumulator = new P7TrainingEventAccumulator({
    occurrenceId: source.occurrenceId,
    target: "lynx",
    sha256,
    maximumRetainedEvents: CCLP1_FOUNDATION_LIMITS.maximumRetainedEventsPerTarget,
  });
  const kinds = new Map<string, number>();
  const actions = new Map<string, number>();
  const eventsByTick = new Map<number, number>();
  const deviceSources = new Set<string>();
  const deviceTargets = new Set<string>();
  const anchorKinds = new Set([
    "complete-level", "collect", "teleport", "device-activated", "open-socket", "open-door",
  ]);
  let eventCount = 0;
  let semanticAnchorCount = 0;
  let advanceTickCount = 0;
  const maximumAdvanceTicks = candidate.replay.bestTimeTicks
    + CCLP1_FOUNDATION_LIMITS.replayTickSlackPerTarget;
  while (session.endGameResult === null && advanceTickCount < maximumAdvanceTicks) {
    session = advanceLynxInteractiveSession(session, 0, {
      causalEventSink: (event) => {
        eventCount += 1;
        accumulator.record(event);
        kinds.set(event.kind, (kinds.get(event.kind) ?? 0) + 1);
        actions.set(event.action ?? "none", (actions.get(event.action ?? "none") ?? 0) + 1);
        eventsByTick.set(event.nativeTick, (eventsByTick.get(event.nativeTick) ?? 0) + 1);
        if (event.kind === "device-activated") {
          deviceSources.add(`${event.sourcePosition?.z ?? "none"}:${event.sourcePosition?.pos ?? "none"}`);
          deviceTargets.add(`${event.before?.z ?? "none"}:${event.before?.pos ?? "none"}`);
        }
        if (anchorKinds.has(event.kind)) semanticAnchorCount += 1;
      },
    });
    await accumulator.flushNativeTick();
    advanceTickCount += 1;
  }
  const accumulated = await accumulator.finish();
  const measurement = {
    occurrenceId: source.occurrenceId,
    target: "lynx",
    eventCount,
    canonicalByteLength: accumulated.fullEventStream.canonicalByteLength,
    retainedEventCount: accumulated.retainedEventCount,
    chunkCount: accumulated.fullEventStream.chunking.chunkCount,
    semanticAnchorCount,
    terminalNativeTick: session.state.timer.currentTime,
    endGameResult: session.endGameResult,
    advanceTickCount,
    kinds: [...kinds].sort((left, right) => right[1] - left[1]),
    actions: [...actions].sort((left, right) => right[1] - left[1]),
    maximumEventsInTick: Math.max(...eventsByTick.values()),
    deviceSourceCount: deviceSources.size,
    deviceTargetCount: deviceTargets.size,
  };
  if (process.env.TWORLD_P7_TRAINING_METRICS === "1") {
    process.stderr.write(`${JSON.stringify(measurement)}\n`);
  }
  expect(measurement).toMatchObject({
    occurrenceId: "cclp5/086",
    target: "lynx",
    eventCount: 494_330,
    canonicalByteLength: 192_636_537,
    retainedEventCount: 2_696,
    chunkCount: 121,
    semanticAnchorCount: 490_507,
    terminalNativeTick: 1_185,
    endGameResult: "completed",
    advanceTickCount: 1_186,
    maximumEventsInTick: 424,
    deviceSourceCount: 16,
    deviceTargetCount: 208,
  });
  expect(accumulated.rawEventCount).toBeGreaterThan(
    CCLP1_FOUNDATION_LIMITS.maximumRetainedEventsPerTarget,
  );
  expect(accumulated.rawEventCount).toBeLessThanOrEqual(
    P7_TRAINING_EVENT_STREAM_LIMITS.maximumEventCount,
  );
  expect(accumulated.fullEventStream.canonicalByteLength).toBeGreaterThan(
    CCLP1_FOUNDATION_LIMITS.maximumEventStreamCanonicalBytes,
  );
  expect(accumulated.fullEventStream.canonicalByteLength).toBeLessThanOrEqual(
    P7_TRAINING_EVENT_STREAM_LIMITS.maximumCanonicalBytes,
  );
}, 120_000);
