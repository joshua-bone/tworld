import { describe, expect, it } from "vitest";
import {
  projectDecodedLegacyLevel,
  type LegacyElementCatalogProjection,
  type ProjectedCatalogElement,
} from "./decodedLegacyLevelProjection";

const catalogEntries = new Map<number, ProjectedCatalogElement>([
  [
    0,
    {
      facing: null,
      interpretation: "known",
      redundantEmptyFloor: true,
      semanticType: "cc1:floor",
      sourceToken: "fixture:floor",
      stratum: "terrain",
    },
  ],
  [
    1,
    {
      actor: { disposition: "active", semanticType: "cc1:chip" },
      facing: "east",
      interpretation: "known",
      semanticType: "cc1:chip",
      sourceToken: "fixture:chip",
      stratum: "actor",
    },
  ],
  [
    2,
    {
      actor: { disposition: "active", semanticType: "cc1:bug" },
      facing: "north",
      interpretation: "known",
      semanticType: "cc1:bug",
      sourceToken: "fixture:bug",
      stratum: "actor",
    },
  ],
  [
    3,
    {
      facing: null,
      interpretation: "known",
      semanticType: "cc1:brown-button",
      sourceToken: "fixture:brown-button",
      stratum: "terrain",
      wiringRoles: [{ kind: "trap", role: "source" }],
    },
  ],
  [
    4,
    {
      facing: null,
      interpretation: "known",
      semanticType: "cc1:beartrap",
      sourceToken: "fixture:beartrap",
      stratum: "terrain",
      wiringRoles: [{ kind: "trap", role: "target" }],
    },
  ],
  [
    5,
    {
      exit: true,
      facing: null,
      interpretation: "known",
      semanticType: "cc1:exit",
      sourceToken: "fixture:exit",
      stratum: "terrain",
    },
  ],
  [
    6,
    {
      facing: null,
      interpretation: "known",
      resourceSource: { amount: 1, resourceType: "cc1:chip" },
      semanticType: "cc1:computer-chip",
      sourceToken: "fixture:computer-chip",
      stratum: "pickup",
    },
  ],
  [
    7,
    {
      facing: null,
      interpretation: "known",
      semanticType: "cc1:cloner",
      sourceToken: "fixture:cloner",
      stratum: "terrain",
      containsActors: true,
      wiringRoles: [{ kind: "cloner", role: "target" }],
    },
  ],
]);

const catalog: LegacyElementCatalogProjection = {
  catalogId: "fixture-catalog",
  catalogRevision: "fixture-v1",
  implicitTerrain: catalogEntries.get(0)!,
  project(elementId) {
    return catalogEntries.get(elementId) ?? null;
  },
};

