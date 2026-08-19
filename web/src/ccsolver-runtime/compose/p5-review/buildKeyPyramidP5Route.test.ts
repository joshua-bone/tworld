import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadKeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import { buildKeyPyramidP5Route } from "./buildKeyPyramidP5Route";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

describe("P5 Key Pyramid reviewed route", () => {
  it.each(["ms", "lynx"] as const)(
    "derives the same complete %s route from checked facts without donor replay input",
    async (target) => {
      const source = await loadKeyPyramidRuntimeSource(repositoryRoot, target);
      const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);

      expect(route.derivation).toBe("checked-facts-resource-search");
      expect(route.tileSteps).toHaveLength(162);
      expect(route.events.filter(({ kind }) => kind === "collect-chip")).toHaveLength(10);
      expect(new Set(
        route.events
          .filter(({ kind }) => kind === "collect-chip")
          .map(({ placementId }) => placementId),
      ).size).toBe(10);
      expect(route.events.at(-2)).toMatchObject({
        kind: "open-socket",
        coordinate: { x: 15, y: 8, z: 0 },
      });
      expect(route.events.at(-1)).toMatchObject({
        kind: "reach-exit",
        coordinate: { x: 15, y: 7, z: 0 },
      });
      expect(route.finalState).toMatchObject({
        coordinate: { x: 15, y: 7, z: 0 },
        remainingChips: 0,
      });
      expect(JSON.stringify(route)).not.toMatch(/donor|\.tws|save\//i);
    },
    30_000,
  );

  it("uses six reviewable subgoals that cover every route step exactly once", async () => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, "ms");
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);

    expect(route.subgoals.map(({ subgoalId, firstStepOrder, lastStepOrder }) => ({
      subgoalId,
      firstStepOrder,
      lastStepOrder,
    }))).toEqual([
      { subgoalId: "subgoal:key-pyramid:collect-west", firstStepOrder: 0, lastStepOrder: 28 },
      { subgoalId: "subgoal:key-pyramid:collect-east", firstStepOrder: 29, lastStepOrder: 58 },
      { subgoalId: "subgoal:key-pyramid:recover-west-red", firstStepOrder: 59, lastStepOrder: 86 },
      { subgoalId: "subgoal:key-pyramid:collect-lower-east", firstStepOrder: 87, lastStepOrder: 128 },
      { subgoalId: "subgoal:key-pyramid:collect-summit", firstStepOrder: 129, lastStepOrder: 158 },
      { subgoalId: "subgoal:key-pyramid:exit", firstStepOrder: 159, lastStepOrder: 161 },
    ]);
  }, 30_000);
});
