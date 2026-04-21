import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type {
  InteractiveGameActorDecoration,
  InteractiveGameInventoryRender,
  InteractiveGamePetCarrierRender,
  InteractiveGameRenderFrame,
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlay,
  InteractiveGameTileOverlayRender,
  InteractiveGameVisibleLayer,
} from "@game-core/api/interactive";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  isThinWallTileId as isThinWallTileIdFromMetadata,
  projectActorSupportDecoration,
  projectThinWallActorDecoration,
} from "@ruleset-ms/api/renderMetadata";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  isMsBlockActorId,
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_STATUS_FLAG,
  MS_TILE,
  isMsCreature,
  msStaticBlockActorId,
  msCreatureId,
} from "@ruleset-ms/api/tiles";
import {
  LEGACY_MAP_HEIGHT,
  LEGACY_MAP_TILES,
  LEGACY_MAP_WIDTH,
  LEGACY_MAP_X,
  LEGACY_MAP_Y,
  LEGACY_TILE_SIZE,
} from "@player-web/impl/legacySprites";
import {
  clamp,
  createCanvas,
  drawLegacySpriteImage,
} from "@player-web/impl/legacyCanvasShared";
import {
  drawLegacyTile,
  getOrCreateHeldTrapSprite,
  getOrCreateOccupiedPetCarrierSprite,
  getOrCreateThinWallOverlaySprite,
} from "@player-web/impl/legacyCanvasTileset";
import {
  getCachedLayerCanvas,
  peekCachedLayerCanvas,
  storeCachedLayerCanvas,
  type LegacyLayerCanvasCache,
} from "@player-web/impl/legacyLayerCanvasCache";
import { legacyCreatureMovementOffset, type LegacyTileset } from "@player-web/impl/legacyTileset";
import type { LegacyTileSprite } from "@player-web/impl/legacyTileset";

const LOWER_LAYER_SCALE = 0.9;
const LOWER_LAYER_BLUR_PX = 1;
const LOWER_LAYER_DARKEN_PER_DEPTH = 0.25;
const MAX_CACHED_LOWER_LAYER_DEPTH = 3;
const LAYER_CANVAS_PADDING_TILES = Math.ceil((layerViewportTileWindow(MAX_CACHED_LOWER_LAYER_DEPTH) - LEGACY_MAP_TILES) / 2);
const LAYER_CANVAS_PADDING_PX = LAYER_CANVAS_PADDING_TILES * LEGACY_TILE_SIZE;
const LAYER_CANVAS_BOARD_SIZE = 32 * LEGACY_TILE_SIZE + LAYER_CANVAS_PADDING_PX * 2;
const INITIAL_RENDER_PREWARM_TICK_COUNT = 4;
const SUPPORT_BORDER_COLOR = "#2c8cff";
const ELEVATOR_FAILURE_BORDER_COLOR = "#ff4040";
const VISUAL_ENHANCEMENT_ARROW_COLOR = "#000000";
const BLOCK_SUPPORT_WINDOW_SOLID_BORDER_PX = 4;
const BLOCK_SUPPORT_WINDOW_TRANSPARENT_CENTER_SIZE = 8;
const STATIC_HASH_TILESET: LegacyTileset = {
  get: () => null,
  getCellAnimationPeriod: () => 1,
};

let blockSupportWindowMaskCanvas: HTMLCanvasElement | null | undefined;
const visibleLayerCellsSummaryCache = new WeakMap<
  InteractiveGameVisibleLayer,
  WeakMap<LegacyTileset, { hash: number; animationPeriod: number }>
>();

function hashLayerValue(hash: number, value: number): number {
  let next = hash ^ (value & 0xff_ff_ff_ff);
  next = Math.imul(next, 0x01_00_01_93);
  return next >>> 0;
}

function hashLayerString(hash: number, value: string | undefined): number {
  if (!value) {
    return hashLayerValue(hash, 0);
  }

  let next = hashLayerValue(hash, value.length);
  for (let index = 0; index < value.length; index += 1) {
    next = hashLayerValue(next, value.charCodeAt(index));
  }
  return next;
}

function buildVisibleLayerCellsSummary(
  tileset: LegacyTileset,
  layer: InteractiveGameVisibleLayer,
): { hash: number; animationPeriod: number } {
  let cacheByTileset = visibleLayerCellsSummaryCache.get(layer);
  const cachedSummary = cacheByTileset?.get(tileset);
  if (cachedSummary) {
    return cachedSummary;
  }

  let hash = 0x81_1c_9d_c5;
  let animationPeriod = 1;

  for (const cell of layer.cells) {
    hash = hashLayerValue(hash, cell.top.id);
    hash = hashLayerValue(hash, cell.top.state);
    hash = hashLayerValue(hash, cell.bottom.id);
    hash = hashLayerValue(hash, cell.bottom.state);
    animationPeriod = Math.max(animationPeriod, tileset.getCellAnimationPeriod?.(cell.top.id, cell.bottom.id) ?? 1);
  }

  const summary = { hash, animationPeriod };
  if (!cacheByTileset) {
    cacheByTileset = new WeakMap<LegacyTileset, { hash: number; animationPeriod: number }>();
    visibleLayerCellsSummaryCache.set(layer, cacheByTileset);
  }
  cacheByTileset.set(tileset, summary);
  return summary;
}

function buildLayerOverlayHash(overlays: ReadonlyArray<InteractiveGameTileOverlay>, targetZ: number): number {
  let hash = 0x81_1c_9d_c5;
  for (const overlay of overlays) {
    if (overlay.z !== targetZ) {
      continue;
    }

    hash = hashLayerValue(hash, overlay.pos);
    hash = hashLayerValue(hash, hashOverlayRenderKind(overlay.render, overlay.kind));
    hash = hashLayerValue(hash, overlay.tileId ?? 0);
    hash = hashLayerValue(hash, overlay.render?.mode === "tile" || overlay.render?.mode === "pickup-reveal" ? overlay.render.tileId : 0);
    hash = hashLayerString(hash, overlay.render?.mode === "tile" || overlay.render?.mode === "pickup-reveal" ? overlay.render.artworkSpriteId : undefined);
    hash = hashPetCarrierRender(hash, overlay.render?.mode === "tile" ? overlay.render.petCarrierRender : undefined);
    hash = hashLayerValue(hash, overlay.render?.mode === "outline" ? (overlay.render.style === "support" ? 1 : 2) : 0);
  }
  return hash >>> 0;
}

