import { TIME_NIL } from "@content/api/score";
import { parseDatRulesetSignature, type RulesetName } from "@content/api/ruleset";
import type { SeriesLevel } from "@content/api/series";

const DAT_FILE_SIGNATURE = 0xaaac;
const UINT64_MASK = (1n << 64n) - 1n;
const HASH_REMAINDERS = [
  0x00000000, 0x04c11db7, 0x09823b6e, 0x0d4326d9, 0x130476dc, 0x17c56b6b, 0x1a864db2, 0x1e475005,
  0x2608edb8, 0x22c9f00f, 0x2f8ad6d6, 0x2b4bcb61, 0x350c9b64, 0x31cd86d3, 0x3c8ea00a, 0x384fbdbd,
  0x4c11db70, 0x48d0c6c7, 0x4593e01e, 0x4152fda9, 0x5f15adac, 0x5bd4b01b, 0x569796c2, 0x52568b75,
  0x6a1936c8, 0x6ed82b7f, 0x639b0da6, 0x675a1011, 0x791d4014, 0x7ddc5da3, 0x709f7b7a, 0x745e66cd,
  0x9823b6e0, 0x9ce2ab57, 0x91a18d8e, 0x95609039, 0x8b27c03c, 0x8fe6dd8b, 0x82a5fb52, 0x8664e6e5,
  0xbe2b5b58, 0xbaea46ef, 0xb7a96036, 0xb3687d81, 0xad2f2d84, 0xa9ee3033, 0xa4ad16ea, 0xa06c0b5d,
  0xd4326d90, 0xd0f37027, 0xddb056fe, 0xd9714b49, 0xc7361b4c, 0xc3f706fb, 0xceb42022, 0xca753d95,
  0xf23a8028, 0xf6fb9d9f, 0xfbb8bb46, 0xff79a6f1, 0xe13ef6f4, 0xe5ffeb43, 0xe8bccd9a, 0xec7dd02d,
  0x34867077, 0x30476dc0, 0x3d044b19, 0x39c556ae, 0x278206ab, 0x23431b1c, 0x2e003dc5, 0x2ac12072,
  0x128e9dcf, 0x164f8078, 0x1b0ca6a1, 0x1fcdbb16, 0x018aeb13, 0x054bf6a4, 0x0808d07d, 0x0cc9cdca,
  0x7897ab07, 0x7c56b6b0, 0x71159069, 0x75d48dde, 0x6b93dddb, 0x6f52c06c, 0x6211e6b5, 0x66d0fb02,
  0x5e9f46bf, 0x5a5e5b08, 0x571d7dd1, 0x53dc6066, 0x4d9b3063, 0x495a2dd4, 0x44190b0d, 0x40d816ba,
  0xaca5c697, 0xa864db20, 0xa527fdf9, 0xa1e6e04e, 0xbfa1b04b, 0xbb60adfc, 0xb6238b25, 0xb2e29692,
  0x8aad2b2f, 0x8e6c3698, 0x832f1041, 0x87ee0df6, 0x99a95df3, 0x9d684044, 0x902b669d, 0x94ea7b2a,
  0xe0b41de7, 0xe4750050, 0xe9362689, 0xedf73b3e, 0xf3b06b3b, 0xf771768c, 0xfa325055, 0xfef34de2,
  0xc6bcf05f, 0xc27dede8, 0xcf3ecb31, 0xcbffd686, 0xd5b88683, 0xd1799b34, 0xdc3abded, 0xd8fba05a,
  0x690ce0ee, 0x6dcdfd59, 0x608edb80, 0x644fc637, 0x7a089632, 0x7ec98b85, 0x738aad5c, 0x774bb0eb,
  0x4f040d56, 0x4bc510e1, 0x46863638, 0x42472b8f, 0x5c007b8a, 0x58c1663d, 0x558240e4, 0x51435d53,
  0x251d3b9e, 0x21dc2629, 0x2c9f00f0, 0x285e1d47, 0x36194d42, 0x32d850f5, 0x3f9b762c, 0x3b5a6b9b,
  0x0315d626, 0x07d4cb91, 0x0a97ed48, 0x0e56f0ff, 0x1011a0fa, 0x14d0bd4d, 0x19939b94, 0x1d528623,
  0xf12f560e, 0xf5ee4bb9, 0xf8ad6d60, 0xfc6c70d7, 0xe22b20d2, 0xe6ea3d65, 0xeba91bbc, 0xef68060b,
  0xd727bbb6, 0xd3e6a601, 0xdea580d8, 0xda649d6f, 0xc423cd6a, 0xc0e2d0dd, 0xcda1f604, 0xc960ebb3,
  0xbd3e8d7e, 0xb9ff90c9, 0xb4bcb610, 0xb07daba7, 0xae3afba2, 0xaafbe615, 0xa7b8c0cc, 0xa379dd7b,
  0x9b3660c6, 0x9ff77d71, 0x92b45ba8, 0x9675461f, 0x8832161a, 0x8cf30bad, 0x81b02d74, 0x857130c3,
  0x5d8a9099, 0x594b8d2e, 0x5408abf7, 0x50c9b640, 0x4e8ee645, 0x4a4ffbf2, 0x470cdd2b, 0x43cdc09c,
  0x7b827d21, 0x7f436096, 0x7200464f, 0x76c15bf8, 0x68860bfd, 0x6c47164a, 0x61043093, 0x65c52d24,
  0x119b4be9, 0x155a565e, 0x18197087, 0x1cd86d30, 0x029f3d35, 0x065e2082, 0x0b1d065b, 0x0fdc1bec,
  0x3793a651, 0x3352bbe6, 0x3e119d3f, 0x3ad08088, 0x2497d08d, 0x2056cd3a, 0x2d15ebe3, 0x29d4f654,
  0xc5a92679, 0xc1683bce, 0xcc2b1d17, 0xc8ea00a0, 0xd6ad50a5, 0xd26c4d12, 0xdf2f6bcb, 0xdbee767c,
  0xe3a1cbc1, 0xe760d676, 0xea23f0af, 0xeee2ed18, 0xf0a5bd1d, 0xf464a0aa, 0xf9278673, 0xfde69bc4,
  0x89b8fd09, 0x8d79e0be, 0x803ac667, 0x84fbdbd0, 0x9abc8bd5, 0x9e7d9662, 0x933eb0bb, 0x97ffad0c,
  0xafb010b1, 0xab710d06, 0xa6322bdf, 0xa2f33668, 0xbcb4666d, 0xb8757bda, 0xb5365d03, 0xb1f740b4,
] as const;

