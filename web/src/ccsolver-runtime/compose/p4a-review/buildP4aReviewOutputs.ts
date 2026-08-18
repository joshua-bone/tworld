import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
  type RulesetTargetV1,
  type SolverCoordinate,
  type SolverRenderCell,
  type SolverRenderProjection,
} from "@tworld/ccsolver/domain";
import {
  createSubgoalEvidenceView,
  rebindReviewState,
  renderSubgoalEvidencePanelSvg,
  validateReviewState,
  type ReviewStateV1,
  type SubgoalEvidenceOverlayV1,
  type SubgoalEvidencePanelSelectionV1,
  type SubgoalEvidencePanelV1,
  type SubgoalEvidenceSceneV1,
  type SubgoalEvidenceViewV1,
} from "@tworld/ccsolver/render";
import type {
  ContextualWitnessFailureV1,
  ContextualWitnessResultV1,
  SolverObservedChangeV1,
  SubgoalContractV1,
} from "@tworld/ccsolver/snippets";
import {
  buildSyntheticFailedCanary,
  SYNTHETIC_FAILED_PREDICATE_ID,
  type BuiltSyntheticFailedCanary,
} from "./buildSyntheticFailedCanary";

export type P4aReviewOutput = {
  readonly path: string;
  readonly content: string;
  readonly mediaType: "application/json" | "image/svg+xml" | "text/html";
};

type P3BoundarySummary = {
  readonly exactFingerprint: `sha256:${string}`;
  readonly inventory: Readonly<Record<string, number>>;
  readonly nativeTick: number;
  readonly player: {
    readonly coordinate: SolverCoordinate;
    readonly facing: string;
    readonly movement: string;
  };
  readonly remainingRequirements: Readonly<Record<string, number>>;
};

type P3PointOfInterest = {
  readonly coordinate: SolverCoordinate;
  readonly label: string;
  readonly role: "route-start" | "selected-target" | "retained-alternative" | "later-gate";
};

type P3EmbeddedWitness = {
  readonly content: BlobReferenceV1;
  readonly contract: SubgoalContractV1;
  readonly entryContent: {
    readonly observation: BlobReferenceV1;
    readonly render: BlobReferenceV1;
  };
  readonly join: ContextualWitnessResultV1["join"];
  readonly observedChanges: readonly SolverObservedChangeV1[];
  readonly outcome: ContextualWitnessResultV1["outcome"];
  readonly stopContent: {
    readonly observation: BlobReferenceV1;
    readonly render: BlobReferenceV1;
  };
};

type CheckedP3Witness = {
  readonly previewType: "p3b-contextual-witness-review";
  readonly previewVersion: 1;
  readonly caseId: "cclp1-001";
  readonly target: RulesetTargetV1;
  readonly levelFacts: BlobReferenceV1;
  readonly plan: BlobReferenceV1;
  readonly witnessLeaf: BlobReferenceV1;
  readonly entry: P3BoundarySummary;
  readonly stop: P3BoundarySummary;
  readonly renderViewport: {
    readonly minimum: SolverCoordinate;
    readonly maximum: SolverCoordinate;
  };
  readonly subgoal: {
    readonly kind: "collect-placement";
    readonly placementId: `placement:sha256:${string}`;
    readonly resourceType: "cc1:key-red";
    readonly amount: 1;
  };
  readonly visualReview: {
    readonly entryRender: SolverRenderProjection;
    readonly observedFullRoute: false;
    readonly pointsOfInterest: readonly P3PointOfInterest[];
    readonly routePreview: readonly SolverCoordinate[];
    readonly stopRender: SolverRenderProjection;
  };
  readonly witness: P3EmbeddedWitness;
};

type CheckedP3Plan = {
  readonly previewType: "p3a-terminal-plan-review";
  readonly previewVersion: 1;
  readonly caseId: "cclp1-001";
  readonly target: RulesetTargetV1;
  readonly artifacts: {
    readonly levelFacts: BlobReferenceV1;
  };
  readonly content: BlobReferenceV1;
  readonly witnessLeaf: {
    readonly content: BlobReferenceV1;
  };
};

type CheckedJson<T> = {
  readonly path: string;
  readonly content: string;
  readonly reference: BlobReferenceV1;
  readonly value: T;
};

type RealViewSource = {
  readonly target: RulesetTargetV1;
  readonly plan: CheckedJson<CheckedP3Plan>;
  readonly witness: CheckedJson<CheckedP3Witness>;
};

type BuiltView = {
  readonly view: SubgoalEvidenceViewV1;
  readonly evidencePath: string;
  readonly evidenceContent: string;
  readonly evidenceReference: BlobReferenceV1;
  readonly witnessContent: BlobReferenceV1;
  readonly expectedSceneContent: BlobReferenceV1 | null;
  readonly sourcePaths: readonly string[];
  readonly outcome: "verified" | "failed";
};

type BuiltPanel = {
  readonly viewId: string;
  readonly selection: SubgoalEvidencePanelSelectionV1;
  readonly panel: SubgoalEvidencePanelV1;
  readonly path: string;
  readonly content: string;
  readonly reference: BlobReferenceV1;
};

type LoadedReview = {
  readonly sourcePath: string;
  readonly sourceContent: BlobReferenceV1;
  readonly sourceState: ReviewStateV1;
  readonly effectiveState: ReviewStateV1;
};

type ReviewViewBundle = BuiltView & {
  readonly panels: readonly BuiltPanel[];
  readonly review: LoadedReview;
};

const OUTPUT_ROOT = "ccsolver/fixtures/golden/p4a";
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const RENDERER_REVISION = "ccsolver:p4a-semantic-svg-v1";
const MOTION_REASON = "no-intermediate-semantic-scenes";

const REAL_EVIDENCE_PATH = {
  lynx: `${OUTPUT_ROOT}/cclp1-001/lynx/red-key-evidence.json`,
  ms: `${OUTPUT_ROOT}/cclp1-001/ms/red-key-evidence.json`,
} as const;

const REVIEW_PATH = {
  lynx: "ccsolver/reviews/p4a/cclp1-001/lynx/red-key.review.v1.json",
  ms: "ccsolver/reviews/p4a/cclp1-001/ms/red-key.review.v1.json",
  synthetic: "ccsolver/reviews/p4a/synthetic-standard-failed-red-key.review.v1.json",
} as const;

const SYNTHETIC_EVIDENCE_PATH =
  `${OUTPUT_ROOT}/synthetic-standard-failed-red-key/evidence.json` as const;

const sha256Digest = (content: string): `sha256:${string}` => (
  `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`
);

