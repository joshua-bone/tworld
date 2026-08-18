import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import type {
  BlobReferenceV1,
  RulesetTargetV1,
  SolverActorMovement,
  SolverCoordinate,
  SolverInputInfluence,
  SolverObservation,
  SolverTerminalResult,
  StableIdV1,
} from "@tworld/ccsolver/domain";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import type { SolverAdvanceRequest } from "@tworld/ccsolver/ports";
import {
  createContextualWitnessExecutor,
  type ContextualPlanSegmentV1,
  type ContextualWitnessFailureV1,
  type ContextualWitnessResultV1,
  type SubgoalContractV1,
  type SubgoalObservationPredicateV1,
} from "@tworld/ccsolver/snippets";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "../runtime/tworldSolverRuntimeSource";
import {
  KEY_PYRAMID_PLAYER_ACTOR,
  KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT,
  type BuiltKeyPyramidTerminalPlan,
} from "./buildKeyPyramidTerminalPlan";
import {
  KEY_PYRAMID_CASE_ID,
  KEY_PYRAMID_MANUAL_SEED,
  type KeyPyramidRuntimeSource,
} from "./keyPyramidP3Source";

const RED_KEY = "cc1:key-red" as const;
const CHIP = "cc1:icchip" as const;
const START_COORDINATE = { x: 15, y: 19, z: 0 } as const;
const RED_KEY_COORDINATE = { x: 16, y: 19, z: 0 } as const;
const BLUE_KEY_COORDINATE = { x: 14, y: 19, z: 0 } as const;
const RED_DOOR_COORDINATE = { x: 14, y: 16, z: 0 } as const;
const RENDER_VIEWPORT = {
  minimum: { x: 13, y: 16, z: 0 },
  maximum: { x: 17, y: 20, z: 0 },
} as const;
const EXPECTED_EXACT_FINGERPRINTS = {
  ms: {
    entry: "sha256:3fdbbc66e67a8a8e6560b3fce6c3a34ee1298dcd95530e25a101c47dfc89abaf",
    stop: "sha256:73c643d01e1a421f0b9cc3d222846881bf1d3ad58123ff8b1241ecf57033da30",
  },
  lynx: {
    entry: "sha256:c31b7499a71c9ea89ebb17a715da5ba42043d5491ba94391ee5c027cfd68dda1",
    stop: "sha256:9bdd553ccca0890d12878d5a5a5631943c5b051f0f876b662f93a6c8a09daf24",
  },
} as const;

type ResourceChange = {
  readonly resourceType: StableIdV1;
  readonly before: number;
  readonly after: number;
};

type BoundarySummary = {
  readonly nativeTick: number;
  readonly exactFingerprint: StableIdV1;
  readonly player: {
    readonly coordinate: SolverCoordinate | null;
    readonly facing: SolverObservation["player"]["facing"];
    readonly movement: SolverActorMovement;
    readonly inputInfluence: SolverInputInfluence;
  };
  readonly inventory: Readonly<Record<string, number>>;
  readonly remainingRequirements: Readonly<Record<string, number>>;
  readonly keyPlacementPresent: boolean;
  readonly terminal: SolverTerminalResult;
};

