import {
  createMsLevelLoadRegistration,
  type MsLevelLoadRegistration,
} from "@ruleset-ms/api/levelLoader";
import {
  createMsLevelDecodeRegistration,
  type MsLevelDecodeContext,
  type MsLevelDecodeRegistration,
  type MsLevelDecodeRegistrationEntry,
} from "@ruleset-ms/api/levelRegistration";
import { MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

const MS_BUILTIN_LEVEL_DECODE_ENTRIES = [
  MS_TILE.Empty,
  MS_TILE.Wall,
  MS_TILE.ICChip,
  MS_TILE.Water,
  MS_TILE.Fire,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Wall_North,
  MS_TILE.Wall_West,
  MS_TILE.Wall_South,
  MS_TILE.Wall_East,
  MS_TILE.Block_Static,
  MS_TILE.Dirt,
  MS_TILE.Ice,
  MS_TILE.Slide_South,
  msCreatureTile(MS_TILE.Block, 1),
  msCreatureTile(MS_TILE.Block, 2),
  msCreatureTile(MS_TILE.Block, 4),
  msCreatureTile(MS_TILE.Block, 8),
  MS_TILE.Slide_North,
  MS_TILE.Slide_East,
  MS_TILE.Slide_West,
  MS_TILE.Exit,
  MS_TILE.Door_Blue,
  MS_TILE.Door_Red,
  MS_TILE.Door_Green,
  MS_TILE.Door_Yellow,
  MS_TILE.IceWall_Southeast,
  MS_TILE.IceWall_Southwest,
  MS_TILE.IceWall_Northwest,
  MS_TILE.IceWall_Northeast,
  MS_TILE.BlueWall_Fake,
  MS_TILE.BlueWall_Real,
  MS_TILE.Overlay_Buffer,
  MS_TILE.Burglar,
  MS_TILE.Socket,
  MS_TILE.Button_Green,
  MS_TILE.Button_Red,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.SwitchWall_Open,
  MS_TILE.Button_Brown,
  MS_TILE.Button_Blue,
  MS_TILE.Teleport,
  MS_TILE.Bomb,
  MS_TILE.Beartrap,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.Gravel,
  MS_TILE.PopupWall,
  MS_TILE.HintButton,
  MS_TILE.Wall_Southeast,
  MS_TILE.CloneMachine,
  MS_TILE.Slide_Random,
  MS_TILE.Drowned_Chip,
  MS_TILE.Burned_Chip,
  MS_TILE.Bombed_Chip,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Exited_Chip,
  MS_TILE.Exit_Extra_1,
  MS_TILE.Exit_Extra_2,
  msCreatureTile(MS_TILE.Swimming_Chip, 1),
  msCreatureTile(MS_TILE.Swimming_Chip, 2),
  msCreatureTile(MS_TILE.Swimming_Chip, 4),
  msCreatureTile(MS_TILE.Swimming_Chip, 8),
  msCreatureTile(MS_TILE.Bug, 1),
  msCreatureTile(MS_TILE.Bug, 2),
  msCreatureTile(MS_TILE.Bug, 4),
  msCreatureTile(MS_TILE.Bug, 8),
  msCreatureTile(MS_TILE.Fireball, 1),
  msCreatureTile(MS_TILE.Fireball, 2),
  msCreatureTile(MS_TILE.Fireball, 4),
  msCreatureTile(MS_TILE.Fireball, 8),
  msCreatureTile(MS_TILE.Ball, 1),
  msCreatureTile(MS_TILE.Ball, 2),
  msCreatureTile(MS_TILE.Ball, 4),
  msCreatureTile(MS_TILE.Ball, 8),
  msCreatureTile(MS_TILE.Tank, 1),
  msCreatureTile(MS_TILE.Tank, 2),
  msCreatureTile(MS_TILE.Tank, 4),
  msCreatureTile(MS_TILE.Tank, 8),
  msCreatureTile(MS_TILE.Glider, 1),
  msCreatureTile(MS_TILE.Glider, 2),
  msCreatureTile(MS_TILE.Glider, 4),
  msCreatureTile(MS_TILE.Glider, 8),
  msCreatureTile(MS_TILE.Teeth, 1),
  msCreatureTile(MS_TILE.Teeth, 2),
  msCreatureTile(MS_TILE.Teeth, 4),
  msCreatureTile(MS_TILE.Teeth, 8),
  msCreatureTile(MS_TILE.Walker, 1),
  msCreatureTile(MS_TILE.Walker, 2),
  msCreatureTile(MS_TILE.Walker, 4),
  msCreatureTile(MS_TILE.Walker, 8),
  msCreatureTile(MS_TILE.Blob, 1),
  msCreatureTile(MS_TILE.Blob, 2),
  msCreatureTile(MS_TILE.Blob, 4),
  msCreatureTile(MS_TILE.Blob, 8),
  msCreatureTile(MS_TILE.Paramecium, 1),
  msCreatureTile(MS_TILE.Paramecium, 2),
  msCreatureTile(MS_TILE.Paramecium, 4),
  msCreatureTile(MS_TILE.Paramecium, 8),
  MS_TILE.Key_Blue,
  MS_TILE.Key_Red,
  MS_TILE.Key_Green,
  MS_TILE.Key_Yellow,
  MS_TILE.Boots_Water,
  MS_TILE.Boots_Fire,
  MS_TILE.Boots_Ice,
  MS_TILE.Boots_Slide,
  msCreatureTile(MS_TILE.Chip, 1),
  msCreatureTile(MS_TILE.Chip, 2),
  msCreatureTile(MS_TILE.Chip, 4),
  msCreatureTile(MS_TILE.Chip, 8),
  MS_TILE.Sandbag,
  MS_TILE.BowlingBall_Still,
  MS_TILE.Cloud,
  MS_TILE.Hook,
  MS_TILE.IceBlock_Static,
] as const;

function remapBuiltinMsTile(tileId: number, context: MsLevelDecodeContext): number {
  if (context.z > 1 && tileId === MS_TILE.Overlay_Buffer) {
    return MS_TILE.Air;
  }

  if (tileId === MS_TILE.Cloud && context.z <= 1) {
    return MS_TILE.Empty;
  }

  if (context.hasHigherLayers && tileId === MS_TILE.Exited_Chip) {
    return MS_TILE.Elevator;
  }

  return tileId;
}

export const msRegisteredLevelDecodeEntries = MS_BUILTIN_LEVEL_DECODE_ENTRIES.map((tileId, fileCode) => ({
  fileCode,
  tileId,
  resolveTileId: remapBuiltinMsTile,
})) as readonly MsLevelDecodeRegistrationEntry[];

export const msRegisteredLevelDecodeRegistration: MsLevelDecodeRegistration =
  createMsLevelDecodeRegistration(msRegisteredLevelDecodeEntries);
export const msRegisteredLevelLoadRegistration: MsLevelLoadRegistration =
  createMsLevelLoadRegistration(msRegisteredLevelDecodeRegistration);
