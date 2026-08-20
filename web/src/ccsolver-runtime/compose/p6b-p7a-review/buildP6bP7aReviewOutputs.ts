import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type PlacementIdV1,
  type RulesetTargetV1,
  type SolverCoordinate,
  type SolverObservation,
} from "@tworld/ccsolver/domain";
import type {
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import type {
  ObservationChangeSelectorV1,
  SubgoalContractV1,
  SubgoalObservationPredicateV1,
} from "@tworld/ccsolver/snippets";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { assertTworldSolverSourceEligibility } from "../sourceValidity/assertTworldSolverSourceEligibility";
import {
  TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
} from "../sourceValidity/analyzeTworldSolverSourceScope";
import {
  createTworldLynxSolverRuntimeAdapter,
} from "../runtime/TworldLynxSolverRuntimeAdapter";
import {
  createTworldMsSolverRuntimeAdapter,
} from "../runtime/TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "../runtime/tworldSolverRuntimeSource";
import {
  bindP4bLegacyArtworkHref,
  createP4bLegacyArtworkSheet,
} from "../p4b-dossier/p4bLegacyArtwork";
import {
  buildPhaseAKeyDoorRuntimeSource,
  PHASE_A_RED_KEY_RESOURCE,
  type PhaseAKeyDoorBindingsV1,
  type PhaseAKeyDoorRuntimeSourceV1,
} from "../p7a-tactics/phaseAKeyDoorSource";
import {
  STANDARD_TACTIC_INPUT_CODES,
  evaluateStandardTactic,
  repairStandardTacticSuffix,
  type StandardTacticAdvanceRequestV1,
  type StandardTacticBoundsV1,
  type StandardTacticExhaustionDiagnosticV1,
  type StandardTacticSuffixRepairV1,
  type StandardTacticV1,
  type StandardTacticWitnessV1,
} from "../p7a-tactics/standardTactics";
import { buildP6bPortfolioCanaryComposition } from "./buildP6bPortfolioCanaries";
import { renderPhaseAKeyDoorArtwork } from "./p6bP7aArtwork";
import {
  P6B_P7A_CHECKED_ROOT,
  P6B_P7A_DIST_ROUTE,
  type P6bP7aReviewOutput,
} from "./p6bP7aReviewIo";
import {
  renderP6bP7aReviewPage,
  type P6bP7aReviewPageModel,
  type P6bP7aTargetPageEntry,
} from "./p6bP7aReviewPage";

export const P6B_P7A_CHECKED_OUTPUT_ROOT = P6B_P7A_CHECKED_ROOT;

const encoder = new TextEncoder();
const TACTIC_BOUNDS: StandardTacticBoundsV1 = {
  maximumCandidateBranches: 256,
  maximumAdvanceCalls: 4_096,
  maximumTicksPerBranch: 16,
  maximumFrontierEntries: 1_024,
};
const EXHAUSTION_BOUNDS: StandardTacticBoundsV1 = {
  maximumCandidateBranches: 1,
  maximumAdvanceCalls: 8,
  maximumTicksPerBranch: 1,
  maximumFrontierEntries: 16,
};

function progress(stage: string): void {
  if (process.env.TWORLD_P7A_PROGRESS === "1") process.stderr.write(`[p7a:build] ${stage}\n`);
}

type PhaseRuntime = SolverRuntimePort<TworldSolverManualStartSource, TworldSolverReplayStartSource>;
type JsonRecord = Readonly<Record<string, unknown>>;

export interface P6bP7aReviewBuild {
  readonly checkedOutputs: readonly P6bP7aReviewOutput[];
  readonly distOutputs: readonly P6bP7aReviewOutput[];
  readonly sourceAudit: {
    readonly donorInputReads: 0;
    readonly standardOnly: true;
    readonly expandedTileCount: 0;
    readonly sourceScopePolicy: typeof TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION;
    readonly realEngineTargets: readonly ["ms", "lynx"];
  };
}

type TargetComposition = {
  readonly target: "ms" | "lynx";
  readonly source: PhaseAKeyDoorRuntimeSourceV1;
  readonly sourceScope: ReturnType<typeof assertTworldSolverSourceEligibility>;
  readonly realization: JsonRecord;
  readonly replayCertificate: JsonRecord;
  readonly page: Omit<P6bP7aTargetPageEntry, "mapSvg">;
  readonly routeMarks: readonly {
    readonly decisionOrder: number;
    readonly coordinate: SolverCoordinate;
  }[];
};

type EvaluatedTactic = {
  readonly tactic: StandardTacticV1;
  readonly witness: StandardTacticWitnessV1;
  readonly title: string;
};

function canonical(value: unknown): CanonicalJson {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function json(value: unknown): Uint8Array {
  return encoder.encode(canonical(value));
}

async function canonicalReference(
  value: unknown,
  sha256: WebCryptoSha256,
): Promise<BlobReferenceV1> {
  return referenceCanonicalJson(canonical(value), sha256);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sorted(outputs: readonly P6bP7aReviewOutput[]): readonly P6bP7aReviewOutput[] {
  const paths = new Set<string>();
  for (const output of outputs) {
    if (
      paths.has(output.path)
      || output.path.startsWith("/")
      || output.path.includes("..")
      || output.path.includes("\\")
    ) {
      throw new Error(`P6B/P7A duplicate or unsafe output path: ${output.path}`);
    }
    paths.add(output.path);
  }
  return [...outputs].sort((left, right) => compareText(left.path, right.path));
}

function runtime(target: "ms" | "lynx", sha256: WebCryptoSha256): PhaseRuntime {
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

async function source(
  repositoryRoot: string,
  target: "ms" | "lynx",
  sha256: WebCryptoSha256,
): Promise<PhaseAKeyDoorRuntimeSourceV1> {
  const template = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: target === "ms" ? "intro-ms.dac" : "intro-lynx.dac",
    levelNumber: 1,
    ruleset: target === "ms" ? "MS" : "Lynx",
    randomSeed: 0x1234_5678,
  });
  return buildPhaseAKeyDoorRuntimeSource({ target, template, sha256 });
}

function predicateId(target: RulesetTargetV1, name: string): string {
  return `predicate:p7a:${target}:${name}`;
}

function coordinatePredicate(
  target: RulesetTargetV1,
  name: string,
  coordinate: SolverCoordinate,
): SubgoalObservationPredicateV1 {
  return { predicateId: predicateId(target, name), kind: "player-coordinate", coordinate };
}

function terminalPredicate(
  target: RulesetTargetV1,
  name: string,
  terminalKind: "running" | "won",
  exitPlacementId?: PlacementIdV1,
): SubgoalObservationPredicateV1 {
  if (terminalKind === "won") {
    if (exitPlacementId === undefined) {
      throw new Error(`${target} won predicate requires the exact exit placement`);
    }
    return {
        predicateId: predicateId(target, name),
        kind: "terminal-state",
        terminalKind,
        exitPlacementId,
      };
  }
  return { predicateId: predicateId(target, name), kind: "terminal-state", terminalKind };
}

function placementIdAt(
  observation: SolverObservation,
  coordinate: SolverCoordinate,
  semanticType: string,
): PlacementIdV1 {
  const matches = observation.cells.flatMap((cell) => (
    cell.coordinate.x === coordinate.x
    && cell.coordinate.y === coordinate.y
    && cell.coordinate.z === coordinate.z
      ? cell.elements.filter((element) => (
          element.semanticType === semanticType && element.identity.kind === "placement"
        ))
      : []
  ));
  if (matches.length !== 1 || matches[0]!.identity.kind !== "placement") {
    throw new Error(`P7A expected one ${semanticType} placement at ${coordinate.x},${coordinate.y}`);
  }
  return matches[0]!.identity.placementId;
}

function inventoryPredicate(
  target: RulesetTargetV1,
  name: string,
  count: number,
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, name),
    kind: "inventory-count",
    resourceType: PHASE_A_RED_KEY_RESOURCE,
    comparison: "equals",
    count,
  };
}