function referenceUtf8(content: string): BlobReferenceV1 {
  return {
    digest: sha256Digest(content),
    byteLength: Buffer.byteLength(content, "utf8"),
  };
}

function canonicalJson(value: unknown): string {
  return canonicalizeJson(value as CanonicalJsonValue);
}

function referenceCanonical(value: unknown): BlobReferenceV1 {
  return referenceUtf8(canonicalJson(value));
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function sameCoordinate(left: SolverCoordinate, right: SolverCoordinate): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function coordinateText({ x, y, z }: SolverCoordinate): string {
  return `(${x},${y},${z})`;
}

function compactReference(reference: BlobReferenceV1): string {
  const hex = reference.digest.slice("sha256:".length);
  return `${hex.slice(0, 4)}…${hex.slice(-4)} · ${reference.byteLength} B`;
}

function asScene(render: SolverRenderProjection): SubgoalEvidenceSceneV1 {
  return {
    region: render.region,
    cellsOrder: render.cellsOrder,
    cells: render.cells,
  };
}

function assertP3Source(
  plan: CheckedJson<CheckedP3Plan>,
  witness: CheckedJson<CheckedP3Witness>,
  target: RulesetTargetV1,
): void {
  const planValue = plan.value;
  const witnessValue = witness.value;
  const entryRender = witnessValue.visualReview.entryRender;
  const stopRender = witnessValue.visualReview.stopRender;
  if (
    planValue.previewType !== "p3a-terminal-plan-review"
    || planValue.previewVersion !== 1
    || planValue.caseId !== "cclp1-001"
    || planValue.target !== target
    || witnessValue.previewType !== "p3b-contextual-witness-review"
    || witnessValue.previewVersion !== 1
    || witnessValue.caseId !== "cclp1-001"
    || witnessValue.target !== target
  ) {
    throw new Error(`${target} checked P3 JSON has the wrong packet identity`);
  }
  if (
    !sameReference(planValue.content, witnessValue.plan)
    || !sameReference(planValue.witnessLeaf.content, witnessValue.witnessLeaf)
    || !sameReference(planValue.artifacts.levelFacts, witnessValue.levelFacts)
  ) {
    throw new Error(`${target} checked P3 plan and witness bindings disagree`);
  }
  if (
    witnessValue.witness.outcome.kind !== "verified"
    || witnessValue.witness.join?.state !== "exact"
    || witnessValue.visualReview.observedFullRoute !== false
  ) {
    throw new Error(`${target} checked P3 witness is not the exact verified segment input`);
  }
  if (
    entryRender.target !== target
    || stopRender.target !== target
    || entryRender.boundary.nativeTick !== witnessValue.entry.nativeTick
    || stopRender.boundary.nativeTick !== witnessValue.stop.nativeTick
    || entryRender.fingerprints.exact !== witnessValue.entry.exactFingerprint
    || stopRender.fingerprints.exact !== witnessValue.stop.exactFingerprint
    || !sameCoordinate(entryRender.region.minimum, witnessValue.renderViewport.minimum)
    || !sameCoordinate(entryRender.region.maximum, witnessValue.renderViewport.maximum)
    || canonicalJson(entryRender.region) !== canonicalJson(stopRender.region)
  ) {
    throw new Error(`${target} checked P3 render boundaries or viewport disagree`);
  }
  if (!sameReference(referenceCanonical(entryRender), witnessValue.witness.entryContent.render)) {
    throw new Error(`${target} checked P3 entry render content binding disagrees`);
  }
  if (!sameReference(referenceCanonical(stopRender), witnessValue.witness.stopContent.render)) {
    throw new Error(`${target} checked P3 stop render content binding disagrees`);
  }
  if (
    witnessValue.visualReview.routePreview.length < 2
    || witnessValue.subgoal.resourceType !== "cc1:key-red"
    || witnessValue.subgoal.amount !== 1
  ) {
    throw new Error(`${target} checked P3 selected segment is not the red-key leaf`);
  }
}

async function readCanonicalJson<T>(
  repositoryRoot: string,
  path: string,
): Promise<CheckedJson<T>> {
  const content = await readFile(resolve(repositoryRoot, path), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new Error(`checked P3 source is not JSON: ${path}`, { cause });
  }
  if (canonicalJson(parsed) !== content) {
    throw new Error(`checked P3 source is not canonical JSON: ${path}`);
  }
  return {
    path,
    content,
    reference: referenceUtf8(content),
    value: parsed as T,
  };
}

async function loadRealSource(
  repositoryRoot: string,
  target: RulesetTargetV1,
): Promise<RealViewSource> {
  const directory = `ccsolver/fixtures/golden/p3/cclp1-001/${target}`;
  const [plan, witness] = await Promise.all([
    readCanonicalJson<CheckedP3Plan>(repositoryRoot, `${directory}/terminal-plan.json`),
    readCanonicalJson<CheckedP3Witness>(repositoryRoot, `${directory}/red-key-witness.json`),
  ]);
  assertP3Source(plan, witness, target);
  return { target, plan, witness };
}

function pointByRole(
  witness: CheckedP3Witness,
  role: P3PointOfInterest["role"],
): P3PointOfInterest {
  const points = witness.visualReview.pointsOfInterest.filter((point) => point.role === role);
  if (points.length !== 1) throw new Error(`checked P3 witness needs exactly one ${role}`);
  return points[0]!;
}

function observedCellChanges(
  target: RulesetTargetV1,
  changes: readonly SolverObservedChangeV1[],
): readonly SubgoalEvidenceOverlayV1[] {
  return changes.flatMap((change) => {
    if (change.kind !== "cell-elements") return [];
    return [{
      overlayId: `overlay:key-pyramid:${target}:observed-change:${change.coordinate.x}-${change.coordinate.y}-${change.coordinate.z}`,
      kind: "state-change" as const,
      basis: "observed-witness" as const,
      target,
      label: `Observed changed cell ${coordinateText(change.coordinate)}`,
      textEquivalent: `The exact supplied semantic stack at ${coordinateText(change.coordinate)} changed from ${change.before.map(({ stratum, semanticType }) => `${stratum}:${semanticType}`).join(" + ") || "empty"} to ${change.after.map(({ stratum, semanticType }) => `${stratum}:${semanticType}`).join(" + ") || "empty"}.`,
      coordinate: change.coordinate,
      beforeSemanticTypes: change.before.map(({ semanticType }) => semanticType),
      afterSemanticTypes: change.after.map(({ semanticType }) => semanticType),
    }];
  });
}

function realOverlays(source: RealViewSource): readonly SubgoalEvidenceOverlayV1[] {
  const { target } = source;
  const witness = source.witness.value;
  const door = pointByRole(witness, "later-gate");
  const red = pointByRole(witness, "selected-target");
  const blue = pointByRole(witness, "retained-alternative");
  return [
    {
      overlayId: `overlay:key-pyramid:${target}:later-red-door`,
      kind: "point-of-interest",
      basis: "regressed-requirement",
      target,
      label: "Later red-door requirement",
      textEquivalent: `The later red door at ${coordinateText(door.coordinate)} is a backward-regressed requirement, not an observed consequence of this segment.`,
      coordinate: door.coordinate,
      role: "later-gate",
      placementId: null,
    },
    {
      overlayId: `overlay:key-pyramid:${target}:selected-red-key`,
      kind: "point-of-interest",
      basis: "backward-candidate",
      target,
      label: "Selected red-key candidate",
      textEquivalent: `The exact selected red-key placement is the backward candidate at ${coordinateText(red.coordinate)}.`,
      coordinate: red.coordinate,
      role: "selected-target",
      placementId: witness.subgoal.placementId,
    },
    {
      overlayId: `overlay:key-pyramid:${target}:retained-blue-key`,
      kind: "point-of-interest",
      basis: "backward-candidate",
      target,
      label: "Retained blue-key candidate",
      textEquivalent: `The blue key at ${coordinateText(blue.coordinate)} remains a distinct backward candidate.`,
      coordinate: blue.coordinate,
      role: "retained-alternative",
      placementId: null,
    },
    {
      overlayId: `overlay:key-pyramid:${target}:plan-intent`,
      kind: "route",
      basis: "plan-intent",
      target,
      label: "One-step plan intent",
      textEquivalent: `Plan intent proposes ${witness.visualReview.routePreview.map(coordinateText).join(" to ")}; P3 explicitly records no observed full route.`,
      coordinates: witness.visualReview.routePreview,
      actorId: null,
    },
    {
      overlayId: `overlay:key-pyramid:${target}:observed-start-player`,
      kind: "point-of-interest",
      basis: "observed-witness",
      target,
      label: "Observed start player position",
      textEquivalent: `The exact observed player start is ${coordinateText(witness.entry.player.coordinate)} at native tick ${witness.entry.nativeTick}.`,
      coordinate: witness.entry.player.coordinate,
      role: "route-start",
      placementId: null,
    },
    {
      overlayId: `overlay:key-pyramid:${target}:observed-end-player`,
      kind: "point-of-interest",
      basis: "observed-witness",
      target,
      label: "Observed ending player position",
      textEquivalent: `The exact observed player stop is ${coordinateText(witness.stop.player.coordinate)} at native tick ${witness.stop.nativeTick}; the two boundary positions are not an observed route.`,
      coordinate: witness.stop.player.coordinate,
      role: "route-end",
      placementId: null,
    },
    ...observedCellChanges(target, witness.witness.observedChanges),
  ];
}

function metrics(
  target: RulesetTargetV1,
  boundary: P3BoundarySummary,
): readonly { readonly metricId: string; readonly label: string; readonly value: string }[] {
  return [
    {
      metricId: `metric:${target}:chips-remaining`,
      label: "Chips remaining",
      value: String(boundary.remainingRequirements["cc1:icchip"] ?? 0),
    },
    {
      metricId: `metric:${target}:red-key-inventory`,
      label: "Red-key inventory",
      value: String(boundary.inventory["cc1:key-red"] ?? 0),
    },
  ];
}

function buildRealView(source: RealViewSource): BuiltView {
  const { target } = source;
  const witness = source.witness.value;
  const contractContent = referenceCanonical(witness.witness.contract);
  const overlays = realOverlays(source);
  const overlayId = (suffix: string): string => `overlay:key-pyramid:${target}:${suffix}`;
  const sharedIds = [
    overlayId("later-red-door"),
    overlayId("selected-red-key"),
    overlayId("retained-blue-key"),
    overlayId("plan-intent"),
  ];
  const changeIds = overlays
    .filter(({ kind }) => kind === "state-change")
    .map(({ overlayId: id }) => id);
  const view = createSubgoalEvidenceView({
    viewType: "subgoal-evidence-view",
    viewVersion: 1,
    viewId: `view:key-pyramid:${target}:adjacent-red-key`,
    caseId: "cclp1-001",
    target,
    level: witness.visualReview.entryRender.level,
    levelFacts: witness.levelFacts,
    plan: source.plan.value.content,
    contract: contractContent,
    witness: witness.witness.content,
    subgoal: {
      subgoalId: `subgoal:key-pyramid:${target}:adjacent-red-key`,
      title: "Collect the adjacent red key",
      description: "Review the exact selected segment only; the whole Key Pyramid plan remains unresolved.",
    },
    renderer: {
      rendererId: "ccsolver-semantic-svg",
      rendererRevision: RENDERER_REVISION,
    },
    viewport: witness.visualReview.entryRender.region,
    overlaysOrder: "basis-kind-id",
    overlays,
    starting: {
      panelId: `panel:key-pyramid:${target}:starting-state`,
      panelKind: "starting-state",
      title: "Starting State",
      binding: {
        kind: "observed",
        nativeTick: witness.entry.nativeTick,
        exactFingerprint: witness.entry.exactFingerprint,
        observationContent: witness.witness.entryContent.observation,
        renderContent: witness.witness.entryContent.render,
      },
      scene: asScene(witness.visualReview.entryRender),
      overlayIdsOrder: "basis-kind-id",
      overlayIds: [...sharedIds, overlayId("observed-start-player")],
      metricsOrder: "metric-id",
      metrics: metrics(target, witness.entry),
      accessibleText: `Observed ${target.toUpperCase()} start at native tick ${witness.entry.nativeTick}: player ${coordinateText(witness.entry.player.coordinate)}, red-key inventory 0, ten chips remaining. The cell table preserves every supplied semantic stack literally.`,
    },
    ending: {
      kind: "verified",
      observed: {
        panelId: `panel:key-pyramid:${target}:ending-state`,
        panelKind: "ending-state",
        title: "Ending State",
        binding: {
          kind: "observed",
          nativeTick: witness.stop.nativeTick,
          exactFingerprint: witness.stop.exactFingerprint,
          observationContent: witness.witness.stopContent.observation,
          renderContent: witness.witness.stopContent.render,
        },
        scene: asScene(witness.visualReview.stopRender),
        overlayIdsOrder: "basis-kind-id",
        overlayIds: [
          overlayId("selected-red-key"),
          overlayId("plan-intent"),
          overlayId("observed-end-player"),
          ...changeIds,
        ],
        metricsOrder: "metric-id",
        metrics: metrics(target, witness.stop),
        accessibleText: `Verified selected-segment stop at native tick ${witness.stop.nativeTick}: player ${coordinateText(witness.stop.player.coordinate)}, red-key inventory 1, ten chips remaining. Changed-cell callouts are observed boundary deltas; no continuous route is claimed.`,
      },
    },
    correctness: {
      fullWorldWitnessIsAuthority: true,
      croppedPanelsAreReviewOnly: true,
    },
    motion: {
      kind: "not-recommended",
      reason: MOTION_REASON,
    },
  });
  const evidenceContent = canonicalJson(view);
  return {
    view,
    evidencePath: REAL_EVIDENCE_PATH[target],
    evidenceContent,
    evidenceReference: referenceUtf8(evidenceContent),
    witnessContent: witness.witness.content,
    expectedSceneContent: null,
    sourcePaths: [source.plan.path, source.witness.path],
    outcome: "verified",
  };
}

function syntheticChangedCellOverlays(
  witness: ContextualWitnessResultV1,
): readonly SubgoalEvidenceOverlayV1[] {
  return observedCellChanges("ms", witness.observedChanges).map((overlay) => ({
    ...overlay,
    overlayId: overlay.overlayId.replace("overlay:key-pyramid:ms", "overlay:synthetic:ms"),
    label: overlay.label.replace("Observed", "Synthetic observed"),
    textEquivalent: `Synthetic canary only. ${overlay.textEquivalent}`,
  }));
}

function buildSyntheticView(canary: BuiltSyntheticFailedCanary): BuiltView {
  const { witness, expectedScene } = canary;
  if (witness.outcome.kind !== "failed") {
    throw new Error("synthetic P4A canary unexpectedly verified");
  }
  const contractContent = referenceCanonical(witness.contract);
  const witnessContent = referenceCanonical(witness);
  const planContent = referenceCanonical({
    planSegment: witness.planSegment,
    planVerificationScope: witness.planVerificationScope,
    planIntentOrder: witness.planIntentOrder,
    planIntent: witness.planIntent,
  });
  const levelFactsContent = referenceCanonical(witness.levelFacts);
  const expectedSceneContent = referenceCanonical(expectedScene);
  const changeOverlays = syntheticChangedCellOverlays(witness);
  const overlays: readonly SubgoalEvidenceOverlayV1[] = [
    {
      overlayId: "overlay:synthetic:ms:red-key-candidate",
      kind: "point-of-interest",
      basis: "backward-candidate",
      target: "ms",
      label: "Expected red-key candidate",
      textEquivalent: "The synthetic contract expects the red key at (2,1,0) to be collected.",
      coordinate: { x: 2, y: 1, z: 0 },
      role: "selected-target",
      placementId: null,
    },
    {
      overlayId: "overlay:synthetic:ms:plan-intent",
      kind: "route",
      basis: "plan-intent",
      target: "ms",
      label: "Synthetic one-step plan intent",
      textEquivalent: "The bounded synthetic plan intends one east step from (1,1,0) to (2,1,0).",
      coordinates: [{ x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 }],
      actorId: null,
    },
    {
      overlayId: "overlay:synthetic:ms:observed-start-player",
      kind: "point-of-interest",
      basis: "observed-witness",
      target: "ms",
      label: "Synthetic observed start",
      textEquivalent: "The fake runtime exactly observes the player at (1,1,0) before the bounded decision.",
      coordinate: { x: 1, y: 1, z: 0 },
      role: "route-start",
      placementId: null,
    },
    {
      overlayId: "overlay:synthetic:ms:observed-stop-player",
      kind: "point-of-interest",
      basis: "observed-witness",
      target: "ms",
      label: "Synthetic observed stop",
      textEquivalent: "The fake runtime exactly observes the player still at (1,1,0), while the red key remains at (2,1,0).",
      coordinate: { x: 1, y: 1, z: 0 },
      role: "failure-site",
      placementId: null,
    },
    ...changeOverlays,
  ];
  const changeIds = changeOverlays.map(({ overlayId }) => overlayId);
  const expectedPredicateIds = [SYNTHETIC_FAILED_PREDICATE_ID].sort((left, right) => (
    left < right ? -1 : left > right ? 1 : 0
  ));
  const entryRedKeys = witness.entry.observation.inventory.find(
    ({ resourceType }) => resourceType === "cc1:key-red",
  )?.count ?? 0;
  const actualRedKeys = witness.end.observation.inventory.find(
    ({ resourceType }) => resourceType === "cc1:key-red",
  )?.count ?? 0;
  const entryChips = witness.entry.observation.remainingRequirements.find(
    ({ resourceType }) => resourceType === "cc1:icchip",
  )?.count ?? 0;
  const actualChips = witness.end.observation.remainingRequirements.find(
    ({ resourceType }) => resourceType === "cc1:icchip",
  )?.count ?? 0;
  const view = createSubgoalEvidenceView({
    viewType: "subgoal-evidence-view",
    viewVersion: 1,
    viewId: "view:synthetic:ms:failed-red-key-canary",
    caseId: "synthetic-standard-failed-red-key",
    target: "ms",
    level: witness.level,
    levelFacts: levelFactsContent,
    plan: planContent,
    contract: contractContent,
    witness: witnessContent,
    subgoal: {
      subgoalId: "subgoal:synthetic:ms:failed-red-key-canary",
      title: "Synthetic red-key postcondition failure",
      description: "A bounded fake standard-ruleset runtime stops with the red-key postcondition unsatisfied; this is a canary, not a gameplay-engine claim.",
    },
    renderer: {
      rendererId: "ccsolver-semantic-svg",
      rendererRevision: RENDERER_REVISION,
    },
    viewport: witness.entry.render.region,
    overlaysOrder: "basis-kind-id",
    overlays,
    starting: {
      panelId: "panel:synthetic:ms:starting-state",
      panelKind: "starting-state",
      title: "Starting State",
      binding: {
        kind: "observed",
        nativeTick: witness.entry.observation.boundary.nativeTick,
        exactFingerprint: witness.entry.observation.fingerprints.exact,
        observationContent: witness.entry.observationContent,
        renderContent: witness.entry.renderContent,
      },
      scene: asScene(witness.entry.render),
      overlayIdsOrder: "basis-kind-id",
      overlayIds: [
        "overlay:synthetic:ms:red-key-candidate",
        "overlay:synthetic:ms:plan-intent",
        "overlay:synthetic:ms:observed-start-player",
      ],
      metricsOrder: "metric-id",
      metrics: [
        {
          metricId: "metric:synthetic:starting-chips-remaining",
          label: "Observed chips remaining",
          value: String(entryChips),
        },
        {
          metricId: "metric:synthetic:starting-red-key-inventory",
          label: "Observed red-key inventory",
          value: String(entryRedKeys),
        },
      ],
      accessibleText: "Synthetic observed start at native tick -1: player at (1,1,0), red key present at (2,1,0), red-key inventory 0, two chips remaining.",
    },
    ending: {
      kind: "failed",
      expected: {
        panelId: "panel:synthetic:ms:intended-ending",
        panelKind: "intended-ending",
        title: "Intended Ending State",
        binding: {
          kind: "expected",
          contractContent,
          predicateIdsOrder: "predicate-id",
          predicateIds: expectedPredicateIds,
        },
        scene: expectedScene,
        overlayIdsOrder: "basis-kind-id",
        overlayIds: [
          "overlay:synthetic:ms:red-key-candidate",
          "overlay:synthetic:ms:plan-intent",
        ],
        metricsOrder: "metric-id",
        metrics: [
          {
            metricId: "metric:synthetic:expected-chips-remaining",
            label: "Expected chips remaining",
            value: "2",
          },
          {
            metricId: "metric:synthetic:expected-red-key-inventory",
            label: "Expected red-key inventory",
            value: "1",
          },
          {
            metricId: "metric:synthetic:expected-scene-content",
            label: "Scene SHA-256",
            value: compactReference(expectedSceneContent),
          },
        ],
        accessibleText: "Expected-only synthetic ending: player at (2,1,0), red key absent, red-key inventory 1, two chips remaining. This content-addressed scene is a contract projection and was not observed.",
      },
      actual: {
        panelId: "panel:synthetic:ms:actual-failure",
        panelKind: "actual-failure",
        title: "Actual Stop / Failure State",
        binding: {
          kind: "observed",
          nativeTick: witness.end.observation.boundary.nativeTick,
          exactFingerprint: witness.end.observation.fingerprints.exact,
          observationContent: witness.end.observationContent,
          renderContent: witness.end.renderContent,
        },
        scene: asScene(witness.end.render),
        overlayIdsOrder: "basis-kind-id",
        overlayIds: [
          "overlay:synthetic:ms:red-key-candidate",
          "overlay:synthetic:ms:plan-intent",
          "overlay:synthetic:ms:observed-stop-player",
          ...changeIds,
        ],
        metricsOrder: "metric-id",
        metrics: [
          {
            metricId: "metric:synthetic:actual-chips-remaining",
            label: "Actual chips remaining",
            value: String(actualChips),
          },
          {
            metricId: "metric:synthetic:actual-red-key-inventory",
            label: "Actual red-key inventory",
            value: String(actualRedKeys),
          },
          {
            metricId: "metric:synthetic:join",
            label: "Exact join",
            value: "passed · 1 decision",
          },
        ],
        accessibleText: "Actual synthetic stop at native tick 0: player still at (1,1,0), red key still present at (2,1,0), red-key inventory 0, one chip remaining. The failed expected and actual states remain separate.",
      },
      firstFailure: {
        ...witness.outcome.failure,
        detail: "Expected red-key inventory 1; observed 0.",
      } satisfies ContextualWitnessFailureV1,
    },
    correctness: {
      fullWorldWitnessIsAuthority: true,
      croppedPanelsAreReviewOnly: true,
    },
    motion: {
      kind: "not-recommended",
      reason: MOTION_REASON,
    },
  });
  const evidenceContent = canonicalJson(view);
  return {
    view,
    evidencePath: SYNTHETIC_EVIDENCE_PATH,
    evidenceContent,
    evidenceReference: referenceUtf8(evidenceContent),
    witnessContent,
    expectedSceneContent,
    sourcePaths: [],
    outcome: "failed",
  };
}

function panelSelections(view: SubgoalEvidenceViewV1): readonly SubgoalEvidencePanelSelectionV1[] {
  return view.ending.kind === "verified"
    ? ["starting", "ending"]
    : ["starting", "expected-ending", "actual-failure"];
}

function selectedPanel(
  view: SubgoalEvidenceViewV1,
  selection: SubgoalEvidencePanelSelectionV1,
): SubgoalEvidencePanelV1 {
  if (selection === "starting") return view.starting;
  if (view.ending.kind === "verified") return view.ending.observed;
  if (selection === "expected-ending") return view.ending.expected;
  return view.ending.actual;
}

function panelSlug(view: SubgoalEvidenceViewV1): string {
  return view.caseId === "cclp1-001"
    ? `cclp1-001-${view.target}-adjacent-red-key`
    : "synthetic-standard-failed-red-key";
}

function buildPanels(view: SubgoalEvidenceViewV1): readonly BuiltPanel[] {
  return panelSelections(view).map((selection) => {
    const content = renderSubgoalEvidencePanelSvg(view, selection);
    const reference = referenceUtf8(content);
    const digest = reference.digest.slice("sha256:".length);
    return {
      viewId: view.viewId,
      selection,
      panel: selectedPanel(view, selection),
      path: `${OUTPUT_ROOT}/assets/${panelSlug(view)}-${selection}-${digest}.svg`,
      content,
      reference,
    };
  });
}

async function loadReview(
  repositoryRoot: string,
  sourcePath: string,
  evidenceContent: BlobReferenceV1,
  witnessContent: BlobReferenceV1,
  declaredOverlayIds: ReadonlySet<string>,
): Promise<LoadedReview> {
  const content = await readFile(resolve(repositoryRoot, sourcePath), "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new Error(`P4A human review sidecar is not JSON: ${sourcePath}`, { cause });
  }
  validateReviewState(parsed);
  const sourceState = parsed;
  for (const override of sourceState.overlayOverrides) {
    if (!declaredOverlayIds.has(override.overlayId)) {
      throw new Error(
        `P4A review override ${override.overrideId} names an unknown overlay in ${sourcePath}: ${override.overlayId}`,
      );
    }
  }
  const effectiveState = rebindReviewState(sourceState, {
    evidenceContent,
    witnessContent,
  });
  return {
    sourcePath,
    sourceContent: referenceUtf8(content),
    sourceState,
    effectiveState,
  };
}

function reviewPathFor(view: SubgoalEvidenceViewV1): string {
  return view.caseId === "cclp1-001" ? REVIEW_PATH[view.target] : REVIEW_PATH.synthetic;
}

function panelManifest(panel: BuiltPanel) {
  return {
    assetType: "semantic-svg-panel",
    viewId: panel.viewId,
    selection: panel.selection,
    panelId: panel.panel.panelId,
    path: panel.path,
    content: panel.reference,
  } as const;
}

function buildManifest(
  sources: readonly RealViewSource[],
  bundles: readonly ReviewViewBundle[],
  canary: BuiltSyntheticFailedCanary,
): Record<string, unknown> {
  const sourceEntries = sources.flatMap(({ target, plan, witness }) => [
    {
      sourceKind: "p3-terminal-plan",
      target,
      path: plan.path,
      content: plan.reference,
    },
    {
      sourceKind: "p3-contextual-witness",
      target,
      path: witness.path,
      content: witness.reference,
    },
  ]).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const assets = bundles.flatMap(({ panels }) => panels.map(panelManifest));
  const failedVerdict = canary.witness.contractValidation.ensures.find(
    ({ predicateId }) => predicateId === SYNTHETIC_FAILED_PREDICATE_ID,
  );
  if (failedVerdict?.passed !== false || failedVerdict.actual !== 0) {
    throw new Error("synthetic P4A manifest is missing the failed red-key verdict");
  }
  const syntheticBundle = bundles.find(({ view }) => view.caseId !== "cclp1-001");
  if (syntheticBundle?.expectedSceneContent === null || syntheticBundle === undefined) {
    throw new Error("synthetic P4A manifest is missing expected-scene content");
  }
  return {
    manifestType: "p4a-review-output-manifest",
    manifestVersion: 1,
    counts: {
      views: bundles.length,
      svgPanels: assets.length,
    },
    limits: {
      maximumFileBytes: MAX_FILE_BYTES,
      maximumTotalBytes: MAX_TOTAL_BYTES,
    },
    motion: {
      recommendation: "not-recommended",
      reason: MOTION_REASON,
      generatedAssets: [],
    },
    sourcesOrder: "path",
    sources: sourceEntries,
    viewsOrder: "view-id",
    views: bundles.map((bundle) => ({
      viewId: bundle.view.viewId,
      caseId: bundle.view.caseId,
      target: bundle.view.target,
      outcome: bundle.outcome,
      evidence: {
        path: bundle.evidencePath,
        content: bundle.evidenceReference,
      },
      witnessContent: bundle.witnessContent,
      expectedSceneContent: bundle.expectedSceneContent,
      sourcePaths: bundle.sourcePaths,
      panelsOrder: "display-order",
      panels: bundle.panels.map(panelManifest),
      review: {
        sourcePath: bundle.review.sourcePath,
        sourceContent: bundle.review.sourceContent,
        sourceState: bundle.review.sourceState,
        effectiveState: bundle.review.effectiveState,
      },
    })),
    assetsOrder: "view-panel-order",
    assets,
    syntheticCanary: {
      scope: "standard-only",
      claim: "synthetic-contextual-witness-not-gameplay-engine-evidence",
      executionBounds: {
        maximumPrefixTicks: 0,
        maximumSnippetTicks: 1,
        consumedDecisionCount: canary.witness.snippet.consumedDecisionCount,
      },
      expectedSceneContent: syntheticBundle.expectedSceneContent,
      expectedScene: canary.expectedScene,
      witnessContent: syntheticBundle.witnessContent,
      witness: canary.witness,
      expectedPredicate: {
        predicateId: SYNTHETIC_FAILED_PREDICATE_ID,
        expected: 1,
        actual: failedVerdict.actual,
        passed: failedVerdict.passed,
      },
      join: canary.witness.join,
    },
    provenance: {
      keyPyramidAuthority: "checked-p3-json",
      keyPyramidEnginesExecuted: false,
      syntheticCanaryAuthority: "bounded-fake-solver-runtime-port-through-p3b",
      networkAccess: false,
      rendererId: "ccsolver-semantic-svg",
      rendererRevision: RENDERER_REVISION,
      croppedPanelsAreReviewOnly: true,
      fullWorldWitnessIsAuthority: true,
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function stackText(cell: SolverRenderCell): string {
  return cell.items.length === 0
    ? "empty semantic stack"
    : cell.items.map(({ stratum, semanticType }) => `${stratum}:${semanticType}`).join(" + ");
}

function relativeOutputPath(path: string): string {
  const prefix = `${OUTPUT_ROOT}/`;
  if (!path.startsWith(prefix)) throw new Error(`P4A output is outside its root: ${path}`);
  return path.slice(prefix.length);
}

function reviewHtml(bundles: readonly ReviewViewBundle[], sources: readonly RealViewSource[]): string {
  const renderPanel = (panel: BuiltPanel, headingLevel: 3 | 4): string => {
    const binding = panel.panel.binding.kind === "observed"
      ? `Observed native tick ${panel.panel.binding.nativeTick}; exact fingerprint ${panel.panel.binding.exactFingerprint}.`
      : `Expected-only contract projection ${panel.panel.binding.contractContent.digest}.`;
    const rows = panel.panel.scene.cells.map((cell) => (
      `<tr><th scope="row">${escapeHtml(coordinateText(cell.coordinate))}</th><td>${escapeHtml(stackText(cell))}</td></tr>`
    )).join("\n");
    const view = bundles.find(({ view: candidate }) => candidate.viewId === panel.viewId)?.view;
    if (view === undefined) throw new Error(`P4A HTML is missing view ${panel.viewId}`);
    const annotationRows = panel.panel.overlayIds.map((overlayId) => {
      const overlay = view.overlays.find(({ overlayId: candidateId }) => candidateId === overlayId);
      if (overlay === undefined) {
        throw new Error(`P4A HTML panel ${panel.panel.panelId} names unknown overlay ${overlayId}`);
      }
      return `<tr><th scope="row">${escapeHtml(overlay.label)}</th><td><code>${escapeHtml(overlay.basis)}</code></td><td>${escapeHtml(overlay.textEquivalent)}</td></tr>`;
    }).join("\n");
    const nextHeadingLevel = headingLevel === 3 ? 4 : 5;
    return [
      `<article aria-labelledby="${escapeHtml(panel.panel.panelId)}-heading">`,
      `<h${headingLevel} id="${escapeHtml(panel.panel.panelId)}-heading">${escapeHtml(panel.panel.title)}</h${headingLevel}>`,
      "<figure>",
      `<img src="${escapeHtml(relativeOutputPath(panel.path))}" alt="${escapeHtml(panel.panel.accessibleText)}">`,
      `<figcaption>${escapeHtml(binding)} ${escapeHtml(panel.panel.accessibleText)}</figcaption>`,
      "</figure>",
      `<h${nextHeadingLevel}>Annotation textual equivalents</h${nextHeadingLevel}>`,
      '<table class="annotation-equivalents"><thead><tr><th scope="col">Overlay label</th><th scope="col">Evidence basis</th><th scope="col">Text equivalent</th></tr></thead><tbody>',
      annotationRows,
      "</tbody></table>",
      `<h${nextHeadingLevel}>Cell-stack textual equivalent</h${nextHeadingLevel}>`,
      "<table><thead><tr><th scope=\"col\">Coordinate</th><th scope=\"col\">Exact supplied semantic stack</th></tr></thead><tbody>",
      rows,
      "</tbody></table>",
      "</article>",
    ].join("\n");
  };
  const renderSummary = (bundle: ReviewViewBundle): string => {
    const review = bundle.review.effectiveState;
    const notes = review.notes.length === 0
      ? "<p>No human review notes have been recorded.</p>"
      : `<ul>${review.notes.map(({ text }) => `<li>${escapeHtml(text)}</li>`).join("")}</ul>`;
    const stale = review.staleBinding === null
      ? "Binding is current."
      : `Binding is stale: ${review.staleBinding.reason}.`;
    return [
      `<aside aria-labelledby="${escapeHtml(bundle.view.viewId)}-summary-heading">`,
      `<h3 id="${escapeHtml(bundle.view.viewId)}-summary-heading">${escapeHtml(bundle.view.target.toUpperCase())} review binding</h3>`,
      `<p><strong>Outcome:</strong> ${escapeHtml(bundle.outcome)}. <strong>Effective human review:</strong> ${escapeHtml(review.status)}. ${escapeHtml(stale)}</p>`,
      `<p>${escapeHtml(bundle.view.subgoal.description)} Full-world contextual witness data is authoritative; every crop below is a derivative review aid.</p>`,
      `<p><a href="${escapeHtml(relativeOutputPath(bundle.evidencePath))}">Canonical machine evidence JSON</a></p>`,
      notes,
      "</aside>",
    ].join("\n");
  };
  const ms = bundles.find(({ view }) => view.caseId === "cclp1-001" && view.target === "ms");
  const lynx = bundles.find(({ view }) => view.caseId === "cclp1-001" && view.target === "lynx");
  const synthetic = bundles.find(({ view }) => view.caseId !== "cclp1-001");
  if (ms === undefined || lynx === undefined || synthetic === undefined) {
    throw new Error("P4A HTML needs the paired real views and failed synthetic view");
  }
  const realPanel = (
    bundle: ReviewViewBundle,
    selection: "starting" | "ending",
  ): BuiltPanel => {
    const panel = bundle.panels.find((candidate) => candidate.selection === selection);
    if (panel === undefined) throw new Error(`P4A HTML is missing ${bundle.view.viewId} ${selection}`);
    return panel;
  };
  const pairedSection = [
    '<section aria-labelledby="paired-key-pyramid-heading">',
    '<h2 id="paired-key-pyramid-heading">Key Pyramid verified segment — paired panels</h2>',
    '<div class="summary-grid">',
    renderSummary(ms),
    renderSummary(lynx),
    "</div>",
    "<h3>Starting State comparison</h3>",
    '<div class="panel-grid">',
    renderPanel(realPanel(ms, "starting"), 4),
    renderPanel(realPanel(lynx, "starting"), 4),
    "</div>",
    "<h3>Ending State comparison</h3>",
    '<div class="panel-grid">',
    renderPanel(realPanel(ms, "ending"), 4),
    renderPanel(realPanel(lynx, "ending"), 4),
    "</div>",
    "</section>",
  ].join("\n");
  const syntheticSection = [
    '<section aria-labelledby="synthetic-canary-heading">',
    '<h2 id="synthetic-canary-heading">Failed standard-only synthetic canary</h2>',
    renderSummary(synthetic),
    ...synthetic.panels.map((panel) => renderPanel(panel, 3)),
    "</section>",
  ].join("\n");
  const reviewSections = `${pairedSection}\n${syntheticSection}`;
  const comparisons = bundles.map((bundle) => {
    const end = bundle.view.ending.kind === "verified"
      ? bundle.view.ending.observed
      : bundle.view.ending.actual;
    const expected = bundle.view.ending.kind === "failed"
      ? "Expected inventory 1; actual inventory 0"
      : "Observed red-key inventory 0 → 1";
    return `<tr><th scope="row">${escapeHtml(bundle.view.viewId)}</th><td>${escapeHtml(bundle.view.target)}</td><td>${escapeHtml(bundle.outcome)}</td><td>${bundle.view.starting.binding.nativeTick}</td><td>${end.binding.kind === "observed" ? end.binding.nativeTick : "expected"}</td><td>${escapeHtml(expected)}</td><td>${escapeHtml(bundle.review.effectiveState.status)}</td></tr>`;
  }).join("\n");
  const sourceRows = sources.flatMap(({ plan, witness, target }) => [
    `<tr><th scope="row">${escapeHtml(target)} P3 terminal plan</th><td>${escapeHtml(plan.path)}</td><td><code>${escapeHtml(plan.reference.digest)}</code></td><td>${plan.reference.byteLength}</td></tr>`,
    `<tr><th scope="row">${escapeHtml(target)} P3 contextual witness</th><td>${escapeHtml(witness.path)}</td><td><code>${escapeHtml(witness.reference.digest)}</code></td><td>${witness.reference.byteLength}</td></tr>`,
  ]).join("\n");
  const reviewRows = bundles.map(({ view, review }) => (
    `<tr><th scope="row">${escapeHtml(view.viewId)}</th><td>${escapeHtml(review.sourcePath)}</td><td><code>${escapeHtml(review.sourceContent.digest)}</code></td><td>${review.sourceContent.byteLength}</td></tr>`
  )).join("\n");
  const contentRows = bundles.flatMap((bundle) => [
    `<tr><th scope="row">${escapeHtml(bundle.view.viewId)} machine evidence</th><td><code>${escapeHtml(bundle.evidenceReference.digest)}</code></td><td>${bundle.evidenceReference.byteLength}</td></tr>`,
    `<tr><th scope="row">${escapeHtml(bundle.view.viewId)} authoritative witness</th><td><code>${escapeHtml(bundle.witnessContent.digest)}</code></td><td>${bundle.witnessContent.byteLength}</td></tr>`,
    ...(bundle.expectedSceneContent === null ? [] : [
      `<tr><th scope="row">${escapeHtml(bundle.view.viewId)} expected scene</th><td><code>${escapeHtml(bundle.expectedSceneContent.digest)}</code></td><td>${bundle.expectedSceneContent.byteLength}</td></tr>`,
    ]),
  ]).join("\n");
  return [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex,nofollow">',
    "<title>Key Pyramid P4A subgoal evidence review</title>",
    `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1400px;margin:auto;padding:2rem;color:#20242a;background:#f8f8f5}h1,h2,h3,h4,h5{line-height:1.2}section{border-top:2px solid #777;padding-top:1rem;margin-top:2.5rem}article,aside{margin:1rem 0;padding:1rem;background:#fff;border:1px solid #bbb;min-width:0}figure{margin:1rem 0}img{display:block;max-width:100%;height:auto;border:1px solid #777}figcaption{margin-top:.6rem}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #999;padding:.45rem;text-align:left;vertical-align:top}code{overflow-wrap:anywhere}.warning{border-left:5px solid #9c3d10;padding:.8rem;background:#fff4ed}.panel-grid,.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem;align-items:start}.panel-grid article{margin:0}.panel-grid table{font-size:.85rem}@media(max-width:900px){.panel-grid,.summary-grid{grid-template-columns:1fr}}@media(prefers-color-scheme:dark){body{color:#eee;background:#17191c}article,aside{background:#22262a}a{color:#8bc5ff}}</style>`,
    "</head>",
    "<body>",
    "<main>",
    "<h1>Key Pyramid P4A subgoal evidence review</h1>",
    `<p class="warning">Static boundary panels are complete without motion. Motion is not recommended: <code>${MOTION_REASON}</code>. No animation asset was generated.</p>`,
    "<p>The two Key Pyramid views are projections of cryptographically bound checked P3 JSON; their gameplay engines were not rerun. The failed standard-only view is explicitly synthetic and was executed through a bounded fake runtime port and the P3B contextual-witness validator.</p>",
    "<h2>Cross-view comparison</h2>",
    "<table><thead><tr><th scope=\"col\">View</th><th scope=\"col\">Target</th><th scope=\"col\">Outcome</th><th scope=\"col\">Start tick</th><th scope=\"col\">Observed stop tick</th><th scope=\"col\">Red-key comparison</th><th scope=\"col\">Review</th></tr></thead><tbody>",
    comparisons,
    "</tbody></table>",
    reviewSections,
    "<section aria-labelledby=\"provenance-heading\">",
    "<h2 id=\"provenance-heading\">Full provenance</h2>",
    "<p>Key Pyramid authority: checked P3 JSON. Gameplay engines executed for this build: no. Synthetic canary authority: bounded fake SolverRuntimePort through P3B. Network access: no. Renderer revision: <code>ccsolver:p4a-semantic-svg-v1</code>.</p>",
    "<h3>Checked P3 source bytes</h3>",
    "<table><thead><tr><th scope=\"col\">Source</th><th scope=\"col\">Repository path</th><th scope=\"col\">SHA-256</th><th scope=\"col\">Bytes</th></tr></thead><tbody>",
    sourceRows,
    "</tbody></table>",
    "<h3>Evidence, witness, and expected-scene content</h3>",
    "<table><thead><tr><th scope=\"col\">Bound value</th><th scope=\"col\">SHA-256</th><th scope=\"col\">Bytes</th></tr></thead><tbody>",
    contentRows,
    "</tbody></table>",
    "<h3>Human-owned review inputs</h3>",
    "<table><thead><tr><th scope=\"col\">View</th><th scope=\"col\">Repository path</th><th scope=\"col\">SHA-256</th><th scope=\"col\">Bytes</th></tr></thead><tbody>",
    reviewRows,
    "</tbody></table>",
    "</section>",
    "</main>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function assertOutputCaps(outputs: readonly P4aReviewOutput[]): void {
  const paths = new Set<string>();
  let total = 0;
  for (const output of outputs) {
    if (paths.has(output.path)) throw new Error(`duplicate P4A output path: ${output.path}`);
    paths.add(output.path);
    if (output.path.startsWith("ccsolver/reviews/p4a/")) {
      throw new Error(`P4A human review input was treated as output: ${output.path}`);
    }
    const byteLength = Buffer.byteLength(output.content, "utf8");
    if (byteLength > MAX_FILE_BYTES) {
      throw new Error(`P4A output exceeds 512 KiB: ${output.path}`);
    }
    total += byteLength;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("P4A outputs exceed the 2 MiB total cap");
  const views = outputs.filter(({ path }) => path.endsWith("evidence.json"));
  const panels = outputs.filter(({ mediaType }) => mediaType === "image/svg+xml");
  if (views.length !== 3 || panels.length !== 7) {
    throw new Error(`P4A output count mismatch: ${views.length} views and ${panels.length} SVG panels`);
  }
  for (const panel of panels) {
    const digest = sha256Digest(panel.content).slice("sha256:".length);
    if (!panel.path.includes(digest)) {
      throw new Error(`P4A SVG filename does not bind exact bytes: ${panel.path}`);
    }
  }
}

export async function buildP4aReviewOutputs(
  repositoryRoot: string,
): Promise<readonly P4aReviewOutput[]> {
  const [lynxSource, msSource, canary] = await Promise.all([
    loadRealSource(repositoryRoot, "lynx"),
    loadRealSource(repositoryRoot, "ms"),
    buildSyntheticFailedCanary(),
  ]);
  const sources = [lynxSource, msSource] as const;
  const builtViews = [
    buildRealView(lynxSource),
    buildRealView(msSource),
    buildSyntheticView(canary),
  ] as const;
  const bundles = await Promise.all(builtViews.map(async (builtView) => ({
    ...builtView,
    panels: buildPanels(builtView.view),
    review: await loadReview(
      repositoryRoot,
      reviewPathFor(builtView.view),
      builtView.evidenceReference,
      builtView.witnessContent,
      new Set(builtView.view.overlays.map(({ overlayId }) => overlayId)),
    ),
  })));
  const manifestContent = canonicalJson(buildManifest(sources, bundles, canary));
  const htmlContent = reviewHtml(bundles, sources);
  const outputs: readonly P4aReviewOutput[] = [
    ...bundles.map(({ evidencePath, evidenceContent }) => ({
      path: evidencePath,
      content: evidenceContent,
      mediaType: "application/json" as const,
    })),
    ...bundles.flatMap(({ panels }) => panels.map(({ path, content }) => ({
      path,
      content,
      mediaType: "image/svg+xml" as const,
    }))),
    {
      path: `${OUTPUT_ROOT}/manifest.json`,
      content: manifestContent,
      mediaType: "application/json",
    },
    {
      path: `${OUTPUT_ROOT}/review.html`,
      content: htmlContent,
      mediaType: "text/html",
    },
  ];
  assertOutputCaps(outputs);
  return outputs;
}
