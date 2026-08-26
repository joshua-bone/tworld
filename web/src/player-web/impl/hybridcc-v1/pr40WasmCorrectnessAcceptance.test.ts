import { describe, expect, it } from "vitest";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import {
  HYBRIDCC_V1_INPUT,
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
} from "./wasmBridge";
import { hybridCcV1PresentedMotion } from "./presentationProjection";

const ELEMENT = {
  floor: 2,
  trickWall: 7,
  ice: 10,
  forceFloor: 11,
  teleport: 13,
  thief: 18,
  key: 29,
  flippers: 32,
  dirtBlock: 38,
  player: 51,
} as const;

const COLOR = {
  blue: 2,
  white: 5,
  brown: 12,
} as const;

const DIRECTION = {
  east: 1,
  west: 3,
  none: 4,
} as const;

const RULE = {
  permanentlyInvisible: 5,
  fromCenter: 6,
  cannotOverride: 12,
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

  writer.u32(0); // count
  writer.u8(0); // finite quantity
  writer.u32(0xffff_ffff); // no text
  writer.u32(0); // no exit time limit
}

function nativeLine(title: string, cells: readonly CellFixture[]): Uint8Array {
  const writer = new ByteWriter();
  writer.bytes.push(0x48, 0x43, 0x4c, 0x56);
  writer.u16(4);
  writer.u32(cells.length);
  writer.u32(1);
  writer.u32(1);
  writer.u32(40);
  writer.u32(0);
  writer.text(title);
  writer.text("HybridCC PR40 WebAssembly acceptance");
  writer.text("");
  writer.text("PR40");
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

function classicDatThiefLevel(): Uint8Array {
  const top = new Uint8Array(32 * 32);
  const bottom = new Uint8Array(32 * 32);
  top.set([
    111, // east-facing Chip
    101, // red key
    104, // flippers
    33, // classic thief
  ]);

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

async function loadModule() {
  const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
  return createHybridCcV1Module({ locateFile: () => wasmUrl });
}

describe("HybridCC v1 PR40 real-Wasm correctness acceptance", () => {
  it.each([
    ["ice", { id: ELEMENT.ice }],
    ["force floor", {
      id: ELEMENT.forceFloor,
      direction: DIRECTION.east,
      rule: RULE.fromCenter,
    }],
  ] as const)("publishes an unbooted first entry onto %s as N+1/two samples", async (_name, terrain) => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("PR40 fast terrain entry", [
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
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });

  it("publishes normal-speed teleport motion as an N+2 interval with four 20 Hz samples", async () => {
    const module = await loadModule();
    const engine = createHybridCcV1Engine(module, nativeLine("PR40 teleport", [
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
        committedPosition: { x: 1, y: 0, z: 0 },
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
    const engine = createHybridCcV1Engine(module, nativeLine("PR40 dirt-block loss", [
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
        committedPosition: { x: 1, y: 0, z: 0 },
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
    const engine = createHybridCcV1Engine(module, nativeLine("PR40 reveal", [
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
        committedPosition: { x: 0, y: 0, z: 0 },
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
        committedPosition: { x: 3, y: 0, z: 0 },
      });
      expect(inventoryKinds).toContain(ELEMENT.key);
      expect(inventoryKinds).not.toContain(ELEMENT.flippers);
      expect(engine.invariantStatus()).toBe(0);
    } finally {
      engine.dispose();
    }
  });
});
