import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type PlanReferenceV1,
  type RulesetTargetV1,
  type StableIdV1,
} from "@tworld/ccsolver/domain";
import {
  buildTerminalFirstPlan,
  type ExpandedPlanPreviewV1,
  type PlanPredicateV1,
  type PlanningStateEffectV1,
  type TerminalFirstOperatorV1,
  type TerminalFirstPlanningInputV1,
  type TerminalFirstPlanningResultV1,
} from "@tworld/ccsolver/plan";
import type {
  KeyPyramidP5RouteEventV1,
  KeyPyramidP5RouteV1,
  KeyPyramidP5TileStepV1,
} from "./buildKeyPyramidP5Route";

const PARENT_UNRESOLVED_REASON =
  "p1-candidate-evidence-does-not-prove-dynamic-or-joint-reachability" as const;
const CHIP = "cc1:icchip" as const;
const GREEN_KEY = "cc1:key-green" as const;

export type KeyPyramidP5ParentPlanV1 = {
  readonly path: string;
  readonly content: BlobReferenceV1;
  readonly packet: {
    readonly previewType: "p3a-terminal-plan-review";
    readonly previewVersion: 1;
    readonly caseId: "cclp1-001";
    readonly target: RulesetTargetV1;
    readonly content: BlobReferenceV1;
    readonly wholePlan: {
      readonly status: "unresolved";
      readonly reason: typeof PARENT_UNRESOLVED_REASON;
    };
  };
};

type BackwardObligation =
  | "reach-candidate-exit"
  | "reduce-required-chips-to-zero-before-socket"
  | "possess-key-before-door"
  | "possess-and-consume-key-before-door"
  | "visit-chip-placement"
  | "visit-key-placement";

type DirectPrerequisite = {
  readonly routeEventOrder: number;
  readonly relationship:
    | "available-key-collection"
    | "required-chip-collection"
    | "opened-socket";
  readonly resourceType: StableIdV1;
};

type SelectedRoutePredecessorEdge = {
  readonly kind: "selected-route-predecessor-state";
  readonly fromRouteEventOrder: number;
  readonly toRouteEventOrder: number | null;
  readonly predicate: PlanPredicateV1 | null;
};

type SelectedRouteResourceEdge = {
  readonly kind: DirectPrerequisite["relationship"];
  readonly fromRouteEventOrder: number;
  readonly toRouteEventOrder: number;
  readonly resourceType: StableIdV1;
  readonly predicate: PlanPredicateV1;
};

