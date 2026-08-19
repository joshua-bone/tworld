import { canonicalizeJson } from "../domain/canonicalJson.js";
import type { SolverCoordinate, SolverRenderCell, SolverRenderItem } from "../domain/runtime/types.js";
import {
  P4B_EVIDENCE_BASIS_LABELS,
  type P4bEvidenceBasisV1,
  type P4bWholeLevelOverlayV1,
  type P4bWholeLevelViewV1,
} from "./p4bWholeLevelModel.js";
import { validateP4bWholeLevelView } from "./p4bWholeLevelView.js";

const CELL_SIZE = 20;
const MAP_X = 32;
const MAP_Y = 82;
const LEGEND_GAP = 36;
const LEGEND_WIDTH = 372;
const FOOTER_HEIGHT = 74;

const stratumInset = new Map([
  ["terrain", 2],
  ["overlay", 4],
  ["pickup", 6],
  ["actor", 7],
  ["side", 8],
]);

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function pointFor(coordinate: SolverCoordinate): { readonly x: number; readonly y: number } {
  return {
    x: MAP_X + coordinate.x * CELL_SIZE + CELL_SIZE / 2,
    y: MAP_Y + coordinate.y * CELL_SIZE + CELL_SIZE / 2,
  };
}

function rectForOrdinal(
  ordinal: number,
  width: number,
): { readonly x: number; readonly y: number } {
  return {
    x: MAP_X + (ordinal % width) * CELL_SIZE,
    y: MAP_Y + Math.floor(ordinal / width) * CELL_SIZE,
  };
}

function identityText(item: SolverRenderItem): string {
  if (item.identity.kind === "placement") return item.identity.placementId;
  if (item.identity.kind === "actor") return item.identity.actorId;
  return item.identity.semanticId;
}

function itemText(item: SolverRenderItem): string {
  const details = [
    `${item.semanticType} [${item.stratum}]`,
    `identity ${identityText(item)}`,
    `source ${item.source}`,
  ];
  if (item.facing !== null) details.push(`facing ${item.facing}`);
  if (item.state !== null) details.push(`state ${item.state}`);
  return details.join(", ");
}

function shortStackText(cell: SolverRenderCell): string {
  return cell.items.length === 0
    ? "empty"
    : cell.items.map((item) => `${item.semanticType} [${item.stratum}]`).join(" + ");
}

function renderSemanticItem(item: SolverRenderItem, cellX: number, cellY: number): string {
  const inset = stratumInset.get(item.stratum) ?? 8;
  const size = CELL_SIZE - inset * 2;
  return [
    `<rect class="semantic-item semantic-item--${escapeXml(item.stratum)}"`,
    ` data-semantic-type="${escapeXml(item.semanticType)}"`,
    ` data-identity="${escapeXml(identityText(item))}"`,
    ` data-source="${escapeXml(item.source)}"`,
    ` x="${cellX + inset}" y="${cellY + inset}" width="${size}" height="${size}" rx="2">`,
    `<title>${escapeXml(itemText(item))}</title></rect>`,
  ].join("");
}

function renderCells(view: P4bWholeLevelViewV1): string {
  const lines: string[] = [];
  for (const cell of view.cells) {
    const cellX = MAP_X + cell.coordinate.x * CELL_SIZE;
    const cellY = MAP_Y + cell.coordinate.y * CELL_SIZE;
    const stack = shortStackText(cell);
    const exactItems = cell.items.length === 0
      ? "No supplied semantic items."
      : cell.items.map(itemText).join("; ");
    lines.push(
      `<g class="map-cell" data-cell-ordinal="${cell.cellOrdinal}" data-stack="${escapeXml(stack)}" aria-label="Cell (${cell.coordinate.x},${cell.coordinate.y},${cell.coordinate.z}): ${escapeXml(stack)}">`,
      `<title>Cell (${cell.coordinate.x},${cell.coordinate.y},${cell.coordinate.z}). ${escapeXml(exactItems)}</title>`,
      `<rect class="coordinate-background" x="${cellX}" y="${cellY}" width="${CELL_SIZE}" height="${CELL_SIZE}"/>`,
    );
    for (const item of cell.items) lines.push(renderSemanticItem(item, cellX, cellY));
    if (cell.items.length > 1) {
      lines.push(
        `<text class="stack-count" x="${cellX + CELL_SIZE - 2}" y="${cellY + CELL_SIZE - 3}">${cell.items.length}</text>`,
      );
    }
    lines.push("</g>");
  }
  return lines.join("\n");
}

