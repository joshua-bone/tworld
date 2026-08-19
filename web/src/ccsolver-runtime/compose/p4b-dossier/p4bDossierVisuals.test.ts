import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVerifiedP5DossierInput } from "./checkedP5DossierInput";
import {
  bindP4bLegacyArtworkHref,
  createP4bLegacyArtworkSheet,
} from "./p4bLegacyArtwork";
import {
  createKeyPyramidSegmentView,
  renderKeyPyramidSegmentSvg,
  renderKeyPyramidWholeLevelSvg,
} from "./p4bDossierVisuals";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");

async function artworkFor(target: "ms" | "lynx") {
  const sourcePath = target === "ms" ? "res/tiles.bmp" : "res/atiles.bmp";
  const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, sourcePath)));
  const sheet = createP4bLegacyArtworkSheet({ target, sourcePath, bytes });
  return bindP4bLegacyArtworkHref(sheet, `${target}-runtime-artwork.png`);
}

describe("P4B authentic game-artwork views", () => {
  it("converts only the standard runtime atlases into deterministic transparent PNG artwork", async () => {
    const ms = await artworkFor("ms");
    const lynx = await artworkFor("lynx");

    expect(ms).toMatchObject({
      target: "ms",
      sourcePath: "res/tiles.bmp",
      sourceWidth: 336,
      sourceHeight: 768,
      tileWidth: 48,
      tileHeight: 48,
      href: "ms-runtime-artwork.png",
    });
    expect(lynx).toMatchObject({
      target: "lynx",
      sourcePath: "res/atiles.bmp",
      sourceWidth: 1729,
      sourceHeight: 874,
      tileWidth: 48,
      tileHeight: 48,
      href: "lynx-runtime-artwork.png",
    });
    expect([...ms.pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect([...lynx.pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(ms.expandedArtworkIncluded).toBe(false);
    expect(lynx.expandedArtworkIncluded).toBe(false);
  });

  it("renders the whole solution over game artwork with compact, hoverable segment markers", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const target = source.targets[0];
    const svg = renderKeyPyramidWholeLevelSvg(target, await artworkFor("ms"));

    expect(svg.match(/class="game-artwork-cell"/gu)).toHaveLength(1_024);
    expect(svg).toContain('data-artwork-source="res/tiles.bmp"');
    expect(svg).toContain('class="overlay overlay--region"');
    expect(svg).toContain('class="overlay overlay--resource-source"');
    expect(svg).toContain('class="overlay overlay--resource-gate"');
    expect(svg).toContain('class="overlay overlay--plan-intent-route"');
    expect(svg.match(/class="segment-marker segment-marker--start" tabindex="0"/gu)).toHaveLength(6);
    expect(svg.match(/class="segment-marker segment-marker--end" tabindex="0"/gu)).toHaveLength(6);
    expect(svg).toContain("Plan-intent route; not per-step observed evidence");
    expect(svg).not.toContain("SOURCE FACT");
    expect(svg).not.toContain("scaleX(");
    expect(svg).not.toContain("expanded.png");
  }, 30_000);

  it("crops each segment to its complete route plus one cell and numbers every movement visit locally", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const target = source.targets[0];
    const view = createKeyPyramidSegmentView(target, 0);
    const svg = renderKeyPyramidSegmentSvg(target, 0, await artworkFor("ms"));

    expect(view.sceneBoundaryOrder).toBe(0);
    expect(view.routeCoordinates).toHaveLength(30);
    expect(view.routeCoordinates[0]).toEqual({ x: 15, y: 19, z: 0 });
    expect(view.routeCoordinates.at(-1)).toEqual(target.route.tileSteps[28]!.to);
    expect(view.crop).toEqual({ minimumX: 9, maximumX: 17, minimumY: 12, maximumY: 24 });
    expect(svg).toContain('data-scene-boundary-order="0"');
    expect(svg).toContain('data-crop="9,12,17,24"');
    expect(svg).toContain('data-local-visits="0,2"');
    expect(svg).toContain('data-global-visits="0,2"');
    expect(svg).toContain('class="route-visit-badge" tabindex="0"');
    expect(svg).toContain("data-route-detail=");
    expect(svg).toContain("Evidence basis: route and event labels are plan intent");
    expect(svg).toContain("Local visits 0, 2");
    expect(svg.match(/class="route-visit-badge"/gu).length).toBeLessThan(30);
    expect(svg).toContain("Starting boundary 00 artwork substrate");
    expect(svg).toContain("End marker is exact observed coordinate evidence; the underlying artwork remains the starting scene");
    expect(svg).toContain("presentation-only empty-floor artwork underlay");
  }, 30_000);

  it("covers every MS and Lynx segment visit exactly once across consolidated keyboard-focusable badges", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const artwork = {
      ms: await artworkFor("ms"),
      lynx: await artworkFor("lynx"),
    } as const;

    for (const target of source.targets) {
      for (let subgoalOrder = 0; subgoalOrder < 6; subgoalOrder += 1) {
        const view = createKeyPyramidSegmentView(target, subgoalOrder);
        const svg = renderKeyPyramidSegmentSvg(target, subgoalOrder, artwork[target.target]);
        const localVisitGroups = [...svg.matchAll(/data-local-visits="([0-9,]+)"/gu)]
          .flatMap((match) => match[1]!.split(",").map(Number))
          .sort((left, right) => left - right);
        const expectedVisits = Array.from(
          { length: view.routeCoordinates.length },
          (_, visitOrder) => visitOrder,
        );
        const expectedCells = (
          view.crop.maximumX - view.crop.minimumX + 1
        ) * (
          view.crop.maximumY - view.crop.minimumY + 1
        );

        expect(localVisitGroups).toEqual(expectedVisits);
        expect(svg.match(/class="game-artwork-cell"/gu)).toHaveLength(expectedCells);
        expect(svg.match(/class="route-visit-badge" tabindex="0"/gu)).toHaveLength(
          new Set(view.routeCoordinates.map(({ x, y, z }) => `${x},${y},${z}`)).size,
        );
        expect(svg).toContain(`data-artwork-source="${target.target === "ms" ? "res/tiles.bmp" : "res/atiles.bmp"}"`);
      }
    }
  }, 30_000);

  it("fails closed instead of mapping expanded or unknown semantic tiles into standard artwork", async () => {
    const source = await loadVerifiedP5DossierInput(repositoryRoot);
    const target = source.targets[0];
    const artwork = await artworkFor("ms");
    const initial = target.boundaries[0]!.document;
    const changedCell = {
      ...initial.render.cells[0],
      items: [{
        ...initial.render.cells[0].items[0],
        semanticType: "cc1:ice-block",
      }],
    };
    const changedTarget = {
      ...target,
      boundaries: [{
        ...target.boundaries[0],
        document: {
          ...initial,
          render: {
            ...initial.render,
            cells: [changedCell, ...initial.render.cells.slice(1)],
          },
        },
      }, ...target.boundaries.slice(1)],
    } as typeof target;

    expect(() => renderKeyPyramidWholeLevelSvg(changedTarget, artwork))
      .toThrow(/no standard CC1 artwork mapping for cc1:ice-block/u);
  }, 30_000);
});
