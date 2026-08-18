import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildTworldLevelFactsFromProjection,
  type TworldLevelFactsBundle,
} from "../impl/buildTworldLevelFacts";
import {
  projectLoadedTworldLynxLevel,
  type ProjectLoadedTworldLynxLevelInput,
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

export async function buildTworldLynxLevelFacts(
  input: BuildTworldLynxLevelFactsInput,
  sha256: Sha256Port,
): Promise<TworldLynxLevelFactsBundle> {
  return buildTworldLevelFactsFromProjection({
    occurrenceId: input.occurrenceId,
    producerRevision: input.producerRevision,
    repository: input.repository,
    repositoryRevision: input.repositoryRevision,
    sourcePath: input.sourcePath,
    adapterId: ADAPTER_ID,
    adapterRevision: input.adapterRevision,
    importProfileRevision: input.importProfileRevision,
    analyzerRevision: input.analyzerRevision,
    projected: projectLoadedTworldLynxLevel(input),
  }, sha256);
}
