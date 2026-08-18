import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { encodeArtifact, referenceCanonicalJson } from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { parseSolutionFile } from "@content/api/solution-file";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { absoluteMouseMoveCode } from "@player-web/impl/legacyInput";
import {
  MS_DIRECTION,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeEntries } from "@ruleset-ms/impl/elementRegistration";
import { describe, expect, it } from "vitest";
import { buildTworldLynxLevelFacts } from "../buildTworldLynxLevelFacts";
import { buildTworldMsLevelFacts } from "../buildTworldMsLevelFacts";
import {
  createTworldLynxSolverRuntimeAdapter,
} from "./TworldLynxSolverRuntimeAdapter";
import {
  createTworldMsSolverRuntimeAdapter,
} from "./TworldMsSolverRuntimeAdapter";
import type {
  TworldSolverManualStartSource,
  TworldSolverReplayStartSource,
} from "./tworldSolverRuntimeSource";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const sha256 = new WebCryptoSha256();
const runtimeAdapterOptions = {
  sha256,
  adapterRevision: "test:p2a-runtime-adapter",
  engineRevision: "test:p2a-engine",
} as const;

function uint16(value: number): readonly [number, number] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function fileCodeForTile(tileId: number): number {
  const registration = msRegisteredLevelDecodeEntries.find((entry) => entry.tileId === tileId);
  if (!registration) throw new Error(`missing DAT registration for tile ${tileId}`);
  return registration.fileCode;
}

function encodedPlane(overrides: ReadonlyMap<number, number>): number[] {
  const empty = fileCodeForTile(MS_TILE.Empty);
  const fileCodes = Array.from({ length: 1_024 }, (_, pos) => (
    fileCodeForTile(overrides.get(pos) ?? MS_TILE.Empty)
  ));
  const encoded: number[] = [];
  for (let start = 0; start < fileCodes.length;) {
    const code = fileCodes[start] ?? empty;
    let count = 1;
    while (count < 255 && fileCodes[start + count] === code) count += 1;
    if (count === 1) encoded.push(code);
    else encoded.push(0xff, count, code);
    start += count;
  }
  return encoded;
}

function syntheticLevelBytes(input: {
  readonly top: ReadonlyMap<number, number>;
  readonly bottom?: ReadonlyMap<number, number>;
  readonly creaturePositions: readonly number[];
}): Uint8Array {
  const upper = encodedPlane(input.top);
  const lower = encodedPlane(input.bottom ?? new Map());
  const creaturePayload = input.creaturePositions.flatMap((pos) => [pos % 32, Math.floor(pos / 32)]);
  const metadata = [10, creaturePayload.length, ...creaturePayload];
  return Uint8Array.from([
    ...uint16(1),
    ...uint16(0),
    ...uint16(0),
    0,
    0,
    ...uint16(upper.length),
    ...upper,
    ...uint16(lower.length),
    ...lower,
    ...uint16(metadata.length),
    ...metadata,
  ]);
}

async function buildSyntheticSource(
  target: "ms" | "lynx",
  caseId: string,
  levelBytes: Uint8Array,
): Promise<TworldSolverManualStartSource> {
  const ruleset = target === "ms" ? "MS" : "Lynx";
  const template = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: target === "ms" ? "intro-ms.dac" : "intro-lynx.dac",
    levelNumber: 1,
    ruleset,
    randomSeed: 0x1234_5678,
  });
  const loaded = {
    ...template,
    levelData: levelBytes,
    layerData: [levelBytes],
  };
  const common = {
    occurrenceId: `tworld:test:${caseId}`,
    producerRevision: "test:p2a-producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: `test:${caseId}.dat`,
    adapterRevision: "test:p2a-facts-adapter",
    importProfileRevision: "test:p2a-import-profile",
    analyzerRevision: "test:p2a-facts-analyzer",
    catalogRevision: "test:p2a-catalog",
    containerBytes: levelBytes,
    loaded,
  } as const;
  const levelFacts = target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  return {
    loaded,
    levelFacts,
    levelFactsContent: await referenceCanonicalJson(encodeArtifact(levelFacts.facts), sha256),
    provenance: {
      adapterId: target === "ms" ? "tworld-ms-solver-runtime" : "tworld-lynx-solver-runtime",
      adapterRevision: runtimeAdapterOptions.adapterRevision,
      engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
      engineRevision: runtimeAdapterOptions.engineRevision,
    },
    manualOptions: { stepping: target === "ms" ? 0 : null },
  };
}

async function buildIntroSource(
  target: "ms" | "lynx",
  levelNumber: number,
  options: {
    readonly msStepping?: 0 | 4;
    readonly randomSeed?: number;
  } = {},
): Promise<TworldSolverManualStartSource> {
  const ruleset = target === "ms" ? "MS" : "Lynx";
  const seriesFile = target === "ms" ? "intro-ms.dac" : "intro-lynx.dac";
  const loaded = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile,
    levelNumber,
    ruleset,
    randomSeed: options.randomSeed ?? 0x1234_5678,
  });
  const containerBytes = new Uint8Array(await readFile(resolve(repositoryRoot, "data/intro.dat")));
  const common = {
    occurrenceId: `tworld:intro:${levelNumber}`,
    producerRevision: "test:p2a-producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "data/intro.dat",
    adapterRevision: "test:p2a-facts-adapter",
    importProfileRevision: "test:p2a-import-profile",
    analyzerRevision: "test:p2a-facts-analyzer",
    catalogRevision: "test:p2a-catalog",
    containerBytes,
    loaded,
  } as const;
  const levelFacts = target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  const levelFactsCanonicalJson = encodeArtifact(levelFacts.facts);

  return {
    loaded,
    levelFacts,
    levelFactsContent: await referenceCanonicalJson(levelFactsCanonicalJson, sha256),
    provenance: {
      adapterId: target === "ms" ? "tworld-ms-solver-runtime" : "tworld-lynx-solver-runtime",
      adapterRevision: "test:p2a-runtime-adapter",
      engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
      engineRevision: "test:p2a-engine",
    },
    manualOptions: {
      stepping: target === "ms" ? options.msStepping ?? 0 : null,
    },
  };
}

