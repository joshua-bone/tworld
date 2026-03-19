import { describe, expect, it } from "vitest";
import { scheduledInputForTick } from "@game-core/api/playback";
import { replaySolutionCodec } from "@game-core/api/codec";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { buildReplayExport } from "@game-runtime/impl/buildReplayExport";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { NodeCharacterizationFixtureRepository } from "@oracle-fixtures/impl/NodeCharacterizationFixtureRepository";
import { mapInputTraceFixtureToGameTrace, mapLevelInfoFixtureToSeriesLevels } from "@oracle-fixtures/impl/mappers/characterizationMapper";
import { LegacyMsInputBuffer } from "@player-web/impl/legacyInput";

const fixtureRepository = new NodeCharacterizationFixtureRepository();

function relativeMouseMoveCode(chipPos: number, targetPos: number): number {
  const mouseRangeMin = -9;
  const mouseRange = 19;
  const mouseMoveFirst =
    (GAME_INPUT_CODES.north | GAME_INPUT_CODES.west | GAME_INPUT_CODES.south | GAME_INPUT_CODES.east) + 1;
  const x = (targetPos % 32) - (chipPos % 32);
  const y = Math.floor(targetPos / 32) - Math.floor(chipPos / 32);
  return mouseMoveFirst + (y - mouseRangeMin) * mouseRange + (x - mouseRangeMin);
}

async function runManualSession(
  adapter: MsGameEngineAdapter | LynxGameEngineAdapter,
  scenarioName: string,
): Promise<{
  finalSession: InteractiveGameSession;
  sessionsByTick: Map<number, InteractiveGameSession>;
}> {
  const trace = mapInputTraceFixtureToGameTrace(await fixtureRepository.loadInputTrace(scenarioName));
  let session = await adapter.startSession(trace.request);
  const sessionsByTick = new Map<number, InteractiveGameSession>([[session.history.currentTick, session]]);

  for (let tick = 0; tick < trace.steps.length; tick += 1) {
    const scheduled = scheduledInputForTick(trace.scheduledInputs, tick);
    session = await adapter.advanceSession(session, scheduled.inputCode);
    sessionsByTick.set(session.history.currentTick, session);
  }

  return {
    finalSession: session,
    sessionsByTick,
  };
}

async function loadScenarioLevel(session: InteractiveGameSession) {
  const levels = mapLevelInfoFixtureToSeriesLevels(await fixtureRepository.loadLevelInfo(session.request.seriesFile));
  const level = levels.find((entry) => entry.number === session.request.levelNumber);
  expect(level).toBeDefined();
  return level!;
}

function gameplayFrameSummary(session: InteractiveGameSession) {
  return {
    snapshot: {
      status: session.frame.snapshot.status,
      tick: session.frame.snapshot.tick,
      currentTime: session.frame.snapshot.currentTime,
      timeOffset: session.frame.snapshot.timeOffset,
      secondsPlayed: session.frame.snapshot.secondsPlayed,
      timelimit: session.frame.snapshot.timelimit,
      chipsNeeded: session.frame.snapshot.chipsNeeded,
      statusFlags: session.frame.snapshot.statusFlags,
      stepping: session.frame.snapshot.stepping,
      initRandomSlideDir: session.frame.snapshot.initRandomSlideDir,
      randomState: session.frame.snapshot.randomState,
      view: session.frame.snapshot.view,
      inventory: session.frame.snapshot.inventory,
      chip: session.frame.snapshot.chip,
      creatureCount: session.frame.snapshot.creatureCount,
      creaturesHash: session.frame.snapshot.creaturesHash,
      mapHash: session.frame.snapshot.mapHash,
      creatures: session.frame.snapshot.creatures,
    },
    currentZ: session.frame.currentZ,
    cells: session.frame.cells,
    visibleLayers: session.frame.visibleLayers,
    tileOverlays: session.frame.tileOverlays,
    render: session.frame.render,
  };
}

