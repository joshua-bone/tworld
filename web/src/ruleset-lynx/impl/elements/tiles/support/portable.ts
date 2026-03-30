import { lookupLynxPortableItemFamilyRegistrationByTileId } from "@ruleset-lynx/impl/portableItemRegistration";
import type { LynxTileSupportBehaviorContext } from "@ruleset-lynx/impl/elements/tiles/families/support";
import { markLynxSupported } from "@ruleset-lynx/impl/elements/tiles/families/support";

export function hasLynxPortableSupportBehavior(tileId: number): boolean {
  return lookupLynxPortableItemFamilyRegistrationByTileId(tileId)?.supportsNonChipAirOccupants ?? false;
}

export function applyLynxPortableSupportBehavior(
  context: LynxTileSupportBehaviorContext,
  chipSupport: boolean,
): boolean {
  if (
    !lookupLynxPortableItemFamilyRegistrationByTileId(context.tileId)?.supportsNonChipAirOccupants ||
    chipSupport ||
    context.layer !== "top"
  ) {
    return false;
  }
  markLynxSupported(context);
  return true;
}
