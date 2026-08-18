import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TerminalFirstPlanningError,
  buildTerminalFirstPlan,
} from "../../dist/plan/index.js";

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;

const reachExit = (exitId) => ({ kind: "reach-exit", exitId });
const reach = (regionId) => ({ kind: "reach", regionId });
const collect = (
  resourceType,
  collectionOccurrenceId,
  sourcePlacementId,
  amount = 1,
) => ({
  kind: "collect",
  resourceType,
  amount,
  collectionOccurrenceId,
  sourcePlacementId,
});
const unlock = (gateId, requirement) => ({
  kind: "unlock",
  gateId,
  requirement,
});

const consumeInventory = (resourceType, amount = 1) => ({
  kind: "consume-inventory",
  resourceType,
  amount,
});
const possessInventory = (resourceType, amount = 1) => ({
  kind: "possess-inventory",
  resourceType,
  amount,
});
const remainingZero = (resourceType) => ({
  kind: "remaining-zero",
  resourceType,
});

const satisfied = (predicate, evidenceIds = []) => ({
  predicate,
  status: "satisfied",
  evidenceIds,
});

const operator = (
  operatorId,
  target,
  kind,
  achieves,
  prerequisites = [],
  stateEffects = [],
  evidenceIds = [],
) => ({
  operatorId,
  target,
  kind,
  achieves,
  prerequisites,
  stateEffects,
  evidenceIds,
});

function simpleInput(overrides = {}) {
  const exitGoal = reachExit("exit:east");
  const room = reach("region:entry");
  return {
    planningVersion: 1,
    target: "ms",
    exits: [{
      target: "ms",
      exitId: "exit:east",
      evidenceIds: ["placement:exit:east"],
    }],
    facts: [satisfied(room, ["topology:entry"])],
    operators: [operator(
      "operator:enter-east-exit",
      "ms",
      "reach-exit",
      exitGoal,
      [room],
      [],
      ["topology:exit-edge"],
    )],
    initialState: {
      inventory: [],
      remainingRequirements: [],
    },
    ...overrides,
  };
}

test("regresses a one-room terminal root and emits a forward preview", () => {
  const result = buildTerminalFirstPlan(simpleInput());

  assert.equal(result.planningVersion, 1);
  assert.equal(result.target, "ms");
  assert.deepEqual(
    result.graph.roots.map(({ target, exitId }) => ({ target, exitId })),
    [{ target: "ms", exitId: "exit:east" }],
  );
  assert.equal(result.graph.goals.length, 2);
  assert.equal(result.graph.operators.length, 1);
  assert.deepEqual(
    result.trace.map(({ action }) => action),
    ["root", "regress", "satisfied"],
  );
  assert.deepEqual(
    result.trace.map(({ provenance }) => provenance),
    ["authored", "backward-regressed", "forward-derived"],
  );
  assert.equal(result.expandedPlans.length, 1);
  assert.equal(result.expandedPlans[0].status, "candidate");
  assert.deepEqual(
    result.expandedPlans[0].steps.map(({ operatorId }) => operatorId),
    ["operator:enter-east-exit"],
  );
  assert.deepEqual(result.expandedPlans[0].unresolved, []);
  assert.deepEqual(result.diagnostics, []);
});

