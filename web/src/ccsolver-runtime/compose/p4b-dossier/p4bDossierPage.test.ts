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

type FakeKeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  defaultPrevented: boolean;
  key: string;
  metaKey: boolean;
  preventDefault(): void;
  shiftKey: boolean;
  target: any;
};

function keyEvent(target: any, key: string, modifiers: Partial<FakeKeyEvent> = {}): FakeKeyEvent {
  return {
    altKey: false,
    ctrlKey: false,
    defaultPrevented: false,
    key,
    metaKey: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    shiftKey: false,
    target,
    ...modifiers,
  };
}

function runKeyboardHarness() {
  const panels = Array.from({ length: 6 }, () => ({
    hidden: false,
    querySelector: () => ({ setAttribute: () => undefined }),
    toggleAttribute(name: string, force: boolean) {
      if (name === "hidden") this.hidden = force;
    },
  }));
  let focusedIndex = -1;
  const tabs = panels.map((_, index) => {
    const attributes = new Map<string, string>([
      ["aria-controls", `segment-panel-${index}`],
      ["aria-selected", String(index === 0)],
    ]);
    const listeners = new Map<string, (event: FakeKeyEvent) => void>();
    const tab = {
      attributes,
      listeners,
      tabIndex: index === 0 ? 0 : -1,
      tagName: "BUTTON",
      addEventListener(type: string, listener: (event: FakeKeyEvent) => void) {
        listeners.set(type, listener);
      },
      closest(selector: string) {
        return selector.includes("[data-segment-tab]") ? tab : null;
      },
      focus() {
        focusedIndex = index;
      },
      getAttribute(name: string) {
        return attributes.get(name) ?? null;
      },
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    };
    return tab;
  });
  const tablist = {
    getAttribute: (name: string) => name === "data-segment-tabs" ? "ms" : null,
    querySelectorAll: (selector: string) => selector === "[data-segment-tab]" ? tabs : [],
  };
  let explorerKeydown: ((event: FakeKeyEvent) => void) | undefined;
  const explorer = {
    addEventListener(type: string, listener: (event: FakeKeyEvent) => void) {
      if (type === "keydown") explorerKeydown = listener;
    },
    querySelector: (selector: string) => selector === "[data-segment-tabs]" ? tablist : null,
  };
  const documentLike = {
    documentElement: { classList: { add: () => undefined } },
    getElementById: (id: string) => {
      const index = Number(id.slice("segment-panel-".length));
      return Number.isInteger(index) ? panels[index] : null;
    },
    querySelector: () => null,
    querySelectorAll: (selector: string) => {
      if (selector === "[data-segment-tabs]") return [tablist];
      if (selector === "[data-segment-explorer]") return [explorer];
      return [];
    },
  };
  new Function("document", P4B_DOSSIER_JS)(documentLike);
  return {
    explorerKeydown: (event: FakeKeyEvent) => explorerKeydown?.(event),
    focusedIndex: () => focusedIndex,
    selectedIndex: () => tabs.findIndex((tab) => tab.getAttribute("aria-selected") === "true"),
    tabKeydown: (index: number, event: FakeKeyEvent) => tabs[index]!.listeners.get("keydown")?.(event),
    tabs,
  };
}

