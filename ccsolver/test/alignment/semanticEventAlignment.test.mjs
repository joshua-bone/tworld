import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignSemanticEvents,
  buildStrategyPortfolio,
} from "../../dist/alignment/index.js";
import { assertSolverCausalEventPageV1 } from "../../dist/events/index.js";

const placement = (character) => `placement:sha256:${character.repeat(64)}`;
const actor = (character) => `actor:sha256:${character.repeat(64)}`;

const PLAYER = {
  semanticType: "cc1:chip",
  actorId: actor("1"),
  placementId: placement("1"),
  deviceId: null,
};

const coord = (x, y) => ({ x, y, z: 0 });

function detailFor(kind) {
  if (kind === "command") {
    return {
      requestKind: "replay-tick",
      inputCode: 1,
      influence: "applied",
      failureReason: null,
    };
  }
  if (kind.startsWith("movement-")) {
    return {
      direction: "east",
      movementRole: "forced",
      attemptedCoordinate: null,
      failureReason: null,
    };
  }
  if (kind === "resource-collected") {
    return {
      resourceType: "key:red",
      amount: 1,
      inventoryBefore: 0,
      inventoryAfter: 1,
      remainingBefore: null,
      remainingAfter: null,
    };
  }
  if (kind === "inventory-changed" || kind === "requirement-changed") {
    return {
      resourceType: kind === "inventory-changed" ? "key:red" : "chip",
      beforeCount: 1,
      afterCount: 0,
      reason: "gate-consumed",
    };
  }
  if (kind === "map-mutated") {
    return {
      mutation: "open",
      beforeSemanticType: "cc1:toggle-wall-closed",
      beforeState: "closed",
      afterSemanticType: "cc1:toggle-wall-open",
      afterState: "open",
    };
  }
  if (kind === "device-activated" || kind === "device-state-changed") {
    return { action: "press", beforeState: "up", afterState: "down" };
  }
  if (kind === "terminal-reached") {
    return {
      result: {
        kind: "won",
        nativeTick: 0,
        coordinate: null,
        exitPlacementId: placement("f"),
      },
    };
  }
  throw new Error(`missing test detail for ${kind}`);
}

function causalEvent(target, sequence, kind, overrides = {}) {
  const event = {
    eventVersion: 1,
    sequence,
    occurrenceOrdinal: 0,
    target,
    mode: "replay",
    kind,
    boundary: { nativeTick: sequence * 4, phase: kind === "terminal-reached" ? "terminal" : "transition" },
    authority: {
      basis: kind === "terminal-reached" ? "terminal-latch" : "native-action-hook",
      evidence: "authoritative",
      causality: "explicit",
    },
    subject: PLAYER,
    source: null,
    coordinates: { before: null, after: null },
    commandId: `command:${sequence}`,
    planId: "plan:key-pyramid",
    causedBySequences: [],
    detail: detailFor(kind),
    ...overrides,
  };
  if (kind === "terminal-reached") {
    event.detail = {
      ...event.detail,
      result: {
        ...event.detail.result,
        nativeTick: event.boundary.nativeTick,
      },
    };
  }
  return event;
}

function tracePage(target, events, overrides = {}) {
  const last = events.length === 0 ? null : events.length - 1;
  return {
    journalVersion: 1,
    target,
    mode: "replay",
    level: {
      occurrenceId: "level:key-pyramid",
      normalizationProfile: "normalization:cc1-standard",
      normalizedGameplayDigest: `sha256:${"1".repeat(64)}`,
    },
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: `sha256:${"2".repeat(64)}`,
    },
    provenance: {
      adapterId: `adapter:${target}`,
      adapterRevision: "revision:test",
      engineId: `engine:${target}`,
      engineRevision: "revision:test",
    },
    requested: { afterSequence: null, maximumEvents: Math.max(1, events.length) },
    eventsOrder: "sequence",
    events,
    window: {
      firstAvailableSequence: events.length === 0 ? null : 0,
      availableThroughSequence: last,
      firstReturnedSequence: events.length === 0 ? null : 0,
      lastReturnedSequence: last,
      nextAfterSequence: last,
      status: "complete",
    },
    retention: { status: "complete" },
    ...overrides,
  };
}

function align(left, right) {
  const leftPage = tracePage("ms", left);
  const rightPage = tracePage("lynx", right);
  assertSolverCausalEventPageV1(leftPage);
  assertSolverCausalEventPageV1(rightPage);
  return alignSemanticEvents({
    alignmentVersion: 1,
    left: leftPage,
    right: rightPage,
  });
}

