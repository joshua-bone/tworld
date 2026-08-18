import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SubgoalEvidenceError,
  createSubgoalEvidenceView,
  renderSubgoalEvidencePanelSvg,
} from "../../dist/render/index.js";

const digest = (character) => `sha256:${character.repeat(64)}`;
const blob = (character, byteLength = 123) => ({
  digest: digest(character),
  byteLength,
});

const placement = (character) => ({
  kind: "placement",
  placementId: `placement:sha256:${character.repeat(64)}`,
});

function cell(x, semanticType, character) {
  return {
    cellOrdinal: x,
    coordinate: { x, y: 0, z: 0 },
    itemsOrder: "stratum-then-identity",
    items: [{
      identity: placement(character),
      semanticType,
      stratum: semanticType.includes("key") ? "pickup" : "terrain",
      facing: null,
      state: null,
      projectionOrder: 0,
      source: "observation-element",
    }],
  };
}

const viewport = {
  kind: "box",
  minimum: { x: 0, y: 0, z: 0 },
  maximum: { x: 1, y: 0, z: 0 },
};

function scene(rightSemanticType = "cc1:key-red") {
  return {
    region: viewport,
    cellsOrder: "z-y-x",
    cells: [
      cell(0, "cc1:floor", "1"),
      cell(1, rightSemanticType, "2"),
    ],
  };
}

const observedBinding = (character, nativeTick) => ({
  kind: "observed",
  nativeTick,
  exactFingerprint: digest(character),
  observationContent: blob(character, 200),
  renderContent: blob(character, 100),
});

const metrics = (redKeys) => [
  { metricId: "metric:chips", label: "Chips remaining", value: "10" },
  { metricId: "metric:red-keys", label: "Red keys", value: String(redKeys) },
];

function panel({ panelId, panelKind, title, binding, panelScene, overlayIds, redKeys }) {
  return {
    panelId,
    panelKind,
    title,
    binding,
    scene: panelScene,
    overlayIdsOrder: "basis-kind-id",
    overlayIds,
    metricsOrder: "metric-id",
    metrics: metrics(redKeys),
    accessibleText: `${title}. Chip and key state are described without relying on color.`,
  };
}

