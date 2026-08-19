import assert from "node:assert/strict";
import { test } from "node:test";

const level = {
  occurrenceId: "fixture:p2b-contract",
  normalizationProfile: "fixture-normalization-v1",
  normalizedGameplayDigest: `sha256:${"0".repeat(64)}`,
};

const levelFacts = {
  protocolVersion: 1,
  artifactType: "level-facts",
  schemaVersion: 1,
  digest: `sha256:${"1".repeat(64)}`,
};

const provenance = {
  adapterId: "fixture-ms-adapter",
  adapterRevision: "fixture-adapter-r1",
  engineId: "fixture-ms-engine",
  engineRevision: "fixture-engine-r1",
};

const actorId = (digit) => `actor:sha256:${digit.repeat(64)}`;
const placementId = (digit) => `placement:sha256:${digit.repeat(64)}`;

const player = {
  semanticType: "cc1:player",
  actorId: actorId("a"),
  placementId: placementId("a"),
  deviceId: null,
};

const floor = {
  semanticType: "cc1:floor",
  actorId: null,
  placementId: placementId("b"),
  deviceId: null,
};

const coordinate = { x: 1, y: 2, z: 0 };

function detailFor(kind) {
  switch (kind) {
    case "command":
      return {
        requestKind: "manual-poll",
        inputCode: 1,
        influence: "applied",
        failureReason: null,
      };
    case "movement-blocked":
      return {
        direction: "east",
        movementRole: "self",
        attemptedCoordinate: { x: 2, y: 2, z: 0 },
        failureReason: "blocked-by-wall",
      };
    case "movement-planned":
    case "movement-started":
    case "movement-completed":
      return {
        direction: "east",
        movementRole: "self",
        attemptedCoordinate: { x: 2, y: 2, z: 0 },
        failureReason: null,
      };
    case "resource-collected":
      return {
        resourceType: "cc1:key-red",
        amount: 1,
        inventoryBefore: 0,
        inventoryAfter: 1,
        remainingBefore: null,
        remainingAfter: null,
      };
    case "inventory-changed":
      return {
        resourceType: "cc1:key-red",
        beforeCount: 0,
        afterCount: 1,
        reason: "pickup",
      };
    case "requirement-changed":
      return {
        resourceType: "cc1:chip",
        beforeCount: 2,
        afterCount: 1,
        reason: "pickup",
      };
    case "map-mutated":
      return {
        mutation: "remove",
        beforeSemanticType: "cc1:key-red",
        beforeState: "present",
        afterSemanticType: "cc1:floor",
        afterState: null,
      };
    case "device-activated":
    case "device-state-changed":
      return {
        action: "open",
        beforeState: "closed",
        afterState: "open",
      };
    case "teleport-entered":
    case "teleport-relocated":
    case "teleport-exited":
      return {
        networkId: "teleport-network:0",
        entryPlacementId: placementId("c"),
        exitPlacementId: placementId("d"),
      };
    case "control-changed":
      return {
        before: "available",
        after: "unavailable",
        reason: "forced-motion",
      };
    case "actor-spawned":
    case "actor-lifecycle-changed":
    case "actor-destroyed":
      return {
        before: kind === "actor-spawned" ? null : "active",
        after: kind === "actor-destroyed" ? "destroyed" : "active",
        parentActorId: kind === "actor-spawned" ? actorId("b") : null,
        spawnOrdinal: kind === "actor-spawned" ? 1 : null,
        reason: kind,
      };
    case "player-died":
      return {
        cause: "fire",
        hazardPlacementId: placementId("e"),
      };
    case "terminal-reached":
      return {
        result: {
          kind: "won",
          nativeTick: 0,
          coordinate,
          exitPlacementId: placementId("f"),
        },
      };
    default:
      throw new Error(`missing detail for ${kind}`);
  }
}

const allKinds = [
  "command",
  "movement-planned",
  "movement-blocked",
  "movement-started",
  "movement-completed",
  "resource-collected",
  "inventory-changed",
  "requirement-changed",
  "map-mutated",
  "device-activated",
  "device-state-changed",
  "teleport-entered",
  "teleport-relocated",
  "teleport-exited",
  "control-changed",
  "actor-spawned",
  "actor-lifecycle-changed",
  "actor-destroyed",
  "player-died",
  "terminal-reached",
];

function eventFor(kind, sequence) {
  const event = {
    eventVersion: 1,
    sequence,
    occurrenceOrdinal: 0,
    target: "ms",
    mode: "manual",
    boundary: {
      nativeTick: sequence + 1,
      phase: kind === "command" ? "command" : kind === "terminal-reached" ? "terminal" : "transition",
    },
    authority: kind === "command"
      ? { basis: "runtime-command", evidence: "authoritative", causality: "explicit" }
      : kind === "terminal-reached"
        ? { basis: "terminal-latch", evidence: "authoritative", causality: "explicit" }
        : { basis: "native-action-hook", evidence: "authoritative", causality: "explicit" },
    subject: player,
    source: floor,
    coordinates: {
      before: coordinate,
      after: kind === "movement-completed"
        ? { x: 2, y: 2, z: 0 }
        : kind === "teleport-relocated"
          ? { x: 8, y: 2, z: 0 }
          : coordinate,
    },
    commandId: "command:0",
    planId: "plan:0:0",
    causedBySequences: sequence === 0 ? [] : [0],
    kind,
    detail: detailFor(kind),
  };
  if (kind === "actor-lifecycle-changed") event.detail.after = "contained";
  if (kind === "terminal-reached") event.detail.result.nativeTick = sequence + 1;
  return event;
}

