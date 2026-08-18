import type {
  SolverObservation,
  SolverRenderProjection,
  SolverRuntimeMode,
} from "../domain/runtime/types.js";
import type { ExpandedPlanStepV1 } from "../plan/model.js";
import type {
  SolverAdvanceRequest,
  SolverCheckpoint,
  SolverRunHandle,
} from "../ports/SolverRuntimePort.js";
import { deriveObservationDelta } from "./deriveObservationDelta.js";
import {
  evaluateObservationPredicate,
  evaluateObservationPredicates,
} from "./evaluateObservationPredicate.js";
import {
  ContextualWitnessExecutorError,
  type ContextualBoundaryCaptureV1,
  type ContextualBoundaryCheckV1,
  type ContextualDecisionDigestV1,
  type ContextualEntryIdV1,
  type ContextualPlanSegmentV1,
  type ContextualPlanVerificationScopeV1,
  type ContextualWitnessExecutor,
  type ContextualWitnessExecutorOptions,
  type ContextualWitnessFailureV1,
  type ContextualWitnessJoinV1,
  type ContextualWitnessResultV1,
  type ExecuteContextualWitnessInputV1,
  type ObservationPredicateVerdictV1,
  type SubgoalContractV1,
} from "./model.js";
import { validatePlanEffects } from "./validatePlanEffects.js";
import {
  assertNonnegativeSafeInteger,
  assertPositiveSafeInteger,
  assertRevisionId,
  assertStableId,
  canonicalCopy,
  canonicalEqual,
  digestCanonical,
  digestDecisions,
  identifyEntry,
  identifyWitness,
  referenceCanonical,
} from "./support.js";
import {
  normalizeSubgoalContract,
  validateSubgoalContract,
} from "./validateSubgoalContract.js";

interface PreparedInput<TManualSource, TReplaySource> {
  readonly start: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>["start"];
  readonly initialization: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>["initialization"];
  readonly prefix: readonly SolverAdvanceRequest[];
  readonly snippet: readonly SolverAdvanceRequest[];
  readonly expectedEntryBoundary: number;
  readonly planIntent: readonly ExpandedPlanStepV1[];
  readonly planVerificationScope: ContextualPlanVerificationScopeV1;
  readonly segment: ContextualPlanSegmentV1;
  readonly contract: SubgoalContractV1;
  readonly renderRegion: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>["renderRegion"];
  readonly bounds: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>["bounds"];
}

interface CachedPrefix {
  readonly checkpoint: SolverCheckpoint;
  readonly entryId: ContextualEntryIdV1;
}

function invalidRequest(message: string): never {
  throw new ContextualWitnessExecutorError("witness.invalid-request", message);
}

function detachDecision(
  decision: SolverAdvanceRequest,
  mode: SolverRuntimeMode,
  label: string,
): SolverAdvanceRequest {
  if (typeof decision !== "object" || decision === null) {
    invalidRequest(`${label} must be an advance request object`);
  }
  if (decision.kind === "manual-poll") {
    if (mode !== "manual") invalidRequest(`${label} cannot manually poll a replay run`);
    if (!Number.isSafeInteger(decision.inputCode) || Object.is(decision.inputCode, -0)) {
      invalidRequest(`${label}.inputCode must be a safe integer other than negative zero`);
    }
    return { kind: "manual-poll", inputCode: decision.inputCode };
  }
  if (decision.kind === "replay-tick") {
    if (mode !== "replay") invalidRequest(`${label} cannot replay-tick a manual run`);
    return { kind: "replay-tick" };
  }
  invalidRequest(`${label}.kind is unknown`);
}

function assertEntryBoundary(value: number): void {
  if (
    !Number.isSafeInteger(value)
    || value < -1
    || Object.is(value, -0)
  ) {
    invalidRequest("expectedEntryBoundary must be -1 or a nonnegative safe integer");
  }
}

