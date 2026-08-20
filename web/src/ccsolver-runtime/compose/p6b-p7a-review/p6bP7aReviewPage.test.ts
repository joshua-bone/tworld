import { describe, expect, it } from "vitest";
import {
  renderP6bP7aReviewPage,
  type P6bP7aReviewPageModel,
} from "./p6bP7aReviewPage";

function model(): P6bP7aReviewPageModel {
  const target = (value: "ms" | "lynx") => ({
    target: value,
    label: value === "ms" ? "MS" as const : "Lynx" as const,
    mapSvg: `<svg aria-label="${value} game artwork"><text>1</text></svg>`,
    tactics: [
      { order: 0, kind: "Reach" as const, title: "Reach the key corridor", decisionCount: 1, nativeTicks: 4, result: "succeeded" as const },
      { order: 1, kind: "Collect" as const, title: "Collect the red key", decisionCount: 1, nativeTicks: 4, result: "succeeded" as const },
      { order: 2, kind: "WaitUntil" as const, title: "Wait for control", decisionCount: 3, nativeTicks: 3, result: "succeeded" as const },
      { order: 3, kind: "Unlock" as const, title: "Open the red door", decisionCount: 2, nativeTicks: 8, result: "succeeded" as const },
    ],
    totalDecisions: 7,
    totalNativeTicks: 19,
    terminalNativeTick: 19,
    replayCertified: true as const,
    checkpointRestoreVerified: true as const,
    failureRepair: {
      injectedAtDecision: 2,
      injectedDirection: "north",
      failure: "The player did not advance toward the semantic destination.",
      retainedPrefixDecisions: 2,
      replacedSuffixDecisions: 5,
      repairedSuffixDecisions: 5,
      result: "won" as const,
    },
    exhaustion: {
      code: "tick-budget",
      attemptedBranches: 4,
      advanceCalls: 4,
      repeatedExactly: true as const,
      firstUnmet: "The requested destination remained out of reach.",
    },
  });
  return {
    title: "From intent to inputs",
    fixtureTitle: "Phase-A key and door",
    fixtureRows: ["P.k.D.E"],
    targets: [target("ms"), target("lynx")],
    canaries: [
      { title: "Different timing", relationship: "shared-plan-different-timing", confidence: "high", source: "synthetic", reviewStatus: "unreviewed", unresolvedGaps: [] },
      { title: "Different local route", relationship: "shared-subgoal-different-local-route", confidence: "high", source: "synthetic", reviewStatus: "unreviewed", unresolvedGaps: [] },
      { title: "Proven rejoin", relationship: "alternative-branches-proven-rejoin", confidence: "high", source: "synthetic", reviewStatus: "unreviewed", unresolvedGaps: [] },
      { title: "Two Sets of Rules", relationship: "genuinely-different-plan", confidence: "low", source: "corpus", reviewStatus: "unreviewed", unresolvedGaps: ["Independent causal evidence is still missing."] },
    ],
  };
}

describe("P6B/P7A human review page", () => {
  it("leads with the semantic solution and provides accessible target tabs", () => {
    const html = renderP6bP7aReviewPage(model());
    expect(html.indexOf("One semantic recipe")).toBeLessThan(html.indexOf("Bounded classification canaries"));
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-controls="target-ms"');
    expect(html).toContain('aria-controls="target-lynx"');
    expect(html).toContain("ArrowLeft");
    expect(html).toContain("ArrowRight");
    expect(html).toContain('id="target-lynx" role="tabpanel" aria-labelledby="tab-lynx"');
    expect(html).not.toContain('id="target-lynx" role="tabpanel" aria-labelledby="tab-lynx" hidden');
    expect(html).toContain("activate(tabs.find");
  });

  it("uses the full viewport, system typography, progressive disclosure, and authentic artwork slots", () => {
    const html = renderP6bP7aReviewPage(model());
    expect(html).toMatch(/\.shell\{width:100%;max-width:none/u);
    expect(html).toContain('font-family:system-ui,-apple-system');
    expect(html).toMatch(/\.level-map svg\{display:block;width:100%;min-width:0/u);
    expect(html).not.toMatch(/\.level-map svg\{[^}]*min-width:(?:30|38)rem/u);
    expect(html).toContain("See the injected failure and repaired suffix");
    expect(html).toContain("See the bounded exhaustion proof");
    expect(html).toContain("Repeated exactly");
    expect(html).toContain("tick budget");
    expect(html).toContain("Alternative branches with a proven semantic gameplay rejoin");
    expect(html).not.toContain("alternative branches proven rejoin");
    expect(html).toContain("Exact proof and machine-readable downloads");
    expect(html).toContain('aria-label="ms game artwork"');
    expect(html).toContain('aria-label="lynx game artwork"');
    expect(html).toContain("Numbered marks show the sequence of tiles visited");
    expect(html).not.toContain("input-influence decisions");
    expect(html).not.toContain("zoom");
  });

  it("keeps machine identities and digests off the primary human surface", () => {
    const html = renderP6bP7aReviewPage(model());
    expect(html).not.toMatch(/sha256:|placement:sha256:|actor:sha256:|\/Users\//u);
    expect(html).toContain("Machine identities and content digests remain in the artifact");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
  });
});
