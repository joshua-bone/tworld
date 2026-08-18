import type {
  ActorIdV1,
  PlacementIdV1,
  SolverObservation,
  SolverRenderProjection,
} from "@tworld/ccsolver/domain";
import type {
  SolverCheckpoint,
  SolverCheckpointHandle,
  SolverRunHandle,
  SolverRuntimePort,
} from "@tworld/ccsolver/ports";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { projectSemanticRenderRegion } from "../../impl/runtime/projectSemanticRenderRegion";
import {
  buildIntro8RuntimeReviewPacket,
  buildKeyPyramidRuntimeReviewPacket,
  deriveRuntimeSemanticDelta,
  renderP2aRuntimeReviewMarkdown,
} from "./buildP2aRuntimeReviewPacket";

type ManualSource = { readonly id: string };
type ReplaySource = { readonly id: string };

const PLAYER_ID = "actor:sha256:player" as ActorIdV1;
const BUG_ID = "actor:sha256:bug" as ActorIdV1;
const FLOOR_ID = `placement:sha256:${"0".repeat(64)}` as PlacementIdV1;

interface FakeState {
  mode: "manual" | "replay";
  tick: number;
  playerX: number;
  bugX: number;
  inputCode: number;
  replayCursor: number | null;
  redKeys: number;
}

function observationFor(target: "ms" | "lynx", state: FakeState): SolverObservation {
  const cells = Array.from({ length: 3 }, (_, x) => ({
    cellOrdinal: x,
    coordinate: { x, y: 0, z: 0 },
    elementsOrder: "stratum-then-identity" as const,
    elements: [
      {
        identity: {
          kind: "placement" as const,
          placementId: (x === 0 ? FLOOR_ID : `placement:sha256:${String(x).repeat(64)}`) as PlacementIdV1,
        },
        stratum: "terrain" as const,
        semanticType: "cc1:floor",
        facing: null,
        state: "plain",
      },
      ...(state.playerX === x ? [{
        identity: { kind: "actor" as const, actorId: PLAYER_ID },
        stratum: "actor" as const,
        semanticType: "cc1:chip",
        facing: "east" as const,
        state: "stationary",
      }] : []),
      ...(state.bugX === x ? [{
        identity: { kind: "actor" as const, actorId: BUG_ID },
        stratum: "actor" as const,
        semanticType: "cc1:bug",
        facing: "east" as const,
        state: "moving",
      }] : []),
    ],
  }));
  return {
    observationVersion: 1,
    target,
    mode: state.mode,
    level: {
      occurrenceId: target === "ms" ? "fixture:review:ms" : "fixture:review:lynx",
      normalizationProfile: "fixture-v1",
      normalizedGameplayDigest: `sha256:${"a".repeat(64)}`,
    },
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: `sha256:${"b".repeat(64)}`,
    },
    provenance: {
      adapterId: `fixture-${target}-adapter`,
      adapterRevision: "fixture-r1",
      engineId: `fixture-${target}-engine`,
      engineRevision: "fixture-r1",
    },
    boundary: { nativeTick: state.tick },
    geometry: { width: 3, height: 1, depth: 1 },
    timing: {
      currentTime: state.tick,
      timeOffset: 0,
      secondsPlayed: Math.max(0, state.tick),
      timeLimit: 100,
      remainingNativeTicks: 100 - state.tick,
    },
    input: {
      lastPolledInputCode: state.mode === "manual" && state.tick >= 0 ? state.inputCode : null,
      lastAppliedInputCode: state.tick >= 0 ? state.inputCode : null,
      replayCursor: state.replayCursor,
      replayMoveCount: state.mode === "replay" ? 2 : null,
      replayBestTimeTicks: state.mode === "replay" ? 20 : null,
    },
    randomness: {
      stepping: 0,
      initialRandomSlideDirection: "north",
      nativeStateFingerprintsOrder: "state-id",
      nativeStateFingerprints: [],
    },
    cellsOrder: "z-y-x",
    cells,
    player: {
      actorId: PLAYER_ID,
      identityProvenance: "runtime-projected",
      sourcePlacementId: null,
      semanticType: "cc1:chip",
      coordinate: { x: state.playerX, y: 0, z: 0 },
      facing: "east",
      lifecycle: "active",
      movement: "stationary",
      control: "available",
      inputInfluence: state.mode === "replay" ? "replay-owned" : "eligible",
    },
    actorsOrder: "observation-order",
    actors: [{
      observationOrder: 0,
      nativePosition: {
        collectionId: target === "ms" ? "ms:creatures" : "lynx:actors",
        index: 0,
      },
      actorId: BUG_ID,
      identityProvenance: "runtime-projected",
      sourcePlacementId: null,
      semanticType: "cc1:bug",
      coordinate: { x: state.bugX, y: 0, z: 0 },
      facing: "east",
      lifecycle: "active",
      movement: "moving",
    }],
    inventoryOrder: "runtime-slot-order",
    inventory: state.redKeys === 0 ? [] : [{ slotOrder: 0, resourceType: "cc1:key-red", count: state.redKeys }],
    remainingRequirementsOrder: "resource-type",
    remainingRequirements: [],
    devicesOrder: "placement-id",
    devices: [],
    fingerprints: {
      exact: `exact:${state.mode}:${state.tick}:${state.playerX}:${state.bugX}:${state.redKeys}`,
      continuation: null,
      semantic: `semantic:${state.playerX}:${state.bugX}:${state.redKeys}`,
    },
    terminal: { kind: "running" },
  };
}

