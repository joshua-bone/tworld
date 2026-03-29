import expandedArtworkKeyJson from "@res/expansion_artwork/expanded.json";

export interface ExpansionArtworkSpriteKey {
  column: number;
  row: number;
  transparent: boolean;
  preserveLayerTransparency?: boolean;
}

export interface ExpansionArtworkSheetKey {
  image: string;
  slice: {
    mode: string;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
  };
  sprites: Record<string, ExpansionArtworkSpriteKey>;
}

export interface ExpansionArtworkFrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
  transparent: boolean;
  preserveLayerTransparency: boolean;
}

export const expandedArtworkSheetKey: ExpansionArtworkSheetKey = expandedArtworkKeyJson;

export function expansionArtworkFrameRect(spriteId: string): ExpansionArtworkFrameRect | null {
  const sprite = expandedArtworkSheetKey.sprites[spriteId];
  if (!sprite) {
    return null;
  }

  const { slice } = expandedArtworkSheetKey;
  if (slice.mode !== "grid") {
    return null;
  }
  if (sprite.column < 0 || sprite.column >= slice.columns || sprite.row < 0 || sprite.row >= slice.rows) {
    return null;
  }

  return {
    x: sprite.column * slice.tileWidth,
    y: sprite.row * slice.tileHeight,
    width: slice.tileWidth,
    height: slice.tileHeight,
    transparent: sprite.transparent,
    preserveLayerTransparency: sprite.preserveLayerTransparency === true,
  };
}
