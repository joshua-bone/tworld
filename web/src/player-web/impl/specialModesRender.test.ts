import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  FLASHLIGHT_DIRECTION_TRANSITION_MS,
  LYNX_MONSTER_RIPPLE_EMISSION_INTERVAL_MS,
  MONSTER_RIPPLE_MAX_RADIUS_TILES,
  MONSTER_RIPPLE_PERIOD_MS,
  MS_MONSTER_RIPPLE_EMISSION_INTERVAL_MS,
  advanceMonsterRippleEmissions,
  flashlightDirectionTransitionAngle,
  inverseTransformCanvasPoint,
  monsterRippleArtworkOpacity,
  monsterRippleExpansionOpacity,
  monsterRippleEmissionIntervalMs,
  monsterRippleIntensity,
  monsterRippleMaximumRadiusTiles,
  monsterRipplePropagationPeriodMs,
  monsterRipplesCanRenderOutsideDirectVisibility,
  remapDihedralArtworkTileId,
  sessionWithoutMonsterArtwork,
  usesPerCellArtworkNormalization,
  visibleThinWallOverlayTileId,
  visibilityModeUsesFogBackdrop,
} from "@player-web/impl/specialModesRender";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { createDefaultBrowserSpecialModesSettings } from "@player-web/impl/specialModesSettings";
import type { SpecialModesRuntimeSnapshot } from "@player-web/impl/useSpecialModesRuntime";

