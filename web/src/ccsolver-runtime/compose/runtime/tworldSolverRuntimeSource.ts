import type { BlobReferenceV1, SolverRuntimeProvenance } from "@tworld/ccsolver/domain";
import type { ReplaySolutionPayload } from "@game-core/api/codec";
import type { GameRequest } from "@game-core/api/types";
import type { TworldLevelFactsBundle } from "../../impl/buildTworldLevelFacts";

export interface TworldSolverLoadedLevelSource {
  readonly request: GameRequest;
  readonly levelData: Uint8Array;
  readonly layerData: readonly Uint8Array[];
}

/**
 * Exact, already-loaded source material for one solver run.
 *
 * Loading and corpus selection remain host responsibilities. The runtime
 * adapter validates the target and facts bindings before it starts an engine
 * token; it never persists this object in a CCSolver artifact.
 */
export interface TworldSolverManualStartSource {
  readonly loaded: TworldSolverLoadedLevelSource;
  readonly levelFacts: TworldLevelFactsBundle;
  readonly levelFactsContent: BlobReferenceV1;
  readonly provenance: SolverRuntimeProvenance;
  readonly manualOptions: {
    /** MS supports 0 or 4. Lynx does not accept a manual stepping override. */
    readonly stepping: 0 | 4 | null;
  };
}

export interface TworldSolverReplayPayload extends ReplaySolutionPayload {
  /**
   * Exact target-native replay time metadata. MS enforces it in-engine; Lynx
   * preserves it for an outer bounded verifier and does not invent MS failure
   * semantics.
   */
  readonly bestTimeTicks: number;
}

export interface TworldSolverReplayStartSource {
  readonly level: TworldSolverManualStartSource;
  readonly replay: TworldSolverReplayPayload;
}