export interface SeriesConfig {
  mapFile: string;
  finalLevel: number;
  ruleset: RulesetName;
  ignorePasswords: boolean;
  fixLynx: boolean;
  fileInSetsDir: boolean;
}

export interface ParsedDatFile {
  headerRuleset: Exclude<RulesetName, "None">;
  ruleset: RulesetName;
  levelCount: number;
  levels: SeriesLevel[];
}

export interface RawDatLevel {
  index: number;
  number: number;
  levelData: Uint8Array;
}

export interface RawDatLevelGroup {
  index: number;
  number: number;
  levelData: Uint8Array;
  layerData: Uint8Array[];
  layerNumbers: number[];
}

function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error("unexpected end of file while reading uint16");
  }
  return data[offset] | (data[offset + 1] << 8);
}

function decodeLatin1(data: Uint8Array): string {
  return Array.from(data, (value) => String.fromCharCode(value)).join("");
}

function trimNulls(value: string): string {
  return value.replace(/\0+$/g, "");
}

function decodePasswordField(field: Uint8Array): string {
  const chars: string[] = [];
  for (let index = 0; index < field.length && index < 15; index += 1) {
    if (field[index] === 0) {
      break;
    }
    chars.push(String.fromCharCode(field[index]! ^ 0x99));
  }
  return chars.join("");
}

