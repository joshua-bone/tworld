export const MS_GRID_WIDTH = 32;
export const MS_GRID_HEIGHT = 32;
export const MS_TICKS_PER_SECOND = 20;

export const MS_DIRECTION = {
  none: 0,
  north: 1,
  west: 2,
  south: 4,
  east: 8,
} as const;

export const MS_TILE = {
  Nothing: 0x00,
  Empty: 0x01,
  Slide_North: 0x02,
  Slide_West: 0x03,
  Slide_South: 0x04,
  Slide_East: 0x05,
  Slide_Random: 0x06,
  Ice: 0x07,
  IceWall_Northwest: 0x08,
  IceWall_Northeast: 0x09,
  IceWall_Southwest: 0x0a,
  IceWall_Southeast: 0x0b,
  Gravel: 0x0c,
  Dirt: 0x0d,
  Water: 0x0e,
  Fire: 0x0f,
  Bomb: 0x10,
  Beartrap: 0x11,
  Burglar: 0x12,
  HintButton: 0x13,
  Button_Blue: 0x14,
  Button_Green: 0x15,
  Button_Red: 0x16,
  Button_Brown: 0x17,
  Teleport: 0x18,
  Wall: 0x19,
  Wall_North: 0x1a,
  Wall_West: 0x1b,
  Wall_South: 0x1c,
  Wall_East: 0x1d,
  Wall_Southeast: 0x1e,
  HiddenWall_Perm: 0x1f,
  HiddenWall_Temp: 0x20,
  BlueWall_Real: 0x21,
  BlueWall_Fake: 0x22,
  SwitchWall_Open: 0x23,
  SwitchWall_Closed: 0x24,
  PopupWall: 0x25,
  CloneMachine: 0x26,
  Door_Red: 0x27,
  Door_Blue: 0x28,
  Door_Yellow: 0x29,
  Door_Green: 0x2a,
  Socket: 0x2b,
  Exit: 0x2c,
  ICChip: 0x2d,
  Key_Red: 0x2e,
  Key_Blue: 0x2f,
  Key_Yellow: 0x30,
  Key_Green: 0x31,
  Boots_Ice: 0x32,
  Boots_Slide: 0x33,
  Boots_Fire: 0x34,
  Boots_Water: 0x35,
  Block_Static: 0x36,
  Drowned_Chip: 0x37,
  Burned_Chip: 0x38,
  Bombed_Chip: 0x39,
  Exited_Chip: 0x3a,
  Exit_Extra_1: 0x3b,
  Exit_Extra_2: 0x3c,
  Overlay_Buffer: 0x3d,
  Air: 0x3e,
  Elevator: 0x3f,
  Chip: 0x40,
  Block: 0x44,
  Tank: 0x48,
  Ball: 0x4c,
  Glider: 0x50,
  Fireball: 0x54,
  Walker: 0x58,
  Blob: 0x5c,
  Teeth: 0x60,
  Bug: 0x64,
  Paramecium: 0x68,
  Swimming_Chip: 0x6c,
  Pushing_Chip: 0x70,
  BowlingBall: 0x74,
  IceBlock: 0x78,
  Sandbag: 0x80,
  Hook: 0x81,
  BowlingBall_Still: 0x82,
  Cloud: 0x83,
  IceBlock_Static: 0x84,
} as const;

export type MsBlockSpeciesId = "dirt" | "ice";

export interface MsBlockSpeciesRegistration {
  readonly speciesId: MsBlockSpeciesId;
  readonly actorId: number;
  readonly staticTileId: number;
  readonly pushableBlockSpeciesIds: readonly MsBlockSpeciesId[];
  readonly initialClonerDir?: number;
}

export const MS_BLOCK_SPECIES_REGISTRATIONS = [
  {
    speciesId: "dirt",
    actorId: MS_TILE.Block,
    staticTileId: MS_TILE.Block_Static,
    pushableBlockSpeciesIds: [],
  },
  {
    speciesId: "ice",
    actorId: MS_TILE.IceBlock,
    staticTileId: MS_TILE.IceBlock_Static,
    pushableBlockSpeciesIds: ["ice"],
    initialClonerDir: MS_DIRECTION.north,
  },
] as const satisfies readonly MsBlockSpeciesRegistration[];

export const MS_FLOOR_STATE = {
  ButtonDown: 0x01,
  Cloning: 0x02,
  Broken: 0x04,
  HasMutant: 0x08,
  Marker: 0x10,
  TrapOpen: 0x20,
} as const;

export const MS_STATUS_FLAG = {
  NoSaving: 0x0001,
  Invalid: 0x0002,
  BadTiles: 0x0004,
  ShowHint: 0x0008,
  NoAnimation: 0x0010,
  Shuttered: 0x0020,
} as const;

