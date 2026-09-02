import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  FLASHLIGHT_DIRECTION_TRANSITION_MS,
  flashlightDirectionTransitionAngle,
  inverseTransformCanvasPoint,
  monsterRippleArtworkOpacity,
  monsterRippleIntensity,
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
