import { describe, expect, it } from "vitest";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  composeDihedralOrientation,
  cellArtworkNormalizationProgress,
  displayedDirectionToEngineDirection,
  inverseDihedralOrientation,
  seededTransformAt,
  transformDirection,
  transformGameplayRate,
  transformTransitionPhaseAt,
} from "@player-web/impl/specialModesTransform";

describe("specialModesTransform", () => {
  it("composes relative transforms across the D4 group", () => {
    expect(composeDihedralOrientation("identity", "rotate-90")).toBe("rotate-90");
    expect(composeDihedralOrientation("rotate-90", "rotate-90")).toBe("rotate-180");
    expect(composeDihedralOrientation("rotate-270", "rotate-90")).toBe("identity");
    expect(composeDihedralOrientation("flip-horizontal", "flip-horizontal")).toBe("identity");
  });

  it("maps displayed movement back through the current orientation", () => {
    expect(transformDirection(MS_DIRECTION.north, "rotate-90")).toBe(MS_DIRECTION.east);
    expect(displayedDirectionToEngineDirection(MS_DIRECTION.west, "rotate-90")).toBe(MS_DIRECTION.south);
    expect(inverseDihedralOrientation("rotate-90")).toBe("rotate-270");
  });

  it("chooses deterministic allowed random transforms", () => {
    const allowed = ["rotate-90", "flip-vertical"] as const;
    expect(seededTransformAt(42, 3, allowed)).toBe(seededTransformAt(42, 3, allowed));
    expect(allowed).toContain(seededTransformAt(42, 20, allowed));
  });

  it("slows, stays stopped for both transform phases, then speeds back up", () => {
    expect(transformGameplayRate(0)).toBe(1);
    expect(transformGameplayRate(0.125)).toBe(0.5);
    expect(transformGameplayRate(0.25)).toBe(0);
    expect(transformGameplayRate(0.5)).toBe(0);
    expect(transformGameplayRate(0.75)).toBe(0);
    expect(transformGameplayRate(0.875)).toBe(0.5);
    expect(transformGameplayRate(1)).toBe(1);
  });

  it("publishes the four transition phases at quarter boundaries", () => {
    expect(transformTransitionPhaseAt(0.2).phase).toBe("slow-down");
    expect(transformTransitionPhaseAt(0.25)).toEqual({ phase: "viewport-transform", phaseProgress: 0 });
    expect(transformTransitionPhaseAt(0.5)).toEqual({ phase: "artwork-normalize", phaseProgress: 0 });
    expect(transformTransitionPhaseAt(0.75)).toEqual({ phase: "speed-up", phaseProgress: 0 });
  });

  it("ripples artwork normalization outward from the player", () => {
    expect(cellArtworkNormalizationProgress(0.25, 0, 10)).toBe(0.25);
    expect(cellArtworkNormalizationProgress(0.25, 10, 10)).toBe(0);
    expect(cellArtworkNormalizationProgress(1, 10, 10)).toBe(1);
  });
});