async function expectMsReplayRoundTripMatchesManual(scenarioName: string): Promise<void> {
  const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
  const { finalSession, sessionsByTick } = await runManualSession(adapter, scenarioName);
  const level = await loadScenarioLevel(finalSession);
  const artifact = buildReplayExport(finalSession.request.seriesFile, level, finalSession);
  expect(artifact).not.toBeNull();

  const inspection = replaySolutionCodec.inspect(artifact!.bytes);
  expect(inspection).not.toBeNull();

  let replaySession = await adapter.startReplaySession(finalSession.request, inspection!.payload);
  expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(sessionsByTick.get(replaySession.history.currentTick)!));

  const latestTick = finalSession.history.currentTick;
  let safety = 0;
  while (replaySession.history.currentTick < latestTick && safety < latestTick + 10) {
    replaySession = await adapter.advanceSession(replaySession, "none");
    const manualAtTick = sessionsByTick.get(replaySession.history.currentTick);
    expect(manualAtTick, `missing manual session at tick ${replaySession.history.currentTick}`).toBeDefined();
    expect(
      {
        tick: replaySession.history.currentTick,
        liveStatus: manualAtTick?.frame.snapshot.status,
        replayStatus: replaySession.frame.snapshot.status,
        liveLastMove: manualAtTick?.frame.snapshot.lastMove,
        replayLastMove: replaySession.frame.snapshot.lastMove,
      },
      `MS replay diverged for ${scenarioName} at tick ${replaySession.history.currentTick}`,
    ).toEqual({
      tick: replaySession.history.currentTick,
      liveStatus: manualAtTick?.frame.snapshot.status,
      replayStatus: replaySession.frame.snapshot.status,
      liveLastMove: manualAtTick?.frame.snapshot.lastMove,
      replayLastMove: replaySession.frame.snapshot.lastMove,
    });
    expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(manualAtTick!));
    safety += 1;
  }

  expect(replaySession.history.currentTick).toBe(latestTick);
  expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(finalSession));
}

async function expectMsReplayRoundTripMatchesExplicitInputs(
  request: {
    seriesFile: string;
    levelNumber: number;
    ruleset: "MS";
    randomSeed: number;
  },
  moves: readonly {
    when: number;
    dir: number;
  }[],
  maxTicks: number,
): Promise<{
  inspection: NonNullable<ReturnType<typeof replaySolutionCodec.inspect>>;
}> {
  const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
  const levels = mapLevelInfoFixtureToSeriesLevels(await fixtureRepository.loadLevelInfo(request.seriesFile));
  const level = levels.find((entry) => entry.number === request.levelNumber);
  expect(level).toBeDefined();

  const inputsByTick = new Map(moves.map((move) => [move.when, move.dir]));
  let manual = await adapter.startSession(request);
  const sessionsByTick = new Map<number, InteractiveGameSession>([[manual.history.currentTick, manual]]);

  for (let tick = 0; tick < maxTicks; tick += 1) {
    const nextTick = manual.frame.snapshot.currentTime + 1;
    manual = await adapter.advanceSession(manual, inputsByTick.get(nextTick) ?? GAME_INPUT_CODES.none);
    sessionsByTick.set(manual.history.currentTick, manual);
  }

  const artifact = buildReplayExport(request.seriesFile, level!, manual);
  expect(artifact).not.toBeNull();

  const inspection = replaySolutionCodec.inspect(artifact!.bytes);
  expect(inspection).not.toBeNull();

  let replay = await adapter.startReplaySession(request, inspection!.payload);
  expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(sessionsByTick.get(replay.history.currentTick)!));

  const latestTick = manual.history.currentTick;
  let safety = 0;
  while (replay.history.currentTick < latestTick && safety < latestTick + 10) {
    replay = await adapter.advanceSession(replay, "none");
    const expected = sessionsByTick.get(replay.history.currentTick);
    expect(expected, `missing manual session at tick ${replay.history.currentTick}`).toBeDefined();
    expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(expected!));
    safety += 1;
  }

  expect(replay.history.currentTick).toBe(latestTick);
  expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(manual));

  return {
    inspection: inspection!,
  };
}

