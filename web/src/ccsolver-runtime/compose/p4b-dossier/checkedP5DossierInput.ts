import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";

export const CHECKED_P5_ROOT = "ccsolver/fixtures/golden/p5/cclp1-001" as const;
export const CHECKED_P5_MANIFEST_PATH = `${CHECKED_P5_ROOT}/manifest.json` as const;

const decoder = new TextDecoder("utf-8", { fatal: true });
const P5_PATH_PATTERN = /^ccsolver\/fixtures\/golden\/p5\/cclp1-001\/[a-z0-9][a-z0-9._\/-]*$/u;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TARGETS = ["ms", "lynx"] as const;
const CORPUS_CASE_PATH = `${CHECKED_P5_ROOT}/corpus-case.v1.json` as const;
const MAXIMUM_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAXIMUM_FILE_BYTES = 24 * 1024 * 1024;
const MAXIMUM_TOTAL_BYTES = 192 * 1024 * 1024;

type JsonRecord = Record<string, any>;

export type P5CheckedFileReference = {
  readonly path: string;
  readonly mediaType: string;
  readonly content: {
    readonly digest: string;
    readonly byteLength: number;
  };
};

export type VerifiedP5File = P5CheckedFileReference & {
  readonly bytes: Uint8Array;
};

export type VerifiedP5Target = {
  readonly target: "ms" | "lynx";
  readonly manifestTarget: JsonRecord;
  readonly files: {
    readonly route: VerifiedP5File;
    readonly plan: VerifiedP5File;
    readonly expandedPlan: VerifiedP5File;
    readonly staticOverlay: VerifiedP5File;
    readonly witness: VerifiedP5File;
    readonly certification: VerifiedP5File;
    readonly certificate: VerifiedP5File;
    readonly tws: VerifiedP5File;
  };
  readonly route: JsonRecord;
  readonly plan: JsonRecord;
  readonly expandedPlan: JsonRecord;
  readonly staticOverlay: JsonRecord;
  readonly witness: JsonRecord;
  readonly certification: JsonRecord;
  readonly certificate: JsonRecord;
  readonly terminalTriggerTick: number;
  readonly traceSettledTerminalTick: number;
  readonly boundaries: readonly {
    readonly file: VerifiedP5File;
    readonly document: JsonRecord;
  }[];
};

export type VerifiedP5DossierInput = {
  readonly manifestPath: typeof CHECKED_P5_MANIFEST_PATH;
  readonly manifestBytes: Uint8Array;
  readonly manifest: JsonRecord;
  readonly corpusCase: JsonRecord;
  readonly files: readonly VerifiedP5File[];
  readonly targets: readonly [VerifiedP5Target, VerifiedP5Target];
  readonly sourceAudit: {
    readonly checkedP5ManifestPath: typeof CHECKED_P5_MANIFEST_PATH;
    readonly checkedP5FilesDeclared: 32;
    readonly checkedP5FilesVerified: 32;
    readonly p1Reads: 0;
    readonly p3Reads: 0;
    readonly engineRuns: 0;
  };
};

export type P5ReadBytes = (absolutePath: string) => Promise<Uint8Array>;

function fail(message: string): never {
  throw new Error(`P4B checked P5 input rejected: ${message}`);
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function array(value: unknown, path: string): readonly any[] {
  if (!Array.isArray(value)) fail(`${path} must be an array`);
  return value;
}

function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${path} must be a nonnegative safe integer`);
  }
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${path} must be a nonempty string`);
  return value;
}

function parseCanonicalJson(bytes: Uint8Array, path: string): JsonRecord {
  let source: string;
  let parsed: unknown;
  try {
    source = decoder.decode(bytes);
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`P4B checked P5 input rejected: ${path} is not UTF-8 JSON`, { cause: error });
  }
  if (canonicalizeJson(parsed as CanonicalJsonValue) !== source) {
    fail(`${path} is not canonical JSON`);
  }
  return record(parsed, path);
}

