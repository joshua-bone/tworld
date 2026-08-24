import type { SeriesCatalogEntry } from "@content/api/series";
import type { LegacyRulesetName } from "@content/api/ruleset";
import type { LoadedSolutionFile, SolutionFileRepository } from "@replay-verifier/ports/SolutionFileRepository";
import type { ReplayTraceScenario } from "@replay-verifier/impl/scenario";
import type { SolutionReplaySweepPlan } from "@replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile";
import type { CharacterizationFixtureRepository } from "@oracle-fixtures/ports/CharacterizationFixtureRepository";
import type { GameEnginePort } from "@game-runtime/ports/GameEngine";
import type { TraceOracle } from "@replay-verifier/ports/TraceOracle";

export interface SolutionFileReplaySweepFailure {
  scenarioName: string;
  solutionFile: string;
  seriesFile: string;
  levelNumber: number;
  mismatchPaths: string[];
  mismatches: Array<{
    path: string;
    expected: unknown;
    actual: unknown;
  }>;
}

export interface SolutionFileReplaySweepSummaryItem {
  key: string;
  count: number;
}

export interface SolutionFileReplaySweepReport {
  replayCount: number;
  unsupportedFiles: string[];
  failures: SolutionFileReplaySweepFailure[];
  failureCountBySeries: SolutionFileReplaySweepSummaryItem[];
  firstMismatchPathCounts: SolutionFileReplaySweepSummaryItem[];
}

export interface SolutionFileReplaySweepDependencies {
  fixtureRepository: Pick<CharacterizationFixtureRepository, "loadManifest" | "loadSeriesList" | "loadLevelInfo">;
  solutionRepository: Pick<SolutionFileRepository, "loadSolutionFile">;
  candidate: Pick<GameEnginePort, "runReplayTrace"> & Partial<Pick<GameEnginePort, "supportsRuleset">>;
  oracle: Pick<TraceOracle, "runReplayTrace"> & Partial<Pick<GameEnginePort, "supportsRuleset">>;
}

export interface SolutionFileReplaySweepOptions {
  scenarioNameIncludes?: string | null;
  seriesCatalog?: SeriesCatalogEntry[] | null;
  progress?: SolutionFileReplaySweepProgressReporter | null;
}

export interface SolutionFileReplaySweepUnsupportedFileProgress {
  solutionFile: LoadedSolutionFile;
}

export interface SolutionFileReplaySweepFileProgress {
  solutionFile: LoadedSolutionFile;
  plan: SolutionReplaySweepPlan;
  scenarios: ReplayTraceScenario[];
}

export interface SolutionFileReplaySweepScenarioProgress {
  solutionFile: LoadedSolutionFile;
  plan: SolutionReplaySweepPlan;
  scenario: ReplayTraceScenario;
  failure: SolutionFileReplaySweepFailure | null;
}

export interface SolutionFileReplaySweepFileCompleteProgress extends SolutionFileReplaySweepFileProgress {
  replayCount: number;
  failures: SolutionFileReplaySweepFailure[];
}

export interface SolutionFileReplaySweepProgressReporter {
  onUnsupportedFile?(progress: SolutionFileReplaySweepUnsupportedFileProgress): void | Promise<void>;
  onSolutionFileStart?(progress: SolutionFileReplaySweepFileProgress): void | Promise<void>;
  onScenarioComplete?(progress: SolutionFileReplaySweepScenarioProgress): void | Promise<void>;
  onSolutionFileComplete?(progress: SolutionFileReplaySweepFileCompleteProgress): void | Promise<void>;
}

export type SupportedReplaySweepRuleset = LegacyRulesetName;
