import {
  createP4bWholeLevelView,
  renderP4bWholeLevelSvg,
  type P4bWholeLevelViewV1,
} from "@tworld/ccsolver/render";
import type { VerifiedP5Target } from "./checkedP5DossierInput";

type JsonRecord = Record<string, any>;

const PANEL_CELL_SIZE = 48;
const PANEL_CROP_RADIUS = 2;
const STRATUM_COLORS = Object.freeze({
  terrain: "#52616b",
  overlay: "#8f5b2e",
  pickup: "#cf9f17",
  actor: "#006d5b",
  side: "#6f2dbd",
} as const);

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function coordinateText(coordinate: JsonRecord): string {
  return `(${coordinate.x},${coordinate.y},${coordinate.z})`;
}

function identityText(item: JsonRecord): string {
  if (item.identity?.kind === "placement") return item.identity.placementId;
  if (item.identity?.kind === "actor") return item.identity.actorId;
  return item.identity?.semanticId ?? "unknown-identity";
}

function itemText(item: JsonRecord): string {
  const details = [
    `${item.semanticType} [${item.stratum}]`,
    `identity ${identityText(item)}`,
    `source ${item.source}`,
  ];
  if (item.facing !== null) details.push(`facing ${item.facing}`);
  if (item.state !== null) details.push(`state ${item.state}`);
  return details.join(", ");
}

function placementCoordinates(staticOverlay: JsonRecord): ReadonlyMap<string, JsonRecord> {
  return new Map(staticOverlay.placements.map((placement: JsonRecord) => [
    placement.placementId,
    placement.descriptor.coordinate,
  ]));
}

