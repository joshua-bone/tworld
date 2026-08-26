import { describe, expect, it } from "vitest";
import { HYBRID_CC_V1_DIRECTION } from "./engineFacts";
import {
  hybridCcV1PresentedMotion,
  hybridCcV1TerminalCameraTrack,
} from "./presentationProjection";
import { testMotionTrack } from "./testFacts";

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

  it("presents a discontinuous teleport only as entry into its destination", () => {
    const track = testMotionTrack({
      origin: { x: 1, y: 1, z: 0 },
      destination: { x: 20, y: 20, z: 0 },
      direction: HYBRID_CC_V1_DIRECTION.east,
      discontinuous: true,
      presentationSampleCount: 2,
      completionBoundary: 2n,
    });
    expect(hybridCcV1PresentedMotion(track, 2).visualOrigin).toEqual({ x: 19, y: 20, z: 0 });
  });

  it("keeps terminal ghost motion available for the camera at its published speed", () => {
    const ordinary = testMotionTrack();
    expect(hybridCcV1TerminalCameraTrack(ordinary, 4)).toMatchObject({ active: true, moving: 4 });
    const fast = testMotionTrack({ completionBoundary: 2n, presentationSampleCount: 2 });
    expect(hybridCcV1TerminalCameraTrack(fast, 3)).toMatchObject({ active: true, moving: 4 });
  });
});
