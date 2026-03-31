import { describe, expect, it } from "vitest";
import {
  lookupMsBlockSpeciesByActorId,
  lookupMsBlockSpeciesByStaticTileId,
  msActorBlockStaticTileId,
  msCreatureTile,
  msStaticBlockActorId,
  MS_DIRECTION,
  MS_TILE,
} from "@ruleset-ms/api/tiles";

describe("MS block species helpers", () => {
  it("maps dirt and ice blocks between static and actor tile ids", () => {
    expect(lookupMsBlockSpeciesByStaticTileId(MS_TILE.Block_Static)?.speciesId).toBe("dirt");
    expect(lookupMsBlockSpeciesByStaticTileId(MS_TILE.IceBlock_Static)?.speciesId).toBe("ice");
    expect(msStaticBlockActorId(MS_TILE.Block_Static)).toBe(MS_TILE.Block);
    expect(msStaticBlockActorId(MS_TILE.IceBlock_Static)).toBe(MS_TILE.IceBlock);
    expect(msActorBlockStaticTileId(MS_TILE.Block)).toBe(MS_TILE.Block_Static);
    expect(msActorBlockStaticTileId(MS_TILE.IceBlock)).toBe(MS_TILE.IceBlock_Static);
  });

  it("normalizes creature tiles when looking up block actor species", () => {
    expect(lookupMsBlockSpeciesByActorId(msCreatureTile(MS_TILE.Block, MS_DIRECTION.west))?.speciesId).toBe("dirt");
    expect(lookupMsBlockSpeciesByActorId(msCreatureTile(MS_TILE.IceBlock, MS_DIRECTION.east))?.speciesId).toBe("ice");
    expect(lookupMsBlockSpeciesByActorId(MS_TILE.IceBlock)?.initialClonerDir).toBe(MS_DIRECTION.north);
  });
});
