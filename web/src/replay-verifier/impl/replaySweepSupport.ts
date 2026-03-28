import { existsSync, readdirSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import type { SupportedReplaySweepRuleset } from "@replay-verifier/impl/solutionFileReplaySweepTypes";

export interface ReplaySweepDiscoverOptions {
  repoRoot: string;
  explicitPaths?: readonly string[] | null;
  fileFilter?: string | null;
}

export function envPrefixForRuleset(ruleset: SupportedReplaySweepRuleset): string {
  return ruleset === "MS" ? "MS" : "LYNX";
}

export function readReplaySweepEnv(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

export function matchesSubstringFilter(value: string, filter: string | null | undefined): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return value === filter.slice(1);
  }
  return value.includes(filter);
}

export function matchesReplayFilter(value: string, filter: string | null | undefined): boolean {
  if (!filter) {
    return true;
  }
  if (filter.startsWith("=")) {
    return value === filter.slice(1);
  }
  if (/^:\d+$/.test(filter)) {
    return value.endsWith(filter);
  }
  return value.includes(filter);
}

export function discoverReplaySweepSolutionFiles({
  repoRoot,
  explicitPaths,
  fileFilter,
}: ReplaySweepDiscoverOptions): string[] {
  if (explicitPaths?.length) {
    return explicitPaths
      .map((path) => resolve(repoRoot, path))
      .filter((path) => matchesSubstringFilter(basename(path), fileFilter));
  }

  const saveDir = resolve(repoRoot, "save");
  if (!existsSync(saveDir)) {
    return [];
  }

  return readdirSync(saveDir)
    .filter((entry) => extname(entry).toLowerCase() === ".tws")
    .filter((entry) => matchesSubstringFilter(entry, fileFilter))
    .map((entry) => resolve(saveDir, entry))
    .sort((left, right) => left.localeCompare(right));
}

export interface ReplaySweepRankedCount {
  key: string;
  count: number;
}

export function rankReplaySweepCounts(values: readonly string[]): ReplaySweepRankedCount[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

export function formatReplaySweepValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const rendered = JSON.stringify(value);
  if (!rendered) {
    return String(value);
  }
  return rendered.length > 120 ? `${rendered.slice(0, 117)}...` : rendered;
}
