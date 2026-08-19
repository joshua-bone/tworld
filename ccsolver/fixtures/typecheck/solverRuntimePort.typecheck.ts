import type { CanonicalJsonValue } from "../../src/domain/canonicalJson.js";
import type {
  SolverActorObservation,
  SolverCheckpointMetadata,
  SolverObservedElement,
  SolverObservation,
  SolverRenderProjection,
  SolverRuntimeProvenance,
  SolverTerminalResult,
} from "../../src/domain/runtime/index.js";
import type { SolverCausalEventPageV1 } from "../../src/events/index.js";
import {
  RuntimePortError,
  type SolverCheckpoint,
  SolverRuntimeError,
  type SolverAdvanceRequest,
  type SolverCheckpointHandle,
  type SolverRunHandle,
  type SolverRuntimePort,
} from "../../src/ports/index.js";

type ManualSource = {
  readonly kind: "manual-fixture";
  readonly fixtureId: string;
};

type ReplaySource = {
  readonly kind: "replay-fixture";
  readonly fixtureId: string;
  readonly replayId: string;
};

declare const run: SolverRunHandle;
declare const checkpointHandle: SolverCheckpointHandle;

const provenance: SolverRuntimeProvenance = {
  adapterId: "tworld-ms-solver-runtime",
  adapterRevision: "test-adapter-r1",
  engineId: "tworld-ms",
  engineRevision: "test-engine-r1",
};

const terminal: SolverTerminalResult = {
  kind: "running",
};

const actorObservation: SolverActorObservation = {
  observationOrder: 0,
  nativePosition: { collectionId: "ms:creatures", index: 0 },
  actorId: "actor:sha256:bug",
  identityProvenance: "runtime-projected",
  sourcePlacementId: null,
  semanticType: "cc1:bug",
  coordinate: { x: 1, y: 0, z: 0 },
  facing: "west",
  lifecycle: "active",
  movement: "moving",
};

const observation: SolverObservation = {
  observationVersion: 1,
  target: "ms",
  mode: "manual",
  level: {
    occurrenceId: "fixture:runtime-contract",
    normalizationProfile: "fixture-normalization-v1",
    normalizedGameplayDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  },
  levelFacts: {
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
  },
  provenance,
  boundary: {
    nativeTick: 12,
  },
  geometry: {
    width: 2,
    height: 1,
    depth: 1,
  },
  timing: {
    currentTime: 12,
    timeOffset: 0,
    secondsPlayed: 1,
    timeLimit: 100,
    remainingNativeTicks: 88,
  },
  input: {
    lastPolledInputCode: 0,
    lastAppliedInputCode: 0,
    replayCursor: null,
    replayMoveCount: null,
    replayBestTimeTicks: null,
  },
  randomness: {
    stepping: 0,
    initialRandomSlideDirection: "north",
    nativeStateFingerprintsOrder: "state-id",
    nativeStateFingerprints: [],
  },
  cellsOrder: "z-y-x",
  cells: [
    {
      cellOrdinal: 0,
      coordinate: { x: 0, y: 0, z: 0 },
      elementsOrder: "stratum-then-identity",
      elements: [
        {
          identity: { kind: "placement", placementId: "placement:sha256:floor" },
          stratum: "terrain",
          semanticType: "cc1:floor",
          facing: null,
          state: null,
        },
      ],
    },
  ],
  player: {
    actorId: "actor:sha256:player",
    identityProvenance: "initial-placement",
    sourcePlacementId: "placement:sha256:player",
    semanticType: "cc1:player",
    coordinate: { x: 0, y: 0, z: 0 },
    facing: "east",
    lifecycle: "active",
    movement: "stationary",
    control: "available",
    inputInfluence: "eligible",
  },
  actorsOrder: "observation-order",
  actors: [actorObservation],
  inventoryOrder: "runtime-slot-order",
  inventory: [],
  remainingRequirementsOrder: "resource-type",
  remainingRequirements: [],
  devicesOrder: "placement-id",
  devices: [],
  fingerprints: {
    exact: "ms-exact:test",
    continuation: null,
    semantic: "semantic:test",
  },
  terminal,
};

const projection: SolverRenderProjection = {
  projectionVersion: 1,
  target: "ms",
  mode: "manual",
  level: observation.level,
  levelFacts: observation.levelFacts,
  provenance,
  boundary: observation.boundary,
  fingerprints: observation.fingerprints,
  region: {
    kind: "full-map",
    minimum: { x: 0, y: 0, z: 0 },
    maximum: { x: 1, y: 0, z: 0 },
  },
  cellsOrder: "z-y-x",
  cells: [
    {
      cellOrdinal: 0,
      coordinate: { x: 0, y: 0, z: 0 },
      itemsOrder: "stratum-then-identity",
      items: [
        {
          identity: { kind: "placement", placementId: "placement:sha256:floor" },
          semanticType: "cc1:floor",
          stratum: "terrain",
          facing: null,
          state: null,
          projectionOrder: 0,
          source: "observation-element",
        },
      ],
    },
  ],
  terminal,
};