function hasPathname(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

export function parseSeriesConfig(text: string): SeriesConfig {
  const config: SeriesConfig = {
    mapFile: "",
    finalLevel: 0,
    ruleset: "None",
    ignorePasswords: false,
    fixLynx: false,
    fileInSetsDir: false,
  };

  for (const rawLine of text.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^([^=\s]+)\s*=\s*(.+)$/.exec(line);
    if (!match) {
      throw new Error(`invalid configuration file syntax: ${line}`);
    }

    const [, rawName, rawValue] = match;
    const name = rawName.toLowerCase();
    const value = rawValue.trim();

    switch (name) {
      case "file":
        if (hasPathname(value)) {
          throw new Error("levelset filename may not contain a path");
        }
        config.mapFile = value;
        break;
      case "lastlevel": {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          throw new Error(`invalid lastlevel in configuration file: ${value}`);
        }
        config.finalLevel = parsed;
        break;
      }
      case "ruleset": {
        const normalized = value.toLowerCase();
        if (normalized !== "ms" && normalized !== "lynx") {
          throw new Error(`invalid ruleset in configuration file: ${value}`);
        }
        config.ruleset = normalized === "ms" ? "MS" : "Lynx";
        break;
      }
      case "usepasswords":
        config.ignorePasswords = value.toLowerCase().startsWith("n");
        break;
      case "fixlynx":
        config.fixLynx = !value.toLowerCase().startsWith("n");
        break;
      case "fileinsetsdir":
        config.fileInSetsDir = !value.toLowerCase().startsWith("n");
        break;
      default:
        throw new Error(`unrecognized setting in configuration file: ${name}`);
    }
  }

  if (!config.mapFile) {
    throw new Error("configuration file is missing a file= directive");
  }

  return config;
}

export function computeLegacyLevelHash(levelData: Uint8Array): string {
  let accum = 0xffffffffn;

  for (const value of levelData) {
    const index = Number(((accum >> 24n) ^ BigInt(value)) & 0xffn);
    accum = (((accum << 8n) & UINT64_MASK) ^ BigInt(HASH_REMAINDERS[index]!)) & UINT64_MASK;
  }

  return ((accum ^ 0xffffffffn) & UINT64_MASK).toString();
}

interface ParsedLegacyLevelMetadata {
  author: string;
  chipsRequired: number;
  gameplayFields: Array<{
    bytes: Uint8Array;
    id: number;
  }>;
  name: string;
  password: string;
  timeLimitSeconds: number;
}

function parseLegacyLevelMetadata(levelData: Uint8Array): ParsedLegacyLevelMetadata {
  if (levelData.length < 10) {
    throw new Error("invalid level data");
  }

  const number = readUint16(levelData, 0);
  let timeLimitSeconds = readUint16(levelData, 2);
  let chipsRequired = readUint16(levelData, 4);
  let name = "";
  let author = "";
  let password = "";
  const gameplayFields: ParsedLegacyLevelMetadata["gameplayFields"] = [];

  let cursor = 10 + readUint16(levelData, 8);
  if (cursor + 2 >= levelData.length) {
    throw new Error(`level ${number}: invalid level data`);
  }

  cursor += readUint16(levelData, cursor);
  cursor += 2;
  if (cursor + 2 > levelData.length) {
    throw new Error(`level ${number}: invalid metadata block`);
  }

  const metadataSize = readUint16(levelData, cursor);
  cursor += 2;
  const metadataEnd = Math.min(cursor + metadataSize, levelData.length);

  while (cursor + 2 < metadataEnd) {
    const fieldId = levelData[cursor];
    const fieldSize = Math.min(levelData[cursor + 1] ?? 0, metadataEnd - cursor - 2);
    const fieldStart = cursor + 2;
    const field = levelData.slice(fieldStart, fieldStart + fieldSize);

    switch (fieldId) {
      case 1:
        if (field.length > 1) {
          timeLimitSeconds = readUint16(field, 0);
        }
        break;
      case 2:
        if (field.length > 1) {
          chipsRequired = readUint16(field, 0);
        }
        break;
      case 3:
        name = trimNulls(decodeLatin1(field));
        break;
      case 4:
      case 5:
      case 10:
        gameplayFields.push({
          id: fieldId,
          bytes: levelData.slice(cursor, fieldStart + fieldSize),
        });
        break;
      case 6:
        password = decodePasswordField(field);
        break;
      case 9:
        author = trimNulls(decodeLatin1(field));
        break;
      default:
        break;
    }

    cursor = fieldStart + fieldSize;
  }

  if (password.length !== 4) {
    throw new Error(`level ${number}: invalid password`);
  }

  return {
    author,
    chipsRequired,
    gameplayFields,
    name,
    password,
    timeLimitSeconds,
  };
}

