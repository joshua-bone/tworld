import assert from "node:assert/strict";
import { test } from "node:test";

import {
  P4B_EVIDENCE_BASIS_LABELS,
  P4bWholeLevelError,
} from "../../dist/render/p4bWholeLevelModel.js";
import {
  createP4bWholeLevelView,
  validateP4bWholeLevelView,
} from "../../dist/render/p4bWholeLevelView.js";
import { renderP4bWholeLevelSvg } from "../../dist/render/p4bWholeLevelSvg.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const blob = (character, byteLength = 123) => ({
  digest: digest(character),
  byteLength,
});
const placementId = (character) => `placement:sha256:${character.repeat(64)}`;
const wiringId = (character) => `wiring:sha256:${character.repeat(64)}`;

function item(character, semanticType, stratum, facing = null) {
  return {
    identity: { kind: "placement", placementId: placementId(character) },
    semanticType,
    stratum,
    facing,
    state: null,
    projectionOrder: 0,
    source: "observation-element",
  };
}

function makeCells(width, height, itemsByOrdinal = new Map()) {
  return Array.from({ length: width * height }, (_, cellOrdinal) => ({
    cellOrdinal,
    coordinate: {
      x: cellOrdinal % width,
      y: Math.floor(cellOrdinal / width),
      z: 0,
    },
    itemsOrder: "stratum-then-identity",
    items: itemsByOrdinal.get(cellOrdinal) ?? [],
  }));
}

function wholeLevelInput() {
  const itemsByOrdinal = new Map([
    [0, [item("1", "cc1:floor", "terrain")]],
    [1, [item("2", "cc1:key-red", "pickup")]],
    [2, [item("3", "cc1:door-red", "terrain")]],
    [33, [item("4", "cc1:brown-button", "overlay")]],
    [34, [item("5", "cc1:trap", "terrain")]],
    [65, [item("6", "cc1:teleport", "terrain")]],
    [66, [item("7", "cc1:teleport", "terrain")]],
    [96, [item("8", "cc1:force-floor-east", "terrain", "east")]],
  ]);

  return {
    viewType: "p4b-whole-level-view",
    viewVersion: 1,
    viewId: "view:synthetic:p4b-whole-level:ms",
    caseId: "case:synthetic:p4b-whole-level",
    title: "Synthetic 32×32 whole-level evidence canary",
    target: "ms",
    level: {
      occurrenceId: "synthetic:p4b:001",
      normalizationProfile: "tworld-legacy-dat-gameplay-v1",
      normalizedGameplayDigest: digest("a"),
    },
    geometry: { width: 32, height: 32, depth: 1 },
    bindings: {
      levelFactsContent: blob("b", 20_000),
      sceneContent: blob("c", 30_000),
      staticAnalysisContent: blob("d", 40_000),
      planContent: blob("e", 50_000),
      witnessContent: blob("f", 60_000),
    },
    cellsOrder: "z-y-x",
    cells: makeCells(32, 32, itemsByOrdinal),
    overlaysOrder: "basis-kind-id",
    // Deliberately supplied out of order: creation owns canonical overlay ordering.
    overlays: [
      {
        overlayId: "overlay:observed-route",
        kind: "observed-route",
        basis: "observed-witness",
        label: "Observed route",
        textEquivalent: "Observed route visits (0,0), (1,0), and (1,1), in that order.",
        routeId: "route:observed:ms",
        coordinatesOrder: "route-order",
        coordinates: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      },
      {
        overlayId: "overlay:force-canary",
        kind: "forced-surface",
        basis: "source-fact",
        label: "Synthetic force-floor canary",
        textEquivalent: "The supplied source declares an east-facing force surface at (0,3,0).",
        placementId: placementId("8"),
        coordinate: { x: 0, y: 3, z: 0 },
        motionKind: "force",
        direction: "east",
        turn: null,
        claim: "declared-motion-semantics-only",
      },
      {
        overlayId: "overlay:plan-route",
        kind: "plan-intent-route",
        basis: "plan-intent",
        label: "Intended route",
        textEquivalent: "Plan intent visits (0,0), (0,1), and (1,1), in that order.",
        routeId: "route:plan:ms",
        coordinatesOrder: "route-order",
        coordinates: [
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 1, z: 0 },
          { x: 1, y: 1, z: 0 },
        ],
      },
      {
        overlayId: "overlay:red-gate",
        kind: "resource-gate",
        basis: "source-fact",
        label: "Red-key gate",
        textEquivalent: "The supplied level facts place a red-key-consuming gate at (2,0,0).",
        placementId: placementId("3"),
        resourceType: "cc1:key-red",
        gateKind: "consume",
        amount: 1,
        coordinate: { x: 2, y: 0, z: 0 },
      },
      {
        overlayId: "overlay:region-entry",
        kind: "region",
        basis: "static-topology",
        label: "Entry region",
        textEquivalent: "Static topology groups cells 0, 1, 32, and 33 as the entry region.",
        regionId: "region:entry",
        cellOrdinalsOrder: "cell-ordinal",
        cellOrdinals: [0, 1, 32, 33],
      },
      {
        overlayId: "overlay:red-key",
        kind: "resource-source",
        basis: "source-fact",
        label: "Red key source",
        textEquivalent: "The supplied level facts place one red key at (1,0,0).",
        placementId: placementId("2"),
        resourceType: "cc1:key-red",
        amount: 1,
        coordinate: { x: 1, y: 0, z: 0 },
      },
      {
        overlayId: "overlay:source-terrain",
        kind: "source-stratum",
        basis: "source-fact",
        label: "Supplied terrain placements",
        textEquivalent: "The source terrain stratum includes exact supplied cells 0, 2, 34, 65, 66, and 96.",
        stratum: "terrain",
        cellOrdinalsOrder: "cell-ordinal",
        cellOrdinals: [0, 2, 34, 65, 66, 96],
      },
      {
        overlayId: "overlay:observed-subgoal",
        kind: "subgoal-span",
        basis: "observed-witness",
        label: "Observed first subgoal span",
        textEquivalent: "Observed witness boundaries run from (0,0,0) to (1,1,0).",
        subgoalId: "subgoal:first",
        subgoalOrder: 0,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1, y: 1, z: 0 },
      },
      {
        overlayId: "overlay:plan-subgoal",
        kind: "subgoal-span",
        basis: "plan-intent",
        label: "Intended first subgoal span",
        textEquivalent: "Plan intent starts at (0,0,0) and ends at (1,1,0).",
        subgoalId: "subgoal:first",
        subgoalOrder: 0,
        start: { x: 0, y: 0, z: 0 },
        end: { x: 1, y: 1, z: 0 },
      },
      {
        overlayId: "overlay:wiring-canary",
        kind: "wiring",
        basis: "source-fact",
        label: "Synthetic wiring canary",
        textEquivalent: "The supplied source declares a connection from the button at (1,1,0) to the trap at (2,1,0).",
        wiringId: wiringId("9"),
        wiringKind: "cc1:brown-button-to-trap",
        source: {
          placementId: placementId("4"),
          coordinate: { x: 1, y: 1, z: 0 },
        },
        target: {
          placementId: placementId("5"),
          coordinate: { x: 2, y: 1, z: 0 },
        },
        claim: "declared-connection-only",
      },
      {
        overlayId: "overlay:transport-canary",
        kind: "transport",
        basis: "source-fact",
        label: "Synthetic transport canary",
        textEquivalent: "The supplied source declares two ordered teleport-network members.",
        networkId: "transport:blue-teleports",
        transportKind: "cc1:teleport",
        routingPolicy: "source-order-cycle",
        membersOrder: "source-order",
        members: [
          { placementId: placementId("6"), coordinate: { x: 1, y: 2, z: 0 } },
          { placementId: placementId("7"), coordinate: { x: 2, y: 2, z: 0 } },
        ],
        claim: "declared-network-membership-only",
      },
    ],
    accessibleText: "A complete 32 by 32 semantic map with evidence-basis labels and text equivalents for every overlay.",
    correctness: {
      suppliedCellsAreAuthoritative: true,
      rendererInventsNoTiles: true,
      overlaysDoNotEstablishCausality: true,
    },
  };
}

