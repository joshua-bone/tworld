import assert from "node:assert/strict";
import { test } from "node:test";
import {
  StaticAnalysisError,
  analyzeStaticTopology,
} from "../../dist/analyze/index.js";
import { canonicalizeJson } from "../../dist/domain/index.js";

const DIGEST = `sha256:${"a".repeat(64)}`;
const DIRECTIONS = ["north", "east", "south", "west"];

function placementId(ordinal) {
  return `placement:sha256:${ordinal.toString(16).padStart(64, "0")}`;
}

function actorId(ordinal) {
  return `actor:sha256:${ordinal.toString(16).padStart(64, "0")}`;
}

function coordinate(x, y, z = 0) {
  return { x, y, z };
}

function makeSyntheticFixture() {
  const width = 9;
  const height = 3;
  const ids = {
    player: placementId(1),
    redKey: placementId(2),
    redDoor: placementId(3),
    greenKey: placementId(4),
    greenDoor: placementId(5),
    chip: placementId(6),
    socket: placementId(7),
    teleportNear: placementId(8),
    teleportFar: placementId(9),
    force: placementId(10),
    hazard: placementId(11),
    monster: placementId(12),
    unknown: placementId(13),
    exit: placementId(14),
  };
  const actors = {
    player: actorId(1),
    monster: actorId(2),
  };
  const specs = [
    [ids.player, "player", 0, 1, "actor", "known"],
    [ids.redKey, "key-red", 0, 0, "pickup", "known"],
    [ids.redDoor, "door-red", 2, 1, "terrain", "known"],
    [ids.greenKey, "key-green", 3, 0, "pickup", "known"],
    [ids.greenDoor, "door-green", 5, 0, "terrain", "known"],
    [ids.chip, "chip", 3, 2, "pickup", "known"],
    [ids.socket, "socket", 5, 2, "terrain", "known"],
    [ids.teleportNear, "teleport", 4, 0, "terrain", "known"],
    [ids.teleportFar, "teleport", 8, 0, "terrain", "known"],
    [ids.force, "force-east", 4, 1, "terrain", "known"],
    [ids.hazard, "water", 6, 2, "terrain", "known"],
    [ids.monster, "bug", 7, 1, "actor", "known"],
    [ids.unknown, "future-element", 8, 2, "side", "unknown"],
    [ids.exit, "exit", 8, 1, "terrain", "known"],
  ];
  const placements = specs.map(([id, semanticType, x, y, stratum, interpretation]) => ({
    placementId: id,
    descriptor: {
      identityType: "static-placement",
      identityVersion: 1,
      levelDigest: DIGEST,
      coordinate: coordinate(x, y),
      stratum,
      semanticType,
      discriminator: 0,
    },
    sourceElement: {
      catalogId: "fixture-catalog",
      catalogRevision: "fixture-catalog:p1a-v1",
      elementToken: semanticType,
    },
    interpretation,
    facing: null,
    initialState: null,
  }));
  const placementByCell = new Map(
    placements.map((placement) => {
      const { x, y, z } = placement.descriptor.coordinate;
      return [`${x},${y},${z}`, placement.placementId];
    }),
  );
  const blocked = new Set(["1,0,0", "1,2,0", "2,0,0", "2,2,0", "7,2,0"]);
  const conditional = new Map([
    ["2,1,0", ["resource:red-door", ids.redDoor]],
    ["5,0,0", ["resource:green-door", ids.greenDoor]],
    ["5,2,0", ["resource:socket", ids.socket]],
    ["6,2,0", ["hazard:water", ids.hazard]],
  ]);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = `${x},${y},0`;
      const effectivePlacementId = placementByCell.get(key) ?? null;
      let classification = "open";
      let caveats = [];
      let occupant = { kind: "none", placementId: null, actorId: null };
      if (blocked.has(key)) {
        classification = "blocked";
      } else if (conditional.has(key)) {
        classification = "conditional";
        const [caveatId, caveatPlacementId] = conditional.get(key);
        caveats = [{
          caveatId,
          kind: caveatId.startsWith("hazard:") ? "hazard" : "resource-gate",
          placementId: caveatPlacementId,
        }];
      } else if (key === "7,1,0") {
        classification = "dynamic";
        caveats = [{
          caveatId: "occupancy:monster",
          kind: "actor-occupancy",
          placementId: ids.monster,
        }];
        occupant = { kind: "autonomous", placementId: ids.monster, actorId: actors.monster };
      } else if (key === "8,2,0") {
        classification = "unknown";
        caveats = [{
          caveatId: "policy:future-element",
          kind: "unknown-policy",
          placementId: ids.unknown,
        }];
      } else if (key === "0,1,0") {
        occupant = { kind: "player-start", placementId: ids.player, actorId: actors.player };
      }
      cells.push({
        coordinate: coordinate(x, y),
        effective: effectivePlacementId === null
          ? null
          : { placementId: effectivePlacementId, sourcePlane: "upper" },
        supporting: [],
        entryDirections: blocked.has(key) ? [] : DIRECTIONS,
        exitDirections: blocked.has(key) ? [] : key === "4,1,0" ? ["east"] : DIRECTIONS,
        classification,
        caveats,
        occupant,
      });
    }
  }

  const level = {
    occurrenceId: "fixture-analysis-postcard",
    normalizationProfile: "fixture-normalization-v1",
    normalizedGameplayDigest: DIGEST,
  };
  const geometry = { width, height, depth: 1 };
  const levelFacts = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    payload: {
      producerRevision: "fixture-producer:p1a-v1",
      target: "ms",
      level,
      analyzer: {
        analyzerId: "fixture-facts-analyzer",
        analyzerRevision: "fixture-facts:p1a-v1",
        analysisProfile: "fixture-facts-v1",
      },
      provenance: {
        source: {
          format: "synthetic-json",
          origin: { kind: "synthetic", fixtureId: "fixture-analysis-postcard" },
          content: { digest: DIGEST, byteLength: 1 },
        },
        occurrence: { occurrenceId: level.occurrenceId, members: [] },
        importProfile: {
          profileId: "fixture-import-v1",
          profileRevision: "fixture-import:p1a-v1",
          adapterId: "fixture-adapter",
          adapterRevision: "fixture-adapter:p1a-v1",
          normalizationProfile: level.normalizationProfile,
        },
        normalizedMap: {
          format: "ccsolver-normalized-gameplay-map",
          formatVersion: 1,
          content: { digest: DIGEST, byteLength: 1 },
        },
      },
      geometry,
      placements,
      actors: [
        {
          actorId: actors.player,
          descriptor: {
            identityType: "actor",
            identityVersion: 1,
            kind: "initial",
            placementId: ids.player,
            sourceActorOrder: 0,
          },
          semanticType: "player",
          disposition: "active",
          facing: "south",
          declaredSourceOrder: 0,
        },
        {
          actorId: actors.monster,
          descriptor: {
            identityType: "actor",
            identityVersion: 1,
            kind: "initial",
            placementId: ids.monster,
            sourceActorOrder: 1,
          },
          semanticType: "bug",
          disposition: "active",
          facing: "west",
          declaredSourceOrder: 1,
        },
      ],
      timeLimit: { kind: "untimed" },
      requiredCollectibles: [{ resourceType: "chip", amount: 1 }],
      resourceSources: [
        { placementId: ids.redKey, resourceType: "key-red", amount: 1 },
        { placementId: ids.greenKey, resourceType: "key-green", amount: 1 },
        { placementId: ids.chip, resourceType: "chip", amount: 1 },
      ],
      resourceGates: [
        { kind: "consume", placementId: ids.redDoor, resourceType: "key-red", amount: 1 },
        { kind: "possess", placementId: ids.greenDoor, resourceType: "key-green", amount: 1 },
        { kind: "remaining-zero", placementId: ids.socket, resourceType: "chip" },
      ],
      exits: [ids.exit],
      wiring: [],
      transports: [{
        networkId: "teleports-main",
        kind: "teleport",
        members: [ids.teleportFar, ids.teleportNear],
        routingPolicy: "reverse-reading-cycle",
      }],
      forcedSurfaces: [{
        placementId: ids.force,
        motion: "force",
        direction: "east",
        turn: null,
      }],
      hazards: [{
        placementId: ids.hazard,
        hazardType: "water",
        persistence: "persistent",
        protectionResources: ["boots-water"],
      }],
      unknowns: [{
        unknownId: "unknown-future-element",
        kind: "unknown-catalog-element",
        placementId: ids.unknown,
        catalogId: "fixture-catalog",
        sourceToken: "future-element",
        reason: "The fixture policy does not classify this future element.",
      }],
    },
  };
  const evidence = {
    evidenceVersion: 1,
    target: "ms",
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: DIGEST,
    },
    level,
    geometry,
    policy: {
      policyId: "fixture-ms-static-topology",
      policyRevision: "fixture-policy:p1a-v1",
    },
    cells,
  };
  return { actors, evidence, ids, levelFacts };
}

