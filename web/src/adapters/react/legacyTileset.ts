import { LEGACY_TILE_SIZE, getLegacySpriteCoords } from "@adapters/react/legacySprites";
import { MS_DIRECTION, MS_TILE, isMsBoots, isMsCreature, isMsKey, msCreatureTile } from "@domain/game/rules/ms/tiles";

export interface LegacyTileSprite {
  image: HTMLCanvasElement;
  offsetX: number;
  offsetY: number;
  transparent: boolean;
}

export interface LegacyTileset {
  get(tileId: number): LegacyTileSprite | null;
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
  return {
    image: spriteCanvasFromImageData(sourceContext.getImageData(x, y, width, height)),
    offsetX,
    offsetY,
    transparent,
  };
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
  const imageData = sourceContext.getImageData(x, y, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (matchesColor(imageData.data, index, transparencyColor)) {
      imageData.data[index + 3] = 0;
    }
  }

  return {
    image: spriteCanvasFromImageData(imageData),
    offsetX,
    offsetY,
    transparent: true,
  };
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
  const imageData = sourceContext.getImageData(x, y, width, height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (matchesColor(imageData.data, index, transparencyColor)) {
      imageData.data[index] = emptyTileData.data[index]!;
      imageData.data[index + 1] = emptyTileData.data[index + 1]!;
      imageData.data[index + 2] = emptyTileData.data[index + 2]!;
      imageData.data[index + 3] = emptyTileData.data[index + 3]!;
    }
  }

