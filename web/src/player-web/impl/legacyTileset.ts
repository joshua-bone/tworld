import { LEGACY_TILE_SIZE, getLegacySpriteCoords } from "@player-web/impl/legacySprites";
import { MS_DIRECTION, MS_TILE, isMsBoots, isMsCreature, isMsKey, msCreatureTile } from "@ruleset-ms/api/tiles";

export interface LegacyTileSprite {
  image: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  transparent: boolean;
}

export interface LegacyTileset {
  get(tileId: number): LegacyTileSprite | null;
  getCell?: (topId: number, bottomId: number, timerval: number) => LegacyTileSprite | null;
  getCreature?: (id: number, dir: number, moving: number, frame: number) => LegacyTileSprite | null;
}

interface RasterImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface LynxLargeTileBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export enum LegacyLynxTileShape {
  Implicit = "implicit",
  SingleOpaque = "singleOpaque",
  OpaqueCels = "opaqueCels",
  TranspCels = "transpCels",
  Creature = "creature",
  Animation = "animation",
}

export interface LegacyLynxTileSpec {
  id: number;
  shape: LegacyLynxTileShape;
}

interface LynxLargeTileLayout {
  tileWidth: number;
  tileHeight: number;
  positions: Array<LynxLargeTileBounds | null>;
}

interface LegacyTileEntry {
  opaque: Array<HTMLCanvasElement | null>;
  transp: Array<HTMLCanvasElement | null>;
  celCount: number;
  transpSize: number;
}

const SIZE_EXTLEFT = 0x01;
const SIZE_EXTRIGHT = 0x02;
const SIZE_EXTUP = 0x04;
const SIZE_EXTDOWN = 0x08;
const SIZE_EXTALL = SIZE_EXTLEFT | SIZE_EXTRIGHT | SIZE_EXTUP | SIZE_EXTDOWN;

const NORTH = MS_DIRECTION.north;
const WEST = MS_DIRECTION.west;
const SOUTH = MS_DIRECTION.south;
const EAST = MS_DIRECTION.east;

const LYNX_TILE = {
  Water_Splash: 0x74,
  Bomb_Explosion: 0x75,
  Entity_Explosion: 0x76,
} as const;

const lynxOpaque = (id: number): LegacyLynxTileSpec => ({ id, shape: LegacyLynxTileShape.OpaqueCels });
const lynxTransparent = (id: number): LegacyLynxTileSpec => ({ id, shape: LegacyLynxTileShape.TranspCels });
const lynxSingleOpaque = (id: number): LegacyLynxTileSpec => ({ id, shape: LegacyLynxTileShape.SingleOpaque });
const lynxImplicit = (id: number): LegacyLynxTileSpec => ({ id, shape: LegacyLynxTileShape.Implicit });
const lynxCreature = (baseId: number): LegacyLynxTileSpec[] => [
  { id: msCreatureTile(baseId, NORTH), shape: LegacyLynxTileShape.Creature },
  { id: msCreatureTile(baseId, WEST), shape: LegacyLynxTileShape.Implicit },
  { id: msCreatureTile(baseId, SOUTH), shape: LegacyLynxTileShape.Implicit },
  { id: msCreatureTile(baseId, EAST), shape: LegacyLynxTileShape.Implicit },
];

