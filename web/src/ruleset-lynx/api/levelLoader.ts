import { prepareLynxLevel, type DecodedLynxLevelData, type LynxLevel } from "@ruleset-lynx/api/level";
import { decodeLoadedMsLevelData } from "@ruleset-ms/api/levelLoader";
import { type MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";

export interface LynxLoadedLevelSource {
  layerData: readonly Uint8Array[];
  levelData: Uint8Array;
}

export interface LynxLevelLoadRegistration {
  decodeLoadedLevel: (loaded: LynxLoadedLevelSource) => DecodedLynxLevelData;
  prepareDecodedLevel: (decoded: DecodedLynxLevelData) => LynxLevel;
  prepareLoadedLevel: (loaded: LynxLoadedLevelSource) => LynxLevel;
}

export function decodeLoadedLynxLevelData(
  loaded: LynxLoadedLevelSource,
  registration: MsLevelDecodeRegistration,
): DecodedLynxLevelData {
  return decodeLoadedMsLevelData(loaded, registration);
}

export function prepareLoadedLynxLevel(
  loaded: LynxLoadedLevelSource,
  registration: MsLevelDecodeRegistration,
): LynxLevel {
  return prepareLynxLevel(decodeLoadedLynxLevelData(loaded, registration));
}

export function createLynxLevelLoadRegistration(registration: MsLevelDecodeRegistration): LynxLevelLoadRegistration {
  return {
    decodeLoadedLevel: (loaded) => decodeLoadedLynxLevelData(loaded, registration),
    prepareDecodedLevel: prepareLynxLevel,
    prepareLoadedLevel: (loaded) => prepareLoadedLynxLevel(loaded, registration),
  };
}
