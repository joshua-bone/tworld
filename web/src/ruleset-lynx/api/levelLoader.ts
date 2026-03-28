import { prepareLynxLevel, type DecodedLynxLevelData, type LynxLevel } from "@ruleset-lynx/api/level";
import { decodeLoadedMsLevelData } from "@ruleset-ms/api/levelLoader";
import {
  msBuiltinLevelDecodeRegistration,
  type MsLevelDecodeRegistration,
} from "@ruleset-ms/api/levelRegistration";

export interface LynxLoadedLevelSource {
  layerData: readonly Uint8Array[];
  levelData: Uint8Array;
}

export interface LynxLevelLoadRegistration {
  decodeLoadedLevel: (loaded: LynxLoadedLevelSource, registration?: MsLevelDecodeRegistration) => DecodedLynxLevelData;
  prepareDecodedLevel: (decoded: DecodedLynxLevelData) => LynxLevel;
  prepareLoadedLevel: (loaded: LynxLoadedLevelSource, registration?: MsLevelDecodeRegistration) => LynxLevel;
}

export function decodeLoadedLynxLevelData(
  loaded: LynxLoadedLevelSource,
  registration: MsLevelDecodeRegistration = msBuiltinLevelDecodeRegistration,
): DecodedLynxLevelData {
  return decodeLoadedMsLevelData(loaded, registration);
}

export function prepareLoadedLynxLevel(
  loaded: LynxLoadedLevelSource,
  registration: MsLevelDecodeRegistration = msBuiltinLevelDecodeRegistration,
): LynxLevel {
  return prepareLynxLevel(decodeLoadedLynxLevelData(loaded, registration));
}

export const lynxLevelLoadRegistration: LynxLevelLoadRegistration = {
  decodeLoadedLevel: decodeLoadedLynxLevelData,
  prepareDecodedLevel: prepareLynxLevel,
  prepareLoadedLevel: prepareLoadedLynxLevel,
};
