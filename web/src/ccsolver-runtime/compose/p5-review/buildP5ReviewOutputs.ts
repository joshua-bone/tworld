import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { StaticAnalysisV1 } from "@tworld/ccsolver/analyze";
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
  type ArtifactReferenceV1,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
  type CorpusCaseV1,
  type ExpandedPlanArtifactV1,
  type LevelFactsPayloadV1,
  type PlanReferenceV1,
  type ReplayCertificateV1,
  type RulesetTargetV1,
} from "@tworld/ccsolver/domain";
import {
  KEY_PYRAMID_CASE_ID,
  loadKeyPyramidRuntimeSource,
  loadKeyPyramidStaticSource,
  type KeyPyramidRuntimeSource,
  type KeyPyramidStaticSource,
} from "../p3-review/keyPyramidP3Source";
import {
  buildKeyPyramidP5Execution,
  type KeyPyramidP5ExecutionBoundaryV1,
  type KeyPyramidP5ExecutionV1,
} from "./buildKeyPyramidP5Execution";
import {
  assertKeyPyramidP5PlanningBundle,
  bindKeyPyramidP5ExpandedPlanReference,
  buildKeyPyramidP5Plan,
  type BoundKeyPyramidP5PlanningBundle,
  type KeyPyramidP5ParentPlanV1,
  type KeyPyramidP5PlanV1,
} from "./buildKeyPyramidP5Plan";
import {
  buildKeyPyramidP5Route,
  type KeyPyramidP5RouteV1,
} from "./buildKeyPyramidP5Route";
import {
  certifyKeyPyramidP5Replay,
  type KeyPyramidP5ReplayCertificationV1,
} from "./certifyKeyPyramidP5Replay";

const OUTPUT_ROOT = `ccsolver/fixtures/golden/p5/${KEY_PYRAMID_CASE_ID}` as const;
const PRODUCER_REVISION = "ccsolver:p5-key-pyramid-certified-review:v1" as const;
const ATTEMPT_BUDGET_REVISION = "ccsolver:p5-key-pyramid-bounded-route:v1" as const;
const ATTEMPT_SOLVER_REVISION = "ccsolver:p5-key-pyramid-manual-assisted:v1" as const;
const encoder = new TextEncoder();

export type P5ReviewOutput = {
  readonly path: string;
  readonly content: string | Uint8Array;
  readonly mediaType:
    | "application/json"
    | "text/markdown"
    | "application/vnd.tworld.tws";
};

export type KeyPyramidP5StaticOverlayV1 = {
  readonly overlayType: "p5-key-pyramid-static-review-overlay";
  readonly overlayVersion: 1;
  readonly target: RulesetTargetV1;
  readonly level: KeyPyramidP5RouteV1["level"];
  readonly source: {
    readonly levelFacts: BlobReferenceV1;
    readonly staticAnalysis: BlobReferenceV1;
    readonly topologyEvidence: BlobReferenceV1;
  };
  readonly geometry: LevelFactsPayloadV1["geometry"];
  readonly cellOrdinalFormula: "z*width*height+y*width+x";
  readonly mapSceneAuthority: "boundary-0-exact-full-map-render";
  readonly placements: LevelFactsPayloadV1["placements"];
  readonly actors: LevelFactsPayloadV1["actors"];
  readonly resources: {
    readonly requiredCollectibles: LevelFactsPayloadV1["requiredCollectibles"];
    readonly sources: LevelFactsPayloadV1["resourceSources"];
    readonly gates: LevelFactsPayloadV1["resourceGates"];
    readonly exits: LevelFactsPayloadV1["exits"];
  };
  readonly regions: StaticAnalysisV1["regions"];
  readonly articulationPoints: StaticAnalysisV1["articulationPoints"];
  readonly boundaries: StaticAnalysisV1["boundaries"];
  readonly resourceDependencies: StaticAnalysisV1["resourceDependencies"];
  readonly transports: StaticAnalysisV1["transports"];
  readonly attachments: StaticAnalysisV1["attachments"];
  readonly uncertainties: StaticAnalysisV1["uncertainties"];
  readonly features: StaticAnalysisV1["features"];
};

export type P5PreparedTarget = {
  readonly target: RulesetTargetV1;
  readonly source: KeyPyramidRuntimeSource;
  readonly staticOverlay: KeyPyramidP5StaticOverlayV1;
  readonly route: KeyPyramidP5RouteV1;
  readonly planning: BoundKeyPyramidP5PlanningBundle;
  readonly expandedPlan: ExpandedPlanArtifactV1;
  readonly expandedPlanCanonicalJson: CanonicalJson;
  readonly execution: KeyPyramidP5ExecutionV1;
  readonly certification: {
    readonly twsBytes: Uint8Array;
    readonly report: KeyPyramidP5ReplayCertificationV1;
  };
  readonly parentP3: KeyPyramidP5ParentPlanV1;
};

export type P5TargetBuilder = (input: {
  readonly repositoryRoot: string;
  readonly oraclePath: string;
  readonly target: RulesetTargetV1;
  readonly sha256: WebCryptoSha256;
}) => Promise<P5PreparedTarget>;

