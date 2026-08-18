import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { canonicalizeJson } from "../../dist/domain/index.js";
import {
  ContextualWitnessExecutorError,
  createContextualWitnessExecutor,
} from "../../dist/snippets/index.js";

const PLAYER_ID = `actor:sha256:${"a".repeat(64)}`;
const BUG_ID = `actor:sha256:${"b".repeat(64)}`;
const KEY_ID = `placement:sha256:${"c".repeat(64)}`;
const EXIT_ID = `placement:sha256:${"d".repeat(64)}`;

const sha256 = {
  async digestBytes(value) {
    return new Uint8Array(createHash("sha256").update(value).digest());
  },
  async digestUtf8(value) {
    return this.digestBytes(Buffer.from(value, "utf8"));
  },
};

function coordinate(x) {
  return { x, y: 0, z: 0 };
}

function placementId(name) {
  const byte = [...name].reduce((sum, character) => (
    (sum + character.codePointAt(0)) % 256
  ), 0);
  return `placement:sha256:${byte.toString(16).padStart(2, "0").repeat(32)}`;
}

function exact(token) {
  return [
    "exact",
    token.seed,
    token.tick,
    token.x,
    token.inventory,
    token.remaining,
    token.keyPresent ? 1 : 0,
    token.rng,
    token.actorX,
    token.terminal,
    token.opaque,
  ].join(":");
}

function observation(token, options) {
  const terminal = token.terminal === "running"
    ? { kind: "running" }
    : token.terminal === "won"
      ? {
          kind: "won",
          nativeTick: token.tick,
          coordinate: coordinate(token.x),
          exitPlacementId: EXIT_ID,
        }
      : {
          kind: "lost",
          nativeTick: token.tick,
          coordinate: coordinate(token.x),
          cause: "fixture:loss",
        };
  const cells = Array.from({ length: 4 }, (_, cellOrdinal) => {
    const elements = [{
      identity: { kind: "placement", placementId: placementId(`floor-${cellOrdinal}`) },
      stratum: "terrain",
      semanticType: "cc1:floor",
      facing: null,
      state: null,
    }];
    if (cellOrdinal === 1 && token.keyPresent) {
      elements.push({
        identity: { kind: "placement", placementId: KEY_ID },
        stratum: "pickup",
        semanticType: "cc1:key-red",
        facing: null,
        state: null,
      });
    }
    if (cellOrdinal === token.x) {
      elements.push({
        identity: { kind: "actor", actorId: PLAYER_ID },
        stratum: "actor",
        semanticType: "cc1:chip",
        facing: "east",
        state: "stationary",
      });
    }
    if (cellOrdinal === token.actorX) {
      elements.push({
        identity: { kind: "actor", actorId: BUG_ID },
        stratum: "actor",
        semanticType: "cc1:bug",
        facing: "west",
        state: "stationary",
      });
    }
    return {
      cellOrdinal,
      coordinate: coordinate(cellOrdinal),
      elementsOrder: "stratum-then-identity",
      elements,
    };
  });
  return {
    observationVersion: 1,
    target: options.target ?? "ms",
    mode: token.mode,
    level: {
      occurrenceId: options.occurrenceId ?? "fixture:p3b",
      normalizationProfile: "fixture-v1",
      normalizedGameplayDigest: `sha256:${"1".repeat(64)}`,
    },
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: `sha256:${"2".repeat(64)}`,
    },
    provenance: {
      adapterId: "fixture-adapter",
      adapterRevision: options.adapterRevision ?? "fixture-adapter-r1",
      engineId: "fixture-engine",
      engineRevision: options.engineRevision ?? "fixture-engine-r1",
    },
    boundary: { nativeTick: token.tick },
    geometry: { width: 4, height: 1, depth: 1 },
    timing: {
      currentTime: token.tick,
      timeOffset: 0,
      secondsPlayed: Math.max(0, token.tick),
      timeLimit: 100,
      remainingNativeTicks: 100 - token.tick,
    },
    input: {
      lastPolledInputCode: token.lastInput,
      lastAppliedInputCode: token.lastInput,
      replayCursor: token.mode === "replay" ? Math.max(0, token.tick + 1) : null,
      replayMoveCount: token.mode === "replay" ? 8 : null,
      replayBestTimeTicks: token.mode === "replay" ? 100 : null,
    },
    randomness: {
      stepping: 0,
      initialRandomSlideDirection: "north",
      nativeStateFingerprintsOrder: "state-id",
      nativeStateFingerprints: [{ stateId: "cc1:main-rng", fingerprint: `rng:${token.rng}` }],
    },
    cellsOrder: "z-y-x",
    cells,
    player: {
      actorId: PLAYER_ID,
      identityProvenance: "initial-placement",
      sourcePlacementId: placementId("chip"),
      semanticType: "cc1:chip",
      coordinate: coordinate(token.x),
      facing: "east",
      lifecycle: "active",
      movement: "stationary",
      control: terminal.kind === "running" ? "available" : "terminal",
      inputInfluence: terminal.kind === "running" ? "eligible" : "terminal",
    },
    actorsOrder: "observation-order",
    actors: [{
      observationOrder: 0,
      nativePosition: { collectionId: "ms:creatures", index: 0 },
      actorId: BUG_ID,
      identityProvenance: "initial-placement",
      sourcePlacementId: placementId("bug"),
      semanticType: "cc1:bug",
      coordinate: coordinate(token.actorX),
      facing: "west",
      lifecycle: "active",
      movement: "stationary",
    }],
    inventoryOrder: "runtime-slot-order",
    inventory: token.inventory === 0 ? [] : [{
      slotOrder: 0,
      resourceType: "cc1:key-red",
      count: token.inventory,
    }],
    remainingRequirementsOrder: "resource-type",
    remainingRequirements: token.remaining === 0 ? [] : [{
      resourceType: "cc1:icchip",
      count: token.remaining,
    }],
    devicesOrder: "placement-id",
    devices: [],
    fingerprints: {
      exact: exact(token),
      continuation: null,
      semantic: `semantic:${token.tick}:${token.x}:${token.inventory}:${token.remaining}:${token.keyPresent}:${token.rng}:${token.actorX}:${token.terminal}`,
    },
    terminal,
  };
}

