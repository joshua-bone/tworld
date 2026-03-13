import type { TableCell, TableSpec } from "@domain/table";

export const TICKS_PER_SECOND = 20;
export const SGF_HASPASSWD = 0x0001;
export const SGF_REPLACEABLE = 0x0002;
export const TIME_NIL = 0x7fffffff;

export interface ScoreLevelRecord {
  index: number;
  number: number;
  name: string;
  timeLimitSeconds: number;
  bestTimeTicks: number;
  hasSolution: boolean;
  sgflags: number;
}

export interface TableWithRows {
  rowLevelIndexes: number[];
  table: TableSpec;
}

function decimal(value: number, zeroChar = "0"): string {
  const negative = value < 0;
  let remainder = Math.abs(value);
  const digits: string[] = [];

  do {
    digits.push(String.fromCharCode(zeroChar.charCodeAt(0) + (remainder % 10)));
    remainder = Math.floor(remainder / 10);
  } while (remainder > 0);

  if (negative) {
    digits.push("-");
  }

  return digits.reverse().join("");
}

function commaDecimal(value: number, zeroChar = "0"): string {
  const negative = value < 0;
  let remainder = Math.abs(value);
  const digits: string[] = [];
  let count = 0;

  do {
    count += 1;
    if (count > 1 && (count - 1) % 3 === 0) {
      digits.push(",");
    }
    digits.push(String.fromCharCode(zeroChar.charCodeAt(0) + (remainder % 10)));
    remainder = Math.floor(remainder / 10);
  } while (remainder > 0);

  if (negative) {
    digits.push("-");
  }

  return digits.reverse().join("");
}

function rightCell(text: string, span = 1): TableCell {
  return { span, align: "+", text };
}

function leftCell(text: string, span = 1): TableCell {
  return { span, align: "-", text };
}

function centerCell(text: string, span = 1): TableCell {
  return { span, align: ".", text };
}

export function createScoreTable(levels: ScoreLevelRecord[], usePasswords = true, zeroChar = "0"): TableWithRows {
  const rows: TableCell[][] = [
    [
      rightCell("Level"),
      leftCell("Name"),
      rightCell("Base"),
      rightCell("Bonus"),
      rightCell("Score"),
    ],
  ];
  const rowLevelIndexes: number[] = [];
  let totalScore = 0;

  for (const level of levels) {
    if (level.hasSolution) {
      const row: TableCell[] = [rightCell(decimal(level.number, zeroChar)), leftCell(level.name)];
      if ((level.sgflags & SGF_REPLACEABLE) !== 0) {
        row.push(centerCell("*BAD*", 3));
      } else {
        const baseScore = level.number * 500;
        const timeScore =
          level.timeLimitSeconds > 0
            ? 10 * (level.timeLimitSeconds - Math.floor(level.bestTimeTicks / TICKS_PER_SECOND))
            : 0;
        row.push(rightCell(commaDecimal(baseScore, zeroChar)));
        row.push(rightCell(level.timeLimitSeconds > 0 ? commaDecimal(timeScore, zeroChar) : "---"));
        row.push(rightCell(commaDecimal(baseScore + timeScore, zeroChar)));
        totalScore += baseScore + timeScore;
      }
      rows.push(row);
      rowLevelIndexes.push(level.index);
      continue;
    }

    if (!usePasswords || (level.sgflags & SGF_HASPASSWD) !== 0) {
      rows.push([rightCell(decimal(level.number, zeroChar)), leftCell(level.name, 4)]);
      rowLevelIndexes.push(level.index);
      continue;
    }

    rows.push([rightCell(decimal(level.number, zeroChar)), leftCell(" ", 4)]);
    rowLevelIndexes.push(-1);
  }

  while (rows.length > 1 && rows[rows.length - 1]?.[1]?.text === " ") {
    rows.pop();
    rowLevelIndexes.pop();
  }

  rows.push([leftCell("Total Score", 2), rightCell(commaDecimal(totalScore, zeroChar), 3)]);
  rowLevelIndexes.push(-1);

  return {
    rowLevelIndexes,
    table: {
      rows: rows.length,
      cols: 5,
      sep: 2,
      collapse: 1,
      data: rows,
    },
  };
}

export function createTimesTable(levels: ScoreLevelRecord[], showPartial: number, zeroChar = "0"): TableWithRows {
  const rows: TableCell[][] = [[rightCell("Level"), leftCell("Name"), rightCell("Time"), rightCell("Solution")]];
  const rowLevelIndexes: number[] = [];

  for (const level of levels) {
    if (!level.hasSolution) {
      continue;
    }

    const row: TableCell[] = [rightCell(decimal(level.number, zeroChar)), leftCell(level.name)];
    const levelTime =
      level.timeLimitSeconds > 0
        ? level.timeLimitSeconds * TICKS_PER_SECOND - level.bestTimeTicks
        : 999 * TICKS_PER_SECOND - level.bestTimeTicks;

    row.push(rightCell(level.timeLimitSeconds > 0 ? decimal(level.timeLimitSeconds, zeroChar) : "---"));

    if ((level.sgflags & SGF_REPLACEABLE) !== 0) {
      row.push(centerCell("*BAD*"));
    } else {
      const seconds =
        levelTime < 0
          ? -Math.floor((-levelTime) / TICKS_PER_SECOND)
          : Math.floor((levelTime + TICKS_PER_SECOND - 1) / TICKS_PER_SECOND);
      let text = decimal(seconds, zeroChar);
      if (showPartial > 0) {
        const integral = Math.trunc(levelTime / TICKS_PER_SECOND);
        const fractional = levelTime / TICKS_PER_SECOND - integral;
        const partial = Math.trunc((fractional <= 0 ? -fractional : 1 - fractional) * showPartial + 0.49);
        text += ` - .${decimal(showPartial + partial, zeroChar).slice(1)}`;
      }
      row.push(rightCell(text));
    }

    rows.push(row);
    rowLevelIndexes.push(level.index);
  }

  return {
    rowLevelIndexes,
    table: {
      rows: rows.length,
      cols: 4,
      sep: 2,
      collapse: 1,
      data: rows,
    },
  };
}
