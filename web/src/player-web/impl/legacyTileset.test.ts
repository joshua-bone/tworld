import { describe, expect, it } from "vitest";
import { LegacyLynxTileShape, scanLynxLargeTileLayout } from "@player-web/impl/legacyTileset";

function createRaster(width: number, height: number, fill: readonly number[]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = fill[0]!;
    data[index + 1] = fill[1]!;
    data[index + 2] = fill[2]!;
    data[index + 3] = fill[3]!;
  }
  return data;
}

function setPixel(data: Uint8ClampedArray, width: number, x: number, y: number, color: readonly number[]): void {
  const offset = (y * width + x) * 4;
  data[offset] = color[0]!;
  data[offset + 1] = color[1]!;
  data[offset + 2] = color[2]!;
  data[offset + 3] = color[3]!;
}

describe("scanLynxLargeTileLayout", () => {
  it("detects tile size and skips implicit entries without advancing the large-format scan", () => {
    const transparent = [255, 0, 255, 255] as const;
    const marker = [0, 0, 0, 255] as const;
    const width = 13;
    const height = 6;
    const data = createRaster(width, height, transparent);

    setPixel(data, width, 4, 0, marker);
    setPixel(data, width, 12, 0, marker);
    setPixel(data, width, 0, 5, marker);

    const layout = scanLynxLargeTileLayout(
      { width, height, data },
      [
        { id: 0x01, shape: LegacyLynxTileShape.SingleOpaque },
        { id: 0x02, shape: LegacyLynxTileShape.Implicit },
        { id: 0x03, shape: LegacyLynxTileShape.OpaqueCels },
      ],
    );

    expect(layout.tileWidth).toBe(4);
    expect(layout.tileHeight).toBe(4);
    expect(layout.positions[0]).toEqual({ x: 1, y: 1, w: 1, h: 1 });
    expect(layout.positions[1]).toBeNull();
    expect(layout.positions[2]).toEqual({ x: 5, y: 1, w: 2, h: 1 });
  });
});
