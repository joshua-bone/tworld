import { describe, expect, it } from "vitest";
import { LYNX_SOUND } from "@ruleset-lynx/impl/engine";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import {
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_MOVEMENT_CLASS,
  HYBRID_CC_V1_MOVEMENT_OWNER,
} from "./engineFacts";
import {
  HybridCcV1GameEngineAdapter,
  HybridCcV1LevelRegistry,
} from "./HybridCcV1GameEngineAdapter";
import {
  HYBRIDCC_V1_INPUT,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  inspectHybridCcV1NativeLevel,
} from "./wasmBridge";
import { hybridCcV1PresentedMotion } from "./presentationProjection";

const ELEMENT = {
  floor: 2,
  wall: 3,
  trickWall: 7,
  ice: 10,
  forceFloor: 11,
  teleport: 13,
  trap: 14,
  steppingStone: 15,
  thief: 18,
  key: 29,
  flippers: 32,
  dirtBlock: 38,
  teeth: 45,
  ball: 46,
  player: 51,
} as const;

const COLOR = {
  blue: 2,
  white: 5,
  brown: 12,
} as const;

const DIRECTION = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
  none: 4,
} as const;

const IDLE_REASON = {
  inProgress: 1,
  cooldown: 2,
} as const;

const RULE = {
  becomesWall: 2,
  permanentlyInvisible: 5,
  fromCenter: 6,
  cannotOverride: 12,
  startsHolding: 16,
  stealTools: 23,
} as const;

const OUTCOME = {
  unfinished: 0,
  loss: 2,
} as const;

const LOSS_CAUSE = {
  dirtBlock: 15,
} as const;

const EVENT = {
  interaction: 10,
  terminal: 14,
} as const;

const INTERACTION = {
  push: 8,
  reveal: 9,
} as const;

const MOVEMENT = {
  teleportOwner: 7,
  teleportClass: 6,
} as const;

interface ElementFixture {
  readonly id: number;
  readonly color?: number;
  readonly direction?: number;
  readonly rule?: number;
  readonly channel?: string;
  readonly count?: number;
  readonly countIsUnlimited?: boolean;
}

interface CellFixture {
  readonly terrain?: ElementFixture;
  readonly actor?: ElementFixture;
}

class ByteWriter {
  readonly bytes: number[] = [];

  u8(value: number): void {
    this.bytes.push(value & 0xff);
  }

  u16(value: number): void {
    this.u8(value);
    this.u8(value >>> 8);
  }

  u32(value: number): void {
    this.u16(value);
    this.u16(value >>> 16);
  }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value);
    this.u32(encoded.length);
    this.bytes.push(...encoded);
  }
}

function writeElement(writer: ByteWriter, fixture: ElementFixture = { id: 0 }): void {
  writer.u16(fixture.id);
  writer.u8(fixture.color ?? COLOR.white);
  writer.u8(fixture.direction ?? DIRECTION.none);
  writer.u8(1); // normal speed
  writer.u16(fixture.rule ?? 0);
  writer.u8(0); // normal impact
  writer.u8(0); // no movement rule
  writer.u8(0); // no orientation

  const channel = fixture.channel === undefined
    ? new Uint8Array()
    : new TextEncoder().encode(fixture.channel);
  writer.u8(fixture.channel === undefined ? 1 : 0);
  writer.u8(channel.length);
  for (let index = 0; index < 4; index += 1) writer.u8(channel[index] ?? 0);

  writer.u32(fixture.count ?? 0);
  writer.u8(fixture.countIsUnlimited ? 1 : 0);
  writer.u32(0xffff_ffff); // no text
  writer.u32(0); // no exit time limit
}

function nativeRectangle(
  title: string,
  width: number,
  height: number,
  cells: readonly CellFixture[],
): Uint8Array {
  if (width <= 0 || height <= 0 || cells.length !== width * height) {
    throw new Error(
      `Hybrid v1 fixture ${title} has ${cells.length} cells for ${width}x${height}.`,
    );
  }
  const writer = new ByteWriter();
  writer.bytes.push(0x48, 0x43, 0x4c, 0x56);
  writer.u16(4);
  writer.u32(width);
  writer.u32(height);
  writer.u32(1);
  writer.u32(40);
  writer.u32(0);
  writer.text(title);
  writer.text("HybridCC real-WebAssembly acceptance");
  writer.text("");
  writer.text("real-Wasm");
  writer.u32(0); // text table

  const actorOrder = cells.flatMap((cell, index) => cell.actor?.id ? [index] : []);
  writer.u32(actorOrder.length);
  for (const index of actorOrder) writer.u32(index);

  for (const cell of cells) {
    writeElement(writer, cell.terrain ?? { id: ELEMENT.floor });
    writeElement(writer);
    writeElement(writer);
    writeElement(writer, cell.actor);
    writer.u8(0); // sides
  }
  return Uint8Array.from(writer.bytes);
}

function nativeLine(title: string, cells: readonly CellFixture[]): Uint8Array {
  return nativeRectangle(title, cells.length, 1, cells);
}

function classicDatLevel(
  topPrefix: readonly number[],
  bottomPrefix: readonly number[] = [],
): Uint8Array {
  const top = new Uint8Array(32 * 32);
  const bottom = new Uint8Array(32 * 32);
  top.set(topPrefix);
  bottom.set(bottomPrefix);

  const record = new ByteWriter();
  record.u16(1); // level number
  record.u16(100); // time limit
  record.u16(0); // required chips
  record.u16(1); // map detail
  record.u16(top.length);
  record.bytes.push(...top);
  record.u16(bottom.length);
  record.bytes.push(...bottom);
  record.u16(0); // metadata bytes

  const dat = new ByteWriter();
  dat.u32(0x0002_aaac);
  dat.u16(1);
  dat.u16(record.bytes.length);
  dat.bytes.push(...record.bytes);
  return Uint8Array.from(dat.bytes);
}

function classicDatThiefLevel(): Uint8Array {
  return classicDatLevel([
    111, // east-facing Chip
    101, // red key
    104, // flippers
    33, // classic thief
  ]);
}

