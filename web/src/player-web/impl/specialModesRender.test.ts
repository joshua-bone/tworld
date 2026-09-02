import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import { inverseTransformCanvasPoint, sessionWithoutMonsterArtwork } from "@player-web/impl/specialModesRender";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

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
});
