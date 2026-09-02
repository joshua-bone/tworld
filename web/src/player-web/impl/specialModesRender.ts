import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  LEGACY_TILE_SIZE,
} from "@player-web/impl/legacySprites";
import { resolveLegacyMapViewport } from "@player-web/impl/legacyCanvasMapRenderer";
import { drawLegacySpriteImage } from "@player-web/impl/legacyCanvasShared";
import { getOrCreateThinWallOverlaySprite } from "@player-web/impl/legacyCanvasTileset";
import type { LegacyTileset, LegacyTileSprite } from "@player-web/impl/legacyTileset";
import { legacyCreatureMovementOffset } from "@player-web/impl/legacyTileset";
import {
  buildMonsterMadnessFamilyMap,
  isMonsterMadnessMonsterActorId,
  remapMonsterMadnessActorId,
  remapMonsterMadnessTileId,
} from "@player-web/impl/monsterMadness";
import type {
  BrowserSpecialModesSettings,
  DihedralOrientation,
} from "@player-web/impl/specialModesSettings";
import {
  cellArtworkNormalizationProgress,
  inverseDihedralOrientation,
  interpolateDihedralMatrix,
  DIHEDRAL_MATRICES,
  relativeDihedralOrientation,
  type DihedralMatrix,
  transformDirection,
} from "@player-web/impl/specialModesTransform";
import type { SpecialModesRuntimeSnapshot } from "@player-web/impl/useSpecialModesRuntime";
import {
  sessionSpecialModesLineOfSightProjection,
  type SpecialModesLineOfSightProjection,
} from "@player-web/impl/specialModesVisibility";
import {
  isMsCreature,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
  MS_DIRECTION,
  MS_TILE,
} from "@ruleset-ms/api/tiles";

const FOG_BRIGHTNESS_PERCENT = 25;
export const FLASHLIGHT_DIRECTION_TRANSITION_MS = 200;
export const MONSTER_RIPPLE_PERIOD_MS = 4_000;
export const MONSTER_RIPPLE_MAX_RADIUS_TILES = 5;
export const MONSTER_RIPPLE_RING_COUNT = 12;
const MONSTER_RIPPLE_BASE_ALPHA = 0.2;
const LOWER_LAYER_SCALE = 0.9;
const spotlightLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const monsterRevealLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const monsterRippleLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const monsterRippleStates = new WeakMap<HTMLCanvasElement, MonsterRippleCanvasState>();
interface FlashlightDirectionTransition {
  sessionHandle: InteractiveGameSession["handle"];
  direction: number;
  fromAngle: number;
  toAngle: number;
  startedAtMs: number;
  settled: boolean;
}
const flashlightDirectionTransitions = new WeakMap<
  HTMLCanvasElement,
  FlashlightDirectionTransition
>();
const lineOfSightCache = new WeakMap<
  InteractiveGameSession,
  {
    ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null;
    projection: SpecialModesLineOfSightProjection;
  }
>();
const counterTransformedSprites = new WeakMap<
  HTMLCanvasElement,
  Map<string, LegacyTileSprite>
>();

export function createMonsterMadnessTileset(
  tileset: LegacyTileset,
  settings: BrowserSpecialModesSettings["monsterMadness"],
): LegacyTileset {
  if (!settings.enabled) {
    return tileset;
  }

  const familyMap = buildMonsterMadnessFamilyMap(settings.seed, settings.includePlayer);
  return {
    get: (tileId) => tileset.get(remapMonsterMadnessTileId(tileId, familyMap)),
    getArtworkSprite: tileset.getArtworkSprite?.bind(tileset),
    getCell: tileset.getCell
      ? (topId, bottomId, timerval) => tileset.getCell!(
          remapMonsterMadnessTileId(topId, familyMap),
          remapMonsterMadnessTileId(bottomId, familyMap),
          timerval,
        )
      : undefined,
    getCreature: tileset.getCreature
      ? (id, dir, moving, frame) => tileset.getCreature!(
          remapMonsterMadnessActorId(id, familyMap),
          dir,
          moving,
          frame,
        )
      : undefined,
    getCellAnimationPeriod: tileset.getCellAnimationPeriod
      ? (topId, bottomId) => tileset.getCellAnimationPeriod!(
          remapMonsterMadnessTileId(topId, familyMap),
          remapMonsterMadnessTileId(bottomId, familyMap),
        )
      : undefined,
  };
}

const FORCE_FLOOR_BY_DIRECTION = new Map<number, number>([
  [MS_DIRECTION.north, MS_TILE.Slide_North],
  [MS_DIRECTION.west, MS_TILE.Slide_West],
  [MS_DIRECTION.south, MS_TILE.Slide_South],
  [MS_DIRECTION.east, MS_TILE.Slide_East],
]);

const THIN_WALL_BY_DIRECTION = new Map<number, number>([
  [MS_DIRECTION.north, MS_TILE.Wall_North],
  [MS_DIRECTION.west, MS_TILE.Wall_West],
  [MS_DIRECTION.south, MS_TILE.Wall_South],
  [MS_DIRECTION.east, MS_TILE.Wall_East],
]);

function thinWallDirectionMask(tileId: number): number {
  if (tileId === MS_TILE.Wall_North) return MS_DIRECTION.north;
  if (tileId === MS_TILE.Wall_West) return MS_DIRECTION.west;
  if (tileId === MS_TILE.Wall_South) return MS_DIRECTION.south;
  if (tileId === MS_TILE.Wall_East) return MS_DIRECTION.east;
  if (tileId === MS_TILE.Wall_Southeast) return MS_DIRECTION.south | MS_DIRECTION.east;
  return MS_DIRECTION.none;
}

