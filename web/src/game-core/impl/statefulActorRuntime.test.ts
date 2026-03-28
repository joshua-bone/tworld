import { describe, expect, it } from "vitest";
import {
  cloneStatefulActorRuntimeStore,
  createStatefulActorRuntimeStore,
  findStatefulActorRuntime,
  forkStatefulActorRuntime,
  removeStatefulActorRuntime,
  setStatefulActorRuntime,
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
});