function renderCoordinateLabels(view: P4bWholeLevelViewV1): string {
  const lines: string[] = [];
  for (let x = 0; x < view.geometry.width; x += 4) {
    lines.push(
      `<text class="coordinate-label" x="${MAP_X + x * CELL_SIZE + CELL_SIZE / 2}" y="${MAP_Y - 9}">x${x}</text>`,
    );
  }
  for (let y = 0; y < view.geometry.height; y += 4) {
    lines.push(
      `<text class="coordinate-label" x="${MAP_X - 8}" y="${MAP_Y + y * CELL_SIZE + 14}" text-anchor="end">y${y}</text>`,
    );
  }
  return lines.join("\n");
}

function groupStart(overlay: P4bWholeLevelOverlayV1, extra = ""): string {
  const basisLabel = P4B_EVIDENCE_BASIS_LABELS[overlay.basis];
  return [
    `<g class="overlay overlay--${overlay.kind}"`,
    ` data-overlay-id="${escapeXml(overlay.overlayId)}"`,
    ` data-basis="${overlay.basis}"`,
    ` data-basis-label="${escapeXml(basisLabel)}"${extra}`,
    ` role="group" aria-label="${escapeXml(`${basisLabel}: ${overlay.label}. ${overlay.textEquivalent}`)}">`,
    `<title>${escapeXml(`${basisLabel}: ${overlay.label}. ${overlay.textEquivalent}`)}</title>`,
  ].join("");
}

function routePoints(coordinates: readonly SolverCoordinate[], offset: number): string {
  return coordinates.map((coordinate) => {
    const point = pointFor(coordinate);
    return `${point.x + offset},${point.y + offset}`;
  }).join(" ");
}

