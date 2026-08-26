import { describe, expect, it } from "vitest";
import { MS_FLOOR_STATE, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  HYBRID_CC_V1_COLOR,
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_ORIENTATION,
  HYBRID_CC_V1_RULE,
} from "./engineFacts";
import {
  projectHybridCcV1Cell,
  projectHybridCcV1Inventory,
} from "./renderProjection";
import { testCell, testElement, testInventoryEntry } from "./testFacts";

describe("Hybrid v1 cell projection", () => {
  it("distinguishes bare floor, wall, and an absent visual layer", () => {
    expect(projectHybridCcV1Cell(testCell(), 0, 1)).toMatchObject({
      top: { id: MS_TILE.Empty },
      bottom: { id: MS_TILE.Nothing },
    });
    expect(projectHybridCcV1Cell(testCell({
      terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.wall }),
    }), 0, 1)).toMatchObject({
      top: { id: MS_TILE.Wall },
      bottom: { id: MS_TILE.Nothing },
    });
  });

  it.each([
    [HYBRID_CC_V1_ORIENTATION.northWest, MS_TILE.IceWall_Southeast],
    [HYBRID_CC_V1_ORIENTATION.northEast, MS_TILE.IceWall_Southwest],
    [HYBRID_CC_V1_ORIENTATION.southEast, MS_TILE.IceWall_Northwest],
    [HYBRID_CC_V1_ORIENTATION.southWest, MS_TILE.IceWall_Northeast],
  ])("maps solid ice-corner orientation %i to the opposite open-corner artwork", (orientation, tile) => {
    const projected = projectHybridCcV1Cell(testCell({
      terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.ice }),
      sides: [testElement({ id: HYBRID_CC_V1_ELEMENT.corner, orientation })],
    }), 0, 1);
    expect(projected.top.id).toBe(tile);
  });

  it.each([
    [HYBRID_CC_V1_COLOR.red, MS_TILE.Key_Red, MS_TILE.Door_Red],
    [HYBRID_CC_V1_COLOR.blue, MS_TILE.Key_Blue, MS_TILE.Door_Blue],
    [HYBRID_CC_V1_COLOR.yellow, MS_TILE.Key_Yellow, MS_TILE.Door_Yellow],
    [HYBRID_CC_V1_COLOR.green, MS_TILE.Key_Green, MS_TILE.Door_Green],
  ])("maps named key/door color %i without ordinal casting", (color, keyTile, doorTile) => {
    expect(projectHybridCcV1Cell(testCell({
      pickup: testElement({ id: HYBRID_CC_V1_ELEMENT.key, color }),
    }), 0, 1).top.id).toBe(keyTile);
    expect(projectHybridCcV1Cell(testCell({
      device: testElement({ id: HYBRID_CC_V1_ELEMENT.door, color }),
    }), 0, 1).top.id).toBe(doorTile);
  });

  it("uses current toggle/trap facts and preserves semantic layer order", () => {
    const projected = projectHybridCcV1Cell(testCell({
      terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.trap }),
      device: testElement({ id: HYBRID_CC_V1_ELEMENT.toggleWall, rule: HYBRID_CC_V1_RULE.startsShut }),
      pickup: testElement({ id: HYBRID_CC_V1_ELEMENT.chip }),
      sides: [testElement({ id: HYBRID_CC_V1_ELEMENT.panel, orientation: HYBRID_CC_V1_ORIENTATION.north })],
      trapOpen: true,
      toggleWallOpen: true,
    }), 0, 1);
    expect(projected.top).toEqual({ id: MS_TILE.Wall_North, state: 0 });
    expect(projected.bottom).toEqual({ id: MS_TILE.ICChip, state: 0 });

    const dynamic = projectHybridCcV1Cell(testCell({
      device: testElement({ id: HYBRID_CC_V1_ELEMENT.toggleWall, rule: HYBRID_CC_V1_RULE.startsShut }),
      toggleWallOpen: true,
    }), 0, 1);
    expect(dynamic.top.id).toBe(MS_TILE.SwitchWall_Open);

    const trap = projectHybridCcV1Cell(testCell({
      terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.trap }),
      trapOpen: true,
    }), 0, 1);
    expect(trap.top.state & MS_FLOOR_STATE.TrapOpen).not.toBe(0);
  });

  it("rejects unmapped visible elements instead of disguising them as floor", () => {
    expect(() => projectHybridCcV1Cell(testCell({
      terrain: testElement({ id: HYBRID_CC_V1_ELEMENT.railroad }),
    }), 0, 1)).toThrow(/railroad|element 19/iu);
  });
});

describe("Hybrid v1 inventory projection", () => {
  it("uses explicit HUD order, treats unlimited green as present, and computes remaining chips", () => {
    const inventory = projectHybridCcV1Inventory([
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.red, 11n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.blue, 22n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.yellow, 33n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.key, HYBRID_CC_V1_COLOR.green, 0n, true),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.iceSkates, HYBRID_CC_V1_COLOR.white, 1n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.forceBoots, HYBRID_CC_V1_COLOR.white, 2n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.fireBoots, HYBRID_CC_V1_COLOR.white, 3n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.flippers, HYBRID_CC_V1_COLOR.white, 4n),
      testInventoryEntry(HYBRID_CC_V1_ELEMENT.chip, HYBRID_CC_V1_COLOR.gray, 3n),
    ], 7);
    expect(inventory.keys).toEqual([11, 22, 33, 1]);
    expect(inventory.boots).toEqual([1, 2, 3, 4]);
    expect(inventory.chipsNeeded).toBe(4);
  });
});
