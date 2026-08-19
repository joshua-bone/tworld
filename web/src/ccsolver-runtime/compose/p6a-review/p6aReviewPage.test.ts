import { describe, expect, it } from "vitest";
import {
  renderP6aReviewPage,
  type P6aReviewPageModel,
} from "./p6aReviewPage";

function reviewModel(): P6aReviewPageModel {
  let milestoneOrder = 0;
  const subgoals = [5, 5, 5, 5, 5, 4].map((count, subgoalOrder) => ({
    subgoalOrder,
    title: `Human subgoal ${subgoalOrder + 1}`,
    description: "A concise semantic route group.",
    milestones: Array.from({ length: count }, () => {
      const order = milestoneOrder;
      milestoneOrder += 1;
      return {
        milestoneOrder: order,
        label: `Human milestone ${order + 1}`,
        kind: order === 28 ? "reach-exit" : "collect-chip",
        coordinate: { x: order % 32, y: Math.floor(order / 2), z: 0 },
        ms: { nativeTick: order * 4, sequence: order, attributed: true },
        lynx: { nativeTick: order * 4 + 3, sequence: order, attributed: true },
      };
    }),
  }));
  return {
    subgoals,
    milestoneCount: 29,
    matchedHardAnchors: 29,
    nativeTimingDifferences: 29,
    attributionGapCount: 0,
    alignmentStatus: "aligned",
    strategyLabel: "shared plan",
    strategyResolution: "partially verified",
    msEventCount: 500,
    lynxEventCount: 520,
  };
}

describe("P6A causal-alignment review page", () => {
  it("is compact, progressively disclosed, readable, and free of raw identities", () => {
    const page = renderP6aReviewPage(reviewModel());

    expect(page).toContain("Key Pyramid causal alignment");
    expect(page).toContain("Back to the whole-level dossier");
    expect(page).toContain("29 semantic milestones");
    expect(page).toContain("6 subgoals");
    expect(page).toContain("MS tick");
    expect(page).toContain("Lynx tick");
    expect(page).toContain("command linked");
    expect(page).toContain("Each tick card visibly labels");
    expect(page).toContain("Download machine evidence");
    expect((page.match(/<details class="subgoal"/gu) ?? [])).toHaveLength(6);
    expect((page.match(/class="milestone"/gu) ?? [])).toHaveLength(29);
    expect(page).toContain('<details class="subgoal" open>');
    expect(page).not.toContain("sha256:");
    expect(page).not.toContain("placement:");
    expect(page).not.toContain("Cooper");
    expect(page).not.toContain("Hover a tick card");
    expect(page).not.toContain(" title=");
  });
});