function preparePlanSegment(
  input: ExecuteContextualWitnessInputV1<unknown, unknown>,
  contract: SubgoalContractV1,
): readonly ExpandedPlanStepV1[] {
  const { plan, segment } = input;
  if (
    plan.previewVersion !== 1
    || (plan.status !== "candidate" && plan.status !== "unresolved")
    || plan.stepsOrder !== "forward-prerequisite-first"
    || plan.target !== contract.target
    || plan.planId !== segment.planId
    || plan.rootId !== segment.rootId
    || !canonicalEqual(contract.planSegment, segment)
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-plan-segment",
      "the contract and selected segment must bind one parent plan and target",
    );
  }
  assertNonnegativeSafeInteger(segment.startStepOrder, "segment.startStepOrder");
  assertNonnegativeSafeInteger(segment.endStepOrder, "segment.endStepOrder");
  if (segment.endStepOrder < segment.startStepOrder) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-plan-segment",
      "the selected plan segment must use an ascending inclusive step range",
    );
  }
  const expectedCount = segment.endStepOrder - segment.startStepOrder + 1;
  const steps = plan.steps.filter(({ stepOrder }) => (
    stepOrder >= segment.startStepOrder && stepOrder <= segment.endStepOrder
  ));
  if (
    steps.length !== expectedCount
    || segment.operatorIds.length !== expectedCount
    || steps.some((step, index) => (
      step.stepOrder !== segment.startStepOrder + index
      || step.operatorId !== segment.operatorIds[index]
    ))
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.invalid-plan-segment",
      "the selected plan steps must be contiguous and match their exact operator identities",
    );
  }
  for (const step of steps) {
    if (step.achieves.kind === "collect" && step.achieves.sourcePlacementId !== null) {
      const exactSource = step.achieves.sourcePlacementId;
      const requiresSource = contract.requires.some((predicate) => (
        predicate.kind === "placement-presence"
        && predicate.placementId === exactSource
        && predicate.present
      ));
      const removesSource = contract.ensures.some((predicate) => (
        predicate.kind === "placement-presence"
        && predicate.placementId === exactSource
        && !predicate.present
      ));
      if (!requiresSource || !removesSource) {
        throw new ContextualWitnessExecutorError(
          "witness.invalid-plan-segment",
          "a source-bound collection step must preserve its exact placement in entry and ending predicates",
        );
      }
    }
    for (const effect of step.stateEffects) {
      const selectorKind = effect.axis === "inventory"
        ? "inventory-resource"
        : "remaining-requirement";
      if (!contract.footprint.mustChange.some((selector) => (
        selector.kind === selectorKind && selector.resourceType === effect.resourceType
      ))) {
        throw new ContextualWitnessExecutorError(
          "witness.invalid-plan-segment",
          `plan effect ${effect.axis}:${effect.resourceType} must bind a matching must-change footprint`,
        );
      }
    }
  }
  return canonicalCopy(steps);
}

function prepareInput<TManualSource, TReplaySource>(
  input: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>,
): PreparedInput<TManualSource, TReplaySource> {
  if (typeof input !== "object" || input === null) invalidRequest("input must be an object");
  const mode: SolverRuntimeMode = input.start.kind === "manual"
    ? "manual"
    : input.start.kind === "replay"
      ? "replay"
      : invalidRequest("start.kind must be manual or replay");
  assertStableId(input.initialization.seedSemantics, "initialization.seedSemantics");
  assertNonnegativeSafeInteger(input.initialization.randomSeed, "initialization.randomSeed");
  if (input.initialization.randomSeed > 0xffff_ffff) {
    invalidRequest("initialization.randomSeed must fit an unsigned 32-bit value");
  }
  if (mode === "manual" && input.initialization.replay !== null) {
    invalidRequest("manual initialization cannot carry a replay reference");
  }
  if (mode === "replay" && input.initialization.replay === null) {
    invalidRequest("replay initialization requires an exact replay reference");
  }
  assertEntryBoundary(input.expectedEntryBoundary);
  assertNonnegativeSafeInteger(input.bounds.maximumPrefixTicks, "bounds.maximumPrefixTicks");
  assertPositiveSafeInteger(input.bounds.maximumSnippetTicks, "bounds.maximumSnippetTicks");
  if (input.prefix.length > input.bounds.maximumPrefixTicks) {
    invalidRequest("prefix exceeds its explicit tick bound");
  }
  const prefix = input.prefix.map((decision, index) => (
    detachDecision(decision, mode, `prefix[${index}]`)
  ));
  const snippet = input.snippet.map((decision, index) => (
    detachDecision(decision, mode, `snippet[${index}]`)
  ));
  const contract = normalizeSubgoalContract(input.contract);
  const planIntent = preparePlanSegment(
    input as ExecuteContextualWitnessInputV1<unknown, unknown>,
    contract,
  );
  return {
    start: input.start,
    initialization: canonicalCopy(input.initialization),
    prefix,
    snippet,
    expectedEntryBoundary: input.expectedEntryBoundary,
    planIntent,
    planVerificationScope: {
      kind: "selected-segment-only",
      parentPlanStatus: input.plan.status,
    },
    segment: canonicalCopy(input.segment),
    contract,
    renderRegion: canonicalCopy(input.renderRegion),
    bounds: canonicalCopy(input.bounds),
  };
}

