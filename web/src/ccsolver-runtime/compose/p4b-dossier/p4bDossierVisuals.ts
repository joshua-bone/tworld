import {
  createP4bWholeLevelView,
  type P4bWholeLevelViewV1,
} from "@tworld/ccsolver/render";
import type { VerifiedP5Target } from "./checkedP5DossierInput";
import {
  p4bArtworkSpriteFor,
  type P4bArtworkSprite,
  type P4bLegacyArtworkAtlas,
} from "./p4bLegacyArtwork";

type JsonRecord = Record<string, any>;

type Coordinate = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

type Crop = {
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumY: number;
  readonly maximumY: number;
};

export type KeyPyramidSegmentView = {
  readonly target: "ms" | "lynx";
  readonly subgoalOrder: number;
  readonly sceneBoundaryOrder: number;
  readonly crop: Crop;
  readonly routeCoordinates: readonly Coordinate[];
  readonly localVisitOrders: readonly number[];
  readonly globalVisitOrders: readonly number[];
  readonly observedStart: Coordinate;
  readonly observedEnd: Coordinate;
};

const GRID_WIDTH = 32;
const GRID_HEIGHT = 32;
const WHOLE_CELL_SIZE = 32;
const SEGMENT_CELL_SIZE = 48;
const PANEL_CELL_SIZE = 48;
const PANEL_CROP_RADIUS = 2;
const SEGMENT_CROP_PADDING = 1;

const SVG_STYLESHEET = `<style>
  .map-background{fill:#10151b}
  .game-artwork-cell{shape-rendering:crispEdges}
  .game-artwork-sprite{overflow:hidden;image-rendering:pixelated}
  .game-artwork-sprite image{image-rendering:pixelated}
  .cell-hit-target{fill:transparent;stroke:rgba(255,255,255,.08);stroke-width:.5;pointer-events:all}
  .region-member{fill:#4ea8de;fill-opacity:.18;stroke:#8ed8ff;stroke-opacity:.6;stroke-width:1;pointer-events:none}
  .resource-marker{fill:rgba(16,21,27,.72);stroke-width:3;vector-effect:non-scaling-stroke}
  .resource-marker--source{stroke:#ffe66d}
  .resource-marker--gate{stroke:#ff758f}
  .overlay-evidence-glyph{fill:#fff;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:9px;font-weight:850;text-anchor:middle;dominant-baseline:middle}
  .route-halo,.route-line{fill:none;stroke-linecap:round;stroke-linejoin:round;pointer-events:stroke;vector-effect:non-scaling-stroke}
  .route-halo{stroke:#fff;stroke-opacity:.9;stroke-width:6}
  .route-line{stroke:#6f2dbd;stroke-width:3}
  .route-visit-badge{cursor:help;pointer-events:all}
  .route-visit-badge rect{fill:#fff;fill-opacity:.9;stroke:#111;stroke-width:1.25;vector-effect:non-scaling-stroke}
  .route-visit-badge text,.segment-marker text{fill:#111;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-stretch:normal;font-variant-numeric:tabular-nums;font-weight:750;text-anchor:middle;dominant-baseline:middle}
  .segment-marker{cursor:help;pointer-events:all}
  .segment-marker circle{stroke:#111;stroke-width:1.5;vector-effect:non-scaling-stroke}
  .segment-marker--start circle{fill:#b9fbc0}
  .segment-marker--end circle{fill:#ffd166}
  .observed-boundary{fill:none;stroke-width:3;vector-effect:non-scaling-stroke;pointer-events:stroke}
  .observed-boundary--start{stroke:#007f5f}
  .observed-boundary--end{stroke:#d1495b;stroke-dasharray:5 3}
  .exact-boundary-cell{fill:none;stroke:#d1495b;stroke-width:4;vector-effect:non-scaling-stroke;pointer-events:stroke}
</style>`;

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function coordinateText(coordinate: Coordinate): string {
  return `(${coordinate.x},${coordinate.y},${coordinate.z})`;
}

function coordinatesEqual(left: Coordinate, right: Coordinate): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
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