function analyze(fixture) {
  return analyzeStaticTopology({
    levelFacts: fixture.levelFacts,
    levelFactsDigest: DIGEST,
    evidence: fixture.evidence,
    topologyEvidence: { digest: DIGEST, byteLength: 1 },
    analyzerRevision: "fixture-analyzer:p1a-v1",
  });
}

test("derives explainable topology and semantic attachments from target policy evidence", () => {
  const fixture = makeSyntheticFixture();
  const analysis = analyze(fixture);

  assert.equal(analysis.analysisVersion, 1);
  assert.equal(analysis.target, "ms");
  assert.deepEqual(analysis.topologyEvidence, { digest: DIGEST, byteLength: 1 });
  assert.doesNotThrow(() => canonicalizeJson(analysis));
  assert.equal(analysis.regions.length, 2);
  assert.deepEqual(analysis.regions.map((region) => region.regionId), ["region:0", "region:3"]);
  assert.ok(analysis.articulationPoints.some((point) => point.cellOrdinal === 9));

  const redDoor = analysis.boundaries.find(
    (boundary) => boundary.effectivePlacementId === fixture.ids.redDoor,
  );
  assert.equal(redDoor.kind, "conditional");
  assert.deepEqual(redDoor.incomingRegionIds, ["region:0", "region:3"]);
  assert.deepEqual(redDoor.outgoingRegionIds, ["region:0", "region:3"]);

  assert.deepEqual(
    analysis.resourceDependencies.map((dependency) => ({
      gate: dependency.gatePlacementId,
      kind: dependency.gateKind,
      sources: dependency.candidateSources.map((source) => source.placementId),
    })),
    [
      { gate: fixture.ids.redDoor, kind: "consume", sources: [fixture.ids.redKey] },
      { gate: fixture.ids.greenDoor, kind: "possess", sources: [fixture.ids.greenKey] },
      { gate: fixture.ids.socket, kind: "remaining-zero", sources: [fixture.ids.chip] },
    ],
  );
  assert.deepEqual(
    analysis.transports[0].members.map((member) => member.placementId),
    [fixture.ids.teleportFar, fixture.ids.teleportNear],
    "transport member routing order is semantic and must be preserved",
  );
  assert.equal(analysis.attachments.forcedSurfaces[0].placementId, fixture.ids.force);
  assert.equal(analysis.attachments.hazards[0].placementId, fixture.ids.hazard);
  assert.equal(analysis.attachments.exits[0].placementId, fixture.ids.exit);
  assert.ok(analysis.boundaries.some((boundary) => boundary.kind === "dynamic"));
  assert.ok(analysis.boundaries.some((boundary) => boundary.kind === "unknown"));
  assert.ok(analysis.uncertainties.some((entry) => entry.kind === "unknown-traversal"));
  assert.ok(analysis.uncertainties.some((entry) => entry.kind === "unknown-static-fact"));
  assert.equal(analysis.features.logicalCellCount, 27);
  assert.equal(analysis.features.weakRegionCount, 2);
  assert.equal(analysis.features.conditionalBoundaryCount, 4);
  assert.equal(analysis.features.dynamicBoundaryCount, 1);
  assert.equal(analysis.features.unknownBoundaryCount, 1);
  assert.equal(analysis.features.resourceGateCount, 3);
  assert.equal(analysis.features.resourceCandidateSourceCount, 3);
  assert.ok(analysis.features.oneWayConnectionCount > 0);
  const forcedOrdinal = 4 + 9;
  assert.ok(analysis.directedAdjacency.some((edge) => (
    edge.fromCellOrdinal === forcedOrdinal
    && edge.toCellOrdinal === forcedOrdinal + 1
    && edge.direction === "east"
  )));
  assert.equal(analysis.directedAdjacency.some((edge) => (
    edge.fromCellOrdinal === forcedOrdinal
    && edge.toCellOrdinal === forcedOrdinal - 1
  )), false);
});

