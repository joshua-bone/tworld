import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldLevelFactsFromProjection,
  type TworldLevelFactsBundle,
} from "../impl/buildTworldLevelFacts";
import {
  projectLoadedTworldLynxLevel,
  type ProjectLoadedTworldLynxLevelInput,
  type ProjectedTworldLynxLevel,
} from "./tworldLynxLevelProjection";

const ADAPTER_ID = "tworld-lynx-level-facts";

export interface BuildTworldLynxLevelFactsInput extends ProjectLoadedTworldLynxLevelInput {
  readonly occurrenceId: string;
  readonly producerRevision: string;
  readonly repository: string;
  readonly repositoryRevision: string;
  readonly sourcePath: string;
  readonly adapterRevision: string;
  readonly importProfileRevision: string;
  readonly analyzerRevision: string;
}

export type TworldLynxLevelFactsBundle = TworldLevelFactsBundle;

export interface ComposedTworldLynxLevelFacts {
  readonly levelFacts: TworldLynxLevelFactsBundle;
  readonly projected: ProjectedTworldLynxLevel;
}

/** Builds facts and retains the exact detached projection used to derive them. */
export async function composeTworldLynxLevelFacts(
  input: BuildTworldLynxLevelFactsInput,
  sha256: Sha256Port,
): Promise<ComposedTworldLynxLevelFacts> {
  // Projection is synchronous and clones source bytes before the first await,
  // so later caller mutation cannot change either half of this fresh pair.
  const projected = projectLoadedTworldLynxLevel(input);
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

export async function buildTworldLynxLevelFacts(
  input: BuildTworldLynxLevelFactsInput,
  sha256: Sha256Port,
): Promise<TworldLynxLevelFactsBundle> {
  return (await composeTworldLynxLevelFacts(input, sha256)).levelFacts;
}