export type KeyPyramidRedKeyWitnessReviewV1 = {
  readonly previewType: "p3b-contextual-witness-review";
  readonly previewVersion: 1;
  readonly caseId: typeof KEY_PYRAMID_CASE_ID;
  readonly target: RulesetTargetV1;
  readonly source: {
    readonly mode: "manual";
    readonly randomSeed: typeof KEY_PYRAMID_MANUAL_SEED;
    readonly randomSeedSemantics: "manual-fixed-zero-donor-independent";
    readonly replay: null;
    readonly mapPath: "data/CCLP1.dat";
    readonly seriesFile: "CCLP1-MS.dac" | "CCLP1-Lynx.dac";
    readonly mapContent: BlobReferenceV1;
    readonly seriesContent: BlobReferenceV1;
  };
  readonly levelFacts: BlobReferenceV1;
  readonly plan: BlobReferenceV1;
  readonly witnessLeaf: BlobReferenceV1;
  readonly selectedSegment: ContextualPlanSegmentV1;
  readonly parentPlanStatus: "unresolved";
  readonly verifiedLeafDoesNotUpgradeParent: true;
  readonly planVerificationScope: ContextualWitnessResultV1["planVerificationScope"];
  readonly planEffectValidation: ContextualWitnessResultV1["planEffectValidation"];
  readonly subgoal: {
    readonly kind: "collect-placement";
    readonly placementId: typeof KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT;
    readonly resourceType: typeof RED_KEY;
    readonly amount: 1;
  };
  readonly contractValidation: {
    readonly status: "passed" | "failed";
    readonly firstFailure: ContextualWitnessFailureV1 | null;
  };
  readonly entry: BoundarySummary;
  readonly stop: BoundarySummary;
  readonly execution: {
    readonly decisions: readonly ({ readonly decisionOrder: number } & SolverAdvanceRequest)[];
    readonly maximumAdvanceTicks: number;
    readonly observedAfterAdvanceTicks: number;
    readonly intermediateBoundaries: readonly {
      readonly decisionOrder: number;
      readonly nativeTick: number;
      readonly exactFingerprint: StableIdV1;
      readonly contractSatisfied: boolean;
    }[];
  };
  readonly delta: {
    readonly inventoryChanges: readonly ResourceChange[];
    readonly remainingRequirementChanges: readonly ResourceChange[];
  };
  readonly renderViewport: typeof RENDER_VIEWPORT;
  readonly visualReview: {
    readonly annotationBasis: "plan-intent-review-preview";
    readonly observedFullRoute: false;
    readonly routePreview: readonly [typeof START_COORDINATE, typeof RED_KEY_COORDINATE];
    readonly pointsOfInterest: readonly {
      readonly label: string;
      readonly coordinate: SolverCoordinate;
      readonly role: "route-start" | "selected-target" | "retained-alternative" | "later-gate";
    }[];
    readonly entryRender: ContextualWitnessResultV1["entry"]["render"];
    readonly stopRender: ContextualWitnessResultV1["end"]["render"];
  };
  readonly proof: {
    readonly restoredExecutionEqualsUninterrupted: boolean;
    readonly rebuiltPrefixEqualsEntry: true;
    readonly croppedRenderUsedAsCorrectnessEvidence: false;
  };
  readonly witness: {
    readonly content: BlobReferenceV1;
    readonly witnessId: ContextualWitnessResultV1["witnessId"];
    readonly entryId: ContextualWitnessResultV1["entryId"];
    readonly planSegment: ContextualWitnessResultV1["planSegment"];
    readonly planVerificationScope: ContextualWitnessResultV1["planVerificationScope"];
    readonly planIntent: ContextualWitnessResultV1["planIntent"];
    readonly contract: ContextualWitnessResultV1["contract"];
    readonly prefix: ContextualWitnessResultV1["prefix"];
    readonly snippet: ContextualWitnessResultV1["snippet"];
    readonly entryContent: {
      readonly observation: BlobReferenceV1;
      readonly render: BlobReferenceV1;
    };
    readonly stopContent: {
      readonly observation: BlobReferenceV1;
      readonly render: BlobReferenceV1;
    };
    readonly boundaryChecks: ContextualWitnessResultV1["boundaryChecks"];
    readonly observedChanges: ContextualWitnessResultV1["observedChanges"];
    readonly planEffectValidation: ContextualWitnessResultV1["planEffectValidation"];
    readonly contractValidation: ContextualWitnessResultV1["contractValidation"];
    readonly join: ContextualWitnessResultV1["join"];
    readonly evidence: ContextualWitnessResultV1["evidence"];
    readonly provenance: ContextualWitnessResultV1["provenance"];
    readonly outcome: ContextualWitnessResultV1["outcome"];
  };
};

function countResources(
  values: readonly { readonly resourceType: string; readonly count: number }[],
  explicitResourceTypes: readonly string[],
): Readonly<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const resourceType of explicitResourceTypes) result[resourceType] = 0;
  for (const { resourceType, count } of values) {
    result[resourceType] = (result[resourceType] ?? 0) + count;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => (
    left < right ? -1 : left > right ? 1 : 0
  )));
}

function placementPresent(
  observation: SolverObservation,
  placementId: string,
): boolean {
  return observation.cells.some(({ elements }) => elements.some(({ identity }) => (
    identity.kind === "placement" && identity.placementId === placementId
  )));
}

