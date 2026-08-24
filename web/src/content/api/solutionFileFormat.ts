import type { RulesetName } from "@content/api/ruleset";
import { parseSolutionRulesetByte, solutionRulesetByte } from "@content/api/ruleset";
import { decodeLatin1, encodeLatin1, readUint8, readUint16, readUint32, trimNulls } from "@content/api/contentBinary";
import {
  contractSolutionData,
  expandSolutionData,
  normalizeSolutionPassword,
  type ExpandedSolutionData,
} from "@content/api/solutionDataCodec";

const CSSIG = 0x999b3335;

export interface SolutionFileEntry {
  levelNumber: number;
  password: string;
  bestTimeTicks: number | null;
  solutionData: Uint8Array | null;
  expandedSolution: ExpandedSolutionData | null;
}

export interface ParsedSolutionFile {
  ruleset: Exclude<RulesetName, "None">;
  flags: number;
  extraHeader: Uint8Array;
  setName: string | null;
  entries: SolutionFileEntry[];
}

export function parseSolutionFile(data: Uint8Array): ParsedSolutionFile {
  let cursor = 0;
  if (readUint32(data, cursor) !== CSSIG) {
    throw new Error("not a valid solution file");
  }
  cursor += 4;

  const ruleset = parseSolutionRulesetByte(readUint8(data, cursor));
  cursor += 1;
  const flags = readUint16(data, cursor);
  cursor += 2;
  const extraSize = readUint8(data, cursor);
  cursor += 1;
  if (cursor + extraSize > data.length) {
    throw new Error("not a valid solution file");
  }
  const extraHeader = data.slice(cursor, cursor + extraSize);
  cursor += extraSize;

  const entries: SolutionFileEntry[] = [];
  let setName: string | null = null;

  while (cursor < data.length) {
    if (cursor + 4 > data.length) {
      throw new Error("truncated solution file entry");
    }
    const size = readUint32(data, cursor);
    cursor += 4;
    if (size === 0) {
      continue;
    }
    if (cursor + size > data.length) {
      throw new Error("truncated solution file entry");
    }

    const entryData = data.slice(cursor, cursor + size);
    cursor += size;
    if (entryData.length <= 16 && entryData.length !== 6) {
      throw new Error("invalid data in solution file");
    }

    const levelNumber = readUint16(entryData, 0);
    const password = trimNulls(decodeLatin1(entryData.slice(2, 6)));
    if (entryData.length === 6) {
      entries.push({
        levelNumber,
        password,
        bestTimeTicks: null,
        solutionData: null,
        expandedSolution: null,
      });
      continue;
    }

    const bestTimeTicks = readUint32(entryData, 12);
    if (levelNumber === 0 && password.length === 0) {
      setName = trimNulls(decodeLatin1(entryData.slice(16)));
      continue;
    }

    entries.push({
      levelNumber,
      password,
      bestTimeTicks,
      solutionData: entryData,
      expandedSolution: expandSolutionData(entryData),
    });
  }

  return {
    ruleset,
    flags,
    extraHeader,
    setName,
    entries,
  };
}

export function serializeSolutionFile(file: ParsedSolutionFile): Uint8Array {
  if (file.ruleset === "Hybrid") {
    throw new Error("Hybrid native replays are not CSS solution files.");
  }
  const data: number[] = [
    CSSIG & 0xff,
    (CSSIG >> 8) & 0xff,
    (CSSIG >> 16) & 0xff,
    (CSSIG >> 24) & 0xff,
    solutionRulesetByte(file.ruleset),
    file.flags & 0xff,
    (file.flags >> 8) & 0xff,
    file.extraHeader.length & 0xff,
    ...file.extraHeader,
  ];

  if (file.setName) {
    const setNameBytes = [...encodeLatin1(file.setName), 0];
    const size = setNameBytes.length + 16;
    data.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff);
    data.push(...new Array(16).fill(0));
    data.push(...setNameBytes);
  }

  for (const entry of file.entries) {
    normalizeSolutionPassword(entry.password);
    let payload: Uint8Array;
    if (entry.solutionData) {
      payload = entry.solutionData;
    } else if (entry.expandedSolution && entry.bestTimeTicks !== null) {
      payload = contractSolutionData(entry.levelNumber, entry.password, entry.bestTimeTicks, entry.expandedSolution);
    } else {
      payload = Uint8Array.from([
        entry.levelNumber & 0xff,
        (entry.levelNumber >> 8) & 0xff,
        ...encodeLatin1(entry.password),
      ]);
    }

    data.push(
      payload.length & 0xff,
      (payload.length >> 8) & 0xff,
      (payload.length >> 16) & 0xff,
      (payload.length >> 24) & 0xff,
    );
    data.push(...payload);
  }

  return Uint8Array.from(data);
}