export function computeLegacyLevelGameplayHash(levelData: Uint8Array): string {
  if (levelData.length < 10) {
    throw new Error("invalid level data");
  }

  const { chipsRequired, gameplayFields } = parseLegacyLevelMetadata(levelData);
  const upperSize = readUint16(levelData, 8);
  const upperStart = 10;
  const upperEnd = upperStart + upperSize;
  if (upperEnd + 2 > levelData.length) {
    throw new Error("invalid level data");
  }

  const lowerSize = readUint16(levelData, upperEnd);
  const lowerStart = upperEnd + 2;
  const lowerEnd = lowerStart + lowerSize;
  if (lowerEnd + 2 > levelData.length) {
    throw new Error("invalid level data");
  }

  const normalizedGameplayFields = [...gameplayFields].sort((left, right) => left.id - right.id);
  const metadataSize = normalizedGameplayFields.reduce((total, field) => total + field.bytes.length, 0);
  const normalized = new Uint8Array(10 + upperSize + 2 + lowerSize + 2 + metadataSize);

  normalized[4] = chipsRequired & 0xff;
  normalized[5] = (chipsRequired >> 8) & 0xff;
  normalized[8] = upperSize & 0xff;
  normalized[9] = (upperSize >> 8) & 0xff;
  normalized.set(levelData.slice(upperStart, upperEnd), upperStart);

  let cursor = upperEnd;
  normalized[cursor] = lowerSize & 0xff;
  normalized[cursor + 1] = (lowerSize >> 8) & 0xff;
  cursor += 2;
  normalized.set(levelData.slice(lowerStart, lowerEnd), cursor);
  cursor += lowerSize;
  normalized[cursor] = metadataSize & 0xff;
  normalized[cursor + 1] = (metadataSize >> 8) & 0xff;
  cursor += 2;
  for (const field of normalizedGameplayFields) {
    normalized.set(field.bytes, cursor);
    cursor += field.bytes.length;
  }

  return computeLegacyLevelHash(normalized);
}

function parseLevel(levelData: Uint8Array, index: number): SeriesLevel {
  if (levelData.length < 10) {
    throw new Error("invalid level data");
  }

  const number = readUint16(levelData, 0);
  const metadata = parseLegacyLevelMetadata(levelData);

  return {
    index,
    number,
    name: metadata.name,
    author: metadata.author,
    password: metadata.password,
    timeLimitSeconds: metadata.timeLimitSeconds,
    chipsRequired: metadata.chipsRequired,
    bestTimeTicks: TIME_NIL,
    levelSize: levelData.length,
    solutionSize: 0,
    levelHash: computeLegacyLevelHash(levelData),
    gameplayHash: computeLegacyLevelGameplayHash(levelData),
    hasSolution: false,
    sgflags: 0,
    unsolvable: null,
  };
}

interface ThreeDLevelTitleParts {
  baseName: string;
  layerNumber: number;
}

interface ThreeDLevelRun {
  start: number;
  endExclusive: number;
  baseName: string | null;
  descending: boolean;
}

function parseThreeDLevelTitle(name: string): ThreeDLevelTitleParts | null {
  const match = /^(.*)\\([1-9][0-9]*)$/.exec(name);
  if (!match) {
    return null;
  }

  return {
    baseName: match[1] ?? "",
    layerNumber: Number.parseInt(match[2] ?? "", 10),
  };
}

