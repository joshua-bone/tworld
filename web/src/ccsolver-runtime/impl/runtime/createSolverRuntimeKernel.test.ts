import type {
  ActorIdV1,
  CoordinateV1,
  DirectionV1,
  LevelIdentityV1,
  PlacementIdV1,
  RulesetTargetV1,
} from "@tworld/ccsolver/domain";
import type {
  SolverActorObservation,
  SolverObservation,
  SolverRuntimeMode,
  SolverRuntimeProvenance,
  SolverTerminalResult,
} from "@tworld/ccsolver/domain";
import { SolverRuntimeError } from "@tworld/ccsolver/ports";
import { describe, expect, it } from "vitest";
import {
  createSolverRuntimeKernel,
  type SolverRuntimeDriver,
} from "./createSolverRuntimeKernel";

const PLAYER_ID = "actor:sha256:player" as ActorIdV1;

interface FakeSource {
  readonly sourceId: string;
  readonly target?: RulesetTargetV1;
  readonly initialTick?: number;
  readonly failInputCode?: number;
  readonly failDisposal?: boolean;
  readonly terminalSequence?: readonly SolverTerminalResult[];
}

interface FakeReplaySource extends FakeSource {
  readonly replayInputs: readonly number[];
}

interface FakeToken {
  sourceId: string;
  target: RulesetTargetV1;
  mode: SolverRuntimeMode;
  tick: number;
  x: number;
  y: number;
  replayCursor: number | null;
  replayInputs: number[];
  lastInputCode: number;
  failInputCode: number | null;
  failDisposal: boolean;
  terminalSequence: SolverTerminalResult[];
  observationPoisoned: boolean;
}

interface DriverCounters {
  starts: number;
  clones: number;
  advances: number;
  observations: number;
  fingerprints: number;
  disposals: number;
}

const level: LevelIdentityV1 = {
  occurrenceId: "fixture:p2a-runtime-kernel",
  normalizationProfile: "fixture-normalization-v1",
  normalizedGameplayDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
};

const provenance: SolverRuntimeProvenance = {
  adapterId: "fixture-runtime-adapter",
  adapterRevision: "fixture-runtime-adapter-r1",
  engineId: "fixture-engine",
  engineRevision: "fixture-engine-r1",
};

const levelFacts = {
  protocolVersion: 1,
  artifactType: "level-facts",
  schemaVersion: 1,
  digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
} as const;

function coordinate(x: number, y = 0): CoordinateV1 {
  return { x, y, z: 0 };
}

function wonAt(nativeTick: number, x: number): SolverTerminalResult {
  return {
    kind: "won",
    nativeTick,
    coordinate: coordinate(x),
    exitPlacementId: "placement:sha256:exit" as PlacementIdV1,
  };
}

function lostAt(nativeTick: number, x: number): SolverTerminalResult {
  return {
    kind: "lost",
    nativeTick,
    coordinate: coordinate(x),
    cause: "cc1:water",
  };
}

function stateDigest(token: FakeToken): string {
  return [
    token.target,
    token.mode,
    token.sourceId,
    token.tick,
    token.x,
    token.y,
    token.replayCursor ?? "manual",
    token.lastInputCode,
  ].join(":");
}

function currentTerminal(token: FakeToken): SolverTerminalResult {
  return token.terminalSequence[token.tick - 1] ?? { kind: "running" };
}

function observationFor(token: FakeToken): SolverObservation {
  const direction: DirectionV1 = token.lastInputCode < 0 ? "west" : "east";
  const terminal = currentTerminal(token);
  const cells = Array.from({ length: 8 }, (_, cellOrdinal) => {
    const x = cellOrdinal % 4;
    const y = Math.floor(cellOrdinal / 4);
    const water = cellOrdinal === 5;
    const elements: SolverObservation["cells"][number]["elements"][number][] = [{
      identity: {
        kind: "placement",
        placementId: `placement:sha256:${cellOrdinal.toString(16).padStart(64, "0")}` as PlacementIdV1,
      },
      stratum: "terrain",
      semanticType: water ? "cc1:water" : "cc1:floor",
      facing: null,
      state: water ? null : "plain",
    }];
    if (x === token.x && y === token.y) {
      elements.push({
        identity: { kind: "actor", actorId: PLAYER_ID },
        stratum: "actor",
        semanticType: "cc1:player",
        facing: direction,
        state: "stationary",
      });
    }
    return {
      cellOrdinal,
      coordinate: coordinate(x, y),
      elementsOrder: "stratum-then-identity" as const,
      elements,
    };
  });
  return {
    observationVersion: 1,
    target: token.target,
    mode: token.mode,
    level,
    levelFacts,
    provenance,
    boundary: { nativeTick: token.tick },
    geometry: { width: 4, height: 2, depth: 1 },
    timing: {
      currentTime: token.tick,
      timeOffset: 0,
      secondsPlayed: token.tick,
      timeLimit: 100,
      remainingNativeTicks: 100 - token.tick,
    },
    input: {
      lastPolledInputCode: token.tick < 0 || token.mode === "replay" ? null : token.lastInputCode,
      lastAppliedInputCode: token.tick < 0 ? null : token.lastInputCode,
      replayCursor: token.replayCursor,
      replayMoveCount: token.replayCursor === null ? null : token.replayInputs.length,
      replayBestTimeTicks: token.replayCursor === null ? null : 100,
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
      semanticType: "cc1:player",
      coordinate: coordinate(token.x, token.y),
      facing: direction,
      lifecycle: "active",
      movement: "stationary",
      control: terminal.kind === "running" ? "available" : "terminal",
      inputInfluence: terminal.kind !== "running"
        ? "terminal"
        : token.mode === "replay"
          ? "replay-owned"
          : "eligible",
    },
    actorsOrder: "observation-order",
    actors: [],
    inventoryOrder: "runtime-slot-order",
    inventory: [],
    remainingRequirementsOrder: "resource-type",
    remainingRequirements: [],
    devicesOrder: "placement-id",
    devices: [],
    fingerprints: {
      exact: stateDigest(token),
      continuation: null,
      semantic: `semantic:${token.x}:${token.y}`,
    },
    terminal,
  };
}