test("normalizes non-semantic collection and direction order", () => {
  const canonical = makeSyntheticFixture();
  const shuffled = makeSyntheticFixture();
  shuffled.evidence.cells.reverse();
  for (const cell of shuffled.evidence.cells) {
    cell.entryDirections = [...cell.entryDirections].reverse();
    cell.exitDirections = [...cell.exitDirections].reverse();
    cell.supporting = [...cell.supporting].reverse();
    cell.caveats = [...cell.caveats].reverse();
  }
  shuffled.levelFacts.payload.placements.reverse();
  shuffled.levelFacts.payload.actors.reverse();
  shuffled.levelFacts.payload.resourceSources.reverse();
  shuffled.levelFacts.payload.resourceGates.reverse();
  shuffled.levelFacts.payload.exits.reverse();
  shuffled.levelFacts.payload.forcedSurfaces.reverse();
  shuffled.levelFacts.payload.hazards.reverse();
  shuffled.levelFacts.payload.unknowns.reverse();

  assert.deepEqual(analyze(shuffled), analyze(canonical));
});

test("rejects mismatched fact bindings and dangling placement references", () => {
  const wrongDigest = makeSyntheticFixture();
  assert.throws(
    () => analyzeStaticTopology({
      levelFacts: wrongDigest.levelFacts,
      levelFactsDigest: `sha256:${"b".repeat(64)}`,
      evidence: wrongDigest.evidence,
      topologyEvidence: { digest: DIGEST, byteLength: 1 },
      analyzerRevision: "fixture-analyzer:p1a-v1",
    }),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.binding-invalid"
      && error.path === "/evidence/levelFacts/digest"
    ),
  );

  const wrongTarget = makeSyntheticFixture();
  wrongTarget.evidence.target = "lynx";
  assert.throws(
    () => analyze(wrongTarget),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.binding-invalid"
      && error.path === "/evidence/target"
    ),
  );

  const danglingEvidence = makeSyntheticFixture();
  danglingEvidence.evidence.cells[0].effective = {
    placementId: placementId(999),
    sourcePlane: "upper",
  };
  danglingEvidence.evidence.cells[0].supporting = [];
  assert.throws(
    () => analyze(danglingEvidence),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.invariant-invalid"
      && error.path === "/evidence/cells/0/effective/placementId"
    ),
  );

  const danglingFacts = makeSyntheticFixture();
  danglingFacts.levelFacts.payload.resourceGates[0].placementId = placementId(999);
  assert.throws(
    () => analyze(danglingFacts),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.invariant-invalid"
      && error.path === "/levelFacts/payload/resourceGates/0/placementId"
    ),
  );

  const duplicateRole = makeSyntheticFixture();
  duplicateRole.evidence.cells[0].supporting = [{
    ...duplicateRole.evidence.cells[0].effective,
  }];
  assert.throws(
    () => analyze(duplicateRole),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.evidence-invalid"
      && error.path === "/evidence/cells/0/supporting/0/placementId"
    ),
  );

  const omittedPlacement = makeSyntheticFixture();
  omittedPlacement.evidence.cells[0].effective = null;
  assert.throws(
    () => analyze(omittedPlacement),
    (error) => (
      error instanceof StaticAnalysisError
      && error.code === "analysis.invariant-invalid"
      && error.path === "/evidence/cells/0/supporting"
    ),
  );
});

