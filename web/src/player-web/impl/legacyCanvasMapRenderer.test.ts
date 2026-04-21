import { describe, expect, it } from "vitest";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  buildLegacyGameDrawStateKey,
  buildCachedLowerLayerKey,
  collectVisibleLayerCacheWarmupTasks,
  hasCachedLowerLayerCanvas,
  resolveLegacyMapViewport,
  shouldDrawOpenTrapOccupant,
} from "@player-web/impl/legacyCanvasMapRenderer";
import { createLayerCanvasCache, storeCachedLayerCanvas } from "@player-web/impl/legacyLayerCanvasCache";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import type { LegacyTileset } from "@player-web/impl/legacyTileset";

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

function createSession(
  currentLayerTopId: number,
  renderOverrides: Partial<NonNullable<InteractiveGameSession["frame"]["render"]>> = {},
): InteractiveGameSession {
  const lowerCells = [createCell(0, 1, MS_TILE.Empty)];
  const upperCells = [createCell(0, 2, currentLayerTopId)];

  return {
    request: {
      seriesFile: "cloud-test.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123,
    },
    mode: "manual",
    hintText: null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick: 10,
        currentTime: 10,
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
      tileOverlays: [],
      render: {
        chip: null,
        actors: [],
        animations: [],
        ...renderOverrides,
      },
    },
    history: {
      enabled: true,
      initialTick: -1,
      currentTick: 10,
      latestTick: 10,
      checkpointTicks: [-1, 10],
      previousTick: 9,
      previousCheckpointTick: -1,
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

describe("buildLegacyGameDrawStateKey", () => {
  it("changes when the current visible layer cell contents change", () => {
    const before = createSession(MS_TILE.Cloud);
    const after = createSession(MS_TILE.Air);

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });

  it("changes when only render-state visuals change", () => {
    const before = createSession(MS_TILE.Empty, {
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
            artworkSpriteId: "bowling_ball_moving",
            dir: MS_DIRECTION.east,
            moving: 4,
            frame: 1,
          },
        },
      ],
    });
    const after = createSession(MS_TILE.Empty, {
      actors: [
        {
          id: MS_TILE.BowlingBall,
          pos: 0,
          z: 2,
          dir: MS_DIRECTION.east,
          moving: 0,
          frame: 0,
          hidden: false,
          visual: {
            kind: "creature",
            tileId: MS_TILE.BowlingBall,
            artworkSpriteId: "bowling_ball_moving",
            dir: MS_DIRECTION.east,
            moving: 0,
            frame: 0,
          },
        },
      ],
    });

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });

  it("changes when occupied pet carrier map render metadata changes", () => {
    const before = createSession(MS_TILE.PetCarrier);
    const after = createSession(MS_TILE.PetCarrier);
    before.frame.tileOverlays = [
      {
        z: 2,
        pos: 0,
        kind: "portable-item-state",
        tileId: MS_TILE.PetCarrier,
        render: {
          mode: "tile",
          tileId: MS_TILE.PetCarrier,
          artworkSpriteId: "pet_carrier",
          petCarrierRender: {
            baseTileId: MS_TILE.Empty,
            occupant: {
              kind: "creature",
              tileId: MS_TILE.Bug,
              dir: MS_DIRECTION.east,
              moving: 0,
              frame: 0,
            },
          },
        },
      },
    ];
    after.frame.tileOverlays = [
      {
        z: 2,
        pos: 0,
        kind: "portable-item-state",
        tileId: MS_TILE.PetCarrier,
        render: {
          mode: "tile",
          tileId: MS_TILE.PetCarrier,
          artworkSpriteId: "pet_carrier",
          petCarrierRender: {
            baseTileId: MS_TILE.Empty,
            occupant: {
              kind: "creature",
              tileId: MS_TILE.Paramecium,
              dir: MS_DIRECTION.east,
              moving: 0,
              frame: 0,
            },
          },
        },
      },
    ];

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });

  it("changes when only occupied tool inventory render metadata changes", () => {
    const before = createSession(MS_TILE.Empty);
    const after = createSession(MS_TILE.Empty);
    before.frame.snapshot.inventory.tools = [MS_TILE.PetCarrier];
    after.frame.snapshot.inventory.tools = [MS_TILE.PetCarrier];
    before.frame.inventoryRender = {
      tools: [
        {
          mode: "tile",
          tileId: MS_TILE.PetCarrier,
          artworkSpriteId: "pet_carrier",
          petCarrierRender: {
            baseTileId: MS_TILE.Empty,
            occupant: {
              kind: "creature",
              tileId: MS_TILE.Bug,
              dir: MS_DIRECTION.north,
              moving: 0,
              frame: 0,
            },
          },
        },
      ],
    };
    after.frame.inventoryRender = {
      tools: [
        {
          mode: "tile",
          tileId: MS_TILE.PetCarrier,
          artworkSpriteId: "pet_carrier",
          petCarrierRender: {
            baseTileId: MS_TILE.Empty,
            occupant: {
              kind: "creature",
              tileId: MS_TILE.Teeth,
              dir: MS_DIRECTION.north,
              moving: 0,
              frame: 0,
            },
          },
        },
      ],
    };

    expect(
      buildLegacyGameDrawStateKey(before, null, null, "Lynx", false, null, "legacy", true, true),
    ).not.toBe(
      buildLegacyGameDrawStateKey(after, null, null, "Lynx", false, null, "legacy", true, true),
    );
  });
});

