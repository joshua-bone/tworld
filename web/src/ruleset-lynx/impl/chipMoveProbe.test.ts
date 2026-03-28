import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { LYNX_CELL_FLAG } from "@ruleset-lynx/api/cellFlags";
import {
  LYNX_CHIP_TARGET_CELL_PROBE,
  lynxChipTargetCellAllowsEntry,
  lynxChipTargetCellAllowsPush,
  lynxChipTargetCellStopsOnPush,
  probeLynxChipTargetCell,
} from "@ruleset-lynx/impl/chipMoveProbe";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function makeCell(topId: number, topState = 0, bottomId = MS_TILE.Empty): EngineMapCell {
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
});
