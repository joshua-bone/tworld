import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState } from "@game-core/impl/bowlingBall";
import { createStatefulActorRuntimeStore, findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  canMsPetCarrierCaptureActor,
  createMsPetCarrierMobSnapshot,
  restoreMsPetCarrierMobSnapshotRuntime,
} from "@ruleset-ms/impl/petCarrierSnapshots";
import {
  restoreMsStatefulActorRuntime,
  type MsStatefulActorRuntimeEntry,
} from "@ruleset-ms/impl/statefulActors";

describe("MS pet carrier snapshots", () => {
  it("captures blocks and creatures but rejects special-item actors", () => {
    const store = createStatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>();

    expect(canMsPetCarrierCaptureActor(MS_TILE.Block)).toBe(true);
    expect(canMsPetCarrierCaptureActor(MS_TILE.Bug)).toBe(true);
    expect(canMsPetCarrierCaptureActor(MS_TILE.BowlingBall)).toBe(false);

    expect(createMsPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.Block,
      dir: MS_DIRECTION.east,
    })).toEqual({
      actorId: MS_TILE.Block,
      dir: MS_DIRECTION.east,
    });

    expect(createMsPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.south,
    })).toEqual({
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.south,
    });

    expect(createMsPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.BowlingBall,
      actorSerial: 7,
      dir: MS_DIRECTION.west,
    })).toBeNull();
  });

  it("captures and restores optional stateful runtime payloads through the stateful-actor seam", () => {
    const sourceStore = createStatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>();
    const runtimeState = createMovingBowlingBallState();
    runtimeState.localInventory!.keys[2] = 1;

    restoreMsStatefulActorRuntime(sourceStore, {
      actorSerial: 17,
      kind: "bowling-ball",
      portableBacking: {
        family: "bowling-ball",
        portableItemSerial: 99,
      },
      state: runtimeState,
    });

    const snapshot = createMsPetCarrierMobSnapshot(sourceStore, {
      actorId: MS_TILE.Ball,
      actorSerial: 17,
      dir: MS_DIRECTION.west,
    });
    expect(snapshot).toEqual({
      actorId: MS_TILE.Ball,
      dir: MS_DIRECTION.west,
      runtimeKind: "bowling-ball",
      runtimeState: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 0, 1, 0],
          boots: [0, 0, 0, 0],
        },
      },
    });
    (snapshot!.runtimeState as MsStatefulActorRuntimeEntry["state"]).localInventory!.keys[1] = 9;
    expect(findStatefulActorRuntime(sourceStore, 17)).toEqual({
      actorSerial: 17,
      kind: "bowling-ball",
      portableBacking: {
        family: "bowling-ball",
        portableItemSerial: 99,
      },
      state: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 0, 1, 0],
          boots: [0, 0, 0, 0],
        },
      },
    });

    const restoredStore = createStatefulActorRuntimeStore<MsStatefulActorRuntimeEntry>();
    const restored = restoreMsPetCarrierMobSnapshotRuntime(restoredStore, 21, snapshot);
    expect(restored).toEqual({
      actorSerial: 21,
      kind: "bowling-ball",
      portableBacking: null,
      state: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 9, 1, 0],
          boots: [0, 0, 0, 0],
        },
      },
    });

    (snapshot!.runtimeState as MsStatefulActorRuntimeEntry["state"]).localInventory!.keys[0] = 5;
    expect(findStatefulActorRuntime(restoredStore, 21)).toEqual(restored);
  });
});
