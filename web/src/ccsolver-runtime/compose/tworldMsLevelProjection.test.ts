import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canonicalizeJson } from "@tworld/ccsolver/domain";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";
import {
  MS_DIRECTION,
  MS_TILE,
  isMsCreature,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import {
  msElementFamilyRegistration,
  msRegisteredLevelDecodeEntries,
} from "@ruleset-ms/impl/elementRegistration";
import {
  normalizeDecodedTworldLevel,
  projectLoadedTworldMsLevel,
} from "./tworldMsLevelProjection";

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, "../../../../");

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileCodeForTile(tileId: number): number {
  const entry = msRegisteredLevelDecodeEntries.find((candidate) => candidate.tileId === tileId);
  if (!entry) {
    throw new Error(`test tile ${tileId} has no DAT registration`);
  }
  return entry.fileCode;
}

function twoPlaneFixture(topFileCode: number, bottomFileCode: number): Uint8Array {
  return Uint8Array.from([
    1, 0,
    0, 0,
    0, 0,
    0, 0,
    1, 0,
    topFileCode,
    1, 0,
    bottomFileCode,
    0, 0,
  ]);
}

function projectOneCell(topFileCode: number, bottomFileCode = fileCodeForTile(MS_TILE.Empty)) {
  const levelBytes = twoPlaneFixture(topFileCode, bottomFileCode);
  return projectLoadedTworldMsLevel({
    catalogRevision: "test-catalog-revision",
    containerBytes: levelBytes,
    loaded: { levelData: levelBytes, layerData: [levelBytes] },
  }).level;
}