async function expectMsReplayRoundTripMatchesBufferedInputs(
  request: {
    seriesFile: string;
    levelNumber: number;
    ruleset: "MS";
    randomSeed: number;
  },
  maxTicks: number,
  driveBuffer: (
    buffer: LegacyMsInputBuffer,
    tick: number,
    session: InteractiveGameSession,
  ) => void,
): Promise<{
  inspection: NonNullable<ReturnType<typeof replaySolutionCodec.inspect>>;
}> {
  const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
  const levels = mapLevelInfoFixtureToSeriesLevels(await fixtureRepository.loadLevelInfo(request.seriesFile));
  const level = levels.find((entry) => entry.number === request.levelNumber);
  expect(level).toBeDefined();

  const buffer = new LegacyMsInputBuffer();
  let manual = await adapter.startSession(request);
  const sessionsByTick = new Map<number, InteractiveGameSession>([[manual.history.currentTick, manual]]);

  for (let tick = 0; tick < maxTicks; tick += 1) {
    driveBuffer(buffer, tick, manual);
    manual = await adapter.advanceSession(manual, buffer.nextTickInputCode());
    sessionsByTick.set(manual.history.currentTick, manual);
  }

  const artifact = buildReplayExport(request.seriesFile, level!, manual);
  expect(artifact).not.toBeNull();

  const inspection = replaySolutionCodec.inspect(artifact!.bytes);
  expect(inspection).not.toBeNull();

  let replay = await adapter.startReplaySession(request, inspection!.payload);
  expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(sessionsByTick.get(replay.history.currentTick)!));

  const latestTick = manual.history.currentTick;
  let safety = 0;
  while (replay.history.currentTick < latestTick && safety < latestTick + 10) {
    replay = await adapter.advanceSession(replay, "none");
    const expected = sessionsByTick.get(replay.history.currentTick);
    expect(expected, `missing manual session at tick ${replay.history.currentTick}`).toBeDefined();
    expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(expected!));
    safety += 1;
  }

  expect(replay.history.currentTick).toBe(latestTick);
  expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(manual));

  return {
    inspection: inspection!,
  };
}

async function expectLynxReplayRoundTripMatchesManual(scenarioName: string): Promise<void> {
  const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
  const { finalSession, sessionsByTick } = await runManualSession(adapter, scenarioName);
  const level = await loadScenarioLevel(finalSession);
  const artifact = buildReplayExport(finalSession.request.seriesFile, level, finalSession);
  expect(artifact).not.toBeNull();

  const inspection = replaySolutionCodec.inspect(artifact!.bytes);
  expect(inspection).not.toBeNull();

  let replaySession = await adapter.startReplaySession(finalSession.request, inspection!.payload);
  expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(sessionsByTick.get(replaySession.history.currentTick)!));

  const latestTick = finalSession.history.currentTick;
  let safety = 0;
  while (replaySession.history.currentTick < latestTick && safety < latestTick + 10) {
    replaySession = await adapter.advanceSession(replaySession, "none");
    const manualAtTick = sessionsByTick.get(replaySession.history.currentTick);
    expect(manualAtTick, `missing manual session at tick ${replaySession.history.currentTick}`).toBeDefined();
    expect(
      {
        tick: replaySession.history.currentTick,
        liveStatus: manualAtTick?.frame.snapshot.status,
        replayStatus: replaySession.frame.snapshot.status,
        liveLastMove: manualAtTick?.frame.snapshot.lastMove,
        replayLastMove: replaySession.frame.snapshot.lastMove,
      },
      `Lynx replay diverged for ${scenarioName} at tick ${replaySession.history.currentTick}`,
    ).toEqual({
      tick: replaySession.history.currentTick,
      liveStatus: manualAtTick?.frame.snapshot.status,
      replayStatus: replaySession.frame.snapshot.status,
      liveLastMove: manualAtTick?.frame.snapshot.lastMove,
      replayLastMove: replaySession.frame.snapshot.lastMove,
    });
    expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(manualAtTick!));
    safety += 1;
  }

  expect(replaySession.history.currentTick).toBe(latestTick);
  expect(gameplayFrameSummary(replaySession)).toEqual(gameplayFrameSummary(finalSession));
}