function renderFrom(observed, request, mismatch = false) {
  const minimum = request.kind === "full-map" ? coordinate(0) : request.minimum;
  const maximum = request.kind === "full-map" ? coordinate(3) : request.maximum;
  return {
    projectionVersion: 1,
    target: observed.target,
    mode: observed.mode,
    level: observed.level,
    levelFacts: observed.levelFacts,
    provenance: observed.provenance,
    boundary: {
      nativeTick: observed.boundary.nativeTick + (mismatch ? 1 : 0),
    },
    fingerprints: observed.fingerprints,
    region: { kind: request.kind, minimum, maximum },
    cellsOrder: "z-y-x",
    cells: observed.cells
      .filter(({ coordinate: cell }) => cell.x >= minimum.x && cell.x <= maximum.x)
      .map((cell) => ({
        cellOrdinal: cell.cellOrdinal,
        coordinate: cell.coordinate,
        itemsOrder: "stratum-then-identity",
        items: cell.elements.map((element, projectionOrder) => ({
          ...element,
          projectionOrder,
          source: "observation-element",
        })),
      })),
    terminal: observed.terminal,
  };
}

function createFakeRuntime(options = {}) {
  const runs = new Map();
  const checkpoints = new Map();
  let nextRun = 0;
  let nextCheckpoint = 0;
  const counters = {
    starts: 0,
    liveRuns: 0,
    maximumLiveRuns: 0,
    advances: 0,
    captures: 0,
    restores: 0,
    disposedRuns: 0,
    disposedCheckpoints: 0,
    liveCheckpoints: 0,
  };
  const tokenFor = (handle) => {
    const token = runs.get(handle);
    if (!token) throw new Error("unknown run");
    return token;
  };
  const makeToken = (mode, source) => ({
    mode,
    seed: source.seed,
    replayInputs: source.replayInputs ?? [],
    tick: -1,
    x: 0,
    inventory: 0,
    remaining: source.remaining ?? 2,
    keyPresent: true,
    rng: 0,
    actorX: 3,
    terminal: "running",
    lastInput: null,
    restored: false,
    opaque: 0,
  });
  const runtime = {
    async startManual(source) {
      counters.starts += 1;
      counters.liveRuns += 1;
      counters.maximumLiveRuns = Math.max(counters.maximumLiveRuns, counters.liveRuns);
      const handle = { run: nextRun++ };
      runs.set(handle, makeToken("manual", source));
      return handle;
    },
    async startReplay(source) {
      counters.starts += 1;
      counters.liveRuns += 1;
      counters.maximumLiveRuns = Math.max(counters.maximumLiveRuns, counters.liveRuns);
      const handle = { run: nextRun++ };
      runs.set(handle, makeToken("replay", source));
      return handle;
    },
    async advanceTick(handle, request) {
      counters.advances += 1;
      const token = tokenFor(handle);
      const inputCode = request.kind === "manual-poll"
        ? request.inputCode
        : token.replayInputs[token.tick + 1] ?? 0;
      token.tick += 1;
      token.lastInput = inputCode;
      token.rng += 1;
      if (inputCode === 1) {
        token.x = Math.min(3, token.x + 1);
        if (token.x === 1 && token.keyPresent) {
          token.keyPresent = false;
          token.inventory += options.collectionInventoryDelta ?? 1;
        }
      } else if (inputCode === 2) {
        token.actorX = Math.max(0, token.actorX - 1);
      } else if (inputCode === 3) {
        token.remaining = Math.max(0, token.remaining - 1);
      } else if (inputCode === 8) {
        token.terminal = "won";
      } else if (inputCode === 9) {
        token.terminal = "lost";
      }
      if (token.restored && options.divergeRestored) token.opaque += 1;
    },
    async observe(handle) {
      return structuredClone(observation(tokenFor(handle), options));
    },
    async terminal(handle) {
      return structuredClone(observation(tokenFor(handle), options).terminal);
    },
    async captureCheckpoint(handle) {
      counters.captures += 1;
      if (checkpoints.size >= (options.maximumCheckpoints ?? Number.POSITIVE_INFINITY)) {
        throw new Error("fixture checkpoint capacity exhausted");
      }
      const token = structuredClone(tokenFor(handle));
      const checkpoint = { checkpoint: nextCheckpoint++ };
      checkpoints.set(checkpoint, token);
      counters.liveCheckpoints += 1;
      const observed = observation(token, options);
      return {
        handle: checkpoint,
        metadata: {
          target: observed.target,
          mode: observed.mode,
          level: observed.level,
          levelFacts: observed.levelFacts,
          nativeTick: observed.boundary.nativeTick,
          exactRestoreDigest: options.checkpointMetadataMismatch === true
            ? "fixture:mismatched-checkpoint"
            : observed.fingerprints.exact,
          provenance: observed.provenance,
        },
      };
    },
    async cloneCheckpoint(handle) {
      if (checkpoints.size >= (options.maximumCheckpoints ?? Number.POSITIVE_INFINITY)) {
        throw new Error("fixture checkpoint capacity exhausted");
      }
      const token = structuredClone(checkpoints.get(handle));
      const checkpoint = { checkpoint: nextCheckpoint++ };
      checkpoints.set(checkpoint, token);
      counters.liveCheckpoints += 1;
      const observed = observation(token, options);
      return {
        handle: checkpoint,
        metadata: {
          target: observed.target,
          mode: observed.mode,
          level: observed.level,
          levelFacts: observed.levelFacts,
          nativeTick: observed.boundary.nativeTick,
          exactRestoreDigest: observed.fingerprints.exact,
          provenance: observed.provenance,
        },
      };
    },
    async restoreCheckpoint(handle) {
      counters.restores += 1;
      const token = structuredClone(checkpoints.get(handle));
      if (!token) throw new Error("unknown checkpoint");
      token.restored = true;
      if (options.divergeAtRestore) token.opaque += 1;
      const run = { run: nextRun++ };
      runs.set(run, token);
      counters.liveRuns += 1;
      counters.maximumLiveRuns = Math.max(counters.maximumLiveRuns, counters.liveRuns);
      return run;
    },
    async projectRender(handle, request) {
      const token = tokenFor(handle);
      const render = renderFrom(
        observation(token, options),
        request,
        options.renderMismatch === true,
      );
      if (options.divergeRestoredRender === true && token.restored && token.tick >= 0) {
        render.cells[0].items[0].state = "restored-only";
      }
      return render;
    },
    async disposeRun(handle) {
      if (runs.delete(handle)) {
        counters.disposedRuns += 1;
        counters.liveRuns -= 1;
      }
    },
    async disposeCheckpoint(handle) {
      if (checkpoints.delete(handle)) {
        counters.disposedCheckpoints += 1;
        counters.liveCheckpoints -= 1;
      }
    },
  };
  return { runtime, counters };
}