function placementPredicate(
  target: RulesetTargetV1,
  name: string,
  placementId: PlacementIdV1,
  present: boolean,
): SubgoalObservationPredicateV1 {
  return { predicateId: predicateId(target, name), kind: "placement-presence", placementId, present };
}

function stationaryPredicate(
  target: RulesetTargetV1,
  name: string,
  actorId: SolverObservation["player"]["actorId"],
): SubgoalObservationPredicateV1 {
  return {
    predicateId: predicateId(target, name),
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
  readonly order: number;
  readonly requires: readonly SubgoalObservationPredicateV1[];
  readonly ensures: readonly SubgoalObservationPredicateV1[];
  readonly invariants: readonly SubgoalObservationPredicateV1[];
  readonly stop: SubgoalObservationPredicateV1;
  readonly mustChange?: readonly ObservationChangeSelectorV1[];
  readonly mayChange?: readonly ObservationChangeSelectorV1[];
  readonly mustNotChange?: readonly ObservationChangeSelectorV1[];
  readonly forbidden?: readonly ObservationChangeSelectorV1[];
  readonly maximumAdvanceTicks?: number;
}): SubgoalContractV1 {
  return {
    contractVersion: 1,
    contractId: `contract:p7a:${input.target}:${input.name}`,
    title: `P7A ${input.name.replaceAll("-", " ")}`,
    description: `Observation-authored standard-only Phase-A ${input.name} tactic contract.`,
    target: input.target,
    planSegment: {
      planId: input.target === "ms" ? "plan:7:0" : "plan:7:1",
      rootId: "root:0",
      startStepOrder: input.order,
      endStepOrder: input.order,
      operatorIds: [`operator:p7a:${input.target}:${input.name}`],
    },
    requires: input.requires,
    ensures: input.ensures,
    invariants: input.invariants,
    stop: input.stop,
    maximumAdvanceTicks: input.maximumAdvanceTicks ?? TACTIC_BOUNDS.maximumTicksPerBranch,
    footprint: {
      mustChange: input.mustChange ?? [],
      mayChange: input.mayChange ?? [],
      mustNotChange: input.mustNotChange ?? [],
    },
    forbiddenObservedChanges: input.forbidden ?? [],
    provenance: {
      derivation: "authored",
      derivationRevision: "ccsolver:p7a-standard-tactic-dossier-v1",
      review: { status: "unreviewed" },
    },
  };
}

function resourceCount(observation: SolverObservation): number {
  return observation.inventory.find(({ resourceType }) => resourceType === PHASE_A_RED_KEY_RESOURCE)?.count ?? 0;
}

function collectTactic(
  target: "ms" | "lynx",
  bindings: PhaseAKeyDoorBindingsV1,
  entry: SolverObservation,
  order: number,
): StandardTacticV1 {
  const running = terminalPredicate(target, "collect-running", "running");
  const entryCount = resourceCount(entry);
  const absent = placementPredicate(target, "key-absent", bindings.keyPlacementId, false);
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
      order,
      requires: [
        coordinatePredicate(target, "collect-entry", entry.player.coordinate!),
        inventoryPredicate(target, "collect-entry-count", entryCount),
        placementPredicate(target, "key-present", bindings.keyPlacementId, true),
        running,
      ],
      ensures: [
        coordinatePredicate(target, "collect-exit", bindings.key),
        inventoryPredicate(target, "collect-exit-count", entryCount + 1),
        absent,
        running,
      ],
      invariants: [running],
      stop: absent,
      mustChange: [
        { kind: "inventory-resource", resourceType: bindings.resourceType },
        { kind: "placement", placementId: bindings.keyPlacementId },
      ],
      mayChange: pathMayChange([bindings.start, { x: 1, y: 0, z: 0 }, bindings.key]),
      mustNotChange: [{ kind: "placement", placementId: bindings.doorPlacementId }],
      forbidden: [{ kind: "terminal" }],
    }),
    command: { commandIdStem: `command:p7a:${target}:collect`, planId: `plan:p7a:${target}` },
  };
}