function renderOverlay(overlay: P4bWholeLevelOverlayV1, width: number): string {
  const lines: string[] = [];
  switch (overlay.kind) {
    case "source-stratum":
      lines.push(groupStart(overlay, ` data-stratum="${overlay.stratum}"`));
      overlay.cellOrdinals.forEach((ordinal) => {
        const at = rectForOrdinal(ordinal, width);
        lines.push(
          `<rect class="stratum-highlight stratum-highlight--${overlay.stratum}" x="${at.x + 2}" y="${at.y + 2}" width="${CELL_SIZE - 4}" height="${CELL_SIZE - 4}" rx="2"/>`,
        );
      });
      break;
    case "region":
      lines.push(groupStart(overlay, ` data-region-id="${escapeXml(overlay.regionId)}"`));
      overlay.cellOrdinals.forEach((ordinal) => {
        const at = rectForOrdinal(ordinal, width);
        lines.push(
          `<rect class="region-member" x="${at.x + 1}" y="${at.y + 1}" width="${CELL_SIZE - 2}" height="${CELL_SIZE - 2}"/>`,
        );
      });
      break;
    case "resource-source": {
      const at = pointFor(overlay.coordinate);
      lines.push(
        groupStart(overlay, ` data-resource-type="${escapeXml(overlay.resourceType)}"`),
        `<circle class="resource-marker resource-marker--source" cx="${at.x}" cy="${at.y}" r="7"/>`,
        `<text class="overlay-glyph" x="${at.x}" y="${at.y + 3}">R</text>`,
      );
      break;
    }
    case "resource-gate": {
      const at = pointFor(overlay.coordinate);
      lines.push(
        groupStart(
          overlay,
          ` data-resource-type="${escapeXml(overlay.resourceType)}" data-gate-kind="${overlay.gateKind}"`,
        ),
        `<rect class="resource-marker resource-marker--gate" x="${at.x - 7}" y="${at.y - 7}" width="14" height="14" rx="2"/>`,
        `<text class="overlay-glyph" x="${at.x}" y="${at.y + 3}">G</text>`,
      );
      break;
    }
    case "plan-intent-route":
      lines.push(
        groupStart(overlay, ` data-route-id="${escapeXml(overlay.routeId)}"`),
        `<polyline class="route-line route-line--plan" points="${routePoints(overlay.coordinates, -2)}"/>`,
      );
      break;
    case "observed-route":
      lines.push(
        groupStart(overlay, ` data-route-id="${escapeXml(overlay.routeId)}"`),
        `<polyline class="route-line route-line--observed" points="${routePoints(overlay.coordinates, 2)}"/>`,
      );
      break;
    case "subgoal-span": {
      const start = pointFor(overlay.start);
      const end = pointFor(overlay.end);
      const symbol = overlay.subgoalOrder + 1;
      lines.push(
        groupStart(overlay, ` data-subgoal-id="${escapeXml(overlay.subgoalId)}"`),
        `<g class="subgoal-boundary subgoal-boundary--start" aria-label="Start boundary at (${overlay.start.x},${overlay.start.y},${overlay.start.z})">`,
        `<circle cx="${start.x}" cy="${start.y}" r="8"/><text x="${start.x}" y="${start.y + 3}">${symbol}S</text></g>`,
        `<g class="subgoal-boundary subgoal-boundary--end" aria-label="End boundary at (${overlay.end.x},${overlay.end.y},${overlay.end.z})">`,
        `<rect x="${end.x - 8}" y="${end.y - 8}" width="16" height="16"/><text x="${end.x}" y="${end.y + 3}">${symbol}E</text></g>`,
      );
      break;
    }
    case "wiring": {
      const source = pointFor(overlay.source.coordinate);
      const target = pointFor(overlay.target.coordinate);
      lines.push(
        groupStart(
          overlay,
          ` data-wiring-id="${escapeXml(overlay.wiringId)}" data-claim="${overlay.claim}"`,
        ),
        `<line class="declared-wiring" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"/>`,
        `<circle class="wiring-endpoint" cx="${source.x}" cy="${source.y}" r="6"/>`,
        `<rect class="wiring-endpoint" x="${target.x - 6}" y="${target.y - 6}" width="12" height="12"/>`,
      );
      break;
    }
    case "transport":
      lines.push(
        groupStart(
          overlay,
          ` data-routing-policy="${escapeXml(overlay.routingPolicy)}" data-claim="${overlay.claim}"`,
        ),
      );
      overlay.members.forEach((member, index) => {
        const at = pointFor(member.coordinate);
        lines.push(
          `<g class="transport-member" aria-label="Declared source-order member ${index + 1}">`,
          `<circle cx="${at.x}" cy="${at.y}" r="8"/>`,
          `<text x="${at.x}" y="${at.y + 3}">T${index + 1}</text></g>`,
        );
      });
      break;
    case "forced-surface": {
      const at = pointFor(overlay.coordinate);
      const directionGlyph = overlay.direction === "north"
        ? "↑"
        : overlay.direction === "east"
          ? "→"
          : overlay.direction === "south"
            ? "↓"
            : overlay.direction === "west"
              ? "←"
              : overlay.turn === "left"
                ? "↶"
                : overlay.turn === "right"
                  ? "↷"
                  : overlay.turn === "reverse"
                    ? "↩"
                    : "F";
      lines.push(
        groupStart(
          overlay,
          ` data-motion-kind="${overlay.motionKind}" data-claim="${overlay.claim}"`,
        ),
        `<path class="forced-surface-marker" d="M ${at.x} ${at.y - 9} L ${at.x + 9} ${at.y} L ${at.x} ${at.y + 9} L ${at.x - 9} ${at.y} Z"/>`,
        `<text class="forced-surface-glyph" x="${at.x}" y="${at.y + 4}">${directionGlyph}</text>`,
      );
      break;
    }
  }
  lines.push("</g>");
  return lines.join("\n");
}

