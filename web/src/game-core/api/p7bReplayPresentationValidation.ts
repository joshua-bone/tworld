import type {
  P7bExecutionTargetId,
  P7bLevelReplayPresentation,
  P7bReplayCombination,
  P7bReplaySegmentSpan,
  P7bReplaySelection,
  P7bReplayVariantId,
  P7bSemanticSegmentPresentation,
} from "@game-core/api/p7bReplayPresentation";

function assertSafeHref(href: string, label: string): void {
  if (href.trim() === "" || /^(?:data|javascript|vbscript):/iu.test(href.trim())) {
    throw new Error(`${label} must be a non-executable relative or HTTP URL`);
  }
}

function assertInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer at least ${minimum}`);
  }
}

export function p7bReplayCombinationKey(selection: P7bReplaySelection): string {
  return `${selection.variant}:${selection.executionTarget}`;
}

export function assertP7bLevelReplayPresentation(model: P7bLevelReplayPresentation): void {
  assertInteger(model.levelNumber, "P7B level number", 1);
  assertSafeHref(model.sourceHref, "P7B source href");
  assertSafeHref(model.levelManifestHref, "P7B browser level manifest href");
  assertSafeHref(model.playerModuleHref, "P7B player module href");
  if (model.variants.length === 0 || model.executionTargets.length === 0) {
    throw new Error("P7B level presentation requires variants and execution targets");
  }

  const variants = new Set<P7bReplayVariantId>();
  const orderedSegmentsByVariant = new Map<
    P7bReplayVariantId,
    readonly P7bSemanticSegmentPresentation[]
  >();
  for (const variant of model.variants) {
    if (variants.has(variant.id)) throw new Error(`duplicate P7B replay variant: ${variant.id}`);
    variants.add(variant.id);
    if (variant.segments.length === 0) {
      throw new Error(`P7B replay variant ${variant.id} requires semantic segments`);
    }
    const segmentIds = new Set<string>();
    const orderedSegments = [...variant.segments].sort((left, right) => left.ordinal - right.ordinal);
    for (const [index, segment] of orderedSegments.entries()) {
      assertInteger(segment.ordinal, `P7B ${variant.id} segment ${segment.id} ordinal`, 1);
      if (segment.ordinal !== index + 1) {
        throw new Error(`P7B replay variant ${variant.id} segment ordinals must be contiguous from one`);
      }
      if (segment.id === "" || segmentIds.has(segment.id)) {
        throw new Error(`duplicate or empty P7B ${variant.id} semantic segment id: ${segment.id}`);
      }
      segmentIds.add(segment.id);
    }
    orderedSegmentsByVariant.set(variant.id, orderedSegments);
  }
  const targets = new Set<P7bExecutionTargetId>();
  for (const target of model.executionTargets) {
    if (targets.has(target.id)) throw new Error(`duplicate P7B execution target: ${target.id}`);
    targets.add(target.id);
  }
  if (!variants.has(model.initialSelection.variant) || !targets.has(model.initialSelection.executionTarget)) {
    throw new Error("P7B initial replay selection is absent from its independent axes");
  }

  const combinations = new Map<string, P7bReplayCombination>();
  for (const combination of model.combinations) {
    if (!variants.has(combination.variant) || !targets.has(combination.executionTarget)) {
      throw new Error(`P7B replay combination is outside its axes: ${p7bReplayCombinationKey(combination)}`);
    }
    const key = p7bReplayCombinationKey(combination);
    if (combinations.has(key)) throw new Error(`duplicate P7B replay combination: ${key}`);
    combinations.set(key, combination);
    if (combination.availability === "unavailable") {
      if (combination.reason.trim() === "") throw new Error(`unavailable P7B replay ${key} needs a reason`);
      continue;
    }

    assertSafeHref(combination.replayHref, `P7B replay href for ${key}`);
    if (
      combination.transport !== "native-replay-pulses"
      && combination.transport !== "manual-held-schedule"
    ) {
      throw new Error(`P7B replay ${key} transport is unsupported`);
    }
    if (
      (combination.decisionProfile.clockBasis === "native-tick"
        && combination.transport !== "native-replay-pulses")
      || (combination.decisionProfile.clockBasis === "portable-decision"
        && combination.transport !== "manual-held-schedule")
    ) {
      throw new Error(`P7B replay ${key} transport does not match its decision clock`);
    }
    if (
      !/^sha256:[0-9a-f]{64}$/u.test(combination.replayContent.digest)
      || !Number.isSafeInteger(combination.replayContent.byteLength)
      || combination.replayContent.byteLength < 0
    ) {
      throw new Error(`P7B replay ${key} content reference is invalid`);
    }
    if (combination.certificationHref !== undefined) {
      assertSafeHref(combination.certificationHref, `P7B certification href for ${key}`);
    }
    if (combination.decisionProfile.profileId.trim() === "") {
      throw new Error(`P7B replay ${key} decision profile id cannot be empty`);
    }
    if (!Number.isFinite(combination.decisionProfile.cadenceHz) || combination.decisionProfile.cadenceHz <= 0) {
      throw new Error(`P7B replay ${key} decision cadence must be positive`);
    }
    if (!Number.isFinite(combination.nativeTickRateHz) || combination.nativeTickRateHz <= 0) {
      throw new Error(`P7B replay ${key} native tick rate must be positive`);
    }
    if (combination.nativeBoundaryClock !== "exclusive-advance-count-v1") {
      throw new Error(`P7B replay ${key} native boundary clock is unsupported`);
    }
    assertInteger(combination.terminalNativeTick, `P7B replay ${key} terminal boundary`, 1);
    assertInteger(combination.executedDecisionCount, `P7B replay ${key} executed decisions`, 0);
    const orderedSegments = orderedSegmentsByVariant.get(combination.variant)!;
    const segmentIds = new Set(orderedSegments.map(({ id }) => id));
    const spans = new Map<string, P7bReplaySegmentSpan>();
    for (const [spanIndex, span] of combination.segmentSpans.entries()) {
      if (span.segmentId !== orderedSegments[spanIndex]?.id) {
        throw new Error(`P7B replay ${key} segment spans must follow stable semantic order`);
      }
      if (!segmentIds.has(span.segmentId) || spans.has(span.segmentId)) {
        throw new Error(`P7B replay ${key} has an unknown or duplicate segment span: ${span.segmentId}`);
      }
      assertInteger(span.startNativeTick, `P7B replay ${key} start native boundary`, 0);
      assertInteger(span.endNativeTick, `P7B replay ${key} end native boundary`, 1);
      if (span.endNativeTick <= span.startNativeTick) {
        throw new Error(`P7B replay ${key} segment ${span.segmentId} has an empty or reversed boundary span`);
      }
      if (spanIndex === 0 && span.startNativeTick !== 0) {
        throw new Error(`P7B replay ${key} first segment must start at native boundary zero`);
      }
      if (span.endNativeTick > combination.terminalNativeTick) {
        throw new Error(`P7B replay ${key} segment ${span.segmentId} exceeds its terminal boundary`);
      }
      const hasStartDecision = span.startDecisionOrdinal !== undefined;
      const hasEndDecision = span.endDecisionOrdinal !== undefined;
      if (hasStartDecision !== hasEndDecision) {
        throw new Error(`P7B replay ${key} segment ${span.segmentId} must disclose both decision ordinals`);
      }
      if (hasStartDecision && hasEndDecision) {
        assertInteger(span.startDecisionOrdinal!, `P7B replay ${key} start decision ordinal`, 0);
        assertInteger(span.endDecisionOrdinal!, `P7B replay ${key} end decision ordinal`, 0);
        if (span.endDecisionOrdinal! < span.startDecisionOrdinal!) {
          throw new Error(`P7B replay ${key} segment ${span.segmentId} decision span is reversed`);
        }
      }
      if (combination.decisionProfile.clockBasis === "portable-decision" && !hasStartDecision) {
        throw new Error(`P7B portable replay ${key} must disclose decision ordinals for every segment`);
      }
      const previous = combination.segmentSpans[spanIndex - 1];
      if (previous !== undefined && previous.endNativeTick !== span.startNativeTick) {
        throw new Error(`P7B replay ${key} native segment spans must join exactly`);
      }
      if (
        previous?.endDecisionOrdinal !== undefined
        && span.startDecisionOrdinal !== undefined
        && previous.endDecisionOrdinal !== span.startDecisionOrdinal
      ) {
        throw new Error(`P7B replay ${key} decision segment spans must join exactly`);
      }
      spans.set(span.segmentId, span);
    }
    if (spans.size !== segmentIds.size) {
      throw new Error(`P7B replay ${key} must disclose a native span for every semantic segment`);
    }
    if (combination.segmentSpans.at(-1)!.endNativeTick !== combination.terminalNativeTick) {
      throw new Error(`P7B replay ${key} segment spans must end at its terminal boundary`);
    }
    if (
      combination.decisionProfile.clockBasis === "portable-decision"
      && combination.segmentSpans.at(-1)!.endDecisionOrdinal
        !== combination.executedDecisionCount
    ) {
      throw new Error(`P7B portable replay ${key} segment spans must end at its executed decision count`);
    }
  }

  for (const variant of model.variants) {
    for (const target of model.executionTargets) {
      const key = p7bReplayCombinationKey({ executionTarget: target.id, variant: variant.id });
      if (!combinations.has(key)) {
        throw new Error(`P7B replay matrix must show missing combination ${key}`);
      }
    }
  }
}

export function findP7bReplayCombination(
  model: P7bLevelReplayPresentation,
  selection: P7bReplaySelection,
): P7bReplayCombination {
  assertP7bLevelReplayPresentation(model);
  return model.combinations.find((candidate) => (
    candidate.variant === selection.variant
    && candidate.executionTarget === selection.executionTarget
  ))!;
}