function createFakeDriver(options: {
  async?: boolean;
  cloneBehavior?: "exact" | "same-object" | "divergent";
} = {}): {
  readonly counters: DriverCounters;
  readonly driver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource>;
} {
  const counters: DriverCounters = {
    starts: 0,
    clones: 0,
    advances: 0,
    observations: 0,
    fingerprints: 0,
    disposals: 0,
  };

  const maybeAsync = <T>(value: T): T | Promise<T> => options.async ? Promise.resolve(value) : value;
  const makeToken = (
    source: FakeSource,
    mode: SolverRuntimeMode,
    replayInputs: readonly number[] = [],
  ): FakeToken => ({
    sourceId: source.sourceId,
    target: source.target ?? "ms",
    mode,
    tick: source.initialTick ?? 0,
    x: 0,
    y: 0,
    replayCursor: mode === "replay" ? 0 : null,
    replayInputs: [...replayInputs],
    lastInputCode: 0,
    failInputCode: source.failInputCode ?? null,
    failDisposal: source.failDisposal ?? false,
    terminalSequence: [...structuredClone(source.terminalSequence ?? [])],
    observationPoisoned: false,
  });

  const driver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
    startManual(source) {
      counters.starts += 1;
      return maybeAsync(makeToken(source, "manual"));
    },
    startReplay(source) {
      counters.starts += 1;
      return maybeAsync(makeToken(source, "replay", source.replayInputs));
    },
    cloneToken(token) {
      counters.clones += 1;
      if (options.cloneBehavior === "same-object") return maybeAsync(token);
      const cloned = structuredClone(token);
      if (options.cloneBehavior === "divergent") cloned.x += 1;
      return maybeAsync(cloned);
    },
    advanceTick(token, request) {
      counters.advances += 1;
      const inputCode = request.kind === "manual-poll"
        ? request.inputCode
        : (token.replayInputs[token.replayCursor ?? 0] ?? 0);
      token.tick += 1;
      token.x += Math.sign(inputCode);
      token.lastInputCode = inputCode;
      if (token.replayCursor !== null) token.replayCursor += 1;
      if (inputCode === token.failInputCode) {
        throw new SolverRuntimeError(
          "runtime.unsupported-input",
          "advanceTick",
          "fixture rejected the input after mutating its working token",
          { inputCode },
        );
      }
      return maybeAsync(token);
    },
    observe(token) {
      counters.observations += 1;
      const observation = observationFor(token);
      return maybeAsync(observation);
    },
    semanticFingerprint(observation) {
      const x = observation.player.coordinate?.x ?? "none";
      const y = observation.player.coordinate?.y ?? "none";
      return maybeAsync(`semantic:${x}:${y}:${observation.terminal.kind}`);
    },
    exactRestoreDigest(token) {
      counters.fingerprints += 1;
      return maybeAsync(stateDigest(token));
    },
    disposeToken(token) {
      counters.disposals += 1;
      if (token.failDisposal && !token.observationPoisoned) {
        token.x = 99;
        throw new Error("fixture disposal failed after mutating its token");
      }
      return maybeAsync(undefined);
    },
  };

  return { counters, driver };
}

function createRuntime(
  driver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource>,
  options: {
    ownerId?: string;
    target?: RulesetTargetV1;
    maxRuns?: number;
    maxCheckpoints?: number;
  } = {},
) {
  return createSolverRuntimeKernel({
    driver,
    ownerId: options.ownerId ?? "fixture-owner",
    target: options.target ?? "ms",
    maximumLiveRuns: options.maxRuns ?? 8,
    maximumLiveCheckpoints: options.maxCheckpoints ?? 8,
  });
}