function buildIntroLevel8Source(target: "ms" | "lynx"): Promise<TworldSolverManualStartSource> {
  return buildIntroSource(target, 8);
}

async function buildCclp1ReplaySource(
  target: "ms" | "lynx",
  levelNumber: number,
): Promise<TworldSolverReplayStartSource> {
  const ruleset = target === "ms" ? "MS" : "Lynx";
  const loaded = await new NodeLevelRepository(repositoryRoot).loadLevel({
    seriesFile: target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac",
    levelNumber,
    ruleset,
    randomSeed: 0,
  });
  const containerBytes = new Uint8Array(await readFile(resolve(repositoryRoot, "data/CCLP1.dat")));
  const common = {
    occurrenceId: `tworld:cclp1:${levelNumber}`,
    producerRevision: "test:p2a-producer",
    repository: "tworld",
    repositoryRevision: "git:test-source",
    sourcePath: "data/CCLP1.dat",
    adapterRevision: "test:p2a-facts-adapter",
    importProfileRevision: "test:p2a-import-profile",
    analyzerRevision: "test:p2a-facts-analyzer",
    catalogRevision: "test:p2a-catalog",
    containerBytes,
    loaded,
  } as const;
  const levelFacts = target === "ms"
    ? await buildTworldMsLevelFacts(common, sha256)
    : await buildTworldLynxLevelFacts(common, sha256);
  const level: TworldSolverManualStartSource = {
    loaded,
    levelFacts,
    levelFactsContent: await referenceCanonicalJson(encodeArtifact(levelFacts.facts), sha256),
    provenance: {
      adapterId: target === "ms" ? "tworld-ms-solver-runtime" : "tworld-lynx-solver-runtime",
      adapterRevision: runtimeAdapterOptions.adapterRevision,
      engineId: target === "ms" ? "tworld-ms" : "tworld-lynx",
      engineRevision: runtimeAdapterOptions.engineRevision,
    },
    manualOptions: { stepping: target === "ms" ? 0 : null },
  };
  const solutionBytes = new Uint8Array(await readFile(resolve(
    repositoryRoot,
    target === "ms" ? "save/CCLP1.dac.tws" : "save/CCLP1-lynx.dac.tws",
  )));
  const entry = parseSolutionFile(solutionBytes).entries.find((candidate) => (
    candidate.levelNumber === levelNumber
  ));
  if (!entry?.expandedSolution || entry.bestTimeTicks === null) {
    throw new Error(`missing ${target} CCLP1 replay for level ${levelNumber}`);
  }
  return {
    level,
    replay: {
      bestTimeTicks: entry.bestTimeTicks,
      flags: entry.expandedSolution.flags,
      randomSlideDirection: entry.expandedSolution.randomSlideDirection,
      stepping: entry.expandedSolution.stepping,
      randomSeed: entry.expandedSolution.randomSeed,
      moves: entry.expandedSolution.moves,
      modifierMasks: [],
    },
  };
}

function deviceAt(
  observation: Awaited<ReturnType<ReturnType<typeof createTworldMsSolverRuntimeAdapter>["observe"]>>,
  source: TworldSolverManualStartSource,
  coordinate: { readonly x: number; readonly y: number; readonly z: number },
  semanticType: string,
) {
  const placement = source.levelFacts.facts.payload.placements.find((candidate) => (
    candidate.descriptor.semanticType === semanticType
    && candidate.descriptor.coordinate.x === coordinate.x
    && candidate.descriptor.coordinate.y === coordinate.y
    && candidate.descriptor.coordinate.z === coordinate.z
  ));
  return observation.devices.find((device) => device.placementId === placement?.placementId);
}

function replaySource(
  level: TworldSolverManualStartSource,
  overrides: Partial<TworldSolverReplayStartSource["replay"]> = {},
): TworldSolverReplayStartSource {
  return {
    level,
    replay: {
      bestTimeTicks: 40,
      flags: 0,
      randomSlideDirection: 1,
      stepping: 0,
      randomSeed: 0x1020_3040,
      moves: [{ when: 0, dir: GAME_INPUT_CODES.south }],
      modifierMasks: [],
      ...overrides,
    },
  };
}