type CheckedFile = {
  readonly path: string;
  readonly mediaType: P5ReviewOutput["mediaType"];
  readonly content: BlobReferenceV1;
};

type BoundaryFile = {
  readonly output: P5ReviewOutput;
  readonly checkedFile: CheckedFile;
  readonly boundary: KeyPyramidP5ExecutionBoundaryV1;
};

type TargetComposition = {
  readonly prepared: P5PreparedTarget;
  readonly plan: KeyPyramidP5PlanV1;
  readonly certificate: ReplayCertificateV1;
  readonly certificateJson: string;
  readonly certificateReference: ArtifactReferenceV1<"replay-certificate", 1>;
  readonly boundaryFiles: readonly BoundaryFile[];
  readonly witness: Record<string, any>;
  readonly outputs: readonly P5ReviewOutput[];
  readonly files: Readonly<Record<string, CheckedFile>>;
};

function json(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function bytes(content: string | Uint8Array): Uint8Array {
  return typeof content === "string" ? encoder.encode(content) : content;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function referencesEqual(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

async function checkedFile(
  output: P5ReviewOutput,
  sha256: WebCryptoSha256,
): Promise<CheckedFile> {
  return {
    path: output.path,
    mediaType: output.mediaType,
    content: await referenceSourceBytes(bytes(output.content), sha256),
  };
}

function buildStaticOverlay(source: KeyPyramidStaticSource): KeyPyramidP5StaticOverlayV1 {
  const facts = source.levelFacts.payload;
  const relevantIds = new Set([
    ...facts.resourceSources.map(({ placementId }) => placementId),
    ...facts.resourceGates.map(({ placementId }) => placementId),
    ...facts.exits,
    ...facts.actors.map(({ descriptor }) => descriptor.placementId),
  ]);
  return {
    overlayType: "p5-key-pyramid-static-review-overlay",
    overlayVersion: 1,
    target: source.target,
    level: facts.level,
    source: {
      levelFacts: source.levelFactsContent,
      staticAnalysis: source.staticAnalysisContent,
      topologyEvidence: source.staticAnalysis.topologyEvidence,
    },
    geometry: facts.geometry,
    cellOrdinalFormula: "z*width*height+y*width+x",
    mapSceneAuthority: "boundary-0-exact-full-map-render",
    placements: facts.placements.filter(({ placementId }) => relevantIds.has(placementId)),
    actors: facts.actors,
    resources: {
      requiredCollectibles: facts.requiredCollectibles,
      sources: facts.resourceSources,
      gates: facts.resourceGates,
      exits: facts.exits,
    },
    regions: source.staticAnalysis.regions,
    articulationPoints: source.staticAnalysis.articulationPoints,
    boundaries: source.staticAnalysis.boundaries,
    resourceDependencies: source.staticAnalysis.resourceDependencies,
    transports: source.staticAnalysis.transports,
    attachments: source.staticAnalysis.attachments,
    uncertainties: source.staticAnalysis.uncertainties,
    features: source.staticAnalysis.features,
  };
}

function assertStaticOverlay(prepared: P5PreparedTarget): void {
  const overlay = prepared.staticOverlay;
  if (
    overlay.overlayType !== "p5-key-pyramid-static-review-overlay"
    || overlay.target !== prepared.target
    || overlay.geometry.width !== 32
    || overlay.geometry.height !== 32
    || overlay.geometry.depth !== 1
    || overlay.mapSceneAuthority !== "boundary-0-exact-full-map-render"
    || overlay.source.levelFacts.digest !== prepared.source.levelFactsContent.digest
  ) {
    throw new Error(`${prepared.target} P5 static overlay is not bound to the checked source`);
  }
}

async function readParentP3(
  repositoryRoot: string,
  target: RulesetTargetV1,
  sha256: WebCryptoSha256,
): Promise<KeyPyramidP5ParentPlanV1> {
  const path = `ccsolver/fixtures/golden/p3/${KEY_PYRAMID_CASE_ID}/${target}/terminal-plan.json`;
  const fileBytes = new Uint8Array(await readFile(resolve(repositoryRoot, path)));
  const text = new TextDecoder().decode(fileBytes);
  const parsed = JSON.parse(text) as KeyPyramidP5ParentPlanV1["packet"];
  if (json(parsed) !== text) {
    throw new Error(`${target} checked P3 parent plan is not canonical JSON`);
  }
  if (
    parsed.previewType !== "p3a-terminal-plan-review"
    || parsed.previewVersion !== 1
    || parsed.caseId !== KEY_PYRAMID_CASE_ID
    || parsed.target !== target
    || parsed.wholePlan?.status !== "unresolved"
  ) {
    throw new Error(`${target} checked P3 parent plan identity drifted`);
  }
  return {
    path,
    content: await referenceSourceBytes(fileBytes, sha256),
    packet: parsed,
  };
}

export type KeyPyramidP5PlanningAuthorityV1 = {
  readonly planning: BoundKeyPyramidP5PlanningBundle;
  readonly expandedPlan: ExpandedPlanArtifactV1;
  readonly expandedPlanCanonicalJson: CanonicalJson;
};

export async function buildKeyPyramidP5PlanningAuthority(input: {
  readonly source: KeyPyramidRuntimeSource;
  readonly route: KeyPyramidP5RouteV1;
  readonly parentP3: KeyPyramidP5ParentPlanV1;
  readonly sha256?: WebCryptoSha256;
}): Promise<KeyPyramidP5PlanningAuthorityV1> {
  const sha256 = input.sha256 ?? new WebCryptoSha256();
  if (
    input.source.target !== input.route.target
    || json(input.source.levelFacts.facts.payload.level) !== json(input.route.level)
  ) {
    throw new Error(`${input.route.target} P5 planning authority source binding drifted`);
  }
  const planningDocument = await buildKeyPyramidP5Plan({
    route: input.route,
    parentP3: input.parentP3,
  }, sha256);
  const root = planningDocument.packet.planning.graph.roots[0];
  const selected = planningDocument.packet.expandedPlan;
  if (
    root === undefined
    || root.rootId !== selected.rootId
    || root.exitId !== selected.exitId
    || selected.status !== "candidate"
  ) {
    throw new Error(`${input.route.target} P5 selected terminal-first root drifted`);
  }
  const expandedPlan: ExpandedPlanArtifactV1 = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "expanded-plan",
    schemaVersion: 1,
    payload: {
      producerRevision: PRODUCER_REVISION,
      caseId: KEY_PYRAMID_CASE_ID,
      level: input.route.level,
      target: input.route.target,
      planId: selected.planId,
      rootId: selected.rootId,
      goalId: root.goalId,
      exitId: selected.exitId,
      status: selected.status,
      document: {
        format: "p5-key-pyramid-terminal-rooted-planning-packet-v1",
        content: planningDocument.content,
      },
      selectedImplementation: {
        format: "p5-key-pyramid-route-v1",
        content: planningDocument.routeContent,
      },
      lineage: [levelFactsArtifact(input.source)],
    },
  };
  const expandedPlanCanonicalJson = encodeArtifact(expandedPlan);
  const decoded = decodeCanonicalArtifact(expandedPlanCanonicalJson);
  if (decoded.artifactType !== "expanded-plan") {
    throw new Error(`${input.route.target} P5 expanded-plan envelope did not round-trip`);
  }
  const planReference: PlanReferenceV1 = {
    artifact: {
      protocolVersion: 1,
      artifactType: "expanded-plan",
      schemaVersion: 1,
      digest: await identifyCanonicalJson(expandedPlanCanonicalJson, sha256),
    },
    goalId: root.goalId,
    subgoalId: null,
  };
  const planning = await bindKeyPyramidP5ExpandedPlanReference(
    planningDocument,
    planReference,
    sha256,
  );
  return { planning, expandedPlan, expandedPlanCanonicalJson };
}

export type P5PlannedRunDependencies = {
  readonly buildExecution?: typeof buildKeyPyramidP5Execution;
  readonly certifyReplay?: typeof certifyKeyPyramidP5Replay;
};

/**
 * The single authority seam for a P5 run: the route and terminal-first plan
 * become a content-addressed root before either runtime execution or replay
 * certification can be invoked.
 */
export async function buildKeyPyramidP5PlannedRun(input: {
  readonly repositoryRoot: string;
  readonly oraclePath: string;
  readonly source: KeyPyramidRuntimeSource;
  readonly route: KeyPyramidP5RouteV1;
  readonly parentP3: KeyPyramidP5ParentPlanV1;
  readonly sha256?: WebCryptoSha256;
  readonly dependencies?: P5PlannedRunDependencies;
}): Promise<Pick<
  P5PreparedTarget,
  "planning" | "expandedPlan" | "expandedPlanCanonicalJson" | "execution" | "certification"
>> {
  const sha256 = input.sha256 ?? new WebCryptoSha256();
  const authority = await buildKeyPyramidP5PlanningAuthority({
    source: input.source,
    route: input.route,
    parentP3: input.parentP3,
    sha256,
  });
  const execution = await (input.dependencies?.buildExecution ?? buildKeyPyramidP5Execution)(
    input.source,
    authority.planning,
    sha256,
  );
  if (
    json(execution.planning.plan) !== json(authority.planning.planReference)
    || !referencesEqual(execution.planning.planContent, authority.planning.content)
    || !referencesEqual(execution.planning.routeContent, authority.planning.routeContent)
  ) {
    throw new Error(`${input.route.target} P5 execution did not retain its planning authority`);
  }
  const certification = await (input.dependencies?.certifyReplay ?? certifyKeyPyramidP5Replay)({
    repositoryRoot: input.repositoryRoot,
    oraclePath: input.oraclePath,
    source: input.source,
    replay: execution.replay,
    plan: authority.planning.planReference,
    sha256,
  });
  if (json(certification.report.plan) !== json(authority.planning.planReference)) {
    throw new Error(`${input.route.target} P5 certification did not retain its planning authority`);
  }
  return { ...authority, execution, certification };
}

async function buildLiveTarget(input: {
  readonly repositoryRoot: string;
  readonly oraclePath: string;
  readonly target: RulesetTargetV1;
  readonly sha256: WebCryptoSha256;
}): Promise<P5PreparedTarget> {
  const [source, staticSource, parentP3] = await Promise.all([
    loadKeyPyramidRuntimeSource(input.repositoryRoot, input.target, input.sha256),
    loadKeyPyramidStaticSource(input.repositoryRoot, input.target, input.sha256),
    readParentP3(input.repositoryRoot, input.target, input.sha256),
  ]);
  if (
    source.levelFactsContent.digest !== staticSource.levelFactsContent.digest
    || source.target !== staticSource.target
  ) {
    throw new Error(`${input.target} P5 runtime/static source binding drifted`);
  }
  const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
  const plannedRun = await buildKeyPyramidP5PlannedRun({
    repositoryRoot: input.repositoryRoot,
    oraclePath: input.oraclePath,
    source,
    route,
    parentP3,
    sha256: input.sha256,
  });
  return {
    target: input.target,
    source,
    staticOverlay: buildStaticOverlay(staticSource),
    route,
    ...plannedRun,
    parentP3,
  };
}

async function buildBoundaryFiles(
  prepared: P5PreparedTarget,
  sha256: WebCryptoSha256,
): Promise<readonly BoundaryFile[]> {
  return Promise.all(prepared.execution.boundaries.map(async (boundary) => {
    const [observationContent, renderContent] = await Promise.all([
      referenceCanonicalJson(json(boundary.observation) as CanonicalJson, sha256),
      referenceCanonicalJson(json(boundary.render) as CanonicalJson, sha256),
    ]);
    if (
      !referencesEqual(observationContent, boundary.observationContent)
      || !referencesEqual(renderContent, boundary.renderContent)
    ) {
      throw new Error(
        `${prepared.target} P5 boundary ${boundary.boundaryOrder} full scene bytes drifted`,
      );
    }
    const document = {
      boundaryType: "p5-key-pyramid-full-scene-boundary",
      boundaryVersion: 1,
      target: prepared.target,
      executionType: prepared.execution.executionType,
      boundaryOrder: boundary.boundaryOrder,
      boundaryKind: boundary.boundaryKind,
      subgoalId: boundary.subgoalId,
      nativeTick: boundary.nativeTick,
      coordinate: boundary.coordinate,
      remainingChips: boundary.remainingChips,
      terminalKind: boundary.terminalKind,
      exactFingerprint: boundary.exactFingerprint,
      observationContent: boundary.observationContent,
      renderContent: boundary.renderContent,
      observation: boundary.observation,
      render: boundary.render,
    };
    const content = json(document);
    const contentReference = await referenceSourceBytes(encoder.encode(content), sha256);
    const digest = contentReference.digest.slice("sha256:".length);
    const path = `${OUTPUT_ROOT}/${prepared.target}/boundaries/`
      + `${String(boundary.boundaryOrder).padStart(2, "0")}-${digest}.json`;
    const output: P5ReviewOutput = { path, content, mediaType: "application/json" };
    return {
      output,
      checkedFile: { path, mediaType: output.mediaType, content: contentReference },
      boundary,
    };
  }));
}

function levelFactsArtifact(
  source: KeyPyramidRuntimeSource,
): ArtifactReferenceV1<"level-facts", 1> {
  return {
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    digest: source.levelFactsContent.digest,
  };
}

function attemptId(target: RulesetTargetV1): string {
  return `attempt:key-pyramid:${target}:p5-certified`;
}

async function assertPreparedPlanningAuthority(
  prepared: P5PreparedTarget,
  sha256: WebCryptoSha256,
): Promise<void> {
  await assertKeyPyramidP5PlanningBundle(prepared.planning, sha256);
  const expandedPlanCanonicalJson = encodeArtifact(prepared.expandedPlan);
  const expandedPlanDigest = await identifyCanonicalJson(expandedPlanCanonicalJson, sha256);
  const reference = prepared.planning.planReference;
  const root = prepared.planning.packet.planning.graph.roots[0];
  const implementation = prepared.expandedPlan.payload.selectedImplementation;
  if (
    expandedPlanCanonicalJson !== prepared.expandedPlanCanonicalJson
    || expandedPlanDigest !== reference.artifact.digest
    || reference.artifact.artifactType !== "expanded-plan"
    || reference.artifact.schemaVersion !== 1
    || prepared.expandedPlan.payload.caseId !== KEY_PYRAMID_CASE_ID
    || prepared.expandedPlan.payload.target !== prepared.target
    || json(prepared.expandedPlan.payload.level) !== json(prepared.route.level)
    || prepared.expandedPlan.payload.goalId !== reference.goalId
    || prepared.expandedPlan.payload.rootId !== root?.rootId
    || prepared.expandedPlan.payload.planId !== prepared.planning.packet.expandedPlan.planId
    || prepared.expandedPlan.payload.exitId !== prepared.planning.packet.expandedPlan.exitId
    || prepared.expandedPlan.payload.status !== "candidate"
    || prepared.expandedPlan.payload.document.format
      !== "p5-key-pyramid-terminal-rooted-planning-packet-v1"
    || !referencesEqual(
      prepared.expandedPlan.payload.document.content,
      prepared.planning.content,
    )
    || implementation?.format !== "p5-key-pyramid-route-v1"
    || !referencesEqual(implementation.content, prepared.planning.routeContent)
    || json(prepared.execution.planning.plan) !== json(reference)
    || json(prepared.certification.report.plan) !== json(reference)
  ) {
    throw new Error(`${prepared.target} P5 expanded-plan authority binding drifted`);
  }
}

function assertSolvedCurrentInputs(prepared: P5PreparedTarget): void {
  const finalBoundary = prepared.execution.boundaries.at(-1);
  const verification = prepared.certification.report.verification;
  if (
    prepared.execution.terminal.kind !== "won"
    || prepared.route.finalState.remainingChips !== 0
    || prepared.execution.boundaries.length !== 7
    || prepared.execution.joins.length !== 6
    || finalBoundary?.terminalKind !== "won"
    || finalBoundary.remainingChips !== 0
    || verification.typescript.result !== "win"
    || verification.nativeOracle.result !== "win"
    || verification.typescript.terminalTick !== verification.nativeOracle.terminalTick
    || verification.exactTraceParity !== true
    || verification.mismatchCount !== 0
  ) {
    throw new Error(
      `${prepared.target} P5 solved-current status requires one continuous certified win`,
    );
  }
}

async function composeTarget(
  prepared: P5PreparedTarget,
  sha256: WebCryptoSha256,
): Promise<TargetComposition> {
  if (
    prepared.target !== prepared.route.target
    || prepared.target !== prepared.execution.target
    || prepared.target !== prepared.certification.report.target
  ) {
    throw new Error(`${prepared.target} P5 prepared target bindings disagree`);
  }
  assertStaticOverlay(prepared);
  assertSolvedCurrentInputs(prepared);
  await assertPreparedPlanningAuthority(prepared, sha256);
  const replayContent = await referenceSourceBytes(prepared.certification.twsBytes, sha256);
  if (!referencesEqual(replayContent, prepared.certification.report.replay.content)) {
    throw new Error(`${prepared.target} P5 certification does not reference the exact TWS bytes`);
  }
  const plan = prepared.planning.packet;
  const planJson = prepared.planning.packetCanonicalJson;
  const certificate: ReplayCertificateV1 = {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "replay-certificate",
    schemaVersion: 1,
    payload: {
      caseId: KEY_PYRAMID_CASE_ID,
      producerRevision: PRODUCER_REVISION,
      level: prepared.route.level,
      target: prepared.target,
      attemptId: attemptId(prepared.target),
      replay: { format: "tws", content: replayContent },
      plan: prepared.planning.planReference,
      verifications: {
        typescript: {
          toolRevision: prepared.certification.report.verification.typescript.toolRevision,
          result: "win",
          terminalTick: prepared.certification.report.verification.typescript.terminalTick,
        },
        nativeOracle: {
          toolRevision: prepared.certification.report.verification.nativeOracle.toolRevision,
          result: "win",
          terminalTick: prepared.certification.report.verification.nativeOracle.terminalTick,
        },
      },
      lineage: [levelFactsArtifact(prepared.source)],
    },
  };
  const certificateJson = encodeArtifact(certificate);
  const certificateDigest = await identifyCanonicalJson(certificateJson, sha256);
  const certificateReference: ArtifactReferenceV1<"replay-certificate", 1> = {
    protocolVersion: 1,
    artifactType: "replay-certificate",
    schemaVersion: 1,
    digest: certificateDigest,
  };
  const boundaryFiles = await buildBoundaryFiles(prepared, sha256);
  const routeOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/route.json`,
    content: json(prepared.route),
    mediaType: "application/json",
  };
  const planOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/plan.json`,
    content: planJson,
    mediaType: "application/json",
  };
  const expandedPlanOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/expanded-plan.v1.json`,
    content: prepared.expandedPlanCanonicalJson,
    mediaType: "application/json",
  };
  const overlayOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/static-overlay.json`,
    content: json(prepared.staticOverlay),
    mediaType: "application/json",
  };
  const certificationOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/replay-certification.json`,
    content: json(prepared.certification.report),
    mediaType: "application/json",
  };
  const certificateOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/replay-certificate.v1.json`,
    content: certificateJson,
    mediaType: "application/json",
  };
  const twsOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/key-pyramid-${prepared.target}.tws`,
    content: prepared.certification.twsBytes,
    mediaType: "application/vnd.tworld.tws",
  };
  const fixedFiles = await Promise.all([
    checkedFile(routeOutput, sha256),
    checkedFile(planOutput, sha256),
    checkedFile(expandedPlanOutput, sha256),
    checkedFile(overlayOutput, sha256),
    checkedFile(certificationOutput, sha256),
    checkedFile(certificateOutput, sha256),
    checkedFile(twsOutput, sha256),
  ]);
  const [
    routeFile,
    planFile,
    expandedPlanFile,
    overlayFile,
    certificationFile,
    certificateFile,
    twsFile,
  ] = fixedFiles;
  if (
    !referencesEqual(routeFile!.content, prepared.planning.routeContent)
    || !referencesEqual(planFile!.content, prepared.planning.content)
    || expandedPlanFile!.content.digest !== prepared.planning.planReference.artifact.digest
  ) {
    throw new Error(`${prepared.target} P5 checked planning files drifted from their authority`);
  }
  const compactBoundaries = boundaryFiles.map(({ boundary, checkedFile: support }) => ({
    boundaryOrder: boundary.boundaryOrder,
    boundaryKind: boundary.boundaryKind,
    subgoalId: boundary.subgoalId,
    nativeTick: boundary.nativeTick,
    coordinate: boundary.coordinate,
    remainingChips: boundary.remainingChips,
    terminalKind: boundary.terminalKind,
    exactFingerprint: boundary.exactFingerprint,
    observationContent: boundary.observationContent,
    renderContent: boundary.renderContent,
    support,
  }));
  const witness = {
    witnessType: "p5-key-pyramid-continuous-execution-witness",
    witnessVersion: 1,
    caseId: KEY_PYRAMID_CASE_ID,
    target: prepared.target,
    status: "continuous-certified-win",
    route: routeFile,
    plan: {
      file: planFile,
      artifactFile: expandedPlanFile,
      reference: prepared.planning.planReference,
    },
    staticOverlay: overlayFile,
    replay: {
      ...twsFile,
      format: "tws",
      moveCount: prepared.execution.replay.moves.length,
      fullFileRoundTripExact: true,
    },
    certification: {
      report: certificationFile,
      certificate: certificateFile,
      certificateArtifact: certificateReference,
      exactTraceParity: true,
    },
    sourceAudit: prepared.execution.sourceAudit,
    scheduling: prepared.execution.scheduling,
    p4bSelfContainedScenes: {
      fullMapGeometry: prepared.staticOverlay.geometry,
      initialExactFullMapBoundaryOrder: 0,
      allSevenBoundaryScenesIncluded: true,
      staticRegionResourceGateOverlayIncluded: true,
      externalP1P3ReadsRequired: false,
      engineRerunRequired: false,
    },
    boundariesOrder: "boundary-order",
    boundaries: compactBoundaries,
    subgoalsOrder: "execution-order",
    subgoals: prepared.route.subgoals.map((subgoal, index) => ({
      subgoalId: subgoal.subgoalId,
      title: subgoal.title,
      description: subgoal.description,
      firstStepOrder: subgoal.firstStepOrder,
      lastStepOrder: subgoal.lastStepOrder,
      eventOrders: subgoal.eventOrders,
      status: "verified",
      continuity: prepared.execution.joins[index],
      starting: compactBoundaries[index],
      ending: compactBoundaries[index + 1],
    })),
    terminal: prepared.execution.terminal,
  } as const as unknown as Record<string, any>;
  const witnessOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/${prepared.target}/execution-witness.json`,
    content: json(witness),
    mediaType: "application/json",
  };
  const witnessFile = await checkedFile(witnessOutput, sha256);
  const outputs = [
    ...boundaryFiles.map(({ output }) => output),
    routeOutput,
    planOutput,
    expandedPlanOutput,
    overlayOutput,
    witnessOutput,
    certificationOutput,
    certificateOutput,
    twsOutput,
  ];
  return {
    prepared,
    plan,
    certificate,
    certificateJson,
    certificateReference,
    boundaryFiles,
    witness,
    outputs,
    files: {
      route: routeFile!,
      plan: planFile!,
      expandedPlan: expandedPlanFile!,
      staticOverlay: overlayFile!,
      witness: witnessFile,
      certification: certificationFile!,
      certificate: certificateFile!,
      tws: twsFile!,
    },
  };
}