async function expectRuntimeError(
  action: () => unknown | Promise<unknown>,
  code: string,
  operation: string,
): Promise<void> {
  try {
    await action();
    throw new Error("expected a SolverRuntimeError");
  } catch (error) {
    expect(error).toBeInstanceOf(SolverRuntimeError);
    expect(error).toMatchObject({ code, operation });
  }
}

describe.each([false, true])("createSolverRuntimeKernel (async driver: %s)", (asyncDriver) => {
  it("rejects input evidence before the first tick and missing applied or manual-poll input afterward", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const prematureInputDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return token.tick < 0 ? {
          ...observation,
          input: { ...observation.input, lastAppliedInputCode: 0 },
        } : observation;
      },
    };
    await expectRuntimeError(
      () => createRuntime(prematureInputDriver).startManual({
        sourceId: "premature-input",
        initialTick: -1,
      }),
      "runtime.invalid-observation",
      "startManual",
    );

    const missingInputDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return token.tick < 0 ? observation : {
          ...observation,
          input: { ...observation.input, lastAppliedInputCode: null },
        };
      },
    };
    const runtime = createRuntime(missingInputDriver);
    const run = await runtime.startManual({ sourceId: "missing-input", initialTick: -1 });
    await expectRuntimeError(
      () => runtime.advanceTick(run, { kind: "manual-poll", inputCode: 0 }),
      "runtime.invalid-observation",
      "advanceTick",
    );

    const missingPollDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return token.tick < 0 ? observation : {
          ...observation,
          input: { ...observation.input, lastPolledInputCode: null },
        };
      },
    };
    const missingPollRuntime = createRuntime(missingPollDriver);
    const missingPollRun = await missingPollRuntime.startManual({
      sourceId: "missing-manual-poll",
      initialTick: -1,
    });
    await expectRuntimeError(
      () => missingPollRuntime.advanceTick(
        missingPollRun,
        { kind: "manual-poll", inputCode: 0 },
      ),
      "runtime.invalid-observation",
      "advanceTick",
    );
  });

  it("rejects terminal-control and manual/replay ownership contradictions", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const contradictoryTerminalDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return {
          ...observation,
          terminal: wonAt(observation.boundary.nativeTick, token.x),
          player: {
            ...observation.player,
            control: "available",
            inputInfluence: "eligible",
          },
        };
      },
    };
    await expectRuntimeError(
      () => createRuntime(contradictoryTerminalDriver).startManual({ sourceId: "terminal-control" }),
      "runtime.invalid-observation",
      "startManual",
    );

    const wrongOwnershipDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return {
          ...observation,
          player: {
            ...observation.player,
            inputInfluence: token.mode === "manual" ? "replay-owned" : "eligible",
          },
        };
      },
    };
    await expectRuntimeError(
      () => createRuntime(wrongOwnershipDriver).startManual({ sourceId: "manual-ownership" }),
      "runtime.invalid-observation",
      "startManual",
    );
    await expectRuntimeError(
      () => createRuntime(wrongOwnershipDriver).startReplay({
        sourceId: "replay-ownership",
        replayInputs: [],
      }),
      "runtime.invalid-observation",
      "startReplay",
    );
  });

  it("rejects an observer that mutates its exact probe state", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const mutatingDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      observe(token) {
        token.x = 2;
        return driver.observe(token);
      },
    };
    const runtime = createRuntime(mutatingDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "mutating-observer" }),
      "runtime.adapter-failure",
      "startManual",
    );
  });

  it("rejects a sparse observation that cannot support a whole-map projection", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const sparseDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return {
          ...observation,
          cells: observation.cells.slice(0, -1),
        };
      },
    };
    const runtime = createRuntime(sparseDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "sparse" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects a placement identity duplicated across observed cells", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const duplicatePlacementDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        const cells = observation.cells.map((cell, cellIndex) => cellIndex === 1 ? {
          ...cell,
          elements: cell.elements.map((element, elementIndex) => elementIndex === 0 ? {
            ...element,
            identity: observation.cells[0]!.elements[0]!.identity,
          } : element),
        } : cell);
        return { ...observation, cells };
      },
    };
    const runtime = createRuntime(duplicatePlacementDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "duplicate-placement" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects actor order gaps, duplicate native positions, and target-foreign collections", async () => {
    const cases: readonly {
      readonly name: string;
      readonly mutate: (
        actors: readonly SolverActorObservation[],
      ) => readonly SolverActorObservation[];
    }[] = [
      {
        name: "observation-order-gap",
        mutate: (actors) => [{ ...actors[0]!, observationOrder: 1 }],
      },
      {
        name: "duplicate-native-position",
        mutate: (actors) => [
          actors[0]!,
          { ...actors[1]!, nativePosition: actors[0]!.nativePosition },
        ],
      },
      {
        name: "target-foreign-native-collection",
        mutate: (actors) => [{
          ...actors[0]!,
          nativePosition: { collectionId: "lynx:actors", index: 0 },
        }],
      },
    ];

    for (const { name, mutate } of cases) {
      const { driver } = createFakeDriver({ async: asyncDriver });
      const invalidActorOrderDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
        ...driver,
        async observe(token) {
          const observation = await driver.observe(token);
          const actors = mutate([0, 1].map((index): SolverActorObservation => ({
            observationOrder: index,
            nativePosition: { collectionId: "ms:creatures", index },
            actorId: `actor:sha256:ordered-${index}` as ActorIdV1,
            identityProvenance: "runtime-projected",
            sourcePlacementId: null,
            semanticType: "cc1:ball",
            coordinate: coordinate(index + 1),
            facing: "east",
            lifecycle: "active",
            movement: "stationary",
          })));
          const cells = observation.cells.map((cell) => {
            const actor = actors.find(({ coordinate: actorCoordinate }) => (
              actorCoordinate?.x === cell.coordinate.x
              && actorCoordinate.y === cell.coordinate.y
              && actorCoordinate.z === cell.coordinate.z
            ));
            return actor === undefined ? cell : {
              ...cell,
              elements: [...cell.elements, {
                identity: { kind: "actor" as const, actorId: actor.actorId },
                stratum: "actor" as const,
                semanticType: actor.semanticType,
                facing: actor.facing,
                state: actor.movement,
              }],
            };
          });
          return { ...observation, cells, actors };
        },
      };

      await expectRuntimeError(
        () => createRuntime(invalidActorOrderDriver).startManual({ sourceId: name }),
        "runtime.invalid-observation",
        "startManual",
      );
    }
  });

  it("rejects duplicate actor records that would collapse in semantic deltas", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const duplicateActorId = "actor:sha256:duplicate" as ActorIdV1;
    const duplicateDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        const actorElement = {
          identity: { kind: "actor", actorId: duplicateActorId },
          stratum: "actor",
          semanticType: "cc1:ball",
          facing: "east",
          state: "stationary",
        } as const;
        const cells = observation.cells.map((cell, index) => index === 1 ? {
          ...cell,
          elements: [...cell.elements, actorElement],
        } : cell);
        const actor = {
          actorId: duplicateActorId,
          identityProvenance: "runtime-projected" as const,
          sourcePlacementId: null,
          semanticType: "cc1:ball",
          coordinate: coordinate(1),
          facing: "east" as const,
          lifecycle: "active" as const,
          movement: "stationary" as const,
        };
        return {
          ...observation,
          cells,
          actors: [
            {
              ...actor,
              observationOrder: 0,
              nativePosition: { collectionId: "ms:creatures", index: 0 },
            },
            {
              ...actor,
              observationOrder: 1,
              nativePosition: { collectionId: "ms:creatures", index: 1 },
            },
          ],
        };
      },
    };
    const runtime = createRuntime(duplicateDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "duplicate-actor" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects a null-coordinate player that still appears in an observed cell", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const missingPlayerPositionDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return {
          ...observation,
          player: { ...observation.player, coordinate: null },
        };
      },
    };

    await expectRuntimeError(
      () => createRuntime(missingPlayerPositionDriver).startManual({ sourceId: "null-player-position" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects a destroyed player that still appears in an observed cell", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const destroyedPlayerDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        return {
          ...observation,
          player: { ...observation.player, lifecycle: "destroyed" },
        };
      },
    };

    await expectRuntimeError(
      () => createRuntime(destroyedPlayerDriver).startManual({ sourceId: "destroyed-player-present" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects every destroyed-actor field mismatch with its remaining cell element", async () => {
    const mismatches = [
      {
        name: "coordinate",
        coordinate: coordinate(2),
        semanticType: "cc1:ball",
        facing: "east",
        movement: "stationary",
      },
      {
        name: "semantic-type",
        coordinate: coordinate(1),
        semanticType: "cc1:fireball",
        facing: "east",
        movement: "stationary",
      },
      {
        name: "facing",
        coordinate: coordinate(1),
        semanticType: "cc1:ball",
        facing: "west",
        movement: "stationary",
      },
      {
        name: "movement",
        coordinate: coordinate(1),
        semanticType: "cc1:ball",
        facing: "east",
        movement: "moving",
      },
    ] as const;

    for (const mismatch of mismatches) {
      const { driver } = createFakeDriver({ async: asyncDriver });
      const actorId = `actor:sha256:destroyed-mismatch-${mismatch.name}` as ActorIdV1;
      const destroyedMismatchDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
        ...driver,
        async observe(token) {
          const observation = await driver.observe(token);
          const cells = observation.cells.map((cell, index) => index === 1 ? {
            ...cell,
            elements: [...cell.elements, {
              identity: { kind: "actor" as const, actorId },
              stratum: "actor" as const,
              semanticType: "cc1:ball",
              facing: "east" as const,
              state: "stationary" as const,
            }],
          } : cell);
          return {
            ...observation,
            cells,
            actors: [{
              observationOrder: 0,
              nativePosition: { collectionId: "ms:creatures", index: 0 },
              actorId,
              identityProvenance: "runtime-projected",
              sourcePlacementId: null,
              semanticType: mismatch.semanticType,
              coordinate: mismatch.coordinate,
              facing: mismatch.facing,
              lifecycle: "destroyed",
              movement: mismatch.movement,
            }],
          };
        },
      };

      await expectRuntimeError(
        () => createRuntime(destroyedMismatchDriver).startManual({
          sourceId: `destroyed-mismatch-${mismatch.name}`,
        }),
        "runtime.invalid-observation",
        "startManual",
      );
    }
  });

  it("rejects a destroyed non-player actor even when its remaining cell element agrees", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const actorId = "actor:sha256:destroyed-present" as ActorIdV1;
    const destroyedPresentDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        const cells = observation.cells.map((cell, index) => index === 1 ? {
          ...cell,
          elements: [...cell.elements, {
            identity: { kind: "actor" as const, actorId },
            stratum: "actor" as const,
            semanticType: "cc1:ball",
            facing: "east" as const,
            state: "stationary" as const,
          }],
        } : cell);
        return {
          ...observation,
          cells,
          actors: [{
            observationOrder: 0,
            nativePosition: { collectionId: "ms:creatures", index: 0 },
            actorId,
            identityProvenance: "runtime-projected",
            sourcePlacementId: null,
            semanticType: "cc1:ball",
            coordinate: coordinate(1),
            facing: "east",
            lifecycle: "destroyed",
            movement: "stationary",
          }],
        };
      },
    };

    await expectRuntimeError(
      () => createRuntime(destroyedPresentDriver).startManual({
        sourceId: "destroyed-present",
      }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects an active actor record that disagrees with its cell element", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const actorId = "actor:sha256:mismatched" as ActorIdV1;
    const mismatchedDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        const actorElement = {
          identity: { kind: "actor", actorId },
          stratum: "actor",
          semanticType: "cc1:ball",
          facing: "east",
          state: "stationary",
        } as const;
        const cells = observation.cells.map((cell, index) => index === 1 ? {
          ...cell,
          elements: [...cell.elements, actorElement],
        } : cell);
        return {
          ...observation,
          cells,
          actors: [{
            observationOrder: 0,
            nativePosition: { collectionId: "ms:creatures", index: 0 },
            actorId,
            identityProvenance: "runtime-projected",
            sourcePlacementId: null,
            semanticType: "cc1:fireball",
            coordinate: coordinate(1),
            facing: "west",
            lifecycle: "active",
            movement: "stationary",
          }],
        };
      },
    };
    const runtime = createRuntime(mismatchedDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "mismatched-actor" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects a phantom actor cell element with no actor record", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const phantomDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async observe(token) {
        const observation = await driver.observe(token);
        const actorElement = {
          identity: { kind: "actor", actorId: "actor:sha256:phantom" as ActorIdV1 },
          stratum: "actor",
          semanticType: "cc1:ball",
          facing: "east",
          state: "stationary",
        } as const;
        const cells = observation.cells.map((cell, index) => index === 1 ? {
          ...cell,
          elements: [...cell.elements, actorElement],
        } : cell);
        return { ...observation, cells };
      },
    };
    const runtime = createRuntime(phantomDriver);

    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "phantom-actor" }),
      "runtime.invalid-observation",
      "startManual",
    );
  });

  it("rejects level, facts, provenance, or geometry rebinding after start", async () => {
    const mutations: readonly [string, (observation: SolverObservation) => SolverObservation][] = [
      ["level", (observation) => ({
        ...observation,
        level: { ...observation.level, occurrenceId: "fixture:rebound-level" },
      })],
      ["level-facts", (observation) => ({
        ...observation,
        levelFacts: {
          ...observation.levelFacts,
          digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      })],
      ["provenance", (observation) => ({
        ...observation,
        provenance: { ...observation.provenance, engineRevision: "fixture-engine-r2" },
      })],
      ["geometry", (observation) => ({
        ...observation,
        geometry: { width: 8, height: 1, depth: 1 },
        cells: observation.cells.map((cell, cellOrdinal) => ({
          ...cell,
          coordinate: coordinate(cellOrdinal),
        })),
      })],
    ];

    for (const [name, mutate] of mutations) {
      const { driver } = createFakeDriver({ async: asyncDriver });
      const rebindingDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
        ...driver,
        async observe(token) {
          const observation = await driver.observe(token);
          return token.tick < 0 ? observation : mutate(observation);
        },
      };
      const runtime = createRuntime(rebindingDriver);
      const run = await runtime.startManual({
        sourceId: `rebind-${name}`,
        initialTick: -1,
      });

      await expectRuntimeError(
        () => runtime.advanceTick(run, { kind: "manual-poll", inputCode: 1 }),
        "runtime.invalid-observation",
        "advanceTick",
      );
      expect((await runtime.observe(run)).boundary.nativeTick).toBe(-1);
    }
  });

  it("starts manual and replay runs and keeps observations detached and non-mutating", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const manual = await runtime.startManual({ sourceId: "manual", initialTick: -1 });
    const replay = await runtime.startReplay({ sourceId: "replay", initialTick: -1, replayInputs: [1] });

    const first = await runtime.observe(manual);
    const second = await runtime.observe(manual);
    expect(first).toEqual(second);
    expect(first.mode).toBe("manual");
    expect(first.boundary.nativeTick).toBe(-1);
    expect((await runtime.observe(replay)).mode).toBe("replay");

    (first.player.coordinate as { x: number }).x = 99;
    (first.cells[0]!.elements[0] as { state: string | null }).state = "mutated";
    expect((await runtime.observe(manual)).player.coordinate?.x).toBe(0);
    expect(await runtime.terminal(manual)).toEqual({ kind: "running" });

    await runtime.advanceTick(manual, { kind: "manual-poll", inputCode: 1 });
    await runtime.advanceTick(replay, { kind: "replay-tick" });
    expect((await runtime.observe(manual)).player.coordinate?.x).toBe(1);
    expect((await runtime.observe(replay)).player.coordinate?.x).toBe(1);
    expect((await runtime.observe(replay)).input.replayCursor).toBe(1);
  });

  it("rejects manual/replay mode mismatches before calling or mutating the driver", async () => {
    const { counters, driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const manual = await runtime.startManual({ sourceId: "manual" });
    const replay = await runtime.startReplay({ sourceId: "replay", replayInputs: [1] });
    const manualBefore = await runtime.observe(manual);
    const replayBefore = await runtime.observe(replay);
    const advanceCount = counters.advances;

    await expectRuntimeError(
      () => runtime.advanceTick(manual, { kind: "replay-tick" }),
      "runtime.mode-mismatch",
      "advanceTick",
    );
    await expectRuntimeError(
      () => runtime.advanceTick(replay, { kind: "manual-poll", inputCode: 1 }),
      "runtime.mode-mismatch",
      "advanceTick",
    );

    expect(counters.advances).toBe(advanceCount);
    expect(await runtime.observe(manual)).toEqual(manualBefore);
    expect(await runtime.observe(replay)).toEqual(replayBefore);
  });

  it("rolls back a mutating driver failure", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({ sourceId: "failure", failInputCode: 13 });
    const before = await runtime.observe(run);

    await expectRuntimeError(
      () => runtime.advanceTick(run, { kind: "manual-poll", inputCode: 13 }),
      "runtime.unsupported-input",
      "advanceTick",
    );

    expect(await runtime.observe(run)).toEqual(before);
  });

  it("captures, clones, and restores eager independent checkpoints", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const original = await runtime.startManual({ sourceId: "branches" });
    await runtime.advanceTick(original, { kind: "manual-poll", inputCode: 1 });
    const checkpoint = await runtime.captureCheckpoint(original);

    expect(checkpoint.metadata).toMatchObject({
      target: "ms",
      mode: "manual",
      level,
      levelFacts,
      nativeTick: 1,
      exactRestoreDigest: "ms:manual:branches:1:1:0:manual:1",
      provenance,
    });
    (checkpoint.metadata as { nativeTick: number }).nativeTick = 99;
    const clonedCheckpoint = await runtime.cloneCheckpoint(checkpoint.handle);
    expect(clonedCheckpoint.metadata.nativeTick).toBe(1);

    await runtime.disposeCheckpoint(checkpoint.handle);
    const east = await runtime.restoreCheckpoint(clonedCheckpoint.handle);
    const west = await runtime.restoreCheckpoint(clonedCheckpoint.handle);
    await runtime.advanceTick(east, { kind: "manual-poll", inputCode: 1 });
    await runtime.advanceTick(west, { kind: "manual-poll", inputCode: -1 });
    expect((await runtime.observe(east)).player.coordinate?.x).toBe(2);
    expect((await runtime.observe(west)).player.coordinate?.x).toBe(0);

    const unchanged = await runtime.restoreCheckpoint(clonedCheckpoint.handle);
    expect((await runtime.observe(unchanged)).player.coordinate?.x).toBe(1);
  });

  it("latches the first terminal result across later ticks and checkpoint restores", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({
      sourceId: "terminal",
      terminalSequence: [wonAt(1, 1), lostAt(2, 0)],
    });
    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: 1 });
    const firstTerminal = await runtime.terminal(run);
    const checkpoint = await runtime.captureCheckpoint(run);
    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: -1 });

    expect(firstTerminal).toEqual(wonAt(1, 1));
    expect(await runtime.terminal(run)).toEqual(firstTerminal);
    const latchedObservation = await runtime.observe(run);
    expect(latchedObservation.terminal).toEqual(firstTerminal);
    expect(latchedObservation.fingerprints.semantic).toBe("semantic:0:0:won");
    const latchedRender = await runtime.projectRender(run, { kind: "full-map" });
    expect(latchedRender.terminal).toEqual(firstTerminal);
    expect(latchedRender.fingerprints.semantic).toBe("semantic:0:0:won");

    (firstTerminal as { coordinate: { x: number } }).coordinate.x = 99;
    expect(await runtime.terminal(run)).toEqual(wonAt(1, 1));

    const restored = await runtime.restoreCheckpoint(checkpoint.handle);
    await runtime.advanceTick(restored, { kind: "manual-poll", inputCode: -1 });
    expect(await runtime.terminal(restored)).toEqual(wonAt(1, 1));
  });

  it("projects deterministic full-map and box regions without retaining observation references", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({ sourceId: "render" });

    const full = await runtime.projectRender(run, { kind: "full-map" });
    expect(full.region).toEqual({
      kind: "full-map",
      minimum: coordinate(0, 0),
      maximum: { x: 3, y: 1, z: 0 },
    });
    expect(full.cells.map(({ cellOrdinal }) => cellOrdinal)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(full.cells[0]!.itemsOrder).toBe("stratum-then-identity");
    expect(full.cells[0]!.items.map(({ projectionOrder, semanticType }) => ({ projectionOrder, semanticType }))).toEqual([
      { projectionOrder: 0, semanticType: "cc1:floor" },
      { projectionOrder: 1, semanticType: "cc1:player" },
    ]);

    const box = await runtime.projectRender(run, {
      kind: "box",
      minimum: coordinate(1, 1),
      maximum: coordinate(1, 1),
    });
    expect(box.cells.map(({ cellOrdinal }) => cellOrdinal)).toEqual([5]);
    (box.cells[0]!.items[0] as { state: string | null }).state = "changed";
    expect(await runtime.projectRender(run, {
      kind: "box",
      minimum: coordinate(1, 1),
      maximum: coordinate(1, 1),
    })).toEqual(boxBeforeMutation(box));

    const beforeInvalidRequest = await runtime.observe(run);
    await expectRuntimeError(
      () => runtime.projectRender(run, {
        kind: "box",
        minimum: coordinate(0, 0),
        maximum: coordinate(4, 1),
      }),
      "runtime.invalid-request",
      "projectRender",
    );
    expect(await runtime.observe(run)).toEqual(beforeInvalidRequest);
  });

  it("detaches queued advance and render requests from later caller mutation", async () => {
    const { driver } = createFakeDriver({ async: asyncDriver });
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({ sourceId: "detached-requests" });
    const firstRequest = { kind: "manual-poll" as const, inputCode: 1 };
    const secondRequest = { kind: "manual-poll" as const, inputCode: 1 };
    const firstAdvance = runtime.advanceTick(run, firstRequest);
    const secondAdvance = runtime.advanceTick(run, secondRequest);
    firstRequest.inputCode = -1;
    secondRequest.inputCode = -1;
    await Promise.all([firstAdvance, secondAdvance]);
    expect((await runtime.observe(run)).player.coordinate?.x).toBe(2);

    const renderRequest = {
      kind: "box" as const,
      minimum: coordinate(1, 0),
      maximum: coordinate(1, 0),
    };
    const projectionPromise = runtime.projectRender(run, renderRequest);
    (renderRequest.minimum as { x: number }).x = 0;
    (renderRequest.maximum as { x: number }).x = 0;
    expect((await projectionPromise).region).toEqual({
      kind: "box",
      minimum: coordinate(1, 0),
      maximum: coordinate(1, 0),
    });
  });
});