function checkedReference(value: unknown, path: string): P5CheckedFileReference {
  const entry = record(value, path);
  const relativePath = text(entry.path, `${path}.path`);
  const mediaType = text(entry.mediaType, `${path}.mediaType`);
  const content = record(entry.content, `${path}.content`);
  const digest = text(content.digest, `${path}.content.digest`);
  const byteLength = integer(content.byteLength, `${path}.content.byteLength`);
  if (
    !P5_PATH_PATTERN.test(relativePath)
    || relativePath.includes("//")
    || relativePath.includes("..")
    || relativePath.includes("\\")
  ) {
    fail(`${path}.path escapes or falls outside ${CHECKED_P5_ROOT}`);
  }
  if (!DIGEST_PATTERN.test(digest)) fail(`${path}.content.digest is not SHA-256`);
  if (byteLength > MAXIMUM_FILE_BYTES) fail(`${path} exceeds the bounded file size`);
  return { path: relativePath, mediaType, content: { digest, byteLength } };
}

function sameReference(left: P5CheckedFileReference, right: P5CheckedFileReference): boolean {
  return left.path === right.path
    && left.mediaType === right.mediaType
    && left.content.digest === right.content.digest
    && left.content.byteLength === right.content.byteLength;
}

function sameContentReference(
  left: { readonly digest: string; readonly byteLength: number },
  right: { readonly digest: string; readonly byteLength: number },
): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function contentReference(value: unknown, path: string): P5CheckedFileReference["content"] {
  const content = record(value, path);
  const digest = text(content.digest, `${path}.digest`);
  const byteLength = integer(content.byteLength, `${path}.byteLength`);
  if (!DIGEST_PATTERN.test(digest)) fail(`${path}.digest is not SHA-256`);
  return { digest, byteLength };
}

function requireExactContent(
  value: unknown,
  expected: P5CheckedFileReference["content"],
  path: string,
  message: string,
): void {
  if (!sameContentReference(contentReference(value, path), expected)) fail(message);
}

function rawCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as CanonicalJsonValue) === canonicalizeJson(right as CanonicalJsonValue);
}

function requirePlanReference(
  value: unknown,
  path: string,
  expandedPlan: VerifiedP5File,
): JsonRecord {
  const reference = record(value, path);
  const artifact = record(reference.artifact, `${path}.artifact`);
  if (
    artifact.artifactType !== "expanded-plan"
    || artifact.digest !== expandedPlan.content.digest
    || artifact.protocolVersion !== 1
    || artifact.schemaVersion !== 1
    || text(reference.goalId, `${path}.goalId`) !== "goal:18"
    || reference.subgoalId !== null
  ) {
    fail(`${path} is not the exact checked expanded-plan reference`);
  }
  return reference;
}