function corpusCase(targets: readonly TargetComposition[]): CorpusCaseV1 {
  const first = targets[0]!;
  return {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "corpus-case",
    schemaVersion: 1,
    payload: {
      caseId: KEY_PYRAMID_CASE_ID,
      producerRevision: PRODUCER_REVISION,
      previous: null,
      level: first.prepared.route.level,
      targets: targets.map((target) => ({
        target: target.prepared.target,
        attempts: [{
          attemptId: attemptId(target.prepared.target),
          sequence: 1,
          context: {
            donorAvailability: "paired",
            donorExposure: "full-input",
            constructionMethod: "manual-assisted",
            evaluationCohort: "cohort:key-pyramid:paired-training",
            budgetRevision: ATTEMPT_BUDGET_REVISION,
            solverRevision: ATTEMPT_SOLVER_REVISION,
            searchSeed: null,
          },
          plan: target.prepared.planning.planReference,
          result: {
            kind: "certified",
            replay: target.certificate.payload.replay,
            certificate: target.certificateReference,
          },
        }],
        state: {
          status: "solved-current",
          attemptId: attemptId(target.prepared.target),
        },
      })),
    },
  };
}

function humanLabel(target: RulesetTargetV1): string {
  return target === "ms" ? "MS" : "Lynx";
}

