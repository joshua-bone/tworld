import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  referenceCanonicalJson,
} from "@tworld/ccsolver/application";
import type { StaticAnalysisV1, StaticBoundaryV1 } from "@tworld/ccsolver/analyze";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CoordinateV1,
  type PlacementIdV1,
  type StableIdV1,
} from "@tworld/ccsolver/domain";
import {
  buildTerminalFirstPlan,
  type CollectPredicateV1,
  type ExpandedPlanPreviewV1,
  type ExpandedPlanStepV1,
  type PlanningFactV1,
  type ReachPredicateV1,
  type TerminalFirstOperatorV1,
  type TerminalFirstPlanningInputV1,
  type TerminalFirstPlanningResultV1,
  type UnlockPredicateV1,
} from "@tworld/ccsolver/plan";
import type { ContextualPlanSegmentV1 } from "@tworld/ccsolver/snippets";
import {
  KEY_PYRAMID_CASE_ID,
  KEY_PYRAMID_LEVEL_DIGEST,
  KEY_PYRAMID_OCCURRENCE_ID,
  type KeyPyramidStaticSource,
} from "./keyPyramidP3Source";

const EXIT_PLACEMENT =
  "placement:sha256:d383dda76f9ee238c0b972626e9be47bae95a383dc2afb9a520373548faf5879" as const;
const SOCKET_PLACEMENT =
  "placement:sha256:dbebc2e26f982d92d6630a8af7dca8d0b361718b44b9ccb5f18967898e2ee406" as const;
const RED_KEY_PLACEMENT =
  "placement:sha256:d00e6d868291293c03d17bf6908414aaf16f4335d5b1cd46aebe8b77b9dcfec6" as const;
const BLUE_KEY_PLACEMENT =
  "placement:sha256:a086d1108843a67ee7cc7ba9f9d16c22b023b05f396406d3d9950601cf1de132" as const;
const RED_DOOR_PLACEMENT =
  "placement:sha256:8bea7a74055f494b563e73afe4795c7afb2e194bfced8e669bb1d248530783a9" as const;
const PLAYER_ACTOR =
  "actor:sha256:d4cd72d940fc878529e4c513c1ff6838b9363ed94899472911eafa1a0b71eb48" as const;

const CHIP = "cc1:icchip" as const;
const RED_KEY = "cc1:key-red" as const;
const BLUE_KEY = "cc1:key-blue" as const;
const START_REGION = "region:558" as const;
const RED_DOOR_REGION = "region:429" as const;
const TERMINAL_ENTRY_REGION = "region:p1-unresolved-terminal-entry:boundary:239" as const;

export const KEY_PYRAMID_SELECTED_RED_KEY_PLACEMENT = RED_KEY_PLACEMENT;
export const KEY_PYRAMID_PLAYER_ACTOR = PLAYER_ACTOR;

type PlacementSummary = {
  readonly placementId: PlacementIdV1;
  readonly resourceType: StableIdV1;
  readonly coordinate: CoordinateV1;
};

type TerminalPlacementSummary = {
  readonly placementId: PlacementIdV1;
  readonly coordinate: CoordinateV1;
};

export type KeyPyramidContextualLeafReviewV1 = {
  readonly reviewType: "p3b-selected-segment-review";
  readonly reviewVersion: 1;
  readonly status: "candidate-for-contextual-verification";
  readonly parentPlan: {
    readonly content: BlobReferenceV1;
    readonly status: "unresolved";
  };
  readonly verificationScope: {
    readonly kind: "selected-segment-only";
    readonly verificationDoesNotUpgradeParent: true;
  };
  readonly segment: ContextualPlanSegmentV1;
  readonly selectedStep: ExpandedPlanStepV1;
};

