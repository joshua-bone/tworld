import type { LynxLevelLoadRegistration } from "@ruleset-lynx/api/levelLoader";
import {
  lynxRegisteredLevelDecodeRegistration,
  lynxRegisteredLevelLoadRegistration,
} from "@ruleset-lynx/impl/builtinLevelRegistration";
import {
  lookupLynxActorDefinitionRegistration,
  lookupLynxActorFamilyRegistration,
  lynxActorFamilyRegistrations,
  projectLynxRegisteredActorRenderSprite,
  type LynxActorFamilyRegistration,
} from "@ruleset-lynx/impl/elements/actors/registration";
import {
  lookupLynxTerrainPickupFamilyRegistration,
  lookupLynxTerrainPickupTileRegistration,
  lynxTerrainPickupFamilyRegistrations,
  projectLynxRegisteredPortableItemRender,
  type LynxTerrainPickupFamilyRegistration,
  type LynxTerrainPickupTileRegistration,
} from "@ruleset-lynx/impl/terrainPickupRegistration";
import {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lynxPortableItemFamilyRegistrations,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";
import type { MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";

export {
  lookupLynxActorDefinitionRegistration,
  lookupLynxActorFamilyRegistration,
  projectLynxRegisteredActorRenderSprite,
  type LynxActorFamilyRegistration,
} from "@ruleset-lynx/impl/elements/actors/registration";
export {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";
export {
  lookupLynxTerrainPickupFamilyRegistration,
  lookupLynxTerrainPickupTileRegistration,
  projectLynxRegisteredPortableItemRender,
  type LynxTerrainPickupFamilyRegistration,
  type LynxTerrainPickupTileRegistration,
} from "@ruleset-lynx/impl/terrainPickupRegistration";
export {
  lynxRegisteredLevelDecodeRegistration,
  lynxRegisteredLevelLoadRegistration,
} from "@ruleset-lynx/impl/builtinLevelRegistration";

export interface LynxElementFamilyRegistration {
  actorFamilies: readonly LynxActorFamilyRegistration[];
  portableItemFamilies: readonly LynxPortableItemFamilyRegistration[];
  terrainPickupFamilies: readonly LynxTerrainPickupFamilyRegistration[];
  levelDecodeRegistration: MsLevelDecodeRegistration;
  levelLoadRegistration: LynxLevelLoadRegistration;
}

export const lynxElementFamilyRegistration: LynxElementFamilyRegistration = {
  actorFamilies: lynxActorFamilyRegistrations,
  portableItemFamilies: lynxPortableItemFamilyRegistrations,
  terrainPickupFamilies: lynxTerrainPickupFamilyRegistrations,
  levelDecodeRegistration: lynxRegisteredLevelDecodeRegistration,
  levelLoadRegistration: lynxRegisteredLevelLoadRegistration,
};