export const LYNX_TILE_SPECS: LegacyLynxTileSpec[] = [
  lynxSingleOpaque(MS_TILE.Empty),
  lynxOpaque(MS_TILE.Slide_North),
  lynxOpaque(MS_TILE.Slide_West),
  lynxOpaque(MS_TILE.Slide_South),
  lynxOpaque(MS_TILE.Slide_East),
  lynxOpaque(MS_TILE.Slide_Random),
  lynxOpaque(MS_TILE.Ice),
  lynxOpaque(MS_TILE.IceWall_Northwest),
  lynxOpaque(MS_TILE.IceWall_Northeast),
  lynxOpaque(MS_TILE.IceWall_Southwest),
  lynxOpaque(MS_TILE.IceWall_Southeast),
  lynxOpaque(MS_TILE.Gravel),
  lynxOpaque(MS_TILE.Dirt),
  lynxOpaque(MS_TILE.Water),
  lynxOpaque(MS_TILE.Fire),
  lynxOpaque(MS_TILE.Bomb),
  lynxOpaque(MS_TILE.Beartrap),
  lynxOpaque(MS_TILE.Burglar),
  lynxOpaque(MS_TILE.HintButton),
  lynxOpaque(MS_TILE.Button_Blue),
  lynxOpaque(MS_TILE.Button_Green),
  lynxOpaque(MS_TILE.Button_Red),
  lynxOpaque(MS_TILE.Button_Brown),
  lynxOpaque(MS_TILE.Teleport),
  lynxOpaque(MS_TILE.Wall),
  lynxOpaque(MS_TILE.Wall_North),
  lynxOpaque(MS_TILE.Wall_West),
  lynxOpaque(MS_TILE.Wall_South),
  lynxOpaque(MS_TILE.Wall_East),
  lynxOpaque(MS_TILE.Wall_Southeast),
  lynxImplicit(MS_TILE.HiddenWall_Perm),
  lynxImplicit(MS_TILE.HiddenWall_Temp),
  lynxOpaque(MS_TILE.BlueWall_Real),
  lynxImplicit(MS_TILE.BlueWall_Fake),
  lynxOpaque(MS_TILE.SwitchWall_Open),
  lynxOpaque(MS_TILE.SwitchWall_Closed),
  lynxOpaque(MS_TILE.PopupWall),
  lynxOpaque(MS_TILE.CloneMachine),
  lynxOpaque(MS_TILE.Door_Red),
  lynxOpaque(MS_TILE.Door_Blue),
  lynxOpaque(MS_TILE.Door_Yellow),
  lynxOpaque(MS_TILE.Door_Green),
  lynxOpaque(MS_TILE.Socket),
  lynxOpaque(MS_TILE.Exit),
  lynxOpaque(MS_TILE.ICChip),
  lynxTransparent(MS_TILE.Key_Red),
  lynxTransparent(MS_TILE.Key_Blue),
  lynxTransparent(MS_TILE.Key_Yellow),
  lynxTransparent(MS_TILE.Key_Green),
  lynxTransparent(MS_TILE.Boots_Ice),
  lynxTransparent(MS_TILE.Boots_Slide),
  lynxTransparent(MS_TILE.Boots_Fire),
  lynxTransparent(MS_TILE.Boots_Water),
  lynxImplicit(MS_TILE.Block_Static),
  lynxImplicit(MS_TILE.Overlay_Buffer),
  lynxImplicit(MS_TILE.Air),
  lynxImplicit(MS_TILE.Elevator),
  lynxSingleOpaque(MS_TILE.Exit_Extra_1),
  lynxSingleOpaque(MS_TILE.Exit_Extra_2),
  lynxSingleOpaque(MS_TILE.Burned_Chip),
  lynxSingleOpaque(MS_TILE.Bombed_Chip),
  lynxSingleOpaque(MS_TILE.Exited_Chip),
  lynxSingleOpaque(MS_TILE.Drowned_Chip),
  lynxSingleOpaque(msCreatureTile(MS_TILE.Swimming_Chip, NORTH)),
  lynxSingleOpaque(msCreatureTile(MS_TILE.Swimming_Chip, WEST)),
  lynxSingleOpaque(msCreatureTile(MS_TILE.Swimming_Chip, SOUTH)),
  lynxSingleOpaque(msCreatureTile(MS_TILE.Swimming_Chip, EAST)),
  ...lynxCreature(MS_TILE.Chip),
  ...lynxCreature(MS_TILE.Pushing_Chip),
  ...lynxCreature(MS_TILE.Block),
  ...lynxCreature(MS_TILE.Tank),
  ...lynxCreature(MS_TILE.Ball),
  ...lynxCreature(MS_TILE.Glider),
  ...lynxCreature(MS_TILE.Fireball),
  ...lynxCreature(MS_TILE.Bug),
  ...lynxCreature(MS_TILE.Paramecium),
  ...lynxCreature(MS_TILE.Teeth),
  ...lynxCreature(MS_TILE.Blob),
  ...lynxCreature(MS_TILE.Walker),
  { id: LYNX_TILE.Water_Splash, shape: LegacyLynxTileShape.Animation },
  { id: LYNX_TILE.Bomb_Explosion, shape: LegacyLynxTileShape.Animation },
  { id: LYNX_TILE.Entity_Explosion, shape: LegacyLynxTileShape.Animation },
];

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function rasterOffset(image: RasterImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

function rasterColorAt(image: RasterImage, x: number, y: number): [number, number, number, number] {
  const offset = rasterOffset(image, x, y);
  return [image.data[offset]!, image.data[offset + 1]!, image.data[offset + 2]!, image.data[offset + 3]!];
}

function matchesColor(data: Uint8ClampedArray, offset: number, color: readonly number[]): boolean {
  return (
    data[offset] === color[0] &&
    data[offset + 1] === color[1] &&
    data[offset + 2] === color[2] &&
    data[offset + 3] === color[3]
  );
}

function spriteCanvasFromImageData(imageData: ImageData): HTMLCanvasElement {
  const canvas = createCanvas(imageData.width, imageData.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create sprite canvas");
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function createLegacyTileEntry(): LegacyTileEntry {
  return {
    opaque: Array.from({ length: 16 }, () => null),
    transp: Array.from({ length: 16 }, () => null),
    celCount: 0,
    transpSize: 0,
  };
}

function createLegacyTileSprite(image: HTMLCanvasElement, transparent: boolean, offsetX = 0, offsetY = 0): LegacyTileSprite {
  return {
    image,
    offsetX,
    offsetY,
    transparent,
  };
}

function extractOpaqueCanvas(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  transparencyColor: readonly number[],
  emptyTileData: ImageData,
): HTMLCanvasElement {
  const imageData = sourceContext.getImageData(x, y, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (matchesColor(imageData.data, index, transparencyColor)) {
      imageData.data[index] = emptyTileData.data[index]!;
      imageData.data[index + 1] = emptyTileData.data[index + 1]!;
      imageData.data[index + 2] = emptyTileData.data[index + 2]!;
      imageData.data[index + 3] = emptyTileData.data[index + 3]!;
    }
  }

  return spriteCanvasFromImageData(imageData);
}

function extractTransparentCanvas(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  transparencyColor: readonly number[],
): HTMLCanvasElement {
  const imageData = sourceContext.getImageData(x, y, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (matchesColor(imageData.data, index, transparencyColor)) {
      imageData.data[index + 3] = 0;
    }
  }

  return spriteCanvasFromImageData(imageData);
}

function extractRawSprite(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  transparent: boolean,
  offsetX = 0,
  offsetY = 0,
): LegacyTileSprite {
  return createLegacyTileSprite(
    spriteCanvasFromImageData(sourceContext.getImageData(x, y, width, height)),
    transparent,
    offsetX,
    offsetY,
  );
}

function extractTransparentSprite(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  transparencyColor: readonly number[],
  offsetX = 0,
  offsetY = 0,
): LegacyTileSprite {
  return createLegacyTileSprite(
    extractTransparentCanvas(sourceContext, x, y, width, height, transparencyColor),
    true,
    offsetX,
    offsetY,
  );
}

function extractOpaqueSprite(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  transparencyColor: readonly number[],
  emptyTileData: ImageData,
): LegacyTileSprite {
  return createLegacyTileSprite(
    extractOpaqueCanvas(sourceContext, x, y, width, height, transparencyColor, emptyTileData),
    false,
  );
}

function extractMsSprite(sourceContext: CanvasRenderingContext2D, tileId: number): LegacyTileSprite | null {
  const coords = getLegacySpriteCoords(tileId);
  if (!coords) {
    return null;
  }

  const x = coords.x * LEGACY_TILE_SIZE;
  const y = coords.y * LEGACY_TILE_SIZE;
  if (isMsKey(tileId) || isMsBoots(tileId) || isMsCreature(tileId)) {
    return extractTransparentSprite(sourceContext, x, y, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE, [255, 0, 255, 255]);
  }

  return extractRawSprite(sourceContext, x, y, LEGACY_TILE_SIZE, LEGACY_TILE_SIZE, false);
}

function buildMsLegacyTileset(sourceCanvas: HTMLCanvasElement): LegacyTileset {
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("Unable to read legacy tilesheet");
  }

  const sprites = new Map<number, LegacyTileSprite>();
  for (let tileId = MS_TILE.Empty; tileId <= msCreatureTile(MS_TILE.Pushing_Chip, EAST); tileId += 1) {
    const sprite = extractMsSprite(sourceContext, tileId);
    if (sprite) {
      sprites.set(tileId, sprite);
    }
  }

  return {
    get(tileId: number): LegacyTileSprite | null {
      return sprites.get(tileId) ?? null;
    },
  };
}

export function scanLynxLargeTileLayout(
  raster: RasterImage,
  specs: readonly LegacyLynxTileSpec[] = LYNX_TILE_SPECS,
): LynxLargeTileLayout {
  const transparencyColor = rasterColorAt(raster, 1, 0);

  let tileWidth = 1;
  for (; tileWidth < raster.width; tileWidth += 1) {
    if (!matchesColor(raster.data, rasterOffset(raster, tileWidth, 0), transparencyColor)) {
      break;
    }
  }
  if (tileWidth === raster.width) {
    throw new Error("Unable to locate Lynx tile separators");
  }
  if (tileWidth % 4 !== 0) {
    throw new Error("Lynx tile width must be divisible by 4");
  }

  let tileHeight = 1;
  for (; tileHeight < raster.height; tileHeight += 1) {
    if (!matchesColor(raster.data, rasterOffset(raster, 0, tileHeight), transparencyColor)) {
      break;
    }
  }
  tileHeight -= 1;
  if (tileHeight % 4 !== 0) {
    throw new Error("Lynx tile height must be divisible by 4");
  }

  const positions: Array<LynxLargeTileBounds | null> = new Array(specs.length).fill(null);
  let row = 0;
  let nextRow = tileHeight + 1;
  let groupHeight = 1;
  let x = 0;
  let y = 0;

  for (let index = 0; index < specs.length; index += 1) {
    const spec = specs[index]!;
    if (spec.shape === LegacyLynxTileShape.Implicit) {
      continue;
    }

    for (;;) {
      let groupWidth = 0;
      for (;;) {
        groupWidth += 1;
        if (x + groupWidth * tileWidth >= raster.width) {
          groupWidth = 0;
          break;
        }
        if (!matchesColor(raster.data, rasterOffset(raster, x + groupWidth * tileWidth, row), transparencyColor)) {
          break;
        }
      }

      if (groupWidth !== 0) {
        positions[index] = {
          x: x + 1,
          y: y + 1,
          w: groupWidth,
          h: groupHeight,
        };
        x += groupWidth * tileWidth;
        break;
      }

      row = nextRow;
      nextRow += 1;
      y += 1 + groupHeight * tileHeight;
      groupHeight = 0;

      do {
        groupHeight += 1;
        if (y + groupHeight * tileHeight >= raster.height) {
          throw new Error(`Incomplete Lynx tileset: missing tile ${spec.id.toString(16)}`);
        }
        nextRow += tileHeight;
      } while (matchesColor(raster.data, rasterOffset(raster, 0, nextRow), transparencyColor));

      x = 0;
    }
  }

  return { tileWidth, tileHeight, positions };
}

function setEntry(entries: Map<number, LegacyTileEntry>, id: number, entry: LegacyTileEntry): void {
  entries.set(id, entry);
}

function extractOpaqueSequence(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
  transparencyColor: readonly number[],
  emptyTileData: ImageData,
): HTMLCanvasElement[] {
  const frames: HTMLCanvasElement[] = [];
  for (let index = 0; index < count; index += 1) {
    frames.push(extractOpaqueCanvas(sourceContext, x + index * width, y, width, height, transparencyColor, emptyTileData));
  }
  return frames;
}

function extractTransparentSequence(
  sourceContext: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  count: number,
  transparencyColor: readonly number[],
): HTMLCanvasElement[] {
  const frames = new Array<HTMLCanvasElement>(count);
  for (let index = count - 1, frameX = x; index >= 0; index -= 1, frameX += width) {
    frames[index] = extractTransparentCanvas(sourceContext, frameX, y, width, height, transparencyColor);
  }
  return frames;
}

function isLynxAnimationTile(id: number): boolean {
  return id >= LYNX_TILE.Water_Splash && id <= LYNX_TILE.Entity_Explosion;
}

function renderEntryFrame(
  entry: LegacyTileEntry,
  index: number,
  offsetX = 0,
  offsetY = 0,
): LegacyTileSprite | null {
  const transparentImage = entry.transp[index] ?? null;
  if (transparentImage) {
    return createLegacyTileSprite(transparentImage, true, offsetX, offsetY);
  }

  const opaqueImage = entry.opaque[index] ?? null;
  if (!opaqueImage) {
    return null;
  }

  return createLegacyTileSprite(opaqueImage, false, offsetX, offsetY);
}

function timedCelIndex(entry: LegacyTileEntry, timerval: number): number {
  if (entry.celCount <= 1) {
    return 0;
  }
  if (timerval < 0) {
    return 0;
  }
  return (timerval + 1) % entry.celCount;
}

function buildLynxLegacyTileset(sourceCanvas: HTMLCanvasElement): LegacyTileset {
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) {
    throw new Error("Unable to read legacy tilesheet");
  }

  const raster = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const layout = scanLynxLargeTileLayout(raster);
  const transparencyColor = rasterColorAt(raster, 1, 0);
  const emptyTileData = sourceContext.getImageData(1, 1, layout.tileWidth, layout.tileHeight);
  const entries = new Map<number, LegacyTileEntry>();

  const emptyEntry = createLegacyTileEntry();
  emptyEntry.celCount = 1;
  emptyEntry.opaque[0] = spriteCanvasFromImageData(emptyTileData);
  setEntry(entries, MS_TILE.Empty, emptyEntry);

  for (let index = 1; index < LYNX_TILE_SPECS.length; index += 1) {
    const spec = LYNX_TILE_SPECS[index]!;
    const position = layout.positions[index];
    if (!position || spec.shape === LegacyLynxTileShape.Implicit) {
      continue;
    }

    const baseX = position.x;
    const baseY = position.y;

    switch (spec.shape) {
      case LegacyLynxTileShape.SingleOpaque: {
        const entry = createLegacyTileEntry();
        entry.celCount = 1;
        entry.opaque[0] = spriteCanvasFromImageData(sourceContext.getImageData(baseX, baseY, layout.tileWidth, layout.tileHeight));
        setEntry(entries, spec.id, entry);
        break;
      }

      case LegacyLynxTileShape.OpaqueCels: {
        const entry = createLegacyTileEntry();
        entry.celCount = position.w;
        extractOpaqueSequence(
          sourceContext,
          baseX,
          baseY,
          layout.tileWidth,
          layout.tileHeight,
          position.w,
          transparencyColor,
          emptyTileData,
        ).forEach((frame, frameIndex) => {
          entry.opaque[frameIndex] = frame;
        });
        setEntry(entries, spec.id, entry);
        break;
      }

      case LegacyLynxTileShape.TranspCels: {
        const entry = createLegacyTileEntry();
        entry.celCount = position.w;
        extractTransparentSequence(
          sourceContext,
          baseX,
          baseY,
          layout.tileWidth,
          layout.tileHeight,
          position.w,
          transparencyColor,
        ).forEach((frame, frameIndex) => {
          entry.transp[frameIndex] = frame;
        });
        setEntry(entries, spec.id, entry);
        break;
      }

      case LegacyLynxTileShape.Animation: {
        const entry = createLegacyTileEntry();
        const cellWidth = position.h === 3 ? layout.tileWidth * 3 : layout.tileWidth;
        const cellHeight = position.h === 3 ? layout.tileHeight * 3 : layout.tileHeight;
        const frameCount = position.h === 3 ? position.w / 3 : position.w;
        entry.transpSize = position.h === 3 ? SIZE_EXTALL : 0;
        entry.celCount = frameCount;
        extractTransparentSequence(
          sourceContext,
          baseX,
          baseY,
          cellWidth,
          cellHeight,
          frameCount,
          transparencyColor,
        ).forEach((frame, frameIndex) => {
          entry.transp[frameIndex] = frame;
        });
        if (entry.celCount < 12) {
          const originalCount = entry.celCount;
          for (let frameIndex = 11; frameIndex >= 0; frameIndex -= 1) {
            entry.transp[frameIndex] = entry.transp[Math.trunc((frameIndex * originalCount) / 12)] ?? null;
          }
          entry.celCount = 12;
        }
        setEntry(entries, spec.id, entry);
        break;
      }

      case LegacyLynxTileShape.Creature:
        if (position.h === 1) {
          if (position.w === 1) {
            const entry = createLegacyTileEntry();
            entry.celCount = 1;
            entry.transp[0] = extractTransparentCanvas(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setEntry(entries, spec.id, entry);
            setEntry(entries, spec.id + 1, entry);
            setEntry(entries, spec.id + 2, entry);
            setEntry(entries, spec.id + 3, entry);
          } else if (position.w === 2) {
            const northSouth = createLegacyTileEntry();
            northSouth.celCount = 1;
            northSouth.transp[0] = extractTransparentCanvas(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            const westEast = createLegacyTileEntry();
            westEast.celCount = 1;
            westEast.transp[0] = extractTransparentCanvas(
              sourceContext,
              baseX + layout.tileWidth,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setEntry(entries, spec.id, northSouth);
            setEntry(entries, spec.id + 1, westEast);
            setEntry(entries, spec.id + 2, northSouth);
            setEntry(entries, spec.id + 3, westEast);
          } else if (position.w === 4) {
            for (let direction = 0; direction < 4; direction += 1) {
              const entry = createLegacyTileEntry();
              entry.celCount = 1;
              entry.transp[0] = extractTransparentCanvas(
                sourceContext,
                baseX + direction * layout.tileWidth,
                baseY,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              );
              setEntry(entries, spec.id + direction, entry);
            }
          }
        } else if (position.h === 2) {
          if (position.w === 1) {
            const northSouth = createLegacyTileEntry();
            northSouth.celCount = 1;
            northSouth.transp[0] = extractTransparentCanvas(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            const westEast = createLegacyTileEntry();
            westEast.celCount = 1;
            westEast.transp[0] = extractTransparentCanvas(
              sourceContext,
              baseX,
              baseY + layout.tileHeight,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setEntry(entries, spec.id, northSouth);
            setEntry(entries, spec.id + 1, westEast);
            setEntry(entries, spec.id + 2, northSouth);
            setEntry(entries, spec.id + 3, westEast);
          } else if (position.w === 2) {
            [
              [0, 0, spec.id],
              [1, 0, spec.id + 1],
              [0, 1, spec.id + 2],
              [1, 1, spec.id + 3],
            ].forEach(([xOffset, yOffset, id]) => {
              const entry = createLegacyTileEntry();
              entry.celCount = 1;
              entry.transp[0] = extractTransparentCanvas(
                sourceContext,
                baseX + Number(xOffset) * layout.tileWidth,
                baseY + Number(yOffset) * layout.tileHeight,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              );
              setEntry(entries, Number(id), entry);
            });
          } else if (position.w === 8) {
            const north = createLegacyTileEntry();
            north.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              north.transp[frameIndex] = frame;
            });
            const west = createLegacyTileEntry();
            west.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX + 4 * layout.tileWidth,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              west.transp[frameIndex] = frame;
            });
            const south = createLegacyTileEntry();
            south.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX,
              baseY + layout.tileHeight,
              layout.tileWidth,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              south.transp[frameIndex] = frame;
            });
            const east = createLegacyTileEntry();
            east.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX + 4 * layout.tileWidth,
              baseY + layout.tileHeight,
              layout.tileWidth,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              east.transp[frameIndex] = frame;
            });
            setEntry(entries, spec.id, north);
            setEntry(entries, spec.id + 1, west);
            setEntry(entries, spec.id + 2, south);
            setEntry(entries, spec.id + 3, east);
          } else if (position.w === 16) {
            const north = createLegacyTileEntry();
            north.transpSize = SIZE_EXTDOWN;
            north.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight * 2,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              north.transp[frameIndex] = frame;
            });
            const south = createLegacyTileEntry();
            south.transpSize = SIZE_EXTUP;
            south.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX + 4 * layout.tileWidth,
              baseY,
              layout.tileWidth,
              layout.tileHeight * 2,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              south.transp[frameIndex] = frame;
            });
            const west = createLegacyTileEntry();
            west.transpSize = SIZE_EXTRIGHT;
            west.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX + 8 * layout.tileWidth,
              baseY,
              layout.tileWidth * 2,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              west.transp[frameIndex] = frame;
            });
            const east = createLegacyTileEntry();
            east.transpSize = SIZE_EXTLEFT;
            east.celCount = 4;
            extractTransparentSequence(
              sourceContext,
              baseX + 8 * layout.tileWidth,
              baseY + layout.tileHeight,
              layout.tileWidth * 2,
              layout.tileHeight,
              4,
              transparencyColor,
            ).forEach((frame, frameIndex) => {
              east.transp[frameIndex] = frame;
            });
            setEntry(entries, spec.id, north);
            setEntry(entries, spec.id + 1, west);
            setEntry(entries, spec.id + 2, south);
            setEntry(entries, spec.id + 3, east);
          }
        }
        break;
    }
  }

  setEntry(entries, MS_TILE.Overlay_Buffer, entries.get(MS_TILE.Empty)!);
  setEntry(entries, MS_TILE.Air, entries.get(MS_TILE.Empty)!);
  setEntry(entries, MS_TILE.Elevator, entries.get(MS_TILE.Exited_Chip)!);
  const staticBlockEntry = createLegacyTileEntry();
  staticBlockEntry.celCount = 1;
  staticBlockEntry.opaque[0] = entries.get(msCreatureTile(MS_TILE.Block, NORTH))?.transp[0] ?? null;
  setEntry(entries, MS_TILE.Block_Static, staticBlockEntry);
  setEntry(entries, MS_TILE.HiddenWall_Perm, entries.get(MS_TILE.Empty)!);
  setEntry(entries, MS_TILE.HiddenWall_Temp, entries.get(MS_TILE.Empty)!);
  setEntry(entries, MS_TILE.BlueWall_Fake, entries.get(MS_TILE.BlueWall_Real)!);

  const cellCache = new Map<string, LegacyTileSprite>();

  return {
    get(tileId: number): LegacyTileSprite | null {
      const entry = entries.get(tileId);
      if (!entry || entry.celCount <= 0) {
        return null;
      }

      let offsetX = 0;
      let offsetY = 0;
      if ((entry.transpSize & SIZE_EXTLEFT) !== 0) {
        offsetX -= layout.tileWidth;
      }
      if ((entry.transpSize & SIZE_EXTUP) !== 0) {
        offsetY -= layout.tileHeight;
      }

      return renderEntryFrame(entry, 0, offsetX, offsetY);
    },
    getCell(topId: number, bottomId: number, timerval: number): LegacyTileSprite | null {
      const topEntry = entries.get(topId);
      if (!topEntry || topEntry.celCount <= 0) {
        return null;
      }

      const topIndex = timedCelIndex(topEntry, timerval);
      if (bottomId === MS_TILE.Nothing || bottomId === MS_TILE.Empty || topEntry.transp[0] === null) {
        const opaqueTop = topEntry.opaque[topIndex] ?? null;
        if (opaqueTop) {
          return createLegacyTileSprite(opaqueTop, false);
        }

        const topTransparent = topEntry.transp[topIndex] ?? null;
        if (!topTransparent) {
          return null;
        }

        const cacheKey = `${topId}|${bottomId}|${topIndex}|overlay`;
        const cached = cellCache.get(cacheKey);
        if (cached) {
          return cached;
        }

        const canvas = createCanvas(layout.tileWidth, layout.tileHeight);
        const context = canvas.getContext("2d");
        if (!context) {
          return null;
        }
        context.drawImage(emptyEntry.opaque[0]!, 0, 0);
        context.drawImage(topTransparent, 0, 0);
        const sprite = createLegacyTileSprite(canvas, false);
        cellCache.set(cacheKey, sprite);
        return sprite;
      }

      const bottomEntry = entries.get(bottomId);
      if (!bottomEntry || bottomEntry.celCount <= 0) {
        return null;
      }

      const bottomIndex = timedCelIndex(bottomEntry, timerval);
      const cacheKey = `${topId}|${bottomId}|${topIndex}|${bottomIndex}`;
      const cached = cellCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const canvas = createCanvas(layout.tileWidth, layout.tileHeight);
      const context = canvas.getContext("2d");
      if (!context) {
        return null;
      }

      const bottomOpaque = bottomEntry.opaque[bottomIndex] ?? null;
      const bottomTransparent = bottomEntry.transp[bottomIndex] ?? null;
      if (bottomOpaque) {
        context.drawImage(bottomOpaque, 0, 0);
      } else {
        context.drawImage(emptyEntry.opaque[0]!, 0, 0);
        if (bottomTransparent) {
          context.drawImage(bottomTransparent, 0, 0);
        }
      }

      const topTransparent = topEntry.transp[topIndex] ?? null;
      if (topTransparent) {
        context.drawImage(topTransparent, 0, 0);
      } else {
        const topOpaque = topEntry.opaque[topIndex] ?? null;
        if (topOpaque) {
          context.drawImage(topOpaque, 0, 0);
        }
      }

      const sprite = createLegacyTileSprite(canvas, false);
      cellCache.set(cacheKey, sprite);
      return sprite;
    },
    getCreature(id: number, dir: number, moving: number, frame: number): LegacyTileSprite | null {
      const tileId = isLynxAnimationTile(id) ? id : msCreatureTile(id, dir || NORTH);
      const entry = entries.get(tileId);
      if (!entry || entry.celCount <= 0) {
        return null;
      }

      const frameIndex = entry.celCount > 1 ? Math.max(0, Math.min(frame, entry.celCount - 1)) : 0;
      let offsetX = 0;
      let offsetY = 0;

      if ((entry.transpSize === 0 || isLynxAnimationTile(id)) && moving > 0) {
        switch (dir) {
          case NORTH:
            offsetY += (moving * layout.tileHeight) / 8;
            break;
          case WEST:
            offsetX += (moving * layout.tileWidth) / 8;
            break;
          case SOUTH:
            offsetY -= (moving * layout.tileHeight) / 8;
            break;
          case EAST:
            offsetX -= (moving * layout.tileWidth) / 8;
            break;
        }
      }

      if ((entry.transpSize & SIZE_EXTLEFT) !== 0) {
        offsetX -= layout.tileWidth;
      }
      if ((entry.transpSize & SIZE_EXTUP) !== 0) {
        offsetY -= layout.tileHeight;
      }

      return renderEntryFrame(entry, frameIndex, offsetX, offsetY);
    },
  };
}

export function buildLegacyTileset(sourceCanvas: HTMLCanvasElement, ruleset: "MS" | "Lynx"): LegacyTileset {
  return ruleset === "Lynx" ? buildLynxLegacyTileset(sourceCanvas) : buildMsLegacyTileset(sourceCanvas);
}