describe("projectLoadedTworldMsLevel", () => {
  it("projects bundled intro level 8 with exact source material and static facts", async () => {
    const loaded = await new NodeLevelRepository(repoRoot).loadLevel({
      seriesFile: "intro-ms.dac",
      levelNumber: 8,
      ruleset: "MS",
    });
    const containerBytes = new Uint8Array(await readFile(resolve(repoRoot, "data/intro.dat")));

    const projected = projectLoadedTworldMsLevel({
      catalogRevision: "test-catalog-revision",
      containerBytes,
      loaded,
    });

    expect(projected.source.format).toBe("tworld-dat");
    expect(projected.source.containerBytes).not.toBe(containerBytes);
    expect(projected.source.containerBytes).toHaveLength(3_415);
    expect(sha256(projected.source.containerBytes)).toBe(
      "0f210063095b6981ea23f3a3a8371bed768892f0e9be28b081a16d9e62844aa6",
    );
    expect(projected.source.members).toHaveLength(1);
    expect(projected.source.members[0]).toMatchObject({ ordinal: 0, role: "level", z: 0 });
    expect(projected.source.members[0]!.bytes).not.toBe(loaded.layerData[0]);
    expect(projected.source.members[0]!.bytes).toHaveLength(499);
    expect(sha256(projected.source.members[0]!.bytes)).toBe(
      "afbf9dfb9e91d8d2f028b48af4775174e4097eadf5e93d9b358965a231151b7d",
    );

    expect(projected.level.geometry.layers).toEqual([
      { height: 32, sourceLevelNumber: 8, width: 32, z: 0 },
    ]);
    expect(projected.level.timeLimit).toEqual({ kind: "bounded", seconds: 500 });
    expect(projected.level.chipsRequired).toBe(0);
    expect(projected.level.actors.filter((actor) => actor.declaredSourceOrder !== null)).toHaveLength(6);
    expect(projected.level.actors).toHaveLength(8);
    expect(projected.level.actors.filter((actor) => actor.semanticType === "cc1:block")).toEqual(
      expect.arrayContaining([expect.objectContaining({ disposition: "active" })]),
    );

    expect(projected.level.wiring.filter((wire) => wire.kind === "trap").map((wire) => wire.sourceOrder)).toEqual([0, 1]);
    expect(projected.level.wiring.filter((wire) => wire.kind === "cloner").map((wire) => wire.sourceOrder)).toEqual([
      0,
      1,
      2,
      3,
    ]);
    expect(projected.level.wiring.every((wire) =>
      wire.source.placementKey !== null && wire.target.placementKey !== null,
    )).toBe(true);
    expect(projected.level.unknowns).toEqual([]);

    expect(projected.level.placements.some((placement) => placement.sourceToken === "ms:button_brown")).toBe(true);
    const buttons = projected.level.placements.filter((placement) => placement.sourceToken.startsWith("ms:button_"));
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((placement) => placement.stratum === "overlay")).toBe(true);
    expect(buttons.every((button) => projected.level.placements.some((placement) =>
      placement.coordinate.x === button.coordinate.x
      && placement.coordinate.y === button.coordinate.y
      && placement.coordinate.z === button.coordinate.z
      && placement.stratum === "terrain",
    ))).toBe(true);
    expect(projected.level.placements.some((placement) => placement.sourceToken === "ms:beartrap")).toBe(true);
    expect(projected.level.placements.some((placement) => placement.sourceToken === "ms:clonemachine")).toBe(true);
    expect(projected.level.placements.every((placement) => !placement.semanticType.startsWith("ms:"))).toBe(true);
    expect(projected.level.actors.every((actor) => !actor.semanticType.startsWith("ms:"))).toBe(true);
  });

  it("normalizes an actor on a lower-plane button with an explicit implicit floor", () => {
    const levelBytes = twoPlaneFixture(
      fileCodeForTile(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south)),
      fileCodeForTile(MS_TILE.Button_Brown),
    );
    const projected = projectLoadedTworldMsLevel({
      catalogRevision: "test-catalog-revision",
      containerBytes: levelBytes,
      loaded: { levelData: levelBytes, layerData: [levelBytes] },
    });

    expect(projected.level.placements.filter((placement) =>
      placement.coordinate.x === 0 && placement.coordinate.y === 0 && placement.coordinate.z === 0,
    ).map((placement) => ({
      semanticType: placement.semanticType,
      sourcePlane: placement.sourcePlane,
      sourceToken: placement.sourceToken,
      stratum: placement.stratum,
    }))).toEqual([
      {
        semanticType: "cc1:floor",
        sourcePlane: "implicit",
        sourceToken: "tworld:ruleset-ms/implicit-floor",
        stratum: "terrain",
      },
      {
        semanticType: "cc1:button-brown",
        sourcePlane: "lower",
        sourceToken: "ms:button_brown",
        stratum: "overlay",
      },
      {
        semanticType: "cc1:chip",
        sourcePlane: "upper",
        sourceToken: "ms:chip",
        stratum: "actor",
      },
    ]);
  });

  it("projects representative resource, transport, forced, hazard, and unknown semantics", () => {
    const redKey = projectOneCell(fileCodeForTile(MS_TILE.Key_Red));
    expect(redKey.placements.find((placement) => placement.semanticType === "cc1:key-red")?.resourceSource).toEqual({
      amount: 1,
      resourceType: "cc1:key-red",
    });

    const redDoor = projectOneCell(fileCodeForTile(MS_TILE.Door_Red));
    expect(redDoor.placements.find((placement) => placement.semanticType === "cc1:door-red")?.resourceGate).toEqual({
      amount: 1,
      kind: "consume",
      resourceType: "cc1:key-red",
    });

    const greenDoor = projectOneCell(fileCodeForTile(MS_TILE.Door_Green));
    expect(greenDoor.placements.find((placement) => placement.semanticType === "cc1:door-green")?.resourceGate).toEqual({
      amount: 1,
      kind: "possess",
      resourceType: "cc1:key-green",
    });

    const teleport = projectOneCell(fileCodeForTile(MS_TILE.Teleport));
    expect(teleport.placements.find((placement) => placement.semanticType === "cc1:teleport")?.transport).toEqual({
      kind: "cc1:teleport",
      routingPolicy: "reverse-reading-order-cyclic",
    });

    const force = projectOneCell(fileCodeForTile(MS_TILE.Slide_North));
    expect(force.placements.find((placement) => placement.semanticType === "cc1:slide-north")?.forcedSurface).toEqual({
      direction: "north",
      motion: "force",
      turn: null,
    });

    const water = projectOneCell(fileCodeForTile(MS_TILE.Water));
    expect(water.placements.find((placement) => placement.semanticType === "cc1:water")?.hazard).toEqual({
      hazardType: "cc1:water",
      persistence: "persistent",
      protectionResources: ["cc1:boots-water"],
    });

    const unknown = projectOneCell(0xfe);
    expect(unknown.placements).toEqual(expect.arrayContaining([
      expect.objectContaining({
        interpretation: "unknown",
        semanticType: "cc1:unknown-0xfe",
        sourceToken: "0xfe",
      }),
    ]));
    expect(unknown.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unknown-catalog-element", sourceToken: "0xfe" }),
    ]));

    const petCarrier = projectOneCell(
      fileCodeForTile(MS_TILE.PetCarrier),
      fileCodeForTile(msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east)),
    );
    expect(petCarrier.actors).toEqual([
      expect.objectContaining({ disposition: "contained", semanticType: "cc1:ball" }),
    ]);
  });

  it("rejects loaded bytes that are not part of the claimed source chain", () => {
    const levelBytes = twoPlaneFixture(
      fileCodeForTile(MS_TILE.Exit),
      fileCodeForTile(MS_TILE.Empty),
    );
    const differentBytes = new Uint8Array(levelBytes);
    differentBytes[0] = (differentBytes[0] ?? 0) + 1;

    expect(() => projectLoadedTworldMsLevel({
      catalogRevision: "test-catalog-revision",
      containerBytes: levelBytes,
      loaded: { levelData: differentBytes, layerData: [levelBytes] },
    })).toThrow(/primary level bytes/u);

    expect(() => projectLoadedTworldMsLevel({
      catalogRevision: "test-catalog-revision",
      containerBytes: differentBytes,
      loaded: { levelData: levelBytes, layerData: [levelBytes] },
    })).toThrow(/not present in its source container/u);
  });

  it("keeps normalized gameplay identity independent of target-fact catalog metadata", async () => {
    const loaded = await new NodeLevelRepository(repoRoot).loadLevel({
      seriesFile: "intro-ms.dac",
      levelNumber: 8,
      ruleset: "MS",
    });
    const containerBytes = new Uint8Array(await readFile(resolve(repoRoot, "data/intro.dat")));
    const first = projectLoadedTworldMsLevel({
      catalogRevision: "target-facts-a",
      containerBytes,
      loaded,
    });
    const second = projectLoadedTworldMsLevel({
      catalogRevision: "target-facts-b",
      containerBytes,
      loaded,
    });

    expect(canonicalizeJson(second.normalizedMap)).toBe(canonicalizeJson(first.normalizedMap));
    expect(second.level.placements[0]?.catalogRevision).not.toBe(
      first.level.placements[0]?.catalogRevision,
    );
  });

  it("excludes display metadata but includes gameplay changes in normalized identity", async () => {
    const loaded = await new NodeLevelRepository(repoRoot).loadLevel({
      seriesFile: "intro-ms.dac",
      levelNumber: 8,
      ruleset: "MS",
    });
    const decoded = msElementFamilyRegistration.levelLoadRegistration.decodeLoadedLevel(loaded);
    const baseline = canonicalizeJson(normalizeDecodedTworldLevel(decoded));

    const displayOnly = structuredClone(decoded);
    displayOnly.hintText = "a different display-only hint";
    for (const layer of displayOnly.layers ?? []) {
      layer.hintText = "a different layer hint";
    }
    expect(canonicalizeJson(normalizeDecodedTworldLevel(displayOnly))).toBe(baseline);

    const changedTime = structuredClone(decoded);
    changedTime.timeLimitSeconds += 1;
    expect(canonicalizeJson(normalizeDecodedTworldLevel(changedTime))).not.toBe(baseline);

    const changedCell = structuredClone(decoded);
    const firstCell = changedCell.layers?.[0]?.cells[0] ?? changedCell.cells[0];
    if (firstCell === undefined) throw new Error("fixture has no first cell");
    firstCell.top.id = firstCell.top.id === MS_TILE.Wall ? MS_TILE.Empty : MS_TILE.Wall;
    expect(canonicalizeJson(normalizeDecodedTworldLevel(changedCell))).not.toBe(baseline);

    const changedActorOrder = structuredClone(decoded);
    const actorOrder = changedActorOrder.layers?.[0]?.creaturePositions
      ?? changedActorOrder.creaturePositions;
    actorOrder.reverse();
    expect(canonicalizeJson(normalizeDecodedTworldLevel(changedActorOrder))).not.toBe(baseline);

    const changedFacing = structuredClone(decoded);
    const facingCell = (changedFacing.layers?.flatMap((layer) => layer.cells)
      ?? changedFacing.cells).find((candidate) => isMsCreature(candidate.top.id));
    if (facingCell === undefined) throw new Error("fixture has no directional actor");
    const originalDirection = msCreatureDir(facingCell.top.id);
    facingCell.top.id = msCreatureTile(
      msCreatureId(facingCell.top.id),
      originalDirection === MS_DIRECTION.north ? MS_DIRECTION.east : MS_DIRECTION.north,
    );
    expect(canonicalizeJson(normalizeDecodedTworldLevel(changedFacing))).not.toBe(baseline);
  });
});