test("binds a key collection occurrence and consumes inventory at its door", () => {
  const keyPlacement = "placement:sha256:d00e6d868291293c03d17bf6908414aaf16f4335d5b1cd46aebe8b77b9dcfec6";
  const start = reach("region:start");
  const pickup = reach("region:key-pickup");
  const finish = reach("region:finish");
  const key = collect("key:red", "collection:key-pyramid:red-adjacent", keyPlacement);
  const gate = unlock("gate:red-door", consumeInventory("key:red"));
  const result = buildTerminalFirstPlan({
    planningVersion: 1,
    target: "ms",
    exits: [{ target: "ms", exitId: "exit:main", evidenceIds: [] }],
    facts: [satisfied(start), satisfied(pickup)],
    operators: [
      operator("operator:key-door:exit", "ms", "reach-exit", reachExit("exit:main"), [finish]),
      operator("operator:key-door:reach-finish", "ms", "reach", finish, [gate]),
      operator("operator:key-door:unlock", "ms", "unlock", gate, [start, key]),
      operator(
        "operator:key-door:collect",
        "ms",
        "collect",
        key,
        [pickup],
        [{ axis: "inventory", resourceType: "key:red", delta: 1 }],
      ),
    ],
    initialState: { inventory: [], remainingRequirements: [] },
  });
  const [plan] = result.expandedPlans;
  assert.ok(plan);
  assert.equal(plan.status, "candidate");
  assert.deepEqual(
    plan.steps.map(({ operatorId }) => operatorId),
    [
      "operator:key-door:collect",
      "operator:key-door:unlock",
      "operator:key-door:reach-finish",
      "operator:key-door:exit",
    ],
  );
  assert.deepEqual(plan.steps[0].achieves, key);
  assert.deepEqual(plan.steps[1].stateEffects, [{
    axis: "inventory",
    resourceType: "key:red",
    delta: -1,
  }]);
  assert.deepEqual(plan.stateLedger, [{
    axis: "inventory",
    resourceType: "key:red",
    initial: 0,
    increased: 1,
    decreased: 1,
    remaining: 0,
  }]);
});

test("tracks distinct chip occurrences on the remaining-requirement axis", () => {
  const chipA = collect(
    "chip",
    "collection:chip:a",
    `placement:sha256:${"a".repeat(64)}`,
  );
  const chipB = collect(
    "chip",
    "collection:chip:b",
    `placement:sha256:${"b".repeat(64)}`,
  );
  const socket = unlock("gate:socket", remainingZero("chip"));
  const finish = reach("region:finish");
  const result = buildTerminalFirstPlan({
    planningVersion: 1,
    target: "lynx",
    exits: [{ target: "lynx", exitId: "exit:main", evidenceIds: [] }],
    facts: [satisfied(reach("region:chip:a")), satisfied(reach("region:chip:b"))],
    operators: [
      operator("operator:chips:exit", "lynx", "reach-exit", reachExit("exit:main"), [finish]),
      operator("operator:chips:reach-finish", "lynx", "reach", finish, [socket]),
      operator("operator:chips:socket", "lynx", "unlock", socket, [chipB, chipA]),
      operator(
        "operator:chips:collect-a",
        "lynx",
        "collect",
        chipA,
        [reach("region:chip:a")],
        [{ axis: "remaining-requirement", resourceType: "chip", delta: -1 }],
      ),
      operator(
        "operator:chips:collect-b",
        "lynx",
        "collect",
        chipB,
        [reach("region:chip:b")],
        [{ axis: "remaining-requirement", resourceType: "chip", delta: -1 }],
      ),
    ],
    initialState: {
      inventory: [],
      remainingRequirements: [{ resourceType: "chip", amount: 2 }],
    },
  });
  const [plan] = result.expandedPlans;
  assert.ok(plan);
  assert.equal(plan.status, "candidate");
  assert.deepEqual(
    plan.steps.map(({ operatorId }) => operatorId),
    [
      "operator:chips:collect-a",
      "operator:chips:collect-b",
      "operator:chips:socket",
      "operator:chips:reach-finish",
      "operator:chips:exit",
    ],
  );
  assert.notEqual(
    plan.steps[0].achieves.collectionOccurrenceId,
    plan.steps[1].achieves.collectionOccurrenceId,
  );
  assert.deepEqual(plan.stateLedger, [{
    axis: "remaining-requirement",
    resourceType: "chip",
    initial: 2,
    increased: 0,
    decreased: 2,
    remaining: 0,
  }]);
});

