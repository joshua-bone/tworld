import { describe, expect, it } from "vitest";
import {
  HYBRID_CC_V1_DIRECTION,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_MOVEMENT_CLASS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import {
  hybridCcV1ChipPushing,
  hybridCcV1PresentedMotion,
  hybridCcV1TerminalCameraTrack,
} from "./presentationProjection";
import { testElement, testEvent, testMotionTrack, testSnapshot } from "./testFacts";

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

  it("joins a fast terrain exit directly to an ordinary player-input move", () => {
    const fastExit = testMotionTrack({
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
      [fastExit, 2],
      [fastExit, 3],
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

  it("shows a rejected player attempt for exactly its first 20 Hz presentation sample", () => {
    const snapshot = testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.moveRejected,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        logicBoundary: 3n,
      })],
    });

    expect(hybridCcV1ChipPushing(snapshot, 6)).toBe(true);
    expect(hybridCcV1ChipPushing(snapshot, 7)).toBe(false);
  });

  it("shows the same one-sample pose for an accepted active player block push", () => {
    const snapshot = testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.interaction,
        interaction: HYBRID_CC_V1_INTERACTION.push,
        actorKind: HYBRID_CC_V1_ELEMENT.player,
        logicBoundary: 3n,
        subject: testElement({ id: HYBRID_CC_V1_ELEMENT.dirtBlock }),
      })],
    });

    expect(hybridCcV1ChipPushing(snapshot, 6)).toBe(true);
    expect(hybridCcV1ChipPushing(snapshot, 7)).toBe(false);
  });

  it("does not turn a non-player rejection into Chip's pushing pose", () => {
    const snapshot = testSnapshot({
      events: [testEvent({
        kind: HYBRID_CC_V1_EVENT.moveRejected,
        actorKind: HYBRID_CC_V1_ELEMENT.dirtBlock,
        logicBoundary: 3n,
      })],
    });

    expect(hybridCcV1ChipPushing(snapshot, 6)).toBe(false);
  });
});
