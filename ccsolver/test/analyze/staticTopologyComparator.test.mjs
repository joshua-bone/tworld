import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  StaticTopologyComparisonError,
  compareStaticTopology,
} from "../../dist/analyze/index.js";
import { canonicalizeJson } from "../../dist/domain/index.js";

const NORMALIZED_DIGEST = `sha256:${"0".repeat(64)}`;
const DIRECTIONS = ["north", "east", "south", "west"];

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function placementId(ordinal) {
  return `placement:sha256:${ordinal.toString(16).padStart(64, "0")}`;
}

function actorId(ordinal) {
  return `actor:sha256:${ordinal.toString(16).padStart(64, "0")}`;
}

function coordinate(x, y = 0, z = 0) {
  return { x, y, z };
}

function emptyFeatures() {
  return {
    logicalCellCount: 2,
    certainOpenCellCount: 2,
    blockedCellCount: 0,
    conditionalBoundaryCount: 0,
    dynamicBoundaryCount: 0,
    unknownBoundaryCount: 0,
    directedAdjacencyCount: 2,
    weakConnectionCount: 1,
    bidirectionalConnectionCount: 1,
    oneWayConnectionCount: 0,
    weakRegionCount: 1,
    articulationPointCount: 0,
    resourceGateCount: 0,
    resourceCandidateSourceCount: 0,
    transportNetworkCount: 0,
    transportIncidenceCount: 0,
    forcedSurfaceCount: 0,
    hazardCount: 0,
    exitCount: 1,
    uncertaintyCount: 0,
  };
}

function makeBundle(target) {
  const targetOffset = target === "ms" ? 0 : 3;
  const content = {
    levelFacts: { digest: digest(target === "ms" ? "a" : "d"), byteLength: 101 + targetOffset },
    topologyEvidence: { digest: digest(target === "ms" ? "b" : "e"), byteLength: 202 + targetOffset },
    staticAnalysis: { digest: digest(target === "ms" ? "c" : "f"), byteLength: 303 + targetOffset },
  };
  const ids = { player: placementId(1), exit: placementId(2) };
  const actors = { player: actorId(1) };
  const level = {
    occurrenceId: "fixture-paired-postcard",
    normalizationProfile: "fixture-normalization-v1",
    normalizedGameplayDigest: NORMALIZED_DIGEST,
  };
  const geometry = { width: 2, height: 1, depth: 1 };
  const levelFactsReference = {
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    digest: content.levelFacts.digest,
  };
  const placements = [
    {
      placementId: ids.player,
      descriptor: {
        identityType: "static-placement",
        identityVersion: 1,
        levelDigest: NORMALIZED_DIGEST,
        coordinate: coordinate(0),
        stratum: "actor",
        semanticType: "player",
        discriminator: 0,
      },
      sourceElement: {
        catalogId: `fixture-${target}-catalog`,
        catalogRevision: `fixture-${target}-catalog:p1b-v1`,
        elementToken: "player",
      },
      interpretation: "known",
      facing: "east",
      initialState: null,
    },
    {
      placementId: ids.exit,
      descriptor: {
        identityType: "static-placement",
        identityVersion: 1,
        levelDigest: NORMALIZED_DIGEST,
        coordinate: coordinate(1),
        stratum: "terrain",
        semanticType: "exit",
        discriminator: 0,
      },
      sourceElement: {
        catalogId: `fixture-${target}-catalog`,
        catalogRevision: `fixture-${target}-catalog:p1b-v1`,
        elementToken: "exit",
      },
      interpretation: "known",
      facing: null,
      initialState: null,
    },
  ];
  const levelFacts = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    payload: {
      producerRevision: `fixture-${target}-producer:p1b-v1`,
      target,
      level,
      analyzer: {
        analyzerId: "fixture-static-facts-analyzer",
        analyzerRevision: `fixture-${target}-facts:p1b-v1`,
        analysisProfile: "fixture-static-facts-v1",
      },
      provenance: {
        source: {
          format: "synthetic-json",
          origin: { kind: "synthetic", fixtureId: "fixture-paired-postcard" },
          content: { digest: digest("9"), byteLength: 1 },
        },
        occurrence: { occurrenceId: level.occurrenceId, members: [] },
        importProfile: {
          profileId: `fixture-${target}-import-v1`,
          profileRevision: `fixture-${target}-import:p1b-v1`,
          adapterId: `fixture-${target}-adapter`,
          adapterRevision: `fixture-${target}-adapter:p1b-v1`,
          normalizationProfile: level.normalizationProfile,
        },
        normalizedMap: {
          format: "ccsolver-normalized-gameplay-map",
          formatVersion: 1,
          content: { digest: NORMALIZED_DIGEST, byteLength: 1 },
        },
      },
      geometry,
      placements,
      actors: [{
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
        facing: "east",
        declaredSourceOrder: 0,
      }],
      timeLimit: { kind: "bounded", seconds: 100 },
      requiredCollectibles: [
        { resourceType: "bonus", amount: 2 },
        { resourceType: "chip", amount: 1 },
      ],
      resourceSources: [],
      resourceGates: [],
      exits: [ids.exit],
      wiring: [],
      transports: [],
      forcedSurfaces: [],
      hazards: [],
      unknowns: [],
    },
  };
  const cells = [
    {
      coordinate: coordinate(0),
      effective: { placementId: ids.player, sourcePlane: "upper" },
      supporting: [],
      entryDirections: [...DIRECTIONS],
      exitDirections: [...DIRECTIONS],
      classification: "open",
      caveats: [],
      occupant: { kind: "player-start", placementId: ids.player, actorId: actors.player },
    },
    {
      coordinate: coordinate(1),
      effective: { placementId: ids.exit, sourcePlane: "lower" },
      supporting: [],
      entryDirections: [...DIRECTIONS],
      exitDirections: [...DIRECTIONS],
      classification: "open",
      caveats: [],
      occupant: { kind: "none", placementId: null, actorId: null },
    },
  ];
  const evidence = {
    evidenceVersion: 1,
    target,
    levelFacts: { ...levelFactsReference },
    level: { ...level },
    geometry: { ...geometry },
    policy: {
      policyId: `fixture-${target}-static-topology`,
      policyRevision: `fixture-${target}-policy:p1b-v1`,
    },
    cells,
  };
  const staticAnalysis = {
    analysisVersion: 1,
    analyzer: {
      analyzerId: "ccsolver-static-topology-analyzer",
      analyzerRevision: "fixture-comparable-analyzer:p1b-v1",
      analysisProfile: "ccsolver-static-topology-v1",
    },
    target,
    levelFacts: { ...levelFactsReference },
    level: { ...level },
    geometry: { ...geometry },
    topologyPolicy: { ...evidence.policy },
    topologyEvidence: { ...content.topologyEvidence },
    directedAdjacency: [
      { fromCellOrdinal: 0, toCellOrdinal: 1, direction: "east" },
      { fromCellOrdinal: 1, toCellOrdinal: 0, direction: "west" },
    ],
    regions: [{ regionId: "region:0", minimumCellOrdinal: 0, cellOrdinals: [0, 1] }],
    articulationPoints: [],
    boundaries: [],
    resourceDependencies: [],
    transports: [],
    attachments: {
      forcedSurfaces: [],
      hazards: [],
      exits: [{
        placementId: ids.exit,
        cellOrdinal: 1,
        coordinate: coordinate(1),
        regionIds: ["region:0"],
      }],
    },
    uncertainties: [],
    features: emptyFeatures(),
  };
  return { content, evidence, levelFacts, staticAnalysis };
}