function boxBeforeMutation(
  box: Awaited<ReturnType<ReturnType<typeof createRuntime>["projectRender"]>>,
) {
  const copy = structuredClone(box);
  (copy.cells[0]!.items[0] as { state: string | null }).state = null;
  return copy;
}

describe("createSolverRuntimeKernel lifecycle guards", () => {
  it("detaches a start source before an asynchronous driver can observe caller mutation", async () => {
    const { driver } = createFakeDriver();
    const delayedDriver: SolverRuntimeDriver<FakeToken, FakeSource, FakeReplaySource> = {
      ...driver,
      async startManual(source) {
        await Promise.resolve();
        return driver.startManual(source);
      },
    };
    const runtime = createRuntime(delayedDriver);
    const source = { sourceId: "validated-source" };
    const pending = runtime.startManual(source);
    source.sourceId = "mutated-after-start";

    const run = await pending;
    expect((await runtime.observe(run)).fingerprints.exact)
      .toContain("validated-source");
  });

  it("enforces owner, target, disposal, and idempotent disposal checks", async () => {
    const aDriver = createFakeDriver();
    const bDriver = createFakeDriver();
    const lynxDriver = createFakeDriver();
    const a = createRuntime(aDriver.driver, { ownerId: "owner-a" });
    const b = createRuntime(bDriver.driver, { ownerId: "owner-b" });
    const lynx = createRuntime(lynxDriver.driver, { ownerId: "owner-a", target: "lynx" });
    const run = await a.startManual({ sourceId: "guards" });
    const checkpoint = await a.captureCheckpoint(run);

    await expectRuntimeError(
      () => b.observe(run),
      "runtime.run-owner-mismatch",
      "observe",
    );
    await expectRuntimeError(
      () => lynx.observe(run),
      "runtime.target-mismatch",
      "observe",
    );
    await expectRuntimeError(
      () => b.restoreCheckpoint(checkpoint.handle),
      "runtime.checkpoint-owner-mismatch",
      "restoreCheckpoint",
    );
    await expectRuntimeError(
      () => lynx.restoreCheckpoint(checkpoint.handle),
      "runtime.checkpoint-target-mismatch",
      "restoreCheckpoint",
    );

    await a.disposeRun(run);
    await a.disposeRun(run);
    await expectRuntimeError(
      () => a.observe(run),
      "runtime.run-disposed",
      "observe",
    );
    await a.disposeCheckpoint(checkpoint.handle);
    await a.disposeCheckpoint(checkpoint.handle);
    await expectRuntimeError(
      () => a.restoreCheckpoint(checkpoint.handle),
      "runtime.checkpoint-disposed",
      "restoreCheckpoint",
    );
  });

  it("rejects exhausted capacities before invoking driver allocation", async () => {
    const { counters, driver } = createFakeDriver();
    const runtime = createRuntime(driver, { maxRuns: 1, maxCheckpoints: 1 });
    const run = await runtime.startManual({ sourceId: "capacity" });
    const startCount = counters.starts;
    await expectRuntimeError(
      () => runtime.startManual({ sourceId: "blocked" }),
      "runtime.capacity-exhausted",
      "startManual",
    );
    expect(counters.starts).toBe(startCount);

    const checkpoint = await runtime.captureCheckpoint(run);
    const cloneCount = counters.clones;
    await expectRuntimeError(
      () => runtime.cloneCheckpoint(checkpoint.handle),
      "runtime.capacity-exhausted",
      "cloneCheckpoint",
    );
    await expectRuntimeError(
      () => runtime.restoreCheckpoint(checkpoint.handle),
      "runtime.capacity-exhausted",
      "restoreCheckpoint",
    );
    expect(counters.clones).toBe(cloneCount);

    await runtime.disposeRun(run);
    const restored = await runtime.restoreCheckpoint(checkpoint.handle);
    expect((await runtime.observe(restored)).boundary.nativeTick).toBe(0);
  });

  it("rolls back a mutating driver disposal failure", async () => {
    const { driver } = createFakeDriver();
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({ sourceId: "dispose-failure", failDisposal: true });
    const before = await runtime.observe(run);

    await expectRuntimeError(
      () => runtime.disposeRun(run),
      "runtime.adapter-failure",
      "disposeRun",
    );

    expect(await runtime.observe(run)).toEqual(before);
  });

  it("keeps explicit zero and preserve input codes distinct while advancing one poll each", async () => {
    const { driver } = createFakeDriver();
    const runtime = createRuntime(driver);
    const run = await runtime.startManual({ sourceId: "manual-input-codes" });

    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: 0 });
    expect(await runtime.observe(run)).toMatchObject({
      boundary: { nativeTick: 1 },
      input: { lastPolledInputCode: 0, lastAppliedInputCode: 0 },
      player: { coordinate: coordinate(0) },
    });
    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: 1_568 });
    expect(await runtime.observe(run)).toMatchObject({
      boundary: { nativeTick: 2 },
      input: { lastPolledInputCode: 1_568, lastAppliedInputCode: 1_568 },
      player: { coordinate: coordinate(1) },
    });
  });

  it("rejects malformed requests without calling or mutating the driver", async () => {
    const { counters, driver } = createFakeDriver();
    const runtime = createRuntime(driver);
    const run = await runtime.startReplay({ sourceId: "malformed", replayInputs: [] });
    const before = await runtime.observe(run);
    const advanceCount = counters.advances;

    await expectRuntimeError(
      () => runtime.advanceTick(run, { kind: "replay-tick", inputCode: 1 } as never),
      "runtime.input-not-allowed-in-replay",
      "advanceTick",
    );
    await expectRuntimeError(
      () => runtime.projectRender(run, { kind: "unknown" } as never),
      "runtime.invalid-request",
      "projectRender",
    );
    expect(counters.advances).toBe(advanceCount);
    expect(await runtime.observe(run)).toEqual(before);
  });

  it.each(["same-object", "divergent"] as const)(
    "rejects a %s driver clone before registering a run",
    async (cloneBehavior) => {
      const { driver } = createFakeDriver({ cloneBehavior });
      const runtime = createRuntime(driver, { maxRuns: 1 });
      await expectRuntimeError(
        () => runtime.startManual({ sourceId: `bad-clone:${cloneBehavior}` }),
        "runtime.adapter-failure",
        "startManual",
      );
    },
  );
});
