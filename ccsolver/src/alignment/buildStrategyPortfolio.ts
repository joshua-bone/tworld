import type { RulesetTargetV1, StableIdV1 } from "../domain/artifacts/types.js";
import type {
  BuildStrategyPortfolioInputV1,
  SemanticAlignmentSpanV1,
  StrategyDependencyV1,
  StrategyFamilyV1,
  StrategyPlanShapeV1,
  StrategyPortfolioV1,
  StrategyResolutionV1,
} from "./model.js";

const STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:-]{0,126}[a-z0-9])?$/u;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function stableId(value: unknown, path: string): StableIdV1 {
  if (typeof value !== "string" || !STABLE_ID_PATTERN.test(value)) {
    throw new TypeError(`${path}: expected a protocol StableId of at most 128 lowercase ASCII characters`);
  }
  return value;
}

function targetOrder(left: RulesetTargetV1, right: RulesetTargetV1): number {
  return left === right ? 0 : left === "ms" ? -1 : 1;
}

function containsMediumImplementationDifference(spans: readonly SemanticAlignmentSpanV1[]): boolean {
  return spans.some((span) => (
    span.spanKind === "unmatched"
      ? span.strongestAnchor === "medium"
      : span.spanKind === "divergent" && span.anchorStrength !== "hard"
  ));
}

function containsCausalDisagreement(spans: readonly SemanticAlignmentSpanV1[]): boolean {
  return spans.some((span) => span.spanKind === "divergent" && (
    span.reason === "causal-parent-mismatch"
    || span.reason === "plan-identity-mismatch"
    || span.anchorStrength === "hard"
  ));
}

function hasMatchedHardCausalContext(spans: readonly SemanticAlignmentSpanV1[]): boolean {
  return spans.some((span) => (
    span.spanKind === "matched"
    && span.anchorStrength === "hard"
    && span.basis.includes("causal-context")
  ));
}

function hasHardRejoinAfterUnmatched(spans: readonly SemanticAlignmentSpanV1[]): boolean {
  for (let index = 0; index < spans.length; index += 1) {
    const span = spans[index];
    if (
      span?.spanKind === "unmatched"
      && span.events.some((event) => event.anchorStrength === "hard")
      && spans.slice(index + 1).some(
        (later) => later.spanKind === "matched" && later.anchorStrength === "hard",
      )
    ) {
      return true;
    }
  }
  return false;
}

function classifyShape(input: BuildStrategyPortfolioInputV1): {
  readonly planShape: StrategyPlanShapeV1;
  readonly resolution: StrategyResolutionV1;
  readonly reason: StrategyFamilyV1["resolutionReason"];
} {
  const { alignment } = input;
  const hasCausalEvidence = hasMatchedHardCausalContext(alignment.spans);
  if (containsCausalDisagreement(alignment.spans)) {
    return {
      planShape: "different-plan",
      resolution: "unresolved",
      reason: "causal-plan-disagreement",
    };
  }
  if (alignment.summary.unmatchedHardAnchors > 0) {
    if (hasHardRejoinAfterUnmatched(alignment.spans)) {
      return {
        planShape: "alternative-branch",
        resolution: alignment.summary.terminalAnchorsMatched
          ? hasCausalEvidence ? "partially-verified" : "proposed"
          : "unresolved",
        reason: "divergent-span-with-rejoin",
      };
    }
    return {
      planShape: "different-plan",
      resolution: "unresolved",
      reason: "causal-plan-disagreement",
    };
  }
  if (!alignment.summary.terminalAnchorsMatched) {
    return {
      planShape: containsMediumImplementationDifference(alignment.spans)
        ? "parallel-implementation"
        : "shared-plan",
      resolution: "unresolved",
      reason: "insufficient-terminal-evidence",
    };
  }
  if (containsMediumImplementationDifference(alignment.spans)) {
    return {
      planShape: "parallel-implementation",
      resolution: hasCausalEvidence ? "partially-verified" : "proposed",
      reason: "localized-target-implementation",
    };
  }
  return {
    planShape: "shared-plan",
    resolution: hasCausalEvidence ? "partially-verified" : "proposed",
    reason: hasCausalEvidence
      ? "aligned-causal-terminals"
      : "aligned-semantic-terminals-with-limited-causal-authority",
  };
}

