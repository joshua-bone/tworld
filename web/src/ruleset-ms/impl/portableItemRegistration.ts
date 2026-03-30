import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";

export interface MsPortableItemFamilyRegistration {
  familyId: MsPortableItemFamily;
  tileId: number;
  inventorySlot: "tools";
  artworkSpriteId: string;
}

export const msPortableItemFamilyRegistrations = [
  {
    familyId: "sandbag",
    tileId: MS_TILE.Sandbag,
    inventorySlot: "tools",
    artworkSpriteId: "sandbag",
  },
  {
    familyId: "hook",
    tileId: MS_TILE.Hook,
    inventorySlot: "tools",
    artworkSpriteId: "hook",
  },
  {
    familyId: "bowling-ball",
    tileId: MS_TILE.BowlingBall_Still,
    inventorySlot: "tools",
    artworkSpriteId: "bowling_ball_still",
  },
] as const satisfies readonly MsPortableItemFamilyRegistration[];

const msPortableItemFamilyByFamilyId = new Map<MsPortableItemFamily, MsPortableItemFamilyRegistration>(
  msPortableItemFamilyRegistrations.map((registration) => [registration.familyId, registration] as const),
);

const msPortableItemFamilyByTileId = new Map<number, MsPortableItemFamilyRegistration>(
  msPortableItemFamilyRegistrations.map((registration) => [registration.tileId, registration] as const),
);

export function lookupMsPortableItemFamilyRegistration(
  familyId: MsPortableItemFamily,
): MsPortableItemFamilyRegistration | undefined {
  return msPortableItemFamilyByFamilyId.get(familyId);
}

export function lookupMsPortableItemFamilyRegistrationByTileId(
  tileId: number,
): MsPortableItemFamilyRegistration | undefined {
  return msPortableItemFamilyByTileId.get(tileId);
}