test("creates and validates a canonical full 32x32 presentation model", () => {
  const view = createP4bWholeLevelView(wholeLevelInput());

  assert.equal(view.cells.length, 1_024);
  assert.deepEqual(view.overlays.map(({ kind }) => kind), [
    "forced-surface",
    "resource-gate",
    "resource-source",
    "source-stratum",
    "transport",
    "wiring",
    "region",
    "plan-intent-route",
    "subgoal-span",
    "observed-route",
    "subgoal-span",
  ]);
  assert.deepEqual(validateP4bWholeLevelView(view), view);
  assert.deepEqual(P4B_EVIDENCE_BASIS_LABELS, {
    "source-fact": "Source fact",
    "static-topology": "Static topology",
    "plan-intent": "Plan intent",
    "observed-witness": "Observed witness",
  });
});

test("renders deterministic accessible SVG with fixed evidence labels and literal cells", () => {
  const view = createP4bWholeLevelView(wholeLevelInput());
  const first = renderP4bWholeLevelSvg(view);
  const second = renderP4bWholeLevelSvg(view);

  assert.equal(first, second);
  assert.match(first, /^<svg /u);
  assert.match(first, /role="img" aria-labelledby="p4b-title p4b-description"/u);
  assert.match(first, /<title id="p4b-title">Synthetic 32×32 whole-level evidence canary<\/title>/u);
  assert.match(first, /<desc id="p4b-description">/u);
  assert.equal(first.match(/class="map-cell"/gu)?.length, 1_024);
  assert.match(first, /data-semantic-type="cc1:key-red"/u);
  assert.match(first, /data-stack="cc1:key-red \[pickup\]"/u);
  for (const label of Object.values(P4B_EVIDENCE_BASIS_LABELS)) {
    assert.match(first, new RegExp(`>${label}<`, "u"));
  }
  assert.match(first, /Supplied semantic cells only/u);
  assert.match(first, /No missing tile is inferred/u);
  assert.match(first, /No causal relationship is asserted/u);
  assert.doesNotMatch(first, /<script|\/Users\/|20[0-9]{2}-[0-9]{2}-[0-9]{2}/u);
});

