import { describe, expect, it } from "vitest";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { MS_STATUS_FLAG, MS_TILE } from "@ruleset-ms/api/tiles";
import { HybridCcInputBuffer } from "@player-web/impl/hybridcc/inputCollector";
import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_MOVEMENT_CLASS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
  HYBRID_CC_V1_OUTCOME,
  HYBRID_CC_V1_RULE,
} from "./engineFacts";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
} from "./HybridCcV1GameEngineAdapter";
import {
  testActor,
  testCell,
  testElement,
  testEvent,
  testMotionTrack,
  testPlayerPush,
  testSnapshot,
} from "./testFacts";
import type {
  HybridCcV1ConvertedLevel,
  HybridCcV1Engine,
  HybridCcV1Replay,
  HybridCcV1Snapshot,
} from "./wasmBridge";

function convertedLevel(width = 2): HybridCcV1ConvertedLevel {
  return {
    status: 0,
    entryOrdinal: 0,
    requiredChips: 0,
    diagnosticCount: 0,
    nativeLevel: {
      width,
      height: 1,
      depth: 1,
      number: 1,
      timeLimitSeconds: 100,
      title: "Adapter",
      author: "Test",
      hint: "Read the hint",
      password: "ABCD",
      titleBytes: new Uint8Array(),
      authorBytes: new Uint8Array(),
      hintBytes: new Uint8Array(),
      passwordBytes: new Uint8Array(),
      texts: ["Read the hint"],
      textBytes: [new Uint8Array()],
      encoded: new Uint8Array([1]),
    },
  };
}

function snapshot(
  boundary: number,
  overrides: Partial<HybridCcV1Snapshot> = {},
): HybridCcV1Snapshot {
  const player = testActor({
    logicalPosition: { x: boundary === 0 ? 0 : 1, y: 0, z: 0 },
    hasMovement: boundary > 0,
    movement: {
      origin: { x: 0, y: 0, z: 0 },
      destination: { x: 1, y: 0, z: 0 },
      direction: 1,
      slapDirection: 4,
      startBoundary: 1n,
      completionBoundary: 3n,
      owner: 1,
      movementClass: 0,
      discontinuous: false,
    },
  });
  const base = testSnapshot({
    header: {
      ...testSnapshot().header,
      width: 2,
      height: 1,
      cellCount: 2,
      logicBoundary: BigInt(boundary),
      stateHash: BigInt(boundary + 1),
    },
    cells: [
      testCell({ occupant: boundary === 0 ? player.id : null }),
      testCell({ occupant: boundary > 0 ? player.id : null }),
    ],
    actors: [player],
    presentation: {
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: boundary > 0 ? testMotionTrack() : null,
      terminalMotion: null,
      playerPush: null,
      activeHint: null,
    },
  });
  return { ...base, ...overrides };
}

function wideStationarySnapshot(boundary: number, x: number): HybridCcV1Snapshot {
  const base = snapshot(boundary);
  const player = testActor({ logicalPosition: { x, y: 0, z: 0 } });
  return snapshot(boundary, {
    header: {
      ...base.header,
      width: 4,
      cellCount: 4,
    },
    cells: Array.from(
      { length: 4 },
      (_, index) => testCell({ occupant: index === x ? player.id : null }),
    ),
    actors: [player],
    presentation: {
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: null,
      terminalMotion: null,
      playerPush: null,
      activeHint: null,
    },
  });
}