function renderReview(targets: readonly TargetComposition[]): string {
  const sections = targets.flatMap((target) => {
    const witness = target.witness;
    const rows = witness.subgoals.map((subgoal: Record<string, any>, index: number) => (
      `| ${index + 1} | ${subgoal.title} | ${subgoal.starting.nativeTick} `
      + `@ (${subgoal.starting.coordinate.x},${subgoal.starting.coordinate.y}) | `
      + `${subgoal.ending.nativeTick} @ (${subgoal.ending.coordinate.x},`
      + `${subgoal.ending.coordinate.y}) | \`${subgoal.starting.support.path}\` → `
      + `\`${subgoal.ending.support.path}\` |`
    ));
    return [
      `## ${humanLabel(target.prepared.target)} — six continuous subgoals`,
      "",
      "| # | Subgoal | Start boundary | End boundary | Exact full-scene files |",
      "|---:|---|---|---|---|",
      ...rows,
      "",
      `Certified ticks (continuous trigger / settled replay trace): `
        + `${target.prepared.execution.boundaries.at(-1)!.nativeTick} / `
        + `${target.prepared.certification.report.verification.typescript.terminalTick}; `
        + `TypeScript/native trace parity exact; full TWS \`${target.files.tws.path}\`.`,
      `Static overlay: \`${target.files.staticOverlay.path}\`; execution witness: `
        + `\`${target.files.witness.path}\`.`,
      "",
    ];
  });
  return [
    "# Key Pyramid P5 certified whole-level review",
    "",
    "## Big-picture checkpoint",
    "",
    "P5 closes the whole-level proof gap with one uninterrupted route per ruleset, seven exact full-scene boundaries per route, and exact-full-file TWS certification in both TypeScript and the isolated native oracle. The 12 paired start/end panel sets (24 rendered panel instances) below are backed by 14 unique shared boundary files and form the human-review handoff for P4B.",
    "",
    "The checked P3 terminal-first parent remains historically `unresolved`; P5 does not rewrite it. Each P5 expanded plan remains a pre-execution `candidate`; the corpus becomes `solved-current` only because continuous execution won and the generated complete TWS bytes passed exact TypeScript/native trace parity.",
    "",
    "## Donor and construction disclosure",
    "",
    "This run is not donor-blind: donor availability is `paired`, donor exposure is `full-input`, and construction is `manual-assisted`. The generated TWS bytes were not copied from or read from donor replay bytes; that byte-provenance claim does not change the full-input exposure label.",
    "",
    "## Human review checkpoints",
    "",
    "1. Open each target's boundary 00 and confirm the exact full-map render is 32×32 and matches the static overlay.",
    "2. Walk each of the six adjacent start/end pairs; the end of one subgoal is the exact start of the next in the same run.",
    "3. Confirm resource and gate changes against `static-overlay.json`, especially all ten chips, key-consuming doors, the zero-remaining socket, and the exit.",
    "4. Confirm the final boundary is won with zero chips remaining; compare the distinct continuous trigger and settled trace ticks (MS 644 / 644, Lynx 647 / 660).",
    "5. Confirm the replay certificate points to the exact checked `.tws` bytes and that the corpus target is `solved-current` only through that certificate.",
    "6. Confirm the donor disclosure above is retained in downstream review: full-input/manual-assisted, not donor-blind, with no donor replay bytes copied or read by the generator.",
    "",
    "P4B can render every panel from P5 outputs alone: all seven exact observation/render scenes and the static region/resource/gate overlay are checked here; no P1/P3 reads or engine reruns are needed.",
    "",
    ...sections,
  ].join("\n");
}