export function visibleThinWallOverlayTileId(
  tileId: number,
  visibleEdgeMask: number,
): number | null {
  const visibleTileEdges = thinWallDirectionMask(tileId) & visibleEdgeMask;
  if (visibleTileEdges === (MS_DIRECTION.south | MS_DIRECTION.east)) {
    return MS_TILE.Wall_Southeast;
  }
  return THIN_WALL_BY_DIRECTION.get(visibleTileEdges) ?? null;
}

const ICE_CORNER_DIRECTIONS = new Map<number, readonly [number, number]>([
  [MS_TILE.IceWall_Northwest, [MS_DIRECTION.north, MS_DIRECTION.west]],
  [MS_TILE.IceWall_Northeast, [MS_DIRECTION.north, MS_DIRECTION.east]],
  [MS_TILE.IceWall_Southwest, [MS_DIRECTION.south, MS_DIRECTION.west]],
  [MS_TILE.IceWall_Southeast, [MS_DIRECTION.south, MS_DIRECTION.east]],
]);

function iceCornerForDirections(left: number, right: number): number {
  const mask = left | right;
  if (mask === (MS_DIRECTION.north | MS_DIRECTION.west)) return MS_TILE.IceWall_Northwest;
  if (mask === (MS_DIRECTION.north | MS_DIRECTION.east)) return MS_TILE.IceWall_Northeast;
  if (mask === (MS_DIRECTION.south | MS_DIRECTION.west)) return MS_TILE.IceWall_Southwest;
  if (mask === (MS_DIRECTION.south | MS_DIRECTION.east)) return MS_TILE.IceWall_Southeast;
  return MS_TILE.Ice;
}

export function remapDihedralArtworkTileId(
  tileId: number,
  orientation: DihedralOrientation,
): number {
  if (isMsCreature(tileId)) {
    return msCreatureTile(
      msCreatureId(tileId),
      transformDirection(msCreatureDir(tileId), orientation),
    );
  }
  const forceDirection = tileId === MS_TILE.Slide_North
    ? MS_DIRECTION.north
    : tileId === MS_TILE.Slide_West
      ? MS_DIRECTION.west
      : tileId === MS_TILE.Slide_South
        ? MS_DIRECTION.south
        : tileId === MS_TILE.Slide_East
          ? MS_DIRECTION.east
          : MS_DIRECTION.none;
  if (forceDirection !== MS_DIRECTION.none) {
    return FORCE_FLOOR_BY_DIRECTION.get(transformDirection(forceDirection, orientation)) ?? tileId;
  }
  const thinWallDirection = tileId === MS_TILE.Wall_North
    ? MS_DIRECTION.north
    : tileId === MS_TILE.Wall_West
      ? MS_DIRECTION.west
      : tileId === MS_TILE.Wall_South
        ? MS_DIRECTION.south
        : tileId === MS_TILE.Wall_East
          ? MS_DIRECTION.east
          : MS_DIRECTION.none;
  if (thinWallDirection !== MS_DIRECTION.none) {
    return THIN_WALL_BY_DIRECTION.get(transformDirection(thinWallDirection, orientation)) ?? tileId;
  }
  const corner = ICE_CORNER_DIRECTIONS.get(tileId);
  if (corner) {
    return iceCornerForDirections(
      transformDirection(corner[0], orientation),
      transformDirection(corner[1], orientation),
    );
  }
  return tileId;
}

export function createDihedralArtworkTileset(
  tileset: LegacyTileset,
  orientation: DihedralOrientation,
): LegacyTileset {
  if (orientation === "identity") {
    return tileset;
  }
  const tileId = (id: number) => remapDihedralArtworkTileId(id, orientation);
  const sprite = (value: LegacyTileSprite | null): LegacyTileSprite | null =>
    value ? counterTransformArtworkSprite(value, orientation) : null;
  return {
    get: (id) => sprite(tileset.get(tileId(id))),
    getArtworkSprite: tileset.getArtworkSprite
      ? (spriteId) => sprite(tileset.getArtworkSprite!(spriteId))
      : undefined,
    getCell: tileset.getCell
      ? (topId, bottomId, timerval) => sprite(
          tileset.getCell!(tileId(topId), tileId(bottomId), timerval),
        )
      : undefined,
    getCreature: tileset.getCreature
      ? (id, dir, moving, frame) => sprite(
          tileset.getCreature!(
            id,
            transformDirection(dir, orientation),
            moving,
            frame,
          ),
        )
      : undefined,
    getCellAnimationPeriod: tileset.getCellAnimationPeriod
      ? (topId, bottomId) => tileset.getCellAnimationPeriod!(tileId(topId), tileId(bottomId))
      : undefined,
  };
}

