import type { SeriesCatalogEntry, SeriesLevel } from "@content/api/series";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

export type SetFamilyRuleset = Exclude<SeriesCatalogEntry["ruleset"], "None">;
const SET_FAMILY_RULESETS: readonly SetFamilyRuleset[] = ["Lynx", "MS"];

export type CuratedCatalogSection = "official" | "intro" | "local" | "other";

export interface CuratedLink {
  href: string;
  label: string;
}

export interface SetFamily {
  id: string;
  section: CuratedCatalogSection;
  title: string;
  badge: string | null;
  sidebarSummary: string | null;
  yearLabel: string | null;
  description: string;
  context: string | null;
  links: CuratedLink[];
  levelCount: number;
  entries: SeriesCatalogEntry[];
  launchEntries: Partial<Record<SetFamilyRuleset, SeriesCatalogEntry>>;
  rulesetLabels: Partial<Record<SetFamilyRuleset, string>>;
  continueSelection: PlayableSelection | null;
  order: number;
}

export type CuratedSeriesFamily = SetFamily;

export interface CuratedCatalogView {
  officialFamilies: SetFamily[];
  introFamilies: SetFamily[];
  localFamilies: SetFamily[];
  otherFamilies: SetFamily[];
}

interface CuratedFamilyDefinition {
  id: string;
  section: CuratedCatalogSection;
  title: string;
  badge?: string;
  sidebarSummary?: string;
  yearLabel?: string;
  description: string;
  context?: string;
  links?: CuratedLink[];
  filebases: readonly string[];
  order: number;
  preferredFilebasesByRuleset?: Partial<Record<SetFamilyRuleset, readonly string[]>>;
  rulesetLabels?: Partial<Record<SetFamilyRuleset, string>>;
}

interface FamilyDraft {
  id: string;
  section: CuratedCatalogSection;
  title: string;
  badge: string | null;
  sidebarSummary: string | null;
  yearLabel: string | null;
  description: string;
  context: string | null;
  links: CuratedLink[];
  order: number;
  entries: SeriesCatalogEntry[];
  preferredFilebasesByRuleset: Partial<Record<SetFamilyRuleset, readonly string[]>>;
  rulesetLabels: Partial<Record<SetFamilyRuleset, string>>;
}

