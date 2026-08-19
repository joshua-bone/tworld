import { deflateSync } from "node:zlib";
import { getLegacySpriteCoords, LEGACY_TILE_SIZE } from "@player-web/impl/legacySprites";
import {
  LegacyLynxTileShape,
  LYNX_TILE_SPECS,
  scanLynxLargeTileLayout,
} from "@player-web/impl/legacyTileset";
import {
  MS_DIRECTION,
  MS_TILE,
  isMsCreature,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";

export type P4bArtworkTarget = "ms" | "lynx";

export type P4bArtworkSprite = {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
};

export type P4bLegacyArtworkSheet = {
  readonly target: P4bArtworkTarget;
  readonly sourcePath: "res/tiles.bmp" | "res/atiles.bmp";
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly pngBytes: Uint8Array;
  readonly sprites: Readonly<Record<string, P4bArtworkSprite>>;
  /** Guardrail: the standard dossier renderer never loads expansion artwork. */
  readonly expandedArtworkIncluded: false;
};

export type P4bLegacyArtworkAtlas = P4bLegacyArtworkSheet & {
  /** Explicit bundle-relative URL supplied by the dossier builder. */
  readonly href: string;
};

type RgbaRaster = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

const EXPECTED_SOURCE = Object.freeze({
  ms: { path: "res/tiles.bmp", width: 336, height: 768 },
  lynx: { path: "res/atiles.bmp", width: 1_729, height: 874 },
} as const);

const SEMANTIC_TILE_IDS = Object.freeze({
  "cc1:floor": MS_TILE.Empty,
  "cc1:wall": MS_TILE.Wall,
  "cc1:hintbutton": MS_TILE.HintButton,
  "cc1:door-red": MS_TILE.Door_Red,
  "cc1:door-blue": MS_TILE.Door_Blue,
  "cc1:door-yellow": MS_TILE.Door_Yellow,
  "cc1:door-green": MS_TILE.Door_Green,
  "cc1:socket": MS_TILE.Socket,
  "cc1:exit": MS_TILE.Exit,
  "cc1:icchip": MS_TILE.ICChip,
  "cc1:key-red": MS_TILE.Key_Red,
  "cc1:key-blue": MS_TILE.Key_Blue,
  "cc1:key-yellow": MS_TILE.Key_Yellow,
  "cc1:key-green": MS_TILE.Key_Green,
} as const);

const FACING_DIRECTIONS = Object.freeze({
  north: MS_DIRECTION.north,
  west: MS_DIRECTION.west,
  south: MS_DIRECTION.south,
  east: MS_DIRECTION.east,
} as const);

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function spriteKey(semanticType: string, facing: string | null): string {
  return `${semanticType}|${facing ?? "none"}`;
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readInt32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true);
}

function decode24BitBmp(bytes: Uint8Array): RgbaRaster {
  if (bytes.byteLength < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) {
    throw new Error("P4B artwork source is not a Windows BMP");
  }
  const pixelOffset = readUint32(bytes, 10);
  const dibSize = readUint32(bytes, 14);
  const width = readInt32(bytes, 18);
  const signedHeight = readInt32(bytes, 22);
  const planes = readUint16(bytes, 26);
  const bitsPerPixel = readUint16(bytes, 28);
  const compression = readUint32(bytes, 30);
  if (
    dibSize < 40
    || width <= 0
    || signedHeight === 0
    || planes !== 1
    || bitsPerPixel !== 24
    || compression !== 0
  ) {
    throw new Error("P4B artwork requires an uncompressed 24-bit Windows BMP");
  }
  const height = Math.abs(signedHeight);
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  if (pixelOffset + rowStride * height !== bytes.byteLength) {
    throw new Error("P4B artwork BMP byte length does not match its header");
  }
  const data = new Uint8ClampedArray(width * height * 4);
  const bottomUp = signedHeight > 0;
  for (let y = 0; y < height; y += 1) {
    const sourceY = bottomUp ? height - y - 1 : y;
    const sourceRow = pixelOffset + sourceY * rowStride;
    for (let x = 0; x < width; x += 1) {
      const source = sourceRow + x * 3;
      const destination = (y * width + x) * 4;
      data[destination] = bytes[source + 2]!;
      data[destination + 1] = bytes[source + 1]!;
      data[destination + 2] = bytes[source]!;
      data[destination + 3] = 255;
    }
  }
  return { width, height, data };
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32BigEndian(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, false);
  return bytes;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const checksumInput = concatBytes([typeBytes, data]);
  return concatBytes([
    uint32BigEndian(data.byteLength),
    typeBytes,
    data,
    uint32BigEndian(crc32(checksumInput)),
  ]);
}