function familyFor(alignment, dependencies = []) {
  return buildStrategyPortfolio({
    portfolioVersion: 1,
    portfolioId: "portfolio:key-pyramid",
    familyId: "family:paired-causal-plan",
    title: "Paired causal plan",
    alignment,
    traceEvidence: {
      ms: "journal:key-pyramid:ms",
      lynx: "journal:key-pyramid:lynx",
    },
    dependencies,
  }).families[0];
}

test("aligns a Key-Pyramid-like shared plan across native timing and 1:N movement differences", () => {
  const redKey = {
    semanticType: "cc1:key-red",
    actorId: null,
    placementId: placement("a"),
    deviceId: null,
  };
  const socket = {
    semanticType: "cc1:socket",
    actorId: null,
    placementId: placement("b"),
    deviceId: null,
  };
  const exit = {
    semanticType: "cc1:exit",
    actorId: null,
    placementId: placement("f"),
    deviceId: null,
  };

  const ms = [
    causalEvent("ms", 0, "movement-completed", {
      commandId: "command:forced-corridor",
      coordinates: { before: coord(1, 1), after: coord(3, 1) },
    }),
    causalEvent("ms", 1, "resource-collected", {
      subject: redKey,
      source: PLAYER,
      commandId: "command:collect-red",
      causedBySequences: [0],
      boundary: { nativeTick: 40, phase: "settlement" },
    }),
    causalEvent("ms", 2, "map-mutated", {
      subject: socket,
      commandId: "command:open-socket",
      boundary: { nativeTick: 80, phase: "settlement" },
      detail: {
        mutation: "remove",
        beforeSemanticType: "cc1:socket",
        beforeState: "closed",
        afterSemanticType: "cc1:floor",
        afterState: "open",
      },
    }),
    causalEvent("ms", 3, "terminal-reached", {
      subject: exit,
      commandId: "command:reach-exit",
      boundary: { nativeTick: 100, phase: "terminal" },
      coordinates: { before: coord(8, 8), after: coord(9, 8) },
    }),
  ];
  const lynx = [
    causalEvent("lynx", 0, "movement-completed", {
      commandId: "command:forced-corridor",
      coordinates: { before: coord(1, 1), after: coord(2, 1) },
    }),
    causalEvent("lynx", 1, "movement-completed", {
      occurrenceOrdinal: 1,
      commandId: "command:forced-corridor",
      coordinates: { before: coord(2, 1), after: coord(3, 1) },
      boundary: { nativeTick: 13, phase: "settlement" },
    }),
    causalEvent("lynx", 2, "resource-collected", {
      subject: redKey,
      source: PLAYER,
      commandId: "command:collect-red",
      causedBySequences: [1],
      boundary: { nativeTick: 61, phase: "settlement" },
    }),
    causalEvent("lynx", 3, "map-mutated", {
      subject: socket,
      commandId: "command:open-socket",
      boundary: { nativeTick: 121, phase: "settlement" },
      detail: {
        mutation: "remove",
        beforeSemanticType: "cc1:socket",
        beforeState: "closed",
        afterSemanticType: "cc1:floor",
        afterState: "open",
      },
    }),
    causalEvent("lynx", 4, "terminal-reached", {
      subject: exit,
      commandId: "command:reach-exit",
      boundary: { nativeTick: 147, phase: "terminal" },
      coordinates: { before: coord(99, 99), after: coord(100, 99) },
      detail: {
        result: {
          kind: "won",
          nativeTick: 147,
          coordinate: coord(100, 99),
          exitPlacementId: placement("f"),
        },
      },
    }),
  ];

  const alignment = align(ms, lynx);
  assert.deepEqual(align(ms, lynx), alignment, "alignment must be deterministic");
  assert.equal(alignment.summary.oneToManySpans, 1);
  assert.equal(alignment.summary.matchedHardAnchors, 3);
  assert.equal(alignment.summary.unmatchedHardAnchors, 0);
  assert.equal(alignment.summary.divergentHardAnchors, 0);
  assert.equal(alignment.summary.terminalAnchorsMatched, true);
  assert.equal(
    alignment.spans.find((span) => span.spanKind === "matched" && span.cardinality !== "one-to-one")?.cardinality,
    "one-to-many",
  );

  const family = familyFor(alignment, [{
    dependencyId: "dependency:native-timing",
    kind: "timing",
    targetRulesets: ["lynx", "ms"],
    evidenceIds: ["event:forced-corridor"],
  }]);
  assert.equal(family.planShape, "shared-plan");
  assert.equal(family.resolution, "partially-verified");
  assert.equal(family.resolutionReason, "aligned-causal-terminals");
  assert.deepEqual(family.targetRulesets, ["ms", "lynx"]);
  assert.equal(family.dependencies[0].kind, "timing");
});