function unlockTactic(
  target: "ms" | "lynx",
  bindings: PhaseAKeyDoorBindingsV1,
  entry: SolverObservation,
  order: number,
): StandardTacticV1 {
  const running = terminalPredicate(target, "unlock-running", "running");
  const entryCount = resourceCount(entry);
  const absent = placementPredicate(target, "door-absent", bindings.doorPlacementId, false);
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:unlock-red-door`,
    target,
    intent: {
      kind: "unlock",
      goal: {
        kind: "unlock",
        gateId: bindings.doorPlacementId,
        requirement: { kind: "consume-inventory", resourceType: bindings.resourceType, amount: 1 },
      },
    },
    contract: contract({
      target,
      name: "unlock-red-door",
      order,
      requires: [
        coordinatePredicate(target, "unlock-entry", entry.player.coordinate!),
        inventoryPredicate(target, "unlock-entry-count", entryCount),
        placementPredicate(target, "door-present", bindings.doorPlacementId, true),
        running,
      ],
      ensures: [
        coordinatePredicate(target, "unlock-exit", bindings.door),
        inventoryPredicate(target, "unlock-exit-count", entryCount - 1),
        absent,
        running,
      ],
      invariants: [running],
      stop: absent,
      mustChange: [
        { kind: "inventory-resource", resourceType: bindings.resourceType },
        { kind: "placement", placementId: bindings.doorPlacementId },
      ],
      mayChange: pathMayChange([bindings.key, { x: 3, y: 0, z: 0 }, bindings.door]),
      mustNotChange: [{ kind: "placement", placementId: bindings.keyPlacementId }],
      forbidden: [{ kind: "terminal" }],
    }),
    command: { commandIdStem: `command:p7a:${target}:unlock`, planId: `plan:p7a:${target}` },
  };
}

function reachTactic(input: {
  readonly target: "ms" | "lynx";
  readonly entry: SolverObservation;
  readonly destination: SolverCoordinate;
  readonly name: string;
  readonly order: number;
  readonly terminal: boolean;
}): StandardTacticV1 {
  const reached = coordinatePredicate(input.target, `${input.name}-reached`, input.destination);
  const endTerminal = terminalPredicate(
    input.target,
    `${input.name}-${input.terminal ? "won" : "running"}`,
    input.terminal ? "won" : "running",
    input.terminal ? placementIdAt(input.entry, input.destination, "cc1:exit") : undefined,
  );
  const running = terminalPredicate(input.target, `${input.name}-entry-running`, "running");
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${input.target}:${input.name}`,
    target: input.target,
    intent: {
      kind: "reach",
      goal: { kind: "reach", regionId: `region:p7a:${input.name}` },
      destination: input.destination,
    },
    contract: contract({
      target: input.target,
      name: input.name,
      order: input.order,
      requires: [
        coordinatePredicate(input.target, `${input.name}-entry`, input.entry.player.coordinate!),
        running,
      ],
      ensures: [reached, endTerminal],
      invariants: input.terminal ? [] : [running],
      stop: reached,
      mustChange: input.terminal
        ? [{ kind: "player" }, { kind: "terminal" }]
        : [{ kind: "player" }],
      mayChange: pathMayChange([input.entry.player.coordinate!, input.destination])
        .filter(({ kind }) => kind !== "player"),
      forbidden: input.terminal ? [] : [{ kind: "terminal" }],
    }),
    command: {
      commandIdStem: `command:p7a:${input.target}:${input.name}`,
      planId: `plan:p7a:${input.target}`,
    },
  };
}

