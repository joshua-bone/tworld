import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_DIRECTION, MS_SOUND, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  applyMsBlockedChipEnterEffect,
  applyMsMobExitFloorEffect,
  applyMsTileActivationEffect,
  resolveMsTileSupportBelow,
} from "@ruleset-ms/impl/tileEffects";

function makeCell(topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: { x: 0, y: 0, z: 1, pos: 0 },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

describe("ms tile effects", () => {
  it("reveals blocked hidden walls through the blocked-enter effect", () => {
    const cells = [makeCell(MS_TILE.HiddenWall_Temp)];

    expect(applyMsBlockedChipEnterEffect(cells, 0, true)).toBe(true);
    expect(cells[0]!.top.id).toBe(MS_TILE.Wall);
  });

  it("reveals a blocked hidden wall under an occupant through the blocked-enter effect", () => {
    const cells = [makeCell(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), MS_TILE.BlueWall_Real)];

    expect(applyMsBlockedChipEnterEffect(cells, 0, true)).toBe(true);
    expect(cells[0]!.top.id).toBe(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west));
    expect(cells[0]!.bottom.id).toBe(MS_TILE.Wall);
  });

  it("routes button activation through callbacks and preserves toggle-wall silence", () => {
    let toggled = false;
    let trapped = false;

    const toggleSound = applyMsTileActivationEffect(
      {
        turnTanks: () => {},
        toggleWalls: () => {
          toggled = true;
        },
        activateCloner: () => {},
        springTrap: () => {
          trapped = true;
        },
        buttonPushedSound: 1 << MS_SOUND.ButtonPushed,
      },
      0,
      MS_TILE.Button_Green,
      1,
    );

    const trapSound = applyMsTileActivationEffect(
      {
        turnTanks: () => {},
        toggleWalls: () => {},
        activateCloner: () => {},
        springTrap: () => {
          trapped = true;
        },
        buttonPushedSound: 1 << MS_SOUND.ButtonPushed,
      },
      0,
      MS_TILE.Button_Brown,
      1,
    );

    expect(toggled).toBe(true);
    expect(trapped).toBe(true);
    expect(toggleSound).toBe(0);
    expect(trapSound).toBe(1 << MS_SOUND.ButtonPushed);
  });

  it("uses support tile effects to open fake blue walls out from under Chip", () => {
    const lowerCells = [makeCell(MS_TILE.BlueWall_Fake, MS_TILE.Empty)];
    const result = resolveMsTileSupportBelow(
      {
        inventory: {
          keys: [0, 0, 0, 0],
          boots: [0, 0, 0, 0],
          tools: [0],
          chipsNeeded: 0,
        },
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
      },
      lowerCells,
      0,
      2,
      1,
      {
        airHook: "chip-support",
        inventoryOwner: null,
      },
    );

    expect(result).toBe("unsupported");
    expect(lowerCells[0]!.top.id).toBe(MS_TILE.Empty);
  });

  it("turns an exited top-layer cloud into air", () => {
    const cells = [makeCell(MS_TILE.Cloud)];

    expect(applyMsMobExitFloorEffect(cells, 0)).toBe(true);
    expect(cells[0]!.top.id).toBe(MS_TILE.Air);
  });

  it("turns an exited underlying cloud into air beneath a portable item", () => {
    const cells = [makeCell(MS_TILE.Sandbag, MS_TILE.Cloud)];

    expect(applyMsMobExitFloorEffect(cells, 0)).toBe(true);
    expect(cells[0]!.top.id).toBe(MS_TILE.Sandbag);
    expect(cells[0]!.bottom.id).toBe(MS_TILE.Air);
  });
});