async function composeManifest(
  targets: readonly TargetComposition[],
  existingOutputs: readonly P5ReviewOutput[],
  sha256: WebCryptoSha256,
): Promise<P5ReviewOutput> {
  const files = await Promise.all(existingOutputs.map((output) => checkedFile(output, sha256)));
  const manifest = {
    manifestType: "p5-key-pyramid-review-manifest",
    manifestVersion: 1,
    caseId: KEY_PYRAMID_CASE_ID,
    outputRoot: OUTPUT_ROOT,
    counts: {
      targets: 2,
      subgoalCapsules: 12,
      renderedPanelInstances: 24,
      boundaryFiles: 14,
      filesExcludingManifest: existingOutputs.length,
    },
    construction: {
      donorAvailability: "paired",
      donorExposure: "full-input",
      constructionMethod: "manual-assisted",
      donorBlind: false,
      generatedReplayBytesCopiedFromDonor: false,
      donorReplayInputReadByGenerator: false,
    },
    certification: {
      exactFullFileTws: true,
      typescriptAndNativeRequired: true,
      exactTraceParityRequired: true,
      certificateBundlesVerified: true,
    },
    p4bConsumption: {
      checkedP5Only: true,
      initialExactFullMapRenderPerTarget: true,
      sevenExactBoundaryScenesPerTarget: true,
      staticRegionResourceGateOverlayPerTarget: true,
      engineRerunRequired: false,
    },
    sources: targets.map((target) => ({
      target: target.prepared.target,
      parentP3: {
        path: target.prepared.parentP3.path,
        content: target.prepared.parentP3.content,
        status: "unresolved",
        relationship: "historical-parent-preserved-not-upgraded",
      },
      levelFacts: target.prepared.source.levelFactsContent,
      map: {
        path: target.prepared.source.mapPath,
        content: target.prepared.source.mapContent,
      },
      series: {
        path: `sets/${target.prepared.source.seriesFile}`,
        content: target.prepared.source.seriesContent,
      },
      staticAnalysis: target.prepared.staticOverlay.source.staticAnalysis,
    })),
    targets: targets.map((target) => {
      const witness = target.witness;
      return {
        target: target.prepared.target,
        status: "solved-current",
        files: target.files,
        certificateArtifact: target.certificateReference,
        panels: witness.subgoals.map((subgoal: Record<string, any>) => ({
          subgoalId: subgoal.subgoalId,
          title: subgoal.title,
          starting: {
            boundaryOrder: subgoal.starting.boundaryOrder,
            support: subgoal.starting.support,
          },
          ending: {
            boundaryOrder: subgoal.ending.boundaryOrder,
            support: subgoal.ending.support,
          },
        })),
      };
    }),
    files,
  } as const;
  return {
    path: `${OUTPUT_ROOT}/manifest.json`,
    content: json(manifest),
    mediaType: "application/json",
  };
}

