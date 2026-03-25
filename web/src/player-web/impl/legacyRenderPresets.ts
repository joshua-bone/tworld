import { LEGACY_MAP_TILES, LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";

export type LegacyRenderTileSize = 24 | 32 | 48;

export const LEGACY_RENDER_TILE_SIZES: readonly LegacyRenderTileSize[] = [48, 32, 24] as const;

export function legacyMapPixelsForTileSize(tileSize: LegacyRenderTileSize): number {
  return LEGACY_MAP_TILES * tileSize;
}

export function isDefaultLegacyRenderTileSize(tileSize: LegacyRenderTileSize): boolean {
  return tileSize === LEGACY_TILE_SIZE;
}

export function pickLegacyRenderTileSize(availableBoardSizePx: number): LegacyRenderTileSize {
  for (const tileSize of LEGACY_RENDER_TILE_SIZES) {
    if (legacyMapPixelsForTileSize(tileSize) <= availableBoardSizePx) {
      return tileSize;
    }
  }

  return LEGACY_RENDER_TILE_SIZES[LEGACY_RENDER_TILE_SIZES.length - 1]!;
}