function assertBoundaryCoherence(
  observation: SolverObservation,
  render: SolverRenderProjection,
): void {
  if (
    observation.target !== render.target
    || observation.mode !== render.mode
    || !canonicalEqual(observation.level, render.level)
    || !canonicalEqual(observation.levelFacts, render.levelFacts)
    || !canonicalEqual(observation.provenance, render.provenance)
    || !canonicalEqual(observation.boundary, render.boundary)
    || !canonicalEqual(observation.fingerprints, render.fingerprints)
    || !canonicalEqual(observation.terminal, render.terminal)
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.render-incoherent",
      "the observation and semantic render do not describe the same exact boundary",
    );
  }
}

function assertCheckpointCoherence(
  checkpoint: SolverCheckpoint,
  entry: ContextualBoundaryCaptureV1,
): void {
  const observation = entry.observation;
  const metadata = checkpoint.metadata;
  if (
    metadata.target !== observation.target
    || metadata.mode !== observation.mode
    || metadata.nativeTick !== observation.boundary.nativeTick
    || metadata.exactRestoreDigest !== observation.fingerprints.exact
    || !canonicalEqual(metadata.level, observation.level)
    || !canonicalEqual(metadata.levelFacts, observation.levelFacts)
    || !canonicalEqual(metadata.provenance, observation.provenance)
  ) {
    throw new ContextualWitnessExecutorError(
      "witness.checkpoint-incoherent",
      "the checkpoint metadata does not bind the exact entry observation",
    );
  }
}

function firstFailed(
  verdicts: readonly ObservationPredicateVerdictV1[],
): ObservationPredicateVerdictV1 | undefined {
  return verdicts.find(({ passed }) => !passed);
}

function failure(
  code: ContextualWitnessFailureV1["code"],
  boundaryNativeTick: number,
  detail: string,
  predicateId: string | null = null,
  decisionOrder: number | null = null,
): ContextualWitnessFailureV1 {
  return { code, boundaryNativeTick, predicateId, decisionOrder, detail };
}

function semanticJoinState(
  direct: SolverObservation,
  restored: SolverObservation,
): ContextualWitnessJoinV1["state"] {
  return direct.fingerprints.semantic === restored.fingerprints.semantic
    ? "semantic-only"
    : "broken";
}

