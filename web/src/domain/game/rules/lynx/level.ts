import { parseMsLevel, type MsLevel } from "@domain/game/rules/ms/level";
import { MS_TILE } from "@domain/game/rules/ms/tiles";

// DAT level decoding is shared; Lynx diverges in runtime behavior, not the raw
// level container layout.
export type LynxLevel = MsLevel;

function isLynxSpecialTile(id: number): boolean {
  return id >= MS_TILE.Drowned_Chip && id <= MS_TILE.Overlay_Buffer && id !== MS_TILE.Exited_Chip;
}

export function parseLynxLevel(levelData: Uint8Array): LynxLevel {
  const level = parseMsLevel(levelData);

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
  };
}