function wholeLevelOverlays(target: VerifiedP5Target): readonly JsonRecord[] {
  const { route, staticOverlay } = target;
  const placements = placementCoordinates(staticOverlay);
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const overlays: JsonRecord[] = [];

  staticOverlay.regions.forEach((region: JsonRecord, index: number) => {
    overlays.push({
      overlayId: `overlay:key-pyramid:${target.target}:region:${String(index).padStart(2, "0")}`,
      kind: "region",
      basis: "static-topology",
      label: `Static region ${index + 1}`,
      textEquivalent: `Checked static topology groups ${region.cellOrdinals.length} supplied cells as ${region.regionId}. This membership does not establish a traversable runtime path.`,
      regionId: region.regionId,
      cellOrdinalsOrder: "cell-ordinal",
      cellOrdinals: region.cellOrdinals,
    });
  });
  staticOverlay.resources.sources.forEach((source: JsonRecord, index: number) => {
    const coordinate = placements.get(source.placementId);
    if (coordinate === undefined) {
      throw new Error(`${target.target} P4B resource source lacks a checked placement coordinate`);
    }
    overlays.push({
      overlayId: `overlay:key-pyramid:${target.target}:resource-source:${String(index).padStart(2, "0")}`,
      kind: "resource-source",
      basis: "source-fact",
      label: `Resource source ${index + 1}: ${source.resourceType}`,
      textEquivalent: `Checked source facts place amount ${source.amount} of ${source.resourceType} at ${coordinateText(coordinate)}.`,
      placementId: source.placementId,
      resourceType: source.resourceType,
      amount: source.amount,
      coordinate,
    });
  });
  staticOverlay.resources.gates.forEach((gate: JsonRecord, index: number) => {
    const coordinate = placements.get(gate.placementId);
    if (coordinate === undefined) {
      throw new Error(`${target.target} P4B resource gate lacks a checked placement coordinate`);
    }
    overlays.push({
      overlayId: `overlay:key-pyramid:${target.target}:resource-gate:${String(index).padStart(2, "0")}`,
      kind: "resource-gate",
      basis: "source-fact",
      label: `Resource gate ${index + 1}: ${gate.resourceType}`,
      textEquivalent: `Checked source facts place a ${gate.kind} gate for ${gate.resourceType} at ${coordinateText(coordinate)}.`,
      placementId: gate.placementId,
      resourceType: gate.resourceType,
      gateKind: gate.kind,
      amount: gate.kind === "remaining-zero" ? null : gate.amount,
      coordinate,
    });
  });

  const routeCoordinates = [route.start, ...route.tileSteps.map((step: JsonRecord) => step.to)];
  overlays.push({
    overlayId: `overlay:key-pyramid:${target.target}:plan-route`,
    kind: "plan-intent-route",
    basis: "plan-intent",
    label: "Checked 162-step route intent",
    textEquivalent: `${targetLabel} checked route intent contains 162 ordered tile steps. Only the seven captured boundaries are observed runtime scenes; this full line is not labeled as per-step observed evidence.`,
    routeId: `route:key-pyramid:${target.target}:checked-intent`,
    coordinatesOrder: "route-order",
    coordinates: routeCoordinates,
  });
  route.subgoals.forEach((subgoal: JsonRecord, index: number) => {
    const firstStep = route.tileSteps[subgoal.firstStepOrder];
    const lastStep = route.tileSteps[subgoal.lastStepOrder];
    const start = firstStep.from;
    const end = lastStep.to;
    const observedStart = target.boundaries[index]!.document.coordinate;
    const observedEnd = target.boundaries[index + 1]!.document.coordinate;
    overlays.push({
      overlayId: `overlay:key-pyramid:${target.target}:plan-subgoal:${String(index).padStart(2, "0")}`,
      kind: "subgoal-span",
      basis: "plan-intent",
      label: `Plan span ${index + 1}: ${subgoal.title}`,
      textEquivalent: `Checked route intent subgoal ${index + 1} starts at ${coordinateText(start)} and ends at ${coordinateText(end)}.`,
      subgoalId: subgoal.subgoalId,
      subgoalOrder: index,
      start,
      end,
    });
    overlays.push({
      overlayId: `overlay:key-pyramid:${target.target}:observed-subgoal:${String(index).padStart(2, "0")}`,
      kind: "subgoal-span",
      basis: "observed-witness",
      label: `Captured boundary span ${index + 1}`,
      textEquivalent: `Exact same-run boundary captures for subgoal ${index + 1} are at ${coordinateText(observedStart)} and ${coordinateText(observedEnd)}. No intermediate runtime scene is claimed.`,
      subgoalId: subgoal.subgoalId,
      subgoalOrder: index,
      start: observedStart,
      end: observedEnd,
    });
  });
  return overlays;
}

export function createKeyPyramidWholeLevelView(target: VerifiedP5Target): P4bWholeLevelViewV1 {
  const initial = target.boundaries[0]!.document;
  const render = initial.render;
  const staticOverlay = target.staticOverlay;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  if (
    staticOverlay.geometry?.width !== 32
    || staticOverlay.geometry?.height !== 32
    || staticOverlay.geometry?.depth !== 1
    || render.cellsOrder !== "z-y-x"
    || render.cells?.length !== 1_024
    || render.target !== target.target
  ) {
    throw new Error(`${target.target} P4B whole-map scene is not the checked 32x32 initial render`);
  }
  return createP4bWholeLevelView({
    viewType: "p4b-whole-level-view",
    viewVersion: 1,
    viewId: `view:key-pyramid:${target.target}:p4b-whole-level`,
    caseId: "cclp1-001",
    title: `Key Pyramid · ${targetLabel} · checked whole-level evidence`,
    target: target.target,
    level: render.level,
    geometry: staticOverlay.geometry,
    bindings: {
      levelFactsContent: staticOverlay.source.levelFacts,
      sceneContent: initial.renderContent,
      staticAnalysisContent: staticOverlay.source.staticAnalysis,
      planContent: target.files.plan.content,
      witnessContent: target.files.witness.content,
    },
    cellsOrder: "z-y-x",
    cells: render.cells,
    overlaysOrder: "basis-kind-id",
    overlays: wholeLevelOverlays(target),
    accessibleText: `${targetLabel} Key Pyramid 32 by 32 checked initial full-map render. Source-fact resource markers, checked static-region memberships, a checked route-intent line, and exact observed start/end boundary markers are evidence-labeled separately. The route line is not per-step runtime observation.`,
    correctness: {
      suppliedCellsAreAuthoritative: true,
      rendererInventsNoTiles: true,
      overlaysDoNotEstablishCausality: true,
    },
  });
}

