import { referenceCanonicalJson, referenceSourceBytes } from "@tworld/ccsolver/application";
import type { BlobReferenceV1, CanonicalJson } from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  buildP7bTrainingPackOutputs,
  type P7bTrainingPackBuildResult,
  type P7bTrainingPackOutput,
} from "../p7b-training-review/buildP7bTrainingPackOutputs";
import { composeP7TrainingReducedPackSemantic } from "../p7b-training-review/composeP7TrainingReducedPack";
import {
  attestCheckedP7bTrainingPack,
  attestP7bTrainingPackOutputs,
  writeP7bTrainingPackCheckedOutputsTransactionally,
  type P7bTrainingPackAttestation,
} from "../p7b-training-review/p7bTrainingPackIo";
import { canonicalizeP7TrainingExecutionIndex } from "../p7b-training-review/p7TrainingExecutionIndex";
import { canonicalizeP7SharedPlayerGraphAttestation } from "../p7b-training-review/p7SharedPlayerGraphAttestation";
import { loadCheckedTrainingPackInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type { P7TrainingPackId } from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  checkP7TrainingEngineRun,
  type P7TrainingEngineReduction,
  type P7TrainingScopedInventoryLoader,
} from "./p7TrainingEngineRunnerCore";
import {
  attestCheckedP7TrainingExecutionAuthorities,
  loadCheckedP7TrainingExecutionAuthorities,
} from "./p7TrainingExecutionAuthorityIo";
import {
  checkP7TrainingPlayerGraph,
  type P7TrainingSharedPlayerInput,
} from "./p7TrainingPlayerGraphIo";
import {
  P7_TRAINING_PRESENTATION_MAX_BYTES,
  assertP7TrainingPresentationLeafRunner,
  buildP7TrainingPresentationAuthority,
  buildP7TrainingPresentationLeaf,
  canonicalizeP7TrainingPresentationAuthority,
  canonicalizeP7TrainingPresentationLeaf,
  parseP7TrainingPresentationLeaf,
  type P7TrainingPresentationLeafV1,
} from "./p7TrainingPresentationContract";
import {
  loadCheckedP7TrainingPresentationAuthorities,
  writeP7TrainingPresentationAuthoritiesTransactionally,
} from "./p7TrainingPresentationAuthorityIo";
import { assertP7TrainingPresentationProofReceiptCurrent } from "./p7TrainingPresentationProofReceipt";
import type { P7TrainingPresentationRunnerBinaryV1 } from "./p7TrainingPresentationRunnerBinary";
import type {
  P7TrainingRunBindingV1,
  P7TrainingRunnerBinaryV1,
} from "./p7TrainingRunnerContract";
import { P7TrainingArtifactFilesystem } from "./p7TrainingSidecarFilesystem";

export interface P7TrainingPresentationRunnerOperations {
  readonly checkEngineRun: typeof checkP7TrainingEngineRun;
  readonly attestIndependentAuthorities: typeof attestCheckedP7TrainingExecutionAuthorities;
  readonly loadInventory: P7TrainingScopedInventoryLoader;
  readonly loadPlayerGraph: typeof checkP7TrainingPlayerGraph;
  readonly composeSemantic: typeof composeP7TrainingReducedPackSemantic;
  readonly buildPack: typeof buildP7bTrainingPackOutputs;
  readonly attestPackOutputs: typeof attestP7bTrainingPackOutputs;
  readonly writeCheckedPack: typeof writeP7bTrainingPackCheckedOutputsTransactionally;
  readonly attestCheckedPack: typeof attestCheckedP7bTrainingPack;
  readonly writePresentationAuthorities: typeof writeP7TrainingPresentationAuthoritiesTransactionally;
}

export interface P7TrainingCheckedPresentationOperations {
  readonly loadExecutionAuthorities: typeof loadCheckedP7TrainingExecutionAuthorities;
  readonly loadPresentationAuthorities: typeof loadCheckedP7TrainingPresentationAuthorities;
  readonly loadPlayerGraph: typeof checkP7TrainingPlayerGraph;
  readonly attestCheckedPack: typeof attestCheckedP7bTrainingPack;
  readonly assertProofReceiptCurrent: typeof assertP7TrainingPresentationProofReceiptCurrent;
  readonly canonicalizeExecutionIndex: typeof canonicalizeP7TrainingExecutionIndex;
  readonly canonicalizePlayerGraph: typeof canonicalizeP7SharedPlayerGraphAttestation;
}

export interface P7TrainingPresentationBuild {
  readonly packId: P7TrainingPackId;
  readonly reduction: P7TrainingEngineReduction;
  readonly built: P7bTrainingPackBuildResult;
  readonly attested: P7bTrainingPackAttestation;
  readonly leaf: P7TrainingPresentationLeafV1;
  readonly leafCanonicalJson: CanonicalJson;
  readonly leafContent: BlobReferenceV1;
}

