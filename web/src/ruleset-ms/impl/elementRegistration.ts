import type { MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import {
  msRegisteredLevelDecodeEntries,
  msRegisteredLevelDecodeRegistration,
  msRegisteredLevelLoadRegistration,
} from "@ruleset-ms/impl/builtinLevelRegistration";
import {
  lookupMsActorDefinitionRegistration,
  lookupMsActorFamilyRegistration,
  msActorFamilyRegistrations,
  projectMsRegisteredActorRenderSprite,
  type MsActorFamilyRegistration,
} from "@ruleset-ms/impl/elements/actors/registration";
import {
  lookupMsTerrainPickupFamilyRegistration,
  lookupMsTerrainPickupTileRegistration,
  msTerrainPickupFamilyRegistrations,
  projectMsRegisteredPortableItemRender,
  type MsTerrainPickupFamilyRegistration,
  type MsTerrainPickupTileRegistration,
} from "@ruleset-ms/impl/terrainPickupRegistration";
import {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  msPortableItemFamilyRegistrations,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";
import type { MsLevelLoadRegistration } from "@ruleset-ms/api/levelLoader";

export {
  lookupMsActorDefinitionRegistration,
  lookupMsActorFamilyRegistration,
  projectMsRegisteredActorRenderSprite,
  type MsActorFamilyRegistration,
} from "@ruleset-ms/impl/elements/actors/registration";
export {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";
export {
  lookupMsTerrainPickupFamilyRegistration,
  lookupMsTerrainPickupTileRegistration,
  projectMsRegisteredPortableItemRender,
  type MsTerrainPickupFamilyRegistration,
  type MsTerrainPickupTileRegistration,
} from "@ruleset-ms/impl/terrainPickupRegistration";
export {
  msRegisteredLevelDecodeEntries,
  msRegisteredLevelDecodeRegistration,
  msRegisteredLevelLoadRegistration,
} from "@ruleset-ms/impl/builtinLevelRegistration";

export interface MsElementFamilyRegistration {
  actorFamilies: readonly MsActorFamilyRegistration[];
  portableItemFamilies: readonly MsPortableItemFamilyRegistration[];
  terrainPickupFamilies: readonly MsTerrainPickupFamilyRegistration[];
  levelDecodeRegistration: MsLevelDecodeRegistration;
  levelLoadRegistration: MsLevelLoadRegistration;
}

export const msElementFamilyRegistration: MsElementFamilyRegistration = {
  actorFamilies: msActorFamilyRegistrations,
  portableItemFamilies: msPortableItemFamilyRegistrations,
  terrainPickupFamilies: msTerrainPickupFamilyRegistrations,
  levelDecodeRegistration: msRegisteredLevelDecodeRegistration,
  levelLoadRegistration: msRegisteredLevelLoadRegistration,
};
