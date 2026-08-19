import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  decodeCanonicalArtifact,
  encodeArtifact,
  identifyCanonicalJson,
  referenceCanonicalJson,
  referenceSourceBytes,
  verifyCertificateBundle,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type CanonicalJson,
  type CanonicalJsonValue,
  type CorpusCaseV1,
  type ReplayCertificateV1,
} from "@tworld/ccsolver/domain";
import { describe, expect, it, vi } from "vitest";
import {
  loadKeyPyramidRuntimeSource,
  type KeyPyramidRuntimeSource,
} from "../p3-review/keyPyramidP3Source";
import type { KeyPyramidP5ExecutionV1 } from "./buildKeyPyramidP5Execution";
import {
  assertKeyPyramidP5PlanningBundle,
} from "./buildKeyPyramidP5Plan";
import {
  buildKeyPyramidP5Route,
  type KeyPyramidP5RouteV1,
} from "./buildKeyPyramidP5Route";
import type { KeyPyramidP5ReplayCertificationV1 } from "./certifyKeyPyramidP5Replay";
import {
  buildKeyPyramidP5PlannedRun,
  buildKeyPyramidP5PlanningAuthority,
  buildP5ReviewOutputs,
  composeP5ReviewOutputs,
  type P5PreparedTarget,
} from "./buildP5ReviewOutputs";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");