export interface P7TrainingCheckedPresentationAttestation {
  readonly packId: P7TrainingPackId;
  readonly executionAuthorityContent: BlobReferenceV1;
  readonly presentationAuthorityContent: BlobReferenceV1;
  readonly manifestContent: BlobReferenceV1;
  readonly outputCount: number;
}

interface PresentationInput {
  readonly repositoryRoot: string;
  readonly artifactRoot: string;
  readonly binding: P7TrainingRunBindingV1;
  readonly runner: P7TrainingRunnerBinaryV1;
  readonly presentationRunner: P7TrainingPresentationRunnerBinaryV1;
  readonly sha256: Sha256Port;
  readonly operations?: P7TrainingPresentationRunnerOperations;
}

function defaultOperations(): P7TrainingPresentationRunnerOperations {
  return {
    checkEngineRun: checkP7TrainingEngineRun,
    attestIndependentAuthorities: attestCheckedP7TrainingExecutionAuthorities,
    loadInventory: loadCheckedTrainingPackInventory,
    loadPlayerGraph: checkP7TrainingPlayerGraph,
    composeSemantic: composeP7TrainingReducedPackSemantic,
    buildPack: buildP7bTrainingPackOutputs,
    attestPackOutputs: attestP7bTrainingPackOutputs,
    writeCheckedPack: writeP7bTrainingPackCheckedOutputsTransactionally,
    attestCheckedPack: attestCheckedP7bTrainingPack,
    writePresentationAuthorities: writeP7TrainingPresentationAuthoritiesTransactionally,
  };
}

function defaultCheckedOperations(): P7TrainingCheckedPresentationOperations {
  return {
    loadExecutionAuthorities: loadCheckedP7TrainingExecutionAuthorities,
    loadPresentationAuthorities: loadCheckedP7TrainingPresentationAuthorities,
    loadPlayerGraph: checkP7TrainingPlayerGraph,
    attestCheckedPack: attestCheckedP7bTrainingPack,
    assertProofReceiptCurrent: assertP7TrainingPresentationProofReceiptCurrent,
    canonicalizeExecutionIndex: canonicalizeP7TrainingExecutionIndex,
    canonicalizePlayerGraph: canonicalizeP7SharedPlayerGraphAttestation,
  };
}

function operations(input: PresentationInput): P7TrainingPresentationRunnerOperations {
  return input.operations ?? defaultOperations();
}

function engineInput(input: PresentationInput) {
  return {
    repositoryRoot: input.repositoryRoot,
    artifactRoot: input.artifactRoot,
    binding: input.binding,
    runner: input.runner,
    sha256: input.sha256,
  };
}

