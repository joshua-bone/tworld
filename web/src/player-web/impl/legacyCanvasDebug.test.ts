import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { PerfMetricSnapshot, ValueMetricSnapshot } from "@player-web/impl/runtimePerf";
import {
  buildLegacyCanvasDebugReadout,
  buildLegacyCanvasPerfReadout,
  type LegacyCanvasPerfReadout,
  type LegacyCanvasPerfWindowSnapshot,
} from "@player-web/impl/legacyCanvasDebug";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createCell(pos: number, z: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: {
      x: pos % 32,
      y: Math.floor(pos / 32),
      z,
      pos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createSession(): InteractiveGameSession {
  const lowerCells = [createCell(0, 1, MS_TILE.Empty, MS_TILE.Empty)];
  const upperCells = [createCell(0, 2, MS_TILE.Air, MS_TILE.Empty)];

  return {
    request: {
      levelNumber: 1,
      randomSeed: 123,
      ruleset: "Lynx",
      seriesFile: "debug-test.dac",
    },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 4,
        currentTime: 4,
        timeOffset: 0,
        secondsPlayed: 0,
        timelimit: 0,
        chipsNeeded: 0,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 0,
        randomState: {
          main: { initial: "0", value: "0", shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0], tools: [0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "",
        mapHash: "",
        creatures: [],
      },
      cells: upperCells,
      currentZ: 2,
      visibleLayers: [
        { z: 2, cells: upperCells },
        { z: 1, cells: lowerCells },
      ],
      tileOverlays: [
        {
          z: 2,
          pos: 0,
          kind: "support",
          render: {
            mode: "outline",
            style: "support",
          },
        },
      ],
      render: {
        chip: {
          pos: 0,
          z: 2,
          dir: MS_DIRECTION.east,
          moving: 2,
          pushing: false,
          hidden: false,
          failed: false,
          endGameAnimationTileId: null,
          endGameAnimationFrame: null,
          visual: {
            kind: "creature",
            tileId: MS_TILE.Chip,
          },
        },
        actors: [
          {
            id: MS_TILE.BowlingBall,
            pos: 0,
            z: 2,
            dir: MS_DIRECTION.east,
            moving: 4,
            frame: 1,
            hidden: false,
            visual: {
              kind: "creature",
              tileId: MS_TILE.BowlingBall,
            },
          },
        ],
        animations: [
          {
            pos: 0,
            z: 2,
            frame: 3,
            tileId: MS_TILE.Water,
          },
        ],
      },
    },
    history: {
      enabled: true,
      initialTick: 0,
      currentTick: 4,
      latestTick: 4,
      checkpointTicks: [0],
      previousTick: 3,
      previousCheckpointTick: 0,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: false,
      result: null,
    },
    recordedMoves: [],
    handle: {} as InteractiveGameSession["handle"],
  };
}

function createPerfMetricSnapshot(lastMs: number, emaMs: number = lastMs, maxMs: number = lastMs): PerfMetricSnapshot {
  return {
    avgMs: lastMs,
    budgetMs: 12,
    emaMs,
    label: "test",
    lastMs,
    maxMs,
    recentAvgMs: lastMs,
    recentLastMs: lastMs,
    recentMaxMs: maxMs,
    recentSamples: 1,
    samples: 1,
    warnCount: 0,
    windowMs: 5000,
  };
}

function createValueMetricSnapshot(
  lastValue: number,
  emaValue: number = lastValue,
  maxValue: number = lastValue,
): ValueMetricSnapshot {
  return {
    avgValue: lastValue,
    emaValue,
    lastValue,
    maxValue,
    recentAvgValue: lastValue,
    recentLastValue: lastValue,
    recentMaxValue: maxValue,
    recentSamples: 1,
    samples: 1,
    windowMs: 5000,
  };
}

function createPerfWindowSnapshot(
  avgValue: number,
  lastValue: number = avgValue,
  maxValue: number = Math.max(avgValue, lastValue),
): LegacyCanvasPerfWindowSnapshot {
  return {
    avgValue,
    lastValue,
    maxValue,
    samples: 1,
    windowMs: 5000,
  };
}

function createPerfReadout(): LegacyCanvasPerfReadout {
  return {
    audioBootstrapMs: createPerfMetricSnapshot(18.4, 16.2, 27.1),
    buildCommitHash: "abcdef123456",
    cappedCatchUpBatches: 2,
    clockMode: "worker-accumulator",
    droppedCatchUpTicks: 5,
    frameFps: 58.4,
    frameFpsWindow: createPerfWindowSnapshot(59.1, 58.4, 60.0),
    firstCanvasPaintMs: createPerfMetricSnapshot(22.6, 20.4, 30.8),
    firstInteractiveDrawMs: createPerfMetricSnapshot(41.3, 39.1, 58.7),
    renderFps: 19.7,
    renderFpsWindow: createPerfWindowSnapshot(20.2, 19.7, 21.0),
    gameHz: 14.8,
    gameSampleElapsedMs: 500,
    gameSampleTickDelta: 8,
    gameHzWindow: createPerfWindowSnapshot(16.0, 14.8, 20.0),
    initialFrameProjectionMs: createPerfMetricSnapshot(3.2, 3.0, 4.1),
    initialHistoryProjectionMs: createPerfMetricSnapshot(0.8, 0.7, 1.4),
    initialProjectionMs: createPerfMetricSnapshot(6.4, 6.1, 8.0),
    initialRenderWarmupMs: createPerfMetricSnapshot(21.7, 20.1, 30.2),
    initialRuntimeInitMs: createPerfMetricSnapshot(1.1, 1.0, 1.8),
    initialSessionPackagingMs: createPerfMetricSnapshot(0.4, 0.3, 0.6),
    initialSessionStateMs: createPerfMetricSnapshot(0.9, 0.8, 1.2),
    lastCatchUpBatchTicks: 3,
    levelLoadMs: createPerfMetricSnapshot(31.6, 29.8, 44.5),
    loopDriftMs: {
      ...createPerfMetricSnapshot(11.4),
      recentAvgMs: 8.3,
      recentMaxMs: 11.4,
    },
    maxCatchUpBatchTicks: 4,
    prepareLevelMs: createPerfMetricSnapshot(8.8, 8.1, 12.4),
    renderMs: {
      ...createPerfMetricSnapshot(10.2, 9.7, 14.6),
      recentAvgMs: 9.9,
      recentMaxMs: 14.6,
    },
    sessionLoadMs: createPerfMetricSnapshot(48.1, 46.8, 63.4),
    tickMs: {
      ...createPerfMetricSnapshot(18.2, 16.9, 27.5),
      recentAvgMs: 17.1,
      recentMaxMs: 23.8,
    },
    tilesetBuildMs: createPerfMetricSnapshot(19.5, 17.7, 25.0),
    tilesetImageLoadMs: createPerfMetricSnapshot(18.4, 17.5, 26.2),
    tilesetLoadMs: createPerfMetricSnapshot(37.9, 35.2, 52.6),
    workerSessionStartMs: createPerfMetricSnapshot(45.4, 43.7, 59.3),
    workerAdvancePayloadBytes: {
      ...createValueMetricSnapshot(9216, 7168, 12288),
      recentAvgValue: 8192,
      recentMaxValue: 12288,
    },
    workerAdvanceRoundTripMs: {
      ...createPerfMetricSnapshot(14.3, 13.1, 20.7),
      recentAvgMs: 13.7,
      recentMaxMs: 18.1,
    },
  };
}

describe("buildLegacyCanvasDebugReadout", () => {
  it("returns a layered readout with overlays and render occupants for the hovered cell", () => {
    expect(buildLegacyCanvasDebugReadout(createSession(), 0)).toEqual([
      "ruleset=Lynx mode=manual tick=4 time=4 phase=tick",
      "hover pos=0 x=0 y=0 currentZ=2 visibleLayers=2",
      "current: top=Air(62) state=0 bottom=Empty(1) state=0",
      "layer z=2: top=Air(62) state=0 bottom=Empty(1) state=0",
      "layer z=1: top=Empty(1) state=0 bottom=Empty(1) state=0",
      "overlay z=2 kind=support tile=- render=outline:support",
      "chip z=2 dir=east moving=2 pushing=false hidden=false failed=false visual=Chip(64)",
      "actor z=2 id=BowlingBall(116) dir=east moving=4 frame=1 hidden=false visual=BowlingBall(116)",
      "animation z=2 tile=Water(14) frame=3",
    ]);
  });

  it("returns no lines when there is no active session or hover target", () => {
    expect(buildLegacyCanvasDebugReadout(null, 0)).toEqual([]);
    expect(buildLegacyCanvasDebugReadout(createSession(), null)).toEqual([]);
  });
});

describe("buildLegacyCanvasPerfReadout", () => {
  it("includes scheduler counters alongside frame and tick metrics", () => {
    expect(buildLegacyCanvasPerfReadout(createSession(), createPerfReadout())).toEqual([
      "build commit=abcdef123456 clock=worker-accumulator",
      "perf frame=58.4fps render=19.7fps game=14.8Hz",
      "roll5 frame=59.1fps render=20.2fps game=16.0Hz",
      "game sample ticks=8 window=500.0ms",
      "tick ms last=18.2 ema=16.9 max=27.5 avg5=17.1 max5=23.8",
      "drift ms last=11.4 avg5=8.3 max5=11.4",
      "draw ms last=10.2 ema=9.7 max=14.6 avg5=9.9 max5=14.6",
      "load ms total=48.1 worker=45.4 level=31.6 prepare=8.8 project=6.4",
      "paint ms first=22.6 interactive=41.3",
      "project ms runtime=1.1 frame=3.2 history=0.8 state=0.9 pack=0.4",
      "load5 total=48.1 worker=45.4 level=31.6 prepare=8.8 project=6.4",
      "paint5 first=22.6 interactive=41.3",
      "project5 runtime=1.1 frame=3.2 history=0.8 state=0.9 pack=0.4",
      "boot ms tileset=37.9 image=18.4 build=19.5 warm=21.7 sound=18.4",
      "boot5 tileset=37.9 image=18.4 build=19.5 warm=21.7 sound=18.4",
      "worker ms last=14.3 ema=13.1 max=20.7 avg5=13.7 max5=18.1",
      "payload last=9.0KB ema=7.0KB max=12.0KB avg5=8.0KB max5=12.0KB",
      "sched batch=3 max=4 capped=2 dropped=5",
      "scene ruleset=Lynx level=1 status=playing layers=2 actors=3 overlays=1",
      "history undo=on checkpoints=1 recent=0 restore=live",
    ]);
  });

  it("renders a no-session line when gameplay is not active", () => {
    expect(buildLegacyCanvasPerfReadout(null, createPerfReadout())).toEqual([
      "build commit=abcdef123456 clock=worker-accumulator",
      "perf frame=58.4fps render=19.7fps game=14.8Hz",
      "roll5 frame=59.1fps render=20.2fps game=16.0Hz",
      "game sample ticks=8 window=500.0ms",
      "tick ms last=18.2 ema=16.9 max=27.5 avg5=17.1 max5=23.8",
      "drift ms last=11.4 avg5=8.3 max5=11.4",
      "draw ms last=10.2 ema=9.7 max=14.6 avg5=9.9 max5=14.6",
      "load ms total=48.1 worker=45.4 level=31.6 prepare=8.8 project=6.4",
      "paint ms first=22.6 interactive=41.3",
      "project ms runtime=1.1 frame=3.2 history=0.8 state=0.9 pack=0.4",
      "load5 total=48.1 worker=45.4 level=31.6 prepare=8.8 project=6.4",
      "paint5 first=22.6 interactive=41.3",
      "project5 runtime=1.1 frame=3.2 history=0.8 state=0.9 pack=0.4",
      "boot ms tileset=37.9 image=18.4 build=19.5 warm=21.7 sound=18.4",
      "boot5 tileset=37.9 image=18.4 build=19.5 warm=21.7 sound=18.4",
      "worker ms last=14.3 ema=13.1 max=20.7 avg5=13.7 max5=18.1",
      "payload last=9.0KB ema=7.0KB max=12.0KB avg5=8.0KB max5=12.0KB",
      "sched batch=3 max=4 capped=2 dropped=5",
      "scene <no session>",
    ]);
  });
});
