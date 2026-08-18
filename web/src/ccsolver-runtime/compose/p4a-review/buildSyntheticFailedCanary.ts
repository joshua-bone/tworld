import { createHash } from "node:crypto";
import type {
  SolverObservation,
  SolverObservedElement,
  SolverRenderProjection,
  SolverRenderRegionRequest,
  SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import type { ExpandedPlanPreviewV1 } from "@tworld/ccsolver/plan";
import type {
  SolverCheckpoint,
  SolverCheckpointHandle,
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import {
  createContextualWitnessExecutor,
  type ContextualWitnessResultV1,
  type SubgoalContractV1,
} from "@tworld/ccsolver/snippets";

const PLAYER_ID = `actor:sha256:${"1".repeat(64)}` as const;
const PLAYER_PLACEMENT_ID = `placement:sha256:${"2".repeat(64)}` as const;
const RED_KEY_PLACEMENT_ID = `placement:sha256:${"3".repeat(64)}` as const;

type ExactPlacementId = `placement:sha256:${string}`;

export const SYNTHETIC_FAILED_PREDICATE_ID =
  "predicate:synthetic:red-key-inventory-one" as const;

const LEVEL = {
  occurrenceId: "synthetic:p4a:standard-failed-red-key",
  normalizationProfile: "synthetic-p4a-standard-v1",
  normalizedGameplayDigest: `sha256:${"6".repeat(64)}` as const,
};

const LEVEL_FACTS = {
  protocolVersion: 1 as const,
  artifactType: "level-facts" as const,
  schemaVersion: 1 as const,
  digest: `sha256:${"7".repeat(64)}` as const,
};

const PROVENANCE = {
  adapterId: "synthetic-p4a-fake-runtime-port",
  adapterRevision: "ccsolver:synthetic-p4a-fake-runtime-port:v1",
  engineId: "synthetic-standard-canary",
  engineRevision: "ccsolver:synthetic-standard-canary:v1",
} as const;

const VIEWPORT: SolverRenderRegionRequest = {
  kind: "box",
  minimum: { x: 0, y: 0, z: 0 },
  maximum: { x: 4, y: 2, z: 0 },
};

type SyntheticSource = {
  readonly seed: 0;
};

type SyntheticState = {
  readonly tick: number;
  readonly lastInput: number | null;
  readonly chipsRemaining: 1 | 2;
};

type SyntheticExpectedScene = {
  readonly region: SolverRenderProjection["region"];
  readonly cellsOrder: "z-y-x";
  readonly cells: SolverRenderProjection["cells"];
};

export type BuiltSyntheticFailedCanary = {
  readonly witness: ContextualWitnessResultV1;
  readonly expectedScene: SyntheticExpectedScene;
};

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

const sha256Bytes = (value: Uint8Array): Uint8Array => (
  new Uint8Array(createHash("sha256").update(value).digest())
);

const sha256Text = (value: string): `sha256:${string}` => (
  `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`
);

function exactFingerprint(state: SyntheticState): `sha256:${string}` {
  return sha256Text(
    `synthetic-p4a:${state.tick}:1:1:${state.chipsRemaining}:${state.lastInput ?? "none"}`,
  );
}

function semanticFingerprint(state: SyntheticState): `sha256:${string}` {
  return sha256Text(`synthetic-p4a-semantic:${state.tick}:1:1:${state.chipsRemaining}`);
}

function cellPlacementId(x: number, y: number): ExactPlacementId {
  return `placement:${sha256Text(`synthetic-p4a-cell:${x}:${y}`)}`;
}

function terrainElement(placementId: ExactPlacementId, wall: boolean) {
  return {
    identity: { kind: "placement" as const, placementId },
    stratum: "terrain" as const,
    semanticType: wall ? "cc1:wall" as const : "cc1:floor" as const,
    facing: null,
    state: null,
  };
}

function playerElement() {
  return {
    identity: { kind: "actor" as const, actorId: PLAYER_ID },
    stratum: "actor" as const,
    semanticType: "cc1:chip" as const,
    facing: "east" as const,
    state: "stationary" as const,
  };
}

function redKeyElement() {
  return {
    identity: { kind: "placement" as const, placementId: RED_KEY_PLACEMENT_ID },
    stratum: "pickup" as const,
    semanticType: "cc1:key-red" as const,
    facing: null,
    state: null,
  };
}

function observeState(state: SyntheticState): SolverObservation {
  const exact = exactFingerprint(state);
  const cells = Array.from({ length: 15 }, (_, cellOrdinal) => {
    const x = cellOrdinal % 5;
    const y = Math.floor(cellOrdinal / 5);
    const isWall = x === 0 || x === 4 || y === 0 || y === 2;
    const elements: SolverObservedElement[] = [terrainElement(cellPlacementId(x, y), isWall)];
    if (x === 2 && y === 1) elements.push(redKeyElement());
    if (x === 1 && y === 1) elements.push(playerElement());
    return {
      cellOrdinal,
      coordinate: { x, y, z: 0 },
      elementsOrder: "stratum-then-identity" as const,
      elements,
    };
  });
  return {
    observationVersion: 1,
    target: "ms",
    mode: "manual",
    level: LEVEL,
    levelFacts: LEVEL_FACTS,
    provenance: PROVENANCE,
    boundary: { nativeTick: state.tick },
    geometry: { width: 5, height: 3, depth: 1 },
    timing: {
      currentTime: state.tick,
      timeOffset: 0,
      secondsPlayed: Math.max(0, state.tick),
      timeLimit: 0,
      remainingNativeTicks: null,
    },
    input: {
      lastPolledInputCode: state.lastInput,
      lastAppliedInputCode: state.lastInput,
      replayCursor: null,
      replayMoveCount: null,
      replayBestTimeTicks: null,
    },
    randomness: {
      stepping: 0,
      initialRandomSlideDirection: "north",
      nativeStateFingerprintsOrder: "state-id",
      nativeStateFingerprints: [{
        stateId: "synthetic:fixed-rng",
        fingerprint: `sha256:${"8".repeat(64)}`,
      }],
    },
    cellsOrder: "z-y-x",
    cells,
    player: {
      actorId: PLAYER_ID,
      identityProvenance: "initial-placement",
      sourcePlacementId: PLAYER_PLACEMENT_ID,
      semanticType: "cc1:chip",
      coordinate: { x: 1, y: 1, z: 0 },
      facing: "east",
      lifecycle: "active",
      movement: "stationary",
      control: "available",
      inputInfluence: "eligible",
    },
    actorsOrder: "observation-order",
    actors: [],
    inventoryOrder: "runtime-slot-order",
    inventory: [],
    remainingRequirementsOrder: "resource-type",
    remainingRequirements: [{ resourceType: "cc1:icchip", count: state.chipsRemaining }],
    devicesOrder: "placement-id",
    devices: [],
    fingerprints: {
      exact,
      continuation: null,
      semantic: semanticFingerprint(state),
    },
    terminal: { kind: "running" },
  };
}

function projectState(
  state: SyntheticState,
  request: SolverRenderRegionRequest,
): SolverRenderProjection {
  const observation = observeState(state);
  const minimum = request.kind === "box" ? request.minimum : { x: 0, y: 0, z: 0 };
  const maximum = request.kind === "box" ? request.maximum : { x: 4, y: 2, z: 0 };
  return {
    projectionVersion: 1,
    target: observation.target,
    mode: observation.mode,
    level: observation.level,
    levelFacts: observation.levelFacts,
    provenance: observation.provenance,
    boundary: observation.boundary,
    fingerprints: observation.fingerprints,
    region: { kind: request.kind, minimum, maximum },
    cellsOrder: "z-y-x",
    cells: observation.cells
      .filter(({ coordinate }) => (
        coordinate.x >= minimum.x
        && coordinate.x <= maximum.x
        && coordinate.y >= minimum.y
        && coordinate.y <= maximum.y
        && coordinate.z >= minimum.z
        && coordinate.z <= maximum.z
      ))
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
    terminal: observation.terminal,
  };
}

function checkpointFor(
  handle: SolverCheckpointHandle,
  state: SyntheticState,
): SolverCheckpoint {
  const observation = observeState(state);
  return {
    handle,
    metadata: {
      target: observation.target,
      mode: observation.mode,
      level: observation.level,
      levelFacts: observation.levelFacts,
      nativeTick: observation.boundary.nativeTick,
      exactRestoreDigest: observation.fingerprints.exact,
      provenance: observation.provenance,
    },
  };
}

function createSyntheticRuntime(): SolverRuntimePort<SyntheticSource, never> {
  const runs = new Map<SolverRunHandle, SyntheticState>();
  const checkpoints = new Map<SolverCheckpointHandle, SyntheticState>();
  let nextRun = 0;
  let nextCheckpoint = 0;

  const runState = (handle: SolverRunHandle): SyntheticState => {
    const state = runs.get(handle);
    if (state === undefined) throw new Error("unknown synthetic run");
    return state;
  };
  const checkpointState = (handle: SolverCheckpointHandle): SyntheticState => {
    const state = checkpoints.get(handle);
    if (state === undefined) throw new Error("unknown synthetic checkpoint");
    return state;
  };
  const createRun = (state: SyntheticState): SolverRunHandle => {
    const handle = { syntheticRun: nextRun++ } as unknown as SolverRunHandle;
    runs.set(handle, structuredClone(state));
    return handle;
  };
  const createCheckpoint = (state: SyntheticState): SolverCheckpoint => {
    const handle = { syntheticCheckpoint: nextCheckpoint++ } as unknown as SolverCheckpointHandle;
    checkpoints.set(handle, structuredClone(state));
    return checkpointFor(handle, state);
  };

  return {
    startManual(source) {
      if (source.seed !== 0) throw new Error("synthetic source only admits seed zero");
      return createRun({ tick: -1, lastInput: null, chipsRemaining: 2 });
    },
    startReplay(_source) {
      throw new Error("synthetic standard canary does not admit replay mode");
    },
    advanceTick(handle, request) {
      if (request.kind !== "manual-poll") {
        throw new Error("synthetic standard canary only admits manual polls");
      }
      const before = runState(handle);
      runs.set(handle, {
        tick: before.tick + 1,
        lastInput: request.inputCode,
        chipsRemaining: request.inputCode === 8 ? 1 : before.chipsRemaining,
      });
    },
    observe(handle) {
      return structuredClone(observeState(runState(handle)));
    },
    terminal(_handle): SolverTerminalResult {
      return { kind: "running" };
    },
    captureCheckpoint(handle) {
      return createCheckpoint(runState(handle));
    },
    cloneCheckpoint(handle) {
      return createCheckpoint(checkpointState(handle));
    },
    restoreCheckpoint(handle) {
      return createRun(checkpointState(handle));
    },
    projectRender(handle, request) {
      return structuredClone(projectState(runState(handle), request));
    },
    disposeRun(handle) {
      runs.delete(handle);
    },
    disposeCheckpoint(handle) {
      checkpoints.delete(handle);
    },
  };
}

function syntheticPlan(): ExpandedPlanPreviewV1 {
  return {
    previewVersion: 1,
    planId: "plan:0:0",
    target: "ms",
    rootId: "root:0",
    exitId: "synthetic:exit",
    status: "unresolved",
    stepsOrder: "forward-prerequisite-first",
    steps: [{
      stepOrder: 0,
      operatorId: "operator:synthetic:collect-red-key",
      kind: "collect",
      achieves: {
        kind: "collect",
        resourceType: "cc1:key-red",
        amount: 1,
        collectionOccurrenceId: "collection:synthetic:red-key",
        sourcePlacementId: RED_KEY_PLACEMENT_ID,
      },
      prerequisites: [],
      stateEffects: [{ axis: "inventory", resourceType: "cc1:key-red", delta: 1 }],
      evidenceIds: [RED_KEY_PLACEMENT_ID],
    }],
    unresolvedOrder: "reason-goal-path",
    unresolved: [],
    stateLedgerOrder: "axis-resource-type",
    stateLedger: [{
      axis: "inventory",
      resourceType: "cc1:key-red",
      initial: 0,
      increased: 1,
      decreased: 0,
      remaining: 1,
    }],
  };
}

function syntheticContract(): SubgoalContractV1 {
  return {
    contractVersion: 1,
    contractId: "contract:synthetic:collect-red-key-canary",
    title: "Synthetic red-key collection failure",
    description: "Expect one east red-key collection while a bounded fake runtime deliberately stops after reducing the chip requirement without moving or collecting.",
    target: "ms",
    planSegment: {
      planId: "plan:0:0",
      rootId: "root:0",
      startStepOrder: 0,
      endStepOrder: 0,
      operatorIds: ["operator:synthetic:collect-red-key"],
    },
    requires: [
      {
        predicateId: "predicate:synthetic:player-at-start",
        kind: "player-coordinate",
        coordinate: { x: 1, y: 1, z: 0 },
      },
      {
        predicateId: "predicate:synthetic:chips-remaining-two-at-start",
        kind: "remaining-requirement-count",
        resourceType: "cc1:icchip",
        comparison: "equals",
        count: 2,
      },
      {
        predicateId: "predicate:synthetic:red-key-inventory-zero",
        kind: "inventory-count",
        resourceType: "cc1:key-red",
        comparison: "equals",
        count: 0,
      },
      {
        predicateId: "predicate:synthetic:red-key-present",
        kind: "placement-presence",
        placementId: RED_KEY_PLACEMENT_ID,
        present: true,
      },
    ],
    ensures: [
      {
        predicateId: SYNTHETIC_FAILED_PREDICATE_ID,
        kind: "inventory-count",
        resourceType: "cc1:key-red",
        comparison: "equals",
        count: 1,
      },
      {
        predicateId: "predicate:synthetic:y-player-at-stop",
        kind: "player-coordinate",
        coordinate: { x: 2, y: 1, z: 0 },
      },
      {
        predicateId: "predicate:synthetic:z-red-key-absent",
        kind: "placement-presence",
        placementId: RED_KEY_PLACEMENT_ID,
        present: false,
      },
      {
        predicateId: "predicate:synthetic:x-chips-remain-two",
        kind: "remaining-requirement-count",
        resourceType: "cc1:icchip",
        comparison: "equals",
        count: 2,
      },
    ],
    invariants: [{
      predicateId: "predicate:synthetic:terminal-running",
      kind: "terminal-state",
      terminalKind: "running",
    }],
    stop: {
      predicateId: "predicate:synthetic:stop-at-one-chip-remaining",
      kind: "remaining-requirement-count",
      resourceType: "cc1:icchip",
      comparison: "equals",
      count: 1,
    },
    maximumAdvanceTicks: 1,
    footprint: {
      mustChange: [
        { kind: "inventory-resource", resourceType: "cc1:key-red" },
        { kind: "placement", placementId: RED_KEY_PLACEMENT_ID },
      ],
      mayChange: [
        { kind: "timing" },
        { kind: "input" },
        { kind: "remaining-requirement", resourceType: "cc1:icchip" },
      ],
      mustNotChange: [],
    },
    forbiddenObservedChanges: [{ kind: "terminal" }],
    provenance: {
      derivation: "authored",
      derivationRevision: "ccsolver:synthetic-p4a-failed-canary:v1",
      review: { status: "unreviewed" },
    },
  };
}

function expectedSceneFrom(witness: ContextualWitnessResultV1): SyntheticExpectedScene {
  const playerItem = witness.end.render.cells
    .flatMap(({ items }) => items)
    .find(({ identity }) => identity.kind === "actor" && identity.actorId === PLAYER_ID);
  if (playerItem === undefined) throw new Error("synthetic expected scene has no player item");
  return {
    region: witness.end.render.region,
    cellsOrder: "z-y-x",
    cells: witness.end.render.cells.map((cell) => ({
      ...cell,
      items: [
        ...cell.items.filter(({ identity }) => (
          !(identity.kind === "actor" && identity.actorId === PLAYER_ID)
          && !(identity.kind === "placement" && identity.placementId === RED_KEY_PLACEMENT_ID)
        )),
        ...(cell.coordinate.x === 2 && cell.coordinate.y === 1 ? [playerItem] : []),
      ].map((item, projectionOrder) => ({ ...item, projectionOrder })),
    })),
  };
}

export async function buildSyntheticFailedCanary(): Promise<BuiltSyntheticFailedCanary> {
  const runtime = createSyntheticRuntime();
  const executor = createContextualWitnessExecutor({
    runtime,
    sha256: {
      async digestBytes(value) {
        return sha256Bytes(value);
      },
      async digestUtf8(value) {
        return sha256Bytes(encode(value));
      },
    },
    validatorRevision: "ccsolver:contextual-witness-validator:p3b-v1",
    maximumCachedPrefixes: 1,
  });
  const contract = syntheticContract();
  try {
    const witness = await executor.execute({
      start: { kind: "manual", source: { seed: 0 } },
      initialization: {
        randomSeed: 0,
        seedSemantics: "synthetic-fixed-zero",
        replay: null,
      },
      prefix: [],
      snippet: [{ kind: "manual-poll", inputCode: 8 }],
      expectedEntryBoundary: -1,
      plan: syntheticPlan(),
      segment: contract.planSegment,
      contract,
      renderRegion: VIEWPORT,
      bounds: {
        maximumPrefixTicks: 0,
        maximumSnippetTicks: 1,
      },
    });
    if (
      witness.outcome.kind !== "failed"
      || witness.outcome.failure.code !== "witness.postcondition"
      || witness.outcome.failure.predicateId !== SYNTHETIC_FAILED_PREDICATE_ID
      || witness.join?.state !== "exact"
      || witness.join.comparedDecisionCount !== 1
    ) {
      throw new Error("synthetic P4A canary did not produce the exact bounded failure");
    }
    const failedVerdict = witness.contractValidation.ensures.find(
      ({ predicateId }) => predicateId === SYNTHETIC_FAILED_PREDICATE_ID,
    );
    if (failedVerdict?.passed !== false || failedVerdict.actual !== 0) {
      throw new Error("synthetic P4A canary did not observe red-key inventory zero");
    }
    return { witness, expectedScene: expectedSceneFrom(witness) };
  } finally {
    await executor.clearCheckpointCache();
  }
}