function waitTactic(
  target: "ms" | "lynx",
  entry: SolverObservation,
  name: string,
  order: number,
): StandardTacticV1 {
  const running = terminalPredicate(target, `${name}-running`, "running");
  const stationary = stationaryPredicate(target, `${name}-stationary`, entry.player.actorId);
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:${name}`,
    target,
    intent: { kind: "wait-until", predicate: stationary },
    contract: contract({
      target,
      name,
      order,
      requires: [coordinatePredicate(target, `${name}-entry`, entry.player.coordinate!), running],
      ensures: [stationary, running],
      invariants: [running],
      stop: stationary,
      mayChange: pathMayChange([entry.player.coordinate!]),
      forbidden: [{ kind: "terminal" }],
    }),
    command: { commandIdStem: `command:p7a:${target}:${name}`, planId: `plan:p7a:${target}` },
  };
}

async function evaluate(
  runtimePort: PhaseRuntime,
  run: SolverRunHandle,
  tactic: StandardTacticV1,
  title: string,
): Promise<EvaluatedTactic> {
  const result = await evaluateStandardTactic({
    runtime: runtimePort,
    entryRun: run,
    tactic,
    bounds: TACTIC_BOUNDS,
  });
  if (result.status !== "succeeded") {
    throw new Error(`${tactic.target} ${tactic.tacticId} exhausted: ${canonical(result.diagnostic)}`);
  }
  return { tactic, witness: result.witness, title };
}

async function applyWitness(
  runtimePort: PhaseRuntime,
  run: SolverRunHandle,
  witness: StandardTacticWitnessV1,
): Promise<SolverObservation> {
  const before = await runtimePort.observe(run);
  if (before.fingerprints.exact !== witness.entryExactFingerprint) {
    throw new Error(`${witness.target} tactic entry fingerprint drifted before commit`);
  }
  for (const decision of witness.selectedDecisions) await runtimePort.advanceTick(run, decision.request);
  const after = await runtimePort.observe(run);
  if (
    after.fingerprints.exact !== witness.exitExactFingerprint
    || after.boundary.nativeTick !== witness.exitNativeTick
  ) {
    throw new Error(`${witness.target} tactic witness drifted during primary commit`);
  }
  return after;
}

function compactObservation(observation: SolverObservation) {
  return {
    contentAuthority: observation.fingerprints.exact,
    semanticFingerprint: observation.fingerprints.semantic,
    nativeTick: observation.boundary.nativeTick,
    player: observation.player,
    inventory: observation.inventory,
    remainingRequirements: observation.remainingRequirements,
    terminal: observation.terminal,
  };
}

function gameplayProjection(observation: SolverObservation) {
  return {
    target: observation.target,
    level: observation.level,
    geometry: observation.geometry,
    cells: observation.cells,
    player: observation.player,
    actors: observation.actors,
    inventory: observation.inventory,
    remainingRequirements: observation.remainingRequirements,
    devices: observation.devices,
    terminal: observation.terminal,
  };
}

function compactWitness(witness: StandardTacticWitnessV1, witnessContent: BlobReferenceV1) {
  return {
    witnessContent,
    entry: compactObservation(witness.entryObservation),
    exit: compactObservation(witness.exitObservation),
    selectedDecisions: witness.selectedDecisions,
    contractPassed: true,
    statistics: witness.statistics,
  };
}

function tacticKind(tactic: StandardTacticV1): "Reach" | "Collect" | "Unlock" | "WaitUntil" {
  switch (tactic.intent.kind) {
    case "reach": return "Reach";
    case "collect": return "Collect";
    case "unlock": return "Unlock";
    case "wait-until": return "WaitUntil";
  }
}

function exhaustionTactic(
  target: "ms" | "lynx",
  entry: SolverObservation,
): StandardTacticV1 {
  const destination = { x: 31, y: 31, z: 0 } as const;
  const reached = coordinatePredicate(target, "bounded-unreachable", destination);
  const running = terminalPredicate(target, "bounded-running", "running");
  return {
    tacticVersion: 1,
    tacticId: `tactic:p7a:${target}:bounded-exhaustion`,
    target,
    intent: {
      kind: "reach",
      goal: { kind: "reach", regionId: "region:p7a:bounded-exhaustion" },
      destination,
    },
    contract: contract({
      target,
      name: "bounded-exhaustion",
      order: 99,
      requires: [coordinatePredicate(target, "bounded-entry", entry.player.coordinate!), running],
      ensures: [reached, running],
      invariants: [running],
      stop: reached,
      mustChange: [{ kind: "player" }],
      mayChange: pathMayChange([entry.player.coordinate!, { x: 1, y: 0, z: 0 }])
        .filter(({ kind }) => kind !== "player"),
      forbidden: [{ kind: "terminal" }],
      maximumAdvanceTicks: 1,
    }),
    command: { commandIdStem: `command:p7a:${target}:exhaust`, planId: `plan:p7a:${target}` },
  };
}

async function deterministicExhaustion(
  runtimePort: PhaseRuntime,
  run: SolverRunHandle,
  target: "ms" | "lynx",
  entry: SolverObservation,
): Promise<StandardTacticExhaustionDiagnosticV1> {
  const tactic = exhaustionTactic(target, entry);
  const first = await evaluateStandardTactic({
    runtime: runtimePort,
    entryRun: run,
    tactic,
    bounds: EXHAUSTION_BOUNDS,
  });
  const repeated = await evaluateStandardTactic({
    runtime: runtimePort,
    entryRun: run,
    tactic,
    bounds: EXHAUSTION_BOUNDS,
  });
  if (
    first.status !== "exhausted"
    || repeated.status !== "exhausted"
    || canonical(first.diagnostic) !== canonical(repeated.diagnostic)
  ) {
    throw new Error(`${target} bounded exhaustion was not repeated exactly`);
  }
  return first.diagnostic;
}

function injectedCollectSequence(
  witness: StandardTacticWitnessV1,
): { readonly order: number; readonly decisions: readonly StandardTacticAdvanceRequestV1[] } {
  const order = witness.selectedDecisions
    .map(({ request }) => request.inputCode)
    .lastIndexOf(GAME_INPUT_CODES.east);
  if (order <= 0) throw new Error("P7A repair needs a nonempty prefix before the final east decision");
  return {
    order,
    decisions: witness.selectedDecisions.map(({ request }, index) => (
      index === order ? { ...request, inputCode: GAME_INPUT_CODES.west } : request
    )),
  };
}

async function freshCertificate(input: {
  readonly runtime: PhaseRuntime;
  readonly source: PhaseAKeyDoorRuntimeSourceV1;
  readonly target: "ms" | "lynx";
  readonly decisions: readonly StandardTacticAdvanceRequestV1[];
  readonly selectedTerminal: SolverObservation;
  readonly sourceIdentity: {
    readonly datContent: BlobReferenceV1;
    readonly levelFactsContent: BlobReferenceV1;
  };
  readonly selectedDecisionSequenceContent: BlobReferenceV1;
  readonly tacticRealizationContent: BlobReferenceV1;
  readonly sha256: WebCryptoSha256;
}) {
  const manual = await input.runtime.startManual(input.source.source);
  let manualEnd: SolverObservation;
  try {
    for (const request of input.decisions) await input.runtime.advanceTick(manual, request);
    manualEnd = await input.runtime.observe(manual);
  } finally {
    await input.runtime.disposeRun(manual);
  }
  if (canonical(manualEnd) !== canonical(input.selectedTerminal)) {
    throw new Error(`${input.target} fresh manual certification did not reproduce the exact terminal observation`);
  }
  const replayPayload: TworldSolverReplayStartSource["replay"] = {
    bestTimeTicks: Math.max(64, input.selectedTerminal.boundary.nativeTick + 32),
    flags: 0,
    randomSlideDirection: GAME_INPUT_CODES.north,
    stepping: 0,
    randomSeed: 0,
    moves: input.decisions.flatMap((request, index) => (
      request.inputCode === GAME_INPUT_CODES.none
        ? []
        : [{ when: index, dir: request.inputCode }]
    )),
    modifierMasks: [],
  };
  const replay = await input.runtime.startReplay({ level: input.source.source, replay: replayPayload });
  let replayEnd: SolverObservation;
  try {
    for (let tick = 0; tick < input.decisions.length; tick += 1) {
      await input.runtime.advanceTick(replay, { kind: "replay-tick" });
    }
    replayEnd = await input.runtime.observe(replay);
  } finally {
    await input.runtime.disposeRun(replay);
  }
  if (
    replayEnd.terminal.kind !== "won"
    || replayEnd.boundary.nativeTick !== input.selectedTerminal.boundary.nativeTick
    || canonical(gameplayProjection(replayEnd)) !== canonical(gameplayProjection(input.selectedTerminal))
  ) {
    throw new Error(`${input.target} replay-owned certification did not reproduce gameplay terminal state`);
  }
  return {
    certificateType: "p7a-fresh-runtime-replay-certificate" as const,
    certificateVersion: 1 as const,
    caseId: "phase-a-key-door" as const,
    target: input.target,
    authority: {
      kind: "fresh-runtime",
      nativeOracleParityClaimed: false,
      replayConstructedFromSelectedSemanticDecisions: true,
      donorInputRead: false,
    },
    bindings: {
      source: input.sourceIdentity,
      selectedDecisionSequence: input.selectedDecisionSequenceContent,
      tacticRealization: input.tacticRealizationContent,
    },
    selectedTerminal: compactObservation(input.selectedTerminal),
    manual: {
      exactTerminalMatch: true,
      observationContent: await canonicalReference(manualEnd, input.sha256),
      terminal: manualEnd.terminal,
    },
    replayOwned: {
      gameplayTerminalMatch: true,
      nativeTickMatch: true,
      nativeTick: replayEnd.boundary.nativeTick,
      exactFingerprintComparableAcrossModes: false,
      gameplayContent: await canonicalReference(gameplayProjection(replayEnd), input.sha256),
      replay: replayPayload,
      terminal: replayEnd.terminal,
    },
  };
}

async function composeTarget(
  repositoryRoot: string,
  target: "ms" | "lynx",
  sha256: WebCryptoSha256,
): Promise<TargetComposition> {
  progress(`${target} source`);
  const prepared = await source(repositoryRoot, target, sha256);
  const sourceScope = assertTworldSolverSourceEligibility({ layerData: prepared.source.loaded.layerData });
  if (sourceScope.sourceScope.status !== "eligible" || sourceScope.sourceScope.issues.length !== 0) {
    throw new Error(`${target} Phase-A source is outside standard CCSolver scope`);
  }
  const runtimePort = runtime(target, sha256);
  const primary = await runtimePort.startManual(prepared.source);
  try {
    const initial = await runtimePort.observe(primary);
    const checkpoint = await runtimePort.captureCheckpoint(primary);
    let restored: SolverRunHandle | null = null;
    try {
      restored = await runtimePort.restoreCheckpoint(checkpoint.handle);
      const restoredObservation = await runtimePort.observe(restored);
      if (canonical(restoredObservation) !== canonical(initial)) {
        throw new Error(`${target} exact checkpoint restore drifted`);
      }
    } finally {
      if (restored !== null) await runtimePort.disposeRun(restored);
      await runtimePort.disposeCheckpoint(checkpoint.handle);
    }

    const exhaustion = await deterministicExhaustion(runtimePort, primary, target, initial);
    progress(`${target} exhaustion`);
    if ((await runtimePort.observe(primary)).fingerprints.exact !== initial.fingerprints.exact) {
      throw new Error(`${target} tactic evaluation mutated its caller-owned entry`);
    }

    const tactics: EvaluatedTactic[] = [];
    const approachKey = await evaluate(
      runtimePort,
      primary,
      reachTactic({
        target,
        entry: initial,
        destination: { x: 1, y: 0, z: 0 },
        name: "reach-key-approach",
        order: 0,
        terminal: false,
      }),
      "Approach the red key",
    );
    tactics.push(approachKey);
    let observation = await applyWitness(runtimePort, primary, approachKey.witness);
    progress(`${target} key approach`);
    const collect = await evaluate(
      runtimePort,
      primary,
      collectTactic(target, prepared.bindings, observation, 1),
      "Collect the red key",
    );
    progress(`${target} collect evaluated`);
    const injected = injectedCollectSequence(collect.witness);
    const repair = await repairStandardTacticSuffix({
      runtime: runtimePort,
      entryRun: primary,
      tactic: collect.tactic,
      originalWitness: collect.witness,
      injectedDecisions: injected.decisions,
      injectedDecisionOrder: injected.order,
      bounds: TACTIC_BOUNDS,
    });
    if (repair.status !== "repaired" || repair.retainedPrefix.length === 0) {
      throw new Error(`${target} suffix-only repair exhausted`);
    }
    progress(`${target} collect repaired`);
    tactics.push({ ...collect, witness: repair.witness });
    observation = await applyWitness(runtimePort, primary, repair.witness);

    const waitKey = await evaluate(
      runtimePort,
      primary,
      waitTactic(target, observation, "wait-after-key", 2),
      "Settle after collecting the key",
    );
    progress(`${target} wait key`);
    tactics.push(waitKey);
    observation = await applyWitness(runtimePort, primary, waitKey.witness);

    const approachDoor = await evaluate(
      runtimePort,
      primary,
      reachTactic({
        target,
        entry: observation,
        destination: { x: 3, y: 0, z: 0 },
        name: "reach-door-approach",
        order: 3,
        terminal: false,
      }),
      "Approach the red door",
    );
    tactics.push(approachDoor);
    observation = await applyWitness(runtimePort, primary, approachDoor.witness);
    progress(`${target} door approach`);

    const unlock = await evaluate(
      runtimePort,
      primary,
      unlockTactic(target, prepared.bindings, observation, 4),
      "Unlock the red door",
    );
    progress(`${target} unlock`);
    tactics.push(unlock);
    observation = await applyWitness(runtimePort, primary, unlock.witness);

    const reach = await evaluate(
      runtimePort,
      primary,
      reachTactic({
        target,
        entry: observation,
        destination: prepared.bindings.afterDoor,
        name: "reach-after-door",
        order: 5,
        terminal: false,
      }),
      "Step beyond the opened door",
    );
    progress(`${target} reach after door`);
    tactics.push(reach);
    observation = await applyWitness(runtimePort, primary, reach.witness);

    const waitDoor = await evaluate(
      runtimePort,
      primary,
      waitTactic(target, observation, "wait-after-door", 6),
      "Settle beyond the door",
    );
    progress(`${target} wait door`);
    tactics.push(waitDoor);
    observation = await applyWitness(runtimePort, primary, waitDoor.witness);

    const exit = await evaluate(
      runtimePort,
      primary,
      reachTactic({
        target,
        entry: observation,
        destination: prepared.bindings.exit,
        name: "reach-exit",
        order: 7,
        terminal: true,
      }),
      "Reach the exit",
    );
    progress(`${target} exit`);
    tactics.push(exit);
    const terminal = await applyWitness(runtimePort, primary, exit.witness);
    if (terminal.terminal.kind !== "won" || terminal.player.coordinate?.x !== 6) {
      throw new Error(`${target} semantic tactic chain did not win Phase-A`);
    }

    const decisions = tactics.flatMap(({ witness }) => witness.selectedDecisions.map(({ request }) => request));
    const routeDecisions = tactics.flatMap(({ witness }) => (
      witness.selectedDecisions.filter(({ request }) => request.inputCode !== GAME_INPUT_CODES.none)
    ));
    const visitedTactics = [approachKey, { ...collect, witness: repair.witness }, approachDoor, unlock, reach, exit];
    const routeMarks = visitedTactics.map(({ witness }, decisionOrder) => {
      const coordinate = witness.exitObservation.player.coordinate;
      if (coordinate === null) {
        throw new Error(`${target} semantic route visit ${decisionOrder} lacks a player coordinate`);
      }
      return { decisionOrder, coordinate };
    });
    const expectedVisits = [
      { x: 1, y: 0, z: 0 },
      prepared.bindings.key,
      { x: 3, y: 0, z: 0 },
      prepared.bindings.door,
      prepared.bindings.afterDoor,
      prepared.bindings.exit,
    ];
    if (canonical(routeMarks.map(({ coordinate }) => coordinate)) !== canonical(expectedVisits)) {
      throw new Error(`${target} semantic tactic visits drifted from the observed Phase-A route`);
    }
    const tacticArtifacts = await Promise.all(tactics.map(async ({ tactic, witness, title }, order) => ({
      order,
      title,
      intent: tactic.intent,
      tacticContent: await canonicalReference(tactic, sha256),
      witness: compactWitness(witness, await canonicalReference(witness, sha256)),
    })));
    const observedMaximums = {
      attemptedBranches: Math.max(...tactics.map(({ witness }) => witness.statistics.attemptedBranches)),
      advanceCalls: Math.max(...tactics.map(({ witness }) => witness.statistics.advanceCalls)),
      selectedTicks: Math.max(...tactics.map(({ witness }) => witness.statistics.selectedTicks)),
      frontierPeak: Math.max(...tactics.map(({ witness }) => witness.statistics.frontierPeak)),
    };
    if (
      observedMaximums.attemptedBranches > TACTIC_BOUNDS.maximumCandidateBranches
      || observedMaximums.advanceCalls > TACTIC_BOUNDS.maximumAdvanceCalls
      || observedMaximums.selectedTicks > TACTIC_BOUNDS.maximumTicksPerBranch
      || observedMaximums.frontierPeak > TACTIC_BOUNDS.maximumFrontierEntries
    ) {
      throw new Error(`${target} observed tactic statistics exceeded their published bounds`);
    }
    const realization = {
      realizationType: "p7a-standard-tactic-realization" as const,
      realizationVersion: 1 as const,
      caseId: "phase-a-key-door" as const,
      target,
      source: {
        definition: prepared.definition,
        datContent: await referenceSourceBytes(prepared.datBytes, sha256),
        levelFactsContent: prepared.source.levelFactsContent,
        sourceScope: sourceScope.sourceScope,
        legacyValidity: sourceScope.legacyValidity,
      },
      construction: {
        semanticIntentDriven: true,
        currentObservationUsedAtEveryTacticEntry: true,
        fullInputStreamProvided: false,
        inputVocabulary: STANDARD_TACTIC_INPUT_CODES,
        donorInputRead: false,
      },
      evaluationBounds: {
        configured: TACTIC_BOUNDS,
        observedMaximums,
      },
      checkpointRestore: {
        status: "exact" as const,
        entryExactFingerprint: initial.fingerprints.exact,
      },
      boundedExhaustion: {
        bounds: EXHAUSTION_BOUNDS,
        ...exhaustion,
        repeatedExactly: true as const,
      },
      suffixRepair: {
        status: repair.status,
        join: repair.join,
        originalWitnessContent: await canonicalReference(collect.witness, sha256),
        repairContent: await canonicalReference(repair, sha256),
        injectedDecisionOrder: repair.injectedDecisionOrder,
        injectedInputCode: injected.decisions[injected.order]!.inputCode,
        injectedFailurePredicateId: repair.injectedFailure.firstUnmetPredicateId,
        retainedPrefixCount: repair.retainedPrefix.length,
        replacedSuffixCount: repair.replacedSuffix.length,
        repairedSuffixCount: repair.repairedSuffix.length,
        compiledDecisionCount: repair.compiledDecisions.length,
      },
      tacticsOrder: "semantic-plan-order" as const,
      tactics: tacticArtifacts,
      compiledDecisionCount: decisions.length,
      routeDecisionCount: routeDecisions.length,
      routeVisitCount: routeMarks.length,
      routeVisits: routeMarks.map(({ decisionOrder, coordinate }) => ({
        visitOrder: decisionOrder,
        coordinate,
      })),
      terminal: terminal.terminal,
      terminalObservation: compactObservation(terminal),
    };
    const replayCertificate = await freshCertificate({
      runtime: runtimePort,
      source: prepared,
      target,
      decisions,
      selectedTerminal: terminal,
      sourceIdentity: {
        datContent: realization.source.datContent,
        levelFactsContent: realization.source.levelFactsContent,
      },
      selectedDecisionSequenceContent: await canonicalReference(decisions, sha256),
      tacticRealizationContent: await canonicalReference(realization, sha256),
      sha256,
    });
    progress(`${target} certified ${canonical(observedMaximums)}`);
    const pageTactics = tactics.map(({ tactic, witness, title }, order) => ({
      order,
      kind: tacticKind(tactic),
      title,
      decisionCount: witness.selectedDecisions.filter(({ request }) => (
        request.inputCode !== GAME_INPUT_CODES.none
      )).length,
      nativeTicks: witness.exitNativeTick - witness.entryNativeTick,
      result: "succeeded" as const,
    }));
    return {
      target,
      source: prepared,
      sourceScope,
      realization,
      replayCertificate,
      routeMarks,
      page: {
        target,
        label: target === "ms" ? "MS" : "Lynx",
        tactics: pageTactics,
        totalDecisions: routeDecisions.length,
        totalNativeTicks: terminal.boundary.nativeTick + 1,
        terminalNativeTick: terminal.boundary.nativeTick,
        replayCertified: true,
        checkpointRestoreVerified: true,
        failureRepair: {
          injectedAtDecision: repair.injectedDecisionOrder,
          injectedDirection: "west",
          failure: "The complete injected sequence no longer collected the red key.",
          retainedPrefixDecisions: repair.retainedPrefix.length,
          replacedSuffixDecisions: repair.replacedSuffix.length,
          repairedSuffixDecisions: repair.repairedSuffix.length,
          result: "won",
        },
        exhaustion: {
          code: exhaustion.code,
          attemptedBranches: exhaustion.attemptedBranches,
          advanceCalls: exhaustion.advanceCalls,
          repeatedExactly: true,
          firstUnmet: "The distant coordinate remained unmet inside the one-branch, one-tick bound.",
        },
      },
    };
  } finally {
    await runtimePort.disposeRun(primary);
  }
}

function markdown(targets: readonly TargetComposition[], canaryCount: number): string {
  return [
    "# Phase-A P6B/P7A standard tactic realization",
    "",
    "## Result",
    "",
    "A semantic controller solved `P.k.D.E` through both real engine adapters without receiving a complete input stream. Each selected witness was committed only after exact checkpoint-backed evaluation.",
    "",
    "| Target | Semantic tactics | Route decisions | Native ticks | Fresh manual | Replay-owned |",
    "|---|---:|---:|---:|---|---|",
    ...targets.map(({ target, realization }) => {
      const value = realization as any;
      return `| ${target === "ms" ? "MS" : "Lynx"} | ${value.tactics.length} | ${value.routeDecisionCount} | ${value.terminalObservation.nativeTick + 1} | exact | gameplay + terminal |`;
    }),
    "",
    "## Evidence boundary",
    "",
    `The bundle contains ${canaryCount} bounded P6B classification proposals. None is promoted to proof. The executable P7A fixture uses only standard CC1 elements; both target source-scope reports contain zero expanded-tile issues. Donor input was unavailable and never read. Replay-owned certification is fresh-runtime gameplay equivalence, not native C oracle parity or cross-mode exact-fingerprint equality.`,
    "",
    "The injected failure changes exactly one decision in a complete original-length sequence, retains a nonempty prefix, and replans only the suffix. A separate impossible-distance attempt repeats the same bounded exhaustion diagnostic exactly.",
    "",
  ].join("\n");
}

async function fileReferences(
  outputs: readonly P6bP7aReviewOutput[],
  sha256: WebCryptoSha256,
) {
  return Promise.all(outputs.map(async (output) => ({
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(output.content, sha256),
  })));
}

export async function buildP6bP7aReviewOutputs(
  repositoryRoot: string,
): Promise<P6bP7aReviewBuild> {
  const sha256 = new WebCryptoSha256();
  const portfolioComposition = await buildP6bPortfolioCanaryComposition(repositoryRoot);
  const portfolio = portfolioComposition.suite;
  const [ms, lynx] = await Promise.all([
    composeTarget(repositoryRoot, "ms", sha256),
    composeTarget(repositoryRoot, "lynx", sha256),
  ]);
  const targets = [ms, lynx] as const;
  const artwork = await Promise.all((["ms", "lynx"] as const).map(async (target) => {
    const sourcePath = target === "ms" ? "res/tiles.bmp" : "res/atiles.bmp";
    const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, sourcePath)));
    const sheet = createP4bLegacyArtworkSheet({ target, sourcePath, bytes });
    return {
      target,
      sourcePath,
      sourceContent: await referenceSourceBytes(bytes, sha256),
      sheet,
    };
  }));
  const pageTargets = targets.map((target) => {
    const sheet = artwork.find(({ target: candidate }) => candidate === target.target)!.sheet;
    return {
      ...target.page,
      mapSvg: renderPhaseAKeyDoorArtwork({
        target: target.target,
        artwork: bindP4bLegacyArtworkHref(sheet, `assets/standard-artwork-${target.target}.png`),
        routeMarks: target.routeMarks,
      }),
    };
  }) as unknown as P6bP7aReviewPageModel["targets"];
  const pageModel: P6bP7aReviewPageModel = {
    title: "A semantic plan, realized twice",
    fixtureTitle: "Phase-A key-and-door corridor",
    fixtureRows: ["P.k.D.E"],
    canaries: portfolio.canaries.map((canary) => ({
      title: canary.case.title,
      relationship: canary.expectedRelationship,
      confidence: canary.confidence.level,
      source: canary.case.kind,
      reviewStatus: canary.reviewState.status === "reviewed" ? "reviewed" : "unreviewed",
      unresolvedGaps: canary.unresolvedGaps.map(({ description }) => description),
    })),
    targets: pageTargets,
  };
  const reviewHtml = renderP6bP7aReviewPage(pageModel);
  if (/sha256:|placement:sha256:|actor:sha256:|\/Users\//u.test(reviewHtml)) {
    throw new Error("P6B/P7A human review surface leaked a machine identity or local path");
  }
  const fixture = {
    fixtureType: "p6b-p7a-standard-source-receipts" as const,
    fixtureVersion: 1 as const,
    caseId: "phase-a-key-door" as const,
    definition: ms.source.definition,
    standardOnly: true,
    expandedTiles: "excluded" as const,
    donorInputRead: false,
    sourceScopePolicy: TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
    targets: targets.map((target) => ({
      target: target.target,
      source: target.realization.source,
      sourceScope: target.sourceScope.sourceScope,
      legacyValidity: target.sourceScope.legacyValidity,
    })),
    portfolioSourceEligibilityReceipts: portfolioComposition.evidencePayloads.filter((entry) => (
      entry.evidenceKind === "source-eligibility"
    )),
    portfolioSemanticRejoinReceipts: portfolioComposition.evidencePayloads.filter((entry) => (
      entry.evidenceKind === "semantic-rejoin"
    )),
    presentationArtwork: artwork.map(({ target, sourcePath, sourceContent, sheet }) => ({
      target,
      sourcePath,
      sourceContent,
      publishedPath: `assets/standard-artwork-${target}.png`,
      expandedArtworkIncluded: sheet.expandedArtworkIncluded,
    })),
  };
  const root = P6B_P7A_CHECKED_OUTPUT_ROOT;
  const payloads: P6bP7aReviewOutput[] = [
    ...artwork.map(({ target, sheet }) => ({
      path: `${root}/assets/standard-artwork-${target}.png`,
      mediaType: "image/png" as const,
      content: sheet.pngBytes,
    })),
    { path: `${root}/fixture.json`, mediaType: "application/json", content: json(fixture) },
    ...targets.flatMap((target) => ([
      {
        path: `${root}/${target.target}/replay-certificate.json`,
        mediaType: "application/json" as const,
        content: json(target.replayCertificate),
      },
      {
        path: `${root}/${target.target}/tactic-realization.json`,
        mediaType: "application/json" as const,
        content: json(target.realization),
      },
    ])),
    { path: `${root}/portfolio-canaries.json`, mediaType: "application/json", content: json(portfolio) },
    { path: `${root}/review.html`, mediaType: "text/html", content: encoder.encode(reviewHtml) },
    { path: `${root}/review.md`, mediaType: "text/markdown", content: encoder.encode(markdown(targets, portfolio.canaries.length)) },
  ];
  const files = await fileReferences(sorted(payloads), sha256);
  const manifest = {
    manifestType: "p6b-p7a-standard-tactic-review-manifest" as const,
    manifestVersion: 1 as const,
    caseId: "phase-a-key-door" as const,
    filesOrder: "path" as const,
    files,
    proof: {
      standardOnly: true,
      expandedTiles: "excluded" as const,
      sourceScopePolicy: TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
      sourceEligibilityReceipts: portfolio.canaries.length,
      portfolioClaims: "proposal-not-proven" as const,
      realEngineEvaluation: true,
      checkpointRestore: "exact" as const,
      replayCertification: "fresh-runtime" as const,
      donorInputRead: false,
      nativeOracleParityClaimed: false,
    },
  };
  const checkedOutputs = sorted([
    ...payloads,
    { path: `${root}/manifest.json`, mediaType: "application/json", content: json(manifest) },
  ]);
  const distOutputs = checkedOutputs.map((output) => {
    const suffix = output.path.slice(`${root}/`.length);
    return {
      ...output,
      path: `${P6B_P7A_DIST_ROUTE}/${suffix === "review.html" ? "index.html" : suffix}`,
    };
  }).sort((left, right) => compareText(left.path, right.path));
  return {
    checkedOutputs,
    distOutputs,
    sourceAudit: {
      donorInputReads: 0,
      standardOnly: true,
      expandedTileCount: 0,
      sourceScopePolicy: TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
      realEngineTargets: ["ms", "lynx"],
    },
  };
}
