import { describe, expect, it } from "vitest";
import { createMovingBowlingBallState } from "@game-core/impl/bowlingBall";
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
  projectMsRegisteredActorRenderSprite,
  projectMsRegisteredPortableItemRender,
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
    expect(lookupMsPortableItemFamilyRegistration("sandbag")?.artworkSpriteId).toBe("sandbag");
    expect(lookupMsPortableItemFamilyRegistrationByTileId(MS_TILE.Hook)?.familyId).toBe("hook");
    expect(lookupMsPortableItemFamilyRegistration("bowling-ball")?.tileId).toBe(MS_TILE.BowlingBall_Still);
    expect(lookupMsPortableItemFamilyRegistrationByTileId(MS_TILE.BowlingBall_Still)?.familyId).toBe("bowling-ball");
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.Sandbag)?.familyId).toBe("portable-items");
    expect(lookupMsTerrainPickupFamilyRegistration(MS_TILE.BowlingBall_Still)?.familyId).toBe("portable-items");
    expect(lookupMsTerrainPickupTileRegistration(MS_TILE.Sandbag)).toEqual({
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "sandbag",
    });
    expect(lookupMsTerrainPickupTileRegistration(MS_TILE.BowlingBall_Still)).toEqual({
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools",
      inventoryIndex: 0,
      portableItemFamily: "bowling-ball",
    });
  });

  it("owns portable item and bowling ball render registration", () => {
    expect(projectMsRegisteredPortableItemRender(MS_TILE.Hook, 0.25)).toEqual({
      mode: "tile",
      tileId: MS_TILE.Hook,
      artworkSpriteId: "hook",
      alpha: 0.25,
    });
    expect(
      projectMsRegisteredActorRenderSprite(
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
