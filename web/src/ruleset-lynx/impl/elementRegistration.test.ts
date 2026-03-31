import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState } from "@game-core/impl/bowlingBall";
import { lynxActorFamilyRegistrations } from "@ruleset-lynx/impl/elements/actors/registration";
import {
  lookupLynxActorFamilyRegistration,
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lookupLynxTerrainPickupFamilyRegistration,
  lookupLynxTerrainPickupTileRegistration,
  lynxElementFamilyRegistration,
  lynxRegisteredLevelDecodeRegistration,
  lynxRegisteredLevelLoadRegistration,
  projectLynxRegisteredActorRenderSprite,
  projectLynxRegisteredPortableItemRender,
} from "@ruleset-lynx/impl/elementRegistration";
import { lynxTerrainPickupFamilyRegistrations } from "@ruleset-lynx/impl/terrainPickupRegistration";
import { msCreatureTile, MS_TILE } from "@ruleset-ms/api/tiles";

describe("Lynx element registration", () => {
  it("maps actor families through root and creature tile ids", () => {
    expect(lookupLynxActorFamilyRegistration(MS_TILE.Chip)?.familyId).toBe("chip");
    expect(lookupLynxActorFamilyRegistration(MS_TILE.Swimming_Chip)?.familyId).toBe("chip");
    expect(lookupLynxActorFamilyRegistration(MS_TILE.Block)?.familyId).toBe("block");
    expect(lookupLynxActorFamilyRegistration(MS_TILE.IceBlock)?.familyId).toBe("block");
    expect(lookupLynxActorFamilyRegistration(MS_TILE.BowlingBall)?.familyId).toBe("bowling-ball");
    expect(lookupLynxActorFamilyRegistration(msCreatureTile(MS_TILE.Glider, 1))?.familyId).toBe("creature");
    expect(lookupLynxActorFamilyRegistration(MS_TILE.Teleport)).toBeUndefined();
  });

  it("maps portable item families and portable terrain tile registration", () => {
    expect(lookupLynxPortableItemFamilyRegistration("sandbag")?.tileId).toBe(MS_TILE.Sandbag);
    expect(lookupLynxPortableItemFamilyRegistration("sandbag")?.artworkSpriteId).toBe("sandbag");
    expect(lookupLynxPortableItemFamilyRegistrationByTileId(MS_TILE.Hook)?.familyId).toBe("hook");
    expect(lookupLynxPortableItemFamilyRegistration("pet-carrier")?.tileId).toBe(MS_TILE.PetCarrier);
    expect(lookupLynxPortableItemFamilyRegistrationByTileId(MS_TILE.PetCarrier)?.familyId).toBe("pet-carrier");
    expect(lookupLynxPortableItemFamilyRegistration("bowling-ball")?.tileId).toBe(MS_TILE.BowlingBall_Still);
    expect(lookupLynxPortableItemFamilyRegistrationByTileId(MS_TILE.BowlingBall_Still)?.familyId).toBe("bowling-ball");
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.Sandbag)?.familyId).toBe("portable-items");
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.PetCarrier)?.familyId).toBe("portable-items");
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.BowlingBall_Still)?.familyId).toBe("portable-items");
    expect(lookupLynxTerrainPickupTileRegistration(MS_TILE.Sandbag)).toEqual({
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "sandbag",
    });
    expect(lookupLynxTerrainPickupTileRegistration(MS_TILE.PetCarrier)).toEqual({
      tileId: MS_TILE.PetCarrier,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "pet-carrier",
    });
    expect(lookupLynxTerrainPickupTileRegistration(MS_TILE.BowlingBall_Still)).toEqual({
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "bowling-ball",
    });
  });

  it("owns portable item and bowling ball render registration", () => {
    expect(projectLynxRegisteredPortableItemRender(MS_TILE.PetCarrier, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.PetCarrier,
      artworkSpriteId: "pet_carrier",
      alpha: 0.25,
    });
    expect(projectLynxRegisteredPortableItemRender(MS_TILE.Hook, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Hook,
      artworkSpriteId: "hook",
      alpha: 0.25,
    });
    expect(
      projectLynxRegisteredActorRenderSprite(
        { id: MS_TILE.BowlingBall, dir: 4, moving: 1, frame: 0 },
        {
          actorSerial: 1,
          kind: "bowling-ball",
          portableBacking: null,
          state: createMovingBowlingBallState(),
        },
      ),
    ).toMatchObject({
      tileId: MS_TILE.BowlingBall,
      artworkSpriteId: "bowling_ball_moving",
    });
  });

  it("maps keys, boots, doors, buttons, and load registrations", () => {
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.Key_Blue)?.familyId).toBe("keys");
    expect(lookupLynxTerrainPickupTileRegistration(MS_TILE.Key_Blue)?.inventoryIndex).toBe(1);
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.Boots_Fire)?.familyId).toBe("boots");
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.Door_Yellow)?.familyId).toBe("doors");
    expect(lookupLynxTerrainPickupTileRegistration(MS_TILE.Door_Yellow)?.doorKeyIndex).toBe(2);
    expect(lookupLynxTerrainPickupFamilyRegistration(MS_TILE.Button_Brown)?.familyId).toBe("buttons");
    expect(lynxElementFamilyRegistration.levelDecodeRegistration).toBe(lynxRegisteredLevelDecodeRegistration);
    expect(lynxElementFamilyRegistration.levelLoadRegistration).toBe(lynxRegisteredLevelLoadRegistration);
  });

  it("assembles dedicated actor and pickup registration bundles", () => {
    expect(lynxElementFamilyRegistration.actorFamilies).toBe(lynxActorFamilyRegistrations);
    expect(lynxElementFamilyRegistration.terrainPickupFamilies).toBe(lynxTerrainPickupFamilyRegistrations);
  });
});
