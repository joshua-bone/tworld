import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState } from "@game-core/impl/bowlingBall";
import { createStatefulActorRuntimeStore, findStatefulActorRuntime } from "@game-core/impl/statefulActorRuntime";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  canLynxPetCarrierCaptureActor,
  createLynxPetCarrierMobSnapshot,
  restoreLynxPetCarrierMobSnapshotRuntime,
} from "@ruleset-lynx/impl/petCarrierSnapshots";
import {
  restoreLynxStatefulActorRuntime,
  type LynxStatefulActorRuntimeEntry,
} from "@ruleset-lynx/impl/statefulActors";

describe("Lynx pet carrier snapshots", () => {
  it("captures blocks and creatures but rejects special-item actors", () => {
    const store = createStatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>();

    expect(canLynxPetCarrierCaptureActor(MS_TILE.IceBlock)).toBe(true);
    expect(canLynxPetCarrierCaptureActor(MS_TILE.Bug)).toBe(true);
    expect(canLynxPetCarrierCaptureActor(MS_TILE.BowlingBall)).toBe(false);

    expect(createLynxPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.IceBlock,
      dir: MS_DIRECTION.north,
    })).toEqual({
      actorId: MS_TILE.IceBlock,
      dir: MS_DIRECTION.north,
    });

    expect(createLynxPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.south,
    })).toEqual({
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.south,
    });

    expect(createLynxPetCarrierMobSnapshot(store, {
      actorId: MS_TILE.BowlingBall,
      actorSerial: 8,
      dir: MS_DIRECTION.east,
    })).toBeNull();
  });

  it("captures and restores optional stateful runtime payloads through the stateful-actor seam", () => {
    const sourceStore = createStatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>();
    const runtimeState = createMovingBowlingBallState();
    runtimeState.localInventory!.boots[3] = 1;

    restoreLynxStatefulActorRuntime(sourceStore, {
      actorSerial: 12,
      kind: "bowling-ball",
      portableBacking: {
        family: "bowling-ball",
        portableItemSerial: 55,
      },
      state: runtimeState,
    });

    const snapshot = createLynxPetCarrierMobSnapshot(sourceStore, {
      actorId: MS_TILE.Ball,
      actorSerial: 12,
      dir: MS_DIRECTION.east,
    });
    expect(snapshot).toEqual({
      actorId: MS_TILE.Ball,
      dir: MS_DIRECTION.east,
      runtimeKind: "bowling-ball",
      runtimeState: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 0, 0, 0],
          boots: [0, 0, 0, 1],
        },
      },
    });
    (snapshot!.runtimeState as LynxStatefulActorRuntimeEntry["state"]).localInventory!.boots[0] = 7;
    expect(findStatefulActorRuntime(sourceStore, 12)).toEqual({
      actorSerial: 12,
      kind: "bowling-ball",
      portableBacking: {
        family: "bowling-ball",
        portableItemSerial: 55,
      },
      state: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 0, 0, 0],
          boots: [0, 0, 0, 1],
        },
      },
    });

    const restoredStore = createStatefulActorRuntimeStore<LynxStatefulActorRuntimeEntry>();
    const restored = restoreLynxPetCarrierMobSnapshotRuntime(restoredStore, 19, snapshot);
    expect(restored).toEqual({
      actorSerial: 19,
      kind: "bowling-ball",
      portableBacking: null,
      state: {
        mode: "moving",
        travelDirection: null,
        localInventory: {
          keys: [0, 0, 0, 0],
          boots: [7, 0, 0, 1],
        },
      },
    });

    (snapshot!.runtimeState as LynxStatefulActorRuntimeEntry["state"]).localInventory!.boots[1] = 4;
    expect(findStatefulActorRuntime(restoredStore, 19)).toEqual(restored);
  });
});
