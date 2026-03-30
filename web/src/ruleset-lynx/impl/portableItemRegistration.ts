import type { LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxPortableItemFamilyRegistration {
  familyId: LynxPortableItemFamily;
  tileId: number;
  inventorySlot: "tools";
  artworkSpriteId: string;
}

export const lynxPortableItemFamilyRegistrations = [
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
] as const satisfies readonly LynxPortableItemFamilyRegistration[];

const lynxPortableItemFamilyByFamilyId = new Map<LynxPortableItemFamily, LynxPortableItemFamilyRegistration>(
  lynxPortableItemFamilyRegistrations.map((registration) => [registration.familyId, registration] as const),
);

const lynxPortableItemFamilyByTileId = new Map<number, LynxPortableItemFamilyRegistration>(
  lynxPortableItemFamilyRegistrations.map((registration) => [registration.tileId, registration] as const),
);

export function lookupLynxPortableItemFamilyRegistration(
  familyId: LynxPortableItemFamily,
): LynxPortableItemFamilyRegistration | undefined {
  return lynxPortableItemFamilyByFamilyId.get(familyId);
}

export function lookupLynxPortableItemFamilyRegistrationByTileId(
  tileId: number,
): LynxPortableItemFamilyRegistration | undefined {
  return lynxPortableItemFamilyByTileId.get(tileId);
}