describe.each([
  {
    target: "ms" as const,
    create: () => createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions),
  },
  {
    target: "lynx" as const,
    create: () => createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions),
  },
])("$target P2A solver runtime adapter", ({ target, create }) => {
  it("projects the complete bundled Intro 8 state without raw catalog ids", async () => {
    const runtime = create();
    const run = await runtime.startManual(await buildIntroLevel8Source(target));
    const before = await runtime.observe(run);
    const firstRender = await runtime.projectRender(run, { kind: "full-map" });
    const after = await runtime.observe(run);
    const secondRender = await runtime.projectRender(run, { kind: "full-map" });

    expect(after).toEqual(before);
    expect(secondRender).toEqual(firstRender);
    expect(before).toMatchObject({
      target,
      mode: "manual",
      boundary: { nativeTick: -1 },
      geometry: { width: 32, height: 32, depth: 1 },
      player: {
        coordinate: { x: 4, y: 4, z: 0 },
        // MS preserves its existing startup quirk: when Chip is absent from
        // creaturePositions, runtime facing is seeded from the lower tile.
        facing: target === "ms" ? "west" : "south",
        semanticType: "cc1:chip",
      },
      input: { lastAppliedInputCode: null },
      terminal: { kind: "running" },
    });
    expect(before.cells).toHaveLength(1_024);
    expect(firstRender.cells).toHaveLength(1_024);
    expect(before.actors).toHaveLength(7);
    expect(before.actors.find((actor) => (
      actor.coordinate?.x === 23
      && actor.coordinate.y === 12
      && actor.coordinate.z === 0
      && actor.semanticType === "cc1:fireball"
    ))).toMatchObject({
      lifecycle: "contained",
      movement: "stationary",
    });
    expect(before.devices.filter((device) => (
      /(?:clonemachine|clone-machine)/u.test(device.semanticType)
    ))).toHaveLength(1);
    const switchWalls = before.devices.filter((device) => (
      /(?:switchwall|switch-wall|togglewall|toggle-wall)/u.test(device.semanticType)
    ));
    expect(switchWalls).toHaveLength(8);
    expect(switchWalls.every((device) => (
      device.state === (/-open$/u.test(device.semanticType) ? "open" : "closed")
    ))).toBe(true);
    expect(before.cells.flatMap((cell) => cell.elements).every((element) => (
      element.semanticType.startsWith("cc1:")
      && !Object.hasOwn(element, "tileId")
      && !Object.hasOwn(element, "actorNumericId")
    ))).toBe(true);
    expect(canonicalizeJson(before)).not.toMatch(/(?:tileId|actorNumericId|loadPerf|sessionToken)/u);
  }, 30_000);

  it("rejects an unevidenced primary level header before starting the engine", async () => {
    const runtime = create();
    const source = await buildIntroLevel8Source(target);
    const mutatedLevelData = new Uint8Array(source.loaded.levelData);
    mutatedLevelData[0] = (mutatedLevelData[0] ?? 0) ^ 0x01;

    await expect(runtime.startManual({
      ...source,
      loaded: {
        ...source.loaded,
        levelData: mutatedLevelData,
      },
    })).rejects.toMatchObject({
      code: "runtime.invalid-request",
      operation: "startManual",
    });
  }, 30_000);

  it("rejects caller-supplied runtime provenance that the adapter does not own", async () => {
    const runtime = create();
    const source = await buildIntroLevel8Source(target);

    await expect(runtime.startManual({
      ...source,
      provenance: {
        ...source.provenance,
        engineId: "fixture-forged-engine",
      },
    })).rejects.toMatchObject({
      code: "runtime.invalid-request",
      operation: "startManual",
    });
  }, 30_000);

  it("rejects an Empty upper tile masking a lower cloner before starting the engine", async () => {
    const chipPos = 33;
    const invalidPos = 34;
    const validBytes = syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
      ]),
      creaturePositions: [chipPos],
    });
    const invalidBytes = syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
      ]),
      bottom: new Map([
        [invalidPos, MS_TILE.CloneMachine],
      ]),
      creaturePositions: [chipPos],
    });
    const validSource = await buildSyntheticSource(
      target,
      `${target}-invalid-buried-cloner`,
      validBytes,
    );
    const source = {
      ...validSource,
      loaded: {
        ...validSource.loaded,
        levelData: invalidBytes,
        layerData: [invalidBytes],
      },
    };

    await expect(create().startManual(source)).rejects.toMatchObject({
      code: "runtime.unsupported",
      operation: "startManual",
      details: {
        reason: "nonactor-upper-masks-lower-terrain",
        x: invalidPos % 32,
        y: Math.floor(invalidPos / 32),
      },
    });
    await expect(create().startReplay(replaySource(source))).rejects.toMatchObject({
      code: "runtime.unsupported",
      operation: "startReplay",
      details: {
        reason: "nonactor-upper-masks-lower-terrain",
      },
    });
  });

  it("rejects expanded tiles on either plane or a higher source layer", async () => {
    const chipPos = 33;
    const expandedPos = 34;
    const standardBytes = syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
      ]),
      creaturePositions: [chipPos],
    });
    const source = await buildSyntheticSource(target, `${target}-standard-source-scope`, standardBytes);
    const expandedUpper = syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
        [expandedPos, MS_TILE.Sandbag],
      ]),
      creaturePositions: [chipPos],
    });
    const expandedLower = syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
      ]),
      bottom: new Map([
        [expandedPos, MS_TILE.Sandbag],
      ]),
      creaturePositions: [chipPos],
    });
    const cases = [
      { levelData: expandedUpper, layerData: [expandedUpper], z: 1, plane: "upper" },
      { levelData: expandedLower, layerData: [expandedLower], z: 1, plane: "lower" },
      { levelData: standardBytes, layerData: [standardBytes, expandedUpper], z: 2, plane: "upper" },
    ] as const;

    for (const fixture of cases) {
      const expandedSource = {
        ...source,
        loaded: {
          ...source.loaded,
          levelData: fixture.levelData,
          layerData: fixture.layerData,
        },
      };
      await expect(create().startManual(expandedSource)).rejects.toMatchObject({
        code: "runtime.unsupported",
        operation: "startManual",
        details: {
          reason: "expanded-nonstandard-tile",
          displayName: "Sandbag",
          sourceFileCode: 0x70,
          z: fixture.z,
          x: expandedPos % 32,
          y: Math.floor(expandedPos / 32),
        },
      });
      await expect(create().startReplay(replaySource(expandedSource))).rejects.toMatchObject({
        code: "runtime.unsupported",
        operation: "startReplay",
        details: {
          reason: "expanded-nonstandard-tile",
          displayName: "Sandbag",
          sourceFileCode: 0x70,
          z: fixture.z,
          x: expandedPos % 32,
          y: Math.floor(expandedPos / 32),
        },
      });
    }
  });

  it("restores independent exact branches and leaves observation/render reads pure", async () => {
    const runtime = create();
    const run = await runtime.startManual(await buildIntroLevel8Source(target));
    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: GAME_INPUT_CODES.south });
    await runtime.advanceTick(run, { kind: "manual-poll", inputCode: GAME_INPUT_CODES.south });
    const checkpoint = await runtime.captureCheckpoint(run);
    const expected = await runtime.observe(run);
    const restoredA = await runtime.restoreCheckpoint(checkpoint.handle);
    const restoredB = await runtime.restoreCheckpoint(checkpoint.handle);

    expect(await runtime.observe(restoredA)).toEqual(expected);
    expect(await runtime.observe(restoredB)).toEqual(expected);
    await runtime.advanceTick(restoredA, { kind: "manual-poll", inputCode: GAME_INPUT_CODES.east });
    expect(await runtime.observe(restoredB)).toEqual(expected);
    expect((await runtime.captureCheckpoint(restoredB)).metadata.exactRestoreDigest)
      .toBe(checkpoint.metadata.exactRestoreDigest);
  }, 30_000);

  it("starts a true replay at tick -1 and lets only replay ticks consume its plan", async () => {
    const runtime = create();
    const level = await buildIntroLevel8Source(target);
    const run = await runtime.startReplay(replaySource(level));

    expect(await runtime.observe(run)).toMatchObject({
      mode: "replay",
      boundary: { nativeTick: -1 },
      input: {
        replayCursor: 0,
        replayMoveCount: 1,
        replayBestTimeTicks: 40,
      },
    });
    await expect(runtime.advanceTick(run, {
      kind: "manual-poll",
      inputCode: GAME_INPUT_CODES.east,
    })).rejects.toMatchObject({
      code: "runtime.mode-mismatch",
      operation: "advanceTick",
    });
    await runtime.advanceTick(run, { kind: "replay-tick" });
    expect(await runtime.observe(run)).toMatchObject({
      mode: "replay",
      boundary: { nativeTick: 0 },
      input: {
        replayCursor: 1,
        replayMoveCount: 1,
        replayBestTimeTicks: 40,
      },
    });
  }, 30_000);
});

