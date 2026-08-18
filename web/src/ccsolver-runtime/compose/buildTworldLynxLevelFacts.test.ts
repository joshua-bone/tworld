import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { encodeArtifact } from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import { buildTworldMsLevelFacts } from "./buildTworldMsLevelFacts";
import { buildTworldLynxLevelFacts } from "./buildTworldLynxLevelFacts";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../");
const sha256 = new WebCryptoSha256();

describe("buildTworldLynxLevelFacts", () => {
  it("builds deterministic Lynx facts while retaining the shared normalized map identity", async () => {
    const repository = new NodeLevelRepository(repositoryRoot);
    const [msLoaded, lynxLoaded, container] = await Promise.all([
      repository.loadLevel({ seriesFile: "intro-ms.dac", levelNumber: 8, ruleset: "MS" }),
      repository.loadLevel({ seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" }),
      readFile(resolve(repositoryRoot, "data/intro.dat")),
    ]);
    const containerBytes = new Uint8Array(container);
    const common = {
      occurrenceId: "tworld:intro:8",
      producerRevision: "test:producer",
      repository: "tworld",
      repositoryRevision: "git:test-source",
      sourcePath: "data/intro.dat",
      adapterRevision: "test:adapter",
      importProfileRevision: "test:import-profile",
      analyzerRevision: "test:facts-analyzer",
      catalogRevision: "test:catalog",
      containerBytes,
    } as const;
    const [ms, first, second] = await Promise.all([
      buildTworldMsLevelFacts({ ...common, loaded: msLoaded }, sha256),
      buildTworldLynxLevelFacts({ ...common, loaded: lynxLoaded }, sha256),
      buildTworldLynxLevelFacts({ ...common, loaded: lynxLoaded }, sha256),
    ]);

    expect(encodeArtifact(second.facts)).toBe(encodeArtifact(first.facts));
    expect(first.facts.payload.target).toBe("lynx");
    expect(first.facts.payload.level.normalizedGameplayDigest).toBe(
      ms.facts.payload.level.normalizedGameplayDigest,
    );
    expect(first.normalizedMap).toBe(ms.normalizedMap);
    expect(first.sourceBytes).toEqual(ms.sourceBytes);
    expect(first.facts.payload.placements.map((placement) => placement.placementId)).toEqual(
      ms.facts.payload.placements.map((placement) => placement.placementId),
    );
    expect(first.facts.payload.actors.map((actor) => actor.actorId)).toEqual(
      ms.facts.payload.actors.map((actor) => actor.actorId),
    );
    expect(first.facts.payload.wiring.map((wire) => wire.wiringId)).toEqual(
      ms.facts.payload.wiring.map((wire) => wire.wiringId),
    );
    expect(first.facts.payload.placements.every((placement) => (
      placement.sourceElement.catalogId === "tworld:ruleset-lynx"
      && (
        placement.sourceElement.elementToken.startsWith("lynx:")
        || placement.sourceElement.elementToken === "tworld:ruleset-lynx/implicit-floor"
      )
    ))).toBe(true);
  });
});