async function loadModule() {
  const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

async function startRealSession(
  module: Awaited<ReturnType<typeof loadModule>>,
  seriesFile: string,
  encodedLevel: Uint8Array,
) {
  const nativeLevel = inspectHybridCcV1NativeLevel(module, encodedLevel);
  const convertedLevel = {
    status: 0,
    entryOrdinal: 0,
    requiredChips: 0,
    diagnosticCount: 0,
    nativeLevel,
  } as const;
  const registry = new HybridCcV1LevelRegistry();
  registry.register(seriesFile, [convertedLevel]);
  let engine: ReturnType<typeof createHybridCcV1Engine> | undefined;
  const adapter = new HybridCcV1GameEngineAdapter(registry, {
    create: (level, seed) => {
      engine = createHybridCcV1Engine(module, level.nativeLevel, seed);
      return engine;
    },
  });
  const session = await adapter.startSession({
    seriesFile,
    levelNumber: nativeLevel.number,
    ruleset: "Hybrid" as const,
    randomSeed: 7,
  });
  if (!engine) throw new Error("Hybrid v1 adapter did not create its real engine");
  return { adapter, engine, session };
}

interface ForceOverrideFixture {
  readonly name: string;
  readonly input: number;
  readonly direction: number;
  readonly overrideDestination: { readonly x: number; readonly y: number; readonly z: 0 };
  readonly continuationDestination: { readonly x: number; readonly y: number; readonly z: 0 };
}

const FORCE_OVERRIDE_FIXTURES: readonly ForceOverrideFixture[] = [
  {
    name: "left/north",
    input: HYBRIDCC_V1_INPUT.north,
    direction: DIRECTION.north,
    overrideDestination: { x: 3, y: 2, z: 0 },
    continuationDestination: { x: 3, y: 1, z: 0 },
  },
  {
    name: "right/south",
    input: HYBRIDCC_V1_INPUT.south,
    direction: DIRECTION.south,
    overrideDestination: { x: 3, y: 4, z: 0 },
    continuationDestination: { x: 3, y: 5, z: 0 },
  },
  {
    name: "backward/west",
    input: HYBRIDCC_V1_INPUT.west,
    direction: DIRECTION.west,
    overrideDestination: { x: 2, y: 3, z: 0 },
    continuationDestination: { x: 1, y: 3, z: 0 },
  },
];

const FORCE_OVERRIDE_INPUT_PHASES = [0, 1, 2, 3] as const;

const FORCE_OVERRIDE_PHASE_CASES = FORCE_OVERRIDE_FIXTURES.flatMap((fixture) => (
  FORCE_OVERRIDE_INPUT_PHASES.map((inputPhase) => ({ fixture, inputPhase }))
));

function forceOverrideLevel(fixture: ForceOverrideFixture): Uint8Array {
  const width = 7;
  const height = 7;
  const cells: CellFixture[] = Array.from({ length: width * height }, () => ({}));
  const index = (x: number, y: number) => y * width + x;
  const forceFloor: ElementFixture = {
    id: ELEMENT.forceFloor,
    direction: DIRECTION.east,
    rule: RULE.fromCenter,
  };

  cells[index(3, 3)] = {
    terrain: forceFloor,
    actor: { id: ELEMENT.player, direction: DIRECTION.east },
  };
  cells[index(4, 3)] = { terrain: { id: ELEMENT.wall } };

  return nativeRectangle(
    `Hybrid v1 ${fixture.name} force override continuity`,
    width,
    height,
    cells,
  );
}

function directionalRenderCoordinate(
  chip: { readonly pos: number; readonly moving: number },
  width: number,
  direction: number,
): number {
  const x = chip.pos % width;
  const y = Math.floor(chip.pos / width);
  switch (direction) {
    case DIRECTION.north: return -(y * 8 + chip.moving);
    case DIRECTION.east: return x * 8 - chip.moving;
    case DIRECTION.south: return y * 8 - chip.moving;
    case DIRECTION.west: return -(x * 8 + chip.moving);
    default: throw new Error(`Direction ${direction} has no render axis.`);
  }
}

describe("HybridCC v1 real-Wasm correctness acceptance", () => {
  it.each([
    ["ice", { id: ELEMENT.ice }],
    ["force floor", {
      id: ELEMENT.forceFloor,
      direction: DIRECTION.east,
      rule: RULE.fromCenter,
    }],
  ] as const)("publishes an unbooted first entry onto %s as N+1/two samples", async (_name, terrain) => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("real-Wasm fast terrain entry", [
      { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
      { terrain },
      {},
    ]), 7);

    try {
      expect(engine.snapshot().inventory).toEqual([]);
      engine.logicStep(HYBRIDCC_V1_INPUT.east);
      const snapshot = engine.snapshot();
      const chip = snapshot.actors.find(({ kind }) => kind === ELEMENT.player);

      expect(chip).toMatchObject({
        logicalPosition: { x: 1, y: 0, z: 0 },
        hasMovement: true,
        movement: {
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          startBoundary: 1n,
          completionBoundary: 2n,
        },
      });
      expect(snapshot.presentation.playerMotion).toMatchObject({
        startBoundary: 1n,
        completionBoundary: 2n,
        presentationSampleCount: 2,
      });
      expect([2, 3].map((sample) => (
        hybridCcV1PresentedMotion(snapshot.presentation.playerMotion, sample).moving
      ))).toEqual([8, 4]);
      expect(snapshot.cells[0]?.occupant).toBeNull();
      expect(snapshot.cells[1]?.occupant).toBe(chip?.id);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("joins consecutive N+1 force-floor moves without a host-side idle sample", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-fast-fast",
      nativeLine("real-Wasm fast-to-fast force floor", [
        {
          terrain: {
            id: ELEMENT.forceFloor,
            direction: DIRECTION.east,
            rule: RULE.fromCenter,
          },
          actor: { id: ELEMENT.player, direction: DIRECTION.east },
        },
        {
          terrain: {
            id: ELEMENT.forceFloor,
            direction: DIRECTION.east,
            rule: RULE.fromCenter,
          },
        },
        {
          terrain: {
            id: ELEMENT.forceFloor,
            direction: DIRECTION.east,
            rule: RULE.fromCenter,
          },
        },
        {},
      ]),
    );
    let session = harness.session;
    const ticks: number[] = [];
    const fixedX: number[] = [];
    let boundaryOne: ReturnType<typeof harness.engine.snapshot> | undefined;
    let boundaryTwo: ReturnType<typeof harness.engine.snapshot> | undefined;

    try {
      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
        const snapshot = harness.engine.snapshot();
        if (hostSample === 0) boundaryOne = snapshot;
        if (hostSample === 4) boundaryTwo = snapshot;
        const chip = session.frame.render?.chip;
        if (!chip) throw new Error("Hybrid v1 fast-to-fast fixture lost Chip");
        ticks.push(session.frame.snapshot.tick);
        fixedX.push((chip.pos % 4) * 8 - chip.moving);
      }

      const firstMove = boundaryOne?.actors.find(({ kind }) => kind === ELEMENT.player);
      const secondMove = boundaryTwo?.actors.find(({ kind }) => kind === ELEMENT.player);
      expect(firstMove).toMatchObject({
        logicalPosition: { x: 1, y: 0, z: 0 },
        movement: {
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          startBoundary: 1n,
          completionBoundary: 2n,
        },
      });
      expect(boundaryOne?.cells.map(({ occupant }) => occupant)).toEqual([
        null,
        firstMove?.id,
        null,
        null,
      ]);
      expect(secondMove).toMatchObject({
        logicalPosition: { x: 2, y: 0, z: 0 },
        movement: {
          origin: { x: 1, y: 0, z: 0 },
          destination: { x: 2, y: 0, z: 0 },
          startBoundary: 2n,
          completionBoundary: 3n,
        },
      });
      expect(boundaryTwo?.cells.map(({ occupant }) => occupant)).toEqual([
        null,
        null,
        secondMove?.id,
        null,
      ]);
      expect(ticks).toEqual([2, 2, 3, 3, 4, 4, 5, 5]);
      expect(fixedX).toEqual([0, 0, 4, 4, 8, 8, 12, 12]);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("starts Tunnel Clearance fallback on the first force arrival boundary", async () => {
    const module = await loadModule();
    const northForce: ElementFixture = {
      id: ELEMENT.forceFloor,
      direction: DIRECTION.north,
      rule: RULE.fromCenter,
    };
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-Tunnel-Clearance",
      nativeRectangle("Tunnel Clearance first-arrival force corridor", 7, 2, [
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        { terrain: northForce },
        { terrain: northForce },
        { terrain: northForce },
        { terrain: northForce },
        {},
        {},
      ]),
    );
    let session = harness.session;
    const snapshotsByBoundary = new Map<bigint, ReturnType<typeof harness.engine.snapshot>>();
    const presentationTicks: number[] = [];
    const presentedX: number[] = [];

    try {
      for (let hostSample = 0; hostSample < 28; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.east);
        const snapshot = harness.engine.snapshot();
        if (hostSample % 4 === 0) {
          snapshotsByBoundary.set(snapshot.header.logicBoundary, snapshot);
        }
        const chip = session.frame.render?.chip;
        if (!chip) throw new Error("Tunnel Clearance fixture lost Chip");
        presentationTicks.push(session.frame.snapshot.tick);
        presentedX.push((chip.pos % 7) * 8 - chip.moving);
      }

      expect(snapshotsByBoundary.get(1n)?.actors.find(({ kind }) => (
        kind === ELEMENT.player
      ))).toMatchObject({
        logicalPosition: { x: 1, y: 1, z: 0 },
        idleReason: IDLE_REASON.inProgress,
        movement: {
          origin: { x: 0, y: 1, z: 0 },
          destination: { x: 1, y: 1, z: 0 },
          direction: DIRECTION.east,
          startBoundary: 1n,
          completionBoundary: 2n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.fast,
        },
      });

      for (const startBoundary of [2n, 3n, 4n, 5n]) {
        const originX = Number(startBoundary - 1n);
        const snapshot = snapshotsByBoundary.get(startBoundary);
        const chip = snapshot?.actors.find(({ kind }) => kind === ELEMENT.player);
        expect(chip).toMatchObject({
          logicalPosition: { x: originX + 1, y: 1, z: 0 },
          idleReason: IDLE_REASON.inProgress,
          movement: {
            origin: { x: originX, y: 1, z: 0 },
            destination: { x: originX + 1, y: 1, z: 0 },
            direction: DIRECTION.east,
            startBoundary,
            completionBoundary: startBoundary + 1n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerForceOverride,
            movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.boosted,
          },
        });
        expect(snapshot?.events.some(({ kind, actorKind }) => (
          kind === HYBRID_CC_V1_EVENT.moveRejected && actorKind === ELEMENT.player
        ))).toBe(false);
      }

      const ordinary = snapshotsByBoundary.get(6n);
      expect(ordinary?.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 6, y: 1, z: 0 },
        idleReason: IDLE_REASON.inProgress,
        movement: {
          origin: { x: 5, y: 1, z: 0 },
          destination: { x: 6, y: 1, z: 0 },
          direction: DIRECTION.east,
          startBoundary: 6n,
          completionBoundary: 8n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
        },
      });

      const twentyHertzX = presentedX.filter((_, index) => (
        index === 0 || presentationTicks[index] !== presentationTicks[index - 1]
      ));
      expect(twentyHertzX).toEqual([
        0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 42, 44, 46,
      ]);
      expect(twentyHertzX.slice(1).every((x, index) => x > twentyHertzX[index]!)).toBe(true);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("keeps an open force direction authoritative over conflicting held input", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-open-force-priority",
      nativeRectangle("Open force direction keeps terrain control", 4, 2, [
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { terrain: { id: ELEMENT.wall } },
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        {
          terrain: {
            id: ELEMENT.forceFloor,
            direction: DIRECTION.east,
            rule: RULE.fromCenter,
          },
        },
        {},
        {},
      ]),
    );
    let session = harness.session;
    let arrival: ReturnType<typeof harness.engine.snapshot> | undefined;
    let forced: ReturnType<typeof harness.engine.snapshot> | undefined;

    try {
      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        const input = hostSample < 4
          ? HYBRIDCC_V1_INPUT.east
          : HYBRIDCC_V1_INPUT.north;
        session = await harness.adapter.advanceSession(session, input);
        if (hostSample === 0) arrival = harness.engine.snapshot();
        if (hostSample === 4) forced = harness.engine.snapshot();
      }

      expect(arrival?.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 1, y: 1, z: 0 },
        movement: {
          origin: { x: 0, y: 1, z: 0 },
          destination: { x: 1, y: 1, z: 0 },
          startBoundary: 1n,
          completionBoundary: 2n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.fast,
        },
      });
      expect(forced?.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 2, y: 1, z: 0 },
        direction: DIRECTION.east,
        movement: {
          origin: { x: 1, y: 1, z: 0 },
          destination: { x: 2, y: 1, z: 0 },
          direction: DIRECTION.east,
          startBoundary: 2n,
          completionBoundary: 3n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.forceFloor,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.forced,
        },
      });
      expect(forced?.events.some(({ kind, actorKind }) => (
        kind === HYBRID_CC_V1_EVENT.moveRejected && actorKind === ELEMENT.player
      ))).toBe(false);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("keeps a real held wall contact facing and pushing until release", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-held-wall",
      nativeLine("real-Wasm held wall contact", [
        { actor: { id: ELEMENT.player, direction: DIRECTION.north } },
        { terrain: { id: ELEMENT.wall } },
      ]),
    );
    let session = harness.session;

    try {
      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.east);
        expect(session.frame.render?.chip).toMatchObject({
          pushing: true,
          visual: { tileId: MS_TILE.Pushing_Chip },
        });
      }
      const held = harness.engine.snapshot();
      expect(held.header.logicBoundary).toBe(2n);
      expect(held.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 0, y: 0, z: 0 },
        direction: DIRECTION.east,
        hasMovement: false,
      });
      expect(held.presentation.playerPush).toMatchObject({
        direction: DIRECTION.east,
        origin: { x: 0, y: 0, z: 0 },
        contact: { x: 1, y: 0, z: 0 },
        blockActorId: null,
        moving: false,
        startBoundary: 2n,
        completionBoundary: 2n,
      });

      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      expect(harness.engine.snapshot().presentation.playerPush).toBeNull();
      expect(session.frame.render?.chip).toMatchObject({
        pushing: false,
        visual: { tileId: MS_TILE.Chip },
      });
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("faces a rejected direction after an earlier completed move", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-rejected-facing-after-motion",
      nativeRectangle("real-Wasm rejected facing after motion", 2, 2, [
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        {},
        {},
        { terrain: { id: ELEMENT.wall } },
      ]),
    );
    let session = harness.session;

    try {
      for (let hostSample = 0; hostSample < 12; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.east);
      }

      const completed = harness.engine.snapshot();
      expect(completed.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 1, y: 0, z: 0 },
        direction: DIRECTION.east,
        hasMovement: false,
      });
      expect(completed.presentation.playerMotion).toMatchObject({
        direction: DIRECTION.east,
        destination: { x: 1, y: 0, z: 0 },
      });

      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.south);
      }

      const rejected = harness.engine.snapshot();
      expect(rejected.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 1, y: 0, z: 0 },
        direction: DIRECTION.south,
        hasMovement: false,
      });
      expect(rejected.presentation).toMatchObject({
        playerMotion: { direction: DIRECTION.east },
        playerPush: {
          direction: DIRECTION.south,
          origin: { x: 1, y: 0, z: 0 },
          contact: { x: 1, y: 1, z: 0 },
          moving: false,
        },
      });
      expect(session.frame.render?.chip).toMatchObject({
        dir: MS_DIRECTION.south,
        pushing: true,
        visual: {
          tileId: MS_TILE.Pushing_Chip,
          dir: MS_DIRECTION.south,
        },
      });
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("keeps a real accepted dirt-block push visible for its whole N+2 interval", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-active-push",
      nativeLine("real-Wasm active dirt-block push", [
        { actor: { id: ELEMENT.player, direction: DIRECTION.north } },
        { actor: { id: ELEMENT.dirtBlock, direction: DIRECTION.east } },
        {},
      ]),
    );
    let session = harness.session;

    try {
      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(
          session,
          hostSample === 0 ? HYBRIDCC_V1_INPUT.east : HYBRIDCC_V1_INPUT.none,
        );
        expect(
          session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
        ).not.toBe(0);
        expect(session.frame.render?.chip).toMatchObject({
          pushing: true,
          visual: { tileId: MS_TILE.Pushing_Chip },
        });
        if (hostSample === 0) {
          const started = harness.engine.snapshot();
          const chip = started.actors.find(({ kind }) => kind === ELEMENT.player);
          const block = started.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);
          expect(started.cells.map(({ occupant }) => occupant)).toEqual([
            null,
            chip?.id,
            block?.id,
          ]);
          expect(chip).toMatchObject({ logicalPosition: { x: 1, y: 0, z: 0 } });
          expect(block).toMatchObject({ logicalPosition: { x: 2, y: 0, z: 0 } });
          expect(started.presentation.playerPush).toMatchObject({
            direction: DIRECTION.east,
            origin: { x: 0, y: 0, z: 0 },
            contact: { x: 1, y: 0, z: 0 },
            blockActorId: block?.id,
            moving: true,
            startBoundary: 1n,
            completionBoundary: 3n,
          });
        }
      }

      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      expect(harness.engine.snapshot()).toMatchObject({
        header: { logicBoundary: 3n },
        presentation: { playerPush: null },
      });
      expect(session.frame.render?.chip).toMatchObject({
        pushing: false,
        visual: { tileId: MS_TILE.Chip },
      });
      expect(
        session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
      ).toBe(0);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("moves the Oasis block before rechecking the newly raised wall under it", async () => {
    const module = await loadModule();
    const wallStone: ElementFixture = {
      id: ELEMENT.steppingStone,
      color: COLOR.brown,
      rule: RULE.becomesWall,
      count: 1,
    };
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-Oasis",
      nativeLine("Oasis count-one staged push", [
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        { terrain: wallStone, actor: { id: ELEMENT.dirtBlock, direction: DIRECTION.east } },
        {},
      ]),
    );
    let session = harness.session;
    let boundaryOne: ReturnType<typeof harness.engine.snapshot> | undefined;

    try {
      for (let hostSample = 0; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(
          session,
          hostSample === 0 ? HYBRIDCC_V1_INPUT.east : HYBRIDCC_V1_INPUT.none,
        );
        if (hostSample === 0) boundaryOne = harness.engine.snapshot();
        const chip = session.frame.render?.chip;
        expect(chip).toMatchObject({
          pos: 0,
          moving: 0,
          pushing: true,
          visual: { tileId: MS_TILE.Pushing_Chip },
        });
        expect(
          session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
        ).not.toBe(0);
      }

      const started = harness.engine.snapshot();
      const chip = started.actors.find(({ kind }) => kind === ELEMENT.player);
      const block = started.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);
      expect(started.header.logicBoundary).toBe(2n);
      expect(chip).toMatchObject({
        logicalPosition: { x: 0, y: 0, z: 0 },
        direction: DIRECTION.east,
        hasMovement: false,
      });
      expect(block).toMatchObject({
        logicalPosition: { x: 2, y: 0, z: 0 },
        movement: {
          origin: { x: 1, y: 0, z: 0 },
          destination: { x: 2, y: 0, z: 0 },
          startBoundary: 1n,
          completionBoundary: 3n,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.pushableActor,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.pushed,
        },
      });
      expect(started.cells[1]?.terrain).toMatchObject({
        id: ELEMENT.wall,
        color: COLOR.brown,
      });
      expect(started.cells.map(({ occupant }) => occupant)).toEqual([
        chip?.id,
        null,
        block?.id,
      ]);
      expect(started.presentation.playerPush).toMatchObject({
        moving: true,
        blockActorId: block?.id,
        startBoundary: 1n,
        completionBoundary: 3n,
      });
      expect(boundaryOne?.events.filter(({ kind, interaction }) => (
        kind === EVENT.interaction && interaction === INTERACTION.push
      ))).toHaveLength(1);
      expect(boundaryOne?.events.filter(({ kind, actorKind }) => (
        kind === HYBRID_CC_V1_EVENT.moveRejected && actorKind === ELEMENT.player
      ))).toHaveLength(1);

      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      expect(harness.engine.snapshot().presentation.playerPush).toBeNull();
      expect(session.frame.render?.chip).toMatchObject({
        pos: 0,
        moving: 0,
        pushing: false,
      });
      expect(
        session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
      ).toBe(0);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("lets Chip follow an Oasis block while a count-two stone remains open", async () => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("Oasis count-two staged push", [
      { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
      {
        terrain: {
          id: ELEMENT.steppingStone,
          color: COLOR.brown,
          rule: RULE.becomesWall,
          count: 2,
        },
        actor: { id: ELEMENT.dirtBlock, direction: DIRECTION.east },
      },
      {},
    ]), 7);

    try {
      engine.logicStep(HYBRIDCC_V1_INPUT.east);
      const snapshot = engine.snapshot();
      const chip = snapshot.actors.find(({ kind }) => kind === ELEMENT.player);
      const block = snapshot.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);
      expect(chip).toMatchObject({
        logicalPosition: { x: 1, y: 0, z: 0 },
        hasMovement: true,
      });
      expect(block).toMatchObject({
        logicalPosition: { x: 2, y: 0, z: 0 },
        hasMovement: true,
      });
      expect(snapshot.cells[1]?.terrain).toMatchObject({
        id: ELEMENT.steppingStone,
        rule: RULE.becomesWall,
        count: 1,
      });
      expect(snapshot.cells.map(({ occupant }) => occupant)).toEqual([
        null,
        chip?.id,
        block?.id,
      ]);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("uses independent N+1 block timing and ends push audio before autonomous ice", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-fast-block-push",
      nativeLine("real-Wasm fast block push", [
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        { actor: { id: ELEMENT.dirtBlock, direction: DIRECTION.east } },
        { terrain: { id: ELEMENT.ice } },
        { terrain: { id: ELEMENT.ice } },
        {},
      ]),
    );
    let session = harness.session;

    try {
      for (let hostSample = 0; hostSample < 4; hostSample += 1) {
        session = await harness.adapter.advanceSession(
          session,
          hostSample === 0 ? HYBRIDCC_V1_INPUT.east : HYBRIDCC_V1_INPUT.none,
        );
        expect(
          session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
        ).not.toBe(0);
      }

      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      const continued = harness.engine.snapshot();
      const chip = continued.actors.find(({ kind }) => kind === ELEMENT.player);
      const block = continued.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);
      expect(continued.header.logicBoundary).toBe(2n);
      expect(chip?.movement).toMatchObject({
        startBoundary: 1n,
        completionBoundary: 3n,
      });
      expect(block?.movement).toMatchObject({
        origin: { x: 2, y: 0, z: 0 },
        destination: { x: 3, y: 0, z: 0 },
        owner: HYBRID_CC_V1_MOVEMENT_OWNER.ice,
        startBoundary: 2n,
        completionBoundary: 3n,
      });
      expect(
        session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
      ).toBe(0);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("turns fully blocked Teeth toward their primary chase direction only", async () => {
    const module = await loadModule();
    const cells: CellFixture[] = Array.from({ length: 25 }, () => ({}));
    cells[12] = { actor: { id: ELEMENT.teeth, direction: DIRECTION.north } };
    cells[13] = { terrain: { id: ELEMENT.wall } };
    cells[17] = { terrain: { id: ELEMENT.wall } };
    cells[24] = { actor: { id: ELEMENT.player, direction: DIRECTION.north } };
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-Teeth-rejected-facing",
      nativeRectangle("real-Wasm Teeth rejected facing", 5, 5, cells),
    );
    let session = harness.session;

    try {
      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      expect(harness.engine.snapshot().actors.find(({ kind }) => kind === ELEMENT.teeth)).toMatchObject({
        logicalPosition: { x: 2, y: 2, z: 0 },
        direction: DIRECTION.south,
        hasMovement: false,
      });
      expect(session.frame.render?.actors).toEqual([
        expect.objectContaining({ dir: MS_DIRECTION.south }),
      ]);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("projects an accepted paired-input side slap as two atomic N+2 moves", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-side-slap",
      nativeRectangle("real-Wasm paired-input side slap", 3, 3, [
        {},
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        {},
        {},
        { actor: { id: ELEMENT.dirtBlock, direction: DIRECTION.north } },
        {},
        {},
        {},
        {},
      ]),
    );
    let session = harness.session;

    try {
      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.eastSouth);
      const started = harness.engine.snapshot();
      const chip = started.actors.find(({ kind }) => kind === ELEMENT.player);
      const block = started.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);

      expect(started.header.logicBoundary).toBe(1n);
      expect(chip).toMatchObject({
        logicalPosition: { x: 2, y: 0, z: 0 },
        movement: {
          origin: { x: 1, y: 0, z: 0 },
          destination: { x: 2, y: 0, z: 0 },
          direction: DIRECTION.east,
          slapDirection: DIRECTION.south,
          startBoundary: 1n,
          completionBoundary: 3n,
        },
      });
      expect(block).toMatchObject({
        logicalPosition: { x: 1, y: 2, z: 0 },
        movement: {
          origin: { x: 1, y: 1, z: 0 },
          destination: { x: 1, y: 2, z: 0 },
          direction: DIRECTION.south,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.pushableActor,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.pushed,
          startBoundary: 1n,
          completionBoundary: 3n,
        },
      });
      expect(started.cells[1]?.occupant).toBeNull();
      expect(started.cells[2]?.occupant).toBe(chip?.id);
      expect(started.cells[4]?.occupant).toBeNull();
      expect(started.cells[7]?.occupant).toBe(block?.id);
      expect(started.presentation.playerPush).toBeNull();
      expect(started.events.filter(({ kind, interaction, actorKind, subject }) => (
        kind === EVENT.interaction
        && interaction === INTERACTION.push
        && actorKind === ELEMENT.player
        && subject.id === ELEMENT.dirtBlock
      ))).toHaveLength(1);
      expect(session.frame.render?.chip).toMatchObject({
        pushing: false,
        visual: { tileId: MS_TILE.Chip },
      });
      expect(session.frame.render?.actors).toEqual([
        expect.objectContaining({ id: MS_TILE.Block, moving: 8 }),
      ]);
      expect(
        session.frame.snapshot.soundEffects & (1 << LYNX_SOUND.BlockMoving),
      ).not.toBe(0);

      for (let hostSample = 1; hostSample < 8; hostSample += 1) {
        session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
      }
      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);

      const completed = harness.engine.snapshot();
      expect(completed.header.logicBoundary).toBe(3n);
      expect(completed.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 2, y: 0, z: 0 },
        hasMovement: false,
      });
      expect(completed.actors.find(({ kind }) => kind === ELEMENT.dirtBlock)).toMatchObject({
        logicalPosition: { x: 1, y: 2, z: 0 },
        hasMovement: false,
      });
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it("presents lethal player contact as terminal motion, never as a rejected push", async () => {
    const module = await loadModule();
    const harness = await startRealSession(
      module,
      "Hybrid-v1-real-Wasm-lethal-contact",
      nativeLine("real-Wasm lethal contact presentation", [
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        {
          terrain: {
            id: ELEMENT.trap,
            color: 1,
            rule: RULE.startsHolding,
            channel: "LETH",
          },
          actor: { id: ELEMENT.ball, direction: DIRECTION.west },
        },
      ]),
    );
    let session = harness.session;

    try {
      session = await harness.adapter.advanceSession(session, HYBRIDCC_V1_INPUT.east);
      const dead = harness.engine.snapshot();
      const ball = dead.actors.find(({ kind }) => kind === ELEMENT.ball);
      expect(dead.header.outcome).toMatchObject({ kind: OUTCOME.loss, logicBoundary: 1n });
      expect(dead.actors.some(({ kind }) => kind === ELEMENT.player)).toBe(false);
      expect(ball).toMatchObject({ logicalPosition: { x: 1, y: 0, z: 0 } });
      expect(dead.cells.map(({ occupant }) => occupant)).toEqual([null, ball?.id]);
      expect(dead.presentation).toMatchObject({
        playerPush: null,
        terminalMotion: {
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          startBoundary: 1n,
          completionBoundary: 3n,
        },
      });
      expect(session.frame.render?.chip?.pushing).toBe(false);
      expect(harness.engine.invariantStatus()).toBe(0);
    } finally {
      await harness.adapter.disposeSession(session);
    }
  });

  it.each([
    [
      "force floor",
      [
        {
          terrain: {
            id: ELEMENT.forceFloor,
            direction: DIRECTION.east,
            rule: RULE.fromCenter,
          },
          actor: { id: ELEMENT.player, direction: DIRECTION.east },
        },
        {},
        {},
        {},
      ],
      1,
      0,
      HYBRID_CC_V1_MOVEMENT_OWNER.forceFloor,
      HYBRID_CC_V1_MOVEMENT_CLASS.forced,
    ],
    [
      "ice",
      [
        { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
        { terrain: { id: ELEMENT.ice } },
        {},
        {},
        {},
      ],
      2,
      1,
      HYBRID_CC_V1_MOVEMENT_OWNER.ice,
      HYBRID_CC_V1_MOVEMENT_CLASS.sliding,
    ],
  ] as const)(
    "keeps the fast %s exit adjacent to completion-ready ordinary presentation",
    async (
      name,
      cells,
      fastBoundary,
      fastOriginX,
      fastOwner,
      fastMovementClass,
    ) => {
      const module = await loadModule();
      const nativeLevel = inspectHybridCcV1NativeLevel(
        module,
        nativeLine(`real-Wasm ${name} continuity`, cells),
      );
      const convertedLevel = {
        status: 0,
        entryOrdinal: 0,
        requiredChips: 0,
        diagnosticCount: 0,
        nativeLevel,
      } as const;
      const registry = new HybridCcV1LevelRegistry();
      registry.register("Hybrid-v1-real-Wasm", [convertedLevel]);
      const engines: ReturnType<typeof createHybridCcV1Engine>[] = [];
      const adapter = new HybridCcV1GameEngineAdapter(registry, {
        create: (level, seed) => {
          const engine = createHybridCcV1Engine(module, level.nativeLevel, seed);
          engines.push(engine);
          return engine;
        },
      });
      const request = {
        seriesFile: "Hybrid-v1-real-Wasm",
        levelNumber: nativeLevel.number,
        ruleset: "Hybrid" as const,
        randomSeed: 7,
      };
      let session = await adapter.startSession(request);
      const engine = engines[0];
      if (!engine) throw new Error("Hybrid v1 adapter did not create its real engine");

      const snapshotsByBoundary = new Map<bigint, ReturnType<typeof engine.snapshot>>();
      const ticks: number[] = [];
      const moving: number[] = [];
      const fixedX: number[] = [];
      const firstFastHostSample = (fastBoundary - 1) * 4;
      const hostSampleCount = firstFastHostSample + 14;
      try {
        for (let hostSample = 0; hostSample < hostSampleCount; hostSample += 1) {
          session = await adapter.advanceSession(session, HYBRIDCC_V1_INPUT.east);
          const snapshot = engine.snapshot();
          if (hostSample % 4 === 0) {
            snapshotsByBoundary.set(snapshot.header.logicBoundary, snapshot);
          }
          const chip = session.frame.render?.chip;
          if (!chip) throw new Error(`Hybrid v1 ${name} continuity fixture lost Chip`);
          ticks.push(session.frame.snapshot.tick);
          moving.push(chip.moving);
          fixedX.push((chip.pos % 32) * 8 - chip.moving);
        }

        const fast = snapshotsByBoundary.get(BigInt(fastBoundary))
          ?.presentation.playerMotion;
        const ordinary = snapshotsByBoundary.get(BigInt(fastBoundary + 1))
          ?.presentation.playerMotion;
        const following = snapshotsByBoundary.get(BigInt(fastBoundary + 3))
          ?.presentation.playerMotion;
        expect(fast).toMatchObject({
          origin: { x: fastOriginX, y: 0, z: 0 },
          destination: { x: fastOriginX + 1, y: 0, z: 0 },
          startBoundary: BigInt(fastBoundary),
          completionBoundary: BigInt(fastBoundary + 1),
          presentationSampleCount: 2,
          owner: fastOwner,
          movementClass: fastMovementClass,
        });
        expect(ordinary).toMatchObject({
          origin: { x: fastOriginX + 1, y: 0, z: 0 },
          destination: { x: fastOriginX + 2, y: 0, z: 0 },
          startBoundary: BigInt(fastBoundary + 1),
          completionBoundary: BigInt(fastBoundary + 3),
          presentationSampleCount: 4,
          owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
          movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
        });
        expect(fast?.completionBoundary).toBe(ordinary?.startBoundary);
        expect(ordinary?.completionBoundary).toBe(following?.startBoundary);

        const traceTicks = ticks.slice(firstFastHostSample);
        const traceMoving = moving.slice(firstFastHostSample);
        const traceFixedX = fixedX.slice(firstFastHostSample);
        const firstPresentationTick = fastBoundary * 2;
        expect(traceTicks).toEqual(Array.from(
          { length: 7 },
          (_, index) => [firstPresentationTick + index, firstPresentationTick + index],
        ).flat());
        expect(traceMoving).toEqual([8, 8, 4, 4, 8, 8, 6, 6, 4, 4, 2, 2, 8, 8]);
        expect(traceFixedX).toEqual([
          0, 0, 4, 4, 8, 8, 10, 10, 12, 12, 14, 14, 16, 16,
        ].map((offset) => fastOriginX * 8 + offset));

        const uniquePresentationX = traceFixedX.filter((_, index) => (
          index === 0 || traceTicks[index] !== traceTicks[index - 1]
        ));
        expect(uniquePresentationX.slice(1).every((x, index) => (
          x > uniquePresentationX[index]!
        ))).toBe(true);
        expect(engine.invariantStatus()).toBe(0);
      } finally {
        await adapter.disposeSession(session);
      }
    },
  );

  it.each(FORCE_OVERRIDE_PHASE_CASES)(
    "continues a $fixture.name blocked-force fallback at B3 when held from 25 ms host phase $inputPhase",
    async ({ fixture, inputPhase }) => {
      const module = await loadModule();
      const nativeLevel = inspectHybridCcV1NativeLevel(
        module,
        forceOverrideLevel(fixture),
      );
      const convertedLevel = {
        status: 0,
        entryOrdinal: 0,
        requiredChips: 0,
        diagnosticCount: 0,
        nativeLevel,
      } as const;
      const registry = new HybridCcV1LevelRegistry();
      registry.register("Hybrid-v1-real-Wasm-readiness", [convertedLevel]);
      const engines: ReturnType<typeof createHybridCcV1Engine>[] = [];
      const adapter = new HybridCcV1GameEngineAdapter(registry, {
        create: (level, seed) => {
          const engine = createHybridCcV1Engine(module, level.nativeLevel, seed);
          engines.push(engine);
          return engine;
        },
      });
      const request = {
        seriesFile: "Hybrid-v1-real-Wasm-readiness",
        levelNumber: nativeLevel.number,
        ruleset: "Hybrid" as const,
        randomSeed: 7,
      };
      let session = await adapter.startSession(request);
      const engine = engines[0];
      if (!engine) throw new Error("Hybrid v1 adapter did not create its real engine");

      const width = 7;
      const overrideOrigin = { x: 3, y: 3, z: 0 };
      const ticks: number[] = [];
      const coordinates: number[] = [];
      let boundaryThree: ReturnType<typeof engine.snapshot> | undefined;
      try {
        // B1 records the blocked automatic force attempt. Only that failure
        // makes a player fallback eligible at the following boundary.
        session = await adapter.advanceSession(session, HYBRIDCC_V1_INPUT.none);
        expect(engine.snapshot().header.logicBoundary).toBe(1n);

        // The browser receives input at 40 Hz. Start holding on each possible
        // host phase before the B2 sample; the engine still consumes exactly
        // one deterministic input at the 100 ms logic boundary.
        for (const phase of [1, 2, 3] as const) {
          const holding = inputPhase !== 0 && phase >= inputPhase;
          session = await adapter.advanceSession(
            session,
            holding ? fixture.input : HYBRIDCC_V1_INPUT.none,
          );
        }

        const capture = () => {
          const snapshot = engine.snapshot();
          if (snapshot.header.logicBoundary === 3n && !boundaryThree) {
            boundaryThree = snapshot;
          }
          const chip = session.frame.render?.chip;
          if (!chip) throw new Error(`Hybrid v1 ${fixture.name} fixture lost Chip`);
          ticks.push(session.frame.snapshot.tick);
          coordinates.push(directionalRenderCoordinate(chip, width, fixture.direction));
        };

        // Phase 0 is the B2 logic sample. Every earlier phase has remained
        // held through this call, so all four acquisition phases converge on
        // the same authoritative override and presentation track.
        session = await adapter.advanceSession(session, fixture.input);
        capture();
        const boundaryTwo = engine.snapshot();
        const overrideChip = boundaryTwo.actors.find(({ kind }) => kind === ELEMENT.player);
        expect(boundaryTwo.header.logicBoundary).toBe(2n);
        expect(overrideChip).toMatchObject({
          idleReason: IDLE_REASON.inProgress,
          hasMovement: true,
          movement: {
            origin: overrideOrigin,
            destination: fixture.overrideDestination,
            direction: fixture.direction,
            startBoundary: 2n,
            completionBoundary: 3n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerForceOverride,
            movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.boosted,
          },
          playerMomentum: {
            exitCreditAvailable: false,
            exitCreditEligibleBoundary: 0n,
          },
        });

        for (let sample = 1; sample < 14; sample += 1) {
          session = await adapter.advanceSession(session, fixture.input);
          capture();
        }

        const continuation = boundaryThree;
        if (!continuation) throw new Error("Hybrid v1 fixture did not reach B3");
        const continuationChip = continuation.actors.find(({ kind }) => (
          kind === ELEMENT.player
        ));

        // This is the regression boundary: B3 must complete the N2->N3 boost
        // and immediately begin ordinary N3->N5 movement. A cooldown here is
        // the visible 100 ms sideways/backward hitch.
        expect(continuationChip).toMatchObject({
          idleReason: IDLE_REASON.inProgress,
          hasMovement: true,
          movement: {
            origin: fixture.overrideDestination,
            destination: fixture.continuationDestination,
            direction: fixture.direction,
            startBoundary: 3n,
            completionBoundary: 5n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
            movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
          },
          nextOrdinaryBoundary: 5n,
          playerMomentum: {
            exitCreditAvailable: false,
            exitCreditEligibleBoundary: 0n,
          },
        });
        expect(continuationChip?.idleReason).not.toBe(IDLE_REASON.cooldown);

        const movementEvents = continuation.events.filter(({ kind, actorKind }) => (
          actorKind === ELEMENT.player && (
            kind === HYBRID_CC_V1_EVENT.moveCompleted
            || kind === HYBRID_CC_V1_EVENT.moveStarted
            || kind === HYBRID_CC_V1_EVENT.moveRejected
          )
        ));
        expect(movementEvents.map(({ kind }) => kind)).toEqual([
          HYBRID_CC_V1_EVENT.moveCompleted,
          HYBRID_CC_V1_EVENT.moveStarted,
        ]);
        expect(movementEvents).toEqual([
          expect.objectContaining({
            kind: HYBRID_CC_V1_EVENT.moveCompleted,
            logicBoundary: 3n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerForceOverride,
            movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.boosted,
          }),
          expect.objectContaining({
            kind: HYBRID_CC_V1_EVENT.moveStarted,
            logicBoundary: 3n,
            owner: HYBRID_CC_V1_MOVEMENT_OWNER.playerInput,
            movementClass: HYBRID_CC_V1_MOVEMENT_CLASS.ordinary,
          }),
        ]);
        expect(continuation.events.some(({ kind }) => (
          kind === HYBRID_CC_V1_EVENT.moveRejected
        ))).toBe(false);

        // Readiness is completion-derived. This assertion is deliberately
        // checked after the B3 seam so an old artifact reports the observable
        // cooldown regression at B3 rather than stopping at an internal field.
        expect(overrideChip?.nextOrdinaryBoundary).toBe(3n);

        const firstCoordinate = directionalRenderCoordinate(
          {
            pos: overrideOrigin.y * width + overrideOrigin.x,
            moving: 0,
          },
          width,
          fixture.direction,
        );
        const expectedOffsets = [0, 0, 4, 4, 8, 8, 10, 10, 12, 12, 14, 14, 16, 16];
        expect(ticks).toEqual([4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10]);
        expect(coordinates).toEqual(expectedOffsets.map((offset) => firstCoordinate + offset));

        const twentyHertzCoordinates = coordinates.filter((_, index) => (
          index === 0 || ticks[index] !== ticks[index - 1]
        ));
        expect(twentyHertzCoordinates).toEqual(
          [0, 4, 8, 10, 12, 14, 16].map((offset) => firstCoordinate + offset),
        );
        expect(twentyHertzCoordinates.slice(1).every((coordinate, index) => (
          coordinate > twentyHertzCoordinates[index]!
        ))).toBe(true);
        expect(engine.invariantStatus()).toBe(0);
      } finally {
        await adapter.disposeSession(session);
      }
    },
  );

  it("publishes normal-speed teleport motion as an N+2 interval with four 20 Hz samples", async () => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("real-Wasm teleport", [
      { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
      {
        terrain: {
          id: ELEMENT.teleport,
          color: COLOR.blue,
          rule: RULE.cannotOverride,
          channel: "A",
        },
      },
      {},
      {},
      {
        terrain: {
          id: ELEMENT.teleport,
          color: COLOR.blue,
          rule: RULE.cannotOverride,
          channel: "A",
        },
      },
      {},
    ]), 7);

    try {
      engine.logicStep(HYBRIDCC_V1_INPUT.east);
      engine.logicStep(HYBRIDCC_V1_INPUT.none);
      engine.logicStep(HYBRIDCC_V1_INPUT.none);
      const snapshot = engine.snapshot();
      const chip = snapshot.actors.find(({ kind }) => kind === ELEMENT.player);

      expect(snapshot.header.logicBoundary).toBe(3n);
      expect(chip).toMatchObject({
        logicalPosition: { x: 5, y: 0, z: 0 },
        hasMovement: true,
        movement: {
          origin: { x: 1, y: 0, z: 0 },
          destination: { x: 5, y: 0, z: 0 },
          startBoundary: 3n,
          completionBoundary: 5n,
          owner: MOVEMENT.teleportOwner,
          movementClass: MOVEMENT.teleportClass,
          discontinuous: true,
        },
      });
      expect(snapshot.presentation).toMatchObject({
        samplesPerSecond: 20,
        playerMotion: {
          startBoundary: 3n,
          completionBoundary: 5n,
          presentationSampleCount: 4,
          movementClass: MOVEMENT.teleportClass,
          discontinuous: true,
        },
      });
      expect([6, 7, 8, 9].map((sample) => (
        hybridCcV1PresentedMotion(snapshot.presentation.playerMotion, sample).moving
      ))).toEqual([8, 6, 4, 2]);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("lets a moving dirt block kill Chip, survive, and finish after the durable loss", async () => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("real-Wasm dirt-block loss", [
      {
        terrain: {
          id: ELEMENT.forceFloor,
          direction: DIRECTION.east,
          rule: RULE.fromCenter,
        },
        actor: {
          id: ELEMENT.dirtBlock,
          color: COLOR.brown,
          direction: DIRECTION.east,
        },
      },
      { actor: { id: ELEMENT.player, direction: DIRECTION.west } },
      {},
    ]), 7);

    try {
      const initial = engine.snapshot();
      const initialBlock = initial.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);
      const deathStep = engine.logicStep(HYBRIDCC_V1_INPUT.none);
      const dead = engine.snapshot();
      const movingBlock = dead.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);

      expect(deathStep).toMatchObject({ operationStatus: 0, stepStatus: 0, stateChanged: true });
      expect(dead.header.outcome).toMatchObject({
        kind: OUTCOME.loss,
        logicBoundary: 1n,
        lossCause: LOSS_CAUSE.dirtBlock,
      });
      expect(dead.actors.some(({ kind }) => kind === ELEMENT.player)).toBe(false);
      expect(movingBlock).toMatchObject({
        id: initialBlock?.id,
        alive: true,
        hasMovement: true,
        movement: {
          origin: { x: 0, y: 0, z: 0 },
          destination: { x: 1, y: 0, z: 0 },
          startBoundary: 1n,
          completionBoundary: 2n,
        },
      });
      expect(dead.events.filter(({ kind }) => kind === EVENT.terminal)).toEqual([
        expect.objectContaining({ lossCause: LOSS_CAUSE.dirtBlock }),
      ]);

      const postDeathStep = engine.logicStep(HYBRIDCC_V1_INPUT.east);
      const continued = engine.snapshot();
      const arrivedBlock = continued.actors.find(({ kind }) => kind === ELEMENT.dirtBlock);

      expect(postDeathStep).toMatchObject({
        operationStatus: 0,
        stepStatus: 0,
        stateChanged: true,
        runtime: {
          logicBoundary: 2n,
          outcome: {
            kind: OUTCOME.loss,
            logicBoundary: 1n,
            lossCause: LOSS_CAUSE.dirtBlock,
          },
        },
      });
      expect(arrivedBlock).toMatchObject({
        id: initialBlock?.id,
        logicalPosition: { x: 1, y: 0, z: 0 },
        alive: true,
        hasMovement: false,
      });
      expect(continued.header.outcome).toEqual(dead.header.outcome);
      expect(continued.events.filter(({ kind }) => kind === EVENT.terminal)).toHaveLength(0);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("keeps a permanent invisible wall in place and emits one reveal interaction", async () => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("real-Wasm reveal", [
      { actor: { id: ELEMENT.player, direction: DIRECTION.east } },
      {
        terrain: {
          id: ELEMENT.trickWall,
          rule: RULE.permanentlyInvisible,
        },
      },
    ]), 7);

    try {
      engine.logicStep(HYBRIDCC_V1_INPUT.east);
      const snapshot = engine.snapshot();
      const chip = snapshot.actors.find(({ kind }) => kind === ELEMENT.player);
      const reveals = snapshot.events.filter(({ kind, interaction }) => (
        kind === EVENT.interaction && interaction === INTERACTION.reveal
      ));

      expect(chip).toMatchObject({
        logicalPosition: { x: 0, y: 0, z: 0 },
        hasMovement: false,
      });
      expect(snapshot.cells[1]?.terrain).toMatchObject({
        id: ELEMENT.trickWall,
        rule: RULE.permanentlyInvisible,
      });
      expect(reveals).toEqual([
        expect.objectContaining({
          actorId: chip?.id,
          destination: { x: 1, y: 0, z: 0 },
          subject: expect.objectContaining({ id: ELEMENT.trickWall }),
        }),
      ]);
      expect(snapshot.header.outcome.kind).toBe(OUTCOME.unfinished);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("imports a classic DAT thief as tools-only and preserves keys when it steals boots", async () => {
    const module = await loadModule();
    const conversion = convertHybridCcV1Dat(module, classicDatThiefLevel());
    const converted = conversion.entries[0];

    expect(conversion).toMatchObject({ fileStatus: 0, diagnostics: [] });
    expect(converted).toMatchObject({ status: 0, entryOrdinal: 1 });
    if (!converted || converted.status !== 0) throw new Error("DAT thief fixture did not convert");

    const engine = createHybridCcV1Engine(module, converted.nativeLevel, 7);
    try {
      const initial = engine.snapshot();
      expect(initial.cells[3]?.terrain).toMatchObject({
        id: ELEMENT.thief,
        rule: RULE.stealTools,
      });

      for (let boundary = 1; boundary <= 7; boundary += 1) {
        engine.logicStep(HYBRIDCC_V1_INPUT.east);
      }
      const crossed = engine.snapshot();
      const inventoryKinds = crossed.inventory.map(({ identity }) => identity.kind);

      expect(crossed.actors.find(({ kind }) => kind === ELEMENT.player)).toMatchObject({
        logicalPosition: { x: 4, y: 0, z: 0 },
        hasMovement: true,
        movement: {
          origin: { x: 3, y: 0, z: 0 },
          destination: { x: 4, y: 0, z: 0 },
        },
      });
      expect(inventoryKinds).toContain(ELEMENT.key);
      expect(inventoryKinds).not.toContain(ELEMENT.flippers);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("imports a DAT block over a real blue wall as one recessed departure", async () => {
    const module = await loadModule();
    const conversion = convertHybridCcV1Dat(
      module,
      classicDatLevel(
        [111, 10], // east-facing Chip, ordinary dirt block
        [0, 31], // floor, BLUE_WALL_REAL
      ),
    );
    const converted = conversion.entries[0];

    expect(conversion).toMatchObject({ fileStatus: 0, diagnostics: [] });
    expect(converted).toMatchObject({ status: 0, entryOrdinal: 1 });
    if (!converted || converted.status !== 0) {
      throw new Error("DAT block-over-blue-wall fixture did not convert");
    }

    const engine = createHybridCcV1Engine(module, converted.nativeLevel, 7);
    try {
      const cell = engine.snapshot().cells[1];
      expect(cell?.terrain).toMatchObject({
        id: ELEMENT.steppingStone,
        rule: RULE.becomesWall,
        count: 1,
      });
      expect(cell?.occupant).not.toBeNull();
      expect(engine.snapshot().actors.find(({ id }) => id === cell?.occupant)).toMatchObject({
        kind: ELEMENT.dirtBlock,
        logicalPosition: { x: 1, y: 0, z: 0 },
      });
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });
});