function counterTransformArtworkSprite(
  sprite: LegacyTileSprite,
  orientation: DihedralOrientation,
): LegacyTileSprite {
  if (orientation === "identity") {
    return sprite;
  }
  const cacheKey = [
    orientation,
    sprite.offsetX,
    sprite.offsetY,
    sprite.transparent ? 1 : 0,
    sprite.preserveLayerTransparency ? 1 : 0,
  ].join(":");
  const cached = counterTransformedSprites.get(sprite.image)?.get(cacheKey);
  if (cached) {
    return cached;
  }

  const matrix = DIHEDRAL_MATRICES[inverseDihedralOrientation(orientation)];
  const corners = [
    { x: sprite.offsetX, y: sprite.offsetY },
    { x: sprite.offsetX + sprite.image.width, y: sprite.offsetY },
    { x: sprite.offsetX, y: sprite.offsetY + sprite.image.height },
    { x: sprite.offsetX + sprite.image.width, y: sprite.offsetY + sprite.image.height },
  ].map(({ x, y }) => {
    const centeredX = x - LEGACY_TILE_SIZE / 2;
    const centeredY = y - LEGACY_TILE_SIZE / 2;
    return {
      x: matrix.a * centeredX + matrix.c * centeredY,
      y: matrix.b * centeredX + matrix.d * centeredY,
    };
  });
  const minX = Math.min(...corners.map(({ x }) => x));
  const minY = Math.min(...corners.map(({ y }) => y));
  const maxX = Math.max(...corners.map(({ x }) => x));
  const maxY = Math.max(...corners.map(({ y }) => y));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(maxX - minX));
  canvas.height = Math.max(1, Math.round(maxY - minY));
  const context = canvas.getContext("2d");
  if (!context) {
    return sprite;
  }
  context.imageSmoothingEnabled = false;
  context.translate(-minX, -minY);
  context.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
  context.drawImage(
    sprite.image,
    sprite.offsetX - LEGACY_TILE_SIZE / 2,
    sprite.offsetY - LEGACY_TILE_SIZE / 2,
  );
  const transformed: LegacyTileSprite = {
    ...sprite,
    image: canvas,
    offsetX: minX + LEGACY_TILE_SIZE / 2,
    offsetY: minY + LEGACY_TILE_SIZE / 2,
  };
  const byOrientation = counterTransformedSprites.get(sprite.image) ?? new Map();
  byOrientation.set(cacheKey, transformed);
  counterTransformedSprites.set(sprite.image, byOrientation);
  return transformed;
}

function hideMonsterCell(cell: InteractiveGameSession["frame"]["cells"][number]) {
  const topIsMonster = isMonsterMadnessMonsterActorId(cell.top.id);
  const bottomIsMonster = isMonsterMadnessMonsterActorId(cell.bottom.id);
  if (!topIsMonster && !bottomIsMonster) {
    return cell;
  }

  if (topIsMonster) {
    return {
      ...cell,
      top: bottomIsMonster ? { id: MS_TILE.Empty, state: 0 } : cell.bottom,
      bottom: { id: MS_TILE.Empty, state: 0 },
    };
  }
  return {
    ...cell,
    bottom: { id: MS_TILE.Empty, state: 0 },
  };
}

export function sessionWithoutMonsterArtwork(
  session: InteractiveGameSession,
): InteractiveGameSession {
  return {
    ...session,
    frame: {
      ...session.frame,
      cells: session.frame.cells.map(hideMonsterCell),
      visibleLayers: session.frame.visibleLayers.map((layer) => ({
        ...layer,
        cells: layer.cells.map(hideMonsterCell),
      })),
      render: session.frame.render
        ? {
            ...session.frame.render,
            actors: session.frame.render.actors.filter((actor) => !isMonsterMadnessMonsterActorId(actor.id)),
          }
        : null,
    },
  };
}

function chipCanvasPosition(
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  viewportTileCount: number,
): { x: number; y: number; dir: number } {
  const renderChip = session.frame.render?.chip;
  const snapshotChip = session.frame.snapshot.chip;
  const pos = renderChip?.pos ?? snapshotChip?.position.pos ?? 0;
  const dir = renderChip?.dir ?? (() => {
    switch (snapshotChip?.dir) {
      case "north": return MS_DIRECTION.north;
      case "west": return MS_DIRECTION.west;
      case "south": return MS_DIRECTION.south;
      case "east": return MS_DIRECTION.east;
      default: return MS_DIRECTION.north;
    }
  })();
  const moving = renderChip?.moving ?? 0;
  const movement = legacyCreatureMovementOffset(
    dir,
    moving,
    LEGACY_TILE_SIZE,
    LEGACY_TILE_SIZE,
  );
  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset, viewportTileCount);
  return {
    x: (pos % 32) * LEGACY_TILE_SIZE - (viewX * LEGACY_TILE_SIZE) / 4 + LEGACY_TILE_SIZE / 2 + movement.offsetX,
    y: Math.floor(pos / 32) * LEGACY_TILE_SIZE - (viewY * LEGACY_TILE_SIZE) / 4 + LEGACY_TILE_SIZE / 2 + movement.offsetY,
    dir,
  };
}

function traceLanternPath(
  context: CanvasRenderingContext2D,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
): void {
  const chip = chipCanvasPosition(session, ruleset, viewportTileCount);
  context.beginPath();

  const radius = settings.lanternRadius * LEGACY_TILE_SIZE + LEGACY_TILE_SIZE / 2;
  context.arc(chip.x, chip.y, radius, 0, Math.PI * 2);
}

export function visibilityModeUsesFogBackdrop(
  mode: BrowserSpecialModesSettings["visibility"]["mode"],
): boolean {
  return (
    mode === "flashlight-fog" ||
    mode === "lantern-fog" ||
    mode === "line-of-sight-fog"
  );
}

function drawVisibilityBase(
  context: CanvasRenderingContext2D,
  terrainScene: HTMLCanvasElement | null,
  fog: boolean,
  size: number,
): void {
  context.fillStyle = "#000000";
  context.fillRect(0, 0, size, size);
  if (!fog || !terrainScene) {
    return;
  }
  context.save();
  context.filter = `brightness(${FOG_BRIGHTNESS_PERCENT}%)`;
  context.drawImage(terrainScene, 0, 0);
  context.restore();
}

function spotlightLayerFor(target: HTMLCanvasElement): HTMLCanvasElement {
  const cached = spotlightLayers.get(target);
  if (cached) {
    return cached;
  }
  const created = document.createElement("canvas");
  spotlightLayers.set(target, created);
  return created;
}

function cachedLayerFor(
  cache: WeakMap<HTMLCanvasElement, HTMLCanvasElement>,
  target: HTMLCanvasElement,
  size: number,
): HTMLCanvasElement {
  const cached = cache.get(target) ?? document.createElement("canvas");
  cache.set(target, cached);
  if (cached.width !== size) cached.width = size;
  if (cached.height !== size) cached.height = size;
  return cached;
}

