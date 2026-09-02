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
import { inverseDihedralOrientation, DIHEDRAL_MATRICES } from "@player-web/impl/specialModesTransform";
import type { SpecialModesRuntimeSnapshot } from "@player-web/impl/useSpecialModesRuntime";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

const FOG_BRIGHTNESS_PERCENT = 25;

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

function traceLightPath(
  context: CanvasRenderingContext2D,
  session: InteractiveGameSession,
  ruleset: "MS" | "Lynx" | "Hybrid" | "None" | null,
  settings: BrowserSpecialModesSettings["visibility"],
  viewportTileCount: number,
): void {
  const size = viewportTileCount * LEGACY_TILE_SIZE;
  const chip = chipCanvasPosition(session, ruleset, viewportTileCount);
  context.beginPath();

  if (settings.mode === "lantern" || settings.mode === "lantern-fog") {
    const radius = settings.lanternRadius * LEGACY_TILE_SIZE + LEGACY_TILE_SIZE / 2;
    context.arc(chip.x, chip.y, radius, 0, Math.PI * 2);
    return;
  }

  const reach = size * 2;
  context.moveTo(chip.x, chip.y);
  switch (chip.dir) {
    case MS_DIRECTION.west:
      context.lineTo(chip.x - reach, chip.y - reach);
      context.lineTo(chip.x - reach, chip.y + reach);
      break;
    case MS_DIRECTION.south:
      context.lineTo(chip.x - reach, chip.y + reach);
      context.lineTo(chip.x + reach, chip.y + reach);
      break;
    case MS_DIRECTION.east:
      context.lineTo(chip.x + reach, chip.y - reach);
      context.lineTo(chip.x + reach, chip.y + reach);
      break;
    case MS_DIRECTION.north:
    default:
      context.lineTo(chip.x - reach, chip.y - reach);
      context.lineTo(chip.x + reach, chip.y - reach);
      break;
  }
  context.closePath();
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
  const fog = settings.mode === "flashlight-fog" || settings.mode === "lantern-fog";
  const size = fullScene.width;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, size, size);
  if (fog && terrainScene) {
    context.save();
    context.filter = `brightness(${FOG_BRIGHTNESS_PERCENT}%)`;
    context.drawImage(terrainScene, 0, 0);
    context.restore();
  }
  context.save();
  traceLightPath(context, session, ruleset, settings, viewportTileCount);
  context.clip();
  context.drawImage(fullScene, 0, 0);
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
  const transition = runtime?.transition;
  const orientation = runtime?.orientation ?? "identity";
  const matrix = transition
    ? (() => {
        const from = DIHEDRAL_MATRICES[transition.from];
        const to = DIHEDRAL_MATRICES[transition.to];
        return {
          a: from.a + (to.a - from.a) * transition.progress,
          b: from.b + (to.b - from.b) * transition.progress,
          c: from.c + (to.c - from.c) * transition.progress,
          d: from.d + (to.d - from.d) * transition.progress,
        };
      })()
    : DIHEDRAL_MATRICES[orientation];
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