function compactCellText(cell: JsonRecord): string {
  const semantics = cell.items.map((item: JsonRecord) => item.semanticType).join(" + ");
  return `Cell ${coordinateText(cell.coordinate)}: ${semantics || "no supplied semantic items"}`;
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
      textEquivalent: `Checked source facts place amount ${source.amount} of ${source.resourceType} at ${coordinateText(coordinate as Coordinate)}.`,
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
      textEquivalent: `Checked source facts place a ${gate.kind} gate for ${gate.resourceType} at ${coordinateText(coordinate as Coordinate)}.`,
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

/** Retains the checked, typed P4B evidence DTO for downstream audits. */
export function createKeyPyramidWholeLevelView(target: VerifiedP5Target): P4bWholeLevelViewV1 {
  const initial = target.boundaries[0]!.document;
  const render = initial.render;
  const staticOverlay = target.staticOverlay;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  if (
    staticOverlay.geometry?.width !== GRID_WIDTH
    || staticOverlay.geometry?.height !== GRID_HEIGHT
    || staticOverlay.geometry?.depth !== 1
    || render.cellsOrder !== "z-y-x"
    || render.cells?.length !== GRID_WIDTH * GRID_HEIGHT
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

function assertArtwork(target: VerifiedP5Target, artwork: P4bLegacyArtworkAtlas): void {
  if (artwork.target !== target.target) {
    throw new Error(`P4B ${target.target} view received ${artwork.target} artwork`);
  }
  if (artwork.expandedArtworkIncluded !== false) {
    throw new Error("P4B standard dossier refuses expanded artwork");
  }
}

function sceneCell(scene: JsonRecord, x: number, y: number): JsonRecord {
  const ordinal = y * GRID_WIDTH + x;
  const cell = scene.render.cells[ordinal] as JsonRecord | undefined;
  if (
    cell?.cellOrdinal !== ordinal
    || cell.coordinate?.x !== x
    || cell.coordinate?.y !== y
    || cell.coordinate?.z !== 0
  ) {
    throw new Error(`P4B checked scene cell ${ordinal} drifted from z-y-x ordering`);
  }
  return cell;
}

function artworkImage(
  artwork: P4bLegacyArtworkAtlas,
  sprite: P4bArtworkSprite,
  x: number,
  y: number,
  size: number,
  semanticType: string,
  className: string,
): string {
  return [
    `<svg class="game-artwork-sprite ${escapeXml(className)}" data-semantic-type="${escapeXml(semanticType)}" x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${sprite.sourceX} ${sprite.sourceY} ${sprite.sourceWidth} ${sprite.sourceHeight}" preserveAspectRatio="none">`,
    `<image href="${escapeXml(artwork.href)}" x="0" y="0" width="${artwork.sourceWidth}" height="${artwork.sourceHeight}" preserveAspectRatio="none"/>`,
    "</svg>",
  ].join("");
}

function renderArtworkCell(
  scene: JsonRecord,
  x: number,
  y: number,
  crop: Crop,
  cellSize: number,
  artwork: P4bLegacyArtworkAtlas,
): string {
  const cell = sceneCell(scene, x, y);
  const atX = (x - crop.minimumX) * cellSize;
  const atY = (y - crop.minimumY) * cellSize;
  const exactStack = cell.items.length === 0
    ? "No supplied semantic items"
    : cell.items.map((item: JsonRecord) => itemText(item)).join("; ");
  const floor = p4bArtworkSpriteFor(artwork, "cc1:floor", null);
  const parts = [
    `<g class="game-artwork-cell" data-cell-ordinal="${cell.cellOrdinal}" data-coordinate="${x},${y},0" data-exact-stack="${escapeXml(exactStack)}" data-tooltip="${escapeXml(compactCellText(cell))}">`,
    `<title>${escapeXml(`${compactCellText(cell)}. Exact stack: ${exactStack}. A presentation-only empty-floor artwork underlay is used solely to composite transparent standard game sprites; it is not added to the observed semantic stack.`)}</title>`,
    `<rect x="${atX}" y="${atY}" width="${cellSize}" height="${cellSize}" fill="#111820"/>`,
    `<g class="presentation-floor-underlay" data-presentation-only="true"><title>presentation-only empty-floor artwork underlay; not an observed semantic item</title>${artworkImage(artwork, floor, atX, atY, cellSize, "cc1:floor", "game-artwork-underlay")}</g>`,
  ];
  for (const item of cell.items as JsonRecord[]) {
    const sprite = p4bArtworkSpriteFor(artwork, item.semanticType, item.facing);
    parts.push(artworkImage(
      artwork,
      sprite,
      atX,
      atY,
      cellSize,
      item.semanticType,
      `game-artwork-item game-artwork-item--${item.stratum}`,
    ));
  }
  parts.push(
    `<rect class="cell-hit-target" x="${atX}" y="${atY}" width="${cellSize}" height="${cellSize}"/>`,
    "</g>",
  );
  return parts.join("");
}

function renderArtworkCells(
  scene: JsonRecord,
  crop: Crop,
  cellSize: number,
  artwork: P4bLegacyArtworkAtlas,
): string {
  const cells: string[] = [];
  for (let y = crop.minimumY; y <= crop.maximumY; y += 1) {
    for (let x = crop.minimumX; x <= crop.maximumX; x += 1) {
      cells.push(renderArtworkCell(scene, x, y, crop, cellSize, artwork));
    }
  }
  return cells.join("\n");
}

function mapPoint(coordinate: Coordinate, crop: Crop, cellSize: number): { readonly x: number; readonly y: number } {
  return {
    x: (coordinate.x - crop.minimumX + 0.5) * cellSize,
    y: (coordinate.y - crop.minimumY + 0.5) * cellSize,
  };
}

function routeLines(coordinates: readonly Coordinate[], crop: Crop, cellSize: number): string {
  const points = coordinates.map((coordinate) => {
    const point = mapPoint(coordinate, crop, cellSize);
    return `${point.x},${point.y}`;
  }).join(" ");
  return [
    `<polyline class="route-halo" points="${points}"/>`,
    `<polyline class="route-line" points="${points}"/>`,
  ].join("");
}

function wholeMapEvidenceOverlays(target: VerifiedP5Target, crop: Crop): string {
  return wholeLevelOverlays(target).flatMap((overlay: JsonRecord) => {
    if (overlay.kind === "region") {
      return [`<g class="overlay overlay--region" tabindex="0" data-region-id="${escapeXml(overlay.regionId)}" aria-label="${escapeXml(overlay.textEquivalent)}"><title>${escapeXml(overlay.textEquivalent)}</title>${overlay.cellOrdinals.map((ordinal: number) => {
        const x = ordinal % GRID_WIDTH;
        const y = Math.floor(ordinal / GRID_WIDTH);
        return `<rect class="region-member" x="${(x - crop.minimumX) * WHOLE_CELL_SIZE + 1}" y="${(y - crop.minimumY) * WHOLE_CELL_SIZE + 1}" width="${WHOLE_CELL_SIZE - 2}" height="${WHOLE_CELL_SIZE - 2}"/>`;
      }).join("")}</g>`];
    }
    if (overlay.kind === "resource-source" || overlay.kind === "resource-gate") {
      const point = mapPoint(overlay.coordinate as Coordinate, crop, WHOLE_CELL_SIZE);
      const isSource = overlay.kind === "resource-source";
      const glyph = isSource ? "S" : "G";
      const shape = isSource
        ? `<circle class="resource-marker resource-marker--source" cx="${point.x}" cy="${point.y}" r="${WHOLE_CELL_SIZE * 0.31}"/>`
        : `<rect class="resource-marker resource-marker--gate" x="${point.x - WHOLE_CELL_SIZE * 0.31}" y="${point.y - WHOLE_CELL_SIZE * 0.31}" width="${WHOLE_CELL_SIZE * 0.62}" height="${WHOLE_CELL_SIZE * 0.62}" rx="3"/>`;
      return [`<g class="overlay overlay--${overlay.kind}" tabindex="0" data-resource-type="${escapeXml(overlay.resourceType)}" data-coordinate="${overlay.coordinate.x},${overlay.coordinate.y},${overlay.coordinate.z}" aria-label="${escapeXml(overlay.textEquivalent)}"><title>${escapeXml(overlay.textEquivalent)}</title>${shape}<text class="overlay-evidence-glyph" x="${point.x}" y="${point.y + 0.5}">${glyph}</text></g>`];
    }
    return [];
  }).join("\n");
}

function fullMapSegmentMarkers(target: VerifiedP5Target, crop: Crop): string {
  return target.route.subgoals.map((subgoal: JsonRecord, subgoalOrder: number) => {
    const plannedStart = target.route.tileSteps[subgoal.firstStepOrder]?.from as Coordinate | undefined;
    const plannedEnd = target.route.tileSteps[subgoal.lastStepOrder]?.to as Coordinate | undefined;
    const observedStart = target.boundaries[subgoalOrder]?.document.coordinate as Coordinate | undefined;
    const observedEnd = target.boundaries[subgoalOrder + 1]?.document.coordinate as Coordinate | undefined;
    if (
      plannedStart === undefined
      || plannedEnd === undefined
      || observedStart === undefined
      || observedEnd === undefined
      || !coordinatesEqual(plannedStart, observedStart)
      || !coordinatesEqual(plannedEnd, observedEnd)
    ) {
      throw new Error(`${target.target} P4B segment ${subgoalOrder} plan/boundary coordinates drifted`);
    }
    const start = mapPoint(observedStart, crop, WHOLE_CELL_SIZE);
    const end = mapPoint(observedEnd, crop, WHOLE_CELL_SIZE);
    const offset = WHOLE_CELL_SIZE * 0.2;
    const radius = WHOLE_CELL_SIZE * 0.17;
    return [
      `<g class="segment-marker segment-marker--start" tabindex="0" data-segment-order="${subgoalOrder}" data-tooltip="${escapeXml(`Segment ${subgoalOrder + 1} exact observed start boundary ${subgoalOrder} at ${coordinateText(observedStart)}`)}" aria-label="${escapeXml(`Segment ${subgoalOrder + 1} exact observed start boundary ${subgoalOrder} at ${coordinateText(observedStart)}`)}">`,
      `<title>${escapeXml(`Segment ${subgoalOrder + 1}: exact observed start boundary ${subgoalOrder} at ${coordinateText(observedStart)}. The route between captured boundaries remains plan intent.`)}</title>`,
      `<circle cx="${start.x - offset}" cy="${start.y - offset}" r="${radius}"/><text x="${start.x - offset}" y="${start.y - offset + 0.5}" font-size="7">S${subgoalOrder + 1}</text></g>`,
      `<g class="segment-marker segment-marker--end" tabindex="0" data-segment-order="${subgoalOrder}" data-tooltip="${escapeXml(`Segment ${subgoalOrder + 1} exact observed end boundary ${subgoalOrder + 1} at ${coordinateText(observedEnd)}`)}" aria-label="${escapeXml(`Segment ${subgoalOrder + 1} exact observed end boundary ${subgoalOrder + 1} at ${coordinateText(observedEnd)}`)}">`,
      `<title>${escapeXml(`Segment ${subgoalOrder + 1}: exact observed end boundary ${subgoalOrder + 1} at ${coordinateText(observedEnd)}. This marker does not make intermediate route positions observed evidence.`)}</title>`,
      `<circle cx="${end.x + offset}" cy="${end.y + offset}" r="${radius}"/><text x="${end.x + offset}" y="${end.y + offset + 0.5}" font-size="7">E${subgoalOrder + 1}</text></g>`,
    ].join("");
  }).join("\n");
}

export function renderKeyPyramidWholeLevelSvg(
  target: VerifiedP5Target,
  artwork: P4bLegacyArtworkAtlas,
): string {
  assertArtwork(target, artwork);
  createKeyPyramidWholeLevelView(target);
  const scene = target.boundaries[0]!.document;
  const crop: Crop = { minimumX: 0, maximumX: 31, minimumY: 0, maximumY: 31 };
  const width = GRID_WIDTH * WHOLE_CELL_SIZE;
  const height = GRID_HEIGHT * WHOLE_CELL_SIZE;
  const routeCoordinates = [target.route.start, ...target.route.tileSteps.map((step: JsonRecord) => step.to)] as Coordinate[];
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const description = `${targetLabel} Key Pyramid whole-level solution over the exact checked starting boundary artwork. Optional checked static-region and source-fact resource overlays sit above standard game artwork. The 162-step line is plan intent, not per-step observed evidence. Compact S1/E1 through S6/E6 markers are exact captured boundary coordinates. Open a segment for complete local movement numbering; waits are omitted.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="p4b-artwork-root p4b-whole-level-artwork" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="p4b-${target.target}-title p4b-${target.target}-description" data-artwork-source="${escapeXml(artwork.sourcePath)}" data-scene-boundary-order="0">`,
    `<title id="p4b-${target.target}-title">${escapeXml(`${targetLabel} Key Pyramid whole-level solution`)}</title>`,
    `<desc id="p4b-${target.target}-description">${escapeXml(description)}</desc>`,
    `<metadata>${escapeXml(JSON.stringify({
      artwork: { expandedArtworkIncluded: false, sourcePath: artwork.sourcePath, target: artwork.target },
      evidence: { route: "plan-intent", sceneBoundaryOrder: 0, segmentMarkers: "observed-witness", staticContext: ["static-topology", "source-fact"] },
      scene: scene.renderContent,
    }))}</metadata>`,
    SVG_STYLESHEET,
    `<rect class="map-background" width="${width}" height="${height}"/>`,
    renderArtworkCells(scene, crop, WHOLE_CELL_SIZE, artwork),
    wholeMapEvidenceOverlays(target, crop),
    `<g class="overlay overlay--plan-intent-route" data-tooltip="Plan-intent route; not per-step observed evidence"><title>Plan-intent route; not per-step observed evidence. Complete movement numbering is presented in each cropped segment.</title>${routeLines(routeCoordinates, crop, WHOLE_CELL_SIZE)}</g>`,
    `<g class="overlay overlay--subgoal-span">${fullMapSegmentMarkers(target, crop)}</g>`,
    "</svg>",
  ].join("\n");
}

function checkedRouteCoordinates(target: VerifiedP5Target, subgoalOrder: number): {
  readonly coordinates: readonly Coordinate[];
  readonly globalVisitOrders: readonly number[];
} {
  if (!Number.isInteger(subgoalOrder) || subgoalOrder < 0 || subgoalOrder >= target.route.subgoals.length) {
    throw new Error(`${target.target} P4B segment order ${subgoalOrder} is outside the checked route`);
  }
  const subgoal = target.route.subgoals[subgoalOrder] as JsonRecord;
  const firstStepOrder = subgoal.firstStepOrder as number;
  const lastStepOrder = subgoal.lastStepOrder as number;
  const steps = target.route.tileSteps.slice(firstStepOrder, lastStepOrder + 1) as JsonRecord[];
  if (steps.length !== lastStepOrder - firstStepOrder + 1 || steps.length === 0) {
    throw new Error(`${target.target} P4B segment ${subgoalOrder} has an invalid checked step span`);
  }
  steps.forEach((step, index) => {
    if (step.stepOrder !== firstStepOrder + index) {
      throw new Error(`${target.target} P4B segment ${subgoalOrder} step order drifted`);
    }
    if (index > 0 && !coordinatesEqual(steps[index - 1]!.to, step.from)) {
      throw new Error(`${target.target} P4B segment ${subgoalOrder} route is discontinuous`);
    }
  });
  const coordinates = [steps[0]!.from, ...steps.map((step) => step.to)] as Coordinate[];
  return {
    coordinates,
    globalVisitOrders: coordinates.map((_, localOrder) => firstStepOrder + localOrder),
  };
}

function routeCrop(coordinates: readonly Coordinate[], observedStart: Coordinate, observedEnd: Coordinate): Crop {
  const all = [...coordinates, observedStart, observedEnd];
  if (all.some((coordinate) => coordinate.z !== 0)) {
    throw new Error("P4B Key Pyramid segment crop only supports checked z=0 coordinates");
  }
  return {
    minimumX: Math.max(0, Math.min(...all.map(({ x }) => x)) - SEGMENT_CROP_PADDING),
    maximumX: Math.min(GRID_WIDTH - 1, Math.max(...all.map(({ x }) => x)) + SEGMENT_CROP_PADDING),
    minimumY: Math.max(0, Math.min(...all.map(({ y }) => y)) - SEGMENT_CROP_PADDING),
    maximumY: Math.min(GRID_HEIGHT - 1, Math.max(...all.map(({ y }) => y)) + SEGMENT_CROP_PADDING),
  };
}

export function createKeyPyramidSegmentView(
  target: VerifiedP5Target,
  subgoalOrder: number,
): KeyPyramidSegmentView {
  const route = checkedRouteCoordinates(target, subgoalOrder);
  const observedStart = target.boundaries[subgoalOrder]?.document.coordinate as Coordinate | undefined;
  const observedEnd = target.boundaries[subgoalOrder + 1]?.document.coordinate as Coordinate | undefined;
  if (observedStart === undefined || observedEnd === undefined) {
    throw new Error(`${target.target} P4B segment ${subgoalOrder} lacks its exact boundary scenes`);
  }
  if (
    !coordinatesEqual(route.coordinates[0]!, observedStart)
    || !coordinatesEqual(route.coordinates.at(-1)!, observedEnd)
  ) {
    throw new Error(`${target.target} P4B segment ${subgoalOrder} plan/boundary coordinate join drifted`);
  }
  return Object.freeze({
    target: target.target,
    subgoalOrder,
    sceneBoundaryOrder: subgoalOrder,
    crop: routeCrop(route.coordinates, observedStart, observedEnd),
    routeCoordinates: Object.freeze(route.coordinates),
    localVisitOrders: Object.freeze(route.coordinates.map((_, localOrder) => localOrder)),
    globalVisitOrders: Object.freeze(route.globalVisitOrders),
    observedStart,
    observedEnd,
  });
}

type GroupedVisits = {
  readonly coordinate: Coordinate;
  readonly local: number[];
  readonly global: number[];
};

function groupRouteVisits(view: KeyPyramidSegmentView): readonly GroupedVisits[] {
  const groups = new Map<string, GroupedVisits>();
  view.routeCoordinates.forEach((coordinate, index) => {
    const key = `${coordinate.x},${coordinate.y},${coordinate.z}`;
    const existing = groups.get(key);
    if (existing) {
      existing.local.push(view.localVisitOrders[index]!);
      existing.global.push(view.globalVisitOrders[index]!);
    } else {
      groups.set(key, {
        coordinate,
        local: [view.localVisitOrders[index]!],
        global: [view.globalVisitOrders[index]!],
      });
    }
  });
  return [...groups.values()];
}

function wrapVisitLabels(visits: readonly number[], maximumCharacters = 7): readonly string[] {
  const lines: string[] = [];
  let current = "";
  for (const visit of visits) {
    const next = current.length === 0 ? String(visit) : `${current}·${visit}`;
    if (current.length > 0 && next.length > maximumCharacters) {
      lines.push(current);
      current = String(visit);
    } else {
      current = next;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function plannedEventsAtVisits(
  target: VerifiedP5Target,
  globalVisits: readonly number[],
): readonly string[] {
  const arrivalStepOrders = new Set(globalVisits.filter((visit) => visit > 0).map((visit) => visit - 1));
  return (target.route.events as JsonRecord[])
    .filter((event) => arrivalStepOrders.has(event.afterStepOrder))
    .map((event) => `event ${event.eventOrder}: ${event.kind} ${event.semanticType} (plan intent)`);
}

function renderRouteVisitBadges(
  target: VerifiedP5Target,
  view: KeyPyramidSegmentView,
  scene: JsonRecord,
): string {
  const subgoal = target.route.subgoals[view.subgoalOrder] as JsonRecord;
  const sceneTick = target.boundaries[view.sceneBoundaryOrder]!.document.nativeTick;
  return groupRouteVisits(view).map((group) => {
    const point = mapPoint(group.coordinate, view.crop, SEGMENT_CELL_SIZE);
    const cell = sceneCell(scene, group.coordinate.x, group.coordinate.y);
    const exactStack = cell.items.length === 0
      ? "No supplied semantic items"
      : cell.items.map((item: JsonRecord) => itemText(item)).join("; ");
    const artworkNames = cell.items.length === 0
      ? "empty-floor presentation underlay only"
      : cell.items.map((item: JsonRecord) => item.semanticType).join(", ");
    const events = plannedEventsAtVisits(target, group.global);
    const lines = wrapVisitLabels(group.local);
    const fontSize = 9;
    const lineHeight = 10;
    const longest = Math.max(...lines.map((line) => line.length));
    const width = Math.min(SEGMENT_CELL_SIZE - 5, Math.max(18, longest * 5.6 + 8));
    const height = Math.min(SEGMENT_CELL_SIZE - 5, lines.length * lineHeight + 6);
    const top = point.y - height / 2;
    const title = `Local visits ${group.local.join(", ")} at ${coordinateText(group.coordinate)}; corresponding whole-route visits ${group.global.join(", ")}. Ordered movement arrivals only; waits omitted.`;
    const detail = [
      title,
      `Segment ${view.subgoalOrder + 1}: ${subgoal.title} (${subgoal.subgoalId}).`,
      `Starting boundary ${String(view.sceneBoundaryOrder).padStart(2, "0")} at native tick ${sceneTick}.`,
      `Artwork tiles: ${artworkNames}.`,
      `Exact starting-scene semantic stack: ${exactStack}.`,
      events.length === 0 ? "No planned semantic event is attached to these arrivals." : `Planned events: ${events.join("; ")}.`,
      "Evidence basis: route and event labels are plan intent; artwork is the exact observed starting-boundary scene; no intermediate observation is claimed.",
    ].join(" ");
    return [
      `<g class="route-visit-badge" tabindex="0" data-local-visits="${group.local.join(",")}" data-global-visits="${group.global.join(",")}" data-coordinate="${group.coordinate.x},${group.coordinate.y},${group.coordinate.z}" data-route-detail="${escapeXml(detail)}" data-tooltip="${escapeXml(title)}" aria-label="${escapeXml(detail)}">`,
      `<title>${escapeXml(detail)}</title>`,
      `<rect x="${point.x - width / 2}" y="${top}" width="${width}" height="${height}" rx="4"/>`,
      ...lines.map((line, lineIndex) => (
        `<text x="${point.x}" y="${top + 6 + lineIndex * lineHeight + lineHeight / 2}" font-size="${fontSize}">${escapeXml(line)}</text>`
      )),
      "</g>",
    ].join("");
  }).join("\n");
}

function renderObservedSegmentBoundaries(
  target: VerifiedP5Target,
  view: KeyPyramidSegmentView,
): string {
  const startPoint = mapPoint(view.observedStart, view.crop, SEGMENT_CELL_SIZE);
  const endPoint = mapPoint(view.observedEnd, view.crop, SEGMENT_CELL_SIZE);
  const startBoundary = target.boundaries[view.subgoalOrder]!.document;
  const endBoundary = target.boundaries[view.subgoalOrder + 1]!.document;
  const inset = 2;
  const size = SEGMENT_CELL_SIZE - inset * 2;
  return [
    `<g class="overlay overlay--subgoal-span">`,
    `<rect class="observed-boundary observed-boundary--start" x="${startPoint.x - SEGMENT_CELL_SIZE / 2 + inset}" y="${startPoint.y - SEGMENT_CELL_SIZE / 2 + inset}" width="${size}" height="${size}" rx="5" data-tooltip="${escapeXml(`Exact observed start boundary ${view.subgoalOrder}, native tick ${startBoundary.nativeTick}`)}"><title>${escapeXml(`Exact observed starting boundary ${view.subgoalOrder}, native tick ${startBoundary.nativeTick}, at ${coordinateText(view.observedStart)}. This exact scene supplies all artwork in the segment crop.`)}</title></rect>`,
    `<rect class="observed-boundary observed-boundary--end" x="${endPoint.x - SEGMENT_CELL_SIZE / 2 + inset}" y="${endPoint.y - SEGMENT_CELL_SIZE / 2 + inset}" width="${size}" height="${size}" rx="5" data-tooltip="${escapeXml(`Exact observed end boundary ${view.subgoalOrder + 1}, native tick ${endBoundary.nativeTick}`)}"><title>${escapeXml(`End marker is exact observed coordinate evidence; the underlying artwork remains the starting scene. Exact ending boundary ${view.subgoalOrder + 1}, native tick ${endBoundary.nativeTick}, is available separately.`)}</title></rect>`,
    "</g>",
  ].join("");
}

export function renderKeyPyramidSegmentSvg(
  target: VerifiedP5Target,
  subgoalOrder: number,
  artwork: P4bLegacyArtworkAtlas,
): string {
  assertArtwork(target, artwork);
  const view = createKeyPyramidSegmentView(target, subgoalOrder);
  const scene = target.boundaries[view.sceneBoundaryOrder]!.document;
  const columns = view.crop.maximumX - view.crop.minimumX + 1;
  const rows = view.crop.maximumY - view.crop.minimumY + 1;
  const width = columns * SEGMENT_CELL_SIZE;
  const height = rows * SEGMENT_CELL_SIZE;
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const segmentLabel = String(subgoalOrder + 1).padStart(2, "0");
  const description = `${targetLabel} Key Pyramid segment ${segmentLabel}. Starting boundary ${String(view.sceneBoundaryOrder).padStart(2, "0")} artwork substrate. The complete segment route is plan intent and uses local visit numbers 0 through ${view.routeCoordinates.length - 1}; waits are omitted. Exact observed start and end coordinates are marked separately. End marker is exact observed coordinate evidence; the underlying artwork remains the starting scene. Transparent standard game sprites use a presentation-only empty-floor artwork underlay that is not added to the exact semantic stack.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="p4b-artwork-root p4b-segment-artwork" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="p4b-${target.target}-segment-${subgoalOrder}-title p4b-${target.target}-segment-${subgoalOrder}-description" data-artwork-source="${escapeXml(artwork.sourcePath)}" data-subgoal-order="${subgoalOrder}" data-scene-boundary-order="${view.sceneBoundaryOrder}" data-crop="${view.crop.minimumX},${view.crop.minimumY},${view.crop.maximumX},${view.crop.maximumY}">`,
    `<title id="p4b-${target.target}-segment-${subgoalOrder}-title">${escapeXml(`${targetLabel} Key Pyramid segment ${segmentLabel}`)}</title>`,
    `<desc id="p4b-${target.target}-segment-${subgoalOrder}-description">${escapeXml(description)}</desc>`,
    `<metadata>${escapeXml(JSON.stringify({
      artwork: { expandedArtworkIncluded: false, sourcePath: artwork.sourcePath, target: artwork.target },
      crop: view.crop,
      evidence: { endMarker: "observed-witness-coordinate", route: "plan-intent", sceneBoundaryOrder: view.sceneBoundaryOrder },
      numbering: { localStart: 0, localEnd: view.routeCoordinates.length - 1, waits: "omitted" },
      scene: scene.renderContent,
    }))}</metadata>`,
    SVG_STYLESHEET,
    `<rect class="map-background" width="${width}" height="${height}"/>`,
    renderArtworkCells(scene, view.crop, SEGMENT_CELL_SIZE, artwork),
    `<g class="overlay overlay--plan-intent-route" data-tooltip="Complete segment route: plan intent; waits omitted"><title>Complete segment route line and local movement visit order. Plan intent; not intermediate observed evidence. Waits omitted.</title>${routeLines(view.routeCoordinates, view.crop, SEGMENT_CELL_SIZE)}${renderRouteVisitBadges(target, view, scene)}</g>`,
    renderObservedSegmentBoundaries(target, view),
    "</svg>",
  ].join("\n");
}

export function exactBoundaryStack(target: VerifiedP5Target, boundaryOrder: number): string {
  const boundary = target.boundaries[boundaryOrder]?.document;
  if (boundary === undefined) throw new Error(`${target.target} P4B boundary ${boundaryOrder} missing`);
  const { coordinate } = boundary;
  const cell = sceneCell(boundary, coordinate.x, coordinate.y);
  return cell.items.length === 0
    ? "No supplied semantic items"
    : cell.items.map((item: JsonRecord) => itemText(item)).join("; ");
}

export function renderExactBoundaryPanelSvg(
  target: VerifiedP5Target,
  boundaryOrder: number,
  artwork: P4bLegacyArtworkAtlas,
): string {
  assertArtwork(target, artwork);
  const boundary = target.boundaries[boundaryOrder]?.document;
  if (boundary === undefined) throw new Error(`${target.target} P4B boundary ${boundaryOrder} missing`);
  const center = boundary.coordinate as Coordinate;
  const crop: Crop = {
    minimumX: Math.max(0, center.x - PANEL_CROP_RADIUS),
    maximumX: Math.min(GRID_WIDTH - 1, center.x + PANEL_CROP_RADIUS),
    minimumY: Math.max(0, center.y - PANEL_CROP_RADIUS),
    maximumY: Math.min(GRID_HEIGHT - 1, center.y + PANEL_CROP_RADIUS),
  };
  const columns = crop.maximumX - crop.minimumX + 1;
  const rows = crop.maximumY - crop.minimumY + 1;
  const width = columns * PANEL_CELL_SIZE;
  const height = rows * PANEL_CELL_SIZE;
  const point = mapPoint(center, crop, PANEL_CELL_SIZE);
  const targetLabel = target.target === "ms" ? "MS" : "Lynx";
  const description = `${targetLabel} exact boundary ${boundaryOrder}, native tick ${boundary.nativeTick}, coordinate ${coordinateText(center)}, remaining chips ${boundary.remainingChips}, terminal ${boundary.terminalKind}. Exact checked scene artwork is cropped to at most five by five cells. The red outline marks the exact boundary coordinate.`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="p4b-artwork-root p4b-boundary-artwork" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="boundary-${target.target}-${boundaryOrder}-title boundary-${target.target}-${boundaryOrder}-description" data-artwork-source="${escapeXml(artwork.sourcePath)}" data-scene-boundary-order="${boundaryOrder}" data-crop="${crop.minimumX},${crop.minimumY},${crop.maximumX},${crop.maximumY}">`,
    `<title id="boundary-${target.target}-${boundaryOrder}-title">${escapeXml(`${targetLabel} exact boundary ${boundaryOrder}`)}</title>`,
    `<desc id="boundary-${target.target}-${boundaryOrder}-description">${escapeXml(description)}</desc>`,
    SVG_STYLESHEET,
    `<rect class="map-background" width="${width}" height="${height}"/>`,
    renderArtworkCells(boundary, crop, PANEL_CELL_SIZE, artwork),
    `<rect class="exact-boundary-cell" x="${point.x - PANEL_CELL_SIZE / 2 + 2}" y="${point.y - PANEL_CELL_SIZE / 2 + 2}" width="${PANEL_CELL_SIZE - 4}" height="${PANEL_CELL_SIZE - 4}" rx="5" data-tooltip="${escapeXml(description)}"><title>${escapeXml(description)}</title></rect>`,
    "</svg>",
  ].join("\n");
}
