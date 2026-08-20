import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type {
  PlacementIdV1,
  RulesetTargetV1,
  SolverCoordinate,
  SolverObservation,
} from "@tworld/ccsolver/domain";
import type { SolverRunHandle, SolverRuntimePort } from "@tworld/ccsolver/ports";
import type {
  ObservationChangeSelectorV1,
  SubgoalContractV1,
  SubgoalObservationPredicateV1,
} from "@tworld/ccsolver/snippets";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { describe, expect, it } from "vitest";
import {
  buildPhaseAKeyDoorRuntimeSource,
  type PhaseAKeyDoorBindingsV1,
  PHASE_A_RED_KEY_RESOURCE,
} from "./phaseAKeyDoorSource";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import {
  STANDARD_TACTIC_INPUT_CODES,
  evaluateStandardTactic,
  repairStandardTacticSuffix,
  type StandardTacticAdvanceRequestV1,
  type StandardTacticBoundsV1,
  type StandardTacticV1,
  type StandardTacticWitnessV1,
} from "./standardTactics";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../");
const sha256 = new WebCryptoSha256();
const phaseASourcePromises: Partial<Record<
  "ms" | "lynx",
  ReturnType<typeof buildPhaseAKeyDoorRuntimeSource>
>> = {};

function phaseASource(target: "ms" | "lynx") {
  // Runtime adapters clone source bytes on start; tests treat this prepared source as immutable.
  phaseASourcePromises[target] ??= (async () => {
    const template = await new NodeLevelRepository(repositoryRoot).loadLevel({
      seriesFile: target === "ms" ? "intro-ms.dac" : "intro-lynx.dac",
      levelNumber: 1,
      ruleset: target === "ms" ? "MS" : "Lynx",
      randomSeed: 0x1234_5678,
    });
    return buildPhaseAKeyDoorRuntimeSource({
      target,
      template,
      sha256,
    });
  })();
  return phaseASourcePromises[target]!;
}

function phaseARuntime(target: "ms" | "lynx") {
  const options = {
    sha256,
    adapterRevision: "ccsolver:p7a-phase-a-runtime-v1",
    engineRevision: "ccsolver:p7a-phase-a-engine-v1",
    maximumLiveRuns: 2,
    maximumLiveCheckpoints: 1,
  } as const;
  return target === "ms"
    ? createTworldMsSolverRuntimeAdapter(options)
    : createTworldLynxSolverRuntimeAdapter(options);
}

const BOUNDS: StandardTacticBoundsV1 = {
  maximumCandidateBranches: 1_024,
  maximumAdvanceCalls: 32_768,
  maximumTicksPerBranch: 32,
  maximumFrontierEntries: 4_096,
};

function predicateId(target: RulesetTargetV1, value: string) {
  return `predicate:p7a:${target}:${value}`;
}

function coordinatePredicate(
  target: RulesetTargetV1,
  value: string,
  coordinate: SolverCoordinate,
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, value),
    kind: "player-coordinate",
    coordinate,
  };
}

function runningPredicate(
  target: RulesetTargetV1,
  value = "running",
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, value),
    kind: "terminal-state",
    terminalKind: "running",
  };
}

function inventoryPredicate(
  target: RulesetTargetV1,
  value: string,
  count: number,
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, value),
    kind: "inventory-count",
    resourceType: PHASE_A_RED_KEY_RESOURCE,
    comparison: "equals",
    count,
  };
}

function placementPredicate(
  target: RulesetTargetV1,
  value: string,
  placementId: PlacementIdV1,
  present: boolean,
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, value),
    kind: "placement-presence",
    placementId,
    present,
  };
}

function movementPredicate(
  target: RulesetTargetV1,
  actorId: SolverObservation["player"]["actorId"],
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, "player-stationary"),
    kind: "actor-state",
    actorId,
    property: "movement",
    value: "stationary",
  };
}

function pathMayChange(coordinates: readonly SolverCoordinate[]): ObservationChangeSelectorV1[] {
  return [
    { kind: "timing" },
    { kind: "input" },
    { kind: "randomness" },
    { kind: "player" },
    ...coordinates.map((coordinate) => ({ kind: "cell" as const, coordinate })),
  ];
}

