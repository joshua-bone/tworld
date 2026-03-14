import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

export const LEGACY_TILE_SIZE = 48;
export const LEGACY_WINDOW_WIDTH = 640;
export const LEGACY_WINDOW_HEIGHT = 472;
export const LEGACY_MARGIN = 8;
export const LEGACY_MAP_X = LEGACY_MARGIN;
export const LEGACY_MAP_Y = LEGACY_MARGIN;
export const LEGACY_MAP_TILES = 9;
export const LEGACY_MAP_WIDTH = LEGACY_MAP_TILES * LEGACY_TILE_SIZE;
export const LEGACY_MAP_HEIGHT = LEGACY_MAP_TILES * LEGACY_TILE_SIZE;
export const LEGACY_INFO_X = LEGACY_MAP_X + LEGACY_MAP_WIDTH + LEGACY_MARGIN;
export const LEGACY_TITLE_Y = LEGACY_MAP_Y + LEGACY_MAP_HEIGHT + LEGACY_MARGIN;

export interface LegacySpriteCoords {
  x: number;
  y: number;
}

const NORTH = MS_DIRECTION.north;
const WEST = MS_DIRECTION.west;
const SOUTH = MS_DIRECTION.south;
const EAST = MS_DIRECTION.east;

const SPRITES = new Map<number, LegacySpriteCoords>([
  [MS_TILE.Empty, { x: 0, y: 0 }],
  [MS_TILE.Slide_North, { x: 1, y: 2 }],
  [MS_TILE.Slide_West, { x: 1, y: 4 }],
  [MS_TILE.Slide_South, { x: 0, y: 13 }],
  [MS_TILE.Slide_East, { x: 1, y: 3 }],
  [MS_TILE.Slide_Random, { x: 3, y: 2 }],
  [MS_TILE.Ice, { x: 0, y: 12 }],
  [MS_TILE.IceWall_Northwest, { x: 1, y: 12 }],
  [MS_TILE.IceWall_Northeast, { x: 1, y: 13 }],
  [MS_TILE.IceWall_Southwest, { x: 1, y: 11 }],
  [MS_TILE.IceWall_Southeast, { x: 1, y: 10 }],
  [MS_TILE.Gravel, { x: 2, y: 13 }],
  [MS_TILE.Dirt, { x: 0, y: 11 }],
  [MS_TILE.Water, { x: 0, y: 3 }],
  [MS_TILE.Fire, { x: 0, y: 4 }],
  [MS_TILE.Bomb, { x: 2, y: 10 }],
  [MS_TILE.Beartrap, { x: 2, y: 11 }],
  [MS_TILE.Burglar, { x: 2, y: 1 }],
  [MS_TILE.HintButton, { x: 2, y: 15 }],
  [MS_TILE.Button_Blue, { x: 2, y: 8 }],
  [MS_TILE.Button_Green, { x: 2, y: 3 }],
  [MS_TILE.Button_Red, { x: 2, y: 4 }],
  [MS_TILE.Button_Brown, { x: 2, y: 7 }],
  [MS_TILE.Teleport, { x: 2, y: 9 }],
  [MS_TILE.Wall, { x: 0, y: 1 }],
  [MS_TILE.Wall_North, { x: 0, y: 6 }],
  [MS_TILE.Wall_West, { x: 0, y: 7 }],
  [MS_TILE.Wall_South, { x: 0, y: 8 }],
  [MS_TILE.Wall_East, { x: 0, y: 9 }],
  [MS_TILE.Wall_Southeast, { x: 3, y: 0 }],
  [MS_TILE.HiddenWall_Perm, { x: 0, y: 1 }],
  [MS_TILE.HiddenWall_Temp, { x: 2, y: 12 }],
  [MS_TILE.BlueWall_Real, { x: 1, y: 14 }],
  [MS_TILE.BlueWall_Fake, { x: 1, y: 15 }],
  [MS_TILE.SwitchWall_Open, { x: 2, y: 6 }],
  [MS_TILE.SwitchWall_Closed, { x: 2, y: 5 }],
  [MS_TILE.PopupWall, { x: 2, y: 14 }],
  [MS_TILE.CloneMachine, { x: 3, y: 1 }],
  [MS_TILE.Door_Red, { x: 1, y: 7 }],
  [MS_TILE.Door_Blue, { x: 1, y: 6 }],
  [MS_TILE.Door_Yellow, { x: 1, y: 9 }],
  [MS_TILE.Door_Green, { x: 1, y: 8 }],
  [MS_TILE.Socket, { x: 2, y: 2 }],
  [MS_TILE.Exit, { x: 1, y: 5 }],
  [MS_TILE.ICChip, { x: 0, y: 2 }],
  [MS_TILE.Key_Red, { x: 6, y: 5 }],
  [MS_TILE.Key_Blue, { x: 6, y: 4 }],
  [MS_TILE.Key_Yellow, { x: 6, y: 7 }],
  [MS_TILE.Key_Green, { x: 6, y: 6 }],
  [MS_TILE.Boots_Ice, { x: 6, y: 10 }],
  [MS_TILE.Boots_Slide, { x: 6, y: 11 }],
  [MS_TILE.Boots_Fire, { x: 6, y: 9 }],
  [MS_TILE.Boots_Water, { x: 6, y: 8 }],
  [MS_TILE.Block_Static, { x: 0, y: 10 }],
  [MS_TILE.Overlay_Buffer, { x: 2, y: 0 }],
  [MS_TILE.Exit_Extra_1, { x: 3, y: 10 }],
  [MS_TILE.Exit_Extra_2, { x: 3, y: 11 }],
  [MS_TILE.Burned_Chip, { x: 3, y: 4 }],
  [MS_TILE.Bombed_Chip, { x: 3, y: 5 }],
  [MS_TILE.Exited_Chip, { x: 3, y: 9 }],
  [MS_TILE.Drowned_Chip, { x: 3, y: 3 }],
  [msCreatureTile(MS_TILE.Swimming_Chip, NORTH), { x: 3, y: 12 }],
  [msCreatureTile(MS_TILE.Swimming_Chip, WEST), { x: 3, y: 13 }],
  [msCreatureTile(MS_TILE.Swimming_Chip, SOUTH), { x: 3, y: 14 }],
  [msCreatureTile(MS_TILE.Swimming_Chip, EAST), { x: 3, y: 15 }],
  [msCreatureTile(MS_TILE.Chip, NORTH), { x: 6, y: 12 }],
  [msCreatureTile(MS_TILE.Chip, WEST), { x: 6, y: 13 }],
  [msCreatureTile(MS_TILE.Chip, SOUTH), { x: 6, y: 14 }],
  [msCreatureTile(MS_TILE.Chip, EAST), { x: 6, y: 15 }],
  [msCreatureTile(MS_TILE.Pushing_Chip, NORTH), { x: 6, y: 12 }],
  [msCreatureTile(MS_TILE.Pushing_Chip, WEST), { x: 6, y: 13 }],
  [msCreatureTile(MS_TILE.Pushing_Chip, SOUTH), { x: 6, y: 14 }],
  [msCreatureTile(MS_TILE.Pushing_Chip, EAST), { x: 6, y: 15 }],
  [msCreatureTile(MS_TILE.Block, NORTH), { x: 0, y: 14 }],
  [msCreatureTile(MS_TILE.Block, WEST), { x: 0, y: 15 }],
  [msCreatureTile(MS_TILE.Block, SOUTH), { x: 1, y: 0 }],
  [msCreatureTile(MS_TILE.Block, EAST), { x: 1, y: 1 }],
  [msCreatureTile(MS_TILE.Tank, NORTH), { x: 4, y: 12 }],
  [msCreatureTile(MS_TILE.Tank, WEST), { x: 4, y: 13 }],
  [msCreatureTile(MS_TILE.Tank, SOUTH), { x: 4, y: 14 }],
  [msCreatureTile(MS_TILE.Tank, EAST), { x: 4, y: 15 }],
  [msCreatureTile(MS_TILE.Ball, NORTH), { x: 4, y: 8 }],
  [msCreatureTile(MS_TILE.Ball, WEST), { x: 4, y: 9 }],
  [msCreatureTile(MS_TILE.Ball, SOUTH), { x: 4, y: 10 }],
  [msCreatureTile(MS_TILE.Ball, EAST), { x: 4, y: 11 }],
  [msCreatureTile(MS_TILE.Glider, NORTH), { x: 5, y: 0 }],
  [msCreatureTile(MS_TILE.Glider, WEST), { x: 5, y: 1 }],
  [msCreatureTile(MS_TILE.Glider, SOUTH), { x: 5, y: 2 }],
  [msCreatureTile(MS_TILE.Glider, EAST), { x: 5, y: 3 }],
  [msCreatureTile(MS_TILE.Fireball, NORTH), { x: 4, y: 4 }],
  [msCreatureTile(MS_TILE.Fireball, WEST), { x: 4, y: 5 }],
  [msCreatureTile(MS_TILE.Fireball, SOUTH), { x: 4, y: 6 }],
  [msCreatureTile(MS_TILE.Fireball, EAST), { x: 4, y: 7 }],
  [msCreatureTile(MS_TILE.Bug, NORTH), { x: 4, y: 0 }],
  [msCreatureTile(MS_TILE.Bug, WEST), { x: 4, y: 1 }],
  [msCreatureTile(MS_TILE.Bug, SOUTH), { x: 4, y: 2 }],
  [msCreatureTile(MS_TILE.Bug, EAST), { x: 4, y: 3 }],
  [msCreatureTile(MS_TILE.Paramecium, NORTH), { x: 6, y: 0 }],
  [msCreatureTile(MS_TILE.Paramecium, WEST), { x: 6, y: 1 }],
  [msCreatureTile(MS_TILE.Paramecium, SOUTH), { x: 6, y: 2 }],
  [msCreatureTile(MS_TILE.Paramecium, EAST), { x: 6, y: 3 }],
  [msCreatureTile(MS_TILE.Teeth, NORTH), { x: 5, y: 4 }],
  [msCreatureTile(MS_TILE.Teeth, WEST), { x: 5, y: 5 }],
  [msCreatureTile(MS_TILE.Teeth, SOUTH), { x: 5, y: 6 }],
  [msCreatureTile(MS_TILE.Teeth, EAST), { x: 5, y: 7 }],
  [msCreatureTile(MS_TILE.Blob, NORTH), { x: 5, y: 12 }],
  [msCreatureTile(MS_TILE.Blob, WEST), { x: 5, y: 13 }],
  [msCreatureTile(MS_TILE.Blob, SOUTH), { x: 5, y: 14 }],
  [msCreatureTile(MS_TILE.Blob, EAST), { x: 5, y: 15 }],
  [msCreatureTile(MS_TILE.Walker, NORTH), { x: 5, y: 8 }],
  [msCreatureTile(MS_TILE.Walker, WEST), { x: 5, y: 9 }],
  [msCreatureTile(MS_TILE.Walker, SOUTH), { x: 5, y: 10 }],
  [msCreatureTile(MS_TILE.Walker, EAST), { x: 5, y: 11 }],
]);

export function getLegacySpriteCoords(tileId: number): LegacySpriteCoords | null {
  return SPRITES.get(tileId) ?? null;
}