function createFakeRuntime(
  target: "ms" | "lynx",
  options: {
    readonly eastMovesPlayer?: boolean;
    readonly autonomousActors?: boolean;
  } = {},
): SolverRuntimePort<ManualSource, ReplaySource> & {
  readonly advanceCounts: { manual: number; replay: number };
} {
  const entries = new WeakMap<object, FakeState>();
  const advanceCounts = { manual: 0, replay: 0 };
  const handle = (state: FakeState): SolverRunHandle => {
    const value = Object.freeze({}) as SolverRunHandle;
    entries.set(value, state);
    return value;
  };
  const stateFor = (run: SolverRunHandle): FakeState => {
    const state = entries.get(run);
    if (!state) throw new Error("unknown fake run");
    return state;
  };
  const unsupportedCheckpoint = (): SolverCheckpoint => {
    throw new Error("not used by review-packet tests");
  };
  return {
    advanceCounts,
    startManual: () => handle({
      mode: "manual",
      tick: -1,
      playerX: 0,
      bugX: 2,
      inputCode: 0,
      replayCursor: null,
      redKeys: 0,
    }),
    startReplay: () => handle({
      mode: "replay",
      tick: -1,
      playerX: 0,
      bugX: 2,
      inputCode: 0,
      replayCursor: 0,
      redKeys: 0,
    }),
    advanceTick(run, request) {
      const state = stateFor(run);
      state.tick += 1;
      if (request.kind === "replay-tick") {
        advanceCounts.replay += 1;
        state.replayCursor = (state.replayCursor ?? 0) + 1;
        if (state.tick === 1) state.redKeys = 1;
      } else {
        advanceCounts.manual += 1;
        state.inputCode = request.inputCode;
        if (options.eastMovesPlayer && request.inputCode === 8) state.playerX = 1;
        // East is deliberately blocked; the autonomous bug still moves unless
        // a fixture asks to isolate the second explicit east poll.
        if (request.inputCode === 8 || options.autonomousActors !== false) {
          state.bugX = state.bugX === 2 ? 1 : 2;
        }
      }
    },
    observe: (run) => observationFor(target, stateFor(run)),
    terminal: () => ({ kind: "running" }),
    captureCheckpoint: unsupportedCheckpoint,
    cloneCheckpoint: (_checkpoint: SolverCheckpointHandle) => unsupportedCheckpoint(),
    restoreCheckpoint: (_checkpoint: SolverCheckpointHandle) => {
      throw new Error("not used by review-packet tests");
    },
    projectRender(run): SolverRenderProjection {
      return projectSemanticRenderRegion(observationFor(target, stateFor(run)), { kind: "full-map" });
    },
    disposeRun: () => undefined,
    disposeCheckpoint: () => undefined,
  };
}

const sourceSummary = {
  repositoryRevision: "fixture-source-r1",
  mapPath: "data/fixture.dat",
  mapContent: { digest: `sha256:${"e".repeat(64)}`, byteLength: 100 },
  seriesFile: "fixture.dac",
  seriesContent: { digest: `sha256:${"f".repeat(64)}`, byteLength: 20 },
  levelNumber: 1,
  randomSeed: 123,
  randomSeedSemantics: "manual-source-derived-from-donor-replay-uint31",
} as const;