function expectComparisonError(code, path) {
  return (error) => (
    error instanceof StaticTopologyComparisonError
    && error.code === code
    && error.path === path
  );
}

async function identifyCanonicalContent(canonicalJson) {
  return {
    digest: `sha256:${createHash("sha256").update(canonicalJson, "utf8").digest("hex")}`,
    byteLength: Buffer.byteLength(canonicalJson, "utf8"),
  };
}

async function bindBundle(
  bundle,
  { levelFactsReference = true, topologyEvidenceReference = true } = {},
) {
  bundle.content.levelFacts = await identifyCanonicalContent(canonicalizeJson(bundle.levelFacts));
  if (levelFactsReference) {
    bundle.evidence.levelFacts.digest = bundle.content.levelFacts.digest;
    bundle.staticAnalysis.levelFacts.digest = bundle.content.levelFacts.digest;
  }
  bundle.content.topologyEvidence = await identifyCanonicalContent(canonicalizeJson(bundle.evidence));
  if (topologyEvidenceReference) {
    bundle.staticAnalysis.topologyEvidence = { ...bundle.content.topologyEvidence };
  }
  bundle.content.staticAnalysis = await identifyCanonicalContent(canonicalizeJson(bundle.staticAnalysis));
  return bundle;
}

async function makeInput() {
  return {
    targets: await Promise.all([
      bindBundle(makeBundle("ms")),
      bindBundle(makeBundle("lynx")),
    ]),
  };
}

test("rejects swapped canonical-content digests at each exact artifact path", async () => {
  for (const artifact of ["levelFacts", "topologyEvidence", "staticAnalysis"]) {
    const input = await makeInput();
    input.targets[0].content[artifact].digest = input.targets[1].content[artifact].digest;

    await assert.rejects(
      async () => compareStaticTopology(input, identifyCanonicalContent),
      expectComparisonError(
        "comparison.binding-invalid",
        `/targets/0/content/${artifact}/digest`,
      ),
    );
  }
});