test("keeps planned and observed paths distinct and renders span endpoints without inventing a path", () => {
  const svg = renderP4bWholeLevelSvg(createP4bWholeLevelView(wholeLevelInput()));

  assert.equal(svg.match(/<polyline /gu)?.length, 2);
  assert.match(svg, /class="overlay overlay--plan-intent-route"[^>]+data-basis-label="Plan intent"/u);
  assert.match(svg, /class="overlay overlay--observed-route"[^>]+data-basis-label="Observed witness"/u);
  assert.equal(svg.match(/class="overlay overlay--subgoal-span"/gu)?.length, 2);
  assert.match(svg, /class="subgoal-boundary subgoal-boundary--start"/u);
  assert.match(svg, /class="subgoal-boundary subgoal-boundary--end"/u);
});

test("renders bounded synthetic canaries for absent Key Pyramid mechanisms", () => {
  const svg = renderP4bWholeLevelSvg(createP4bWholeLevelView(wholeLevelInput()));

  assert.match(svg, /class="overlay overlay--wiring"/u);
  assert.match(svg, /data-claim="declared-connection-only"/u);
  assert.match(svg, /class="overlay overlay--transport"/u);
  assert.match(svg, /data-routing-policy="source-order-cycle"/u);
  assert.match(svg, /class="overlay overlay--forced-surface"/u);
  assert.match(svg, /data-motion-kind="force"/u);
});

test("does not synthesize terrain for empty or pickup-only supplied cells", () => {
  const input = wholeLevelInput();
  input.geometry = { width: 2, height: 1, depth: 1 };
  input.cells = makeCells(2, 1, new Map([
    [1, [item("2", "cc1:key-red", "pickup")]],
  ]));
  input.overlays = [input.overlays.find(({ kind }) => kind === "resource-source")];
  input.bindings.staticAnalysisContent = null;
  input.bindings.planContent = null;
  input.bindings.witnessContent = null;

  const svg = renderP4bWholeLevelSvg(createP4bWholeLevelView(input));
  assert.match(svg, /data-stack="cc1:key-red \[pickup\]"/u);
  assert.match(svg, /data-stack="empty"/u);
  assert.doesNotMatch(svg, /cc1:floor/u);
});

test("fails closed on malformed scenes, bindings, overlay evidence, IDs, text, and ordering", () => {
  const cases = [
    ["unknown top-level member", (input) => { input.surprise = true; }],
    ["oversized dimension", (input) => { input.geometry.width = 65; }],
    ["incomplete scene", (input) => { input.cells.pop(); }],
    ["wrong cell ordinal", (input) => { input.cells[10].cellOrdinal = 11; }],
    ["malformed digest", (input) => { input.bindings.sceneContent.digest = "sha256:no"; }],
    ["duplicate overlay ID", (input) => { input.overlays[1].overlayId = input.overlays[0].overlayId; }],
    ["missing plan binding", (input) => { input.bindings.planContent = null; }],
    ["wrong fixed basis", (input) => { input.overlays[0].basis = "plan-intent"; }],
    ["route leaves map", (input) => { input.overlays[0].coordinates[0].x = 32; }],
    ["empty overlay text", (input) => { input.overlays[0].textEquivalent = ""; }],
    ["source stratum invents a member", (input) => {
      input.overlays.find(({ kind }) => kind === "source-stratum").cellOrdinals.push(10);
    }],
    ["resource uses another placement", (input) => {
      input.overlays.find(({ kind }) => kind === "resource-source").placementId = placementId("a");
    }],
    ["malformed stable ID", (input) => { input.viewId = "UPPER CASE"; }],
  ];

  for (const [name, mutate] of cases) {
    const input = wholeLevelInput();
    mutate(input);
    assert.throws(
      () => createP4bWholeLevelView(input),
      (error) => error instanceof P4bWholeLevelError,
      name,
    );
  }

  const reordered = createP4bWholeLevelView(wholeLevelInput());
  reordered.overlays.reverse();
  assert.throws(
    () => validateP4bWholeLevelView(reordered),
    (error) => error instanceof P4bWholeLevelError && error.path === "/overlays/1",
  );

  const cyclic = wholeLevelInput();
  cyclic.self = cyclic;
  assert.throws(
    () => createP4bWholeLevelView(cyclic),
    (error) => error instanceof P4bWholeLevelError && error.code === "p4b.invalid-view",
  );
});
