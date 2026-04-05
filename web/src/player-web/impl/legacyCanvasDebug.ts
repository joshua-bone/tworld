import type {
  InteractiveGameRenderableActor,
  InteractiveGameRenderableAnimation,
  InteractiveGameRenderableChip,
  InteractiveGameTileOverlay,
} from "@game-core/api/interactive";
import type { EngineMapCell, EngineTile } from "@game-core/api/model";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import type { PerfMetricSnapshot } from "@player-web/impl/runtimePerf";
import { MS_DIRECTION, MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

const TILE_NAME_BY_ID = new Map<number, string>(
  Object.entries(MS_TILE)
    .flatMap(([name, value]) => (typeof value === "number" ? [[value, name] as const] : [])),
);

function tileName(tileId: number): string {
  const exactName = TILE_NAME_BY_ID.get(tileId);
  if (exactName) {
    return exactName;
  }

  if (isMsCreature(tileId)) {
    return TILE_NAME_BY_ID.get(msCreatureId(tileId)) ?? `Tile_${tileId}`;
  }

  return `Tile_${tileId}`;
}

function directionName(direction: number | undefined): string {
  switch (direction) {
    case MS_DIRECTION.north:
      return "north";
    case MS_DIRECTION.west:
      return "west";
    case MS_DIRECTION.south:
      return "south";
    case MS_DIRECTION.east:
      return "east";
    default:
      return "none";
  }
}

function formatTile(tile: EngineTile): string {
  return `${tileName(tile.id)}(${tile.id}) state=${tile.state}`;
}

function formatCell(prefix: string, cell: EngineMapCell | undefined): string {
  if (!cell) {
    return `${prefix}: <missing>`;
  }

  return `${prefix}: top=${formatTile(cell.top)} bottom=${formatTile(cell.bottom)}`;
}

function formatOverlay(overlay: InteractiveGameTileOverlay): string {
  const render = overlay.render;
  const renderText =
    render?.mode === "tile" || render?.mode === "pickup-reveal"
      ? `${render.mode}:${tileName(render.tileId)}(${render.tileId})`
      : render?.mode === "outline"
        ? `outline:${render.style}`
        : "default";
  return `overlay z=${overlay.z} kind=${overlay.kind} tile=${overlay.tileId === undefined ? "-" : `${tileName(overlay.tileId)}(${overlay.tileId})`} render=${renderText}`;
}

function formatChip(chip: InteractiveGameRenderableChip): string {
  return [
    `chip z=${chip.z ?? 1} dir=${directionName(chip.dir)}`,
    `moving=${chip.moving}`,
    `pushing=${chip.pushing}`,
    `hidden=${chip.hidden}`,
    `failed=${chip.failed}`,
    `visual=${chip.visual ? `${tileName(chip.visual.tileId)}(${chip.visual.tileId})` : "-"}`,
  ].join(" ");
}

function formatActor(actor: InteractiveGameRenderableActor): string {
  return [
    `actor z=${actor.z ?? 1} id=${tileName(actor.id)}(${actor.id})`,
    `dir=${directionName(actor.dir)}`,
    `moving=${actor.moving}`,
    `frame=${actor.frame}`,
    `hidden=${actor.hidden}`,
    `visual=${actor.visual ? `${tileName(actor.visual.tileId)}(${actor.visual.tileId})` : "-"}`,
  ].join(" ");
}

function formatAnimation(animation: InteractiveGameRenderableAnimation): string {
  return `animation z=${animation.z ?? 1} tile=${tileName(animation.tileId)}(${animation.tileId}) frame=${animation.frame}`;
}

function formatRate(value: number, suffix: string): string {
  return `${value.toFixed(1)}${suffix}`;
}

function formatMetricTriplet(metric: PerfMetricSnapshot): string {
  return `last=${metric.lastMs.toFixed(1)} ema=${metric.emaMs.toFixed(1)} max=${metric.maxMs.toFixed(1)}`;
}

export interface LegacyCanvasPerfReadout {
  frameFps: number;
  renderFps: number;
  gameHz: number;
  loopDriftMs: PerfMetricSnapshot;
  renderMs: PerfMetricSnapshot;
  sessionLoadMs: PerfMetricSnapshot;
  tickMs: PerfMetricSnapshot;
}

export function buildLegacyCanvasPerfReadout(
  session: InteractiveGameSession | null,
  perf: LegacyCanvasPerfReadout,
): string[] {
  if (!session) {
    return [
      `perf frame=${formatRate(perf.frameFps, "fps")} render=${formatRate(perf.renderFps, "fps")} game=${formatRate(perf.gameHz, "Hz")}`,
      `tick ms ${formatMetricTriplet(perf.tickMs)} drift=${perf.loopDriftMs.lastMs.toFixed(1)}`,
      `draw ms ${formatMetricTriplet(perf.renderMs)} load=${perf.sessionLoadMs.lastMs.toFixed(1)}`,
      "scene <no session>",
    ];
  }

  const render = session.frame.render;
  const actorCount =
    (render?.actors.length ?? 0) +
    (render?.chip ? 1 : 0) +
    (render?.animations.length ?? 0);

  return [
    `perf frame=${formatRate(perf.frameFps, "fps")} render=${formatRate(perf.renderFps, "fps")} game=${formatRate(perf.gameHz, "Hz")}`,
    `tick ms ${formatMetricTriplet(perf.tickMs)} drift=${perf.loopDriftMs.lastMs.toFixed(1)}`,
    `draw ms ${formatMetricTriplet(perf.renderMs)} load=${perf.sessionLoadMs.lastMs.toFixed(1)}`,
    `scene ruleset=${session.request.ruleset} level=${session.request.levelNumber} status=${session.frame.snapshot.status} layers=${session.frame.visibleLayers.length} actors=${actorCount} overlays=${session.frame.tileOverlays.length}`,
    `history undo=${session.history.enabled ? "on" : "off"} checkpoints=${session.history.checkpointTicks.length} recent=${session.history.recentTicks?.length ?? 0} restore=${session.history.restoreMode}`,
  ];
}

export function buildLegacyCanvasDebugReadout(
  session: InteractiveGameSession | null,
  position: number | null,
): string[] {
  if (!session || position === null) {
    return [];
  }

  const frame = session.frame;
  const currentCell = frame.cells[position];
  const x = currentCell?.position.x ?? (position % 32);
  const y = currentCell?.position.y ?? Math.floor(position / 32);
  const lines = [
    `ruleset=${session.request.ruleset} mode=${session.mode} tick=${frame.snapshot.tick} time=${frame.snapshot.currentTime} phase=${frame.snapshot.phase}`,
    `hover pos=${position} x=${x} y=${y} currentZ=${frame.currentZ} visibleLayers=${frame.visibleLayers.length}`,
    formatCell("current", currentCell),
  ];

  for (const layer of frame.visibleLayers) {
    lines.push(formatCell(`layer z=${layer.z}`, layer.cells[position]));
  }

  const overlays = frame.tileOverlays.filter((overlay) => overlay.pos === position);
  if (overlays.length > 0) {
    lines.push(...overlays.map(formatOverlay));
  }

  const render = frame.render;
  if (render?.chip && render.chip.pos === position) {
    lines.push(formatChip(render.chip));
  }

  const actors = render?.actors.filter((actor) => actor.pos === position) ?? [];
  if (actors.length > 0) {
    lines.push(...actors.map(formatActor));
  }

  const animations = render?.animations.filter((animation) => animation.pos === position) ?? [];
  if (animations.length > 0) {
    lines.push(...animations.map(formatAnimation));
  }

  return lines;
}