test("executes a shared prerequisite occurrence once across two AND branches", () => {
  const key = collect(
    "key:red",
    "collection:shared-red",
    `placement:sha256:${"a".repeat(64)}`,
  );
  const left = reach("region:left");
  const right = reach("region:right");
  const result = buildTerminalFirstPlan(simpleInput({
    operators: [
      operator(
        "operator:exit",
        "ms",
        "reach-exit",
        reachExit("exit:east"),
        [right, left],
      ),
      operator("operator:left", "ms", "reach", left, [key]),
      operator("operator:right", "ms", "reach", right, [key]),
      operator(
        "operator:collect-once",
        "ms",
        "collect",
        key,
        [],
        [{ axis: "inventory", resourceType: "key:red", delta: 1 }],
      ),
    ],
  }));

  assert.equal(
    result.expandedPlans[0].steps.filter(
      ({ operatorId }) => operatorId === "operator:collect-once",
    ).length,
    1,
  );
});

test("checks possess-only gates without consuming inventory", () => {
  const gate = unlock("gate:green", possessInventory("key:green"));
  const result = buildTerminalFirstPlan(simpleInput({
    operators: [
      operator("operator:exit", "ms", "reach-exit", reachExit("exit:east"), [gate]),
      operator("operator:green-gate", "ms", "unlock", gate),
    ],
    initialState: {
      inventory: [{ resourceType: "key:green", amount: 1 }],
      remainingRequirements: [],
    },
  }));

  assert.equal(result.expandedPlans[0].status, "candidate");
  assert.deepEqual(result.expandedPlans[0].stateLedger, [{
    axis: "inventory",
    resourceType: "key:green",
    initial: 1,
    increased: 0,
    decreased: 0,
    remaining: 1,
  }]);
});

test("keeps every target-scoped exit as a deterministic OR root", () => {
  const west = reachExit("exit:west");
  const east = reachExit("exit:east");
  const room = reach("region:entry");
  const input = simpleInput({
    exits: [
      { target: "ms", exitId: "exit:west", evidenceIds: ["placement:west"] },
      { target: "ms", exitId: "exit:east", evidenceIds: ["placement:east"] },
    ],
    operators: [
      operator("operator:west", "ms", "reach-exit", west, [room]),
      operator("operator:east", "ms", "reach-exit", east, [room]),
      // A foreign-target operator must never become an MS alternative.
      operator("operator:lynx-east", "lynx", "reach-exit", east, []),
      // Nor may foreign collection identity collide with the active target.
      operator(
        "operator:lynx-foreign-collection",
        "lynx",
        "collect",
        collect(
          "key:red",
          "collection:shared-name",
          `placement:sha256:${"a".repeat(64)}`,
        ),
        [],
        [{ axis: "inventory", resourceType: "key:red", delta: 1 }],
      ),
    ],
    facts: [
      satisfied(room),
      satisfied(collect(
        "key:red",
        "collection:shared-name",
        `placement:sha256:${"b".repeat(64)}`,
      )),
    ],
  });

  const result = buildTerminalFirstPlan(input);

  assert.deepEqual(
    result.graph.roots.map(({ exitId }) => exitId),
    ["exit:east", "exit:west"],
  );
  assert.deepEqual(
    result.expandedPlans.map(({ exitId, steps }) => ({
      exitId,
      operators: steps.map(({ operatorId }) => operatorId),
    })),
    [
      { exitId: "exit:east", operators: ["operator:east"] },
      { exitId: "exit:west", operators: ["operator:west"] },
    ],
  );
  assert.equal(
    result.graph.operators.some(({ operatorId }) => operatorId === "operator:lynx-east"),
    false,
  );
});