function json(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

async function reference(value: unknown) {
  return referenceCanonicalJson(json(value) as CanonicalJson, sha256);
}

async function preparedTarget(target: "ms" | "lynx"): Promise<P5PreparedTarget> {
  const terminalTriggerTick = target === "ms" ? 644 : 647;
  const traceSettledTerminalTick = target === "ms" ? 644 : 660;
  const level = {
    occurrenceId: "tworld:cclp1:001",
    normalizationProfile: "profile:test",
    normalizedGameplayDigest:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  } as const;
  const tileSteps = Array.from({ length: 162 }, (_, stepOrder) => ({
    stepOrder,
    direction: "east" as const,
    inputCode: 8,
    from: { x: stepOrder, y: 0, z: 0 },
    to: { x: stepOrder + 1, y: 0, z: 0 },
  }));
  const stopOrders = [26, 53, 80, 107, 134, 161] as const;
  const eventSpecs = [
    { afterStepOrder: 2, kind: "collect-key", semanticType: "cc1:key-red", resourceType: "cc1:key-red" },
    { afterStepOrder: 3, kind: "collect-key", semanticType: "cc1:key-green", resourceType: "cc1:key-green" },
    ...[5, 10, 20, 35, 45, 60, 75, 90, 110, 130].map((afterStepOrder) => ({
      afterStepOrder,
      kind: "collect-chip" as const,
      semanticType: "cc1:icchip",
      resourceType: "cc1:icchip",
    })),
    { afterStepOrder: 139, kind: "open-door", semanticType: "cc1:door-red", resourceType: "cc1:key-red" },
    { afterStepOrder: 140, kind: "open-door", semanticType: "cc1:door-green", resourceType: "cc1:key-green" },
    { afterStepOrder: 160, kind: "open-socket", semanticType: "cc1:socket", resourceType: "cc1:icchip" },
    { afterStepOrder: 161, kind: "reach-exit", semanticType: "cc1:exit", resourceType: null },
  ] as const;
  const events = eventSpecs.map((event, eventOrder) => ({
    eventOrder,
    afterStepOrder: event.afterStepOrder,
    kind: event.kind,
    coordinate: tileSteps[event.afterStepOrder]!.to,
    placementId: `placement:sha256:${String(eventOrder).padStart(64, "0")}` as const,
    semanticType: event.semanticType,
    resourceType: event.resourceType,
  }));
  const subgoals = stopOrders.map((lastStepOrder, index) => ({
    subgoalId: `subgoal:key-pyramid:test-${index + 1}`,
    title: `Test subgoal ${index + 1}`,
    description: `Exercise test segment ${index + 1}.`,
    firstStepOrder: index === 0 ? 0 : stopOrders[index - 1]! + 1,
    lastStepOrder,
    eventOrders: events
      .filter(({ afterStepOrder }) => (
        afterStepOrder >= (index === 0 ? 0 : stopOrders[index - 1]! + 1)
        && afterStepOrder <= lastStepOrder
      ))
      .map(({ eventOrder }) => eventOrder),
  }));
  const route: KeyPyramidP5RouteV1 = {
    routeType: "p5-key-pyramid-route",
    routeVersion: 1,
    derivation: "checked-facts-resource-search",
    target,
    level,
    start: { x: 0, y: 0, z: 0 },
    tileStepsOrder: "step-order",
    tileSteps,
    eventsOrder: "event-order",
    events,
    subgoalsOrder: "execution-order",
    subgoals,
    finalState: {
      coordinate: tileSteps.at(-1)!.to,
      remainingChips: 0,
      inventory: { red: 0, blue: 0, yellow: 0, green: 1 },
    },
  };
  const boundaries = await Promise.all(Array.from({ length: 7 }, async (_, boundaryOrder) => {
    const observation = {
      fixture: "observation",
      target,
      boundaryOrder,
      exact: `fingerprint:${target}:${boundaryOrder}`,
    };
    const render = {
      fixture: "full-map-render",
      target,
      boundaryOrder,
      cells: [{ coordinate: { x: boundaryOrder, y: 0, z: 0 }, items: [] }],
    };
    return {
      boundaryOrder,
      boundaryKind: boundaryOrder === 0 ? "initial" as const : "subgoal-stop" as const,
      subgoalId: boundaryOrder === 0 ? null : subgoals[boundaryOrder - 1]!.subgoalId,
      nativeTick: boundaryOrder === 6 ? terminalTriggerTick : boundaryOrder * 100,
      coordinate: boundaryOrder === 0
        ? route.start
        : tileSteps[subgoals[boundaryOrder - 1]!.lastStepOrder]!.to,
      remainingChips: boundaryOrder === 6 ? 0 : 10 - boundaryOrder,
      terminalKind: boundaryOrder === 6 ? "won" as const : "running" as const,
      exactFingerprint: `fingerprint:${target}:${boundaryOrder}`,
      observationContent: await reference(observation),
      renderContent: await reference(render),
      observation,
      render,
    };
  }));
  const replay = {
    bestTimeTicks: 700,
    flags: 0,
    randomSlideDirection: 1,
    stepping: 0,
    randomSeed: 0,
    moves: tileSteps.map(({ stepOrder, inputCode }) => ({ when: stepOrder * 4, dir: inputCode })),
    modifierMasks: [],
  };
  const executionWithoutPlanning = {
    executionType: "p5-key-pyramid-continuous-execution",
    executionVersion: 1,
    target,
    route,
    replay,
    scheduling: {
      kind: "target-native-settled-tile-steps",
      moveSpacingNativeTicks: 4,
      finalExpectedNativeTick: terminalTriggerTick,
      maximumReplayTicks: 4_000,
    },
    sourceAudit: {
      constructionMethod: "manual-assisted",
      routeDerivation: "checked-facts-resource-search",
      donorAvailability: "paired",
      donorExposure: "full-input",
      replayBytesCopied: false,
      replayInputReadByGenerator: false,
    },
    boundariesOrder: "boundary-order",
    boundaries,
    joinsOrder: "subgoal-order",
    joins: subgoals.map(({ subgoalId }, index) => ({
      subgoalId,
      entryBoundaryOrder: index,
      stopBoundaryOrder: index + 1,
      state: "exact-same-run",
      entryExactFingerprint: boundaries[index]!.exactFingerprint,
      stopExactFingerprint: boundaries[index + 1]!.exactFingerprint,
    })),
    terminal: {
      kind: "won",
      nativeTick: terminalTriggerTick,
      coordinate: route.finalState.coordinate,
    },
  };
  const twsBytes = new Uint8Array(target === "ms" ? [1, 2, 3, 4] : [5, 6, 7, 8]);
  const replayContent = await referenceSourceBytes(twsBytes, sha256);
  const traceContent = await reference({
    target,
    nativeTick: traceSettledTerminalTick,
    result: "completed",
  });
  const reportWithoutPlan: Omit<KeyPyramidP5ReplayCertificationV1, "plan"> = {
    certificationType: "p5-key-pyramid-replay-certification",
    certificationVersion: 1,
    target,
    replay: {
      format: "tws",
      content: replayContent,
      setName: target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac",
      levelNumber: 1,
      password: "VVGF",
      bestTimeTicks: 700,
      moveCount: 162,
      payloadRoundTripExact: true,
      fullFileRoundTripExact: true,
    },
    verification: {
      typescript: {
        toolRevision: "tworld-typescript-replay:p5-v1",
        traceContent,
        result: "win",
        terminalTick: traceSettledTerminalTick,
      },
      nativeOracle: {
        toolRevision: "tworld-native-oracle-exact-file:p5-v1",
        traceContent,
        result: "win",
        terminalTick: traceSettledTerminalTick,
        isolatedSaveDirectory: true,
        solutionFilename: `${target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac"}.tws`,
        exactInputBytesRead: true,
      },
      exactTraceParity: true,
      mismatchCount: 0,
    },
  };
  const parentPacket = {
    previewType: "p3a-terminal-plan-review",
    previewVersion: 1,
    caseId: "cclp1-001",
    target,
    content: await reference({ target, planning: "unresolved" }),
    wholePlan: {
      status: "unresolved",
      reason: "p1-candidate-evidence-does-not-prove-dynamic-or-joint-reachability",
    },
  } as const;
  const parentText = json(parentPacket);
  const content = await referenceSourceBytes(encoder.encode(parentText), sha256);
  const source = {
    target,
    levelFacts: { facts: { payload: { level } } },
    levelFactsContent: await reference({ target, levelFacts: true }),
    mapContent: await referenceSourceBytes(encoder.encode("map"), sha256),
    seriesContent: await referenceSourceBytes(encoder.encode(target), sha256),
    mapPath: "data/CCLP1.dat",
    seriesFile: target === "ms" ? "CCLP1-MS.dac" : "CCLP1-Lynx.dac",
    runtimeProvenance: {
      adapterId: `adapter:${target}`,
      adapterRevision: "adapter:test",
      engineId: `engine:${target}`,
      engineRevision: "engine:test",
    },
  } as unknown as KeyPyramidRuntimeSource;
  const staticOverlay = {
    overlayType: "p5-key-pyramid-static-review-overlay",
    overlayVersion: 1,
    target,
    level,
    source: {
      levelFacts: source.levelFactsContent,
      staticAnalysis: await reference({ target, staticAnalysis: true }),
      topologyEvidence: await reference({ target, topologyEvidence: true }),
    },
    geometry: { width: 32, height: 32, depth: 1 },
    cellOrdinalFormula: "z*width*height+y*width+x",
    mapSceneAuthority: "boundary-0-exact-full-map-render",
    placements: [],
    actors: [],
    resources: { requiredCollectibles: [], sources: [], gates: [], exits: [] },
    regions: [],
    articulationPoints: [],
    boundaries: [],
    resourceDependencies: [],
    transports: [],
    attachments: { forcedSurfaces: [], hazards: [], exits: [] },
    uncertainties: [],
    features: {
      logicalCellCount: 1024,
      certainOpenCellCount: 0,
      blockedCellCount: 0,
      conditionalBoundaryCount: 0,
      dynamicBoundaryCount: 0,
      unknownBoundaryCount: 0,
      directedAdjacencyCount: 0,
      weakConnectionCount: 0,
      bidirectionalConnectionCount: 0,
      oneWayConnectionCount: 0,
      weakRegionCount: 0,
      articulationPointCount: 0,
      resourceGateCount: 0,
      resourceCandidateSourceCount: 0,
      transportNetworkCount: 0,
      transportIncidenceCount: 0,
      forcedSurfaceCount: 0,
      hazardCount: 0,
      exitCount: 0,
      uncertaintyCount: 0,
    },
  } as const;
  const authority = await buildKeyPyramidP5PlanningAuthority({
    source,
    route,
    parentP3: {
      path: `ccsolver/fixtures/golden/p3/cclp1-001/${target}/terminal-plan.json`,
      content,
      packet: parentPacket,
    },
    sha256,
  });
  const execution = {
    ...executionWithoutPlanning,
    planning: {
      plan: authority.planning.planReference,
      planContent: authority.planning.content,
      routeContent: authority.planning.routeContent,
      expandedPlanId: authority.planning.packet.expandedPlan.planId,
      decisionSource: authority.planning.packet.selectedRoute.decisionSource,
    },
  } as unknown as KeyPyramidP5ExecutionV1;
  const report: KeyPyramidP5ReplayCertificationV1 = {
    ...reportWithoutPlan,
    plan: authority.planning.planReference,
  };
  return {
    target,
    source,
    staticOverlay,
    route,
    ...authority,
    execution,
    certification: { twsBytes, report },
    parentP3: {
      path: `ccsolver/fixtures/golden/p3/cclp1-001/${target}/terminal-plan.json`,
      content,
      packet: parentPacket,
    },
  };
}

describe("P5 checked review output composition", () => {
  it("emits verified artifacts, exact TWS files, and twelve start/end review panels", async () => {
    const targets = await Promise.all([preparedTarget("ms"), preparedTarget("lynx")]);
    const outputs = await composeP5ReviewOutputs({
      targets: targets as [P5PreparedTarget, P5PreparedTarget],
      sha256,
    });

    expect(outputs).toHaveLength(33);
    expect(new Set(outputs.map(({ path }) => path)).size).toBe(outputs.length);
    expect(outputs.filter(({ mediaType }) => mediaType === "application/vnd.tworld.tws")).toHaveLength(2);
    expect(outputs.filter(({ path }) => path.includes("/boundaries/"))).toHaveLength(14);

    for (const output of outputs.filter(({ mediaType }) => mediaType === "application/json")) {
      expect(canonicalizeJson(JSON.parse(output.content as string))).toBe(output.content);
    }
    for (const boundary of outputs.filter(({ path }) => path.includes("/boundaries/"))) {
      const content = await referenceSourceBytes(encoder.encode(boundary.content as string), sha256);
      expect(boundary.path).toContain(content.digest.slice("sha256:".length));
    }

    const corpusOutput = outputs.find(({ path }) => path.endsWith("/corpus-case.v1.json"))!;
    const corpusArtifact = decodeCanonicalArtifact(corpusOutput.content as string);
    expect(corpusArtifact.artifactType).toBe("corpus-case");
    const corpus = corpusArtifact as CorpusCaseV1;
    expect(corpus.payload.targets.map(({ target }) => target)).toEqual(["ms", "lynx"]);
    expect(corpus.payload.targets.map(({ attempts }) => attempts[0]!.context)).toEqual([
      expect.objectContaining({
        donorAvailability: "paired",
        donorExposure: "full-input",
        constructionMethod: "manual-assisted",
      }),
      expect.objectContaining({
        donorAvailability: "paired",
        donorExposure: "full-input",
        constructionMethod: "manual-assisted",
      }),
    ]);

    for (const target of ["ms", "lynx"] as const) {
      const certificateOutput = outputs.find(({ path }) => (
        path.endsWith(`/${target}/replay-certificate.v1.json`)
      ))!;
      const certificateArtifact = decodeCanonicalArtifact(certificateOutput.content as string);
      expect(certificateArtifact.artifactType).toBe("replay-certificate");
      expect((certificateArtifact as ReplayCertificateV1).payload.plan).not.toBeNull();
      await verifyCertificateBundle(corpus, certificateArtifact as ReplayCertificateV1, sha256);

      const expandedPlanOutput = outputs.find(({ path }) => (
        path.endsWith(`/${target}/expanded-plan.v1.json`)
      ))!;
      const expandedPlan = decodeCanonicalArtifact(expandedPlanOutput.content as string);
      expect(expandedPlan).toMatchObject({
        artifactType: "expanded-plan",
        schemaVersion: 1,
        payload: {
          target,
          status: "candidate",
          document: { format: "p5-key-pyramid-terminal-rooted-planning-packet-v1" },
          selectedImplementation: { format: "p5-key-pyramid-route-v1" },
        },
      });
      expect(await identifyCanonicalJson(expandedPlanOutput.content as CanonicalJson, sha256)).toBe(
        (certificateArtifact as ReplayCertificateV1).payload.plan!.artifact.digest,
      );

      const witness = JSON.parse(outputs.find(({ path }) => (
        path.endsWith(`/${target}/execution-witness.json`)
      ))!.content as string) as Record<string, any>;
      expect(witness.status).toBe("continuous-certified-win");
      expect(witness.subgoals).toHaveLength(6);
      expect(witness.subgoals.every(({ starting, ending }: Record<string, any>) => (
        starting.boundaryOrder + 1 === ending.boundaryOrder
        && starting.support.path.includes("/boundaries/")
        && ending.support.path.includes("/boundaries/")
      ))).toBe(true);

      const plan = JSON.parse(outputs.find(({ path }) => (
        path.endsWith(`/${target}/plan.json`)
      ))!.content as string) as Record<string, any>;
      expect(plan.status).toBe("candidate");
      expect(plan.parentP3).toMatchObject({
        wholePlan: { status: "unresolved" },
        relationship: "historical-parent-preserved-not-upgraded",
        upgraded: false,
      });
      expect(plan.backwardTrace.map(({ routeEventOrder }: Record<string, any>) => routeEventOrder))
        .toEqual(Array.from({ length: 16 }, (_, index) => 15 - index));
      const door = plan.backwardTrace.find(({ semanticType }: Record<string, any>) => (
        semanticType === "cc1:door-red"
      ));
      const greenDoor = plan.backwardTrace.find(({ semanticType }: Record<string, any>) => (
        semanticType === "cc1:door-green"
      ));
      const socket = plan.backwardTrace.find(({ routeEventKind }: Record<string, any>) => (
        routeEventKind === "open-socket"
      ));
      const exit = plan.backwardTrace.find(({ routeEventKind }: Record<string, any>) => (
        routeEventKind === "reach-exit"
      ));
      expect(door).toMatchObject({
        chronologicalPreviousEventOrder: 11,
        obligation: "possess-and-consume-key-before-door",
        directPrerequisites: [{
          routeEventOrder: 0,
          relationship: "available-key-collection",
          resourceType: "cc1:key-red",
        }],
      });
      expect(greenDoor).toMatchObject({
        obligation: "possess-key-before-door",
        directPrerequisites: [{
          routeEventOrder: 1,
          relationship: "available-key-collection",
          resourceType: "cc1:key-green",
        }],
      });
      expect(socket.directPrerequisites).toHaveLength(10);
      expect(socket.directPrerequisites.every(({ relationship }: Record<string, any>) => (
        relationship === "required-chip-collection"
      ))).toBe(true);
      expect(exit.directPrerequisites).toEqual([{
        routeEventOrder: 14,
        relationship: "opened-socket",
        resourceType: "cc1:icchip",
      }]);
      expect(plan.backwardTrace.every((entry: Record<string, any>) => (
        !("requiresForwardPredecessorEventOrder" in entry)
      ))).toBe(true);
      expect(plan.expandedPlan.status).toBe("candidate");
      expect(plan.expandedPlan.steps).toHaveLength(plan.route.eventCount);
    }

    const manifest = JSON.parse(outputs.find(({ path }) => (
      path.endsWith("/manifest.json")
    ))!.content as string) as Record<string, any>;
    expect(manifest).toMatchObject({
      manifestType: "p5-key-pyramid-review-manifest",
      manifestVersion: 1,
      counts: {
        targets: 2,
        subgoalCapsules: 12,
        renderedPanelInstances: 24,
        boundaryFiles: 14,
        filesExcludingManifest: 32,
      },
      certification: {
        exactFullFileTws: true,
        typescriptAndNativeRequired: true,
        exactTraceParityRequired: true,
        certificateBundlesVerified: true,
      },
    });
    expect(manifest.targets.every(({ panels }: Record<string, any>) => panels.length === 6)).toBe(true);

    const review = outputs.find(({ path }) => path.endsWith("/review.md"))!.content as string;
    expect(review).toContain("not donor-blind");
    expect(review).toContain("generated TWS bytes were not copied from or read from donor replay bytes");
    expect(review).toContain("12 paired start/end panel sets (24 rendered panel instances)");
    expect(review).toContain("647 / 660");
  });

  it("binds one genuine pre-execution expanded plan through witness, certificate, and corpus", async () => {
    const targets = await Promise.all([preparedTarget("ms"), preparedTarget("lynx")]);
    const outputs = await composeP5ReviewOutputs({
      targets: targets as [P5PreparedTarget, P5PreparedTarget],
      sha256,
    });
    const corpus = decodeCanonicalArtifact(outputs.find(({ path }) => (
      path.endsWith("/corpus-case.v1.json")
    ))!.content as string) as CorpusCaseV1;
    expect(corpus.payload.targets.every(({ attempts }) => attempts[0]!.plan !== null)).toBe(true);
    for (const target of ["ms", "lynx"] as const) {
      const certificate = decodeCanonicalArtifact(outputs.find(({ path }) => (
        path.endsWith(`/${target}/replay-certificate.v1.json`)
      ))!.content as string) as ReplayCertificateV1;
      expect(certificate.payload.plan).not.toBeNull();
      const witness = JSON.parse(outputs.find(({ path }) => (
        path.endsWith(`/${target}/execution-witness.json`)
      ))!.content as string) as Record<string, any>;
      expect(witness.plan).toMatchObject({
        file: {
          path: expect.stringMatching(/\/plan\.json$/),
          mediaType: "application/json",
          content: { digest: expect.stringMatching(/^sha256:/), byteLength: expect.any(Number) },
        },
        artifactFile: {
          path: expect.stringMatching(/\/expanded-plan\.v1\.json$/),
          mediaType: "application/json",
          content: { digest: expect.stringMatching(/^sha256:/), byteLength: expect.any(Number) },
        },
        reference: {
          artifact: { artifactType: "expanded-plan" },
          goalId: expect.stringMatching(/^goal:/),
          subgoalId: null,
        },
      });
      const attempt = corpus.payload.targets.find((candidate) => candidate.target === target)!
        .attempts[0]!;
      expect(witness.plan.reference).toEqual(certificate.payload.plan);
      expect(attempt.plan).toEqual(certificate.payload.plan);
      expect(witness.plan.artifactFile.content.digest).toBe(certificate.payload.plan!.artifact.digest);
    }
  });

  it("constructs a terminal-rooted 29-event candidate before execution and rejects tampering", async () => {
    const [source, fake] = await Promise.all([
      loadKeyPyramidRuntimeSource(repositoryRoot, "ms"),
      preparedTarget("ms"),
    ]);
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const authority = await buildKeyPyramidP5PlanningAuthority({
      source,
      route,
      parentP3: fake.parentP3,
      sha256,
    });
    const planning = authority.planning;

    expect(route.events).toHaveLength(29);
    expect(planning.packet.status).toBe("candidate");
    expect(planning.packet.expandedPlan).toMatchObject({
      previewVersion: 1,
      target: "ms",
      status: "candidate",
      stepsOrder: "forward-prerequisite-first",
      unresolved: [],
    });
    expect(planning.packet.expandedPlan.steps).toHaveLength(29);
    expect(planning.packet.expandedPlan.steps.map(({ kind }) => kind)).toEqual(
      route.events.map(({ kind }) => {
        if (kind === "collect-key" || kind === "collect-chip") return "collect";
        if (kind === "open-door" || kind === "open-socket") return "unlock";
        return "reach-exit";
      }),
    );
    for (const [eventOrder, event] of route.events.entries()) {
      const step = planning.packet.expandedPlan.steps[eventOrder]!;
      expect(step.achieves.kind).toBe(step.kind);
      if (event.kind === "collect-key" || event.kind === "collect-chip") {
        expect(step.achieves).toEqual({
          kind: "collect",
          resourceType: event.resourceType,
          amount: 1,
          collectionOccurrenceId: `collection:${event.placementId}`,
          sourcePlacementId: event.placementId,
        });
      } else if (event.kind === "open-door" || event.kind === "open-socket") {
        expect(step.achieves).toMatchObject({ kind: "unlock", gateId: event.placementId });
      } else {
        expect(step.achieves).toEqual({ kind: "reach-exit", exitId: event.placementId });
      }
    }
    const ledgerRemaining = new Map(planning.packet.expandedPlan.stateLedger.map((entry) => (
      [`${entry.axis}:${entry.resourceType}`, entry.remaining]
    )));
    expect(ledgerRemaining.get("remaining-requirement:cc1:icchip")).toBe(0);
    expect(ledgerRemaining.get("inventory:cc1:key-red")).toBe(route.finalState.inventory.red);
    expect(ledgerRemaining.get("inventory:cc1:key-blue")).toBe(route.finalState.inventory.blue);
    expect(ledgerRemaining.get("inventory:cc1:key-yellow")).toBe(route.finalState.inventory.yellow);
    expect(ledgerRemaining.get("inventory:cc1:key-green")).toBe(route.finalState.inventory.green);
    expect(planning.packet.selectedRoute.eventSteps.map(({ routeEventOrder }: Record<string, any>) => (
      routeEventOrder
    ))).toEqual(Array.from({ length: 29 }, (_, index) => index));
    expect(planning.packet.terminalRootedTraversal).toMatchObject({
      rootRouteEventOrder: 28,
      visitedEventOrders: Array.from({ length: 29 }, (_, index) => 28 - index),
      allSelectedRouteEventsReachable: true,
    });
    expect(planning.planReference).toMatchObject({
      artifact: { artifactType: "expanded-plan", schemaVersion: 1 },
      goalId: expect.stringMatching(/^goal:/),
      subgoalId: null,
    });
    expect(await identifyCanonicalJson(authority.expandedPlanCanonicalJson, sha256)).toBe(
      planning.planReference.artifact.digest,
    );
    expect(authority.expandedPlan.payload.document.content).toEqual(planning.content);
    expect(authority.expandedPlan.payload.selectedImplementation?.content).toEqual(
      planning.routeContent,
    );
    expect(planning.packet.route.content).toEqual(planning.routeContent);
    expect(planning.content).toMatchObject({
      digest: expect.stringMatching(/^sha256:/),
      byteLength: expect.any(Number),
    });
    await expect(assertKeyPyramidP5PlanningBundle(planning, sha256)).resolves.toBeUndefined();

    const tampered = {
      ...planning,
      packet: {
        ...planning.packet,
        selectedRoute: {
          ...planning.packet.selectedRoute,
          tileSteps: planning.packet.selectedRoute.tileSteps.map((step, index) => (
            index === 0 ? { ...step, inputCode: step.inputCode + 1 } : step
          )),
        },
      },
    };
    await expect(assertKeyPyramidP5PlanningBundle(tampered, sha256))
      .rejects.toThrow(/planning bundle.*drifted|plan content.*drifted/i);

    const routeTampered = {
      ...planning,
      route: {
        ...planning.route,
        tileSteps: planning.route.tileSteps.map((step, index) => (
          index === 0 ? { ...step, inputCode: step.inputCode + 1 } : step
        )),
      },
    };
    await expect(assertKeyPyramidP5PlanningBundle(routeTampered, sha256))
      .rejects.toThrow(/planning bundle.*drifted|plan content.*drifted/i);
  }, 30_000);

  it("constructs and binds plan authority before execution, then certifies that exact plan", async () => {
    const prepared = await preparedTarget("ms");
    const calls: string[] = [];
    const run = await buildKeyPyramidP5PlannedRun({
      repositoryRoot,
      oraclePath: resolve(repositoryRoot, "build-verify/legacy_c/tworld-oracle"),
      source: prepared.source,
      route: prepared.route,
      parentP3: prepared.parentP3,
      sha256,
      dependencies: {
        buildExecution: async (_source, planning) => {
          calls.push("execute");
          expect(planning.planReference.artifact.artifactType).toBe("expanded-plan");
          return {
            ...prepared.execution,
            planning: {
              plan: planning.planReference,
              planContent: planning.content,
              routeContent: planning.routeContent,
              expandedPlanId: planning.packet.expandedPlan.planId,
              decisionSource: planning.packet.selectedRoute.decisionSource,
            },
          };
        },
        certifyReplay: async (input) => {
          calls.push("certify");
          expect(calls).toEqual(["execute", "certify"]);
          return {
            twsBytes: prepared.certification.twsBytes,
            report: { ...prepared.certification.report, plan: input.plan },
          };
        },
      },
    });

    expect(calls).toEqual(["execute", "certify"]);
    expect(run.execution.planning.plan).toEqual(run.planning.planReference);
    expect(run.certification.report.plan).toEqual(run.planning.planReference);
    expect(run.expandedPlan.payload.document.content).toEqual(run.planning.content);
    expect(run.expandedPlan.payload.selectedImplementation?.content).toEqual(
      run.planning.routeContent,
    );
  });

  it("refuses solved-current composition when continuous execution is not won", async () => {
    const ms = await preparedTarget("ms");
    const lynx = await preparedTarget("lynx");
    const invalid = {
      ...ms,
      execution: {
        ...ms.execution,
        terminal: { ...ms.execution.terminal, kind: "running" },
      } as KeyPyramidP5ExecutionV1,
    };
    await expect(composeP5ReviewOutputs({ targets: [invalid, lynx], sha256 }))
      .rejects.toThrow(/solved-current.*continuous certified win/i);
  });

  it("hard-fails a missing required oracle before invoking expensive target builders", async () => {
    const root = await mkdtemp(join(tmpdir(), "tworld-p5-missing-oracle-"));
    const buildTarget = vi.fn();
    try {
      await expect(buildP5ReviewOutputs(root, {
        oraclePath: join(root, "missing-oracle"),
        buildTarget,
      })).rejects.toThrow(/native oracle is required and unavailable/i);
      expect(buildTarget).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