test("does not treat unknown cells or adjacent z layers as certainly open", () => {
  const fixture = makeSyntheticFixture();
  const analysis = analyze(fixture);
  const unknownOrdinal = 8 + (2 * 9);

  assert.equal(
    analysis.regions.some((region) => region.cellOrdinals.includes(unknownOrdinal)),
    false,
  );

  const layered = makeSyntheticFixture();
  layered.levelFacts.payload.geometry = { ...layered.levelFacts.payload.geometry, depth: 2 };
  layered.evidence.geometry = { ...layered.evidence.geometry, depth: 2 };
  for (let y = 0; y < 3; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      layered.evidence.cells.push({
        coordinate: coordinate(x, y, 1),
        effective: null,
        supporting: [],
        entryDirections: DIRECTIONS,
        exitDirections: DIRECTIONS,
        classification: "open",
        caveats: [],
        occupant: { kind: "none", placementId: null, actorId: null },
      });
    }
  }
  const layeredAnalysis = analyze(layered);
  const planeSize = 9 * 3;
  assert.equal(
    layeredAnalysis.directedAdjacency.some((edge) => (
      Math.floor(edge.fromCellOrdinal / planeSize) !== Math.floor(edge.toCellOrdinal / planeSize)
    )),
    false,
  );
});

test("analyzes a maximum-size corridor with an iterative articulation algorithm", { timeout: 30_000 }, () => {
  const width = 65_536;
  const level = {
    occurrenceId: "fixture-maximum-corridor",
    normalizationProfile: "fixture-normalization-v1",
    normalizedGameplayDigest: DIGEST,
  };
  const geometry = { width, height: 1, depth: 1 };
  const levelFacts = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    payload: {
      producerRevision: "fixture-producer:p1a-v1",
      target: "lynx",
      level,
      analyzer: {
        analyzerId: "fixture-facts-analyzer",
        analyzerRevision: "fixture-facts:p1a-v1",
        analysisProfile: "fixture-facts-v1",
      },
      provenance: {},
      geometry,
      placements: [],
      actors: [],
      timeLimit: { kind: "untimed" },
      requiredCollectibles: [],
      resourceSources: [],
      resourceGates: [],
      exits: [],
      wiring: [],
      transports: [],
      forcedSurfaces: [],
      hazards: [],
      unknowns: [],
    },
  };
  const evidence = {
    evidenceVersion: 1,
    target: "lynx",
    levelFacts: {
      protocolVersion: 1,
      artifactType: "level-facts",
      schemaVersion: 1,
      digest: DIGEST,
    },
    level,
    geometry,
    policy: {
      policyId: "fixture-lynx-static-topology",
      policyRevision: "fixture-policy:p1a-v1",
    },
    cells: Array.from({ length: width }, (_, x) => ({
      coordinate: coordinate(x, 0),
      effective: null,
      supporting: [],
      entryDirections: x === 0 ? ["west"] : x === width - 1 ? ["east"] : ["east", "west"],
      exitDirections: x === 0 ? ["east"] : x === width - 1 ? ["west"] : ["east", "west"],
      classification: "open",
      caveats: [],
      occupant: { kind: "none", placementId: null, actorId: null },
    })),
  };

  const analysis = analyzeStaticTopology({
    levelFacts,
    levelFactsDigest: DIGEST,
    evidence,
    topologyEvidence: { digest: DIGEST, byteLength: 1 },
    analyzerRevision: "fixture-analyzer:p1a-v1",
  });
  assert.equal(analysis.regions.length, 1);
  assert.equal(analysis.regions[0].cellOrdinals.length, width);
  assert.equal(analysis.directedAdjacency.length, (width - 1) * 2);
  assert.equal(analysis.articulationPoints.length, width - 2);
  assert.equal(analysis.articulationPoints[0].cellOrdinal, 1);
  assert.equal(analysis.articulationPoints.at(-1).cellOrdinal, width - 2);
});