test("does not use a repeated coordinate as an anchor when causal commands disagree", () => {
  const repeated = { before: coord(4, 4), after: coord(5, 4) };
  const ms = [
    causalEvent("ms", 0, "movement-completed", {
      commandId: "command:detour",
      coordinates: repeated,
    }),
    causalEvent("ms", 1, "movement-completed", {
      occurrenceOrdinal: 1,
      commandId: "command:shared-return",
      coordinates: repeated,
    }),
    causalEvent("ms", 2, "terminal-reached", {
      commandId: "command:exit",
    }),
  ];
  const lynx = [
    causalEvent("lynx", 0, "movement-completed", {
      commandId: "command:other-context",
      coordinates: { before: coord(8, 8), after: coord(9, 8) },
    }),
    causalEvent("lynx", 1, "movement-completed", {
      occurrenceOrdinal: 1,
      commandId: "command:shared-return",
      coordinates: repeated,
    }),
    causalEvent("lynx", 2, "terminal-reached", {
      commandId: "command:exit",
    }),
  ];

  const alignment = align(ms, lynx);
  const matchedMovement = alignment.spans.find((span) => (
    span.spanKind === "matched" && span.left.some((event) => event.kind === "movement-completed")
  ));
  assert.deepEqual(matchedMovement?.left.map(({ sequence }) => sequence), [1]);
  assert.deepEqual(matchedMovement?.right.map(({ sequence }) => sequence), [1]);
  assert.deepEqual(matchedMovement?.left.map(({ occurrenceOrdinal }) => occurrenceOrdinal), [1]);
  assert.deepEqual(matchedMovement?.right.map(({ occurrenceOrdinal }) => occurrenceOrdinal), [1]);
  assert.ok(alignment.spans.some((span) => (
    span.spanKind === "unmatched"
      && span.side === "left"
      && span.events.some(({ sequence }) => sequence === 0)
  )));
  assert.ok(alignment.spans.some((span) => (
    span.spanKind === "unmatched"
      && span.side === "right"
      && span.events.some(({ sequence }) => sequence === 0)
  )));
  assert.equal(familyFor(alignment).planShape, "shared-plan");
});

test("retains a causal disagreement as an explicit divergent span and different plan", () => {
  const toggle = {
    semanticType: "cc1:toggle-wall-closed",
    actorId: null,
    placementId: placement("c"),
    deviceId: null,
  };
  const buttonA = {
    semanticType: "cc1:button-green",
    actorId: null,
    placementId: placement("a"),
    deviceId: placement("a"),
  };
  const buttonB = {
    semanticType: "cc1:button-green",
    actorId: null,
    placementId: placement("b"),
    deviceId: placement("b"),
  };
  const mutation = {
    subject: toggle,
    source: null,
    commandId: "command:open-toggle",
    detail: {
      mutation: "open",
      beforeSemanticType: "cc1:toggle-wall-closed",
      beforeState: "closed",
      afterSemanticType: "cc1:toggle-wall-open",
      afterState: "open",
    },
  };
  const ms = [
    causalEvent("ms", 0, "device-activated", { subject: buttonA, commandId: "command:press-a" }),
    causalEvent("ms", 1, "map-mutated", { ...mutation, causedBySequences: [0] }),
    causalEvent("ms", 2, "terminal-reached", { commandId: "command:exit" }),
  ];
  const lynx = [
    causalEvent("lynx", 0, "device-activated", { subject: buttonB, commandId: "command:press-b" }),
    causalEvent("lynx", 1, "map-mutated", { ...mutation, causedBySequences: [0] }),
    causalEvent("lynx", 2, "terminal-reached", { commandId: "command:exit" }),
  ];

  const alignment = align(ms, lynx);
  const disagreement = alignment.spans.find((span) => (
    span.spanKind === "divergent" && span.reason === "causal-parent-mismatch"
  ));
  assert.ok(disagreement);
  assert.equal(disagreement.anchorStrength, "hard");
  assert.equal(alignment.summary.divergentHardAnchors, 1);

  const portfolio = buildStrategyPortfolio({
    portfolioVersion: 1,
    portfolioId: "portfolio:causal-disagreement",
    familyId: "family:causal-disagreement",
    title: "Causal disagreement",
    alignment,
    traceEvidence: { ms: "journal:ms", lynx: "journal:lynx" },
  });
  assert.equal(portfolio.families[0].planShape, "different-plan");
  assert.equal(portfolio.families[0].resolution, "unresolved");
  assert.equal(portfolio.families[0].resolutionReason, "causal-plan-disagreement");
  assert.equal(portfolio.preferredFamilyId, null);
});

