import { describe, expect, it } from "vitest";
import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_MOVEMENT_CLASS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import {
  hybridCcV1ActorMotionTrack,
  hybridCcV1ChipPushing,
  hybridCcV1PresentedMotion,
  hybridCcV1TerminalCameraTrack,
} from "./presentationProjection";
import {
  testActor,
  testMotionTrack,
  testPlayerPush,
  testSnapshot,
} from "./testFacts";

describe("Hybrid v1 motion presentation", () => {
  it("publishes the four descending Lynx phases for an ordinary move", () => {
    const track = testMotionTrack();
    expect([2, 3, 4, 5].map((sample) => hybridCcV1PresentedMotion(track, sample)))
      .toEqual([
        { active: true, frame: 3, moving: 8, position: track.destination },
        { active: true, frame: 2, moving: 6, position: track.destination },
        { active: true, frame: 1, moving: 4, position: track.destination },
        { active: true, frame: 0, moving: 2, position: track.destination },
      ]);
    expect(hybridCcV1PresentedMotion(track, 6).active).toBe(false);
  });

  it("uses two samples for fast motion and never animates without a track", () => {
    const track = testMotionTrack({ completionBoundary: 2n, presentationSampleCount: 2 });
    expect(hybridCcV1PresentedMotion(track, 2)).toMatchObject({ active: true, moving: 8 });
    expect(hybridCcV1PresentedMotion(track, 3)).toMatchObject({ active: true, moving: 4 });
    expect(hybridCcV1PresentedMotion(null, 3)).toEqual({ active: false, frame: 0, moving: 0, position: null });
  });

  it.each([
    ["forced", HYBRID_CC_V1_MOVEMENT_CLASS.forced],
    ["sliding", HYBRID_CC_V1_MOVEMENT_CLASS.sliding],
    ["boosted", HYBRID_CC_V1_MOVEMENT_CLASS.boosted],
  ])(
    "uses the engine's published interval for %s motion instead of inferring speed from its class",
    (_name, movementClass) => {
      const fast = testMotionTrack({
        completionBoundary: 2n,
        presentationSampleCount: 2,
        movementClass,
      });
      const ordinary = testMotionTrack({
        completionBoundary: 3n,
        presentationSampleCount: 4,
        movementClass,
      });

      expect([2, 3].map((sample) => hybridCcV1PresentedMotion(fast, sample).moving))
        .toEqual([8, 4]);
      expect([2, 3, 4, 5].map((sample) => (
        hybridCcV1PresentedMotion(ordinary, sample).moving
      ))).toEqual([8, 6, 4, 2]);
    },
  );

  it.each([
    ["forced", HYBRID_CC_V1_MOVEMENT_CLASS.forced],
    ["sliding", HYBRID_CC_V1_MOVEMENT_CLASS.sliding],
    ["boosted", HYBRID_CC_V1_MOVEMENT_CLASS.boosted],
  ])(
    "derives %s actor sample count from start/completion boundaries, not movement class",
    (_name, movementClass) => {
      const actor = testActor({
        hasMovement: true,
        movement: {
          ...testActor().movement,
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          startBoundary: 7n,
          completionBoundary: 9n,
          movementClass,
        },
      });

      expect(hybridCcV1ActorMotionTrack(actor)).toMatchObject({
        startBoundary: 7n,
        completionBoundary: 9n,
        presentationSampleCount: 4,
        movementClass,
      });
      actor.movement.completionBoundary = 8n;
      expect(hybridCcV1ActorMotionTrack(actor)).toMatchObject({
        startBoundary: 7n,
        completionBoundary: 8n,
        presentationSampleCount: 2,
        movementClass,
      });
    },
  );

  it("rejects a track whose published sample count contradicts its engine boundaries", () => {
    const contradictory = testMotionTrack({
      completionBoundary: 3n,
      presentationSampleCount: 2,
      movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.boosted,
    });

    expect(() => hybridCcV1PresentedMotion(contradictory, 2)).toThrow(
      "published 2 samples for 2 movement boundaries; expected 4",
    );
  });

  it("joins a fast internal force transition directly to an ordinary landing", () => {
    const fastInternalTransition = testMotionTrack({
      origin: { x: 0, y: 0, z: 0 },
      destination: { x: 1, y: 0, z: 0 },
      startBoundary: 1n,
      completionBoundary: 2n,
      presentationSampleCount: 2,
      owner: HYBRID_CC_V1_MOVEMENT_OWNER.forceFloor,
      movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.forced,
    });
    const ordinary = testMotionTrack({
      origin: { x: 1, y: 0, z: 0 },
      destination: { x: 2, y: 0, z: 0 },
      startBoundary: 2n,
      completionBoundary: 4n,
      presentationSampleCount: 4,
      owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
      movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
    });
    const samples = [
      [fastInternalTransition, 2],
      [fastInternalTransition, 3],
      [ordinary, 4],
      [ordinary, 5],
      [ordinary, 6],
      [ordinary, 7],
    ] as const;
    const presented = samples.map(([track, sample]) => hybridCcV1PresentedMotion(track, sample));

    expect(presented.map(({ moving }) => moving)).toEqual([8, 4, 8, 6, 4, 2]);
    expect(presented.map(({ moving, position }) => (position?.x ?? 0) * 8 - moving))
      .toEqual([0, 4, 8, 10, 12, 14]);
  });

  it("presents a discontinuous teleport only as entry into its destination", () => {
    const track = testMotionTrack({
      origin: { x: 1, y: 1, z: 0 },
      destination: { x: 20, y: 20, z: 0 },
      direction: HYBRID_CC_V1_DIRECTION.east,
      discontinuous: true,
      presentationSampleCount: 4,
      completionBoundary: 3n,
    });
    expect([2, 3, 4, 5].map((sample) => hybridCcV1PresentedMotion(track, sample)))
      .toEqual([
        { active: true, frame: 3, moving: 8, position: track.destination, visualOrigin: { x: 19, y: 20, z: 0 } },
        { active: true, frame: 2, moving: 6, position: track.destination, visualOrigin: { x: 19, y: 20, z: 0 } },
        { active: true, frame: 1, moving: 4, position: track.destination, visualOrigin: { x: 19, y: 20, z: 0 } },
        { active: true, frame: 0, moving: 2, position: track.destination, visualOrigin: { x: 19, y: 20, z: 0 } },
      ]);
    expect(hybridCcV1PresentedMotion(track, 6).active).toBe(false);
  });

  it("keeps terminal ghost motion available for the camera at its published speed", () => {
    const ordinary = testMotionTrack();
    expect(hybridCcV1TerminalCameraTrack(ordinary, 4)).toMatchObject({ active: true, moving: 4 });
    const fast = testMotionTrack({ completionBoundary: 2n, presentationSampleCount: 2 });
    expect(hybridCcV1TerminalCameraTrack(fast, 3)).toMatchObject({ active: true, moving: 4 });
  });

  it("keeps a rejected player attempt visible while its durable push state exists", () => {
    const snapshot = testSnapshot({
      presentation: {
        ...testSnapshot().presentation,
        playerPush: testPlayerPush({ startBoundary: 3n, completionBoundary: 3n }),
      },
    });

    expect(hybridCcV1ChipPushing(snapshot)).toBe(true);
    expect(hybridCcV1ChipPushing(snapshot)).toBe(true);
  });

  it("keeps an accepted block push visible through its complete movement interval", () => {
    const snapshot = testSnapshot({
      presentation: {
        ...testSnapshot().presentation,
        playerPush: testPlayerPush({
          blockActorId: 2n,
          moving: true,
          startBoundary: 3n,
          completionBoundary: 5n,
        }),
      },
    });

    expect(hybridCcV1ChipPushing(snapshot)).toBe(true);
  });

  it("does not infer a player push from unrelated event history", () => {
    expect(hybridCcV1ChipPushing(testSnapshot())).toBe(false);
  });
});
