import { describe, expect, it } from "vitest";
import { resolveLegacyMapViewport } from "@player-web/impl/legacyCanvasMapRenderer";
import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_LOSS,
  HYBRID_CC_V1_OUTCOME,
} from "./engineFacts";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
} from "./HybridCcV1GameEngineAdapter";
import { testActor, testCell, testMotionTrack, testSnapshot } from "./testFacts";
import type {
  HybridCcV1ConvertedLevel,
  HybridCcV1Engine,
  HybridCcV1MotionTrack,
  HybridCcV1Snapshot,
} from "./wasmBridge";

const BOARD_SIZE = 32;
const ORIGIN = { x: 16, y: 16, z: 0 } as const;
const DESTINATION = { x: 17, y: 16, z: 0 } as const;

function convertedLevel(): HybridCcV1ConvertedLevel {
  return {
    status: 0,
    entryOrdinal: 0,
    requiredChips: 0,
    diagnosticCount: 0,
    nativeLevel: {
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      depth: 1,
      number: 1,
      timeLimitSeconds: 100,
      title: "Death camera",
      author: "Test",
      hint: "",
      password: "ABCD",
      titleBytes: new Uint8Array(),
      authorBytes: new Uint8Array(),
      hintBytes: new Uint8Array(),
      passwordBytes: new Uint8Array(),
      texts: [],
      textBytes: [],
      encoded: new Uint8Array([1]),
    },
  };
}

function boardSnapshot(options: {
  boundary: number;
  playerAlive: boolean;
  terminalMotion?: HybridCcV1MotionTrack | null;
}): HybridCcV1Snapshot {
  const base = testSnapshot();
  const outcome = options.playerAlive
    ? base.header.outcome
    : {
        kind: HYBRID_CC_V1_OUTCOME.loss,
        logicBoundary: BigInt(options.boundary),
        position: DESTINATION,
        exitColor: 0,
        lossCause: HYBRID_CC_V1_LOSS.bomb,
      };
  const actors = options.playerAlive
    ? [testActor({ committedPosition: ORIGIN, direction: HYBRID_CC_V1_DIRECTION.east })]
    : [];

  return {
    ...base,
    header: {
      ...base.header,
      width: BOARD_SIZE,
      height: BOARD_SIZE,
      cellCount: BOARD_SIZE * BOARD_SIZE,
      actorCount: actors.length,
      logicBoundary: BigInt(options.boundary),
      outcome,
      stateHash: BigInt(options.boundary + 1),
    },
    cells: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => testCell()),
    actors,
    presentation: {
      recordVersion: 1,
      samplesPerSecond: 20,
      playerMotion: null,
      terminalMotion: options.terminalMotion ?? null,
      activeHint: null,
    },
  };
}

function fakeEngine(sequence: readonly HybridCcV1Snapshot[]): HybridCcV1Engine {
  let index = 0;
  return {
    runtime: () => ({
      logicBoundary: sequence[index]!.header.logicBoundary,
      outcome: sequence[index]!.header.outcome,
      stateHash: sequence[index]!.header.stateHash,
      eventHash: sequence[index]!.header.eventHash,
      presentationHash: sequence[index]!.header.presentationHash,
    }),
    snapshot: () => sequence[index]!,
    logicStep: () => {
      index = Math.min(index + 1, sequence.length - 1);
      const snapshot = sequence[index]!;
      return {
        operationStatus: 0,
        stepStatus: 0,
        stateChanged: true,
        runtime: {
          logicBoundary: snapshot.header.logicBoundary,
          outcome: snapshot.header.outcome,
          stateHash: snapshot.header.stateHash,
          eventHash: snapshot.header.eventHash,
          presentationHash: snapshot.header.presentationHash,
        },
      };
    },
    invariantStatus: () => 0,
    dispose: () => {},
  };
}

interface CapturedPresentation {
  deathFrame: number | null | undefined;
  failedSprite: boolean | undefined;
  hostCall: number;
  modalVisible: boolean;
  moving: number | undefined;
  status: string;
  viewX: number;
  viewY: number;
}