export type KeyPyramidTerminalPlanReviewV1 = {
  readonly previewType: "p3a-terminal-plan-review";
  readonly previewVersion: 1;
  readonly caseId: typeof KEY_PYRAMID_CASE_ID;
  readonly target: KeyPyramidStaticSource["target"];
  readonly source: {
    readonly occurrenceId: typeof KEY_PYRAMID_OCCURRENCE_ID;
    readonly normalizedGameplayDigest: typeof KEY_PYRAMID_LEVEL_DIGEST;
  };
  readonly artifacts: {
    readonly levelFacts: BlobReferenceV1;
    readonly staticAnalysis: BlobReferenceV1;
    readonly topologyEvidence: BlobReferenceV1;
  };
  readonly content: BlobReferenceV1;
  readonly witnessLeaf: KeyPyramidContextualLeafReviewV1 & {
    readonly content: BlobReferenceV1;
  };
  readonly wholePlan: {
    readonly status: "unresolved";
    readonly reason: "p1-candidate-evidence-does-not-prove-dynamic-or-joint-reachability";
  };
  readonly terminalTheory: {
    readonly exit: TerminalPlacementSummary;
    readonly socket: TerminalPlacementSummary;
    readonly requiredChipCount: 10;
    readonly chipPlacements: readonly PlacementSummary[];
  };
  readonly selectedFirstSubgoal: PlacementSummary & {
    readonly kind: "collect-placement";
    readonly selectionStatus: "selected-safe-candidate-not-uniquely-required";
  };
  readonly retainedAlternatives: readonly (PlacementSummary & {
    readonly kind: "collect-placement";
    readonly selectionStatus: "equally-immediate-safe-candidate";
  })[];
  readonly staticEvidence: {
    readonly unknownCount: number;
    readonly nonPlayerActorCount: number;
    readonly startRegionId: typeof START_REGION;
    readonly selectedRedDoor: {
      readonly placementId: typeof RED_DOOR_PLACEMENT;
      readonly regionIds: readonly [typeof RED_DOOR_REGION, typeof START_REGION];
    };
    readonly terminalBoundary: {
      readonly boundaryId: "boundary:239";
      readonly kind: "dynamic";
      readonly regionIds: readonly [];
    };
  };
  readonly planning: TerminalFirstPlanningResultV1;
};

export type BuiltKeyPyramidTerminalPlan = {
  readonly packet: KeyPyramidTerminalPlanReviewV1;
  readonly selectedPlan: ExpandedPlanPreviewV1;
  readonly selectedSegment: ContextualPlanSegmentV1;
  readonly selectedStep: ExpandedPlanStepV1;
  readonly witnessLeafContent: BlobReferenceV1;
  readonly selectedRedOperatorId: StableIdV1;
};

