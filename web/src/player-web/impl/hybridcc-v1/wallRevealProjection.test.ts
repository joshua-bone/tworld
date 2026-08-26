import { describe, expect, it } from "vitest";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  HYBRID_CC_V1_ELEMENT,
  HYBRID_CC_V1_EVENT,
  HYBRID_CC_V1_INTERACTION,
  HYBRID_CC_V1_RULE,
} from "./engineFacts";
import { testElement, testEvent, testSnapshot } from "./testFacts";
import {
  HYBRID_CC_V1_WALL_REVEAL_SAMPLE_COUNT,
  activeHybridCcV1WallReveals,
  collectHybridCcV1WallReveals,
  projectHybridCcV1WallReveals,
  reconcileHybridCcV1WallReveals,
} from "./wallRevealProjection";

function revealSnapshot(boundary: bigint) {
  return testSnapshot({
    events: [testEvent({
      kind: HYBRID_CC_V1_EVENT.interaction,
      interaction: HYBRID_CC_V1_INTERACTION.reveal,
      actorKind: HYBRID_CC_V1_ELEMENT.player,
      logicBoundary: boundary,
      destination: { x: 3, y: 2, z: 0 },
      subject: testElement({
        id: HYBRID_CC_V1_ELEMENT.trickWall,
        rule: HYBRID_CC_V1_RULE.permanentlyInvisible,
      }),
    })],
  });
}

describe("Hybrid v1 permanent invisible-wall reveal projection", () => {
  it("keeps the effect for ten 20 Hz samples without mutating the engine cell", () => {
    const snapshot = revealSnapshot(2n);
    const originalTerrain = snapshot.cells[0]!.terrain;
    const tracks = collectHybridCcV1WallReveals(snapshot);

    expect(HYBRID_CC_V1_WALL_REVEAL_SAMPLE_COUNT).toBe(10);
    expect(activeHybridCcV1WallReveals(tracks, 4)).toHaveLength(1);
    expect(activeHybridCcV1WallReveals(tracks, 13)).toHaveLength(1);
    expect(activeHybridCcV1WallReveals(tracks, 14)).toEqual([]);
    expect(snapshot.cells[0]!.terrain).toBe(originalTerrain);
  });

  it("projects the existing wall-reveal overlay as mandatory Hybrid feedback", () => {
    const overlays = projectHybridCcV1WallReveals(
      collectHybridCcV1WallReveals(revealSnapshot(2n)),
      4,
      32,
    );

    expect(overlays).toEqual([{
      z: 0,
      pos: 67,
      kind: "hidden-wall-reveal",
      render: {
        mode: "tile",
        tileId: MS_TILE.Wall,
      },
    }]);
  });

  it("refreshes one position's expiry when the wall is pressed again", () => {
    const original = collectHybridCcV1WallReveals(revealSnapshot(2n));
    const refreshed = reconcileHybridCcV1WallReveals(original, revealSnapshot(6n));

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.startPresentationSample).toBe(12);
    expect(activeHybridCcV1WallReveals(refreshed, 21)).toHaveLength(1);
    expect(activeHybridCcV1WallReveals(refreshed, 22)).toEqual([]);
  });
});