function absoluteCheckedPath(repositoryRoot: string, relativePath: string): string {
  const root = resolve(repositoryRoot);
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${sep}`)) fail(`path escaped repository root: ${relativePath}`);
  return absolute;
}

async function verifyFile(
  repositoryRoot: string,
  reference: P5CheckedFileReference,
  readBytes: P5ReadBytes,
  sha256: WebCryptoSha256,
): Promise<VerifiedP5File> {
  const bytes = await readBytes(absoluteCheckedPath(repositoryRoot, reference.path));
  const actual = await referenceSourceBytes(bytes, sha256);
  if (
    actual.digest !== reference.content.digest
    || actual.byteLength !== reference.content.byteLength
  ) {
    fail(`P5 checked file digest or length mismatch at ${reference.path}`);
  }
  return { ...reference, bytes };
}

function requireVerifiedFile(
  referenceValue: unknown,
  path: string,
  verified: ReadonlyMap<string, VerifiedP5File>,
): VerifiedP5File {
  const reference = checkedReference(referenceValue, path);
  const file = verified.get(reference.path);
  if (file === undefined || !sameReference(file, reference)) {
    fail(`${path} is not an exact reference to a manifest-verified P5 file`);
  }
  return file;
}

function parseTarget(
  value: unknown,
  target: "ms" | "lynx",
  verified: ReadonlyMap<string, VerifiedP5File>,
  corpusCase: JsonRecord,
): VerifiedP5Target {
  const manifestTarget = record(value, `manifest.targets.${target}`);
  if (manifestTarget.target !== target || manifestTarget.status !== "solved-current") {
    fail(`manifest target ${target} identity or solved status drifted`);
  }
  const refs = record(manifestTarget.files, `manifest.targets.${target}.files`);
  const expectedFileKeys = [
    "certificate",
    "certification",
    "expandedPlan",
    "plan",
    "route",
    "staticOverlay",
    "tws",
    "witness",
  ];
  if (!sameCanonicalValue(Object.keys(refs).sort(rawCompare), expectedFileKeys)) {
    fail(`manifest target ${target} file contract drifted`);
  }
  const files = {
    route: requireVerifiedFile(refs.route, `manifest.targets.${target}.files.route`, verified),
    plan: requireVerifiedFile(refs.plan, `manifest.targets.${target}.files.plan`, verified),
    expandedPlan: requireVerifiedFile(
      refs.expandedPlan,
      `manifest.targets.${target}.files.expandedPlan`,
      verified,
    ),
    staticOverlay: requireVerifiedFile(
      refs.staticOverlay,
      `manifest.targets.${target}.files.staticOverlay`,
      verified,
    ),
    witness: requireVerifiedFile(refs.witness, `manifest.targets.${target}.files.witness`, verified),
    certification: requireVerifiedFile(
      refs.certification,
      `manifest.targets.${target}.files.certification`,
      verified,
    ),
    certificate: requireVerifiedFile(
      refs.certificate,
      `manifest.targets.${target}.files.certificate`,
      verified,
    ),
    tws: requireVerifiedFile(refs.tws, `manifest.targets.${target}.files.tws`, verified),
  };
  const route = parseCanonicalJson(files.route.bytes, files.route.path);
  const plan = parseCanonicalJson(files.plan.bytes, files.plan.path);
  const expandedPlan = parseCanonicalJson(files.expandedPlan.bytes, files.expandedPlan.path);
  const staticOverlay = parseCanonicalJson(files.staticOverlay.bytes, files.staticOverlay.path);
  const witness = parseCanonicalJson(files.witness.bytes, files.witness.path);
  const certification = parseCanonicalJson(files.certification.bytes, files.certification.path);
  const certificate = parseCanonicalJson(files.certificate.bytes, files.certificate.path);
  if (
    route.target !== target
    || route.routeType !== "p5-key-pyramid-route"
    || array(route.tileSteps, `${target}.route.tileSteps`).length !== 162
    || array(route.subgoals, `${target}.route.subgoals`).length !== 6
    || plan.target !== target
    || plan.planType !== "p5-key-pyramid-terminal-rooted-planning-packet"
    || plan.planVersion !== 1
    || plan.status !== "candidate"
    || plan.parentP3?.wholePlan?.status !== "unresolved"
    || expandedPlan.artifactType !== "expanded-plan"
    || expandedPlan.protocol !== "ccsolver-artifact"
    || expandedPlan.protocolVersion !== 1
    || expandedPlan.schemaVersion !== 1
    || expandedPlan.payload?.caseId !== "cclp1-001"
    || expandedPlan.payload?.target !== target
    || expandedPlan.payload?.status !== "candidate"
    || witness.target !== target
    || witness.status !== "continuous-certified-win"
    || certification.target !== target
    || certification.verification?.exactTraceParity !== true
    || certification.replay?.fullFileRoundTripExact !== true
    || certificate.payload?.target !== target
  ) {
    fail(`${target} route, plan, witness, or certificate contract drifted`);
  }

  requireExactContent(
    expandedPlan.payload.document?.content,
    files.plan.content,
    `${target}.expandedPlan.payload.document.content`,
    `${target} expanded-plan document does not bind the exact planning packet`,
  );
  requireExactContent(
    expandedPlan.payload.selectedImplementation?.content,
    files.route.content,
    `${target}.expandedPlan.payload.selectedImplementation.content`,
    `${target} expanded-plan selected implementation does not bind the exact route`,
  );
  requireExactContent(
    plan.route?.content,
    files.route.content,
    `${target}.plan.route.content`,
    `${target} planning packet route does not bind the exact route file`,
  );

  const witnessPlan = record(witness.plan, `${target}.witness.plan`);
  const witnessPlanFile = checkedReference(witnessPlan.file, `${target}.witness.plan.file`);
  const witnessArtifactFile = checkedReference(
    witnessPlan.artifactFile,
    `${target}.witness.plan.artifactFile`,
  );
  if (
    !sameReference(witnessPlanFile, files.plan)
    || !sameReference(witnessArtifactFile, files.expandedPlan)
  ) {
    fail(`${target} witness does not bind the exact checked plan files`);
  }
  const witnessPlanReference = requirePlanReference(
    witnessPlan.reference,
    `${target}.witness.plan.reference`,
    files.expandedPlan,
  );
  const certificationPlanReference = requirePlanReference(
    certification.plan,
    `${target}.certification.plan`,
    files.expandedPlan,
  );
  const certificatePlanReference = requirePlanReference(
    certificate.payload?.plan,
    `${target}.certificate.payload.plan`,
    files.expandedPlan,
  );
  const corpusTargets = array(corpusCase.payload?.targets, "corpusCase.payload.targets");
  const corpusTarget = corpusTargets.find((candidate) => candidate?.target === target);
  const corpusAttempts = array(corpusTarget?.attempts, `${target}.corpusCase.attempts`);
  const corpusAttempt = corpusAttempts.find(
    (candidate) => candidate?.attemptId === corpusTarget?.state?.attemptId,
  );
  const corpusPlanReference = requirePlanReference(
    corpusAttempt?.plan,
    `${target}.corpusCase.currentAttempt.plan`,
    files.expandedPlan,
  );
  if (
    corpusTarget?.state?.status !== "solved-current"
    || !sameCanonicalValue(witnessPlanReference, certificationPlanReference)
    || !sameCanonicalValue(witnessPlanReference, certificatePlanReference)
    || !sameCanonicalValue(witnessPlanReference, corpusPlanReference)
  ) {
    fail(`${target} witness, certification, certificate, and corpus plan references diverged`);
  }

  const routeEvents = array(route.events, `${target}.route.events`);
  const backwardTrace = array(plan.backwardTrace, `${target}.plan.backwardTrace`);
  const visitedEventOrders = array(
    plan.terminalRootedTraversal?.visitedEventOrders,
    `${target}.plan.terminalRootedTraversal.visitedEventOrders`,
  );
  const expectedTerminalFirstOrders = Array.from({ length: 29 }, (_, index) => 28 - index);
  if (
    routeEvents.length !== 29
    || routeEvents.some((event, eventOrder) => event?.eventOrder !== eventOrder)
    || backwardTrace.length !== 29
    || plan.backwardTraceOrder !== "terminal-to-initial"
    || plan.terminalRootedTraversal?.allSelectedRouteEventsReachable !== true
    || plan.terminalRootedTraversal?.rootRouteEventOrder !== 28
    || plan.terminalRootedTraversal?.selectedRouteEventCount !== 29
    || !sameCanonicalValue(visitedEventOrders, expectedTerminalFirstOrders)
  ) {
    fail(`${target} terminal-rooted plan does not cover all 29 selected route events`);
  }
  const directPrerequisiteKeys: string[] = [];
  backwardTrace.forEach((entryValue, traceOrder) => {
    const entry = record(entryValue, `${target}.plan.backwardTrace.${traceOrder}`);
    const routeEventOrder = 28 - traceOrder;
    const chronologicalPreviousEventOrder = routeEventOrder === 0 ? null : routeEventOrder - 1;
    if (
      entry.traceOrder !== traceOrder
      || entry.routeEventOrder !== routeEventOrder
      || entry.chronologicalPreviousEventOrder !== chronologicalPreviousEventOrder
    ) {
      fail(`${target} terminal-first trace order or noncausal chronology drifted`);
    }
    array(entry.directPrerequisites, `${target}.plan.backwardTrace.${traceOrder}.directPrerequisites`)
      .forEach((edgeValue, edgeOrder) => {
        const edge = record(
          edgeValue,
          `${target}.plan.backwardTrace.${traceOrder}.directPrerequisites.${edgeOrder}`,
        );
        const prerequisiteEventOrder = integer(
          edge.routeEventOrder,
          `${target}.plan.backwardTrace.${traceOrder}.directPrerequisites.${edgeOrder}.routeEventOrder`,
        );
        const relationship = text(
          edge.relationship,
          `${target}.plan.backwardTrace.${traceOrder}.directPrerequisites.${edgeOrder}.relationship`,
        );
        if (prerequisiteEventOrder >= routeEventOrder) {
          fail(`${target} plan contains a forward or self prerequisite edge`);
        }
        directPrerequisiteKeys.push(
          `${routeEventOrder}:${prerequisiteEventOrder}:${relationship}:${edge.resourceType ?? ""}`,
        );
      });
  });
  const prerequisiteEdges = array(
    plan.prerequisiteEdges,
    `${target}.plan.prerequisiteEdges`,
  );
  const selectedRouteStateEdges = prerequisiteEdges.filter(
    (edge) => edge?.kind === "selected-route-predecessor-state",
  );
  if (
    plan.prerequisiteEdgesOrder !== "from-event-predecessor-then-resource-event-order"
    || selectedRouteStateEdges.length !== 29
    || Array.from({ length: 29 }, (_, fromRouteEventOrder) => {
      const matching = selectedRouteStateEdges.filter(
        (edge) => edge?.fromRouteEventOrder === fromRouteEventOrder,
      );
      const expectedToRouteEventOrder = fromRouteEventOrder === 0
        ? null
        : fromRouteEventOrder - 1;
      return matching.length === 1
        && matching[0]?.toRouteEventOrder === expectedToRouteEventOrder
        && (fromRouteEventOrder === 0
          ? matching[0]?.predicate === null
          : typeof matching[0]?.predicate === "object" && matching[0]?.predicate !== null);
    }).some((valid) => !valid)
  ) {
    fail(`${target} plan lacks the exact 29-edge selected-route predecessor-state chain`);
  }
  const declaredDirectPrerequisiteKeys = prerequisiteEdges
    .filter((edge) => edge?.kind !== "selected-route-predecessor-state")
    .map((edge) => (
      `${edge.fromRouteEventOrder}:${edge.toRouteEventOrder}:${edge.kind}:${edge.resourceType ?? ""}`
    ));
  if (!sameCanonicalValue(
    directPrerequisiteKeys.sort(rawCompare),
    declaredDirectPrerequisiteKeys.sort(rawCompare),
  )) {
    fail(`${target} direct prerequisite edges diverge from the terminal-rooted trace`);
  }

  const terminalTriggerTick = integer(
    witness.terminal?.nativeTick,
    `${target}.witness.terminal.nativeTick`,
  );
  const typescriptTerminalTick = integer(
    certification.verification?.typescript?.terminalTick,
    `${target}.certification.verification.typescript.terminalTick`,
  );
  const nativeTerminalTick = integer(
    certification.verification?.nativeOracle?.terminalTick,
    `${target}.certification.verification.nativeOracle.terminalTick`,
  );
  if (
    witness.terminal?.kind !== "won"
    || witness.scheduling?.finalExpectedNativeTick !== terminalTriggerTick
    || certification.verification?.typescript?.result !== "win"
    || certification.verification?.nativeOracle?.result !== "win"
    || typescriptTerminalTick !== nativeTerminalTick
    || certificate.payload?.verifications?.typescript?.terminalTick !== typescriptTerminalTick
    || certificate.payload?.verifications?.nativeOracle?.terminalTick !== nativeTerminalTick
  ) {
    fail(`${target} solved-current trigger or trace-settled proof drifted`);
  }
  const traceSettledTerminalTick = typescriptTerminalTick;
  if (
    files.tws.mediaType !== "application/vnd.tworld.tws"
    || files.tws.content.digest !== certification.replay.content?.digest
    || files.tws.content.byteLength !== certification.replay.content?.byteLength
    || !sameReference(checkedReference(witness.replay, `${target}.witness.replay`), files.tws)
  ) {
    fail(`${target} TWS does not match its exact-file certification`);
  }

  const panels = array(manifestTarget.panels, `manifest.targets.${target}.panels`);
  if (panels.length !== 6) fail(`${target} must expose six subgoal panel pairs`);
  const boundaryByOrder = new Map<number, VerifiedP5File>();
  panels.forEach((panelValue, panelIndex) => {
    const panel = record(panelValue, `${target}.panels.${panelIndex}`);
    const starting = record(panel.starting, `${target}.panels.${panelIndex}.starting`);
    const ending = record(panel.ending, `${target}.panels.${panelIndex}.ending`);
    if (
      integer(starting.boundaryOrder, `${target}.panels.${panelIndex}.starting.boundaryOrder`) !== panelIndex
      || integer(ending.boundaryOrder, `${target}.panels.${panelIndex}.ending.boundaryOrder`) !== panelIndex + 1
    ) {
      fail(`${target} panel ${panelIndex} is not an adjacent continuous boundary pair`);
    }
    for (const boundary of [starting, ending]) {
      const boundaryOrder = integer(boundary.boundaryOrder, `${target}.panels.boundaryOrder`);
      const support = requireVerifiedFile(boundary.support, `${target}.panels.support`, verified);
      const prior = boundaryByOrder.get(boundaryOrder);
      if (prior !== undefined && !sameReference(prior, support)) {
        fail(`${target} boundary ${boundaryOrder} has inconsistent checked support`);
      }
      boundaryByOrder.set(boundaryOrder, support);
    }
  });
  if (boundaryByOrder.size !== 7) fail(`${target} must expose seven unique checked boundaries`);
  const boundaries = Array.from({ length: 7 }, (_, boundaryOrder) => {
    const file = boundaryByOrder.get(boundaryOrder);
    if (file === undefined) fail(`${target} boundary ${boundaryOrder} is missing`);
    const document = parseCanonicalJson(file.bytes, file.path);
    if (
      document.boundaryType !== "p5-key-pyramid-full-scene-boundary"
      || document.target !== target
      || document.boundaryOrder !== boundaryOrder
      || document.renderContent?.digest === undefined
      || document.observationContent?.digest === undefined
    ) {
      fail(`${target} boundary ${boundaryOrder} identity drifted`);
    }
    return { file, document };
  });
  const witnessBoundaries = array(witness.boundaries, `${target}.witness.boundaries`);
  const witnessSubgoals = array(witness.subgoals, `${target}.witness.subgoals`);
  if (witnessBoundaries.length !== 7 || witnessSubgoals.length !== 6) {
    fail(`${target} witness does not contain seven boundaries and six subgoals`);
  }
  boundaries.forEach(({ file, document }, boundaryOrder) => {
    const witnessBoundary = record(witnessBoundaries[boundaryOrder], `${target}.witness.boundaries.${boundaryOrder}`);
    const support = checkedReference(witnessBoundary.support, `${target}.witness.boundaries.${boundaryOrder}.support`);
    if (
      witnessBoundary.boundaryOrder !== boundaryOrder
      || document.exactFingerprint !== witnessBoundary.exactFingerprint
      || !sameReference(file, support)
    ) {
      fail(`${target} boundary ${boundaryOrder} does not join its witness and checked support`);
    }
  });
  return {
    target,
    manifestTarget,
    files,
    route,
    plan,
    expandedPlan,
    staticOverlay,
    witness,
    certification,
    certificate,
    terminalTriggerTick,
    traceSettledTerminalTick,
    boundaries,
  };
}

export async function loadVerifiedP5DossierInput(
  repositoryRoot: string,
  options: {
    readonly readBytes?: P5ReadBytes;
    readonly sha256?: WebCryptoSha256;
  } = {},
): Promise<VerifiedP5DossierInput> {
  const readBytes = options.readBytes ?? (async (path: string) => new Uint8Array(await readFile(path)));
  const sha256 = options.sha256 ?? new WebCryptoSha256();
  const manifestBytes = await readBytes(absoluteCheckedPath(repositoryRoot, CHECKED_P5_MANIFEST_PATH));
  if (manifestBytes.byteLength > MAXIMUM_MANIFEST_BYTES) fail("P5 manifest exceeds bounded size");
  const manifest = parseCanonicalJson(manifestBytes, CHECKED_P5_MANIFEST_PATH);
  if (
    manifest.manifestType !== "p5-key-pyramid-review-manifest"
    || manifest.manifestVersion !== 1
    || manifest.caseId !== "cclp1-001"
    || manifest.outputRoot !== CHECKED_P5_ROOT
    || manifest.counts?.targets !== 2
    || manifest.counts?.subgoalCapsules !== 12
    || manifest.counts?.renderedPanelInstances !== 24
    || manifest.counts?.boundaryFiles !== 14
    || manifest.counts?.filesExcludingManifest !== 32
    || manifest.p4bConsumption?.checkedP5Only !== true
    || manifest.p4bConsumption?.engineRerunRequired !== false
  ) {
    fail("P5 manifest identity, counts, or P4B handoff contract drifted");
  }
  const declared = array(manifest.files, "manifest.files").map((value, index) => (
    checkedReference(value, `manifest.files.${index}`)
  ));
  if (declared.length !== 32) fail("P5 manifest must declare exactly 32 non-manifest files");
  const uniquePaths = new Set(declared.map(({ path }) => path));
  if (uniquePaths.size !== declared.length) fail("P5 manifest contains duplicate paths");
  const totalBytes = declared.reduce((sum, file) => sum + file.content.byteLength, 0);
  if (totalBytes > MAXIMUM_TOTAL_BYTES) fail("P5 manifest exceeds bounded total input size");
  const files = await Promise.all(declared.map((reference) => (
    verifyFile(repositoryRoot, reference, readBytes, sha256)
  )));
  const verified = new Map(files.map((file) => [file.path, file]));
  const corpusFile = verified.get(CORPUS_CASE_PATH);
  if (corpusFile === undefined) fail("P5 manifest does not declare the checked corpus case");
  const corpusCase = parseCanonicalJson(corpusFile.bytes, corpusFile.path);
  if (
    corpusCase.artifactType !== "corpus-case"
    || corpusCase.protocol !== "ccsolver-artifact"
    || corpusCase.protocolVersion !== 1
    || corpusCase.schemaVersion !== 1
    || corpusCase.payload?.caseId !== "cclp1-001"
  ) {
    fail("P5 corpus case identity drifted");
  }
  const targetEntries = array(manifest.targets, "manifest.targets");
  const byTarget = new Map(targetEntries.map((value) => {
    const entry = record(value, "manifest.targets[]");
    return [entry.target, entry] as const;
  }));
  const ms = parseTarget(byTarget.get("ms"), "ms", verified, corpusCase);
  const lynx = parseTarget(byTarget.get("lynx"), "lynx", verified, corpusCase);
  if (byTarget.size !== 2 || !TARGETS.every((target) => byTarget.has(target))) {
    fail("P5 manifest must contain exactly MS and Lynx targets");
  }
  return {
    manifestPath: CHECKED_P5_MANIFEST_PATH,
    manifestBytes,
    manifest,
    corpusCase,
    files,
    targets: [ms, lynx],
    sourceAudit: {
      checkedP5ManifestPath: CHECKED_P5_MANIFEST_PATH,
      checkedP5FilesDeclared: 32,
      checkedP5FilesVerified: 32,
      p1Reads: 0,
      p3Reads: 0,
      engineRuns: 0,
    },
  };
}