function cell(pos: number, z: number, topId: number, bottomId = 0) {
  return {
    position: { x: pos % 3, y: Math.floor(pos / 3), z, pos },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

describe("projectDecodedLegacyLevel", () => {
  it("normalizes z, preserves bottom-to-top elements, wiring, and complete actor order", () => {
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 3,
      height: 1,
      catalog,
      decoded: {
        number: 7,
        timeLimitSeconds: 12,
        chipsNeeded: 3,
        badTiles: true,
        layers: [
          {
            z: 1,
            number: 7,
            cells: [cell(0, 1, 1), cell(1, 1, 2), cell(2, 1, 3)],
            creaturePositions: [1],
            traps: [{ from: 2, fromZ: 1, to: 1, toZ: 2 }],
            cloners: [],
          },
          {
            z: 2,
            number: 8,
            cells: [cell(0, 2, 2), cell(1, 2, 4), cell(2, 2, 99)],
            creaturePositions: [0],
            traps: [],
            cloners: [],
            unknownElements: [
              { elementToken: "0xff", plane: "upper", pos: 2 },
            ],
          },
        ],
      },
    });

    expect(projected.geometry.layers).toEqual([
      { height: 1, sourceLevelNumber: 7, width: 3, z: 0 },
      { height: 1, sourceLevelNumber: 8, width: 3, z: 1 },
    ]);
    expect(projected.placements.slice(0, 4).map(({ coordinate, sourcePlane, semanticType }) => ({
      coordinate,
      sourcePlane,
      semanticType,
    }))).toEqual([
      { coordinate: { x: 0, y: 0, z: 0 }, sourcePlane: "lower", semanticType: "cc1:floor" },
      { coordinate: { x: 0, y: 0, z: 0 }, sourcePlane: "upper", semanticType: "cc1:chip" },
      { coordinate: { x: 1, y: 0, z: 0 }, sourcePlane: "lower", semanticType: "cc1:floor" },
      { coordinate: { x: 1, y: 0, z: 0 }, sourcePlane: "upper", semanticType: "cc1:bug" },
    ]);

    expect(projected.actors.map((actor) => ({
      coordinate: actor.coordinate,
      declaredSourceOrder: actor.declaredSourceOrder,
      semanticType: actor.semanticType,
      sourceActorOrder: actor.sourceActorOrder,
    }))).toEqual([
      {
        coordinate: { x: 1, y: 0, z: 0 },
        declaredSourceOrder: 0,
        semanticType: "cc1:bug",
        sourceActorOrder: 0,
      },
      {
        coordinate: { x: 0, y: 0, z: 1 },
        declaredSourceOrder: 1,
        semanticType: "cc1:bug",
        sourceActorOrder: 1,
      },
      {
        coordinate: { x: 0, y: 0, z: 0 },
        declaredSourceOrder: null,
        semanticType: "cc1:chip",
        sourceActorOrder: 2,
      },
    ]);

    expect(projected.wiring).toMatchObject([
      {
        discriminator: 0,
        kind: "trap",
        source: { coordinate: { x: 2, y: 0, z: 0 } },
        sourceOrder: 0,
        target: { coordinate: { x: 1, y: 0, z: 1 } },
      },
    ]);
    expect(projected.timeLimit).toEqual({ kind: "bounded", seconds: 12 });
    expect(projected.chipsRequired).toBe(3);
    expect(projected.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "unknown-catalog-element", sourceToken: "0xff" }),
    ]));
    expect(projected.placements.find((placement) => placement.sourceToken === "0xff")?.stratum).toBe("overlay");
  });

  it("rejects a level whose logical cells exceed the artifact limit", () => {
    expect(() => projectDecodedLegacyLevel({
      target: "ms",
      width: 65_536,
      height: 1,
      catalog,
      decoded: {
        number: 1,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        layers: [
          {
            z: 1,
            number: 1,
            cells: [],
            creaturePositions: [],
            traps: [],
            cloners: [],
          },
          {
            z: 2,
            number: 2,
            cells: [],
            creaturePositions: [],
            traps: [],
            cloners: [],
          },
        ],
      },
    })).toThrow(/65,536/u);
  });

  it("accepts exactly 65,536 materialized logical cells", () => {
    const cells = Array.from({ length: 65_536 }, (_, pos) => ({
      position: { x: pos, y: 0, z: 1, pos },
      bottom: { id: 0, state: 0 },
      top: { id: 0, state: 0 },
    }));
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 65_536,
      height: 1,
      catalog,
      decoded: {
        number: 1,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        layers: [
          {
            z: 1,
            number: 1,
            cells,
            creaturePositions: [],
            traps: [],
            cloners: [],
          },
        ],
      },
    });

    expect(projected.geometry.layers).toEqual([
      { height: 1, sourceLevelNumber: 1, width: 65_536, z: 0 },
    ]);
    expect(projected.placements).toHaveLength(65_536);
  });

  it("collapses duplicate empty planes and numbers every placement within a stratum", () => {
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 2,
      height: 1,
      catalog,
      decoded: {
        number: 11,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        cells: [
          {
            position: { x: 0, y: 0, z: 1, pos: 0 },
            bottom: { id: 0, state: 0 },
            top: { id: 0, state: 0 },
          },
          {
            position: { x: 1, y: 0, z: 1, pos: 1 },
            bottom: { id: 0, state: 0 },
            top: { id: 5, state: 0 },
          },
        ],
      },
    });

    expect(projected.placements.filter((placement) => placement.coordinate.x === 0)).toHaveLength(1);
    expect(projected.placements.filter((placement) => placement.coordinate.x === 1).map((placement) => ({
      discriminator: placement.discriminator,
      semanticType: placement.semanticType,
      stratum: placement.stratum,
    }))).toEqual([
      { discriminator: 0, semanticType: "cc1:floor", stratum: "terrain" },
      { discriminator: 1, semanticType: "cc1:exit", stratum: "terrain" },
    ]);
  });

  it("synthesizes the catalog floor below a lower-plane overlay and upper-plane actor", () => {
    const buttonOverlayCatalog: LegacyElementCatalogProjection = {
      ...catalog,
      project(elementId, context) {
        const projected = catalog.project(elementId, context);
        return projected && elementId === 3 ? { ...projected, stratum: "overlay" } : projected;
      },
    };
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 1,
      height: 1,
      catalog: buttonOverlayCatalog,
      decoded: {
        number: 12,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        cells: [{
          position: { x: 0, y: 0, z: 1, pos: 0 },
          bottom: { id: 3, state: 0 },
          top: { id: 1, state: 0 },
        }],
        creaturePositions: [0],
      },
    });

    expect(projected.placements.map((placement) => ({
      semanticType: placement.semanticType,
      sourcePlane: placement.sourcePlane,
      stratum: placement.stratum,
    }))).toEqual([
      { semanticType: "cc1:floor", sourcePlane: "implicit", stratum: "terrain" },
      { semanticType: "cc1:brown-button", sourcePlane: "lower", stratum: "overlay" },
      { semanticType: "cc1:chip", sourcePlane: "upper", stratum: "actor" },
    ]);
  });

  it("marks an actor on a clone-machine target as contained", () => {
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 1,
      height: 1,
      catalog,
      decoded: {
        number: 13,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        cells: [{
          position: { x: 0, y: 0, z: 1, pos: 0 },
          bottom: { id: 7, state: 0 },
          top: { id: 2, state: 0 },
        }],
        creaturePositions: [0],
      },
    });

    expect(projected.actors).toEqual([
      expect.objectContaining({ disposition: "contained", semanticType: "cc1:bug" }),
    ]);
  });

  it("compacts resolved declared actor order while retaining invalid source entries", () => {
    const projected = projectDecodedLegacyLevel({
      target: "ms",
      width: 2,
      height: 1,
      catalog,
      decoded: {
        number: 14,
        timeLimitSeconds: 0,
        chipsNeeded: 0,
        badTiles: false,
        cells: [cell(0, 1, 1), cell(1, 1, 2)],
        creaturePositions: [0, 0, 1],
      },
    });

    expect(projected.actors.map((actor) => actor.declaredSourceOrder)).toEqual([0, 1]);
    expect(projected.unknowns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "invalid-source-condition",
        unknownKey: "invalid-actor-order:1:1",
      }),
    ]));
  });
});