function spotlightAngle(direction: number): number {
  switch (direction) {
    case MS_DIRECTION.east: return 0;
    case MS_DIRECTION.south: return Math.PI / 2;
    case MS_DIRECTION.west: return Math.PI;
    case MS_DIRECTION.north:
    default: return -Math.PI / 2;
  }
}

function shortestAngleDelta(fromAngle: number, toAngle: number): number {
  const fullTurn = Math.PI * 2;
  let delta = (toAngle - fromAngle) % fullTurn;
  if (delta > Math.PI) delta -= fullTurn;
  if (delta <= -Math.PI) delta += fullTurn;
  return delta;
}

function interpolateFlashlightAngle(
  fromAngle: number,
  toAngle: number,
  elapsedMs: number,
): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / FLASHLIGHT_DIRECTION_TRANSITION_MS));
  const easedProgress = (1 - Math.cos(Math.PI * progress)) / 2;
  return fromAngle + shortestAngleDelta(fromAngle, toAngle) * easedProgress;
}

export function flashlightDirectionTransitionAngle(
  fromDirection: number,
  toDirection: number,
  elapsedMs: number,
): number {
  return interpolateFlashlightAngle(
    spotlightAngle(fromDirection),
    spotlightAngle(toDirection),
    elapsedMs,
  );
}

function flashlightAngleForFrame(
  canvas: HTMLCanvasElement,
  session: InteractiveGameSession,
  direction: number,
  nowMs: number,
): number {
  const targetAngle = spotlightAngle(direction);
  const previous = flashlightDirectionTransitions.get(canvas);
  if (!previous || previous.sessionHandle !== session.handle) {
    flashlightDirectionTransitions.set(canvas, {
      sessionHandle: session.handle,
      direction,
      fromAngle: targetAngle,
      toAngle: targetAngle,
      startedAtMs: nowMs,
      settled: true,
    });
    return targetAngle;
  }

  const currentAngle = previous.settled
    ? previous.toAngle
    : interpolateFlashlightAngle(
        previous.fromAngle,
        previous.toAngle,
        nowMs - previous.startedAtMs,
      );
  if (previous.direction !== direction) {
    flashlightDirectionTransitions.set(canvas, {
      sessionHandle: session.handle,
      direction,
      fromAngle: currentAngle,
      toAngle: targetAngle,
      startedAtMs: nowMs,
      settled: false,
    });
    return currentAngle;
  }

  if (!previous.settled && nowMs - previous.startedAtMs >= FLASHLIGHT_DIRECTION_TRANSITION_MS) {
    previous.settled = true;
    return previous.toAngle;
  }
  return currentAngle;
}

export function isFlashlightDirectionTransitionActive(
  canvas: HTMLCanvasElement | null,
): boolean {
  return canvas ? flashlightDirectionTransitions.get(canvas)?.settled === false : false;
}

function drawFlashlightComposite(
  context: CanvasRenderingContext2D,
  fullScene: HTMLCanvasElement,
  terrainScene: HTMLCanvasElement | null,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
): void {
  const size = fullScene.width;
  drawVisibilityBase(context, terrainScene, visibilityModeUsesFogBackdrop(settings.mode), size);
  const chip = chipCanvasPosition(session, ruleset, viewportTileCount);
  const layer = spotlightLayerFor(context.canvas);
  if (layer.width !== size) layer.width = size;
  if (layer.height !== size) layer.height = size;
  const layerContext = layer.getContext("2d");
  if (!layerContext) {
    return;
  }

  layerContext.clearRect(0, 0, size, size);
  layerContext.drawImage(fullScene, 0, 0);
  layerContext.save();
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.translate(chip.x, chip.y);
  layerContext.rotate(flashlightAngleForFrame(
    context.canvas,
    session,
    chip.dir,
    performance.now(),
  ));
  const forwardReach = Math.max(3, viewportTileCount * 0.7) * LEGACY_TILE_SIZE;
  const rearReach = 2 * LEGACY_TILE_SIZE;
  const longitudinalRadius = (forwardReach + rearReach) / 2;
  const lateralRadius = Math.max(2, viewportTileCount * 0.27) * LEGACY_TILE_SIZE;
  layerContext.translate((forwardReach - rearReach) / 2, 0);
  layerContext.scale(longitudinalRadius, lateralRadius);
  const feather = layerContext.createRadialGradient(0, 0, 0, 0, 0, 1);
  feather.addColorStop(0, "rgba(255,255,255,1)");
  feather.addColorStop(0.9, "rgba(255,255,255,1)");
  feather.addColorStop(1, "rgba(255,255,255,0)");
  layerContext.fillStyle = feather;
  layerContext.fillRect(-size * 2, -size * 2, size * 4, size * 4);
  layerContext.restore();
  context.drawImage(layer, 0, 0);
}

function lineOfSightForSession(
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
): SpecialModesLineOfSightProjection {
  const cached = lineOfSightCache.get(session);
  if (cached?.ruleset === ruleset) {
    return cached.projection;
  }
  const projection = sessionSpecialModesLineOfSightProjection(session, ruleset);
  lineOfSightCache.set(session, { ruleset, projection });
  return projection;
}

function traceLineOfSightVisibilityPath(
  context: CanvasRenderingContext2D,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  viewportTileCount: number,
): void {
  const { visibility } = lineOfSightForSession(session, ruleset);
  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset, viewportTileCount);
  const xOrigin = -(viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = -(viewY * LEGACY_TILE_SIZE) / 4;
  context.beginPath();
  for (let pos = 0; pos < visibility.length; pos += 1) {
    if ((visibility[pos] ?? 0) <= 0) {
      continue;
    }
    context.rect(
      xOrigin + (pos % 32) * LEGACY_TILE_SIZE,
      yOrigin + Math.floor(pos / 32) * LEGACY_TILE_SIZE,
      LEGACY_TILE_SIZE,
      LEGACY_TILE_SIZE,
    );
  }
}