function normalizeDependencies(
  dependencies: readonly StrategyDependencyV1[],
): readonly StrategyDependencyV1[] {
  const seen = new Set<string>();
  return dependencies.map((dependency, index) => {
    const dependencyId = stableId(dependency.dependencyId, `/dependencies/${index}/dependencyId`);
    if (seen.has(dependencyId)) {
      throw new TypeError(`/dependencies/${index}/dependencyId: duplicate dependency`);
    }
    seen.add(dependencyId);
    const targetRulesets = [...new Set(dependency.targetRulesets)].sort(targetOrder);
    const evidenceIds = [...new Set(dependency.evidenceIds.map(
      (evidenceId, evidenceIndex) => stableId(
        evidenceId,
        `/dependencies/${index}/evidenceIds/${evidenceIndex}`,
      ),
    ))].sort(compareText);
    return {
      ...dependency,
      dependencyId,
      targetRulesets,
      evidenceIds,
    };
  }).sort((left, right) => compareText(left.dependencyId, right.dependencyId));
}

function terminalReached(
  spans: readonly SemanticAlignmentSpanV1[],
  side: "left" | "right",
): boolean {
  return spans.some((span) => {
    if (span.spanKind === "matched" || span.spanKind === "divergent") {
      return span[side].some((event) => event.kind === "terminal-reached");
    }
    return span.side === side && span.events.some((event) => event.kind === "terminal-reached");
  });
}

export function buildStrategyPortfolio(
  input: BuildStrategyPortfolioInputV1,
): StrategyPortfolioV1 {
  if (input.portfolioVersion !== 1) {
    throw new TypeError("/portfolioVersion: expected 1");
  }
  const portfolioId = stableId(input.portfolioId, "/portfolioId");
  const familyId = stableId(input.familyId, "/familyId");
  if (typeof input.title !== "string" || input.title.length === 0 || input.title.length > 200) {
    throw new TypeError("/title: expected 1 through 200 characters");
  }
  if (input.alignment.leftTarget === input.alignment.rightTarget) {
    throw new TypeError("/alignment/rightTarget: expected a distinct target");
  }

  const classification = classifyShape(input);
  const targetEvidence = [
    {
      target: input.alignment.leftTarget,
      traceEvidenceId: stableId(
        input.traceEvidence[input.alignment.leftTarget],
        `/traceEvidence/${input.alignment.leftTarget}`,
      ),
      terminalReached: terminalReached(input.alignment.spans, "left"),
    },
    {
      target: input.alignment.rightTarget,
      traceEvidenceId: stableId(
        input.traceEvidence[input.alignment.rightTarget],
        `/traceEvidence/${input.alignment.rightTarget}`,
      ),
      terminalReached: terminalReached(input.alignment.spans, "right"),
    },
  ].sort((left, right) => targetOrder(left.target, right.target));

  const family: StrategyFamilyV1 = {
    familyId,
    title: input.title,
    planShape: classification.planShape,
    targetRulesets: targetEvidence.map(({ target }) => target),
    targetEvidence,
    dependencies: normalizeDependencies(input.dependencies ?? []),
    resolution: classification.resolution,
    resolutionReason: classification.reason,
    alignment: input.alignment,
  };
  return {
    portfolioVersion: 1,
    portfolioId,
    familiesOrder: "family-id",
    families: [family],
    preferredFamilyId: family.resolution === "unresolved" || family.resolution === "unsupported"
      ? null
      : family.familyId,
  };
}