function verifiedInput() {
  return {
    viewType: "subgoal-evidence-view",
    viewVersion: 1,
    viewId: "view:key-pyramid:ms:red-key",
    caseId: "cclp1-001",
    target: "ms",
    level: {
      occurrenceId: "tworld:cclp1:001",
      normalizationProfile: "tworld-cc1-gameplay-v1",
      normalizedGameplayDigest: digest("a"),
    },
    levelFacts: blob("b", 300),
    plan: blob("c", 400),
    contract: blob("d", 500),
    witness: blob("e", 600),
    subgoal: {
      subgoalId: "subgoal:collect-red-key",
      title: "Collect the adjacent red key",
      description: "Move one cell east and collect the exact red-key placement.",
    },
    renderer: {
      rendererId: "ccsolver-semantic-svg",
      rendererRevision: "ccsolver:p4a-semantic-svg-v1",
    },
    viewport,
    overlaysOrder: "basis-kind-id",
    overlays: [
      {
        overlayId: "overlay:observed-route",
        kind: "route",
        basis: "observed-witness",
        target: "ms",
        label: "Observed player route",
        textEquivalent: "Observed Chip movement from (0,0,0) to (1,0,0).",
        coordinates: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
        actorId: null,
      },
      {
        overlayId: "overlay:plan-route",
        kind: "route",
        basis: "plan-intent",
        target: "ms",
        label: "Intended player route",
        textEquivalent: "Plan intent moves Chip east one cell.",
        coordinates: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
        actorId: null,
      },
      {
        overlayId: "overlay:red-key-candidate",
        kind: "point-of-interest",
        basis: "backward-candidate",
        target: "ms",
        label: "Selected red key",
        textEquivalent: "The exact red-key placement is at (1,0,0).",
        coordinate: { x: 1, y: 0, z: 0 },
        role: "selected-target",
        placementId: `placement:sha256:${"2".repeat(64)}`,
      },
      {
        overlayId: "overlay:door-obligation",
        kind: "point-of-interest",
        basis: "regressed-requirement",
        target: "ms",
        label: "Later red-door obligation",
        textEquivalent: "Backward regression associates this key with a later door obligation.",
        coordinate: { x: 0, y: 0, z: 0 },
        role: "later-gate",
        placementId: `placement:sha256:${"3".repeat(64)}`,
      },
      {
        overlayId: "overlay:key-cell-change",
        kind: "state-change",
        basis: "observed-witness",
        target: "ms",
        label: "Red-key cell changed",
        textEquivalent: "The key cell changed from red key to floor.",
        coordinate: { x: 1, y: 0, z: 0 },
        beforeSemanticTypes: ["cc1:key-red"],
        afterSemanticTypes: ["cc1:floor"],
      },
    ],
    starting: panel({
      panelId: "panel:starting-state",
      panelKind: "starting-state",
      title: "Starting State",
      binding: observedBinding("4", -1),
      panelScene: scene(),
      overlayIds: [
        "overlay:door-obligation",
        "overlay:observed-route",
        "overlay:plan-route",
        "overlay:red-key-candidate",
      ],
      redKeys: 0,
    }),
    ending: {
      kind: "verified",
      observed: panel({
        panelId: "panel:ending-state",
        panelKind: "ending-state",
        title: "Ending State",
        binding: observedBinding("5", 0),
        panelScene: scene("cc1:floor"),
        overlayIds: [
          "overlay:key-cell-change",
          "overlay:observed-route",
          "overlay:plan-route",
          "overlay:red-key-candidate",
        ],
        redKeys: 1,
      }),
    },
    correctness: {
      fullWorldWitnessIsAuthority: true,
      croppedPanelsAreReviewOnly: true,
    },
    motion: null,
  };
}

function failedInput() {
  const input = verifiedInput();
  return {
    ...input,
    viewId: "view:synthetic:ms:failed-red-key",
    caseId: "synthetic-failed-red-key",
    witness: blob("f", 700),
    starting: {
      ...input.starting,
      panelId: "panel:failed-starting-state",
    },
    ending: {
      kind: "failed",
      expected: panel({
        panelId: "panel:intended-ending",
        panelKind: "intended-ending",
        title: "Intended Ending State",
        binding: {
          kind: "expected",
          contractContent: input.contract,
          predicateIdsOrder: "predicate-id",
          predicateIds: ["predicate:red-key-one"],
        },
        panelScene: scene("cc1:floor"),
        overlayIds: ["overlay:plan-route", "overlay:red-key-candidate"],
        redKeys: 1,
      }),
      actual: panel({
        panelId: "panel:actual-failure",
        panelKind: "actual-failure",
        title: "Actual Stop / Failure State",
        binding: observedBinding("6", 0),
        panelScene: scene(),
        overlayIds: ["overlay:plan-route", "overlay:red-key-candidate"],
        redKeys: 0,
      }),
      firstFailure: {
        code: "witness.postcondition",
        boundaryNativeTick: 0,
        predicateId: "predicate:red-key-one",
        decisionOrder: 0,
        detail: "Expected red-key inventory 1; observed 0.",
      },
    },
  };
}