function completePage(events = allKinds.map(eventFor)) {
  const last = events.at(-1)?.sequence ?? null;
  return {
    journalVersion: 1,
    target: "ms",
    mode: "manual",
    level: structuredClone(level),
    levelFacts: structuredClone(levelFacts),
    provenance: structuredClone(provenance),
    requested: { afterSequence: null, maximumEvents: Math.max(1, events.length) },
    eventsOrder: "sequence",
    events,
    window: {
      firstAvailableSequence: last === null ? null : 0,
      availableThroughSequence: last,
      firstReturnedSequence: events[0]?.sequence ?? null,
      lastReturnedSequence: last,
      nextAfterSequence: last,
      status: "complete",
    },
    retention: { status: "complete" },
  };
}

test("exports the P2B causal journal contract", async () => {
  const events = await import("../../dist/events/index.js");

  assert.equal(typeof events.assertSolverCausalEventPageV1, "function");
  assert.equal(typeof events.assertSolverCausalEventReadRequestV1, "function");
  assert.equal(typeof events.assertSolverCausalJournalCheckpointV1, "function");
  assert.equal(typeof events.assertSolverCausalEventPageCheckpointCoherenceV1, "function");
});

test("accepts the complete closed event taxonomy as canonical-safe evidence", async () => {
  const { canonicalizeJson } = await import("../../dist/domain/index.js");
  const { assertSolverCausalEventPageV1 } = await import("../../dist/events/index.js");
  const page = completePage();

  assert.doesNotThrow(() => assertSolverCausalEventPageV1(page));
  assert.equal(JSON.parse(canonicalizeJson(page)).events.length, allKinds.length);
});

