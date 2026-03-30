import { createLynxLevelLoadRegistration, type LynxLevelLoadRegistration } from "@ruleset-lynx/api/levelLoader";
import type { MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { msRegisteredLevelDecodeRegistration } from "@ruleset-ms/impl/builtinLevelRegistration";

export const lynxRegisteredLevelDecodeRegistration: MsLevelDecodeRegistration = msRegisteredLevelDecodeRegistration;
export const lynxRegisteredLevelLoadRegistration: LynxLevelLoadRegistration =
  createLynxLevelLoadRegistration(lynxRegisteredLevelDecodeRegistration);
