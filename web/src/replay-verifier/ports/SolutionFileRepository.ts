import type { ParsedSolutionFile } from "@content/api/solution-file";

export interface LoadedSolutionFile {
  path: string;
  label: string;
  file: ParsedSolutionFile;
}

export interface SolutionFileRepository {
  loadSolutionFile(path: string): Promise<LoadedSolutionFile>;
}
