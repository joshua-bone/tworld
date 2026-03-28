import { describe, expect, it } from "vitest";
import {
  isThinWallTileId,
  projectActorSupportDecoration,
  projectThinWallActorDecoration,
  projectTileOverlayRender,
} from "@ruleset-ms/api/renderMetadata";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("render metadata helpers", () => {
  it("projects support marker decorations for supported actor families", () => {
    expect(projectActorSupportDecoration(MS_TILE.Block, MS_TILE.Empty, MS_TILE.CloneMachine)).toEqual({
      kind: "support-marker",
      floorTileId: MS_TILE.CloneMachine,
      showBlockWindow: true,
      showDirectionArrow: true,
    });
    expect(projectActorSupportDecoration(MS_TILE.Blob, MS_TILE.Beartrap, MS_TILE.Empty)).toEqual({
      kind: "support-marker",
      floorTileId: MS_TILE.Beartrap,
      showBlockWindow: false,
      showDirectionArrow: true,
    });
    expect(projectActorSupportDecoration(MS_TILE.Glider, MS_TILE.Empty, MS_TILE.CloneMachine)).toBeNull();
  });

  it("projects thin-wall decorations for block actor passes", () => {
    expect(isThinWallTileId(MS_TILE.Wall_South)).toBe(true);
    expect(projectThinWallActorDecoration(MS_TILE.Block, MS_TILE.Wall_South, MS_TILE.Empty)).toEqual({
      kind: "thin-wall-overlay",
      tileId: MS_TILE.Wall_South,
    });
    expect(projectThinWallActorDecoration(MS_TILE.Ball, MS_TILE.Wall_South, MS_TILE.Empty)).toBeNull();
  });

  it("projects typed overlay render metadata", () => {
    expect(projectTileOverlayRender({ kind: "hidden-wall-reveal" })).toEqual({
      mode: "tile",
      tileId: MS_TILE.Wall,
      visualEnhancementOnly: true,
    });
    expect(projectTileOverlayRender({ kind: "support" })).toEqual({
      mode: "outline",
      style: "support",
    });
    expect(projectTileOverlayRender({ kind: "carried-tool", tileId: MS_TILE.Sandbag })).toEqual({
      mode: "tile",
      tileId: MS_TILE.Sandbag,
      alpha: 0.25,
    });
    expect(projectTileOverlayRender({ kind: "push-pickup-reveal", tileId: MS_TILE.Key_Yellow })).toEqual({
      mode: "pickup-reveal",
      tileId: MS_TILE.Key_Yellow,
    });
  });
});
