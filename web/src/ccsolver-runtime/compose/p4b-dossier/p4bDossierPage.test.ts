import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadVerifiedP5DossierInput } from "./checkedP5DossierInput";
import {
  P4B_DOSSIER_CSS,
  P4B_DOSSIER_JS,
  renderP4bKeyPyramidPage,
} from "./p4bDossierPage";

const repositoryRoot = resolve(import.meta.dirname, "../../../../..");

async function renderPage(): Promise<string> {
  const source = await loadVerifiedP5DossierInput(repositoryRoot);
  const panelAssets = new Map<string, string>();
  for (const target of ["ms", "lynx"]) {
    for (let boundaryOrder = 0; boundaryOrder < 7; boundaryOrder += 1) {
      panelAssets.set(`${target}:${boundaryOrder}`, `${target}-${boundaryOrder}.svg`);
    }
  }
  return renderP4bKeyPyramidPage({
    source,
    cssAsset: "dossier.css",
    jsAsset: "dossier.js",
    fullMapSvgs: new Map([
      ["ms", "<svg aria-label=\"MS map\" ></svg>"],
      ["lynx", "<svg aria-label=\"Lynx map\" ></svg>"],
    ]),
    fullMapAssets: new Map([["ms", "ms.svg"], ["lynx", "lynx.svg"]]),
    segmentSvgs: new Map(Array.from({ length: 6 }, (_, segmentOrder) => [
      [`ms:${segmentOrder}`, `<svg aria-label="MS segment ${segmentOrder + 1}" ></svg>`],
      [`lynx:${segmentOrder}`, `<svg aria-label="Lynx segment ${segmentOrder + 1}" ></svg>`],
    ]).flat()),
    segmentAssets: new Map(Array.from({ length: 6 }, (_, segmentOrder) => [
      [`ms:${segmentOrder}`, `ms-segment-${segmentOrder + 1}.svg`],
      [`lynx:${segmentOrder}`, `lynx-segment-${segmentOrder + 1}.svg`],
    ]).flat()),
    panelAssets,
    twsDownloads: new Map([["ms", "ms.tws"], ["lynx", "lynx.tws"]]),
  });
}

describe("P4B dossier page information architecture", () => {
  it("puts the full solution first, separates targets, and exposes one six-step navigator per target", async () => {
    const html = await renderPage();

    expect(html.match(/role="tablist"[^>]*data-ruleset-tabs/gu)).toHaveLength(1);
    expect(html.match(/role="tab"[^>]*data-ruleset-tab="(?:ms|lynx)"/gu)).toHaveLength(2);
    expect(html.match(/role="tabpanel"[^>]*data-ruleset-panel="(?:ms|lynx)"/gu)).toHaveLength(2);
    expect(html.match(/role="tablist"[^>]*data-segment-tabs="(?:ms|lynx)"/gu)).toHaveLength(2);
    expect(html.match(/role="tab"[^>]*data-segment-tab="(?:ms|lynx):[1-6]"/gu)).toHaveLength(12);
    expect(html.match(/role="tabpanel"[^>]*data-segment-panel="(?:ms|lynx):[1-6]"/gu)).toHaveLength(12);
    expect(html.match(/role="tabpanel"[^>]*data-ruleset-panel="ms"[^>]*aria-labelledby="ruleset-tab-ms"/gu)).toHaveLength(1);
    expect(html.match(/role="tabpanel"[^>]*data-ruleset-panel="lynx"[^>]*aria-labelledby="ruleset-tab-lynx"/gu)).toHaveLength(1);
    expect(html.match(/role="tabpanel"[^>]*data-segment-panel="(?:ms|lynx):[1-6]"[^>]*aria-labelledby="segment-tab-(?:ms|lynx)-[1-6]"/gu)).toHaveLength(12);
    expect(html.match(/Local moves 0–29<\/span><span>Global steps 0–28/gu)).toHaveLength(2);
    expect(html.match(/Local moves 0–3<\/span><span>Global steps 159–161/gu)).toHaveLength(2);

    for (const target of ["ms", "lynx"]) {
      const panelStart = html.indexOf(`data-ruleset-panel="${target}"`);
      const overallStart = html.indexOf(`data-overall-solution="${target}"`, panelStart);
      const segmentsStart = html.indexOf(`data-segment-tabs="${target}"`, panelStart);
      expect(panelStart).toBeGreaterThan(-1);
      expect(overallStart).toBeGreaterThan(panelStart);
      expect(segmentsStart).toBeGreaterThan(overallStart);
    }

    expect(html).not.toContain("data-map-zoom");
    expect(html).not.toMatch(/<input[^>]+type="range"/u);
  }, 30_000);

  it("keeps forensic material collapsed while hover, focus, touch, and no-JS access remain available", async () => {
    const html = await renderPage();

    expect(html.match(/<details class="evidence-drawer/gu).length).toBeGreaterThanOrEqual(18);
    expect(html.match(/role="tooltip"/gu).length).toBeGreaterThanOrEqual(12);
    expect(html.match(/data-route-readout/gu)).toHaveLength(12);
    expect(html.match(/aria-describedby="segment-help-(?:ms|lynx)-[1-6]"/gu).length)
      .toBeGreaterThanOrEqual(12);
    expect(html).toContain("<noscript>This complete dossier does not require JavaScript.</noscript>");
    expect(html).toContain("class=\"no-js-only\"");
    expect(html).not.toMatch(/<section[^>]+data-ruleset-panel[^>]+ hidden/u);
    expect(html).not.toMatch(/<section[^>]+data-segment-panel[^>]+ hidden/u);
  }, 30_000);

  it("implements roving keyboard tabs and bounded responsive panels without zoom controls", () => {
    expect(P4B_DOSSIER_JS).toContain('addEventListener("keydown"');
    expect(P4B_DOSSIER_JS).toContain('"ArrowRight"');
    expect(P4B_DOSSIER_JS).toContain('"ArrowLeft"');
    expect(P4B_DOSSIER_JS).toContain('"Home"');
    expect(P4B_DOSSIER_JS).toContain('"End"');
    expect(P4B_DOSSIER_JS).toContain('querySelectorAll("[data-route-detail]")');
    expect(P4B_DOSSIER_JS).toContain('addEventListener("pointerenter"');
    expect(P4B_DOSSIER_JS).toContain('addEventListener("focus"');
    expect(P4B_DOSSIER_JS).toContain("toggleAttribute(\"hidden\"");
    expect(P4B_DOSSIER_JS).not.toContain("data-map-zoom");

    expect(P4B_DOSSIER_CSS).toContain(".js .no-js-only{display:none}");
    expect(P4B_DOSSIER_CSS).toContain(".segment-stage{min-width:0}");
    expect(P4B_DOSSIER_CSS).toContain(
      '.whole-map__svg text,.segment-map__svg text{font-family:system-ui',
    );
    expect(P4B_DOSSIER_CSS).not.toMatch(/Arial Narrow|font-stretch:condensed/u);
    expect(P4B_DOSSIER_CSS).toContain("overflow-wrap:anywhere");
    expect(P4B_DOSSIER_CSS).toContain("@media(max-width:760px)");
    expect(P4B_DOSSIER_CSS).toContain(".controls{width:100%;overflow:visible;flex-wrap:wrap");
    expect(P4B_DOSSIER_CSS).not.toContain(".controls{width:100%;overflow:auto;flex-wrap:nowrap");
    expect(P4B_DOSSIER_CSS).not.toContain("body{overflow-x:hidden");
  });
});