const FAMILY_DEFINITIONS: readonly CuratedFamilyDefinition[] = [
  {
    id: "official:cclp1",
    section: "official",
    title: "CCLP1",
    badge: "Official",
    sidebarSummary: "Easy difficulty.",
    yearLabel: "2014",
    description: "Easy difficulty.",
    context:
      "A beginner-friendly official pack built to teach the game cleanly before the harder community sets.",
    links: [
      { label: "BitBusters wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_1" },
      { label: "Fandom overview", href: "https://chipschallenge.fandom.com/wiki/Chip%27s_Challenge_Level_Pack_1" },
    ],
    filebases: ["CCLP1-MS.dac", "CCLP1-Lynx.dac"],
    order: 10,
  },
  {
    id: "official:cclp2-cclxp2",
    section: "official",
    title: "CCLP2 / CCLXP2",
    badge: "Official",
    sidebarSummary: "Rough early-community expansion",
    yearLabel: "2002",
    description: "Classic expansion with a Lynx-safe companion build.",
    context:
      "CCLP2 is a rougher early-community classic with memorable ideas and some MS-era quirks; CCLXP2 is the Lynx-compatible companion pack for the same material.",
    links: [
      { label: "CCLP2 wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_2" },
      { label: "CCLXP2 wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_2_%28Lynx%29" },
      { label: "Fandom reception", href: "https://chipschallenge.fandom.com/wiki/Chip%27s_Challenge_Level_Pack_2" },
    ],
    filebases: ["CCLP2.dac", "CCLP2.dat-lynx.dac", "CCLXP2.dac", "CCLXP2.dat-ms.dac"],
    order: 50,
    preferredFilebasesByRuleset: {
      MS: ["CCLP2.dac", "CCLXP2.dat-ms.dac"],
      Lynx: ["CCLXP2.dac", "CCLP2.dat-lynx.dac"],
    },
    rulesetLabels: {
      MS: "CCLP2",
      Lynx: "CCLXP2",
    },
  },
  {
    id: "official:cclp3",
    section: "official",
    title: "CCLP3",
    badge: "Official",
    sidebarSummary: "Higher quality than CCLP2, extremely difficult endgame.",
    yearLabel: "2010",
    description: "Higher quality than CCLP2.",
    context:
      "A clear jump in craftsmanship over CCLP2, with an extremely difficult endgame.",
    links: [
      { label: "BitBusters wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_3" },
      { label: "Fandom overview", href: "https://chipschallenge.fandom.com/wiki/Chip%27s_Challenge_Level_Pack_3" },
    ],
    filebases: ["CCLP3-MS.dac", "CCLP3-Lynx.dac"],
    order: 40,
  },
  {
    id: "official:cclp4",
    section: "official",
    title: "CCLP4",
    badge: "Official",
    sidebarSummary: "Moderate difficulty.",
    yearLabel: "2017",
    description: "Moderate difficulty.",
    context:
      "A modern Lynx-compatible official pack with strong variety and a serious late-game challenge.",
    links: [
      { label: "BitBusters wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_4" },
      { label: "Fandom overview", href: "https://chipschallenge.fandom.com/wiki/Chip%27s_Challenge_Level_Pack_4" },
    ],
    filebases: ["CCLP4-MS.dac", "CCLP4-Lynx.dac"],
    order: 20,
  },
  {
    id: "official:cclp5",
    section: "official",
    title: "CCLP5",
    badge: "Official",
    sidebarSummary: "Hard difficulty.",
    yearLabel: "2024",
    description: "Hard difficulty.",
    context:
      "The most recent official set, built from years of submission and voting work, with broad variety and a high difficulty ceiling deeper into the pack.",
    links: [
      { label: "BitBusters home", href: "https://bitbusters.club/cclp5/" },
      { label: "BitBusters wiki", href: "https://wiki.bitbusters.club/Chip%27s_Challenge_Level_Pack_5" },
    ],
    filebases: ["CCLP5-MS.dac", "CCLP5-Lynx.dac"],
    order: 30,
  },
  {
    id: "curated:pit-of-100-tiles",
    section: "intro",
    title: "The Pit Of 100 Tiles",
    badge: "Curated",
    sidebarSummary: "Andrew Menzies",
    description: "The Pit Of 100 Tiles by Andrew Menzies. Custom levelset used by author's permission.",
    filebases: ["po100t-MS.dac", "po100t-Lynx.dac"],
    order: 60,
  },
  {
    id: "curated:other-100-tiles",
    section: "intro",
    title: "The Other 100 Tiles",
    badge: "Curated",
    sidebarSummary: "Andrew Menzies",
    description: "The Other 100 Tiles by Andrew Menzies. Custom levelset used by author's permission.",
    filebases: ["to100t-MS.dac", "to100t-Lynx.dac"],
    order: 70,
  },
  {
    id: "curated:jblp1",
    section: "intro",
    title: "JBLP1",
    badge: "Curated",
    sidebarSummary: "J. B. Lewis",
    description: "JBLP1 by J. B. Lewis. Custom levelset used by author's permission.",
    filebases: ["JBLP1-MS.dac", "JBLP1-Lynx.dac"],
    order: 80,
  },
  {
    id: "curated:jcclp3-1",
    section: "intro",
    title: "JCCLP3.1",
    badge: "Curated",
    sidebarSummary: "Josh Lee",
    description: "JCCLP3.1 by Josh Lee. Custom levelset used by author's permission.",
    filebases: ["JCCLP3.1-MS.dac", "JCCLP3.1-Lynx.dac"],
    order: 90,
  },
  {
    id: "curated:joshl0",
    section: "intro",
    title: "JoshL0",
    badge: "Curated",
    sidebarSummary: "Josh Lee",
    description: "JoshL0 by Josh Lee. Custom levelset used by author's permission.",
    filebases: ["JoshL0-MS.dac", "JoshL0-Lynx.dac"],
    order: 100,
  },
  {
    id: "curated:ts0",
    section: "intro",
    title: "TS0",
    badge: "Curated",
    sidebarSummary: "Tyler Sontag",
    description: "TS0 by Tyler Sontag. Custom levelset used by author's permission.",
    filebases: ["TS0-MS.dac", "TS0-Lynx.dac"],
    order: 110,
  },
  {
    id: "curated:3d-intro",
    section: "intro",
    title: "3D Tile World Intro",
    badge: "Curated",
    sidebarSummary: "Joshua Bone",
    description: "Introduction to 3D Tile World levels. Work in progress.",
    filebases: ["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"],
    order: 55,
  },
  {
    id: "intro",
    section: "other",
    title: "Intro",
    badge: "Start Here",
    description: "Nine quick onboarding levels.",
    context: "A short tutorial-like pack for learning controls, timing, and ruleset differences without committing to a full official set.",
    filebases: ["intro-ms.dac", "intro-lynx.dac"],
    order: 120,
  },
] as const;

const FAMILY_DEFINITION_BY_FILEBASE = new Map(
  FAMILY_DEFINITIONS.flatMap((definition) => definition.filebases.map((filebase) => [filebase, definition] as const)),
);

export interface SetFamilySeriesMetadata {
  familyId: string;
  filebaseOrder: number;
  order: number;
  section: CuratedCatalogSection;
}

