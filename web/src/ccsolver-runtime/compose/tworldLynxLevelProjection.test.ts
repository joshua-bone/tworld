import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { projectLoadedTworldMsLevel } from "./tworldMsLevelProjection";
import { projectLoadedTworldLynxLevel } from "./tworldLynxLevelProjection";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../");

describe("projectLoadedTworldLynxLevel", () => {
  it("projects the same Intro 8 source identity independently through the Lynx catalog", async () => {
    const repository = new NodeLevelRepository(repositoryRoot);
    const [msLoaded, lynxLoaded, container] = await Promise.all([
      repository.loadLevel({
        seriesFile: "intro-ms.dac",
        levelNumber: 8,
        ruleset: "MS",
      }),
      repository.loadLevel({
        seriesFile: "intro-lynx.dac",
        levelNumber: 8,
        ruleset: "Lynx",
      }),
      readFile(resolve(repositoryRoot, "data/intro.dat")),
    ]);
    const containerBytes = new Uint8Array(container);
    const ms = projectLoadedTworldMsLevel({
      catalogRevision: "test:ms-catalog",
      containerBytes,
      loaded: msLoaded,
    });
    const lynx = projectLoadedTworldLynxLevel({
      catalogRevision: "test:lynx-catalog",
      containerBytes,
      loaded: lynxLoaded,
    });

    expect(canonicalizeJson(lynx.normalizedMap)).toBe(canonicalizeJson(ms.normalizedMap));
    expect(lynx.source).toEqual(ms.source);
    expect(lynx.level.target).toBe("lynx");
    expect(lynx.level.geometry).toEqual(ms.level.geometry);
    expect(lynx.level.actors.map((actor) => ({
      coordinate: actor.coordinate,
      disposition: actor.disposition,
      facing: actor.facing,
      semanticType: actor.semanticType,
      sourceActorOrder: actor.sourceActorOrder,
    }))).toEqual(ms.level.actors.map((actor) => ({
      coordinate: actor.coordinate,
      disposition: actor.disposition,
      facing: actor.facing,
      semanticType: actor.semanticType,
      sourceActorOrder: actor.sourceActorOrder,
    })));
    expect(lynx.level.placements.some((placement) => (
      placement.sourceToken === "lynx:clonemachine"
    ))).toBe(true);
    expect(lynx.level.placements.every((placement) => (
      placement.catalogId === "tworld:ruleset-lynx"
      && !placement.semanticType.startsWith("lynx:")
    ))).toBe(true);
    expect(lynx.level.unknowns).toEqual([]);
  });
});
