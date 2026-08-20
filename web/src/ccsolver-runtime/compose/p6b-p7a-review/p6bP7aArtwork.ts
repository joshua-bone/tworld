import {
  p4bArtworkSpriteFor,
  type P4bArtworkSprite,
  type P4bLegacyArtworkAtlas,
} from "../p4b-dossier/p4bLegacyArtwork";

export type P7aRouteMarkV1 = {
  readonly decisionOrder: number;
  readonly coordinate: { readonly x: number; readonly y: number; readonly z: number };
};

const CELLS = [
  { semanticType: "cc1:floor", actor: "cc1:chip" },
  { semanticType: "cc1:floor" },
  { semanticType: "cc1:key-red" },
  { semanticType: "cc1:floor" },
  { semanticType: "cc1:door-red" },
  { semanticType: "cc1:floor" },
  { semanticType: "cc1:exit" },
] as const;

const CELL_SIZE = 96;

function escapeXml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function spriteImage(
  artwork: P4bLegacyArtworkAtlas,
  sprite: P4bArtworkSprite,
  x: number,
  semanticType: string,
): string {
  return `<svg class="tile tile--${escapeXml(semanticType.replace("cc1:", ""))}" data-semantic-type="${escapeXml(semanticType)}" x="${x}" y="0" width="${CELL_SIZE}" height="${CELL_SIZE}" viewBox="${sprite.sourceX} ${sprite.sourceY} ${sprite.sourceWidth} ${sprite.sourceHeight}" preserveAspectRatio="none"><image href="${escapeXml(artwork.href)}" x="0" y="0" width="${artwork.sourceWidth}" height="${artwork.sourceHeight}" preserveAspectRatio="none"/></svg>`;
}

export function renderPhaseAKeyDoorArtwork(input: {
  readonly target: "ms" | "lynx";
  readonly artwork: P4bLegacyArtworkAtlas;
  readonly routeMarks: readonly P7aRouteMarkV1[];
}): string {
  if (input.artwork.target !== input.target || input.artwork.expandedArtworkIncluded !== false) {
    throw new Error("P7A map requires the matching standard-only runtime artwork atlas");
  }
  const marks = input.routeMarks.map((mark, index) => {
    if (
      mark.decisionOrder !== index
      || mark.coordinate.z !== 0
      || mark.coordinate.y !== 0
      || mark.coordinate.x < 0
      || mark.coordinate.x >= CELLS.length
    ) {
      throw new Error("P7A route marks must be contiguous visits inside the Phase-A strip");
    }
    return { ...mark, coordinate: { ...mark.coordinate } };
  });
  const floor = p4bArtworkSpriteFor(input.artwork, "cc1:floor", null);
  const cells = CELLS.map((cell, x) => {
    const at = x * CELL_SIZE;
    const layers = [spriteImage(input.artwork, floor, at, "cc1:floor")];
    if (cell.semanticType !== "cc1:floor") {
      layers.push(spriteImage(
        input.artwork,
        p4bArtworkSpriteFor(input.artwork, cell.semanticType, null),
        at,
        cell.semanticType,
      ));
    }
    if ("actor" in cell) {
      layers.push(spriteImage(
        input.artwork,
        p4bArtworkSpriteFor(input.artwork, cell.actor, "east"),
        at,
        cell.actor,
      ));
    }
    return `<g aria-label="cell ${x + 1}: ${escapeXml(cell.semanticType.replace("cc1:", "").replaceAll("-", " "))}"><title>${escapeXml(cell.semanticType.replace("cc1:", "").replaceAll("-", " "))}</title>${layers.join("")}<rect x="${at}" y="0" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="none" stroke="rgba(255,255,255,.16)"/></g>`;
  }).join("");
  const points = [0, ...marks.map(({ coordinate }) => coordinate.x)]
    .map((x) => `${x * CELL_SIZE + CELL_SIZE / 2},${CELL_SIZE / 2}`)
    .join(" ");
  const labels = marks.map(({ decisionOrder, coordinate }) => {
    const cx = coordinate.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = CELL_SIZE / 2;
    return `<g class="route-mark" data-decision-order="${decisionOrder}" tabindex="0"><title>Decision ${decisionOrder + 1} reaches corridor cell ${coordinate.x + 1}</title><circle cx="${cx}" cy="${cy}" r="15"/><text x="${cx}" y="${cy + 1}">${decisionOrder + 1}</text></g>`;
  }).join("");
  return `<svg class="phase-a-map" role="img" aria-label="${input.target === "ms" ? "MS" : "Lynx"} Phase-A key-and-door route rendered with standard game artwork" viewBox="0 0 ${CELLS.length * CELL_SIZE} ${CELL_SIZE}" xmlns="http://www.w3.org/2000/svg"><style>.tile,image{image-rendering:pixelated}.route-halo,.route-line{fill:none;stroke-linecap:round;stroke-linejoin:round}.route-halo{stroke:#fff;stroke-width:10;opacity:.9}.route-line{stroke:#6f2dbd;stroke-width:6}.route-mark{cursor:help}.route-mark circle{fill:#fff;stroke:#111;stroke-width:2}.route-mark text{fill:#111;font:800 15px system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-anchor:middle;dominant-baseline:middle}</style><title>${input.target === "ms" ? "MS" : "Lynx"} Phase-A key-and-door tactic route</title>${cells}<polyline class="route-halo" points="${points}"/><polyline class="route-line" points="${points}"/>${labels}</svg>`;
}
