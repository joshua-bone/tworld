import {
  buildP7bTrainingPackOutputs,
  type P7bTrainingPackBuildResult,
} from "./buildP7bTrainingPackOutputs";
import {
  composeP7TrainingReducedPackBuildInput,
  type ComposeP7TrainingReducedPackInput,
} from "./composeP7TrainingReducedPack";

/** Presentation-layer wrapper; graph-free runners must import the semantic composer instead. */
export async function buildP7TrainingReducedPackOutputs(
  input: ComposeP7TrainingReducedPackInput,
): Promise<P7bTrainingPackBuildResult> {
  return buildP7bTrainingPackOutputs(
    await composeP7TrainingReducedPackBuildInput(input),
  );
}