describe("MS P2A input polling characterization", () => {
  it("records released none separately from legacy preserve and retains manual stepping", async () => {
    const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
    const source = await buildIntroSource("ms", 1);
    const released = await runtime.startManual(source);
    const preserved = await runtime.startManual(source);
    const initial = await runtime.observe(released);
    const mouseTarget = initial.player.coordinate!.y * 32 + initial.player.coordinate!.x + 3;
    const mouseInput = absoluteMouseMoveCode(mouseTarget);

    await runtime.advanceTick(released, {
      kind: "manual-poll",
      inputCode: mouseInput,
    });
    await runtime.advanceTick(preserved, {
      kind: "manual-poll",
      inputCode: mouseInput,
    });
    for (let tick = 1; tick <= 4; tick += 1) {
      await runtime.advanceTick(released, {
        kind: "manual-poll",
        inputCode: GAME_INPUT_CODES.none,
      });
      await runtime.advanceTick(preserved, {
        kind: "manual-poll",
        inputCode: GAME_INPUT_CODES.preserve,
      });
    }

    const releasedObservation = await runtime.observe(released);
    const preservedObservation = await runtime.observe(preserved);
    expect(releasedObservation.input.lastPolledInputCode).toBe(GAME_INPUT_CODES.none);
    expect(preservedObservation.input.lastPolledInputCode).toBe(GAME_INPUT_CODES.preserve);
    expect(releasedObservation.input.lastAppliedInputCode).toBe(GAME_INPUT_CODES.none);
    expect(preservedObservation.input.lastAppliedInputCode).toBe(GAME_INPUT_CODES.none);
    expect(preservedObservation.fingerprints.exact)
      .not.toBe(releasedObservation.fingerprints.exact);

    const stepped = await runtime.startManual(await buildIntroSource("ms", 1, {
      msStepping: 4,
    }));
    expect((await runtime.observe(stepped)).randomness.stepping).toBe(4);
  }, 30_000);
});

describe("Lynx P2A input polling characterization", () => {
  it("distinguishes a tapped direction from a direction re-polled while held", async () => {
    const runtime = createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions);
    const source = await buildIntroSource("lynx", 1);
    const tapped = await runtime.startManual(source);
    const held = await runtime.startManual(source);

    for (let tick = 0; tick < 8; tick += 1) {
      await runtime.advanceTick(tapped, {
        kind: "manual-poll",
        inputCode: tick === 0 ? GAME_INPUT_CODES.east : GAME_INPUT_CODES.none,
      });
      await runtime.advanceTick(held, {
        kind: "manual-poll",
        inputCode: GAME_INPUT_CODES.east,
      });
    }

    const tappedObservation = await runtime.observe(tapped);
    const heldObservation = await runtime.observe(held);
    expect(tappedObservation.input.lastPolledInputCode).toBe(GAME_INPUT_CODES.none);
    expect(heldObservation.input.lastPolledInputCode).toBe(GAME_INPUT_CODES.east);
    expect(tappedObservation.input.lastAppliedInputCode).toBe(GAME_INPUT_CODES.none);
    expect(heldObservation.input.lastAppliedInputCode).toBe(GAME_INPUT_CODES.east);
    expect(heldObservation.player.coordinate!.x)
      .toBeGreaterThan(tappedObservation.player.coordinate!.x);
    expect(heldObservation.fingerprints.exact)
      .not.toBe(tappedObservation.fingerprints.exact);
  }, 30_000);
});

describe.each([
  {
    target: "ms" as const,
    create: () => createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions),
  },
  {
    target: "lynx" as const,
    create: () => createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions),
  },
])("$target P2A replay continuation characterization", ({ target, create }) => {
  it("preserves replay initialization and cursor exactly through checkpoint/restore", async () => {
    const runtime = create();
    const source = await buildIntroSource(target, 1);
    const replay = replaySource(source, {
      bestTimeTicks: 123,
      randomSeed: 0x0bad_cafe,
      randomSlideDirection: GAME_INPUT_CODES.east,
      stepping: 5,
      moves: [
        { when: 0, dir: GAME_INPUT_CODES.east },
        { when: 4, dir: GAME_INPUT_CODES.none },
      ],
    });
    const run = await runtime.startReplay(replay);
    const initial = await runtime.observe(run);
    expect(initial).toMatchObject({
      input: {
        replayCursor: 0,
        replayMoveCount: 2,
        replayBestTimeTicks: 123,
      },
      randomness: {
        stepping: 5,
        initialRandomSlideDirection: "east",
      },
    });

    const differentSeedRun = await runtime.startReplay(replaySource(source, {
      ...replay.replay,
      randomSeed: replay.replay.randomSeed + 1,
    }));
    const differentSeed = await runtime.observe(differentSeedRun);
    expect(differentSeed.randomness.nativeStateFingerprints)
      .not.toEqual(initial.randomness.nativeStateFingerprints);

    const differentDeadlineRun = await runtime.startReplay(replaySource(source, {
      ...replay.replay,
      bestTimeTicks: replay.replay.bestTimeTicks + 1,
    }));
    const differentDeadline = await runtime.observe(differentDeadlineRun);
    expect(differentDeadline.fingerprints.exact).not.toBe(initial.fingerprints.exact);
    expect(differentDeadline.fingerprints.semantic).not.toBe(initial.fingerprints.semantic);
    expect(differentDeadline.input.replayBestTimeTicks).toBe(124);
    expect(differentDeadline.level).toEqual(initial.level);
    expect(differentDeadline.player).toEqual(initial.player);
    expect(differentDeadline.cells).toEqual(initial.cells);

    await runtime.advanceTick(run, { kind: "replay-tick" });
    const consumed = await runtime.observe(run);
    expect(consumed.input.replayCursor).toBe(1);
    const checkpoint = await runtime.captureCheckpoint(run);
    expect(checkpoint.metadata.exactRestoreDigest).toBe(consumed.fingerprints.exact);
    const checkpointClone = await runtime.cloneCheckpoint(checkpoint.handle);
    const restored = await runtime.restoreCheckpoint(checkpointClone.handle);
    expect(await runtime.observe(restored)).toEqual(consumed);
    await runtime.advanceTick(restored, { kind: "replay-tick" });
    expect((await runtime.observe(restored)).input.replayCursor).toBe(1);
  }, 30_000);
});