function plan({
  sourcePlacementId = KEY_ID,
  stateEffects = [{
    axis: "inventory",
    resourceType: "cc1:key-red",
    delta: 1,
  }],
  stateLedger = [{
    axis: "inventory",
    resourceType: "cc1:key-red",
    initial: 0,
    increased: 1,
    decreased: 0,
    remaining: 1,
  }],
} = {}) {
  return {
    previewVersion: 1,
    planId: "plan:key",
    target: "ms",
    rootId: "root:exit",
    exitId: EXIT_ID,
    status: "candidate",
    stepsOrder: "forward-prerequisite-first",
    steps: [{
      stepOrder: 0,
      operatorId: "operator:collect-key",
      kind: "collect",
      achieves: {
        kind: "collect",
        resourceType: "cc1:key-red",
        amount: 1,
        collectionOccurrenceId: "collection:key",
        sourcePlacementId,
      },
      prerequisites: [],
      stateEffects,
      evidenceIds: [KEY_ID],
    }],
    unresolvedOrder: "reason-goal-path",
    unresolved: [],
    stateLedgerOrder: "axis-resource-type",
    stateLedger,
  };
}

function abstractPlan(stateEffects = [], stateLedger = []) {
  return plan({ sourcePlacementId: null, stateEffects, stateLedger });
}

function nonResourcePlan() {
  const result = abstractPlan();
  result.steps[0].kind = "reach";
  result.steps[0].achieves = { kind: "reach", regionId: "region:contract-authority" };
  return result;
}

const predicate = {
  playerAtStart: {
    predicateId: "predicate:player-start",
    kind: "player-coordinate",
    coordinate: coordinate(0),
  },
  playerAtKey: {
    predicateId: "predicate:player-key",
    kind: "player-coordinate",
    coordinate: coordinate(1),
  },
  noKey: {
    predicateId: "predicate:no-key",
    kind: "inventory-count",
    resourceType: "cc1:key-red",
    comparison: "equals",
    count: 0,
  },
  hasKey: {
    predicateId: "predicate:has-key",
    kind: "inventory-count",
    resourceType: "cc1:key-red",
    comparison: "at-least",
    count: 1,
  },
  keyPresent: {
    predicateId: "predicate:key-present",
    kind: "placement-presence",
    placementId: KEY_ID,
    present: true,
  },
  keyAbsent: {
    predicateId: "predicate:key-absent",
    kind: "placement-presence",
    placementId: KEY_ID,
    present: false,
  },
  running: {
    predicateId: "predicate:running",
    kind: "terminal-state",
    terminalKind: "running",
  },
};