test("records unknown and dynamic premises as explicit unresolved obligations", () => {
  const exitGoal = reachExit("exit:main");
  const unknown = reach("region:unknown");
  const dynamic = reach("region:dynamic");
  const input = simpleInput({
    exits: [{ target: "lynx", exitId: "exit:main", evidenceIds: [] }],
    target: "lynx",
    facts: [
      { predicate: unknown, status: "unknown", evidenceIds: ["boundary:unknown"] },
      { predicate: dynamic, status: "dynamic", evidenceIds: ["boundary:monster"] },
    ],
    operators: [operator(
      "operator:exit",
      "lynx",
      "reach-exit",
      exitGoal,
      [dynamic, unknown],
    )],
  });

  const result = buildTerminalFirstPlan(input);
  const [plan] = result.expandedPlans;

  assert.ok(plan);
  assert.equal(plan.status, "unresolved");
  assert.deepEqual(
    plan.unresolved.map(({ reason, predicate }) => ({ reason, kind: predicate.kind })),
    [
      { reason: "dynamic", kind: "reach" },
      { reason: "unknown", kind: "reach" },
    ],
  );
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    ["planning.dynamic", "planning.unknown"],
  );
});

test("retains unknown evidence as an OR branch beside every valid achiever", () => {
  const uncertain = reach("region:uncertain");
  const result = buildTerminalFirstPlan(simpleInput({
    facts: [{
      predicate: uncertain,
      status: "unknown",
      evidenceIds: ["boundary:uncertain"],
    }],
    operators: [
      operator(
        "operator:exit",
        "ms",
        "reach-exit",
        reachExit("exit:east"),
        [uncertain],
      ),
      operator("operator:uncertain:a", "ms", "reach", uncertain),
      operator("operator:uncertain:b", "ms", "reach", uncertain),
    ],
  }));
  const uncertainNode = result.graph.goals.find(
    ({ predicate }) => predicate.kind === "reach" && predicate.regionId === "region:uncertain",
  );

  assert.ok(uncertainNode);
  assert.equal(uncertainNode.resolution, "regressed-with-unknown");
  assert.equal(uncertainNode.achieverNodeIds.length, 2);
  assert.deepEqual(
    result.expandedPlans.map(({ status, steps }) => ({
      status,
      operators: steps.map(({ operatorId }) => operatorId),
    })),
    [
      { status: "unresolved", operators: ["operator:exit"] },
      {
        status: "candidate",
        operators: ["operator:uncertain:a", "operator:exit"],
      },
      {
        status: "candidate",
        operators: ["operator:uncertain:b", "operator:exit"],
      },
    ],
  );
  assert.equal(
    result.trace.filter(
      ({ action, predicate }) => action === "regress"
        && predicate.kind === "reach"
        && predicate.regionId === "region:uncertain",
    ).length,
    2,
  );
});

test("expands a two-by-two AND/OR prerequisite product deterministically", () => {
  const left = reach("region:left-choice");
  const right = reach("region:right-choice");
  const result = buildTerminalFirstPlan(simpleInput({
    operators: [
      operator(
        "operator:exit",
        "ms",
        "reach-exit",
        reachExit("exit:east"),
        [right, left],
      ),
      operator("operator:left:a", "ms", "reach", left),
      operator("operator:left:b", "ms", "reach", left),
      operator("operator:right:a", "ms", "reach", right),
      operator("operator:right:b", "ms", "reach", right),
    ],
  }));

  assert.deepEqual(
    result.expandedPlans.map(({ steps }) => steps.map(({ operatorId }) => operatorId)),
    [
      ["operator:left:a", "operator:right:a", "operator:exit"],
      ["operator:left:a", "operator:right:b", "operator:exit"],
      ["operator:left:b", "operator:right:a", "operator:exit"],
      ["operator:left:b", "operator:right:b", "operator:exit"],
    ],
  );
});