describe("Hybrid v1 death-camera host acceptance", () => {
  it.each([
    {
      duration: "ordinary",
      presentationSampleCount: 4,
      completionBoundary: 3n,
      motionViewXs: [48, 49, 50, 51],
      terminalHostCall: 35,
    },
    {
      duration: "fast",
      presentationSampleCount: 2,
      completionBoundary: 2n,
      motionViewXs: [48, 50],
      terminalHostCall: 31,
    },
  ] as const)(
    "keeps the viewport on Chip through $duration ghost movement, destruction, and the result-modal transition",
    async ({
      presentationSampleCount,
      completionBoundary,
      motionViewXs,
      terminalHostCall,
    }) => {
      const motion = testMotionTrack({
        origin: ORIGIN,
        destination: DESTINATION,
        direction: HYBRID_CC_V1_DIRECTION.east,
        startBoundary: 1n,
        completionBoundary,
        presentationSampleCount,
      });
      const engine = fakeEngine([
        boardSnapshot({ boundary: 0, playerAlive: true }),
        boardSnapshot({ boundary: 1, playerAlive: false, terminalMotion: motion }),
      ]);
      const levels = new HybridCcV1LevelRegistry();
      levels.register("death-camera-Hybrid-v1", [convertedLevel()]);
      const adapter = new HybridCcV1GameEngineAdapter(levels, { create: () => engine });
      const request = {
        seriesFile: "death-camera-Hybrid-v1",
        levelNumber: 1,
        ruleset: "Hybrid" as const,
      };

      let session = await adapter.startSession(request);
      const captures: CapturedPresentation[] = [];
      let lastVisualSignature = "";
      for (let call = 1; call <= 100; call += 1) {
        session = await adapter.advanceSession(session, 0);
        const viewport = resolveLegacyMapViewport(session, "Hybrid");
        expect(viewport.viewX).toBeGreaterThan(0);
        expect(viewport.viewY).toBeGreaterThan(0);
        const visualSignature = [
          viewport.viewX,
          viewport.viewY,
          session.frame.render?.chip?.moving,
          session.frame.render?.chip?.failed,
          session.frame.render?.chip?.endGameAnimationFrame,
          session.frame.snapshot.status,
        ].join(":");
        if (visualSignature !== lastVisualSignature) {
          captures.push({
            deathFrame: session.frame.render?.chip?.endGameAnimationFrame,
            failedSprite: session.frame.render?.chip?.failed,
            hostCall: call,
            modalVisible: session.run.result !== null,
            moving: session.frame.render?.chip?.moving,
            ...viewport,
            status: session.frame.snapshot.status,
          });
          lastVisualSignature = visualSignature;
        }
        if (session.run.result !== null) break;
      }

      expect(captures.at(-1)).toMatchObject({
        hostCall: terminalHostCall,
        modalVisible: true,
        status: "failed",
        viewX: 52,
        viewY: 48,
      });
      expect(captures.every(({ viewX, viewY }) => viewX > 0 && viewY > 0)).toBe(true);
      expect(captures.map(({ viewX }) => viewX)).toEqual(
        expect.arrayContaining([...motionViewXs, 52]),
      );

      const motionCaptures = captures.slice(0, motionViewXs.length);
      expect(motionCaptures.map(({ viewX }) => viewX)).toEqual(motionViewXs);
      expect(motionCaptures.every(({ failedSprite, modalVisible, status }) => (
        failedSprite === false && !modalVisible && status === "playing"
      ))).toBe(true);

      const destructionCaptures = captures.slice(motionViewXs.length, motionViewXs.length + 12);
      expect(destructionCaptures.map(({ deathFrame }) => deathFrame)).toEqual([
        11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0,
      ]);
      expect(destructionCaptures.every(({ failedSprite, modalVisible, status, viewX, viewY }) => (
        failedSprite === true && !modalVisible && status === "playing" && viewX === 52 && viewY === 48
      ))).toBe(true);

      expect(session.frame.snapshot.tick).toBe(2);
      expect(session.frame.snapshot.currentTime).toBe(2);
      expect(session.run.result).toMatchObject({ outcome: "failed", cause: { kind: "bomb" } });
    },
  );
});
