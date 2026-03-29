import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { noActorCollisionOutcome } from "@game-core/api/actorInteractions";
import { OCCUPANCY_TARGET_KIND } from "@game-core/impl/occupancy";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  LYNX_CHIP_TARGET_CELL_PROBE,
  lynxChipTargetCellAllowsEntry,
  lynxChipTargetCellAllowsPush,
  lynxChipTargetCellStopsOnPush,
  probeLynxChipMoveDirectionWithContext,
  probeLynxChipTargetCell,
} from "@ruleset-lynx/impl/chipMoveProbe";
import { lynxActorInteractionOutcome, lynxInteractionTargetFromOccupancy } from "@ruleset-lynx/impl/actorInteractions";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

function makeCell(topId: number, topState: number = 0, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: { x: 0, y: 0, z: 1, pos: 0 },
    top: { id: topId, state: topState },
    bottom: { id: bottomId, state: 0 },
  };
}

function makeState(cell: EngineMapCell): EngineState {
  return {
    request: { seriesFile: "", levelNumber: 1, ruleset: "Lynx" },
    status: "playing",
    timer: { tick: 0, currentTime: 0, timeOffset: 0, secondsPlayed: 0, timeLimit: 0 },
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
      chipsNeeded: 0,
    },
    replay: {
      cursor: 0,
      stepping: 0,
      moveCount: 0,
      bestTimeTicks: 0,
      initialRandomSlideDirection: "north",
      randomState: {
        main: { initial: "0", value: "0", shared: false },
        lynx: { prng1: 0, prng2: 0 },
      },
    },
    chip: null,
    actors: [],
    map: {
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells: [cell],
    },
    view: { x: 0, y: 0 },
    soundEffects: 0,
    statusFlags: 0,
    lastMove: { code: 0, name: "none" },
  };
}

describe("probeLynxChipTargetCell", () => {
  it("blocks unclaimed reveal walls but allows push-only claimed reveal walls", () => {
    const state = makeState(makeCell(MS_TILE.HiddenWall_Temp));

    const unclaimed = probeLynxChipTargetCell(state, 0, MS_DIRECTION.east);
    const claimed = probeLynxChipTargetCell(state, 0, MS_DIRECTION.east, { claimedCell: true });

    expect(unclaimed.status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.blocked);
    expect(claimed.status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.pushOnly);
    expect(lynxChipTargetCellAllowsPush(claimed)).toBe(true);
    expect(lynxChipTargetCellStopsOnPush(claimed)).toBe(true);
  });

  it("requires keys for doors", () => {
    const state = makeState(makeCell(MS_TILE.Door_Blue));

    expect(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east).status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.blocked);

    state.inventory.keys[1] = 1;
    expect(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east).status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.enter);
  });

  it("requires global chip progress to be complete for sockets", () => {
    const state = makeState(makeCell(MS_TILE.Socket));
    state.inventory.chipsNeeded = 1;

    expect(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east).status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.blocked);

    state.inventory.chipsNeeded = 0;
    expect(lynxChipTargetCellAllowsEntry(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east))).toBe(true);
  });

  it("blocks animated cells", () => {
    const state = makeState(makeCell(MS_TILE.Empty, LYNX_CELL_FLAG.Animated));

    expect(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east).status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.blocked);
  });

  it("blocks a reveal wall under an occupant", () => {
    const state = makeState(makeCell(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), 0, MS_TILE.BlueWall_Real));

    expect(probeLynxChipTargetCell(state, 0, MS_DIRECTION.east).status).toBe(LYNX_CHIP_TARGET_CELL_PROBE.blocked);
  });
});

