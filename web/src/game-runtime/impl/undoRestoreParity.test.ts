import { describe, expect, it } from "vitest";
import { scheduledInputForTick } from "@game-core/api/playback";
import { fromInteractiveHandle } from "@game-runtime/impl/interactiveHandle";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { restoreInteractiveGameSession } from "@game-runtime/impl/restoreInteractiveGameSession";
import { resumeInteractiveGameSession } from "@game-runtime/impl/resumeInteractiveGameSession";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { mapInputTraceFixtureToGameTrace } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import type { LynxInteractiveSessionState } from "@ruleset-lynx/impl/engine";
import type { MsInteractiveSessionState } from "@ruleset-ms/impl/engine";
import {
  digestLynxInteractiveSession,
  digestMsInteractiveSession,
} from "@undo-runtime/impl/sessionDigest";

const fixtureRepository = new NodeCharacterizationFixtureRepository();

function targetTicksForLatestTick(latestTick: number): number[] {
  return [...new Set([
    -1,
    0,
    Math.max(0, Math.floor(latestTick / 2)),
    Math.max(0, latestTick - 1),
  ])]
    .filter((tick) => tick <= latestTick)
    .sort((left, right) => left - right);
}

function msSessionDigest(session: InteractiveGameSession): string {
  const runtime = fromInteractiveHandle<MsInteractiveSessionState, unknown>(session.handle);
  return digestMsInteractiveSession(runtime.token);
}

function lynxSessionDigest(session: InteractiveGameSession): string {
  const runtime = fromInteractiveHandle<LynxInteractiveSessionState, unknown>(session.handle);
  return digestLynxInteractiveSession(runtime.token);
}

async function replayHistoricalFuture(
  adapter: MsGameEngineAdapter | LynxGameEngineAdapter,
  restored: InteractiveGameSession,
): Promise<InteractiveGameSession> {
  let current = await resumeInteractiveGameSession(adapter, restored);
  let safety = 0;
  while (current.history.restoreMode === "replaying-history") {
    current = await adapter.advanceSession(current, "none");
    safety += 1;
    expect(safety).toBeLessThan(10_000);
  }
  return current;
}

describe("undo restore parity", () => {
  it("reproduces exact MS runtime state across restore and resumed replay for live intro scenarios", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());

    for (const scenarioName of [
      "intro-ms-level-6-teleports-east",
      "intro-ms-level-8-buttons-east",
      "intro-ms-level-9-complete",
    ]) {
      const trace = mapInputTraceFixtureToGameTrace(await fixtureRepository.loadInputTrace(scenarioName));
      let session = await adapter.startSession(trace.request);
      const digests = new Map<number, string>([[session.history.currentTick, msSessionDigest(session)]]);

      for (let tick = 0; tick < trace.steps.length; tick += 1) {
        const scheduled = scheduledInputForTick(trace.scheduledInputs, tick);
        session = await adapter.advanceSession(session, scheduled.inputCode);
        digests.set(session.history.currentTick, msSessionDigest(session));
      }

      const latestTick = session.history.latestTick;
      expect(session.history.currentTick).toBe(latestTick);

      for (const targetTick of targetTicksForLatestTick(latestTick)) {
        const restored = await restoreInteractiveGameSession(adapter, session, targetTick);
        expect(msSessionDigest(restored)).toBe(digests.get(targetTick));

        const replayed = await replayHistoricalFuture(adapter, restored);
        expect(msSessionDigest(replayed)).toBe(digests.get(latestTick));
      }
    }
  });

  it("reproduces exact Lynx runtime state across restore and resumed replay for live intro scenarios", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());

    for (const scenarioName of [
      "intro-lynx-level-6-teleports-east",
      "intro-lynx-level-8-buttons-east",
      "intro-lynx-level-3-friends-idle",
    ]) {
      const trace = mapInputTraceFixtureToGameTrace(await fixtureRepository.loadInputTrace(scenarioName));
      let session = await adapter.startSession(trace.request);
      const digests = new Map<number, string>([[session.history.currentTick, lynxSessionDigest(session)]]);

      for (let tick = 0; tick < trace.steps.length; tick += 1) {
        const scheduled = scheduledInputForTick(trace.scheduledInputs, tick);
        session = await adapter.advanceSession(session, scheduled.inputCode);
        digests.set(session.history.currentTick, lynxSessionDigest(session));
      }

      const latestTick = session.history.latestTick;
      expect(session.history.currentTick).toBe(latestTick);

      for (const targetTick of targetTicksForLatestTick(latestTick)) {
        const restored = await restoreInteractiveGameSession(adapter, session, targetTick);
        expect(lynxSessionDigest(restored)).toBe(digests.get(targetTick));

        const replayed = await replayHistoricalFuture(adapter, restored);
        expect(lynxSessionDigest(replayed)).toBe(digests.get(latestTick));
      }
    }
  });
});