function maskLayerToDirectVisibility(
  layerContext: CanvasRenderingContext2D,
  visibilityCanvas: HTMLCanvasElement,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
): void {
  if (settings.mode === "normal") {
    return;
  }

  layerContext.save();
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.fillStyle = "#ffffff";
  if (settings.mode === "flashlight" || settings.mode === "flashlight-fog") {
    const spotlight = spotlightLayers.get(visibilityCanvas);
    if (spotlight) {
      layerContext.drawImage(spotlight, 0, 0);
    } else {
      layerContext.clearRect(0, 0, layerContext.canvas.width, layerContext.canvas.height);
    }
  } else if (settings.mode === "line-of-sight" || settings.mode === "line-of-sight-fog") {
    traceLineOfSightVisibilityPath(layerContext, session, ruleset, viewportTileCount);
    layerContext.fill();
  } else {
    traceLanternPath(layerContext, session, ruleset, settings, viewportTileCount);
    layerContext.fill();
  }
  layerContext.restore();
}

export function monsterRippleArtworkOpacity(distanceTiles: number, revealRadius: number): number {
  if (revealRadius <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, 1 - distanceTiles / revealRadius));
}

export function monsterRippleIntensity(moving: number): number {
  return moving > 0 ? 2 : 1;
}

export function monsterRippleMaximumRadiusTiles(viewportTileCount: number): number {
  return Math.min(MONSTER_RIPPLE_MAX_RADIUS_TILES, viewportTileCount / 2);
}

export function monsterRippleExpansionOpacity(progress: number): number {
  const remaining = 1 - Math.max(0, Math.min(1, progress));
  return remaining * remaining;
}

export function monsterRipplesCanRenderOutsideDirectVisibility(
  mode: BrowserSpecialModesSettings["visibility"]["mode"],
): boolean {
  return mode === "normal" || visibilityModeUsesFogBackdrop(mode);
}

export interface MonsterRippleOrigin {
  intensity: number;
  x: number;
  y: number;
  z: number;
}

export interface MonsterRippleEmission extends MonsterRippleOrigin {
  emittedAtMs: number;
}

export interface MonsterRippleEmissionTimeline {
  emissions: MonsterRippleEmission[];
  nextEmissionAtMs: number;
}

interface MonsterRippleCanvasState extends MonsterRippleEmissionTimeline {
  sessionHandle: InteractiveGameSession["handle"];
}

const monsterRippleEmissionIntervalMs = MONSTER_RIPPLE_PERIOD_MS / MONSTER_RIPPLE_RING_COUNT;

function appendMonsterRippleEmissions(
  emissions: MonsterRippleEmission[],
  origins: readonly MonsterRippleOrigin[],
  emittedAtMs: number,
): void {
  for (const origin of origins) {
    emissions.push({ ...origin, emittedAtMs });
  }
}

export function advanceMonsterRippleEmissions(
  previous: MonsterRippleEmissionTimeline | null,
  origins: readonly MonsterRippleOrigin[],
  nowMs: number,
): MonsterRippleEmissionTimeline {
  if (!previous || nowMs - previous.nextEmissionAtMs >= MONSTER_RIPPLE_PERIOD_MS) {
    const emissions: MonsterRippleEmission[] = [];
    for (let ring = 0; ring < MONSTER_RIPPLE_RING_COUNT; ring += 1) {
      appendMonsterRippleEmissions(
        emissions,
        origins,
        nowMs - ring * monsterRippleEmissionIntervalMs,
      );
    }
    return {
      emissions,
      nextEmissionAtMs: nowMs + monsterRippleEmissionIntervalMs,
    };
  }

  const emissions = previous.emissions.filter(
    (emission) => nowMs - emission.emittedAtMs < MONSTER_RIPPLE_PERIOD_MS,
  );
  let nextEmissionAtMs = previous.nextEmissionAtMs;
  if (origins.length === 0) {
    nextEmissionAtMs = nowMs + monsterRippleEmissionIntervalMs;
  } else {
    while (nextEmissionAtMs <= nowMs) {
      appendMonsterRippleEmissions(emissions, origins, nextEmissionAtMs);
      nextEmissionAtMs += monsterRippleEmissionIntervalMs;
    }
  }
  return { emissions, nextEmissionAtMs };
}

function monsterRippleOrigins(
  session: InteractiveGameSession,
): MonsterRippleOrigin[] {
  const actors = session.frame.render?.actors ?? [];
  const visibleLayers = new Set(session.frame.visibleLayers.map((layer) => layer.z));
  const origins: MonsterRippleOrigin[] = [];

  for (const actor of actors) {
    if (actor.hidden || !isMonsterMadnessMonsterActorId(actor.id)) {
      continue;
    }
    const z = actor.z ?? 1;
    if (!visibleLayers.has(z)) {
      continue;
    }
    const movement = legacyCreatureMovementOffset(
      actor.dir,
      actor.moving,
      LEGACY_TILE_SIZE,
      LEGACY_TILE_SIZE,
    );
    origins.push({
      intensity: monsterRippleIntensity(actor.moving),
      x: (actor.pos % 32) * LEGACY_TILE_SIZE + LEGACY_TILE_SIZE / 2 + movement.offsetX,
      y: Math.floor(actor.pos / 32) * LEGACY_TILE_SIZE + LEGACY_TILE_SIZE / 2 + movement.offsetY,
      z,
    });
  }
  return origins;
}

