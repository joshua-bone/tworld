import { lookupMsPortableItemFamilyRegistrationByTileId } from "@ruleset-ms/impl/portableItemRegistration";
import type { MsTileSupportBehaviorContext } from "@ruleset-ms/impl/elements/tiles/families/support";
import { markMsSupported } from "@ruleset-ms/impl/elements/tiles/families/support";

export function hasMsPortableSupportBehavior(tileId: number): boolean {
  return lookupMsPortableItemFamilyRegistrationByTileId(tileId)?.supportsNonChipAirOccupants ?? false;
}

export function applyMsPortableSupportBehavior(
  context: MsTileSupportBehaviorContext,
  chipSupport: boolean,
): boolean {
  if (
    !lookupMsPortableItemFamilyRegistrationByTileId(context.tileId)?.supportsNonChipAirOccupants ||
    chipSupport ||
    context.layer !== "top"
  ) {
    return false;
  }
  markMsSupported(context);
  return true;
}