export function renderKeyPyramidWholeLevelSvg(target: VerifiedP5Target): string {
  const svg = renderP4bWholeLevelSvg(createKeyPyramidWholeLevelView(target));
  const prefix = `p4b-${target.target}`;
  return svg
    .replaceAll("p4b-title", `${prefix}-title`)
    .replaceAll("p4b-description", `${prefix}-description`);
}

export function exactBoundaryStack(target: VerifiedP5Target, boundaryOrder: number): string {
  const boundary = target.boundaries[boundaryOrder]?.document;
  if (boundary === undefined) throw new Error(`${target.target} P4B boundary ${boundaryOrder} missing`);
  const { coordinate } = boundary;
  const ordinal = coordinate.z * 32 * 32 + coordinate.y * 32 + coordinate.x;
  const cell = boundary.render.cells[ordinal];
  if (
    cell?.cellOrdinal !== ordinal
    || cell.coordinate.x !== coordinate.x
    || cell.coordinate.y !== coordinate.y
    || cell.coordinate.z !== coordinate.z
  ) {
    throw new Error(`${target.target} P4B boundary ${boundaryOrder} exact coordinate cell drifted`);
  }
  return cell.items.length === 0
    ? "No supplied semantic items"
    : cell.items.map((item: JsonRecord) => itemText(item)).join("; ");
}