export async function composeP5ReviewOutputs(input: {
  readonly targets: readonly [P5PreparedTarget, P5PreparedTarget];
  readonly sha256?: WebCryptoSha256;
}): Promise<readonly P5ReviewOutput[]> {
  const sha256 = input.sha256 ?? new WebCryptoSha256();
  const preparedByTarget = new Map(input.targets.map((target) => [target.target, target]));
  const ms = preparedByTarget.get("ms");
  const lynx = preparedByTarget.get("lynx");
  if (preparedByTarget.size !== 2 || ms === undefined || lynx === undefined) {
    throw new Error("P5 output composition requires exactly one MS and one Lynx target");
  }
  if (json(ms.route.level) !== json(lynx.route.level)) {
    throw new Error("P5 MS and Lynx targets do not share one normalized level identity");
  }
  const targets = await Promise.all([
    composeTarget(ms, sha256),
    composeTarget(lynx, sha256),
  ]);
  const corpus = corpusCase(targets);
  const corpusJson = encodeArtifact(corpus);
  const decoded = decodeCanonicalArtifact(corpusJson);
  if (decoded.artifactType !== "corpus-case") {
    throw new Error("P5 encoded corpus artifact did not round-trip");
  }
  await Promise.all(targets.map((target) => (
    verifyCertificateBundle(corpus, target.certificate, sha256)
  )));
  const corpusOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/corpus-case.v1.json`,
    content: corpusJson,
    mediaType: "application/json",
  };
  const reviewOutput: P5ReviewOutput = {
    path: `${OUTPUT_ROOT}/review.md`,
    content: renderReview(targets),
    mediaType: "text/markdown",
  };
  const withoutManifest = [
    ...targets.flatMap(({ outputs }) => outputs),
    corpusOutput,
    reviewOutput,
  ].sort((left, right) => compareOrdinal(left.path, right.path));
  const manifestOutput = await composeManifest(targets, withoutManifest, sha256);
  return [...withoutManifest, manifestOutput]
    .sort((left, right) => compareOrdinal(left.path, right.path));
}

export async function buildP5ReviewOutputs(
  repositoryRoot: string,
  options: {
    readonly oraclePath: string;
    readonly sha256?: WebCryptoSha256;
    readonly buildTarget?: P5TargetBuilder;
  },
): Promise<readonly P5ReviewOutput[]> {
  const root = resolve(repositoryRoot);
  if (options.oraclePath.trim().length === 0) {
    throw new Error("P5 native oracle path is required");
  }
  const oraclePath = isAbsolute(options.oraclePath)
    ? options.oraclePath
    : resolve(root, options.oraclePath);
  try {
    await access(oraclePath, constants.X_OK);
  } catch (error) {
    throw new Error(
      `P5 native oracle is required and unavailable or not executable: ${oraclePath}`,
      { cause: error },
    );
  }
  const sha256 = options.sha256 ?? new WebCryptoSha256();
  const buildTarget = options.buildTarget ?? buildLiveTarget;
  const targets = await Promise.all((["ms", "lynx"] as const).map((target) => buildTarget({
    repositoryRoot: root,
    oraclePath,
    target,
    sha256,
  })));
  return composeP5ReviewOutputs({
    targets: [targets[0]!, targets[1]!],
    sha256,
  });
}