function renderBasisLegend(legendX: number): string {
  const entries = Object.entries(P4B_EVIDENCE_BASIS_LABELS) as ReadonlyArray<
    readonly [P4bEvidenceBasisV1, string]
  >;
  return entries.map(([basis, label], index) => {
    const y = 122 + index * 28;
    return [
      `<rect class="basis-key basis-key--${basis}" x="${legendX}" y="${y - 13}" width="18" height="18"/>`,
      `<text class="basis-label" x="${legendX + 28}" y="${y}">${escapeXml(label)}</text>`,
    ].join("");
  }).join("\n");
}

function renderOverlayLegend(view: P4bWholeLevelViewV1, legendX: number): string {
  return view.overlays.map((overlay, index) => {
    const y = 274 + index * 34;
    return [
      `<g class="overlay-legend-entry" aria-label="${escapeXml(`${P4B_EVIDENCE_BASIS_LABELS[overlay.basis]}: ${overlay.label}`)}">`,
      `<text class="overlay-legend-symbol" x="${legendX}" y="${y}">${index + 1}</text>`,
      `<text class="overlay-legend-basis" x="${legendX + 28}" y="${y - 7}">${escapeXml(P4B_EVIDENCE_BASIS_LABELS[overlay.basis])}</text>`,
      `<text class="overlay-legend-label" x="${legendX + 28}" y="${y + 9}">${escapeXml(overlay.label)}</text>`,
      "</g>",
    ].join("");
  }).join("\n");
}

function metadataFor(view: P4bWholeLevelViewV1): string {
  return canonicalizeJson({
    bindings: view.bindings,
    correctness: view.correctness,
    geometry: view.geometry,
    level: view.level,
    target: view.target,
    viewId: view.viewId,
    viewType: view.viewType,
    viewVersion: view.viewVersion,
  });
}

const stylesheet = `<style>
  .page-background { fill: #f7f4ec; }
  .map-frame { fill: #fdfcf8; stroke: #17202a; stroke-width: 2; }
  .coordinate-background { fill: #faf9f5; stroke: #aab2b8; stroke-width: .55; }
  .semantic-item { stroke-width: 1.15; }
  .semantic-item--terrain { fill: #52616b; stroke: #17202a; }
  .semantic-item--overlay { fill: #e0a458; stroke: #713b00; }
  .semantic-item--pickup { fill: #f4d35e; stroke: #564500; }
  .semantic-item--actor { fill: #ee6c4d; stroke: #641e16; }
  .semantic-item--side { fill: #9b5de5; stroke: #3d1769; }
  .stack-count { fill: #111; font: 700 7px ui-monospace, monospace; text-anchor: end; }
  .coordinate-label { fill: #3c4852; font: 10px ui-monospace, monospace; text-anchor: middle; }
  .stratum-highlight { fill: none; stroke: #111; stroke-width: 2; stroke-dasharray: 2 2; }
  .region-member { fill: #4ea8de; fill-opacity: .22; stroke: #006494; stroke-width: 1.4; }
  .resource-marker { stroke: #111; stroke-width: 1.5; }
  .resource-marker--source { fill: #ffe66d; }
  .resource-marker--gate { fill: #ff6b6b; }
  .overlay-glyph { fill: #111; font: 700 8px system-ui, sans-serif; text-anchor: middle; }
  .route-line { fill: none; stroke-linecap: round; stroke-linejoin: round; stroke-width: 3.5; }
  .route-line--plan { stroke: #6f2dbd; stroke-dasharray: 7 4; }
  .route-line--observed { stroke: #006d5b; }
  .subgoal-boundary circle, .subgoal-boundary rect { fill: #fff; stroke: #111; stroke-width: 2; }
  .subgoal-boundary text { fill: #111; font: 700 6px system-ui, sans-serif; text-anchor: middle; }
  .declared-wiring { stroke: #a4133c; stroke-width: 2.5; stroke-dasharray: 3 3; }
  .wiring-endpoint { fill: #fff; stroke: #a4133c; stroke-width: 2; }
  .transport-member circle { fill: #caf0f8; stroke: #023e8a; stroke-width: 2; }
  .transport-member text { fill: #012a4a; font: 700 6px system-ui, sans-serif; text-anchor: middle; }
  .forced-surface-marker { fill: #ffb703; stroke: #5f370e; stroke-width: 1.5; }
  .forced-surface-glyph { fill: #111; font: 700 11px system-ui, sans-serif; text-anchor: middle; }
  .title { fill: #101820; font: 700 22px system-ui, sans-serif; }
  .subtitle { fill: #37474f; font: 12px system-ui, sans-serif; }
  .legend-heading { fill: #101820; font: 700 15px system-ui, sans-serif; }
  .basis-key { stroke: #111; stroke-width: 1.25; }
  .basis-key--source-fact { fill: #ffe66d; }
  .basis-key--static-topology { fill: #4ea8de; }
  .basis-key--plan-intent { fill: #fff; stroke: #6f2dbd; stroke-dasharray: 4 2; }
  .basis-key--observed-witness { fill: #006d5b; }
  .basis-label { fill: #17202a; font: 12px system-ui, sans-serif; }
  .overlay-legend-symbol { fill: #fff; stroke: #111; paint-order: stroke; stroke-width: 3px; font: 700 10px system-ui, sans-serif; }
  .overlay-legend-basis { fill: #52616b; font: 700 9px system-ui, sans-serif; text-transform: uppercase; letter-spacing: .6px; }
  .overlay-legend-label { fill: #17202a; font: 11px system-ui, sans-serif; }
  .footer { fill: #263238; font: 11px system-ui, sans-serif; }
  .footer-strong { font-weight: 700; }
</style>`;