  return {
    image: spriteCanvasFromImageData(imageData),
    offsetX: 0,
    offsetY: 0,
    transparent: false,
  };
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

function setSprite(sprites: Map<number, LegacyTileSprite>, id: number, sprite: LegacyTileSprite): void {
  sprites.set(id, sprite);
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
  const sprites = new Map<number, LegacyTileSprite>();

  setSprite(sprites, MS_TILE.Empty, extractRawSprite(sourceContext, 1, 1, layout.tileWidth, layout.tileHeight, false));

  const transparentFrameX = (x: number, width: number, count: number): number => x + (count - 1) * width;

  for (let index = 1; index < LYNX_TILE_SPECS.length; index += 1) {
    const spec = LYNX_TILE_SPECS[index]!;
    const position = layout.positions[index];
    if (!position || spec.shape === LegacyLynxTileShape.Implicit) {
      continue;
    }

    const baseX = position.x;
    const baseY = position.y;

    switch (spec.shape) {
      case LegacyLynxTileShape.SingleOpaque:
        setSprite(
          sprites,
          spec.id,
          extractRawSprite(
            sourceContext,
            baseX,
            baseY,
            layout.tileWidth,
            layout.tileHeight,
            false,
          ),
        );
        break;

      case LegacyLynxTileShape.OpaqueCels:
        setSprite(
          sprites,
          spec.id,
          extractOpaqueSprite(
            sourceContext,
            baseX,
            baseY,
            layout.tileWidth,
            layout.tileHeight,
            transparencyColor,
            emptyTileData,
          ),
        );
        break;

      case LegacyLynxTileShape.TranspCels:
        setSprite(
          sprites,
          spec.id,
          extractTransparentSprite(
            sourceContext,
            transparentFrameX(baseX, layout.tileWidth, position.w),
            baseY,
            layout.tileWidth,
            layout.tileHeight,
            transparencyColor,
          ),
        );
        break;

      case LegacyLynxTileShape.Animation: {
        const cellWidth = position.h === 3 ? layout.tileWidth * 3 : layout.tileWidth;
        const cellHeight = position.h === 3 ? layout.tileHeight * 3 : layout.tileHeight;
        const frameCount = position.h === 3 ? position.w / 3 : position.w;
        setSprite(
          sprites,
          spec.id,
          extractTransparentSprite(
            sourceContext,
            transparentFrameX(baseX, cellWidth, frameCount),
            baseY,
            cellWidth,
            cellHeight,
            transparencyColor,
            position.h === 3 ? -layout.tileWidth : 0,
            position.h === 3 ? -layout.tileHeight : 0,
          ),
        );
        break;
      }

      case LegacyLynxTileShape.Creature:
        if (position.h === 1) {
          if (position.w === 1) {
            const sprite = extractTransparentSprite(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setSprite(sprites, spec.id, sprite);
            setSprite(sprites, spec.id + 1, sprite);
            setSprite(sprites, spec.id + 2, sprite);
            setSprite(sprites, spec.id + 3, sprite);
          } else if (position.w === 2) {
            const northSouth = extractTransparentSprite(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            const westEast = extractTransparentSprite(
              sourceContext,
              baseX + layout.tileWidth,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setSprite(sprites, spec.id, northSouth);
            setSprite(sprites, spec.id + 1, westEast);
            setSprite(sprites, spec.id + 2, northSouth);
            setSprite(sprites, spec.id + 3, westEast);
          } else if (position.w === 4) {
            for (let direction = 0; direction < 4; direction += 1) {
              setSprite(
                sprites,
                spec.id + direction,
                extractTransparentSprite(
                  sourceContext,
                  baseX + direction * layout.tileWidth,
                  baseY,
                  layout.tileWidth,
                  layout.tileHeight,
                  transparencyColor,
                ),
              );
            }
          }
        } else if (position.h === 2) {
          if (position.w === 1) {
            const northSouth = extractTransparentSprite(
              sourceContext,
              baseX,
              baseY,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            const westEast = extractTransparentSprite(
              sourceContext,
              baseX,
              baseY + layout.tileHeight,
              layout.tileWidth,
              layout.tileHeight,
              transparencyColor,
            );
            setSprite(sprites, spec.id, northSouth);
            setSprite(sprites, spec.id + 1, westEast);
            setSprite(sprites, spec.id + 2, northSouth);
            setSprite(sprites, spec.id + 3, westEast);
          } else if (position.w === 2) {
            setSprite(
              sprites,
              spec.id,
              extractTransparentSprite(
                sourceContext,
                baseX,
                baseY,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 1,
              extractTransparentSprite(
                sourceContext,
                baseX + layout.tileWidth,
                baseY,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 2,
              extractTransparentSprite(
                sourceContext,
                baseX,
                baseY + layout.tileHeight,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 3,
              extractTransparentSprite(
                sourceContext,
                baseX + layout.tileWidth,
                baseY + layout.tileHeight,
                layout.tileWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
          } else if (position.w === 8) {
            const frameWidth = layout.tileWidth;
            const northX = transparentFrameX(baseX, frameWidth, 4);
            const westX = transparentFrameX(baseX + 4 * layout.tileWidth, frameWidth, 4);
            setSprite(
              sprites,
              spec.id,
              extractTransparentSprite(sourceContext, northX, baseY, frameWidth, layout.tileHeight, transparencyColor),
            );
            setSprite(
              sprites,
              spec.id + 1,
              extractTransparentSprite(sourceContext, westX, baseY, frameWidth, layout.tileHeight, transparencyColor),
            );
            setSprite(
              sprites,
              spec.id + 2,
              extractTransparentSprite(
                sourceContext,
                northX,
                baseY + layout.tileHeight,
                frameWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 3,
              extractTransparentSprite(
                sourceContext,
                westX,
                baseY + layout.tileHeight,
                frameWidth,
                layout.tileHeight,
                transparencyColor,
              ),
            );
          } else if (position.w === 16) {
            const northX = transparentFrameX(baseX, layout.tileWidth, 4);
            const southX = transparentFrameX(baseX + 4 * layout.tileWidth, layout.tileWidth, 4);
            const westX = transparentFrameX(baseX + 8 * layout.tileWidth, layout.tileWidth * 2, 4);
            const eastX = westX;

            setSprite(
              sprites,
              spec.id,
              extractTransparentSprite(
                sourceContext,
                northX,
                baseY,
                layout.tileWidth,
                layout.tileHeight * 2,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 2,
              extractTransparentSprite(
                sourceContext,
                southX,
                baseY,
                layout.tileWidth,
                layout.tileHeight * 2,
                transparencyColor,
                0,
                -layout.tileHeight,
              ),
            );
            setSprite(
              sprites,
              spec.id + 1,
              extractTransparentSprite(
                sourceContext,
                westX,
                baseY,
                layout.tileWidth * 2,
                layout.tileHeight,
                transparencyColor,
              ),
            );
            setSprite(
              sprites,
              spec.id + 3,
              extractTransparentSprite(
                sourceContext,
                eastX,
                baseY + layout.tileHeight,
                layout.tileWidth * 2,
                layout.tileHeight,
                transparencyColor,
                -layout.tileWidth,
                0,
              ),
            );
          }
        }
        break;
    }
  }

  setSprite(sprites, MS_TILE.Overlay_Buffer, sprites.get(MS_TILE.Empty)!);
  setSprite(sprites, MS_TILE.Block_Static, sprites.get(msCreatureTile(MS_TILE.Block, NORTH))!);
  setSprite(sprites, MS_TILE.HiddenWall_Perm, sprites.get(MS_TILE.Empty)!);
  setSprite(sprites, MS_TILE.HiddenWall_Temp, sprites.get(MS_TILE.Empty)!);
  setSprite(sprites, MS_TILE.BlueWall_Fake, sprites.get(MS_TILE.BlueWall_Real)!);

  return {
    get(tileId: number): LegacyTileSprite | null {
      return sprites.get(tileId) ?? null;
    },
  };
}

export function buildLegacyTileset(sourceCanvas: HTMLCanvasElement, ruleset: "MS" | "Lynx"): LegacyTileset {
  return ruleset === "Lynx" ? buildLynxLegacyTileset(sourceCanvas) : buildMsLegacyTileset(sourceCanvas);
}
