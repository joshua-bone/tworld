import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  type P7TrainingPackId,
  type P7TrainingPackInventoryClosure,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  type P7TrainingReducedPack,
  type P7TrainingShardPlan,
  type P7TrainingVerifyPersistedEvidence,
} from "../p7-training-execution/p7TrainingShardProtocol";
import {
  composeP7TrainingReducedPackSemantic,
} from "./composeP7TrainingReducedPack";
import {
  assertP7TrainingExecutionPackContent,
  buildP7TrainingExecutionIndexFromReducedSemanticInput,
  type P7TrainingExecutionIndexBuildResult,
} from "./p7TrainingExecutionIndex";

export interface P7TrainingReducedExecutionEvidenceDescriptor {
  readonly occurrenceId: string;
  readonly levelNumber: number;
}

export interface BuildP7TrainingReducedPackExecutionIndexInput {
  readonly repositoryRoot: string;
  readonly packId: P7TrainingPackId;
  readonly inventory: P7TrainingPackInventoryClosure;
  readonly plan: P7TrainingShardPlan;
  readonly reducedPack: P7TrainingReducedPack;
  readonly evidence: readonly P7TrainingReducedExecutionEvidenceDescriptor[];
  readonly loadEvidence: P7TrainingVerifyPersistedEvidence;
  readonly sha256: Sha256Port;
}

function sameReference(
  left: P7TrainingShardPlan["packContent"],
  right: P7TrainingShardPlan["packContent"],
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

/**
 * Production reducer adapter. Its static import graph deliberately excludes
 * the shared player, HTML renderers, and the full checked-pack builder.
 */
export async function buildP7TrainingReducedPackExecutionIndex(
  input: BuildP7TrainingReducedPackExecutionIndexInput,
): Promise<P7TrainingExecutionIndexBuildResult> {
  if (
    input.plan.packId !== input.packId
    || input.reducedPack.packId !== input.packId
    || !sameReference(input.plan.packContent, input.reducedPack.packContent)
  ) throw new Error("P7 execution reducer pack identity or content drifted");
  if (
    input.evidence.length !== input.reducedPack.levels.length
    || input.evidence.some((entry, index) => (
      entry.levelNumber !== index + 1
      || entry.occurrenceId !== input.reducedPack.levels[index]?.occurrenceId
    ))
  ) throw new Error("P7 execution reducer evidence denominator drifted");
  const composition = await composeP7TrainingReducedPackSemantic({
    repositoryRoot: input.repositoryRoot,
    reducedPack: input.reducedPack,
    sha256: input.sha256,
    loadEvidence: input.loadEvidence,
    loadInventory: async () => input.inventory,
  });
  const built = await buildP7TrainingExecutionIndexFromReducedSemanticInput(
    composition.semanticInput,
  );
  assertP7TrainingExecutionPackContent({
    executionIndex: built.index,
    packId: input.packId,
    packContent: input.plan.packContent,
  });
  return built;
}