test("rejects invalid request bounds and unknown request members", async () => {
  const {
    assertSolverCausalEventReadRequestV1,
    SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");

  assert.throws(
    () => assertSolverCausalEventReadRequestV1({ afterSequence: null, maximumEvents: 0 }),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-request",
  );
  assert.throws(
    () => assertSolverCausalEventReadRequestV1({
      afterSequence: null,
      maximumEvents: 1,
      silentTruncation: true,
    }),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-request",
  );
  assert.throws(
    () => assertSolverCausalEventReadRequestV1({
      afterSequence: null,
      maximumEvents: SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS + 1,
    }),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-request",
  );
});

test("numbers repeated semantic anchors without coupling distinct placements", async () => {
  const {
    assertSolverCausalEventPageV1,
    identifySolverCausalEventOccurrenceAnchorV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const command = eventFor("command", 0);
  const pickupA = eventFor("resource-collected", 1);
  pickupA.source = {
    semanticType: "cc1:key-red",
    actorId: null,
    placementId: placementId("1"),
    deviceId: null,
  };
  const pickupB = eventFor("resource-collected", 2);
  pickupB.source = {
    semanticType: "cc1:key-red",
    actorId: null,
    placementId: placementId("2"),
    deviceId: null,
  };
  const pickupAAgain = eventFor("resource-collected", 3);
  pickupAAgain.source = structuredClone(pickupA.source);
  pickupAAgain.occurrenceOrdinal = 1;
  const page = completePage([command, pickupA, pickupB, pickupAAgain]);

  assert.notEqual(
    identifySolverCausalEventOccurrenceAnchorV1(pickupA),
    identifySolverCausalEventOccurrenceAnchorV1(pickupB),
  );
  assert.equal(
    identifySolverCausalEventOccurrenceAnchorV1(pickupA),
    identifySolverCausalEventOccurrenceAnchorV1(pickupAAgain),
  );
  assert.doesNotThrow(() => assertSolverCausalEventPageV1(page));
  pickupAAgain.occurrenceOrdinal = 0;
  assert.throws(
    () => assertSolverCausalEventPageV1(page),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-event",
  );
});

test("enforces protocol StableIds and exact SHA-256 references", async () => {
  const {
    assertSolverCausalEventPageV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const unstable = completePage([eventFor("command", 0)]);
  unstable.provenance.adapterId = "Uppercase Adapter";
  assert.throws(
    () => assertSolverCausalEventPageV1(unstable),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-page",
  );

  const malformedDigest = completePage([eventFor("command", 0)]);
  malformedDigest.levelFacts.digest = "sha256:abc";
  assert.throws(
    () => assertSolverCausalEventPageV1(malformedDigest),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-page",
  );
});

test("never promotes a boundary delta or chronology into causal authority", async () => {
  const {
    assertSolverCausalEventPageV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const page = completePage([eventFor("resource-collected", 0)]);
  page.events[0].authority = {
    basis: "boundary-delta",
    evidence: "diagnostic-only",
    causality: "unattributed",
  };

  assert.throws(
    () => assertSolverCausalEventPageV1(page),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-authority",
  );
});

test("rejects no-op records that masquerade as causal semantic effects", async () => {
  const {
    assertSolverCausalEventPageV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const noOps = [];

  const lifecycle = eventFor("actor-lifecycle-changed", 1);
  lifecycle.detail.after = lifecycle.detail.before;
  noOps.push(lifecycle);

  const device = eventFor("device-state-changed", 1);
  device.detail.afterState = device.detail.beforeState;
  noOps.push(device);

  const movement = eventFor("movement-completed", 1);
  movement.coordinates.after = movement.coordinates.before;
  noOps.push(movement);

  const teleport = eventFor("teleport-relocated", 1);
  teleport.detail.exitPlacementId = null;
  noOps.push(teleport);

  const terminal = eventFor("terminal-reached", 1);
  terminal.detail.result.nativeTick += 1;
  noOps.push(terminal);

  for (const event of noOps) {
    assert.throws(
      () => assertSolverCausalEventPageV1(completePage([eventFor("command", 0), event])),
      (error) => error instanceof SolverCausalEventContractError
        && error.code === "events.invalid-event",
      event.kind,
    );
  }
});

test("requires contiguous pages and distinguishes page bounds from overflow", async () => {
  const {
    assertSolverCausalEventPageV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const events = [eventFor("command", 0), eventFor("resource-collected", 1)];
  const page = completePage(events);
  page.requested.maximumEvents = 1;
  page.events = [events[0]];
  page.window.lastReturnedSequence = 0;
  page.window.nextAfterSequence = 0;

  assert.throws(
    () => assertSolverCausalEventPageV1(page),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-window",
  );

  page.window.status = "maximum-events-reached";
  assert.doesNotThrow(() => assertSolverCausalEventPageV1(page));

  const overflow = completePage([eventFor("command", 0)]);
  overflow.retention = {
    status: "overflow",
    reason: "capacity-exhausted",
    firstOmittedSequence: 1,
    omittedEventCount: 2,
  };
  assert.doesNotThrow(() => assertSolverCausalEventPageV1(overflow));
});

test("binds complete and overflowed pages to exact checkpoint continuation", async () => {
  const {
    assertSolverCausalEventPageCheckpointCoherenceV1,
    assertSolverCausalJournalCheckpointV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const page = completePage([eventFor("command", 0)]);
  const checkpoint = {
    nextSequence: 1,
    retainedEventCount: 1,
    retention: { status: "complete" },
  };
  assert.doesNotThrow(() => assertSolverCausalJournalCheckpointV1(checkpoint));
  assert.doesNotThrow(() => assertSolverCausalEventPageCheckpointCoherenceV1(page, checkpoint));

  const overflowPage = structuredClone(page);
  overflowPage.retention = {
    status: "overflow",
    reason: "capacity-exhausted",
    firstOmittedSequence: 1,
    omittedEventCount: 2,
  };
  const overflowCheckpoint = {
    nextSequence: 3,
    retainedEventCount: 1,
    retention: structuredClone(overflowPage.retention),
  };
  assert.doesNotThrow(
    () => assertSolverCausalEventPageCheckpointCoherenceV1(overflowPage, overflowCheckpoint),
  );

  overflowCheckpoint.nextSequence = 2;
  assert.throws(
    () => assertSolverCausalJournalCheckpointV1(overflowCheckpoint),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.checkpoint-mismatch",
  );
});

test("rejects values that cannot be represented by canonical JSON", async () => {
  const {
    assertSolverCausalEventPageV1,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const page = completePage([eventFor("command", 0)]);
  page.events[0].detail.failureReason = undefined;

  assert.throws(
    () => assertSolverCausalEventPageV1(page),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.noncanonical-value",
  );
});

test("bounds each event's explicit causal-link payload", async () => {
  const {
    assertSolverCausalEventPageV1,
    SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS,
    SolverCausalEventContractError,
  } = await import("../../dist/events/index.js");
  const event = eventFor("resource-collected", 5_000);
  event.causedBySequences = Array.from(
    { length: SOLVER_CAUSAL_EVENT_MAXIMUM_PAGE_EVENTS + 1 },
    (_, index) => index,
  );
  const page = completePage([event]);
  page.requested = { afterSequence: 4_999, maximumEvents: 1 };
  page.window = {
    firstAvailableSequence: 0,
    availableThroughSequence: 5_000,
    firstReturnedSequence: 5_000,
    lastReturnedSequence: 5_000,
    nextAfterSequence: 5_000,
    status: "complete",
  };

  assert.throws(
    () => assertSolverCausalEventPageV1(page),
    (error) => error instanceof SolverCausalEventContractError
      && error.code === "events.invalid-event",
  );
});