function relativeLuminance(hex) {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(left, right) {
  const light = Math.max(relativeLuminance(left), relativeLuminance(right));
  const dark = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (light + 0.05) / (dark + 0.05);
}

test("builds a deterministic verified evidence pair with distinct evidence bases", () => {
  const view = createSubgoalEvidenceView(verifiedInput());

  assert.deepEqual(
    view.overlays.map(({ basis, overlayId }) => ({ basis, overlayId })),
    [
      { basis: "regressed-requirement", overlayId: "overlay:door-obligation" },
      { basis: "backward-candidate", overlayId: "overlay:red-key-candidate" },
      { basis: "plan-intent", overlayId: "overlay:plan-route" },
      { basis: "observed-witness", overlayId: "overlay:key-cell-change" },
      { basis: "observed-witness", overlayId: "overlay:observed-route" },
    ],
  );
  assert.equal(view.starting.panelKind, "starting-state");
  assert.equal(view.ending.kind, "verified");
  assert.equal(view.motion, null);

  const first = renderSubgoalEvidencePanelSvg(view, "starting");
  const second = renderSubgoalEvidencePanelSvg(
    createSubgoalEvidenceView(structuredClone(verifiedInput())),
    "starting",
  );
  assert.equal(first, second);
  assert.match(first, /<svg[^>]+role="img"/u);
  assert.match(first, /<title[^>]*>Starting State — Collect the adjacent red key<\/title>/u);
  assert.match(first, /<desc[^>]*>Starting State\. Chip and key state/u);
  assert.match(first, />Regressed requirement</u);
  assert.match(first, />Backward candidate</u);
  assert.match(first, />Plan intent</u);
  assert.match(first, />Observed witness</u);
  assert.match(first, new RegExp(digest("4"), "u"));
  assert.doesNotMatch(first, /<script/u);

  const ending = renderSubgoalEvidencePanelSvg(view, "ending");
  assert.match(ending, />VERIFIED OBSERVATION</u);
  assert.match(ending, />Red keys<\/text>[\s\S]*>1<\/text>/u);
  assert.equal(
    first.match(/viewBox="([^"]+)"/u)?.[1],
    ending.match(/viewBox="([^"]+)"/u)?.[1],
  );
});