test("rejects replaced canonical-content byte lengths at each exact artifact path", async () => {
  for (const artifact of ["levelFacts", "topologyEvidence", "staticAnalysis"]) {
    const input = await makeInput();
    input.targets[0].content[artifact].byteLength += 1;

    await assert.rejects(
      async () => compareStaticTopology(input, identifyCanonicalContent),
      expectComparisonError(
        "comparison.binding-invalid",
        `/targets/0/content/${artifact}/byteLength`,
      ),
    );
  }
});

test("compares one genuine MS/Lynx pair without treating target adapter metadata as semantic", async () => {
  const input = await makeInput();
  const comparison = await compareStaticTopology(input, identifyCanonicalContent);

  assert.equal(comparison.comparisonVersion, 1);
  assert.equal(comparison.status, "parity");
  assert.deepEqual(comparison.sourceFactDifferences, []);
  assert.deepEqual(comparison.cellPolicyDifferences, []);
  assert.deepEqual(comparison.featureDifferences, []);
  assert.equal(comparison.targets.ms.levelFacts.digest, input.targets[0].content.levelFacts.digest);
  assert.equal(comparison.targets.lynx.staticAnalysis.digest, input.targets[1].content.staticAnalysis.digest);
  assert.doesNotThrow(() => canonicalizeJson(comparison));
});

test("classifies source, target-policy, and downstream exact-count differences", async () => {
  const input = await makeInput();
  const lynx = input.targets[1];
  lynx.levelFacts.payload.requiredCollectibles[1].amount = 2;
  lynx.evidence.cells[1].classification = "blocked";
  lynx.evidence.cells[1].entryDirections = [];
  lynx.evidence.cells[1].exitDirections = [];
  lynx.staticAnalysis.features.certainOpenCellCount = 1;
  lynx.staticAnalysis.features.blockedCellCount = 1;
  await bindBundle(lynx);

  const comparison = await compareStaticTopology(input, identifyCanonicalContent);

  assert.equal(comparison.status, "divergent");
  assert.deepEqual(comparison.sourceFactDifferences.map((difference) => ({
    cause: difference.cause,
    path: difference.factPath,
  })), [{ cause: "source-facts", path: "/requiredCollectibles" }]);
  assert.deepEqual(comparison.cellPolicyDifferences.map((difference) => ({
    cause: difference.cause,
    ordinal: difference.cellOrdinal,
  })), [{ cause: "target-policy", ordinal: 1 }]);
  assert.deepEqual(comparison.featureDifferences, [
    {
      cause: "derived-from-policy",
      feature: "certainOpenCellCount",
      ms: 2,
      lynx: 1,
      delta: -1,
    },
    {
      cause: "derived-from-policy",
      feature: "blockedCellCount",
      ms: 0,
      lynx: 1,
      delta: 1,
    },
  ]);
});

