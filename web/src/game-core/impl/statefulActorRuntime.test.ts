import { describe, expect, it } from "vitest";
import {
  createActorIdStatefulActorRuntimeFamilyAdapter,
  cloneStatefulActorRuntimeStore,
  createStatefulActorRuntimeFamilyAdapter,
  createStatefulActorRuntimeRegistry,
  createStatefulActorRuntimeStore,
  findStatefulActorRuntime,
  forkStatefulActorRuntime,
  removeStatefulActorRuntime,
  setStatefulActorRuntime,
  snapshotStatefulActorRuntime,
  type StatefulActorRuntimeEntry,
} from "@game-core/impl/statefulActorRuntime";

interface TestActorRuntimeEntry extends StatefulActorRuntimeEntry<
  "bowling-ball" | "ghost",
  { mode: string; inventory?: { keys: number[] } }
> {}

describe("statefulActorRuntime", () => {
  it("stores and removes arbitrary per-actor runtime payloads", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();

    setStatefulActorRuntime(store, {
      actorSerial: 4,
      kind: "bowling-ball",
      state: {
        mode: "moving",
        inventory: { keys: [1, 0, 0, 0] },
      },
    });

    expect(findStatefulActorRuntime(store, 4)).toEqual({
      actorSerial: 4,
      kind: "bowling-ball",
      state: {
        mode: "moving",
        inventory: { keys: [1, 0, 0, 0] },
      },
    });

    removeStatefulActorRuntime(store, 4);
    expect(findStatefulActorRuntime(store, 4)).toBeUndefined();
  });

  it("forks runtime state to a cloned actor without aliasing nested state", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();
    setStatefulActorRuntime(store, {
      actorSerial: 7,
      kind: "ghost",
      state: {
        mode: "phasing",
        inventory: { keys: [0, 1, 0, 0] },
      },
    });

    const clone = forkStatefulActorRuntime(store, 7, 11);
    expect(clone).toEqual({
      actorSerial: 11,
      kind: "ghost",
      state: {
        mode: "phasing",
        inventory: { keys: [0, 1, 0, 0] },
      },
    });

    clone!.state.inventory!.keys[1] = 9;

    expect(findStatefulActorRuntime(store, 7)?.state.inventory?.keys).toEqual([0, 1, 0, 0]);
    expect(findStatefulActorRuntime(store, 11)?.state.inventory?.keys).toEqual([0, 9, 0, 0]);
  });

  it("clones the store deeply for undo-style snapshotting", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();
    setStatefulActorRuntime(store, {
      actorSerial: 3,
      kind: "bowling-ball",
      state: {
        mode: "still",
        inventory: { keys: [0, 0, 1, 0] },
      },
    });

    const snapshot = cloneStatefulActorRuntimeStore(store);
    snapshot.byActorSerial.get(3)!.state.inventory!.keys[2] = 5;

    expect(findStatefulActorRuntime(store, 3)?.state.inventory?.keys).toEqual([0, 0, 1, 0]);
    expect(findStatefulActorRuntime(snapshot, 3)?.state.inventory?.keys).toEqual([0, 0, 5, 0]);
  });

  it("projects runtime snapshots without portable-backing aliasing", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();
    setStatefulActorRuntime(store, {
      actorSerial: 8,
      kind: "bowling-ball",
      portableBacking: { family: "sandbag", portableItemSerial: 14 },
      state: {
        mode: "moving",
        inventory: { keys: [0, 0, 0, 1] },
      },
    });

    const snapshot = snapshotStatefulActorRuntime(store, 8);
    expect(snapshot).toEqual({
      kind: "bowling-ball",
      state: {
        mode: "moving",
        inventory: { keys: [0, 0, 0, 1] },
      },
    });

    snapshot!.state.inventory!.keys[3] = 9;
    expect(findStatefulActorRuntime(store, 8)).toEqual({
      actorSerial: 8,
      kind: "bowling-ball",
      portableBacking: { family: "sandbag", portableItemSerial: 14 },
      state: {
        mode: "moving",
        inventory: { keys: [0, 0, 0, 1] },
      },
    });
  });

  it("supports family-owned spawn, restore, clone, destroy, and portable-backing lifecycle", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();
    const adapter = createStatefulActorRuntimeFamilyAdapter<
      TestActorRuntimeEntry,
      { spawn: boolean }
    >({
      kind: "bowling-ball",
      createSpawnEntry(actorSerial, context) {
        if (!context.spawn) {
          return null;
        }
        return {
          actorSerial,
          kind: "bowling-ball",
          portableBacking: null,
          state: { mode: "moving" },
        };
      },
    });

    expect(adapter.spawn(store, 5, { spawn: true })).toEqual({
      actorSerial: 5,
      kind: "bowling-ball",
      portableBacking: null,
      state: { mode: "moving" },
    });

    expect(adapter.attachPortableBacking(store, 5, { family: "sandbag", portableItemSerial: 9 })).toMatchObject({
      actorSerial: 5,
      portableBacking: { family: "sandbag", portableItemSerial: 9 },
    });

    expect(adapter.detachPortableBacking(store, 5)).toMatchObject({
      actorSerial: 5,
      portableBacking: null,
    });

    expect(
      adapter.restore(store, {
        actorSerial: 6,
        kind: "bowling-ball",
        portableBacking: null,
        state: { mode: "still" },
      }),
    ).toMatchObject({
      actorSerial: 6,
      state: { mode: "still" },
    });

    expect(adapter.clone(store, 6, 7)).toEqual({
      actorSerial: 7,
      kind: "bowling-ball",
      portableBacking: null,
      state: { mode: "still" },
    });

    adapter.destroy(store, 6);
    expect(findStatefulActorRuntime(store, 6)).toBeUndefined();
    expect(findStatefulActorRuntime(store, 7)).toBeTruthy();
  });

  it("supports actor-id gated adapters through the shared registry helper", () => {
    const store = createStatefulActorRuntimeStore<TestActorRuntimeEntry>();
    const registry = createStatefulActorRuntimeRegistry([
      createActorIdStatefulActorRuntimeFamilyAdapter<TestActorRuntimeEntry>({
        kind: "bowling-ball",
        actorId: 71,
        createEntry(actorSerial) {
          return {
            actorSerial,
            kind: "bowling-ball",
            portableBacking: null,
            state: { mode: "moving" },
          };
        },
      }),
    ]);

    expect(registry.createInitial(5, { actorId: 71 })).toEqual({
      actorSerial: 5,
      kind: "bowling-ball",
      portableBacking: null,
      state: { mode: "moving" },
    });
    expect(registry.createInitial(6, { actorId: 99 })).toBeNull();

    registry.seed(store, 7, { actorId: 71 });
    expect(registry.find(store, 7)).toMatchObject({
      actorSerial: 7,
      kind: "bowling-ball",
    });

    expect(registry.attachPortableBacking(store, 7, { family: "sandbag", portableItemSerial: 3 })).toMatchObject({
      portableBacking: { family: "sandbag", portableItemSerial: 3 },
    });
    expect(registry.detachPortableBacking(store, 7)).toMatchObject({
      portableBacking: null,
    });
  });
});