export function listSetFamilyFilebasesForSeriesFile(seriesFile: string): string[] | null {
  const definition = FAMILY_DEFINITION_BY_FILEBASE.get(seriesFile);
  return definition ? [...definition.filebases] : null;
}

export function getSetFamilySeriesMetadata(seriesFile: string): SetFamilySeriesMetadata | null {
  const definition = FAMILY_DEFINITION_BY_FILEBASE.get(seriesFile);
  if (!definition) {
    return null;
  }

  return {
    familyId: definition.id,
    filebaseOrder: definition.filebases.indexOf(seriesFile),
    order: definition.order,
    section: definition.section,
  };
}

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/u, "");
}

function formatCatalogTitle(value: string): string {
  const normalized = value.replace(/^public_/u, "");
  return normalized;
}

function familyKeyForEntry(entry: SeriesCatalogEntry): string {
  const explicit = FAMILY_DEFINITION_BY_FILEBASE.get(entry.filebase);
  if (explicit) {
    return explicit.id;
  }

  return `${entry.mapfilename.startsWith("local:") ? "local" : "other"}:${entry.mapfilename}`;
}

function createDraft(entry: SeriesCatalogEntry): FamilyDraft {
  const explicit = FAMILY_DEFINITION_BY_FILEBASE.get(entry.filebase);
  if (explicit) {
    return {
      id: explicit.id,
      section: explicit.section,
      title: explicit.title,
      badge: explicit.badge ?? null,
      sidebarSummary: explicit.sidebarSummary ?? null,
      yearLabel: explicit.yearLabel ?? null,
      description: explicit.description,
      context: explicit.context ?? null,
      links: [...(explicit.links ?? [])],
      order: explicit.order,
      entries: [],
      preferredFilebasesByRuleset: explicit.preferredFilebasesByRuleset ?? {},
      rulesetLabels: explicit.rulesetLabels ?? {},
    };
  }

  const isLocal = entry.mapfilename.startsWith("local:");
  const rawName = isLocal
    ? stripExtension(entry.mapfilename.slice("local:".length))
    : stripExtension(basename(entry.mapfilename));

  return {
    id: familyKeyForEntry(entry),
    section: isLocal ? "local" : "other",
    title: formatCatalogTitle(rawName),
    badge: isLocal ? "Local" : "Other",
    sidebarSummary: null,
    yearLabel: null,
    description: isLocal
      ? "Imported from this browser session."
      : "Supplemental, test, or compatibility-focused content.",
    context: null,
    links: [],
    order: isLocal ? 200 : 600,
    entries: [],
    preferredFilebasesByRuleset: {},
    rulesetLabels: {},
  };
}

function compareEntries(left: SeriesCatalogEntry, right: SeriesCatalogEntry): number {
  return left.filebase.localeCompare(right.filebase);
}

export function listSetFamilies(view: CuratedCatalogView): SetFamily[] {
  return [...view.officialFamilies, ...view.introFamilies, ...view.localFamilies, ...view.otherFamilies];
}

export function listSearchableSetFamilies(view: CuratedCatalogView): SetFamily[] {
  return [...view.officialFamilies, ...view.introFamilies, ...view.localFamilies];
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/giu, " ").trim();
}

function matchesSearchText(haystack: string, normalizedQuery: string, queryTokens: readonly string[]): boolean {
  if (!haystack || !normalizedQuery) {
    return false;
  }

  if (haystack.includes(normalizedQuery)) {
    return true;
  }

  return queryTokens.every((token) => haystack.includes(token));
}

function buildFamilyMetadataText(family: SetFamily): string {
  return normalizeSearchText([
    family.badge,
    family.sidebarSummary,
    family.yearLabel,
    family.description,
    family.context,
    ...family.entries.map((entry) => entry.filebase),
    ...family.entries.map((entry) => entry.mapfilename),
  ].filter((value): value is string => Boolean(value)).join(" "));
}

function buildFamilyLevelTitleText(family: SetFamily): string {
  return normalizeSearchText(
    [...new Set(family.entries.flatMap((entry) => entry.levels.map((level) => level.name)))].join(" "),
  );
}

export function searchSetFamilies(
  families: readonly SetFamily[],
  query: string,
): SetFamily[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [...families];
  }

  const queryTokens = normalizedQuery.split(/\s+/u).filter((token) => token !== "");
  return families
    .flatMap((family, index) => {
      const normalizedTitle = normalizeSearchText(family.title);
      if (matchesSearchText(normalizedTitle, normalizedQuery, queryTokens)) {
        return [{ family, priority: 0, index }];
      }

      if (matchesSearchText(buildFamilyMetadataText(family), normalizedQuery, queryTokens)) {
        return [{ family, priority: 1, index }];
      }

      if (matchesSearchText(buildFamilyLevelTitleText(family), normalizedQuery, queryTokens)) {
        return [{ family, priority: 2, index }];
      }

      return [];
    })
    .sort((left, right) => left.priority - right.priority || left.index - right.index)
    .map((entry) => entry.family);
}