function packFilesystem(input: PresentationInput, packId: P7TrainingPackId): P7TrainingArtifactFilesystem {
  return new P7TrainingArtifactFilesystem({
    trustedRoot: input.artifactRoot,
    artifactRoot: `${input.artifactRoot}/packs/${packId}`,
    packId,
    shardIndex: 0,
    sha256: input.sha256,
  });
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function assertExecutionAuthority(input: {
  readonly packId: P7TrainingPackId;
  readonly canonicalJson: CanonicalJson;
  readonly executionIndex: P7bTrainingPackBuildResult["executionIndex"];
}): void {
  if (canonicalizeP7TrainingExecutionIndex(input.executionIndex) !== input.canonicalJson) {
    throw new Error(`${input.packId} presentation execution authority drifted`);
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertExactOutputBytes(input: {
  readonly packId: P7TrainingPackId;
  readonly expected: readonly P7bTrainingPackOutput[];
  readonly actual: readonly P7bTrainingPackOutput[];
}): void {
  const order = (left: P7bTrainingPackOutput, right: P7bTrainingPackOutput) => (
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
  const expected = [...input.expected].sort(order);
  const actual = [...input.actual].sort(order);
  if (
    expected.length !== actual.length
    || expected.some((output, index) => {
      const observed = actual[index];
      return observed === undefined
        || output.path !== observed.path
        || output.mediaType !== observed.mediaType
        || !sameBytes(output.content, observed.content);
    })
  ) throw new Error(`${input.packId} checked presentation output tree drifted`);
}

async function composePresentations(input: PresentationInput & {
  readonly reductions: readonly P7TrainingEngineReduction[];
  readonly writeLeaf: boolean;
}): Promise<readonly P7TrainingPresentationBuild[]> {
  const runtime = operations(input);
  await runtime.attestIndependentAuthorities({
    repositoryRoot: input.repositoryRoot,
    authorities: input.reductions.map(({ packId, executionIndex }) => ({
      packId,
      artifact: executionIndex,
    })),
    sha256: input.sha256,
  });
  const sharedPlayer = await runtime.loadPlayerGraph({
    repositoryRoot: input.repositoryRoot,
    sha256: input.sha256,
  });
  const playerGraphJson = canonicalizeP7SharedPlayerGraphAttestation(
    sharedPlayer.graphAttestation,
  );
  const playerGraphContent = await referenceCanonicalJson(playerGraphJson, input.sha256);
  const presentations: P7TrainingPresentationBuild[] = [];
  for (const reduction of input.reductions) {
    const packId = reduction.packId;
    const composition = await runtime.composeSemantic({
      repositoryRoot: input.repositoryRoot,
      reducedPack: reduction.reducedPack,
      loadEvidence: reduction.loadEvidence,
      loadInventory: (root, sha256) => runtime.loadInventory(root, packId, sha256),
      sha256: input.sha256,
    });
    const built = await runtime.buildPack({
      ...composition.semanticInput,
      sharedPlayer: sharedPlayer as P7TrainingSharedPlayerInput,
    });
    assertExecutionAuthority({
      packId,
      canonicalJson: reduction.executionIndex.canonicalJson,
      executionIndex: built.executionIndex,
    });
    const attested = await runtime.attestPackOutputs(
      input.repositoryRoot,
      packId,
      built.outputs,
      { externalFiles: composition.proofSources.externalFiles },
    );
    assertExecutionAuthority({
      packId,
      canonicalJson: reduction.executionIndex.canonicalJson,
      executionIndex: attested.executionIndex,
    });
    if (!sameReference(attested.manifestContent, built.manifestContent)) {
      throw new Error(`${packId} presentation manifest attestation drifted`);
    }
    const leaf = await buildP7TrainingPresentationLeaf({
      binding: input.binding,
      presentationRunner: input.presentationRunner,
      packId,
      reducedContent: reduction.reducedContent,
      executionIndexContent: reduction.executionIndex.content,
      playerGraphContent,
      built,
      sha256: input.sha256,
    });
    const leafCanonicalJson = canonicalizeP7TrainingPresentationLeaf(leaf);
    const leafContent = await referenceCanonicalJson(leafCanonicalJson, input.sha256);
    if (input.writeLeaf) {
      await packFilesystem(input, packId).writeCanonicalJson(
        "presentation.json",
        leafCanonicalJson,
        P7_TRAINING_PRESENTATION_MAX_BYTES,
      );
    }
    presentations.push({
      packId,
      reduction,
      built,
      attested,
      leaf,
      leafCanonicalJson,
      leafContent,
    });
  }
  return presentations;
}

async function compareStoredLeaves(
  input: PresentationInput,
  presentations: readonly P7TrainingPresentationBuild[],
): Promise<void> {
  for (const presentation of presentations) {
    const storedJson = await packFilesystem(input, presentation.packId).readCanonicalJson(
      "presentation.json",
      P7_TRAINING_PRESENTATION_MAX_BYTES,
    );
    const stored = parseP7TrainingPresentationLeaf(storedJson);
    assertP7TrainingPresentationLeafRunner(stored, input.presentationRunner);
    if (
      storedJson !== presentation.leafCanonicalJson
      || !sameReference(stored.reducedContent, presentation.reduction.reducedContent)
      || !sameReference(stored.executionIndexContent, presentation.reduction.executionIndex.content)
    ) throw new Error(`${presentation.packId} checked presentation leaf drifted`);
  }
}

async function compareCheckedPacks(
  input: PresentationInput,
  presentations: readonly P7TrainingPresentationBuild[],
): Promise<void> {
  const runtime = operations(input);
  for (const presentation of presentations) {
    const checked = await runtime.attestCheckedPack(input.repositoryRoot, presentation.packId);
    assertExecutionAuthority({
      packId: presentation.packId,
      canonicalJson: presentation.reduction.executionIndex.canonicalJson,
      executionIndex: checked.executionIndex,
    });
    if (!sameReference(checked.manifestContent, presentation.built.manifestContent)) {
      throw new Error(`${presentation.packId} checked presentation manifest drifted`);
    }
    assertExactOutputBytes({
      packId: presentation.packId,
      expected: presentation.built.outputs,
      actual: checked.outputs,
    });
  }
}

export async function buildP7TrainingPresentationRun(
  input: PresentationInput,
): Promise<readonly P7TrainingPresentationBuild[]> {
  const reductions = await operations(input).checkEngineRun(engineInput(input));
  return composePresentations({ ...input, reductions, writeLeaf: true });
}

/** Processor-free and read-only across both work artifacts and checked leaves. */
export async function checkP7TrainingPresentationRun(
  input: PresentationInput & { readonly requireCheckedOutputs?: boolean },
): Promise<readonly P7TrainingPresentationBuild[]> {
  const reductions = await operations(input).checkEngineRun(engineInput(input));
  const presentations = await composePresentations({ ...input, reductions, writeLeaf: false });
  await compareStoredLeaves(input, presentations);
  if (input.requireCheckedOutputs !== false) await compareCheckedPacks(input, presentations);
  return presentations;
}

/** The only presentation-side mutation of checked pack leaves. */
export async function writeP7TrainingPresentationPacks(
  input: PresentationInput,
): Promise<readonly P7TrainingPresentationBuild[]> {
  const runtime = operations(input);
  const presentations = await checkP7TrainingPresentationRun({
    ...input,
    requireCheckedOutputs: false,
  });
  for (const presentation of presentations) {
    await runtime.writeCheckedPack(
      input.repositoryRoot,
      presentation.packId,
      presentation.built.outputs,
    );
    const checked = await runtime.attestCheckedPack(input.repositoryRoot, presentation.packId);
    assertExecutionAuthority({
      packId: presentation.packId,
      canonicalJson: presentation.reduction.executionIndex.canonicalJson,
      executionIndex: checked.executionIndex,
    });
    if (!sameReference(checked.manifestContent, presentation.built.manifestContent)) {
      throw new Error(`${presentation.packId} checked presentation manifest drifted`);
    }
    assertExactOutputBytes({
      packId: presentation.packId,
      expected: presentation.built.outputs,
      actual: checked.outputs,
    });
  }
  const authorities = await Promise.all(presentations.map(async (presentation) => {
    const authority = buildP7TrainingPresentationAuthority(presentation.leaf);
    const canonicalJson = canonicalizeP7TrainingPresentationAuthority(authority);
    return {
      packId: presentation.packId,
      authority,
      canonicalJson,
      content: await referenceCanonicalJson(canonicalJson, input.sha256),
    };
  }));
  await runtime.writePresentationAuthorities({
    repositoryRoot: input.repositoryRoot,
    authorities,
    sha256: input.sha256,
  });
  return presentations;
}

/**
 * Processor- and artifact-free checked presentation attestation. Source
 * freshness is mandatory through the outer p7-presentation proof receipt.
 */
export async function attestP7TrainingPresentationPacks(
  input: {
    readonly repositoryRoot: string;
    readonly packIds: readonly P7TrainingPackId[];
    readonly sha256: Sha256Port;
    readonly operations?: P7TrainingCheckedPresentationOperations;
  },
): Promise<readonly P7TrainingCheckedPresentationAttestation[]> {
  const runtime = input.operations ?? defaultCheckedOperations();
  const [executionAuthorities, presentationAuthorities, sharedPlayer] = await Promise.all([
    runtime.loadExecutionAuthorities(input),
    runtime.loadPresentationAuthorities(input),
    runtime.loadPlayerGraph({ repositoryRoot: input.repositoryRoot, sha256: input.sha256 }),
  ]);
  const graphJson = runtime.canonicalizePlayerGraph(sharedPlayer.graphAttestation);
  const graphContent = await referenceCanonicalJson(graphJson, input.sha256);
  const attested: P7TrainingCheckedPresentationAttestation[] = [];
  for (const [index, packId] of input.packIds.entries()) {
    const execution = executionAuthorities[index];
    const presentation = presentationAuthorities[index];
    if (execution?.packId !== packId || presentation?.packId !== packId) {
      throw new Error(`${packId} checked presentation authority order drifted`);
    }
    const checked = await runtime.attestCheckedPack(input.repositoryRoot, packId);
    if (runtime.canonicalizeExecutionIndex(checked.executionIndex) !== execution.artifact.canonicalJson) {
      throw new Error(`${packId} checked presentation execution authority drifted`);
    }
    if (
      !sameReference(presentation.authority.executionIndexContent, execution.artifact.content)
      || !sameReference(presentation.authority.playerGraphContent, graphContent)
      || !sameReference(presentation.authority.manifestContent, checked.manifestContent)
      || presentation.authority.outputs.length !== checked.outputs.length
    ) throw new Error(`${packId} checked presentation receipt binding drifted`);
    const outputs = await Promise.all([...checked.outputs]
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      .map(async (output) => ({
        path: output.path,
        content: await referenceSourceBytes(output.content, input.sha256),
      })));
    if (outputs.some((output, outputIndex) => {
      const expected = presentation.authority.outputs[outputIndex];
      return expected === undefined
        || output.path !== expected.path
        || !sameReference(output.content, expected.content);
    })) throw new Error(`${packId} checked presentation output tree drifted`);
    attested.push({
      packId,
      executionAuthorityContent: execution.artifact.content,
      presentationAuthorityContent: presentation.content,
      manifestContent: checked.manifestContent,
      outputCount: checked.outputs.length,
    });
  }
  await runtime.assertProofReceiptCurrent({ repositoryRoot: input.repositoryRoot });
  return attested;
}