function wideMovingSnapshot(
  boundary: number,
  originX: number,
  destinationX: number,
  startBoundary: number,
  completionBoundary: number,
  owner: number,
  movementClass: number,
): HybridCcV1Snapshot {
  const base = snapshot(boundary);
  const movement = {
    origin: { x: originX, y: 0, z: 0 },
    destination: { x: destinationX, y: 0, z: 0 },
    direction: HYBRID_CC_V1_DIRECTION.east,
    slapDirection: HYBRID_CC_V1_DIRECTION.none,
    startBoundary: BigInt(startBoundary),
    completionBoundary: BigInt(completionBoundary),
    owner,
    movementClass,
    discontinuous: false,
  };
  const player = testActor({
    logicalPosition: { x: destinationX, y: 0, z: 0 },
    direction: HYBRID_CC_V1_DIRECTION.east,
    hasMovement: true,
    movement,
  });
  return snapshot(boundary, {
    header: {
      ...base.header,
      width: 4,
      cellCount: 4,
    },
    cells: Array.from(
      { length: 4 },
      (_, index) => testCell({ occupant: index === destinationX ? player.id : null }),
    ),
    actors: [player],
    presentation: {
      recordVersion: 2,
      samplesPerSecond: 20,
      playerMotion: testMotionTrack({
        ...movement,
        actorId: 1n,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        presentationSampleCount: (completionBoundary - startBoundary) * 2,
      }),
      terminalMotion: null,
      playerPush: null,
      activeHint: null,
    },
  });
}

function fakeEngine(sequence: readonly HybridCcV1Snapshot[]) {
  let index = 0;
  const inputs: number[] = [];
  let disposed = false;
  const engine: HybridCcV1Engine = {
    runtime: () => ({
      logicBoundary: sequence[index]!.header.logicBoundary,
      outcome: sequence[index]!.header.outcome,
      stateHash: sequence[index]!.header.stateHash,
      eventHash: sequence[index]!.header.eventHash,
      presentationHash: sequence[index]!.header.presentationHash,
    }),
    snapshot: () => sequence[index]!,
    logicStep: (input) => {
      inputs.push(input);
      index = Math.min(index + 1, sequence.length - 1);
      const current = sequence[index]!;
      return {
        operationStatus: 0,
        stepStatus: 0,
        stateChanged: true,
        runtime: {
          logicBoundary: current.header.logicBoundary,
          outcome: current.header.outcome,
          stateHash: current.header.stateHash,
          eventHash: current.header.eventHash,
          presentationHash: current.header.presentationHash,
        },
      };
    },
    invariantStatus: () => 0,
    dispose: () => { disposed = true; },
  };
  return { engine, inputs, wasDisposed: () => disposed };
}

function setup(engine: HybridCcV1Engine, level = convertedLevel()) {
  const registry = new HybridCcV1LevelRegistry();
  registry.register("PACK-Hybrid-v1", [level]);
  const adapter = new HybridCcV1GameEngineAdapter(registry, { create: () => engine });
  const request = {
    seriesFile: "PACK-Hybrid-v1",
    levelNumber: 1,
    ruleset: "Hybrid" as const,
    randomSeed: 7,
  };
  return { adapter, request };
}

