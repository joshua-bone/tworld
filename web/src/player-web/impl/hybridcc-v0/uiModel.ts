import type { SeriesCatalogEntry } from "@content/api/series";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type { HybridCcDatCatalogEntry } from "./datCatalog";
import type { HybridCcNativeLevel } from "./nativeLevel";
import { hybridCcSeries } from "./renderProjection";

export const HYBRID_CC_V0_RULESET_LABEL = "Hybrid v0";

const HYBRID_CC_V0_INPUT_SAMPLES_PER_LOGIC_STEP = 4;
const HYBRID_CC_V0_LOGIC_STEPS_PER_SECOND = 10;

const OFFICIAL_FAMILY_DISPLAY: Readonly<Record<string, {
  order: number;
  sidebarSummary: string;
  yearLabel: string;
}>> = {
  "CCLP1.dat": { order: 10, sidebarSummary: "Easy difficulty.", yearLabel: "2014" },
  "CCLP4.dat": { order: 20, sidebarSummary: "Moderate difficulty.", yearLabel: "2017" },
  "CCLP5.dat": { order: 30, sidebarSummary: "Hard difficulty.", yearLabel: "2024" },
  "CCLP3.dat": {
    order: 40,
    sidebarSummary: "Higher quality than CCLP2, extremely difficult endgame.",
    yearLabel: "2010",
  },
  "CCLP2.dat": { order: 50, sidebarSummary: "Rough early-community expansion", yearLabel: "2002" },
  "CCLXP2.dat": { order: 55, sidebarSummary: "Lynx-compatible CCLP2 companion", yearLabel: "2002" },
};

export function shouldAdvanceHybridCcV0Runtime(
  started: boolean,
  paused: boolean,
  outcomeKind: number,
): boolean {
  return started && !paused && outcomeKind === 0;
}

export function hybridCcV0SubtickIntervalMs(isFastForwarding: boolean): number {
  const logicStepsPerSecond = isFastForwarding
    ? HYBRID_CC_V0_LOGIC_STEPS_PER_SECOND * 2
    : HYBRID_CC_V0_LOGIC_STEPS_PER_SECOND;
  return 1_000 / (logicStepsPerSecond * HYBRID_CC_V0_INPUT_SAMPLES_PER_LOGIC_STEP);
}

/**
 * Hybrid v0 keeps its authoritative C++ simulation at 10 Hz while exposing a
 * 20 Hz game-time presentation clock. Input samples 0 and 2 are the two
 * presentation boundaries in each four-sample logic window.
 */
export function hybridCcV0PresentationTick(logicStep: number, inputSampleIndex: number): number | null {
  if (inputSampleIndex === 0) return logicStep * 2;
  if (inputSampleIndex === 2) return logicStep * 2 + 1;
  return null;
}

export function hybridCcV0StatusLabel(started: boolean, paused: boolean, outcomeKind: number): string {
  if (outcomeKind === 1) return "Completed";
  if (outcomeKind === 2) return "Failed";
  if (paused) return "Paused";
  return started ? "Playing" : "Ready";
}

export function hybridCcV0TerminalAction(outcomeKind: number): "next" | "retry" | null {
  if (outcomeKind === 1) return "next";
  if (outcomeKind === 2) return "retry";
  return null;
}

export function hybridCcV0FamilyProgressLabel(levelCount: number): string {
  return `Cleared: 0/${levelCount} (${HYBRID_CC_V0_RULESET_LABEL})`;
}

function familyTitle(entry: HybridCcDatCatalogEntry): string {
  return entry.filename.replace(/\.dat$/iu, "");
}

export function buildHybridCcSeriesByEntryId(
  entries: readonly HybridCcDatCatalogEntry[],
  levelsByEntryId: ReadonlyMap<string, readonly HybridCcNativeLevel[]>,
): ReadonlyMap<string, SeriesCatalogEntry> {
  return new Map(entries.flatMap((entry) => {
    const levels = levelsByEntryId.get(entry.id);
    return levels
      ? [[entry.id, hybridCcSeries(entry.filename, entry.name, [...levels])] as const]
      : [];
  }));
}

export function buildHybridCcFamilies(
  entries: readonly HybridCcDatCatalogEntry[],
  seriesByEntryId: ReadonlyMap<string, SeriesCatalogEntry>,
): SetFamily[] {
  return entries.map((entry, index): SetFamily => {
    const series = seriesByEntryId.get(entry.id);
    const officialDisplay = entry.source === "official" ? OFFICIAL_FAMILY_DISPLAY[entry.filename] : undefined;
    const sourceLabel = entry.source === "official" ? "Official DAT set." : "Local DAT set.";
    return {
      id: entry.id,
      section: entry.source === "official" ? "official" : "local",
      title: familyTitle(entry),
      badge: entry.source === "official" ? "Official" : "Uploaded",
      sidebarSummary: officialDisplay?.sidebarSummary ?? sourceLabel,
      yearLabel: officialDisplay?.yearLabel ?? null,
      description: `${entry.name}. ${sourceLabel}`,
      context: "HybridCC converts the DAT to its native map format before starting play.",
      links: [],
      levelCount: series?.levels.length ?? 0,
      entries: series ? [series] : [],
      launchEntries: series ? { Lynx: series } : {},
      rulesetLabels: { Lynx: HYBRID_CC_V0_RULESET_LABEL },
      continueSelection: null,
      order: officialDisplay?.order ?? (entry.source === "official" ? 900 + index : 1_000 + index),
    };
  }).sort((left, right) => left.order - right.order);
}