function selector(kind, rest = {}) {
  return { kind, ...rest };
}

function contract(overrides = {}) {
  return {
    contractVersion: 1,
    contractId: "contract:collect-red-key",
    title: "Collect the adjacent red key",
    description: "Move one cell east and observe the exact red-key state change.",
    target: "ms",
    planSegment: {
      planId: "plan:key",
      rootId: "root:exit",
      startStepOrder: 0,
      endStepOrder: 0,
      operatorIds: ["operator:collect-key"],
    },
    requires: [predicate.playerAtStart, predicate.noKey, predicate.keyPresent],
    ensures: [predicate.playerAtKey, predicate.hasKey, predicate.keyAbsent],
    invariants: [predicate.running],
    stop: predicate.hasKey,
    maximumAdvanceTicks: 4,
    footprint: {
      mustChange: [
        selector("inventory-resource", { resourceType: "cc1:key-red" }),
        selector("placement", { placementId: KEY_ID }),
      ],
      mayChange: [
        selector("timing"),
        selector("input"),
        selector("randomness"),
        selector("player"),
        selector("cell", { coordinate: coordinate(0) }),
        selector("cell", { coordinate: coordinate(1) }),
      ],
      mustNotChange: [selector("remaining-requirement", { resourceType: "cc1:icchip" })],
    },
    forbiddenObservedChanges: [selector("terminal")],
    provenance: {
      derivation: "authored",
      derivationRevision: "fixture-contract-r1",
      review: { status: "unreviewed" },
    },
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    start: { kind: "manual", source: { seed: 7 } },
    initialization: {
      randomSeed: 7,
      seedSemantics: "fixture-seed",
      replay: null,
    },
    prefix: [],
    snippet: [{ kind: "manual-poll", inputCode: 1 }],
    expectedEntryBoundary: -1,
    plan: plan(),
    segment: contract().planSegment,
    contract: contract(),
    renderRegion: {
      kind: "box",
      minimum: coordinate(0),
      maximum: coordinate(1),
    },
    bounds: {
      maximumPrefixTicks: 8,
      maximumSnippetTicks: 8,
    },
    ...overrides,
  };
}

function executor(
  fake,
  maximumCachedPrefixes = 2,
  validatorRevision = "fixture-validator-r1",
) {
  return createContextualWitnessExecutor({
    runtime: fake.runtime,
    sha256,
    validatorRevision,
    maximumCachedPrefixes,
  });
}

test("verifies one exact uninterrupted/restored collection witness", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const result = await service.execute(input());

  assert.equal(result.outcome.kind, "verified");
  assert.equal(result.join.state, "exact");
  assert.deepEqual(result.planVerificationScope, {
    kind: "selected-segment-only",
    parentPlanStatus: "candidate",
  });
  assert.deepEqual(result.planEffectValidation, [{
    axis: "inventory",
    resourceType: "cc1:key-red",
    expectedDelta: 1,
    observedDelta: 1,
    passed: true,
  }]);
  assert.equal(result.snippet.consumedDecisionCount, 1);
  assert.equal(result.entry.observation.boundary.nativeTick, -1);
  assert.equal(result.end.observation.boundary.nativeTick, 0);
  assert.equal(result.end.observation.inventory[0].count, 1);
  assert.equal(result.end.observation.player.coordinate.x, 1);
  assert.match(result.entryId, /^entry:sha256:[0-9a-f]{64}$/u);
  assert.match(result.witnessId, /^witness:sha256:[0-9a-f]{64}$/u);
  for (const boundary of [result.entry, result.end]) {
    const observationCanonical = canonicalizeJson(boundary.observation);
    const renderCanonical = canonicalizeJson(boundary.render);
    const observationDigest = await sha256.digestUtf8(observationCanonical);
    const renderDigest = await sha256.digestUtf8(renderCanonical);
    assert.deepEqual(boundary.observationContent, {
      digest: `sha256:${Buffer.from(observationDigest).toString("hex")}`,
      byteLength: new TextEncoder().encode(observationCanonical).byteLength,
    });
    assert.deepEqual(boundary.renderContent, {
      digest: `sha256:${Buffer.from(renderDigest).toString("hex")}`,
      byteLength: new TextEncoder().encode(renderCanonical).byteLength,
    });
  }
  assert.ok(result.observedChanges.some((change) => (
    change.kind === "inventory-count"
      && change.resourceType === "cc1:key-red"
      && change.before === 0
      && change.after === 1
  )));
  const keyCell = result.observedChanges.find((change) => (
    change.kind === "cell-elements" && change.coordinate.x === 1
  ));
  assert.ok(keyCell.before.some((element) => (
    element.identity.kind === "placement" && element.identity.placementId === KEY_ID
  )));
  assert.equal(keyCell.after.some((element) => (
    element.identity.kind === "placement" && element.identity.placementId === KEY_ID
  )), false);
  assert.doesNotMatch(JSON.stringify(result), /checkpoint|createdAt|generatedAt/u);
  assert.equal(fake.counters.disposedRuns, 2);
});