describe("resolveLegacyMapViewport", () => {
  it("uses the preserved Lynx failed-chip slide when the render frame still carries movement", () => {
    const session = createSession(MS_TILE.Empty, {
      chip: {
        pos: 660,
        z: 2,
        dir: MS_DIRECTION.east,
        moving: 6,
        pushing: false,
        hidden: false,
        failed: true,
        endGameAnimationTileId: 0x76,
        endGameAnimationFrame: 3,
      },
    });
    session.frame.snapshot.view = { x: 160, y: 160 };

    expect(resolveLegacyMapViewport(session, "Lynx")).toEqual({
      viewX: 67,
      viewY: 64,
    });
  });

  it("falls back to the snapshot view for non-Lynx renders", () => {
    const session = createSession(MS_TILE.Empty, {
      chip: {
        pos: 660,
        z: 2,
        dir: MS_DIRECTION.east,
        moving: 6,
        pushing: false,
        hidden: false,
        failed: true,
        endGameAnimationTileId: 0x76,
        endGameAnimationFrame: 3,
      },
    });
    session.frame.snapshot.view = { x: 160, y: 160 };

    expect(resolveLegacyMapViewport(session, "MS")).toEqual({
      viewX: 64,
      viewY: 64,
    });
  });
});

describe("shouldDrawOpenTrapOccupant", () => {
  it("suppresses the enhancement-only destination occupant when a Lynx actor is still sliding in", () => {
    expect(shouldDrawOpenTrapOccupant(MS_TILE.Block, true)).toBe(false);
  });

  it("keeps drawing stationary open-trap occupants for the enhancement overlay", () => {
    expect(shouldDrawOpenTrapOccupant(MS_TILE.Block, false)).toBe(true);
    expect(shouldDrawOpenTrapOccupant(MS_TILE.Empty, false)).toBe(false);
  });
});

describe("collectVisibleLayerCacheWarmupTasks", () => {
  it("skips single-layer sessions", () => {
    const session = createSession(MS_TILE.Empty);
    session.frame.currentZ = 1;
    session.frame.cells = session.frame.visibleLayers[1]!.cells;
    session.frame.visibleLayers = [{ z: 1, cells: session.frame.visibleLayers[1]!.cells }];

    expect(collectVisibleLayerCacheWarmupTasks(session)).toEqual([]);
  });

  it("warms lower layers only across the initial timerval window", () => {
    const session = createSession(MS_TILE.Empty);
    const middleCells = [createCell(0, 2, MS_TILE.Cloud)];
    const topCells = [createCell(0, 3, MS_TILE.Chip)];
    session.frame.snapshot.currentTime = 7;
    session.frame.currentZ = 3;
    session.frame.cells = topCells;
    session.frame.visibleLayers = [
      { z: 3, cells: topCells },
      { z: 2, cells: middleCells },
      { z: 1, cells: session.frame.visibleLayers[1]!.cells },
    ];

    expect(collectVisibleLayerCacheWarmupTasks(session)).toEqual([
      { layerIndex: 2, layerZ: 1, timerval: 7 },
      { layerIndex: 1, layerZ: 2, timerval: 7 },
      { layerIndex: 2, layerZ: 1, timerval: 8 },
      { layerIndex: 1, layerZ: 2, timerval: 8 },
      { layerIndex: 2, layerZ: 1, timerval: 9 },
      { layerIndex: 1, layerZ: 2, timerval: 9 },
      { layerIndex: 2, layerZ: 1, timerval: 10 },
      { layerIndex: 1, layerZ: 2, timerval: 10 },
      { layerIndex: 2, layerZ: 1, timerval: 11 },
      { layerIndex: 1, layerZ: 2, timerval: 11 },
    ]);
  });
});

describe("hasCachedLowerLayerCanvas", () => {
  it("treats uncached lower layers as transient until warmup fills the cache", () => {
    const session = createSession(MS_TILE.Empty);
    const layer = session.frame.visibleLayers[1]!;
    const cache = createLayerCanvasCache();
    const tileset: LegacyTileset = {
      get: () => null,
      getCellAnimationPeriod: () => 1,
    };

    expect(hasCachedLowerLayerCanvas(cache, tileset, session, "Lynx", layer, 10, true)).toBe(false);

    storeCachedLayerCanvas(
      cache,
      buildCachedLowerLayerKey(tileset, session, "Lynx", layer, 10, true),
      {} as HTMLCanvasElement,
    );

    expect(hasCachedLowerLayerCanvas(cache, tileset, session, "Lynx", layer, 10, true)).toBe(true);
  });
});