test("downgrades diagnostic-only mutations and never treats coordinates or ticks as hard identity", () => {
  const subject = {
    semanticType: "cc1:door-red",
    actorId: null,
    placementId: placement("d"),
    deviceId: null,
  };
  const diagnosticAuthority = {
    basis: "boundary-delta",
    evidence: "diagnostic-only",
    causality: "unattributed",
  };
  const ms = [causalEvent("ms", 0, "map-mutated", {
    subject,
    authority: diagnosticAuthority,
    commandId: null,
    planId: null,
    coordinates: { before: coord(1, 1), after: coord(2, 1) },
    boundary: { nativeTick: 10, phase: "settlement" },
  })];
  const lynx = [causalEvent("lynx", 0, "map-mutated", {
    subject,
    authority: diagnosticAuthority,
    commandId: null,
    planId: null,
    coordinates: { before: coord(20, 20), after: coord(21, 20) },
    boundary: { nativeTick: 999, phase: "transition" },
  })];

  const alignment = align(ms, lynx);
  assert.equal(alignment.spans[0].spanKind, "matched");
  assert.equal(alignment.spans[0].anchorStrength, "medium");
  assert.equal(alignment.summary.matchedHardAnchors, 0);
});

test("rejects an overflowed journal instead of aligning retained prefixes", () => {
  const event = causalEvent("ms", 0, "terminal-reached");
  assert.throws(
    () => alignSemanticEvents({
      alignmentVersion: 1,
      left: tracePage("ms", [event], {
        retention: {
          status: "overflow",
          reason: "capacity-exhausted",
          firstOmittedSequence: 1,
          omittedEventCount: 3,
        },
      }),
      right: tracePage("lynx", [causalEvent("lynx", 0, "terminal-reached")]),
    }),
    (error) => error?.code === "alignment.input-invalid"
      && error?.path === "/left/retention/status",
  );
});

test("rejects missing event sequences instead of treating a suffix as complete", () => {
  const events = [
    causalEvent("ms", 0, "movement-completed"),
    causalEvent("ms", 2, "terminal-reached"),
  ];
  assert.throws(
    () => alignSemanticEvents({
      alignmentVersion: 1,
      left: tracePage("ms", events),
      right: tracePage("lynx", [causalEvent("lynx", 0, "terminal-reached")]),
    }),
    (error) => error?.code === "alignment.input-invalid"
      && error?.path === "/left/events/1/sequence",
  );
});

test("rejects a foreign level identity before considering coincidental events", () => {
  const left = tracePage("ms", [causalEvent("ms", 0, "terminal-reached")]);
  const right = tracePage("lynx", [causalEvent("lynx", 0, "terminal-reached")], {
    level: {
      occurrenceId: "level:foreign",
      normalizationProfile: "normalization:cc1-standard",
      normalizedGameplayDigest: `sha256:${"9".repeat(64)}`,
    },
  });
  assert.throws(
    () => alignSemanticEvents({ alignmentVersion: 1, left, right }),
    (error) => error?.code === "alignment.input-invalid"
      && error?.path === "/right/level/occurrenceId",
  );
});

test("keeps an unattributed terminal-only alignment proposed rather than verified", () => {
  const terminal = (target) => causalEvent(target, 0, "terminal-reached", {
    authority: {
      basis: "terminal-latch",
      evidence: "authoritative",
      causality: "unattributed",
    },
    commandId: null,
    planId: null,
  });
  const family = familyFor(align([terminal("ms")], [terminal("lynx")]));

  assert.equal(family.planShape, "shared-plan");
  assert.equal(family.resolution, "proposed");
  assert.equal(
    family.resolutionReason,
    "aligned-semantic-terminals-with-limited-causal-authority",
  );
});