test("keeps every semantic evidence color readable in dark mode", () => {
  const svg = renderSubgoalEvidencePanelSvg(
    createSubgoalEvidenceView(verifiedInput()),
    "starting",
  );
  const darkTheme = svg.match(/@media \(prefers-color-scheme: dark\) \{ svg \{([^}]*)\} \}/u)?.[1];
  assert.ok(darkTheme);
  const background = darkTheme.match(/--bg:(#[0-9a-f]{6})/u)?.[1];
  assert.ok(background);

  for (const name of [
    "requirement",
    "candidate",
    "plan",
    "observed",
    "donor",
    "failure",
  ]) {
    const color = darkTheme.match(new RegExp(`--${name}:(#[0-9a-f]{6})`, "u"))?.[1];
    assert.ok(color, `missing dark-mode ${name} color`);
    assert.ok(
      contrastRatio(color, background) >= 4.5,
      `${name} must meet 4.5:1 contrast against the dark background`,
    );
  }
});

test("requires both exact observed boundary panels for a verified view", () => {
  const missing = verifiedInput();
  delete missing.ending;

  assert.throws(
    () => createSubgoalEvidenceView(missing),
    (error) => {
      assert.ok(error instanceof SubgoalEvidenceError);
      assert.equal(error.code, "evidence.invalid-view");
      assert.equal(error.path, "/ending");
      return true;
    },
  );
});

test("keeps a failed intended ending separate from the observed actual stop", () => {
  const view = createSubgoalEvidenceView(failedInput());
  assert.equal(view.ending.kind, "failed");
  assert.equal(view.ending.expected.binding.kind, "expected");
  assert.equal(view.ending.actual.binding.kind, "observed");

  const expected = renderSubgoalEvidencePanelSvg(view, "expected-ending");
  const actual = renderSubgoalEvidencePanelSvg(view, "actual-failure");
  assert.match(expected, />EXPECTED — NOT OBSERVED</u);
  assert.match(expected, /class="expected-layer"/u);
  assert.match(expected, /predicate:red-key-one/u);
  assert.doesNotMatch(expected, />FAILED OBSERVATION</u);
  assert.match(actual, />FAILED OBSERVATION</u);
  assert.match(actual, /class="failure-layer"/u);
  assert.match(actual, /Expected red-key inventory 1; observed 0\./u);
  assert.match(actual, new RegExp(digest("6"), "u"));
  assert.match(actual, /FAILED SYNTHETIC CANARY · EXPECTED AND OBSERVED REMAIN DISTINCT/u);
});

test("renders explicit player facing without inventing a hidden terrain item", () => {
  const input = verifiedInput();
  input.starting.scene.cells[0].items = [{
    identity: {
      kind: "actor",
      actorId: `actor:sha256:${"7".repeat(64)}`,
    },
    semanticType: "cc1:chip",
    stratum: "actor",
    facing: "west",
    state: "stationary",
    projectionOrder: 0,
    source: "observation-element",
  }];
  const svg = renderSubgoalEvidencePanelSvg(createSubgoalEvidenceView(input), "starting");

  assert.match(svg, /class="player"[^>]+data-facing="west"/u);
  assert.match(svg, /class="facing-arrow"/u);
  assert.match(svg, /\(0,0,0\) actor:cc1:chip/u);
  assert.doesNotMatch(svg, /\(0,0,0\) terrain:cc1:floor \+ actor:cc1:chip/u);
});

test("fails closed on malformed panel provenance, viewport drift, and overlays", () => {
  const expectedMarkedObserved = failedInput();
  expectedMarkedObserved.ending.expected.binding = observedBinding("7", 0);
  assert.throws(
    () => createSubgoalEvidenceView(expectedMarkedObserved),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/ending/expected/binding/kind",
  );

  const driftedViewport = verifiedInput();
  driftedViewport.ending.observed.scene.region = {
    ...viewport,
    maximum: { x: 2, y: 0, z: 0 },
  };
  assert.throws(
    () => createSubgoalEvidenceView(driftedViewport),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/ending/observed/scene/region",
  );

  const danglingOverlay = verifiedInput();
  danglingOverlay.starting.overlayIds.push("overlay:missing");
  assert.throws(
    () => createSubgoalEvidenceView(danglingOverlay),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/starting/overlayIds/4",
  );
});

test("bounds review surfaces and validates every semantic item field", () => {
  const tooLarge = verifiedInput();
  tooLarge.viewport = {
    kind: "box",
    minimum: { x: 0, y: 0, z: 0 },
    maximum: { x: 64, y: 0, z: 0 },
  };
  assert.throws(
    () => createSubgoalEvidenceView(tooLarge),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/viewport",
  );

  const malformedIdentity = verifiedInput();
  malformedIdentity.starting.scene.cells[0].items[0].identity = {
    kind: "placement",
    placementId: "placement:not-a-digest",
  };
  assert.throws(
    () => createSubgoalEvidenceView(malformedIdentity),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/starting/scene/cells/0/items/0/identity/placementId",
  );

  const wrongProjectionOrder = verifiedInput();
  wrongProjectionOrder.starting.scene.cells[0].items[0].projectionOrder = 1;
  assert.throws(
    () => createSubgoalEvidenceView(wrongProjectionOrder),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/starting/scene/cells/0/items/0/projectionOrder",
  );

  const unorderedItems = verifiedInput();
  unorderedItems.starting.scene.cells[0].items.push({
    ...unorderedItems.starting.scene.cells[0].items[0],
    identity: placement("0"),
    projectionOrder: 1,
  });
  assert.throws(
    () => createSubgoalEvidenceView(unorderedItems),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/starting/scene/cells/0/items/1",
  );

  const tooManyOverlays = verifiedInput();
  tooManyOverlays.overlays = Array.from({ length: 33 }, (_, index) => ({
    ...tooManyOverlays.overlays[0],
    overlayId: `overlay:route:${index}`,
  }));
  assert.throws(
    () => createSubgoalEvidenceView(tooManyOverlays),
    (error) => error instanceof SubgoalEvidenceError
      && error.path === "/overlays",
  );
});