test("proves a Lynx replay prefix plus snippet against uninterrupted execution", async () => {
  const fake = createFakeRuntime({ target: "lynx" });
  const replayContract = contract({ target: "lynx" });
  const replayPlan = plan();
  replayPlan.target = "lynx";
  const result = await executor(fake).execute(input({
    start: { kind: "replay", source: { seed: 11, replayInputs: [0, 1] } },
    initialization: {
      randomSeed: 11,
      seedSemantics: "fixture-seed",
      replay: { digest: `sha256:${"e".repeat(64)}`, byteLength: 2 },
    },
    prefix: [{ kind: "replay-tick" }],
    snippet: [{ kind: "replay-tick" }],
    expectedEntryBoundary: 0,
    plan: replayPlan,
    contract: replayContract,
    segment: replayContract.planSegment,
  }));

  assert.equal(result.target, "lynx");
  assert.equal(result.mode, "replay");
  assert.equal(result.entry.observation.boundary.nativeTick, 0);
  assert.equal(result.end.observation.boundary.nativeTick, 1);
  assert.equal(result.outcome.kind, "verified");
  assert.equal(result.join.state, "exact");
});

test("fails a precondition before advancing the snippet", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const impossible = contract({
    requires: [predicate.hasKey, predicate.keyPresent],
  });
  const result = await service.execute(input({
    contract: impossible,
    segment: impossible.planSegment,
  }));

  assert.deepEqual(result.outcome, {
    kind: "failed",
    failure: {
      code: "witness.precondition",
      boundaryNativeTick: -1,
      predicateId: "predicate:has-key",
      decisionOrder: null,
      detail: "required entry predicate was not satisfied",
    },
  });
  assert.equal(result.snippet.consumedDecisionCount, 0);
  assert.equal(fake.counters.advances, 0);
  assert.equal(result.join, null);
});

test("checks invariants at every native boundary and retains the first failure", async () => {
  const fake = createFakeRuntime({ divergeRestoredRender: true });
  const service = executor(fake);
  const actorStays = {
    predicateId: "predicate:bug-position",
    kind: "actor-state",
    actorId: BUG_ID,
    property: "coordinate",
    value: coordinate(3),
  };
  const actorContract = contract({
    requires: [predicate.playerAtStart],
    ensures: [],
    invariants: [predicate.running, actorStays],
    stop: {
      predicateId: "predicate:bug-moved",
      kind: "actor-state",
      actorId: BUG_ID,
      property: "coordinate",
      value: coordinate(2),
    },
    footprint: {
      mustChange: [],
      mayChange: [selector("timing"), selector("input"), selector("randomness"), selector("actor", { actorId: BUG_ID }), selector("cell", { coordinate: coordinate(2) }), selector("cell", { coordinate: coordinate(3) })],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [],
  });
  const result = await service.execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 2 }],
    plan: abstractPlan(),
    contract: actorContract,
    segment: actorContract.planSegment,
  }));

  assert.equal(result.outcome.kind, "failed");
  assert.equal(result.outcome.failure.code, "witness.invariant");
  assert.equal(result.outcome.failure.predicateId, "predicate:bug-position");
  assert.equal(result.outcome.failure.decisionOrder, 0);
  assert.equal(result.boundaryChecks.at(-1).nativeTick, 0);
  assert.equal(result.join.state, "broken");
});

test("does not confuse inventory with remaining-requirement progress", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const requirementStop = {
    predicateId: "predicate:one-chip-remains",
    kind: "remaining-requirement-count",
    resourceType: "cc1:icchip",
    comparison: "equals",
    count: 1,
  };
  const axisContract = contract({
    requires: [predicate.playerAtStart],
    ensures: [predicate.hasKey],
    invariants: [predicate.running],
    stop: requirementStop,
    footprint: {
      mustChange: [selector("remaining-requirement", { resourceType: "cc1:icchip" })],
      mayChange: [selector("timing"), selector("input"), selector("randomness")],
      mustNotChange: [selector("inventory-resource", { resourceType: "cc1:key-red" })],
    },
    forbiddenObservedChanges: [],
  });
  const result = await service.execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 3 }],
    plan: abstractPlan(
      [{ axis: "remaining-requirement", resourceType: "cc1:icchip", delta: -1 }],
      [{
        axis: "remaining-requirement",
        resourceType: "cc1:icchip",
        initial: 2,
        increased: 0,
        decreased: 1,
        remaining: 1,
      }],
    ),
    contract: axisContract,
    segment: axisContract.planSegment,
  }));

  assert.equal(result.outcome.kind, "failed");
  assert.equal(result.outcome.failure.code, "witness.postcondition");
  assert.ok(result.observedChanges.some((change) => (
    change.kind === "remaining-requirement-count"
      && change.resourceType === "cc1:icchip"
      && change.before === 2
      && change.after === 1
  )));
  assert.equal(result.observedChanges.some(({ kind }) => kind === "inventory-count"), false);
});