test("diagnoses cycles, missing achievers, and inconsistent state ledgers", () => {
  const exitGoal = reachExit("exit:main");
  const regionA = reach("region:a");
  const regionB = reach("region:b");
  const missing = collect(
    "key:blue",
    "collection:missing-blue",
    `placement:sha256:${"c".repeat(64)}`,
  );
  const gate = unlock("gate:red", consumeInventory("key:red"));

  const cycleResult = buildTerminalFirstPlan(simpleInput({
    exits: [{ target: "ms", exitId: "exit:main", evidenceIds: [] }],
    facts: [],
    operators: [
      operator("operator:exit", "ms", "reach-exit", exitGoal, [regionA]),
      operator("operator:a", "ms", "reach", regionA, [regionB]),
      operator("operator:b", "ms", "reach", regionB, [regionA]),
    ],
  }));
  assert.ok(cycleResult.diagnostics.some(({ code }) => code === "planning.cycle"));
  assert.equal(cycleResult.expandedPlans[0].status, "unresolved");

  const missingResult = buildTerminalFirstPlan(simpleInput({
    exits: [{ target: "ms", exitId: "exit:main", evidenceIds: [] }],
    facts: [],
    operators: [operator("operator:exit", "ms", "reach-exit", exitGoal, [missing])],
  }));
  assert.ok(missingResult.diagnostics.some(({ code }) => code === "planning.no-achiever"));

  const resourceResult = buildTerminalFirstPlan(simpleInput({
    exits: [{ target: "ms", exitId: "exit:main", evidenceIds: [] }],
    facts: [],
    operators: [
      operator("operator:exit", "ms", "reach-exit", exitGoal, [gate]),
      operator("operator:unlock", "ms", "unlock", gate),
    ],
  }));
  assert.equal(resourceResult.expandedPlans[0].status, "unresolved");
  assert.ok(
    resourceResult.diagnostics.some(
      ({ code }) => code === "planning.resource-inconsistent",
    ),
  );
});

test("bounds diagnostics and reports omitted findings", () => {
  const exits = ["exit:a", "exit:b", "exit:c"].map((exitId) => ({
    target: "ms",
    exitId,
    evidenceIds: [],
  }));
  const result = buildTerminalFirstPlan(simpleInput({
    exits,
    facts: [],
    operators: [],
    limits: { maxDiagnostics: 2 },
  }));

  assert.equal(result.diagnostics.length, 2);
  assert.equal(result.truncation.diagnosticsOmitted, 1);
  assert.equal(result.expandedPlans.length, 3);
});

test("orders diagnostics by code then numeric root, goal, operator, and path tuple", () => {
  const exits = Array.from({ length: 12 }, (_, index) => ({
    target: "ms",
    exitId: `exit:${String(index).padStart(2, "0")}`,
    evidenceIds: [],
  }));
  const result = buildTerminalFirstPlan(simpleInput({
    exits,
    facts: [],
    operators: [],
  }));

  assert.deepEqual(
    result.diagnostics.map(({ rootId }) => rootId),
    Array.from({ length: 12 }, (_, index) => `root:${index}`),
  );
  assert.deepEqual(
    result.diagnostics.map(({ diagnosticId }) => diagnosticId),
    Array.from({ length: 12 }, (_, index) => `diagnostic:${index}`),
  );
});

test("directly caps OR expansion at maxPlansPerExit", () => {
  const choice = reach("region:bounded-choice");
  const result = buildTerminalFirstPlan(simpleInput({
    operators: [
      operator(
        "operator:exit",
        "ms",
        "reach-exit",
        reachExit("exit:east"),
        [choice],
      ),
      operator("operator:choice:a", "ms", "reach", choice),
      operator("operator:choice:b", "ms", "reach", choice),
      operator("operator:choice:c", "ms", "reach", choice),
    ],
    limits: { maxPlansPerExit: 2 },
  }));

  assert.equal(result.expandedPlans.length, 2);
  assert.equal(result.truncation.expandedPlansTruncated, true);
  assert.ok(result.diagnostics.some(({ code }) => code === "planning.limit"));
});

test("bounds the explanatory trace without suppressing plan expansion", () => {
  const result = buildTerminalFirstPlan(simpleInput({
    limits: { maxTraceSteps: 2 },
  }));

  assert.equal(result.trace.length, 2);
  assert.equal(result.truncation.traceTruncated, true);
  assert.equal(result.expandedPlans[0].status, "candidate");
  assert.ok(result.diagnostics.some(({ code }) => code === "planning.limit"));
});

