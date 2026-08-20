import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { describe, expect, it } from "vitest";
import { loadKeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import { buildKeyPyramidP5Execution } from "./buildKeyPyramidP5Execution";
import type { KeyPyramidP5ParentPlanV1 } from "./buildKeyPyramidP5Plan";
import { buildKeyPyramidP5Route } from "./buildKeyPyramidP5Route";
import { buildKeyPyramidP5PlanningAuthority } from "./buildP5ReviewOutputs";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const sha256 = new WebCryptoSha256();

async function loadParent(target: "ms" | "lynx"): Promise<KeyPyramidP5ParentPlanV1> {
  const path = `ccsolver/fixtures/golden/p3/cclp1-001/${target}/terminal-plan.json`;
  const bytes = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
  return {
    path,
    content: await referenceSourceBytes(bytes, sha256),
    packet: JSON.parse(new TextDecoder().decode(bytes)) as KeyPyramidP5ParentPlanV1["packet"],
  };
}

describe("P5 Key Pyramid continuous execution", () => {
  it.each(["ms", "lynx"] as const)(
    "wins one continuous %s replay and retains every exact subgoal boundary",
    async (target) => {
      const [source, parentP3] = await Promise.all([
        loadKeyPyramidRuntimeSource(repositoryRoot, target),
        loadParent(target),
      ]);
      const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
      const authority = await buildKeyPyramidP5PlanningAuthority({
        source,
        route,
        parentP3,
        sha256,
      });
      const execution = await buildKeyPyramidP5Execution(source, authority.planning, sha256);

      expect(execution.target).toBe(target);
      expect(execution.planning.plan).toEqual(authority.planning.planReference);
      expect(execution.replay.moves).toHaveLength(162);
      expect(execution.replay.modifierMasks).toEqual([]);
      expect(execution.replay.randomSeed).toBe(0);
      expect(execution.replay.bestTimeTicks).toBe(700);
      expect(execution.terminal).toMatchObject({
        kind: "won",
        coordinate: { x: 15, y: 7, z: 0 },
      });
      expect(execution.boundaries).toHaveLength(7);
      expect(execution.boundaries[0]).toMatchObject({
        boundaryKind: "initial",
        nativeTick: -1,
        coordinate: { x: 15, y: 19, z: 0 },
        remainingChips: 10,
      });
      expect(execution.boundaries.at(-1)).toMatchObject({
        boundaryKind: "subgoal-stop",
        subgoalId: "subgoal:key-pyramid:exit",
        coordinate: { x: 15, y: 7, z: 0 },
        remainingChips: 0,
        terminalKind: "won",
      });
      expect(execution.joins.every(({ state }) => state === "exact-same-run")).toBe(true);
      expect(execution.sourceAudit).toEqual({
        constructionMethod: "manual-assisted",
        routeDerivation: "checked-facts-resource-search",
        donorAvailability: "paired",
        donorExposure: "full-input",
        replayBytesCopied: false,
        replayInputReadByGenerator: false,
      });
    },
    300_000,
  );
});
