export interface MsLevelDecodeContext {
  z: number;
  hasHigherLayers: boolean;
}

export interface MsLevelDecodeRegistrationEntry {
  fileCode: number;
  tileId: number;
  resolveTileId?: (tileId: number, context: MsLevelDecodeContext) => number;
}

export interface MsLevelDecodeRegistration {
  resolveTileId: (fileCode: number, context: MsLevelDecodeContext) => number | undefined;
}

export function createMsLevelDecodeRegistration(
  entries: readonly MsLevelDecodeRegistrationEntry[],
): MsLevelDecodeRegistration {
  const entriesByCode = new Map(entries.map((entry) => [entry.fileCode, entry] as const));

  return {
    resolveTileId(fileCode, context) {
      const entry = entriesByCode.get(fileCode);
      if (!entry) {
        return undefined;
      }

      return entry.resolveTileId?.(entry.tileId, context) ?? entry.tileId;
    },
  };
}