function coordinateKey(coordinate: CoordinateV1): string {
  return `${coordinate.z}:${coordinate.y}:${coordinate.x}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePlacement(left: PlacementSummary, right: PlacementSummary): number {
  return left.coordinate.z - right.coordinate.z
    || left.coordinate.y - right.coordinate.y
    || left.coordinate.x - right.coordinate.x
    || compareText(left.placementId, right.placementId);
}

function findPlacement(
  source: KeyPyramidStaticSource,
  placementId: PlacementIdV1,
  semanticType: StableIdV1,
  expectedCoordinate: CoordinateV1,
): PlacementSummary {
  const placement = source.levelFacts.payload.placements.find(
    (candidate) => candidate.placementId === placementId,
  );
  if (
    placement === undefined
    || placement.descriptor.semanticType !== semanticType
    || coordinateKey(placement.descriptor.coordinate) !== coordinateKey(expectedCoordinate)
    || placement.interpretation !== "known"
  ) {
    throw new Error(
      `${source.target} Key Pyramid ${semanticType} placement ${placementId} drifted`,
    );
  }
  return {
    placementId,
    resourceType: semanticType,
    coordinate: placement.descriptor.coordinate,
  };
}

function boundaryForPlacement(
  analysis: StaticAnalysisV1,
  placementId: PlacementIdV1,
): StaticBoundaryV1 {
  const boundary = analysis.boundaries.find((candidate) =>
    candidate.caveats.some((caveat) => caveat.placementId === placementId));
  if (boundary === undefined) {
    throw new Error(`${analysis.target} placement ${placementId} has no topology boundary`);
  }
  return boundary;
}

function collect(
  resourceType: StableIdV1,
  sourcePlacementId: PlacementIdV1,
): CollectPredicateV1 {
  return {
    kind: "collect",
    resourceType,
    amount: 1,
    collectionOccurrenceId: `collection:${sourcePlacementId}`,
    sourcePlacementId,
  };
}

function reach(regionId: StableIdV1): ReachPredicateV1 {
  return { kind: "reach", regionId };
}

function operatorId(target: KeyPyramidStaticSource["target"], name: string): StableIdV1 {
  return `operator:key-pyramid:${target}:${name}`;
}

function assertKeyPyramidStaticContract(source: KeyPyramidStaticSource): void {
  const facts = source.levelFacts.payload;
  if (
    facts.exits.length !== 1
    || facts.exits[0] !== EXIT_PLACEMENT
    || facts.requiredCollectibles.length !== 1
    || facts.requiredCollectibles[0]?.resourceType !== CHIP
    || facts.requiredCollectibles[0]?.amount !== 10
    || facts.unknowns.length !== 0
    || facts.actors.length !== 1
    || facts.actors[0]?.actorId !== PLAYER_ACTOR
    || facts.actors[0]?.semanticType !== "cc1:chip"
  ) {
    throw new Error(`${source.target} Key Pyramid P1 facts no longer match the P3 contract`);
  }
}

function buildPlanningInput(
  source: KeyPyramidStaticSource,
  chipPlacements: readonly PlacementSummary[],
): { input: TerminalFirstPlanningInputV1; selectedRedOperatorId: StableIdV1 } {
  const { staticAnalysis: analysis, target } = source;
  const start = reach(START_REGION);
  const redDoorRegion = reach(RED_DOOR_REGION);
  const terminalEntry = reach(TERMINAL_ENTRY_REGION);
  const redCollect = collect(RED_KEY, RED_KEY_PLACEMENT);
  const redUnlock: UnlockPredicateV1 = {
    kind: "unlock",
    gateId: RED_DOOR_PLACEMENT,
    requirement: { kind: "consume-inventory", resourceType: RED_KEY, amount: 1 },
  };
  const socketUnlock: UnlockPredicateV1 = {
    kind: "unlock",
    gateId: SOCKET_PLACEMENT,
    requirement: { kind: "remaining-zero", resourceType: CHIP },
  };
  const chipDependencies = chipPlacements.map((placement) => {
    const dependency = analysis.resourceDependencies
      .find(({ gatePlacementId }) => gatePlacementId === SOCKET_PLACEMENT)
      ?.candidateSources.find(({ placementId }) => placementId === placement.placementId);
    if (dependency === undefined || dependency.regionIds.length !== 1) {
      throw new Error(
        `${target} chip ${placement.placementId} lacks one exact socket source region`,
      );
    }
    const boundary = boundaryForPlacement(analysis, placement.placementId);
    if (
      boundary.kind !== "dynamic"
      || boundary.coordinate.x !== placement.coordinate.x
      || boundary.coordinate.y !== placement.coordinate.y
      || boundary.coordinate.z !== placement.coordinate.z
    ) {
      throw new Error(`${target} chip ${placement.placementId} topology binding drifted`);
    }
    return {
      boundary,
      predicate: collect(CHIP, placement.placementId),
      regionId: dependency.regionIds[0]!,
    };
  });
  const redDoorDependency = analysis.resourceDependencies.find(
    ({ gatePlacementId }) => gatePlacementId === RED_DOOR_PLACEMENT,
  );
  if (
    redDoorDependency?.gateKind !== "consume"
    || redDoorDependency.resourceType !== RED_KEY
    || canonicalizeJson(redDoorDependency.regionIds) !== canonicalizeJson([
      RED_DOOR_REGION,
      START_REGION,
    ])
    || !redDoorDependency.candidateSources.some(
      ({ placementId, regionIds }) => placementId === RED_KEY_PLACEMENT
        && canonicalizeJson(regionIds) === canonicalizeJson([START_REGION]),
    )
  ) {
    throw new Error(`${target} selected red-door dependency drifted`);
  }

  const facts: PlanningFactV1[] = [
    {
      predicate: start,
      status: "satisfied",
      evidenceIds: [PLAYER_ACTOR, START_REGION],
    },
    {
      predicate: terminalEntry,
      status: "dynamic",
      evidenceIds: ["boundary:239", EXIT_PLACEMENT],
    },
  ];
  for (const dependency of chipDependencies) {
    if (dependency.regionId === RED_DOOR_REGION) {
      continue;
    }
    facts.push({
      predicate: reach(dependency.regionId),
      status: "dynamic",
      evidenceIds: [dependency.boundary.boundaryId, dependency.regionId],
    });
  }

  const selectedRedOperatorId = operatorId(target, "collect-adjacent-red-key");
  const operators: TerminalFirstOperatorV1[] = [
    {
      operatorId: operatorId(target, "reach-exit"),
      target,
      kind: "reach-exit",
      achieves: { kind: "reach-exit", exitId: EXIT_PLACEMENT },
      prerequisites: [socketUnlock, terminalEntry],
      stateEffects: [],
      evidenceIds: ["boundary:239", EXIT_PLACEMENT, SOCKET_PLACEMENT],
    },
    {
      operatorId: operatorId(target, "open-socket-after-ten-chips"),
      target,
      kind: "unlock",
      achieves: socketUnlock,
      prerequisites: chipDependencies.map(({ predicate }) => predicate),
      stateEffects: [],
      evidenceIds: ["boundary:271", SOCKET_PLACEMENT],
    },
    {
      operatorId: operatorId(target, "reach-region-429-through-adjacent-red-door"),
      target,
      kind: "reach",
      achieves: redDoorRegion,
      prerequisites: [start, redUnlock],
      stateEffects: [],
      evidenceIds: ["boundary:526", RED_DOOR_PLACEMENT, RED_DOOR_REGION, START_REGION],
    },
    {
      operatorId: operatorId(target, "unlock-adjacent-red-door"),
      target,
      kind: "unlock",
      achieves: redUnlock,
      prerequisites: [redCollect],
      stateEffects: [],
      evidenceIds: ["boundary:526", RED_DOOR_PLACEMENT],
    },
    {
      operatorId: selectedRedOperatorId,
      target,
      kind: "collect",
      achieves: redCollect,
      prerequisites: [start],
      stateEffects: [{ axis: "inventory", resourceType: RED_KEY, delta: 1 }],
      evidenceIds: ["boundary:624", RED_KEY_PLACEMENT, START_REGION],
    },
    ...chipDependencies.map(({ boundary, predicate, regionId }) => ({
      operatorId: operatorId(target, `collect-chip:${predicate.sourcePlacementId}`),
      target,
      kind: "collect" as const,
      achieves: predicate,
      prerequisites: [reach(regionId)],
      stateEffects: [{
        axis: "remaining-requirement" as const,
        resourceType: CHIP,
        delta: -1,
      }],
      evidenceIds: [boundary.boundaryId, predicate.sourcePlacementId!, regionId],
    })),
  ];
  return {
    selectedRedOperatorId,
    input: {
      planningVersion: 1,
      target,
      exits: [{ target, exitId: EXIT_PLACEMENT, evidenceIds: [EXIT_PLACEMENT] }],
      facts,
      operators,
      initialState: {
        inventory: [],
        remainingRequirements: [{ resourceType: CHIP, amount: 10 }],
      },
      limits: {
        maxDepth: 64,
        maxPlansPerExit: 4,
        maxTraceSteps: 256,
        maxDiagnostics: 32,
      },
    },
  };
}

export async function buildKeyPyramidTerminalPlan(
  source: KeyPyramidStaticSource,
  sha256 = new WebCryptoSha256(),
): Promise<BuiltKeyPyramidTerminalPlan> {
  assertKeyPyramidStaticContract(source);
  const exit = findPlacement(source, EXIT_PLACEMENT, "cc1:exit", { x: 15, y: 7, z: 0 });
  const socket = findPlacement(
    source,
    SOCKET_PLACEMENT,
    "cc1:socket",
    { x: 15, y: 8, z: 0 },
  );
  const redKey = findPlacement(
    source,
    RED_KEY_PLACEMENT,
    RED_KEY,
    { x: 16, y: 19, z: 0 },
  );
  const blueKey = findPlacement(
    source,
    BLUE_KEY_PLACEMENT,
    BLUE_KEY,
    { x: 14, y: 19, z: 0 },
  );
  const chipPlacements = source.levelFacts.payload.placements
    .filter(({ descriptor, interpretation }) =>
      descriptor.semanticType === CHIP && interpretation === "known")
    .map(({ placementId, descriptor }) => ({
      placementId,
      resourceType: CHIP,
      coordinate: descriptor.coordinate,
    }))
    .sort(comparePlacement);
  if (chipPlacements.length !== 10) {
    throw new Error(`${source.target} Key Pyramid expected exactly ten chip placements`);
  }

  const terminalBoundary = boundaryForPlacement(source.staticAnalysis, EXIT_PLACEMENT);
  const socketBoundary = boundaryForPlacement(source.staticAnalysis, SOCKET_PLACEMENT);
  if (
    terminalBoundary.boundaryId !== "boundary:239"
    || terminalBoundary.kind !== "dynamic"
    || terminalBoundary.incomingRegionIds.length !== 0
    || terminalBoundary.outgoingRegionIds.length !== 0
    || socketBoundary.boundaryId !== "boundary:271"
    || socketBoundary.kind !== "conditional"
  ) {
    throw new Error(`${source.target} Key Pyramid terminal topology drifted`);
  }
  const { input, selectedRedOperatorId } = buildPlanningInput(source, chipPlacements);
  const planning = buildTerminalFirstPlan(input);
  const selectedPlan = planning.expandedPlans[0];
  if (
    selectedPlan === undefined
    || selectedPlan.status !== "unresolved"
    || !selectedPlan.steps.some(({ operatorId: id }) => id === selectedRedOperatorId)
    || !selectedPlan.unresolved.some(({ reason }) => reason === "dynamic")
  ) {
    throw new Error(`${source.target} terminal-first plan lost its conservative red-key slice`);
  }
  const content = await referenceCanonicalJson(canonicalizeJson(planning), sha256);
  const selectedRedStep = selectedPlan.steps.find(
    ({ operatorId: id }) => id === selectedRedOperatorId,
  );
  if (selectedRedStep === undefined) {
    throw new Error(`${source.target} selected red-key plan step is absent`);
  }
  const selectedSegment: ContextualPlanSegmentV1 = {
    planId: selectedPlan.planId,
    rootId: selectedPlan.rootId,
    startStepOrder: selectedRedStep.stepOrder,
    endStepOrder: selectedRedStep.stepOrder,
    operatorIds: [selectedRedOperatorId],
  };
  const witnessLeaf: KeyPyramidContextualLeafReviewV1 = {
    reviewType: "p3b-selected-segment-review",
    reviewVersion: 1,
    status: "candidate-for-contextual-verification",
    parentPlan: { content, status: "unresolved" },
    verificationScope: {
      kind: "selected-segment-only",
      verificationDoesNotUpgradeParent: true,
    },
    segment: selectedSegment,
    selectedStep: selectedRedStep,
  };
  const witnessLeafContent = await referenceCanonicalJson(
    canonicalizeJson(witnessLeaf),
    sha256,
  );
  const terminalSummary = (placement: PlacementSummary): TerminalPlacementSummary => ({
    placementId: placement.placementId,
    coordinate: placement.coordinate,
  });
  const packet: KeyPyramidTerminalPlanReviewV1 = {
    previewType: "p3a-terminal-plan-review",
    previewVersion: 1,
    caseId: KEY_PYRAMID_CASE_ID,
    target: source.target,
    source: {
      occurrenceId: KEY_PYRAMID_OCCURRENCE_ID,
      normalizedGameplayDigest: KEY_PYRAMID_LEVEL_DIGEST,
    },
    artifacts: {
      levelFacts: source.levelFactsContent,
      staticAnalysis: source.staticAnalysisContent,
      topologyEvidence: source.staticAnalysis.topologyEvidence,
    },
    content,
    witnessLeaf: { ...witnessLeaf, content: witnessLeafContent },
    wholePlan: {
      status: "unresolved",
      reason: "p1-candidate-evidence-does-not-prove-dynamic-or-joint-reachability",
    },
    terminalTheory: {
      exit: terminalSummary(exit),
      socket: terminalSummary(socket),
      requiredChipCount: 10,
      chipPlacements,
    },
    selectedFirstSubgoal: {
      kind: "collect-placement",
      ...redKey,
      selectionStatus: "selected-safe-candidate-not-uniquely-required",
    },
    retainedAlternatives: [{
      kind: "collect-placement",
      ...blueKey,
      selectionStatus: "equally-immediate-safe-candidate",
    }],
    staticEvidence: {
      unknownCount: source.levelFacts.payload.unknowns.length,
      nonPlayerActorCount: source.levelFacts.payload.actors
        .filter(({ actorId }) => actorId !== PLAYER_ACTOR).length,
      startRegionId: START_REGION,
      selectedRedDoor: {
        placementId: RED_DOOR_PLACEMENT,
        regionIds: [RED_DOOR_REGION, START_REGION],
      },
      terminalBoundary: {
        boundaryId: "boundary:239",
        kind: "dynamic",
        regionIds: [],
      },
    },
    planning,
  };
  return {
    packet,
    selectedPlan,
    selectedSegment,
    selectedStep: selectedRedStep,
    witnessLeafContent,
    selectedRedOperatorId,
  };
}