function groupContiguousThreeDLevelRuns<T extends { name: string }>(
  entries: readonly T[],
): ThreeDLevelRun[] {
  const runs: ThreeDLevelRun[] = [];

  for (let index = 0; index < entries.length; ) {
    const first = parseThreeDLevelTitle(entries[index]?.name ?? "");
    if (!first) {
      runs.push({ start: index, endExclusive: index + 1, baseName: null, descending: false });
      index += 1;
      continue;
    }

    if (first.layerNumber === 1) {
      let endExclusive = index + 1;
      let expectedLayerNumber = 2;
      while (endExclusive < entries.length) {
        const next = parseThreeDLevelTitle(entries[endExclusive]?.name ?? "");
        if (!next || next.baseName !== first.baseName || next.layerNumber !== expectedLayerNumber) {
          break;
        }
        endExclusive += 1;
        expectedLayerNumber += 1;
      }

      if (endExclusive - index > 1) {
        runs.push({ start: index, endExclusive, baseName: first.baseName, descending: false });
      } else {
        runs.push({ start: index, endExclusive: index + 1, baseName: null, descending: false });
      }
      index = endExclusive;
      continue;
    }

    let endExclusive = index + 1;
    let expectedLayerNumber = first.layerNumber - 1;
    while (endExclusive < entries.length && expectedLayerNumber >= 1) {
      const next = parseThreeDLevelTitle(entries[endExclusive]?.name ?? "");
      if (!next || next.baseName !== first.baseName || next.layerNumber !== expectedLayerNumber) {
        break;
      }
      endExclusive += 1;
      expectedLayerNumber -= 1;
    }

    if (endExclusive - index > 1 && expectedLayerNumber === 0) {
      runs.push({ start: index, endExclusive, baseName: first.baseName, descending: true });
      index = endExclusive;
    } else {
      runs.push({ start: index, endExclusive: index + 1, baseName: null, descending: false });
      index += 1;
    }
  }

  return runs;
}

function primaryThreeDRunIndex(run: ThreeDLevelRun): number {
  if (run.baseName === null) {
    return run.start;
  }
  return run.descending ? run.endExclusive - 1 : run.start;
}

export function parseDatFile(data: Uint8Array, options: { ruleset?: RulesetName } = {}): ParsedDatFile {
  const extracted = extractDatLevels(data);
  const parsedLevels = extracted.levels.map((level, index) => parseLevel(level.levelData, index));
  const runs = groupContiguousThreeDLevelRuns(parsedLevels);
  const levels = runs.map((run, groupedIndex) => {
    const level = { ...parsedLevels[primaryThreeDRunIndex(run)]! };
    if (run.baseName !== null) {
      level.name = run.baseName;
    }
    level.number = groupedIndex + 1;
    level.index = groupedIndex;
    return level;
  });

  return {
    headerRuleset: extracted.headerRuleset,
    ruleset: options.ruleset && options.ruleset !== "None" ? options.ruleset : extracted.headerRuleset,
    levelCount: levels.length,
    levels,
  };
}

export function extractDatLevels(data: Uint8Array): {
  headerRuleset: Exclude<RulesetName, "None">;
  levels: RawDatLevel[];
} {
  let cursor = 0;
  const signature = readUint16(data, cursor);
  cursor += 2;
  if (signature !== DAT_FILE_SIGNATURE) {
    throw new Error("not a valid data file");
  }

  const headerRuleset = parseDatRulesetSignature(readUint16(data, cursor));
  cursor += 2;
  const declaredLevelCount = readUint16(data, cursor);
  cursor += 2;
  if (declaredLevelCount <= 0) {
    throw new Error("file contains no maps");
  }

  const levels: RawDatLevel[] = [];
  for (let index = 0; index < declaredLevelCount; index += 1) {
    const levelSize = readUint16(data, cursor);
    cursor += 2;
    if (cursor + levelSize > data.length) {
      throw new Error(`unexpected EOF while reading level ${index + 1}`);
    }
    const levelData = data.slice(cursor, cursor + levelSize);
    cursor += levelSize;
    levels.push({
      index,
      number: readUint16(levelData, 0),
      levelData,
    });
  }

  return {
    headerRuleset,
    levels,
  };
}

export function extractGroupedDatLevels(data: Uint8Array): {
  headerRuleset: Exclude<RulesetName, "None">;
  levels: RawDatLevelGroup[];
} {
  const extracted = extractDatLevels(data);
  const parsedLevels = extracted.levels.map((level, index) => parseLevel(level.levelData, index));
  const runs = groupContiguousThreeDLevelRuns(parsedLevels);

  return {
    headerRuleset: extracted.headerRuleset,
    levels: runs.map((run, groupedIndex) => {
      const layers = extracted.levels.slice(run.start, run.endExclusive);
      const primary = extracted.levels[primaryThreeDRunIndex(run)]!;
      const logicalLayers = run.descending ? [...layers].reverse() : layers;
      return {
        index: groupedIndex,
        number: groupedIndex + 1,
        levelData: primary.levelData,
        layerData: logicalLayers.map((layer) => layer.levelData),
        layerNumbers: logicalLayers.map((layer) => layer.number),
      };
    }),
  };
}