describe("exported replay parity", () => {
  it("replays exported MS runs exactly", async () => {
    for (const scenarioName of ["intro-ms-level-6-teleports-east", "intro-ms-level-8-buttons-east", "intro-ms-level-9-complete"]) {
      await expectMsReplayRoundTripMatchesManual(scenarioName);
    }
  });

  it("replays exported Lynx runs exactly", async () => {
    for (const scenarioName of ["intro-lynx-level-1-east-chips", "intro-lynx-level-6-teleports-east", "intro-lynx-level-8-buttons-east"]) {
      await expectLynxReplayRoundTripMatchesManual(scenarioName);
    }
  });

  it("preserves MS legacy hold-repeat timing when exporting a replay", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const buffer = new LegacyMsInputBuffer();
    let manual = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const sessionsByTick = new Map<number, InteractiveGameSession>([[manual.history.currentTick, manual]]);
    buffer.keyDown("east");

    for (let tick = 0; tick < 8; tick += 1) {
      manual = await adapter.advanceSession(manual, buffer.nextTickInputCode());
      sessionsByTick.set(manual.history.currentTick, manual);
    }

    const level = await loadScenarioLevel(manual);
    const artifact = buildReplayExport(manual.request.seriesFile, level, manual);
    expect(artifact).not.toBeNull();

    const inspection = replaySolutionCodec.inspect(artifact!.bytes);
    expect(inspection).not.toBeNull();

    let replay = await adapter.startReplaySession(manual.request, inspection!.payload);
    expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(sessionsByTick.get(replay.history.currentTick)!));

    const latestTick = manual.history.currentTick;
    let safety = 0;
    while (replay.history.currentTick < latestTick && safety < latestTick + 10) {
      replay = await adapter.advanceSession(replay, "none");
      const expected = sessionsByTick.get(replay.history.currentTick);
      expect(expected, `missing manual session at tick ${replay.history.currentTick}`).toBeDefined();
      expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(expected!));
      safety += 1;
    }
  });

  it("records MS off-cycle turns on the consumed movement tick", async () => {
    const liveMoves = [
      { when: 0, dir: 8 },
      { when: 3, dir: 8 },
      { when: 4, dir: 8 },
      { when: 5, dir: 8 },
      { when: 6, dir: 8 },
      { when: 7, dir: 8 },
      { when: 8, dir: 8 },
      { when: 9, dir: 8 },
      { when: 10, dir: 8 },
      { when: 11, dir: 8 },
      { when: 12, dir: 8 },
      { when: 13, dir: 8 },
      { when: 14, dir: 8 },
      { when: 15, dir: 1 },
      { when: 18, dir: 1 },
      { when: 19, dir: 1 },
      { when: 20, dir: 1 },
      { when: 21, dir: 1 },
      { when: 22, dir: 1 },
      { when: 23, dir: 1 },
      { when: 24, dir: 1 },
      { when: 25, dir: 1 },
      { when: 26, dir: 2 },
    ] as const;

    const { inspection } = await expectMsReplayRoundTripMatchesExplicitInputs(
      {
        seriesFile: "CCLP1-MS.dac",
        levelNumber: 5,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      liveMoves,
      32,
    );

    expect(inspection.payload.moves.slice(0, 7)).toEqual([
      { when: 0, dir: 8 },
      { when: 4, dir: 8 },
      { when: 8, dir: 8 },
      { when: 12, dir: 8 },
      { when: 18, dir: 1 },
      { when: 20, dir: 1 },
      { when: 24, dir: 1 },
    ]);
  });

  it("round-trips exported MS absolute mouse-goals from the legacy input buffer", async () => {
    let targetPos = -1;

    const { inspection } = await expectMsReplayRoundTripMatchesBufferedInputs(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      8,
      (buffer, tick, session) => {
        if (tick !== 0) {
          return;
        }
        const chipPos = session.frame.snapshot.chip?.position.pos;
        if (chipPos === undefined) {
          throw new Error("expected interactive Chip position for MS mouse-goal parity test");
        }
        targetPos = chipPos + 1;
        buffer.queueAbsoluteMouseMove(targetPos);
      },
    );

    expect(inspection.payload.moves).toEqual([
      { when: 0, dir: relativeMouseMoveCode(targetPos - 1, targetPos) },
    ]);
  });

  it("round-trips exported MS mouse-goal retargets from the legacy input buffer", async () => {
    let firstTargetPos = -1;
    let secondTargetPos = -1;

    const { inspection } = await expectMsReplayRoundTripMatchesBufferedInputs(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      10,
      (buffer, tick, session) => {
        const chipPos = session.frame.snapshot.chip?.position.pos;
        if (chipPos === undefined) {
          throw new Error("expected interactive Chip position for MS mouse-goal retarget parity test");
        }
        if (tick === 0) {
          firstTargetPos = chipPos + 1;
          secondTargetPos = chipPos;
          buffer.queueAbsoluteMouseMove(firstTargetPos);
          return;
        }
        if (tick === 4) {
          buffer.queueAbsoluteMouseMove(secondTargetPos);
        }
      },
    );

    expect(inspection.payload.moves).toEqual([
      { when: 0, dir: relativeMouseMoveCode(secondTargetPos, firstTargetPos) },
      { when: 4, dir: relativeMouseMoveCode(firstTargetPos, secondTargetPos) },
    ]);
  });

  it("round-trips exported MS keyboard overrides after mouse-goals from the legacy input buffer", async () => {
    let targetPos = -1;

    const { inspection } = await expectMsReplayRoundTripMatchesBufferedInputs(
      {
        seriesFile: "intro-ms.dac",
        levelNumber: 1,
        ruleset: "MS",
        randomSeed: 123456789,
      },
      10,
      (buffer, tick, session) => {
        if (tick === 0) {
          const chipPos = session.frame.snapshot.chip?.position.pos;
          if (chipPos === undefined) {
            throw new Error("expected interactive Chip position for MS mouse-goal override parity test");
          }
          targetPos = chipPos + 1;
          buffer.queueAbsoluteMouseMove(targetPos);
          return;
        }
        if (tick === 4) {
          buffer.keyDown("west");
          buffer.keyUp("west");
        }
      },
    );

    expect(inspection.payload.moves).toEqual([
      { when: 0, dir: relativeMouseMoveCode(targetPos - 1, targetPos) },
      { when: 4, dir: GAME_INPUT_CODES.west },
    ]);
  });

  it("normalizes dense live Lynx inputs into a replay-compatible solution", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const request = {
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx" as const,
      randomSeed: 123456789,
    };
    const levels = mapLevelInfoFixtureToSeriesLevels(await fixtureRepository.loadLevelInfo(request.seriesFile));
    const level = levels.find((entry) => entry.number === request.levelNumber);
    expect(level).toBeDefined();

    let manual = await adapter.startSession(request);
    const sessionsByTick = new Map<number, InteractiveGameSession>([[manual.history.currentTick, manual]]);
    for (let tick = 0; tick < 16; tick += 1) {
      manual = await adapter.advanceSession(manual, GAME_INPUT_CODES.east);
      sessionsByTick.set(manual.history.currentTick, manual);
    }

    const artifact = buildReplayExport(request.seriesFile, level!, manual);
    expect(artifact).not.toBeNull();

    const inspection = replaySolutionCodec.inspect(artifact!.bytes);
    expect(inspection).not.toBeNull();
    expect(inspection!.payload.moves.length).toBeLessThan(16);

    let replay = await adapter.startReplaySession(request, inspection!.payload);
    let safety = 0;
    while (replay.history.currentTick < manual.history.currentTick && safety < manual.history.currentTick + 10) {
      replay = await adapter.advanceSession(replay, "none");
      const expected = sessionsByTick.get(replay.history.currentTick);
      expect(expected, `missing manual session at tick ${replay.history.currentTick}`).toBeDefined();
      expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(expected!));
      safety += 1;
    }

    expect(replay.history.currentTick).toBe(manual.history.currentTick);
    expect(gameplayFrameSummary(replay)).toEqual(gameplayFrameSummary(manual));
  });
});
