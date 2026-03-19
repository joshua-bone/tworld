import { prepareMsLevel, type DecodedMsLevelData, type MsLevel } from "@ruleset-ms/api/level";
import { MS_TILE } from "@ruleset-ms/api/tiles";

// DAT level decoding is shared; Lynx diverges in runtime behavior, not the raw
// level container layout.
export type LynxLevel = MsLevel;
export type DecodedLynxLevelData = DecodedMsLevelData;

function isLynxSpecialTile(id: number): boolean {
  return id >= MS_TILE.Drowned_Chip && id <= MS_TILE.Overlay_Buffer && id !== MS_TILE.Exited_Chip;
}

export function prepareLynxLevel(decoded: DecodedLynxLevelData): LynxLevel {
  const level = prepareMsLevel(decoded);

  return {
    ...level,
    cells: level.cells.map((cell) => ({
      ...cell,
      top: {
        ...cell.top,
        id: isLynxSpecialTile(cell.top.id) ? MS_TILE.Wall : cell.top.id,
      },
      bottom: {
        ...cell.bottom,
        id: isLynxSpecialTile(cell.bottom.id) ? MS_TILE.Wall : cell.bottom.id,
      },
    })),
    layers: (level.layers ?? []).map((layer) => ({
      ...layer,
      cells: layer.cells.map((cell) => ({
        ...cell,
        top: {
          ...cell.top,
          id: isLynxSpecialTile(cell.top.id) ? MS_TILE.Wall : cell.top.id,
        },
        bottom: {
          ...cell.bottom,
          id: isLynxSpecialTile(cell.bottom.id) ? MS_TILE.Wall : cell.bottom.id,
        },
      })),
    })),
  };
}