function contract(input: {
  readonly target: RulesetTargetV1;
  readonly name: string;
  readonly requires: readonly SubgoalObservationPredicateV1[];
  readonly ensures: readonly SubgoalObservationPredicateV1[];
  readonly invariants: readonly SubgoalObservationPredicateV1[];
  readonly stop: SubgoalObservationPredicateV1;
  readonly mustChange?: readonly ObservationChangeSelectorV1[];
  readonly mayChange?: readonly ObservationChangeSelectorV1[];
  readonly mustNotChange?: readonly ObservationChangeSelectorV1[];
  readonly forbidden?: readonly ObservationChangeSelectorV1[];
}): SubgoalContractV1 {
  return {
    contractVersion: 1,
    contractId: `contract:p7a:${input.target}:${input.name}`,
    title: `P7A ${input.name}`,
    description: `Bounded standard-only Phase-A ${input.name} tactic contract.`,
    target: input.target,
    planSegment: {
      planId: input.target === "ms" ? "plan:7:0" : "plan:7:1",
      rootId: "root:0",
      startStepOrder: 0,
      endStepOrder: 0,
      operatorIds: [`operator:p7a:${input.target}:${input.name}`],
    },
    requires: input.requires,
    ensures: input.ensures,
    invariants: input.invariants,
    stop: input.stop,
    maximumAdvanceTicks: BOUNDS.maximumTicksPerBranch,
    footprint: {
      mustChange: input.mustChange ?? [],
      mayChange: input.mayChange ?? [],
      mustNotChange: input.mustNotChange ?? [],
    },
    forbiddenObservedChanges: input.forbidden ?? [],
    provenance: {
      derivation: "authored",
      derivationRevision: "ccsolver:p7a-standard-tactic-atdd-v1",
      review: { status: "unreviewed" },
    },
  };
}

function collectTactic(
  target: RulesetTargetV1,
  bindings: PhaseAKeyDoorBindingsV1,
): StandardTacticV1 {
  const running = runningPredicate(target);
  const keyAbsent = placementPredicate(target, "key-absent", bindings.keyPlacementId, false);
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:collect-red-key`,
    target,
    intent: {
      kind: "collect",
      goal: {
        kind: "collect",
        resourceType: bindings.resourceType,
        amount: 1,
        collectionOccurrenceId: `collection:p7a:${target}:red-key`,
        sourcePlacementId: bindings.keyPlacementId,
      },
    },
    contract: contract({
      target,
      name: "collect-red-key",
      requires: [
        coordinatePredicate(target, "collect-entry", bindings.start),
        inventoryPredicate(target, "key-count-zero", 0),
        placementPredicate(target, "key-present", bindings.keyPlacementId, true),
        running,
      ],
      ensures: [
        coordinatePredicate(target, "collect-exit", bindings.key),
        inventoryPredicate(target, "key-count-one", 1),
        keyAbsent,
        running,
      ],
      invariants: [running],
      stop: keyAbsent,
      mustChange: [
        { kind: "inventory-resource", resourceType: bindings.resourceType },
        { kind: "placement", placementId: bindings.keyPlacementId },
      ],
      mayChange: pathMayChange([
        bindings.start,
        { x: 1, y: 0, z: 0 },
        bindings.key,
      ]),
      mustNotChange: [{ kind: "placement", placementId: bindings.doorPlacementId }],
      forbidden: [{ kind: "terminal" }],
    }),
    command: {
      commandIdStem: `command:p7a:${target}:collect`,
      planId: `plan:p7a:${target}`,
    },
  };
}

function unlockTactic(
  target: RulesetTargetV1,
  bindings: PhaseAKeyDoorBindingsV1,
): StandardTacticV1 {
  const running = runningPredicate(target);
  const doorAbsent = placementPredicate(target, "door-absent", bindings.doorPlacementId, false);
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:unlock-red-door`,
    target,
    intent: {
      kind: "unlock",
      goal: {
        kind: "unlock",
        gateId: bindings.doorPlacementId,
        requirement: {
          kind: "consume-inventory",
          resourceType: bindings.resourceType,
          amount: 1,
        },
      },
    },
    contract: contract({
      target,
      name: "unlock-red-door",
      requires: [
        coordinatePredicate(target, "unlock-entry", bindings.key),
        inventoryPredicate(target, "unlock-key-count-one", 1),
        placementPredicate(target, "door-present", bindings.doorPlacementId, true),
        running,
      ],
      ensures: [
        coordinatePredicate(target, "unlock-exit", bindings.door),
        inventoryPredicate(target, "unlock-key-count-zero", 0),
        doorAbsent,
        running,
      ],
      invariants: [running],
      stop: doorAbsent,
      mustChange: [
        { kind: "inventory-resource", resourceType: bindings.resourceType },
        { kind: "placement", placementId: bindings.doorPlacementId },
      ],
      mayChange: pathMayChange([
        bindings.key,
        { x: 3, y: 0, z: 0 },
        bindings.door,
      ]),
      mustNotChange: [{ kind: "placement", placementId: bindings.keyPlacementId }],
      forbidden: [{ kind: "terminal" }],
    }),
    command: {
      commandIdStem: `command:p7a:${target}:unlock`,
      planId: `plan:p7a:${target}`,
    },
  };
}