const checkpointMetadata: SolverCheckpointMetadata = {
  target: "ms",
  mode: "manual",
  level: observation.level,
  levelFacts: observation.levelFacts,
  nativeTick: 12,
  exactRestoreDigest: "ms-exact:test",
  provenance,
};

const causalEventPage: SolverCausalEventPageV1 = {
  journalVersion: 1,
  target: "ms",
  mode: "manual",
  level: observation.level,
  levelFacts: observation.levelFacts,
  provenance,
  requested: {
    afterSequence: null,
    maximumEvents: 1,
  },
  eventsOrder: "sequence",
  events: [],
  window: {
    firstAvailableSequence: null,
    availableThroughSequence: null,
    firstReturnedSequence: null,
    lastReturnedSequence: null,
    nextAfterSequence: null,
    status: "complete",
  },
  retention: { status: "complete" },
};

const checkpoint: SolverCheckpoint = {
  handle: checkpointHandle,
  metadata: checkpointMetadata,
  causalJournal: {
    nextSequence: 0,
    retainedEventCount: 0,
    retention: { status: "complete" },
  },
};

const port: SolverRuntimePort<ManualSource, ReplaySource> = {
  startManual: async (_source) => run,
  startReplay: async (_source) => run,
  advanceTick: async (_run, _request) => undefined,
  readEvents: async (_run, _request) => causalEventPage,
  observe: async (_run) => observation,
  terminal: async (_run) => terminal,
  captureCheckpoint: async (_run) => checkpoint,
  cloneCheckpoint: async (_checkpoint) => checkpoint,
  restoreCheckpoint: async (_checkpoint) => run,
  projectRender: async (_run, _region) => projection,
  disposeRun: async (_run) => undefined,
  disposeCheckpoint: async (_checkpoint) => undefined,
};

const manualPoll: SolverAdvanceRequest = {
  kind: "manual-poll",
  inputCode: 0,
};
const replayTick: SolverAdvanceRequest = { kind: "replay-tick" };

void port.startManual({ kind: "manual-fixture", fixtureId: "manual" });
void port.startReplay({ kind: "replay-fixture", fixtureId: "replay", replayId: "r1" });
void port.advanceTick(run, manualPoll);
void port.advanceTick(run, replayTick);
void port.readEvents(run, { afterSequence: null, maximumEvents: 1 });
void port.projectRender(run, { kind: "full-map" });
void port.projectRender(run, {
  kind: "box",
  minimum: { x: 0, y: 0, z: 0 },
  maximum: { x: 1, y: 0, z: 0 },
});

function acceptsCanonicalValue(_value: CanonicalJsonValue): void {}

acceptsCanonicalValue(observation);
acceptsCanonicalValue(projection);
acceptsCanonicalValue(terminal);
acceptsCanonicalValue(causalEventPage);
acceptsCanonicalValue(checkpoint.metadata);
acceptsCanonicalValue(checkpoint.causalJournal);

const error = new SolverRuntimeError(
  "runtime.mode-mismatch",
  "advanceTick",
  "manual input cannot advance a replay run",
  { expectedMode: "replay", actualMode: "manual" },
);
const errorAlias: RuntimePortError = error;
void errorAlias;

// @ts-expect-error manual starts require the adapter's manual source shape
void port.startManual({ kind: "replay-fixture", fixtureId: "replay", replayId: "r1" });

// @ts-expect-error replay starts require the adapter's replay source shape
void port.startReplay({ kind: "manual-fixture", fixtureId: "manual" });

// @ts-expect-error manual polls always carry the one native input code polled
const missingInputCode: SolverAdvanceRequest = { kind: "manual-poll" };
void missingInputCode;

// @ts-expect-error replay ticks never accept external input
const replayWithExternalInput: SolverAdvanceRequest = { kind: "replay-tick", inputCode: 0 };
void replayWithExternalInput;

// @ts-expect-error numeric tile ids are not solver-facing semantics
const rawTileId: SolverObservedElement = { ...observation.cells[0]!.elements[0]!, tileId: 1 };
void rawTileId;

// @ts-expect-error numeric actor ids are not solver-facing identities
const rawActorId: SolverActorObservation = { ...actorObservation, actorId: 1 };
void rawActorId;
