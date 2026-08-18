export const TWORLD_ARTIFACT_REPOSITORY_ID = "tworld";

const CORPUS_OCCURRENCE_PATTERN = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/([0-9]{3})$/u;

/**
 * Corpus occurrence IDs are path-shaped human keys. Artifact stable IDs are a
 * separate namespace that deliberately excludes `/`, so the bridge is explicit
 * and shared by reports, builders, and checked goldens.
 */
export function artifactOccurrenceIdForCorpusOccurrence(occurrenceId: string): string {
  const match = CORPUS_OCCURRENCE_PATTERN.exec(occurrenceId);
  if (match === null) {
    throw new Error(`unsupported corpus occurrence id: ${occurrenceId}`);
  }
  return `tworld:${match[1]}:${match[2]}`;
}