function encodeChromaKeyPng(raster: RgbaRaster, key: readonly [number, number, number]): Uint8Array {
  const scanlines = new Uint8Array((raster.width * 4 + 1) * raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    const scanline = y * (raster.width * 4 + 1);
    scanlines[scanline] = 0;
    for (let x = 0; x < raster.width; x += 1) {
      const source = (y * raster.width + x) * 4;
      const destination = scanline + 1 + x * 4;
      const red = raster.data[source]!;
      const green = raster.data[source + 1]!;
      const blue = raster.data[source + 2]!;
      scanlines[destination] = red;
      scanlines[destination + 1] = green;
      scanlines[destination + 2] = blue;
      scanlines[destination + 3] = red === key[0] && green === key[1] && blue === key[2] ? 0 : 255;
    }
  }
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, raster.width, false);
  headerView.setUint32(4, raster.height, false);
  header[8] = 8;
  header[9] = 6;
  return concatBytes([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines, { level: 9 }))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function pixelAt(raster: RgbaRaster, x: number, y: number): readonly [number, number, number] {
  const offset = (y * raster.width + x) * 4;
  return [raster.data[offset]!, raster.data[offset + 1]!, raster.data[offset + 2]!];
}

function msSprite(tileId: number): P4bArtworkSprite {
  const coordinate = getLegacySpriteCoords(tileId);
  if (coordinate === null) throw new Error(`P4B MS runtime atlas lacks tile ${tileId}`);
  return {
    sourceX: coordinate.x * LEGACY_TILE_SIZE,
    sourceY: coordinate.y * LEGACY_TILE_SIZE,
    sourceWidth: LEGACY_TILE_SIZE,
    sourceHeight: LEGACY_TILE_SIZE,
  };
}

function lynxCreatureSprite(
  baseX: number,
  baseY: number,
  columns: number,
  rows: number,
  tileWidth: number,
  tileHeight: number,
  directionIndex: number,
): P4bArtworkSprite {
  let column = 0;
  let row = 0;
  if (rows === 1 && columns === 2) {
    column = directionIndex % 2;
  } else if (rows === 1 && columns === 4) {
    column = directionIndex;
  } else if (rows === 2 && columns === 1) {
    row = directionIndex % 2;
  } else if (rows === 2 && columns === 2) {
    column = directionIndex % 2;
    row = Math.floor(directionIndex / 2);
  } else if (rows === 2 && columns === 8) {
    column = (directionIndex % 2) * 4 + 3;
    row = Math.floor(directionIndex / 2);
  } else if (rows === 1 && columns !== 1) {
    throw new Error(`P4B does not support Lynx creature atlas shape ${columns}x${rows}`);
  } else if (!(rows === 1 && columns === 1)) {
    throw new Error(`P4B does not support Lynx creature atlas shape ${columns}x${rows}`);
  }
  return {
    sourceX: baseX + column * tileWidth,
    sourceY: baseY + row * tileHeight,
    sourceWidth: tileWidth,
    sourceHeight: tileHeight,
  };
}

