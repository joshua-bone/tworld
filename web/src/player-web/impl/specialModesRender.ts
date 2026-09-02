import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  LEGACY_TILE_SIZE,
} from "@player-web/impl/legacySprites";
import { resolveLegacyMapViewport } from "@player-web/impl/legacyCanvasMapRenderer";
import type { LegacyTileset } from "@player-web/impl/legacyTileset";
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
  type DihedralMatrix,
  transformDirection,
} from "@player-web/impl/specialModesTransform";
import type { SpecialModesRuntimeSnapshot } from "@player-web/impl/useSpecialModesRuntime";
import { sessionSpecialModesLineOfSight } from "@player-web/impl/specialModesVisibility";
import {
  isMsCreature,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
  MS_DIRECTION,
  MS_TILE,
} from "@ruleset-ms/api/tiles";

const FOG_BRIGHTNESS_PERCENT = 25;
const spotlightLayers = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
const lineOfSightCache = new WeakMap<
  InteractiveGameSession,
  { ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null; visibility: Float32Array }
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
  return {
    get: (id) => tileset.get(tileId(id)),
    getArtworkSprite: tileset.getArtworkSprite?.bind(tileset),
    getCell: tileset.getCell
      ? (topId, bottomId, timerval) => tileset.getCell!(tileId(topId), tileId(bottomId), timerval)
      : undefined,
    getCreature: tileset.getCreature
      ? (id, dir, moving, frame) => tileset.getCreature!(
          id,
          transformDirection(dir, orientation),
          moving,
          frame,
        )
      : undefined,
    getCellAnimationPeriod: tileset.getCellAnimationPeriod
      ? (topId, bottomId) => tileset.getCellAnimationPeriod!(tileId(topId), tileId(bottomId))
      : undefined,
  };
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

function isFogVisibilityMode(mode: BrowserSpecialModesSettings["visibility"]["mode"]): boolean {
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

function spotlightAngle(direction: number): number {
  switch (direction) {
    case MS_DIRECTION.east: return 0;
    case MS_DIRECTION.south: return Math.PI / 2;
    case MS_DIRECTION.west: return Math.PI;
    case MS_DIRECTION.north:
    default: return -Math.PI / 2;
  }
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
  drawVisibilityBase(context, terrainScene, isFogVisibilityMode(settings.mode), size);
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
  layerContext.rotate(spotlightAngle(chip.dir));
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
): Float32Array {
  const cached = lineOfSightCache.get(session);
  if (cached?.ruleset === ruleset) {
    return cached.visibility;
  }
  const visibility = sessionSpecialModesLineOfSight(session, ruleset);
  lineOfSightCache.set(session, { ruleset, visibility });
  return visibility;
}

function drawLineOfSightComposite(
  context: CanvasRenderingContext2D,
  fullScene: HTMLCanvasElement,
  terrainScene: HTMLCanvasElement | null,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
): void {
  const size = fullScene.width;
  drawVisibilityBase(context, terrainScene, isFogVisibilityMode(settings.mode), size);
  const visibility = lineOfSightForSession(session, ruleset);
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
    );
    return;
  }

  const fog = isFogVisibilityMode(settings.mode);
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
  if (!transition) {
    return DIHEDRAL_MATRICES[inverseDihedralOrientation(runtime?.orientation ?? "identity")];
  }
  const inverseFrom = inverseDihedralOrientation(transition.from);
  if (transition.phase === "slow-down" || transition.phase === "viewport-transform") {
    return DIHEDRAL_MATRICES[inverseFrom];
  }
  const inverseTo = inverseDihedralOrientation(transition.to);
  if (transition.phase === "speed-up") {
    return DIHEDRAL_MATRICES[inverseTo];
  }
  const distance = Math.hypot(cellCenterX - playerX, cellCenterY - playerY);
  const progress = cellArtworkNormalizationProgress(
    transition.phaseProgress,
    distance,
    maximumDistance,
  );
  return interpolateDihedralMatrix(inverseFrom, inverseTo, progress);
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
  for (let sourceY = 0; sourceY < size; sourceY += LEGACY_TILE_SIZE) {
    for (let sourceX = 0; sourceX < size; sourceX += LEGACY_TILE_SIZE) {
      const width = Math.min(LEGACY_TILE_SIZE, size - sourceX);
      const height = Math.min(LEGACY_TILE_SIZE, size - sourceY);
      const centerX = sourceX + width / 2;
      const centerY = sourceY + height / 2;
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
        -width / 2,
        -height / 2,
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
  if (settings.visibility.mode === "normal") {
    visibilityContext.drawImage(fullScene, 0, 0);
  } else {
    drawVisibilityComposite(
      visibilityContext,
      fullScene,
      terrainScene,
      session,
      ruleset,
      settings.visibility,
      viewportTileCount,
    );
  }

  context.fillStyle = "#000000";
  context.fillRect(0, 0, size, size);
  const orientation = runtime?.orientation ?? "identity";
  if (settings.transform.enabled && (runtime?.transition || orientation !== "identity")) {
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
  const matrix = DIHEDRAL_MATRICES[orientation];
  context.save();
  context.translate(size / 2 + (runtime?.warningShakeOffsetPx ?? 0), size / 2);
  context.transform(matrix.a, matrix.b, matrix.c, matrix.d, 0, 0);
  context.drawImage(visibilityCanvas, -size / 2, -size / 2);
  context.restore();
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