export function createContextualWitnessExecutor<TManualSource, TReplaySource>(
  options: ContextualWitnessExecutorOptions<TManualSource, TReplaySource>,
): ContextualWitnessExecutor<TManualSource, TReplaySource> {
  assertRevisionId(options.validatorRevision, "validatorRevision");
  assertPositiveSafeInteger(options.maximumCachedPrefixes, "maximumCachedPrefixes");
  const { runtime, sha256, validatorRevision, maximumCachedPrefixes } = options;
  const cache = new Map<string, CachedPrefix>();
  let operationQueue: Promise<void> = Promise.resolve();

  async function captureBoundary(
    run: SolverRunHandle,
    region: PreparedInput<TManualSource, TReplaySource>["renderRegion"],
  ): Promise<ContextualBoundaryCaptureV1> {
    const observation = canonicalCopy(await runtime.observe(run));
    const render = canonicalCopy(await runtime.projectRender(run, region));
    assertBoundaryCoherence(observation, render);
    const [observationContent, renderContent] = await Promise.all([
      referenceCanonical(observation, sha256),
      referenceCanonical(render, sha256),
    ]);
    return canonicalCopy({
      observation,
      observationContent,
      render,
      renderContent,
    });
  }

  async function disposeRuns(handles: readonly SolverRunHandle[]): Promise<void> {
    const results = await Promise.allSettled(handles.map((handle) => runtime.disposeRun(handle)));
    const failures = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (failures.length > 0) {
      throw new ContextualWitnessExecutorError(
        "witness.cleanup-failed",
        "one or more contextual witness runs could not be disposed",
        { cause: failures[0] },
      );
    }
  }

  async function evictForInsertion(): Promise<void> {
    if (cache.size < maximumCachedPrefixes) return;
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey === undefined) return;
    const oldest = cache.get(oldestKey)!;
    await runtime.disposeCheckpoint(oldest.checkpoint.handle);
    cache.delete(oldestKey);
  }

  async function buildResult(input: {
    readonly prepared: PreparedInput<TManualSource, TReplaySource>;
    readonly prefixDigest: ContextualDecisionDigestV1;
    readonly snippetDigest: ContextualDecisionDigestV1;
    readonly entryId: ContextualEntryIdV1;
    readonly entry: ContextualBoundaryCaptureV1;
    readonly end: ContextualBoundaryCaptureV1;
    readonly consumedDecisionCount: number;
    readonly boundaryChecks: readonly ContextualBoundaryCheckV1[];
    readonly join: ContextualWitnessJoinV1 | null;
    readonly executionFailure: ContextualWitnessFailureV1 | null;
  }): Promise<ContextualWitnessResultV1> {
    const changes = deriveObservationDelta(input.entry.observation, input.end.observation);
    const validation = validateSubgoalContract(
      input.prepared.contract,
      input.entry.observation,
      input.end.observation,
      changes,
    );
    const planEffectValidation = validatePlanEffects(
      input.prepared.planIntent,
      input.entry.observation,
      input.end.observation,
    );
    let firstFailure = input.executionFailure;
    if (firstFailure === null) {
      const failedEnsure = firstFailed(validation.ensures);
      if (failedEnsure !== undefined) {
        firstFailure = failure(
          "witness.postcondition",
          input.end.observation.boundary.nativeTick,
          "required ending predicate was not satisfied",
          failedEnsure.predicateId,
        );
      }
    }
    if (firstFailure === null) {
      const failedMustChange = validation.mustChange.find(({ passed }) => !passed);
      if (failedMustChange !== undefined) {
        firstFailure = failure(
          "witness.must-change",
          input.end.observation.boundary.nativeTick,
          "a required state footprint did not change",
        );
      }
    }
    if (firstFailure === null) {
      const failedMustNotChange = validation.mustNotChange.find(({ passed }) => !passed);
      if (failedMustNotChange !== undefined) {
        firstFailure = failure(
          "witness.must-not-change",
          input.end.observation.boundary.nativeTick,
          "a protected state footprint changed",
        );
      }
    }
    if (firstFailure === null) {
      const forbidden = validation.forbiddenObservedChanges.find(({ passed }) => !passed);
      if (forbidden !== undefined) {
        firstFailure = failure(
          "witness.forbidden-change",
          input.end.observation.boundary.nativeTick,
          "a forbidden boundary change was observed",
        );
      }
    }
    if (firstFailure === null && validation.unaccountedChangeOrders.length > 0) {
      firstFailure = failure(
        "witness.unaccounted-change",
        input.end.observation.boundary.nativeTick,
        "an observed boundary change is outside the declared footprint",
      );
    }
    if (firstFailure === null && planEffectValidation.some(({ passed }) => !passed)) {
      firstFailure = failure(
        "witness.plan-effect",
        input.end.observation.boundary.nativeTick,
        "observed resource deltas do not exactly match the selected plan effects",
      );
    }
    const outcome = firstFailure === null
      ? { kind: "verified" as const }
      : { kind: "failed" as const, failure: firstFailure };
    const witnessId = await identifyWitness({
      witnessIdentityVersion: 2,
      entryId: input.entryId,
      contractId: input.prepared.contract.contractId,
      contract: input.prepared.contract,
      planSegment: input.prepared.segment,
      planVerificationScope: input.prepared.planVerificationScope,
      planIntent: input.prepared.planIntent,
      snippetDigest: input.snippetDigest,
      consumedDecisionCount: input.consumedDecisionCount,
      endBoundary: input.end.observation.boundary,
      endExactDigest: input.end.observation.fingerprints.exact,
      join: input.join,
      outcome,
      validatorRevision,
    }, sha256);
    const result: ContextualWitnessResultV1 = {
      witnessVersion: 1,
      witnessId,
      entryId: input.entryId,
      target: input.entry.observation.target,
      mode: input.entry.observation.mode,
      level: input.entry.observation.level,
      levelFacts: input.entry.observation.levelFacts,
      runtimeProvenance: input.entry.observation.provenance,
      initialization: input.prepared.initialization,
      planSegment: input.prepared.segment,
      planVerificationScope: input.prepared.planVerificationScope,
      planIntentOrder: "step-order",
      planIntent: input.prepared.planIntent,
      contract: input.prepared.contract,
      prefix: {
        digest: input.prefixDigest,
        decisions: input.prepared.prefix,
      },
      snippet: {
        digest: input.snippetDigest,
        decisions: input.prepared.snippet,
        consumedDecisionCount: input.consumedDecisionCount,
      },
      entry: input.entry,
      end: input.end,
      boundaryChecksOrder: "execution-order",
      boundaryChecks: input.boundaryChecks,
      observedChangesOrder: "kind-identity",
      observedChanges: changes,
      planEffectValidationOrder: "axis-resource-type",
      planEffectValidation,
      contractValidation: validation,
      join: input.join,
      evidence: {
        coverage: "single-witness",
        rulesetScope: input.entry.observation.target,
        robustness: "single-context",
      },
      provenance: {
        planIntentDerivation: "backward-regressed",
        derivation: input.prepared.contract.provenance.derivation,
        observation: "observed",
        review: input.prepared.contract.provenance.review,
        verification: outcome.kind === "verified" ? "verified" : "failed",
        validatorRevision,
      },
      outcome,
    };
    return canonicalCopy(result);
  }

  async function executeStarted(
    started: Promise<SolverRunHandle>,
    prepared: PreparedInput<TManualSource, TReplaySource>,
  ): Promise<ContextualWitnessResultV1> {
    let original: SolverRunHandle | null = null;
    let restored: SolverRunHandle | null = null;
    let primaryError: unknown = null;
    try {
      original = await started;
      const initialObservation = canonicalCopy(await runtime.observe(original));
      const mode: SolverRuntimeMode = prepared.start.kind;
      if (initialObservation.mode !== mode || initialObservation.target !== prepared.contract.target) {
        throw new ContextualWitnessExecutorError(
          "witness.runtime-failed",
          "the started runtime does not match the contract target and mode",
        );
      }
      const [prefixDigest, snippetDigest] = await Promise.all([
        digestDecisions(prepared.prefix, sha256),
        digestDecisions(prepared.snippet, sha256),
      ]);
      const cacheKey = await digestCanonical({
        prefixCacheKeyVersion: 1,
        target: initialObservation.target,
        mode: initialObservation.mode,
        level: initialObservation.level,
        levelFacts: initialObservation.levelFacts,
        runtimeProvenance: initialObservation.provenance,
        initialExactDigest: initialObservation.fingerprints.exact,
        initialization: prepared.initialization,
        prefixDigest,
        expectedEntryBoundary: prepared.expectedEntryBoundary,
      }, sha256);

      for (const decision of prepared.prefix) await runtime.advanceTick(original, decision);
      const entry = await captureBoundary(original, prepared.renderRegion);
      if (entry.observation.boundary.nativeTick !== prepared.expectedEntryBoundary) {
        invalidRequest(
          `prefix ended at native tick ${entry.observation.boundary.nativeTick}, expected ${prepared.expectedEntryBoundary}`,
        );
      }
      const entryId = await identifyEntry({
        entryIdentityVersion: 1,
        target: entry.observation.target,
        mode: entry.observation.mode,
        level: entry.observation.level,
        levelFacts: entry.observation.levelFacts,
        runtimeProvenance: entry.observation.provenance,
        initialization: prepared.initialization,
        prefixDigest,
        entryBoundary: entry.observation.boundary,
        entryExactDigest: entry.observation.fingerprints.exact,
      }, sha256);

      const entryInvariants = evaluateObservationPredicates(
        prepared.contract.invariants,
        entry.observation,
      );
      const entryStop = evaluateObservationPredicate(prepared.contract.stop, entry.observation);
      const boundaryChecks: ContextualBoundaryCheckV1[] = [{
        decisionOrder: null,
        nativeTick: entry.observation.boundary.nativeTick,
        exactDigest: entry.observation.fingerprints.exact,
        invariantVerdicts: entryInvariants,
        stopVerdict: entryStop,
      }];
      const entryRequires = evaluateObservationPredicates(
        prepared.contract.requires,
        entry.observation,
      );
      const failedRequire = firstFailed(entryRequires);
      if (failedRequire !== undefined) {
        return buildResult({
          prepared,
          prefixDigest,
          snippetDigest,
          entryId,
          entry,
          end: entry,
          consumedDecisionCount: 0,
          boundaryChecks,
          join: null,
          executionFailure: failure(
            "witness.precondition",
            entry.observation.boundary.nativeTick,
            "required entry predicate was not satisfied",
            failedRequire.predicateId,
          ),
        });
      }
      const failedEntryInvariant = firstFailed(entryInvariants);
      if (failedEntryInvariant !== undefined) {
        return buildResult({
          prepared,
          prefixDigest,
          snippetDigest,
          entryId,
          entry,
          end: entry,
          consumedDecisionCount: 0,
          boundaryChecks,
          join: null,
          executionFailure: failure(
            "witness.invariant",
            entry.observation.boundary.nativeTick,
            "entry invariant was not satisfied",
            failedEntryInvariant.predicateId,
          ),
        });
      }

      let cached = cache.get(cacheKey);
      if (cached === undefined) {
        await evictForInsertion();
        const checkpoint = await runtime.captureCheckpoint(original);
        try {
          assertCheckpointCoherence(checkpoint, entry);
          cached = { checkpoint, entryId };
          cache.set(cacheKey, cached);
        } catch (cause) {
          try {
            await runtime.disposeCheckpoint(checkpoint.handle);
          } catch (cleanupCause) {
            throw new ContextualWitnessExecutorError(
              "witness.cleanup-failed",
              "a rejected contextual prefix checkpoint could not be disposed",
              { cause: cleanupCause },
            );
          }
          throw cause;
        }
      } else {
        assertCheckpointCoherence(cached.checkpoint, entry);
        if (cached.entryId !== entryId) {
          throw new ContextualWitnessExecutorError(
            "witness.checkpoint-incoherent",
            "the cached checkpoint entry identity does not match the rebuilt prefix",
          );
        }
      }
      restored = await runtime.restoreCheckpoint(cached.checkpoint.handle);
      const restoredEntry = await captureBoundary(restored, prepared.renderRegion);
      if (!canonicalEqual(restoredEntry, entry)) {
        throw new ContextualWitnessExecutorError(
          "witness.checkpoint-incoherent",
          "restoring the prefix checkpoint did not recreate the exact entry boundary",
        );
      }

      let consumed = 0;
      let stopSatisfied = entryStop.passed;
      let executionFailure: ContextualWitnessFailureV1 | null = null;
      let join: ContextualWitnessJoinV1 = {
        state: "exact",
        comparedDecisionCount: 0,
        firstDivergenceDecisionOrder: null,
      };
      const maximumTicks = Math.min(
        prepared.bounds.maximumSnippetTicks,
        prepared.contract.maximumAdvanceTicks,
      );
      while (!stopSatisfied && executionFailure === null) {
        if (consumed >= maximumTicks) {
          executionFailure = failure(
            "witness.budget-exhausted",
            (await runtime.observe(original)).boundary.nativeTick,
            "the stop predicate was not reached within the native-tick bound",
          );
          break;
        }
        const decision = prepared.snippet[consumed];
        if (decision === undefined) {
          executionFailure = failure(
            "witness.decision-exhausted",
            (await runtime.observe(original)).boundary.nativeTick,
            "the exact snippet ended before its stop predicate was satisfied",
          );
          break;
        }
        await runtime.advanceTick(original, decision);
        await runtime.advanceTick(restored, decision);
        const [directObservation, restoredObservation] = await Promise.all([
          Promise.resolve(runtime.observe(original)).then(canonicalCopy),
          Promise.resolve(runtime.observe(restored)).then(canonicalCopy),
        ]);
        const exactEqual = directObservation.fingerprints.exact
          === restoredObservation.fingerprints.exact;
        const fullyEqual = canonicalEqual(directObservation, restoredObservation);
        consumed += 1;
        if (!exactEqual || !fullyEqual) {
          join = {
            state: semanticJoinState(directObservation, restoredObservation),
            comparedDecisionCount: consumed,
            firstDivergenceDecisionOrder: consumed - 1,
          };
          executionFailure = failure(
            "witness.join-broken",
            directObservation.boundary.nativeTick,
            "restored execution diverged from uninterrupted prefix-plus-snippet execution",
            null,
            consumed - 1,
          );
        } else {
          join = {
            state: "exact",
            comparedDecisionCount: consumed,
            firstDivergenceDecisionOrder: null,
          };
        }
        const invariantVerdicts = evaluateObservationPredicates(
          prepared.contract.invariants,
          directObservation,
        );
        const stopVerdict = evaluateObservationPredicate(
          prepared.contract.stop,
          directObservation,
        );
        boundaryChecks.push({
          decisionOrder: consumed - 1,
          nativeTick: directObservation.boundary.nativeTick,
          exactDigest: directObservation.fingerprints.exact,
          invariantVerdicts,
          stopVerdict,
        });
        const failedInvariant = firstFailed(invariantVerdicts);
        if (executionFailure === null && failedInvariant !== undefined) {
          executionFailure = failure(
            "witness.invariant",
            directObservation.boundary.nativeTick,
            "an invariant failed after a snippet decision",
            failedInvariant.predicateId,
            consumed - 1,
          );
        }
        stopSatisfied = stopVerdict.passed;
        if (
          executionFailure === null
          && !stopSatisfied
          && directObservation.terminal.kind !== "running"
        ) {
          executionFailure = failure(
            "witness.terminal-before-stop",
            directObservation.boundary.nativeTick,
            "the run became terminal before the stop predicate was satisfied",
            null,
            consumed - 1,
          );
        }
      }

      const [end, restoredEnd] = await Promise.all([
        captureBoundary(original, prepared.renderRegion),
        captureBoundary(restored, prepared.renderRegion),
      ]);
      if (!canonicalEqual(end, restoredEnd)) {
        const observationsEqual = canonicalEqual(end.observation, restoredEnd.observation);
        join = {
          state: observationsEqual
            ? "broken"
            : semanticJoinState(end.observation, restoredEnd.observation),
          comparedDecisionCount: consumed,
          firstDivergenceDecisionOrder: consumed === 0 ? null : consumed - 1,
        };
        if (executionFailure === null) {
          executionFailure = failure(
            "witness.join-broken",
            end.observation.boundary.nativeTick,
            "ending observation or render differs between restored and uninterrupted execution",
            null,
            consumed === 0 ? null : consumed - 1,
          );
        }
      }
      return buildResult({
        prepared,
        prefixDigest,
        snippetDigest,
        entryId,
        entry,
        end,
        consumedDecisionCount: consumed,
        boundaryChecks,
        join,
        executionFailure,
      });
    } catch (cause) {
      primaryError = cause;
      if (cause instanceof ContextualWitnessExecutorError) throw cause;
      throw new ContextualWitnessExecutorError(
        "witness.runtime-failed",
        "the runtime could not execute the contextual witness",
        { cause },
      );
    } finally {
      const handles = [original, restored].filter((handle): handle is SolverRunHandle => (
        handle !== null
      ));
      try {
        await disposeRuns(handles);
      } catch (cleanupError) {
        if (primaryError === null) throw cleanupError;
      }
    }
  }

  function enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = operationQueue.then(operation);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  function execute(
    input: ExecuteContextualWitnessInputV1<TManualSource, TReplaySource>,
  ): Promise<ContextualWitnessResultV1> {
    const prepared = prepareInput(input);
    return enqueue(async () => {
      let startedValue: ReturnType<typeof runtime.startManual>;
      try {
        startedValue = prepared.start.kind === "manual"
          ? runtime.startManual(prepared.start.source)
          : runtime.startReplay(prepared.start.source) as ReturnType<typeof runtime.startManual>;
      } catch (cause) {
        throw new ContextualWitnessExecutorError(
          "witness.runtime-failed",
          "the runtime could not start the contextual witness",
          { cause },
        );
      }
      return executeStarted(Promise.resolve(startedValue), prepared);
    });
  }

  function clearCheckpointCache(): Promise<void> {
    return enqueue(async () => {
      const entries = [...cache.entries()];
      const results = await Promise.allSettled(entries.map(async ([key, entry]) => {
        await runtime.disposeCheckpoint(entry.checkpoint.handle);
        cache.delete(key);
      }));
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") {
        throw new ContextualWitnessExecutorError(
          "witness.cleanup-failed",
          "one or more cached prefix checkpoints could not be disposed",
          { cause: failed.reason },
        );
      }
    });
  }

  return { execute, clearCheckpointCache };
}
