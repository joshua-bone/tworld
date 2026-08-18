import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldLevelFactsFromProjection,
  type TworldLevelFactsBundle,
} from "../impl/buildTworldLevelFacts";
import {
  projectLoadedTworldMsLevel,
  type ProjectLoadedTworldMsLevelInput,
  type ProjectedTworldMsLevel,
} from "./tworldMsLevelProjection";

const ADAPTER_ID = "tworld-ms-level-facts";

export interface BuildTworldMsLevelFactsInput extends ProjectLoadedTworldMsLevelInput {
  readonly occurrenceId: string;
  readonly producerRevision: string;
  readonly repository: string;
  readonly repositoryRevision: string;
  readonly sourcePath: string;
  readonly adapterRevision: string;
  readonly importProfileRevision: string;
  readonly analyzerRevision: string;
}

export type TworldMsLevelFactsBundle = TworldLevelFactsBundle;

export interface ComposedTworldMsLevelFacts {
  readonly levelFacts: TworldMsLevelFactsBundle;
  readonly projected: ProjectedTworldMsLevel;
}

/** Builds facts and retains the exact detached projection used to derive them. */
export async function composeTworldMsLevelFacts(
  input: BuildTworldMsLevelFactsInput,
  sha256: Sha256Port,
): Promise<ComposedTworldMsLevelFacts> {
  // Projection is synchronous and clones source bytes before the first await,
  // so later caller mutation cannot change either half of this fresh pair.
  const projected = projectLoadedTworldMsLevel(input);
  const levelFacts = await buildTworldLevelFactsFromProjection({
    occurrenceId: input.occurrenceId,
    producerRevision: input.producerRevision,
    repository: input.repository,
    repositoryRevision: input.repositoryRevision,
    sourcePath: input.sourcePath,
    adapterId: ADAPTER_ID,
    adapterRevision: input.adapterRevision,
    importProfileRevision: input.importProfileRevision,
    analyzerRevision: input.analyzerRevision,
    projected,
  }, sha256);
  return { levelFacts, projected };
}

export async function buildTworldMsLevelFacts(
  input: BuildTworldMsLevelFactsInput,
  sha256: Sha256Port,
): Promise<TworldMsLevelFactsBundle> {
  return (await composeTworldMsLevelFacts(input, sha256)).levelFacts;
}