describe("specialModesRender", () => {
  it("inverse-maps clicks through a displayed orientation", () => {
    expect(inverseTransformCanvasPoint(90, 50, 100, "rotate-90")).toEqual({ x: 50, y: 10 });
    expect(inverseTransformCanvasPoint(20, 70, 100, "flip-horizontal")).toEqual({ x: 80, y: 70 });
  });

  it("removes monster artwork while retaining Chip and the floor", () => {
    const cell = {
      position: { x: 1, y: 1, pos: 33 },
      top: { id: MS_TILE.Bug, state: 0 },
      bottom: { id: MS_TILE.Ice, state: 0 },
    };
    const session = {
      frame: {
        cells: [cell],
        visibleLayers: [{ z: 1, cells: [cell] }],
        render: {
          chip: null,
          actors: [
            { id: MS_TILE.Bug },
            { id: MS_TILE.Block },
          ],
          animations: [],
        },
      },
    } as unknown as InteractiveGameSession;
    const hidden = sessionWithoutMonsterArtwork(session);
    expect(hidden.frame.visibleLayers[0]!.cells[0]!.top.id).toBe(MS_TILE.Ice);
    expect(hidden.frame.render!.actors.map((actor) => actor.id)).toEqual([MS_TILE.Block]);
  });

  it("remaps directional artwork to its displayed semantics", () => {
    expect(remapDihedralArtworkTileId(MS_TILE.Slide_North, "rotate-90")).toBe(MS_TILE.Slide_East);
    expect(remapDihedralArtworkTileId(MS_TILE.IceWall_Northwest, "flip-horizontal")).toBe(
      MS_TILE.IceWall_Northeast,
    );
    expect(remapDihedralArtworkTileId(MS_TILE.Wall_West, "rotate-180")).toBe(MS_TILE.Wall_East);
  });

  it("keeps non-fog line of sight pitch black outside visible cells", () => {
    expect(visibilityModeUsesFogBackdrop("line-of-sight")).toBe(false);
    expect(visibilityModeUsesFogBackdrop("line-of-sight-fog")).toBe(true);
  });

  it("eases flashlight turns over one fifth of a second", () => {
    expect(flashlightDirectionTransitionAngle(MS_DIRECTION.east, MS_DIRECTION.south, 0)).toBe(0);
    expect(flashlightDirectionTransitionAngle(
      MS_DIRECTION.east,
      MS_DIRECTION.south,
      FLASHLIGHT_DIRECTION_TRANSITION_MS / 2,
    )).toBeCloseTo(Math.PI / 4);
    expect(flashlightDirectionTransitionAngle(
      MS_DIRECTION.east,
      MS_DIRECTION.south,
      FLASHLIGHT_DIRECTION_TRANSITION_MS,
    )).toBeCloseTo(Math.PI / 2);
  });

  it("takes the shortest path when a flashlight turn crosses the angle boundary", () => {
    expect(flashlightDirectionTransitionAngle(
      MS_DIRECTION.north,
      MS_DIRECTION.west,
      FLASHLIGHT_DIRECTION_TRANSITION_MS / 2,
    )).toBeCloseTo(-3 * Math.PI / 4);
  });

  it("fades monster artwork linearly to zero at the reveal radius", () => {
    expect(monsterRippleArtworkOpacity(0, 3)).toBe(1);
    expect(monsterRippleArtworkOpacity(1.5, 3)).toBe(0.5);
    expect(monsterRippleArtworkOpacity(3, 3)).toBe(0);
    expect(monsterRippleArtworkOpacity(9, 3)).toBe(0);
  });

  it("makes moving monster ripples twice as intense", () => {
    expect(monsterRippleIntensity(0)).toBe(1);
    expect(monsterRippleIntensity(1)).toBe(2);
    expect(monsterRippleIntensity(8)).toBe(2);
  });

  it("supports adjustable ripple propagation distance and speed", () => {
    expect(MONSTER_RIPPLE_PERIOD_MS).toBe(4_000);
    expect(MONSTER_RIPPLE_MAX_RADIUS_TILES).toBe(5);
    expect(monsterRippleMaximumRadiusTiles(3)).toBe(1.5);
    expect(monsterRippleMaximumRadiusTiles(9)).toBe(4.5);
    expect(monsterRippleMaximumRadiusTiles(32)).toBe(5);
    expect(monsterRippleMaximumRadiusTiles(32, 16)).toBe(16);
    expect(monsterRippleMaximumRadiusTiles(9, 16)).toBe(4.5);
    expect(monsterRipplePropagationPeriodMs("slow")).toBe(8_000);
    expect(monsterRipplePropagationPeriodMs("normal")).toBe(4_000);
    expect(monsterRipplePropagationPeriodMs("fast")).toBe(2_000);
  });

  it("emits Lynx ripples every twentieth of a second and MS ripples every tenth", () => {
    expect(LYNX_MONSTER_RIPPLE_EMISSION_INTERVAL_MS).toBe(50);
    expect(MS_MONSTER_RIPPLE_EMISSION_INTERVAL_MS).toBe(100);
    expect(monsterRippleEmissionIntervalMs("Lynx")).toBe(50);
    expect(monsterRippleEmissionIntervalMs("MS")).toBe(100);
    const origin = [{ intensity: 1, x: 24, y: 48, z: 1 }];
    expect(advanceMonsterRippleEmissions(null, origin, 1_000, 50).emissions).toHaveLength(80);
    expect(advanceMonsterRippleEmissions(null, origin, 1_000, 100).emissions).toHaveLength(40);
    expect(advanceMonsterRippleEmissions(null, origin, 1_000, 50, 8_000).emissions).toHaveLength(160);
    expect(advanceMonsterRippleEmissions(null, origin, 1_000, 50, 2_000).emissions).toHaveLength(40);
  });

  it("rebuilds the live ripple history when propagation speed changes", () => {
    const origin = [{ intensity: 1, x: 24, y: 48, z: 1 }];
    const normal = advanceMonsterRippleEmissions(null, origin, 1_000, 50, 4_000);
    const slow = advanceMonsterRippleEmissions(normal, origin, 1_050, 50, 8_000);

    expect(slow.propagationPeriodMs).toBe(8_000);
    expect(slow.emissions).toHaveLength(160);
    expect(slow.emissions[0]!.emittedAtMs).toBe(1_050);
  });

  it("fades monster ripples strongly as they expand", () => {
    expect(monsterRippleExpansionOpacity(0)).toBe(1);
    expect(monsterRippleExpansionOpacity(0.25)).toBe(0.5625);
    expect(monsterRippleExpansionOpacity(0.5)).toBe(0.25);
    expect(monsterRippleExpansionOpacity(0.75)).toBe(0.0625);
    expect(monsterRippleExpansionOpacity(1)).toBe(0);
  });

  it("keeps emitted ripples anchored when their monster moves", () => {
    const initial = advanceMonsterRippleEmissions(null, [{
      intensity: 1,
      x: 24,
      y: 48,
      z: 1,
    }], 1_000, LYNX_MONSTER_RIPPLE_EMISSION_INTERVAL_MS);
    const originalPulse = initial.emissions[0]!;
    const advanced = advanceMonsterRippleEmissions(initial, [{
      intensity: 2,
      x: 120,
      y: 48,
      z: 1,
    }], initial.nextEmissionAtMs + 1, LYNX_MONSTER_RIPPLE_EMISSION_INTERVAL_MS);

    expect(advanced.emissions).toContainEqual(originalPulse);
    expect(advanced.emissions.at(-1)).toMatchObject({
      intensity: 2,
      x: 120,
      y: 48,
      z: 1,
    });
  });

  it("allows ripples through fog but not complete darkness", () => {
    expect(monsterRipplesCanRenderOutsideDirectVisibility("normal")).toBe(true);
    expect(monsterRipplesCanRenderOutsideDirectVisibility("flashlight-fog")).toBe(true);
    expect(monsterRipplesCanRenderOutsideDirectVisibility("line-of-sight-fog")).toBe(true);
    expect(monsterRipplesCanRenderOutsideDirectVisibility("flashlight")).toBe(false);
    expect(monsterRipplesCanRenderOutsideDirectVisibility("line-of-sight")).toBe(false);
  });

  it("selects only the visible artwork edge of a hidden thin-wall tile", () => {
    expect(visibleThinWallOverlayTileId(MS_TILE.Wall_South, MS_DIRECTION.south)).toBe(
      MS_TILE.Wall_South,
    );
    expect(visibleThinWallOverlayTileId(MS_TILE.Wall_South, MS_DIRECTION.north)).toBeNull();
    expect(visibleThinWallOverlayTileId(MS_TILE.Wall_Southeast, MS_DIRECTION.south)).toBe(
      MS_TILE.Wall_South,
    );
    expect(visibleThinWallOverlayTileId(
      MS_TILE.Wall_Southeast,
      MS_DIRECTION.south | MS_DIRECTION.east,
    )).toBe(MS_TILE.Wall_Southeast);
    expect(visibleThinWallOverlayTileId(MS_TILE.Key_Blue, MS_DIRECTION.south)).toBeNull();
  });

  it("uses per-cell rendering only during the paused normalization ripple", () => {
    const settings = createDefaultBrowserSpecialModesSettings(() => 1);
    settings.transform.mode = "timed";
    const runtime: SpecialModesRuntimeSnapshot = {
      orientation: "rotate-90",
      transition: null,
      warningSeconds: null,
      warningShakeOffsetPx: 0,
      revision: 0,
    };
    expect(usesPerCellArtworkNormalization(settings, runtime)).toBe(false);
    runtime.transition = {
      from: "identity",
      to: "rotate-90",
      progress: 0.6,
      phase: "artwork-normalize",
      phaseProgress: 0.4,
    };
    expect(usesPerCellArtworkNormalization(settings, runtime)).toBe(true);
    runtime.transition = { ...runtime.transition, phase: "speed-up" };
    expect(usesPerCellArtworkNormalization(settings, runtime)).toBe(false);
  });
});