test("matches selected resource effects by axis, direction, and magnitude", async () => {
  const aggregatePlan = plan({
    stateEffects: [
      { axis: "inventory", resourceType: "cc1:key-red", delta: 2 },
      { axis: "inventory", resourceType: "cc1:key-red", delta: -1 },
    ],
  });
  const aggregated = await executor(createFakeRuntime()).execute(input({
    plan: aggregatePlan,
  }));
  assert.equal(aggregated.outcome.kind, "verified");
  assert.deepEqual(aggregated.planEffectValidation, [{
    axis: "inventory",
    resourceType: "cc1:key-red",
    expectedDelta: 1,
    observedDelta: 1,
    passed: true,
  }]);

  const doubled = await executor(createFakeRuntime({
    collectionInventoryDelta: 2,
  })).execute(input());
  assert.equal(doubled.outcome.kind, "failed");
  assert.equal(doubled.outcome.failure.code, "witness.plan-effect");
  assert.deepEqual(doubled.planEffectValidation, [{
    axis: "inventory",
    resourceType: "cc1:key-red",
    expectedDelta: 1,
    observedDelta: 2,
    passed: false,
  }]);

  const oneChipRemains = {
    predicateId: "predicate:one-chip-remains-effect",
    kind: "remaining-requirement-count",
    resourceType: "cc1:icchip",
    comparison: "equals",
    count: 1,
  };
  const decreasingContract = contract({
    requires: [predicate.playerAtStart],
    ensures: [oneChipRemains],
    invariants: [predicate.running],
    stop: oneChipRemains,
    footprint: {
      mustChange: [selector("remaining-requirement", { resourceType: "cc1:icchip" })],
      mayChange: [selector("timing"), selector("input"), selector("randomness")],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [],
  });
  const decreasingPlan = abstractPlan(
    [{ axis: "remaining-requirement", resourceType: "cc1:icchip", delta: 1 }],
    [{
      axis: "remaining-requirement",
      resourceType: "cc1:icchip",
      initial: 2,
      increased: 1,
      decreased: 0,
      remaining: 3,
    }],
  );
  const decreased = await executor(createFakeRuntime()).execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 3 }],
    plan: decreasingPlan,
    contract: decreasingContract,
    segment: decreasingContract.planSegment,
  }));
  assert.equal(decreased.outcome.kind, "failed");
  assert.equal(decreased.outcome.failure.code, "witness.plan-effect");
  assert.deepEqual(decreased.planEffectValidation, [{
    axis: "remaining-requirement",
    resourceType: "cc1:icchip",
    expectedDelta: 1,
    observedDelta: -1,
    passed: false,
  }]);
});

test("reports decision exhaustion and terminal-before-stop distinctly", async () => {
  const exhaustedFake = createFakeRuntime();
  const exhausted = await executor(exhaustedFake).execute(input({ snippet: [] }));
  assert.equal(exhausted.outcome.kind, "failed");
  assert.equal(exhausted.outcome.failure.code, "witness.decision-exhausted");

  const terminalFake = createFakeRuntime();
  const terminalContract = contract({
    invariants: [],
    footprint: {
      mustChange: [],
      mayChange: [selector("timing"), selector("input"), selector("randomness"), selector("terminal")],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [],
  });
  const terminal = await executor(terminalFake).execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 9 }],
    plan: abstractPlan(),
    contract: terminalContract,
    segment: terminalContract.planSegment,
  }));
  assert.equal(terminal.outcome.kind, "failed");
  assert.equal(terminal.outcome.failure.code, "witness.terminal-before-stop");
});

test("fails closed on unaccounted, must-not-change, and missing must-change effects", async () => {
  const fake = createFakeRuntime();
  const base = contract();
  const unaccounted = contract({
    footprint: {
      ...base.footprint,
      mayChange: base.footprint.mayChange.filter(({ kind }) => kind !== "randomness"),
    },
  });
  const unaccountedResult = await executor(fake).execute(input({
    contract: unaccounted,
    segment: unaccounted.planSegment,
  }));
  assert.equal(unaccountedResult.outcome.failure.code, "witness.unaccounted-change");

  const protectedFake = createFakeRuntime();
  const protectedResult = await executor(protectedFake).execute(input({
    snippet: [
      { kind: "manual-poll", inputCode: 3 },
      { kind: "manual-poll", inputCode: 1 },
    ],
  }));
  assert.equal(protectedResult.outcome.failure.code, "witness.must-not-change");

  const unchangedFake = createFakeRuntime();
  const missingChange = contract({
    stop: predicate.playerAtStart,
    ensures: [predicate.playerAtStart],
  });
  const missingResult = await executor(unchangedFake).execute(input({
    snippet: [],
    plan: abstractPlan(),
    contract: missingChange,
    segment: missingChange.planSegment,
  }));
  assert.equal(missingResult.outcome.failure.code, "witness.must-change");
});