export function renderExactBoundaryPanelSvg(
  target: VerifiedP5Target,
  boundaryOrder: number,
): string {
  const boundary = target.boundaries[boundaryOrder]?.document;
  if (boundary === undefined) throw new Error(`${target.target} P4B boundary ${boundaryOrder} missing`);
  const center = boundary.coordinate;
  const minimumX = Math.max(0, center.x - PANEL_CROP_RADIUS);
  const maximumX = Math.min(31, center.x + PANEL_CROP_RADIUS);
  const minimumY = Math.max(0, center.y - PANEL_CROP_RADIUS);
  const maximumY = Math.min(31, center.y + PANEL_CROP_RADIUS);
  const columns = maximumX - minimumX + 1;
  const rows = maximumY - minimumY + 1;
  const mapX = 24;
  const mapY = 64;
  const mapWidth = columns * PANEL_CELL_SIZE;
  const mapHeight = rows * PANEL_CELL_SIZE;
  const width = mapWidth + 296;
  const height = Math.max(348, mapHeight + 106);
  const idPrefix = `boundary-${target.target}-${boundaryOrder}`;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const cells: string[] = [];
  for (let y = minimumY; y <= maximumY; y += 1) {
    for (let x = minimumX; x <= maximumX; x += 1) {
      const ordinal = y * 32 + x;
      const cell = boundary.render.cells[ordinal] as JsonRecord;
      if (cell?.cellOrdinal !== ordinal || cell.coordinate.x !== x || cell.coordinate.y !== y) {
        throw new Error(`${target.target} P4B boundary ${boundaryOrder} crop cell ${ordinal} drifted`);
      }
      const atX = mapX + (x - minimumX) * PANEL_CELL_SIZE;
      const atY = mapY + (y - minimumY) * PANEL_CELL_SIZE;
      const stack = cell.items.length === 0
        ? "No supplied semantic items"
        : cell.items.map((item: JsonRecord) => itemText(item)).join("; ");
      cells.push(
        `<g class="panel-cell" data-cell-ordinal="${ordinal}" data-stack="${escapeXml(stack)}">`,
        `<title>Cell (${x},${y},0). ${escapeXml(stack)}</title>`,
        `<rect x="${atX}" y="${atY}" width="${PANEL_CELL_SIZE}" height="${PANEL_CELL_SIZE}" fill="#f7f4ec" stroke="#a7b0b5"/>`,
      );
      cell.items.forEach((item: JsonRecord, itemIndex: number) => {
        const stripeHeight = Math.max(5, Math.floor((PANEL_CELL_SIZE - 8) / cell.items.length));
        const color = STRATUM_COLORS[item.stratum as keyof typeof STRATUM_COLORS] ?? "#263238";
        cells.push(
          `<rect x="${atX + 4}" y="${atY + 4 + itemIndex * stripeHeight}" width="${PANEL_CELL_SIZE - 8}" height="${stripeHeight - 1}" rx="2" fill="${color}"><title>${escapeXml(itemText(item))}</title></rect>`,
        );
      });
      const shortType = cell.items.at(-1)?.semanticType?.replace(/^cc1:/u, "") ?? "empty";
      cells.push(
        `<text x="${atX + PANEL_CELL_SIZE / 2}" y="${atY + PANEL_CELL_SIZE - 6}" text-anchor="middle" font-size="8" font-family="system-ui,sans-serif" fill="#111">${escapeXml(shortType.slice(0, 10))}</text>`,
      );
      if (x === center.x && y === center.y) {
        cells.push(
          `<rect x="${atX + 2}" y="${atY + 2}" width="${PANEL_CELL_SIZE - 4}" height="${PANEL_CELL_SIZE - 4}" fill="none" stroke="#d1495b" stroke-width="4"><title>Exact boundary coordinate</title></rect>`,
        );
      }
      cells.push("</g>");
    }
  }
  const legendX = mapX + mapWidth + 28;
  const description = `${targetLabel} exact boundary ${boundaryOrder}, native tick ${boundary.nativeTick}, coordinate ${coordinateText(center)}, remaining chips ${boundary.remainingChips}, terminal ${boundary.terminalKind}. This is a literal crop of supplied render cells; cells outside the crop are omitted, never inferred.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${idPrefix}-title ${idPrefix}-description">`,
    `<title id="${idPrefix}-title">${escapeXml(`${targetLabel} boundary ${boundaryOrder}`)}</title>`,
    `<desc id="${idPrefix}-description">${escapeXml(description)}</desc>`,
    `<rect width="${width}" height="${height}" fill="#fffdf8"/>`,
    `<text x="${mapX}" y="28" font="700 18px system-ui,sans-serif" fill="#17202a">${escapeXml(`${targetLabel} boundary ${String(boundaryOrder).padStart(2, "0")}`)}</text>`,
    `<text x="${mapX}" y="48" font="12px system-ui,sans-serif" fill="#52616b">${escapeXml(`tick ${boundary.nativeTick} · ${coordinateText(center)} · ${boundary.remainingChips} chips remain · ${boundary.terminalKind}`)}</text>`,
    ...cells,
    `<text x="${legendX}" y="78" font="700 12px system-ui,sans-serif" fill="#17202a">Literal semantic strata</text>`,
    ...Object.entries(STRATUM_COLORS).flatMap(([stratum, color], index) => [
      `<rect x="${legendX}" y="${94 + index * 28}" width="18" height="18" rx="2" fill="${color}"/>`,
      `<text x="${legendX + 28}" y="${108 + index * 28}" font="12px system-ui,sans-serif" fill="#263238">${stratum}</text>`,
    ]),
    `<text x="${legendX}" y="256" font="700 11px system-ui,sans-serif" fill="#d1495b">Red outline = exact boundary cell</text>`,
    `<text x="${mapX}" y="${height - 24}" font="11px system-ui,sans-serif" fill="#52616b">Supplied cells only · outside-crop cells omitted · no terrain inferred</text>`,
    "</svg>",
  ].join("\n");
}
