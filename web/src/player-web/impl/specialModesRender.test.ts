import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  inverseTransformCanvasPoint,
  remapDihedralArtworkTileId,
  sessionWithoutMonsterArtwork,
  usesPerCellArtworkNormalization,
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
