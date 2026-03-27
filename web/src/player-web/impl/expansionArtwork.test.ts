import { describe, expect, it } from "vitest";
import { expandedArtworkSheetKey, expansionArtworkFrameRect } from "@player-web/impl/expansionArtwork";

describe("expandedArtworkSheetKey", () => {
  it("describes the 48px grid used by the expansion artwork sheet", () => {
    expect(expandedArtworkSheetKey).toMatchObject({
      image: "expanded.png",
      slice: {
        mode: "grid",
        tileWidth: 48,
        tileHeight: 48,
        columns: 3,
        rows: 1,
      },
    });
  });
});

describe("expansionArtworkFrameRect", () => {
  it("returns the sandbag frame from the first sheet cell", () => {
    expect(expansionArtworkFrameRect("sandbag")).toEqual({
      x: 0,
      y: 0,
      width: 48,
      height: 48,
      transparent: true,
    });
  });

  it("returns null for unknown sprites", () => {
    expect(expansionArtworkFrameRect("missing")).toBeNull();
  });
});
