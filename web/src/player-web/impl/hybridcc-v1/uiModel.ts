import type { SeriesCatalogEntry } from "@content/api/series";
import type { SetFamily } from "@player-web/impl/modern/curatedCatalog";
import type {
  HybridCcV1DatCatalogEntry,
  HybridCcV1UnavailableDatEntry,
} from "./datCatalog";

export const HYBRID_CC_V1_RULESET_LABEL = "Hybrid v1";

export function hybridCcV1SeriesFile(entry: Pick<HybridCcV1DatCatalogEntry, "id">): string {
  return `hybrid-v1:${entry.id}`;
}

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

export function hybridCcV1InitialCatalogMessage(
  playableEntryCount: number,
  loadErrorsByEntryId: ReadonlyMap<string, string>,
  unavailableEntriesByEntryId: ReadonlyMap<string, readonly HybridCcV1UnavailableDatEntry[]> = new Map(),
): string | null {
  if (playableEntryCount === 0) {
    return loadErrorsByEntryId.values().next().value ?? "No playable DAT sets are available.";
  }
  const issueLines = [...unavailableEntriesByEntryId.entries()].flatMap(([entryId, issues]) => (
    issues.length === 0
      ? []
      : [`${entryId.replace(/^(?:official|sandbox|imported):/u, "")}: ${issues.map(formatUnavailableEntry).join("; ")}`]
  ));
  return issueLines.length === 0
    ? null
    : `Hybrid v1 could not convert every DAT level. ${issueLines.join(" ")}`;
}

function familyTitle(entry: HybridCcV1DatCatalogEntry): string {
  if (entry.source === "sandbox") return entry.name;
  return entry.filename.replace(/\.dat$/iu, "");
}

function formatUnavailableEntry(issue: HybridCcV1UnavailableDatEntry): string {
  const location = issue.levelNumber === null
    ? `DAT entry ${issue.entryOrdinal} (level number unavailable)`
    : `Level ${issue.levelNumber}`;
  return `${location} — ${issue.diagnostic}`;
}

export function buildHybridCcV1Families(
  entries: readonly HybridCcV1DatCatalogEntry[],
  seriesByEntryId: ReadonlyMap<string, SeriesCatalogEntry>,
  loadErrorsByEntryId: ReadonlyMap<string, string> = new Map(),
  unavailableEntriesByEntryId: ReadonlyMap<string, readonly HybridCcV1UnavailableDatEntry[]> = new Map(),
): SetFamily[] {
  return entries.map((entry, index): SetFamily => {
    const series = seriesByEntryId.get(entry.id);
    const loadError = loadErrorsByEntryId.get(entry.id);
    const unavailableEntries = unavailableEntriesByEntryId.get(entry.id) ?? [];
    const officialDisplay = entry.source === "official" ? OFFICIAL_FAMILY_DISPLAY[entry.filename] : undefined;
    const sourceLabel = entry.source === "official"
      ? "Official DAT set."
      : entry.source === "sandbox" ? "Built-in gameplay sandbox." : "Local DAT set.";
    const conversionContext = "HybridCC converts the DAT to its native map format before starting play.";
    return {
      id: entry.id,
      section: entry.source === "official" ? "official" : entry.source === "sandbox" ? "other" : "local",
      title: familyTitle(entry),
      badge: entry.source === "official" ? "Official" : entry.source === "sandbox" ? "Sandbox" : "Uploaded",
      sidebarSummary: loadError
        ? "Unavailable in Hybrid v1."
        : unavailableEntries.length > 0
          ? `${series?.levels.length ?? 0} playable · ${unavailableEntries.length} unavailable in Hybrid v1.`
          : officialDisplay?.sidebarSummary ?? sourceLabel,
      yearLabel: officialDisplay?.yearLabel ?? null,
      description: `${entry.name}. ${sourceLabel}`,
      context: loadError
        ?? (unavailableEntries.length > 0
          ? `${conversionContext} Unavailable DAT levels: ${unavailableEntries.map(formatUnavailableEntry).join("; ")}`
          : conversionContext),
      links: [],
      levelCount: series?.levels.length ?? 0,
      entries: series ? [series] : [],
      launchEntries: series ? { Hybrid: series } : {},
      rulesetLabels: { Hybrid: HYBRID_CC_V1_RULESET_LABEL },
      continueSelection: null,
      order: officialDisplay?.order ?? (
        entry.source === "official" ? 900 + index : entry.source === "sandbox" ? index : 1_000 + index
      ),
    };
  }).sort((left, right) => left.order - right.order);
}