describe("P2A replay deadline characterization", () => {
  it("reports replay-deadline failure distinctly from an ordinary Chip death", async () => {
    const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
    const source = await buildIntroSource("ms", 1);
    const run = await runtime.startReplay(replaySource(source, {
      bestTimeTicks: 0,
      moves: [],
    }));

    let terminal = await runtime.terminal(run);
    for (let tick = 0; tick < 4 && terminal.kind === "running"; tick += 1) {
      await runtime.advanceTick(run, { kind: "replay-tick" });
      terminal = await runtime.terminal(run);
    }

    expect(terminal).toMatchObject({
      kind: "lost",
      nativeTick: 2,
      cause: "cc1:replay-deadline",
    });
  }, 30_000);

  it("retains Lynx best-time metadata without inventing MS deadline enforcement", async () => {
    const runtime = createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions);
    const source = await buildIntroSource("lynx", 1);
    const run = await runtime.startReplay(replaySource(source, {
      bestTimeTicks: 0,
      moves: [],
    }));

    for (let tick = 0; tick < 8; tick += 1) {
      await runtime.advanceTick(run, { kind: "replay-tick" });
    }

    expect(await runtime.terminal(run)).toEqual({ kind: "running" });
    expect((await runtime.observe(run)).input.replayBestTimeTicks).toBe(0);
  }, 30_000);
});

describe.each([
  {
    target: "ms" as const,
    create: () => createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions),
  },
  {
    target: "lynx" as const,
    create: () => createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions),
  },
])("$target P2A terminal characterization", ({ target, create }) => {
  it("reports the first terminal trigger and latches it across later engine ticks", async () => {
    const runtime = create();
    const run = await runtime.startManual(await buildIntroSource(target, 7));
    let trigger = await runtime.terminal(run);
    for (let tick = 0; tick < 32 && trigger.kind === "running"; tick += 1) {
      await runtime.advanceTick(run, {
        kind: "manual-poll",
        inputCode: tick % 4 === 0 ? GAME_INPUT_CODES.south : GAME_INPUT_CODES.none,
      });
      trigger = await runtime.terminal(run);
    }

    expect(trigger.kind).toBe("lost");
    if (trigger.kind === "running") throw new Error("expected a bounded terminal trigger");
    const atTrigger = await runtime.observe(run);
    expect(atTrigger.terminal).toEqual(trigger);
    expect(atTrigger.player.lifecycle).toBe("destroyed");
    expect(atTrigger.cells.some((cell) => cell.elements.some((element) => (
      element.identity.kind === "actor"
      && element.identity.actorId === atTrigger.player.actorId
    )))).toBe(false);
    const checkpoint = await runtime.captureCheckpoint(run);
    expect(checkpoint.metadata.nativeTick).toBe(trigger.nativeTick);

    await runtime.advanceTick(run, {
      kind: "manual-poll",
      inputCode: GAME_INPUT_CODES.none,
    });
    const afterTrigger = await runtime.observe(run);
    expect(afterTrigger.terminal).toEqual(trigger);
    if (target === "lynx") {
      // Lynx raises endGameResult before its settlement/animation ticks finish.
      expect(afterTrigger.fingerprints.exact).not.toBe(atTrigger.fingerprints.exact);
    }

    const restored = await runtime.restoreCheckpoint(checkpoint.handle);
    expect(await runtime.terminal(restored)).toEqual(trigger);
  }, 30_000);
});

describe("P2A target-derived button and trap projection", () => {
  it("projects an MS held brown button and its raw-unflagged beartrap as open", async () => {
    const source = await buildCclp1ReplaySource("ms", 7);
    const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
    const run = await runtime.startReplay(source);
    for (let tick = 0; tick <= 28; tick += 1) {
      await runtime.advanceTick(run, { kind: "replay-tick" });
    }
    const observation = await runtime.observe(run);
    const pressedButton = observation.devices.find((device) => (
      device.semanticType === "cc1:button-brown" && device.state === "pressed"
    ));
    const buttonPlacement = source.level.levelFacts.facts.payload.placements.find((placement) => (
      placement.placementId === pressedButton?.placementId
    ));
    const wiring = source.level.levelFacts.facts.payload.wiring.find((candidate) => (
      candidate.descriptor.kind === "cc1:trap-release"
      && candidate.descriptor.sourcePlacementId === pressedButton?.placementId
    ));

    expect(pressedButton).toBeDefined();
    expect(observation.actors.find((actor) => (
      actor.semanticType === "cc1:block"
      && actor.coordinate?.x === buttonPlacement?.descriptor.coordinate.x
      && actor.coordinate?.y === buttonPlacement?.descriptor.coordinate.y
      && actor.coordinate?.z === buttonPlacement?.descriptor.coordinate.z
    ))).toMatchObject({
      identityProvenance: "initial-placement",
      sourcePlacementId: expect.stringMatching(/^placement:sha256:/u),
    });
    expect(observation.devices.find((device) => (
      device.placementId === wiring?.descriptor.targetPlacementId
    ))?.state).toBe("open");
  }, 30_000);

  it("keeps a moving Lynx block from holding a button, then opens the trap when it settles", async () => {
    const source = await buildCclp1ReplaySource("lynx", 7);
    const runtime = createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions);
    const run = await runtime.startReplay(source);
    for (let tick = 0; tick <= 22; tick += 1) {
      await runtime.advanceTick(run, { kind: "replay-tick" });
    }
    const moving = await runtime.observe(run);
    expect(moving.actors).toContainEqual(expect.objectContaining({
      semanticType: "cc1:block",
      coordinate: { x: 15, y: 15, z: 0 },
      movement: "moving",
    }));
    expect(deviceAt(moving, source.level, { x: 15, y: 15, z: 0 }, "cc1:button-brown")?.state)
      .toBe("released");

    await runtime.advanceTick(run, { kind: "replay-tick" });
    const settled = await runtime.observe(run);
    const button = deviceAt(settled, source.level, { x: 15, y: 15, z: 0 }, "cc1:button-brown");
    const wiring = source.level.levelFacts.facts.payload.wiring.find((candidate) => (
      candidate.descriptor.kind === "cc1:trap-release"
      && candidate.descriptor.sourcePlacementId === button?.placementId
    ));
    expect(button?.state).toBe("pressed");
    expect(settled.devices.find((device) => (
      device.placementId === wiring?.descriptor.targetPlacementId
    ))?.state).toBe("open");
  }, 30_000);
});

