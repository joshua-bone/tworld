import { canonicalizeJson } from "../domain/canonicalJson.js";
import type { SolverCoordinate, SolverRenderCell, SolverRenderItem } from "../domain/runtime/types.js";
import {
  SubgoalEvidenceError,
  type SubgoalEvidenceBasisV1,
  type SubgoalEvidenceOverlayV1,
  type SubgoalEvidencePanelSelectionV1,
  type SubgoalEvidencePanelV1,
  type SubgoalEvidenceViewV1,
} from "./model.js";

const TILE_SIZE = 48;
const GRID_X = 56;
const GRID_Y = 112;
const BASE_WIDTH = 640;
const BASE_HEIGHT = 480;

const basisLabels: Readonly<Record<SubgoalEvidenceBasisV1, string>> = {
  "regressed-requirement": "Regressed requirement",
  "backward-candidate": "Backward candidate",
  "plan-intent": "Plan intent",
  "observed-witness": "Observed witness",
  "donor-evidence": "Donor evidence",
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function coordinateKey({ x, y, z }: SolverCoordinate): string {
  return `${z}:${y}:${x}`;
}

function itemStackText(cell: SolverRenderCell): string {
  if (cell.items.length === 0) return "empty semantic stack";
  return cell.items.map(({ semanticType, stratum }) => `${stratum}:${semanticType}`).join(" + ");
}

function panelFor(
  view: SubgoalEvidenceViewV1,
  selection: SubgoalEvidencePanelSelectionV1,
): SubgoalEvidencePanelV1 {
  if (selection === "starting") return view.starting;
  if (selection === "ending") {
    if (view.ending.kind !== "verified") {
      throw new SubgoalEvidenceError(
        "evidence.invalid-panel-selection",
        "/selection",
        "failed views use expected-ending and actual-failure panels",
      );
    }
    return view.ending.observed;
  }
  if (selection === "expected-ending") {
    if (view.ending.kind !== "failed") {
      throw new SubgoalEvidenceError(
        "evidence.invalid-panel-selection",
        "/selection",
        "verified views have no expected-only panel",
      );
    }
    return view.ending.expected;
  }
  if (selection === "actual-failure") {
    if (view.ending.kind !== "failed") {
      throw new SubgoalEvidenceError(
        "evidence.invalid-panel-selection",
        "/selection",
        "verified views have no actual-failure panel",
      );
    }
    return view.ending.actual;
  }
  throw new SubgoalEvidenceError(
    "evidence.invalid-panel-selection",
    "/selection",
    "unknown evidence panel selection",
  );
}

function panelsForLayout(view: SubgoalEvidenceViewV1): readonly SubgoalEvidencePanelV1[] {
  return view.ending.kind === "verified"
    ? [view.starting, view.ending.observed]
    : [view.starting, view.ending.expected, view.ending.actual];
}

function statusFor(
  view: SubgoalEvidenceViewV1,
  selection: SubgoalEvidencePanelSelectionV1,
): string {
  if (selection === "starting") return "OBSERVED START";
  if (selection === "ending") return "VERIFIED OBSERVATION";
  if (selection === "expected-ending") return "EXPECTED — NOT OBSERVED";
  if (view.ending.kind === "failed") return "FAILED OBSERVATION";
  return "OBSERVATION";
}

function pointFor(
  coordinate: SolverCoordinate,
  minimum: SolverCoordinate,
): { readonly x: number; readonly y: number } {
  return {
    x: GRID_X + (coordinate.x - minimum.x) * TILE_SIZE + TILE_SIZE / 2,
    y: GRID_Y + (coordinate.y - minimum.y) * TILE_SIZE + TILE_SIZE / 2,
  };
}

function itemGlyph(item: SolverRenderItem, x: number, y: number): string {
  const type = item.semanticType;
  if (type === "cc1:floor") {
    return `<circle class="floor-mark" cx="${x + 24}" cy="${y + 24}" r="2"/>`;
  }
  if (type.includes("wall")) {
    return `<rect class="wall" x="${x + 2}" y="${y + 2}" width="44" height="44" rx="3"/>`;
  }
  if (type.includes("door-red")) {
    return `<rect class="door-red" x="${x + 8}" y="${y + 5}" width="32" height="38" rx="4"/><text class="tile-glyph" x="${x + 24}" y="${y + 30}">D</text>`;
  }
  if (type.includes("door-yellow")) {
    return `<rect class="door-yellow" x="${x + 8}" y="${y + 5}" width="32" height="38" rx="4"/><text class="tile-glyph dark" x="${x + 24}" y="${y + 30}">Y</text>`;
  }
  if (type.includes("key-red")) {
    return `<path class="key-red" d="M ${x + 24} ${y + 8} L ${x + 39} ${y + 24} L ${x + 24} ${y + 40} L ${x + 9} ${y + 24} Z"/><text class="tile-glyph" x="${x + 24}" y="${y + 29}">R</text>`;
  }
  if (type.includes("key-blue")) {
    return `<path class="key-blue" d="M ${x + 24} ${y + 8} L ${x + 39} ${y + 24} L ${x + 24} ${y + 40} L ${x + 9} ${y + 24} Z"/><text class="tile-glyph" x="${x + 24}" y="${y + 29}">B</text>`;
  }
  if (type.includes("hint")) {
    return `<circle class="hint" cx="${x + 24}" cy="${y + 24}" r="16"/><text class="tile-glyph dark" x="${x + 24}" y="${y + 30}">H</text>`;
  }
  if (type === "cc1:chip") {
    const facing = item.facing === null ? "" : ` data-facing="${escapeXml(item.facing)}"`;
    const facingTriangle = item.facing === null ? "" : playerFacingTriangle(item.facing, x, y);
    return `<circle class="player" cx="${x + 24}" cy="${y + 24}" r="16"${facing}/>${facingTriangle}<text class="tile-glyph" x="${x + 24}" y="${y + 30}">P</text>`;
  }
  if (item.stratum === "actor") {
    return `<circle class="actor" cx="${x + 24}" cy="${y + 24}" r="15"/><text class="tile-glyph" x="${x + 24}" y="${y + 30}">A</text>`;
  }
  return `<text class="unknown-glyph" x="${x + 24}" y="${y + 29}">?</text>`;
}

function playerFacingTriangle(
  facing: NonNullable<SolverRenderItem["facing"]>,
  x: number,
  y: number,
): string {
  const centerX = x + 24;
  const centerY = y + 24;
  const points: Readonly<Record<NonNullable<SolverRenderItem["facing"]>, string>> = {
    north: `${centerX},${centerY - 18} ${centerX - 4},${centerY - 10} ${centerX + 4},${centerY - 10}`,
    east: `${centerX + 18},${centerY} ${centerX + 10},${centerY - 4} ${centerX + 10},${centerY + 4}`,
    south: `${centerX},${centerY + 18} ${centerX - 4},${centerY + 10} ${centerX + 4},${centerY + 10}`,
    west: `${centerX - 18},${centerY} ${centerX - 10},${centerY - 4} ${centerX - 10},${centerY + 4}`,
  };
  return `<polygon class="facing-arrow" points="${points[facing]}"/>`;
}

function renderCells(panel: SubgoalEvidencePanelV1): string {
  const { minimum, maximum } = panel.scene.region;
  const byCoordinate = new Map(panel.scene.cells.map((cell) => [coordinateKey(cell.coordinate), cell]));
  const lines: string[] = [];
  for (let x = minimum.x; x <= maximum.x; x += 1) {
    const px = GRID_X + (x - minimum.x) * TILE_SIZE + TILE_SIZE / 2;
    lines.push(`<text class="coordinate-label" x="${px}" y="${GRID_Y - 12}">x${x}</text>`);
  }
  for (let y = minimum.y; y <= maximum.y; y += 1) {
    const py = GRID_Y + (y - minimum.y) * TILE_SIZE + TILE_SIZE / 2 + 4;
    lines.push(`<text class="coordinate-label" x="${GRID_X - 14}" y="${py}" text-anchor="end">y${y}</text>`);
    for (let x = minimum.x; x <= maximum.x; x += 1) {
      const px = GRID_X + (x - minimum.x) * TILE_SIZE;
      const cell = byCoordinate.get(coordinateKey({ x, y, z: minimum.z }));
      lines.push(`<g aria-label="(${x},${y},${minimum.z}) ${escapeXml(cell === undefined ? "missing" : itemStackText(cell))}">`);
      lines.push(`<rect class="cell-canvas" x="${px}" y="${py - TILE_SIZE / 2 - 4}" width="48" height="48"/>`);
      if (cell !== undefined) {
        for (const item of cell.items) {
          lines.push(itemGlyph(item, px, py - TILE_SIZE / 2 - 4));
        }
      }
      lines.push("</g>");
    }
  }
  return lines.join("\n");
}

function routeOffset(basis: SubgoalEvidenceBasisV1): number {
  if (basis === "plan-intent") return -3;
  if (basis === "observed-witness") return 3;
  return 0;
}

function routePoints(
  overlay: Extract<SubgoalEvidenceOverlayV1, { readonly kind: "route" }>,
  minimum: SolverCoordinate,
): string {
  const offset = routeOffset(overlay.basis);
  const points = overlay.coordinates.map((entry) => {
    const point = pointFor(entry, minimum);
    return { x: point.x + offset, y: point.y + offset };
  });
  if (points.length >= 2) {
    const first = points[0]!;
    const second = points[1]!;
    const last = points.at(-1)!;
    const penultimate = points.at(-2)!;
    const startLength = Math.hypot(second.x - first.x, second.y - first.y);
    const endLength = Math.hypot(last.x - penultimate.x, last.y - penultimate.y);
    if (startLength > 0) {
      first.x += ((second.x - first.x) / startLength) * 15;
      first.y += ((second.y - first.y) / startLength) * 15;
    }
    if (endLength > 0) {
      last.x -= ((last.x - penultimate.x) / endLength) * 19;
      last.y -= ((last.y - penultimate.y) / endLength) * 19;
    }
  }
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function renderOverlayMark(
  overlay: SubgoalEvidenceOverlayV1,
  minimum: SolverCoordinate,
  symbol: string,
): string {
  const basisClass = `basis-${overlay.basis}`;
  if (overlay.kind === "route") {
    return `<polyline class="route ${basisClass}" points="${routePoints(overlay, minimum)}" marker-end="url(#arrow-${overlay.basis})"/>`;
  }
  const point = pointFor(overlay.coordinate, minimum);
  if (overlay.kind === "state-change") {
    return `<rect class="state-change ${basisClass}" x="${point.x - 20}" y="${point.y - 20}" width="40" height="40" rx="5"/><text class="overlay-number" x="${point.x + 16}" y="${point.y - 14}">Δ</text>`;
  }
  const shape = overlay.basis === "regressed-requirement"
    ? `<path class="poi ${basisClass}" d="M ${point.x} ${point.y - 18} L ${point.x + 17} ${point.y + 14} L ${point.x - 17} ${point.y + 14} Z"/>`
    : overlay.basis === "backward-candidate"
      ? `<path class="poi ${basisClass}" d="M ${point.x} ${point.y - 18} L ${point.x + 18} ${point.y} L ${point.x} ${point.y + 18} L ${point.x - 18} ${point.y} Z"/>`
      : `<circle class="poi ${basisClass}" cx="${point.x}" cy="${point.y}" r="18"/>`;
  return `${shape}<text class="overlay-number" x="${point.x + 15}" y="${point.y - 13}">${escapeXml(symbol)}</text>`;
}

function renderLegendEntry(
  overlay: SubgoalEvidenceOverlayV1,
  index: number,
  railX: number,
  symbol: string,
): string {
  const y = 150 + index * 29;
  return [
    `<text class="legend-symbol basis-text-${overlay.basis}" x="${railX}" y="${y}">${escapeXml(symbol)}</text>`,
    `<text class="legend-basis" x="${railX + 22}" y="${y - 8}">${escapeXml(basisLabels[overlay.basis])}</text>`,
    `<text class="legend-label" x="${railX + 22}" y="${y + 8}">${escapeXml(overlay.label)}</text>`,
  ].join("\n");
}

function scopeFooter(view: SubgoalEvidenceViewV1): string {
  if (view.ending.kind === "verified") {
    return "VERIFIED SEGMENT ONLY · CROPPED REVIEW · NOT A FULL ROUTE";
  }
  return view.caseId.startsWith("synthetic-")
    ? "FAILED SYNTHETIC CANARY · EXPECTED AND OBSERVED REMAIN DISTINCT"
    : "FAILED WITNESS · EXPECTED AND OBSERVED REMAIN DISTINCT";
}

function statusLayer(
  selection: SubgoalEvidencePanelSelectionV1,
  gridWidth: number,
  gridHeight: number,
): string {
  if (selection === "expected-ending") {
    return `<rect class="expected-layer" x="${GRID_X}" y="${GRID_Y}" width="${gridWidth}" height="${gridHeight}"/>`;
  }
  if (selection === "actual-failure") {
    return `<rect class="failure-layer" x="${GRID_X}" y="${GRID_Y}" width="${gridWidth}" height="${gridHeight}"/>`;
  }
  return "";
}

function renderMetrics(panel: SubgoalEvidencePanelV1, railX: number, railY: number): string {
  return panel.metrics.map((metric, index) => {
    const y = railY + index * 27;
    return `<text class="metric-label" x="${railX}" y="${y}">${escapeXml(metric.label)}</text><text class="metric-value" x="${railX + 260}" y="${y}" text-anchor="end">${escapeXml(metric.value)}</text>`;
  }).join("\n");
}

function statusDetail(view: SubgoalEvidenceViewV1, selection: SubgoalEvidencePanelSelectionV1): string {
  if (selection === "actual-failure" && view.ending.kind === "failed") {
    return view.ending.firstFailure.detail;
  }
  if (selection === "expected-ending" && view.ending.kind === "failed") {
    return `Expected predicates: ${view.ending.expected.binding.predicateIds.join(", ")}`;
  }
  return "Full-world witness is authoritative; this crop is a derivative review aid.";
}

function metadataFor(
  view: SubgoalEvidenceViewV1,
  panel: SubgoalEvidencePanelV1,
  selection: SubgoalEvidencePanelSelectionV1,
): string {
  return canonicalizeJson({
    metadataType: "p4a-semantic-svg-panel",
    metadataVersion: 1,
    viewId: view.viewId,
    caseId: view.caseId,
    target: view.target,
    subgoalId: view.subgoal.subgoalId,
    selection,
    panelId: panel.panelId,
    panelKind: panel.panelKind,
    binding: panel.binding,
    levelFacts: view.levelFacts,
    plan: view.plan,
    contract: view.contract,
    witness: view.witness,
    viewport: view.viewport,
    correctness: view.correctness,
  });
}

export function renderSubgoalEvidencePanelSvg(
  view: SubgoalEvidenceViewV1,
  selection: SubgoalEvidencePanelSelectionV1,
): string {
  const panel = panelFor(view, selection);
  const { minimum, maximum } = panel.scene.region;
  const columns = maximum.x - minimum.x + 1;
  const rows = maximum.y - minimum.y + 1;
  const gridWidth = columns * TILE_SIZE;
  const gridHeight = rows * TILE_SIZE;
  const railX = GRID_X + gridWidth + 24;
  const width = Math.max(BASE_WIDTH, railX + 296);
  const layoutPanels = panelsForLayout(view);
  const maximumOverlayCount = Math.max(...layoutPanels.map(({ overlayIds }) => overlayIds.length));
  const maximumMetricCount = Math.max(...layoutPanels.map(({ metrics }) => metrics.length));
  const metricStartY = 164 + maximumOverlayCount * 29;
  const metricLastBaseline = metricStartY + 24 + Math.max(0, maximumMetricCount - 1) * 27;
  const footerY = Math.max(376, GRID_Y + gridHeight + 24, metricLastBaseline + 20);
  const height = Math.max(BASE_HEIGHT, footerY + 104);
  const overlayById = new Map(view.overlays.map((overlay) => [overlay.overlayId, overlay]));
  const overlays = panel.overlayIds.map((overlayId) => overlayById.get(overlayId)!);
  let pointOfInterestSequence = 0;
  const overlaySymbols = overlays.map((overlay) => {
    if (overlay.kind === "point-of-interest") return String(++pointOfInterestSequence);
    return overlay.kind === "state-change" ? "Δ" : "→";
  });
  const titleId = `${panel.panelId.replaceAll(/[^a-z0-9_-]/gu, "-")}-title`;
  const descriptionId = `${panel.panelId.replaceAll(/[^a-z0-9_-]/gu, "-")}-description`;
  const status = statusFor(view, selection);
  const tick = panel.binding.kind === "observed" ? String(panel.binding.nativeTick) : "projected";
  const sourceLabel = panel.binding.kind === "observed"
    ? `Exact state ${panel.binding.exactFingerprint}`
    : `Contract ${panel.binding.contractContent.digest}`;
  const renderLabel = panel.binding.kind === "observed"
    ? `Source render ${panel.binding.renderContent.digest}`
    : `Expected predicates ${panel.binding.predicateIds.join(", ")}`;
  const usedBases = [...new Set(overlays.map(({ basis }) => basis))];
  const cellDescriptions = panel.scene.cells.map((cell) => (
    `(${cell.coordinate.x},${cell.coordinate.y},${cell.coordinate.z}) ${itemStackText(cell)}`
  )).join("; ");
  const description = `${panel.accessibleText} ${overlays.map(({ textEquivalent }) => textEquivalent).join(" ")} Exact supplied cell stacks: ${cellDescriptions}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${titleId} ${descriptionId}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<title id="${titleId}">${escapeXml(panel.title)} — ${escapeXml(view.subgoal.title)}</title>`,
    `<desc id="${descriptionId}">${escapeXml(description)}</desc>`,
    `<metadata>${escapeXml(metadataFor(view, panel, selection))}</metadata>`,
    `<style>
      svg { --bg:#f7f7f3; --fg:#1f2328; --muted:#59636e; --line:#8b949e; --cell:#eceee8; --wall:#4c5661; --wall-line:#78838d; --red:#a3392f; --yellow:#d6aa2d; --blue:#276a9b; --hint:#c8b963; --player:#293f7a; --actor:#5f4779; --requirement:#9c3d10; --candidate:#7a5700; --plan:#7a3e76; --observed:#005a8d; --donor:#006b4f; --failure:#b42318; }
      @media (prefers-color-scheme: dark) { svg { --bg:#16181b; --fg:#f0f2f4; --muted:#aab2bb; --line:#6e7781; --cell:#24282d; --wall:#5c6773; --wall-line:#8b949e; --yellow:#d6aa2d; --requirement:#ff9b75; --candidate:#ffd166; --plan:#e6a6e3; --observed:#7cc7ff; --donor:#71d6b5; --failure:#ff8f8a; } }
      text { fill:var(--fg); font-family:ui-sans-serif,system-ui,sans-serif; font-weight:400; }
      .background { fill:var(--bg); }
      .title { font-size:20px; font-weight:500; }
      .status { font-size:13px; font-weight:500; letter-spacing:.6px; }
      .meta,.coordinate-label,.legend-basis,.metric-label,.footer { fill:var(--muted); font-size:11px; }
      .coordinate-label { text-anchor:middle; }
      .cell-canvas { fill:var(--cell); stroke:var(--line); stroke-width:1; }
      .floor-mark { fill:var(--line); }
      .wall { fill:var(--wall); stroke:var(--wall-line); stroke-width:2; }
      .door-red,.key-red { fill:var(--red); }
      .door-yellow { fill:var(--yellow); }
      .key-blue { fill:var(--blue); }
      .hint { fill:var(--hint); }
      .player { fill:var(--player); stroke:var(--fg); stroke-width:2; }
      .facing-arrow { fill:#fff; stroke:var(--fg); stroke-width:.75; }
      .actor { fill:var(--actor); stroke:var(--fg); stroke-width:2; }
      .tile-glyph { fill:#fff; font-size:15px; font-weight:500; text-anchor:middle; }
      .tile-glyph.dark { fill:#20242a; }
      .unknown-glyph { fill:var(--muted); font-size:17px; text-anchor:middle; }
      .route { fill:none; stroke-width:4; stroke-linecap:round; stroke-linejoin:round; }
      .poi { fill:none; stroke-width:3; }
      .state-change { fill:none; stroke-width:4; stroke-dasharray:4 3; }
      .basis-regressed-requirement { stroke:var(--requirement); stroke-dasharray:10 4 2 4; }
      .basis-backward-candidate { stroke:var(--candidate); stroke-dasharray:2 4; }
      .basis-plan-intent { stroke:var(--plan); stroke-dasharray:9 5; }
      .basis-observed-witness { stroke:var(--observed); }
      .basis-donor-evidence { stroke:var(--donor); stroke-dasharray:10 4 2 4; }
      .basis-text-regressed-requirement { fill:var(--requirement); }
      .basis-text-backward-candidate { fill:var(--candidate); }
      .basis-text-plan-intent { fill:var(--plan); }
      .basis-text-observed-witness { fill:var(--observed); }
      .basis-text-donor-evidence { fill:var(--donor); }
      .overlay-number { fill:var(--fg); stroke:var(--bg); stroke-width:3px; paint-order:stroke fill; font-size:11px; font-weight:500; text-anchor:middle; }
      .legend-symbol { font-size:15px; font-weight:500; text-anchor:middle; }
      .legend-label { font-size:12px; }
      .metric-value { font-size:13px; font-weight:500; }
      .divider { stroke:var(--line); stroke-width:1; }
      .failure-text { fill:var(--failure); font-size:12px; font-weight:500; }
      .expected-layer { fill:url(#expected-hatch); pointer-events:none; }
      .failure-layer { fill:url(#failure-hatch); pointer-events:none; }
    </style>`,
    `<defs>${usedBases.map((basis) => `<marker id="arrow-${basis}" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path class="basis-text-${basis}" d="M0,0 L0,6 L8,3 z"/></marker>`).join("")}<pattern id="expected-hatch" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M-2,2 L2,-2 M0,10 L10,0 M8,12 L12,8" stroke="var(--muted)" stroke-width="1" opacity=".28"/></pattern><pattern id="failure-hatch" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0,0 L12,12 M12,0 L0,12" stroke="var(--failure)" stroke-width="1" opacity=".22"/></pattern></defs>`,
    `<rect class="background" x="0" y="0" width="${width}" height="${height}"/>`,
    `<text class="title" x="24" y="32">${escapeXml(panel.title)} · ${escapeXml(view.target.toUpperCase())}</text>`,
    `<text class="status${selection === "actual-failure" ? " failure-text" : ""}" x="24" y="58">${escapeXml(status)}</text>`,
    `<text class="meta" x="24" y="78">${escapeXml(view.caseId)} · ${escapeXml(view.subgoal.subgoalId)} · tick ${escapeXml(tick)} · viewport x${minimum.x}..${maximum.x} y${minimum.y}..${maximum.y} z${minimum.z}</text>`,
    renderCells(panel),
    statusLayer(selection, gridWidth, gridHeight),
    ...overlays.map((overlay, index) => renderOverlayMark(overlay, minimum, overlaySymbols[index]!)),
    `<text class="status" x="${railX}" y="120">Evidence overlays</text>`,
    ...overlays.map((overlay, index) => renderLegendEntry(overlay, index, railX, overlaySymbols[index]!)),
    `<line class="divider" x1="${railX}" y1="${metricStartY - 18}" x2="${railX + 272}" y2="${metricStartY - 18}"/>`,
    `<text class="status" x="${railX}" y="${metricStartY}">Boundary state</text>`,
    renderMetrics(panel, railX, metricStartY + 24),
    `<line class="divider" x1="24" y1="${footerY - 12}" x2="${width - 24}" y2="${footerY - 12}"/>`,
    `<text class="footer" x="24" y="${footerY + 8}">${escapeXml(sourceLabel)}</text>`,
    `<text class="footer" x="24" y="${footerY + 27}">${escapeXml(renderLabel)}</text>`,
    `<text class="${selection === "actual-failure" ? "failure-text" : "footer"}" x="24" y="${footerY + 52}">${escapeXml(statusDetail(view, selection))}</text>`,
    `<text class="footer" x="24" y="${footerY + 76}">${escapeXml(scopeFooter(view))}</text>`,
    `</svg>`,
    "",
  ].join("\n");
}