/**
 * Produces standalone deterministic SVG from only the checked presentation DTO.
 * The renderer never looks up gameplay state, plan state, or external assets.
 */
export function renderP4bWholeLevelSvg(value: unknown): string {
  const view = validateP4bWholeLevelView(value);
  const mapWidth = view.geometry.width * CELL_SIZE;
  const mapHeight = view.geometry.height * CELL_SIZE;
  const legendX = MAP_X + mapWidth + LEGEND_GAP;
  const legendHeight = 294 + view.overlays.length * 34;
  const contentBottom = Math.max(MAP_Y + mapHeight, legendHeight);
  const svgWidth = legendX + LEGEND_WIDTH;
  const svgHeight = contentBottom + FOOTER_HEIGHT;
  const description = [
    view.accessibleText,
    "Supplied semantic cells only. No missing tile is inferred.",
    "Overlay lines, memberships, and boundary markers preserve their declared evidence basis.",
    "No causal relationship is asserted.",
  ].join(" ");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" role="img" aria-labelledby="p4b-title p4b-description">`,
    `<title id="p4b-title">${escapeXml(view.title)}</title>`,
    `<desc id="p4b-description">${escapeXml(description)}</desc>`,
    `<metadata>${escapeXml(metadataFor(view))}</metadata>`,
    stylesheet,
    `<rect class="page-background" width="${svgWidth}" height="${svgHeight}"/>`,
    `<text class="title" x="${MAP_X}" y="34">${escapeXml(view.title)}</text>`,
    `<text class="subtitle" x="${MAP_X}" y="55">${escapeXml(`${view.target.toUpperCase()} · ${view.geometry.width}×${view.geometry.height}×${view.geometry.depth} · exact supplied semantic projection`)}</text>`,
    `<rect class="map-frame" x="${MAP_X - 2}" y="${MAP_Y - 2}" width="${mapWidth + 4}" height="${mapHeight + 4}"/>`,
    renderCoordinateLabels(view),
    renderCells(view),
    view.overlays.map((overlay) => renderOverlay(overlay, view.geometry.width)).join("\n"),
    `<text class="legend-heading" x="${legendX}" y="82">Evidence basis</text>`,
    renderBasisLegend(legendX),
    `<text class="legend-heading" x="${legendX}" y="250">Declared overlays</text>`,
    renderOverlayLegend(view, legendX),
    `<text class="footer footer-strong" x="${MAP_X}" y="${contentBottom + 30}">Supplied semantic cells only · No missing tile is inferred.</text>`,
    `<text class="footer" x="${MAP_X}" y="${contentBottom + 50}">Evidence-labeled overlays only · No causal relationship is asserted.</text>`,
    "</svg>",
  ].join("\n");
}