describe.each([
  {
    target: "ms" as const,
    create: () => createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions),
  },
  {
    target: "lynx" as const,
    create: () => createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions),
  },
])("$target P2A semantic cell/device projection", ({ target, create }) => {
  it("keeps catalog pickups above terrain and every held button coherent with its device", async () => {
    const chipPos = 33;
    const trappedActorPos = 34;
    const pickupCases = [
      { pos: 35, tileId: MS_TILE.Key_Red, semanticType: "cc1:key-red" },
      { pos: 36, tileId: MS_TILE.Boots_Ice, semanticType: "cc1:boots-ice" },
      { pos: 37, tileId: MS_TILE.ICChip, semanticType: "cc1:icchip" },
    ] as const;
    const buttonCases = [
      { pos: 65, tileId: MS_TILE.Button_Blue, semanticType: "cc1:button-blue" },
      { pos: 66, tileId: MS_TILE.Button_Green, semanticType: "cc1:button-green" },
      { pos: 67, tileId: MS_TILE.Button_Red, semanticType: "cc1:button-red" },
      { pos: 68, tileId: MS_TILE.Button_Brown, semanticType: "cc1:button-brown" },
    ] as const;
    const top = new Map<number, number>([
      [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
      [trappedActorPos, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east)],
      ...pickupCases.map((entry) => [entry.pos, entry.tileId] as const),
      ...buttonCases.map((entry) => [entry.pos, MS_TILE.Block_Static] as const),
    ]);
    const bottom = new Map<number, number>([
      [chipPos, MS_TILE.Beartrap],
      [trappedActorPos, MS_TILE.Beartrap],
      ...buttonCases.map((entry) => [entry.pos, entry.tileId] as const),
    ]);
    const source = await buildSyntheticSource(target, `${target}-semantic-cells`, syntheticLevelBytes({
      top,
      bottom,
      creaturePositions: [chipPos, trappedActorPos],
    }));
    const runtime = create();
    const run = await runtime.startManual(source);
    const observation = await runtime.observe(run);

    expect(observation.player).toMatchObject({
      movement: "trapped",
      control: "unavailable",
      inputInfluence: "blocked",
    });
    expect(observation.actors).toContainEqual(expect.objectContaining({
      semanticType: "cc1:ball",
      coordinate: {
        x: trappedActorPos % 32,
        y: Math.floor(trappedActorPos / 32),
        z: 0,
      },
      movement: "trapped",
    }));
    for (const pickup of pickupCases) {
      const placement = source.levelFacts.facts.payload.placements.find((candidate) => (
        candidate.descriptor.semanticType === pickup.semanticType
      ));
      const cell = observation.cells.find((candidate) => (
        candidate.coordinate.x === pickup.pos % 32
        && candidate.coordinate.y === Math.floor(pickup.pos / 32)
      ));
      expect(cell?.elements).toContainEqual(expect.objectContaining({
        semanticType: pickup.semanticType,
        stratum: "pickup",
        identity: { kind: "placement", placementId: placement?.placementId },
      }));
    }
    for (const button of buttonCases) {
      const placement = source.levelFacts.facts.payload.placements.find((candidate) => (
        candidate.descriptor.semanticType === button.semanticType
      ));
      const device = observation.devices.find((candidate) => candidate.placementId === placement?.placementId);
      const cell = observation.cells.find((candidate) => (
        candidate.coordinate.x === button.pos % 32
        && candidate.coordinate.y === Math.floor(button.pos / 32)
      ));
      expect(device?.state).toBe("pressed");
      expect(cell?.elements).toContainEqual(expect.objectContaining({
        semanticType: button.semanticType,
        state: "pressed",
        identity: { kind: "placement", placementId: placement?.placementId },
      }));
    }
  }, 30_000);

  it("keeps one switch-wall placement and derives device state after a real open/closed flip", async () => {
    const chipPos = 33;
    const buttonPos = 34;
    const switchWallPos = 66;
    const source = await buildSyntheticSource(target, `${target}-switchwall-flip`, syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
        [buttonPos, MS_TILE.Button_Green],
        [switchWallPos, MS_TILE.SwitchWall_Closed],
      ]),
      creaturePositions: [chipPos],
    }));
    const switchPlacement = source.levelFacts.facts.payload.placements.find((placement) => (
      placement.descriptor.semanticType === "cc1:switchwall-closed"
    ));
    const runtime = create();
    const run = await runtime.startManual(source);
    expect(deviceAt(await runtime.observe(run), source, {
      x: switchWallPos % 32,
      y: Math.floor(switchWallPos / 32),
      z: 0,
    }, "cc1:switchwall-closed")?.state).toBe("closed");

    const tickCount = target === "ms" ? 1 : 5;
    for (let tick = 0; tick < tickCount; tick += 1) {
      await runtime.advanceTick(run, {
        kind: "manual-poll",
        inputCode: GAME_INPUT_CODES.east,
      });
    }
    const observation = await runtime.observe(run);
    const device = observation.devices.find((candidate) => candidate.placementId === switchPlacement?.placementId);
    const cell = observation.cells.find((candidate) => (
      candidate.coordinate.x === switchWallPos % 32
      && candidate.coordinate.y === Math.floor(switchWallPos / 32)
    ));

    expect(device).toMatchObject({
      placementId: switchPlacement?.placementId,
      state: "open",
    });
    expect(cell?.elements).toContainEqual(expect.objectContaining({
      semanticType: "cc1:switchwall-open",
      identity: { kind: "placement", placementId: switchPlacement?.placementId },
    }));
  }, 30_000);
});

