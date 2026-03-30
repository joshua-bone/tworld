import { decodeMsLevelGroupData, prepareMsLevel, type DecodedMsLevelData, type MsLevel } from "@ruleset-ms/api/level";
import { type MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";

export interface MsLoadedLevelSource {
  layerData: readonly Uint8Array[];
  levelData: Uint8Array;
}

export interface MsLevelLoadRegistration {
  decodeLoadedLevel: (loaded: MsLoadedLevelSource) => DecodedMsLevelData;
  prepareDecodedLevel: (decoded: DecodedMsLevelData) => MsLevel;
  prepareLoadedLevel: (loaded: MsLoadedLevelSource) => MsLevel;
}

export function decodeLoadedMsLevelData(
  loaded: MsLoadedLevelSource,
  registration: MsLevelDecodeRegistration,
): DecodedMsLevelData {
  return decodeMsLevelGroupData(loaded.layerData, loaded.levelData, registration);
}

export function prepareLoadedMsLevel(
  loaded: MsLoadedLevelSource,
  registration: MsLevelDecodeRegistration,
): MsLevel {
  return prepareMsLevel(decodeLoadedMsLevelData(loaded, registration));
}

export function createMsLevelLoadRegistration(registration: MsLevelDecodeRegistration): MsLevelLoadRegistration {
  return {
    decodeLoadedLevel: (loaded) => decodeLoadedMsLevelData(loaded, registration),
    prepareDecodedLevel: prepareMsLevel,
    prepareLoadedLevel: (loaded) => prepareLoadedMsLevel(loaded, registration),
  };
}