function projectMonsterRippleOrigin(
  origin: MonsterRippleOrigin,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  viewportTileCount: number,
): MonsterRippleOrigin | null {
  const depth = session.frame.visibleLayers.findIndex((layer) => layer.z === origin.z);
  if (depth < 0) {
    return null;
  }
  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset, viewportTileCount);
  const viewportPixelSize = viewportTileCount * LEGACY_TILE_SIZE;
  const scale = LOWER_LAYER_SCALE ** depth;
  const tileWindowSize = Math.ceil(viewportTileCount / scale);
  const sourceSize = tileWindowSize * LEGACY_TILE_SIZE;
  const padding = ((tileWindowSize - viewportTileCount) * LEGACY_TILE_SIZE) / 2;
  const screenOrigin = (viewportPixelSize - sourceSize * scale) / 2;
  return {
    ...origin,
    x: screenOrigin + (padding - (viewX * LEGACY_TILE_SIZE) / 4 + origin.x) * scale,
    y: screenOrigin + (padding - (viewY * LEGACY_TILE_SIZE) / 4 + origin.y) * scale,
  };
}

function drawMonsterArtworkReveal(
  context: CanvasRenderingContext2D,
  fullScene: HTMLCanvasElement,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings,
  viewportTileCount: number,
): void {
  const size = fullScene.width;
  const layer = cachedLayerFor(monsterRevealLayers, context.canvas, size);
  const layerContext = layer.getContext("2d");
  if (!layerContext) {
    return;
  }
  layerContext.clearRect(0, 0, size, size);
  layerContext.drawImage(fullScene, 0, 0);
  const chip = chipCanvasPosition(session, ruleset, viewportTileCount);
  const maximumRevealRadius = viewportTileCount >= 32
    ? 16
    : Math.floor(viewportTileCount / 2);
  const revealRadius = Math.min(settings.monsterRipples.revealRadius, maximumRevealRadius);
  const radiusPx = revealRadius * LEGACY_TILE_SIZE;
  const reveal = layerContext.createRadialGradient(chip.x, chip.y, 0, chip.x, chip.y, radiusPx);
  reveal.addColorStop(0, "rgba(255,255,255,1)");
  reveal.addColorStop(1, "rgba(255,255,255,0)");
  layerContext.save();
  layerContext.globalCompositeOperation = "destination-in";
  layerContext.fillStyle = reveal;
  layerContext.fillRect(0, 0, size, size);
  layerContext.restore();
  maskLayerToDirectVisibility(
    layerContext,
    context.canvas,
    session,
    ruleset,
    settings.visibility,
    viewportTileCount,
  );
  context.drawImage(layer, 0, 0);
}

function drawMonsterRipples(
  context: CanvasRenderingContext2D,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings,
  viewportTileCount: number,
  nowMs: number,
): void {
  const size = context.canvas.width;
  const layer = cachedLayerFor(monsterRippleLayers, context.canvas, size);
  const layerContext = layer.getContext("2d");
  if (!layerContext) {
    return;
  }
  layerContext.clearRect(0, 0, size, size);
  const maximumRadius = monsterRippleMaximumRadiusTiles(viewportTileCount) * LEGACY_TILE_SIZE;
  const previousState = monsterRippleStates.get(context.canvas);
  const previousTimeline = previousState?.sessionHandle === session.handle
    ? previousState
    : null;
  const timeline = advanceMonsterRippleEmissions(
    previousTimeline,
    monsterRippleOrigins(session),
    nowMs,
  );
  monsterRippleStates.set(context.canvas, { ...timeline, sessionHandle: session.handle });
  for (const emission of timeline.emissions) {
    const origin = projectMonsterRippleOrigin(emission, session, ruleset, viewportTileCount);
    if (!origin) {
      continue;
    }
    const progress = (nowMs - emission.emittedAtMs) / MONSTER_RIPPLE_PERIOD_MS;
    const radius = progress * maximumRadius;
    const alpha = MONSTER_RIPPLE_BASE_ALPHA * emission.intensity * monsterRippleExpansionOpacity(progress);
    layerContext.beginPath();
    layerContext.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
    layerContext.lineWidth = 1.5;
    layerContext.strokeStyle = `rgba(116, 220, 255, ${alpha})`;
    layerContext.stroke();
    layerContext.beginPath();
    layerContext.arc(origin.x, origin.y, Math.max(0, radius - 2), 0, Math.PI * 2);
    layerContext.lineWidth = 1;
    layerContext.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    layerContext.stroke();
  }

  if (!monsterRipplesCanRenderOutsideDirectVisibility(settings.visibility.mode)) {
    maskLayerToDirectVisibility(
      layerContext,
      context.canvas,
      session,
      ruleset,
      settings.visibility,
      viewportTileCount,
    );
  }
  context.save();
  context.globalCompositeOperation = "screen";
  context.drawImage(layer, 0, 0);
  context.restore();
}

function drawVisibleThinWallEdges(
  context: CanvasRenderingContext2D,
  session: InteractiveGameSession,
  tileset: LegacyTileset,
  visibleEdgeMasks: Uint8Array,
  xOrigin: number,
  yOrigin: number,
): void {
  const layerCells = session.frame.visibleLayers.find(
    (layer) => layer.z === session.frame.currentZ,
  )?.cells ?? session.frame.cells;
  for (let pos = 0; pos < visibleEdgeMasks.length; pos += 1) {
    const visibleEdgeMask = visibleEdgeMasks[pos]!;
    const cell = layerCells[pos];
    if (visibleEdgeMask === 0 || !cell) {
      continue;
    }
    const cellX = xOrigin + (pos % 32) * LEGACY_TILE_SIZE;
    const cellY = yOrigin + Math.floor(pos / 32) * LEGACY_TILE_SIZE;
    for (const tileId of [cell.bottom.id, cell.top.id]) {
      const overlayTileId = visibleThinWallOverlayTileId(tileId, visibleEdgeMask);
      if (overlayTileId === null) {
        continue;
      }
      const sprite = getOrCreateThinWallOverlaySprite(tileset, overlayTileId);
      if (sprite) {
        drawLegacySpriteImage(context, sprite, cellX, cellY);
      }
    }
  }
}

