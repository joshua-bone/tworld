import { decodeMsLevelGroupData, prepareMsLevel, type DecodedMsLevelData, type MsLevel } from "@ruleset-ms/api/level";
import {
  msBuiltinLevelDecodeRegistration,
  type MsLevelDecodeRegistration,
} from "@ruleset-ms/api/levelRegistration";

export interface MsLoadedLevelSource {
  layerData: readonly Uint8Array[];
  levelData: Uint8Array;
}

export interface MsLevelLoadRegistration {
  decodeLoadedLevel: (loaded: MsLoadedLevelSource, registration?: MsLevelDecodeRegistration) => DecodedMsLevelData;
  prepareDecodedLevel: (decoded: DecodedMsLevelData) => MsLevel;
  prepareLoadedLevel: (loaded: MsLoadedLevelSource, registration?: MsLevelDecodeRegistration) => MsLevel;
}

export function decodeLoadedMsLevelData(
  loaded: MsLoadedLevelSource,
  registration: MsLevelDecodeRegistration = msBuiltinLevelDecodeRegistration,
): DecodedMsLevelData {
  return decodeMsLevelGroupData(loaded.layerData, loaded.levelData, registration);
}

export function prepareLoadedMsLevel(
  loaded: MsLoadedLevelSource,
  registration: MsLevelDecodeRegistration = msBuiltinLevelDecodeRegistration,
): MsLevel {
  return prepareMsLevel(decodeLoadedMsLevelData(loaded, registration));
}

export const msLevelLoadRegistration: MsLevelLoadRegistration = {
  decodeLoadedLevel: decodeLoadedMsLevelData,
  prepareDecodedLevel: prepareMsLevel,
  prepareLoadedLevel: prepareLoadedMsLevel,
};