export const MS_SOUND = {
  ChipLoses: 0,
  ChipWins: 1,
  TimeOut: 2,
  TimeLow: 3,
  Derezz: 4,
  CantMove: 5,
  IcCollected: 6,
  ItemCollected: 7,
  BootsStolen: 8,
  Teleporting: 9,
  DoorOpened: 10,
  SocketOpened: 11,
  ButtonPushed: 12,
  TileEmptied: 13,
  WallCreated: 14,
  TrapEntered: 15,
  BombExplodes: 16,
  WaterSplash: 17,
} as const;

const KEY_RANGE = [MS_TILE.Key_Red, MS_TILE.Key_Green] as const;
const BOOT_RANGE = [MS_TILE.Boots_Ice, MS_TILE.Boots_Water] as const;
const CREATURE_RANGE = [MS_TILE.Chip, 0x7c] as const;
const msBlockSpeciesByActorId = new Map<number, MsBlockSpeciesRegistration>(
  MS_BLOCK_SPECIES_REGISTRATIONS.map((registration) => [registration.actorId, registration] as const),
);
const msBlockSpeciesByStaticTileId = new Map<number, MsBlockSpeciesRegistration>(
  MS_BLOCK_SPECIES_REGISTRATIONS.map((registration) => [registration.staticTileId, registration] as const),
);

export function msDirIndex(dir: number): number {
  return (0x30210 >> (dir * 2)) & 3;
}

export function msIndexDir(index: number): number {
  return 1 << (index & 3);
}

export function msCreatureTile(baseId: number, dir: number): number {
  return baseId | msDirIndex(dir);
}

export function msCreatureId(id: number): number {
  return id & ~3;
}

export function msCreatureDir(id: number): number {
  return msIndexDir(id & 3);
}

export function isMsCreature(id: number): boolean {
  return id >= CREATURE_RANGE[0] && id < CREATURE_RANGE[1];
}

export function lookupMsBlockSpeciesByActorId(actorId: number): MsBlockSpeciesRegistration | undefined {
  const normalizedActorId = isMsCreature(actorId) ? msCreatureId(actorId) : actorId;
  return msBlockSpeciesByActorId.get(normalizedActorId);
}

export function lookupMsBlockSpeciesByStaticTileId(tileId: number): MsBlockSpeciesRegistration | undefined {
  return msBlockSpeciesByStaticTileId.get(tileId);
}

export function lookupMsBlockSpeciesByTileId(tileId: number): MsBlockSpeciesRegistration | undefined {
  return lookupMsBlockSpeciesByStaticTileId(tileId) ?? lookupMsBlockSpeciesByActorId(tileId);
}

export function isMsBlockActorId(actorId: number): boolean {
  return lookupMsBlockSpeciesByActorId(actorId) !== undefined;
}

export function isMsStaticBlockTile(tileId: number): boolean {
  return lookupMsBlockSpeciesByStaticTileId(tileId) !== undefined;
}

export function msStaticBlockActorId(tileId: number): number | null {
  return lookupMsBlockSpeciesByStaticTileId(tileId)?.actorId ?? null;
}

export function msActorBlockStaticTileId(actorId: number): number | null {
  return lookupMsBlockSpeciesByActorId(actorId)?.staticTileId ?? null;
}

export function canMsBlockPushBlock(pushingBlockId: number, targetBlockId: number): boolean {
  const pushingSpecies = lookupMsBlockSpeciesByTileId(pushingBlockId);
  const targetSpecies = lookupMsBlockSpeciesByTileId(targetBlockId);
  return (
    pushingSpecies !== undefined &&
    targetSpecies !== undefined &&
    pushingSpecies.pushableBlockSpeciesIds.includes(targetSpecies.speciesId)
  );
}

export function canMsFireballMeltIceBlock(
  movingActorId: number,
  targetBlockId: number | null,
  targetFloorId: number,
  targetEntryAllowed: boolean,
): boolean {
  return (
    (isMsCreature(movingActorId) ? msCreatureId(movingActorId) : movingActorId) === MS_TILE.Fireball &&
    targetEntryAllowed &&
    targetFloorId === MS_TILE.Empty &&
    targetBlockId !== null &&
    lookupMsBlockSpeciesByTileId(targetBlockId)?.speciesId === "ice"
  );
}

export function isMsKey(id: number): boolean {
  return id >= KEY_RANGE[0] && id <= KEY_RANGE[1];
}

export function isMsBoots(id: number): boolean {
  return id >= BOOT_RANGE[0] && id <= BOOT_RANGE[1];
}

export function isMsFloor(id: number): boolean {
  return id <= MS_TILE.Elevator;
}

export function isMsDoor(id: number): boolean {
  return id >= MS_TILE.Door_Red && id <= MS_TILE.Door_Green;
}