export type KeyPyramidP5PlanV1 = {
  readonly planType: "p5-key-pyramid-terminal-rooted-planning-packet";
  readonly planVersion: 1;
  readonly caseId: "cclp1-001";
  readonly target: RulesetTargetV1;
  readonly level: KeyPyramidP5RouteV1["level"];
  /** Candidate is a planning-time status; execution/certification own solved status. */
  readonly status: "candidate";
  readonly derivation: "terminal-first-selected-route-before-execution";
  readonly parentP3: {
    readonly path: string;
    readonly checkedFileContent: BlobReferenceV1;
    readonly planningContent: BlobReferenceV1;
    readonly wholePlan: KeyPyramidP5ParentPlanV1["packet"]["wholePlan"];
    readonly relationship: "historical-parent-preserved-not-upgraded";
    readonly upgraded: false;
  };
  readonly route: {
    readonly content: BlobReferenceV1;
    readonly derivation: "checked-facts-resource-search";
    readonly tileStepCount: number;
    readonly eventCount: number;
    readonly start: KeyPyramidP5RouteV1["start"];
    readonly finalState: KeyPyramidP5RouteV1["finalState"];
  };
  readonly terminalGoal: {
    readonly kind: "reach-exit";
    readonly routeEventOrder: number;
    readonly afterStepOrder: number;
    readonly coordinate: KeyPyramidP5RouteEventV1["coordinate"];
    readonly placementId: KeyPyramidP5RouteEventV1["placementId"];
  };
  readonly selectedRoute: {
    readonly decisionSource: "expanded-plan-selected-route";
    readonly tileStepsOrder: "step-order";
    readonly tileSteps: readonly KeyPyramidP5TileStepV1[];
    readonly eventStepsOrder: "route-event-order";
    readonly eventSteps: readonly {
      readonly routeEventOrder: number;
      readonly routeEventKind: KeyPyramidP5RouteEventV1["kind"];
      readonly operatorId: StableIdV1;
      readonly expandedPlanStepOrder: number;
      readonly achieves: ExpandedPlanPreviewV1["steps"][number]["achieves"];
      readonly predecessorPredicate: PlanPredicateV1 | null;
      readonly resourcePrerequisitePredicates: readonly PlanPredicateV1[];
    }[];
  };
  readonly prerequisiteEdgesOrder: "from-event-predecessor-then-resource-event-order";
  readonly prerequisiteEdges: readonly (
    | SelectedRoutePredecessorEdge
    | SelectedRouteResourceEdge
  )[];
  readonly terminalRootedTraversal: {
    readonly traversalOrder: "depth-first-predecessor-then-resource";
    readonly rootRouteEventOrder: number;
    readonly visitedEventOrders: readonly number[];
    readonly selectedRouteEventCount: number;
    readonly allSelectedRouteEventsReachable: true;
  };
  readonly backwardTraceOrder: "terminal-to-initial";
  readonly backwardTrace: readonly {
    readonly traceOrder: number;
    readonly routeEventOrder: number;
    readonly routeEventKind: KeyPyramidP5RouteEventV1["kind"];
    readonly afterStepOrder: number;
    readonly coordinate: KeyPyramidP5RouteEventV1["coordinate"];
    readonly placementId: KeyPyramidP5RouteEventV1["placementId"];
    readonly semanticType: KeyPyramidP5RouteEventV1["semanticType"];
    readonly resourceType: KeyPyramidP5RouteEventV1["resourceType"];
    readonly obligation: BackwardObligation;
    readonly chronologicalPreviousEventOrder: number | null;
    readonly directPrerequisites: readonly DirectPrerequisite[];
  }[];
  readonly planning: TerminalFirstPlanningResultV1;
  readonly expandedPlan: ExpandedPlanPreviewV1;
};

export type BuiltKeyPyramidP5PlanningBundle = {
  readonly route: KeyPyramidP5RouteV1;
  readonly routeContent: BlobReferenceV1;
  readonly packet: KeyPyramidP5PlanV1;
  readonly packetCanonicalJson: CanonicalJson;
  readonly content: BlobReferenceV1;
  /** Null until the real expanded-plan root envelope is encoded and identified. */
  readonly planReference: PlanReferenceV1 | null;
};

export type BoundKeyPyramidP5PlanningBundle = Omit<
  BuiltKeyPyramidP5PlanningBundle,
  "planReference"
> & { readonly planReference: PlanReferenceV1 };