describe("P2A runtime review packet preview", () => {
  it("labels every donor-derived Key Pyramid point and stops at the first resource change", async () => {
    const runtime = createFakeRuntime("ms");
    const packet = await buildKeyPyramidRuntimeReviewPacket({
      target: "ms",
      runtime,
      manualSource: { id: "manual" },
      replaySource: { id: "replay" },
      source: sourceSummary,
      donor: {
        repositoryPath: "save/fixture.tws",
        fileContent: { digest: `sha256:${"c".repeat(64)}`, byteLength: 84 },
        entryContent: { digest: `sha256:${"d".repeat(64)}`, byteLength: 42 },
        bestTimeNativeTicks: 20,
        replayRandomSeed: 123,
        replayRandomSeedSemantics: "exact-donor-replay-uint32",
      },
      maximumResourceSearchTicks: 8,
    });

    expect(packet.reviewPoints.map(({ reviewPointId }) => reviewPointId)).toEqual([
      "manual-start",
      "donor-replay-start",
      "first-donor-resource-change",
    ]);
    expect(packet.reviewPoints[0]!.evidenceRole).toBe("runtime-characterization");
    expect(packet.reviewPoints.slice(1).every(({ evidenceRole }) => (
      evidenceRole === "donor-runtime-characterization"
    ))).toBe(true);
    expect(packet.reviewPoints[2]!.observation.boundary.nativeTick).toBe(1);
    expect(packet.reviewPoints[2]!.deltaFromPrevious?.inventoryChanges).toEqual([
      { resourceType: "cc1:key-red", before: 0, after: 1 },
    ]);
    expect(runtime.advanceCounts.replay).toBe(2);
    expect(packet.searchBounds).toEqual({
      resourceChangeMaximumAdvanceTicks: 8,
      resourceChangeObservedAfterAdvanceTicks: 2,
    });

    const canonical = canonicalizeJson(packet);
    expect(canonical).toContain("donor-runtime-characterization");
    expect(canonical).not.toMatch(/(?:sessionToken|checkpointHandle|createdAt|generatedAt|\/Users\/)/u);

    const markdown = renderP2aRuntimeReviewMarkdown([packet]);
    expect(markdown).toContain(
      "Canonical JSON: [`./ms/runtime-review.json`](./ms/runtime-review.json).",
    );
    expect(markdown).toContain(
      `Source provenance: repository revision \`fixture-source-r1\`; map \`data/fixture.dat\` (sha256:${"e".repeat(64)}, 100 bytes); series \`sets/fixture.dac\` (sha256:${"f".repeat(64)}, 20 bytes).`,
    );
    expect(markdown).toContain(
      "this manual-source characterization is not replay-executed; its seed is derived from donor replay metadata, so it is not donor-independent",
    );
    expect(markdown.match(/Baseline state \(no preceding delta\)/gu)).toHaveLength(2);
    expect(markdown).toContain(
      "Runtime: mode `replay`; terminal `running`; input last-polled=none, last-applied=none, replay-cursor=0, replay-move-count=2, replay-best-time-ticks=20.",
    );
    expect(markdown).toContain("Inventory: none.");
    expect(markdown).toContain("Remaining requirements: none.");
    expect(markdown).toContain("Actors (semanticType + lifecycle): `cc1:bug + active` × 1.");
    expect(markdown).toContain("Devices (semanticType + state): none.");
    expect(markdown).toContain(
      "Provenance: adapter `fixture-ms-adapter` revision `fixture-r1`; engine `fixture-ms-engine` revision `fixture-r1`.",
    );
  });

  it("records Intro 8's east poll as blocked observation, never as an inferred button", async () => {
    const runtime = createFakeRuntime("lynx");
    const packet = await buildIntro8RuntimeReviewPacket({
      target: "lynx",
      runtime,
      manualSource: { id: "intro" },
      source: {
        ...sourceSummary,
        levelNumber: 8,
        randomSeedSemantics: "manual-source-fixed-characterization",
      },
      eastInputCode: 8,
      noInputCode: 0,
      maximumFollowupTicks: 4,
    });

    expect(packet.reviewPoints.map(({ reviewPointId }) => reviewPointId)).toEqual([
      "manual-start",
      "blocked-east-poll",
      "first-no-input-semantic-change",
    ]);
    expect(packet.reviewPoints[1]!.trigger).toMatchObject({
      kind: "manual-poll",
      inputCode: 8,
      observedPlayerOutcome: "stationary",
      interpretation: "blocked-movement-observation-not-button-evidence",
    });
    expect(packet.reviewPoints[1]!.deltaFromPrevious?.actorChanges).toHaveLength(1);
    expect(packet.reviewPoints[2]!.deltaFromPrevious?.actorChanges).toHaveLength(1);
    expect(packet.reviewPoints[2]!.trigger).toMatchObject({
      kind: "manual-poll",
      inputCode: 0,
      observedChange: "first-no-input-semantic-change",
    });
    expect(canonicalizeJson(packet)).not.toMatch(/button-(?:press|activation)|triggered-button/u);

    const markdown = renderP2aRuntimeReviewMarkdown([packet]);
    expect(markdown).toContain(
      "Canonical JSON: [`./lynx/runtime-review.json`](./lynx/runtime-review.json).",
    );
    expect(markdown).toContain("blocked movement observation; not button evidence");
    expect(markdown).toContain("Actor changes: 1");
    expect(markdown).toContain(
      "(1, 0, 0): `cc1:floor` (terrain; state=plain; facing=none) → `cc1:bug` (actor; state=moving; facing=east); `cc1:floor` (terrain; state=plain; facing=none)",
    );
    expect(markdown).toContain(
      "(2, 0, 0): `cc1:bug` (actor; state=moving; facing=east); `cc1:floor` (terrain; state=plain; facing=none) → `cc1:floor` (terrain; state=plain; facing=none)",
    );
  });

  it("refuses to label an east poll blocked when the player actually relocates", async () => {
    const runtime = createFakeRuntime("ms", { eastMovesPlayer: true });
    await expect(buildIntro8RuntimeReviewPacket({
      target: "ms",
      runtime,
      manualSource: { id: "intro" },
      source: {
        ...sourceSummary,
        levelNumber: 8,
        randomSeedSemantics: "manual-source-fixed-characterization",
      },
      eastInputCode: 8,
      noInputCode: 0,
      maximumFollowupTicks: 4,
    })).rejects.toThrow("Intro 8 east poll was not blocked: observed relocated");
  });

  it("names a bounded second east poll instead of overclaiming autonomous change", async () => {
    const runtime = createFakeRuntime("lynx", { autonomousActors: false });
    const packet = await buildIntro8RuntimeReviewPacket({
      target: "lynx",
      runtime,
      manualSource: { id: "intro" },
      source: {
        ...sourceSummary,
        levelNumber: 8,
        randomSeedSemantics: "manual-source-fixed-characterization",
      },
      eastInputCode: 8,
      noInputCode: 0,
      maximumFollowupTicks: 4,
    });

    expect(packet.reviewPoints[2]).toMatchObject({
      reviewPointId: "second-east-poll-semantic-change",
      trigger: {
        kind: "manual-poll",
        inputCode: 8,
        followupAdvanceTicks: 4,
        observedChange: "second-east-poll-semantic-change",
      },
    });
  });

  it("fails at the strict resource-search bound without emitting a guessed point", async () => {
    const runtime = createFakeRuntime("ms");
    await expect(buildKeyPyramidRuntimeReviewPacket({
      target: "ms",
      runtime,
      manualSource: { id: "manual" },
      replaySource: { id: "replay" },
      source: sourceSummary,
      donor: {
        repositoryPath: "save/fixture.tws",
        fileContent: { digest: `sha256:${"c".repeat(64)}`, byteLength: 84 },
        entryContent: { digest: `sha256:${"d".repeat(64)}`, byteLength: 42 },
        bestTimeNativeTicks: 20,
        replayRandomSeed: 123,
        replayRandomSeedSemantics: "exact-donor-replay-uint32",
      },
      maximumResourceSearchTicks: 1,
    })).rejects.toThrow("resource change was not observed within 1 replay ticks");
    expect(runtime.advanceCounts.replay).toBe(1);
  });

  it("derives sorted compact semantic deltas without fingerprints or unchanged cells", () => {
    const before = observationFor("ms", {
      mode: "manual",
      tick: 0,
      playerX: 0,
      bugX: 2,
      inputCode: 0,
      replayCursor: null,
      redKeys: 0,
    });
    const after = observationFor("ms", {
      mode: "manual",
      tick: 1,
      playerX: 0,
      bugX: 1,
      inputCode: 8,
      replayCursor: null,
      redKeys: 1,
    });

    const delta = deriveRuntimeSemanticDelta("start", before, after);
    expect(delta.changedCategories).toEqual(["actor", "cell", "input", "inventory", "timing"]);
    expect(delta.changedCells.map(({ coordinate }) => coordinate)).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
    ]);
    expect(canonicalizeJson(delta)).not.toContain("fingerprint");
  });
});
