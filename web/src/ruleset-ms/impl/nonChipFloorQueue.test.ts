import { describe, expect, it } from "vitest";
import { MsNonChipFloorQueue, type MsFloorQueueState, type MsFloorQueueTrackedCreature } from "@ruleset-ms/impl/nonChipFloorQueue";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";

function createQueueState(): MsFloorQueueState {
  return {
    creatureSlipList: [],
    blocks: [],
  };
}

function createCreature(serial: number, pos: number, slipDir: number): MsFloorQueueTrackedCreature {
  return {
    serial,
    pos,
    hidden: false,
    cloning: false,
    floorMovement: "slide",
    floorMovementDir: slipDir,
  };
}

describe("nonChipFloorQueue", () => {
  it("orders active creature and block entries by slip order and requeues with a new order", () => {
    const creatures = new Map<number, MsFloorQueueTrackedCreature>([
      [1, createCreature(1, 5, MS_DIRECTION.east)],
    ]);
    const state: MsFloorQueueState = {
      creatureSlipList: [{ serial: 1, dir: MS_DIRECTION.north, slipOrder: 3 }],
      blocks: [
        {
          pos: 9,
          hidden: false,
          floorMovement: "slide",
          floorMovementDir: MS_DIRECTION.south,
          slipOrder: 2,
        },
      ],
    };
    let nextSlipOrder = 10;
    const queue = new MsNonChipFloorQueue({
      state,
      findCreature: (serial) => creatures.get(serial),
      reserveNextSlipOrder: () => nextSlipOrder++,
    });

    expect(queue.entries).toEqual([
      { kind: "block", blockIndex: 0, slipOrder: 2 },
      { kind: "creature", serial: 1, dir: MS_DIRECTION.north, slipOrder: 3 },
    ]);

    queue.requeueEntry(0);

    expect(queue.entries).toEqual([
      { kind: "creature", serial: 1, dir: MS_DIRECTION.north, slipOrder: 3 },
      { kind: "block", blockIndex: 0, slipOrder: 10 },
    ]);
  });

  it("appends newly active entries and syncs updated slip state back to runtime storage", () => {
    const creatures = new Map<number, MsFloorQueueTrackedCreature>([
      [1, createCreature(1, 12, MS_DIRECTION.east)],
      [2, createCreature(2, 18, MS_DIRECTION.west)],
    ]);
    const state = createQueueState();
    state.creatureSlipList = [{ serial: 1, dir: MS_DIRECTION.north, slipOrder: 4 }];
    state.blocks = [
      {
        pos: 8,
        hidden: false,
        floorMovement: "slide",
        floorMovementDir: MS_DIRECTION.south,
        slipOrder: 2,
      },
      {
        pos: 30,
        hidden: true,
        floorMovement: "slide",
        floorMovementDir: MS_DIRECTION.west,
        slipOrder: 7,
      },
    ];

    const queue = new MsNonChipFloorQueue({
      state,
      findCreature: (serial) => creatures.get(serial),
      reserveNextSlipOrder: () => 99,
    });

    state.creatureSlipList.push({ serial: 2, dir: MS_DIRECTION.west, slipOrder: 6 });
    creatures.get(1)!.floorMovementDir = MS_DIRECTION.south;
    queue.appendNewActiveEntries();
    queue.updateEntry(queue.entries[1]!);
    queue.syncBackToState();

    expect(queue.entries).toEqual([
      { kind: "block", blockIndex: 0, slipOrder: 2 },
      { kind: "creature", serial: 1, dir: MS_DIRECTION.south, slipOrder: 4 },
      { kind: "creature", serial: 2, dir: MS_DIRECTION.west, slipOrder: 6 },
    ]);
    expect(state.creatureSlipList).toEqual([
      { serial: 1, dir: MS_DIRECTION.south, slipOrder: 4 },
      { serial: 2, dir: MS_DIRECTION.west, slipOrder: 6 },
    ]);
    expect(state.blocks[0]?.slipOrder).toBe(2);
    expect(state.blocks[1]?.slipOrder).toBe(-1);
  });
});