function runNumberingHarness() {
  const attributes = new Map<string, string>([["data-route-numbering", "local"]]);
  const maps = Array.from({ length: 6 }, () => ({
    mode: "local",
    setAttribute(name: string, value: string) {
      if (name === "data-route-numbering") this.mode = value;
    },
  }));
  const hints = Array.from({ length: 6 }, () => ({ textContent: "local" }));
  const readouts = Array.from({ length: 6 }, () => ({ textContent: "local" }));
  const stage = {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    querySelectorAll(selector: string) {
      if (selector === ".segment-map__svg") return maps;
      if (selector === "[data-numbering-hint]") return hints;
      if (selector === "[data-route-readout]") return readouts;
      return [];
    },
    setAttribute: (name: string, value: string) => attributes.set(name, value),
  };
  const targetPanel = {
    querySelector: (selector: string) => selector === "[data-segment-stage]" ? stage : null,
  };
  let change: (() => void) | undefined;
  const checkbox = {
    checked: false,
    addEventListener(type: string, listener: () => void) {
      if (type === "change") change = listener;
    },
    closest: (selector: string) => selector === "[data-ruleset-panel]" ? targetPanel : null,
  };
  const documentLike = {
    documentElement: { classList: { add: () => undefined } },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (selector: string) => (
      selector === "[data-route-numbering-toggle]" ? [checkbox] : []
    ),
  };
  new Function("document", P4B_DOSSIER_JS)(documentLike);
  return { attributes, change: () => change?.(), checkbox, hints, maps, readouts };
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
    expect(html.match(/29 moves<\/span><span>Whole-route visits 0–29/gu)).toHaveLength(2);
    expect(html.match(/3 moves<\/span><span>Whole-route visits 159–162/gu)).toHaveLength(2);

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

  it("moves between segments with plain explorer arrows without hijacking other key owners", () => {
    const harness = runKeyboardHarness();
    const routeMark = { tagName: "g", isContentEditable: false, closest: () => null };

    const next = keyEvent(routeMark, "ArrowRight");
    harness.explorerKeydown(next);
    expect(next.defaultPrevented).toBe(true);
    expect(harness.selectedIndex()).toBe(1);
    expect(harness.focusedIndex()).toBe(1);

    const modified = keyEvent(routeMark, "ArrowRight", { altKey: true });
    harness.explorerKeydown(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(harness.selectedIndex()).toBe(1);

    const formControl = keyEvent({ tagName: "INPUT", isContentEditable: false }, "ArrowRight");
    harness.explorerKeydown(formControl);
    expect(formControl.defaultPrevented).toBe(false);
    expect(harness.selectedIndex()).toBe(1);

    const segmentTabEvent = keyEvent(harness.tabs[1], "ArrowRight");
    harness.tabKeydown(1, segmentTabEvent);
    harness.explorerKeydown(segmentTabEvent);
    expect(segmentTabEvent.defaultPrevented).toBe(true);
    expect(harness.selectedIndex()).toBe(2);
  });

  it("defaults to local visits and can reveal whole-route visits per target", async () => {
    const html = await renderPage();
    expect(html.match(/data-route-numbering-toggle="(?:ms|lynx)"/gu)).toHaveLength(2);
    expect(html.match(/data-segment-stage data-route-numbering="local"/gu)).toHaveLength(2);
    expect(html).toContain("Keyboard: use ← and →");
    expect(html).toContain("Show whole-route visit numbers");
    expect(html).not.toMatch(/data-route-numbering-toggle="(?:ms|lynx)"[^>]* checked/u);

    const harness = runNumberingHarness();
    harness.checkbox.checked = true;
    harness.change();
    expect(harness.attributes.get("data-route-numbering")).toBe("global");
    expect(harness.maps.every(({ mode }) => mode === "global")).toBe(true);
    expect(harness.hints.every(({ textContent }) => textContent.includes("whole-route"))).toBe(true);
    expect(harness.readouts.every(({ textContent }) => textContent.includes("whole-route"))).toBe(true);

    harness.checkbox.checked = false;
    harness.change();
    expect(harness.attributes.get("data-route-numbering")).toBe("local");
    expect(harness.maps.every(({ mode }) => mode === "local")).toBe(true);

    expect(P4B_DOSSIER_CSS).toContain(
      '.segment-map__svg[data-route-numbering="global"] .route-label--local',
    );
    expect(P4B_DOSSIER_CSS).toContain(
      '.segment-map__svg[data-route-numbering="global"] .route-label--global',
    );
  }, 30_000);

  it("renders human boundary state and keeps hashes out of visible dossier prose", async () => {
    const html = await renderPage();
    const cards = [...html.matchAll(/<section class="boundary-panel"[\s\S]*?<\/section>/gu)]
      .map(([card]) => card);
    expect(cards).toHaveLength(24);
    for (const card of cards) {
      expect(card).toContain("Chips remaining</dt>");
      expect(card).toContain("Keys held</dt>");
      expect(card).toContain("Boots held</dt>");
      expect(card).toContain("Facing</dt>");
      expect(card).toContain("Movement</dt>");
      expect(card).toContain("Control</dt>");
      expect(card).toContain("Outcome</dt>");
      expect(card).not.toMatch(/Fingerprint|digest|sha256:|placement:|actor:/iu);
    }
    expect(html).toContain("Keys held</dt><dd>Red ×1, Yellow ×1</dd>");
    expect(html).toContain("Boots held</dt><dd>None</dd>");
    expect(html).toContain("Native tick</dt><dd>Before first tick</dd>");
    expect(html).toContain("Exact cell stack</dt><dd class=\"stack-literal\">Chip · Actor layer · Facing West · State Stationary</dd>");
    expect(html).toContain('download="key-pyramid-ms.tws"');
    expect(html).toContain('download="key-pyramid-lynx.tws"');
    expect(html).not.toContain('class="digest"');
    expect(html).not.toMatch(/>[^<]*(?:sha256:|placement:|actor:)[^<]*</u);
    expect(html).not.toMatch(/global steps/iu);
  }, 30_000);

  it("uses human resource names throughout the collapsed plan review", async () => {
    const html = await renderPage();

    expect(html).toContain("Red key");
    expect(html).toContain("Computer chip");
    expect(html).not.toMatch(/Typed resource dependency:[^<]*cc1:/u);
    expect(html).not.toMatch(/Direct resource prerequisites:[^<]*cc1:/u);
  }, 30_000);

  it("uses nearly the full viewport instead of capping the dossier at 88rem", () => {
    expect(P4B_DOSSIER_CSS).toContain(".shell{width:calc(100% - clamp(");
    expect(P4B_DOSSIER_CSS).toContain("max-width:none");
    expect(P4B_DOSSIER_CSS).toContain(".panel-pair{display:grid;grid-template-columns:1fr");
    expect(P4B_DOSSIER_CSS).not.toContain("88rem");
  });
});
