import { describe, expect, it } from "vitest";
import { msLevelLoadRegistration } from "@ruleset-ms/api/levelLoader";
import { msBuiltinLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { msCreatureTile, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  lookupMsActorFamilyRegistration,
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  lookupMsTerrainPickupFamilyRegistration,
  lookupMsTerrainPickupTileRegistration,
  msElementFamilyRegistration,
} from "@ruleset-ms/impl/elementRegistration";

describe("MS element registration", () => {
  it("maps actor families through root and creature tile ids", () => {
    expect(lookupMsActorFamilyRegistration(MS_TILE.Chip)?.familyId).toBe("chip");
    expect(lookupMsActorFamilyRegistration(MS_TILE.Pushing_Chip)?.familyId).toBe("chip");
    expect(lookupMsActorFamilyRegistration(MS_TILE.Block)?.familyId).toBe("block");
    expect(lookupMsActorFamilyRegistration(MS_TILE.BowlingBall)?.familyId).toBe("bowling-ball");
    expect(lookupMsActorFamilyRegistration(msCreatureTile(MS_TILE.Fireball, 1))?.familyId).toBe("creature");
    expect(lookupMsActorFamilyRegistration(MS_TILE.Teleport)).toBeUndefined();
  });

  it("maps portable item families and portable terrain tile registration", () => {
    expect(lookupMsPortableItemFamilyRegistration("sandbag")?.tileId).toBe(MS_TILE.Sandbag);
    expect(lookupMsPortableItemFamilyRegistrationByTileId(MS_TILE.Hook)?.familyId).toBe("hook");
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Sandbag)?.familyId).toBe("portable-items");
    expect(lookupMsTerrainPickupTileRegistration(MS_TILE.Sandbag)).toEqual({
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "sandbag",
    });
  });

  it("maps keys, boots, doors, buttons, and load registrations", () => {
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Key_Blue)?.familyId).toBe("keys");
    expect(lookupMsTerrainPickupTileRegistration(MS_TILE.Key_Blue)?.inventoryIndex).toBe(1);
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Boots_Fire)?.familyId).toBe("boots");
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Door_Yellow)?.familyId).toBe("doors");
    expect(lookupMsTerrainPickupTileRegistration(MS_TILE.Door_Yellow)?.doorKeyIndex).toBe(2);
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Button_Brown)?.familyId).toBe("buttons");
    expect(msElementFamilyRegistration.levelDecodeRegistration).toBe(msBuiltinLevelDecodeRegistration);
    expect(msElementFamilyRegistration.levelLoadRegistration).toBe(msLevelLoadRegistration);
  });
});