function drawLineOfSightComposite(
  context: CanvasRenderingContext2D,
  fullScene: HTMLCanvasElement,
  terrainScene: HTMLCanvasElement | null,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
  tileset: LegacyTileset,
): void {
  const size = fullScene.width;
  drawVisibilityBase(context, terrainScene, visibilityModeUsesFogBackdrop(settings.mode), size);
  const { visibility, visibleEdgeMasks } = lineOfSightForSession(session, ruleset);
  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset, viewportTileCount);
  const xOrigin = -(viewX * LEGACY_TILE_SIZE) / 4;
  const yOrigin = -(viewY * LEGACY_TILE_SIZE) / 4;

  context.save();
  for (let pos = 0; pos < visibility.length; pos += 1) {
    const strength = visibility[pos]!;
    if (strength <= 0) {
      continue;
    }
    const cellX = xOrigin + (pos % 32) * LEGACY_TILE_SIZE;
    const cellY = yOrigin + Math.floor(pos / 32) * LEGACY_TILE_SIZE;
    const sourceX = Math.max(0, cellX);
    const sourceY = Math.max(0, cellY);
    const sourceWidth = Math.min(size, cellX + LEGACY_TILE_SIZE) - sourceX;
    const sourceHeight = Math.min(size, cellY + LEGACY_TILE_SIZE) - sourceY;
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      continue;
    }
    context.globalAlpha = strength;
    context.drawImage(
      fullScene,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
    );
  }
  context.globalAlpha = 1;
  drawVisibleThinWallEdges(
    context,
    session,
    tileset,
    visibleEdgeMasks,
    xOrigin,
    yOrigin,
  );
  context.restore();
}

function drawVisibilityComposite(
  context: CanvasRenderingContext2D,
  fullScene: HTMLCanvasElement,
  terrainScene: HTMLCanvasElement | null,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
  tileset: LegacyTileset,
): void {
  if (settings.mode === "flashlight" || settings.mode === "flashlight-fog") {
    drawFlashlightComposite(
      context,
      fullScene,
      terrainScene,
      session,
      ruleset,
      settings,
      viewportTileCount,
    );
    return;
  }
  if (settings.mode === "line-of-sight" || settings.mode === "line-of-sight-fog") {
    drawLineOfSightComposite(
      context,
      fullScene,
      terrainScene,
      session,
      ruleset,
      settings,
      viewportTileCount,
      tileset,
    );
    return;
  }

  const fog = visibilityModeUsesFogBackdrop(settings.mode);
  const size = fullScene.width;
  drawVisibilityBase(context, terrainScene, fog, size);
  context.save();
  traceLanternPath(context, session, ruleset, settings, viewportTileCount);
  context.clip();
  context.drawImage(fullScene, 0, 0);
  context.restore();
}

function transitionViewportMatrix(
  runtime: SpecialModesRuntimeSnapshot | null,
): DihedralMatrix {
  const transition = runtime?.transition;
  if (!transition) {
    return DIHEDRAL_MATRICES[runtime?.orientation ?? "identity"];
  }
  if (transition.phase === "slow-down") {
    return DIHEDRAL_MATRICES[transition.from];
  }
  if (transition.phase === "viewport-transform") {
    return interpolateDihedralMatrix(transition.from, transition.to, transition.phaseProgress);
  }
  return DIHEDRAL_MATRICES[transition.to];
}

function artworkMatrixForCell(
  runtime: SpecialModesRuntimeSnapshot | null,
  cellCenterX: number,
  cellCenterY: number,
  playerX: number,
  playerY: number,
  maximumDistance: number,
): DihedralMatrix {
  const transition = runtime?.transition;
  if (!transition || transition.phase !== "artwork-normalize") {
    return DIHEDRAL_MATRICES.identity;
  }
  const distance = Math.hypot(cellCenterX - playerX, cellCenterY - playerY);
  const progress = cellArtworkNormalizationProgress(
    transition.phaseProgress,
    distance,
    maximumDistance,
  );
  return interpolateDihedralMatrix(
    relativeDihedralOrientation(transition.from, transition.to),
    "identity",
    progress,
  );
}

