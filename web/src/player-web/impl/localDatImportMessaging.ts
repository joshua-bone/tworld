interface LocalDatImportMessageOptions {
  existingFilenames: ReadonlySet<string>;
  failureMessages: readonly string[];
  successfulFilenames: readonly string[];
  variant: "modern" | "classic";
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function successSuffix(variant: LocalDatImportMessageOptions["variant"], replacementsUsed: boolean): string {
  if (variant === "modern") {
    return replacementsUsed ? "The Local Sets list has been updated." : "It now appears under Local Sets.";
  }

  return replacementsUsed
    ? "MS and Lynx entries were updated in the series list."
    : "MS and Lynx entries were added to the series list.";
}

function buildSuccessLead(successfulFilenames: readonly string[], replacedCount: number): string {
  const importedCount = successfulFilenames.length - replacedCount;
  if (successfulFilenames.length === 1) {
    const filename = successfulFilenames[0]!;
    return replacedCount === 1 ? `Replaced existing local set ${filename}.` : `Imported ${filename}.`;
  }

  if (replacedCount === 0) {
    return `Imported ${pluralize(importedCount, "DAT file")}.`;
  }

  if (importedCount === 0) {
    return `Replaced ${pluralize(replacedCount, "existing local set")}.`;
  }

  return `Imported ${pluralize(importedCount, "DAT file")} and replaced ${pluralize(replacedCount, "existing local set")}.`;
}

export function describeLocalDatImportMessage({
  existingFilenames,
  failureMessages,
  successfulFilenames,
  variant,
}: LocalDatImportMessageOptions): string {
  const replacedCount = successfulFilenames.filter((filename) => existingFilenames.has(filename)).length;
  const firstFailure = failureMessages[0] ?? null;

  if (successfulFilenames.length === 0) {
    return firstFailure ?? "Failed to import the selected DAT file.";
  }

  const replacementsUsed = replacedCount > 0 || successfulFilenames.length > 1;
  const lead = buildSuccessLead(successfulFilenames, replacedCount);
  const suffix = successSuffix(variant, replacementsUsed);

  if (failureMessages.length === 0) {
    return `${lead} ${suffix}`;
  }

  return `${lead} ${pluralize(failureMessages.length, "file")} failed. ${firstFailure}`;
}