test("distinguishes native-tick budget exhaustion and forbidden observed changes", async () => {
  const budgetContract = contract({ maximumAdvanceTicks: 1 });
  const budgetResult = await executor(createFakeRuntime()).execute(input({
    snippet: [
      { kind: "manual-poll", inputCode: 0 },
      { kind: "manual-poll", inputCode: 1 },
    ],
    contract: budgetContract,
    segment: budgetContract.planSegment,
  }));
  assert.equal(budgetResult.outcome.failure.code, "witness.budget-exhausted");
  assert.equal(budgetResult.snippet.consumedDecisionCount, 1);

  const lost = {
    predicateId: "predicate:lost",
    kind: "terminal-state",
    terminalKind: "lost",
    cause: "fixture:loss",
  };
  const forbiddenContract = contract({
    requires: [predicate.playerAtStart],
    ensures: [lost],
    invariants: [],
    stop: lost,
    footprint: {
      mustChange: [],
      mayChange: [
        selector("timing"),
        selector("input"),
        selector("randomness"),
        selector("terminal"),
      ],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [selector("terminal")],
  });
  const forbiddenResult = await executor(createFakeRuntime()).execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 9 }],
    plan: abstractPlan(),
    contract: forbiddenContract,
    segment: forbiddenContract.planSegment,
  }));
  assert.equal(forbiddenResult.outcome.failure.code, "witness.forbidden-change");
});

test("retains offscreen actor and RNG changes when the render region is cropped", async () => {
  const fake = createFakeRuntime();
  const actorMoved = {
    predicateId: "predicate:bug-moved",
    kind: "actor-state",
    actorId: BUG_ID,
    property: "coordinate",
    value: coordinate(2),
  };
  const offscreenContract = contract({
    requires: [predicate.playerAtStart],
    ensures: [actorMoved],
    invariants: [predicate.running],
    stop: actorMoved,
    footprint: {
      mustChange: [selector("actor", { actorId: BUG_ID })],
      mayChange: [selector("timing"), selector("input"), selector("randomness"), selector("cell", { coordinate: coordinate(2) }), selector("cell", { coordinate: coordinate(3) })],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [],
  });
  const result = await executor(fake).execute(input({
    snippet: [{ kind: "manual-poll", inputCode: 2 }],
    plan: nonResourcePlan(),
    contract: offscreenContract,
    segment: offscreenContract.planSegment,
    renderRegion: {
      kind: "box",
      minimum: coordinate(0),
      maximum: coordinate(1),
    },
  }));

  assert.equal(result.outcome.kind, "verified");
  assert.deepEqual(result.planEffectValidation, []);
  assert.deepEqual(result.entry.render.cells.map(({ coordinate }) => coordinate.x), [0, 1]);
  assert.ok(result.observedChanges.some((change) => (
    change.kind === "actor-state" && change.actorId === BUG_ID
  )));
  assert.ok(result.observedChanges.some(({ kind }) => kind === "randomness-state"));
});

test("rejects incoherent render boundaries and broken exact checkpoint joins", async () => {
  const incoherent = createFakeRuntime({ renderMismatch: true });
  await assert.rejects(
    executor(incoherent).execute(input()),
    (error) => error instanceof ContextualWitnessExecutorError
      && error.code === "witness.render-incoherent",
  );

  const divergent = createFakeRuntime({ divergeRestored: true });
  const result = await executor(divergent).execute(input());
  assert.equal(result.outcome.kind, "failed");
  assert.equal(result.outcome.failure.code, "witness.join-broken");
  assert.equal(result.join.state, "semantic-only");
});

test("reuses only complete matching prefix checkpoints and rebuilds identically after clearing", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake, 1);
  const first = await service.execute(input());
  const second = await service.execute(input());
  assert.deepEqual(second, first);
  assert.equal(fake.counters.captures, 1);

  await service.clearCheckpointCache();
  const rebuilt = await service.execute(input());
  assert.deepEqual(rebuilt, first);
  assert.equal(fake.counters.captures, 2);

  await service.execute(input({
    start: { kind: "manual", source: { seed: 8 } },
    initialization: {
      randomSeed: 8,
      seedSemantics: "fixture-seed",
      replay: null,
    },
  }));
  assert.equal(fake.counters.captures, 3);
  assert.ok(fake.counters.disposedCheckpoints >= 2);
});

test("evicts before capture at checkpoint capacity and cleans incoherent captures", async () => {
  const capacityFake = createFakeRuntime({ maximumCheckpoints: 1 });
  const service = executor(capacityFake, 1);
  const first = await service.execute(input());
  const second = await service.execute(input({
    start: { kind: "manual", source: { seed: 8 } },
    initialization: {
      randomSeed: 8,
      seedSemantics: "fixture-seed",
      replay: null,
    },
  }));
  assert.equal(first.outcome.kind, "verified");
  assert.equal(second.outcome.kind, "verified");
  assert.equal(capacityFake.counters.liveCheckpoints, 1);
  assert.equal(capacityFake.counters.disposedCheckpoints, 1);
  await service.clearCheckpointCache();
  assert.equal(capacityFake.counters.liveCheckpoints, 0);

  const incoherentFake = createFakeRuntime({ checkpointMetadataMismatch: true });
  await assert.rejects(
    executor(incoherentFake).execute(input()),
    (error) => error instanceof ContextualWitnessExecutorError
      && error.code === "witness.checkpoint-incoherent",
  );
  assert.equal(incoherentFake.counters.liveCheckpoints, 0);
  assert.equal(incoherentFake.counters.disposedCheckpoints, 1);
});