function summarizeBoundary(observation: SolverObservation): BoundarySummary {
  return {
    nativeTick: observation.boundary.nativeTick,
    exactFingerprint: observation.fingerprints.exact,
    player: {
      coordinate: observation.player.coordinate,
      facing: observation.player.facing,
      movement: observation.player.movement,
      inputInfluence: observation.player.inputInfluence,
    },
    inventory: countResources(observation.inventory, [RED_KEY]),
    remainingRequirements: countResources(observation.remainingRequirements, [CHIP]),
    keyPlacementPresent: placementPresent(
      observation,
      KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT,
    ),
    terminal: observation.terminal,
  };
}

function predicateId(target: RulesetTargetV1, name: string): StableIdV1 {
  return `predicate:key-pyramid:${target}:${name}`;
}

function contractFor(
  target: RulesetTargetV1,
  planSegment: ContextualPlanSegmentV1,
  maximumAdvanceTicks: number,
): SubgoalContractV1 {
  const playerStart: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-at-start"),
    kind: "player-coordinate",
    coordinate: START_COORDINATE,
  };
  const noRedKey: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "red-key-inventory-zero"),
    kind: "inventory-count",
    resourceType: RED_KEY,
    comparison: "equals",
    count: 0,
  };
  const tenChipsRemain: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "ten-chips-remain"),
    kind: "remaining-requirement-count",
    resourceType: CHIP,
    comparison: "equals",
    count: 10,
  };
  const keyPresent: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "adjacent-red-key-present"),
    kind: "placement-presence",
    placementId: KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT,
    present: true,
  };
  const running: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "terminal-running"),
    kind: "terminal-state",
    terminalKind: "running",
  };
  const playerActive: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-active"),
    kind: "actor-state",
    actorId: KEY_PYRAMID_PLAYER_ACTOR,
    property: "lifecycle",
    value: "active",
  };
  const playerStationaryAtEntry: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-stationary-entry"),
    kind: "actor-state",
    actorId: KEY_PYRAMID_PLAYER_ACTOR,
    property: "movement",
    value: "stationary",
  };
  const playerAtKey: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-at-red-key"),
    kind: "player-coordinate",
    coordinate: RED_KEY_COORDINATE,
  };
  const hasRedKey: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "red-key-inventory-one"),
    kind: "inventory-count",
    resourceType: RED_KEY,
    comparison: "equals",
    count: 1,
  };
  const keyAbsent: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "adjacent-red-key-absent"),
    kind: "placement-presence",
    placementId: KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT,
    present: false,
  };
  const playerFacesEast: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-faces-east"),
    kind: "actor-state",
    actorId: KEY_PYRAMID_PLAYER_ACTOR,
    property: "facing",
    value: "east",
  };
  const playerStationaryAtStop: SubgoalObservationPredicateV1 = {
    predicateId: predicateId(target, "player-stationary-stop"),
    kind: "actor-state",
    actorId: KEY_PYRAMID_PLAYER_ACTOR,
    property: "movement",
    value: "stationary",
  };
  return {
    contractVersion: 1,
    contractId: `contract:key-pyramid:${target}:collect-adjacent-red-key`,
    title: "Collect the adjacent red key",
    description: "Move one cell east from the fixed manual start and witness the exact placement-bound red-key collection.",
    target,
    planSegment,
    requires: [
      playerStart,
      noRedKey,
      tenChipsRemain,
      keyPresent,
      running,
      playerActive,
      playerStationaryAtEntry,
    ],
    ensures: [
      playerAtKey,
      hasRedKey,
      tenChipsRemain,
      keyAbsent,
      running,
      playerActive,
      playerFacesEast,
      playerStationaryAtStop,
    ],
    invariants: [tenChipsRemain, running, playerActive],
    stop: hasRedKey,
    maximumAdvanceTicks,
    footprint: {
      mustChange: [
        { kind: "inventory-resource", resourceType: RED_KEY },
        { kind: "placement", placementId: KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT },
      ],
      mayChange: [
        { kind: "timing" },
        { kind: "input" },
        { kind: "randomness" },
        { kind: "player" },
        { kind: "cell", coordinate: START_COORDINATE },
        { kind: "cell", coordinate: RED_KEY_COORDINATE },
      ],
      mustNotChange: [{ kind: "remaining-requirement", resourceType: CHIP }],
    },
    forbiddenObservedChanges: [{ kind: "terminal" }],
    provenance: {
      derivation: "backward-regressed",
      derivationRevision: "ccsolver:key-pyramid-p3b-red-key-contract-v1",
      review: { status: "unreviewed" },
    },
  };
}

