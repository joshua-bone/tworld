import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  bindP4bLegacyArtworkHref,
  createP4bLegacyArtworkSheet,
} from "../p4b-dossier/p4bLegacyArtwork";
import { renderPhaseAKeyDoorArtwork } from "./p6bP7aArtwork";

const repositoryRoot = resolve(import.meta.dirname, "../../../../../");

describe.each([
  { target: "ms" as const, sourcePath: "res/tiles.bmp" as const },
  { target: "lynx" as const, sourcePath: "res/atiles.bmp" as const },
])("$target P7A review artwork", ({ target, sourcePath }) => {
  it("renders the standard game strip and numbered non-wait decisions", async () => {
    const sheet = createP4bLegacyArtworkSheet({
      target,
      sourcePath,
      bytes: new Uint8Array(await readFile(resolve(repositoryRoot, sourcePath))),
    });
    const svg = renderPhaseAKeyDoorArtwork({
      target,
      artwork: bindP4bLegacyArtworkHref(sheet, `assets/standard-artwork-${target}.png`),
      routeMarks: Array.from({ length: 6 }, (_, decisionOrder) => ({
        decisionOrder,
        coordinate: { x: decisionOrder + 1, y: 0, z: 0 },
      })),
    });

    expect(svg).toContain("standard game artwork");
    expect(svg.match(/data-decision-order=/gu)).toHaveLength(6);
    expect(svg).toContain('data-semantic-type="cc1:key-red"');
    expect(svg).toContain('data-semantic-type="cc1:door-red"');
    expect(svg).toContain('data-semantic-type="cc1:exit"');
    expect(svg).toContain('data-semantic-type="cc1:chip"');
    expect(svg).toContain(`href="assets/standard-artwork-${target}.png"`);
    expect(svg).not.toMatch(/sha256:|0x7[0-5]/u);
  });
});