function json(value: unknown): CanonicalJson {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function referencesEqual(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function canonicalEqual(left: unknown, right: unknown): boolean {
  return json(left) === json(right);
}

function routeEventEvidenceId(eventOrder: number): StableIdV1 {
  return `route-event:key-pyramid:${eventOrder}`;
}

function predicateForEvent(event: KeyPyramidP5RouteEventV1): PlanPredicateV1 {
  if (event.kind === "collect-key" || event.kind === "collect-chip") {
    if (event.resourceType === null) {
      throw new Error(`P5 collection event ${event.eventOrder} has no resource type`);
    }
    return {
      kind: "collect",
      resourceType: event.resourceType,
      amount: 1,
      collectionOccurrenceId: `collection:${event.placementId}`,
      sourcePlacementId: event.placementId,
    };
  }
  if (event.kind === "open-door") {
    if (event.resourceType === null) {
      throw new Error(`P5 door event ${event.eventOrder} has no key resource type`);
    }
    return {
      kind: "unlock",
      gateId: event.placementId,
      requirement: {
        kind: event.resourceType === GREEN_KEY
          ? "possess-inventory"
          : "consume-inventory",
        resourceType: event.resourceType,
        amount: 1,
      },
    };
  }
  if (event.kind === "open-socket") {
    if (event.resourceType === null) {
      throw new Error(`P5 socket event ${event.eventOrder} has no resource type`);
    }
    return {
      kind: "unlock",
      gateId: event.placementId,
      requirement: { kind: "remaining-zero", resourceType: event.resourceType },
    };
  }
  return { kind: "reach-exit", exitId: event.placementId };
}

function obligationFor(event: KeyPyramidP5RouteEventV1): BackwardObligation {
  switch (event.kind) {
    case "reach-exit": return "reach-candidate-exit";
    case "open-socket": return "reduce-required-chips-to-zero-before-socket";
    case "open-door":
      return event.resourceType === GREEN_KEY
        ? "possess-key-before-door"
        : "possess-and-consume-key-before-door";
    case "collect-chip": return "visit-chip-placement";
    case "collect-key": return "visit-key-placement";
  }
}

function directPrerequisitesFor(
  events: readonly KeyPyramidP5RouteEventV1[],
): readonly (readonly DirectPrerequisite[])[] {
  const availableKeys = new Map<StableIdV1, number[]>();
  const collectedChips: number[] = [];
  const openedSockets: number[] = [];
  const result: DirectPrerequisite[][] = [];
  for (const event of events) {
    let prerequisites: DirectPrerequisite[] = [];
    switch (event.kind) {
      case "collect-key": {
        if (event.resourceType === null) {
          throw new Error(`P5 key event ${event.eventOrder} has no resource type`);
        }
        const available = availableKeys.get(event.resourceType) ?? [];
        available.push(event.eventOrder);
        availableKeys.set(event.resourceType, available);
        break;
      }
      case "collect-chip":
        collectedChips.push(event.eventOrder);
        break;
      case "open-door": {
        if (event.resourceType === null) {
          throw new Error(`P5 door event ${event.eventOrder} has no key resource type`);
        }
        const available = availableKeys.get(event.resourceType);
        const keyEventOrder = available?.[0];
        if (keyEventOrder === undefined) {
          throw new Error(
            `P5 door event ${event.eventOrder} has no earlier available ${event.resourceType}`,
          );
        }
        prerequisites = [{
          routeEventOrder: keyEventOrder,
          relationship: "available-key-collection",
          resourceType: event.resourceType,
        }];
        if (event.resourceType !== GREEN_KEY) available!.shift();
        break;
      }
      case "open-socket": {
        if (event.resourceType === null || collectedChips.length !== 10) {
          throw new Error(
            `P5 socket event ${event.eventOrder} does not follow all ten chip collections`,
          );
        }
        const resourceType = event.resourceType;
        prerequisites = collectedChips.map((routeEventOrder) => ({
          routeEventOrder,
          relationship: "required-chip-collection",
          resourceType,
        }));
        openedSockets.push(event.eventOrder);
        break;
      }
      case "reach-exit": {
        const socketEventOrder = openedSockets.at(-1);
        const socket = socketEventOrder === undefined ? undefined : events[socketEventOrder];
        if (socketEventOrder === undefined || socket === undefined || socket.resourceType === null) {
          throw new Error(`P5 exit event ${event.eventOrder} does not follow an opened socket`);
        }
        prerequisites = [{
          routeEventOrder: socketEventOrder,
          relationship: "opened-socket",
          resourceType: socket.resourceType,
        }];
        break;
      }
    }
    result[event.eventOrder] = prerequisites;
  }
  return result;
}

function stateEffectsFor(event: KeyPyramidP5RouteEventV1): readonly PlanningStateEffectV1[] {
  if (event.resourceType === null) return [];
  if (event.kind === "collect-key") {
    return [{ axis: "inventory", resourceType: event.resourceType, delta: 1 }];
  }
  if (event.kind === "collect-chip") {
    return [{ axis: "remaining-requirement", resourceType: event.resourceType, delta: -1 }];
  }
  // Unlock consumption is derived by the terminal-first planner from the
  // typed gate requirement and must not be duplicated as an authored effect.
  return [];
}

function uniquePredicates(predicates: readonly PlanPredicateV1[]): readonly PlanPredicateV1[] {
  const seen = new Set<string>();
  return predicates.filter((predicate) => {
    const key = json(predicate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildPlanning(
  route: KeyPyramidP5RouteV1,
  directPrerequisites: readonly (readonly DirectPrerequisite[])[],
): {
  readonly result: TerminalFirstPlanningResultV1;
  readonly selected: ExpandedPlanPreviewV1;
  readonly eventSteps: KeyPyramidP5PlanV1["selectedRoute"]["eventSteps"];
  readonly edges: KeyPyramidP5PlanV1["prerequisiteEdges"];
} {
  const exit = route.events.at(-1);
  if (exit?.kind !== "reach-exit") {
    throw new Error("P5 selected route has no terminal exit event");
  }
  const operators: TerminalFirstOperatorV1[] = [];
  const edges: (SelectedRoutePredecessorEdge | SelectedRouteResourceEdge)[] = [];
  for (const event of route.events) {
    const predecessor = event.eventOrder === 0
      ? null
      : predicateForEvent(route.events[event.eventOrder - 1]!);
    const resourcePredicates = (directPrerequisites[event.eventOrder] ?? []).map(
      (dependency) => predicateForEvent(route.events[dependency.routeEventOrder]!),
    );
    const prerequisites = uniquePredicates([
      ...(predecessor === null ? [] : [predecessor]),
      ...resourcePredicates,
    ]);
    const operatorId = `operator:key-pyramid:${route.target}:selected-route-event:${event.eventOrder}`;
    const evidenceIds = [routeEventEvidenceId(event.eventOrder), event.placementId];
    const achieves = predicateForEvent(event);
    operators.push({
      operatorId,
      target: route.target,
      kind: achieves.kind,
      achieves,
      prerequisites,
      stateEffects: stateEffectsFor(event),
      evidenceIds,
    } as TerminalFirstOperatorV1);
    edges.push({
      kind: "selected-route-predecessor-state",
      fromRouteEventOrder: event.eventOrder,
      toRouteEventOrder: event.eventOrder === 0 ? null : event.eventOrder - 1,
      predicate: predecessor,
    });
    for (const dependency of directPrerequisites[event.eventOrder] ?? []) {
      edges.push({
        kind: dependency.relationship,
        fromRouteEventOrder: event.eventOrder,
        toRouteEventOrder: dependency.routeEventOrder,
        resourceType: dependency.resourceType,
        predicate: predicateForEvent(route.events[dependency.routeEventOrder]!),
      });
    }
  }
  const input: TerminalFirstPlanningInputV1 = {
    planningVersion: 1,
    target: route.target,
    exits: [{
      target: route.target,
      exitId: exit.placementId,
      evidenceIds: [routeEventEvidenceId(exit.eventOrder), exit.placementId],
    }],
    facts: [],
    operators,
    initialState: {
      inventory: [],
      remainingRequirements: [{ resourceType: CHIP, amount: 10 }],
    },
    limits: {
      maxDepth: 128,
      maxPlansPerExit: 1,
      maxTraceSteps: 512,
      maxDiagnostics: 64,
    },
  };
  const result = buildTerminalFirstPlan(input);
  const selected = result.expandedPlans[0];
  if (
    selected === undefined
    || result.expandedPlans.length !== 1
    || selected.status !== "candidate"
    || selected.unresolved.length !== 0
    || selected.steps.length !== route.events.length
  ) {
    throw new Error(
      `${route.target} P5 terminal-first planner did not yield one complete route candidate`,
    );
  }
  const eventSteps = route.events.map((event, eventOrder) => {
    const step = selected.steps[eventOrder];
    const expectedOperatorId = operators[eventOrder]?.operatorId;
    const expectedPredicate = predicateForEvent(event);
    if (
      step === undefined
      || step.stepOrder !== eventOrder
      || step.operatorId !== expectedOperatorId
      || step.kind !== expectedPredicate.kind
      || !canonicalEqual(step.achieves, expectedPredicate)
      || !step.evidenceIds.includes(routeEventEvidenceId(event.eventOrder))
    ) {
      throw new Error(`${route.target} P5 expanded plan step ${eventOrder} lost its route event`);
    }
    return {
      routeEventOrder: event.eventOrder,
      routeEventKind: event.kind,
      operatorId: step.operatorId,
      expandedPlanStepOrder: step.stepOrder,
      achieves: step.achieves,
      predecessorPredicate: event.eventOrder === 0
        ? null
        : predicateForEvent(route.events[event.eventOrder - 1]!),
      resourcePrerequisitePredicates: (directPrerequisites[event.eventOrder] ?? []).map(
        (dependency) => predicateForEvent(route.events[dependency.routeEventOrder]!),
      ),
    };
  });
  const ledger = new Map(selected.stateLedger.map((entry) => (
    [`${entry.axis}:${entry.resourceType}`, entry.remaining]
  )));
  const expectedLedger = [
    ["remaining-requirement:cc1:icchip", route.finalState.remainingChips],
    ["inventory:cc1:key-red", route.finalState.inventory.red],
    ["inventory:cc1:key-blue", route.finalState.inventory.blue],
    ["inventory:cc1:key-yellow", route.finalState.inventory.yellow],
    ["inventory:cc1:key-green", route.finalState.inventory.green],
  ] as const;
  if (expectedLedger.some(([key, remaining]) => (ledger.get(key) ?? 0) !== remaining)) {
    throw new Error(`${route.target} P5 expanded plan resource ledger drifted from route final state`);
  }
  return { result, selected, eventSteps, edges };
}

function terminalTraversal(
  rootEventOrder: number,
  edges: KeyPyramidP5PlanV1["prerequisiteEdges"],
  eventCount: number,
): KeyPyramidP5PlanV1["terminalRootedTraversal"] {
  const visited = new Set<number>();
  const ordered: number[] = [];
  const visit = (eventOrder: number): void => {
    if (visited.has(eventOrder)) return;
    visited.add(eventOrder);
    ordered.push(eventOrder);
    for (const edge of edges) {
      if (edge.fromRouteEventOrder !== eventOrder || edge.toRouteEventOrder === null) continue;
      visit(edge.toRouteEventOrder);
    }
  };
  visit(rootEventOrder);
  if (
    visited.size !== eventCount
    || ordered.some((eventOrder) => eventOrder < 0 || eventOrder >= eventCount)
  ) {
    throw new Error(
      `P5 terminal-rooted prerequisite traversal reached ${visited.size}/${eventCount} events`,
    );
  }
  return {
    traversalOrder: "depth-first-predecessor-then-resource",
    rootRouteEventOrder: rootEventOrder,
    visitedEventOrders: ordered,
    selectedRouteEventCount: eventCount,
    allSelectedRouteEventsReachable: true,
  };
}

function assertRouteShape(route: KeyPyramidP5RouteV1): void {
  if (
    route.routeType !== "p5-key-pyramid-route"
    || route.derivation !== "checked-facts-resource-search"
    || route.tileSteps.length !== 162
    || route.subgoals.length !== 6
    || route.events.length === 0
  ) {
    throw new Error(`${route.target} P5 checked-facts route shape drifted`);
  }
  for (const [index, step] of route.tileSteps.entries()) {
    if (step.stepOrder !== index) throw new Error(`${route.target} P5 route step ${index} drifted`);
  }
  for (const [index, event] of route.events.entries()) {
    if (event.eventOrder !== index || route.tileSteps[event.afterStepOrder] === undefined) {
      throw new Error(`${route.target} P5 route event ${index} drifted`);
    }
  }
  const exit = route.events.at(-1);
  if (
    exit?.kind !== "reach-exit"
    || !canonicalEqual(exit.coordinate, route.finalState.coordinate)
    || route.finalState.remainingChips !== 0
  ) {
    throw new Error(`${route.target} P5 route does not end at its zero-remaining exit`);
  }
}

function assertParent(route: KeyPyramidP5RouteV1, parentP3: KeyPyramidP5ParentPlanV1): void {
  if (
    parentP3.packet.target !== route.target
    || parentP3.packet.caseId !== "cclp1-001"
    || parentP3.packet.wholePlan.status !== "unresolved"
    || parentP3.packet.wholePlan.reason !== PARENT_UNRESOLVED_REASON
  ) {
    throw new Error(`${route.target} P5 checked P3 parent binding drifted`);
  }
}

/**
 * Produces the planning document before execution. The returned temporary plan
 * reference is replaced with the expanded-plan envelope digest by the composer
 * before any execution starts; the opaque root protocol is owned separately.
 */
export async function buildKeyPyramidP5Plan(
  input: {
    readonly route: KeyPyramidP5RouteV1;
    readonly parentP3: KeyPyramidP5ParentPlanV1;
  },
  sha256 = new WebCryptoSha256(),
): Promise<BuiltKeyPyramidP5PlanningBundle> {
  const { route, parentP3 } = input;
  assertRouteShape(route);
  assertParent(route, parentP3);
  const routeCanonicalJson = json(route);
  const routeContent = await referenceCanonicalJson(routeCanonicalJson, sha256);
  const directPrerequisites = directPrerequisitesFor(route.events);
  const planned = buildPlanning(route, directPrerequisites);
  const exit = route.events.at(-1)!;
  const traversal = terminalTraversal(exit.eventOrder, planned.edges, route.events.length);
  const packet: KeyPyramidP5PlanV1 = {
    planType: "p5-key-pyramid-terminal-rooted-planning-packet",
    planVersion: 1,
    caseId: "cclp1-001",
    target: route.target,
    level: route.level,
    status: "candidate",
    derivation: "terminal-first-selected-route-before-execution",
    parentP3: {
      path: parentP3.path,
      checkedFileContent: parentP3.content,
      planningContent: parentP3.packet.content,
      wholePlan: parentP3.packet.wholePlan,
      relationship: "historical-parent-preserved-not-upgraded",
      upgraded: false,
    },
    route: {
      content: routeContent,
      derivation: route.derivation,
      tileStepCount: route.tileSteps.length,
      eventCount: route.events.length,
      start: route.start,
      finalState: route.finalState,
    },
    terminalGoal: {
      kind: "reach-exit",
      routeEventOrder: exit.eventOrder,
      afterStepOrder: exit.afterStepOrder,
      coordinate: exit.coordinate,
      placementId: exit.placementId,
    },
    selectedRoute: {
      decisionSource: "expanded-plan-selected-route",
      tileStepsOrder: "step-order",
      tileSteps: route.tileSteps,
      eventStepsOrder: "route-event-order",
      eventSteps: planned.eventSteps,
    },
    prerequisiteEdgesOrder: "from-event-predecessor-then-resource-event-order",
    prerequisiteEdges: planned.edges,
    terminalRootedTraversal: traversal,
    backwardTraceOrder: "terminal-to-initial",
    backwardTrace: [...route.events].reverse().map((event, traceOrder) => ({
      traceOrder,
      routeEventOrder: event.eventOrder,
      routeEventKind: event.kind,
      afterStepOrder: event.afterStepOrder,
      coordinate: event.coordinate,
      placementId: event.placementId,
      semanticType: event.semanticType,
      resourceType: event.resourceType,
      obligation: obligationFor(event),
      chronologicalPreviousEventOrder: event.eventOrder === 0 ? null : event.eventOrder - 1,
      directPrerequisites: directPrerequisites[event.eventOrder]!,
    })),
    planning: planned.result,
    expandedPlan: planned.selected,
  };
  const packetCanonicalJson = json(packet);
  const content = await referenceCanonicalJson(packetCanonicalJson, sha256);
  const root = planned.result.graph.roots[0];
  if (root === undefined) throw new Error(`${route.target} P5 planning result has no terminal root`);
  return {
    route,
    routeContent,
    packet,
    packetCanonicalJson,
    content,
    planReference: null,
  };
}

export async function assertKeyPyramidP5PlanningBundle(
  bundle: BuiltKeyPyramidP5PlanningBundle,
  sha256 = new WebCryptoSha256(),
): Promise<void> {
  assertRouteShape(bundle.route);
  const [routeContent, packetContent] = await Promise.all([
    referenceCanonicalJson(json(bundle.route), sha256),
    referenceCanonicalJson(json(bundle.packet), sha256),
  ]);
  const root = bundle.packet.planning.graph.roots[0];
  if (
    !referencesEqual(routeContent, bundle.routeContent)
    || !referencesEqual(routeContent, bundle.packet.route.content)
    || !referencesEqual(packetContent, bundle.content)
    || bundle.packetCanonicalJson !== json(bundle.packet)
    || (bundle.planReference !== null && (
      bundle.planReference.artifact.protocolVersion !== 1
      || bundle.planReference.artifact.artifactType !== "expanded-plan"
      || bundle.planReference.artifact.schemaVersion !== 1
      || bundle.planReference.goalId !== root?.goalId
      || bundle.planReference.subgoalId !== null
    ))
    || bundle.packet.status !== "candidate"
    || bundle.packet.expandedPlan.status !== "candidate"
    || !canonicalEqual(bundle.packet.expandedPlan, bundle.packet.planning.expandedPlans[0])
    || !canonicalEqual(bundle.packet.selectedRoute.tileSteps, bundle.route.tileSteps)
    || bundle.packet.selectedRoute.eventSteps.length !== bundle.route.events.length
    || bundle.packet.terminalRootedTraversal.selectedRouteEventCount !== bundle.route.events.length
    || bundle.packet.terminalRootedTraversal.allSelectedRouteEventsReachable !== true
  ) {
    throw new Error(`${bundle.route.target} P5 planning bundle content or route binding drifted`);
  }
  for (const [index, eventStep] of bundle.packet.selectedRoute.eventSteps.entries()) {
    const step = bundle.packet.expandedPlan.steps[index];
    if (
      eventStep.routeEventOrder !== index
      || eventStep.expandedPlanStepOrder !== index
      || eventStep.operatorId !== step?.operatorId
    ) {
      throw new Error(`${bundle.route.target} P5 planning bundle event step ${index} drifted`);
    }
  }
  const traversal = terminalTraversal(
    bundle.packet.terminalGoal.routeEventOrder,
    bundle.packet.prerequisiteEdges,
    bundle.route.events.length,
  );
  if (!canonicalEqual(traversal, bundle.packet.terminalRootedTraversal)) {
    throw new Error(`${bundle.route.target} P5 terminal-rooted planning traversal drifted`);
  }
}

/** Rebinds a validated planning document to its real expanded-plan envelope. */
export async function bindKeyPyramidP5ExpandedPlanReference(
  bundle: BuiltKeyPyramidP5PlanningBundle,
  planReference: PlanReferenceV1,
  sha256 = new WebCryptoSha256(),
): Promise<BoundKeyPyramidP5PlanningBundle> {
  const rebound = { ...bundle, planReference };
  await assertKeyPyramidP5PlanningBundle(rebound, sha256);
  return rebound;
}