function decisionsFor(target: RulesetTargetV1): readonly SolverAdvanceRequest[] {
  const east = { kind: "manual-poll" as const, inputCode: GAME_INPUT_CODES.east };
  const none = { kind: "manual-poll" as const, inputCode: GAME_INPUT_CODES.none };
  return target === "ms" ? [east] : [east, none, none, none];
}

function createRuntime(source: KeyPyramidRuntimeSource, sha256: WebCryptoSha256) {
  const options = {
    sha256,
    adapterRevision: source.runtimeProvenance.adapterRevision,
    engineRevision: source.runtimeProvenance.engineRevision,
    maximumLiveRuns: 2,
    maximumLiveCheckpoints: 1,
  };
  return source.target === "ms"
    ? createTworldMsSolverRuntimeAdapter(options)
    : createTworldLynxSolverRuntimeAdapter(options);
}

export async function buildKeyPyramidRedKeyWitness(
  source: KeyPyramidRuntimeSource,
  terminalPlan: BuiltKeyPyramidTerminalPlan,
  sha256 = new WebCryptoSha256(),
): Promise<KeyPyramidRedKeyWitnessReviewV1> {
  if (
    source.target !== terminalPlan.packet.target
    || source.levelFactsContent.digest !== terminalPlan.packet.artifacts.levelFacts.digest
  ) {
    throw new Error(`${source.target} runtime source does not bind its terminal plan`);
  }
  if (terminalPlan.selectedStep.operatorId !== terminalPlan.selectedRedOperatorId) {
    throw new Error(`${source.target} red-key witness leaf lost its selected operator`);
  }
  const segment = terminalPlan.selectedSegment;
  const decisions = decisionsFor(source.target);
  const maximumAdvanceTicks = decisions.length;
  const contract = contractFor(source.target, segment, maximumAdvanceTicks);
  const runtime = createRuntime(source, sha256);
  const executor = createContextualWitnessExecutor<
    TworldSolverManualStartSource,
    TworldSolverReplayStartSource
  >({
    runtime,
    sha256,
    validatorRevision: "ccsolver:contextual-witness-validator:p3b-v1",
    maximumCachedPrefixes: 1,
  });
  const executionInput = {
    start: { kind: "manual" as const, source: source.manualSource },
    initialization: {
      randomSeed: KEY_PYRAMID_MANUAL_SEED,
      seedSemantics: "manual-fixed-zero-donor-independent",
      replay: null,
    },
    prefix: [],
    snippet: decisions,
    expectedEntryBoundary: -1,
    plan: terminalPlan.selectedPlan,
    segment,
    contract,
    renderRegion: { kind: "box" as const, ...RENDER_VIEWPORT },
    bounds: {
      maximumPrefixTicks: 0,
      maximumSnippetTicks: maximumAdvanceTicks,
    },
  };
  let witness: ContextualWitnessResultV1;
  let rebuiltWitness: ContextualWitnessResultV1;
  try {
    witness = await executor.execute(executionInput);
    await executor.clearCheckpointCache();
    rebuiltWitness = await executor.execute(executionInput);
    if (canonicalizeJson(witness) !== canonicalizeJson(rebuiltWitness)) {
      throw new Error(`${source.target} rebuilt fixed-start witness was not canonical-identical`);
    }
  } finally {
    await executor.clearCheckpointCache();
  }
  const expected = EXPECTED_EXACT_FINGERPRINTS[source.target];
  if (
    witness.outcome.kind !== "verified"
    || witness.join?.state !== "exact"
    || witness.entry.observation.fingerprints.exact !== expected.entry
    || witness.end.observation.fingerprints.exact !== expected.stop
    || witness.snippet.consumedDecisionCount !== maximumAdvanceTicks
    || witness.planVerificationScope.kind !== "selected-segment-only"
    || witness.planVerificationScope.parentPlanStatus !== "unresolved"
    || canonicalizeJson(witness.planSegment) !== canonicalizeJson(segment)
    || witness.planEffectValidation.length !== 1
    || witness.planEffectValidation[0]?.axis !== "inventory"
    || witness.planEffectValidation[0]?.resourceType !== RED_KEY
    || witness.planEffectValidation[0]?.expectedDelta !== 1
    || witness.planEffectValidation[0]?.observedDelta !== 1
    || witness.planEffectValidation[0]?.passed !== true
  ) {
    throw new Error(`${source.target} adjacent red-key witness failed its exact contract`);
  }
  const witnessContent = await referenceCanonicalJson(canonicalizeJson(witness), sha256);
  const inventoryChanges = witness.observedChanges.flatMap((change) => (
    change.kind === "inventory-count"
      ? [{ resourceType: change.resourceType, before: change.before, after: change.after }]
      : []
  ));
  const remainingRequirementChanges = witness.observedChanges.flatMap((change) => (
    change.kind === "remaining-requirement-count"
      ? [{ resourceType: change.resourceType, before: change.before, after: change.after }]
      : []
  ));
  const intermediateBoundaries = witness.boundaryChecks
    .filter(({ decisionOrder, nativeTick }) =>
      decisionOrder !== null && nativeTick !== witness.end.observation.boundary.nativeTick)
    .map(({ decisionOrder, nativeTick, exactDigest, stopVerdict }) => ({
      decisionOrder: decisionOrder!,
      nativeTick,
      exactFingerprint: exactDigest,
      contractSatisfied: stopVerdict.passed,
    }));
  return {
    previewType: "p3b-contextual-witness-review",
    previewVersion: 1,
    caseId: KEY_PYRAMID_CASE_ID,
    target: source.target,
    source: {
      mode: "manual",
      randomSeed: KEY_PYRAMID_MANUAL_SEED,
      randomSeedSemantics: "manual-fixed-zero-donor-independent",
      replay: null,
      mapPath: source.mapPath,
      seriesFile: source.seriesFile,
      mapContent: source.mapContent,
      seriesContent: source.seriesContent,
    },
    levelFacts: source.levelFactsContent,
    plan: terminalPlan.packet.content,
    witnessLeaf: terminalPlan.witnessLeafContent,
    selectedSegment: segment,
    parentPlanStatus: "unresolved",
    verifiedLeafDoesNotUpgradeParent: true,
    planVerificationScope: witness.planVerificationScope,
    planEffectValidation: witness.planEffectValidation,
    subgoal: {
      kind: "collect-placement",
      placementId: KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT,
      resourceType: RED_KEY,
      amount: 1,
    },
    contractValidation: {
      status: "passed",
      firstFailure: null,
    },
    entry: summarizeBoundary(witness.entry.observation),
    stop: summarizeBoundary(witness.end.observation),
    execution: {
      decisions: witness.snippet.decisions.map((decision, decisionOrder) => ({
        decisionOrder,
        ...decision,
      })),
      maximumAdvanceTicks,
      observedAfterAdvanceTicks: witness.snippet.consumedDecisionCount,
      intermediateBoundaries,
    },
    delta: { inventoryChanges, remainingRequirementChanges },
    renderViewport: RENDER_VIEWPORT,
    visualReview: {
      annotationBasis: "plan-intent-review-preview",
      observedFullRoute: false,
      routePreview: [START_COORDINATE, RED_KEY_COORDINATE],
      pointsOfInterest: [
        { label: "segment start", coordinate: START_COORDINATE, role: "route-start" },
        { label: "selected red key", coordinate: RED_KEY_COORDINATE, role: "selected-target" },
        { label: "blue-key alternative", coordinate: BLUE_KEY_COORDINATE, role: "retained-alternative" },
        { label: "later red door", coordinate: RED_DOOR_COORDINATE, role: "later-gate" },
      ],
      entryRender: witness.entry.render,
      stopRender: witness.end.render,
    },
    proof: {
      restoredExecutionEqualsUninterrupted: witness.join.state === "exact",
      rebuiltPrefixEqualsEntry: true,
      croppedRenderUsedAsCorrectnessEvidence: false,
    },
    witness: {
      content: witnessContent,
      witnessId: witness.witnessId,
      entryId: witness.entryId,
      planSegment: witness.planSegment,
      planVerificationScope: witness.planVerificationScope,
      planIntent: witness.planIntent,
      contract: witness.contract,
      prefix: witness.prefix,
      snippet: witness.snippet,
      entryContent: {
        observation: witness.entry.observationContent,
        render: witness.entry.renderContent,
      },
      stopContent: {
        observation: witness.end.observationContent,
        render: witness.end.renderContent,
      },
      boundaryChecks: witness.boundaryChecks,
      observedChanges: witness.observedChanges,
      planEffectValidation: witness.planEffectValidation,
      contractValidation: witness.contractValidation,
      join: witness.join,
      evidence: witness.evidence,
      provenance: witness.provenance,
      outcome: witness.outcome,
    },
  };
}