export function findSetFamilyById(view: CuratedCatalogView, familyId: string): SetFamily | null {
  return listSetFamilies(view).find((family) => family.id === familyId) ?? null;
}

export function findSetFamilyForSelection(
  view: CuratedCatalogView,
  selection: PlayableSelection | null,
): SetFamily | null {
  if (selection === null) {
    return null;
  }

  return (
    listSetFamilies(view).find((family) => family.entries.some((entry) => entry.filebase === selection.seriesFile)) ?? null
  );
}

export function resolveSetFamilyRuleset(
  family: SetFamily,
  selection: PlayableSelection | null,
): SetFamilyRuleset | null {
  if (selection === null) {
    return null;
  }

  const ruleset = family.entries.find((entry) => entry.filebase === selection.seriesFile)?.ruleset;
  return ruleset === "MS" || ruleset === "Lynx" ? ruleset : null;
}

export function listSetFamilyRulesets(family: SetFamily): SetFamilyRuleset[] {
  return SET_FAMILY_RULESETS.filter((ruleset) => family.launchEntries[ruleset] !== undefined);
}

function pickLaunchEntry(family: FamilyDraft, ruleset: SetFamilyRuleset): SeriesCatalogEntry | undefined {
  const preferredFilebases = family.preferredFilebasesByRuleset[ruleset] ?? [];
  for (const filebase of preferredFilebases) {
    const preferredEntry = family.entries.find((entry) => entry.filebase === filebase);
    if (preferredEntry) {
      return preferredEntry;
    }
  }

  return family.entries.find((entry) => entry.ruleset === ruleset);
}

function resolveLevel(entry: SeriesCatalogEntry, levelNumber: number): SeriesLevel | null {
  const exactLevel = entry.levels.find((level) => level.number === levelNumber);
  if (exactLevel) {
    return exactLevel;
  }

  const fallbackIndex = Math.min(Math.max(levelNumber - 1, 0), Math.max(entry.levels.length - 1, 0));
  return entry.levels[fallbackIndex] ?? null;
}

export function resolveSetFamilyLevel(
  family: SetFamily,
  ruleset: SetFamilyRuleset,
  levelNumber: number,
): SeriesLevel | null {
  const entry = family.launchEntries[ruleset];
  if (!entry) {
    return null;
  }

  return resolveLevel(entry, levelNumber);
}

export function resolveSetFamilySelection(
  family: SetFamily,
  ruleset: SetFamilyRuleset,
  levelNumber: number,
): PlayableSelection | null {
  const entry = family.launchEntries[ruleset];
  const level = resolveSetFamilyLevel(family, ruleset, levelNumber);
  if (!entry || !level) {
    return null;
  }

  return {
    seriesFile: entry.filebase,
    levelNumber: level.number,
  };
}

function toFamily(family: FamilyDraft, lastSelection: PlayableSelection | null): SetFamily {
  const entries = [...family.entries].sort(compareEntries);
  const continueSelection =
    lastSelection && entries.some((entry) => entry.filebase === lastSelection.seriesFile)
      ? lastSelection
      : null;

  return {
    id: family.id,
    section: family.section,
    title: family.title,
    badge: family.badge,
    sidebarSummary: family.sidebarSummary,
    yearLabel: family.yearLabel,
    description: family.description,
    context: family.context,
    links: [...family.links],
    levelCount: Math.max(...entries.map((entry) => entry.levels.length), 0),
    entries,
    launchEntries: {
      MS: pickLaunchEntry(family, "MS"),
      Lynx: pickLaunchEntry(family, "Lynx"),
    },
    rulesetLabels: family.rulesetLabels,
    continueSelection,
    order: family.order,
  };
}

function compareFamilies(left: SetFamily, right: SetFamily): number {
  return left.order - right.order || left.title.localeCompare(right.title);
}

export function buildCuratedCatalogView(
  catalog: readonly SeriesCatalogEntry[],
  lastSelection: PlayableSelection | null,
): CuratedCatalogView {
  const drafts = new Map<string, FamilyDraft>();

  for (const entry of catalog) {
    if (entry.ruleset === "None") {
      continue;
    }

    const key = familyKeyForEntry(entry);
    const draft = drafts.get(key) ?? createDraft(entry);
    draft.entries.push(entry);
    drafts.set(key, draft);
  }

  const families = [...drafts.values()].map((draft) => toFamily(draft, lastSelection)).sort(compareFamilies);

  return {
    officialFamilies: families.filter((family) => family.section === "official"),
    introFamilies: families.filter((family) => family.section === "intro"),
    localFamilies: families.filter((family) => family.section === "local"),
    otherFamilies: families.filter((family) => family.section === "other"),
  };
}