describe("MS P2A materialized actor identity", () => {
  it("keeps a dormant block's initial ActorId when its first push teleports", async () => {
    const chipPos = 10 * 32 + 10;
    const blockPos = 11 * 32 + 10;
    const entryTeleportPos = 12 * 32 + 10;
    const destinationTeleportPos = 5 * 32 + 5;
    const source = await buildSyntheticSource("ms", "ms-teleport-first-push", syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south)],
        [blockPos, MS_TILE.Block_Static],
        [entryTeleportPos, MS_TILE.Teleport],
        [destinationTeleportPos, MS_TILE.Teleport],
      ]),
      creaturePositions: [chipPos],
    }));
    const blockPlacement = source.levelFacts.facts.payload.placements.find((placement) => (
      placement.descriptor.semanticType === "cc1:block"
      && placement.descriptor.coordinate.x === blockPos % 32
      && placement.descriptor.coordinate.y === Math.floor(blockPos / 32)
    ));
    const initialBlock = source.levelFacts.facts.payload.actors.find((actor) => (
      actor.descriptor.placementId === blockPlacement?.placementId
    ));
    const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
    const run = await runtime.startManual(source);

    await runtime.advanceTick(run, {
      kind: "manual-poll",
      inputCode: GAME_INPUT_CODES.south,
    });
    const observation = await runtime.observe(run);
    const moved = observation.actors.find((actor) => (
      actor.coordinate?.x === destinationTeleportPos % 32
      && actor.coordinate.y === Math.floor(destinationTeleportPos / 32)
      && actor.semanticType === "cc1:block"
    ));

    expect(initialBlock).toBeDefined();
    expect(moved).toMatchObject({
      actorId: initialBlock?.actorId,
      identityProvenance: "initial-placement",
      sourcePlacementId: initialBlock?.descriptor.placementId,
      movement: "teleporting",
    });
    const checkpoint = await runtime.captureCheckpoint(run);
    expect(checkpoint.metadata.exactRestoreDigest).toBe(observation.fingerprints.exact);
    const restored = await runtime.restoreCheckpoint(checkpoint.handle);
    expect((await runtime.observe(restored)).actors.find((actor) => (
      actor.coordinate?.x === destinationTeleportPos % 32
      && actor.coordinate.y === Math.floor(destinationTeleportPos / 32)
    ))).toMatchObject({
      actorId: initialBlock?.actorId,
      sourcePlacementId: initialBlock?.descriptor.placementId,
    });
  }, 30_000);

  it("keeps a Ball active when an exposed clone machine blocks entry", async () => {
    const chipPos = 33;
    const clonerPos = 10 * 32 + 10;
    const ballPos = clonerPos - 1;
    const source = await buildSyntheticSource("ms", "ms-ball-blocked-by-exposed-cloner", syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
        [ballPos, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east)],
        [clonerPos, MS_TILE.CloneMachine],
      ]),
      creaturePositions: [chipPos, ballPos],
    }));
    const ballPlacement = source.levelFacts.facts.payload.placements.find((placement) => (
      placement.descriptor.coordinate.x === ballPos % 32
      && placement.descriptor.coordinate.y === Math.floor(ballPos / 32)
      && placement.descriptor.semanticType === "cc1:ball"
    ));
    const sourceActor = source.levelFacts.facts.payload.actors.find((actor) => (
      actor.descriptor.placementId === ballPlacement?.placementId
    ));
    const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
    const run = await runtime.startManual(source);

    for (let tick = 0; tick < 5; tick += 1) {
      await runtime.advanceTick(run, {
        kind: "manual-poll",
        inputCode: tick === 0 ? GAME_INPUT_CODES.east : GAME_INPUT_CODES.none,
      });
    }
    const observation = await runtime.observe(run);
    const projected = observation.actors.filter((actor) => actor.actorId === sourceActor?.actorId);
    const clonerCell = observation.cells.find((cell) => (
      cell.coordinate.x === clonerPos % 32
      && cell.coordinate.y === Math.floor(clonerPos / 32)
    ));

    expect(sourceActor).toBeDefined();
    expect(projected).toEqual([
      expect.objectContaining({
        identityProvenance: "initial-placement",
        sourcePlacementId: ballPlacement?.placementId,
        lifecycle: "active",
        facing: "west",
        coordinate: { x: (ballPos - 1) % 32, y: Math.floor(ballPos / 32), z: 0 },
      }),
    ]);
    expect(clonerCell?.elements.filter((element) => (
      element.identity.kind === "actor"
    ))).toHaveLength(0);
    expect(clonerCell?.elements).toContainEqual(expect.objectContaining({
      semanticType: "cc1:clonemachine",
    }));

    const checkpoint = await runtime.captureCheckpoint(run);
    const restored = await runtime.restoreCheckpoint(checkpoint.handle);
    expect(await runtime.observe(restored)).toEqual(observation);
  }, 30_000);

  it.each([
    { landing: "emitted", landingTile: MS_TILE.Empty, expectedLifecycle: "active" },
    { landing: "destroyed", landingTile: MS_TILE.Bomb, expectedLifecycle: "destroyed" },
  ] as const)(
    "keeps a clone-machine block source contained when its copy is $landing",
    async ({ landing, landingTile, expectedLifecycle }) => {
      const clonerPos = 10 * 32 + 10;
      const chipPos = clonerPos - 1;
      const exitPos = clonerPos + 1;
      const source = await buildSyntheticSource("ms", `ms-cloner-block-${landing}`, syntheticLevelBytes({
        top: new Map([
          [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
          [clonerPos, MS_TILE.Block_Static],
          [exitPos, landingTile],
        ]),
        bottom: new Map([[clonerPos, MS_TILE.CloneMachine]]),
        creaturePositions: [chipPos, clonerPos],
      }));
      const sourcePlacement = source.levelFacts.facts.payload.placements.find((placement) => (
        placement.descriptor.coordinate.x === clonerPos % 32
        && placement.descriptor.coordinate.y === Math.floor(clonerPos / 32)
        && placement.descriptor.semanticType === "cc1:block"
      ));
      const sourceActor = source.levelFacts.facts.payload.actors.find((actor) => (
        actor.descriptor.placementId === sourcePlacement?.placementId
      ));
      const runtime = createTworldMsSolverRuntimeAdapter(runtimeAdapterOptions);
      const run = await runtime.startManual(source);

      const before = await runtime.observe(run);
      expect(sourceActor).toMatchObject({ disposition: "contained" });
      expect(before.actors.filter((actor) => actor.actorId === sourceActor?.actorId)).toEqual([
        expect.objectContaining({
          lifecycle: "contained",
          coordinate: { x: clonerPos % 32, y: Math.floor(clonerPos / 32), z: 0 },
        }),
      ]);

      await runtime.advanceTick(run, {
        kind: "manual-poll",
        inputCode: GAME_INPUT_CODES.east,
      });
      const observation = await runtime.observe(run);
      const contained = observation.actors.find((actor) => actor.actorId === sourceActor?.actorId);
      const emitted = observation.actors.find((actor) => (
        actor.semanticType === "cc1:block" && actor.actorId !== sourceActor?.actorId
      ));
      const sourceCell = observation.cells.find((cell) => (
        cell.coordinate.x === clonerPos % 32
        && cell.coordinate.y === Math.floor(clonerPos / 32)
      ));
      const sourceRender = await runtime.projectRender(run, {
        kind: "box",
        minimum: { x: clonerPos % 32, y: Math.floor(clonerPos / 32), z: 0 },
        maximum: { x: clonerPos % 32, y: Math.floor(clonerPos / 32), z: 0 },
      });

      expect(contained).toMatchObject({
        identityProvenance: "initial-placement",
        sourcePlacementId: sourcePlacement?.placementId,
        lifecycle: "contained",
        coordinate: { x: clonerPos % 32, y: Math.floor(clonerPos / 32), z: 0 },
      });
      expect(emitted).toMatchObject({
        identityProvenance: "runtime-projected",
        sourcePlacementId: null,
        lifecycle: expectedLifecycle,
      });
      expect(emitted?.actorId).not.toBe(sourceActor?.actorId);
      expect(sourceCell?.elements.filter((element) => element.identity.kind === "actor")).toEqual([
        expect.objectContaining({
          identity: { kind: "actor", actorId: sourceActor?.actorId },
          semanticType: "cc1:block",
        }),
      ]);
      expect(sourceRender.cells[0]?.items.filter((item) => item.identity.kind === "actor")).toEqual([
        expect.objectContaining({
          identity: { kind: "actor", actorId: sourceActor?.actorId },
          semanticType: "cc1:block",
        }),
      ]);

      const checkpoint = await runtime.captureCheckpoint(run);
      const restored = await runtime.restoreCheckpoint(checkpoint.handle);
      const restoredObservation = await runtime.observe(restored);
      const restoredActors = restoredObservation.actors;
      expect(restoredActors.find((actor) => actor.actorId === emitted?.actorId)).toMatchObject({
        identityProvenance: "runtime-projected",
        sourcePlacementId: null,
        lifecycle: expectedLifecycle,
      });
      expect(restoredObservation).toEqual(observation);
    },
    30_000,
  );

});