test("binds normalized contract and selected plan intent into witness identity", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const baseline = await service.execute(input());

  const revisedContract = contract({
    description: "Same execution, deliberately revised contract semantics.",
  });
  const contractMutation = await service.execute(input({
    contract: revisedContract,
    segment: revisedContract.planSegment,
  }));
  assert.equal(contractMutation.outcome.kind, "verified");
  assert.notEqual(contractMutation.witnessId, baseline.witnessId);

  const revisedPlan = plan();
  revisedPlan.steps[0].evidenceIds = [EXIT_ID];
  const planMutation = await service.execute(input({ plan: revisedPlan }));
  assert.equal(planMutation.outcome.kind, "verified");
  assert.notEqual(planMutation.witnessId, baseline.witnessId);

  const validatorMutation = await executor(
    fake,
    2,
    "fixture-validator-r2",
  ).execute(input());
  assert.equal(validatorMutation.outcome.kind, "verified");
  assert.notEqual(validatorMutation.witnessId, baseline.witnessId);
});

test("serializes runtime creation with execution and cache ownership", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const [first, second] = await Promise.all([
    service.execute(input()),
    service.execute(input()),
  ]);

  assert.deepEqual(second, first);
  assert.equal(fake.counters.maximumLiveRuns, 2);
  assert.equal(fake.counters.liveRuns, 0);
});

test("rejects malformed values across every closed contract union before runtime start", () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  const invalidContracts = [
    ["target", (value) => { value.target = "hybrid"; }],
    ["stable id", (value) => { value.contractId = "Contract With Spaces"; }],
    ["durable title", (value) => { value.title = "x".repeat(2_049); }],
    ["plan operator id", (value) => { value.planSegment.operatorIds = ["Operator Bad"]; }],
    ["plan operator shape", (value) => { value.planSegment.operatorIds = {}; }],
    ["sparse predicate list", (value) => {
      value.requires = [];
      value.requires.length = 1;
    }],
    ["derivation", (value) => { value.provenance.derivation = "inferred"; }],
    ["review", (value) => { value.provenance.review = { status: "approved" }; }],
    ["actor property", (value) => {
      value.requires = [{
        predicateId: "predicate:bad-actor-property",
        kind: "actor-state",
        actorId: BUG_ID,
        property: "velocity",
        value: 1,
      }];
    }],
    ["actor lifecycle", (value) => {
      value.requires = [{
        predicateId: "predicate:bad-actor-lifecycle",
        kind: "actor-state",
        actorId: BUG_ID,
        property: "lifecycle",
        value: "ghost",
      }];
    }],
    ["actor facing", (value) => {
      value.requires = [{
        predicateId: "predicate:bad-actor-facing",
        kind: "actor-state",
        actorId: BUG_ID,
        property: "facing",
        value: "up",
      }];
    }],
    ["actor movement", (value) => {
      value.requires = [{
        predicateId: "predicate:bad-actor-movement",
        kind: "actor-state",
        actorId: BUG_ID,
        property: "movement",
        value: "jumping",
      }];
    }],
    ["terminal", (value) => {
      value.stop = {
        predicateId: "predicate:bad-terminal",
        kind: "terminal-state",
        terminalKind: "completed",
      };
    }],
    ["selector identity", (value) => {
      value.footprint.mayChange = [{ kind: "actor", actorId: "actor:sha256:short" }];
    }],
    ["selector shape", (value) => {
      value.footprint.mayChange = [{ kind: "timing", resourceType: "cc1:key-red" }];
    }],
    ["predicate shape", (value) => {
      value.requires[0].unexpected = true;
    }],
    ["coordinate shape", (value) => {
      value.requires[0].coordinate = { ...coordinate(0), layer: 0 };
    }],
  ];

  for (const [label, mutate] of invalidContracts) {
    const malformed = structuredClone(contract());
    mutate(malformed);
    assert.throws(
      () => service.execute(input({
        plan: abstractPlan(),
        contract: malformed,
        segment: malformed.planSegment,
      })),
      (error) => error instanceof ContextualWitnessExecutorError
        && error.code === "witness.invalid-contract",
      label,
    );
  }
  assert.equal(fake.counters.starts, 0);
});

test("rejects mode-mismatched decisions but verifies a selected unresolved-parent segment", async () => {
  const fake = createFakeRuntime();
  const service = executor(fake);
  assert.throws(
    () => service.execute(input({
      snippet: [{ kind: "replay-tick" }],
    })),
    (error) => error instanceof ContextualWitnessExecutorError
      && error.code === "witness.invalid-request",
  );
  assert.equal(fake.counters.starts, 0);

  const unresolved = plan();
  unresolved.status = "unresolved";
  unresolved.unresolved = [{
    goalId: "goal:99",
    predicate: { kind: "reach", regionId: "region:unknown" },
    reason: "dynamic",
    viaOperatorId: null,
    evidenceIds: [],
    pathGoalIds: ["goal:99"],
  }];
  const result = await service.execute(input({ plan: unresolved }));
  assert.equal(result.outcome.kind, "verified");
  assert.deepEqual(result.planVerificationScope, {
    kind: "selected-segment-only",
    parentPlanStatus: "unresolved",
  });
  assert.equal(unresolved.status, "unresolved");
});