test("is byte-stable when semantically unordered inputs are shuffled", () => {
  const room = reach("region:entry");
  const east = reachExit("exit:east");
  const west = reachExit("exit:west");
  const input = simpleInput({
    exits: [
      { target: "ms", exitId: "exit:west", evidenceIds: ["z", "a"] },
      { target: "ms", exitId: "exit:east", evidenceIds: ["b"] },
    ],
    facts: [satisfied(room, ["z", "a"])],
    operators: [
      operator("operator:west", "ms", "reach-exit", west, [room], [], ["z", "a"]),
      operator("operator:east", "ms", "reach-exit", east, [room], [], ["b"]),
    ],
  });
  const shuffled = {
    ...input,
    exits: [...input.exits].reverse().map((exit) => ({
      ...exit,
      evidenceIds: [...exit.evidenceIds].reverse(),
    })),
    facts: [...input.facts].reverse().map((fact) => ({
      ...fact,
      evidenceIds: [...fact.evidenceIds].reverse(),
    })),
    operators: [...input.operators].reverse().map((candidate) => ({
      ...candidate,
      prerequisites: [...candidate.prerequisites].reverse(),
      evidenceIds: [...candidate.evidenceIds].reverse(),
      stateEffects: [...candidate.stateEffects].reverse(),
    })),
    initialState: {
      inventory: [...input.initialState.inventory].reverse(),
      remainingRequirements: [...input.initialState.remainingRequirements].reverse(),
    },
  };

  assert.deepEqual(buildTerminalFirstPlan(shuffled), buildTerminalFirstPlan(input));
});

test("uses graph-local identities accepted by the artifact stable-ID grammar", () => {
  const result = buildTerminalFirstPlan(simpleInput());
  const ids = [
    ...result.graph.roots.flatMap(({ rootId, goalId }) => [rootId, goalId]),
    ...result.graph.goals.map(({ goalId }) => goalId),
    ...result.graph.operators.map(({ operatorNodeId }) => operatorNodeId),
    ...result.expandedPlans.map(({ planId }) => planId),
  ];

  assert.ok(ids.every((id) => STABLE_ID_PATTERN.test(id)));
  assert.ok(ids.every((id) => id.length <= 128));
  assert.equal(ids.some((id) => id.includes("{") || id.includes('"')), false);
  assert.equal(Object.hasOwn(result.graph.roots[0], "goalKey"), false);
  assert.deepEqual(
    buildTerminalFirstPlan(simpleInput({
      facts: [satisfied(
        { regionId: "region:entry", kind: "reach" },
        ["topology:entry"],
      )],
    })),
    result,
  );
});

test("fails closed when an exit is assigned to a different target", () => {
  assert.throws(
    () => buildTerminalFirstPlan(simpleInput({
      exits: [{ target: "lynx", exitId: "exit:east", evidenceIds: [] }],
    })),
    (error) => {
      assert.ok(error instanceof TerminalFirstPlanningError);
      assert.equal(error.code, "planning.input-invalid");
      assert.equal(error.path, "/exits/0/target");
      return true;
    },
  );
});

test("fails closed when collection identities alias different sources", () => {
  const first = collect(
    "key:red",
    "collection:aliased",
    `placement:sha256:${"a".repeat(64)}`,
  );
  const second = collect(
    "key:red",
    "collection:aliased",
    `placement:sha256:${"b".repeat(64)}`,
  );

  assert.throws(
    () => buildTerminalFirstPlan(simpleInput({
      facts: [satisfied(first), satisfied(second)],
    })),
    (error) => {
      assert.ok(error instanceof TerminalFirstPlanningError);
      assert.equal(error.code, "planning.invariant-invalid");
      return true;
    },
  );
});

