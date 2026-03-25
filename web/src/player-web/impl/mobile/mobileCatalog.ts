import { summarizeEntryProgress } from "@player-web/impl/levelProgress";
import {
  listSetFamilyRulesets,
  type CuratedCatalogView,
  type SetFamily,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import type {
  BrowserLevelProgressSummary,
  BrowserPreferredRuleset,
  BrowserResolvedLevelProgressSummary,
} from "@player-web/ports/BrowserProfileStore";

export type MobileLibrarySection = "official" | "curated" | "uploads";

export const MOBILE_LIBRARY_SECTIONS: readonly { id: MobileLibrarySection; label: string }[] = [
  { id: "official", label: "Official" },
  { id: "curated", label: "Curated" },
  { id: "uploads", label: "Uploads" },
];

export function shiftMobileLibrarySection(
  section: MobileLibrarySection,
  direction: -1 | 1,
): MobileLibrarySection {
  const currentIndex = MOBILE_LIBRARY_SECTIONS.findIndex((candidate) => candidate.id === section);
  const nextIndex = Math.min(
    MOBILE_LIBRARY_SECTIONS.length - 1,
    Math.max(0, currentIndex + direction),
  );
  return MOBILE_LIBRARY_SECTIONS[nextIndex]?.id ?? section;
}

export function mobileLibrarySectionForFamily(family: SetFamily | null): MobileLibrarySection {
  if (!family) {
    return "official";
  }

  switch (family.section) {
    case "official":
      return "official";
    case "intro":
      return "curated";
    case "local":
      return "uploads";
    default:
      return "official";
  }
}

export function listMobileLibraryFamilies(
  view: CuratedCatalogView,
  section: MobileLibrarySection,
): SetFamily[] {
  switch (section) {
    case "official":
      return view.officialFamilies;
    case "curated":
      return view.introFamilies;
    case "uploads":
      return view.localFamilies;
    default:
      return view.officialFamilies;
  }
}

export function resolveMobileFamilyRuleset(
  family: SetFamily,
  preferredRuleset: BrowserPreferredRuleset | null,
): SetFamilyRuleset | null {
  if (preferredRuleset && family.launchEntries[preferredRuleset]) {
    return preferredRuleset;
  }

  return listSetFamilyRulesets(family)[0] ?? null;
}

export function resolveToggledMobileFamilyRuleset(
  family: SetFamily,
  currentRuleset: BrowserPreferredRuleset | null,
): SetFamilyRuleset | null {
  const availableRulesets = listSetFamilyRulesets(family);
  if (availableRulesets.length === 0) {
    return null;
  }

  if (currentRuleset && availableRulesets.includes(currentRuleset)) {
    return availableRulesets.find((ruleset) => ruleset !== currentRuleset) ?? currentRuleset;
  }

  return availableRulesets[0] ?? null;
}

function mobileLevelStatusTone(
  progress: BrowserResolvedLevelProgressSummary | null,
): "completed" | "attempted" | "unplayed" {
  if (!progress) {
    return "unplayed";
  }

  if (progress.bestResult === "completed-clean" || progress.bestResult === "completed-with-undo") {
    return "completed";
  }

  return "attempted";
}

export function mobileLevelStatusClassName(progress: BrowserResolvedLevelProgressSummary | null): string {
  return mobileLevelStatusTone(progress);
}

export function mobileLevelStatusLabel(progress: BrowserResolvedLevelProgressSummary | null): string {
  if (!progress) {
    return "";
  }

  if (progress.bestResult === "completed-clean") {
    return "✓";
  }

  if (progress.bestResult === "completed-with-undo") {
    return "U";
  }

  return "A";
}

export function mobileLevelStatusDescription(progress: BrowserResolvedLevelProgressSummary | null): string {
  if (!progress) {
    return "Unplayed";
  }

  if (progress.bestResult === "completed-clean") {
    return "Cleared clean";
  }

  if (progress.bestResult === "completed-with-undo") {
    return "Cleared with undo";
  }

  return "Attempted";
}

export function formatMobileFamilyBrowseMeta(
  family: SetFamily,
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>,
): string {
  const parts = (["Lynx", "MS"] as const).flatMap((ruleset) => {
    const entry = family.launchEntries[ruleset] ?? null;
    if (!entry) {
      return [];
    }

    const progress = summarizeEntryProgress(entry, progressByKey);
    return [`${progress.completedLevels}/${entry.levels.length} (${ruleset})`];
  });

  if (parts.length === 0) {
    return `Cleared: 0/${family.levelCount}`;
  }

  return `Cleared: ${parts.join(" ")}`;
}
