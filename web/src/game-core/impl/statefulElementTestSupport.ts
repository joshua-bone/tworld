import { describe, expect, it } from "vitest";
import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import type { PortableItemDropProjection } from "@game-core/impl/portableItems";

interface PortableMapState {
  mode: "map";
  pos: number;
  z: number;
}

interface PortableItemSummary {
  serial: number;
  state: {
    mode: string;
  };
}

export interface PortableItemArchetypeHarness<TStore, TInventory> {
  readonly expectedTileId: number;
  readonly actorSerial: number;
  readonly dropLocation: {
    pos: number;
    z: number;
  };
  readonly mapLocation: {
    pos: number;
    z: number;
  };
  createStore(): TStore;
  createInventory(): TInventory;
  project(store: TStore, inventory: TInventory): void;
  findCarriedSerial(store: TStore): number | undefined;
  readCarriedTile(inventory: TInventory): number;
  readDropProjection(store: TStore): PortableItemDropProjection | null;
  activate(store: TStore, inventory: TInventory, serial: number, actorSerial: number): boolean;
  findAttachedSerial(store: TStore, actorSerial: number): number | undefined;
  detachToDrop(store: TStore, inventory: TInventory, serial: number, pos: number, z: number): boolean;
  detachToMap(store: TStore, inventory: TInventory, serial: number, pos: number, z: number): boolean;
  findMapState(store: TStore, serial: number): PortableMapState | undefined;
  destroy(store: TStore, inventory: TInventory, serial: number): boolean;
  summarizeItems(store: TStore): readonly PortableItemSummary[];
}

function requireCarriedSerial<TStore, TInventory>(harness: PortableItemArchetypeHarness<TStore, TInventory>, store: TStore): number {
  const carriedSerial = harness.findCarriedSerial(store);
  expect(carriedSerial).toBeDefined();
  return carriedSerial as number;
}

export function characterizePortableItemArchetypes<TStore, TInventory>(
  name: string,
  harness: PortableItemArchetypeHarness<TStore, TInventory>,
): void {
  describe(name, () => {
    it("keeps a carried-only projection until activation or priming", () => {
      const store = harness.createStore();
      const inventory = harness.createInventory();

      harness.project(store, inventory);

      expect(harness.readCarriedTile(inventory)).toBe(harness.expectedTileId);
      expect(harness.readDropProjection(store)).toBeNull();
    });

    it("supports attach-to-actor activation and clears the carried projection", () => {
      const store = harness.createStore();
      const inventory = harness.createInventory();
      const carriedSerial = requireCarriedSerial(harness, store);

      expect(harness.activate(store, inventory, carriedSerial, harness.actorSerial)).toBe(true);
      expect(harness.findAttachedSerial(store, harness.actorSerial)).toBe(carriedSerial);
      expect(harness.readCarriedTile(inventory)).toBe(0);
      expect(harness.readDropProjection(store)).toBeNull();
    });

    it("supports primed-drop projection after detaching from an actor", () => {
      const store = harness.createStore();
      const inventory = harness.createInventory();
      const carriedSerial = requireCarriedSerial(harness, store);

      expect(harness.activate(store, inventory, carriedSerial, harness.actorSerial)).toBe(true);
      expect(
        harness.detachToDrop(store, inventory, carriedSerial, harness.dropLocation.pos, harness.dropLocation.z),
      ).toBe(true);

      expect(harness.findAttachedSerial(store, harness.actorSerial)).toBeUndefined();
      expect(harness.readDropProjection(store)).toEqual({
        tileId: harness.expectedTileId,
        pos: harness.dropLocation.pos,
        z: harness.dropLocation.z,
      });
    });

    it("supports reusable stateful items that can detach to map, reactivate, and be destroyed", () => {
      const store = harness.createStore();
      const inventory = harness.createInventory();
      const carriedSerial = requireCarriedSerial(harness, store);

      expect(harness.activate(store, inventory, carriedSerial, harness.actorSerial)).toBe(true);
      expect(
        harness.detachToMap(store, inventory, carriedSerial, harness.mapLocation.pos, harness.mapLocation.z),
      ).toBe(true);
      expect(harness.findMapState(store, carriedSerial)).toEqual({
        mode: "map",
        pos: harness.mapLocation.pos,
        z: harness.mapLocation.z,
      });

      const nextActorSerial = harness.actorSerial + 1;
      expect(harness.activate(store, inventory, carriedSerial, nextActorSerial)).toBe(true);
      expect(harness.findAttachedSerial(store, nextActorSerial)).toBe(carriedSerial);

      expect(harness.destroy(store, inventory, carriedSerial)).toBe(true);
      expect(harness.summarizeItems(store)).toEqual([]);
      expect(harness.readCarriedTile(inventory)).toBe(0);
      expect(harness.readDropProjection(store)).toBeNull();
    });
  });
}

export interface ActorEntryMatrixRow<TTileId extends number = number, TActorId extends number = number> {
  readonly label: string;
  readonly tileId: TTileId;
  readonly actorId: TActorId;
  readonly expectedMask: number;
}

export function expectActorEntryMatrix<TTileId extends number = number, TActorId extends number = number>(
  getEntryMask: (tileId: TTileId, actorId: TActorId) => number,
  rows: readonly ActorEntryMatrixRow<TTileId, TActorId>[],
): void {
  for (const row of rows) {
    expect(getEntryMask(row.tileId, row.actorId), row.label).toBe(row.expectedMask);
  }
}

export interface ActorCapabilityMatrixRow<TActorId extends number = number> {
  readonly label: string;
  readonly actorId: TActorId;
  readonly expected: Partial<ActorCapabilityPolicy>;
}

export function expectActorCapabilityMatrix<TActorId extends number = number>(
  getPolicy: (actorId: TActorId) => ActorCapabilityPolicy,
  rows: readonly ActorCapabilityMatrixRow<TActorId>[],
): void {
  for (const row of rows) {
    expect(getPolicy(row.actorId), row.label).toMatchObject(row.expected);
  }
}