function hashOverlayRenderKind(
  render: InteractiveGameTileOverlayRender | undefined,
  fallbackKind: InteractiveGameTileOverlay["kind"],
): number {
  if (!render) {
    switch (fallbackKind) {
      case "support":
        return 1;
      case "elevator-failure":
        return 2;
      case "hidden-wall-reveal":
        return 3;
      case "blue-wall-reveal":
        return 4;
      case "push-pickup-reveal":
        return 5;
      case "portable-item-state":
        return 7;
      default:
        return 6;
    }
  }

  switch (render.mode) {
    case "outline":
      return render.style === "support" ? 1 : 2;
    case "pickup-reveal":
      return 5;
    case "tile":
      return 6;
    default:
      return 0;
  }
}

function hashPetCarrierRender(
  hash: number,
  render: InteractiveGamePetCarrierRender | undefined,
): number {
  if (!render) {
    return hashLayerValue(hash, 0);
  }

  let next = hashLayerValue(hash, render.baseTileId);
  next = hashRenderSprite(next, render.occupant);
  return next;
}

function hashRenderSprite(hash: number, visual: InteractiveGameRenderSprite | null | undefined): number {
  if (!visual) {
    return hash;
  }
  let next = hashLayerValue(hash, visual.kind === "creature" ? 1 : 2);
  next = hashLayerValue(next, visual.tileId);
  next = hashLayerString(next, visual.artworkSpriteId);
  next = hashLayerValue(next, visual.dir ?? 0);
  next = hashLayerValue(next, visual.moving ?? 0);
  next = hashLayerValue(next, visual.frame ?? 0);
  next = hashLayerValue(next, Math.round((visual.alpha ?? 1) * 1000));
  next = hashPetCarrierRender(next, visual.petCarrierRender);
  return next;
}

function hashActorDecoration(hash: number, decoration: InteractiveGameActorDecoration): number {
  let next = hashLayerValue(hash, decoration.kind === "support-marker" ? 1 : 2);
  if (decoration.kind === "support-marker") {
    next = hashLayerValue(next, decoration.floorTileId);
    next = hashLayerValue(next, decoration.showBlockWindow ? 1 : 0);
    next = hashLayerValue(next, decoration.showDirectionArrow ? 1 : 0);
    return next;
  }
  return hashLayerValue(next, decoration.tileId);
}

function buildPickupRevealOverlayTileIds(
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  targetZ: number,
  visualEnhancementsEnabled: boolean,
): Map<number, number> {
  const pickupRevealTileIds = new Map<number, number>();
  if (!visualEnhancementsEnabled) {
    return pickupRevealTileIds;
  }

  for (const overlay of overlays) {
    const render = overlay.render;
    if (overlay.z !== targetZ || render?.mode !== "pickup-reveal") {
      continue;
    }
    pickupRevealTileIds.set(overlay.pos, render.tileId);
  }

  return pickupRevealTileIds;
}

function buildRenderLayerHash(session: InteractiveGameSession, targetZ: number): number {
  const render = session.frame.render;
  if (!render) {
    return 0;
  }

  let hash = 0x81_1c_9d_c5;
  const chip = render.chip;
  if (chip && (chip.z ?? 1) === targetZ) {
    hash = hashLayerValue(hash, chip.pos);
    hash = hashLayerValue(hash, chip.dir);
    hash = hashLayerValue(hash, chip.moving);
    hash = hashLayerValue(hash, chip.pushing ? 1 : 0);
    hash = hashLayerValue(hash, chip.hidden ? 1 : 0);
    hash = hashLayerValue(hash, chip.failed ? 1 : 0);
    hash = hashLayerValue(hash, chip.endGameAnimationTileId ?? 0);
    hash = hashLayerValue(hash, chip.endGameAnimationFrame ?? 0);
    hash = hashLayerValue(hash, Math.round((chip.scale ?? 1) * 1000));
    hash = hashRenderSprite(hash, chip.visual);
  }

  for (const actor of render.actors) {
    if ((actor.z ?? 1) !== targetZ) {
      continue;
    }
    hash = hashLayerValue(hash, actor.id);
    hash = hashLayerValue(hash, actor.pos);
    hash = hashLayerValue(hash, actor.dir);
    hash = hashLayerValue(hash, actor.moving);
    hash = hashLayerValue(hash, actor.frame);
    hash = hashLayerValue(hash, actor.hidden ? 1 : 0);
    hash = hashLayerValue(hash, actor.animationReserved ? 1 : 0);
    hash = hashLayerValue(hash, Math.round((actor.scale ?? 1) * 1000));
    hash = hashRenderSprite(hash, actor.visual);
    for (const decoration of actor.decorations ?? []) {
      hash = hashActorDecoration(hash, decoration);
    }
  }

  for (const animation of render.animations) {
    if ((animation.z ?? chip?.z ?? 1) !== targetZ) {
      continue;
    }
    hash = hashLayerValue(hash, animation.pos);
    hash = hashLayerValue(hash, animation.frame);
    hash = hashLayerValue(hash, animation.tileId);
    hash = hashRenderSprite(hash, animation.visual);
  }

  return hash >>> 0;
}