describe("probeLynxChipMoveDirectionWithContext", () => {
  it("allows entry into claimed non-block cells", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    state.map.cells[1] = {
      ...makeCell(MS_TILE.Empty, LYNX_CELL_FLAG.Claimed),
      position: { x: 1, y: 0, z: 1, pos: 1 },
    };

    const probe = probeLynxChipMoveDirectionWithContext(
      {
        state,
        chipPos: 0,
        canExit: () => true,
        queryTargetOccupancy: (pos) => ({
          kind: OCCUPANCY_TARGET_KIND.empty,
          pos,
          z: 1,
          tileId: MS_TILE.Empty,
          claimed: true,
        }),
        probeTargetCell: (pos, dir, claimedCell) => probeLynxChipTargetCell(state, pos, dir, { claimedCell }),
        interactionOutcome: () => noActorCollisionOutcome(),
        canPushBlock: () => false,
      },
      MS_DIRECTION.east,
    );

    expect(probe.canEnter).toBe(true);
    expect(probe.canMove).toBe(true);
    expect(probe.willCollide).toBe(false);
  });

  it("exposes collision intent through the interaction seam", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    state.map.cells[1] = {
      ...makeCell(MS_TILE.Empty),
      position: { x: 1, y: 0, z: 1, pos: 1 },
    };

    let sameDirection = false;
    const probe = probeLynxChipMoveDirectionWithContext(
      {
        state,
        chipPos: 0,
        canExit: () => true,
        queryTargetOccupancy: (pos) => ({
          kind: OCCUPANCY_TARGET_KIND.runtimeActor,
          pos,
          z: 1,
          tileId: MS_TILE.BowlingBall,
          claimed: false,
          runtimeActor: {
            id: MS_TILE.BowlingBall,
            dir: MS_DIRECTION.east,
            hidden: false,
            moving: 0,
            deferPush: false,
          },
        }),
        probeTargetCell: (pos, dir, claimedCell) => probeLynxChipTargetCell(state, pos, dir, { claimedCell }),
        interactionOutcome: (target) => {
          sameDirection = target.sameDirection === true;
          return {
            chipFails: true,
            denyMove: false,
            removeMovingActor: false,
            removeTargetActor: true,
            preserveTarget: false,
            consumeTarget: false,
            transformTargetTileId: null,
          };
        },
        canPushBlock: () => false,
      },
      MS_DIRECTION.east,
    );

    expect(sameDirection).toBe(true);
    expect(probe.canEnter).toBe(true);
    expect(probe.willCollide).toBe(true);
  });

  it("denies same-direction entry into a moving bowling ball through the interaction seam", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    state.map.cells[1] = {
      ...makeCell(MS_TILE.Empty),
      position: { x: 1, y: 0, z: 1, pos: 1 },
    };

    const probe = probeLynxChipMoveDirectionWithContext(
      {
        state,
        chipPos: 0,
        canExit: () => true,
        queryTargetOccupancy: (pos) => ({
          kind: OCCUPANCY_TARGET_KIND.runtimeActor,
          pos,
          z: 1,
          tileId: MS_TILE.BowlingBall,
          claimed: false,
          runtimeActor: {
            id: MS_TILE.BowlingBall,
            dir: MS_DIRECTION.east,
            hidden: false,
            moving: 0,
            deferPush: false,
          },
        }),
        probeTargetCell: (pos, dir, claimedCell) => probeLynxChipTargetCell(state, pos, dir, { claimedCell }),
        interactionOutcome: (target) => lynxActorInteractionOutcome(MS_TILE.Chip, target),
        canPushBlock: () => false,
      },
      MS_DIRECTION.east,
    );

    expect(
      lynxActorInteractionOutcome(
        MS_TILE.Chip,
        lynxInteractionTargetFromOccupancy(
          {
            kind: OCCUPANCY_TARGET_KIND.runtimeActor,
            pos: 1,
            z: 1,
            tileId: MS_TILE.BowlingBall,
            claimed: false,
            runtimeActor: {
              id: MS_TILE.BowlingBall,
              dir: MS_DIRECTION.east,
            },
          },
          MS_DIRECTION.east,
        ),
      ).denyMove,
    ).toBe(true);
    expect(probe.canEnter).toBe(false);
    expect(probe.canMove).toBe(false);
    expect(probe.willCollide).toBe(false);
  });
});