function lynxSprite(
  raster: RgbaRaster,
  tileId: number,
): P4bArtworkSprite {
  const layout = scanLynxLargeTileLayout(raster);
  if (tileId === MS_TILE.Empty) {
    return {
      sourceX: 1,
      sourceY: 1,
      sourceWidth: layout.tileWidth,
      sourceHeight: layout.tileHeight,
    };
  }
  const normalizedId = isMsCreature(tileId) ? tileId & ~3 : tileId;
  const specIndex = LYNX_TILE_SPECS.findIndex((spec) => spec.id === normalizedId);
  const spec = LYNX_TILE_SPECS[specIndex];
  const position = layout.positions[specIndex];
  if (specIndex < 0 || spec === undefined || position === null || position === undefined) {
    throw new Error(`P4B Lynx runtime atlas lacks tile ${tileId}`);
  }
  if (spec.shape === LegacyLynxTileShape.Implicit) {
    throw new Error(`P4B Lynx artwork tile ${tileId} unexpectedly resolves to an implicit entry`);
  }
  const baseX = position.x;
  const baseY = position.y;
  if (spec.shape === LegacyLynxTileShape.Creature) {
    return lynxCreatureSprite(
      baseX,
      baseY,
      position.w,
      position.h,
      layout.tileWidth,
      layout.tileHeight,
      tileId & 3,
    );
  }
  const frameColumn = spec.shape === LegacyLynxTileShape.TranspCels ? position.w - 1 : 0;
  return {
    sourceX: baseX + frameColumn * layout.tileWidth,
    sourceY: baseY,
    sourceWidth: layout.tileWidth,
    sourceHeight: layout.tileHeight,
  };
}

function buildSprites(target: P4bArtworkTarget, raster: RgbaRaster): Readonly<Record<string, P4bArtworkSprite>> {
  const sprites: Record<string, P4bArtworkSprite> = {};
  const resolveTile = target === "ms"
    ? (tileId: number) => msSprite(tileId)
    : (tileId: number) => lynxSprite(raster, tileId);
  for (const [semanticType, tileId] of Object.entries(SEMANTIC_TILE_IDS)) {
    sprites[spriteKey(semanticType, null)] = resolveTile(tileId);
  }
  for (const [facing, direction] of Object.entries(FACING_DIRECTIONS)) {
    sprites[spriteKey("cc1:chip", facing)] = resolveTile(msCreatureTile(MS_TILE.Chip, direction));
  }
  return Object.freeze(sprites);
}

export function createP4bLegacyArtworkSheet(input: {
  readonly target: P4bArtworkTarget;
  readonly sourcePath: string;
  readonly bytes: Uint8Array;
}): P4bLegacyArtworkSheet {
  const expected = EXPECTED_SOURCE[input.target];
  if (input.sourcePath !== expected.path) {
    throw new Error(`P4B ${input.target} artwork must be the standard runtime atlas ${expected.path}`);
  }
  const raster = decode24BitBmp(input.bytes);
  if (raster.width !== expected.width || raster.height !== expected.height) {
    throw new Error(
      `P4B ${input.target} artwork dimensions must be ${expected.width}x${expected.height}`,
    );
  }
  const lynxLayout = input.target === "lynx" ? scanLynxLargeTileLayout(raster) : null;
  const transparencyKey = input.target === "ms" ? [255, 0, 255] as const : pixelAt(raster, 1, 0);
  return Object.freeze({
    target: input.target,
    sourcePath: expected.path,
    sourceWidth: raster.width,
    sourceHeight: raster.height,
    tileWidth: lynxLayout?.tileWidth ?? LEGACY_TILE_SIZE,
    tileHeight: lynxLayout?.tileHeight ?? LEGACY_TILE_SIZE,
    pngBytes: encodeChromaKeyPng(raster, transparencyKey),
    sprites: buildSprites(input.target, raster),
    expandedArtworkIncluded: false,
  });
}

export function bindP4bLegacyArtworkHref(
  sheet: P4bLegacyArtworkSheet,
  href: string,
): P4bLegacyArtworkAtlas {
  if (href.length === 0 || href.includes("\0")) {
    throw new Error("P4B artwork href must be a nonempty bundle-relative URL");
  }
  return Object.freeze({ ...sheet, href });
}

export function p4bArtworkSpriteFor(
  artwork: P4bLegacyArtworkAtlas,
  semanticType: string,
  facing: string | null,
): P4bArtworkSprite {
  const sprite = artwork.sprites[spriteKey(semanticType, semanticType === "cc1:chip" ? facing : null)];
  if (sprite === undefined) {
    throw new Error(`P4B has no standard CC1 artwork mapping for ${semanticType}${facing ? ` facing ${facing}` : ""}`);
  }
  return sprite;
}