describe("HybridCcV1GameEngineAdapter", () => {
  it("turns four 40 Hz host samples into one 10 Hz logic step and two 20 Hz presentation samples", async () => {
    const fake = fakeEngine([snapshot(0), snapshot(1)]);
    const { adapter, request } = setup(fake.engine);

    let session = await adapter.startSession(request);
    expect(session.frame.snapshot.tick).toBe(0);
    expect(session.frame.snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation).not.toBe(0);
    session = await adapter.advanceSession(session, 2);
    expect(fake.inputs).toEqual([2]);
    expect(session.frame.snapshot.tick).toBe(2);
    expect(session.frame.snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation).toBe(0);
    expect(session.frame.render?.chip).toMatchObject({ moving: 8, visual: { frame: 3 } });
    session = await adapter.advanceSession(session, 2);
    expect(session.frame.snapshot.tick).toBe(2);
    session = await adapter.advanceSession(session, 2);
    expect(session.frame.snapshot.tick).toBe(3);
    session = await adapter.advanceSession(session, 2);
    expect(session.frame.snapshot.tick).toBe(3);
    expect(fake.inputs).toEqual([2]);

    await adapter.disposeSession(session);
    expect(fake.wasDisposed()).toBe(true);
  });

  it("joins fast exit and ordinary player-input tracks without a stationary 20 Hz sample", async () => {
    const fastExit = wideMovingSnapshot(
      1, 0, 1, 1, 2,
      HYBRID_CC_V1_MOVEMENT_OWNER.forceFloor,
      HYBRID_CC_V1_MOVEMENT_CLASS.forced,
    );
    const ordinaryAtStart = wideMovingSnapshot(
      2, 1, 2, 2, 4,
      HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
      HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
    );
    const ordinaryInProgress = wideMovingSnapshot(
      3, 1, 2, 2, 4,
      HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
      HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
    );
    const followingOrdinary = wideMovingSnapshot(
      4, 2, 3, 4, 6,
      HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
      HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
    );
    const fake = fakeEngine([
      wideStationarySnapshot(0, 0),
      fastExit,
      ordinaryAtStart,
      ordinaryInProgress,
      followingOrdinary,
    ]);
    const { adapter, request } = setup(fake.engine, convertedLevel(4));
    let session = await adapter.startSession(request);
    const ticks: number[] = [];
    const moving: number[] = [];
    const fixedX: number[] = [];

    for (let hostSample = 0; hostSample < 14; hostSample += 1) {
      session = await adapter.advanceSession(session, 2);
      const chip = session.frame.render?.chip;
      if (!chip) throw new Error("Hybrid v1 continuity fixture lost Chip");
      ticks.push(session.frame.snapshot.tick);
      moving.push(chip.moving);
      fixedX.push((chip.pos % 32) * 8 - chip.moving);
    }

    expect(ticks).toEqual([2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
    expect(moving).toEqual([8, 8, 4, 4, 8, 8, 6, 6, 4, 4, 2, 2, 8, 8]);
    expect(fixedX).toEqual([0, 0, 4, 4, 8, 8, 10, 10, 12, 12, 14, 14, 16, 16]);

    const uniquePresentationX = fixedX.filter((_, index) => (
      index === 0 || ticks[index] !== ticks[index - 1]
    ));
    expect(uniquePresentationX).toEqual([0, 4, 8, 10, 12, 14, 16]);
    expect(uniquePresentationX.slice(1).every((x, index) => x > uniquePresentationX[index]!))
      .toBe(true);
  });

  it.each([1, 2, 3])(
    "carries a direction held from host phase %i into each following logic boundary",
    async (pressPhase) => {
      const fake = fakeEngine([snapshot(0), snapshot(1), snapshot(2), snapshot(3)]);
      const { adapter, request } = setup(fake.engine);
      const input = new HybridCcInputBuffer();
      let session = await adapter.startSession(request);

      for (let hostSample = 0; hostSample < 9; hostSample += 1) {
        if (hostSample === pressPhase) input.keyDown("east");
        session = await adapter.advanceSession(session, input.nextSampleInputCode());
      }

      expect(fake.inputs).toEqual([0, 2, 2]);
    },
  );

  it("keeps a held rejected-move pushing pose steady until release", async () => {
    const rejected = (boundary: number) => snapshot(boundary, {
      actors: [testActor({
        logicalPosition: { x: 0, y: 0, z: 0 },
        direction: HYBRID_CC_V1_DIRECTION.east,
      })],
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.moveRejected,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        logicBoundary: BigInt(boundary),
      })],
      presentation: {
        recordVersion: 2,
        samplesPerSecond: 20,
        playerMotion: null,
        terminalMotion: null,
        playerPush: testPlayerPush({
          startBoundary: BigInt(boundary),
          completionBoundary: BigInt(boundary),
        }),
        activeHint: null,
      },
    });
    const released = snapshot(3, {
      actors: [testActor({
        logicalPosition: { x: 0, y: 0, z: 0 },
        direction: HYBRID_CC_V1_DIRECTION.east,
      })],
      presentation: {
        ...snapshot(3).presentation,
        playerMotion: null,
        playerPush: null,
      },
    });
    const fake = fakeEngine([snapshot(0), rejected(1), rejected(2), released]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    for (let hostSample = 0; hostSample < 8; hostSample += 1) {
      session = await adapter.advanceSession(session, 2);
      expect(session.frame.render?.chip).toMatchObject({
        pushing: true,
        visual: { tileId: MS_TILE.Pushing_Chip },
      });
    }

    session = await adapter.advanceSession(session, 0);
    expect(session.frame.snapshot.tick).toBe(6);
    expect(session.frame.render?.chip).toMatchObject({
      pushing: false,
      visual: { tileId: MS_TILE.Chip },
    });
  });

  it("keeps a wall reveal overlay alive across later engine snapshots", async () => {
    const revealed = snapshot(1, {
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.interaction,
        interaction: HYBRID_CC_V1_INTERACTION.reveal,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        logicBoundary: 1n,
        destination: { x: 1, y: 0, z: 0 },
        subject: testElement({
          id: HYBRID_CC_V1_ELEMENT.trickWall,
          rule: HYBRID_CC_V1_RULE.permanentlyInvisible,
        }),
      })],
    });
    const fake = fakeEngine([snapshot(0), revealed, snapshot(2)]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 2);
    expect(session.frame.tileOverlays).toEqual([
      expect.objectContaining({ pos: 1, kind: "hidden-wall-reveal" }),
    ]);
    for (let call = 0; call < 4; call += 1) {
      session = await adapter.advanceSession(session, 0);
    }
    expect(session.frame.snapshot.tick).toBe(4);
    expect(session.frame.tileOverlays).toEqual([
      expect.objectContaining({ pos: 1, kind: "hidden-wall-reveal" }),
    ]);
  });

  it("publishes one-shot sounds for one host sample while preserving active motion loops", async () => {
    const step = snapshot(1, {
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorKind: HYBRID_CC_V1_ELEMENT.dirtBlock,
        lossCause: HYBRID_CC_V1_LOSS.bomb,
      })],
    });
    const fake = fakeEngine([snapshot(0), step]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 0);
    expect(session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BombExplodes)).not.toBe(0);
    session = await adapter.advanceSession(session, 0);
    expect(session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BombExplodes)).toBe(0);
  });

  it("keeps a non-player destruction effect across later logic snapshots", async () => {
    const destroyed = snapshot(1, {
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.actorDestroyed,
        actorId: 2n,
        actorKind: HYBRID_CC_V1_ELEMENT.blob,
        lossCause: HYBRID_CC_V1_LOSS.water,
        destination: { x: 0, y: 0, z: 0 },
      })],
    });
    const fake = fakeEngine([snapshot(0), destroyed, snapshot(2)]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 0);
    expect(session.frame.render?.animations).toEqual([
      expect.objectContaining({ pos: 0, frame: 11, tileId: 0x74 }),
    ]);
    for (let call = 0; call < 4; call += 1) {
      session = await adapter.advanceSession(session, 0);
    }
    expect(session.frame.snapshot.tick).toBe(4);
    expect(session.frame.render?.animations).toEqual([
      expect.objectContaining({ pos: 0, frame: 9, tileId: 0x74 }),
    ]);
    expect(fake.inputs).toEqual([0, 0]);
  });

  it("continues neutral post-death logic and monster presentation without recording more input", async () => {
    const terminalOutcome = {
      kind: HYBRID_CC_V1_OUTCOME.loss,
      logicBoundary: 1n,
      position: { x: 0, y: 0, z: 0 },
      exitColor: 0,
      lossCause: HYBRID_CC_V1_LOSS.fire,
    };
    const dead = snapshot(1, {
      header: { ...snapshot(1).header, outcome: terminalOutcome },
      actors: [testActor({
        id: 2n,
        kind: HYBRID_CC_V1_ELEMENT.blob,
        logicalPosition: { x: 0, y: 0, z: 0 },
      })],
      presentation: {
        recordVersion: 2,
        samplesPerSecond: 20,
        playerMotion: null,
        terminalMotion: testMotionTrack({ presentationSampleCount: 2, completionBoundary: 2n }),
        playerPush: null,
        activeHint: null,
      },
    });
    const monsterContinues = snapshot(2, {
      header: { ...snapshot(2).header, outcome: terminalOutcome },
      actors: [testActor({
        id: 2n,
        kind: HYBRID_CC_V1_ELEMENT.blob,
        logicalPosition: { x: 1, y: 0, z: 0 },
        hasMovement: true,
        movement: {
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          direction: 1,
          slapDirection: 4,
          startBoundary: 2n,
          completionBoundary: 4n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.actorAi,
          movementClass: 0,
          discontinuous: false,
        },
      })],
      presentation: {
        recordVersion: 2,
        samplesPerSecond: 20,
        playerMotion: null,
        terminalMotion: testMotionTrack({ presentationSampleCount: 2, completionBoundary: 2n }),
        playerPush: null,
        activeHint: null,
      },
    });
    const fake = fakeEngine([snapshot(0), dead, monsterContinues]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 2);
    expect(fake.inputs).toEqual([2]);
    expect(session.recordedMoveCount).toBe(1);
    for (let call = 0; call < 4; call += 1) {
      session = await adapter.advanceSession(session, 4);
    }

    expect(fake.inputs).toEqual([2, 0]);
    expect(session.recordedMoveCount).toBe(1);
    expect(session.frame.render?.actors).toEqual([
      expect.objectContaining({ id: MS_TILE.Blob, moving: 8 }),
    ]);
    expect(session.run.replayAvailable).toBe(false);
  });

  it("presents a dirt-block StartMove collision as block death while the block survives its move", async () => {
    const terminalOutcome = {
      kind: HYBRID_CC_V1_OUTCOME.loss,
      logicBoundary: 1n,
      position: { x: 1, y: 0, z: 0 },
      exitColor: 0,
      lossCause: HYBRID_CC_V1_LOSS.dirtBlock,
    };
    const postDeathSnapshots = Array.from({ length: 20 }, (_, index) => {
      const boundary = index + 1;
      const blockMoving = boundary < 2;
      return snapshot(boundary, {
        header: { ...snapshot(boundary).header, outcome: terminalOutcome },
        actors: [testActor({
          id: 2n,
          kind: HYBRID_CC_V1_ELEMENT.dirtBlock,
          logicalPosition: { x: blockMoving ? 0 : 1, y: 0, z: 0 },
          hasMovement: blockMoving,
          movement: {
            origin: { x: 0, y: 0, z: 0 },
            destination: { x: 1, y: 0, z: 0 },
            direction: 1,
            slapDirection: 4,
            startBoundary: 1n,
            completionBoundary: 2n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.forceFloor,
            movementClass: 0,
            discontinuous: false,
          },
        })],
        presentation: {
          recordVersion: 2,
          samplesPerSecond: 20,
          playerMotion: null,
          terminalMotion: null,
          playerPush: null,
          activeHint: null,
        },
      });
    });
    const fake = fakeEngine([snapshot(0), ...postDeathSnapshots]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 0);
    expect(session.frame.snapshot.view).toEqual({ x: 8, y: 0 });
    expect(session.frame.render?.chip).toMatchObject({
      pos: 1,
      failed: true,
      endGameAnimationTileId: 0x76,
      endGameAnimationFrame: 11,
    });
    expect(session.frame.render?.actors).toEqual([
      expect.objectContaining({ id: MS_TILE.Block, pos: 1, moving: 8 }),
    ]);

    for (let call = 0; call < 60 && session.frame.snapshot.status !== "failed"; call += 1) {
      session = await adapter.advanceSession(session, 0);
    }
    expect(session.frame.snapshot.status).toBe("failed");
    expect(session.run.result).toMatchObject({
      outcome: "failed",
      endPosition: { x: 2, y: 1, z: 1 },
      cause: {
        kind: "monster",
        actorName: "block",
        message: "Killed by block at (2, 1)",
        position: { x: 2, y: 1, z: 1 },
        tileId: MS_TILE.Block,
      },
    });
    expect(session.frame.render?.actors).toEqual([
      expect.objectContaining({ id: MS_TILE.Block, pos: 1 }),
    ]);
  });

  it("finishes terminal ghost motion and the Lynx death presentation before exposing failure", async () => {
    const terminalOutcome = {
      kind: HYBRID_CC_V1_OUTCOME.loss,
      logicBoundary: 1n,
      position: { x: 1, y: 0, z: 0 },
      exitColor: 0,
      lossCause: HYBRID_CC_V1_LOSS.bomb,
    };
    const postDeathSnapshots = Array.from({ length: 10 }, (_, index) => {
      const boundary = index + 1;
      return snapshot(boundary, {
        header: {
          ...snapshot(boundary).header,
          outcome: terminalOutcome,
        },
        actors: [],
        presentation: {
          recordVersion: 2,
          samplesPerSecond: 20,
          playerMotion: null,
          terminalMotion: testMotionTrack({ presentationSampleCount: 4 }),
          playerPush: null,
          activeHint: null,
        },
      });
    });
    const fake = fakeEngine([snapshot(0), ...postDeathSnapshots]);
    const { adapter, request } = setup(fake.engine);
    let session = await adapter.startSession(request);

    session = await adapter.advanceSession(session, 0);
    expect(session.frame.render?.chip).toMatchObject({ moving: 8, failed: false });
    const movingPhases = new Set<number>();
    const deathFrames = new Set<number>();
    let hostCallCount = 1;
    for (; hostCallCount < 80 && session.frame.snapshot.status === "playing"; hostCallCount += 1) {
      movingPhases.add(session.frame.render?.chip?.moving ?? 0);
      const deathFrame = session.frame.render?.chip?.endGameAnimationFrame;
      if (deathFrame !== null && deathFrame !== undefined) deathFrames.add(deathFrame);
      session = await adapter.advanceSession(session, 0);
      expect(session.frame.snapshot.view.x).toBe(8);
    }
    expect([...movingPhases]).toEqual(expect.arrayContaining([8, 6, 4, 2, 0]));
    expect([...deathFrames].sort((left, right) => right - left)).toEqual([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(hostCallCount).toBe(35);
    expect(session.frame.snapshot.tick).toBe(2);
    expect(session.frame.snapshot.currentTime).toBe(2);
    expect(session.frame.snapshot.status).toBe("failed");
    expect(session.run.result?.outcome).toBe("failed");
    expect(session.run.continuesAfterResult).toBe(true);
    expect(fake.inputs.length).toBeGreaterThan(1);
    expect(fake.inputs.every((input) => input === 0)).toBe(true);
    expect(session.run.replayAvailable).toBe(false);
    expect(await adapter.exportOpaqueReplay(session)).toBeNull();

    const inputCountAtModal = fake.inputs.length;
    session = await adapter.advanceSession(session, 4);
    session = await adapter.advanceSession(session, 4);
    expect(fake.inputs).toHaveLength(inputCountAtModal + 1);
    expect(fake.inputs.at(-1)).toBe(0);
    expect(session.frame.snapshot.status).toBe("failed");
    expect(session.frame.snapshot.secondsPlayed).toBe(0);
    expect(session.frame.snapshot.replayCursor).toBe(1);
  });

  it("fails loudly on event-journal overflow instead of presenting incomplete effects", async () => {
    const overflowed = snapshot(1, {
      header: {
        ...snapshot(1).header,
        eventsOverflowed: true,
        droppedEventCount: 1,
      },
    });
    const fake = fakeEngine([snapshot(0), overflowed]);
    const { adapter, request } = setup(fake.engine);
    const session = await adapter.startSession(request);

    await expect(adapter.advanceSession(session, 0)).rejects.toThrow(/event journal overflow/iu);
  });

  it("verifies and plays native HCR1 changes, then exports the terminal dense run", async () => {
    const unfinished = snapshot(1);
    const terminalOutcome = {
      kind: HYBRID_CC_V1_OUTCOME.win,
      logicBoundary: 2n,
      position: { x: 1, y: 0, z: 0 },
      exitColor: 0,
      lossCause: HYBRID_CC_V1_LOSS.none,
    };
    const terminal = snapshot(2, {
      header: { ...snapshot(2).header, outcome: terminalOutcome },
      presentation: {
        recordVersion: 2,
        samplesPerSecond: 20,
        playerMotion: null,
        terminalMotion: null,
        playerPush: null,
        activeHint: null,
      },
    });
    const fake = fakeEngine([snapshot(0), unfinished, terminal]);
    const replay: HybridCcV1Replay = {
      header: {
        ruleset: { major: 1, minor: 0, tweak: 7 },
        levelContentHash: new Uint8Array(32),
        randomSeed: 99,
        finalBoundary: 2n,
        expectedOutcome: terminalOutcome,
        checkpointMode: 1,
        changeCount: 2,
        checkpointCount: 2,
        encodedByteCount: 3,
      },
      changes: [
        { logicBoundary: 1n, input: 2 },
        { logicBoundary: 2n, input: 3 },
      ],
      checkpoints: [],
      encoded: new Uint8Array([7, 8, 9]),
    };
    let createdSeed: number | null = null;
    let compiledInputs: number[] | null = null;
    const registry = new HybridCcV1LevelRegistry();
    registry.register("PACK-Hybrid-v1", [convertedLevel()]);
    const adapter = new HybridCcV1GameEngineAdapter(registry, {
      create: (_level, seed) => {
        createdSeed = seed;
        return fake.engine;
      },
      decodeReplay: () => replay,
      verifyReplay: () => ({
        verifyStatus: 0,
        actualOutcome: terminalOutcome,
        hasDivergence: false,
        divergence: null,
      }),
      compileRun: (_level, seed, inputs, checkpointMode) => {
        expect(seed).toBe(99);
        expect(checkpointMode).toBe(1);
        compiledInputs = [...inputs];
        return replay;
      },
    });
    const request = {
      seriesFile: "PACK-Hybrid-v1",
      levelNumber: 1,
      ruleset: "Hybrid" as const,
      randomSeed: 7,
    };
    let session = await adapter.startOpaqueReplaySession(request, {
      format: "hcr1",
      bytes: replay.encoded,
    });
    expect(createdSeed).toBe(99);

    session = await adapter.advanceSession(session, 12);
    session = await adapter.advanceSession(session, 12);
    session = await adapter.advanceSession(session, 12);
    session = await adapter.advanceSession(session, 12);
    session = await adapter.advanceSession(session, 12);
    expect(fake.inputs).toEqual([2, 3]);
    for (let call = 0; call < 80 && session.frame.snapshot.status === "playing"; call += 1) {
      session = await adapter.advanceSession(session, 0);
    }
    expect(session.frame.snapshot.status).toBe("completed");
    expect(session.frame.snapshot.tick).toBe(4);
    expect(session.frame.snapshot.currentTime).toBe(4);
    expect(session.run.result?.score).toMatchObject({ timeBonus: 1000, finalScore: 1500 });

    const exported = await adapter.exportOpaqueReplay(session);
    expect(compiledInputs).toEqual([2, 3]);
    expect(exported).toMatchObject({
      format: "hcr1",
      mimeType: "application/vnd.hybridcc.hcr1",
      bytes: replay.encoded,
    });
  });
});