function drawRenderSprite(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  visual: InteractiveGameRenderSprite | null | undefined,
  x: number,
  y: number,
  scale = 1,
): void {
  if (!visual) {
    return;
  }

  if (visual.petCarrierRender) {
    const compositeSprite = getOrCreateOccupiedPetCarrierSprite(tileset, visual.petCarrierRender, 0);
    if (compositeSprite) {
      drawLegacyRenderableSprite(context, compositeSprite, x, y, scale, visual.alpha);
      return;
    }
  }

  const artworkSprite = visual.artworkSpriteId ? tileset.getArtworkSprite?.(visual.artworkSpriteId) ?? null : null;
  if (artworkSprite) {
    const movementOffset =
      visual.kind === "creature"
        ? legacyCreatureMovementOffset(
            visual.dir ?? MS_DIRECTION.north,
            visual.moving ?? 0,
            LEGACY_TILE_SIZE,
            LEGACY_TILE_SIZE,
          )
        : { offsetX: 0, offsetY: 0 };
    drawLegacyRenderableSprite(
      context,
      artworkSprite,
      x + movementOffset.offsetX,
      y + movementOffset.offsetY,
      scale,
      visual.alpha,
    );
    return;
  }

  if (visual.kind === "tile") {
    if (typeof visual.alpha === "number" && Math.abs(visual.alpha - 1) > 0.001) {
      context.save();
      context.globalAlpha = visual.alpha;
      drawLegacyTile(context, tileset, visual.tileId, x, y);
      context.restore();
      return;
    }
    drawLegacyTile(context, tileset, visual.tileId, x, y);
    return;
  }

  drawLynxActorSprite(
    context,
    tileset,
    visual.tileId,
    visual.dir ?? MS_DIRECTION.north,
    visual.moving ?? 0,
    visual.frame ?? 0,
    x,
    y,
    scale,
  );
}

function buildPetCarrierReplacementRenders(
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  targetZ: number,
): Map<number, InteractiveGamePetCarrierRender> {
  const renders = new Map<number, InteractiveGamePetCarrierRender>();
  for (const overlay of overlays) {
    if (overlay.z !== targetZ || overlay.kind !== "portable-item-state") {
      continue;
    }

    const render = overlay.render;
    if (render?.mode !== "tile" || !render.petCarrierRender) {
      continue;
    }

    renders.set(overlay.pos, render.petCarrierRender);
  }

  return renders;
}

function drawLegacyRenderableSprite(
  context: CanvasRenderingContext2D,
  sprite: LegacyTileSprite,
  x: number,
  y: number,
  scale = 1,
  alpha: number | undefined = undefined,
): void {
  const hasAlpha = typeof alpha === "number" && Math.abs(alpha - 1) > 0.001;
  const drawX = x + sprite.offsetX;
  const drawY = y + sprite.offsetY;

  if (Math.abs(scale - 1) < 0.001) {
    if (hasAlpha) {
      context.save();
      context.globalAlpha = alpha;
      context.drawImage(sprite.image, drawX, drawY);
      context.restore();
      return;
    }

    context.drawImage(sprite.image, drawX, drawY);
    return;
  }

  context.save();
  if (hasAlpha) {
    context.globalAlpha = alpha;
  }
  context.translate(drawX + sprite.image.width / 2, drawY + sprite.image.height / 2);
  context.scale(scale, scale);
  context.drawImage(sprite.image, -sprite.image.width / 2, -sprite.image.height / 2);
  context.restore();
}

function animationFrameToken(animationPeriod: number, timerval: number): number {
  if (animationPeriod <= 1 || timerval < 0) {
    return 0;
  }
  return (timerval + 1) % animationPeriod;
}

export function buildCachedLowerLayerKey(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): string {
  const cellsSummary = buildVisibleLayerCellsSummary(tileset, layer);
  const overlayHash = buildLayerOverlayHash(session.frame.tileOverlays, layer.z);
  const renderHash = buildRenderLayerHash(session, layer.z);
  const timeToken = animationFrameToken(cellsSummary.animationPeriod, timerval);
  return `${ruleset ?? "None"}:${visualEnhancementsEnabled ? 1 : 0}:${layer.z}:${cellsSummary.hash.toString(16)}:${timeToken}:${overlayHash.toString(16)}:${renderHash.toString(16)}`;
}

export function hasCachedLowerLayerCanvas(
  cache: LegacyLayerCanvasCache,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): boolean {
  const key = buildCachedLowerLayerKey(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled);
  return peekCachedLayerCanvas(cache, key) !== null;
}

function drawLynxActorSprite(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  actorId: number,
  dir: number,
  moving: number,
  frame: number,
  x: number,
  y: number,
  scale = 1,
): void {
  if (!tileset.getCreature) {
    return;
  }

  const sprite = tileset.getCreature(actorId, dir, moving, frame);
  if (!sprite) {
    return;
  }

  const drawX = x + sprite.offsetX;
  const drawY = y + sprite.offsetY;
  if (Math.abs(scale - 1) < 0.001) {
    context.drawImage(sprite.image, drawX, drawY);
    return;
  }

  context.save();
  context.translate(drawX + sprite.image.width / 2, drawY + sprite.image.height / 2);
  context.scale(scale, scale);
  context.drawImage(sprite.image, -sprite.image.width / 2, -sprite.image.height / 2);
  context.restore();
}

