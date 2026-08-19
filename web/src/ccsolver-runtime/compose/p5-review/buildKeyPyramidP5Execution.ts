import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type PlanReferenceV1,
  type SolverObservation,
  type SolverRenderProjection,
  type SolverTerminalResult,
  type StableIdV1,
} from "@tworld/ccsolver/domain";
import type { SolverRuntimePort, SolverRunHandle } from "@tworld/ccsolver/ports";
import type { TworldSolverReplayPayload } from "../runtime/tworldSolverRuntimeSource";
import { createTworldLynxSolverRuntimeAdapter } from "../runtime/TworldLynxSolverRuntimeAdapter";
import { createTworldMsSolverRuntimeAdapter } from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "../runtime/tworldSolverRuntimeSource";
import type { KeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import {
  assertKeyPyramidP5PlanningBundle,
  type BoundKeyPyramidP5PlanningBundle,
} from "./buildKeyPyramidP5Plan";
import type {
  KeyPyramidP5RouteV1,
  KeyPyramidP5SubgoalV1,
} from "./buildKeyPyramidP5Route";

const MAXIMUM_REPLAY_TICKS = 4_000;
const AUTHORED_REPLAY_DEADLINE_TICKS = 700;

export type KeyPyramidP5ExecutionBoundaryV1 = {
  readonly boundaryOrder: number;
  readonly boundaryKind: "initial" | "subgoal-stop";
  readonly subgoalId: StableIdV1 | null;
  readonly nativeTick: number;
  readonly coordinate: SolverObservation["player"]["coordinate"];
  readonly remainingChips: number;
  readonly terminalKind: SolverTerminalResult["kind"];
  readonly exactFingerprint: StableIdV1;
  readonly observationContent: BlobReferenceV1;
  readonly renderContent: BlobReferenceV1;
  readonly observation: SolverObservation;
  readonly render: SolverRenderProjection;
};

export type KeyPyramidP5ExecutionV1 = {
  readonly executionType: "p5-key-pyramid-continuous-execution";
  readonly executionVersion: 1;
  readonly target: KeyPyramidRuntimeSource["target"];
  readonly route: KeyPyramidP5RouteV1;
  readonly planning: {
    readonly plan: PlanReferenceV1;
    readonly planContent: BlobReferenceV1;
    readonly routeContent: BlobReferenceV1;
    readonly expandedPlanId: StableIdV1;
    readonly decisionSource: "expanded-plan-selected-route";
  };
  readonly replay: TworldSolverReplayPayload;
  readonly scheduling: {
    readonly kind: "target-native-settled-tile-steps";
    readonly moveSpacingNativeTicks: 4;
    readonly finalExpectedNativeTick: number;
    readonly maximumReplayTicks: typeof MAXIMUM_REPLAY_TICKS;
  };
  readonly sourceAudit: {
    readonly constructionMethod: "manual-assisted";
    readonly routeDerivation: "checked-facts-resource-search";
    readonly donorAvailability: "paired";
    readonly donorExposure: "full-input";
    readonly replayBytesCopied: false;
    readonly replayInputReadByGenerator: false;
  };
  readonly boundariesOrder: "boundary-order";
  readonly boundaries: readonly KeyPyramidP5ExecutionBoundaryV1[];
  readonly joinsOrder: "subgoal-order";
  readonly joins: readonly {
    readonly subgoalId: StableIdV1;
    readonly entryBoundaryOrder: number;
    readonly stopBoundaryOrder: number;
    readonly state: "exact-same-run";
    readonly entryExactFingerprint: StableIdV1;
    readonly stopExactFingerprint: StableIdV1;
  }[];
  readonly terminal: SolverTerminalResult;
};

function createRuntime(
  source: KeyPyramidRuntimeSource,
  sha256: WebCryptoSha256,
): SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource> {
  const options = {
    sha256,
    adapterRevision: source.runtimeProvenance.adapterRevision,
    engineRevision: source.runtimeProvenance.engineRevision,
    maximumLiveRuns: 1,
    maximumLiveCheckpoints: 1,
  };
  return source.target === "ms"
    ? createTworldMsSolverRuntimeAdapter(options)
    : createTworldLynxSolverRuntimeAdapter(options);
}

function remainingChips(observation: SolverObservation): number {
  return observation.remainingRequirements.find(({ resourceType }) => resourceType === "cc1:icchip")?.count ?? 0;
}

async function captureBoundary(
  runtime: SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource>,
  run: SolverRunHandle,
  boundaryOrder: number,
  boundaryKind: KeyPyramidP5ExecutionBoundaryV1["boundaryKind"],
  subgoalId: StableIdV1 | null,
  sha256: WebCryptoSha256,
): Promise<KeyPyramidP5ExecutionBoundaryV1> {
  const observation = await runtime.observe(run);
  const render = await runtime.projectRender(run, { kind: "full-map" });
  const [observationContent, renderContent] = await Promise.all([
    referenceCanonicalJson(canonicalizeJson(observation), sha256),
    referenceCanonicalJson(canonicalizeJson(render), sha256),
  ]);
  if (
    render.target !== observation.target
    || render.mode !== observation.mode
    || render.boundary.nativeTick !== observation.boundary.nativeTick
    || render.fingerprints.exact !== observation.fingerprints.exact
    || render.fingerprints.semantic !== observation.fingerprints.semantic
  ) {
    throw new Error(`${observation.target} P5 boundary render is not bound to its observation`);
  }
  return {
    boundaryOrder,
    boundaryKind,
    subgoalId,
    nativeTick: observation.boundary.nativeTick,
    coordinate: observation.player.coordinate,
    remainingChips: remainingChips(observation),
    terminalKind: observation.terminal.kind,
    exactFingerprint: observation.fingerprints.exact,
    observationContent,
    renderContent,
    observation,
    render,
  };
}

function expectedStopTick(
  target: KeyPyramidRuntimeSource["target"],
  subgoal: KeyPyramidP5SubgoalV1,
): number {
  if (subgoal.subgoalId === "subgoal:key-pyramid:exit") {
    return target === "ms"
      ? subgoal.lastStepOrder * 4
      : subgoal.lastStepOrder * 4 + 3;
  }
  // The boundary immediately precedes the following scheduled input. Lynx
  // settles on this tick; MS retains three exact idle ticks after movement.
  return subgoal.lastStepOrder * 4 + 3;
}

export function buildKeyPyramidP5Replay(
  route: KeyPyramidP5RouteV1,
): TworldSolverReplayPayload {
  return buildReplayFromTileSteps(route.tileSteps);
}

function buildReplayFromTileSteps(
  tileSteps: KeyPyramidP5RouteV1["tileSteps"],
): TworldSolverReplayPayload {
  const spacing = 4;
  return {
    // This is a replay deadline, not the first terminal-trigger tick. Lynx
    // continues its native endgame settlement after the trigger, so a header
    // deadline equal to 647 would reject an otherwise winning native replay.
    bestTimeTicks: AUTHORED_REPLAY_DEADLINE_TICKS,
    flags: 0,
    randomSlideDirection: 1,
    stepping: 0,
    randomSeed: 0,
    moves: tileSteps.map(({ stepOrder, inputCode }) => ({
      when: stepOrder * spacing,
      dir: inputCode,
    })),
    modifierMasks: [],
  };
}

function assertBoundary(
  boundary: KeyPyramidP5ExecutionBoundaryV1,
  source: KeyPyramidRuntimeSource,
  route: KeyPyramidP5RouteV1,
  subgoal: KeyPyramidP5SubgoalV1 | null,
): void {
  const expectedCoordinate = subgoal === null
    ? route.start
    : route.tileSteps[subgoal.lastStepOrder]!.to;
  if (
    boundary.observation.target !== source.target
    || boundary.observation.mode !== "replay"
    || boundary.coordinate?.x !== expectedCoordinate.x
    || boundary.coordinate.y !== expectedCoordinate.y
    || boundary.coordinate.z !== expectedCoordinate.z
    || (subgoal !== null && boundary.nativeTick !== expectedStopTick(source.target, subgoal))
  ) {
    throw new Error(
      `${source.target} P5 boundary ${boundary.boundaryOrder} drifted: `
      + JSON.stringify({
        actual: {
          coordinate: boundary.coordinate,
          nativeTick: boundary.nativeTick,
          movement: boundary.observation.player.movement,
          replayCursor: boundary.observation.input.replayCursor,
          remainingChips: boundary.remainingChips,
          terminal: boundary.terminalKind,
        },
        expected: {
          coordinate: expectedCoordinate,
          nativeTick: subgoal === null ? -1 : expectedStopTick(source.target, subgoal),
        },
      }),
    );
  }
  if (
    boundary.terminalKind === "running"
    && (
      boundary.observation.player.movement !== "stationary"
      || boundary.observation.player.inputInfluence !== "replay-owned"
    )
  ) {
    throw new Error(`${source.target} P5 boundary ${boundary.boundaryOrder} is not settled`);
  }
}

export async function buildKeyPyramidP5Execution(
  source: KeyPyramidRuntimeSource,
  planning: BoundKeyPyramidP5PlanningBundle,
  sha256 = new WebCryptoSha256(),
): Promise<KeyPyramidP5ExecutionV1> {
  await assertKeyPyramidP5PlanningBundle(planning, sha256);
  const route = planning.route;
  if (
    route.target !== source.target
    || route.level.normalizedGameplayDigest !== source.levelFacts.facts.payload.level.normalizedGameplayDigest
    || route.tileSteps.length !== 162
  ) {
    throw new Error(`${source.target} P5 route is not bound to its runtime source`);
  }
  const replay = buildReplayFromTileSteps(planning.packet.selectedRoute.tileSteps);
  const runtime = createRuntime(source, sha256);
  const run = await runtime.startReplay({ level: source.manualSource, replay });
  const boundaries: KeyPyramidP5ExecutionBoundaryV1[] = [];
  try {
    const initial = await captureBoundary(runtime, run, 0, "initial", null, sha256);
    assertBoundary(initial, source, route, null);
    boundaries.push(initial);
    let nextSubgoalIndex = 0;
    const finalExpectedNativeTick = source.target === "ms"
      ? route.tileSteps.at(-1)!.stepOrder * 4
      : route.tileSteps.at(-1)!.stepOrder * 4 + 3;
    for (let nativeTick = 0; nativeTick <= finalExpectedNativeTick; nativeTick += 1) {
      await runtime.advanceTick(run, { kind: "replay-tick" });
      const subgoal = route.subgoals[nextSubgoalIndex];
      if (subgoal !== undefined && nativeTick === expectedStopTick(source.target, subgoal)) {
        const boundary = await captureBoundary(
          runtime,
          run,
          boundaries.length,
          "subgoal-stop",
          subgoal.subgoalId,
          sha256,
        );
        assertBoundary(boundary, source, route, subgoal);
        boundaries.push(boundary);
        nextSubgoalIndex += 1;
      }
    }
    if (nextSubgoalIndex !== route.subgoals.length) {
      throw new Error(`${source.target} P5 execution missed a subgoal boundary`);
    }
    const terminal = await runtime.terminal(run);
    const expectedExit = route.finalState.coordinate;
    if (
      terminal.kind !== "won"
      || terminal.coordinate?.x !== expectedExit.x
      || terminal.coordinate.y !== expectedExit.y
      || terminal.coordinate.z !== expectedExit.z
      || terminal.nativeTick !== finalExpectedNativeTick
      || boundaries.at(-1)?.terminalKind !== "won"
      || boundaries.at(-1)?.remainingChips !== 0
    ) {
      throw new Error(`${source.target} P5 replay did not win at its reviewed boundary`);
    }
    return {
      executionType: "p5-key-pyramid-continuous-execution",
      executionVersion: 1,
      target: source.target,
      route,
      planning: {
        plan: planning.planReference,
        planContent: planning.content,
        routeContent: planning.routeContent,
        expandedPlanId: planning.packet.expandedPlan.planId,
        decisionSource: planning.packet.selectedRoute.decisionSource,
      },
      replay,
      scheduling: {
        kind: "target-native-settled-tile-steps",
        moveSpacingNativeTicks: 4,
        finalExpectedNativeTick,
        maximumReplayTicks: MAXIMUM_REPLAY_TICKS,
      },
      sourceAudit: {
        constructionMethod: "manual-assisted",
        routeDerivation: "checked-facts-resource-search",
        donorAvailability: "paired",
        donorExposure: "full-input",
        replayBytesCopied: false,
        replayInputReadByGenerator: false,
      },
      boundariesOrder: "boundary-order",
      boundaries,
      joinsOrder: "subgoal-order",
      joins: route.subgoals.map((subgoal, index) => ({
        subgoalId: subgoal.subgoalId,
        entryBoundaryOrder: index,
        stopBoundaryOrder: index + 1,
        state: "exact-same-run",
        entryExactFingerprint: boundaries[index]!.exactFingerprint,
        stopExactFingerprint: boundaries[index + 1]!.exactFingerprint,
      })),
      terminal,
    };
  } finally {
    await runtime.disposeRun(run);
  }
}
