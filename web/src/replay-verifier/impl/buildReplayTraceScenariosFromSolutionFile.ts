import type { ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import type { LoadedSolutionFile } from "@replay-verifier/ports/SolutionFileRepository";
import type { SeriesCatalogEntry } from "@content/api/series";
import type { LegacyRulesetName } from "@content/api/ruleset";
import type { GameRequest } from "@game-core/api/types";

export type SolutionReplayTraceScenario = ReplayTraceScenario & {
  request: GameRequest & { ruleset: LegacyRulesetName };
};

export interface SolutionReplaySweepPlan {
  solutionFile: LoadedSolutionFile;
  series: SeriesCatalogEntry;
  scenarios: SolutionReplayTraceScenario[];
  skippedEntries: number;
}

const UINT31_MASK = 0x7fffffff;

const SERIES_FILE_ALIASES: Record<string, string[]> = {
  "CCLP1.dac": ["CCLP1-MS.dac"],
  "CCLP1-lynx.dac": ["CCLP1-Lynx.dac"],
  "CCLP3.dac": ["CCLP3-MS.dac"],
  "CCLP3-lynx.dac": ["CCLP3-Lynx.dac"],
  "CCLP4.dac": ["CCLP4-MS.dac"],
  "CCLP4-lynx.dac": ["CCLP4-Lynx.dac"],
  "CCLP5.dac": ["CCLP5-MS.dac"],
  "CCLP5-lynx.dac": ["CCLP5-Lynx.dac"],
  "CCLXP2.dac": ["CCLXP2.dat-ms.dac"],
  "public_CCLP5.dac": ["CCLP5-MS.dac"],
  "public_CCLP5-lynx.dac": ["CCLP5-Lynx.dac"],
  "public_CHIPS.dac": ["cc-ms.dac"],
  "public_CHIPS-lynx.dac": ["cc-lynx.dac"],
  "CC1.dac": ["cc-ms.dac"],
  "CC1-lynx.dac": ["cc-lynx.dac", "public_CHIPS-lynx.dac"],
};

function basenameWithoutExtension(label: string): string {
  const index = label.lastIndexOf(".");
  return index >= 0 ? label.slice(0, index) : label;
}

function candidateSeriesNames(solutionFile: LoadedSolutionFile): string[] {
  const names = new Set<string>();

  if (solutionFile.file.setName) {
    names.add(solutionFile.file.setName);
    const unprefixed =
      solutionFile.file.setName.startsWith("public_") ? solutionFile.file.setName.slice("public_".length) : null;
    if (unprefixed) {
      names.add(unprefixed);
    }
    for (const alias of SERIES_FILE_ALIASES[solutionFile.file.setName] ?? []) {
      names.add(alias);
    }
    if (unprefixed) {
      for (const alias of SERIES_FILE_ALIASES[unprefixed] ?? []) {
        names.add(alias);
      }
    }
    for (const alias of SERIES_FILE_ALIASES[basenameWithoutExtension(solutionFile.file.setName)] ?? []) {
      names.add(alias);
    }
  }

  names.add(solutionFile.label);
  names.add(basenameWithoutExtension(solutionFile.label));
  names.add(`${basenameWithoutExtension(solutionFile.label)}.dac`);

  return [...names];
}

export function resolveReplaySeries(solutionFile: LoadedSolutionFile, catalog: SeriesCatalogEntry[]): SeriesCatalogEntry | null {
  const candidates = candidateSeriesNames(solutionFile);
  return (
    catalog.find(
      (series) =>
        series.ruleset === solutionFile.file.ruleset &&
        candidates.some((candidate) => candidate === series.filebase || candidate === series.name),
    ) ?? null
  );
}

function resolveSeries(solutionFile: LoadedSolutionFile, catalog: SeriesCatalogEntry[]): SeriesCatalogEntry {
  const candidates = candidateSeriesNames(solutionFile);
  const match = resolveReplaySeries(solutionFile, catalog);

  if (match) {
    return match;
  }

  throw new Error(
    `${solutionFile.label} does not map to a known ${solutionFile.file.ruleset} series. ` +
      `Looked for one of: ${candidates.join(", ")}`,
  );
}

export function isUnsupportedReplaySeries(solutionFile: LoadedSolutionFile, catalog: SeriesCatalogEntry[]): boolean {
  if (resolveReplaySeries(solutionFile, catalog)) {
    return false;
  }

  const candidates = candidateSeriesNames(solutionFile);
  if (solutionFile.file.setName?.startsWith("public_")) {
    return true;
  }
  return candidates.includes("cc-ms.dac");
}

export function buildReplayTraceScenariosFromSolutionFile(
  solutionFile: LoadedSolutionFile,
  catalog: SeriesCatalogEntry[],
): SolutionReplaySweepPlan {
  const series = resolveSeries(solutionFile, catalog);
  const scenarios: SolutionReplayTraceScenario[] = [];
  let skippedEntries = 0;

  for (const entry of solutionFile.file.entries) {
    if (!entry.solutionData || !entry.expandedSolution || entry.bestTimeTicks === null) {
      skippedEntries += 1;
      continue;
    }

    const level = series.levels.find((candidate) => candidate.number === entry.levelNumber);
    if (!level) {
      throw new Error(`${solutionFile.label} contains replay data for unknown level ${entry.levelNumber}`);
    }
    if (level.password !== entry.password) {
      throw new Error(
        `${solutionFile.label} level ${entry.levelNumber} password mismatch: expected ${level.password}, got ${entry.password}`,
      );
    }

    scenarios.push({
      name: `${solutionFile.label}:${entry.levelNumber}`,
      request: {
        seriesFile: series.filebase,
        levelNumber: entry.levelNumber,
        ruleset: solutionFile.file.ruleset,
        randomSeed: entry.expandedSolution.randomSeed & UINT31_MASK,
      },
      replay: {
        ...entry.expandedSolution,
        bestTimeTicks: entry.bestTimeTicks,
        movesSpec: entry.expandedSolution.moves.map((move) => `${move.when}:${move.dir}`).join(","),
      },
      maxTicks: Math.max(entry.bestTimeTicks + 40, 40),
    });
  }

  return {
    solutionFile,
    series,
    scenarios,
    skippedEntries,
  };
}