test("fails closed when a collect achiever does not establish its resource axis", () => {
  const key = collect(
    "key:red",
    "collection:no-effect",
    `placement:sha256:${"a".repeat(64)}`,
  );

  assert.throws(
    () => buildTerminalFirstPlan(simpleInput({
      operators: [operator("operator:no-effect", "ms", "collect", key)],
    })),
    (error) => {
      assert.ok(error instanceof TerminalFirstPlanningError);
      assert.equal(error.code, "planning.invariant-invalid");
      return true;
    },
  );
});

test("rejects reach-exit terminal predicates as operator prerequisites", () => {
  assert.throws(
    () => buildTerminalFirstPlan(simpleInput({
      operators: [operator(
        "operator:terminal-chain",
        "ms",
        "reach-exit",
        reachExit("exit:east"),
        [reachExit("exit:other")],
      )],
    })),
    (error) => {
      assert.ok(error instanceof TerminalFirstPlanningError);
      assert.equal(error.code, "planning.invariant-invalid");
      assert.equal(error.path, "/operators/0/prerequisites/0/kind");
      return true;
    },
  );
});

test("rejects same-resource effects on possess-only unlock operators", () => {
  for (const delta of [-1, 1]) {
    const gate = unlock("gate:green", possessInventory("key:green"));
    assert.throws(
      () => buildTerminalFirstPlan(simpleInput({
        operators: [operator(
          `operator:possess-effect:${delta < 0 ? "negative" : "positive"}`,
          "ms",
          "unlock",
          gate,
          [],
          [{ axis: "inventory", resourceType: "key:green", delta }],
        )],
      })),
      (error) => {
        assert.ok(error instanceof TerminalFirstPlanningError);
        assert.equal(error.code, "planning.invariant-invalid");
        assert.equal(error.path, "/operators/0/stateEffects");
        return true;
      },
    );
  }
});

test("enforces documented implementation-safe maxima for every planning limit", () => {
  const maxima = {
    maxDepth: 256,
    maxPlansPerExit: 1_024,
    maxTraceSteps: 16_384,
    maxDiagnostics: 1_024,
  };

  for (const [name, maximum] of Object.entries(maxima)) {
    assert.doesNotThrow(() => buildTerminalFirstPlan(simpleInput({
      limits: { [name]: maximum },
    })));
    assert.throws(
      () => buildTerminalFirstPlan(simpleInput({
        limits: { [name]: maximum + 1 },
      })),
      (error) => {
        assert.ok(error instanceof TerminalFirstPlanningError);
        assert.equal(error.code, "planning.input-invalid");
        assert.equal(error.path, `/limits/${name}`);
        return true;
      },
      name,
    );
  }
});

test("returns a bounded planning result for a 6,000-goal chain", () => {
  const operators = [operator(
    "operator:long-chain-exit",
    "ms",
    "reach-exit",
    reachExit("exit:east"),
    [reach("region:long:0")],
  )];
  for (let index = 0; index < 6_000; index += 1) {
    operators.push(operator(
      `operator:long:${index}`,
      "ms",
      "reach",
      reach(`region:long:${index}`),
      [reach(`region:long:${index + 1}`)],
    ));
  }

  const result = buildTerminalFirstPlan(simpleInput({ operators }));

  assert.equal(result.graph.goals.length, 6_002);
  assert.equal(result.expandedPlans[0].status, "unresolved");
  assert.ok(result.diagnostics.some(({ code }) => code === "planning.limit"));
});

test("rejects StableId fields containing slash, uppercase, or more than 128 characters", () => {
  for (const invalidId of ["region/with-slash", "Region:uppercase", "r".repeat(129)]) {
    assert.throws(
      () => buildTerminalFirstPlan(simpleInput({
        facts: [satisfied(reach(invalidId))],
      })),
      (error) => {
        assert.ok(error instanceof TerminalFirstPlanningError);
        assert.equal(error.code, "planning.input-invalid");
        return true;
      },
      invalidId,
    );
  }
});