function drawTransformedArtworkCells(options: {
  context: CanvasRenderingContext2D;
  source: HTMLCanvasElement;
  session: InteractiveGameSession;
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null;
  runtime: SpecialModesRuntimeSnapshot | null;
  viewportTileCount: number;
  warningShakeOffsetPx: number;
}): void {
  const {
    context,
    source,
    session,
    ruleset,
    runtime,
    viewportTileCount,
    warningShakeOffsetPx,
  } = options;
  const size = source.width;
  const viewportMatrix = transitionViewportMatrix(runtime);
  const player = chipCanvasPosition(session, ruleset, viewportTileCount);
  const { viewX, viewY } = resolveLegacyMapViewport(session, ruleset, viewportTileCount);
  const tileGridOriginX = -(viewX * LEGACY_TILE_SIZE) / 4;
  const tileGridOriginY = -(viewY * LEGACY_TILE_SIZE) / 4;
  const firstCellX = tileGridOriginX - Math.ceil(tileGridOriginX / LEGACY_TILE_SIZE) * LEGACY_TILE_SIZE;
  const firstCellY = tileGridOriginY - Math.ceil(tileGridOriginY / LEGACY_TILE_SIZE) * LEGACY_TILE_SIZE;
  const maximumDistance = Math.max(
    Math.hypot(player.x, player.y),
    Math.hypot(size - player.x, player.y),
    Math.hypot(player.x, size - player.y),
    Math.hypot(size - player.x, size - player.y),
  );

  context.save();
  context.translate(size / 2 + warningShakeOffsetPx, size / 2);
  context.transform(
    viewportMatrix.a,
    viewportMatrix.b,
    viewportMatrix.c,
    viewportMatrix.d,
    0,
    0,
  );
  for (let cellY = firstCellY; cellY < size; cellY += LEGACY_TILE_SIZE) {
    for (let cellX = firstCellX; cellX < size; cellX += LEGACY_TILE_SIZE) {
      const sourceX = Math.max(0, cellX);
      const sourceY = Math.max(0, cellY);
      const width = Math.min(size, cellX + LEGACY_TILE_SIZE) - sourceX;
      const height = Math.min(size, cellY + LEGACY_TILE_SIZE) - sourceY;
      if (width <= 0 || height <= 0) {
        continue;
      }
      const centerX = cellX + LEGACY_TILE_SIZE / 2;
      const centerY = cellY + LEGACY_TILE_SIZE / 2;
      const artworkMatrix = artworkMatrixForCell(
        runtime,
        centerX,
        centerY,
        player.x,
        player.y,
        maximumDistance,
      );
      context.save();
      context.translate(centerX - size / 2, centerY - size / 2);
      context.transform(
        artworkMatrix.a,
        artworkMatrix.b,
        artworkMatrix.c,
        artworkMatrix.d,
        0,
        0,
      );
      context.drawImage(
        source,
        sourceX,
        sourceY,
        width,
        height,
        sourceX - cellX - LEGACY_TILE_SIZE / 2,
        sourceY - cellY - LEGACY_TILE_SIZE / 2,
        width,
        height,
      );
      context.restore();
    }
  }
  context.restore();
}

export function drawSpecialModesMap(options: {
  context: CanvasRenderingContext2D;
  fullScene: HTMLCanvasElement;
  terrainScene: HTMLCanvasElement | null;
  visibilityScene?: HTMLCanvasElement | null;
  session: InteractiveGameSession;
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null;
  settings: BrowserSpecialModesSettings;
  runtime: SpecialModesRuntimeSnapshot | null;
  viewportTileCount: number;
  tileset: LegacyTileset;
}): void {
  const {
    context,
    fullScene,
    terrainScene,
    visibilityScene,
    session,
    ruleset,
    settings,
    runtime,
    viewportTileCount,
    tileset,
  } = options;
  const size = fullScene.width;
  const visibilityCanvas = visibilityScene ?? document.createElement("canvas");
  if (visibilityCanvas.width !== size) {
    visibilityCanvas.width = size;
  }
  if (visibilityCanvas.height !== size) {
    visibilityCanvas.height = size;
  }
  const visibilityContext = visibilityCanvas.getContext("2d");
  if (!visibilityContext) {
    return;
  }
  visibilityContext.imageSmoothingEnabled = false;
  visibilityContext.clearRect(0, 0, size, size);
  if (settings.visibility.mode !== "flashlight" && settings.visibility.mode !== "flashlight-fog") {
    flashlightDirectionTransitions.delete(visibilityCanvas);
  }
  const baseScene = settings.monsterRipples.enabled && terrainScene
    ? terrainScene
    : fullScene;
  if (settings.visibility.mode === "normal") {
    visibilityContext.drawImage(baseScene, 0, 0);
  } else {
    drawVisibilityComposite(
      visibilityContext,
      baseScene,
      terrainScene,
      session,
      ruleset,
      settings.visibility,
      viewportTileCount,
      tileset,
    );
  }
  if (settings.monsterRipples.enabled) {
    drawMonsterArtworkReveal(
      visibilityContext,
      fullScene,
      session,
      ruleset,
      settings,
      viewportTileCount,
    );
    drawMonsterRipples(
      visibilityContext,
      session,
      ruleset,
      settings,
      viewportTileCount,
      performance.now(),
    );
  }

  context.fillStyle = "#000000";
  context.fillRect(0, 0, size, size);
  if (usesPerCellArtworkNormalization(settings, runtime)) {
    drawTransformedArtworkCells({
      context,
      source: visibilityCanvas,
      session,
      ruleset,
      runtime,
      viewportTileCount,
      warningShakeOffsetPx: runtime?.warningShakeOffsetPx ?? 0,
    });
    return;
  }
  const matrix = settings.transform.mode === "off"
    ? DIHEDRAL_MATRICES.identity
    : transitionViewportMatrix(runtime);
  context.save();
  context.translate(size / 2 + (runtime?.warningShakeOffsetPx ?? 0), size / 2);
  context.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
  context.drawImage(visibilityCanvas, -size / 2, -size / 2);
  context.restore();
}

export function usesPerCellArtworkNormalization(
  settings: BrowserSpecialModesSettings,
  runtime: SpecialModesRuntimeSnapshot | null,
): boolean {
  return (
    settings.transform.mode === "timed" &&
    runtime?.transition?.phase === "artwork-normalize"
  );
}

export function inverseTransformCanvasPoint(
  x: number,
  y: number,
  size: number,
  orientation: DihedralOrientation,
): { x: number; y: number } {
  const inverse = DIHEDRAL_MATRICES[inverseDihedralOrientation(orientation)];
  const centeredX = x - size / 2;
  const centeredY = y - size / 2;
  return {
    x: inverse.a * centeredX + inverse.c * centeredY + size / 2,
    y: inverse.b * centeredX + inverse.d * centeredY + size / 2,
  };
}