describe("Lynx P2A contained dormant block projection", () => {
  it("projects an unordered static block on a clone machine as contained", async () => {
    const chipPos = 33;
    const clonerPos = 10 * 32 + 10;
    const source = await buildSyntheticSource("lynx", "lynx-unordered-cloner-block", syntheticLevelBytes({
      top: new Map([
        [chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)],
        [clonerPos, MS_TILE.Block_Static],
      ]),
      bottom: new Map([[clonerPos, MS_TILE.CloneMachine]]),
      creaturePositions: [chipPos],
    }));
    const sourcePlacement = source.levelFacts.facts.payload.placements.find((placement) => (
      placement.descriptor.coordinate.x === clonerPos % 32
      && placement.descriptor.coordinate.y === Math.floor(clonerPos / 32)
      && placement.descriptor.semanticType === "cc1:block"
    ));
    const sourceActor = source.levelFacts.facts.payload.actors.find((actor) => (
      actor.descriptor.placementId === sourcePlacement?.placementId
    ));
    const runtime = createTworldLynxSolverRuntimeAdapter(runtimeAdapterOptions);
    const run = await runtime.startManual(source);
    const observation = await runtime.observe(run);
    const projected = observation.actors.find((actor) => actor.actorId === sourceActor?.actorId);
    const cell = observation.cells.find((candidate) => (
      candidate.coordinate.x === clonerPos % 32
      && candidate.coordinate.y === Math.floor(clonerPos / 32)
    ));

    expect(sourceActor).toMatchObject({
      declaredSourceOrder: null,
      disposition: "contained",
    });
    expect(projected).toMatchObject({
      identityProvenance: "initial-placement",
      sourcePlacementId: sourcePlacement?.placementId,
      lifecycle: "contained",
      movement: "stationary",
      coordinate: { x: clonerPos % 32, y: Math.floor(clonerPos / 32), z: 0 },
    });
    expect(cell?.elements.filter((element) => (
      element.identity.kind === "actor" && element.identity.actorId === sourceActor?.actorId
    ))).toHaveLength(1);
  }, 30_000);
});