function drawProjectedLynxRender(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  render: InteractiveGameRenderFrame,
  xOrigin: number,
  yOrigin: number,
  targetZ: number,
): void {
  const chip = render.chip;
  const chipZ = chip?.z ?? 1;
  if (chip && chipZ === targetZ) {
    const chipX = xOrigin + (chip.pos % 32) * LEGACY_TILE_SIZE;
    const chipY = yOrigin + Math.floor(chip.pos / 32) * LEGACY_TILE_SIZE;
    if (chip.visual) {
      drawRenderSprite(context, tileset, chip.visual, chipX, chipY, chip.scale ?? 1);
    }
  }

  const animationsByPos = new Map(render.animations.map((animation) => [animation.pos, animation] as const));
  const drawnAnimations = new Set<number>();

  for (const actor of render.actors) {
    if ((actor.z ?? 1) !== targetZ) {
      continue;
    }

    const x = xOrigin + (actor.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(actor.pos / 32) * LEGACY_TILE_SIZE;
    if (actor.hidden) {
      if (actor.animationReserved) {
        const animation = animationsByPos.get(actor.pos);
        if (animation) {
          drawRenderSprite(context, tileset, animation.visual, x, y);
          drawnAnimations.add(animation.pos);
        }
      }
      continue;
    }

    drawRenderSprite(context, tileset, actor.visual, x, y, actor.scale ?? 1);
  }

  for (const animation of render.animations) {
    if ((animation.z ?? chipZ) !== targetZ || drawnAnimations.has(animation.pos)) {
      continue;
    }
    const x = xOrigin + (animation.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(animation.pos / 32) * LEGACY_TILE_SIZE;
    drawRenderSprite(context, tileset, animation.visual, x, y);
  }
}

function visualEnhancementActorId(tileId: number): number | null {
  const staticBlockActorId = msStaticBlockActorId(tileId);
  if (staticBlockActorId !== null) {
    return staticBlockActorId;
  }
  return isMsCreature(tileId) ? msCreatureId(tileId) : null;
}

function visualEnhancementActorTileId(actorId: number, topId: number, bottomId: number): number {
  if (visualEnhancementActorId(topId) === actorId) {
    return topId;
  }
  if (visualEnhancementActorId(bottomId) === actorId) {
    return bottomId;
  }
  return actorId;
}

export function isThinWallTileId(tileId: number): boolean {
  return isThinWallTileIdFromMetadata(tileId);
}

export function visualEnhancementActorMarker(
  actorId: number,
  topId: number,
  bottomId: number,
): { floorId: number; showBlockWindow: boolean } | null {
  const decoration = projectActorSupportDecoration(actorId, topId, bottomId);
  if (!decoration || decoration.kind !== "support-marker") {
    return null;
  }

  return {
    floorId: decoration.floorTileId,
    showBlockWindow: decoration.showBlockWindow,
  };
}

export function visualEnhancementThinWallOverlayTileId(
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  topId: number,
  bottomId: number,
): number | null {
  if (
    (ruleset !== "MS" && ruleset !== "Lynx") ||
    !isMsBlockActorId(visualEnhancementActorId(topId) ?? MS_TILE.Empty) ||
    !isThinWallTileId(bottomId)
  ) {
    return null;
  }

  return bottomId;
}

export function visualEnhancementThinWallActorPassTileId(
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  actorId: number,
  topId: number,
  bottomId: number,
): number | null {
  if (ruleset !== "Lynx" || !isMsBlockActorId(actorId)) {
    return null;
  }
  const decoration = projectThinWallActorDecoration(actorId, topId, bottomId);
  return decoration?.kind === "thin-wall-overlay" ? decoration.tileId : null;
}

export function shouldUseLegacyCombinedCellSprite(
  topId: number,
  bottomId: number,
  pickupRevealTileId: number | null,
  thinWallOverlayTileId: number | null,
): boolean {
  return (
    thinWallOverlayTileId === null &&
    pickupRevealTileId === null &&
    topId !== MS_TILE.Air &&
    bottomId !== MS_TILE.Air &&
    topId !== MS_TILE.Elevator &&
    bottomId !== MS_TILE.Elevator
  );
}

export function visualEnhancementBlockWindowOpacity(squareDistanceFromCenterPx: number): number {
  const transparentHalfSize = BLOCK_SUPPORT_WINDOW_TRANSPARENT_CENTER_SIZE / 2;
  const solidStartDistance = LEGACY_TILE_SIZE / 2 - BLOCK_SUPPORT_WINDOW_SOLID_BORDER_PX;
  const clampedDistance = clamp(squareDistanceFromCenterPx, transparentHalfSize, solidStartDistance);
  return (clampedDistance - transparentHalfSize) / (solidStartDistance - transparentHalfSize);
}

function createBlockSupportWindowMask(): HTMLCanvasElement | null {
  const canvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  const imageData = context.createImageData(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const halfSize = LEGACY_TILE_SIZE / 2;

  for (let y = 0; y < LEGACY_TILE_SIZE; y += 1) {
    for (let x = 0; x < LEGACY_TILE_SIZE; x += 1) {
      const squareDistance = Math.max(Math.abs(x + 0.5 - halfSize), Math.abs(y + 0.5 - halfSize));
      const blockOpacity = visualEnhancementBlockWindowOpacity(squareDistance);
      const eraseAlpha = 1 - blockOpacity;
      const pixelIndex = (y * LEGACY_TILE_SIZE + x) * 4;
      imageData.data[pixelIndex + 3] = Math.round(eraseAlpha * 255);
    }
  }

  context.putImageData(imageData, 0, 0);
  return canvas;
}

function getOrCreateBlockSupportWindowMask(): HTMLCanvasElement | null {
  if (blockSupportWindowMaskCanvas === undefined) {
    blockSupportWindowMaskCanvas = createBlockSupportWindowMask();
  }
  return blockSupportWindowMaskCanvas;
}

function drawVisualEnhancementArrow(
  context: Pick<CanvasRenderingContext2D, "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "fillStyle">,
  dir: number,
  x: number,
  y: number,
): void {
  const centerX = x + LEGACY_TILE_SIZE / 2;
  const centerY = y + LEGACY_TILE_SIZE / 2;
  const tipInset = 4;
  const baseInset = 11;
  const halfBase = 4;

  switch (dir) {
    case MS_DIRECTION.north:
      context.beginPath();
      context.moveTo(centerX, y + tipInset);
      context.lineTo(centerX - halfBase, y + baseInset);
      context.lineTo(centerX + halfBase, y + baseInset);
      break;
    case MS_DIRECTION.south:
      context.beginPath();
      context.moveTo(centerX, y + LEGACY_TILE_SIZE - tipInset);
      context.lineTo(centerX - halfBase, y + LEGACY_TILE_SIZE - baseInset);
      context.lineTo(centerX + halfBase, y + LEGACY_TILE_SIZE - baseInset);
      break;
    case MS_DIRECTION.west:
      context.beginPath();
      context.moveTo(x + tipInset, centerY);
      context.lineTo(x + baseInset, centerY - halfBase);
      context.lineTo(x + baseInset, centerY + halfBase);
      break;
    case MS_DIRECTION.east:
      context.beginPath();
      context.moveTo(x + LEGACY_TILE_SIZE - tipInset, centerY);
      context.lineTo(x + LEGACY_TILE_SIZE - baseInset, centerY - halfBase);
      context.lineTo(x + LEGACY_TILE_SIZE - baseInset, centerY + halfBase);
      break;
    default:
      return;
  }

  context.closePath();
  context.fillStyle = VISUAL_ENHANCEMENT_ARROW_COLOR;
  context.fill();
}

function drawVisualEnhancementSupportWindow(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  actorTileId: number,
  floorId: number,
  x: number,
  y: number,
): void {
  const maskCanvas = getOrCreateBlockSupportWindowMask();
  const blockCanvas = createCanvas(LEGACY_TILE_SIZE, LEGACY_TILE_SIZE);
  const blockContext = blockCanvas.getContext("2d");
  if (!blockContext || !maskCanvas) {
    drawLegacyTile(context, tileset, floorId, x, y);
    drawLegacyTile(context, tileset, actorTileId, x, y);
    return;
  }

  drawLegacyTile(blockContext, tileset, actorTileId, 0, 0);
  blockContext.save();
  blockContext.globalCompositeOperation = "destination-out";
  blockContext.drawImage(maskCanvas, 0, 0);
  blockContext.restore();

  drawLegacyTile(context, tileset, floorId, x, y);
  context.drawImage(blockCanvas, x, y);
}

function drawActorVisualEnhancements(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  render: InteractiveGameRenderFrame | null,
  cells: ReadonlyArray<InteractiveGameVisibleLayer["cells"][number]>,
  xOrigin: number,
  yOrigin: number,
  targetZ: number,
  visualEnhancementsEnabled: boolean,
): void {
  if (!visualEnhancementsEnabled || !render) {
    return;
  }

  for (const actor of render.actors) {
    if ((actor.z ?? 1) !== targetZ || actor.hidden) {
      continue;
    }

    const cell = cells[actor.pos];
    if (!cell) {
      continue;
    }

    const x = xOrigin + (actor.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(actor.pos / 32) * LEGACY_TILE_SIZE;
    for (const decoration of actor.decorations ?? []) {
      if (decoration.kind === "thin-wall-overlay") {
        const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, decoration.tileId);
        if (overlaySprite) {
          drawLegacySpriteImage(context, overlaySprite, x, y);
        }
        continue;
      }

      if (decoration.showBlockWindow) {
        drawVisualEnhancementSupportWindow(
          context,
          tileset,
          visualEnhancementActorTileId(actor.id, cell.top.id, cell.bottom.id),
          decoration.floorTileId,
          x,
          y,
        );
      }
      if (decoration.showDirectionArrow) {
        drawVisualEnhancementArrow(context, actor.dir, x, y);
      }
    }
  }
}

function drawCompositedCell(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  topId: number,
  topState: number,
  bottomId: number,
  bottomState: number,
  timerval: number,
  x: number,
  y: number,
  visualEnhancementsEnabled: boolean,
  pickupRevealTileId: number | null,
  petCarrierRender: InteractiveGamePetCarrierRender | null,
): void {
  if (petCarrierRender) {
    const compositeSprite = getOrCreateOccupiedPetCarrierSprite(tileset, petCarrierRender, timerval);
    if (compositeSprite) {
      context.drawImage(compositeSprite.image, x + compositeSprite.offsetX, y + compositeSprite.offsetY);
      return;
    }
  }

  const topTrapOpen =
    visualEnhancementsEnabled &&
    topId === MS_TILE.Beartrap &&
    (((topState & MS_FLOOR_STATE.TrapOpen) !== 0) || ((topState & LYNX_CELL_FLAG.TrapOpen) !== 0));
  const bottomTrapOpen =
    visualEnhancementsEnabled &&
    bottomId === MS_TILE.Beartrap &&
    (((bottomState & MS_FLOOR_STATE.TrapOpen) !== 0) || ((bottomState & LYNX_CELL_FLAG.TrapOpen) !== 0));
  const thinWallOverlayTileId = visualEnhancementThinWallOverlayTileId(ruleset, topId, bottomId);

  if (topTrapOpen || bottomTrapOpen) {
    const heldTrapSprite = getOrCreateHeldTrapSprite(tileset);
    if (heldTrapSprite) {
      drawLegacySpriteImage(context, heldTrapSprite, x, y);
    } else {
      drawLegacyTile(context, tileset, MS_TILE.Empty, x, y);
      context.save();
      context.globalAlpha = 0.5;
      drawLegacyTile(context, tileset, MS_TILE.Beartrap, x, y);
      context.restore();
    }

    if (bottomTrapOpen && topId !== MS_TILE.Air && topId !== MS_TILE.Nothing && topId !== MS_TILE.Empty) {
      drawLegacyTile(context, tileset, topId, x, y);
    }
    return;
  }

  if (
    shouldUseLegacyCombinedCellSprite(topId, bottomId, pickupRevealTileId, thinWallOverlayTileId) &&
    tileset.getCell
  ) {
    const sprite = tileset.getCell(topId, bottomId, timerval);
    if (sprite) {
      context.drawImage(sprite.image, x + sprite.offsetX, y + sprite.offsetY);
      return;
    }
  }

  const top = topId || MS_TILE.Empty;
  const bottom = bottomId || MS_TILE.Empty;
  const topSprite = tileset.get(top);
  const bottomSprite = tileset.get(bottom);
  const topTransparent = top === MS_TILE.Air || top === MS_TILE.Nothing || topSprite?.transparent === true;
  const bottomTransparent =
    bottom === MS_TILE.Air || bottom === MS_TILE.Nothing || bottomSprite?.transparent === true;

  if (top === MS_TILE.Air && (bottom === MS_TILE.Air || bottom === MS_TILE.Empty || bottom === MS_TILE.Nothing)) {
    return;
  }
  if (top === MS_TILE.Empty && bottom === MS_TILE.Air) {
    return;
  }

  if (!topSprite) {
    drawLegacyTile(context, tileset, bottom, x, y);
    if (pickupRevealTileId !== null) {
      drawLegacyTile(context, tileset, pickupRevealTileId, x, y);
    }
    return;
  }

  if (!topTransparent && pickupRevealTileId === null) {
    drawLegacyTile(context, tileset, top, x, y);
    if (thinWallOverlayTileId !== null) {
      const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, thinWallOverlayTileId);
      if (overlaySprite) {
        drawLegacySpriteImage(context, overlaySprite, x, y);
      }
    }
    return;
  }

  if (bottom === MS_TILE.Nothing || bottom === MS_TILE.Air) {
    if (pickupRevealTileId !== null) {
      drawLegacyTile(context, tileset, pickupRevealTileId, x, y);
    }
    drawLegacyTile(context, tileset, top, x, y);
    return;
  }

  if (bottom === MS_TILE.Empty) {
    drawLegacyTile(context, tileset, MS_TILE.Empty, x, y);
  } else if (bottomTransparent) {
    if (bottomSprite?.preserveLayerTransparency !== true) {
      drawLegacyTile(context, tileset, MS_TILE.Empty, x, y);
    }
    drawLegacyTile(context, tileset, bottom, x, y);
  } else {
    drawLegacyTile(context, tileset, bottom, x, y);
  }

  if (pickupRevealTileId !== null) {
    drawLegacyTile(context, tileset, pickupRevealTileId, x, y);
  }
  drawLegacyTile(context, tileset, top, x, y);
  if (thinWallOverlayTileId !== null) {
    const overlaySprite = getOrCreateThinWallOverlaySprite(tileset, thinWallOverlayTileId);
    if (overlaySprite) {
      drawLegacySpriteImage(context, overlaySprite, x, y);
    }
  }
}

function drawLayerOverlays(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  overlays: ReadonlyArray<InteractiveGameTileOverlay>,
  layerZ: number,
  xOrigin: number,
  yOrigin: number,
  canvasWidth: number,
  canvasHeight: number,
  visualEnhancementsEnabled: boolean,
): void {
  for (const overlay of overlays) {
    if (overlay.z !== layerZ) {
      continue;
    }

    const x = xOrigin + (overlay.pos % 32) * LEGACY_TILE_SIZE;
    const y = yOrigin + Math.floor(overlay.pos / 32) * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= 0 || x >= canvasWidth || y + LEGACY_TILE_SIZE <= 0 || y >= canvasHeight) {
      continue;
    }

    const render = overlay.render;
    if (!render) {
      continue;
    }

    if (render.mode === "pickup-reveal") {
      continue;
    }

    if (render.mode === "tile") {
      if (overlay.kind === "portable-item-state" && render.petCarrierRender) {
        continue;
      }
      if (render.visualEnhancementOnly && !visualEnhancementsEnabled) {
        continue;
      }
      drawRenderSprite(
        context,
        tileset,
        {
          kind: "tile",
          tileId: render.tileId,
          artworkSpriteId: render.artworkSpriteId,
          alpha: render.alpha,
          petCarrierRender: render.petCarrierRender,
        },
        x,
        y,
      );
      continue;
    }

    context.strokeStyle = render.style === "support" ? SUPPORT_BORDER_COLOR : ELEVATOR_FAILURE_BORDER_COLOR;
    context.lineWidth = 3;
    context.strokeRect(x + 1.5, y + 1.5, LEGACY_TILE_SIZE - 3, LEGACY_TILE_SIZE - 3);
  }
}

function layerViewportTileWindow(depth: number): number {
  if (depth <= 0) {
    return LEGACY_MAP_TILES;
  }
  return Math.ceil(LEGACY_MAP_TILES / (LOWER_LAYER_SCALE ** depth));
}

export function withLegacyMapViewportClip(
  context: Pick<CanvasRenderingContext2D, "save" | "beginPath" | "rect" | "clip" | "restore">,
  draw: () => void,
): void {
  context.save();
  context.beginPath();
  context.rect(LEGACY_MAP_X, LEGACY_MAP_Y, LEGACY_MAP_WIDTH, LEGACY_MAP_HEIGHT);
  context.clip();

  try {
    draw();
  } finally {
    context.restore();
  }
}

function renderMapLayerCanvas(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  viewX: number,
  viewY: number,
  depth: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const tileWindowSize = layerViewportTileWindow(depth);
  const canvas = createCanvas(tileWindowSize * LEGACY_TILE_SIZE, tileWindowSize * LEGACY_TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  const padding = ((tileWindowSize - LEGACY_MAP_TILES) * LEGACY_TILE_SIZE) / 2;
  const xOrigin = padding - (viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = padding - (viewY * LEGACY_TILE_SIZE) / 4;
  const pickupRevealTileIds = buildPickupRevealOverlayTileIds(
    session.frame.tileOverlays,
    layer.z,
    visualEnhancementsEnabled,
  );
  const petCarrierRenders = buildPetCarrierReplacementRenders(session.frame.tileOverlays, layer.z);

  for (const cell of layer.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    if (x + LEGACY_TILE_SIZE <= 0 || x >= canvas.width || y + LEGACY_TILE_SIZE <= 0 || y >= canvas.height) {
      continue;
    }

    drawCompositedCell(
      context,
      tileset,
      ruleset,
      cell.top.id,
      cell.top.state,
      cell.bottom.id,
      cell.bottom.state,
      timerval,
      x,
      y,
      visualEnhancementsEnabled,
      pickupRevealTileIds.get(cell.position.pos) ?? null,
      petCarrierRenders.get(cell.position.pos) ?? null,
    );
  }

  if (ruleset === "Lynx" && session.frame.render) {
    drawProjectedLynxRender(context, tileset, session.frame.render, xOrigin, yOrigin, layer.z);
  }

  drawActorVisualEnhancements(
    context,
    tileset,
    ruleset,
    session.frame.render,
    layer.cells,
    xOrigin,
    yOrigin,
    layer.z,
    visualEnhancementsEnabled,
  );
  drawLayerOverlays(
    context,
    tileset,
    session.frame.tileOverlays,
    layer.z,
    xOrigin,
    yOrigin,
    canvas.width,
    canvas.height,
    visualEnhancementsEnabled,
  );
  return canvas;
}

function renderCachedLowerLayerCanvas(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const canvas = createCanvas(LAYER_CANVAS_BOARD_SIZE, LAYER_CANVAS_BOARD_SIZE);
  const context = canvas.getContext("2d");
  if (!context) {
    return canvas;
  }

  context.imageSmoothingEnabled = false;
  const xOrigin = LAYER_CANVAS_PADDING_PX;
  const yOrigin = LAYER_CANVAS_PADDING_PX;
  const pickupRevealTileIds = buildPickupRevealOverlayTileIds(
    session.frame.tileOverlays,
    layer.z,
    visualEnhancementsEnabled,
  );
  const petCarrierRenders = buildPetCarrierReplacementRenders(session.frame.tileOverlays, layer.z);

  for (const cell of layer.cells) {
    const x = xOrigin + cell.position.x * LEGACY_TILE_SIZE;
    const y = yOrigin + cell.position.y * LEGACY_TILE_SIZE;
    drawCompositedCell(
      context,
      tileset,
      ruleset,
      cell.top.id,
      cell.top.state,
      cell.bottom.id,
      cell.bottom.state,
      timerval,
      x,
      y,
      visualEnhancementsEnabled,
      pickupRevealTileIds.get(cell.position.pos) ?? null,
      petCarrierRenders.get(cell.position.pos) ?? null,
    );
  }

  if (ruleset === "Lynx" && session.frame.render) {
    drawProjectedLynxRender(context, tileset, session.frame.render, xOrigin, yOrigin, layer.z);
  }

  drawActorVisualEnhancements(
    context,
    tileset,
    ruleset,
    session.frame.render,
    layer.cells,
    xOrigin,
    yOrigin,
    layer.z,
    visualEnhancementsEnabled,
  );
  drawLayerOverlays(
    context,
    tileset,
    session.frame.tileOverlays,
    layer.z,
    xOrigin,
    yOrigin,
    canvas.width,
    canvas.height,
    visualEnhancementsEnabled,
  );
  return canvas;
}

function getOrRenderCachedLowerLayerCanvas(
  cache: LegacyLayerCanvasCache,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement {
  const key = buildCachedLowerLayerKey(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled);
  const cached = getCachedLayerCanvas(cache, key);
  if (cached) {
    return cached;
  }

  return storeCachedLayerCanvas(
    cache,
    key,
    renderCachedLowerLayerCanvas(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled),
  );
}

function getCachedLowerLayerCanvasIfReady(
  cache: LegacyLayerCanvasCache,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  layer: InteractiveGameVisibleLayer,
  timerval: number,
  visualEnhancementsEnabled: boolean,
): HTMLCanvasElement | null {
  const key = buildCachedLowerLayerKey(tileset, session, ruleset, layer, timerval, visualEnhancementsEnabled);
  return getCachedLayerCanvas(cache, key);
}

export function drawVisibleLayerStack(
  context: CanvasRenderingContext2D,
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  timerval: number,
  viewX: number,
  viewY: number,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  const visibleLayers = session.frame.visibleLayers;
  if (visibleLayers.length === 0) {
    return;
  }

  const topLayerCanvas = renderMapLayerCanvas(
    tileset,
    session,
    ruleset,
    visibleLayers[0]!,
    timerval,
    viewX,
    viewY,
    0,
    visualEnhancementsEnabled,
  );

  withLegacyMapViewportClip(context, () => {
    for (let index = visibleLayers.length - 1; index >= 1; index -= 1) {
      const layer = visibleLayers[index]!;
      const cachedLayerCanvas = getCachedLowerLayerCanvasIfReady(
        lowerLayerCache,
        tileset,
        session,
        ruleset,
        layer,
        timerval,
        visualEnhancementsEnabled,
      );
      const scale = LOWER_LAYER_SCALE ** index;
      const brightness = Math.max(0, 1 - index * LOWER_LAYER_DARKEN_PER_DEPTH);
      const tileWindowSize = layerViewportTileWindow(index);
      const sourceSize = tileWindowSize * LEGACY_TILE_SIZE;
      const layerPadding = ((tileWindowSize - LEGACY_MAP_TILES) * LEGACY_TILE_SIZE) / 2;
      const sourceX = LAYER_CANVAS_PADDING_PX + (viewX * LEGACY_TILE_SIZE) / 4 - layerPadding;
      const sourceY = LAYER_CANVAS_PADDING_PX + (viewY * LEGACY_TILE_SIZE) / 4 - layerPadding;
      const width = sourceSize * scale;
      const height = sourceSize * scale;
      const x = LEGACY_MAP_X + (LEGACY_MAP_WIDTH - width) / 2;
      const y = LEGACY_MAP_Y + (LEGACY_MAP_HEIGHT - height) / 2;

      context.save();
      context.filter = `blur(${LOWER_LAYER_BLUR_PX}px) brightness(${brightness})`;
      if (cachedLayerCanvas) {
        context.drawImage(cachedLayerCanvas, sourceX, sourceY, sourceSize, sourceSize, x, y, width, height);
      } else {
        const transientLayerCanvas = renderMapLayerCanvas(
          tileset,
          session,
          ruleset,
          layer,
          timerval,
          viewX,
          viewY,
          index,
          visualEnhancementsEnabled,
        );
        context.drawImage(transientLayerCanvas, x, y, width, height);
      }
      context.restore();
    }

    context.drawImage(topLayerCanvas, LEGACY_MAP_X, LEGACY_MAP_Y);
  });
}

function collectInitialWarmupTimervals(session: InteractiveGameSession): number[] {
  const snapshot = session.frame.snapshot;
  const timerval = (snapshot.statusFlags & MS_STATUS_FLAG.NoAnimation) !== 0 ? -1 : snapshot.currentTime;
  const values = new Set<number>();
  values.add(timerval);

  const start = Math.max(timerval, -1);
  for (let offset = 0; offset <= INITIAL_RENDER_PREWARM_TICK_COUNT; offset += 1) {
    values.add(start + offset);
  }

  return [...values];
}

export interface LegacyVisibleLayerCacheWarmupTask {
  layerIndex: number;
  layerZ: number;
  timerval: number;
}

export function collectVisibleLayerCacheWarmupTasks(
  session: InteractiveGameSession,
): LegacyVisibleLayerCacheWarmupTask[] {
  const visibleLayers = session.frame.visibleLayers;
  if (visibleLayers.length <= 1) {
    return [];
  }

  const tasks: LegacyVisibleLayerCacheWarmupTask[] = [];
  for (const timerval of collectInitialWarmupTimervals(session)) {
    for (let layerIndex = visibleLayers.length - 1; layerIndex >= 1; layerIndex -= 1) {
      const layer = visibleLayers[layerIndex];
      if (!layer) {
        continue;
      }

      tasks.push({
        layerIndex,
        layerZ: layer.z,
        timerval,
      });
    }
  }
  return tasks;
}

export function prewarmVisibleLayerCacheTask(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  lowerLayerCache: LegacyLayerCanvasCache,
  task: LegacyVisibleLayerCacheWarmupTask,
  visualEnhancementsEnabled: boolean,
): void {
  const layer = session.frame.visibleLayers[task.layerIndex];
  if (!layer || task.layerIndex === 0 || layer.z !== task.layerZ) {
    return;
  }

  getOrRenderCachedLowerLayerCanvas(
    lowerLayerCache,
    tileset,
    session,
    ruleset,
    layer,
    task.timerval,
    visualEnhancementsEnabled,
  );
}

export function prewarmVisibleLayerCaches(
  tileset: LegacyTileset,
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  lowerLayerCache: LegacyLayerCanvasCache,
  visualEnhancementsEnabled: boolean,
): void {
  for (const task of collectVisibleLayerCacheWarmupTasks(session)) {
    prewarmVisibleLayerCacheTask(
      tileset,
      session,
      ruleset,
      lowerLayerCache,
      task,
      visualEnhancementsEnabled,
    );
  }
}

function renderedLynxViewFromChip(
  chip: InteractiveGameRenderFrame["chip"],
): { x: number; y: number } | null {
  if (!chip || !chip.failed || chip.hidden || chip.moving <= 0) {
    return null;
  }

  let x = (chip.pos % 32) * 8;
  let y = Math.floor(chip.pos / 32) * 8;

  switch (chip.dir) {
    case MS_DIRECTION.north:
      y += chip.moving;
      break;
    case MS_DIRECTION.east:
      x += chip.moving;
      break;
    case MS_DIRECTION.south:
      y -= chip.moving;
      break;
    case MS_DIRECTION.west:
      x -= chip.moving;
      break;
    default:
      break;
  }

  return { x, y };
}

export function resolveLegacyMapViewport(
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
): { viewX: number; viewY: number } {
  const renderView = ruleset === "Lynx" ? renderedLynxViewFromChip(session.frame.render?.chip) : null;
  const sourceView = renderView ?? session.frame.snapshot.view;
  return {
    viewX: clamp(sourceView.x / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4),
    viewY: clamp(sourceView.y / 2 - (Math.floor(LEGACY_MAP_TILES / 2) * 4), 0, (32 - LEGACY_MAP_TILES) * 4),
  };
}

export function mapPositionAtCanvasPoint(
  session: InteractiveGameSession,
  ruleset: SeriesCatalogEntry["ruleset"] | null,
  canvasX: number,
  canvasY: number,
): number | null {
  if (
    canvasX < LEGACY_MAP_X ||
    canvasY < LEGACY_MAP_Y ||
    canvasX >= LEGACY_MAP_X + LEGACY_MAP_WIDTH ||
    canvasY >= LEGACY_MAP_Y + LEGACY_MAP_HEIGHT
  ) {
    return null;
  }

  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset);
  const xOrigin = LEGACY_MAP_X - (viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = LEGACY_MAP_Y - (viewY * LEGACY_TILE_SIZE) / 4;
  const tileX = Math.floor((canvasX - xOrigin) / LEGACY_TILE_SIZE);
  const tileY = Math.floor((canvasY - yOrigin) / LEGACY_TILE_SIZE);

  if (tileX < 0 || tileX >= 32 || tileY < 0 || tileY >= 32) {
    return null;
  }

  return tileY * 32 + tileX;
}

function buildInventoryRenderHash(inventoryRender: InteractiveGameInventoryRender | undefined): number {
  if (!inventoryRender?.tools?.length) {
    return 0;
  }

  let hash = 0x81_1c_9d_c5;
  for (const render of inventoryRender.tools) {
    hash = hashLayerValue(hash, hashOverlayRenderKind(render ?? undefined, "carried-tool"));
    hash = hashLayerValue(hash, render?.mode === "tile" ? render.tileId : 0);
    hash = hashLayerString(hash, render?.mode === "tile" ? render.artworkSpriteId : undefined);
    hash = hashPetCarrierRender(hash, render?.mode === "tile" ? render.petCarrierRender : undefined);
  }
  return hash >>> 0;
}

export function buildLegacyGameDrawStateKey(
  session: InteractiveGameSession | null,
  currentSeries: SeriesCatalogEntry | null,
  currentLevel: SeriesLevel | null,
  currentRuleset: SeriesCatalogEntry["ruleset"] | null,
  isLoading: boolean,
  message: string | null,
  presentation: "legacy" | "map-only",
  hasTileset: boolean,
  visualEnhancementsEnabled: boolean,
): string {
  if (!hasTileset) {
    return `no-tileset:${presentation}:${visualEnhancementsEnabled ? 1 : 0}:${isLoading ? 1 : 0}:${message ?? ""}:${currentSeries?.filebase ?? ""}:${currentLevel?.number ?? 0}:${currentRuleset ?? "None"}`;
  }

  if (!session) {
    return `no-session:${presentation}:${visualEnhancementsEnabled ? 1 : 0}:${isLoading ? 1 : 0}:${message ?? ""}:${currentSeries?.filebase ?? ""}:${currentLevel?.number ?? 0}:${currentRuleset ?? "None"}`;
  }

  const snapshot = session.frame.snapshot;
  const visibleLayerKeys = session.frame.visibleLayers
    .map((layer) => {
      const cellsSummary = buildVisibleLayerCellsSummary(
        STATIC_HASH_TILESET,
        layer,
      );
      return [
        layer.z,
        cellsSummary.hash,
        buildLayerOverlayHash(session.frame.tileOverlays, layer.z),
        buildRenderLayerHash(session, layer.z),
      ].join(",");
    })
    .join("|");
  const inventoryRenderHash = buildInventoryRenderHash(session.frame.inventoryRender);
  return [
    presentation,
    session.request.seriesFile,
    session.request.levelNumber,
    session.request.ruleset,
    snapshot.tick,
    snapshot.currentTime,
    snapshot.status,
    snapshot.statusFlags,
    inventoryRenderHash,
    snapshot.view.x,
    snapshot.view.y,
    session.history.currentTick,
    session.history.restoreMode,
    session.frame.currentZ,
    session.frame.visibleLayers.length,
    session.frame.tileOverlays.length,
    snapshot.chipsNeeded,
    visualEnhancementsEnabled ? 1 : 0,
    message ?? "",
    isLoading ? 1 : 0,
    visibleLayerKeys,
  ].join(":");
}