test("fails closed on target, level, geometry, binding, and analyzer mismatches", async () => {
  const duplicateTarget = await makeInput();
  duplicateTarget.targets[1].levelFacts.payload.target = "ms";
  duplicateTarget.targets[1].evidence.target = "ms";
  duplicateTarget.targets[1].staticAnalysis.target = "ms";
  await bindBundle(duplicateTarget.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(duplicateTarget, identifyCanonicalContent),
    expectComparisonError("comparison.target-invalid", "/targets"),
  );

  const wrongInternalTarget = await makeInput();
  wrongInternalTarget.targets[0].evidence.target = "lynx";
  await bindBundle(wrongInternalTarget.targets[0]);
  await assert.rejects(
    async () => compareStaticTopology(wrongInternalTarget, identifyCanonicalContent),
    expectComparisonError("comparison.binding-invalid", "/targets/0/evidence/target"),
  );

  const wrongLevel = await makeInput();
  wrongLevel.targets[1].levelFacts.payload.level.normalizedGameplayDigest = digest("8");
  wrongLevel.targets[1].evidence.level.normalizedGameplayDigest = digest("8");
  wrongLevel.targets[1].staticAnalysis.level.normalizedGameplayDigest = digest("8");
  for (const placement of wrongLevel.targets[1].levelFacts.payload.placements) {
    placement.descriptor.levelDigest = digest("8");
  }
  await bindBundle(wrongLevel.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(wrongLevel, identifyCanonicalContent),
    expectComparisonError("comparison.level-mismatch", "/targets/1/levelFacts/payload/level"),
  );

  const wrongGeometry = await makeInput();
  wrongGeometry.targets[1].levelFacts.payload.geometry.width = 3;
  wrongGeometry.targets[1].evidence.geometry.width = 3;
  wrongGeometry.targets[1].staticAnalysis.geometry.width = 3;
  wrongGeometry.targets[1].staticAnalysis.features.logicalCellCount = 3;
  wrongGeometry.targets[1].evidence.cells.push({
    coordinate: coordinate(2),
    effective: null,
    supporting: [],
    entryDirections: [...DIRECTIONS],
    exitDirections: [...DIRECTIONS],
    classification: "open",
    caveats: [],
    occupant: { kind: "none", placementId: null, actorId: null },
  });
  await bindBundle(wrongGeometry.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(wrongGeometry, identifyCanonicalContent),
    expectComparisonError("comparison.level-mismatch", "/targets/1/levelFacts/payload/geometry"),
  );

  const wrongFactsReference = await makeInput();
  wrongFactsReference.targets[0].evidence.levelFacts.digest = digest("8");
  await bindBundle(wrongFactsReference.targets[0], { levelFactsReference: false });
  await assert.rejects(
    async () => compareStaticTopology(wrongFactsReference, identifyCanonicalContent),
    expectComparisonError("comparison.binding-invalid", "/targets/0/evidence/levelFacts/digest"),
  );

  const wrongTopologyReference = await makeInput();
  wrongTopologyReference.targets[0].staticAnalysis.topologyEvidence.byteLength += 1;
  await bindBundle(wrongTopologyReference.targets[0], { topologyEvidenceReference: false });
  await assert.rejects(
    async () => compareStaticTopology(wrongTopologyReference, identifyCanonicalContent),
    expectComparisonError("comparison.binding-invalid", "/targets/0/staticAnalysis/topologyEvidence"),
  );

  const wrongAnalyzerRevision = await makeInput();
  wrongAnalyzerRevision.targets[1].staticAnalysis.analyzer.analyzerRevision = "fixture-other-revision";
  await bindBundle(wrongAnalyzerRevision.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(wrongAnalyzerRevision, identifyCanonicalContent),
    expectComparisonError("comparison.analyzer-mismatch", "/targets/1/staticAnalysis/analyzer/analyzerRevision"),
  );

  const wrongAnalyzerProfile = await makeInput();
  wrongAnalyzerProfile.targets[1].staticAnalysis.analyzer.analysisProfile = "fixture-other-profile";
  await bindBundle(wrongAnalyzerProfile.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(wrongAnalyzerProfile, identifyCanonicalContent),
    expectComparisonError("comparison.analyzer-mismatch", "/targets/1/staticAnalysis/analyzer/analysisProfile"),
  );
});

test("rejects inexplicable downstream divergence from identical semantic inputs", async () => {
  const featureDivergence = await makeInput();
  featureDivergence.targets[1].staticAnalysis.features.weakRegionCount = 2;
  await bindBundle(featureDivergence.targets[1]);

  await assert.rejects(
    async () => compareStaticTopology(featureDivergence, identifyCanonicalContent),
    expectComparisonError(
      "comparison.analysis-divergence",
      "/targets/1/staticAnalysis/features/weakRegionCount",
    ),
  );

  const structuralDivergence = await makeInput();
  structuralDivergence.targets[1].staticAnalysis.directedAdjacency.pop();
  await bindBundle(structuralDivergence.targets[1]);
  await assert.rejects(
    async () => compareStaticTopology(structuralDivergence, identifyCanonicalContent),
    expectComparisonError("comparison.analysis-divergence", "/targets/1/staticAnalysis"),
  );
});

test("normalizes semantically set-like facts and topology-policy collections", async () => {
  const canonical = await makeInput();
  const shuffled = await makeInput();
  for (const bundle of shuffled.targets) {
    bundle.levelFacts.payload.placements.reverse();
    bundle.levelFacts.payload.actors.reverse();
    bundle.levelFacts.payload.requiredCollectibles.reverse();
    bundle.levelFacts.payload.exits.reverse();
    bundle.evidence.cells.reverse();
    for (const cell of bundle.evidence.cells) {
      cell.entryDirections.reverse();
      cell.exitDirections.reverse();
      cell.supporting.reverse();
      cell.caveats.reverse();
    }
    bundle.staticAnalysis.directedAdjacency.reverse();
    bundle.staticAnalysis.regions.reverse();
    for (const region of bundle.staticAnalysis.regions) region.cellOrdinals.reverse();
    bundle.staticAnalysis.attachments.exits.reverse();
    await bindBundle(bundle);
  }
  shuffled.targets.reverse();

  const shuffledComparison = await compareStaticTopology(shuffled, identifyCanonicalContent);
  const canonicalComparison = await compareStaticTopology(canonical, identifyCanonicalContent);
  assert.deepEqual(
    { ...shuffledComparison, targets: undefined },
    { ...canonicalComparison, targets: undefined },
  );
  assert.notEqual(
    shuffledComparison.targets.ms.levelFacts.digest,
    canonicalComparison.targets.ms.levelFacts.digest,
  );
});