function reachTactic(
  target: RulesetTargetV1,
  bindings: PhaseAKeyDoorBindingsV1,
): StandardTacticV1 {
  const running = runningPredicate(target);
  const reached = coordinatePredicate(target, "reach-after-door", bindings.afterDoor);
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:reach-after-door`,
    target,
    intent: {
      kind: "reach",
      goal: { kind: "reach", regionId: "region:p7a:after-door" },
      destination: bindings.afterDoor,
    },
    contract: contract({
      target,
      name: "reach-after-door",
      requires: [coordinatePredicate(target, "reach-entry", bindings.door), running],
      ensures: [reached, running],
      invariants: [running],
      stop: reached,
      mustChange: [{ kind: "player" }],
      mayChange: pathMayChange([bindings.door, bindings.afterDoor])
        .filter(({ kind }) => kind !== "player"),
      forbidden: [{ kind: "terminal" }],
    }),
    command: {
      commandIdStem: `command:p7a:${target}:reach`,
      planId: `plan:p7a:${target}`,
    },
  };
}

async function applyWitness<TManualSource, TReplaySource>(
  runtime: SolverRuntimePort<TManualSource, TReplaySource>,
  run: SolverRunHandle,
  witness: StandardTacticWitnessV1,
): Promise<SolverObservation> {
  const entry = await runtime.observe(run);
  expect(entry.fingerprints.exact).toBe(witness.entryExactFingerprint);
  for (const decision of witness.selectedDecisions) {
    await runtime.advanceTick(run, decision.request);
  }
  const exit = await runtime.observe(run);
  expect(exit.fingerprints.exact).toBe(witness.exitExactFingerprint);
  expect(exit.boundary.nativeTick).toBe(witness.exitNativeTick);
  return exit;
}

describe("P7A standard tactic API", () => {
  it("exposes only the standard manual movement vocabulary", () => {
    expect(STANDARD_TACTIC_INPUT_CODES).toEqual([1, 2, 4, 8, 0]);
    expect(evaluateStandardTactic).toBeTypeOf("function");
    expect(repairStandardTacticSuffix).toBeTypeOf("function");
  });

  for (const target of ["ms", "lynx"] as const) {
    it(`starts the frozen standard-only Phase-A key-door source in the real ${target} engine`, async () => {
      const fixture = await phaseASource(target);
      expect(fixture.definition).toMatchObject({
        sourceId: "source-phase-a-key-door",
        rows: ["P.k.D.E"],
      });
      expect(fixture.bindings).toMatchObject({
        start: { x: 0, y: 0, z: 0 },
        key: { x: 2, y: 0, z: 0 },
        door: { x: 4, y: 0, z: 0 },
        afterDoor: { x: 5, y: 0, z: 0 },
        resourceType: PHASE_A_RED_KEY_RESOURCE,
      });
      const runtime = phaseARuntime(target);
      const run = await runtime.startManual(fixture.source);
      try {
        const observation = await runtime.observe(run);
        expect(observation).toMatchObject({
          target,
          mode: "manual",
          player: { coordinate: fixture.bindings.start },
          terminal: { kind: "running" },
        });
      } finally {
        await runtime.disposeRun(run);
      }
    });

    it(`constructs, repairs, and chains Collect/Unlock/Reach through the real ${target} engine`, async () => {
      const fixture = await phaseASource(target);
      const runtime = phaseARuntime(target);
      const primary = await runtime.startManual(fixture.source);
      try {
        const primaryEntry = await runtime.observe(primary);
        const collect = collectTactic(target, fixture.bindings);
        const first = await evaluateStandardTactic({
          runtime,
          entryRun: primary,
          tactic: collect,
          bounds: BOUNDS,
        });
        expect(first.status).toBe("succeeded");
        if (first.status !== "succeeded") throw new Error("collect tactic exhausted");
        expect((await runtime.observe(primary)).fingerprints.exact)
          .toBe(primaryEntry.fingerprints.exact);
        expect(first.witness.selectedDecisions.length).toBeGreaterThanOrEqual(2);
        expect(first.witness.selectedDecisions.map(({ decisionOrder }) => decisionOrder))
          .toEqual(first.witness.selectedDecisions.map((_, index) => index));
        expect(first.witness.selectedDecisions.every(({ request }, index) => (
          request.causalContext.commandId === `command:p7a:${target}:collect:${index}`
        ))).toBe(true);

        const injectedDecisionOrder = first.witness.selectedDecisions
          .map(({ request }) => request.inputCode)
          .lastIndexOf(GAME_INPUT_CODES.east);
        expect(injectedDecisionOrder).toBeGreaterThan(0);
        const injectedDecisions: StandardTacticAdvanceRequestV1[] = first.witness.selectedDecisions
          .map(({ request }, index) => index === injectedDecisionOrder
            ? { ...request, inputCode: GAME_INPUT_CODES.west }
            : request);
        await expect(repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: first.witness,
          injectedDecisions: first.witness.selectedDecisions.map(({ request }, index) => index === 0
            ? { ...request, inputCode: GAME_INPUT_CODES.west }
            : request),
          injectedDecisionOrder: 0,
          bounds: BOUNDS,
        })).rejects.toMatchObject({ code: "tactic.invalid-repair" });
        await expect(repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: first.witness,
          injectedDecisions: injectedDecisions.map((request, index) => index === injectedDecisionOrder
            ? {
                ...request,
                causalContext: {
                  ...request.causalContext,
                  commandId: `command:p7a:${target}:collect:wrong`,
                },
              }
            : request),
          injectedDecisionOrder,
          bounds: BOUNDS,
        })).rejects.toMatchObject({ code: "tactic.invalid-repair" });
        await expect(repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: first.witness,
          injectedDecisions: injectedDecisions.map((request, index) => index === injectedDecisionOrder
            ? ({ kind: "replay-tick" } as unknown as StandardTacticAdvanceRequestV1)
            : request),
          injectedDecisionOrder,
          bounds: BOUNDS,
        })).rejects.toMatchObject({ code: "tactic.invalid-repair" });
        await expect(repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: first.witness,
          injectedDecisions: injectedDecisions.map((request, index) => index === injectedDecisionOrder
            ? { ...request, inputCode: GAME_INPUT_CODES.preserve }
            : request),
          injectedDecisionOrder,
          bounds: BOUNDS,
        })).rejects.toMatchObject({ code: "tactic.invalid-repair" });
        await expect(repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: {
            ...first.witness,
            contractValidation: {
              ...first.witness.contractValidation,
              ensures: first.witness.contractValidation.ensures.map((verdict, index) => (
                index === 0 ? { ...verdict, passed: false } : verdict
              )),
            },
          },
          injectedDecisions,
          injectedDecisionOrder,
          bounds: BOUNDS,
        })).rejects.toMatchObject({ code: "tactic.invalid-repair" });
        const repaired = await repairStandardTacticSuffix({
          runtime,
          entryRun: primary,
          tactic: collect,
          originalWitness: first.witness,
          injectedDecisions,
          injectedDecisionOrder,
          bounds: BOUNDS,
        });
        expect(repaired).toMatchObject({
          status: "repaired",
          join: "replanned-join",
          injectedDecisionOrder,
          injectedFailure: {
            status: "failed",
            firstUnmetPredicateId: predicateId(target, "key-absent"),
          },
        });
        if (repaired.status !== "repaired") throw new Error("collect repair exhausted");
        expect(repaired.retainedPrefix).toEqual(
          first.witness.selectedDecisions.slice(0, injectedDecisionOrder),
        );
        expect(repaired.replacedSuffix[0]?.inputCode).toBe(GAME_INPUT_CODES.west);
        expect(repaired.repairedSuffix[0]).toMatchObject({
          decisionOrder: injectedDecisionOrder,
          request: { inputCode: GAME_INPUT_CODES.east },
        });
        expect(repaired.compiledDecisions.slice(0, injectedDecisionOrder)).toEqual(
          first.witness.selectedDecisions
            .slice(0, injectedDecisionOrder)
            .map(({ request }) => request),
        );
        const collected = await applyWitness(runtime, primary, repaired.witness);
        expect(collected).toMatchObject({
          player: { coordinate: fixture.bindings.key },
          inventory: [{ resourceType: PHASE_A_RED_KEY_RESOURCE, count: 1 }],
          terminal: { kind: "running" },
        });

        const unlock = await evaluateStandardTactic({
          runtime,
          entryRun: primary,
          tactic: unlockTactic(target, fixture.bindings),
          bounds: BOUNDS,
        });
        expect(unlock.status).toBe("succeeded");
        if (unlock.status !== "succeeded") throw new Error("unlock tactic exhausted");
        const unlocked = await applyWitness(runtime, primary, unlock.witness);
        expect(unlocked).toMatchObject({
          player: { coordinate: fixture.bindings.door },
          inventory: [],
          terminal: { kind: "running" },
        });

        const reach = await evaluateStandardTactic({
          runtime,
          entryRun: primary,
          tactic: reachTactic(target, fixture.bindings),
          bounds: BOUNDS,
        });
        expect(reach.status).toBe("succeeded");
        if (reach.status !== "succeeded") throw new Error("reach tactic exhausted");
        const reached = await applyWitness(runtime, primary, reach.witness);
        expect(reached).toMatchObject({
          player: { coordinate: fixture.bindings.afterDoor },
          terminal: { kind: "running" },
        });

        const stationary = movementPredicate(target, reached.player.actorId);
        const wait: StandardTacticV1 = {
          tacticVersion: 1,
          tacticId: `tactic:p7a:${target}:wait-stationary`,
          target,
          intent: { kind: "wait-until", predicate: stationary },
          contract: contract({
            target,
            name: "wait-stationary",
            requires: [runningPredicate(target)],
            ensures: [stationary, runningPredicate(target)],
            invariants: [runningPredicate(target)],
            stop: stationary,
            mayChange: pathMayChange([fixture.bindings.afterDoor]),
            forbidden: [{ kind: "terminal" }],
          }),
          command: {
            commandIdStem: `command:p7a:${target}:wait`,
            planId: `plan:p7a:${target}`,
          },
        };
        const waited = await evaluateStandardTactic({
          runtime,
          entryRun: primary,
          tactic: wait,
          bounds: BOUNDS,
        });
        expect(waited.status).toBe("succeeded");
        if (waited.status !== "succeeded") throw new Error("wait tactic exhausted");
        expect(waited.witness.selectedDecisions.every(({ request }) => (
          request.inputCode === GAME_INPUT_CODES.none
        ))).toBe(true);
        expect(waited.witness.selectedDecisions.length).toBe(target === "lynx" ? 3 : 0);
      } finally {
        await runtime.disposeRun(primary);
      }
    }, 120_000);

    it(`reports deterministic bounded exhaustion without mutating the real ${target} entry`, async () => {
      const fixture = await phaseASource(target);
      const runtime = phaseARuntime(target);
      const run = await runtime.startManual(fixture.source);
      try {
        const entry = await runtime.observe(run);
        const running = runningPredicate(target);
        const unreachable = { x: 31, y: 31, z: 0 } as const;
        const stop = coordinatePredicate(target, "unreachable", unreachable);
        const tactic: StandardTacticV1 = {
          tacticVersion: 1,
          tacticId: `tactic:p7a:${target}:bounded-exhaustion`,
          target,
          intent: {
            kind: "reach",
            goal: { kind: "reach", regionId: "region:p7a:bounded-exhaustion" },
            destination: unreachable,
          },
          contract: contract({
            target,
            name: "bounded-exhaustion",
            requires: [coordinatePredicate(target, "exhaustion-entry", fixture.bindings.start), running],
            ensures: [stop, running],
            invariants: [running],
            stop,
            mustChange: [{ kind: "player" }],
            mayChange: pathMayChange([fixture.bindings.start, { x: 1, y: 0, z: 0 }])
              .filter(({ kind }) => kind !== "player"),
            forbidden: [{ kind: "terminal" }],
          }),
          command: {
            commandIdStem: `command:p7a:${target}:exhaust`,
            planId: `plan:p7a:${target}`,
          },
        };
        const tinyBounds: StandardTacticBoundsV1 = {
          maximumCandidateBranches: 1,
          maximumAdvanceCalls: 8,
          maximumTicksPerBranch: 1,
          maximumFrontierEntries: 16,
        };
        const first = await evaluateStandardTactic({ runtime, entryRun: run, tactic, bounds: tinyBounds });
        const repeated = await evaluateStandardTactic({ runtime, entryRun: run, tactic, bounds: tinyBounds });
        expect(repeated).toEqual(first);
        expect(first).toMatchObject({
          status: "exhausted",
          diagnostic: {
            code: "branch-budget",
            firstUnmetPredicateId: predicateId(target, "unreachable"),
            attemptedBranches: 1,
          },
        });
        expect((await runtime.observe(run)).fingerprints.exact).toBe(entry.fingerprints.exact);
      } finally {
        await runtime.disposeRun(run);
      }
    }, 15_000);
  }
});
